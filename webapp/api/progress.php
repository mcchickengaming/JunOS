<?php
// The progression service (lib/progress.php): skills for her and the player.
// GET [?peek=1 = only look] → what a page shows (both owners' skills, Credits, buffs, jobs, the running session) + the
//       data's names. Her away practice and anything he set going are settled first.
// POST {action, ...}:
//   begin   {activity, together?}        start a session; her server keeps the clock
//   finish  {quality?, minutes?, worn?}  end it: xp for the real minutes, rewards, level-ups
//   cancel                               drop the session, nothing gained, nothing lost
//   going   {activity}                   set something going (a drone expedition); collected on GET
//   master  {owner, skill}               Mastery: start a top-level skill over for a mark
//   story   {id}                         a story event's grant, once
//   opt     {focus: bool}                the Focus skill is opt-in
//   sim     {activity, hours, together?, seed?, tune?}   the lab's time-lapse; nothing is saved
//   curve   {tune?}                      the curve as a table, for the lab
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('progress', 120, 60);
$userId = (int)$user['id'];
$d = progress_data();
$now = time();
$rnd = progress_rnd();

$names = fn() => [
    'skills' => array_map(fn($s) => ['name' => $s['name'], 'line' => $s['line'] ?? '', 'owners' => $s['owners'], 'optIn' => !empty($s['optIn'])], $d['skills']),
    'activities' => array_map(fn($a) => ['name' => $a['name'], 'minutes' => $a['minutes'], 'together' => !empty($a['together']),
        'setGoing' => !empty($a['setGoing']), 'away' => !empty($a['away']), 'needsOpt' => $a['needsOpt'] ?? null, 'sample' => !empty($a['sample'])], $d['activities']),
    'story' => array_map(fn($s) => ['name' => $s['name'], 'from' => $s['from']], $d['story']),
];

if (require_method('GET', 'POST') === 'GET') {
    $state = progress_load($userId);
    // ?peek=1: only look (the lab with skills switched off)
    if (isset($_GET['peek'])) json_out(['state' => progress_view($state, $d, $now), 'away' => null, 'collected' => [], 'data' => $names(), 'tune' => PROGRESS_TUNE]);
    $away = progress_away($state, $d, $now, $rnd);
    $done = progress_collect($state, $d, $now, $rnd);
    progress_save($userId, $state);
    json_out(['state' => progress_view($state, $d, $now), 'away' => $away, 'collected' => $done, 'data' => $names(), 'tune' => PROGRESS_TUNE]);
}

$body = read_json_body(8192);
$action = (string)($body['action'] ?? '');
$tune = progress_tune(is_array($body['tune'] ?? null) ? $body['tune'] : []);

if ($action === 'sim') {
    $hours = max(0.5, min(1000.0, (float)($body['hours'] ?? 100)));
    $r = progress_simulate($d, (string)($body['activity'] ?? ''), $hours,
        ['together' => !empty($body['together']), 'seed' => (int)($body['seed'] ?? 1)], $tune);
    if (isset($r['error'])) fail(400, $r['error']);
    json_out($r);
}
if ($action === 'curve') json_out(['curve' => progress_curve($tune)]);

$state = progress_load($userId);
$tz = max(-840, min(840, (int)($body['tz'] ?? 0)));
$r = match ($action) {
    'begin' => progress_begin($state, $d, (string)($body['activity'] ?? ''), !empty($body['together']), $now),
    'finish' => progress_finish($state, $d, ['quality' => $body['quality'] ?? 0.5, 'minutes' => $body['minutes'] ?? null,
        'worn' => array_slice(array_filter((array)($body['worn'] ?? []), 'is_string'), 0, 40), 'day' => gmdate('Y-m-d', $now + $tz * 60)], $now, $rnd),
    'cancel' => (function () use (&$state) { $state['session'] = null; return ['ok' => true]; })(),
    'going' => progress_set_going($state, $d, (string)($body['activity'] ?? ''), $now),
    'master' => progress_master($state, $d, (string)($body['owner'] ?? ''), (string)($body['skill'] ?? ''), $now),
    'story' => progress_story($state, $d, (string)($body['id'] ?? ''), $now),
    'opt' => (function () use (&$state, $body) { if (is_bool($body['focus'] ?? null)) $state['opt']['focus'] = $body['focus']; return ['ok' => true]; })(),
    default => ['error' => 'unknown_action'],
};
if (isset($r['error'])) fail(400, $r['error']);
progress_save($userId, $state);
json_out(['result' => $r, 'state' => progress_view($state, $d, $now)]);
