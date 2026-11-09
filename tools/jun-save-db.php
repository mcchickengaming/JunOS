<?php
// a safe copy of her database for a save point (desktop/saves.js).
// VACUUM INTO is sqlite's own consistent copy: it works while her
// server is running and writing, a plain file copy could catch the
// db halfway through a write (and miss what's still in -wal).
//
//   php jun-save-db.php copy  <omega.sqlite> <dest>   copy + check
//   php jun-save-db.php check <file>                   check only
// prints one line of JSON: {"ok":true,"schema":30} or {"ok":false,"error":"..."}

function out(array $a): never {
    echo json_encode($a), "\n";
    exit(empty($a['ok']) ? 1 : 0);
}

function check(string $file): array {
    $db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $ok = $db->query('PRAGMA integrity_check')->fetchColumn();
    if ($ok !== 'ok') return ['ok' => false, 'error' => 'integrity: ' . $ok];
    $schema = 0;
    try { $schema = (int) $db->query('SELECT MAX(v) FROM schema_version')->fetchColumn(); } catch (Throwable) {}
    return ['ok' => true, 'schema' => $schema];
}

try {
    $mode = $argv[1] ?? '';
    if ($mode === 'copy' && isset($argv[2], $argv[3])) {
        [$src, $dst] = [$argv[2], $argv[3]];
        if (!is_file($src)) out(['ok' => false, 'error' => 'no database at ' . $src]);
        if (file_exists($dst)) @unlink($dst);
        $db = new PDO('sqlite:' . $src, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA busy_timeout=15000');
        $db->exec('VACUUM INTO ' . $db->quote($dst));
        $db = null;
        out(check($dst));
    }
    if ($mode === 'check' && isset($argv[2])) out(check($argv[2]));
    out(['ok' => false, 'error' => 'usage']);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => $e->getMessage()]);
}
