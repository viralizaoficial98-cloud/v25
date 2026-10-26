<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

/** Validação manual de pagamentos, emissão de ingressos e operações administrativas sobre pedidos. */
final class PaymentService
{
    private static function lockOrder(string $id): array
    {
        return Db::one('SELECT * FROM orders WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('PEDIDO_INEXISTENTE', 404);
    }

    private static function email(array $o): string
    {
        return (string) Db::value('SELECT email FROM registrations WHERE id = :r', ['r' => $o['registration_id']]);
    }

    public static function markInReview(string $orderId): array
    {
        return Db::tx(function () use ($orderId) {
            $o = self::lockOrder($orderId);
            if ($o['status'] === 'comprovativo_enviado') {
                Db::run("UPDATE orders SET status = 'em_analise' WHERE id = :id", ['id' => $o['id']]);
                Audit::history($o['id'], 'em_analise');
                Audit::log('pedido.em_analise', 'order', $o['id'], ['order_code' => $o['order_code']]);
                return ['status' => 'em_analise'];
            }
            return ['status' => $o['status']];
        });
    }

    /**
     * Aprovação: só depois de o financeiro confirmar a entrada do valor no banco.
     * Idempotente (pedido bloqueado + UNIQUE em payments.order_id e tickets(order_id, seq)).
     */
    public static function approve(string $orderId, string $reference, mixed $amount, string $method, ?string $note): array
    {
        $ref = Util::normalizeReference($reference);
        try {
            return Db::tx(function () use ($orderId, $reference, $ref, $amount, $method, $note) {
                $o = self::lockOrder($orderId);
                // Método indicado pelo financeiro; se omitido, o escolhido pelo cliente
                $method = in_array($method, ['transferencia', 'express'], true) ? $method : (($o['payment_method'] ?? '') === 'express' ? 'express' : 'transferencia');
                if (in_array($o['status'], ['aprovado', 'emitido'], true)) {
                    return ['status' => $o['status'], 'already_processed' => true];
                }
                if (!in_array($o['status'], OrderService::IN_REVIEW, true)) {
                    throw new ApiError('ESTADO_INVALIDO', 409);
                }
                if (strlen($ref) < 4 || strlen($ref) > 80) {
                    throw new ApiError('REFERENCIA_OBRIGATORIA', 422);
                }
                if (Db::value('SELECT 1 FROM payments WHERE reference_norm = :r', ['r' => $ref])) {
                    throw new ApiError('REFERENCIA_REUTILIZADA', 409);
                }
                if (!is_numeric($amount) || !Util::sameAmount($amount, $o['total_kz'])) {
                    throw new ApiError('VALOR_NAO_CONFERE', 422);
                }
                $uid = Auth::user()['id'] ?? null;
                Db::insert('payments', [
                    'id' => Util::uuid(), 'order_id' => $o['id'], 'method' => $method, 'reference' => mb_substr(trim($reference), 0, 80),
                    'reference_norm' => $ref, 'amount_kz' => number_format((float) $amount, 2, '.', ''),
                    'note' => $note !== null ? mb_substr(trim($note), 0, 500) : null, 'confirmed_by' => $uid, 'confirmed_at' => Db::now(),
                ]);
                Db::run("UPDATE orders SET status = 'aprovado', reviewed_by = :u, reviewed_at = UTC_TIMESTAMP(), expires_at = NULL WHERE id = :id", ['u' => $uid, 'id' => $o['id']]);
                Audit::history($o['id'], 'aprovado');
                Db::run("UPDATE payment_proofs SET status = 'aceite' WHERE order_id = :o AND status = 'pendente'", ['o' => $o['id']]);

                $reg = Db::one('SELECT full_name, email FROM registrations WHERE id = :r', ['r' => $o['registration_id']]);
                $issued = 0;
                foreach (Db::all('SELECT * FROM order_items WHERE order_id = :o', ['o' => $o['id']]) as $item) {
                    Db::run('UPDATE ticket_categories SET quantity_reserved = quantity_reserved - :q, quantity_sold = quantity_sold + :q2 WHERE id = :c',
                        ['q' => (int) $item['quantity'], 'q2' => (int) $item['quantity'], 'c' => $item['category_id']]);
                    $issued += TicketService::issue($o, $item, $reg['full_name']);
                }
                Db::run("UPDATE orders SET status = 'emitido' WHERE id = :id", ['id' => $o['id']]);
                Audit::history($o['id'], 'emitido');
                MailQueue::enqueue('pagamento_aprovado', $reg['email'], $o['id'], [], 'aprovado:' . $o['id']);
                MailQueue::enqueue('ingresso_disponivel', $reg['email'], $o['id'], [], 'ingresso:' . $o['id']);
                Audit::log('pagamento.aprovado', 'order', $o['id'], [
                    'order_code' => $o['order_code'], 'referencia' => $ref, 'metodo' => $method, 'valor' => (float) $amount, 'ingressos' => $issued, 'nota' => $note,
                ]);
                return ['status' => 'emitido', 'tickets_issued' => $issued, 'already_processed' => false];
            });
        } catch (\Throwable $e) {
            if (Db::isDuplicateKey($e, 'uq_pay_ref')) {
                throw new ApiError('REFERENCIA_REUTILIZADA', 409);
            }
            if (Db::isDuplicateKey($e, 'uq_pay_order')) {
                return ['status' => 'emitido', 'already_processed' => true];
            }
            throw $e;
        }
    }

    public static function reject(string $orderId, string $reason): array
    {
        $reason = trim($reason);
        if (mb_strlen($reason) < 5 || mb_strlen($reason) > 500) {
            throw new ApiError('MOTIVO_OBRIGATORIO', 422);
        }
        return Db::tx(function () use ($orderId, $reason) {
            $o = self::lockOrder($orderId);
            if ($o['status'] === 'rejeitado') {
                return ['status' => 'rejeitado', 'already_processed' => true];
            }
            if (!in_array($o['status'], OrderService::IN_REVIEW, true)) {
                throw new ApiError('ESTADO_INVALIDO', 409);
            }
            $hours = (int) Db::value('SELECT reservation_hours FROM events WHERE id = :e', ['e' => $o['event_id']]);
            // O lugar continua reservado por nova janela, para o cliente enviar um comprovativo correcto
            Db::run("UPDATE orders SET status = 'rejeitado', rejection_reason = :r, reviewed_by = :u, reviewed_at = UTC_TIMESTAMP(), expires_at = :x WHERE id = :id", [
                'r' => $reason, 'u' => Auth::user()['id'] ?? null, 'x' => gmdate('Y-m-d H:i:s', time() + $hours * 3600), 'id' => $o['id'],
            ]);
            Db::run("UPDATE payment_proofs SET status = 'rejeitado' WHERE order_id = :o AND status = 'pendente'", ['o' => $o['id']]);
            Audit::history($o['id'], 'rejeitado', $reason);
            MailQueue::enqueue('pagamento_rejeitado', self::email($o), $o['id'], ['motivo' => $reason]);
            Audit::log('pagamento.rejeitado', 'order', $o['id'], ['order_code' => $o['order_code'], 'motivo' => $reason]);
            return ['status' => 'rejeitado', 'already_processed' => false];
        });
    }

    public static function cancel(string $orderId, string $reason): array
    {
        $reason = trim($reason);
        if (mb_strlen($reason) < 5 || mb_strlen($reason) > 500) {
            throw new ApiError('MOTIVO_OBRIGATORIO', 422);
        }
        return Db::tx(function () use ($orderId, $reason) {
            $o = self::lockOrder($orderId);
            if ($o['status'] === 'cancelado') {
                return ['status' => 'cancelado', 'already_processed' => true];
            }
            if (Db::value("SELECT 1 FROM tickets WHERE order_id = :o AND status = 'utilizado' LIMIT 1", ['o' => $o['id']])) {
                throw new ApiError('INGRESSO_JA_UTILIZADO', 409);
            }
            foreach (Db::all('SELECT category_id, quantity FROM order_items WHERE order_id = :o', ['o' => $o['id']]) as $it) {
                $col = in_array($o['status'], ['aprovado', 'emitido'], true) ? 'quantity_sold' : 'quantity_reserved';
                Db::run("UPDATE ticket_categories SET $col = $col - :q WHERE id = :c", ['q' => (int) $it['quantity'], 'c' => $it['category_id']]);
            }
            Db::run("UPDATE tickets SET status = 'anulado' WHERE order_id = :o AND status = 'valido'", ['o' => $o['id']]);
            Db::run("UPDATE payments SET status = 'estornado' WHERE order_id = :o", ['o' => $o['id']]);
            Db::run("UPDATE orders SET status = 'cancelado', cancel_reason = :r WHERE id = :id", ['r' => $reason, 'id' => $o['id']]);
            Audit::history($o['id'], 'cancelado', $reason);
            MailQueue::enqueue('pedido_cancelado', self::email($o), $o['id'], ['motivo' => $reason]);
            Audit::log('pedido.cancelado', 'order', $o['id'], ['order_code' => $o['order_code'], 'motivo' => $reason, 'estado_anterior' => $o['status']]);
            return ['status' => 'cancelado', 'already_processed' => false];
        });
    }

    public static function resendTickets(string $orderId): array
    {
        $o = Db::one('SELECT * FROM orders WHERE id = :id', ['id' => $orderId]) ?? throw new ApiError('PEDIDO_INEXISTENTE', 404);
        if ($o['status'] !== 'emitido') {
            throw new ApiError('ESTADO_INVALIDO', 409);
        }
        MailQueue::enqueue('ingresso_disponivel', self::email($o), $o['id'], ['reenvio' => true]);
        Audit::log('ingresso.reenviado', 'order', $o['id'], ['order_code' => $o['order_code']]);
        return ['ok' => true];
    }

    public static function accessLink(string $orderId): array
    {
        $o = Db::one('SELECT * FROM orders WHERE id = :id', ['id' => $orderId]) ?? throw new ApiError('PEDIDO_INEXISTENTE', 404);
        $token = OrderService::issueToken($o['id']);
        Audit::log('pedido.link_gerado', 'order', $o['id'], ['order_code' => $o['order_code']]);
        return ['order_code' => $o['order_code'], 'access_token' => $token];
    }
}
