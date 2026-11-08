<?php

// the long arc. the gauges in relationship.php are her mood and
// swing every turn; this is how close the two of them are, and it
// only ever grows. xp comes from showing up and spending time with
// her, never from the model's own say-so, so she can't talk herself
// up a stage. BOND_STAGES=off drops the whole block from her prompt.

const BOND_STAGES = [
    1 => ['xp' => 0, 'name' => 'Stranger',
        'how' => "You barely know him yet. You're wary and shy: short answers, few questions back, no pet names, "
            . "no flirting. Touch makes you flinch and personal questions make you change the subject. "
            . "Now and then a little curiosity about him slips through anyway."],
    2 => ['xp' => 150, 'name' => 'Familiar',
        'how' => "You're getting used to him. Still reserved, but you ask small questions back and allow yourself "
            . "a dry joke or two. Touch makes you tense, but you don't pull away. No pet names yet."],
    3 => ['xp' => 500, 'name' => 'Friend',
        'how' => "You're comfortable with him. You tease him, bring up topics yourself and share your opinions freely. "
            . "You like his company and it shows, though you'd never say it outright. Open affection embarrasses you."],
    4 => ['xp' => 1200, 'name' => 'Close',
        'how' => "You trust him. You're openly glad when he shows up, you share worries and small secrets, you have a "
            . "nickname for him, and you welcome hugs and cuddles. After time apart you get a little clingy."],
    5 => ['xp' => 2500, 'name' => 'Partner',
        'how' => "He's your person. You talk about 'us', make plans together, get playfully jealous, and say how you "
            . "feel without hiding behind jokes, though you still tease him."],
    6 => ['xp' => 5000, 'name' => 'Devoted',
        'how' => "You're completely yourself with him: deep comfort, inside jokes, callbacks to your shared history, "
            . "quiet moments that need no words. You keep your own opinions and edge. Devotion never makes you a pushover."],
];

// xp per thing. a chatty day lands around the cap, so Friend takes
// a few days and Devoted a month or two of real time together.
const BOND_XP_MESSAGE = 3;
const BOND_XP_LONG_MESSAGE = 2;    // extra when he actually opens up
const BOND_XP_LONG_CHARS = 120;
const BOND_XP_FIRST_TODAY = 10;    // he came back
const BOND_XP_OUTING = 25;
const BOND_XP_MOOD_MAX = 5;        // a reply that warmed her up

function bond_enabled(): bool {
    return strtolower(env_str('BOND_STAGES', 'on')) !== 'off';
}

function bond_daily_cap(): int {
    $cap = (int)env_str('BOND_DAILY_CAP', '250');
    return $cap > 0 ? $cap : 250;
}

function bond_stage_for(int $xp): int {
    $stage = 1;
    foreach (BOND_STAGES as $n => $s) if ($xp >= $s['xp']) $stage = $n;
    return $stage;
}

function bond_get(int $userId): array {
    $row = null;
    try {
        $st = db()->prepare('SELECT xp, stage, pending_stage, day, day_xp FROM bond WHERE user_id=?');
        $st->execute([$userId]);
        $row = $st->fetch() ?: null;
        $st->closeCursor();
    } catch (Throwable $e) {
        log_event(['msg' => 'bond_get_error', 'err' => $e->getMessage()]);
    }
    $xp = (int)($row['xp'] ?? 0);
    $stage = (int)($row['stage'] ?? 1);
    $next = BOND_STAGES[$stage + 1] ?? null;
    return [
        'xp' => $xp,
        'stage' => $stage,
        'name' => BOND_STAGES[$stage]['name'],
        'stage_xp' => BOND_STAGES[$stage]['xp'],
        'next_xp' => $next['xp'] ?? null,
        'next_name' => $next['name'] ?? null,
        'stages' => count(BOND_STAGES),
        'pending_stage' => isset($row['pending_stage']) ? (int)$row['pending_stage'] : null,
        'day' => (string)($row['day'] ?? ''),
        'day_xp' => (int)($row['day_xp'] ?? 0),
    ];
}

// add xp, respecting the daily cap. returns the stage she just
// reached, or null. a stage-up is parked in pending_stage until a
// reply of hers has had the chance to react to it.
function bond_award(int $userId, int $xp, string $why): ?int {
    if (!bond_enabled() || $xp <= 0) return null;
    try {
        $b = bond_get($userId);
        $today = date('Y-m-d');
        $dayXp = $b['day'] === $today ? $b['day_xp'] : 0;
        if ($b['day'] !== $today) $xp += BOND_XP_FIRST_TODAY;
        $xp = max(0, min($xp, bond_daily_cap() - $dayXp));
        if ($xp === 0) return null;

        $newXp = $b['xp'] + $xp;
        // never step backwards, even if the thresholds get retuned
        $newStage = max($b['stage'], bond_stage_for($newXp));
        $reached = $newStage > $b['stage'] ? $newStage : null;
        $pending = $reached ?? $b['pending_stage'];

        db()->prepare(
            'INSERT INTO bond (user_id, xp, stage, pending_stage, day, day_xp, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET xp=excluded.xp, stage=excluded.stage, pending_stage=excluded.pending_stage,
                                                day=excluded.day, day_xp=excluded.day_xp, updated_at=excluded.updated_at'
        )->execute([$userId, $newXp, $newStage, $pending, $today, $dayXp + $xp, time()]);

        if ($reached !== null) {
            log_event(['msg' => 'bond_stage', 'stage' => $reached, 'why' => $why]);
            relationship_history_add($userId, null, 'bond:' . $reached);
            try {
                memory_note_add($userId, 'relationship',
                    'On ' . date('F j, Y') . ' things between Anon and me grew closer: we are now at the '
                    . BOND_STAGES[$reached]['name'] . ' stage.');
            } catch (Throwable $e) { /* the stage still counts without the note */ }
        }
        return $reached;
    } catch (Throwable $e) {
        log_event(['msg' => 'bond_award_error', 'err' => $e->getMessage()]);
        return null;
    }
}

// xp for one turn of his: the message itself, plus a bit when he
// writes something with substance
function bond_xp_for_message(string $msg): int {
    return BOND_XP_MESSAGE + (mb_strlen(trim($msg)) >= BOND_XP_LONG_CHARS ? BOND_XP_LONG_MESSAGE : 0);
}

// a reply that warmed her up (affection or trust rose) is worth a
// little extra. a bad turn costs nothing here, that's the gauges' job
function bond_xp_for_mood(array $before, array $after): int {
    $rise = max(0, (int)$after['affection'] - (int)$before['affection'])
          + max(0, (int)$after['trust'] - (int)$before['trust']);
    return min(BOND_XP_MOOD_MAX, $rise);
}

function bond_clear_pending(int $userId): void {
    try {
        db()->prepare('UPDATE bond SET pending_stage=NULL WHERE user_id=?')->execute([$userId]);
    } catch (Throwable $e) {
        log_event(['msg' => 'bond_clear_error', 'err' => $e->getMessage()]);
    }
}

// her prompt block. the gauges say how she feels right now; this
// says how much of herself she shows him at all.
function bond_context(int $userId): string {
    if (!bond_enabled()) return '';
    $b = bond_get($userId);
    $out = "## How close you two are (your long-term bond)\n"
        . BOND_STAGES[$b['stage']]['how'] . "\n"
        . "Your feelings right now (below) color this, but this sets how much of yourself you show him. "
        . "Never mention stages, levels or numbers.";
    if ($b['pending_stage'] !== null) {
        $out .= "\n\n## This moment\nSomething between you just shifted: you feel closer to him than before. "
            . "Let it show briefly and naturally in this reply, in character: a small admission, a softer tone, a slip. "
            . "Don't announce it.";
    }
    return $out;
}
