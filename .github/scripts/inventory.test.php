<?php
// usage: php .github/scripts/inventory.test.php
// items, currencies and keepsakes (#9 base, lib/inventory.php): the catalog covers everything the progression service
// can give; keepsakes are one of each and never spent; a spend is all or nothing and says what's missing; currency
// drops and grants land in the wallet; a game save carries the wallet; a file can't smuggle negative counts.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-inventory-' . getmypid();
mkdir($tmp, 0700, true);
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$repo/lib/env.php";
require "$repo/lib/http.php";
require "$repo/lib/db.php";
require "$repo/lib/relationship.php";
require "$repo/lib/bond.php";
require "$repo/lib/progress.php";
require "$repo/lib/gamesave.php";
require "$repo/lib/inventory.php";
if (!function_exists('log_event')) { function log_event(array $e): void {} }
function memory_note_add(int $u, string $c, string $t): array { return ['ok' => true]; }
function ach_on_relationship(...$a): void {}

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};
$ok = fn(string $name, $cond) => $eq($name, (bool)$cond, true);
$d = inventory_data();
$p = progress_data();
$now = 1800000000;

// --- the catalog
$eq('the catalog keeps its rules and covers everything the progression service gives', inventory_validate($d, $p), []);
$eq('the five currencies', array_keys($d['currencies']), INVENTORY_CURRENCY_IDS);
$bad = $p; $bad['pools']['common'][] = ['id' => 'mystery_box', 'kind' => 'item', 'size' => 'small', 'w' => 1];
$ok('a new drop without an entry is caught', preg_grep('/mystery_box needs an item entry/', inventory_validate($d, $bad)));
$bad = $p; $bad['story']['x'] = ['name' => 'x', 'from' => 'x', 'give' => [['id' => 'part_common', 'kind' => 'keepsake']]];
$ok('an item handed out as a keepsake is caught', preg_grep('/needs a keepsake entry/', inventory_validate($d, $bad)));
$bd = $d; $bd['items']['generals_medal']['sell'] = true;
$ok('a keepsake can never be sellable', preg_grep('/can\'t be sold/', inventory_validate($bd, $p)));
foreach ($d['items'] as $id => $it) if ($it['kind'] === 'keepsake') $ok("keepsake $id is never sellable", empty($it['sell']));

// --- what you own, in a view
$st = progress_blank();
$st['credits'] = 50; $st['wallet'] = ['whispers' => 2];
$st['items'] = ['part_common' => 3, 'part_rare' => 1, 'fish_legend' => 1, 'mystery' => 2];
$st['keepsakes'] = [['id' => 'generals_medal', 'at' => $now, 'from' => 'A dinner']];
$v = inventory_view($st, $d);
$eq('every currency shows, zeros too', array_column($v['currencies'], 'amount'), [50, 0, 0, 2, 0]);
$eq('items grouped by kind, in the catalog\'s order', array_column($v['kinds'], 'kind'), ['part', 'catch', 'other']);
$eq('…sorted by name within a kind', array_column($v['kinds'][0]['items'], 'name'), ['A rare part', 'Loose parts']);
$eq('an unknown id still shows, plainly', [$v['kinds'][2]['items'][0]['name'], $v['kinds'][2]['items'][0]['known']], ['Something you found', false]);
$eq('keepsakes with their names', $v['keepsakes'][0]['name'], 'The general\'s medal');

// --- spending: all or nothing, never a keepsake
$r = inventory_take($st, ['currencies' => ['credits' => 60], 'items' => ['part_common' => 1]], $d, 'a harbor plank', $now);
$eq('not enough Credits: refused', $r['error'] ?? '', 'not_enough');
$eq('…says exactly what\'s short', $r['missing'], ['currencies' => ['credits' => 10], 'items' => []]);
$eq('…and nothing was taken', [$st['credits'], $st['items']['part_common']], [50, 3]);
$r = inventory_take($st, ['currencies' => ['credits' => 20, 'whispers' => 2], 'items' => ['part_common' => 3]], $d, 'a harbor plank', $now);
$ok('enough of everything: spent', $r['ok'] ?? false);
$eq('…Credits down', $st['credits'], 30);
$eq('…a currency spent to zero is gone from the wallet', $st['wallet'], []);
$eq('…an item spent to zero is gone', isset($st['items']['part_common']), false);
$eq('…logged with why', end($st['log'])['why'], 'a harbor plank');
$eq('a keepsake can never be spent', inventory_take($st, ['items' => ['generals_medal' => 1]], $d, 'x', $now)['error'] ?? '', 'keepsake');
$eq('a cost of nothing', inventory_take($st, [], $d, 'x', $now)['error'] ?? '', 'bad_cost');
$eq('a negative cost (a sneaky gift)', inventory_take($st, ['currencies' => ['credits' => -100]], $d, 'x', $now)['error'] ?? '', 'bad_cost');
$eq('…or a made-up currency', inventory_take($st, ['currencies' => ['gold' => 1]], $d, 'x', $now)['error'] ?? '', 'bad_cost');
$eq('…or a fraction', inventory_take($st, ['currencies' => ['credits' => 0.5]], $d, 'x', $now)['error'] ?? '', 'bad_cost');
$eq('a cost in words', inventory_words(['currencies' => ['credits' => 40], 'items' => ['part_good' => 2, 'part_rare' => 1]], $d), '40 Credits, 2 × Good parts and A rare part');

// --- currencies and keepsakes from the progression service
$st = progress_blank();
$got = progress_give($st, $p, [['id' => 'salvage_sigils', 'kind' => 'currency', 'amount' => 3], ['id' => 'credits', 'kind' => 'currency', 'amount' => 7]], 'a delve', $now);
$eq('currency drops land in the wallet (Credits in their own field)', [$st['wallet'], $st['credits']], [['salvage_sigils' => 3], 7]);
$eq('…and say how much', array_column($got, 'amount'), [3, 7]);
progress_give($st, $p, [['id' => 'generals_medal', 'kind' => 'keepsake']], 'a dinner', $now);
$got = progress_give($st, $p, [['id' => 'generals_medal', 'kind' => 'keepsake']], 'a second dinner', $now + 5);
$eq('a keepsake is one of each', count($st['keepsakes']), 1);
$eq('…a second one is remembered again, not doubled', $got[0]['again'] ?? false, true);
$eq('…and keeps when and where it first came from', $st['keepsakes'][0]['from'], 'a dinner');

// --- game saves carry the wallet; a file can't hold minus three swords
db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
progress_save(1, $st);
$snap = gamesave_snapshot(1, [], $now);
$eq('a save holds the wallet', $snap['progress']['wallet'], ['salvage_sigils' => 3]);
$c = gamesave_clean(['progress' => ['wallet' => ['whispers' => -5, 'credits_x' => 2, 'Bad!' => 3], 'items' => ['delve_greatsword' => -3, 'part_rare' => '2']]]);
$eq('negative or junk counts are dropped, strings become numbers', [$c['progress']['wallet'], $c['progress']['items']], [['credits_x' => 2], ['part_rare' => 2]]);

// --- never the bond or desktop Jun
$src = file_get_contents("$repo/lib/inventory.php") . file_get_contents("$repo/inventory.php");
$eq('never touches the bond or her feelings', preg_match('/bond_|relationship_|feel_|memory_/', $src), 0);
$eq('the API can never give (no add/give/grant action)', preg_match("/'(give|grant|add)'/", file_get_contents("$repo/inventory.php")), 0);

echo $fails ? "\n$fails failed\n" : "\nall ok\n";
exec('rm -rf ' . escapeshellarg($tmp));
exit($fails ? 1 : 0);
