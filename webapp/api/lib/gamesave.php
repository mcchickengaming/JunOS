<?php
// Game saves (#35 a): the game in her window keeps its own progress, in slots the player can save to, load,
// undo, download and upload. The base the story-event engine (#34) and story state (#35 b) plug into.
//
// Two Juns (Nov 14): desktop Jun is the true Jun, shared by every save and never inside one (her chats,
// memories, feelings, needs, her own skills, her desktop life). The game is an authored story; ITS progress
// is what a save holds:
//
//   game      the live game: named SECTIONS that game systems read and write (game_section_get/put here, or
//             api/gamesave.php `put` from a page). A system owns its section's shape; this file never looks
//             inside one, except an optional `_summary` (short words for the save card: place, chapter,
//             difficulty…). The play clock (`played`, seconds actually played) rides along.
//   progress  the player's side of the progression service: his skills (except the desktop ones,
//             GAMESAVE_DESKTOP_SKILLS), Credits, items, keepsakes, his buffs, story grants, things he set going.
//             Her skills stay live and shared: game Jun's xp flows into desktop Jun's skills (Nov 14).
//   client    parts a page keeps in its own storage (the delve in progress, `jun.delve` → run), handed over
//             by js/core/gamesave.js and handed back on load. Never read here.
//   bond      a RECORD of the bond when the save was made. Loading applies it only when the player ticks
//             "use this save's bond" (off by default, Nov 15); the page makes a desktop save point first, and
//             the before-load save keeps the bond as it was, so Undo puts it back.
//
// Slots (GAMESAVE_TUNE): auto (the last 3, rotating; at most one every `autoGapSec` unless forced), quick (one,
// replaced), named (up to 50, imports count here; never removed on their own), before_load (the last 5: made
// before every load, undo and new game, so nothing is ever one click from gone). A file (.jungame) is plain
// data with a checksum that catches damage (not cheating: editing your own save is the player's business).
//
// `epoch` changes on every load / undo / new game. A page writes a section with the epoch it read, so a page
// still holding the old game gets `reloaded` instead of writing it over the new one.
//
// Tests: .github/scripts/gamesave.test.php.

const GAMESAVE_FORMAT = 'jungame';
const GAMESAVE_V = 1;
const GAMESAVE_KINDS = ['auto', 'quick', 'named', 'before_load'];
// player skills that belong to desktop Jun's world (the focus timer next to her on your desktop), not to a game
const GAMESAVE_DESKTOP_SKILLS = ['focus'];
// the player's side of the progression blob that a game save carries (his skills are handled on their own)
const GAMESAVE_PROGRESS_KEYS = ['credits', 'items', 'keepsakes', 'buffs', 'story', 'jobs'];
const GAMESAVE_TUNE = [
    'autoKeep' => 3,            // rotating autosaves
    'beforeKeep' => 5,          // "before load" saves kept
    'namedMax' => 50,           // named + imported saves
    'autoGapSec' => 30,         // at most one autosave this often (a forced one always goes through)
    'sectionMax' => 262144,     // bytes of JSON one section or client part may take
    'totalMax' => 2097152,      // bytes of JSON a whole save may take
    'nameMax' => 80,            // characters in a save's name
    'tickMaxSec' => 300,        // the play clock counts at most this much per tick
    'summaryMax' => 60,         // characters per summary word
];
const GAMESAVE_KIND_NAMES = ['auto' => 'Autosave', 'quick' => 'Quicksave', 'named' => 'Save', 'before_load' => 'Before loading'];

function gamesave_enabled(): bool {
    return strtolower(env_str('JUN_GAMESAVES', 'on')) !== 'off';
}

function gamesave_name_ok(string $n): bool {
    return (bool)preg_match('/^[a-z][a-z0-9_]{0,31}$/', $n);
}

function gamesave_json(mixed $v): string {
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
}

function gamesave_clip(string $s, int $max): string {
    $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '');
    return mb_substr($s, 0, $max);
}

// ---------------------------------------------------------------
// the live game

function gamesave_live_blank(int $now = 0): array {
    return ['sections' => [], 'epoch' => 1, 'rev' => 0, 'played' => 0, 'tickAt' => 0, 'startedAt' => $now, 'lastLoad' => null];
}

function gamesave_live(int $userId): array {
    $st = db()->prepare('SELECT data, epoch, rev, played, tick_at, started_at, last_load FROM game_state WHERE user_id = ?');
    $st->execute([$userId]);
    $row = $st->fetch();
    $st->closeCursor();
    if (!$row) return gamesave_live_blank();
    $data = json_decode((string)$row['data'], true);
    $sections = is_array($data['sections'] ?? null) ? $data['sections'] : [];
    $last = $row['last_load'] !== null ? json_decode((string)$row['last_load'], true) : null;
    return ['sections' => $sections, 'epoch' => (int)$row['epoch'], 'rev' => (int)$row['rev'], 'played' => (int)$row['played'],
        'tickAt' => (int)$row['tick_at'], 'startedAt' => (int)$row['started_at'], 'lastLoad' => is_array($last) ? $last : null];
}

function gamesave_live_write(int $userId, array $live, int $now): void {
    db()->prepare('INSERT INTO game_state (user_id, data, epoch, rev, played, tick_at, started_at, last_load, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, epoch = excluded.epoch, rev = excluded.rev,
            played = excluded.played, tick_at = excluded.tick_at, started_at = excluded.started_at,
            last_load = excluded.last_load, updated_at = excluded.updated_at')
        ->execute([$userId, gamesave_json(['sections' => (object)$live['sections']]), $live['epoch'], $live['rev'],
            $live['played'], $live['tickAt'], $live['startedAt'],
            $live['lastLoad'] === null ? null : gamesave_json($live['lastLoad']), $now]);
}

// what a page or the engine may see of the live game without the sections themselves
function gamesave_live_view(array $live): array {
    $sizes = [];
    foreach ($live['sections'] as $k => $v) $sizes[$k] = strlen(gamesave_json($v));
    return ['epoch' => $live['epoch'], 'rev' => $live['rev'], 'played' => $live['played'], 'startedAt' => $live['startedAt'],
        'sections' => (object)$sizes, 'canUndo' => !empty($live['lastLoad']['before']), 'lastLoad' => $live['lastLoad']];
}

// one section of the live game (null = the game has none yet)
function game_section_get(int $userId, string $name): mixed {
    if (!gamesave_name_ok($name)) return null;
    return gamesave_live($userId)['sections'][$name] ?? null;
}

// write sections of the live game. $epoch: the epoch the writer read (null = don't check, for server code that
// just read it itself). null data removes a section. Returns ['ok', 'epoch', 'rev'] or ['error' => …].
function game_sections_put(int $userId, array $map, ?int $epoch = null, ?int $now = null, array $t = GAMESAVE_TUNE): array {
    $now ??= time();
    foreach ($map as $name => $data) {
        if (!is_string($name) || !gamesave_name_ok($name)) return ['error' => 'bad_name', 'name' => (string)$name];
        if ($data !== null && strlen(gamesave_json($data)) > $t['sectionMax']) return ['error' => 'too_big', 'name' => $name];
    }
    $db = db();
    $db->beginTransaction();
    try {
        $live = gamesave_live($userId);
        if ($epoch !== null && $epoch !== $live['epoch']) { $db->rollBack(); return ['error' => 'reloaded', 'epoch' => $live['epoch']]; }
        foreach ($map as $name => $data) {
            if ($data === null) unset($live['sections'][$name]);
            else $live['sections'][$name] = $data;
        }
        if (strlen(gamesave_json($live['sections'])) > $t['totalMax']) { $db->rollBack(); return ['error' => 'too_big']; }
        if (!$live['startedAt']) $live['startedAt'] = $now;
        $live['rev']++;
        gamesave_live_write($userId, $live, $now);
        $db->commit();
        return ['ok' => true, 'epoch' => $live['epoch'], 'rev' => $live['rev']];
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function game_section_put(int $userId, string $name, mixed $data, ?int $epoch = null, ?int $now = null): array {
    return game_sections_put($userId, [$name => $data], $epoch, $now);
}

// the play clock: a page says "I've been playing for N seconds" (a minute or so at a time); the server counts no
// more than the real time since the last tick, so a page can't make a save look longer-played than it was
function gamesave_tick(int $userId, int $seconds, int $now, array $t = GAMESAVE_TUNE): int {
    $live = gamesave_live($userId);
    $real = $live['tickAt'] > 0 ? max(0, $now - $live['tickAt']) : $t['tickMaxSec'];
    $add = max(0, min($seconds, $real, $t['tickMaxSec']));
    $live['played'] += $add;
    $live['tickAt'] = $now;
    if (!$live['startedAt']) $live['startedAt'] = $now;
    gamesave_live_write($userId, $live, $now);
    return $live['played'];
}

// ---------------------------------------------------------------
// the player's side of the progression service

function gamesave_progress_part(array $progress): array {
    $skills = [];
    foreach ((array)($progress['skills']['player'] ?? []) as $id => $k) {
        if (!in_array($id, GAMESAVE_DESKTOP_SKILLS, true)) $skills[$id] = $k;
    }
    $out = ['skills' => (object)$skills];
    foreach (GAMESAVE_PROGRESS_KEYS as $k) $out[$k] = $progress[$k] ?? progress_blank()[$k];
    return $out;
}

// put a save's player side into the progression blob. Her skills, his desktop skills (Focus), today's caps,
// her away clock and the opt-ins stay as they are. A session running in the game (a delve) is dropped: the
// game it belonged to is gone. A desktop-only session (a focus timer) keeps running.
function gamesave_progress_apply(array $progress, array $part, array $d): array {
    $keep = [];
    foreach ((array)($progress['skills']['player'] ?? []) as $id => $k) {
        if (in_array($id, GAMESAVE_DESKTOP_SKILLS, true)) $keep[$id] = $k;
    }
    $mine = [];
    foreach ((array)($part['skills'] ?? []) as $id => $k) {
        if (!is_string($id) || in_array($id, GAMESAVE_DESKTOP_SKILLS, true) || !is_array($k)) continue;
        $mine[$id] = ['xp' => max(0, (int)($k['xp'] ?? 0)), 'marks' => max(0, min(PROGRESS_TUNE['markMax'], (int)($k['marks'] ?? 0)))];
    }
    $progress['skills']['player'] = $mine + $keep;
    $blank = progress_blank();
    foreach (GAMESAVE_PROGRESS_KEYS as $k) {
        $v = $part[$k] ?? $blank[$k];
        $progress[$k] = gettype($v) === gettype($blank[$k]) ? $v : $blank[$k];
    }
    $progress['credits'] = max(0, (int)$progress['credits']);
    if (is_array($progress['session'] ?? null)) {
        $act = $d['activities'][$progress['session']['activity'] ?? ''] ?? null;
        $trains = array_keys(array_filter((array)($act['skills']['player'] ?? [])));
        $desktopOnly = $act && $trains && !array_diff($trains, GAMESAVE_DESKTOP_SKILLS);
        if (!$desktopOnly) $progress['session'] = null;
    }
    return $progress;
}

// ---------------------------------------------------------------
// a save

// everything a save holds, from what's live now (+ the page's own parts)
function gamesave_snapshot(int $userId, array $client, int $now): array {
    $live = gamesave_live($userId);
    $b = bond_get($userId);
    return [
        'made' => $now,
        'game' => ['sections' => (object)$live['sections'], 'played' => $live['played'], 'startedAt' => $live['startedAt'] ?: $now],
        'progress' => gamesave_progress_part(progress_load($userId)),
        'client' => (object)$client,
        'bond' => ['xp' => $b['xp'], 'stage' => $b['stage']],
    ];
}

// a payload from anywhere (a file, an old row) made safe to keep or load: known shape, known sizes, nothing else
function gamesave_clean(mixed $p, array $t = GAMESAVE_TUNE): array {
    if (!is_array($p)) return ['error' => 'not_a_save'];
    $game = is_array($p['game'] ?? null) ? $p['game'] : [];
    $sections = [];
    foreach ((array)($game['sections'] ?? []) as $k => $v) {
        if (!is_string($k) || !gamesave_name_ok($k)) return ['error' => 'not_a_save', 'why' => 'section ' . $k];
        if (strlen(gamesave_json($v)) > $t['sectionMax']) return ['error' => 'too_big'];
        $sections[$k] = $v;
    }
    $client = [];
    foreach ((array)($p['client'] ?? []) as $k => $v) {
        if (!is_string($k) || !gamesave_name_ok($k)) return ['error' => 'not_a_save', 'why' => 'part ' . $k];
        if (strlen(gamesave_json($v)) > $t['sectionMax']) return ['error' => 'too_big'];
        $client[$k] = $v;
    }
    $prog = is_array($p['progress'] ?? null) ? $p['progress'] : [];
    $blank = progress_blank();
    $part = ['skills' => []];
    foreach ((array)($prog['skills'] ?? []) as $id => $k) {
        if (is_string($id) && preg_match('/^[a-z][a-z0-9_]{0,31}$/', $id) && is_array($k)) {
            $part['skills'][$id] = ['xp' => max(0, (int)($k['xp'] ?? 0)), 'marks' => max(0, (int)($k['marks'] ?? 0))];
        }
    }
    $part['skills'] = (object)$part['skills'];
    foreach (GAMESAVE_PROGRESS_KEYS as $k) {
        $v = $prog[$k] ?? $blank[$k];
        $part[$k] = gettype($v) === gettype($blank[$k]) ? $v : $blank[$k];
    }
    $part['credits'] = max(0, (int)$part['credits']);
    $bond = is_array($p['bond'] ?? null) ? $p['bond'] : [];
    $xp = max(0, (int)($bond['xp'] ?? 0));
    $out = [
        'made' => max(0, (int)($p['made'] ?? 0)),
        'game' => ['sections' => (object)$sections, 'played' => max(0, (int)($game['played'] ?? 0)), 'startedAt' => max(0, (int)($game['startedAt'] ?? 0))],
        'progress' => $part,
        'client' => (object)$client,
        'bond' => ['xp' => $xp, 'stage' => bond_stage_for($xp)],
    ];
    if (strlen(gamesave_json($out)) > $t['totalMax']) return ['error' => 'too_big'];
    return $out;
}

// what a save card shows: when, how long played, where / which chapter / difficulty if the game's sections say
// so (`_summary` in any section), the bond it was made with, his total level and Credits
function gamesave_summary(array $payload, array $t = GAMESAVE_TUNE): array {
    $s = ['playMin' => intdiv((int)($payload['game']['played'] ?? 0), 60)];
    foreach ((array)($payload['game']['sections'] ?? []) as $sec) {
        if (!is_array($sec) || !is_array($sec['_summary'] ?? null)) continue;
        foreach (['place', 'chapter', 'difficulty', 'note'] as $k) {
            if (!isset($s[$k]) && is_string($sec['_summary'][$k] ?? null) && trim($sec['_summary'][$k]) !== '') {
                $s[$k] = gamesave_clip($sec['_summary'][$k], $t['summaryMax']);
            }
        }
    }
    $stage = (int)($payload['bond']['stage'] ?? 1);
    $s['bondStage'] = $stage;
    $s['bondName'] = BOND_STAGES[$stage]['name'] ?? 'Stranger';
    $total = 0;
    foreach ((array)($payload['progress']['skills'] ?? []) as $k) $total += progress_level((int)($k['xp'] ?? 0))['level'];
    $s['skillLevels'] = $total;
    $s['credits'] = (int)($payload['progress']['credits'] ?? 0);
    $s['items'] = array_sum(array_map('intval', array_filter((array)($payload['progress']['items'] ?? []), 'is_numeric')));
    $s['keepsakes'] = count((array)($payload['progress']['keepsakes'] ?? []));
    return $s;
}

function gamesave_row_view(array $r): array {
    $sum = json_decode((string)$r['summary'], true);
    return ['id' => (int)$r['id'], 'kind' => (string)$r['kind'], 'name' => (string)$r['name'], 'created' => (int)$r['created_at'],
        'played' => (int)$r['play_seconds'], 'bytes' => (int)$r['bytes'], 'summary' => is_array($sum) ? $sum : []];
}

function gamesave_list(int $userId): array {
    $st = db()->prepare('SELECT id, kind, name, created_at, play_seconds, summary, bytes FROM game_saves WHERE user_id = ?
        ORDER BY created_at DESC, id DESC');
    $st->execute([$userId]);
    $rows = array_map('gamesave_row_view', $st->fetchAll());
    $st->closeCursor();
    return $rows;
}

function gamesave_get(int $userId, int $id): ?array {
    $st = db()->prepare('SELECT * FROM game_saves WHERE user_id = ? AND id = ?');
    $st->execute([$userId, $id]);
    $r = $st->fetch();
    $st->closeCursor();
    if (!$r) return null;
    $payload = gamesave_clean(json_decode((string)$r['data'], true));
    return gamesave_row_view($r) + ['payload' => isset($payload['error']) ? null : $payload];
}

function gamesave_count(int $userId, string $kind): int {
    $st = db()->prepare('SELECT COUNT(*) FROM game_saves WHERE user_id = ? AND kind = ?');
    $st->execute([$userId, $kind]);
    $n = (int)$st->fetchColumn();
    $st->closeCursor();
    return $n;
}

// keep only the newest $keep of a kind; $spare is never removed (the save "Undo last load" points at)
function gamesave_rotate(int $userId, string $kind, int $keep, ?int $spare = null): void {
    $st = db()->prepare('SELECT id FROM game_saves WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, id DESC');
    $st->execute([$userId, $kind]);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $st->closeCursor();
    $del = db()->prepare('DELETE FROM game_saves WHERE user_id = ? AND id = ?');
    foreach (array_slice($ids, $keep) as $id) if ($id !== $spare) $del->execute([$userId, $id]);
}

// keep a payload in a slot. quick replaces the one quicksave; auto and before_load rotate; named has a limit.
function gamesave_store(int $userId, string $kind, string $name, array $payload, int $now, array $t = GAMESAVE_TUNE, array $extra = []): array {
    if (!in_array($kind, GAMESAVE_KINDS, true)) return ['error' => 'bad_kind'];
    $name = gamesave_clip($name, $t['nameMax']);
    if ($name === '') $name = GAMESAVE_KIND_NAMES[$kind];
    if ($kind === 'named' && gamesave_count($userId, 'named') >= $t['namedMax']) return ['error' => 'full'];
    $json = gamesave_json($payload);
    if (strlen($json) > $t['totalMax']) return ['error' => 'too_big'];
    $summary = gamesave_summary($payload, $t) + $extra;
    $db = db();
    $own = !$db->inTransaction();
    if ($own) $db->beginTransaction();
    try {
        if ($kind === 'quick') $db->prepare("DELETE FROM game_saves WHERE user_id = ? AND kind = 'quick'")->execute([$userId]);
        $db->prepare('INSERT INTO game_saves (user_id, kind, name, created_at, play_seconds, summary, data, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$userId, $kind, $name, $now, (int)$payload['game']['played'], gamesave_json($summary), $json, strlen($json)]);
        $id = (int)$db->lastInsertId();
        if ($kind === 'auto') gamesave_rotate($userId, 'auto', $t['autoKeep']);
        if ($kind === 'before_load') gamesave_rotate($userId, 'before_load', $t['beforeKeep'], $id);
        if ($own) $db->commit();
        return ['ok' => true, 'id' => $id];
    } catch (Throwable $e) {
        if ($own && $db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

// save what's live now. An autosave is skipped (not an error) if the last one is younger than `autoGapSec`,
// unless $force (a story beat that must be kept).
function gamesave_save(int $userId, string $kind, string $name, array $client, int $now, bool $force = false, array $t = GAMESAVE_TUNE): array {
    if ($kind === 'before_load') return ['error' => 'bad_kind'];
    $c = gamesave_clean(['client' => $client, 'game' => [], 'progress' => []], $t);
    if (isset($c['error'])) return $c;
    if ($kind === 'auto' && !$force) {
        $st = db()->prepare("SELECT MAX(created_at) FROM game_saves WHERE user_id = ? AND kind = 'auto'");
        $st->execute([$userId]);
        $lastAt = (int)$st->fetchColumn();
        $st->closeCursor();
        if ($lastAt && $now - $lastAt < $t['autoGapSec']) return ['ok' => true, 'skipped' => 'too_soon'];
    }
    $payload = gamesave_snapshot($userId, (array)$c['client'], $now);
    return gamesave_store($userId, $kind, $name, $payload, $now, $t);
}

// put a payload live. Returns the client parts for the page to put back. The bond only if $useBond.
function gamesave_apply(int $userId, array $payload, bool $useBond, int $now): array {
    $live = gamesave_live($userId);
    $live['sections'] = (array)$payload['game']['sections'];
    $live['played'] = (int)$payload['game']['played'];
    $live['startedAt'] = (int)$payload['game']['startedAt'] ?: $now;
    $live['tickAt'] = 0;
    $live['epoch']++;
    $live['rev']++;
    gamesave_live_write($userId, $live, $now);
    $prog = gamesave_progress_apply(progress_load($userId), (array)$payload['progress'], progress_data());
    progress_save($userId, $prog);
    $bond = null;
    if ($useBond) $bond = bond_set($userId, (int)$payload['bond']['xp'], 'save', $now);
    return ['client' => $payload['client'], 'epoch' => $live['epoch'], 'bond' => $bond];
}

// load a slot: first a "before load" save of what's live now (with the bond as it is now and the page's parts),
// then the slot goes live. `lastLoad` remembers both, so "Undo last load" can put everything back.
function gamesave_load(int $userId, int $id, bool $useBond, array $client, int $now, ?string $beforeName = null): array {
    $row = gamesave_get($userId, $id);
    if (!$row) return ['error' => 'gone'];
    if (!$row['payload']) return ['error' => 'damaged'];
    $c = gamesave_clean(['client' => $client]);
    if (isset($c['error'])) return $c;
    $db = db();
    $db->beginTransaction();
    try {
        $before = gamesave_store($userId, 'before_load', $beforeName ?? ('Before loading "' . $row['name'] . '"'), gamesave_snapshot($userId, (array)$c['client'], $now), $now,
            GAMESAVE_TUNE, ['usedBond' => $useBond]);
        if (isset($before['error'])) { $db->rollBack(); return $before; }
        $r = gamesave_apply($userId, $row['payload'], $useBond, $now);
        $live = gamesave_live($userId);
        $live['lastLoad'] = ['before' => $before['id'], 'loaded' => $id, 'name' => $row['name'], 'usedBond' => $useBond, 'at' => $now];
        gamesave_live_write($userId, $live, $now);
        $db->commit();
        return $r + ['ok' => true, 'loaded' => $id, 'before' => $before['id']];
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

// "Undo last load": load the save made right before it, with the bond only if that load changed the bond.
// Undoing twice is "redo" (the undo made its own before-load save).
function gamesave_undo(int $userId, array $client, int $now): array {
    $last = gamesave_live($userId)['lastLoad'];
    if (empty($last['before'])) return ['error' => 'nothing_to_undo'];
    $r = gamesave_load($userId, (int)$last['before'], !empty($last['usedBond']), $client, $now, 'Before undoing');
    if (!isset($r['error'])) {
        $live = gamesave_live($userId);
        $live['lastLoad']['undid'] = $last['name'] ?? '';
        gamesave_live_write($userId, $live, $now);
    }
    return $r;
}

// a new game: everything the game holds back to the start (a before-load save first). The bond, her and
// desktop Jun are untouched: she's shared by every game.
function gamesave_new_game(int $userId, array $client, int $now): array {
    $blank = gamesave_clean(['made' => $now, 'game' => ['startedAt' => $now], 'progress' => [], 'client' => [], 'bond' => ['xp' => 0]]);
    $c = gamesave_clean(['client' => $client]);
    if (isset($c['error'])) return $c;
    $db = db();
    $db->beginTransaction();
    try {
        $before = gamesave_store($userId, 'before_load', 'Before a new game', gamesave_snapshot($userId, (array)$c['client'], $now), $now,
            GAMESAVE_TUNE, ['usedBond' => false]);
        $r = gamesave_apply($userId, $blank, false, $now);
        $live = gamesave_live($userId);
        $live['lastLoad'] = ['before' => $before['id'], 'loaded' => null, 'name' => 'a new game', 'usedBond' => false, 'at' => $now];
        gamesave_live_write($userId, $live, $now);
        $db->commit();
        return $r + ['ok' => true, 'before' => $before['id'], 'newGame' => true];
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function gamesave_rename(int $userId, int $id, string $name, array $t = GAMESAVE_TUNE): array {
    $name = gamesave_clip($name, $t['nameMax']);
    if ($name === '') return ['error' => 'no_name'];
    $st = db()->prepare('UPDATE game_saves SET name = ? WHERE user_id = ? AND id = ?');
    $st->execute([$name, $userId, $id]);
    return $st->rowCount() ? ['ok' => true] : ['error' => 'gone'];
}

// keep this one: an autosave, quicksave or before-load save becomes a named save (never removed on its own)
function gamesave_keep(int $userId, int $id, array $t = GAMESAVE_TUNE): array {
    $row = gamesave_get($userId, $id);
    if (!$row) return ['error' => 'gone'];
    if ($row['kind'] === 'named') return ['ok' => true];
    if (gamesave_count($userId, 'named') >= $t['namedMax']) return ['error' => 'full'];
    db()->prepare("UPDATE game_saves SET kind = 'named' WHERE user_id = ? AND id = ?")->execute([$userId, $id]);
    return ['ok' => true];
}

function gamesave_delete(int $userId, int $id): array {
    $live = gamesave_live($userId);
    $st = db()->prepare('DELETE FROM game_saves WHERE user_id = ? AND id = ?');
    $st->execute([$userId, $id]);
    if (!$st->rowCount()) return ['error' => 'gone'];
    if ((int)($live['lastLoad']['before'] ?? 0) === $id) {
        $live['lastLoad'] = null;
        gamesave_live_write($userId, $live, time());
    }
    return ['ok' => true];
}

// ---------------------------------------------------------------
// files (.jungame)

// a stable fingerprint of a payload, whatever order its keys come in
function gamesave_sum(array $payload): string {
    $sort = function ($v) use (&$sort) {
        if (!is_array($v)) return $v;
        if (array_is_list($v)) return array_map($sort, $v);
        ksort($v, SORT_STRING);
        return array_map($sort, $v);
    };
    return hash('sha256', gamesave_json($sort(json_decode(gamesave_json($payload), true))));
}

function gamesave_export(int $userId, int $id): array {
    $row = gamesave_get($userId, $id);
    if (!$row) return ['error' => 'gone'];
    if (!$row['payload']) return ['error' => 'damaged'];
    return ['format' => GAMESAVE_FORMAT, 'v' => GAMESAVE_V, 'app' => 'Jun OS', 'name' => $row['name'], 'kind' => $row['kind'],
        'saved' => $row['created'], 'summary' => $row['summary'], 'sum' => gamesave_sum($row['payload']), 'payload' => $row['payload']];
}

// a file from anywhere: checked, cleaned, kept as a NEW named save. Never loaded on its own.
function gamesave_import(int $userId, mixed $file, int $now, array $t = GAMESAVE_TUNE): array {
    if (!is_array($file) || ($file['format'] ?? '') !== GAMESAVE_FORMAT) return ['error' => 'not_a_save'];
    if ((int)($file['v'] ?? 0) > GAMESAVE_V) return ['error' => 'newer'];
    if (!is_array($file['payload'] ?? null)) return ['error' => 'not_a_save'];
    if (!is_string($file['sum'] ?? null) || !hash_equals(gamesave_sum($file['payload']), $file['sum'])) return ['error' => 'damaged'];
    $payload = gamesave_clean($file['payload'], $t);
    if (isset($payload['error'])) return $payload;
    $name = gamesave_clip((string)($file['name'] ?? ''), $t['nameMax'] - 12);
    return gamesave_store($userId, 'named', ($name !== '' ? $name : 'A save') . ' (imported)', $payload, $now, $t,
        ['imported' => true, 'savedAt' => max(0, (int)($file['saved'] ?? 0))]);
}

// what a page shows: the live game (without its sections), every slot, the limits, the bond now
function gamesave_view(int $userId): array {
    $b = bond_get($userId);
    return ['live' => gamesave_live_view(gamesave_live($userId)), 'saves' => gamesave_list($userId),
        'limits' => ['autoKeep' => GAMESAVE_TUNE['autoKeep'], 'beforeKeep' => GAMESAVE_TUNE['beforeKeep'], 'namedMax' => GAMESAVE_TUNE['namedMax']],
        'bond' => ['stage' => $b['stage'], 'name' => $b['name']]];
}
