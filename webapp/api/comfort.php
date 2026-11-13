<?php
// Comfort & ratings (lib/gate.php): what you are to each other, Flirty, 18+.
// GET → the settings. PUT {flavor?, flavorLock?, flirty?, adult?, adultOutside?, siblingsRated?, confirmAdult?}
// → the new settings. Turning 18+ on the first time needs confirmAdult: true.
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_user();
rate_limit('comfort', 60, 60);
$userId = (int)$user['id'];

if (require_method('GET', 'PUT') === 'GET') json_out(comfort_get($userId));

$r = comfort_set($userId, read_json_body(2048));
if (isset($r['error'])) fail(400, $r['error']);
json_out($r);
