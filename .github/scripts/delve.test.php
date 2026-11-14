<?php
// usage: php .github/scripts/delve.test.php
// delves (#32, lib/delve.php): the last delve becomes a few plain lines in her prompt, in words,
// never numbers; only known places and moments get through; old news is dropped; JUN_DELVE=off
// leaves it out. It works the same at any bond: this file never asks for one.
$repo = __DIR__ . '/../../webapp/api';
require "$repo/lib/env.php";
require "$repo/lib/delve.php";

$fails = 0;
$eq = function (string $name, $got, $want) use (&$fails) {
    if ($got === $want) { echo "  ok   $name\n"; return; }
    echo "  FAIL $name: wanted " . var_export($want, true) . ', got ' . var_export($got, true) . "\n";
    $fails++;
};
$has = fn(string $name, string $hay, string $needle, bool $want = true) => $eq($name, str_contains($hay, $needle), $want);

$eq('nothing sent', delve_context(null), '');
$eq('not an array', delve_context('hello'), '');
$eq('a place nobody knows', delve_context(['ago' => 10, 'area' => 'the moon', 'together' => true]), '');
$eq('no time', delve_context(['area' => 'server_farm']), '');
$eq('old news', delve_context(['ago' => 37 * 60, 'area' => 'server_farm', 'together' => true]), '');

$c = delve_context(['ago' => 30, 'area' => 'server_farm', 'together' => true, 'cleared' => true, 'floors' => 3, 'of' => 3, 'ko' => 0, 'how' => 'home',
    'carried' => ['scared', 'proud', 'worried', '<script>'], 'secrets' => 1]);
$has('header', $c, '## THE LAST DELVE');
$has('when and where', $c, 'A little while ago you and Anon went delving together in the old server farm');
$has('all the way down', $c, 'opened the deep chest');
$has('a hidden room', $c, 'hidden room');
$has('what she kept to herself', $c, 'frightened you more than you let on');
$has('at most two of them', $c, 'worried you', false);
$has('nothing unknown gets in', $c, 'script', false);
$eq('never a number', preg_match('/\d/', $c), 0);
$has('never a report', $c, 'never as a report');

$c = delve_context(['ago' => 300, 'area' => 'flooded_factory', 'together' => true, 'cleared' => false, 'ko' => 1, 'how' => 'carried', 'carried' => []]);
$has('earlier today', $c, 'Earlier today');
$has('came back early', $c, 'came back before the bottom');
$has('she carried him home', $c, 'you carried him home and patched him up');
$has('nothing was lost', $c, 'Nothing was lost');

$c = delve_context(['ago' => 25 * 60, 'area' => 'scrapyard', 'together' => false, 'cleared' => true, 'how' => 'home', 'wish' => 'got', 'carried' => ['scared']]);
$has('yesterday, alone', $c, 'Yesterday Anon went delving in the scrapyard\'s buried levels, under the city, while you stayed home.');
$has('he brought it back', $c, 'brought back the thing you asked');
$has('she is curious', $c, "curious what it was like");
$has('she kept nothing: she was not there', $c, 'frightened', false);

$c = delve_context(['ago' => 60, 'area' => 'server_farm', 'together' => false, 'how' => 'carried', 'wish' => 'missed']);
$has('she came down for him', $c, 'you went down to bring him home');
$has('no hard feelings', $c, 'No hard feelings');

putenv('JUN_DELVE=off'); $_ENV['JUN_DELVE'] = 'off';
$eq('off leaves it out', delve_context(['ago' => 30, 'area' => 'server_farm', 'together' => true]), '');

// the bond is none of a delve's business
$src = file_get_contents("$repo/lib/delve.php");
$code = preg_replace('~//.*$~m', '', $src);
$eq('never touches the bond', preg_match('/bond_|relationship_|affection|trust/', $code), 0);

echo $fails ? "\n$fails failed\n" : "\nall good\n";
exit($fails ? 1 : 0);
