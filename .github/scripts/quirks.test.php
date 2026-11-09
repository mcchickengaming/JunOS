<?php
// usage: php .github/scripts/quirks.test.php
// little habits she picks up (lib/quirks.php): anime tsundere talk is
// earned slowly (points capped per day, over days, at Friend+), can be
// asked for and asked away, and her prompt gets the "new" line once.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-quirks-' . getmypid();
mkdir("$tmp/lib", 0700, true);
mkdir("$tmp/migrations");
foreach (['env.php', 'http.php', 'db.php', 'relationship.php', 'bond.php', 'quirks.php'] as $f) copy("$repo/lib/$f", "$tmp/lib/$f");
foreach (glob("$repo/migrations/*.sql") as $f) copy($f, "$tmp/migrations/" . basename($f));
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$tmp/lib/env.php";
require "$tmp/lib/http.php";
require "$tmp/lib/db.php";
require "$tmp/lib/relationship.php";
require "$tmp/lib/bond.php";
require "$tmp/lib/quirks.php";

$notes = [];
if (!function_exists('log_event')) { function log_event(array $e): void { echo '  log: ' . json_encode($e) . "\n"; } }
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
db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (2, 'b@b.c', 'x', 0, 0)");
$u = 1;
$state = fn(int $u = 1) => quirk_get($u, 'anime_tsundere')['state'];

$eq('nothing yet', quirks_context($u), '');
$eq('starts learning', $state(), 'learning');

// lots of anime talk in one day: capped, no pickup
for ($i = 0; $i < 20; $i++) quirks_on_turn($u, 'we should watch more anime tonight', '', '2026-11-01', 4);
$eq('a day is capped', quirk_get($u, 'anime_tsundere')['points'], 4);
$eq('one day is not enough', $state(), 'learning');
quirks_on_turn($u, 'that manga was great', '', '2026-11-02', 4);
quirks_on_turn($u, '', 'Frieren episode 3', '2026-11-02', 4);
$eq('a watch counts more', quirk_get($u, 'anime_tsundere')['points'], 7);
quirks_on_turn($u, 'how is the weather', '', '2026-11-03', 4);
$eq('unrelated talk earns nothing', quirk_get($u, 'anime_tsundere')['points'], 7);
for ($i = 0; $i < 4; $i++) quirks_on_turn($u, 'anime night again?', '', '2026-11-03', 4);
$eq('3 days but 11 points: still learning', [$state(), quirk_get($u, 'anime_tsundere')['points']], ['learning', 11]);
quirks_on_turn($u, 'more anime', '', '2026-11-04', 2);
$eq('enough points but only Familiar: not yet', $state(), 'learning');
quirks_on_turn($u, 'more anime', '', '2026-11-04', 3);
$eq('Friend, enough points over days: picked up', $state(), 'picked');
$eq('it went into her memory', count($notes), 1);

$ctx = quirks_context($u);
$has('the one-time new line', $ctx, 'rubbed off on you');
$ctx = quirks_context($u);
$has('then the standing line', $ctx, 'A habit you picked up from him');
$has('not the new line again', $ctx, 'rubbed off', false);
$eq('the client sees it', quirks_client($u)['anime_tsundere'], ['active' => true, 'state' => 'picked']);

// asking her to stop, and to start
quirks_on_turn($u, 'ok please stop being so tsundere', '', '2026-11-05', 5);
$eq('asked to stop', $state(), 'stopped');
$has('she hears it once', quirks_context($u), 'drop the tsundere act');
$eq('then nothing', quirks_context($u), '');
quirks_on_turn($u, 'more anime, more manga', '', '2026-11-06', 5);
$eq('stopped stays stopped even with more anime', $state(), 'stopped');

$eq('another user, asking works at once', [quirks_on_turn(2, 'can you be a tsundere for me?', '', '2026-11-01', 1), $state(2)], [null, 'asked']);
$has('she goes along in her own way', quirks_context(2), 'Go along with it in your own way');
quirks_on_turn(2, 'say baka', '', '2026-11-01', 1);
$eq('asking again changes nothing', quirk_get(2, 'anime_tsundere')['announced'], 1);

// a replay doesn't use up the one-time line
quirks_on_turn(2, 'stop being tsundere', '', '2026-11-02', 1);
quirks_context(2, false);
$has('a replay leaves the new line for the real turn', quirks_context(2), 'drop the tsundere act');

putenv('JUN_QUIRKS=off');
quirks_on_turn(2, 'be a tsundere again', '', '2026-11-03', 1);
$eq('off: out of her prompt', quirks_context(2), '');
$eq('off: the desktop doesn\'t use it', quirks_client(2)['anime_tsundere']['active'], false);
putenv('JUN_QUIRKS');

exec('rm -rf ' . escapeshellarg($tmp));
if ($fails) { echo "quirks: $fails failed\n"; exit(1); }
echo "quirks: ok\n";
