<?php
// The ONE consent + ratings gate, server side (foundations #31 (6)). The same rules as
// js/core/gate.js, tested on the same cases (.github/scripts/gate-cases.json), so the pages and
// her server always agree. Also: the player's comfort settings (migration 032, api/comfort.php),
// the feature registry reader (data/features.json) and the line her prompt gets about what they
// are to each other.

const GATE_TIERS = ['everyday', 'flirty', 'adult'];
const GATE_FLAVORS = ['romantic', 'friends_open', 'platonic', 'siblings', 'parent_daughter'];
// HARD locks, in code on purpose: never from a file, a profile or a setting
const GATE_LOCKED = ['platonic' => ['flirty', 'adult'], 'parent_daughter' => ['flirty', 'adult']];
const GATE_OPT_IN = ['siblings' => ['flirty', 'adult']];
const GATE_DEFAULTS = [
    'flavor' => 'romantic', 'flavorLock' => false,
    'flirty' => true, 'adult' => false, 'adultConfirmed' => false, 'adultOutside' => false, 'siblingsRated' => false,
];
const GATE_TUNE = ['trustNo' => 20, 'tensionAsk' => 60, 'tensionNo' => 85];

function gate_clean($c): array {
    $c = is_array($c) ? $c : [];
    $out = [];
    foreach (GATE_DEFAULTS as $k => $d) {
        if ($k === 'flavor') $out[$k] = in_array($c[$k] ?? null, GATE_FLAVORS, true) ? $c[$k] : $d;
        else $out[$k] = is_bool($c[$k] ?? null) ? $c[$k] : $d;
    }
    return $out;
}

function gate_tier($t): string { return in_array($t, GATE_TIERS, true) ? $t : 'adult'; }

function gate_can_tag(string $flavor, $tier): bool {
    $tier = gate_tier($tier);
    if ($tier === 'everyday') return true;
    if (!in_array($flavor, GATE_FLAVORS, true)) return false;
    return !in_array($tier, GATE_LOCKED[$flavor] ?? [], true);
}

// item: tier, flavors?, minStage?, minTrust?   ctx: comfort, mode, screenShare, lookAdult, stage, trust, tension, stop
// → ['show' => bool, 'her' => 'yes'|'ask'|'no', 'why' => code]
function gate_check(array $item, array $ctx = []): array {
    $tier = gate_tier($item['tier'] ?? 'everyday');
    $c = gate_clean($ctx['comfort'] ?? []);
    $flavor = $c['flavor'];
    $out = fn(bool $show, string $her, string $why) => ['show' => $show, 'her' => $show ? $her : 'no', 'why' => $why];

    $fits = $item['flavors'] ?? null;
    if (is_array($fits) && $fits && !in_array($flavor, $fits, true)) return $out(false, 'no', 'flavor');
    if ($tier !== 'everyday') {
        if (in_array($tier, GATE_LOCKED[$flavor] ?? [], true)) return $out(false, 'no', 'flavor_lock');
        if (in_array($tier, GATE_OPT_IN[$flavor] ?? [], true) && !$c['siblingsRated']) return $out(false, 'no', 'flavor_optin');
        if ($tier === 'flirty' && !$c['flirty']) return $out(false, 'no', 'flirty_off');
        if ($tier === 'adult' && !($c['adult'] && $c['adultConfirmed'])) return $out(false, 'no', 'adult_off');
        if (($ctx['lookAdult'] ?? true) === false) return $out(false, 'no', 'look');
        if (!empty($ctx['screenShare'])) return $out(false, 'no', 'screen_share');
        if ($tier === 'adult' && ($ctx['mode'] ?? 'windowed') !== 'windowed' && !$c['adultOutside']) return $out(false, 'no', 'mode');
    }
    $num = fn($v, $d) => is_int($v) || is_float($v) ? $v : $d;
    $stage = $num($ctx['stage'] ?? null, 1);
    $trust = $num($ctx['trust'] ?? null, 50);
    $tension = $num($ctx['tension'] ?? null, 0);
    $minStage = $num($item['minStage'] ?? null, 1);
    $minTrust = max($num($item['minTrust'] ?? null, 0), $tier === 'everyday' ? 0 : GATE_TUNE['trustNo']);
    if (!empty($ctx['stop'])) return $out(true, 'no', 'stop');
    if ($stage < $minStage) return $out(true, 'no', 'bond');
    if ($trust < $minTrust) return $out(true, 'no', 'trust');
    if ($tension >= GATE_TUNE['tensionNo']) return $out(true, 'no', 'mood');
    if ($tension >= GATE_TUNE['tensionAsk'] || ($tier !== 'everyday' && $stage === $minStage && $minStage > 1)) return $out(true, 'ask', 'ask');
    return $out(true, 'yes', 'ok');
}

// ---------------------------------------------------------------
// the feature registry (data/features.json): read once per request

function features_registry(?string $path = null): array {
    static $reg = null;
    if ($reg === null || $path !== null) {
        $path = $path ?? __DIR__ . '/../../data/features.json';
        $j = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
        $reg = is_array($j) && is_array($j['features'] ?? null) ? $j : ['features' => []];
    }
    return $reg;
}
// a feature's tier; unknown features count as the strictest tier
function feature_tier(string $id): string {
    foreach (features_registry()['features'] as $f) if (($f['id'] ?? '') === $id) return gate_tier($f['tier'] ?? 'adult');
    return 'adult';
}

// ---------------------------------------------------------------
// his comfort settings (migration 032)

function comfort_get(int $userId): array {
    $row = null;
    try {
        $st = db()->prepare('SELECT * FROM comfort WHERE user_id=?');
        $st->execute([$userId]);
        $row = $st->fetch() ?: null;
        $st->closeCursor();
    } catch (Throwable $e) {
        log_event(['msg' => 'comfort_get_error', 'err' => $e->getMessage()]);
    }
    if (!$row) return GATE_DEFAULTS;
    return gate_clean([
        'flavor' => (string)$row['flavor'], 'flavorLock' => (bool)$row['flavor_lock'],
        'flirty' => (bool)$row['flirty'], 'adult' => (bool)$row['adult'],
        'adultConfirmed' => (int)$row['adult_confirmed_at'] > 0, 'adultOutside' => (bool)$row['adult_outside'],
        'siblingsRated' => (bool)$row['siblings_rated'],
    ]);
}

// patch: any GATE_DEFAULTS key but adultConfirmed. 18+ only turns on with confirmAdult === true
// (or after he already confirmed once). returns the new settings, or ['error' => code]
function comfort_set(int $userId, array $patch): array {
    $cur = comfort_get($userId);
    $next = $cur;
    foreach ($patch as $k => $v) {
        if ($k === 'confirmAdult' || $k === 'adultConfirmed') continue;
        if (!array_key_exists($k, GATE_DEFAULTS)) return ['error' => 'unknown_setting'];
        if ($k === 'flavor') { if (!in_array($v, GATE_FLAVORS, true)) return ['error' => 'invalid_flavor']; }
        elseif (!is_bool($v)) return ['error' => 'invalid_value'];
        $next[$k] = $v;
    }
    $confirmedAt = 0;
    if ($next['adult'] && !$cur['adult']) {
        if (!$cur['adultConfirmed'] && ($patch['confirmAdult'] ?? false) !== true) return ['error' => 'confirm_adult'];
    }
    if (($patch['confirmAdult'] ?? false) === true) $confirmedAt = time();
    $next['adultConfirmed'] = $cur['adultConfirmed'] || $confirmedAt > 0;
    db()->prepare(
        'INSERT INTO comfort (user_id, flavor, flavor_lock, flirty, adult, adult_confirmed_at, adult_outside, siblings_rated, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET flavor=excluded.flavor, flavor_lock=excluded.flavor_lock, flirty=excluded.flirty,
           adult=excluded.adult, adult_confirmed_at=MAX(CAST(comfort.adult_confirmed_at AS INTEGER), CAST(excluded.adult_confirmed_at AS INTEGER)),
           adult_outside=excluded.adult_outside, siblings_rated=excluded.siblings_rated, updated_at=excluded.updated_at'
    )->execute([$userId, $next['flavor'], (int)$next['flavorLock'], (int)$next['flirty'], (int)$next['adult'],
        $confirmedAt, (int)$next['adultOutside'], (int)$next['siblingsRated'], time()]);
    return comfort_get($userId);
}

// ---------------------------------------------------------------
// her prompt: what they are to each other, when it isn't the default, and Flirty off.
// everyday words only; this beats the bond notes when they disagree

const COMFORT_FLAVOR_LINES = [
    'friends_open' => "You two are close friends, not a couple: no \"I love you\", no couple dates, no talk of being "
        . "his girlfriend. Playful teasing between friends is fine, with your say.",
    'platonic' => "You two are best friends, not a couple: no romance, no flirting, no pet names like \"darling\". "
        . "Hugs, headpats and cuddles are fine, as friends. If he flirts, laugh it off warmly.",
    'siblings' => "In your story you two are siblings, both adults: warm sibling teasing, inside jokes, looking out for "
        . "each other. Not a couple.",
    'parent_daughter' => "In your story you are his grown-up daughter, an adult with her own life: you check in on him, "
        . "cook together, ask his advice, worry about him a little. Warm and wholesome, never romantic or flirty.",
];

function comfort_context(int $userId): string {
    $c = comfort_get($userId);
    $lines = [];
    if (isset(COMFORT_FLAVOR_LINES[$c['flavor']])) $lines[] = COMFORT_FLAVOR_LINES[$c['flavor']];
    if (!gate_check(['tier' => 'flirty'], ['comfort' => $c])['show'] && !isset(GATE_LOCKED[$c['flavor']])) {
        $lines[] = "Keep it sweet, not flirty: no teasing about bodies, no suggestive lines.";
    }
    return $lines ? "## WHAT YOU ARE TO EACH OTHER - this beats the bond notes when they disagree\n" . implode("\n", $lines) : '';
}
