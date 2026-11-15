<?php
// Items, currencies and keepsakes (#9 base, lib/inventory.php): what the player owns in the game.
// GET                                  → { view: currencies, kinds of items, keepsakes }
// POST {action: 'can',   cost}         → { ok, missing }   would this cost be covered? (nothing changes)
// POST {action: 'spend', cost, why}    → { ok, spent } | { error: 'not_enough', missing } | { error: 'keepsake' }
// A cost is { currencies: { id: n }, items: { id: n } }. Nothing here ever GIVES: things come from the progression
// service (activities, story grants by id). Spending only ever takes, so a page can't give itself anything.
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('inventory', 120, 60);
$userId = (int)$user['id'];
$d = inventory_data();

if (require_method('GET', 'POST') === 'GET') {
    json_out(['view' => inventory_view(progress_load($userId), $d)]);
}

$body = read_json_body(16384);
$action = (string)($body['action'] ?? '');
$state = progress_load($userId);

if ($action === 'can') {
    $c = inventory_clean_cost($body['cost'] ?? null, $d);
    if (isset($c['error'])) fail(400, $c['error']);
    $miss = inventory_missing($state, $c);
    json_out(['ok' => !$miss, 'missing' => $miss ?: null, 'words' => inventory_words($c, $d)]);
}
if ($action === 'spend') {
    $r = inventory_take($state, $body['cost'] ?? null, $d, (string)($body['why'] ?? ''), time());
    if (isset($r['error'])) json_out($r + ['view' => inventory_view($state, $d)], $r['error'] === 'not_enough' ? 409 : 400);
    progress_save($userId, $state);
    json_out($r + ['view' => inventory_view($state, $d)]);
}
fail(400, 'unknown_action');
