<?php
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('relationship', 60, 60);
$userId = (int)$user['id'];

$method = require_method('GET', 'PUT', 'POST');
if ($method === 'GET') {
    json_out(($_GET['action'] ?? '') === 'history' ? relationship_history($userId)
        : relationship_get($userId) + ['bond' => bond_get($userId), 'quirks' => quirks_client($userId)]);
}

// Settings > Memory > Set the bond by hand (behind More, Nov 15): {action: 'bond', stage: 1..6}. A stage, never a
// number to type; quiet (bond_set): no stage-up moment, and she only feels the shift softly for a day.
if ($method === 'POST') {
    $body = read_json_body(512);
    if (($body['action'] ?? '') !== 'bond' || !is_int($body['stage'] ?? null)) fail(400, 'invalid_request');
    $stage = $body['stage'];
    if ($stage < 1 || $stage > count(BOND_STAGES)) fail(400, 'invalid_request');
    $now = bond_get($userId);
    json_out(['bond' => $now['stage'] === $stage ? $now : bond_set($userId, bond_xp_of_stage($stage), 'hand')]);
}

require_admin();
$body = read_json_body(1024);
$values = [];
foreach (['affection', 'trust', 'tension'] as $k) {
    if (!isset($body[$k]) || !is_numeric($body[$k])) fail(400, 'invalid_request');
    $values[$k] = (int)$body[$k];
}
relationship_set($userId, $values);
json_out(relationship_get($userId));
