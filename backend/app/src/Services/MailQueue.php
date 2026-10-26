<?php
declare(strict_types=1);

namespace App\Services;

use App\Mail\Mailer;
use App\Mail\Templates;
use App\Support\Audit;
use App\Support\Config;
use App\Support\Db;
use App\Support\Env;
use App\Support\Logger;

/** Fila de emails (tabela email_outbox), processada por cron ou pelo painel. */
final class MailQueue
{
    private const MAX_ATTEMPTS = 5;
    private const ORDER_LINK_TEMPLATES = ['pedido_criado', 'comprovativo_recebido', 'pagamento_aprovado', 'pagamento_rejeitado', 'ingresso_disponivel', 'lembrete_evento', 'acesso_pedido'];

    public static function enqueue(string $template, string $to, ?string $orderId, array $payload = [], ?string $dedupe = null, ?string $userId = null): void
    {
        Db::run(
            'INSERT INTO email_outbox (template, to_email, order_id, user_id, payload, dedupe_key) VALUES (:t, :e, :o, :u, :p, :d)
             ON DUPLICATE KEY UPDATE id = id',
            ['t' => $template, 'e' => $to, 'o' => $orderId, 'u' => $userId, 'p' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'd' => $dedupe],
        );
    }

    /** @return array{configured:bool,missing:list<string>,host:?string,port:?int,from:?string} */
    public static function smtpStatus(): array
    {
        $required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_ADDRESS', 'APP_URL'];
        $missing = array_values(array_filter($required, fn ($k) => Env::get($k) === null));
        return ['configured' => !$missing, 'missing' => $missing, 'host' => Env::get('SMTP_HOST'), 'port' => Env::get('SMTP_PORT') ? (int) Env::get('SMTP_PORT') : null, 'from' => Env::get('SMTP_FROM_ADDRESS')];
    }

    public static function list(): array
    {
        // O payload não é devolvido (pode conter tokens de acesso)
        return array_map(fn ($r) => [
            'id' => (int) $r['id'], 'template' => $r['template'], 'to_email' => $r['to_email'], 'status' => $r['status'], 'attempts' => (int) $r['attempts'],
            'last_error' => $r['last_error'], 'created_at' => \App\Support\Util::iso($r['created_at']), 'sent_at' => \App\Support\Util::iso($r['sent_at']),
        ], Db::all('SELECT id, template, to_email, status, attempts, last_error, created_at, sent_at FROM email_outbox ORDER BY id DESC LIMIT 100'));
    }

    /** Processa até $limit mensagens. Sem SMTP configurado não envia nada (e di-lo). */
    public static function process(int $limit = 20, ?Mailer $mailer = null): array
    {
        $status = self::smtpStatus();
        if (!$status['configured'] && $mailer === null) {
            return ['sent' => 0, 'failed' => 0, 'skipped' => 'SMTP por configurar (faltam: ' . implode(', ', $status['missing']) . '). Nenhum email foi enviado.'];
        }
        $mailer ??= new Mailer();
        // Mensagens presas em "a_enviar" há mais de 15 min voltam à fila
        Db::run("UPDATE email_outbox SET status = 'pendente', locked_at = NULL WHERE status = 'a_enviar' AND locked_at < (UTC_TIMESTAMP() - INTERVAL 15 MINUTE)");
        $ids = array_column(Db::all("SELECT id FROM email_outbox WHERE status = 'pendente' AND attempts < :m ORDER BY id LIMIT :l", ['m' => self::MAX_ATTEMPTS, 'l' => $limit]), 'id');
        $sent = 0;
        $failed = 0;
        $settings = SettingsService::full();
        $site = Config::appUrl();
        foreach ($ids as $id) {
            // Reclamação atómica: evita envio duplicado se dois processos correrem ao mesmo tempo
            $claimed = Db::run("UPDATE email_outbox SET status = 'a_enviar', locked_at = UTC_TIMESTAMP() WHERE id = :id AND status = 'pendente'", ['id' => $id])->rowCount();
            if ($claimed !== 1) {
                continue;
            }
            $row = Db::one('SELECT * FROM email_outbox WHERE id = :id', ['id' => $id]);
            try {
                $payload = json_decode((string) $row['payload'], true) ?: [];
                $ctx = self::context($row, $payload, $settings, $site);
                $mail = Templates::render($row['template'], $ctx);
                $attachments = [];
                if ($row['template'] === 'ingresso_disponivel' && $row['order_id']) {
                    $order = Db::one('SELECT * FROM orders WHERE id = :id', ['id' => $row['order_id']]);
                    $attachments[] = ['name' => 'V25-ingressos-' . $order['order_code'] . '.pdf', 'content' => TicketService::pdf($order), 'type' => 'application/pdf'];
                    foreach ($ctx['tickets'] as $t) {
                        $attachments[] = ['name' => $t['ticket_code'] . '.png', 'content' => TicketService::qrPng($t['qr_payload'], 6), 'type' => 'image/png', 'cid' => $t['qr_cid']];
                    }
                }
                $mailer->send($row['to_email'], $mail['subject'], $mail['html'], $mail['text'], $attachments, $settings['email_sender_name'] ?? '', $settings['email_reply_to'] ?? '');
                // Tokens de recuperação não ficam guardados depois do envio
                $clean = in_array($row['template'], ['recuperar_senha', 'convite_equipa'], true) ? '{}' : $row['payload'];
                Db::run("UPDATE email_outbox SET status = 'enviado', sent_at = UTC_TIMESTAMP(), attempts = attempts + 1, last_error = NULL, payload = :p WHERE id = :id", ['p' => $clean, 'id' => $id]);
                $sent++;
            } catch (\Throwable $e) {
                $attempts = (int) $row['attempts'] + 1;
                Db::run('UPDATE email_outbox SET status = :s, attempts = :a, last_error = :e, locked_at = NULL WHERE id = :id', [
                    's' => $attempts >= self::MAX_ATTEMPTS ? 'falhou' : 'pendente', 'a' => $attempts, 'e' => mb_substr($e->getMessage(), 0, 500), 'id' => $id,
                ]);
                Logger::error('Falha no envio de email', ['outbox_id' => $id, 'erro' => $e->getMessage()]);
                $failed++;
            }
        }
        return ['sent' => $sent, 'failed' => $failed];
    }

    private static function context(array $row, array $payload, array $s, string $site): array
    {
        $ctx = [
            'event' => ['name' => $s['event_name'], 'starts_at' => $s['starts_at'], 'venue' => $s['venue'], 'address' => $s['address'], 'maps_url' => $s['maps_url']],
            'sender' => ['contact_email' => $s['contact_email'], 'contact_phone' => $s['contact_phone']],
            'payment' => ['account_name' => $s['bank_account_name'], 'account_number' => $s['bank_account_number'], 'iban' => $s['bank_iban'], 'express_number' => $s['express_number']],
            'tickets' => [],
        ] + $payload;
        if (!empty($payload['vip_request_id'])) {
            $vip = VipService::emailContext((string) $payload['vip_request_id'], $site);
            if ($row['template'] === 'vip_nova_admin') {
                unset($vip['link']); // a equipa usa o painel; a ligação privada é só do cliente
            }
            return $vip + $ctx;
        }
        if (in_array($row['template'], ['recuperar_senha', 'convite_equipa'], true)) {
            $ctx['link'] = $site . '/admin/redefinir#token=' . rawurlencode((string) ($payload['token'] ?? ''));
            $ctx['full_name'] = (string) Db::value('SELECT full_name FROM users WHERE id = :id', ['id' => $row['user_id']]);
            return $ctx;
        }
        if ($row['order_id']) {
            $o = Db::one('SELECT * FROM orders WHERE id = :id', ['id' => $row['order_id']]);
            $view = OrderService::customerView($o);
            $ctx += [
                'order_code' => $view['order_code'], 'full_name' => $view['full_name'], 'quantity' => $view['quantity'], 'guests_total' => $view['guests_total'],
                'total_kz' => $view['total_kz'], 'expires_at' => $o['expires_at'] ? \App\Support\Util::iso($o['expires_at']) : null,
                'rejection_reason' => $o['rejection_reason'], 'ticket_type' => $view['ticket_type']['name'], 'lot_label' => $view['ticket_type']['lot_label'],
            ];
            if (in_array($row['template'], self::ORDER_LINK_TEMPLATES, true)) {
                $token = OrderService::issueToken($o['id']);
                $ctx['link'] = $site . '/pedido/' . rawurlencode($o['order_code']) . '#t=' . rawurlencode($token);
            }
            foreach ($view['tickets'] as $t) {
                if ($t['status'] === 'valido') {
                    $ctx['tickets'][] = ['ticket_code' => $t['ticket_code'], 'seq' => $t['seq'], 'qr_payload' => $t['qr_payload'], 'qr_cid' => 'qr-' . $t['ticket_code'] . '@v25'];
                }
            }
        }
        return $ctx;
    }

    public static function queueReminders(): int
    {
        $n = Db::run("INSERT IGNORE INTO email_outbox (template, to_email, order_id, payload, dedupe_key)
            SELECT 'lembrete_evento', r.email, o.id, '{}', CONCAT('lembrete:', o.id) FROM orders o JOIN registrations r ON r.id = o.registration_id WHERE o.status = 'emitido'")->rowCount();
        Audit::log('email.lembretes', 'email_outbox', null, ['enfileirados' => $n]);
        return $n;
    }
}
