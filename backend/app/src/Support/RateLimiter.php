<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Limite por janela fixa, persistido em MySQL. Executado fora das transacções de negócio,
 * por isso as tentativas falhadas também contam.
 */
final class RateLimiter
{
    public static function hit(string $bucket, string $key, int $max, int $windowSeconds): void
    {
        $window = gmdate('Y-m-d H:i:s', intdiv(time(), $windowSeconds) * $windowSeconds);
        $k = hash('sha256', $key);
        Db::run(
            'INSERT INTO rate_limits (bucket, rl_key, window_start, hits) VALUES (:b, :k, :w, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1',
            ['b' => $bucket, 'k' => $k, 'w' => $window],
        );
        $hits = (int) Db::value('SELECT hits FROM rate_limits WHERE bucket = :b AND rl_key = :k AND window_start = :w', ['b' => $bucket, 'k' => $k, 'w' => $window]);
        if (random_int(1, 200) === 1) {
            Db::run('DELETE FROM rate_limits WHERE window_start < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
        }
        if ($hits > $max) {
            throw new ApiError('LIMITE_PEDIDOS', 429);
        }
    }

    public static function reset(string $bucket, string $key): void
    {
        Db::run('DELETE FROM rate_limits WHERE bucket = :b AND rl_key = :k', ['b' => $bucket, 'k' => hash('sha256', $key)]);
    }
}
