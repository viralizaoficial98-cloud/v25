<?php
declare(strict_types=1);

namespace App\Support;

final class Util
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    public static function isUuid(mixed $v): bool
    {
        return is_string($v) && (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v);
    }

    /** Código aleatório sem enviesamento (256 é múltiplo de 32). */
    public static function randomCode(int $len): string
    {
        $out = '';
        foreach (str_split(random_bytes($len)) as $byte) {
            $out .= self::ALPHABET[ord($byte) % 32];
        }
        return $out;
    }

    /** Token secreto de 256 bits em base64url. */
    public static function token(): string
    {
        return self::b64url(random_bytes(32));
    }

    public static function b64url(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    public static function sha256(string $v): string
    {
        return hash('sha256', $v);
    }

    /** Converte DATETIME UTC da base de dados para ISO 8601. */
    public static function iso(?string $dt): ?string
    {
        if ($dt === null || $dt === '') {
            return null;
        }
        return (new \DateTimeImmutable($dt, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
    }

    /** ISO 8601 (com fuso) → DATETIME UTC; null se vazio. */
    public static function toDb(?string $iso): ?string
    {
        if ($iso === null || trim($iso) === '') {
            return null;
        }
        try {
            return (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (\Exception) {
            throw new ApiError('DATA_INVALIDA', 422);
        }
    }

    public static function money(mixed $v): ?float
    {
        return $v === null ? null : round((float) $v, 2);
    }

    /** Compara valores monetários em cêntimos (evita erros de vírgula flutuante). */
    public static function sameAmount(mixed $a, mixed $b): bool
    {
        return (int) round(((float) $a) * 100) === (int) round(((float) $b) * 100);
    }

    public static function normalizeReference(string $ref): string
    {
        return strtoupper((string) preg_replace('/[^A-Za-z0-9]/', '', $ref));
    }

    public static function normalizeName(string $v): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $v));
    }

    public static function maskEmail(string $email): string
    {
        $at = strpos($email, '@');
        if ($at === false) {
            return '•';
        }
        return $at > 2 ? substr($email, 0, 2) . str_repeat('•', max($at - 2, 1)) . substr($email, $at) : '•' . substr($email, $at);
    }

    public static function maskPhone(string $p): string
    {
        return substr($p, 0, 4) . str_repeat('•', max(strlen($p) - 7, 1)) . substr($p, -3);
    }

    /** Hash do IP com a chave da aplicação (não guardamos IPs em claro). */
    public static function ipHash(string $ip): string
    {
        return hash_hmac('sha256', $ip, Config::appKey());
    }
}
