<?php
declare(strict_types=1);

// Núcleo privado da API. No cPanel fica FORA de public_html (ex.: /home/renewangola/v25_app).
define('APP_ROOT', __DIR__);

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('V25: é necessário PHP 8.1 ou superior.');
}
require APP_ROOT . '/vendor/autoload.php';

App\Support\Env::load(APP_ROOT . '/.env');
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');
ini_set('display_errors', App\Support\Config::isProduction() ? '0' : '1');
ini_set('log_errors', '1');
ini_set('error_log', App\Support\Config::storagePath('logs') . '/php-errors.log');
error_reporting(E_ALL);
set_error_handler(static function (int $no, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $no)) {
        return false;
    }
    throw new ErrorException($msg, 0, $no, $file, $line);
});
