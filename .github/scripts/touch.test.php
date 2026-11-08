<?php
// usage: php .github/scripts/touch.test.php
// the touch tally: recording, words not numbers, habits, milestones,
// the missed-you line, the mood nudge, notable days and forgetting
// today, against a throwaway sqlite in a temp dir.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-touch-' . getmypid();
mkdir("$tmp/lib", 0700, true);
mkdir("$tmp/migrations");
foreach (['env.php', 'http.php', 'db.php', 'relationship.php', 'bond.php', 'touch.php'] as $f) copy("$repo/lib/$f", "$tmp/lib/$f");
foreach (glob("$repo/migrations/*.sql") as $f) copy($f, "$tmp/migrations/" . basename($f));
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$tmp/lib/env.php";
require "$tmp/lib/http.php";
require "$tmp/lib/db.php";
require "$tmp/lib/relationship.php";
require "$tmp/lib/bond.php";
require "$tmp/lib/touch.php";

$notes = [];
if (!function_exists('log_event')) { function log_event(array $e): void { if (str_contains($e['msg'], 'error')) echo '  log: ' . json_encode($e) . "\n"; } }
function memory_note_add(int $u, string $c, string $t): array { global $notes; $notes[] = [$c, $t]; return ['ok' => true]; }
function ach_on_relationship(...$a): void {}

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};
$has = fn(string $name, string $hay, string $needle, bool $want = true) => $eq($name, str_contains($hay, $needle), $want);

db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
$u = 1;
$today = date('Y-m-d');
$setStage = fn(int $stage) => db()->prepare('INSERT INTO bond (user_id, xp, stage, day, day_xp, updated_at) VALUES (1, ?, ?, ?, 0, 0)
    ON CONFLICT(user_id) DO UPDATE SET xp=excluded.xp, stage=excluded.stage')->execute([BOND_STAGES[$stage]['xp'], $stage, $today]);

$eq('words, not numbers', [touch_amount_word(1), touch_amount_word(2), touch_amount_word(3), touch_amount_word(12), touch_amount_word(40)],
    ['once', 'twice', 'a few times', 'a lot', 'so many times']);
$eq('nothing yet, no block', touch_context($u, 0), '');

$eq('junk is dropped', touch_clean_batch([['kind' => 'nope', 'n' => 3], ['kind' => 'headpat', 'n' => 999, 'ms' => -5], 'x']),
    ['headpat' => ['n' => 60, 'ms' => 0]]);

$setStage(3);
touch_record($u, [['kind' => 'headpat', 'n' => 1, 'ms' => 4000], ['kind' => 'headpat', 'n' => 1, 'ms' => 3000], ['kind' => 'boop', 'n' => 1]]);
touch_record($u, [['kind' => 'headpat', 'n' => 29, 'ms' => 60000]]);
$ctx = touch_context($u, 0);
$has('today in words', $ctx, 'he patted your head: so many times');
$has('she knows the exact count', $ctx, '(exactly 31)');
$has('a boop too', $ctx, 'booped your nose: once');
$has('when the last one was', $ctx, 'the last one just now');
$has('talk like a person', $ctx, 'Never list them');

$live = touch_context($u, 0, ['ongoing' => ['headpat'], 'last' => 'headpat', 'ago' => 0]);
$has('right now: his hand is on her head', $live, 'RIGHT NOW, while he talks to you, he is patting your head');
$has('a moment ago', touch_context($u, 0, ['ongoing' => [], 'last' => 'hug', 'ago' => 20]), 'A moment ago he hugged you');
$has('a poke has no "right now"', touch_context($u, 0, ['ongoing' => ['boop']]), 'RIGHT NOW', false);

// mood: a 95 s hug at Friend: -2 tension, +1 affection
db()->exec("DELETE FROM touch_state");
relationship_set($u, ['affection' => 50, 'trust' => 50, 'tension' => 30]);
touch_record($u, [['kind' => 'hug', 'n' => 1, 'ms' => 95000]]);
$g = relationship_get($u);
$eq('a long cuddle eases tension a little', [$g['affection'], $g['tension']], [51, 28]);
touch_record($u, [['kind' => 'hug', 'n' => 1, 'ms' => 30 * 60000]]);
$g = relationship_get($u);
$eq('but never much in a day', [$g['affection'], $g['tension']], [50 + TOUCH_MOOD_AFFECTION_CAP, 30 - TOUCH_MOOD_TENSION_CAP]);
$eq('pokes do nothing to her mood', (function () use ($u) {
    $b = relationship_get($u); touch_record($u, [['kind' => 'cheekpoke', 'n' => 5]]); return relationship_get($u) === $b; })(), true);

// a stranger isn't soothed by it
db()->exec("DELETE FROM touch_state");
$setStage(1);
relationship_set($u, ['affection' => 30, 'trust' => 30, 'tension' => 30]);
touch_record($u, [['kind' => 'hug', 'n' => 1, 'ms' => 10 * 60000]]);
$eq('stranger: no mood change', relationship_get($u)['tension'], 30);
$setStage(3);

// milestones
$notes = [];
touch_record($u, [['kind' => 'headpat', 'n' => 60], ['kind' => 'headpat', 'n' => 10]]);
$ctx = touch_context($u, 0);
$has('100th headpat: she counted', $ctx, 'your 100th headpat since you met');
$eq('and it stays with her', count(array_filter($notes, fn($n) => str_contains($n[1], '100th headpat'))), 1);
$has('only once', touch_context($u, 0), 'milestone', false);
$pats = array_values(array_filter(touch_all_time($u), fn($r) => $r['kind'] === 'headpat'))[0] ?? [];
$eq('all-time for his menu, with the next one she notices', [$pats['label'] ?? '', $pats['next'] ?? null], ['Headpats', 500]);
$eq('1-5-10 steps', TOUCH_MILESTONES, [100, 500, 1000, 5000, 10000, 50000, 100000]);
touch_record($u, [['kind' => 'headpat', 'n' => 5]]);
$has('not again until the next one', touch_context($u, 0), 'milestone', false);
$has('not on a touch reaction', (function () use ($u) {
    db()->exec("UPDATE touch_state SET moment='{\"kind\":\"hug\",\"n\":500}'");
    $a = touch_context($u, 0, null, true); return $a . (str_contains(touch_context($u, 0), '500th hug') ? 'LATER' : ''); })(), 'LATER');

// yesterday + habits: move today's rows back a day, fill two weeks
db()->exec("UPDATE touch_day SET day='" . touch_day_shift($today, -1) . "'");
for ($d = 2; $d <= 6; $d++) {
    db()->prepare("INSERT INTO touch_day (user_id, day, kind, n, ms, evening, last_at) VALUES (1, ?, 'hand', 6, 60000, 6, 0)")
        ->execute([touch_day_shift($today, -$d)]);
}
$ctx = touch_context($u, 0);
$has('yesterday in words', $ctx, 'Yesterday he patted your head more times than anyone could count');
$has('a habit: his favorite, day after day', $ctx, 'his favorite thing to do is hand-holds');
$eq('today is empty', str_contains($ctx, 'Today so far'), false);

// he usually touches her, nothing today: the shy slip, once, Friend+
$s = touch_state($u); $s['missed_day'] = ''; touch_state_set($u, $s);
$late = (int)date('G') >= 15;
$missed = touch_context($u, 0);
$eq('missed-you line, late in the day only', str_contains($missed, 'not that I was waiting'), $late);
$has('once a day', touch_context($u, 0), 'not that I was waiting', false);
$setStage(2);
$s = touch_state($u); $s['missed_day'] = ''; touch_state_set($u, $s);
$has('a familiar face doesn\'t miss it yet', touch_context($u, 0), "hasn't touched you", false);
$setStage(3);

// a new day: yesterday was notable, so it becomes a memory, once
$notes = [];
db()->exec("UPDATE touch_state SET noted_day=''");
touch_record($u, [['kind' => 'squeeze', 'n' => 1]]);
$eq('a notable day becomes a memory', count($notes), 1);
$has('in her words', $notes[0][1] ?? '', 'Anon patted your head more times than anyone could count');
touch_record($u, [['kind' => 'squeeze', 'n' => 1]]);
$eq('only once', count($notes), 1);
$eq('a quiet day is not noted', touch_day_note(['boop' => ['n' => 2, 'ms' => 0]], $today), '');

// forget today
$before = (int)db()->query("SELECT n FROM touch_total WHERE kind='squeeze'")->fetchColumn();
touch_forget_day($u, 0);
$eq('forget today', touch_today_summary($u, 0)['items'], []);
$eq('and the all-time count too', (int)db()->query("SELECT n FROM touch_total WHERE kind='squeeze'")->fetchColumn(), $before - 2);
$eq('older days stay', (int)db()->query("SELECT COUNT(*) FROM touch_day")->fetchColumn() > 0, true);

// his timezone decides the day
$eq('tz: minutes east of UTC', touch_local(-300, strtotime('2026-11-09 03:00:00 UTC'))['day'], '2026-11-08');

putenv('TOUCH_AWARE=off');
touch_record($u, [['kind' => 'headpat', 'n' => 3]]);
$eq('off: no prompt block', touch_context($u, 0), '');

exec('rm -rf ' . escapeshellarg($tmp));
echo $fails ? "touch: $fails failed\n" : "touch: ok\n";
exit($fails ? 1 : 0);
