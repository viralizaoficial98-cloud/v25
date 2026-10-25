<?php
declare(strict_types=1);

namespace App\Support;

use PDO;
use PDOException;
use PDOStatement;

/** Ligação PDO (MySQL/MariaDB) com prepared statements reais e transacções com nova tentativa. */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Env::get('DB_HOST', 'localhost'),
                Env::int('DB_PORT', 3306),
                Env::require('DB_DATABASE'),
            );
            if ($socket = Env::get('DB_SOCKET')) {
                $dsn = sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $socket, Env::require('DB_DATABASE'));
            }
            self::$pdo = new PDO($dsn, Env::require('DB_USERNAME'), Env::get('DB_PASSWORD', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            self::$pdo->exec("SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
        }
        return self::$pdo;
    }

    /** @param array<int|string,mixed> $params */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        foreach ($params as $k => $v) {
            $name = is_int($k) ? $k + 1 : (str_starts_with($k, ':') ? $k : ':' . $k);
            $type = match (true) {
                is_int($v) => PDO::PARAM_INT,
                is_bool($v) => PDO::PARAM_INT,
                $v === null => PDO::PARAM_NULL,
                default => PDO::PARAM_STR,
            };
            $st->bindValue($name, is_bool($v) ? (int) $v : $v, $type);
        }
        $st->execute();
        return $st;
    }

    /** @return array<string,mixed>|null */
    public static function one(string $sql, array $params = []): ?array
    {
        $r = self::run($sql, $params)->fetch();
        return $r === false ? null : $r;
    }

    /** @return list<array<string,mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    /** @param array<string,mixed> $row */
    public static function insert(string $table, array $row): void
    {
        $cols = array_keys($row);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(', ', array_map(fn ($c) => "`$c`", $cols)),
            implode(', ', array_map(fn ($c) => ":$c", $cols)),
        );
        self::run($sql, $row);
    }

    /**
     * Executa $fn numa transacção. Repete até 3 vezes em deadlock/lock timeout
     * (InnoDB 1213/1205), que são esperados sob concorrência.
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        for ($attempt = 1; ; $attempt++) {
            $pdo->beginTransaction();
            try {
                $result = $fn();
                $pdo->commit();
                return $result;
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                $code = $e instanceof PDOException ? (int) ($e->errorInfo[1] ?? 0) : 0;
                if (in_array($code, [1213, 1205], true) && $attempt < 3) {
                    usleep(random_int(20_000, 120_000));
                    continue;
                }
                throw $e;
            }
        }
    }

    public static function isDuplicateKey(\Throwable $e, ?string $key = null): bool
    {
        return $e instanceof PDOException && (int) ($e->errorInfo[1] ?? 0) === 1062
            && ($key === null || str_contains((string) $e->getMessage(), $key));
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }
}
