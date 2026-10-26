<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Support\ApiError;
use App\Support\Db;
use App\Support\Util;

/** Consultas de leitura do painel: pedidos/participantes, dashboard, auditoria. */
final class AdminQueryService
{
    private const ORDER_SELECT = 'SELECT o.*, r.full_name, r.email, r.phone, r.consent_at, r.consent_version,
            i.quantity, i.unit_price_kz, i.category_id, c.name AS category_name, c.lot_label,
            p.reference AS payment_reference, p.amount_kz AS amount_confirmed_kz, COALESCE(p.method, o.payment_method) AS payment_method, p.status AS payment_status
        FROM orders o
        JOIN registrations r ON r.id = o.registration_id
        JOIN order_items i ON i.order_id = o.id
        JOIN ticket_categories c ON c.id = i.category_id
        LEFT JOIN payments p ON p.order_id = o.id';

    public static function presentOrder(array $o): array
    {
        return [
            'id' => $o['id'], 'order_code' => $o['order_code'], 'status' => $o['status'], 'ticket_type_id' => $o['category_id'],
            'quantity' => (int) $o['quantity'], 'guests_total' => (int) $o['guests_total'], 'unit_price_kz' => (float) $o['unit_price_kz'],
            'total_kz' => (float) $o['total_kz'], 'full_name' => $o['full_name'], 'email' => $o['email'], 'phone' => $o['phone'],
            'consent_at' => Util::iso($o['consent_at']), 'consent_version' => $o['consent_version'], 'expires_at' => Util::iso($o['expires_at']),
            'payment_reference' => $o['payment_reference'], 'payment_method' => $o['payment_method'], 'payment_status' => $o['payment_status'],
            'amount_confirmed_kz' => $o['amount_confirmed_kz'] === null ? null : (float) $o['amount_confirmed_kz'],
            'rejection_reason' => $o['rejection_reason'], 'cancel_reason' => $o['cancel_reason'], 'reviewed_by' => $o['reviewed_by'],
            'reviewed_at' => Util::iso($o['reviewed_at']), 'created_at' => Util::iso($o['created_at']), 'updated_at' => Util::iso($o['updated_at']),
            'ticket_types' => ['name' => $o['category_name'], 'lot_label' => $o['lot_label']],
            'source' => $o['source'] ?? 'checkout', 'expired_at' => Util::iso($o['expired_at'] ?? null),
        ];
    }

    public static function listOrders(array $q): array
    {
        $where = ['1=1'];
        $params = [];
        $status = (string) ($q['status'] ?? 'all');
        if ($status === 'review') {
            $where[] = "o.status IN ('comprovativo_enviado','em_analise')";
        } elseif ($status !== 'all' && $status !== '') {
            $where[] = 'o.status = :st';
            $params['st'] = $status;
        }
        if (!empty($q['category']) && Util::isUuid($q['category'])) {
            $where[] = 'EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.category_id = :cat)';
            $params['cat'] = $q['category'];
        }
        if (in_array($q['source'] ?? '', ['checkout', 'vip'], true)) {
            $where[] = 'o.source = :src';
            $params['src'] = $q['source'];
        }
        $term = trim((string) ($q['q'] ?? ''));
        if ($term !== '') {
            $like = '%' . addcslashes(mb_substr($term, 0, 80), '%_\\') . '%';
            $where[] = '(o.order_code LIKE :t1 OR r.full_name LIKE :t2 OR r.email LIKE :t3 OR r.phone LIKE :t4)';
            $params += ['t1' => $like, 't2' => $like, 't3' => $like, 't4' => $like];
        }
        $page = max(0, (int) ($q['page'] ?? 0));
        $size = min(100, max(1, (int) ($q['page_size'] ?? 25)));
        $order = $status === 'review' ? 'o.updated_at ASC' : 'o.created_at DESC';
        $w = implode(' AND ', $where);
        $count = (int) Db::value("SELECT COUNT(*) FROM orders o JOIN registrations r ON r.id = o.registration_id WHERE $w", $params);
        $rows = Db::all(self::ORDER_SELECT . " WHERE $w ORDER BY $order LIMIT :lim OFFSET :off", $params + ['lim' => $size, 'off' => $page * $size]);
        return ['rows' => array_map([self::class, 'presentOrder'], $rows), 'count' => $count];
    }

    public static function orderDetail(string $id): array
    {
        $o = Db::one(self::ORDER_SELECT . ' WHERE o.id = :id', ['id' => $id]) ?? throw new ApiError('PEDIDO_INEXISTENTE', 404);
        return [
            'order' => self::presentOrder($o),
            'proofs' => array_map(fn ($p) => [
                'id' => $p['id'], 'mime_type' => $p['mime_type'], 'size_bytes' => (int) $p['size_bytes'], 'status' => $p['status'],
                'uploaded_at' => Util::iso($p['uploaded_at']), 'original_name' => $p['original_name'],
                'duplicate_of' => Db::value('SELECT order_id FROM payment_proofs WHERE sha256 = :s AND order_id <> :o LIMIT 1', ['s' => $p['sha256'], 'o' => $id]),
            ], Db::all('SELECT * FROM payment_proofs WHERE order_id = :o ORDER BY uploaded_at DESC', ['o' => $id])),
            'tickets' => array_map(fn ($t) => [
                'id' => $t['id'], 'ticket_code' => $t['ticket_code'], 'seq' => (int) $t['seq'], 'status' => $t['status'], 'checked_in_at' => Util::iso($t['checked_in_at']),
            ], Db::all('SELECT * FROM tickets WHERE order_id = :o ORDER BY seq', ['o' => $id])),
            'events' => array_map(fn ($h) => [
                'id' => (int) $h['id'], 'status' => $h['status'], 'note' => $h['note'], 'created_at' => Util::iso(substr((string) $h['created_at'], 0, 19)),
            ], Db::all('SELECT * FROM transaction_history WHERE order_id = :o ORDER BY created_at, id', ['o' => $id])),
        ];
    }

    public static function dashboard(): array
    {
        OrderService::expireStale();
        $count = fn (string $where) => (int) Db::value("SELECT COUNT(*) FROM orders WHERE $where");
        $finance = Auth::can('reports.view') || Auth::can('payments.review');
        $e = SettingsService::event();
        return [
            'orders_total' => $count('1=1'),
            'orders_pending_payment' => $count("status IN ('iniciada','aguardando_pagamento')"),
            'proofs_in_review' => $count("status IN ('comprovativo_enviado','em_analise')"),
            'payments_approved' => $count("status IN ('aprovado','emitido')"),
            'payments_rejected' => $count("status = 'rejeitado'"),
            'orders_cancelled' => $count("status = 'cancelado'"),
            'tickets_issued' => (int) Db::value("SELECT COUNT(*) FROM tickets WHERE status <> 'anulado'"),
            'tickets_used' => (int) Db::value("SELECT COUNT(*) FROM tickets WHERE status = 'utilizado'"),
            'revenue_confirmed_kz' => $finance ? (float) Db::value("SELECT COALESCE(SUM(amount_kz),0) FROM payments WHERE status = 'confirmado'") : null,
            'guests_confirmed' => (int) Db::value("SELECT COALESCE(SUM(guests_total),0) FROM orders WHERE status IN ('aprovado','emitido')"),
            'capacity' => $e['capacity'] === null ? null : (int) $e['capacity'],
            'capacity_available' => $e['capacity'] === null ? null : max(0, (int) $e['capacity'] - (int) Db::value("SELECT COALESCE(SUM(guests_total),0) FROM orders WHERE status <> 'cancelado'")),
            'reservations_expired' => (int) Db::value('SELECT COUNT(*) FROM orders WHERE expired_at IS NOT NULL'),
            'checkins' => (int) Db::value("SELECT COUNT(*) FROM tickets WHERE status = 'utilizado'"),
            'vip_requests_total' => (int) Db::value('SELECT COUNT(*) FROM vip_requests'),
            'vip_requests_open' => (int) Db::value("SELECT COUNT(*) FROM vip_requests WHERE status IN ('nova','em_analise','proposta_enviada')"),
            'vip_orders' => (int) Db::value("SELECT COUNT(*) FROM orders WHERE source = 'vip' AND status <> 'cancelado'"),
            'by_type' => array_map(fn ($t) => [
                'id' => $t['id'], 'name' => $t['name'], 'lot_label' => $t['lot_label'], 'price_kz' => Util::money($t['price_kz']),
                'total' => (int) $t['quantity_total'], 'reserved' => (int) $t['quantity_reserved'], 'sold' => (int) $t['quantity_sold'],
                'sale_mode' => $t['sale_mode'] ?? 'directo',
                'revenue_kz' => $finance ? (float) Db::value("SELECT COALESCE(SUM(p.amount_kz),0) FROM payments p JOIN order_items i ON i.order_id = p.order_id WHERE p.status = 'confirmado' AND i.category_id = :c", ['c' => $t['id']]) : null,
                'available' => (int) $t['quantity_total'] - (int) $t['quantity_reserved'] - (int) $t['quantity_sold'], 'published' => (bool) $t['published'],
            ], Db::all('SELECT * FROM ticket_categories ORDER BY sort_order, created_at')),
        ];
    }

    public static function audit(int $page, int $size = 50): array
    {
        $rows = Db::all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT :l OFFSET :o', ['l' => $size, 'o' => max(0, $page) * $size]);
        return [
            'rows' => array_map(fn ($r) => [
                'id' => (int) $r['id'], 'actor_email' => $r['user_email'], 'action' => $r['action'], 'entity' => $r['entity'],
                'entity_id' => $r['entity_id'], 'details' => json_decode((string) $r['details'], true) ?? [], 'created_at' => Util::iso($r['created_at']),
            ], $rows),
            'count' => (int) Db::value('SELECT COUNT(*) FROM audit_logs'),
        ];
    }
}
