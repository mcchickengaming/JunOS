<?php
// Game saves (#35 a, lib/gamesave.php): the game's own progress in slots. Desktop Jun is never in a save.
// GET                     → { live (no sections), saves, limits, bond }
// GET ?section=name       → { data, epoch, rev }   one section of the live game (a game system's own)
// POST {action, ...}:
//   save    {kind: named|quick|auto, name?, client?, force?}   save what's live now (+ the page's own parts)
//   load    {id, useBond?, client?}   a "before load" save first, then the slot goes live → { client, epoch, bond }
//   undo    {client?}                  load the save made right before the last load (again = redo)
//   new     {client?}                  a new game (a "before load" save first; the bond is untouched)
//   keep    {id}                       an autosave / quicksave / before-load save becomes a named save
//   rename  {id, name}   delete {id}
//   export  {id}                       → the .jungame file's content
//   import  {file}                     a file becomes a NEW named save (never loaded on its own)
//   put     {sections: {name: data|null}, epoch?}   write sections of the live game (null removes one)
//   tick    {seconds}                  the play clock (the server counts no more than real time)
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('gamesave', 240, 60);
$userId = (int)$user['id'];
$now = time();

if (!gamesave_enabled()) fail(404, 'off');

if (require_method('GET', 'POST') === 'GET') {
    if (isset($_GET['section'])) {
        $name = (string)$_GET['section'];
        if (!gamesave_name_ok($name)) fail(400, 'bad_name');
        $live = gamesave_live($userId);
        json_out(['data' => $live['sections'][$name] ?? null, 'epoch' => $live['epoch'], 'rev' => $live['rev']]);
    }
    json_out(gamesave_view($userId));
}

$body = read_json_body(GAMESAVE_TUNE['totalMax'] * 2 + 65536);
$action = (string)($body['action'] ?? '');
$client = is_array($body['client'] ?? null) ? $body['client'] : [];
$id = (int)($body['id'] ?? 0);

$r = match ($action) {
    'save' => gamesave_save($userId, (string)($body['kind'] ?? 'named'), (string)($body['name'] ?? ''), $client, $now, !empty($body['force'])),
    'load' => gamesave_load($userId, $id, ($body['useBond'] ?? false) === true, $client, $now),
    'undo' => gamesave_undo($userId, $client, $now),
    'new' => gamesave_new_game($userId, $client, $now),
    'keep' => gamesave_keep($userId, $id),
    'rename' => gamesave_rename($userId, $id, (string)($body['name'] ?? '')),
    'delete' => gamesave_delete($userId, $id),
    'export' => gamesave_export($userId, $id),
    'import' => gamesave_import($userId, $body['file'] ?? null, $now),
    'put' => game_sections_put($userId, is_array($body['sections'] ?? null) ? $body['sections'] : [],
        isset($body['epoch']) ? (int)$body['epoch'] : null, $now),
    'tick' => ['ok' => true, 'played' => gamesave_tick($userId, (int)($body['seconds'] ?? 0), $now)],
    default => ['error' => 'unknown_action'],
};
if (isset($r['error'])) {
    // the page can always say it in plain words, so the reason rides along
    $code = $r['error'] === 'gone' ? 404 : ($r['error'] === 'reloaded' ? 409 : 400);
    json_out($r + ['view' => in_array($action, ['put', 'tick', 'export'], true) ? null : gamesave_view($userId)], $code);
}
if ($action === 'export') json_out(['file' => $r]);
json_out(['result' => $r, 'view' => in_array($action, ['put', 'tick'], true) ? null : gamesave_view($userId)]);
