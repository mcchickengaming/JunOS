<?php
// Things Jun picks up from Anon over time. Not part of who she is from
// the start: habits she catches from what they do together, slowly, or
// because he asked her to. Each quirk earns points from his messages
// (and what they watch), at most a few a day, and is "picked up" only
// with enough points spread over a few days, at a high enough bond.
// When it happens it goes into her memory and her prompt gets a
// one-time "this is new about you" line; after that a short standing
// line. He can ask for it outright, or ask her to drop it.
//
// The first quirk: anime tsundere talk. Jun is shy and dry, a little
// tsundere on her own, but "b-baka" isn't her. After enough anime
// together she might catch it, embarrassed that she did.
//
// JUN_QUIRKS=off leaves them all out of her prompt (the desktop then
// doesn't use them either); points still count.

const QUIRKS = [
    'anime_tsundere' => [
        'need_points' => 12, 'need_days' => 3, 'min_stage' => 3, 'day_cap' => 4,
        // his message mentions anime, or the thing they're watching is anime
        'mention' => '/\b(anime|manga|manhwa|waifu|tsundere|yandere|senpai|isekai|shonen|shounen|shojo|shoujo|seinen|otaku|weeb|cosplay|crunchyroll|ghibli|kawaii|desu|baka|naruto|one piece|jojo|evangelion|spy ?x ?family|demon slayer|attack on titan|chainsaw man|frieren|bocchi|dragon ball|my hero academia|jujutsu kaisen|sailor moon|studio trigger)\b/i',
        'watch_points' => 2,
        // he asks for it, or asks her to stop
        'ask_on' => '/\b(?:be|act|play|talk like|pretend to be|turn into)\s+(?:a\s+|an\s+|more\s+|my\s+|more of a\s+)?(?:little\s+)?tsundere\b|\b(?:say|call me)\s+(?:a\s+)?baka\b/i',
        'ask_off' => '/\b(?:stop|quit|no more|don\'?t|do not)\s+(?:being\s+|acting\s+|playing\s+)?(?:a\s+|so\s+|the\s+)?(?:tsundere|baka)\b|\bdrop the tsundere\b/i',
        'memory' => 'Watching and talking about anime with Anon so much, I caught a tsundere habit from it. Sometimes a "b-baka" slips out when I\'m secretly pleased. Embarrassing.',
        'new_picked' => "Something new about you: all the anime with him rubbed off on you. You've started slipping into anime-tsundere talk "
            . "when you're secretly pleased: a \"b-baka\", an \"it's not like I...!\". You know exactly where you caught it and it's a little "
            . "embarrassing. You might admit that once, shyly, if it fits. Never forced.",
        'new_asked' => "He asked you to be more tsundere. Go along with it in your own way: dry, a little embarrassed about it, a \"b-baka\" or "
            . "\"it's not like I...!\" now and then when you're secretly pleased, never mean, never every reply.",
        'standing' => "A habit you picked up from him: now and then, when you're secretly pleased, a \"b-baka\" or an \"it's not like I...!\" "
            . "slips out. Rare, never every reply, and you're a bit embarrassed by it.",
        'new_stopped' => "He asked you to drop the tsundere act. Tease him about it once if it fits, then just be your usual self: no more \"baka\".",
    ],
];

function quirks_enabled(): bool {
    return strtolower(env_str('JUN_QUIRKS', 'on')) !== 'off';
}

function quirk_get(int $userId, string $quirk): array {
    $row = null;
    try {
        $st = db()->prepare('SELECT points, days, last_day, day_points, state, since, announced FROM quirks WHERE user_id=? AND quirk=?');
        $st->execute([$userId, $quirk]);
        $row = $st->fetch() ?: null;
        $st->closeCursor();
    } catch (Throwable $e) {
        $row = null;
    }
    return [
        'points' => (int)($row['points'] ?? 0), 'days' => (int)($row['days'] ?? 0), 'last_day' => (string)($row['last_day'] ?? ''),
        'day_points' => (int)($row['day_points'] ?? 0), 'state' => (string)($row['state'] ?? 'learning'),
        'since' => (int)($row['since'] ?? 0), 'announced' => (int)($row['announced'] ?? 0),
    ];
}

function quirk_put(int $userId, string $quirk, array $q): void {
    db()->prepare('INSERT INTO quirks (user_id, quirk, points, days, last_day, day_points, state, since, announced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, quirk) DO UPDATE SET points=excluded.points, days=excluded.days, last_day=excluded.last_day,
        day_points=excluded.day_points, state=excluded.state, since=excluded.since, announced=excluded.announced')
        ->execute([$userId, $quirk, $q['points'], $q['days'], $q['last_day'], $q['day_points'], $q['state'], $q['since'], $q['announced']]);
}

// whether she has it right now
function quirk_active(array $q): bool {
    return $q['state'] === 'picked' || $q['state'] === 'asked';
}

// one of his turns: his message (and the title of what they're watching,
// on a watch turn). $day: his local day. $stage: the bond stage now.
function quirks_on_turn(int $userId, string $msg, string $watchTitle = '', ?string $day = null, ?int $stage = null): void {
    $day = $day ?? date('Y-m-d');
    $stage = $stage ?? (function_exists('bond_get') ? (int)(bond_get($userId)['stage'] ?? 1) : 1);
    foreach (QUIRKS as $name => $def) {
        try {
            $q = quirk_get($userId, $name);
            $before = $q;
            // he asks
            if ($msg !== '' && preg_match($def['ask_off'], $msg)) {
                if (quirk_active($q)) { $q['state'] = 'stopped'; $q['since'] = time(); $q['announced'] = 0; }
            } elseif ($msg !== '' && preg_match($def['ask_on'], $msg)) {
                if ($q['state'] !== 'asked') { $q['state'] = 'asked'; $q['since'] = time(); $q['announced'] = 0; }
            }
            // she picks it up, slowly: points, capped per day, over days
            $earn = 0;
            if ($msg !== '' && preg_match($def['mention'], $msg)) $earn += 1;
            if ($watchTitle !== '' && preg_match($def['mention'], $watchTitle)) $earn += $def['watch_points'];
            if ($earn > 0) {
                if ($q['last_day'] !== $day) { $q['last_day'] = $day; $q['day_points'] = 0; $q['days']++; }
                $earn = min($earn, $def['day_cap'] - $q['day_points']);
                if ($earn > 0) { $q['points'] += $earn; $q['day_points'] += $earn; }
            }
            if ($q['state'] === 'learning' && $q['points'] >= $def['need_points'] && $q['days'] >= $def['need_days']
                && $stage >= $def['min_stage']) {
                $q['state'] = 'picked';
                $q['since'] = time();
                $q['announced'] = 0;
                if (function_exists('memory_note_add')) {
                    try { memory_note_add($userId, 'relationship', $def['memory']); } catch (Throwable $e) {}
                }
            }
            if ($q !== $before) quirk_put($userId, $name, $q);
        } catch (Throwable $e) {
            if (function_exists('log_event')) log_event(['msg' => 'quirks: error', 'quirk' => $name, 'err' => $e->getMessage()]);
        }
    }
}

// her live context: the one-time "this is new" line, then a short
// standing one. $markSeen: this turn really goes to her (not a replay)
function quirks_context(int $userId, bool $markSeen = true): string {
    if (!quirks_enabled()) return '';
    $lines = [];
    foreach (QUIRKS as $name => $def) {
        $q = quirk_get($userId, $name);
        if (!$q['announced'] && in_array($q['state'], ['picked', 'asked', 'stopped'], true)) {
            $lines[] = $def['new_' . $q['state']];
            if ($markSeen) { $q['announced'] = 1; try { quirk_put($userId, $name, $q); } catch (Throwable $e) {} }
        } elseif (quirk_active($q)) {
            $lines[] = $def['standing'];
        }
    }
    return $lines ? "## Little habits you've picked up from him\n" . implode("\n", $lines) : '';
}

// for the pages (relationship.php): which quirks she has right now
function quirks_client(int $userId): array {
    $out = [];
    foreach (QUIRKS as $name => $def) {
        $q = quirk_get($userId, $name);
        $out[$name] = ['active' => quirks_enabled() && quirk_active($q), 'state' => $q['state']];
    }
    return $out;
}
