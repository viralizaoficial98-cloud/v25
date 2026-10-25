<?php
declare(strict_types=1);

namespace App\Http;

use App\Support\ApiError;
use App\Support\Env;

final class Request
{
    private static ?self $current = null;
    /** @var array<string,mixed>|null */
    private ?array $json = null;
    /** @var array<string,string> */
    public array $params = [];

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        /** @var array<string,mixed> */
        public readonly array $query,
        /** @var array<string,string> */
        private readonly array $headers,
        private readonly string $rawBody,
        /** @var array<string,mixed> */
        public readonly array $files,
        private readonly string $remoteAddr,
    ) {
        self::$current = $this;
    }

    public static function fromGlobals(string $basePath = '/api'): self
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $pos = strpos($uri, $basePath . '/');
        $path = $pos === false ? '/' : substr($uri, $pos + strlen($basePath));
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        $body = str_starts_with($headers['content-type'] ?? '', 'multipart/') ? '' : (string) file_get_contents('php://input');
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), rtrim($path, '/') ?: '/', $_GET, $headers, $body, $_FILES, (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    }

    public static function current(): ?self
    {
        return self::$current;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** @return array<string,mixed> */
    public function json(): array
    {
        if ($this->json === null) {
            if ($this->rawBody === '') {
                $this->json = [];
            } else {
                if (strlen($this->rawBody) > 1_000_000) {
                    throw new ApiError('PEDIDO_INVALIDO', 413);
                }
                $d = json_decode($this->rawBody, true);
                if (!is_array($d)) {
                    throw new ApiError('PEDIDO_INVALIDO', 400);
                }
                $this->json = $d;
            }
        }
        return $this->json;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->json()[$key] ?? $default;
    }

    public function str(string $key, int $max = 2000): string
    {
        $v = $this->input($key, '');
        if (!is_scalar($v)) {
            throw new ApiError('PEDIDO_INVALIDO', 422);
        }
        $s = trim((string) $v);
        if (mb_strlen($s) > $max) {
            throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => $key]);
        }
        return $s;
    }

    /** IP do cliente. Cabeçalhos de proxy só são aceites se TRUST_PROXY_HEADERS=true. */
    public function ip(): string
    {
        if (Env::bool('TRUST_PROXY_HEADERS')) {
            $h = $this->header('cf-connecting-ip') ?? explode(',', $this->header('x-forwarded-for') ?? '')[0];
            if ($h && filter_var(trim($h), FILTER_VALIDATE_IP)) {
                return trim($h);
            }
        }
        return $this->remoteAddr;
    }

    public function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (Env::bool('TRUST_PROXY_HEADERS') && strtolower($this->header('x-forwarded-proto') ?? '') === 'https');
    }
}
