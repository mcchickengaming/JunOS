<?php
// The progression service (foundations #31 item 8): skills, xp, levels, Total Level and Mastery for
// her AND the player. ONE engine, here on her server; the pages are thin clients (js/core/progress.js)
// and the lab (progress-lab.html) asks this same code to simulate, so there is nothing to keep in step.
//
//   data    webapp/data/progress.json: skills, activities, reward pools, buffs, story grants.
//           A new activity is one more entry there. progress_validate() checks the rules below.
//   state   one JSON blob per user (migration 034 `progress`), see progress_blank().
//   tune    EVERY number in PROGRESS_TUNE (the lab can try other numbers; they are never saved).
//
// Rules that are enforced here and tested (.github/scripts/progress.test.php):
//   * The relationship is never levelled. No skill, source or reward touches the bond; touch and
//     chat can never be an xp source (PROGRESS_NEVER_SOURCES). This file never reads or writes it.
//   * Together is better, never required: with her, both gain; alone is the plain rate, no penalty.
//   * Rewards are fair across activities (same value per minute by construction), grow with skill,
//     and event sizes come from a fixed mix at every level (small often, big rarely; never a ladder).
//   * Nothing here asks for a bond stage or a relationship flavor.
//   * Focus: opt-in, a daily cap, and never a permanent buff (`noPermanent`).
//   * Minutes come from her server's own clock (begin → finish), not from what a page claims.
//   * Away: hers by real time away (capped); his only through things he set going (`setGoing`).

const PROGRESS_OWNERS = ['player', 'jun'];
const PROGRESS_SIZES = ['small', 'mid', 'big'];
const PROGRESS_KINDS = ['item', 'keepsake', 'buff', 'event'];
const PROGRESS_SCOPES = ['uses', 'until', 'permanent', 'worn'];
// never a source of xp, for anyone: the relationship grows through care, not through a meter
const PROGRESS_NEVER_SOURCES = ['touch', 'chat', 'message', 'bond', 'affection', 'trust', 'relationship'];
const PROGRESS_LOG_MAX = 40;

const PROGRESS_TUNE = [
    'cap' => 99,              // top level of a skill
    'curveBase' => 40,        // xp from level L to L+1 = curveBase + curveMul × L^curvePow
    'curveMul' => 0.9,
    'curvePow' => 1.8,
    'xpPerMin' => 10,         // at weight 1, normal quality
    'qualityLo' => 0.75,      // xp × at quality 0 … qualityHi at quality 1 (0.5 = normal = ×1)
    'qualityHi' => 1.25,
    'together' => 1.1,        // both of you, when you do it together (alone = ×1, never less)
    'markXp' => 0.03,         // + xp in a skill per Mastery mark
    'markMax' => 5,
    'valuePerMin' => 1.0,     // reward value a minute at level 1: THE SAME for every activity
    'growth' => 2.0,          // rewards × (1 + growth) at the top level ("grows with skill, strongly")
    'variance' => 0.25,       // ± on each session's rewards, so it isn't flat
    'creditShare' => 0.4,     // share of a session's value paid as Credits; the rest as drops
    'mix' => ['small' => 0.80, 'mid' => 0.19, 'big' => 0.01],   // event sizes, at EVERY level
    'value' => ['small' => 1, 'mid' => 6, 'big' => 120],        // what one drop of a size is worth
    'sigShare' => 0.3,        // chance a drop comes from the activity's signature list
    'maxMin' => 240,          // longest single session that counts
    'awayRate' => 0.5,        // her xp when she practices alone while he's away
    'awayCapH' => 8,          // …for at most this many hours per absence
    'awayMinH' => 0.5,        // shorter absences don't count
    'goingRate' => 0.5,       // his xp from something he set going (a drone expedition, a stew)
    'permCap' => 5,           // permanent buffs can never add more than this to one stat
    'recentH' => 36,          // how long she "noticed lately" in her prompt
];

function progress_tune(array $over = []): array {
    $t = PROGRESS_TUNE;
    foreach ($over as $k => $v) {
        if (!array_key_exists($k, $t)) continue;
        if (is_array($t[$k])) {
            if (!is_array($v)) continue;
            foreach ($t[$k] as $kk => $_) if (isset($v[$kk]) && is_numeric($v[$kk])) $t[$k][$kk] = max(0, (float)$v[$kk]);
        } elseif (is_numeric($v)) {
            $t[$k] = $k === 'cap' ? max(2, min(999, (int)$v)) : max(0, (float)$v);
        }
    }
    return $t;
}

function progress_enabled(): bool {
    return strtolower(env_str('JUN_PROGRESS', 'on')) !== 'off';
}

// ---------------------------------------------------------------
// data

function progress_data(?string $path = null): array {
    static $d = null;
    if ($d === null || $path !== null) {
        $path = $path ?? __DIR__ . '/../../data/progress.json';
        $j = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
        $d = is_array($j) ? $j : [];
        foreach (['skills', 'activities', 'pools', 'buffs', 'story'] as $k) if (!is_array($d[$k] ?? null)) $d[$k] = [];
    }
    return $d;
}

// every rule the data has to keep; [] = fine. Run by the test, so a bad entry never ships.
function progress_validate(array $d): array {
    $e = [];
    $skills = $d['skills'] ?? [];
    foreach ($skills as $id => $s) {
        if (in_array($id, PROGRESS_NEVER_SOURCES, true)) $e[] = "skill $id: the relationship is never a skill";
        if (!($s['name'] ?? '')) $e[] = "skill $id: no name";
        foreach ($s['owners'] ?? [] as $o) if (!in_array($o, PROGRESS_OWNERS, true)) $e[] = "skill $id: unknown owner $o";
        if (!($s['owners'] ?? [])) $e[] = "skill $id: no owner";
    }
    $entry = function (string $where, array $r, bool $noPerm) use (&$e, $d) {
        $id = (string)($r['id'] ?? '');
        if ($id === '') $e[] = "$where: a reward without an id";
        if (!in_array($r['kind'] ?? '', PROGRESS_KINDS, true)) $e[] = "$where $id: unknown kind";
        if (!in_array($r['size'] ?? '', PROGRESS_SIZES, true)) $e[] = "$where $id: unknown size";
        if (!(($r['w'] ?? 0) > 0)) $e[] = "$where $id: weight must be above 0";
        if (($r['kind'] ?? '') === 'buff') {
            $b = $d['buffs'][$id] ?? null;
            if (!$b) $e[] = "$where $id: no such buff";
            elseif ($b['scope'] === 'worn') $e[] = "$where $id: a worn buff comes with its item, it is not a drop";
            elseif ($b['scope'] === 'permanent' && $noPerm) $e[] = "$where $id: a permanent buff is not allowed here";
            elseif ($b['scope'] === 'permanent' && ($r['size'] ?? '') !== 'big') $e[] = "$where $id: permanent buffs are rare (big only)";
        }
    };
    foreach ($d['pools'] ?? [] as $pid => $pool) foreach ($pool as $r) $entry("pool $pid", $r, true);
    foreach ($d['activities'] ?? [] as $id => $a) {
        if (!($a['name'] ?? '')) $e[] = "activity $id: no name";
        $src = (string)($a['source'] ?? '');
        if ($src === '' || in_array($src, PROGRESS_NEVER_SOURCES, true)) $e[] = "activity $id: source '$src' can never give xp";
        if (($a['tier'] ?? '') !== 'everyday' && !in_array($a['tier'] ?? '', ['flirty', 'adult'], true)) $e[] = "activity $id: no tier";
        if (!(($a['minutes'] ?? 0) > 0)) $e[] = "activity $id: minutes";
        foreach (['minStage', 'minBond', 'stage', 'flavor', 'flavors'] as $k) if (isset($a[$k])) $e[] = "activity $id: activities work at any bond and flavor ($k)";
        foreach (PROGRESS_OWNERS as $o) foreach (($a['skills'][$o] ?? []) as $sk => $w) {
            if (!isset($skills[$sk])) $e[] = "activity $id: unknown skill $sk";
            elseif (!in_array($o, $skills[$sk]['owners'], true)) $e[] = "activity $id: $sk is not one of $o's skills";
            if (!($w > 0)) $e[] = "activity $id: weight of $sk";
        }
        foreach ($a['pools'] ?? [] as $pid) if (!isset($d['pools'][$pid])) $e[] = "activity $id: unknown pool $pid";
        foreach ($a['signature'] ?? [] as $r) $entry("activity $id", $r, !empty($a['noPermanent']));
        if (!empty($a['needsOpt']) && empty($a['dailyCapMin'])) $e[] = "activity $id: an opt-in activity needs a daily cap";
    }
    foreach ($d['buffs'] ?? [] as $id => $b) {
        if (!in_array($b['scope'] ?? '', PROGRESS_SCOPES, true)) $e[] = "buff $id: unknown scope";
        if (!($b['name'] ?? '')) $e[] = "buff $id: no name";
        if (($b['scope'] ?? '') === 'uses' && !(($b['uses'] ?? 0) > 0)) $e[] = "buff $id: uses";
        if (($b['scope'] ?? '') === 'until' && !(($b['hours'] ?? 0) > 0)) $e[] = "buff $id: hours";
        if (($b['scope'] ?? '') === 'worn' && !($b['item'] ?? '')) $e[] = "buff $id: item";
        if (!is_array($b['effect'] ?? null) || !$b['effect']) $e[] = "buff $id: no effect";
        foreach ($b['effect'] ?? [] as $stat => $v) {
            if (in_array(explode('.', (string)$stat)[0], PROGRESS_NEVER_SOURCES, true)) $e[] = "buff $id: a buff never touches the relationship";
            if (($b['scope'] ?? '') === 'permanent' && $v > PROGRESS_TUNE['permCap']) $e[] = "buff $id: permanent buffs are small";
        }
    }
    foreach ($d['story'] ?? [] as $id => $s) {
        if (!($s['from'] ?? '')) $e[] = "story $id: say where it comes from";
        foreach ($s['give'] ?? [] as $r) if (!in_array($r['kind'] ?? '', PROGRESS_KINDS, true) || !($r['id'] ?? '')) $e[] = "story $id: a bad reward";
    }
    if (isset($d['awayDefault']) && empty($d['activities'][$d['awayDefault']]['away'])) $e[] = 'awayDefault is not an away activity';
    return $e;
}

// ---------------------------------------------------------------
// the curve

function progress_next_xp(int $level, array $t = PROGRESS_TUNE): int {
    return (int)round($t['curveBase'] + $t['curveMul'] * pow($level, $t['curvePow']));
}

// xp → ['level', 'into' (xp inside this level), 'next' (xp this level takes; 0 at the top)]
function progress_level(int $xp, array $t = PROGRESS_TUNE): array {
    $level = 1;
    $cap = (int)$t['cap'];
    while ($level < $cap) {
        $need = progress_next_xp($level, $t);
        if ($xp < $need) return ['level' => $level, 'into' => $xp, 'next' => $need];
        $xp -= $need;
        $level++;
    }
    return ['level' => $cap, 'into' => 0, 'next' => 0];
}

function progress_xp_to(int $level, array $t = PROGRESS_TUNE): int {
    $sum = 0;
    for ($l = 1; $l < $level; $l++) $sum += progress_next_xp($l, $t);
    return $sum;
}

// ---------------------------------------------------------------
// state

function progress_blank(): array {
    return [
        'v' => 1,
        'skills' => ['player' => [], 'jun' => []],   // owner → skill → ['xp' => n, 'marks' => n]
        'credits' => 0,
        'items' => [],        // id → how many (ids only until the economy, #9)
        'keepsakes' => [],    // [['id', 'at', 'from']]
        'buffs' => [],        // [['id', 'from', 'at', 'until'?, 'uses'?]]
        'story' => [],        // story grant id → when
        'jobs' => [],         // things he set going: [['activity', 'minutes', 'ends']]
        'session' => null,    // ['activity', 'at', 'together'] while something runs
        'day' => ['d' => '', 'min' => []],   // today's minutes per capped activity
        'awayAt' => 0,
        'opt' => ['focus' => false],
        'log' => [],
    ];
}

function progress_clean(mixed $s): array {
    $b = progress_blank();
    if (!is_array($s)) return $b;
    foreach ($b as $k => $v) if (isset($s[$k]) && gettype($s[$k]) === gettype($v)) $b[$k] = $s[$k];
    if (is_array($s['session'] ?? null)) $b['session'] = $s['session'];
    foreach (PROGRESS_OWNERS as $o) if (!is_array($b['skills'][$o] ?? null)) $b['skills'][$o] = [];
    return $b;
}

function progress_skill_level(array $state, string $owner, string $skill, array $t = PROGRESS_TUNE): int {
    return progress_level((int)($state['skills'][$owner][$skill]['xp'] ?? 0), $t)['level'];
}

// Total Level: every skill's level added up. A mastered skill counts at the top, so starting one
// over never makes the total drop.
function progress_total(array $state, string $owner, array $d, array $t = PROGRESS_TUNE): int {
    $sum = 0;
    foreach ($d['skills'] as $id => $s) {
        if (!in_array($owner, $s['owners'], true)) continue;
        $row = $state['skills'][$owner][$id] ?? null;
        $sum += $row && ($row['marks'] ?? 0) > 0 ? (int)$t['cap'] : progress_level((int)($row['xp'] ?? 0), $t)['level'];
    }
    return $sum;
}

function progress_log(array &$state, array $entry, int $now): void {
    $state['log'][] = ['at' => $now] + $entry;
    if (count($state['log']) > PROGRESS_LOG_MAX) $state['log'] = array_slice($state['log'], -PROGRESS_LOG_MAX);
}

// ---------------------------------------------------------------
// buffs: timed (uses / until), small permanent, or while something is worn. Each says where it's from.

// the buffs that count right now for an activity (source), with what they do
function progress_active_buffs(array $state, array $d, int $now, string $source = '', array $worn = []): array {
    $out = [];
    foreach ($state['buffs'] as $b) {
        $def = $d['buffs'][$b['id']] ?? null;
        if (!$def) continue;
        if ($def['scope'] === 'until' && ($b['until'] ?? 0) <= $now) continue;
        if ($def['scope'] === 'uses' && (($b['uses'] ?? 0) <= 0 || ($source !== '' && ($def['of'] ?? $source) !== $source))) continue;
        $out[] = ['id' => $b['id'], 'name' => $def['name'], 'scope' => $def['scope'], 'from' => $b['from'] ?? '',
            'effect' => $def['effect'], 'uses' => $b['uses'] ?? null, 'until' => $b['until'] ?? null];
    }
    foreach ($d['buffs'] as $id => $def) {
        if ($def['scope'] === 'worn' && in_array($def['item'], $worn, true)) {
            $out[] = ['id' => $id, 'name' => $def['name'], 'scope' => 'worn', 'from' => $def['item'], 'effect' => $def['effect'], 'uses' => null, 'until' => null];
        }
    }
    return $out;
}

// stat → total. Permanent buffs together never pass permCap on one stat ("perks help, never gate").
function progress_effects(array $state, array $d, int $now, string $source = '', array $worn = [], array $t = PROGRESS_TUNE): array {
    $perm = [];
    $rest = [];
    foreach (progress_active_buffs($state, $d, $now, $source, $worn) as $b) {
        foreach ($b['effect'] as $stat => $v) {
            if ($b['scope'] === 'permanent') $perm[$stat] = ($perm[$stat] ?? 0) + $v;
            else $rest[$stat] = ($rest[$stat] ?? 0) + $v;
        }
    }
    foreach ($perm as $stat => $v) $rest[$stat] = ($rest[$stat] ?? 0) + min($v, $t['permCap']);
    return $rest;
}

function progress_buff_add(array &$state, array $d, string $id, string $from, int $now): bool {
    $def = $d['buffs'][$id] ?? null;
    if (!$def || $def['scope'] === 'worn') return false;
    foreach ($state['buffs'] as &$b) {
        if ($b['id'] !== $id) continue;
        if ($def['scope'] === 'permanent') return false;                       // you have it; the caller pays it out instead
        if ($def['scope'] === 'uses') $b['uses'] = (int)$def['uses'];           // refreshed, never stacked
        if ($def['scope'] === 'until') $b['until'] = $now + (int)round($def['hours'] * 3600);
        $b['from'] = $from;
        $b['at'] = $now;
        return true;
    }
    unset($b);
    $row = ['id' => $id, 'from' => $from, 'at' => $now];
    if ($def['scope'] === 'uses') $row['uses'] = (int)$def['uses'];
    if ($def['scope'] === 'until') $row['until'] = $now + (int)round($def['hours'] * 3600);
    $state['buffs'][] = $row;
    return true;
}

// one use of every "for the next N …" buff of this source, and drop what has run out
function progress_buffs_used(array &$state, array $d, string $source, int $now): void {
    $keep = [];
    foreach ($state['buffs'] as $b) {
        $def = $d['buffs'][$b['id']] ?? null;
        if (!$def) continue;
        if ($def['scope'] === 'uses' && ($def['of'] ?? $source) === $source) $b['uses'] = ($b['uses'] ?? 0) - 1;
        if ($def['scope'] === 'uses' && ($b['uses'] ?? 0) <= 0) continue;
        if ($def['scope'] === 'until' && ($b['until'] ?? 0) <= $now) continue;
        $keep[] = $b;
    }
    $state['buffs'] = $keep;
}

// ---------------------------------------------------------------
// the one reward roller, for both of them

function progress_pick(array $list, callable $rnd): ?array {
    $sum = 0;
    foreach ($list as $r) $sum += $r['w'];
    if ($sum <= 0) return null;
    $x = $rnd() * $sum;
    foreach ($list as $r) { $x -= $r['w']; if ($x < 0) return $r; }
    return $list[array_key_last($list)];
}

// what a session of `minutes` at skill `level` gives: ['credits' => n, 'drops' => [entry + 'signature']]
function progress_roll(array $d, string $activityId, float $minutes, int $level, callable $rnd, array $t = PROGRESS_TUNE): array {
    $a = $d['activities'][$activityId] ?? null;
    if (!$a || $minutes <= 0) return ['credits' => 0, 'drops' => []];
    $shared = [];
    foreach ($a['pools'] ?? [] as $pid) foreach ($d['pools'][$pid] ?? [] as $r) $shared[] = $r;
    $sig = $a['signature'] ?? [];
    if (!$shared && !$sig) return ['credits' => 0, 'drops' => []];
    $ok = function (array $list, string $size) use ($level, $a, $d) {
        return array_values(array_filter($list, function ($r) use ($size, $level, $a, $d) {
            if ($r['size'] !== $size || ($r['minLevel'] ?? 0) > $level) return false;
            return !(!empty($a['noPermanent']) && $r['kind'] === 'buff' && ($d['buffs'][$r['id']]['scope'] ?? '') === 'permanent');
        }));
    };
    $growth = 1 + $t['growth'] * ($level - 1) / max(1, $t['cap'] - 1);
    $budget = $minutes * $t['valuePerMin'] * $growth * (1 + $t['variance'] * (2 * $rnd() - 1));
    $credits = (int)round($budget * $t['creditShare']);
    $mean = 0;
    foreach (PROGRESS_SIZES as $s) $mean += $t['mix'][$s] * $t['value'][$s];
    $want = $mean > 0 ? $budget * (1 - $t['creditShare']) / $mean : 0;
    $n = (int)floor($want) + ($rnd() < $want - floor($want) ? 1 : 0);
    $drops = [];
    for ($i = 0; $i < $n; $i++) {
        $pick = progress_pick(array_map(fn($s) => ['size' => $s, 'w' => $t['mix'][$s]], PROGRESS_SIZES), $rnd);
        $at = array_search($pick['size'], PROGRESS_SIZES, true);
        $fromSig = $rnd() < $t['sigShare'];
        $r = null;
        // the size the mix picked; an empty size falls to the next smaller one, never a bigger one
        for ($k = $at; $k >= 0 && !$r; $k--) {
            $first = $ok($fromSig ? $sig : $shared, PROGRESS_SIZES[$k]);
            $second = $ok($fromSig ? $shared : $sig, PROGRESS_SIZES[$k]);
            $r = progress_pick($first ?: $second, $rnd);
            if ($r) $r['signature'] = $first ? $fromSig : !$fromSig;
        }
        if ($r) $drops[] = $r;
    }
    return ['credits' => $credits, 'drops' => $drops];
}

// put rewards into the state. A permanent buff he already has pays out as Credits instead.
function progress_give(array &$state, array $d, array $drops, string $from, int $now, array $t = PROGRESS_TUNE): array {
    $got = [];
    foreach ($drops as $r) {
        $id = (string)$r['id'];
        $row = ['id' => $id, 'kind' => $r['kind'], 'size' => $r['size'] ?? 'small', 'signature' => !empty($r['signature'])];
        if ($r['kind'] === 'item') $state['items'][$id] = ($state['items'][$id] ?? 0) + 1;
        elseif ($r['kind'] === 'keepsake') $state['keepsakes'][] = ['id' => $id, 'at' => $now, 'from' => $from];
        elseif ($r['kind'] === 'buff') {
            $row['name'] = $d['buffs'][$id]['name'] ?? $id;
            if (!progress_buff_add($state, $d, $id, $from, $now)) {
                $row['instead'] = (int)$t['value'][$row['size']];
                $state['credits'] += $row['instead'];
            }
        } elseif ($r['kind'] === 'event') progress_log($state, ['type' => 'event', 'id' => $id, 'size' => $row['size'], 'from' => $from], $now);
        $got[] = $row;
    }
    return $got;
}

// ---------------------------------------------------------------
// xp

function progress_add_xp(array &$state, string $owner, string $skill, int $xp, int $now, array $t, array &$ups): void {
    if ($xp <= 0) return;
    $row = $state['skills'][$owner][$skill] ?? ['xp' => 0, 'marks' => 0];
    $before = progress_level((int)$row['xp'], $t)['level'];
    $row['xp'] = min((int)$row['xp'] + $xp, progress_xp_to((int)$t['cap'], $t));
    $state['skills'][$owner][$skill] = $row;
    $after = progress_level($row['xp'], $t)['level'];
    if ($after > $before) {
        $ups[] = ['owner' => $owner, 'skill' => $skill, 'from' => $before, 'level' => $after];
        progress_log($state, ['type' => 'level', 'owner' => $owner, 'skill' => $skill, 'from' => $before, 'level' => $after], $now);
    }
}

// The one way anyone gains anything.
//   $o: activity, minutes, together (bool), quality 0..1, who 'player' (default) | 'jun' (she's on her own),
//       rate (× xp; away / set going), rewards (bool, default true), worn (item ids), day ('Y-m-d', for caps)
// → ['ok', 'minutes', 'xp' => owner → skill → n, 'ups', 'credits', 'drops', 'buffs'] or ['error' => code]
function progress_grant(array &$state, array $d, array $o, int $now, callable $rnd, array $t = PROGRESS_TUNE): array {
    $id = (string)($o['activity'] ?? '');
    $a = $d['activities'][$id] ?? null;
    if (!$a) return ['error' => 'unknown_activity'];
    if (in_array($a['source'] ?? '', PROGRESS_NEVER_SOURCES, true)) return ['error' => 'never_a_source'];
    $who = ($o['who'] ?? 'player') === 'jun' ? 'jun' : 'player';
    $minutes = max(0.0, min((float)($o['minutes'] ?? 0), (float)$t['maxMin']));
    if (!empty($a['needsOpt']) && empty($state['opt'][$a['needsOpt']])) return ['error' => 'not_opted_in'];
    if (!empty($a['dailyCapMin'])) {
        $day = (string)($o['day'] ?? gmdate('Y-m-d', $now));
        if (($state['day']['d'] ?? '') !== $day) $state['day'] = ['d' => $day, 'min' => []];
        $left = max(0.0, $a['dailyCapMin'] - ($state['day']['min'][$id] ?? 0));
        $minutes = min($minutes, $left);
        $state['day']['min'][$id] = ($state['day']['min'][$id] ?? 0) + $minutes;
    }
    $together = $who === 'player' && !empty($o['together']) && !empty($a['together']);
    $q = max(0.0, min(1.0, (float)($o['quality'] ?? 0.5)));
    $quality = $t['qualityLo'] + ($t['qualityHi'] - $t['qualityLo']) * $q;
    $rate = max(0.0, (float)($o['rate'] ?? 1));
    $fx = progress_effects($state, $d, $now, (string)$a['source'], (array)($o['worn'] ?? []), $t);
    $out = ['ok' => true, 'activity' => $id, 'minutes' => round($minutes, 1), 'together' => $together, 'xp' => [], 'ups' => [], 'credits' => 0, 'drops' => []];
    if ($minutes <= 0) return $out;

    $owners = $who === 'jun' ? ['jun'] : ($together ? ['player', 'jun'] : ['player']);
    $main = ['skill' => '', 'w' => 0];
    foreach ($owners as $owner) {
        foreach (($a['skills'][$owner] ?? []) as $skill => $w) {
            if ($owner === $who && $w > $main['w']) $main = ['skill' => $skill, 'w' => $w];
            $marks = min((int)($state['skills'][$owner][$skill]['marks'] ?? 0), (int)$t['markMax']);
            // buffs are his; her xp only gets the together bonus and her own marks
            $bonus = $owner === 'player' ? (($fx['xp'] ?? 0) + ($fx["xp.$skill"] ?? 0)) / 100 : 0;
            $xp = (int)round($minutes * $t['xpPerMin'] * $w * $quality * $rate * ($together ? $t['together'] : 1)
                * (1 + $marks * $t['markXp']) * (1 + $bonus));
            if ($xp <= 0) continue;
            $out['xp'][$owner][$skill] = $xp;
            progress_add_xp($state, $owner, $skill, $xp, $now, $t, $out['ups']);
        }
    }
    if (($o['rewards'] ?? true) && $main['skill'] !== '') {
        $level = progress_skill_level($state, $who, $main['skill'], $t);
        $roll = progress_roll($d, $id, $minutes * $rate, $level, $rnd, $t);
        $out['credits'] = $roll['credits'];
        $state['credits'] += $roll['credits'];
        $out['drops'] = progress_give($state, $d, $roll['drops'], $a['name'], $now, $t);
    }
    if ($who === 'player') progress_buffs_used($state, $d, (string)$a['source'], $now);
    progress_log($state, ['type' => 'did', 'activity' => $id, 'who' => $who, 'together' => $together, 'min' => (int)round($minutes)], $now);
    return $out;
}

// Mastery: at the top level, optional, never required. The skill starts over with a small mark.
function progress_master(array &$state, array $d, string $owner, string $skill, int $now, array $t = PROGRESS_TUNE): array {
    if (!in_array($owner, PROGRESS_OWNERS, true) || !in_array($owner, $d['skills'][$skill]['owners'] ?? [], true)) return ['error' => 'unknown_skill'];
    $row = $state['skills'][$owner][$skill] ?? ['xp' => 0, 'marks' => 0];
    if (progress_level((int)$row['xp'], $t)['level'] < $t['cap']) return ['error' => 'not_at_the_top'];
    if (($row['marks'] ?? 0) >= $t['markMax']) return ['error' => 'no_more_marks'];
    $state['skills'][$owner][$skill] = ['xp' => 0, 'marks' => (int)($row['marks'] ?? 0) + 1];
    progress_log($state, ['type' => 'mastery', 'owner' => $owner, 'skill' => $skill, 'marks' => $state['skills'][$owner][$skill]['marks']], $now);
    return ['ok' => true, 'marks' => $state['skills'][$owner][$skill]['marks']];
}

// ---------------------------------------------------------------
// sessions: her server keeps the clock, so the minutes are real

function progress_begin(array &$state, array $d, string $activity, bool $together, int $now): array {
    $a = $d['activities'][$activity] ?? null;
    if (!$a || !empty($a['setGoing']) || !empty($a['away'])) return ['error' => 'unknown_activity'];
    if (!empty($a['needsOpt']) && empty($state['opt'][$a['needsOpt']])) return ['error' => 'not_opted_in'];
    $state['session'] = ['activity' => $activity, 'at' => $now, 'together' => $together && !empty($a['together'])];
    return ['ok' => true, 'session' => $state['session']];
}

function progress_finish(array &$state, array $d, array $o, int $now, callable $rnd, array $t = PROGRESS_TUNE): array {
    $s = $state['session'];
    if (!is_array($s)) return ['error' => 'nothing_running'];
    $state['session'] = null;
    $minutes = max(0, $now - (int)$s['at']) / 60;
    if (isset($o['minutes']) && is_numeric($o['minutes'])) $minutes = min($minutes, max(0.0, (float)$o['minutes']));   // paused time doesn't count
    return progress_grant($state, $d, ['activity' => $s['activity'], 'minutes' => $minutes, 'together' => $s['together'],
        'quality' => $o['quality'] ?? 0.5, 'worn' => $o['worn'] ?? [], 'day' => $o['day'] ?? null], $now, $rnd, $t);
}

// ---------------------------------------------------------------
// away progress. Hers: she keeps living (real time away, capped). His: only what he set going.

function progress_away(array &$state, array $d, int $now, callable $rnd, array $t = PROGRESS_TUNE): ?array {
    $last = (int)$state['awayAt'];
    $state['awayAt'] = $now;
    $act = (string)($d['awayDefault'] ?? '');
    if ($last <= 0 || $act === '' || empty($d['activities'][$act]['away'])) return null;
    $hours = min(($now - $last) / 3600, (float)$t['awayCapH']);
    if ($hours < $t['awayMinH']) return null;
    // long absences in slices, so maxMin doesn't swallow them
    $out = null;
    for ($left = $hours * 60; $left > 0.5; $left -= $t['maxMin']) {
        $r = progress_grant($state, $d, ['activity' => $act, 'who' => 'jun', 'minutes' => min($left, $t['maxMin']), 'rate' => $t['awayRate'], 'rewards' => false], $now, $rnd, $t);
        if (!isset($r['error'])) {
            if ($out === null) $out = $r;
            else { foreach ($r['xp']['jun'] ?? [] as $k => $v) $out['xp']['jun'][$k] = ($out['xp']['jun'][$k] ?? 0) + $v; $out['ups'] = array_merge($out['ups'], $r['ups']); }
        }
    }
    if ($out) progress_log($state, ['type' => 'away', 'activity' => $act, 'hours' => round($hours, 1)], $now);
    return $out;
}

function progress_set_going(array &$state, array $d, string $activity, int $now): array {
    $a = $d['activities'][$activity] ?? null;
    if (!$a || empty($a['setGoing'])) return ['error' => 'unknown_activity'];
    foreach ($state['jobs'] as $j) if ($j['activity'] === $activity) return ['error' => 'already_going'];
    $job = ['activity' => $activity, 'minutes' => (float)$a['minutes'], 'ends' => $now + (int)round($a['minutes'] * 60)];
    $state['jobs'][] = $job;
    return ['ok' => true, 'job' => $job];
}

function progress_collect(array &$state, array $d, int $now, callable $rnd, array $t = PROGRESS_TUNE): array {
    $done = [];
    $keep = [];
    foreach ($state['jobs'] as $j) {
        if ($j['ends'] > $now) { $keep[] = $j; continue; }
        $r = progress_grant($state, $d, ['activity' => $j['activity'], 'minutes' => $j['minutes'], 'rate' => $t['goingRate']], $now, $rnd, $t);
        if (!isset($r['error'])) $done[] = $r;
    }
    $state['jobs'] = $keep;
    return $done;
}

// a story event's grant: anything the fiction makes sense of, once
function progress_story(array &$state, array $d, string $id, int $now, array $t = PROGRESS_TUNE): array {
    $s = $d['story'][$id] ?? null;
    if (!$s) return ['error' => 'unknown_story'];
    if (isset($state['story'][$id])) return ['error' => 'already_given'];
    $state['story'][$id] = $now;
    $got = progress_give($state, $d, $s['give'] ?? [], (string)$s['from'], $now, $t);
    $got = array_map(fn($g) => array_diff_key($g, ['size' => 1, 'signature' => 1]), $got);   // a gift has no size
    progress_log($state, ['type' => 'story', 'id' => $id], $now);
    return ['ok' => true, 'drops' => $got, 'from' => $s['from']];
}

// ---------------------------------------------------------------
// what a page gets to show

function progress_view(array $state, array $d, int $now, array $t = PROGRESS_TUNE): array {
    $v = ['owners' => [], 'credits' => $state['credits'], 'items' => (object)$state['items'], 'keepsakes' => $state['keepsakes'],
        'buffs' => progress_active_buffs($state, $d, $now), 'jobs' => $state['jobs'], 'session' => $state['session'],
        'opt' => $state['opt'], 'log' => array_slice($state['log'], -15), 'now' => $now];
    foreach (PROGRESS_OWNERS as $o) {
        $skills = [];
        foreach ($d['skills'] as $id => $s) {
            if (!in_array($o, $s['owners'], true)) continue;
            $row = $state['skills'][$o][$id] ?? ['xp' => 0, 'marks' => 0];
            $skills[$id] = ['name' => $s['name'], 'xp' => (int)$row['xp'], 'marks' => (int)($row['marks'] ?? 0)] + progress_level((int)$row['xp'], $t);
        }
        $v['owners'][$o] = ['total' => progress_total($state, $o, $d, $t), 'skills' => $skills];
    }
    return $v;
}

// ---------------------------------------------------------------
// the lab's time-lapse: the same grant(), a made-up player, nothing saved

function progress_simulate(array $d, string $activity, float $hours, array $o = [], array $t = PROGRESS_TUNE): array {
    $a = $d['activities'][$activity] ?? null;
    if (!$a) return ['error' => 'unknown_activity'];
    $seed = (int)($o['seed'] ?? 1);
    mt_srand($seed);
    $rnd = fn() => mt_rand() / (mt_getrandmax() + 1);
    $state = progress_blank();
    $state['opt']['focus'] = true;
    $who = !empty($a['away']) ? 'jun' : 'player';
    $now = 1700000000;
    $minutes = 0.0;
    $sum = ['credits' => 0, 'value' => 0.0, 'drops' => ['small' => 0, 'mid' => 0, 'big' => 0], 'signature' => 0, 'big' => [], 'sessions' => 0];
    $timeline = [];
    $mainSkill = '';
    foreach (($a['skills'][$who] ?? []) as $sk => $w) if ($mainSkill === '' || $w > $a['skills'][$who][$mainSkill]) $mainSkill = $sk;
    $step = max(1, (int)round($hours / 20));
    while ($minutes < $hours * 60 - 0.01) {
        $len = min((float)$a['minutes'], $hours * 60 - $minutes);
        $state['day'] = ['d' => '', 'min' => []];   // the lab looks at the curve, not the daily cap
        $r = progress_grant($state, $d, ['activity' => $activity, 'who' => $who, 'minutes' => $len, 'together' => !empty($o['together']),
            'quality' => $o['quality'] ?? 0.5, 'rate' => !empty($a['setGoing']) ? $t['goingRate'] : 1], $now, $rnd, $t);
        if (isset($r['error'])) return $r;
        $before = floor($minutes / 60 / $step);
        $minutes += $len;
        $now += (int)($len * 60);
        $sum['sessions']++;
        $sum['credits'] += $r['credits'];
        $sum['value'] += $r['credits'];
        foreach ($r['drops'] as $drop) {
            $sum['drops'][$drop['size']]++;
            $sum['value'] += $t['value'][$drop['size']];
            if ($drop['signature']) $sum['signature']++;
            if ($drop['size'] === 'big') $sum['big'][] = ['id' => $drop['id'], 'hour' => round($minutes / 60, 1)];
        }
        if (floor($minutes / 60 / $step) > $before || $minutes >= $hours * 60 - 0.01) {
            $timeline[] = ['hour' => round($minutes / 60, 1), 'level' => $mainSkill === '' ? 1 : progress_skill_level($state, $who, $mainSkill, $t)];
        }
    }
    $view = progress_view($state, $d, $now, $t);
    return ['ok' => true, 'activity' => $activity, 'name' => $a['name'], 'hours' => $hours, 'who' => $who, 'skill' => $mainSkill,
        'level' => $mainSkill === '' ? 1 : $view['owners'][$who]['skills'][$mainSkill]['level'],
        'totals' => ['player' => $view['owners']['player']['total'], 'jun' => $view['owners']['jun']['total']],
        'skills' => ['player' => array_map(fn($s) => $s['level'], $view['owners']['player']['skills']), 'jun' => array_map(fn($s) => $s['level'], $view['owners']['jun']['skills'])],
        'credits' => $sum['credits'], 'drops' => $sum['drops'], 'signature' => $sum['signature'], 'big' => array_slice($sum['big'], 0, 12),
        'valuePerMin' => $minutes > 0 ? round($sum['value'] / $minutes, 3) : 0, 'sessions' => $sum['sessions'], 'timeline' => $timeline];
}

// the curve as a table, for the lab: hours are at weight 1, normal quality, alone
function progress_curve(array $t = PROGRESS_TUNE): array {
    $rows = [];
    $sum = 0;
    for ($l = 1; $l <= $t['cap']; $l++) {
        $rows[] = ['level' => $l, 'next' => $l < $t['cap'] ? progress_next_xp($l, $t) : 0, 'total' => $sum,
            'hours' => $t['xpPerMin'] > 0 ? round($sum / $t['xpPerMin'] / 60, 1) : 0,
            'rewards' => round(1 + $t['growth'] * ($l - 1) / max(1, $t['cap'] - 1), 2)];
        if ($l < $t['cap']) $sum += progress_next_xp($l, $t);
    }
    return $rows;
}

// ---------------------------------------------------------------
// her database

function progress_load(int $userId): array {
    try {
        $st = db()->prepare('SELECT data FROM progress WHERE user_id = ?');
        $st->execute([$userId]);
        $row = $st->fetch();
        return progress_clean($row ? json_decode((string)$row['data'], true) : null);
    } catch (Throwable $e) {
        log_event(['msg' => 'progress_load_error', 'err' => $e->getMessage()]);
        return progress_blank();
    }
}

function progress_save(int $userId, array $state): void {
    db()->prepare('INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        ->execute([$userId, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), time()]);
}

function progress_rnd(): callable {
    return fn() => random_int(0, PHP_INT_MAX - 1) / PHP_INT_MAX;
}

// ---------------------------------------------------------------
// her prompt: what she's noticed lately about her skills and his, in words, never levels.
// Nothing here says how close they are: that's the bond's, and it is never a skill.

function progress_band(int $level): string {
    return $level >= 90 ? 'a master of' : ($level >= 60 ? 'very good at' : ($level >= 30 ? 'good at' : ($level >= 10 ? 'getting the hang of' : 'new at')));
}

function progress_context_from(array $state, array $d, int $now, array $t = PROGRESS_TUNE): string {
    $since = $now - (int)round($t['recentH'] * 3600);
    $best = [];   // owner|skill → the latest level-up
    $lines = [];
    foreach ($state['log'] as $e) {
        if (($e['at'] ?? 0) < $since) continue;
        if ($e['type'] === 'level' && isset($d['skills'][$e['skill']])) $best[$e['owner'] . '|' . $e['skill']] = $e;
        if ($e['type'] === 'mastery' && isset($d['skills'][$e['skill']])) {
            $n = strtolower($d['skills'][$e['skill']]['name']);
            $lines[] = $e['owner'] === 'jun'
                ? "You reached the very top of $n and chose to start it over, just to learn it again. You're quietly proud."
                : "Anon reached the very top of $n and chose to start it over. That impressed you.";
        }
        if ($e['type'] === 'away' && isset($d['activities'][$e['activity']])) {
            $names = array_map(fn($k) => strtolower($d['skills'][$k]['name']), array_keys($d['activities'][$e['activity']]['skills']['jun'] ?? []));
            if ($names) $lines[] = "Lately you've been practicing " . implode(' and ', $names) . ' on your own time.';
        }
    }
    // the ones where she'd say something new about it come first
    usort($best, fn($a, $b) => [progress_band($b['level']) !== progress_band($b['from']), $b['level'] - $b['from']] <=> [progress_band($a['level']) !== progress_band($a['from']), $a['level'] - $a['from']]);
    foreach (array_slice($best, 0, 2) as $e) {
        $n = strtolower($d['skills'][$e['skill']]['name']);
        $band = progress_band($e['level']);
        $lines[] = $e['owner'] === 'jun'
            ? "You've gotten better at $n lately (you're $band it now)."
            : "Anon has gotten better at $n lately (he's $band it now). You noticed.";
    }
    if (!$lines) return '';
    return "## WHAT YOU TWO HAVE BEEN GETTING BETTER AT\n" . implode("\n", array_slice($lines, 0, 3))
        . "\nMention it only if it fits, in your own words; never say levels, points or numbers.";
}

function progress_context(int $userId): string {
    if (!progress_enabled()) return '';
    try {
        return progress_context_from(progress_load($userId), progress_data(), time());
    } catch (Throwable $e) {
        return '';
    }
}
