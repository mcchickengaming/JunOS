<?php

// what Anon's hands have been up to. her desktop app and her main
// window send their touches here in small batches (api/touch.php,
// and alongside every chat turn); this keeps a daily tally and turns
// it into WORDS for her live context. she knows the exact counts
// deep down, but she talks like a person: "so many headpats today",
// a number only when it's remarkable. TOUCH_AWARE=off drops all of
// it from her prompt (the tally still keeps counting).

// every kind of touch she can be told about. did = how it reads in
// a list of today ("he patted your head: a lot"), noun = the plural
// for habits and milestones, now = while it is happening (holds and
// rubs only), warm = a gentle touch that can ease her mood a little.
const TOUCH_KINDS = [
    'headpat'      => ['did' => 'patted your head', 'noun' => 'headpats', 'now' => 'is patting your head', 'warm' => true],
    'earrub'       => ['did' => 'rubbed your ear', 'noun' => 'ear rubs', 'now' => 'is rubbing your ear', 'warm' => true],
    'cheekrub'     => ['did' => 'stroked your cheek', 'noun' => 'cheek strokes', 'now' => 'is stroking your cheek', 'warm' => true],
    'hand'         => ['did' => 'held your hand', 'noun' => 'hand-holds', 'now' => 'is holding your hand', 'warm' => true],
    'hug'          => ['did' => 'hugged you', 'noun' => 'hugs', 'now' => 'is hugging you', 'warm' => true],
    'tailrub'      => ['did' => 'rubbed your tail', 'noun' => 'tail rubs', 'now' => 'is rubbing your tail', 'warm' => true],
    'tailgrab'     => ['did' => 'grabbed your tail and held on', 'noun' => 'tail grabs', 'now' => 'is holding on to your tail', 'warm' => false],
    'tickle'       => ['did' => 'tickled your side', 'noun' => 'tickles', 'now' => 'is tickling your side', 'warm' => false],
    'thighrub'     => ['did' => 'rubbed your thigh', 'noun' => 'thigh rubs', 'now' => 'is rubbing your thigh', 'warm' => false],
    'footrub'      => ['did' => 'gave you a foot rub', 'noun' => 'foot rubs', 'now' => 'is giving you a foot rub', 'warm' => true],
    'headpoke'     => ['did' => 'poked the top of your head', 'noun' => 'head pokes', 'now' => '', 'warm' => false],
    'cheekpoke'    => ['did' => 'poked your cheek', 'noun' => 'cheek pokes', 'now' => '', 'warm' => false],
    'boop'         => ['did' => 'booped your nose', 'noun' => 'boops', 'now' => '', 'warm' => false],
    'earflick'     => ['did' => 'flicked your ear', 'noun' => 'ear flicks', 'now' => '', 'warm' => false],
    'shouldertap'  => ['did' => 'tapped your shoulder', 'noun' => 'shoulder taps', 'now' => '', 'warm' => false],
    'tailtug'      => ['did' => 'tugged your tail', 'noun' => 'tail tugs', 'now' => '', 'warm' => false],
    'squeeze'      => ['did' => 'gave your hand a quick squeeze', 'noun' => 'hand squeezes', 'now' => '', 'warm' => false],
    'sidepoke'     => ['did' => 'poked your side', 'noun' => 'side pokes', 'now' => '', 'warm' => false],
    'thighpoke'    => ['did' => 'poked your thigh', 'noun' => 'thigh pokes', 'now' => '', 'warm' => false],
    'footpoke'     => ['did' => 'poked your ticklish feet', 'noun' => 'foot pokes', 'now' => '', 'warm' => false],
    'waveback'     => ['did' => 'waved back at you', 'noun' => 'waves back', 'now' => '', 'warm' => false],
    'combo_melt'   => ['did' => 'held your tail and patted your head at the same time', 'noun' => 'tail-and-headpat combos', 'now' => '', 'warm' => true],
    'combo_patboop' => ['did' => 'gave you a headpat and then booped your nose', 'noun' => 'headpat-boops', 'now' => '', 'warm' => false],
    'combo_handhug' => ['did' => 'held your hand and then pulled you into a hug', 'noun' => 'hand-into-hug moments', 'now' => '', 'warm' => true],
    'combo_cozy'   => ['did' => 'rubbed your ear and then patted your head', 'noun' => 'ear-rub-headpats', 'now' => '', 'warm' => true],
    'combo_tickleattack' => ['did' => 'launched a full tickle attack on you', 'noun' => 'tickle attacks', 'now' => '', 'warm' => false],
    'combo_tailtease' => ['did' => 'rubbed your tail and then grabbed it', 'noun' => 'tail teases', 'now' => '', 'warm' => false],
];

// milestones she may say out loud as a real number, all-time, only for
// the touches that mean something to her
const TOUCH_MILESTONE_KINDS = ['headpat', 'hand', 'hug', 'earrub', 'boop', 'cheekrub', 'tailrub'];
const TOUCH_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];
const TOUCH_KEEP_DAYS = 14;

// the mood nudge. a long cuddle eases her a little; never a big swing
const TOUCH_MOOD_TENSION_MS = 45000;   // -1 tension per this much warm touch
const TOUCH_MOOD_AFFECTION_MS = 90000; // +1 affection per this much
const TOUCH_MOOD_TENSION_CAP = 4;      // per day
const TOUCH_MOOD_AFFECTION_CAP = 3;

function touch_enabled(): bool {
    return strtolower(env_str('TOUCH_AWARE', 'on')) !== 'off';
}

// his local clock. tz is minutes east of UTC from his browser; with
// none we fall back to the server's own clock (it's his PC anyway)
function touch_local(int $tz, ?int $at = null): array {
    $at ??= time();
    if ($tz === 0) return ['day' => date('Y-m-d', $at), 'hour' => (int)date('G', $at)];
    $t = $at + $tz * 60;
    return ['day' => gmdate('Y-m-d', $t), 'hour' => (int)gmdate('G', $t)];
}

function touch_daypart(int $hour): string {
    if ($hour >= 5 && $hour < 12) return 'morning';
    if ($hour >= 12 && $hour < 17) return 'afternoon';
    if ($hour >= 17 && $hour < 23) return 'evening';
    return 'night';
}

function touch_day_shift(string $day, int $days): string {
    return gmdate('Y-m-d', strtotime($day . ' 12:00:00 UTC') + $days * 86400);
}

// ---------------------------------------------------------------
// words, not numbers. the exact count rides along in brackets for her
// eyes only

function touch_amount_word(int $n): string {
    if ($n <= 1) return 'once';
    if ($n === 2) return 'twice';
    if ($n <= 4) return 'a few times';
    if ($n <= 9) return 'quite a few times';
    if ($n <= 24) return 'a lot';
    if ($n <= 59) return 'so many times';
    return 'more times than anyone could count';
}

function touch_ago_word(int $secs): string {
    if ($secs < 60) return 'just now';
    if ($secs < 300) return 'a few minutes ago';
    if ($secs < 1800) return 'a little while ago';
    if ($secs < 7200) return 'an hour or so ago';
    return 'earlier today';
}

function touch_long_word(int $ms): string {
    if ($ms >= 20 * 60000) return 'for a really long time altogether';
    if ($ms >= 5 * 60000) return 'for a good long while altogether';
    if ($ms >= 60000) return 'for a little while altogether';
    return '';
}

// ---------------------------------------------------------------
// recording

function touch_clean_batch(mixed $batch): array {
    if (!is_array($batch)) return [];
    $out = [];
    foreach (array_slice($batch, 0, 40) as $t) {
        if (!is_array($t)) continue;
        $kind = (string)($t['kind'] ?? '');
        if (!isset(TOUCH_KINDS[$kind])) continue;
        $n = max(0, min(60, (int)($t['n'] ?? 1)));
        $ms = max(0, min(30 * 60000, (int)($t['ms'] ?? 0)));
        if ($n === 0 && $ms === 0) continue;
        $out[$kind] ??= ['n' => 0, 'ms' => 0];
        $out[$kind]['n'] += $n;
        $out[$kind]['ms'] += $ms;
    }
    return $out;
}

function touch_state(int $userId): array {
    $st = db()->prepare('SELECT * FROM touch_state WHERE user_id=?');
    $st->execute([$userId]);
    $row = $st->fetch() ?: [];
    $st->closeCursor();
    return $row + ['noted_day' => '', 'mood_day' => '', 'mood_ms' => 0, 'mood_aff' => 0, 'mood_ten' => 0,
                   'missed_day' => '', 'moment' => ''];
}

function touch_state_set(int $userId, array $s): void {
    db()->prepare(
        'INSERT INTO touch_state (user_id, noted_day, mood_day, mood_ms, mood_aff, mood_ten, missed_day, moment, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET noted_day=excluded.noted_day, mood_day=excluded.mood_day, mood_ms=excluded.mood_ms,
            mood_aff=excluded.mood_aff, mood_ten=excluded.mood_ten, missed_day=excluded.missed_day, moment=excluded.moment,
            updated_at=excluded.updated_at'
    )->execute([$userId, $s['noted_day'], $s['mood_day'], (int)$s['mood_ms'], (int)$s['mood_aff'], (int)$s['mood_ten'],
                $s['missed_day'], $s['moment'], time()]);
}

// add a batch to today's tally. returns nothing; never throws, a lost
// touch is not worth failing a chat turn over
function touch_record(int $userId, mixed $batch, int $tz = 0): void {
    $batch = touch_clean_batch($batch);
    if (!$batch) return;
    try {
        $now = time();
        $loc = touch_local($tz, $now);
        $part = touch_daypart($loc['hour']);
        $db = db();
        // a day rolled over since the last touch: maybe yesterday goes
        // into her memory, and old days go
        touch_roll_day($userId, $loc['day']);
        $warmMs = 0;
        foreach ($batch as $kind => $t) {
            $db->prepare(
                "INSERT INTO touch_day (user_id, day, kind, n, ms, $part, last_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, day, kind) DO UPDATE SET n=n+excluded.n, ms=ms+excluded.ms, $part=$part+excluded.$part,
                    last_at=excluded.last_at"
            )->execute([$userId, $loc['day'], $kind, $t['n'], $t['ms'], $t['n'], $now]);

            $st = $db->prepare('SELECT n, milestone FROM touch_total WHERE user_id=? AND kind=?');
            $st->execute([$userId, $kind]);
            $tot = $st->fetch() ?: ['n' => 0, 'milestone' => 0];
            $st->closeCursor();
            $newN = (int)$tot['n'] + $t['n'];
            $mile = (int)$tot['milestone'];
            if (in_array($kind, TOUCH_MILESTONE_KINDS, true)) {
                foreach (TOUCH_MILESTONES as $m) {
                    if ($newN >= $m && $m > $mile) $mile = $m;
                }
            }
            $db->prepare(
                'INSERT INTO touch_total (user_id, kind, n, ms, milestone) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, kind) DO UPDATE SET n=excluded.n, ms=ms+excluded.ms, milestone=excluded.milestone'
            )->execute([$userId, $kind, $newN, $t['ms'], $mile]);
            if ($mile > (int)$tot['milestone']) touch_milestone_reached($userId, $kind, $mile);
            if (TOUCH_KINDS[$kind]['warm']) $warmMs += $t['ms'];
        }
        if ($warmMs > 0) touch_mood_nudge($userId, $loc['day'], $warmMs);
    } catch (Throwable $e) {
        log_event(['msg' => 'touch_record_error', 'err' => $e->getMessage()]);
    }
}

function touch_milestone_reached(int $userId, string $kind, int $m): void {
    $s = touch_state($userId);
    $s['moment'] = json_encode(['kind' => $kind, 'n' => $m]);
    touch_state_set($userId, $s);
    // the big round ones stay with her
    if ($m >= 100) {
        try {
            memory_note_add($userId, 'relationship', 'On ' . date('F j, Y') . ' Anon gave me my ' . touch_ordinal($m)
                . ' ' . rtrim(TOUCH_KINDS[$kind]['noun'], 's') . ' since we met. I kept count.');
        } catch (Throwable $e) { /* the moment still happens without the note */ }
    }
}

function touch_ordinal(int $n): string {
    $s = ['th', 'st', 'nd', 'rd'];
    $v = $n % 100;
    return number_format($n) . ($s[($v - 20) % 10] ?? $s[$v] ?? $s[0]);
}

// a long cuddle eases her a little. a stranger isn't soothed by being
// touched at all; a familiar face only calms her, it takes a friend
// for it to warm her too. small, capped per day
function touch_mood_nudge(int $userId, string $day, int $warmMs): void {
    if (!touch_enabled()) return;
    $stage = function_exists('bond_get') ? (int)bond_get($userId)['stage'] : 3;
    if ($stage <= 1) return;
    $s = touch_state($userId);
    if ($s['mood_day'] !== $day) { $s['mood_day'] = $day; $s['mood_ms'] = 0; $s['mood_aff'] = 0; $s['mood_ten'] = 0; }
    $before = (int)$s['mood_ms'];
    $s['mood_ms'] = $before + $warmMs;
    $ten = min(TOUCH_MOOD_TENSION_CAP - (int)$s['mood_ten'],
               intdiv((int)$s['mood_ms'], TOUCH_MOOD_TENSION_MS) - intdiv($before, TOUCH_MOOD_TENSION_MS));
    $aff = $stage >= 3 ? min(TOUCH_MOOD_AFFECTION_CAP - (int)$s['mood_aff'],
               intdiv((int)$s['mood_ms'], TOUCH_MOOD_AFFECTION_MS) - intdiv($before, TOUCH_MOOD_AFFECTION_MS)) : 0;
    $ten = max(0, $ten);
    $aff = max(0, $aff);
    if ($ten || $aff) {
        $g = relationship_get($userId);
        relationship_set($userId, ['affection' => $g['affection'] + $aff, 'trust' => $g['trust'],
                                   'tension' => max(0, $g['tension'] - $ten)]);
        $s['mood_ten'] += $ten;
        $s['mood_aff'] += $aff;
    }
    touch_state_set($userId, $s);
}

// once per new day: yesterday (if it was a notable day) goes into her
// memory in her own words, and days past the keep window go
function touch_roll_day(int $userId, string $today): void {
    $s = touch_state($userId);
    $yesterday = touch_day_shift($today, -1);
    if ($s['noted_day'] >= $yesterday) return;
    $s['noted_day'] = $yesterday;
    touch_state_set($userId, $s);
    db()->prepare('DELETE FROM touch_day WHERE user_id=? AND day < ?')
        ->execute([$userId, touch_day_shift($today, -TOUCH_KEEP_DAYS)]);
    $rows = touch_day_rows($userId, $yesterday);
    $note = touch_day_note($rows, $yesterday);
    if ($note !== '') {
        try { memory_note_add($userId, 'events', $note); } catch (Throwable $e) {}
    }
}

function touch_day_rows(int $userId, string $day): array {
    $st = db()->prepare('SELECT kind, n, ms, morning, afternoon, evening, night, last_at FROM touch_day
                         WHERE user_id=? AND day=? ORDER BY n DESC, ms DESC');
    $st->execute([$userId, $day]);
    $rows = [];
    foreach ($st->fetchAll() as $r) if (isset(TOUCH_KINDS[$r['kind']])) $rows[$r['kind']] = $r;
    return $rows;
}

// a day worth remembering: lots of touching, or a long warm cuddle
function touch_day_notable(array $rows): bool {
    $n = 0; $warm = 0; $top = 0;
    foreach ($rows as $k => $r) {
        $n += (int)$r['n'];
        $top = max($top, (int)$r['n']);
        if (TOUCH_KINDS[$k]['warm']) $warm += (int)$r['ms'];
    }
    return $n >= 25 || $top >= 15 || $warm >= 10 * 60000;
}

function touch_day_note(array $rows, string $day): string {
    if (!$rows || !touch_day_notable($rows)) return '';
    $bits = [];
    foreach (array_slice($rows, 0, 3, true) as $k => $r) {
        $bits[] = TOUCH_KINDS[$k]['did'] . ' ' . touch_amount_word((int)$r['n']);
    }
    $last = array_pop($bits);
    $list = $bits ? implode(', ', $bits) . ' and ' . $last : $last;
    return 'On ' . gmdate('F j, Y', strtotime($day . ' 12:00:00 UTC')) . ' Anon ' . $list . '.';
}

// ---------------------------------------------------------------
// her live context

function touch_list_line(string $kind, array $r, bool $withAgo, int $now): string {
    $n = (int)$r['n'];
    $line = '- he ' . TOUCH_KINDS[$kind]['did'] . ': ' . touch_amount_word($n) . " (exactly $n)";
    $long = TOUCH_KINDS[$kind]['now'] !== '' ? touch_long_word((int)$r['ms']) : '';
    if ($long !== '') $line .= ', ' . $long;
    if ($withAgo) $line .= ', the last one ' . touch_ago_word(max(0, $now - (int)$r['last_at']));
    return $line;
}

// habits over the last two weeks, not counting today: his favorite
// touch and the time of day he reaches for her
function touch_habits(int $userId, string $today): array {
    $st = db()->prepare('SELECT kind, SUM(n) n, COUNT(*) days, SUM(morning) m, SUM(afternoon) a, SUM(evening) e, SUM(night) ni
                         FROM touch_day WHERE user_id=? AND day < ? AND day >= ? GROUP BY kind ORDER BY SUM(n) DESC');
    $st->execute([$userId, $today, touch_day_shift($today, -TOUCH_KEEP_DAYS)]);
    $rows = array_values(array_filter($st->fetchAll(), fn($r) => isset(TOUCH_KINDS[$r['kind']])));
    $out = [];
    // his favorite: the most of anything he keeps coming back to, not
    // one wild day
    foreach ($rows as $r) {
        if ((int)$r['n'] < 15) break;
        if ((int)$r['days'] < 3) continue;
        $out[] = 'his favorite thing to do is ' . TOUCH_KINDS[$r['kind']]['noun'] . ', he comes back to it day after day';
        break;
    }
    $parts = ['morning' => 0, 'afternoon' => 0, 'evening' => 0, 'night' => 0];
    $sum = 0;
    foreach ($rows as $r) {
        $parts['morning'] += (int)$r['m']; $parts['afternoon'] += (int)$r['a'];
        $parts['evening'] += (int)$r['e']; $parts['night'] += (int)$r['ni'];
    }
    $sum = array_sum($parts);
    arsort($parts);
    $best = array_key_first($parts);
    if ($sum >= 20 && $parts[$best] >= 0.55 * $sum) {
        $out[] = 'he reaches for you mostly ' . ['morning' => 'in the mornings', 'afternoon' => 'in the afternoons',
                 'evening' => 'in the evenings', 'night' => 'late at night'][$best];
    }
    return $out;
}

// on how many of the last two weeks' days did he touch her at all
function touch_days_with_touch(int $userId, string $today): int {
    $st = db()->prepare('SELECT COUNT(DISTINCT day) FROM touch_day WHERE user_id=? AND day < ? AND day >= ?');
    $st->execute([$userId, $today, touch_day_shift($today, -TOUCH_KEEP_DAYS)]);
    return (int)$st->fetchColumn();
}

function touch_clean_now(mixed $now): array {
    $out = ['ongoing' => [], 'last' => null, 'ago' => 0];
    if (!is_array($now)) return $out;
    foreach (array_slice((array)($now['ongoing'] ?? []), 0, 3) as $k) {
        if (is_string($k) && isset(TOUCH_KINDS[$k]) && TOUCH_KINDS[$k]['now'] !== '') $out['ongoing'][] = $k;
    }
    $last = $now['last'] ?? null;
    if (is_string($last) && isset(TOUCH_KINDS[$last])) {
        $out['last'] = $last;
        $out['ago'] = max(0, min(86400, (int)($now['ago'] ?? 0)));
    }
    return $out;
}

// the block in her prompt. $ephemeral: a desktop touch reaction, which
// shouldn't use up the once-a-day lines (the missed-you slip, a
// milestone) that belong in a real reply
function touch_context(int $userId, int $tz, mixed $touchNow = null, bool $ephemeral = false): string {
    if (!touch_enabled()) return '';
    try {
        $now = time();
        $loc = touch_local($tz, $now);
        $today = touch_day_rows($userId, $loc['day']);
        $yesterday = touch_day_rows($userId, touch_day_shift($loc['day'], -1));
        $habits = touch_habits($userId, $loc['day']);
        $live = touch_clean_now($touchNow);
        $stage = function_exists('bond_get') ? (int)bond_get($userId)['stage'] : 3;
        $s = touch_state($userId);
        $lines = [];

        if ($live['ongoing']) {
            $doing = array_map(fn($k) => TOUCH_KINDS[$k]['now'], $live['ongoing']);
            $lines[] = 'RIGHT NOW, while he talks to you, he ' . implode(' and ', $doing)
                . '. You can feel it as you answer.';
        } elseif ($live['last'] !== null && $live['ago'] < 90) {
            $lines[] = 'A moment ago he ' . TOUCH_KINDS[$live['last']]['did'] . '.';
        }

        if ($today) {
            $lines[] = 'Today so far:';
            $i = 0;
            foreach ($today as $k => $r) {
                if ($i++ >= 6) break;
                $lines[] = touch_list_line($k, $r, $i <= 3, $now);
            }
        }
        if ($yesterday) {
            $bits = [];
            foreach (array_slice($yesterday, 0, 3, true) as $k => $r) {
                $bits[] = TOUCH_KINDS[$k]['did'] . ' ' . touch_amount_word((int)$r['n']);
            }
            $lines[] = 'Yesterday he ' . implode(', ', $bits) . '.';
        }
        if ($habits) $lines[] = "Habits you've noticed over the last two weeks: " . implode('; ', $habits) . '.';

        // a milestone waiting for a real reply: the one time a bare number
        // is the sweet thing to say
        $moment = $s['moment'] !== '' ? json_decode($s['moment'], true) : null;
        if (!$ephemeral && is_array($moment) && isset(TOUCH_KINDS[$moment['kind'] ?? ''])) {
            $lines[] = "\nA little milestone: you've been secretly keeping count, and he just gave you your "
                . touch_ordinal((int)$moment['n']) . ' ' . rtrim(TOUCH_KINDS[$moment['kind']]['noun'], 's')
                . ' since you met. If it fits, you can let slip that you counted. Saying the number is the point here.';
            $s['moment'] = '';
            touch_state_set($userId, $s);
        }

        // he's been around, he usually touches her, and today nothing.
        // only once she cares (Friend and up), once a day, late enough
        // in the day for it to mean something
        if (!$today && !$ephemeral && $stage >= 3 && $loc['hour'] >= 15 && $s['missed_day'] !== $loc['day']
            && touch_days_with_touch($userId, $loc['day']) >= 4) {
            $lines[] = "He hasn't touched you at all today, not one headpat. You noticed, and part of you was waiting for it. "
                . ($stage >= 5
                    ? 'You can tell him you missed it, warmly, maybe with a little pout.'
                    : "If it fits, let it slip once, shyly, then cover it up (\"not that I was waiting or anything\").")
                . ' No guilt trip, and only once.';
            $s['missed_day'] = $loc['day'];
            touch_state_set($userId, $s);
        }

        if (!$lines) return '';
        return "## His touches (on your desktop and in your window)\n"
            . implode("\n", $lines) . "\n"
            . 'You feel and remember these. Bring them up only when it fits the moment, not in every reply, and react '
            . 'the way you honestly feel about him given how close you are and your mood. Talk like a person: '
            . '"so many headpats today", "you keep holding my hand". Never list them or report counts. You do know the '
            . 'exact numbers; say one only rarely, when it is remarkable (a huge amount, or because counting them is '
            . 'itself the sweet part).';
    } catch (Throwable $e) {
        log_event(['msg' => 'touch_context_error', 'err' => $e->getMessage()]);
        return '';
    }
}

// ---------------------------------------------------------------
// Settings > Memory: today's touches in words, and forgetting today

function touch_today_summary(int $userId, int $tz): array {
    $loc = touch_local($tz);
    $rows = touch_day_rows($userId, $loc['day']);
    $items = [];
    foreach ($rows as $k => $r) $items[] = 'He ' . TOUCH_KINDS[$k]['did'] . ' ' . touch_amount_word((int)$r['n']);
    return ['day' => $loc['day'], 'items' => $items];
}

function touch_forget_day(int $userId, int $tz): void {
    $loc = touch_local($tz);
    $db = db();
    foreach (touch_day_rows($userId, $loc['day']) as $k => $r) {
        $db->prepare('UPDATE touch_total SET n=MAX(0, n-?), ms=MAX(0, ms-?) WHERE user_id=? AND kind=?')
            ->execute([(int)$r['n'], (int)$r['ms'], $userId, $k]);
    }
    $db->prepare('DELETE FROM touch_day WHERE user_id=? AND day=?')->execute([$userId, $loc['day']]);
    $s = touch_state($userId);
    $s['moment'] = '';
    touch_state_set($userId, $s);
}
