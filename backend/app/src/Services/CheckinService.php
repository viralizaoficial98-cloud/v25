<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Support\Db;
use App\Support\RateLimiter;

final class CheckinService
{
    public static function check(string $input, bool $commit): array
    {
        $uid = Auth::user()['id'] ?? null;
        RateLimiter::hit('checkin', (string) $uid, 120, 60);
        $raw = trim($input);
        $upper = strtoupper($raw);
        $log = static fn (?string $ticketId, string $code, string $result) => Db::insert('checkins', [
            'ticket_id' => $ticketId, 'input_code' => mb_substr($code, 0, 40), 'result' => $result, 'user_id' => $uid,
        ]);

        if (str_starts_with($upper, 'V25:')) {
            $parts = explode(':', $raw);
            $code = strtoupper($parts[1] ?? '');
            $sig = $parts[2] ?? '';
            if (!hash_equals(TicketService::qrSignature($code), $sig)) {
                $log(null, $code, 'assinatura_invalida');
                return ['result' => 'invalido', 'message' => 'QR Code inválido ou adulterado.'];
            }
        } else {
            $code = $upper;
        }

        return Db::tx(function () use ($code, $commit, $uid, $log) {
            $k = Db::one('SELECT * FROM tickets WHERE ticket_code = :c FOR UPDATE', ['c' => $code]);
            if (!$k) {
                $log(null, $code, 'inexistente');
                return ['result' => 'invalido', 'message' => 'Ingresso não encontrado.'];
            }
            $o = Db::one('SELECT status FROM orders WHERE id = :id', ['id' => $k['order_id']]);
            $item = Db::one('SELECT i.quantity, i.persons_per_ticket, c.name FROM order_items i JOIN ticket_categories c ON c.id = i.category_id WHERE i.order_id = :o AND i.category_id = :c',
                ['o' => $k['order_id'], 'c' => $k['category_id']]);
            $staff = null;
            if ($k['status'] === 'utilizado') {
                $staff = Db::value("SELECT COALESCE(NULLIF(full_name, ''), email) FROM users WHERE id = :id", ['id' => $k['checked_in_by']]);
                $result = 'ja_utilizado';
            } elseif ($k['status'] === 'anulado' || $o['status'] !== 'emitido') {
                $result = 'anulado';
            } elseif ($commit) {
                Db::run("UPDATE tickets SET status = 'utilizado', checked_in_at = UTC_TIMESTAMP(), checked_in_by = :u WHERE id = :id", ['u' => $uid, 'id' => $k['id']]);
                $k = Db::one('SELECT * FROM tickets WHERE id = :id', ['id' => $k['id']]);
                $result = 'ok';
            } else {
                $result = 'valido';
            }
            $log($k['id'], $k['ticket_code'], $result);
            return [
                'result' => $result,
                'ticket_code' => $k['ticket_code'],
                'holder_name' => $k['holder_name'],
                'seq' => (int) $k['seq'],
                'order_quantity' => (int) ($item['quantity'] ?? 0),
                'ticket_type' => $item['name'] ?? '',
                'persons_per_ticket' => (int) ($item['persons_per_ticket'] ?? 1),
                'checked_in_at' => \App\Support\Util::iso($k['checked_in_at']),
                'checked_in_by' => $staff,
            ];
        });
    }
}
