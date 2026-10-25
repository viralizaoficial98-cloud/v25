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

    public static function orders(): Response
    {
        $rows = Db::all('SELECT o.order_code, o.status, r.full_name, r.email, r.phone, c.name AS categoria, c.lot_label, i.quantity, o.guests_total,
                i.unit_price_kz, o.total_kz, p.reference, p.method, p.amount_kz, o.created_at, o.reviewed_at, o.rejection_reason, o.cancel_reason
            FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
            JOIN ticket_categories c ON c.id = i.category_id LEFT JOIN payments p ON p.order_id = o.id ORDER BY o.created_at');
        foreach ($rows as &$r) {
            $r['estado'] = self::LABELS[$r['status']] ?? $r['status'];
            $r['categoria'] .= $r['lot_label'] ? ' (' . $r['lot_label'] . ')' : '';
            $r['criado'] = self::luanda($r['created_at']);
            $r['revisto'] = self::luanda($r['reviewed_at']);
        }
        Audit::log('relatorio.exportado', 'report', 'pedidos', ['linhas' => count($rows)]);
        return Response::file(self::csv($rows, [
            'order_code' => 'Pedido', 'estado' => 'Estado', 'full_name' => 'Nome', 'email' => 'Email', 'phone' => 'Telefone', 'categoria' => 'Categoria',
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

    /** Dados para o relatório PDF gerado no painel. */
    public static function summary(): array
    {
        $rows = Db::all('SELECT o.order_code, o.status, r.full_name, c.name AS categoria, i.quantity, o.total_kz, p.reference
            FROM orders o JOIN registrations r ON r.id = o.registration_id JOIN order_items i ON i.order_id = o.id
            JOIN ticket_categories c ON c.id = i.category_id LEFT JOIN payments p ON p.order_id = o.id ORDER BY o.created_at');
        return [
            'stats' => AdminQueryService::dashboard(),
            'orders' => array_map(fn ($r) => [
                'order_code' => $r['order_code'], 'status' => $r['status'], 'full_name' => $r['full_name'], 'category' => $r['categoria'],
                'quantity' => (int) $r['quantity'], 'total_kz' => (float) $r['total_kz'], 'payment_reference' => $r['reference'],
            ], $rows),
        ];
    }
}
