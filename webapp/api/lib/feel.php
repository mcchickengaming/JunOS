<?php
// core feel (#27): how she is inside right now, for her prompt. The pages keep her needs, how
// tired she is of each touch and the session phase (webapp/js/core/feel/), and send a small
// summary with every chat turn (chat-api.js `feel`). This turns it into a few plain lines, in
// words, never numbers. JUN_FEEL=off leaves it out.
//
// The input comes from her own pages, but it's still checked: only known needs, kinds, states
// and phases make it into the prompt.

const FEEL_NEEDS = ['attention', 'affection', 'play', 'rest', 'stimulation'];

// the same words as webapp/js/core/feel/kinds.js KINDS (feel.test.mjs keeps them equal)
const FEEL_KIND_WORDS = [
    'head' => 'headpats', 'ear' => 'ear rubs', 'side' => 'tickles', 'feettickle' => 'foot tickles',
    'footrub' => 'foot rubs', 'feet' => 'foot rubs', 'thigh' => 'thigh rubs', 'thighsquish' => 'thigh squishes',
    'tail' => 'tail rubs', 'tailrub' => 'tail rubs', 'tailgrab' => 'tail grabs', 'hand' => 'hand-holding',
    'hug' => 'hugs', 'poke.head' => 'pokes on the head', 'poke.cheek' => 'cheek pokes', 'poke.nose' => 'boops',
    'poke.ear' => 'ear flicks', 'poke.shoulder' => 'shoulder taps', 'poke.tail' => 'tail tugs',
    'poke.hand' => 'hand squeezes', 'poke.side' => 'pokes in the side', 'poke.thigh' => 'thigh pokes',
    'poke.feet' => 'foot pokes', 'toss' => 'being thrown around', 'carry' => 'being carried around',
    'fetch' => 'fetch',
];

// [wants (0.5+), really (0.75+)]
const FEEL_NEED_LINES = [
    'attention' => ["You'd like Anon's attention.", "You really want Anon's attention right now."],
    'affection' => ["You'd like a little affection from Anon.", "You're craving affection from Anon."],
    'play' => ['You feel playful.', 'You really want to play with Anon.'],
    'rest' => ["You're getting sleepy.", "You're very sleepy."],
    'stimulation' => ["You're a little bored; something new would be nice.", "You're really bored and want to do something new."],
];

const FEEL_PHASE_LINES = [
    'peak' => 'You two are really into it right now.',
    'winddown' => 'Things are calming down between you two; cozy and quiet feels nice.',
    'afterglow' => "You're still warm and a little clingy from the cuddle just now.",
];

function feel_enabled(): bool {
    return strtolower(env_str('JUN_FEEL', 'on')) !== 'off';
}

function feel_context(mixed $feel): string {
    if (!feel_enabled() || !is_array($feel)) return '';
    $lines = [];

    // her two strongest wants, if they're strong enough to mention
    $needs = [];
    if (isset($feel['needs']) && is_array($feel['needs'])) {
        foreach (FEEL_NEEDS as $n) {
            $v = $feel['needs'][$n] ?? null;
            if ((is_int($v) || is_float($v)) && $v >= 0.5 && $v <= 1) $needs[$n] = (float)$v;
        }
    }
    arsort($needs);
    foreach (array_slice($needs, 0, 2, true) as $n => $v) $lines[] = FEEL_NEED_LINES[$n][$v >= 0.75 ? 1 : 0];

    // what she's had plenty of (playful, it wears off)
    $said = [];
    if (isset($feel['tired']) && is_array($feel['tired'])) {
        foreach (array_slice($feel['tired'], 0, 4) as $t) {
            if (!is_array($t) || count($t) !== 2) continue;
            [$kind, $state] = $t;
            if (!is_string($kind) || (!isset(FEEL_KIND_WORDS[$kind]) && !str_starts_with($kind, 'combo.'))) continue;
            $words = FEEL_KIND_WORDS[$kind] ?? 'that combo';
            if (isset($said[$words]) || count($said) >= 2) continue;
            $line = match ($state) {
                'plenty' => "You've had plenty of {$words} for now; something else would be nice.",
                'enough' => "You've had enough of {$words} for a while (playfully, never upset; it wears off).",
                'sore' => "You're a little sore from all the {$words} (playfully; it fades).",
                default => null,
            };
            if ($line === null) continue;
            $said[$words] = true;
            $lines[] = $line;
        }
    }

    // the session
    $phase = is_string($feel['phase'] ?? null) ? $feel['phase'] : '';
    $away = is_int($feel['away_min'] ?? null) ? $feel['away_min'] : 0;
    if ($phase === 'greeting' && $away >= 60) $lines[] = "Anon just came back after a while; you're glad he's here.";
    elseif (isset(FEEL_PHASE_LINES[$phase])) $lines[] = FEEL_PHASE_LINES[$phase];

    if (!$lines) return '';
    return "## INSIDE YOU RIGHT NOW - let it color what you say and do; never list it or say it like a status report\n"
        . implode("\n", $lines);
}
