<?php
// his touches (lib/touch.php). POST a batch from her desktop or her
// window, GET today's in words for Settings > Memory, DELETE to make
// her forget today's.
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('touch', 120, 60);
$userId = (int)$user['id'];
$method = require_method('GET', 'POST', 'DELETE');
$tz = isset($_GET['tz']) && is_numeric($_GET['tz']) ? max(-840, min(840, (int)$_GET['tz'])) : 0;

if ($method === 'GET') json_out(touch_today_summary($userId, $tz) + ['enabled' => touch_enabled()]);

if ($method === 'DELETE') {
    touch_forget_day($userId, $tz);
    json_out(['ok' => true]);
}

$body = read_json_body(8192);
$tz = isset($body['tz']) && is_int($body['tz']) ? max(-840, min(840, $body['tz'])) : $tz;
touch_record($userId, $body['touches'] ?? [], $tz);
json_out(['ok' => true]);
