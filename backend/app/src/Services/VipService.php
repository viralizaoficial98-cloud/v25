<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Http\Request;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\RateLimiter;
use App\Support\Util;

/**
 * Acesso VIP "por consulta": não tem preço público. Fluxo:
 *   solicitação (cliente) → análise e proposta (organização) → aceitação (cliente)
 *   → pedido de pagamento com o valor aprovado → comprovativo → aprovação → ingressos.
 * Nunca é possível pagar um VIP sem proposta aprovada e aceite.
 */
final class VipService
{
    public const OPEN = ['nova', 'em_analise', 'proposta_enviada'];

    private static function vipCategory(bool $lock = false): array
    {
        $c = Db::one("SELECT * FROM ticket_categories WHERE sale_mode = 'consulta' AND event_id = :e ORDER BY published DESC, sort_order LIMIT 1" . ($lock ? ' FOR UPDATE' : ''), ['e' => SettingsService::EVENT_ID]);
        if (!$c) {
            throw new ApiError('VIP_INDISPONIVEL', 409);
        }
        return $c;
    }

    // ------------------------------------------------------------------ cliente
    public static function create(Request $req): array
    {
        $in = $req->json();
        if (trim((string) ($in['website'] ?? '')) !== '') {
            throw new ApiError('PEDIDO_INVALIDO', 400);
        }
        RateLimiter::hit('vip_ip', $req->ip(), 5, 3600);
        [$name, $email, $phone] = OrderService::validateRegistration($in);
        RateLimiter::hit('vip_email', $email, 3, 86400);
        $participants = $in['participants'] ?? null;
        if (!is_int($participants) || $participants < 1 || $participants > 100) {
            throw new ApiError('PARTICIPANTES_INVALIDO', 422);
        }
        $message = trim((string) ($in['message'] ?? ''));
        if (mb_strlen($message) > 2000) {
            throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => 'message']);
        }
        $cat = self::vipCategory();
        if (!$cat['published']) {
            throw new ApiError('VIP_INDISPONIVEL', 409);
        }
        if (Db::value("SELECT 1 FROM vip_requests WHERE email = :e AND status IN ('nova','em_analise','proposta_enviada') LIMIT 1", ['e' => $email])) {
            throw new ApiError('VIP_PEDIDO_DUPLICADO', 409);
        }
        do {
            $code = 'VIP-' . Util::randomCode(6);
        } while (Db::value('SELECT 1 FROM vip_requests WHERE request_code = :c', ['c' => $code]));
        $id = Util::uuid();
        Db::insert('vip_requests', [
            'id' => $id, 'request_code' => $code, 'full_name' => $name, 'email' => $email, 'phone' => $phone,
            'participants' => $participants, 'message' => $message !== '' ? $message : null,
            'consent_at' => Db::now(), 'consent_version' => mb_substr((string) ($in['consent_version'] ?? 'v1'), 0, 40) ?: 'v1',
            'ip_hash' => Util::ipHash($req->ip()),
        ]);
        $token = self::issueToken($id);
        MailQueue::enqueue('vip_recebido', $email, null, ['vip_request_id' => $id], 'vip_recebido:' . $id);
        $org = SettingsService::settings()['contact_email'] ?? '';
        if (filter_var($org, FILTER_VALIDATE_EMAIL)) {
            MailQueue::enqueue('vip_nova_admin', $org, null, ['vip_request_id' => $id], 'vip_admin:' . $id);
        }
        return ['request_code' => $code, 'access_token' => $token, 'status' => 'nova'];
    }

    public static function issueToken(string $requestId): string
    {
        $t = Util::token();
        Db::insert('vip_access_tokens', ['request_id' => $requestId, 'token_hash' => Util::sha256($t)]);
        return $t;
    }

    private static function byToken(Request $req, bool $lock = false): array
    {
        $code = strtoupper(trim((string) ($req->params['code'] ?? '')));
        $token = (string) ($req->header('x-vip-token') ?? '');
        if ($token === '' || !preg_match('/^VIP-[A-Z2-9]{6}$/', $code)) {
            RateLimiter::hit('token_fail', $req->ip(), 30, 600);
            throw new ApiError('ACESSO_INVALIDO', 403);
        }
        $r = Db::one('SELECT v.* FROM vip_requests v JOIN vip_access_tokens a ON a.request_id = v.id WHERE v.request_code = :c AND a.token_hash = :h' . ($lock ? ' FOR UPDATE' : ''),
            ['c' => $code, 'h' => Util::sha256($token)]);
        if (!$r) {
            RateLimiter::hit('token_fail', $req->ip(), 30, 600);
            throw new ApiError('ACESSO_INVALIDO', 403);
        }
        return $r;
    }

    private static function currentProposal(string $requestId): ?array
    {
        return Db::one("SELECT * FROM vip_proposals WHERE request_id = :r AND status <> 'substituida' ORDER BY created_at DESC, id DESC LIMIT 1", ['r' => $requestId]);
    }

    private static function presentProposal(?array $p): ?array
    {
        if (!$p) {
            return null;
        }
        $expired = $p['status'] === 'enviada' && strtotime($p['valid_until'] . ' UTC') < time();
        return [
            'id' => $p['id'], 'tickets' => (int) $p['tickets'], 'total_kz' => (float) $p['total_kz'], 'conditions' => $p['conditions'],
            'valid_until' => Util::iso($p['valid_until']), 'status' => $expired ? 'expirada' : $p['status'],
            'created_at' => Util::iso($p['created_at']), 'responded_at' => Util::iso($p['responded_at']),
            'order_code' => $p['order_id'] ? Db::value('SELECT order_code FROM orders WHERE id = :o', ['o' => $p['order_id']]) : null,
        ];
    }

    public static function customerView(Request $req): array
    {
        $r = self::byToken($req);
        return [
            'request_code' => $r['request_code'], 'status' => $r['status'], 'status_reason' => $r['status'] === 'rejeitada' ? $r['status_reason'] : null,
            'full_name' => $r['full_name'], 'email_masked' => Util::maskEmail($r['email']), 'participants' => (int) $r['participants'],
            'message' => $r['message'], 'created_at' => Util::iso($r['created_at']),
            'proposal' => self::presentProposal(self::currentProposal($r['id'])),
        ];
    }

    /** O cliente aceita a proposta: cria o pedido de pagamento VIP com o valor aprovado. */
    public static function accept(Request $req): array
    {
        return Db::tx(function () use ($req) {
            $r = self::byToken($req, true);
            $p = self::currentProposal($r['id']);
            if (!$p || $p['status'] !== 'enviada' || $r['status'] !== 'proposta_enviada') {
                throw new ApiError('PROPOSTA_INDISPONIVEL', 409);
            }
            if (strtotime($p['valid_until'] . ' UTC') < time()) {
                Db::run("UPDATE vip_proposals SET status = 'expirada' WHERE id = :id", ['id' => $p['id']]);
                throw new ApiError('PROPOSTA_EXPIRADA', 409);
            }
            $e = Db::one('SELECT * FROM events WHERE id = :id FOR UPDATE', ['id' => SettingsService::EVENT_ID]);
            $cat = self::vipCategory(true);
            $qty = (int) $p['tickets'];
            if ((int) $cat['quantity_total'] - (int) $cat['quantity_reserved'] - (int) $cat['quantity_sold'] < $qty) {
                throw new ApiError('VIP_ESGOTADO', 409);
            }
            $regId = Util::uuid();
            Db::insert('registrations', [
                'id' => $regId, 'event_id' => $e['id'], 'full_name' => $r['full_name'], 'email' => $r['email'], 'phone' => $r['phone'],
                'consent_at' => $r['consent_at'], 'consent_version' => $r['consent_version'], 'ip_hash' => Util::ipHash($req->ip()),
            ]);
            do {
                $code = 'V25-' . Util::randomCode(6);
            } while (Db::value('SELECT 1 FROM orders WHERE order_code = :c', ['c' => $code]));
            $orderId = Util::uuid();
            $total = number_format((float) $p['total_kz'], 2, '.', '');
            $unit = number_format(round((float) $p['total_kz'] / $qty, 2), 2, '.', '');
            Db::insert('orders', [
                'id' => $orderId, 'event_id' => $e['id'], 'registration_id' => $regId, 'order_code' => $code, 'status' => 'aguardando_pagamento',
                'source' => 'vip', 'total_kz' => $total, 'guests_total' => $qty, 'idempotency_key' => Util::uuid(),
                'expires_at' => gmdate('Y-m-d H:i:s', time() + (int) $e['reservation_hours'] * 3600),
            ]);
            Db::insert('order_items', [
                'order_id' => $orderId, 'category_id' => $cat['id'], 'quantity' => $qty, 'unit_price_kz' => $unit,
                'persons_per_ticket' => (int) $cat['persons_per_ticket'], 'line_total_kz' => $total,
            ]);
            Db::run('UPDATE ticket_categories SET quantity_reserved = quantity_reserved + :q WHERE id = :id', ['q' => $qty, 'id' => $cat['id']]);
            Db::run("UPDATE vip_proposals SET status = 'aceite', responded_at = UTC_TIMESTAMP(), order_id = :o WHERE id = :id", ['o' => $orderId, 'id' => $p['id']]);
            Db::run("UPDATE vip_requests SET status = 'aceite' WHERE id = :id", ['id' => $r['id']]);
            Audit::history($orderId, 'aguardando_pagamento', 'Pedido VIP criado a partir da proposta aceite ' . $r['request_code']);
            $token = OrderService::issueToken($orderId);
            MailQueue::enqueue('pedido_criado', $r['email'], $orderId, [], 'pedido_criado:' . $orderId);
            return ['order_code' => $code, 'access_token' => $token, 'total_kz' => (float) $total];
        });
    }

    public static function decline(Request $req): array
    {
        return Db::tx(function () use ($req) {
            $r = self::byToken($req, true);
            $p = self::currentProposal($r['id']);
            if (!$p || $p['status'] !== 'enviada') {
                throw new ApiError('PROPOSTA_INDISPONIVEL', 409);
            }
            Db::run("UPDATE vip_proposals SET status = 'recusada', responded_at = UTC_TIMESTAMP() WHERE id = :id", ['id' => $p['id']]);
            Db::run("UPDATE vip_requests SET status = 'recusada_cliente' WHERE id = :id", ['id' => $r['id']]);
            return ['status' => 'recusada_cliente'];
        });
    }

    // ------------------------------------------------------------------ organização
    public static function adminList(array $q): array
    {
        $where = '1=1';
        $params = [];
        $status = (string) ($q['status'] ?? 'abertas');
        if ($status === 'abertas') {
            $where = "status IN ('nova','em_analise','proposta_enviada')";
        } elseif ($status !== 'todas') {
            $where = 'status = :s';
            $params['s'] = $status;
        }
        return array_map(fn ($r) => [
            'id' => $r['id'], 'request_code' => $r['request_code'], 'full_name' => $r['full_name'], 'email' => $r['email'], 'phone' => $r['phone'],
            'participants' => (int) $r['participants'], 'status' => $r['status'], 'created_at' => Util::iso($r['created_at']),
            'proposal' => self::presentProposal(self::currentProposal($r['id'])),
        ], Db::all("SELECT * FROM vip_requests WHERE $where ORDER BY created_at DESC LIMIT 300", $params));
    }

    public static function adminDetail(string $id): array
    {
        $r = Db::one('SELECT * FROM vip_requests WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $cat = self::vipCategory();
        return [
            'request' => [
                'id' => $r['id'], 'request_code' => $r['request_code'], 'full_name' => $r['full_name'], 'email' => $r['email'], 'phone' => $r['phone'],
                'participants' => (int) $r['participants'], 'message' => $r['message'], 'status' => $r['status'], 'status_reason' => $r['status_reason'],
                'admin_notes' => $r['admin_notes'], 'consent_at' => Util::iso($r['consent_at']), 'created_at' => Util::iso($r['created_at']),
            ],
            'proposals' => array_map([self::class, 'presentProposal'], Db::all('SELECT * FROM vip_proposals WHERE request_id = :r ORDER BY created_at DESC, id DESC', ['r' => $id])),
            'vip_available' => max(0, (int) $cat['quantity_total'] - (int) $cat['quantity_reserved'] - (int) $cat['quantity_sold']),
        ];
    }

    public static function update(string $id, array $in): array
    {
        return Db::tx(function () use ($id, $in) {
            $r = Db::one('SELECT * FROM vip_requests WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
            $set = [];
            $params = ['id' => $id, 'u' => Auth::user()['id'] ?? null];
            if (array_key_exists('admin_notes', $in)) {
                $set[] = 'admin_notes = :n';
                $params['n'] = mb_substr(trim((string) $in['admin_notes']), 0, 5000);
            }
            if (array_key_exists('status', $in)) {
                $to = (string) $in['status'];
                $allowed = ['em_analise' => ['nova'], 'rejeitada' => self::OPEN, 'cancelada' => self::OPEN];
                if (!isset($allowed[$to]) || !in_array($r['status'], $allowed[$to], true)) {
                    throw new ApiError('ESTADO_INVALIDO', 409);
                }
                $reason = trim((string) ($in['reason'] ?? ''));
                if ($to === 'rejeitada' && mb_strlen($reason) < 5) {
                    throw new ApiError('MOTIVO_OBRIGATORIO', 422);
                }
                $set[] = 'status = :s';
                $set[] = 'status_reason = :sr';
                $params['s'] = $to;
                $params['sr'] = $reason !== '' ? mb_substr($reason, 0, 500) : null;
                Db::run("UPDATE vip_proposals SET status = 'substituida' WHERE request_id = :r AND status = 'enviada'", ['r' => $id]);
                if ($to === 'rejeitada') {
                    MailQueue::enqueue('vip_rejeitado', $r['email'], null, ['vip_request_id' => $id, 'motivo' => $reason]);
                }
            }
            if ($set) {
                Db::run('UPDATE vip_requests SET ' . implode(', ', $set) . ', handled_by = :u WHERE id = :id', $params);
                Audit::log('vip.actualizado', 'vip_request', $id, array_intersect_key($in, array_flip(['status', 'reason'])) + ['codigo' => $r['request_code']]);
            }
            return self::adminDetail($id);
        });
    }

    /** Proposta individual: número de ingressos, valor total aprovado, condições e validade. */
    public static function propose(string $id, array $in): array
    {
        $tickets = $in['tickets'] ?? null;
        $total = $in['total_kz'] ?? null;
        $conditions = trim((string) ($in['conditions'] ?? ''));
        $days = (int) ($in['valid_days'] ?? 7);
        if (!is_int($tickets) || $tickets < 1 || $tickets > 100) {
            throw new ApiError('PARTICIPANTES_INVALIDO', 422);
        }
        if (!is_numeric($total) || (float) $total <= 0 || (float) $total > 999999999) {
            throw new ApiError('PRECO_INVALIDO', 422);
        }
        if (mb_strlen($conditions) < 5 || mb_strlen($conditions) > 5000) {
            throw new ApiError('CONDICOES_OBRIGATORIAS', 422);
        }
        if ($days < 1 || $days > 60) {
            throw new ApiError('VALOR_INVALIDO', 422, ['campo' => 'valid_days']);
        }
        return Db::tx(function () use ($id, $tickets, $total, $conditions, $days) {
            $r = Db::one('SELECT * FROM vip_requests WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
            if (!in_array($r['status'], self::OPEN, true) && $r['status'] !== 'recusada_cliente') {
                throw new ApiError('ESTADO_INVALIDO', 409);
            }
            $cat = self::vipCategory();
            if ((int) $cat['quantity_total'] - (int) $cat['quantity_reserved'] - (int) $cat['quantity_sold'] < $tickets) {
                throw new ApiError('VIP_ESGOTADO', 409);
            }
            Db::run("UPDATE vip_proposals SET status = 'substituida' WHERE request_id = :r AND status = 'enviada'", ['r' => $id]);
            $pid = Util::uuid();
            Db::insert('vip_proposals', [
                'id' => $pid, 'request_id' => $id, 'tickets' => $tickets, 'total_kz' => number_format((float) $total, 2, '.', ''),
                'conditions' => $conditions, 'valid_until' => gmdate('Y-m-d H:i:s', time() + $days * 86400), 'created_by' => Auth::user()['id'] ?? null,
            ]);
            Db::run("UPDATE vip_requests SET status = 'proposta_enviada', handled_by = :u WHERE id = :id", ['u' => Auth::user()['id'] ?? null, 'id' => $id]);
            MailQueue::enqueue('vip_proposta', $r['email'], null, ['vip_request_id' => $id], 'vip_proposta:' . $pid);
            Audit::log('vip.proposta', 'vip_request', $id, ['codigo' => $r['request_code'], 'ingressos' => $tickets, 'total_kz' => (float) $total, 'validade_dias' => $days]);
            return self::adminDetail($id);
        });
    }

    /** Ligação segura para enviar ao cliente por outro canal (ex.: WhatsApp). */
    public static function accessLink(string $id): array
    {
        $r = Db::one('SELECT * FROM vip_requests WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        Audit::log('vip.link_gerado', 'vip_request', $id, ['codigo' => $r['request_code']]);
        return ['request_code' => $r['request_code'], 'access_token' => self::issueToken($id)];
    }

    /** Contexto para os emails VIP (inclui ligação segura nova). */
    public static function emailContext(string $requestId, string $site): array
    {
        $r = Db::one('SELECT * FROM vip_requests WHERE id = :id', ['id' => $requestId]);
        if (!$r) {
            return [];
        }
        $p = self::presentProposal(self::currentProposal($requestId));
        return [
            'full_name' => $r['full_name'], 'request_code' => $r['request_code'], 'participants' => (int) $r['participants'],
            'vip_email' => $r['email'], 'vip_phone' => $r['phone'], 'vip_message' => (string) $r['message'], 'proposal' => $p,
            'link' => $site . '/vip/' . rawurlencode($r['request_code']) . '#t=' . rawurlencode(self::issueToken($requestId)),
            'admin_link' => $site . '/admin/vip',
        ];
    }
}
