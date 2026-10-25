<?php
declare(strict_types=1);

namespace App\Support;

/** Verificação de compatibilidade do alojamento (PHP, extensões, MySQL, pastas, SMTP). */
final class Diagnostics
{
    /** @return list<array{check:string,ok:bool,detail:string,required:bool}> */
    public static function run(): array
    {
        $out = [];
        $add = static function (string $check, bool $ok, string $detail, bool $required = true) use (&$out): void {
            $out[] = ['check' => $check, 'ok' => $ok, 'detail' => $detail, 'required' => $required];
        };
        $add('PHP >= 8.1', PHP_VERSION_ID >= 80100, PHP_VERSION);
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'gd', 'json', 'ctype', 'iconv'] as $ext) {
            $add("Extensão $ext", extension_loaded($ext), extension_loaded($ext) ? 'ok' : 'em falta (activar em cPanel → Select PHP Version)');
        }
        $add('GD com suporte WebP', function_exists('imagewebp'), function_exists('imagewebp') ? 'ok' : 'sem WebP: imagens gravadas em JPEG', false);
        $toBytes = static function (string $v): int {
            $n = (int) $v;
            return match (strtolower(substr(trim($v), -1))) { 'g' => $n << 30, 'm' => $n << 20, 'k' => $n << 10, default => $n };
        };
        $upload = (string) ini_get('upload_max_filesize');
        $post = (string) ini_get('post_max_size');
        $add('upload_max_filesize >= 6M (comprovativos)', $toBytes($upload) >= 6 << 20, $upload);
        $add('upload_max_filesize >= 50M (vídeos da galeria)', $toBytes($upload) >= 50 << 20, $upload, false);
        $add('post_max_size >= upload_max_filesize', $toBytes($post) >= $toBytes($upload), $post);
        $add('APP_KEY definida (>= 32 caracteres)', strlen((string) Env::get('APP_KEY', '')) >= 32, Env::get('APP_KEY') ? 'definida' : 'em falta: php bin/generate-key.php');
        $add('APP_URL definida', (bool) Env::get('APP_URL'), Env::get('APP_URL', 'em falta') ?? '');
        try {
            $v = (string) Db::value('SELECT VERSION()');
            $add('Ligação MySQL', true, $v . ' · BD ' . Env::get('DB_DATABASE'));
            $engine = (string) Db::value("SELECT ENGINE FROM information_schema.ENGINES WHERE ENGINE = 'InnoDB' AND SUPPORT IN ('YES','DEFAULT')");
            $add('InnoDB disponível', $engine === 'InnoDB', $engine ?: 'não');
            $tables = (int) Db::value('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
            $applied = $tables > 0 ? array_column(Db::all('SELECT version FROM schema_migrations ORDER BY version'), 'version') : [];
            $files = array_map(fn ($f) => basename($f, '.sql'), glob(APP_ROOT . '/database/migrations/*.sql') ?: []);
            $pending = array_values(array_diff($files, $applied));
            $add('Schema importado', $tables >= 20, "$tables tabelas");
            $add('Migrações aplicadas', !$pending, $pending ? 'pendentes: ' . implode(', ', $pending) : implode(', ', $applied));
            $add('Primeiro administrador criado', $tables > 0 && (int) Db::value('SELECT COUNT(*) FROM users') > 0, $tables > 0 ? (string) Db::value('SELECT COUNT(*) FROM users') . ' utilizador(es)' : '—', false);
        } catch (\Throwable $e) {
            $add('Ligação MySQL', false, 'falhou: ' . preg_replace('/\(SQLSTATE.*$/', '', $e->getMessage()) . ' — verifique DB_* no .env');
        }
        foreach (['proofs', 'logs', 'sessions', 'tmp'] as $d) {
            $p = Config::storagePath($d);
            $add("Pasta storage/$d gravável", is_dir($p) && is_writable($p), $p);
        }
        $media = Config::mediaPath();
        $add('Pasta de media gravável (MEDIA_PATH)', is_dir($media) && is_writable($media), $media);
        $publicRoot = realpath(dirname(Config::mediaPath(), 2)) ?: '';
        $appInPublic = $publicRoot !== '' && str_starts_with(realpath(APP_ROOT) ?: '', $publicRoot . DIRECTORY_SEPARATOR);
        $add('Código privado fora da pasta pública', !$appInPublic, realpath(APP_ROOT) ?: APP_ROOT);
        $smtp = \App\Services\MailQueue::smtpStatus();
        $add('SMTP configurado', $smtp['configured'], $smtp['configured'] ? "{$smtp['host']}:{$smtp['port']}" : 'faltam: ' . implode(', ', $smtp['missing']), false);
        $add('SETUP_TOKEN removido após a instalação', Env::get('SETUP_TOKEN') === null, Env::get('SETUP_TOKEN') ? 'ainda definido — apague depois de criar o administrador' : 'ok', false);
        return $out;
    }
}
