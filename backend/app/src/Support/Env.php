<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Carrega variáveis de um ficheiro .env privado (fora da pasta pública).
 * Variáveis definidas no ambiente real do processo têm prioridade.
 */
final class Env
{
    /** @var array<string,string> */
    private static array $vars = [];

    public static function load(string $file): void
    {
        if (!is_file($file) || !is_readable($file)) {
            return;
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[strlen($v) - 1] === $v[0]) {
                $v = substr($v, 1, -1);
            } elseif (($p = strpos($v, ' #')) !== false) {
                $v = rtrim(substr($v, 0, $p));
            }
            self::$vars[$k] = $v;
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $real = getenv($key);
        if ($real !== false && $real !== '') {
            return $real;
        }
        $v = self::$vars[$key] ?? null;
        return ($v === null || $v === '') ? $default : $v;
    }

    public static function require(string $key): string
    {
        $v = self::get($key);
        if ($v === null) {
            throw new \RuntimeException("Variável de ambiente em falta: {$key}");
        }
        return $v;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $v = self::get($key);
        return $v === null ? $default : in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }

    public static function int(string $key, int $default): int
    {
        $v = self::get($key);
        return $v === null || !is_numeric($v) ? $default : (int) $v;
    }
}
