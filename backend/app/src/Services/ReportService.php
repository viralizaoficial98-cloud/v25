<?php
declare(strict_types=1);

namespace App\Services;

use App\Http\Response;
use App\Support\Audit;
use App\Support\Db;

/** Exportações CSV (Excel, ";" + BOM UTF-8) geradas no servidor. */
final class ReportService
{
    private const LABELS = [
        'iniciada' => 'Inscrição iniciada', 'aguardando_pagamento' => 'Aguardando pagamento', 'comprovativo_enviado' => 'Comprovativo enviado',
        'em_analise' => 'Em análise', 'aprovado' => 'Pagamento aprovado', 'rejeitado' => 'Pagamento rejeitado', 'cancelado' => 'Cancelado', 'emitido' => 'Ingresso emitido',
    ];

    private static function luanda(?string $dt): string
    {
        if (!$dt) {
            return '';
        }
        return (new \DateTimeImmutable(substr($dt, 0, 19), new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('Africa/Luanda'))->format('d/m/Y H:i');
    }

    /** @param list<array<string,mixed>> $rows @param array<string,string> $cols */
    public static function csv(array $rows, array $cols): string
    {
        $esc = static function (mixed $v): string {
            $s = $v === null ? '' : (string) $v;
            if ($s !== '' && in_array($s[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
                $s = "'" . $s; // evita injecção de fórmulas no Excel
            }
            return preg_match('/[";\n\r]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
        };
        $lines = [implode(';', array_map($esc, array_values($cols)))];
        foreach ($rows as $r) {
            $lines[] = implode(';', array_map(fn ($k) => $esc($r[$k] ?? ''), array_keys($cols)));
        }
        return "\xEF\xBB\xBF" . implode("\r\n", $lines);
    }

    /** Filtros comuns: estado, categoria, origem (checkout/vip) e intervalo de datas (AAAA-MM-DD). */
    public static function filters(array $q): array
    {
        $w = ['1=1'];
        $p = [];
        if (!empty($q['status']) && preg_match('/^[a-z_]+$/', (string) $q['status'])) {
            $w[] = 'o.status = :st';
            $p['st'] = $q['status'];
        }
        if (!empty($q['category']) && \App\Support\Util::isUuid($q['category'])) {
            $w[] = 'i.category_id = :cat';
            $p['cat'] = $q['category'];
        }
        if (in_array($q['source'] ?? '', ['checkout', 'vip'], true)) {
            $w[] = 'o.source = :src';
            $p['src'] = $q['source'];
        }
        foreach (['from' => '>=', 'to' => '<'] as $k => $op) {
            if (!empty($q[$k]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $q[$k])) {
                // datas do formulário em hora de Luanda (UTC+1)
                $d = new \DateTimeImmutable($q[$k] . ' 00:00:00', new \DateTimeZone('Africa/Luanda'));
                if ($k === 'to') {
                    $d = $d->modify('+1 day');
                }
                $w[] = "o.created_at $op :$k";
                $p[$k] = $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            }
        }
        return [implode(' AND ', $w), $p];
    }

    public static function orders(array $q = []): Response
    {
        [$where, $params] = self::filters($q);
        $rows = Db::all("SELECT o.order_code, o.status, o.source, r.full_name, r.email, r.phone, c.name AS categoria, c.lot_label, i.quantity, o.guests_total,
                i.unit_price_kz, o.total_kz, p.reference, COALESCE(p.method, o.payment_method) AS method, p.amount_kz, o.created_at, o.reviewed_at, o.rejection_reason, o.cancel_reason
            FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
            JOIN ticket_categories c ON c.id = i.category_id LEFT JOIN payments p ON p.order_id = o.id WHERE $where ORDER BY o.created_at", $params);
        foreach ($rows as &$r) {
            $r['estado'] = self::LABELS[$r['status']] ?? $r['status'];
            $r['categoria'] .= $r['lot_label'] ? ' (' . $r['lot_label'] . ')' : '';
            $r['criado'] = self::luanda($r['created_at']);
            $r['revisto'] = self::luanda($r['reviewed_at']);
        }
        Audit::log('relatorio.exportado', 'report', 'pedidos', ['linhas' => count($rows), 'filtros' => array_intersect_key($q, array_flip(['status', 'category', 'source', 'from', 'to']))]);
        return Response::file(self::csv($rows, [
            'order_code' => 'Pedido', 'estado' => 'Estado', 'source' => 'Origem', 'full_name' => 'Nome', 'email' => 'Email', 'phone' => 'Telefone', 'categoria' => 'Categoria',
            'quantity' => 'Quantidade', 'guests_total' => 'Convidados', 'unit_price_kz' => 'Preço unitário (Kz)', 'total_kz' => 'Total (Kz)',
            'reference' => 'Referência bancária', 'method' => 'Método', 'amount_kz' => 'Valor confirmado (Kz)', 'criado' => 'Criado', 'revisto' => 'Revisto',
            'rejection_reason' => 'Motivo rejeição', 'cancel_reason' => 'Motivo cancelamento',
        ]), 'text/csv; charset=utf-8', 'v25-pedidos-' . gmdate('Y-m-d-Hi') . '.csv');
    }

    public static function tickets(): Response
    {
        $rows = Db::all('SELECT t.ticket_code, o.order_code, t.seq, t.holder_name, c.name AS categoria, t.status, t.issued_at, t.checked_in_at
            FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_categories c ON c.id = t.category_id ORDER BY t.issued_at, t.seq');
        foreach ($rows as &$r) {
            $r['emitido'] = self::luanda($r['issued_at']);
            $r['entrada'] = self::luanda($r['checked_in_at']);
        }
        Audit::log('relatorio.exportado', 'report', 'ingressos', ['linhas' => count($rows)]);
        return Response::file(self::csv($rows, [
            'ticket_code' => 'Ingresso', 'order_code' => 'Pedido', 'seq' => 'N.º', 'holder_name' => 'Titular', 'categoria' => 'Categoria',
            'status' => 'Estado', 'emitido' => 'Emitido', 'entrada' => 'Entrada',
        ]), 'text/csv; charset=utf-8', 'v25-ingressos-' . gmdate('Y-m-d-Hi') . '.csv');
    }

    public static function checkins(): Response
    {
        $rows = Db::all("SELECT k.created_at, k.input_code, k.result, COALESCE(NULLIF(u.full_name,''), u.email) AS operador
            FROM checkins k LEFT JOIN users u ON u.id = k.user_id ORDER BY k.id");
        foreach ($rows as &$r) {
            $r['data'] = self::luanda($r['created_at']);
        }
        Audit::log('relatorio.exportado', 'report', 'checkins', ['linhas' => count($rows)]);
        return Response::file(self::csv($rows, ['data' => 'Data', 'input_code' => 'Código', 'result' => 'Resultado', 'operador' => 'Operador']),
            'text/csv; charset=utf-8', 'v25-checkins-' . gmdate('Y-m-d-Hi') . '.csv');
    }

    public static function vip(): Response
    {
        $rows = Db::all("SELECT v.request_code, v.status, v.full_name, v.email, v.phone, v.participants, v.message, v.created_at,
                p.tickets, p.total_kz, p.status AS proposta, o.order_code, o.status AS pedido
            FROM vip_requests v
            LEFT JOIN vip_proposals p ON p.id = (SELECT id FROM vip_proposals WHERE request_id = v.id AND status <> 'substituida' ORDER BY created_at DESC, id DESC LIMIT 1)
            LEFT JOIN orders o ON o.id = p.order_id ORDER BY v.created_at");
        foreach ($rows as &$r) {
            $r['criado'] = self::luanda($r['created_at']);
        }
        Audit::log('relatorio.exportado', 'report', 'vip', ['linhas' => count($rows)]);
        return Response::file(self::csv($rows, [
            'request_code' => 'Solicitação', 'status' => 'Estado', 'full_name' => 'Nome', 'email' => 'Email', 'phone' => 'Telefone',
            'participants' => 'Participantes', 'message' => 'Mensagem', 'criado' => 'Criado', 'tickets' => 'Ingressos propostos',
            'total_kz' => 'Valor proposto (Kz)', 'proposta' => 'Estado da proposta', 'order_code' => 'Pedido', 'pedido' => 'Estado do pedido',
        ]), 'text/csv; charset=utf-8', 'v25-vip-' . gmdate('Y-m-d-Hi') . '.csv');
    }

    /** Dados para o relatório PDF gerado no painel (com os mesmos filtros do CSV). */
    public static function summary(array $q = []): array
    {
        [$where, $params] = self::filters($q);
        $rows = Db::all("SELECT o.order_code, o.status, r.full_name, c.name AS categoria, i.quantity, o.total_kz, p.reference
            FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
            JOIN ticket_categories c ON c.id = i.category_id LEFT JOIN payments p ON p.order_id = o.id WHERE $where ORDER BY o.created_at", $params);
        return [
            'stats' => AdminQueryService::dashboard(),
            'orders' => array_map(fn ($r) => [
                'order_code' => $r['order_code'], 'status' => $r['status'], 'full_name' => $r['full_name'], 'category' => $r['categoria'],
                'quantity' => (int) $r['quantity'], 'total_kz' => (float) $r['total_kz'], 'payment_reference' => $r['reference'],
            ], $rows),
        ];
    }
}
