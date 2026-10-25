<?php
declare(strict_types=1);

namespace App\Support;

use App\Auth\Auth;
use App\Http\Request;

final class Audit
{
    /** @param array<string,mixed> $details */
    public static function log(string $action, string $entity, ?string $entityId, array $details = []): void
    {
        $user = Auth::user();
        Db::insert('audit_logs', [
            'user_id' => $user['id'] ?? null,
            'user_email' => $user['email'] ?? null,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
            'details' => json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR),
            'ip_hash' => Request::current() ? Util::ipHash(Request::current()->ip()) : null,
        ]);
    }

    public static function history(string $orderId, string $status, ?string $note = null): void
    {
        Db::insert('transaction_history', [
            'order_id' => $orderId,
            'status' => $status,
            'note' => $note,
            'actor_user_id' => Auth::user()['id'] ?? null,
        ]);
    }
}
