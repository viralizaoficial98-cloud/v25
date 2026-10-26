<?php
declare(strict_types=1);

namespace App\Mail;

/** Templates de email do V25 — O Legado (HTML compatível com clientes de email + texto simples). */
final class Templates
{
    private static function e(mixed $s): string
    {
        return htmlspecialchars((string) ($s ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    public static function kz(mixed $v): string
    {
        if (!is_numeric($v)) {
            return '—';
        }
        $n = (float) $v;
        $dec = fmod($n, 1.0) != 0.0 ? 2 : 0;
        return number_format($n, $dec, ',', ' ') . ' Kz';
    }

    public static function luanda(?string $iso, bool $withTime = true): string
    {
        if (!$iso) {
            return '';
        }
        $d = (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('Africa/Luanda'));
        $m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][(int) $d->format('n') - 1];
        return $d->format('j') . " de $m de " . $d->format('Y') . ($withTime ? ', ' . $d->format('H:i') : '');
    }

    private static function layout(string $title, string $body, array $c): string
    {
        $contact = implode(' · ', array_map([self::class, 'e'], array_filter([$c['sender']['contact_email'] ?? '', $c['sender']['contact_phone'] ?? ''])));
        $ev = $c['event'];
        return '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' . self::e($title) . '</title></head>'
            . '<body style="margin:0;background:#0b0806;font-family:Arial,Helvetica,sans-serif;color:#f4ead8">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0806;padding:24px 12px"><tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a130d;border:1px solid #5a4425;border-radius:16px">'
            . '<tr><td style="padding:28px 28px 8px;border-bottom:1px solid #3a2c1c">'
            . '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:30px;color:#e8cf8e;font-weight:bold">V25 <span style="font-size:15px;letter-spacing:4px;color:#f4ead8">O LEGADO</span></div>'
            . '<div style="font-size:11px;letter-spacing:2px;color:#c9a45c;text-transform:uppercase;margin:6px 0 16px">' . self::e($ev['name']) . ' · ' . self::e(self::luanda($ev['starts_at'])) . '</div>'
            . '</td></tr><tr><td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#f4ead8">'
            . '<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#f4ead8;margin:0 0 16px">' . self::e($title) . '</h1>' . $body
            . '</td></tr><tr><td style="padding:18px 28px 26px;border-top:1px solid #3a2c1c;font-size:12px;color:#a8977c">'
            . self::e($ev['venue']) . ' · ' . self::e($ev['address']) . '<br>' . ($contact ? $contact . '<br>' : '')
            . 'Recebeu este email no âmbito do ' . self::e($ev['name']) . '. Não partilhe as ligações privadas deste email.'
            . '</td></tr></table></td></tr></table></body></html>';
    }

    private static function button(string $href, string $label): string
    {
        return '<p style="margin:24px 0"><a href="' . self::e($href) . '" style="background:#c9a45c;color:#0b0806;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:999px;display:inline-block">' . self::e($label) . '</a></p>';
    }

    private static function row(string $k, string $vHtml): string
    {
        return '<tr><td style="padding:6px 0;color:#a8977c;font-size:13px">' . self::e($k) . '</td><td style="padding:6px 0;text-align:right;font-weight:bold">' . $vHtml . '</td></tr>';
    }

    private static function summary(array $c): string
    {
        return '<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;border-top:1px solid #3a2c1c;border-bottom:1px solid #3a2c1c">'
            . self::row('Pedido', self::e($c['order_code'] ?? ''))
            . self::row('Categoria', self::e(($c['ticket_type'] ?? '') . (!empty($c['lot_label']) ? ' · ' . $c['lot_label'] : '')))
            . self::row('Ingressos', self::e($c['quantity'] ?? ''))
            . self::row('Convidados', self::e($c['guests_total'] ?? ''))
            . self::row('Total', self::e(self::kz($c['total_kz'] ?? null)))
            . '</table>';
    }

    private static function bank(array $c): string
    {
        $p = $c['payment'] ?? [];
        if (empty($p['iban']) && empty($p['account_number']) && empty($p['express_number'])) {
            return '';
        }
        return '<div style="background:#2b1d13;border:1px solid #c9a45c;border-radius:12px;padding:16px;margin:16px 0">'
            . '<div style="font-size:11px;letter-spacing:2px;color:#c9a45c;text-transform:uppercase;margin-bottom:8px">Dados para transferência</div><table role="presentation" width="100%">'
            . (!empty($p['account_name']) ? self::row('Nome da conta', self::e($p['account_name'])) : '')
            . (!empty($p['account_number']) ? self::row('N.º da conta', self::e($p['account_number'])) : '')
            . (!empty($p['iban']) ? self::row('IBAN', '<span style="font-family:monospace">' . self::e($p['iban']) . '</span>') : '')
            . (!empty($p['express_number']) ? self::row('Transferência Express', self::e($p['express_number'])) : '')
            . self::row('Valor', self::e(self::kz($c['total_kz'] ?? null)))
            . self::row('Descritivo', self::e($c['order_code'] ?? ''))
            . '</table></div>';
    }

    private const NOT_CONFIRMED = '<p style="color:#e8cf8e"><strong>Importante:</strong> o envio do comprovativo não confirma o pagamento. A equipa financeira verifica manualmente a entrada do valor na conta e só depois emite os ingressos.</p>';

    /** @return array{subject:string,html:string,text:string} */
    public static function render(string $template, array $c): array
    {
        $first = explode(' ', trim((string) ($c['full_name'] ?? '')))[0] ?? '';
        $hi = $first !== '' ? '<p>Olá ' . self::e($first) . ',</p>' : '<p>Olá,</p>';
        $link = (string) ($c['link'] ?? '');
        $code = (string) ($c['order_code'] ?? '');
        $ev = $c['event'];
        switch ($template) {
            case 'pedido_criado':
                $subject = "Pedido $code criado — instruções de pagamento";
                $title = 'Recebemos a sua inscrição';
                $body = $hi . '<p>O seu pedido foi registado. Para garantir o lugar, faça a transferência com o código do pedido no descritivo e carregue o comprovativo.</p>'
                    . self::summary($c) . self::bank($c)
                    . (!empty($c['expires_at']) ? '<p>Prazo para enviar o comprovativo: <strong>' . self::e(self::luanda($c['expires_at'])) . '</strong> (hora de Luanda).</p>' : '')
                    . ($link ? self::button($link, 'Abrir o meu pedido e enviar comprovativo') : '') . self::NOT_CONFIRMED;
                $text = "Pedido $code registado. Total: " . self::kz($c['total_kz'] ?? null) . '. IBAN: ' . ($c['payment']['iban'] ?? '') . ". Descritivo: $code. Envie o comprovativo em: $link";
                break;
            case 'comprovativo_recebido':
                $subject = "Comprovativo recebido — pedido $code";
                $title = 'Comprovativo recebido';
                $body = $hi . '<p>Recebemos o comprovativo do pedido <strong>' . self::e($code) . '</strong>. O pagamento está agora em análise.</p>' . self::NOT_CONFIRMED . ($link ? self::button($link, 'Acompanhar o pedido') : '');
                $text = "Recebemos o comprovativo do pedido $code. O pagamento será verificado manualmente. Acompanhe em: $link";
                break;
            case 'pagamento_aprovado':
                $subject = "Pagamento aprovado — pedido $code";
                $title = 'Pagamento confirmado';
                $body = $hi . '<p>A equipa financeira confirmou o pagamento de <strong>' . self::e(self::kz($c['total_kz'] ?? null)) . '</strong> do pedido <strong>' . self::e($code) . '</strong>. Obrigado!</p><p>Os seus ingressos digitais foram emitidos e seguem num email separado.</p>' . ($link ? self::button($link, 'Ver os meus ingressos') : '');
                $text = "Pagamento do pedido $code aprovado. Ingressos em: $link";
                break;
            case 'pagamento_rejeitado':
                $motivo = (string) ($c['motivo'] ?? $c['rejection_reason'] ?? '');
                $subject = "Pagamento não validado — pedido $code";
                $title = 'Não foi possível validar o pagamento';
                $body = $hi . '<p>Analisámos o comprovativo do pedido <strong>' . self::e($code) . '</strong>, mas não foi possível validar o pagamento.</p>'
                    . '<p style="background:#3b1a1a;border-left:3px solid #e07070;padding:10px 14px"><strong>Motivo:</strong> ' . self::e($motivo) . '</p>'
                    . '<p>O seu lugar continua reservado' . (!empty($c['expires_at']) ? ' até <strong>' . self::e(self::luanda($c['expires_at'])) . '</strong>' : '') . '. Pode enviar um novo comprovativo na página do pedido.</p>'
                    . ($link ? self::button($link, 'Enviar novo comprovativo') : '');
                $text = "Pagamento do pedido $code não validado. Motivo: $motivo. Envie novo comprovativo em: $link";
                break;
            case 'ingresso_disponivel':
                $subject = 'Os seus ingressos — ' . $ev['name'];
                $title = 'O seu ingresso digital está disponível';
                $list = '';
                foreach ($c['tickets'] ?? [] as $t) {
                    $list .= '<div style="border:1px dashed #c9a45c;border-radius:12px;padding:16px;margin:12px 0;text-align:center">'
                        . (!empty($t['qr_cid']) ? '<img src="cid:' . self::e($t['qr_cid']) . '" width="180" height="180" alt="QR Code ' . self::e($t['ticket_code']) . '" style="background:#fff;padding:6px;border-radius:8px">' : '')
                        . '<div style="font-family:monospace;font-size:18px;color:#e8cf8e;margin-top:8px">' . self::e($t['ticket_code']) . '</div>'
                        . '<div style="font-size:12px;color:#a8977c">Ingresso ' . self::e($t['seq']) . ' de ' . self::e($c['quantity'] ?? '') . ' · ' . self::e($c['ticket_type'] ?? '') . '</div></div>';
                }
                $body = $hi . '<p>Os seus ingressos para o <strong>' . self::e($ev['name']) . '</strong> estão prontos (também em PDF, em anexo). Apresente o QR Code à entrada — cada código é válido para uma única utilização.</p>'
                    . '<p><strong>' . self::e(self::luanda($ev['starts_at'])) . '</strong><br>' . self::e($ev['venue']) . ', ' . self::e($ev['address']) . '</p>' . $list
                    . ($link ? self::button($link, 'Abrir ingressos') : '') . '<p style="font-size:13px;color:#a8977c">Não partilhe estes códigos: depois de lido à entrada, o QR deixa de ser válido.</p>';
                $text = "Ingressos do pedido $code: " . implode(', ', array_column($c['tickets'] ?? [], 'ticket_code')) . ". PDF em anexo. Página: $link";
                break;
            case 'lembrete_evento':
                $subject = 'Está quase! ' . $ev['name'] . ' — ' . self::luanda($ev['starts_at'], false);
                $title = 'Contamos consigo';
                $body = $hi . '<p>Falta pouco para celebrarmos juntos 25 anos de música, fé, amizade e história.</p><p><strong>' . self::e(self::luanda($ev['starts_at'])) . '</strong><br>'
                    . self::e($ev['venue']) . ', ' . self::e($ev['address']) . '</p>' . self::button($ev['maps_url'], 'Ver localização')
                    . ($link ? '<p>Tenha os seus ingressos à mão: <a href="' . self::e($link) . '" style="color:#e8cf8e">abrir ingressos</a>.</p>' : '');
                $text = 'Lembrete: ' . $ev['name'] . ', ' . self::luanda($ev['starts_at']) . ', ' . $ev['venue'] . ". Ingressos: $link";
                break;
            case 'acesso_pedido':
                $subject = "Acesso ao seu pedido $code";
                $title = 'Ligação para o seu pedido';
                $body = $hi . '<p>Recebemos um pedido para recuperar o acesso ao pedido <strong>' . self::e($code) . '</strong>.</p>' . ($link ? self::button($link, 'Abrir o meu pedido') : '') . '<p style="font-size:13px;color:#a8977c">Se não foi você a pedir, pode ignorar este email.</p>';
                $text = "Acesso ao pedido $code: $link";
                break;
            case 'pedido_cancelado':
                $subject = "Pedido $code cancelado";
                $title = 'Pedido cancelado';
                $body = $hi . '<p>O pedido <strong>' . self::e($code) . '</strong> foi cancelado.</p>' . (!empty($c['motivo']) ? '<p><strong>Motivo:</strong> ' . self::e($c['motivo']) . '</p>' : '') . '<p>Em caso de dúvida, contacte a organização.</p>';
                $text = "Pedido $code cancelado. " . ($c['motivo'] ?? '');
                break;
            case 'recuperar_senha':
                $subject = 'Redefinir palavra-passe — Painel V25';
                $title = 'Redefinir palavra-passe';
                $body = $hi . '<p>Foi pedida a redefinição da palavra-passe do painel V25. A ligação é válida durante 1 hora e só pode ser usada uma vez.</p>' . self::button($link, 'Definir nova palavra-passe') . '<p style="font-size:13px;color:#a8977c">Se não foi você, ignore este email — a palavra-passe actual continua válida.</p>';
                $text = "Redefinir palavra-passe (válido 1 hora): $link";
                break;
            case 'convite_equipa':
                $subject = 'Convite para o painel V25 — O Legado';
                $title = 'Bem-vindo à equipa do V25';
                $body = $hi . '<p>Foi criada uma conta para si no painel de gestão do V25 — O Legado. Defina a sua palavra-passe (ligação válida durante 72 horas).</p>' . self::button($link, 'Definir palavra-passe');
                $text = "Convite para o painel V25. Defina a palavra-passe: $link";
                break;
            case 'vip_recebido':
                $subject = 'Recebemos a sua solicitação VIP — ' . ($c['request_code'] ?? '');
                $title = 'Solicitação de acesso VIP recebida';
                $body = $hi . '<p>Obrigado pelo interesse em viver o <strong>' . self::e($ev['name']) . '</strong> na modalidade VIP.</p>'
                    . '<p>A organização vai analisar o seu pedido (<strong>' . self::e($c['request_code'] ?? '') . '</strong>, ' . self::e($c['participants'] ?? '') . ' participante(s)) e enviar-lhe uma proposta com as condições, o valor e a disponibilidade.</p>'
                    . '<p style="color:#e8cf8e">As condições VIP dependem de aprovação da organização. Nenhum pagamento é necessário até aceitar uma proposta.</p>'
                    . ($link ? self::button($link, 'Acompanhar a solicitação') : '');
                $text = 'Solicitação VIP ' . ($c['request_code'] ?? '') . " recebida. Acompanhe em: $link";
                break;
            case 'vip_nova_admin':
                $subject = 'Nova solicitação VIP — ' . ($c['request_code'] ?? '');
                $title = 'Nova solicitação VIP';
                $body = '<p>Foi recebida uma nova solicitação de acesso VIP.</p><table role="presentation" width="100%">'
                    . self::row('Código', self::e($c['request_code'] ?? '')) . self::row('Nome', self::e($c['full_name'] ?? ''))
                    . self::row('Email', self::e($c['vip_email'] ?? '')) . self::row('Telefone', self::e($c['vip_phone'] ?? ''))
                    . self::row('Participantes', self::e($c['participants'] ?? '')) . '</table>'
                    . (!empty($c['vip_message']) ? '<p><strong>Mensagem:</strong> ' . nl2br(self::e($c['vip_message'])) . '</p>' : '')
                    . self::button((string) ($c['admin_link'] ?? ''), 'Abrir no painel');
                $text = 'Nova solicitação VIP ' . ($c['request_code'] ?? '') . ' de ' . ($c['full_name'] ?? '');
                break;
            case 'vip_proposta':
                $p = $c['proposal'] ?? [];
                $subject = 'Proposta VIP — ' . ($c['request_code'] ?? '');
                $title = 'A sua proposta VIP';
                $body = $hi . '<p>A organização preparou uma proposta para a sua solicitação VIP <strong>' . self::e($c['request_code'] ?? '') . '</strong>.</p>'
                    . '<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;border-top:1px solid #3a2c1c;border-bottom:1px solid #3a2c1c">'
                    . self::row('Ingressos VIP', self::e($p['tickets'] ?? '')) . self::row('Valor total', self::e(self::kz($p['total_kz'] ?? null)))
                    . self::row('Válida até', self::e(self::luanda($p['valid_until'] ?? null))) . '</table>'
                    . '<p><strong>Condições:</strong><br>' . nl2br(self::e($p['conditions'] ?? '')) . '</p>'
                    . ($link ? self::button($link, 'Ver e aceitar a proposta') : '')
                    . '<p style="font-size:13px;color:#a8977c">Ao aceitar, é criado um pedido de pagamento com o valor indicado. O ingresso VIP é emitido após a confirmação do pagamento.</p>';
                $text = 'Proposta VIP ' . ($c['request_code'] ?? '') . ': ' . self::kz($p['total_kz'] ?? null) . ". Ver e aceitar: $link";
                break;
            case 'vip_rejeitado':
                $subject = 'Solicitação VIP — ' . ($c['request_code'] ?? '');
                $title = 'Sobre a sua solicitação VIP';
                $body = $hi . '<p>Lamentamos, mas não foi possível atender à solicitação VIP <strong>' . self::e($c['request_code'] ?? '') . '</strong>.</p>'
                    . (!empty($c['motivo']) ? '<p><strong>Motivo:</strong> ' . self::e($c['motivo']) . '</p>' : '')
                    . '<p>Pode garantir o seu lugar nas categorias Normal ou Premium no site do evento.</p>';
                $text = 'Solicitação VIP ' . ($c['request_code'] ?? '') . ' não atendida. ' . ($c['motivo'] ?? '');
                break;
            case 'teste_smtp':
                $subject = 'Teste de envio — V25 O Legado';
                $title = 'O envio de emails está a funcionar';
                $body = '<p>Este é um email de teste enviado a partir do painel administrativo do V25 — O Legado.</p>';
                $text = 'Email de teste do painel V25 — O Legado.';
                break;
            default:
                throw new \InvalidArgumentException("Template desconhecido: $template");
        }
        return ['subject' => $subject, 'html' => self::layout($title, $body, $c), 'text' => $text];
    }
}
