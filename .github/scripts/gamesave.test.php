<?php
// usage: php .github/scripts/gamesave.test.php
// game saves (#35 a, lib/gamesave.php): sections of the live game and the epoch guard, the play clock, slots
// (auto rotation + gap, one quicksave, the named limit), what a save holds and what it never holds (her skills,
// Focus, desktop Jun), loading + the before-load save + undo/redo, the bond only when asked (and quietly), a new
// game, keep / rename / delete, files (checksum, newer, damaged, cleaning), and her prompt's soft shift line.
$repo = __DIR__ . '/../../webapp/api';
$tmp = sys_get_temp_dir() . '/omega-gamesave-' . getmypid();
mkdir($tmp, 0700, true);
putenv("OMEGA_STATE_DIR=$tmp/state");
require "$repo/lib/env.php";
require "$repo/lib/http.php";
require "$repo/lib/db.php";
require "$repo/lib/relationship.php";
require "$repo/lib/bond.php";
require "$repo/lib/progress.php";
require "$repo/lib/gamesave.php";

$history = [];
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

db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (1, 'a@b.c', 'x', 0, 0)");
db()->exec("INSERT INTO users (id, email, password_hash, created_at, adult_consent_at) VALUES (2, 'd@e.f', 'x', 0, 0)");
$u = 1;
$now = 1800000000;
$d = progress_data();

// --- the live game: sections, the epoch guard, limits
$live = gamesave_live($u);
$eq('a new game has no sections', $live['sections'], []);
$eq('…and epoch 1', $live['epoch'], 1);
$eq('a section that isn\'t there', game_section_get($u, 'story'), null);
$r = game_section_put($u, 'story', ['chapter' => 1, 'flags' => ['met_al' => true], '_summary' => ['place' => 'The scrapyard', 'chapter' => 'Act 1']], 1, $now);
$eq('write a section with the epoch it read', [$r['ok'] ?? false, $r['epoch']], [true, 1]);
$eq('read it back', game_section_get($u, 'story')['flags']['met_al'] ?? null, true);
$eq('a bad name is refused', game_section_put($u, 'Story!', [], null, $now)['error'] ?? '', 'bad_name');
$eq('…and a name too long', game_section_put($u, str_repeat('a', 33), [], null, $now)['error'] ?? '', 'bad_name');
$eq('a stale epoch is refused (a page still holding another game)', game_section_put($u, 'story', ['x' => 1], 7, $now)['error'] ?? '', 'reloaded');
$eq('…and nothing changed', game_section_get($u, 'story')['chapter'], 1);
$eq('too big a section is refused', game_section_put($u, 'big', str_repeat('x', GAMESAVE_TUNE['sectionMax'] + 10), null, $now)['error'] ?? '', 'too_big');
$r = game_sections_put($u, ['house' => ['rooms' => 1], 'tmp' => [1]], null, $now);
$eq('several sections at once', array_keys(gamesave_live($u)['sections']), ['story', 'house', 'tmp']);
game_sections_put($u, ['tmp' => null], null, $now);
$eq('null removes a section', array_keys(gamesave_live($u)['sections']), ['story', 'house']);
$eq('another user sees none of it', gamesave_live(2)['sections'], []);

// --- the play clock never counts more than real time
$eq('first tick counts what it says (up to the cap)', gamesave_tick($u, 60, $now), 60);
$eq('a tick claiming more than the real time since the last one', gamesave_tick($u, 600, $now + 30), 90);
$eq('a tick is capped', gamesave_tick($u, 100000, $now + 100000), 90 + GAMESAVE_TUNE['tickMaxSec']);
$eq('a negative tick counts nothing', gamesave_tick($u, -50, $now + 100100), 90 + GAMESAVE_TUNE['tickMaxSec']);
$played = gamesave_live($u)['played'];

// --- what a save holds: the game's side only
$p = progress_blank();
$p['skills']['player'] = ['delving' => ['xp' => 900, 'marks' => 0], 'cooking' => ['xp' => 300, 'marks' => 0], 'focus' => ['xp' => 5000, 'marks' => 0]];
$p['skills']['jun'] = ['scanning' => ['xp' => 700, 'marks' => 0]];
$p['credits'] = 120;
$p['items'] = ['scrap_spring' => 3];
$p['keepsakes'] = [['id' => 'photo_first_delve', 'at' => $now, 'from' => 'delve']];
$p['opt']['focus'] = true;
progress_save($u, $p);
bond_award($u, 200, 'test');   // Familiar
$snap = gamesave_snapshot($u, ['delve' => ['seed' => 42, 'depth' => 2]], $now);
$eq('his game skills are in it', array_keys((array)$snap['progress']['skills']), ['delving', 'cooking']);
$ok('…never Focus (desktop Jun\'s world)', !isset(((array)$snap['progress']['skills'])['focus']));
$ok('…never her skills', !isset($snap['progress']['jun']) && strpos(gamesave_json($snap), 'scanning') === false);
$eq('Credits, items, keepsakes', [$snap['progress']['credits'], $snap['progress']['items'], count($snap['progress']['keepsakes'])], [120, ['scrap_spring' => 3], 1]);
$eq('the page\'s parts', ((array)$snap['client'])['delve']['seed'], 42);
$eq('a record of the bond', $snap['bond']['stage'], 2);
$eq('the play clock', $snap['game']['played'], $played);
$ok('nothing of her: no chats, memories, feelings', !preg_match('/memor|message|affection|trust|tension|feel/i', gamesave_json($snap)));

// --- slots
$s1 = gamesave_save($u, 'named', 'At the scrapyard', ['delve' => ['seed' => 42, 'depth' => 2]], $now);
$ok('a named save', ($s1['ok'] ?? false) && $s1['id'] > 0);
$a = [];
foreach ([0, 10, 40, 80, 120, 160] as $i => $dt) $a[] = gamesave_save($u, 'auto', '', [], $now + $dt);
$eq('an autosave too soon after the last is skipped, not an error', $a[1]['skipped'] ?? '', 'too_soon');
$eq('…unless forced (a story beat)', isset(gamesave_save($u, 'auto', '', [], $now + 12, true)['id']), true);
$eq('only the last 3 autosaves are kept', gamesave_count($u, 'auto'), 3);
$eq('autosaves get a plain name', gamesave_list($u)[0]['name'], 'Autosave');
gamesave_save($u, 'quick', '', [], $now);
gamesave_save($u, 'quick', '', [], $now + 5);
$eq('one quicksave, replaced', gamesave_count($u, 'quick'), 1);
$eq('a before-load save can\'t be made by hand', gamesave_save($u, 'before_load', '', [], $now)['error'] ?? '', 'bad_kind');
$eq('an unknown kind', gamesave_save($u, 'sneaky', '', [], $now)['error'] ?? '', 'bad_kind');
$row = array_values(array_filter(gamesave_list($u), fn($x) => $x['id'] === $s1['id']))[0];
$eq('the card: where and which chapter (from a section\'s _summary)', [$row['summary']['place'] ?? '', $row['summary']['chapter'] ?? ''], ['The scrapyard', 'Act 1']);
$eq('the card: the bond it was made with, in words', $row['summary']['bondName'], 'Familiar');
$eq('the card: Credits, items, keepsakes', [$row['summary']['credits'], $row['summary']['items'], $row['summary']['keepsakes']], [120, 3, 1]);
$eq('names are cleaned and clipped', gamesave_get($u, gamesave_save($u, 'named', "  line\nbreak " . str_repeat('x', 200), [], $now)['id'])['name'],
    mb_substr('line break ' . str_repeat('x', 200), 0, 80));
$t = GAMESAVE_TUNE; $t['namedMax'] = gamesave_count($u, 'named');
$eq('the named limit', gamesave_store($u, 'named', 'one more', $snap, $now, $t)['error'] ?? '', 'full');
$eq('a page\'s part with a bad name is refused', gamesave_save($u, 'named', 'x', ['Bad Name' => 1], $now)['error'] ?? '', 'not_a_save');

// --- change everything, then load the first save back
game_section_put($u, 'story', ['chapter' => 3, '_summary' => ['place' => 'Port Buffer']], null, $now + 200);
$p = progress_load($u);
$p['skills']['player']['delving']['xp'] = 5000;
$p['skills']['player']['focus']['xp'] = 7777;
$p['skills']['jun']['scanning']['xp'] = 9999;
$p['credits'] = 999;
$p['session'] = ['activity' => 'delve', 'at' => $now, 'together' => true];
progress_save($u, $p);
$grow = fn(int $xp) => db()->prepare('UPDATE bond SET xp = ?, stage = ? WHERE user_id = 1')->execute([$xp, bond_stage_for($xp)]);
$grow(600); // Friend now (the daily cap would stop a second award today)
$eq('the bond grew meanwhile', bond_get($u)['stage'], 3);
$epochBefore = gamesave_live($u)['epoch'];
$r = gamesave_load($u, $s1['id'], false, ['delve' => ['seed' => 99]], $now + 300);
$ok('load', $r['ok'] ?? false);
$eq('the game is back', game_section_get($u, 'story')['chapter'], 1);
$eq('…the epoch moved (old pages can\'t write over it)', gamesave_live($u)['epoch'], $epochBefore + 1);
$eq('…so a page still on the old epoch is refused', game_section_put($u, 'story', ['chapter' => 3], $epochBefore, $now + 301)['error'] ?? '', 'reloaded');
$p = progress_load($u);
$eq('his game skills are back', $p['skills']['player']['delving']['xp'], 900);
$eq('…Credits are back', $p['credits'], 120);
$eq('…Focus stays as it is now (desktop)', $p['skills']['player']['focus']['xp'], 7777);
$eq('…her skills stay as they are now (shared)', $p['skills']['jun']['scanning']['xp'], 9999);
$eq('…the opt-in stays', $p['opt']['focus'], true);
$eq('…a game session (a delve) running in the old game is dropped', $p['session'], null);
$eq('…the bond is untouched without the box', bond_get($u)['stage'], 3);
$eq('…the page gets its parts back', ((array)$r['client'])['delve']['seed'] ?? null, 42);
$eq('…the play clock is the save\'s', gamesave_live($u)['played'], $played);
$eq('a before-load save was made', gamesave_count($u, 'before_load'), 1);
$before = gamesave_get($u, $r['before']);
$eq('…holding what was live (chapter 3)', $before['payload']['game']['sections']->story['chapter'] ?? null, 3);
$eq('…and the page\'s parts as they were', ((array)$before['payload']['client'])['delve']['seed'], 99);
$eq('…and the bond as it was', $before['payload']['bond']['stage'], 3);
$ok('undo is possible', gamesave_live_view(gamesave_live($u))['canUndo']);

// a focus session keeps running through a load
$p = progress_load($u); $p['session'] = ['activity' => 'sample_focus', 'at' => $now, 'together' => true]; progress_save($u, $p);
gamesave_load($u, $s1['id'], false, [], $now + 310);
$eq('a desktop-only session (focus) keeps running', progress_load($u)['session']['activity'] ?? null, 'sample_focus');

// --- undo and redo
gamesave_load($u, $r['before'], false, [], $now + 320);   // back to chapter 3 by hand, to test undo cleanly
$eq('chapter 3 again', game_section_get($u, 'story')['chapter'], 3);
$u1 = gamesave_undo($u, [], $now + 330);
$ok('undo', $u1['ok'] ?? false);
$eq('…puts back what was live before the last load', game_section_get($u, 'story')['chapter'], 1);
$eq('…its own safety save is called plainly', gamesave_get($u, $u1['before'])['name'], 'Before undoing');
gamesave_undo($u, [], $now + 340);
$eq('undo again = redo', game_section_get($u, 'story')['chapter'], 3);
$eq('before-load saves are capped', (function () use ($u) { for ($i = 0; $i < 9; $i++) gamesave_undo($u, [], 1800000400 + $i); return gamesave_count($u, 'before_load'); })(), GAMESAVE_TUNE['beforeKeep']);
$ok('…and undo still works after the rotation', gamesave_undo($u, [], $now + 500)['ok'] ?? false);

// --- the bond, only when asked, and undo puts it back
$grow(1300);
$stageNow = bond_get($u)['stage'];
$r = gamesave_load($u, $s1['id'], true, [], $now + 600);
$eq('with the box: the save\'s bond (lower: the one way down, by choice)', bond_get($u)['stage'], 2);
$eq('…returned to the page', $r['bond']['stage'], 2);
$b = bond_get($u);
$eq('…quietly: no stage-up moment', $b['pending_stage'], null);
$eq('…remembered as set by a save, from the stage before', [$b['set_why'], $b['set_from']], ['save', $stageNow]);
$ok('…she feels the shift softly in her prompt', str_contains(bond_context($u), "another timeline's you"));
$shift = (function ($c) { $a = strpos($c, 'A shift'); return substr($c, $a, strpos($c, 'Go by') - $a); })(bond_context($u));
$ok('…the feeling itself has no numbers or game words', $shift !== '' && !preg_match('/\d|stage|save|setting|level/i', $shift));
gamesave_undo($u, [], $now + 610);
$eq('undo puts the bond back too', bond_get($u)['stage'], $stageNow);
gamesave_undo($u, [], $now + 620);
$eq('redo sets it again', bond_get($u)['stage'], 2);
gamesave_undo($u, [], $now + 630);

// --- a new game: the game starts over, the bond and her don't
$stageNow = bond_get($u)['stage'];
$scan = progress_load($u)['skills']['jun']['scanning']['xp'];
$r = gamesave_new_game($u, ['delve' => ['seed' => 5]], $now + 700);
$ok('a new game', $r['newGame'] ?? false);
$eq('…no sections', gamesave_live($u)['sections'], []);
$eq('…no Credits', progress_load($u)['credits'], 0);
$eq('…his game skills start over', array_keys(progress_load($u)['skills']['player']), ['focus']);
$eq('…her skills are hers', progress_load($u)['skills']['jun']['scanning']['xp'], $scan);
$eq('…the bond is hers too', bond_get($u)['stage'], $stageNow);
$eq('…the page clears its parts', (array)$r['client'], []);
$ok('…and it can be undone', gamesave_undo($u, [], $now + 710)['ok'] ?? false);
$eq('…back to the game before', game_section_get($u, 'story')['chapter'] ?? null, 3);

// --- keep, rename, delete
$auto = array_values(array_filter(gamesave_list($u), fn($x) => $x['kind'] === 'auto'))[0];
$eq('keep an autosave', gamesave_keep($u, $auto['id'])['ok'] ?? false, true);
$eq('…it\'s a named save now', gamesave_get($u, $auto['id'])['kind'], 'named');
$eq('rename', gamesave_rename($u, $s1['id'], 'Before the harbor')['ok'] ?? false, true);
$eq('…an empty name is refused', gamesave_rename($u, $s1['id'], '   ')['error'] ?? '', 'no_name');
$eq('another user can\'t touch it', [gamesave_rename(2, $s1['id'], 'x')['error'] ?? '', gamesave_get(2, $s1['id'])], ['gone', null]);
$eq('…nor load it', gamesave_load(2, $s1['id'], false, [], $now)['error'] ?? '', 'gone');
$last = gamesave_live($u)['lastLoad']['before'];
gamesave_delete($u, $last);
$ok('deleting the undo save turns undo off', !gamesave_live_view(gamesave_live($u))['canUndo']);
$eq('…undo says so', gamesave_undo($u, [], $now)['error'] ?? '', 'nothing_to_undo');
$eq('delete what\'s gone', gamesave_delete($u, 999999)['error'] ?? '', 'gone');

// --- files
$file = gamesave_export($u, $s1['id']);
$eq('a file says what it is', [$file['format'], $file['v'], $file['name']], ['jungame', 1, 'Before the harbor']);
$json = gamesave_json($file);
$back = json_decode($json, true);   // as it arrives from an upload
$i = gamesave_import($u, $back, $now + 800);
$ok('import', $i['ok'] ?? false);
$imp = gamesave_get($u, $i['id']);
$eq('…as a new named save', [$imp['kind'], $imp['name']], ['named', 'Before the harbor (imported)']);
$ok('…marked imported', $imp['summary']['imported'] ?? false);
$eq('…the same game inside', $imp['payload']['game']['sections']->story['chapter'] ?? null, 1);
$eq('…never loaded on its own', game_section_get($u, 'story')['chapter'], 3);
$shuffled = $back; $shuffled['payload'] = array_reverse($back['payload'], true);
$ok('key order doesn\'t matter for the checksum', gamesave_import($u, $shuffled, $now)['ok'] ?? false);
$bad = $back; $bad['payload']['progress']['credits'] = 1000000;
$eq('a changed file without a new checksum = damaged', gamesave_import($u, $bad, $now)['error'] ?? '', 'damaged');
$bad['sum'] = gamesave_sum($bad['payload']);
$ok('…edited on purpose with its checksum: that\'s the player\'s business', gamesave_import($u, $bad, $now)['ok'] ?? false);
$eq('a newer format', gamesave_import($u, ['v' => 9] + $back, $now)['error'] ?? '', 'newer');
$eq('not a save at all', gamesave_import($u, ['format' => 'zip'], $now)['error'] ?? '', 'not_a_save');
$eq('…or not even an object', gamesave_import($u, 'hello', $now)['error'] ?? '', 'not_a_save');
$evil = $back; $evil['payload']['game']['sections'] = ['../etc' => 1]; $evil['sum'] = gamesave_sum($evil['payload']);
$eq('a section name that isn\'t one', gamesave_import($u, $evil, $now)['error'] ?? '', 'not_a_save');
$evil = $back; $evil['payload']['progress']['skills'] = ['delving' => ['xp' => -50, 'marks' => 'lots'], 'Bad!' => ['xp' => 5]];
$evil['payload']['progress']['credits'] = -10; $evil['payload']['progress']['items'] = 'many';
$evil['payload']['bond'] = ['xp' => 3000, 'stage' => 1]; $evil['payload']['jun'] = ['scanning' => 99999];
$evil['sum'] = gamesave_sum($evil['payload']);
$clean = gamesave_get($u, gamesave_import($u, $evil, $now)['id'])['payload'];
$eq('…values are cleaned: xp and Credits never below zero', [((array)$clean['progress']['skills'])['delving']['xp'], $clean['progress']['credits']], [0, 0]);
$ok('…bad skill names dropped', !isset(((array)$clean['progress']['skills'])['Bad!']));
$eq('…a wrong type goes back to empty', $clean['progress']['items'], []);
$eq('…the bond\'s stage comes from its xp, never from the file', $clean['bond']['stage'], bond_stage_for(3000));
$ok('…anything unknown is dropped (no way to smuggle her in)', !isset($clean['jun']));
$huge = $back; $huge['payload']['client'] = ['delve' => str_repeat('y', GAMESAVE_TUNE['sectionMax'] + 1)]; $huge['sum'] = gamesave_sum($huge['payload']);
$eq('a part too big', gamesave_import($u, $huge, $now)['error'] ?? '', 'too_big');

// --- the manual bond adjust (Settings, behind More) is the same quiet door
bond_set($u, bond_xp_of_stage(5), 'hand', $now);
$b = bond_get($u);
$eq('set by hand to Partner', [$b['stage'], $b['set_why'], $b['pending_stage']], [5, 'hand', null]);
$ok('her prompt: closer, no blame, no game words', str_contains(bond_context($u), 'closer than you remember') && !str_contains(bond_context($u), 'timeline'));
$eq('setting the stage it already is changes nothing', bond_set($u, bond_xp_of_stage(5), 'hand', $now + 5)['set_at'], $now);
$eq('a stage\'s xp', [bond_xp_of_stage(1), bond_xp_of_stage(6), bond_xp_of_stage(99)], [0, 5000, 5000]);
$eq('an unknown reason is "by hand"', bond_set($u, 0, 'cheat', $now + 9)['set_why'], 'hand');
$eq('…and the daily cap is untouched', bond_get($u)['day_xp'], $b['day_xp']);

// --- what goes where: his skills / things can stay as they are now when he loads a save
$p = progress_load($u); $p['credits'] = 1000; $p['items'] = ['old_servo' => 2]; $p['skills']['player']['delving'] = ['xp' => 5000, 'marks' => 0];
progress_save($u, $p);
$k = gamesave_save($u, 'named', 'Keep test', [], $now + 900);
$p = progress_load($u); $p['credits'] = 7; $p['items'] = []; $p['skills']['player']['delving'] = ['xp' => 10, 'marks' => 0];
progress_save($u, $p);
gamesave_load($u, $k['id'], false, [], $now + 910, null, ['things', 'nonsense']);
$p = progress_load($u);
$eq('keep things: his Credits and items stay as they are now', [$p['credits'], $p['items']], [7, []]);
$eq('…his skills come from the save', $p['skills']['player']['delving']['xp'], 5000);
$eq('…unknown keep words are dropped', gamesave_live($u)['lastLoad']['kept'], ['things']);
$p['skills']['player']['delving'] = ['xp' => 10, 'marks' => 0]; progress_save($u, $p);
gamesave_load($u, $k['id'], false, [], $now + 920, null, ['skills']);
$p = progress_load($u);
$eq('keep skills: the save\'s things, his skills as they are now', [$p['credits'], $p['skills']['player']['delving']['xp']], [1000, 10]);
gamesave_load($u, $k['id'], false, [], $now + 930);
$eq('the natural way: everything from the save', progress_load($u)['skills']['player']['delving']['xp'], 5000);

// --- the rest of the app
$ok('in the factory reset', str_contains(file_get_contents("$repo/auth.php"), "'game_state', 'game_saves'"));
$src = file_get_contents("$repo/lib/gamesave.php");
$eq('never touches her memories, chats or feelings', preg_match('/memory_|messages|relationship_set|feel_|touch_/', $src), 0);
$eq('the bond only through bond_set', preg_match_all('/bond_(award|set|clear)\b/', $src), 1);

echo $fails ? "\n$fails failed\n" : "\nall ok\n";
exec('rm -rf ' . escapeshellarg($tmp));
exit($fails ? 1 : 0);
