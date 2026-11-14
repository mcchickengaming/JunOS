<?php
// usage: php .github/scripts/progress.test.php
// the progression service (#31 item 8, lib/progress.php): the curve, xp for her and him, the
// Together bonus, the reward mix (fair, growing, never a ladder), buffs, Focus, away progress,
// story grants, Mastery, her prompt lines, and the rule that the relationship is never levelled.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-progress-' . getmypid();
mkdir($tmp, 0700, true);
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$repo/lib/env.php";
require "$repo/lib/http.php";
require "$repo/lib/db.php";
require "$repo/lib/progress.php";

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};
$ok = fn(string $name, $cond) => $eq($name, (bool)$cond, true);
$seeded = function (int $seed) { mt_srand($seed); return fn() => mt_rand() / (mt_getrandmax() + 1); };

$d = progress_data();
$t = PROGRESS_TUNE;
$now = 1800000000;

// --- the data keeps every rule
$eq('data is valid', progress_validate($d), []);
foreach (['delving', 'tinkering', 'crafting', 'cooking', 'scavenging', 'fishing', 'focus'] as $s) $ok("his skill: $s", in_array('player', $d['skills'][$s]['owners'] ?? [], true));
foreach (['delving', 'scanning', 'hacking', 'support', 'souschef', 'mechanic'] as $s) $ok("her skill: $s", in_array('jun', $d['skills'][$s]['owners'] ?? [], true));
foreach ($d['activities'] as $id => $a) $eq("everyday: $id", $a['tier'], 'everyday');

// --- the relationship is never levelled
$bad = $d;
$bad['activities']['pat'] = ['name' => 'Headpats', 'source' => 'touch', 'tier' => 'everyday', 'minutes' => 5, 'skills' => ['player' => ['cooking' => 1]]];
$ok('a touch can never be an activity', preg_grep('/pat: source/', progress_validate($bad)));
$st = progress_blank();
$eq('…and grant refuses it anyway', progress_grant($st, $bad, ['activity' => 'pat', 'minutes' => 30], $now, $seeded(1))['error'] ?? '', 'never_a_source');
$eq('…nothing gained', $st['skills'], ['player' => [], 'jun' => []]);
foreach (['chat', 'message', 'bond'] as $src) {
    $bad['activities']['pat']['source'] = $src;
    $eq("never from $src", progress_grant($st, $bad, ['activity' => 'pat', 'minutes' => 30], $now, $seeded(1))['error'] ?? '', 'never_a_source');
}
$bad = $d; $bad['skills']['bond'] = ['name' => 'Bond', 'owners' => ['player']];
$ok('the bond can never be a skill', preg_grep('/never a skill/', progress_validate($bad)));
$bad = $d; $bad['activities']['delve']['minStage'] = 3;
$ok('an activity can never ask for a bond stage', preg_grep('/any bond/', progress_validate($bad)));
$bad = $d; $bad['buffs']['well_fed']['effect'] = ['bond.xp' => 5];
$ok('a buff never touches the relationship', preg_grep('/never touches/', progress_validate($bad)));
$src = file_get_contents("$repo/lib/progress.php") . file_get_contents("$repo/progress.php");
$eq('the service never calls the bond or her feelings', preg_match('/bond_(award|get|set)|relationship_(get|set|apply)|FROM bond|INTO bond|UPDATE bond/', $src), 0);
$eq('…and the bond never reads the service', preg_match('/progress_/', file_get_contents("$repo/lib/bond.php") . file_get_contents("$repo/lib/touch.php")), 0);

// --- the curve
$eq('level 1 at 0 xp', progress_level(0)['level'], 1);
$eq('level 2 right at its xp', progress_level(progress_next_xp(1))['level'], 2);
$eq('one xp short stays', progress_level(progress_next_xp(1) - 1)['level'], 1);
$eq('the top is 99', progress_level(PHP_INT_MAX)['level'], 99);
$eq('xp_to and level agree', progress_level(progress_xp_to(57))['level'], 57);
$steps = array_map(fn($l) => progress_next_xp($l), range(1, 98));
$sorted = $steps; sort($sorted);
$eq('every level takes more than the last', $steps, $sorted);
$topH = progress_xp_to(99) / $t['xpPerMin'] / 60;
$ok('the top is a long road, not an endless one (100-300 h)', $topH > 100 && $topH < 300);
$ok('the first level-up comes in minutes', progress_next_xp(1) / $t['xpPerMin'] <= 6);

// --- xp: alone, together, quality
$a = progress_blank(); $b = progress_blank();
$ra = progress_grant($a, $d, ['activity' => 'sample_cooking', 'minutes' => 20], $now, $seeded(2));
$rb = progress_grant($b, $d, ['activity' => 'sample_cooking', 'minutes' => 20, 'together' => true], $now, $seeded(2));
$eq('alone: the plain rate', $ra['xp']['player']['cooking'], 200);
$ok('alone: she gains nothing, and nothing is taken', empty($ra['xp']['jun']) && $a['skills']['jun'] === []);
$eq('together: he gains a little more', $rb['xp']['player']['cooking'], 220);
$eq('together: she gains her own skill', $rb['xp']['jun']['souschef'], 220);
$ok('level-ups are reported', count($ra['ups']) === 1 && $ra['ups'][0]['skill'] === 'cooking' && $ra['ups'][0]['level'] > 1);
$c = progress_blank();
$eq('a great session gives more', progress_grant($c, $d, ['activity' => 'sample_cooking', 'minutes' => 20, 'quality' => 1, 'rewards' => false], $now, $seeded(2))['xp']['player']['cooking'], 250);
$eq('a rough one still gives most of it', progress_grant($c, $d, ['activity' => 'sample_cooking', 'minutes' => 20, 'quality' => 0, 'rewards' => false], $now, $seeded(2))['xp']['player']['cooking'], 150);
$c = progress_blank();
$eq('one session counts 4 hours at most', progress_grant($c, $d, ['activity' => 'sample_fishing', 'minutes' => 9999], $now, $seeded(2))['minutes'], 240.0);
$eq('unknown activity', progress_grant($c, $d, ['activity' => 'nope', 'minutes' => 5], $now, $seeded(2))['error'] ?? '', 'unknown_activity');
$eq('her skills stay hers', isset($b['skills']['player']['souschef']), false);
$eq('Total Level adds up', progress_total($b, 'player', $d), 6 + progress_skill_level($b, 'player', 'cooking'));

// --- rewards: fair across activities, growing with skill, sizes from a mix (never a ladder)
$acts = ['delve', 'sample_cooking', 'sample_tinkering', 'sample_fishing'];
$vals = [];
foreach ($acts as $i => $id) $vals[$id] = progress_simulate($d, $id, 1000, ['seed' => 11 + $i])['valuePerMin'];
$ok('about the same value for the time, whatever you love (' . implode(' / ', $vals) . ')', max($vals) / min($vals) < 1.15);
$sum = fn(int $level, int $seed) => (function () use ($d, $level, $seed, $seeded, $t) {
    $rnd = $seeded($seed); $v = 0; $sizes = ['small' => 0, 'mid' => 0, 'big' => 0];
    for ($i = 0; $i < 4000; $i++) { $r = progress_roll($d, 'sample_fishing', 30, $level, $rnd); $v += $r['credits']; foreach ($r['drops'] as $x) { $v += $t['value'][$x['size']]; $sizes[$x['size']]++; } }
    return [$v, $sizes];
})();
[$v1, $s1] = $sum(1, 5); [$v50, $s50] = $sum(50, 6); [$v99, $s99] = $sum(99, 7);
$ok('rewards grow with skill', $v50 > $v1 * 1.7 && $v99 > $v50 * 1.3);
$ok('…strongly: about three times at the top', $v99 / $v1 > 2.7 && $v99 / $v1 < 3.3);
$share = fn(array $s, string $k) => $s[$k] / array_sum($s);
$ok('small often, big rarely', $share($s1, 'small') > 0.7 && $share($s1, 'big') < 0.03 && $share($s1, 'big') > 0.004);
$ok('the same mix at the top: never a ladder', abs($share($s99, 'big') - $share($s1, 'big')) < 0.015 && abs($share($s99, 'small') - $share($s1, 'small')) < 0.04);
$rnd = $seeded(8); $lo = PHP_INT_MAX; $hi = 0;
for ($i = 0; $i < 300; $i++) { $cr = progress_roll($d, 'sample_fishing', 60, 1, $rnd)['credits']; $lo = min($lo, $cr); $hi = max($hi, $cr); }
$ok('ups and downs, not flat', $hi > $lo * 1.3);
$sim = progress_simulate($d, 'delve', 300, ['seed' => 3]);
$ok('signature finds show up next to shared ones', $sim['signature'] > 0 && $sim['signature'] < array_sum($sim['drops']));
$ok('a big moment in every activity', !empty($sim['big']) && !empty(progress_simulate($d, 'sample_cooking', 300, ['seed' => 4])['big']));
$ok('something set going pays for half the time: he was not there', abs(progress_simulate($d, 'sample_expedition', 1000, ['seed' => 2])['valuePerMin'] / $vals['sample_fishing'] - 0.5) < 0.1);
$eq('the same seed, the same story', progress_simulate($d, 'delve', 50, ['seed' => 9]), progress_simulate($d, 'delve', 50, ['seed' => 9]));
$rnd = $seeded(12); $early = false;
for ($i = 0; $i < 3000; $i++) foreach (progress_roll($d, 'delve', 25, 5, $rnd)['drops'] as $x) if ($x['id'] === 'delve_greatsword') $early = true;
$eq('a deep-chest find waits for some skill', $early, false);

// --- buffs: timed, permanent (small, once), worn; each says where it's from
$s = progress_blank();
progress_give($s, $d, [['id' => 'consistent_focus', 'kind' => 'buff', 'size' => 'small']], 'A focus session', $now);
$eq('a timed buff helps where it says', progress_effects($s, $d, $now, 'delve')['accuracy'] ?? 0, 5);
$eq('…and nowhere else', progress_effects($s, $d, $now, 'cook'), []);
$eq('it says where it came from', progress_active_buffs($s, $d, $now)[0]['from'], 'A focus session');
progress_grant($s, $d, ['activity' => 'sample_cooking', 'minutes' => 10], $now, $seeded(1));
$eq('cooking does not use it up', $s['buffs'][0]['uses'], 3);
for ($i = 0; $i < 3; $i++) progress_grant($s, $d, ['activity' => 'delve', 'minutes' => 10, 'rewards' => false], $now, $seeded(1));
$eq('gone after the next three delves', progress_effects($s, $d, $now, 'delve'), []);
$s = progress_blank();
progress_give($s, $d, [['id' => 'well_fed', 'kind' => 'buff', 'size' => 'small']], 'Dinner', $now);
$x1 = progress_grant($s, $d, ['activity' => 'sample_fishing', 'minutes' => 20, 'rewards' => false], $now, $seeded(1))['xp']['player']['fishing'];
$eq('"well fed" helps his xp a little', $x1, 210);
$eq('…until tomorrow, then it is gone', progress_effects($s, $d, $now + 21 * 3600), []);
$s = progress_blank();
progress_give($s, $d, [['id' => 'kings_favor', 'kind' => 'buff', 'size' => 'big']], 'A king', $now);
$again = progress_give($s, $d, [['id' => 'kings_favor', 'kind' => 'buff', 'size' => 'big']], 'A king', $now);
$eq('a permanent buff once; again pays out instead', [count($s['buffs']), $again[0]['instead'], $s['credits']], [1, 120, 120]);
$eq('permanent stays', progress_effects($s, $d, $now + 400 * 86400)['luck'] ?? 0, 1);
$big = $d; $big['buffs']['kings_favor']['effect'] = ['luck' => 50];
$eq('permanent buffs are capped small', progress_effects($s, $big, $now)['luck'], $t['permCap']);
$ok('…and the data may not ship a big one', preg_grep('/permanent buffs are small/', progress_validate($big)));
$eq('worn: only while it is on', [progress_effects(progress_blank(), $d, $now, 'focus', ['focus_blue_light_glasses']), progress_effects(progress_blank(), $d, $now, 'focus')], [['xp.focus' => 3], []]);

// --- Focus: opt-in, a daily cap, never a permanent buff
$s = progress_blank();
$eq('off until he opts in', progress_grant($s, $d, ['activity' => 'sample_focus', 'minutes' => 25], $now, $seeded(1))['error'] ?? '', 'not_opted_in');
$s['opt']['focus'] = true;
$mins = 0;
for ($i = 0; $i < 10; $i++) $mins += progress_grant($s, $d, ['activity' => 'sample_focus', 'minutes' => 25, 'day' => '2026-11-13'], $now, $seeded($i))['minutes'];
$eq('leaving it running does not farm xp', $mins, 150.0);
$eq('a new day, a new cap', progress_grant($s, $d, ['activity' => 'sample_focus', 'minutes' => 25, 'day' => '2026-11-14'], $now, $seeded(1))['minutes'], 25.0);
$bad = $d; $bad['activities']['sample_focus']['signature'][] = ['id' => 'kings_favor', 'kind' => 'buff', 'size' => 'big', 'w' => 1];
$ok('the data may not give Focus a permanent buff', preg_grep('/not allowed here/', progress_validate($bad)));
$rnd = $seeded(4); $perm = false;
for ($i = 0; $i < 3000; $i++) foreach (progress_roll($bad, 'sample_focus', 25, 60, $rnd)['drops'] as $x) if ($x['id'] === 'kings_favor') $perm = true;
$eq('…and the roller would skip it anyway', $perm, false);

// --- sessions: her server's clock
$s = progress_blank();
$eq('nothing running', progress_finish($s, $d, [], $now, $seeded(1))['error'] ?? '', 'nothing_running');
progress_begin($s, $d, 'sample_fishing', true, $now);
$r = progress_finish($s, $d, ['minutes' => 500], $now + 30 * 60, $seeded(1));
$eq('the real minutes count, not the claimed ones', $r['minutes'], 30.0);
progress_begin($s, $d, 'sample_fishing', true, $now);
$eq('paused time can be left out', progress_finish($s, $d, ['minutes' => 10], $now + 30 * 60, $seeded(1))['minutes'], 10.0);
$eq('a session ends once', progress_finish($s, $d, [], $now + 99 * 60, $seeded(1))['error'] ?? '', 'nothing_running');
$eq('an expedition is not a session', progress_begin($s, $d, 'sample_expedition', false, $now)['error'] ?? '', 'unknown_activity');

// --- away: hers by real time; his only through what he set going
$s = progress_blank();
$eq('first visit: nothing yet', progress_away($s, $d, $now, $seeded(1)), null);
$eq('ten minutes is not away', progress_away($s, $d, $now + 600, $seeded(1)), null);
$r = progress_away($s, $d, $now + 600 + 4 * 3600, $seeded(1));
$eq('four hours away: she practiced at her own pace', $r['xp']['jun'], ['mechanic' => 600, 'hacking' => 600]);
$eq('he gains nothing from being away', $s['skills']['player'], []);
$eq('…and no loot appears', [$s['credits'], $s['items']], [0, []]);
$before = $s['skills']['jun']['mechanic']['xp'];
progress_away($s, $d, $now + 600 + 4 * 3600 + 40 * 86400, $seeded(1));
$eq('a month away counts as one long day', $s['skills']['jun']['mechanic']['xp'] - $before, 1200);
$s = progress_blank();
$eq('only some things can be set going', progress_set_going($s, $d, 'delve', $now)['error'] ?? '', 'unknown_activity');
progress_set_going($s, $d, 'sample_expedition', $now);
$eq('one drone, one trip', progress_set_going($s, $d, 'sample_expedition', $now)['error'] ?? '', 'already_going');
$eq('not back yet', progress_collect($s, $d, $now + 3600, $seeded(1)), []);
$r = progress_collect($s, $d, $now + 2 * 3600, $seeded(1));
$eq('back: his xp at the set-going rate', $r[0]['xp']['player']['scavenging'], 600);
$eq('collected once', [progress_collect($s, $d, $now + 3 * 3600, $seeded(1)), $s['jobs']], [[], []]);

// --- story grants cross paths, once
$s = progress_blank();
$r = progress_story($s, $d, 'sample_generals_gift', $now);
$eq('a dish for a general, his nation\'s blade', [$s['items']['moonlight_greatsword'] ?? 0, $s['keepsakes'][0]['id'], $s['keepsakes'][0]['from']], [1, 'generals_medal', 'A dish cooked for a military leader']);
$eq('once', progress_story($s, $d, 'sample_generals_gift', $now)['error'] ?? '', 'already_given');
$eq('unknown story', progress_story($s, $d, 'nope', $now)['error'] ?? '', 'unknown_story');

// --- Mastery: optional, at the top only, the total never drops
$s = progress_blank();
$s['skills']['player']['fishing'] = ['xp' => progress_xp_to(98), 'marks' => 0];
$eq('not before the top', progress_master($s, $d, 'player', 'fishing', $now)['error'] ?? '', 'not_at_the_top');
$s['skills']['player']['fishing']['xp'] = progress_xp_to(99);
$total = progress_total($s, 'player', $d);
progress_grant($s, $d, ['activity' => 'sample_fishing', 'minutes' => 60, 'rewards' => false], $now, $seeded(1));
$eq('xp stops at the top', $s['skills']['player']['fishing']['xp'], progress_xp_to(99));
$eq('a mark, and the skill starts over', [progress_master($s, $d, 'player', 'fishing', $now)['marks'] ?? 0, progress_skill_level($s, 'player', 'fishing')], [1, 1]);
$eq('Total Level did not drop', progress_total($s, 'player', $d), $total);
$eq('a mark is a small help', progress_grant($s, $d, ['activity' => 'sample_fishing', 'minutes' => 10, 'rewards' => false], $now, $seeded(1))['xp']['player']['fishing'], 103);
$eq('her skills are not his to master', progress_master($s, $d, 'player', 'hacking', $now)['error'] ?? '', 'unknown_skill');

// --- her prompt: words, never numbers; nothing to say = nothing
$eq('nothing happened: nothing said', progress_context_from(progress_blank(), $d, $now), '');
$s = progress_blank();
$s['skills']['player']['cooking'] = ['xp' => progress_xp_to(30) - 50, 'marks' => 0];
progress_grant($s, $d, ['activity' => 'sample_cooking', 'minutes' => 240, 'together' => true, 'rewards' => false], $now, $seeded(1));
$c = progress_context_from($s, $d, $now + 3600);
$ok('his progress, noticed', str_contains($c, "Anon has gotten better at cooking lately (he's good at it now). You noticed."));
$ok('hers too', str_contains($c, "You've gotten better at sous-chef lately"));
$eq('never a number', preg_match('/\d/', $c), 0);
$eq('old news fades', progress_context_from($s, $d, $now + 3 * 86400), '');
$s = progress_blank(); progress_away($s, $d, $now, $seeded(1)); progress_away($s, $d, $now + 5 * 3600, $seeded(1));
$ok('what she did on her own', str_contains(progress_context_from($s, $d, $now + 5 * 3600), 'practicing assistant mechanic and hacking on your own time'));
putenv('JUN_PROGRESS=off');
$eq('JUN_PROGRESS=off leaves it out', progress_context(1), '');
putenv('JUN_PROGRESS=on');

// --- her database, and a hand-edited blob
db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
$eq('a new player starts blank', progress_load(1), progress_blank());
$s = progress_blank(); progress_grant($s, $d, ['activity' => 'delve', 'minutes' => 25, 'together' => true], $now, $seeded(3));
progress_save(1, $s); progress_save(1, $s);
$eq('saved and read back', progress_load(1), $s);
$eq('garbage reads as blank', progress_clean(['skills' => 'lots', 'credits' => 'all of them', 'log' => 7]), progress_blank());
$v = progress_view($s, $d, $now);
$ok('the view has both of them', isset($v['owners']['player']['skills']['delving']['level'], $v['owners']['jun']['skills']['scanning']['level']) && !isset($v['owners']['player']['skills']['scanning']));
$eq('the lab can try other numbers without touching the real ones', [progress_tune(['cap' => 50, 'mix' => ['big' => 0.5], 'nonsense' => 1])['cap'], progress_tune(['mix' => ['big' => 0.5]])['mix']['big'], PROGRESS_TUNE['cap']], [50, 0.5, 99]);
$eq('the curve table ends at the top', [count(progress_curve()), progress_curve()[98]['next']], [99, 0]);

echo $fails ? "\n$fails failed\n" : "\nall good\n";
exit($fails ? 1 : 0);
