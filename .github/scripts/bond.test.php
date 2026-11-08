<?php
// usage: php .github/scripts/bond.test.php
// bond xp, stages, the daily cap and the pending stage-up, against a
// throwaway sqlite in a temp dir.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-bond-' . getmypid();
mkdir("$tmp/lib", 0700, true);
mkdir("$tmp/migrations");
foreach (['env.php', 'http.php', 'db.php', 'relationship.php', 'bond.php'] as $f) copy("$repo/lib/$f", "$tmp/lib/$f");
foreach (glob("$repo/migrations/*.sql") as $f) copy($f, "$tmp/migrations/" . basename($f));
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$tmp/lib/env.php";
require "$tmp/lib/http.php";
require "$tmp/lib/db.php";
require "$tmp/lib/relationship.php";
require "$tmp/lib/bond.php";

// the rest of the app, as far as bond needs it
$notes = [];
if (!function_exists('log_event')) { function log_event(array $e): void {} }
function memory_note_add(int $u, string $c, string $t): array { global $notes; $notes[] = [$c, $t]; return ['ok' => true]; }
function ach_on_relationship(...$a): void {}

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};

db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
$u = 1;

$b = bond_get($u);
$eq('starts a stranger', [$b['stage'], $b['name'], $b['xp']], [1, 'Stranger', 0]);

$eq('stage thresholds', [bond_stage_for(0), bond_stage_for(149), bond_stage_for(150), bond_stage_for(5000)], [1, 1, 2, 6]);
$eq('short message', bond_xp_for_message('hi'), BOND_XP_MESSAGE);
$eq('long message earns more', bond_xp_for_message(str_repeat('a', 130)), BOND_XP_MESSAGE + BOND_XP_LONG_MESSAGE);
$eq('mood rise is capped', bond_xp_for_mood(['affection' => 50, 'trust' => 50], ['affection' => 60, 'trust' => 60]), BOND_XP_MOOD_MAX);
$eq('a bad turn costs nothing', bond_xp_for_mood(['affection' => 50, 'trust' => 50], ['affection' => 40, 'trust' => 45]), 0);

bond_award($u, 3, 'message');
$b = bond_get($u);
$eq('first of the day adds the came-back bonus', $b['xp'], 3 + BOND_XP_FIRST_TODAY);

$reached = null;
for ($i = 0; $i < 60 && $reached === null; $i++) $reached = bond_award($u, 5, 'message');
$b = bond_get($u);
$eq('reaches Familiar', [$reached, $b['stage'], $b['name']], [2, 2, 'Familiar']);
$eq('stage-up is pending', $b['pending_stage'], 2);
$eq('stage-up is in her prompt', str_contains(bond_context($u), 'This moment'), true);
$eq('stage-up became a memory', count($notes), 1);
$eq('and a history event', (int)db()->query("SELECT COUNT(*) FROM relationship_history WHERE event='bond:2'")->fetchColumn(), 1);

bond_clear_pending($u);
$eq('pending clears after her reply', bond_get($u)['pending_stage'], null);
$eq('prompt drops the moment', str_contains(bond_context($u), 'This moment'), false);

for ($i = 0; $i < 200; $i++) bond_award($u, 5, 'message');
$eq('daily cap holds', bond_get($u)['day_xp'], bond_daily_cap());

db()->exec("UPDATE bond SET day='2000-01-01' WHERE user_id=1");
$before = bond_get($u)['xp'];
bond_award($u, 5, 'message');
$eq('a new day resets the cap', bond_get($u)['xp'], $before + 5 + BOND_XP_FIRST_TODAY);

relationship_set($u, ['affection' => 90, 'trust' => 90, 'tension' => 10]);
$g = relationship_get($u);
$eq('feelings capped by the bond', [$g['affection'], $g['trust'], $g['tension']], [bond_ceiling(2), bond_ceiling(2), 10]);
$eq('ceilings rise with the stage', [bond_ceiling(1), bond_ceiling(3), bond_ceiling(6)], [35, 65, 100]);
$eq('early stages: not his girlfriend yet', str_contains(bond_context($u), "you are not there yet"), true);

putenv('BOND_STAGES=off');
$eq('off: nothing awarded', bond_award($u, 5, 'message'), null);
$eq('off: no prompt block', bond_context($u), '');

exec('rm -rf ' . escapeshellarg($tmp));
echo $fails ? "bond: $fails failed\n" : "bond: ok\n";
exit($fails ? 1 : 0);
