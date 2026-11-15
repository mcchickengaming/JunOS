<?php
// The debug menu's spawn tools (lib/debug.php). Test mode has to be on to spawn or clear; everything is logged.
// GET                                   → { test, catalog, recent, view }
// POST {action: 'test', on}             test mode on / off (what you spawned stays)
// POST {action: 'spawn', id, amount}    a currency (amount), an item (count) or a keepsake (one) from data/items.json
// POST {action: 'clear'}                the game's money and things back to nothing (test mode only)
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('debug', 240, 60);
$userId = (int)$user['id'];
$d = inventory_data();
$now = time();

$answer = function (array $state, array $extra = []) use ($d): void {
    json_out($extra + ['test' => debug_test_on($state), 'catalog' => debug_catalog($d), 'recent' => debug_recent($state), 'view' => inventory_view($state, $d)]);
};

if (require_method('GET', 'POST') === 'GET') $answer(progress_load($userId));

$body = read_json_body(4096);
$state = progress_load($userId);
$r = match ((string)($body['action'] ?? '')) {
    'test' => (function () use (&$state, $body, $now) { debug_set_test($state, ($body['on'] ?? false) === true, $now); return ['ok' => true]; })(),
    'spawn' => debug_spawn($state, $d, (string)($body['id'] ?? ''), (int)($body['amount'] ?? 1), $now),
    'clear' => debug_clear($state, $now),
    default => ['error' => 'unknown_action'],
};
if (isset($r['error'])) json_out($r + ['test' => debug_test_on($state)], $r['error'] === 'test_off' ? 409 : 400);
progress_save($userId, $state);
$answer($state, ['result' => $r]);
