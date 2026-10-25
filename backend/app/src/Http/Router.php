<?php
declare(strict_types=1);

namespace App\Http;

use App\Support\ApiError;

final class Router
{
    /** @var list<array{string,string,callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $regex = '#^' . preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->add('PUT', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(Request $req): Response
    {
        $methodMismatch = false;
        foreach ($this->routes as [$method, $regex, $handler]) {
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            if ($method !== $req->method) {
                $methodMismatch = true;
                continue;
            }
            $req->params = array_map('rawurldecode', array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));
            $result = $handler($req);
            return $result instanceof Response ? $result : Response::json($result);
        }
        throw new ApiError($methodMismatch ? 'METODO_NAO_PERMITIDO' : 'NAO_ENCONTRADO', $methodMismatch ? 405 : 404);
    }
}
