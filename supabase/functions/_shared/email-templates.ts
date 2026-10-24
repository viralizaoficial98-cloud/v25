// Templates de email do V25 — O Legado. TypeScript puro (sem APIs Deno/Node), testável com Vitest.

export type TemplateName =
  | 'pedido_criado'
  | 'comprovativo_recebido'
  | 'pagamento_aprovado'
  | 'pagamento_rejeitado'
  | 'ingresso_disponivel'
  | 'lembrete_evento'
  | 'acesso_pedido'
  | 'pedido_cancelado'
  | 'teste_smtp';

export interface EmailContext {
  order_code?: string;
  full_name?: string;
  quantity?: number;
  guests_total?: number;
  total_kz?: number | string;
  expires_at?: string | null;
  rejection_reason?: string | null;
  ticket_type?: string;
  lot_label?: string;
  event: { name: string; starts_at: string; venue: string; address: string; maps_url: string };
  payment?: { account_name: string; account_number: string; iban: string; express_number: string };
  sender?: { contact_email?: string; contact_phone?: string };
  tickets?: { ticket_code: string; seq: number; qr_cid?: string }[];
  link?: string | null;
  motivo?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function kz(v: number | string | undefined | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 2 }).replace(/ | |\./g, ' ')} Kz`;
}

export function luanda(iso: string | null | undefined, withTime = true) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Africa/Luanda',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}

function layout(title: string, body: string, ctx: EmailContext) {
  const contact = [ctx.sender?.contact_email, ctx.sender?.contact_phone].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#0b0806;font-family:Arial,Helvetica,sans-serif;color:#f4ead8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0806;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a130d;border:1px solid #5a4425;border-radius:16px">
<tr><td style="padding:28px 28px 8px;border-bottom:1px solid #3a2c1c">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#e8cf8e;font-weight:bold">V25 <span style="font-size:15px;letter-spacing:4px;color:#f4ead8">O LEGADO</span></div>
<div style="font-size:11px;letter-spacing:2px;color:#c9a45c;text-transform:uppercase;margin:6px 0 16px">${esc(ctx.event.name)} · ${esc(luanda(ctx.event.starts_at))}</div>
</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#f4ead8">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#f4ead8;margin:0 0 16px">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #3a2c1c;font-size:12px;color:#a8977c">
${esc(ctx.event.venue)} · ${esc(ctx.event.address)}<br>${contact ? `${contact}<br>` : ''}
Recebeu este email porque se inscreveu no ${esc(ctx.event.name)}. Não partilhe as ligações privadas deste email.
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#c9a45c;color:#0b0806;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:999px;display:inline-block">${esc(label)}</a></p>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 0;color:#a8977c;font-size:13px">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${v}</td></tr>`;

function summary(ctx: EmailContext) {
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;border-top:1px solid #3a2c1c;border-bottom:1px solid #3a2c1c">
${row('Pedido', esc(ctx.order_code))}
${row('Categoria', esc(`${ctx.ticket_type ?? ''}${ctx.lot_label ? ` · ${ctx.lot_label}` : ''}`))}
${row('Ingressos', esc(ctx.quantity))}
${row('Convidados', esc(ctx.guests_total))}
${row('Total', esc(kz(ctx.total_kz)))}
</table>`;
}

function bank(ctx: EmailContext) {
  const p = ctx.payment;
  if (!p || (!p.iban && !p.account_number && !p.express_number)) return '';
  return `<div style="background:#2b1d13;border:1px solid #c9a45c;border-radius:12px;padding:16px;margin:16px 0">
<div style="font-size:11px;letter-spacing:2px;color:#c9a45c;text-transform:uppercase;margin-bottom:8px">Dados para transferência</div>
<table role="presentation" width="100%">
${p.account_name ? row('Nome da conta', esc(p.account_name)) : ''}
${p.account_number ? row('N.º da conta', esc(p.account_number)) : ''}
${p.iban ? row('IBAN', `<span style="font-family:monospace">${esc(p.iban)}</span>`) : ''}
${p.express_number ? row('Transferência Express', esc(p.express_number)) : ''}
${row('Valor', esc(kz(ctx.total_kz)))}
${row('Descritivo', esc(ctx.order_code))}
</table></div>`;
}

const notConfirmed =
  '<p style="color:#e8cf8e"><strong>Importante:</strong> o envio do comprovativo não confirma o pagamento. A equipa financeira verifica manualmente a entrada do valor na conta e só depois emite os ingressos.</p>';

export function renderEmail(template: TemplateName, ctx: EmailContext): RenderedEmail {
  const name = esc(ctx.full_name?.split(' ')[0] ?? '');
  const link = ctx.link ?? '';
  const hi = name ? `<p>Olá ${name},</p>` : '<p>Olá,</p>';
  let subject: string;
  let title: string;
  let body: string;
  let text: string;

  switch (template) {
    case 'pedido_criado':
      subject = `Pedido ${ctx.order_code} criado — instruções de pagamento`;
      title = 'Recebemos a sua inscrição';
      body = `${hi}<p>O seu pedido foi registado. Para garantir o lugar, faça a transferência com o código do pedido no descritivo e carregue o comprovativo.</p>
${summary(ctx)}${bank(ctx)}
${ctx.expires_at ? `<p>Prazo para enviar o comprovativo: <strong>${esc(luanda(ctx.expires_at))}</strong> (hora de Luanda).</p>` : ''}
${link ? button(link, 'Abrir o meu pedido e enviar comprovativo') : ''}${notConfirmed}`;
      text = `Pedido ${ctx.order_code} registado. Total: ${kz(ctx.total_kz)}. IBAN: ${ctx.payment?.iban ?? ''}. Descritivo: ${ctx.order_code}. Envie o comprovativo em: ${link}`;
      break;
    case 'comprovativo_recebido':
      subject = `Comprovativo recebido — pedido ${ctx.order_code}`;
      title = 'Comprovativo recebido';
      body = `${hi}<p>Recebemos o comprovativo do pedido <strong>${esc(ctx.order_code)}</strong>. O pagamento está agora em análise.</p>${notConfirmed}${link ? button(link, 'Acompanhar o pedido') : ''}`;
      text = `Recebemos o comprovativo do pedido ${ctx.order_code}. O pagamento será verificado manualmente. Acompanhe em: ${link}`;
      break;
    case 'pagamento_aprovado':
      subject = `Pagamento aprovado — pedido ${ctx.order_code}`;
      title = 'Pagamento confirmado';
      body = `${hi}<p>A equipa financeira confirmou o pagamento de <strong>${esc(kz(ctx.total_kz))}</strong> do pedido <strong>${esc(ctx.order_code)}</strong>. Obrigado!</p><p>Os seus ingressos digitais foram emitidos e seguem num email separado.</p>${link ? button(link, 'Ver os meus ingressos') : ''}`;
      text = `Pagamento do pedido ${ctx.order_code} aprovado. Ingressos em: ${link}`;
      break;
    case 'pagamento_rejeitado':
      subject = `Pagamento não validado — pedido ${ctx.order_code}`;
      title = 'Não foi possível validar o pagamento';
      body = `${hi}<p>Analisámos o comprovativo do pedido <strong>${esc(ctx.order_code)}</strong>, mas não foi possível validar o pagamento.</p>
<p style="background:#3b1a1a;border-left:3px solid #e07070;padding:10px 14px"><strong>Motivo:</strong> ${esc(ctx.motivo ?? ctx.rejection_reason ?? '')}</p>
<p>O seu lugar continua reservado${ctx.expires_at ? ` até <strong>${esc(luanda(ctx.expires_at))}</strong>` : ''}. Pode enviar um novo comprovativo na página do pedido.</p>${link ? button(link, 'Enviar novo comprovativo') : ''}`;
      text = `Pagamento do pedido ${ctx.order_code} não validado. Motivo: ${ctx.motivo ?? ctx.rejection_reason ?? ''}. Envie novo comprovativo em: ${link}`;
      break;
    case 'ingresso_disponivel': {
      subject = `Os seus ingressos — ${ctx.event.name}`;
      title = 'O seu ingresso digital está disponível';
      const list = (ctx.tickets ?? [])
        .map(
          (t) => `<div style="border:1px dashed #c9a45c;border-radius:12px;padding:16px;margin:12px 0;text-align:center">
${t.qr_cid ? `<img src="cid:${esc(t.qr_cid)}" width="180" height="180" alt="QR Code ${esc(t.ticket_code)}" style="background:#fff;padding:6px;border-radius:8px">` : ''}
<div style="font-family:monospace;font-size:18px;color:#e8cf8e;margin-top:8px">${esc(t.ticket_code)}</div>
<div style="font-size:12px;color:#a8977c">Ingresso ${esc(t.seq)} de ${esc(ctx.quantity)} · ${esc(ctx.ticket_type)}</div></div>`,
        )
        .join('');
      body = `${hi}<p>Os seus ingressos para o <strong>${esc(ctx.event.name)}</strong> estão prontos. Apresente o QR Code à entrada — cada código é válido para uma única utilização.</p>
<p><strong>${esc(luanda(ctx.event.starts_at))}</strong><br>${esc(ctx.event.venue)}, ${esc(ctx.event.address)}</p>${list}
${link ? button(link, 'Abrir ingressos e descarregar PDF') : ''}<p style="font-size:13px;color:#a8977c">Não partilhe estes códigos: o primeiro a ser lido à entrada invalida os restantes usos.</p>`;
      text = `Ingressos do pedido ${ctx.order_code}: ${(ctx.tickets ?? []).map((t) => t.ticket_code).join(', ')}. PDF em: ${link}`;
      break;
    }
    case 'lembrete_evento':
      subject = `Está quase! ${ctx.event.name} — ${luanda(ctx.event.starts_at, false)}`;
      title = 'Contamos consigo';
      body = `${hi}<p>Falta pouco para celebrarmos juntos 25 anos de música, fé, amizade e história.</p>
<p><strong>${esc(luanda(ctx.event.starts_at))}</strong><br>${esc(ctx.event.venue)}, ${esc(ctx.event.address)}</p>
${button(ctx.event.maps_url, 'Ver localização')}${link ? `<p>Tenha os seus ingressos à mão: <a href="${esc(link)}" style="color:#e8cf8e">abrir ingressos</a>.</p>` : ''}`;
      text = `Lembrete: ${ctx.event.name}, ${luanda(ctx.event.starts_at)}, ${ctx.event.venue}. Ingressos: ${link}`;
      break;
    case 'acesso_pedido':
      subject = `Acesso ao seu pedido ${ctx.order_code}`;
      title = 'Ligação para o seu pedido';
      body = `${hi}<p>Recebemos um pedido para recuperar o acesso ao pedido <strong>${esc(ctx.order_code)}</strong>. Use o botão abaixo para o abrir.</p>${link ? button(link, 'Abrir o meu pedido') : ''}<p style="font-size:13px;color:#a8977c">Se não foi você a pedir, pode ignorar este email.</p>`;
      text = `Acesso ao pedido ${ctx.order_code}: ${link}`;
      break;
    case 'pedido_cancelado':
      subject = `Pedido ${ctx.order_code} cancelado`;
      title = 'Pedido cancelado';
      body = `${hi}<p>O pedido <strong>${esc(ctx.order_code)}</strong> foi cancelado.</p>${ctx.motivo ? `<p><strong>Motivo:</strong> ${esc(ctx.motivo)}</p>` : ''}<p>Em caso de dúvida, contacte a organização.</p>`;
      text = `Pedido ${ctx.order_code} cancelado. ${ctx.motivo ?? ''}`;
      break;
    case 'teste_smtp':
      subject = 'Teste de envio — V25 O Legado';
      title = 'O envio de emails está a funcionar';
      body = '<p>Este é um email de teste enviado a partir do painel administrativo do V25 — O Legado.</p>';
      text = 'Email de teste do painel V25 — O Legado.';
      break;
  }
  return { subject, html: layout(title, body, ctx), text };
}
