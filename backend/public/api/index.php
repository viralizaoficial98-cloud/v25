<?php
declare(strict_types=1);

/*
 * V25 — O LEGADO · ponto de entrada público da API (public_html/api/index.php).
 * Todo o código e o ficheiro .env ficam fora da pasta pública. Por omissão procura
 * a pasta privada em ../../v25_app (ex.: /home/renewangola/v25_app). Para outro local,
 * defina SetEnv V25_APP_DIR /caminho/absoluto no .htaccess desta pasta.
 */
$appDir = getenv('V25_APP_DIR') ?: ($_SERVER['V25_APP_DIR'] ?? dirname(__DIR__, 2) . '/v25_app');
if (!is_file($appDir . '/bootstrap.php')) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"API_NAO_INSTALADA"}';
    exit;
}
require $appDir . '/bootstrap.php';
$router = require $appDir . '/routes.php';
App\Http\Kernel::handle(App\Http\Request::fromGlobals('/api'), $router)->send();
