// Edge Function "send-emails": processa a fila public.email_outbox e envia via SMTP autenticado.
// Chamada por: administrador (botão no painel, JWT) ou agendamento (Authorization: Bearer <SERVICE_ROLE_KEY>).
// Segredos necessários: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SITE_URL.
// Nota: o Supabase Edge bloqueia as portas 25 e 587 — use SMTP com TLS implícito na porta 465.
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import nodemailer from 'npm:nodemailer@6.9.16';
import QRCode from 'npm:qrcode@1.5.4';
import { renderEmail, type EmailContext, type TemplateName } from '../_shared/email-templates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const env = (k: string) => Deno.env.get(k)?.trim() || '';
const REQUIRED = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SITE_URL'];
const MAX_ATTEMPTS = 5;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (auth !== SERVICE_KEY) {
    // Utilizador do painel: tem de ser administrador activo
    const { data: u } = await admin.auth.getUser(auth);
    if (!u?.user) return json({ error: 'NAO_AUTENTICADO' }, 401);
    const { data: staff } = await admin.from('staff').select('role, active').eq('user_id', u.user.id).maybeSingle();
    if (!staff?.active || staff.role !== 'admin') return json({ error: 'SEM_PERMISSAO' }, 403);
  }

  const { action = 'process' } = await req.json().catch(() => ({}));
  const missing = REQUIRED.filter((k) => !env(k));
  if (action === 'status') {
    return json({ configured: missing.length === 0, missing, host: env('SMTP_HOST') || undefined, port: Number(env('SMTP_PORT')) || undefined, from: env('SMTP_FROM') || undefined });
  }
  if (missing.length) {
    return json({ sent: 0, failed: 0, skipped: `SMTP por configurar (faltam: ${missing.join(', ')}). Nenhum email foi enviado.` });
  }

  const port = Number(env('SMTP_PORT'));
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  });
  const site = env('SITE_URL').replace(/\/$/, '');

  // Reclama até 20 mensagens pendentes (evita envio duplicado em execuções paralelas)
  const { data: pending } = await admin.from('email_outbox').select('id').eq('status', 'pendente').lt('attempts', MAX_ATTEMPTS).order('id').limit(20);
  let sent = 0;
  let failed = 0;
  const { data: settings } = await admin.from('event_settings').select('*').eq('id', 1).single();

  for (const { id } of pending ?? []) {
    const { data: claimed } = await admin.from('email_outbox').update({ status: 'a_enviar' }).eq('id', id).eq('status', 'pendente').select('*').maybeSingle();
    if (!claimed) continue;
    try {
      let ctx: EmailContext = {
        event: { name: settings.event_name, starts_at: settings.starts_at, venue: settings.venue, address: settings.address, maps_url: settings.maps_url },
        sender: { contact_email: settings.contact_email, contact_phone: settings.contact_phone },
        ...(claimed.payload ?? {}),
      };
      const attachments: { filename: string; content: Uint8Array; cid: string; contentType: string }[] = [];
      if (claimed.order_id) {
        const { data: oc, error } = await admin.rpc('service_order_email_context', { p_order_id: claimed.order_id });
        if (error || !oc) throw new Error(error?.message ?? 'pedido inexistente');
        const { data: token, error: te } = await admin.rpc('service_issue_access_token', { p_order_id: claimed.order_id });
        if (te) throw new Error(te.message);
        ctx = { ...ctx, ...oc, ...(claimed.payload ?? {}), link: `${site}/pedido/${encodeURIComponent(oc.order_code)}#t=${encodeURIComponent(token)}` };
        if (claimed.template === 'ingresso_disponivel') {
          ctx.tickets = [];
          for (const t of oc.tickets as { ticket_code: string; seq: number; qr_payload: string }[]) {
            const png = await QRCode.toBuffer(t.qr_payload, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
            const cid = `qr-${t.ticket_code}@v25`;
            attachments.push({ filename: `${t.ticket_code}.png`, content: png, cid, contentType: 'image/png' });
            ctx.tickets.push({ ticket_code: t.ticket_code, seq: t.seq, qr_cid: cid });
          }
        }
      }
      const mail = renderEmail(claimed.template as TemplateName, ctx);
      await transport.sendMail({
        from: settings.email_sender_name ? `"${settings.email_sender_name.replace(/"/g, '')}" <${env('SMTP_FROM')}>` : env('SMTP_FROM'),
        replyTo: settings.email_reply_to || undefined,
        to: claimed.to_email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments,
      });
      await admin.from('email_outbox').update({ status: 'enviado', sent_at: new Date().toISOString(), attempts: claimed.attempts + 1, last_error: null }).eq('id', id);
      sent++;
    } catch (e) {
      const attempts = claimed.attempts + 1;
      await admin
        .from('email_outbox')
        .update({ status: attempts >= MAX_ATTEMPTS ? 'falhou' : 'pendente', attempts, last_error: String((e as Error)?.message ?? e).slice(0, 500) })
        .eq('id', id);
      failed++;
    }
  }
  return json({ sent, failed });
});
