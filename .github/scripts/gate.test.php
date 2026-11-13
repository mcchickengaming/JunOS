<?php
// usage: php .github/scripts/gate.test.php
// the one consent + ratings gate (lib/gate.php): the shared cases (same as the js gate),
// the hard flavor locks, his comfort settings (18+ needs a confirmation), the registry
// reader, and the line her prompt gets.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-gate-' . getmypid();
mkdir("$tmp/lib", 0700, true);
mkdir("$tmp/migrations");
foreach (['env.php', 'http.php', 'db.php', 'gate.php'] as $f) copy("$repo/lib/$f", "$tmp/lib/$f");
foreach (glob("$repo/migrations/*.sql") as $f) copy($f, "$tmp/migrations/" . basename($f));
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$tmp/lib/env.php";
require "$tmp/lib/http.php";
require "$tmp/lib/db.php";
require "$tmp/lib/gate.php";
if (!function_exists('log_event')) { function log_event(array $e): void { echo '  log: ' . json_encode($e) . "\n"; } }

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};

echo "shared cases\n";
$cases = json_decode(file_get_contents(__DIR__ . '/gate-cases.json'), true)['cases'];
foreach ($cases as $c) {
    $r = gate_check($c['item'], $c['ctx']);
    $eq($c['name'], [$r['show'], $r['her'], $r['why']], [$c['show'], $c['her'], $c['why']]);
}

echo "tagging\n";
$eq('platonic can\'t tag flirty', gate_can_tag('platonic', 'flirty'), false);
$eq('platonic can\'t tag 18+', gate_can_tag('platonic', 'adult'), false);
$eq('romantic can tag 18+', gate_can_tag('romantic', 'adult'), true);
$eq('siblings can tag flirty (owner\'s makers)', gate_can_tag('siblings', 'flirty'), true);
$eq('unknown flavor can\'t tag rated', gate_can_tag('???', 'flirty'), false);
$eq('anyone can tag everyday', gate_can_tag('platonic', 'everyday'), true);

echo "comfort settings\n";
db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
$eq('defaults', comfort_get(1), GATE_DEFAULTS);
$eq('18+ needs a confirmation', comfort_set(1, ['adult' => true]), ['error' => 'confirm_adult']);
$eq('still off', comfort_get(1)['adult'], false);
$r = comfort_set(1, ['adult' => true, 'confirmAdult' => true]);
$eq('confirmed: on', [$r['adult'], $r['adultConfirmed']], [true, true]);
comfort_set(1, ['adult' => false]);
$r = comfort_set(1, ['adult' => true]);
$eq('confirmed once is enough', $r['adult'], true);
$eq('bad flavor refused', comfort_set(1, ['flavor' => 'boss']), ['error' => 'invalid_flavor']);
$eq('bad value refused', comfort_set(1, ['flirty' => 'yes']), ['error' => 'invalid_value']);
$eq('unknown key refused', comfort_set(1, ['adultConfirmed' => false, 'nope' => true]), ['error' => 'unknown_setting']);
$eq('adultConfirmed can\'t be set by hand', comfort_set(1, ['adultConfirmed' => false])['adultConfirmed'], true);
$r = comfort_set(1, ['flavor' => 'platonic']);
$eq('platonic stored', $r['flavor'], 'platonic');
$eq('platonic + 18+ on: still locked', gate_check(['tier' => 'adult'], ['comfort' => $r, 'mode' => 'windowed'])['why'], 'flavor_lock');

echo "her prompt\n";
$eq('platonic line', str_contains(comfort_context(1), 'best friends'), true);
comfort_set(1, ['flavor' => 'romantic']);
$eq('romantic + flirty on: nothing', comfort_context(1), '');
comfort_set(1, ['flirty' => false]);
$eq('flirty off line', str_contains(comfort_context(1), 'not flirty'), true);
comfort_set(1, ['flavor' => 'platonic']);
$ctx = comfort_context(1);
$eq('no double flirty line for a locked flavor', str_contains($ctx, 'Keep it sweet'), false);
$eq('a removed flavor is refused', comfort_set(1, ['flavor' => 'parent_daughter']), ['error' => 'invalid_flavor']);

echo "registry\n";
features_registry(__DIR__ . '/../../webapp/data/features.json');
$eq('thigh rub is flirty', feature_tier('thigh_rub'), 'flirty');
$eq('thigh squish is everyday', feature_tier('thigh_squish'), 'everyday');
$eq('headpat is everyday', feature_tier('headpat'), 'everyday');
$eq('unknown feature = strictest', feature_tier('no_such_thing'), 'adult');

exec('rm -rf ' . escapeshellarg($tmp));
echo $fails ? "\n$fails FAILED\n" : "\nall good\n";
exit($fails ? 1 : 0);
