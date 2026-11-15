<?php
// The debug menu's spawn tools (owner, Nov 15: "a spawn menu so we can test any new items we add"). F12 in any of her
// windows opens the debug menu (webapp/debug-menu.html); its Spawn tool asks this file.
//
// Everything you can spawn comes from the catalog (data/items.json): a new item there is spawnable at once, no code.
// Spawning is the ONE way around "a page can never give itself anything" (lib/inventory.php), so it's fenced:
//   * TEST MODE has to be on first (the menu's switch, per account, in the progression blob's `opt.test`); off = refused
//   * every spawn and clear is logged as `spawned` / `cleared` with `test: true` (the progress log), so it's never a mystery
//   * it only ever touches the game's side (Credits, the wallet, items, keepsakes): never the bond, her skills or her
//     feelings, never desktop Jun. Game saves carry whatever you spawned, like anything else you own.
// Turning test mode off keeps what you spawned; "Clear my things" (test mode only) empties the game's money and things.
//
// Tests: .github/scripts/inventory.test.php (the spawn part).

const DEBUG_SPAWN_MAX = 1000000;

function debug_catalog(array $d): array {
    $out = [];
    foreach ($d['currencies'] as $id => $c) $out[] = ['id' => $id, 'kind' => 'currency', 'group' => 'Currencies', 'name' => $c['name'], 'line' => $c['line'] ?? '', 'icon' => $c['icon'] ?? ''];
    foreach ($d['items'] as $id => $it) {
        $k = $it['kind'] ?? 'other';
        $out[] = ['id' => $id, 'kind' => $k === 'keepsake' ? 'keepsake' : 'item', 'group' => $d['kinds'][$k]['name'] ?? 'Other things',
            'order' => $d['kinds'][$k]['order'] ?? 99, 'name' => $it['name'], 'line' => $it['line'] ?? '', 'tier' => $it['tier'] ?? null, 'sample' => !empty($it['sample'])];
    }
    return $out;
}

function debug_test_on(array $state): bool {
    return !empty($state['opt']['test']);
}

function debug_set_test(array &$state, bool $on, int $now): void {
    if (debug_test_on($state) === $on) return;
    $state['opt']['test'] = $on;
    progress_log($state, ['type' => $on ? 'test_on' : 'test_off', 'test' => true], $now);
}

// spawn something from the catalog: a currency (amount), an item (count) or a keepsake (one of each, like always)
function debug_spawn(array &$state, array $d, string $id, int $amount, int $now): array {
    if (!debug_test_on($state)) return ['error' => 'test_off'];
    $amount = max(1, min(DEBUG_SPAWN_MAX, $amount));
    if (isset($d['currencies'][$id])) {
        $drop = ['id' => $id, 'kind' => 'currency', 'amount' => $amount];
    } elseif (isset($d['items'][$id])) {
        $keep = ($d['items'][$id]['kind'] ?? '') === 'keepsake';
        $drop = ['id' => $id, 'kind' => $keep ? 'keepsake' : 'item'];
        if ($keep) $amount = 1;
    } else {
        return ['error' => 'unknown'];
    }
    $got = [];
    if ($drop['kind'] === 'item') {
        $state['items'][$id] = ($state['items'][$id] ?? 0) + $amount;
        $got[] = ['id' => $id, 'kind' => 'item', 'count' => $amount];
    } else {
        $got = progress_give($state, progress_data(), [$drop], 'Spawned (test mode)', $now);
    }
    progress_log($state, ['type' => 'spawned', 'id' => $id, 'amount' => $amount, 'test' => true], $now);
    return ['ok' => true, 'got' => $got];
}

// test mode only: the game's money and things back to nothing (her skills, the bond and desktop Jun untouched)
function debug_clear(array &$state, int $now): array {
    if (!debug_test_on($state)) return ['error' => 'test_off'];
    $state['credits'] = 0;
    $state['wallet'] = [];
    $state['items'] = [];
    $state['keepsakes'] = [];
    progress_log($state, ['type' => 'cleared', 'test' => true], $now);
    return ['ok' => true];
}

// the last few spawns, newest first, for the menu
function debug_recent(array $state, int $n = 12): array {
    $out = [];
    foreach (array_reverse($state['log']) as $e) {
        if (!in_array($e['type'] ?? '', ['spawned', 'cleared', 'test_on', 'test_off'], true)) continue;
        $out[] = $e;
        if (count($out) >= $n) break;
    }
    return $out;
}
