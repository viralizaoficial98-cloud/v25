<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\Request;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Config;
use App\Support\Db;
use App\Support\RateLimiter;
use App\Support\Util;

/**
 * Comprovativos: guardados FORA da pasta pública (storage/proofs) e só acessíveis
 * pela equipa financeira através da API. O envio NÃO confirma o pagamento.
 */
final class ProofService
{
    public const MAX_BYTES = 5 * 1024 * 1024;
    private const TYPES = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'];

    public static function upload(Request $req): array
    {
        $o = OrderService::byToken($req);
        RateLimiter::hit('proof_upload', $o['id'], 10, 3600);
        if (!in_array($o['status'], OrderService::PAYABLE, true)) {
            throw new ApiError('ESTADO_INVALIDO', 409);
        }
        $f = $req->files['file'] ?? null;
        if (!is_array($f) || is_array($f['error'] ?? null)) {
            throw new ApiError('UPLOAD_INVALIDO', 422);
        }
        if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || ($f['size'] ?? 0) > self::MAX_BYTES) {
            throw new ApiError('FICHEIRO_DEMASIADO_GRANDE', 413);
        }
        if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $f['tmp_name'])) {
            throw new ApiError('UPLOAD_INVALIDO', 422);
        }
        $tmp = (string) $f['tmp_name'];
        $size = (int) filesize($tmp);
        if ($size < 1 || $size > self::MAX_BYTES) {
            throw new ApiError($size < 1 ? 'UPLOAD_INVALIDO' : 'FICHEIRO_DEMASIADO_GRANDE', 422);
        }
        // Tipo real pelo conteúdo (finfo + assinatura de bytes), nunca pela extensão/cabeçalho do cliente
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        $head = (string) file_get_contents($tmp, false, null, 0, 8);
        $magicOk = match ($mime) {
            'application/pdf' => str_starts_with($head, '%PDF-'),
            'image/jpeg' => str_starts_with($head, "\xFF\xD8\xFF"),
            'image/png' => $head === "\x89PNG\r\n\x1A\n",
            default => false,
        };
        if (!isset(self::TYPES[$mime]) || !$magicOk) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        if ($mime !== 'application/pdf' && @getimagesize($tmp) === false) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        // A extensão declarada tem de corresponder ao tipo real (ex.: “.pdf” que afinal é imagem → recusado)
        $ext = strtolower(pathinfo((string) ($f['name'] ?? ''), PATHINFO_EXTENSION));
        $allowedExt = ['application/pdf' => ['pdf'], 'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png']];
        if (!in_array($ext, $allowedExt[$mime], true)) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        // PDF com código activo (JavaScript, acções de arranque, ficheiros embebidos) não é aceite
        if ($mime === 'application/pdf' && preg_match('#/(JavaScript|Launch|EmbeddedFile|OpenAction\s*<<[^>]*/JS)\b#', (string) file_get_contents($tmp))) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        $sha = hash_file('sha256', $tmp);
        $dupOther = Db::value('SELECT order_id FROM payment_proofs WHERE sha256 = :s AND order_id <> :o LIMIT 1', ['s' => $sha, 'o' => $o['id']]);
        if ($dupOther) {
            throw new ApiError('COMPROVATIVO_REUTILIZADO', 409);
        }

        $id = Util::uuid();
        $sub = gmdate('Y/m');
        $dir = Config::storagePath('proofs/' . $sub);
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta de comprovativos');
        }
        $storageName = $sub . '/' . $id . '.' . self::TYPES[$mime];
        $dest = Config::storagePath('proofs/' . $storageName);
        if (!move_uploaded_file($tmp, $dest)) {
            throw new \RuntimeException('Falha ao guardar comprovativo');
        }
        @chmod($dest, 0640);
        $original = mb_substr(preg_replace('/[^\p{L}\p{N}._ -]/u', '_', (string) ($f['name'] ?? '')) ?? '', 0, 200);

        try {
            $method = in_array($_POST['method'] ?? '', ['transferencia', 'express'], true) ? (string) $_POST['method'] : null;
            return Db::tx(function () use ($o, $id, $storageName, $original, $mime, $size, $sha, $method) {
                $cur = Db::one('SELECT * FROM orders WHERE id = :id FOR UPDATE', ['id' => $o['id']]);
                if (!in_array($cur['status'], OrderService::PAYABLE, true)) {
                    throw new ApiError('ESTADO_INVALIDO', 409);
                }
                Db::insert('payment_proofs', [
                    'id' => $id, 'order_id' => $o['id'], 'storage_name' => $storageName, 'original_name' => $original,
                    'mime_type' => $mime, 'size_bytes' => $size, 'sha256' => $sha,
                ]);
                Db::run("UPDATE orders SET status = 'comprovativo_enviado', expires_at = NULL, rejection_reason = NULL, payment_method = COALESCE(:m, payment_method) WHERE id = :id",
                    ['m' => $method, 'id' => $o['id']]);
                Audit::history($o['id'], 'comprovativo_enviado');
                $email = (string) Db::value('SELECT email FROM registrations WHERE id = :r', ['r' => $o['registration_id']]);
                MailQueue::enqueue('comprovativo_recebido', $email, $o['id'], [], 'comprovativo:' . $id);
                return ['status' => 'comprovativo_enviado'];
            });
        } catch (\Throwable $e) {
            @unlink($dest);
            throw $e;
        }
    }

    /** Ficheiro do comprovativo (equipa financeira). Ao abrir, o pedido passa a "Em análise". */
    public static function file(string $proofId): array
    {
        $p = Db::one('SELECT * FROM payment_proofs WHERE id = :id', ['id' => $proofId]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $path = Config::storagePath('proofs/' . $p['storage_name']);
        $real = realpath($path);
        $base = realpath(Config::storagePath('proofs'));
        if ($real === false || $base === false || !str_starts_with($real, $base . DIRECTORY_SEPARATOR)) {
            throw new ApiError('FICHEIRO_EM_FALTA', 404);
        }
        Audit::log('comprovativo.consultado', 'payment_proof', $proofId, ['order_id' => $p['order_id']]);
        return [$real, $p];
    }
}
