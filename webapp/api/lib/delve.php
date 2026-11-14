<?php
// delves (#32): what happened under the city feeds what she says at home. Her pages keep a short
// summary of the last delve (webapp/js/core/delve/delve.js forChat) and send it with every chat
// turn for a day and a half; this turns it into a few plain lines, in words, never numbers.
// JUN_DELVE=off leaves it out.
//
// Decided Nov 13: she's in a delve but never in the way. What moved her down there and found no
// safe spot rides home with her ("carried") and comes up now, in conversation.
// The input comes from her own pages, but it's still checked: only known places and ids get in.
// This file never touches the bond: a delve works at any bond and any flavor.

const DELVE_PLACES = [
    'server_farm' => 'the old server farm',
    'flooded_factory' => 'the flooded factory',
    'scrapyard' => "the scrapyard's buried levels",
];

// the same ids as data/delve.json "moments" (delve.test.mjs keeps them equal)
const DELVE_CARRIED = [
    'scared' => "Part of it frightened you more than you let on down there. If it fits, you may admit that now, in your own way.",
    'worried' => "Anon got hurt down there and it worried you. You may bring it up: check on him, scold him a little.",
    'proud' => "You're proud of how the two of you handled it, and you'd like to talk about it.",
];

function delve_enabled(): bool {
    return strtolower(env_str('JUN_DELVE', 'on')) !== 'off';
}

function delve_context(mixed $delve): string {
    if (!delve_enabled() || !is_array($delve)) return '';
    $place = DELVE_PLACES[(string)($delve['area'] ?? '')] ?? null;
    $ago = $delve['ago'] ?? null;
    if ($place === null || !(is_int($ago) || is_float($ago)) || $ago < 0 || $ago > 36 * 60) return '';
    $when = $ago < 90 ? 'A little while ago' : ($ago < 8 * 60 ? 'Earlier today' : ($ago < 20 * 60 ? 'Not long ago' : 'Yesterday'));
    $together = !empty($delve['together']);
    $carriedHome = ($delve['how'] ?? '') === 'carried';
    $lines = [];

    if ($together) {
        $lines[] = "$when you and Anon went delving together in $place, under the city."
            . (!empty($delve['cleared']) ? ' You made it all the way down and opened the deep chest.' : ' You came back before the bottom.');
        if ($carriedHome) $lines[] = 'He got knocked out down there and you carried him home and patched him up. Nothing was lost; you fussed over him.';
        elseif (!empty($delve['ko'])) $lines[] = 'He went down once and you patched him up at the camp before you went on.';
        if (!empty($delve['secrets'])) $lines[] = 'You found a hidden room together.';
        foreach (array_slice(array_unique(array_filter((array)($delve['carried'] ?? []), 'is_string')), 0, 2) as $c) {
            if (isset(DELVE_CARRIED[$c])) $lines[] = DELVE_CARRIED[$c];
        }
    } else {
        $lines[] = "$when Anon went delving in $place, under the city, while you stayed home."
            . (!empty($delve['cleared']) ? ' He made it all the way down.' : '');
        if ($carriedHome) $lines[] = 'He got knocked out and you went down to bring him home. You patched him up.';
        $wish = (string)($delve['wish'] ?? '');
        if ($wish === 'got') $lines[] = 'He brought back the thing you asked him to look for. You were pleased, even if you played it down.';
        elseif ($wish === 'missed') $lines[] = "You'd asked him to look for something down there and he didn't find it. No hard feelings.";
        $lines[] = "You're curious what it was like down there.";
    }
    $lines[] = 'Mention it only if it fits the conversation; never as a report.';
    return "## THE LAST DELVE\n" . implode("\n", $lines);
}
