<?php
declare(strict_types=1);

namespace App\Mail;

use App\Support\Env;
use PHPMailer\PHPMailer\PHPMailer;

/** Envio SMTP autenticado (PHPMailer). Credenciais apenas no .env privado. */
class Mailer
{
    /** @param list<array{name:string,content:string,type:string,cid?:string}> $attachments */
    public function send(string $to, string $subject, string $html, string $text, array $attachments = [], string $fromName = '', string $replyTo = ''): void
    {
        $m = new PHPMailer(true);
        $m->isSMTP();
        $m->Host = (string) Env::require('SMTP_HOST');
        $m->Port = Env::int('SMTP_PORT', 465);
        $m->SMTPAuth = true;
        $m->Username = (string) Env::require('SMTP_USERNAME');
        $m->Password = (string) Env::require('SMTP_PASSWORD');
        $enc = strtolower(Env::get('SMTP_ENCRYPTION', $m->Port === 465 ? 'ssl' : 'tls') ?? 'ssl');
        if ($enc === 'none') {
            // Apenas para testes locais (servidor SMTP de desenvolvimento). Nunca em produção.
            $m->SMTPSecure = '';
            $m->SMTPAutoTLS = false;
        } else {
            $m->SMTPSecure = $enc === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        }
        $m->Timeout = 20;
        $m->CharSet = 'UTF-8';
        $m->setFrom((string) Env::require('SMTP_FROM_ADDRESS'), $fromName ?: (Env::get('SMTP_FROM_NAME', 'V25 — O Legado') ?? ''));
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $m->addReplyTo($replyTo);
        }
        $m->addAddress($to);
        $m->Subject = $subject;
        $m->isHTML(true);
        $m->Body = $html;
        $m->AltBody = $text;
        foreach ($attachments as $a) {
            if (!empty($a['cid'])) {
                $m->addStringEmbeddedImage($a['content'], $a['cid'], $a['name'], PHPMailer::ENCODING_BASE64, $a['type']);
            } else {
                $m->addStringAttachment($a['content'], $a['name'], PHPMailer::ENCODING_BASE64, $a['type']);
            }
        }
        $m->send();
    }
}
