<?php
declare(strict_types=1);

namespace App\Support;

final class Config
{
    public static function isProduction(): bool
    {
        return Env::get('APP_ENV', 'production') === 'production';
    }

    /** Chave secreta da aplicação (HMAC dos QR Codes e dos hashes de IP). */
    public static function appKey(): string
    {
        $k = Env::require('APP_KEY');
        if (strlen($k) < 32) {
            throw new \RuntimeException('APP_KEY demasiado curta (gere com: php bin/generate-key.php)');
        }
        return $k;
    }

    public static function appUrl(): string
    {
        return rtrim(Env::get('APP_URL', '') ?? '', '/');
    }

    public static function storagePath(string $sub = ''): string
    {
        $base = rtrim(Env::get('STORAGE_PATH', APP_ROOT . '/storage') ?? '', '/');
        return $sub === '' ? $base : $base . '/' . ltrim($sub, '/');
    }

    public static function mediaPath(): string
    {
        return rtrim(Env::get('MEDIA_PATH', APP_ROOT . '/../public_html/uploads/media') ?? '', '/');
    }

    public static function mediaUrl(): string
    {
        return rtrim(Env::get('MEDIA_URL', '/uploads/media') ?? '', '/');
    }
}
