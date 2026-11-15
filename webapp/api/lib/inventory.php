<?php
// Items, currencies and keepsakes (#9 base, Nov 15): what the player owns in the game, shown, checked and spent in one
// place. Everything you can own is data (webapp/data/items.json): five currencies (Credits, Materials, Salvage Sigils,
// Whispers, Citizen Pass points), items by kind (a material tier where it matters), and keepsakes.
//
// WHERE it lives: the player's side of the progression blob (lib/progress.php: `credits`, `wallet` for the other
// currencies, `items` id → count, `keepsakes` [{ id, at, from }]), so game saves carry all of it and the one reward
// roller keeps paying into it. This file never grants: things come from the progression service (activities' rolls,
// story grants by id, once each). A page can never hand itself something; it can only SPEND (which only ever takes).
//
// Rules (tested, .github/scripts/inventory.test.php):
//   * keepsakes are memories made physical: never spent, never sold, one of each (owner Nov 14-15)
//   * a spend is all or nothing: if anything is short, nothing is taken, and it says what's missing
//   * every id the progression service can hand out has a catalog entry (so nothing shows as a bare id)
//   * nothing here reads or touches the bond or desktop Jun

const INVENTORY_CURRENCY_IDS = ['credits', 'materials', 'salvage_sigils', 'whispers', 'citizen_pass'];

function inventory_data(?string $path = null): array {
    static $d = null;
    if ($d === null || $path !== null) {
        $path ??= __DIR__ . '/../../data/items.json';
        $j = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
        $d = is_array($j) ? $j : ['currencies' => [], 'kinds' => [], 'items' => []];
    }
    return $d;
}

// the catalog's own rules + every id the progression data can give (empty = all good)
function inventory_validate(array $d, array $progress): array {
    $e = [];
    foreach (INVENTORY_CURRENCY_IDS as $c) if (!isset($d['currencies'][$c])) $e[] = "currency $c is missing";
    foreach ($d['currencies'] as $id => $c) {
        if (isset($d['items'][$id])) $e[] = "$id is both a currency and an item";
        if (!is_string($c['name'] ?? null)) $e[] = "currency $id: name";
    }
    foreach ($d['items'] as $id => $it) {
        if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', $id)) $e[] = "item $id: bad id";
        if (!isset($d['kinds'][$it['kind'] ?? ''])) $e[] = "item $id: unknown kind";
        if (!is_string($it['name'] ?? null) || trim($it['name']) === '') $e[] = "item $id: name";
        if (($it['kind'] ?? '') === 'keepsake' && !empty($it['sell'])) $e[] = "keepsake $id can't be sold";
        if (isset($it['tier']) && (!is_int($it['tier']) || $it['tier'] < 1 || $it['tier'] > 6)) $e[] = "item $id: tier 1..6";
    }
    // every id the progression service can hand out
    $check = function (array $r, string $where) use ($d, &$e) {
        $id = (string)($r['id'] ?? '');
        $kind = (string)($r['kind'] ?? '');
        if ($kind === 'currency') { if (!isset($d['currencies'][$id])) $e[] = "$where: unknown currency $id"; return; }
        if ($kind === 'item' && (($d['items'][$id]['kind'] ?? '') === 'keepsake' || !isset($d['items'][$id]))) $e[] = "$where: $id needs an item entry";
        if ($kind === 'keepsake' && ($d['items'][$id]['kind'] ?? '') !== 'keepsake') $e[] = "$where: $id needs a keepsake entry";
    };
    foreach ($progress['pools'] ?? [] as $pn => $pool) foreach ($pool as $r) $check($r, "pool $pn");
    foreach ($progress['activities'] ?? [] as $an => $a) foreach ($a['signature'] ?? [] as $r) $check($r, "activity $an");
    foreach ($progress['story'] ?? [] as $sn => $s) foreach ($s['give'] ?? [] as $r) $check($r, "story $sn");
    foreach ($progress['buffs'] ?? [] as $bn => $b) if (($b['scope'] ?? '') === 'worn' && !isset($d['items'][$b['item'] ?? ''])) $e[] = "buff $bn: its item";
    return $e;
}

function inventory_amount(array $state, string $currency): int {
    return $currency === 'credits' ? (int)$state['credits'] : (int)($state['wallet'][$currency] ?? 0);
}

// what a page shows: currencies (all five, zeros too, so the player learns they exist), items grouped by kind in the
// catalog's order, keepsakes with when and where from. Unknown ids still show, plainly.
function inventory_view(array $state, array $d): array {
    $cur = [];
    foreach ($d['currencies'] as $id => $c) {
        $cur[] = ['id' => $id, 'name' => $c['name'], 'line' => $c['line'] ?? '', 'icon' => $c['icon'] ?? '', 'amount' => inventory_amount($state, $id)];
    }
    $groups = [];
    foreach ((array)$state['items'] as $id => $n) {
        if ((int)$n <= 0) continue;
        $it = $d['items'][$id] ?? null;
        $kind = $it['kind'] ?? 'other';
        $groups[$kind][] = ['id' => (string)$id, 'name' => $it['name'] ?? 'Something you found', 'line' => $it['line'] ?? '', 'count' => (int)$n,
            'tier' => $it['tier'] ?? null, 'sell' => !empty($it['sell']), 'known' => (bool)$it];
    }
    $kinds = [];
    foreach ($groups as $k => $list) {
        usort($list, fn($a, $b) => strcmp($a['name'], $b['name']));
        $kinds[] = ['kind' => $k, 'name' => $d['kinds'][$k]['name'] ?? 'Other things', 'order' => $d['kinds'][$k]['order'] ?? 99, 'items' => $list];
    }
    usort($kinds, fn($a, $b) => $a['order'] <=> $b['order']);
    $keep = [];
    foreach ((array)$state['keepsakes'] as $k) {
        $it = $d['items'][$k['id'] ?? ''] ?? null;
        $keep[] = ['id' => (string)($k['id'] ?? ''), 'name' => $it['name'] ?? 'A keepsake', 'line' => $it['line'] ?? '', 'at' => (int)($k['at'] ?? 0), 'from' => (string)($k['from'] ?? '')];
    }
    return ['currencies' => $cur, 'kinds' => $kinds, 'keepsakes' => $keep, 'keepsakeLine' => $d['kinds']['keepsake']['line'] ?? ''];
}

// a cost: { currencies: { id: n }, items: { id: n } }. Keepsakes are never part of one.
function inventory_clean_cost(mixed $cost, array $d): array {
    $out = ['currencies' => [], 'items' => []];
    if (!is_array($cost)) return ['error' => 'bad_cost'];
    foreach ((array)($cost['currencies'] ?? []) as $id => $n) {
        if (!isset($d['currencies'][$id]) || !is_int($n) || $n <= 0) return ['error' => 'bad_cost'];
        $out['currencies'][$id] = $n;
    }
    foreach ((array)($cost['items'] ?? []) as $id => $n) {
        if (!is_string($id) || !is_int($n) || $n <= 0) return ['error' => 'bad_cost'];
        if (($d['items'][$id]['kind'] ?? '') === 'keepsake') return ['error' => 'keepsake'];
        $out['items'][$id] = $n;
    }
    if (!$out['currencies'] && !$out['items']) return ['error' => 'bad_cost'];
    return $out;
}

// what's short, in the cost's own shape (empty = you have it all)
function inventory_missing(array $state, array $cost): array {
    $miss = ['currencies' => [], 'items' => []];
    foreach ($cost['currencies'] as $id => $n) { $have = inventory_amount($state, $id); if ($have < $n) $miss['currencies'][$id] = $n - $have; }
    foreach ($cost['items'] as $id => $n) { $have = (int)($state['items'][$id] ?? 0); if ($have < $n) $miss['items'][$id] = $n - $have; }
    return ($miss['currencies'] || $miss['items']) ? $miss : [];
}

// spend: all or nothing. Returns ['ok'] or ['error' => 'not_enough', 'missing' => …] / a cost error.
function inventory_take(array &$state, mixed $cost, array $d, string $why, int $now): array {
    $c = inventory_clean_cost($cost, $d);
    if (isset($c['error'])) return $c;
    $miss = inventory_missing($state, $c);
    if ($miss) return ['error' => 'not_enough', 'missing' => $miss];
    foreach ($c['currencies'] as $id => $n) {
        if ($id === 'credits') $state['credits'] -= $n;
        else { $state['wallet'][$id] -= $n; if ($state['wallet'][$id] <= 0) unset($state['wallet'][$id]); }
    }
    foreach ($c['items'] as $id => $n) { $state['items'][$id] -= $n; if ($state['items'][$id] <= 0) unset($state['items'][$id]); }
    progress_log($state, ['type' => 'spent', 'why' => mb_substr($why, 0, 60), 'cost' => $c], $now);
    return ['ok' => true, 'spent' => $c];
}

// a cost in words, for the page: "40 Credits and 2 Good parts"
function inventory_words(array $cost, array $d): string {
    $bits = [];
    foreach ($cost['currencies'] ?? [] as $id => $n) $bits[] = $n . ' ' . ($d['currencies'][$id]['name'] ?? $id);
    foreach ($cost['items'] ?? [] as $id => $n) $bits[] = ($n > 1 ? $n . ' × ' : '') . ($d['items'][$id]['name'] ?? $id);
    return count($bits) <= 1 ? ($bits[0] ?? '') : implode(', ', array_slice($bits, 0, -1)) . ' and ' . end($bits);
}
