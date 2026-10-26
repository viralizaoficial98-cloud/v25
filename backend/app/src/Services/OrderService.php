<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\Request;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\RateLimiter;
use App\Support\Util;

/** Inscrições e pedidos do lado do cliente (público, acesso por código + token). */
final class OrderService
{
    public const PAYABLE = ['iniciada', 'aguardando_pagamento', 'rejeitado'];
    public const IN_REVIEW = ['comprovativo_enviado', 'em_analise'];
    public const EXPIRED_REASON = 'Reserva expirada sem comprovativo de pagamento.';

    // ------------------------------------------------------------------ validação
    public static function validateRegistration(array $in): array
    {
        $name = Util::normalizeName((string) ($in['full_name'] ?? ''));
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $phone = (string) preg_replace('/[^0-9+]/', '', (string) ($in['phone'] ?? ''));
        if (($in['consent'] ?? false) !== true) {
            throw new ApiError('CONSENTIMENTO_OBRIGATORIO', 422);
        }
        if (mb_strlen($name) < 3 || mb_strlen($name) > 120 || !preg_match('/\p{L}.*\s.*\p{L}/u', $name)) {
            throw new ApiError('NOME_INVALIDO', 422);
        }
        if (strlen($email) > 254 || !preg_match('/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/', $email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError('EMAIL_INVALIDO', 422);
        }
        if (!preg_match('/^\+[1-9][0-9]{6,14}$/', $phone) || (str_starts_with($phone, '+244') && !preg_match('/^\+244[29][0-9]{8}$/', $phone))) {
            throw new ApiError('TELEFONE_INVALIDO', 422);
        }
        return [$name, $email, $phone];
    }

    // ------------------------------------------------------------------ expiração
    /** Cancela reservas não pagas fora de prazo e liberta o stock. */
    public static function expireStale(): int
    {
        $ids = array_column(Db::all(
            "SELECT id FROM orders WHERE status IN ('iniciada','aguardando_pagamento','rejeitado') AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP() LIMIT 200",
        ), 'id');
        $n = 0;
        foreach ($ids as $id) {
            $n += Db::tx(function () use ($id) {
                $o = Db::one('SELECT * FROM orders WHERE id = :id FOR UPDATE', ['id' => $id]);
                if (!$o || !in_array($o['status'], self::PAYABLE, true) || $o['expires_at'] === null || strtotime($o['expires_at'] . ' UTC') >= time()) {
                    return 0;
                }
                self::releaseReserved($id);
                $reason = self::EXPIRED_REASON;
                Db::run("UPDATE orders SET status = 'cancelado', cancel_reason = :r, expired_at = UTC_TIMESTAMP() WHERE id = :id", ['r' => $reason, 'id' => $id]);
                Audit::history($id, 'cancelado', $reason);
                return 1;
            });
        }
        return $n;
    }

    public static function releaseReserved(string $orderId): void
    {
        foreach (Db::all('SELECT category_id, quantity FROM order_items WHERE order_id = :o', ['o' => $orderId]) as $it) {
            Db::run('UPDATE ticket_categories SET quantity_reserved = quantity_reserved - :q WHERE id = :c', ['q' => (int) $it['quantity'], 'c' => $it['category_id']]);
        }
    }

    // ------------------------------------------------------------------ criação
    public static function create(Request $req): array
    {
        $in = $req->json();
        if (trim((string) ($in['website'] ?? '')) !== '') { // armadilha anti-spam
            throw new ApiError('PEDIDO_INVALIDO', 400);
        }
        $idem = (string) ($in['idempotency_key'] ?? '');
        if (!Util::isUuid($idem)) {
            throw new ApiError('PEDIDO_INVALIDO', 400);
        }
        $idem = strtolower($idem);

        // Repetição do mesmo envio (duplo clique/rede): devolve o mesmo pedido com novo token.
        if ($existing = Db::one('SELECT id, order_code, total_kz, status, expires_at FROM orders WHERE idempotency_key = :k', ['k' => $idem])) {
            return self::replay($existing);
        }

        RateLimiter::hit('create_order_ip', $req->ip(), 15, 600);
        [$name, $email, $phone] = self::validateRegistration($in);
        RateLimiter::hit('create_order_email', $email, 6, 3600);

        $categoryId = (string) ($in['ticket_type_id'] ?? '');
        $qty = $in['quantity'] ?? null;
        $guests = $in['guests_total'] ?? null;
        $mode = ($in['mode'] ?? 'compra') === 'reserva' ? 'reserva' : 'compra';
        if (!Util::isUuid($categoryId)) {
            throw new ApiError('INGRESSO_INEXISTENTE', 422);
        }
        if (!is_int($qty) || !is_int($guests)) {
            throw new ApiError('QUANTIDADE_INVALIDA', 422);
        }
        $consentVersion = mb_substr((string) ($in['consent_version'] ?? 'v1'), 0, 40) ?: 'v1';

        self::expireStale();

        try {
            $result = Db::tx(function () use ($req, $categoryId, $qty, $guests, $mode, $name, $email, $phone, $idem, $consentVersion) {
                // Bloqueio do evento (capacidade global) e da categoria (stock): serializa compras concorrentes.
                $e = Db::one('SELECT * FROM events WHERE id = :id FOR UPDATE', ['id' => SettingsService::EVENT_ID]);
                $t = Db::one('SELECT * FROM ticket_categories WHERE id = :id AND event_id = :e FOR UPDATE', ['id' => $categoryId, 'e' => $e['id']]);
                if (!$t || !$t['published']) {
                    throw new ApiError('INGRESSO_INEXISTENTE', 422);
                }
                if (($t['sale_mode'] ?? 'directo') === 'consulta') {
                    // VIP: só por proposta aprovada pela organização (VipService)
                    throw new ApiError('INGRESSO_POR_CONSULTA', 422);
                }
                if ((int) $t['quantity_total'] === 0) {
                    throw new ApiError('DISPONIBILIDADE_POR_ANUNCIAR', 409);
                }
                $now = time();
                if (!$e['sales_open'] || $t['price_kz'] === null
                    || ($t['sales_start'] !== null && strtotime($t['sales_start'] . ' UTC') > $now)
                    || ($t['sales_end'] !== null && strtotime($t['sales_end'] . ' UTC') <= $now)) {
                    throw new ApiError('VENDAS_FECHADAS', 409);
                }
                if ($qty < 1 || $qty > (int) $t['max_per_order']) {
                    throw new ApiError('QUANTIDADE_INVALIDA', 422);
                }
                if ($guests < $qty || $guests > $qty * (int) $t['persons_per_ticket']) {
                    throw new ApiError('CONVIDADOS_INVALIDO', 422);
                }
                if ((int) $t['quantity_total'] - (int) $t['quantity_reserved'] - (int) $t['quantity_sold'] < $qty) {
                    throw new ApiError('ESGOTADO', 409);
                }
                if ($e['capacity'] !== null) {
                    $used = (int) Db::value("SELECT COALESCE(SUM(guests_total),0) FROM orders WHERE event_id = :e AND status <> 'cancelado'", ['e' => $e['id']]);
                    if ($used + $guests > (int) $e['capacity']) {
                        throw new ApiError('ESGOTADO', 409);
                    }
                }
                // Pedido em aberto para o mesmo email e categoria
                $open = Db::value(
                    "SELECT 1 FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
                     WHERE r.email = :m AND i.category_id = :c AND o.status IN ('iniciada','aguardando_pagamento','comprovativo_enviado','em_analise','rejeitado') LIMIT 1",
                    ['m' => $email, 'c' => $t['id']],
                );
                if ($open) {
                    throw new ApiError('PEDIDO_DUPLICADO', 409);
                }
                $already = (int) Db::value(
                    "SELECT COALESCE(SUM(i.quantity),0) FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
                     WHERE r.email = :m AND i.category_id = :c AND o.status <> 'cancelado'",
                    ['m' => $email, 'c' => $t['id']],
                );
                if ($already + $qty > (int) $t['max_per_customer']) {
                    throw new ApiError('LIMITE_POR_CLIENTE', 409);
                }

                $regId = Util::uuid();
                Db::insert('registrations', [
                    'id' => $regId, 'event_id' => $e['id'], 'full_name' => $name, 'email' => $email, 'phone' => $phone,
                    'consent_at' => Db::now(), 'consent_version' => $consentVersion, 'ip_hash' => Util::ipHash($req->ip()),
                ]);
                do {
                    $code = 'V25-' . Util::randomCode(6);
                } while (Db::value('SELECT 1 FROM orders WHERE order_code = :c', ['c' => $code]));
                $orderId = Util::uuid();
                $total = number_format((float) $t['price_kz'] * $qty, 2, '.', '');
                $expires = gmdate('Y-m-d H:i:s', $now + (int) $e['reservation_hours'] * 3600);
                $status = $mode === 'reserva' ? 'iniciada' : 'aguardando_pagamento';
                Db::insert('orders', [
                    'id' => $orderId, 'event_id' => $e['id'], 'registration_id' => $regId, 'order_code' => $code, 'status' => $status,
                    'total_kz' => $total, 'guests_total' => $guests, 'idempotency_key' => $idem, 'expires_at' => $expires,
                ]);
                Db::insert('order_items', [
                    'order_id' => $orderId, 'category_id' => $t['id'], 'quantity' => $qty, 'unit_price_kz' => $t['price_kz'],
                    'persons_per_ticket' => (int) $t['persons_per_ticket'], 'line_total_kz' => $total,
                ]);
                Db::run('UPDATE ticket_categories SET quantity_reserved = quantity_reserved + :q WHERE id = :id', ['q' => $qty, 'id' => $t['id']]);
                $token = self::issueToken($orderId);
                Audit::history($orderId, $status);
                MailQueue::enqueue('pedido_criado', $email, $orderId, [], 'pedido_criado:' . $orderId);
                return ['order_code' => $code, 'access_token' => $token, 'total_kz' => (float) $total, 'status' => $status, 'expires_at' => Util::iso($expires), 'replayed' => false];
            });
        } catch (\Throwable $e) {
            // Corrida entre dois envios com a mesma chave de idempotência
            if (Db::isDuplicateKey($e, 'uq_orders_idem') && ($existing = Db::one('SELECT id, order_code, total_kz, status, expires_at FROM orders WHERE idempotency_key = :k', ['k' => $idem]))) {
                return self::replay($existing);
            }
            throw $e;
        }
        return $result;
    }

    private static function replay(array $o): array
    {
        return ['order_code' => $o['order_code'], 'access_token' => self::issueToken($o['id']), 'total_kz' => (float) $o['total_kz'],
            'status' => $o['status'], 'expires_at' => Util::iso($o['expires_at']), 'replayed' => true];
    }

    public static function issueToken(string $orderId): string
    {
        $token = Util::token();
        Db::insert('order_access_tokens', ['order_id' => $orderId, 'token_hash' => Util::sha256($token)]);
        return $token;
    }

    // ------------------------------------------------------------------ acesso do cliente
    /** Pedido identificado por código + token (cabeçalho X-Order-Token). Tokens têm 256 bits. */
    public static function byToken(Request $req, bool $lock = false): array
    {
        $code = strtoupper(trim((string) ($req->params['code'] ?? '')));
        $token = (string) ($req->header('x-order-token') ?? '');
        if ($token === '' || !preg_match('/^V25-[A-Z2-9]{6}$/', $code)) {
            RateLimiter::hit('token_fail', $req->ip(), 30, 600);
            throw new ApiError('ACESSO_INVALIDO', 403);
        }
        $o = Db::one(
            'SELECT o.* FROM orders o JOIN order_access_tokens a ON a.order_id = o.id
             WHERE o.order_code = :c AND a.token_hash = :h AND a.revoked_at IS NULL' . ($lock ? ' FOR UPDATE' : ''),
            ['c' => $code, 'h' => Util::sha256($token)],
        );
        if (!$o) {
            RateLimiter::hit('token_fail', $req->ip(), 30, 600);
            throw new ApiError('ACESSO_INVALIDO', 403);
        }
        return $o;
    }

    /** Dados completos de um pedido (formato CustomerOrder do frontend). */
    public static function customerView(array $o): array
    {
        $reg = Db::one('SELECT * FROM registrations WHERE id = :id', ['id' => $o['registration_id']]);
        $item = Db::one('SELECT i.*, c.name, c.lot_label FROM order_items i JOIN ticket_categories c ON c.id = i.category_id WHERE i.order_id = :o LIMIT 1', ['o' => $o['id']]);
        $s = SettingsService::settings();
        $tickets = [];
        $lastProof = Db::value('SELECT MAX(uploaded_at) FROM payment_proofs WHERE order_id = :o', ['o' => $o['id']]);
        if ($o['status'] === 'emitido') {
            foreach (Db::all('SELECT * FROM tickets WHERE order_id = :o ORDER BY seq', ['o' => $o['id']]) as $k) {
                $tickets[] = [
                    'ticket_code' => $k['ticket_code'], 'seq' => (int) $k['seq'], 'holder_name' => $k['holder_name'], 'status' => $k['status'],
                    'qr_payload' => TicketService::qrPayload($k['ticket_code']), 'checked_in_at' => Util::iso($k['checked_in_at']),
                ];
            }
        }
        return [
            'order_code' => $o['order_code'],
            'status' => $o['status'],
            'source' => $o['source'] ?? 'checkout',
            'payment_method' => $o['payment_method'] ?? null,
            'proof_uploaded_at' => Util::iso($lastProof ? (string) $lastProof : null),
            'event' => self::eventSummary(),
            'full_name' => $reg['full_name'],
            'email_masked' => Util::maskEmail($reg['email']),
            'phone_masked' => Util::maskPhone($reg['phone']),
            'ticket_type' => ['name' => $item['name'], 'lot_label' => $item['lot_label'], 'persons_per_ticket' => (int) $item['persons_per_ticket']],
            'quantity' => (int) $item['quantity'],
            'guests_total' => (int) $o['guests_total'],
            'unit_price_kz' => (float) $item['unit_price_kz'],
            'total_kz' => (float) $o['total_kz'],
            'expires_at' => in_array($o['status'], self::PAYABLE, true) ? Util::iso($o['expires_at']) : null,
            'rejection_reason' => $o['status'] === 'rejeitado' ? $o['rejection_reason'] : null,
            'cancel_reason' => $o['status'] === 'cancelado' ? $o['cancel_reason'] : null,
            'created_at' => Util::iso($o['created_at']),
            'payment' => [
                'account_name' => $s['bank_account_name'] ?? '', 'account_number' => $s['bank_account_number'] ?? '',
                'iban' => $s['bank_iban'] ?? '', 'express_number' => $s['express_number'] ?? '', 'instructions' => $s['payment_instructions'] ?? '',
            ],
            'history' => array_map(fn ($h) => ['status' => $h['status'], 'at' => Util::iso(substr((string) $h['created_at'], 0, 19))],
                Db::all('SELECT status, created_at FROM transaction_history WHERE order_id = :o ORDER BY created_at, id', ['o' => $o['id']])),
            'proofs' => array_map(fn ($p) => ['uploaded_at' => Util::iso($p['uploaded_at']), 'status' => $p['status'], 'mime_type' => $p['mime_type']],
                Db::all('SELECT uploaded_at, status, mime_type FROM payment_proofs WHERE order_id = :o ORDER BY uploaded_at', ['o' => $o['id']])),
            'tickets' => $tickets,
        ];
    }

    /** @return array{name:string,starts_at:?string,venue:string,address:string} */
    private static function eventSummary(): array
    {
        $e = SettingsService::event();
        return ['name' => $e['name'], 'starts_at' => Util::iso($e['starts_at']), 'venue' => $e['venue'], 'address' => $e['address']];
    }

    /** Etapa de pagamento: o cliente escolhe Transferência Bancária ou Transferência Express. */
    public static function setPaymentMethod(Request $req): array
    {
        $method = (string) $req->input('method', '');
        if (!in_array($method, ['transferencia', 'express'], true)) {
            throw new ApiError('METODO_PAGAMENTO_INVALIDO', 422);
        }
        return Db::tx(function () use ($req, $method) {
            $o = self::byToken($req, true);
            if (!in_array($o['status'], self::PAYABLE, true)) {
                throw new ApiError('ESTADO_INVALIDO', 409);
            }
            Db::run('UPDATE orders SET payment_method = :m WHERE id = :id', ['m' => $method, 'id' => $o['id']]);
            return ['payment_method' => $method];
        });
    }

    public static function confirmReservation(Request $req): array
    {
        return Db::tx(function () use ($req) {
            $o = self::byToken($req, true);
            if ($o['status'] !== 'iniciada') {
                throw new ApiError('ESTADO_INVALIDO', 409);
            }
            Db::run("UPDATE orders SET status = 'aguardando_pagamento' WHERE id = :id", ['id' => $o['id']]);
            Audit::history($o['id'], 'aguardando_pagamento');
            return ['status' => 'aguardando_pagamento'];
        });
    }

    public static function cancelByCustomer(Request $req): array
    {
        return Db::tx(function () use ($req) {
            $o = self::byToken($req, true);
            if (!in_array($o['status'], self::PAYABLE, true)) {
                throw new ApiError('ESTADO_INVALIDO', 409);
            }
            self::releaseReserved($o['id']);
            $reason = 'Cancelado pelo cliente.';
            Db::run("UPDATE orders SET status = 'cancelado', cancel_reason = :r WHERE id = :id", ['r' => $reason, 'id' => $o['id']]);
            Audit::history($o['id'], 'cancelado', $reason);
            return ['status' => 'cancelado'];
        });
    }

    /** Envia novas ligações para os pedidos do email. Resposta idêntica exista ou não o email. */
    public static function requestAccess(Request $req): array
    {
        $email = strtolower(trim((string) $req->input('email', '')));
        RateLimiter::hit('access_ip', $req->ip(), 5, 900);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError('EMAIL_INVALIDO', 422);
        }
        RateLimiter::hit('access_email', $email, 3, 3600);
        $orders = Db::all(
            'SELECT o.id FROM orders o JOIN registrations r ON r.id = o.registration_id WHERE r.email = :m AND o.created_at > (UTC_TIMESTAMP() - INTERVAL 1 YEAR)',
            ['m' => $email],
        );
        foreach ($orders as $o) {
            MailQueue::enqueue('acesso_pedido', $email, $o['id']);
        }
        return ['ok' => true];
    }
}
