<?php
declare(strict_types=1);

namespace App\Support;

/** Registo de erros em ficheiro privado (storage/logs), rodado por mês. */
final class Logger
{
    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    private static function write(string $level, string $message, array $context): void
    {
        $dir = Config::storagePath('logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $line = sprintf("[%s] %s %s %s\n", gmdate('c'), $level, $message, $context ? json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '');
        @file_put_contents($dir . '/app-' . gmdate('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);
    }
}
