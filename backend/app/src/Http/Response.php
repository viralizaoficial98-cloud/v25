<?php
declare(strict_types=1);

namespace App\Http;

final class Response
{
    public function __construct(
        public readonly int $status = 200,
        public readonly string $body = '',
        /** @var array<string,string> */
        public readonly array $headers = [],
        /** @var (callable():void)|null */
        public readonly mixed $stream = null,
    ) {
    }

    public static function json(mixed $data, int $status = 200): self
    {
        return new self($status, (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), ['Content-Type' => 'application/json; charset=utf-8']);
    }

    public static function file(string $content, string $contentType, string $filename, bool $inline = false): self
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', $filename);
        return new self(200, $content, [
            'Content-Type' => $contentType,
            'Content-Disposition' => ($inline ? 'inline' : 'attachment') . '; filename="' . $safe . '"',
            'Content-Length' => (string) strlen($content),
        ]);
    }

    public static function stream(string $path, string $contentType, string $filename, bool $inline = true): self
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', $filename);
        return new self(200, '', [
            'Content-Type' => $contentType,
            'Content-Disposition' => ($inline ? 'inline' : 'attachment') . '; filename="' . $safe . '"',
            'Content-Length' => (string) filesize($path),
            // Impede execução de conteúdo activo dentro de ficheiros enviados por clientes
            'Content-Security-Policy' => "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; plugin-types application/pdf; sandbox",
        ], static function () use ($path): void {
            readfile($path);
        });
    }

    public function send(): void
    {
        http_response_code($this->status);
        $base = [
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'same-origin',
            'Cache-Control' => 'no-store, max-age=0',
            'X-Frame-Options' => 'DENY',
        ];
        foreach ($this->headers + $base as $k => $v) {
            header("$k: $v");
        }
        if ($this->stream) {
            ($this->stream)();
        } else {
            echo $this->body;
        }
    }
}
