<?php
declare(strict_types=1);

namespace App\Support;

/** Erro de negócio devolvido ao cliente como {"error": CODIGO}. Mensagens em PT no frontend. */
final class ApiError extends \RuntimeException
{
    /** @param array<string,mixed> $details */
    public function __construct(public readonly string $errorCode, public readonly int $status = 400, public readonly array $details = [])
    {
        parent::__construct($errorCode);
    }
}
