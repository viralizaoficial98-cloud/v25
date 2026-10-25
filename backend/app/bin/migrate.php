<?php
declare(strict_types=1);

// Aplica migrações pendentes (database/migrations/*.sql) por ordem, sem apagar dados.
// Uso: php bin/migrate.php [--status]
require dirname(__DIR__) . '/bootstrap.php';

use App\Support\Db;

$pdo = Db::pdo();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
$applied = array_column(Db::all('SELECT version FROM schema_migrations'), 'version');
$files = glob(APP_ROOT . '/database/migrations/*.sql') ?: [];
sort($files);
$pending = array_filter($files, fn ($f) => !in_array(basename($f, '.sql'), $applied, true));

if (in_array('--status', $argv, true)) {
    foreach ($files as $f) {
        printf("%s %s\n", in_array(basename($f, '.sql'), $applied, true) ? '[x]' : '[ ]', basename($f));
    }
    exit(0);
}
if (!$pending) {
    echo "Base de dados actualizada. Nenhuma migração pendente.\n";
    exit(0);
}
foreach ($pending as $f) {
    $version = basename($f, '.sql');
    echo "A aplicar $version... ";
    $sql = (string) file_get_contents($f);
    // Divide por ";" no fim de linha (os ficheiros não usam DELIMITER nem procedimentos)
    $statements = array_filter(array_map('trim', preg_split('/;\s*(\r?\n|$)/', preg_replace('/^\s*--.*$/m', '', $sql)) ?: []));
    try {
        foreach ($statements as $st) {
            $pdo->exec($st);
        }
        Db::run('INSERT INTO schema_migrations (version) VALUES (:v)', ['v' => $version]);
        echo "ok\n";
    } catch (Throwable $e) {
        // DDL em MySQL faz commit implícito: a migração deve ser corrigida e reaplicada manualmente.
        fwrite(STDERR, "\nERRO em $version: " . $e->getMessage() . "\n");
        exit(1);
    }
}
echo "Concluído.\n";
