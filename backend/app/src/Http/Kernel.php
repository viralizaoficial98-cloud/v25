<?php
declare(strict_types=1);

namespace App\Http;

use App\Support\ApiError;
use App\Support\Config;
use App\Support\Logger;

final class Kernel
{
    public static function handle(Request $req, Router $router): Response
    {
        try {
            self::checkOrigin($req);
            return $router->dispatch($req);
        } catch (ApiError $e) {
            return Response::json(['error' => $e->errorCode] + ($e->details ? ['details' => $e->details] : []), $e->status);
        } catch (\Throwable $e) {
            $rid = bin2hex(random_bytes(6));
            Logger::error('Erro não tratado', ['request_id' => $rid, 'path' => $req->path, 'type' => $e::class, 'message' => $e->getMessage(), 'at' => $e->getFile() . ':' . $e->getLine()]);
            $body = ['error' => 'ERRO_INTERNO', 'request_id' => $rid];
            if (!Config::isProduction()) {
                $body['debug'] = $e->getMessage();
            }
            return Response::json($body, 500);
        }
    }

    /**
     * Defesa CSRF adicional: pedidos que alteram estado vindos de outra origem são recusados
     * (o navegador envia sempre Origin em POST/PUT/DELETE de fetch).
     */
    private static function checkOrigin(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        $origin = $req->header('origin');
        if ($origin === null || $origin === '' || $origin === 'null') {
            return;
        }
        $originHost = parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '');
        $allowed = array_filter([$req->header('host'), parse_url(Config::appUrl(), PHP_URL_HOST)]);
        if (!in_array($originHost, $allowed, true)) {
            throw new ApiError('ORIGEM_NAO_PERMITIDA', 403);
        }
    }
}
