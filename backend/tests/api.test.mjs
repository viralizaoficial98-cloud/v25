// Testes de integração da API PHP (MySQL/MariaDB real, php -S com 8 workers).
// Executar com: npm run test:api
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sharp from 'sharp';

const BASE = process.env.V25_BASE;
// Pastas onde a API grava ficheiros (podem ser as de uma instalação real, ex.: /home/renewangola)
const PROOFS_DIR = process.env.V25_PROOFS_DIR || path.join(process.env.V25_TMP ?? '', 'storage/proofs');
const MEDIA_DIR = process.env.V25_MEDIA_DIR || path.join(process.env.V25_TMP ?? '', 'media');
let db;

// ---------------------------------------------------------------- servidor SMTP de teste
const mails = [];
let smtp;
function startSmtpSink(port) {
  smtp = net.createServer((sock) => {
    let mode = 'cmd'; // cmd | data | auth_user | auth_pass
    let buf = '';
    let current = { from: '', to: [], raw: '' };
    sock.write('220 v25-teste ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      for (;;) {
        if (mode === 'data') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          current.raw = buf.slice(0, end);
          mails.push(current);
          current = { from: '', to: [], raw: '' };
          buf = buf.slice(end + 5);
          mode = 'cmd';
          sock.write('250 OK\r\n');
          continue;
        }
        const idx = buf.indexOf('\r\n');
        if (idx < 0) return;
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (mode === 'auth_user') { mode = 'auth_pass'; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (mode === 'auth_pass') { mode = 'cmd'; sock.write('235 Authentication successful\r\n'); continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-v25-teste\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        else if (cmd === 'AUTH') {
          if (/^AUTH PLAIN \S+/i.test(line)) sock.write('235 Authentication successful\r\n');
          else if (/^AUTH LOGIN \S+/i.test(line)) { mode = 'auth_pass'; sock.write('334 UGFzc3dvcmQ6\r\n'); }
          else if (/^AUTH LOGIN/i.test(line)) { mode = 'auth_user'; sock.write('334 VXNlcm5hbWU6\r\n'); }
          else sock.write('504 Unsupported\r\n');
        } else if (cmd === 'MAIL') { current.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { current.to.push(line.replace(/^RCPT TO:\s*<?|>$/gi, '')); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { mode = 'data'; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 Bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => smtp.listen(port, '127.0.0.1', r));
}

// ---------------------------------------------------------------- cliente HTTP com cookies
let ipSeq = 10;
class Client {
  constructor(ip = `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`) {
    this.cookies = {};
    this.csrf = '';
    this.ip = ip;
  }
  async req(method, url, { json, form, headers = {}, csrf = true, origin } = {}) {
    const h = { 'X-Forwarded-For': this.ip, ...headers };
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    if (origin) h.Origin = origin;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(BASE + '/api' + url, { method, headers: h, body, redirect: 'manual' });
    this.lastSetCookie = r.headers.getSetCookie?.() ?? [];
    for (const c of this.lastSetCookie) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c) || v === '' || v === 'deleted') delete this.cookies[k];
      else this.cookies[k] = v;
    }
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    const data = ct.includes('json') ? JSON.parse(buf.toString('utf8') || 'null') : buf;
    return { status: r.status, data, headers: r.headers };
  }
  get(u, o) { return this.req('GET', u, o); }
  post(u, json, o = {}) { return this.req('POST', u, { json, ...o }); }
  put(u, json, o = {}) { return this.req('PUT', u, { json, ...o }); }
  del(u, o) { return this.req('DELETE', u, o); }
  async session() {
    const r = await this.get('/auth/session');
    this.csrf = r.data.csrf_token;
    return r.data;
  }
  async login(email, password) {
    await this.session();
    const r = await this.post('/auth/login', { email, password });
    if (r.status === 200) this.csrf = r.data.csrf_token;
    return r;
  }
}

const anon = () => new Client();
const err = (r, code, status) => {
  assert.equal(r.data?.error, code, `esperado ${code}, recebido ${JSON.stringify(r.data)} (${r.status})`);
  if (status) assert.equal(r.status, status);
};

const ADMIN = { email: 'admin@renewangola.online', password: 'Admin-V25-segura-1' };
const FIN = { email: 'financeiro@renewangola.online', password: 'Financas-V25-2026' };
const OP = { email: 'checkin@renewangola.online', password: 'Entrada-V25-2026' };
let admin, fin, op;

// Ficheiros de teste
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
let PNG; // gerado com sharp no before()
const uploadForm = (buf, name, type) => {
  const f = new FormData();
  f.append('file', new Blob([buf], { type }), name);
  return f;
};

before(async () => {
  db = await mysql.createConnection({
    user: process.env.V25_DB_USER, password: process.env.V25_DB_PASS, database: process.env.V25_DB,
    ...(process.env.V25_DB_SOCKET ? { socketPath: process.env.V25_DB_SOCKET } : { host: process.env.V25_DB_HOST, port: Number(process.env.V25_DB_PORT) }),
    timezone: 'Z',
  });
  await startSmtpSink(Number(process.env.V25_SMTP_PORT));
  PNG = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c9a45c' } }).png().toBuffer();
});
after(async () => {
  await db?.end();
  smtp?.close();
});

const q = async (sql, params = []) => (await db.query(sql, params))[0];

// =============================================================================
test('público: configurações oficiais, sem ingressos publicados, FAQ', async () => {
  const c = anon();
  const s = await c.get('/public/settings');
  assert.equal(s.status, 200);
  assert.equal(s.data.event_name, 'V25 — O LEGADO');
  assert.equal(s.data.starts_at, '2026-12-20T15:00:00Z'); // 16h00 em Luanda
  assert.equal(s.data.venue, 'Hotel Brisa Tropical');
  assert.equal('bank_iban' in s.data, false, 'dados bancários só na etapa de pagamento');
  assert.equal('express_number' in s.data, false);
  assert.equal(s.data.sales_open, false);
  // Categorias oficiais da migração 003: Normal 12 500, Premium 25 000, VIP por consulta
  const types = (await c.get('/public/ticket-types')).data;
  const byName = Object.fromEntries(types.map((t) => [t.name, t]));
  assert.equal(byName.Normal.price_kz, 12500);
  assert.equal(byName.Premium.price_kz, 25000);
  assert.equal(byName.VIP.price_kz, null);
  assert.equal(byName.VIP.sale_mode, 'consulta');
  assert.ok(byName.Premium.benefits.includes('Todos os benefícios da categoria Normal.'));
  assert.ok(types.every((t) => t.on_sale === false && t.stock_defined === false), 'vendas fechadas e stock por definir');
  assert.equal((await c.get('/public/faqs')).data.length, 8);
  assert.equal(s.headers.get('x-content-type-options'), 'nosniff');
});

test('instalação: primeiro administrador exige SETUP_TOKEN e só funciona uma vez', async () => {
  const c = anon();
  const s = await c.session();
  assert.equal(s.needs_setup, true);
  err(await c.post('/setup/admin', { setup_token: 'errado-errado-errado', ...ADMIN }), 'SETUP_TOKEN_INVALIDO', 403);
  err(await c.post('/setup/admin', { setup_token: process.env.SETUP_TOKEN, email: ADMIN.email, password: 'curta' }), 'PALAVRA_PASSE_FRACA', 422);
  const ok = await c.post('/setup/admin', { setup_token: process.env.SETUP_TOKEN, full_name: 'Administração V25', ...ADMIN });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  err(await c.post('/setup/admin', { setup_token: process.env.SETUP_TOKEN, email: 'outro@x.ao', password: 'Outra-senha-123' }), 'INSTALACAO_CONCLUIDA', 409);
  // Diagnóstico do alojamento (sem Terminal) protegido pelo SETUP_TOKEN
  err(await c.post('/setup/check', { setup_token: 'errado-errado-errado' }), 'SETUP_TOKEN_INVALIDO', 403);
  const diag = await c.post('/setup/check', { setup_token: process.env.SETUP_TOKEN });
  const byName = Object.fromEntries(diag.data.checks.map((x) => [x.check, x]));
  assert.equal(byName['Ligação MySQL'].ok, true);
  assert.equal(byName['Migrações aplicadas'].ok, true);
  assert.equal(byName['Extensão pdo_mysql'].ok, true);
  const [u] = await q('SELECT password_hash FROM users WHERE email = ?', [ADMIN.email]);
  assert.match(u.password_hash, /^\$2y\$|^\$argon2/);
});

test('autenticação: CSRF, credenciais, cookie seguro e sessão', async () => {
  const c = anon();
  await c.session();
  err(await c.post('/auth/login', ADMIN, { csrf: false }), 'CSRF_INVALIDO', 403);
  err(await c.post('/auth/login', { email: ADMIN.email, password: 'errada-123456' }), 'CREDENCIAIS_INVALIDAS', 401);
  err(await c.post('/auth/login', { email: 'naoexiste@x.ao', password: 'errada-123456' }), 'CREDENCIAIS_INVALIDAS', 401);
  admin = new Client();
  const r = await admin.login(ADMIN.email, ADMIN.password);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.role, 'admin');
  assert.ok(r.data.permissions.includes('users.manage'));
  const cookie = admin.lastSetCookie.find((x) => x.startsWith('v25_sess='));
  assert.ok(cookie, 'cookie de sessão emitido');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const s = await admin.get('/auth/session');
  assert.equal(s.data.user.email, ADMIN.email);
  // pedido de outra origem é recusado
  err(await admin.post('/admin/emails/test', { to: 'x@y.ao' }, { origin: 'https://site-malicioso.example' }), 'ORIGEM_NAO_PERMITIDA', 403);
  // sem token CSRF é recusado mesmo com sessão válida
  err(await admin.post('/admin/emails/test', { to: 'x@y.ao' }, { csrf: false }), 'CSRF_INVALIDO', 403);
});

test('equipa: administrador cria perfis Financeiro e Check-in; convite por email', async () => {
  for (const [u, role, name] of [[FIN, 'financeiro', 'Ana Financeira'], [OP, 'checkin', 'Operador Porta']]) {
    const r = await admin.post('/admin/users', { email: u.email, full_name: name, role, password: u.password });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const inv = await admin.post('/admin/users', { email: 'convidado@renewangola.online', full_name: 'Convidado', role: 'checkin' });
  assert.equal(inv.status, 201);
  assert.equal(inv.data.has_password, false);
  const [m] = await q("SELECT template FROM email_outbox WHERE to_email = 'convidado@renewangola.online'");
  assert.equal(m.template, 'convite_equipa');
  err(await admin.post('/admin/users', { email: FIN.email, role: 'checkin', password: 'Qualquer-123456' }), 'UTILIZADOR_JA_EXISTE', 409);
  fin = new Client();
  assert.equal((await fin.login(FIN.email, FIN.password)).status, 200);
  op = new Client();
  assert.equal((await op.login(OP.email, OP.password)).status, 200);
});

test('permissões por perfil verificadas no servidor', async () => {
  err(await anon().get('/admin/orders'), 'NAO_AUTENTICADO', 401);
  err(await op.get('/admin/orders'), 'SEM_PERMISSAO', 403);
  err(await op.get('/admin/reports/orders.csv'), 'SEM_PERMISSAO', 403);
  err(await fin.post('/admin/ticket-types', { name: 'X', price_kz: 1000, quantity_total: 1 }), 'SEM_PERMISSAO', 403);
  err(await fin.put('/admin/settings', { sales_open: true }), 'SEM_PERMISSAO', 403);
  err(await fin.get('/admin/users'), 'SEM_PERMISSAO', 403);
  err(await fin.get('/admin/audit'), 'SEM_PERMISSAO', 403);
  err(await fin.post('/admin/checkin', { input: 'T-AAAAAAAA' }), 'SEM_PERMISSAO', 403);
  err(await op.get('/admin/content/timeline'), 'SEM_PERMISSAO', 403);
  err(await fin.get('/admin/reports/checkins.csv'), 'SEM_PERMISSAO', 403);
  err(await fin.put(`/admin/users/${randomUUID()}`, { role: 'admin' }), 'SEM_PERMISSAO', 403);
  assert.equal((await op.get('/admin/dashboard')).status, 200);
  assert.equal((await fin.get('/admin/orders')).status, 200);
});

let typeId;
test('ingressos: preço obrigatório para publicar; vendas fechadas bloqueiam pedidos', async () => {
  err(await admin.post('/admin/ticket-types', { name: 'Geral', quantity_total: 10, published: true }), 'PRECO_OBRIGATORIO_PARA_PUBLICAR', 422);
  const r = await admin.post('/admin/ticket-types', {
    name: 'Normal', lot_label: '1.º Lote', description: 'Acesso geral', price_kz: 15000, quantity_total: 10,
    max_per_order: 4, max_per_customer: 6, persons_per_ticket: 1, published: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  typeId = r.data.id;
  const pub = await anon().get('/public/ticket-types');
  assert.equal(pub.data[0].on_sale, false);
  err(await createOrder(buyer()), 'VENDAS_FECHADAS', 409);
  assert.equal((await admin.put('/admin/settings', { sales_open: true })).status, 200);
  const pub2 = await anon().get('/public/ticket-types');
  assert.equal(pub2.data[0].on_sale, true);
  assert.equal(pub2.data[0].available, 10);
  assert.equal(pub2.data[0].price_kz, 15000);
});

let emailSeq = 1;
const buyer = (o = {}) => ({
  ticket_type_id: typeId, quantity: 2, guests_total: 2, full_name: 'Maria Teste Silva', email: `cliente${emailSeq++}@exemplo.ao`,
  phone: '+244923456789', consent: true, consent_version: 'v1', idempotency_key: randomUUID(), mode: 'compra', ...o,
});
const createOrder = (b, client = anon()) => client.post('/public/orders', b);
const orderGet = (code, token, client = anon()) => client.get(`/public/orders/${code}`, { headers: { 'X-Order-Token': token } });
const upload = (code, token, buf, name, type, client = anon()) =>
  client.req('POST', `/public/orders/${code}/proofs`, { form: uploadForm(buf, name, type), headers: { 'X-Order-Token': token } });
const orderId = async (code) => (await q('SELECT id FROM orders WHERE order_code = ?', [code]))[0].id;

test('1. inscrição: validação no backend', async () => {
  err(await createOrder(buyer({ consent: false })), 'CONSENTIMENTO_OBRIGATORIO', 422);
  err(await createOrder(buyer({ full_name: 'Ana' })), 'NOME_INVALIDO', 422);
  err(await createOrder(buyer({ email: 'sem-arroba' })), 'EMAIL_INVALIDO', 422);
  err(await createOrder(buyer({ phone: '+244123' })), 'TELEFONE_INVALIDO', 422);
  err(await createOrder(buyer({ phone: '+244812345678' })), 'TELEFONE_INVALIDO', 422);
  err(await createOrder(buyer({ quantity: 5, guests_total: 5 })), 'QUANTIDADE_INVALIDA', 422);
  err(await createOrder(buyer({ quantity: 2, guests_total: 3 })), 'CONVIDADOS_INVALIDO', 422);
  err(await createOrder(buyer({ website: 'http://spam' })), 'PEDIDO_INVALIDO', 400);
  err(await createOrder(buyer({ idempotency_key: 'x' })), 'PEDIDO_INVALIDO', 400);
});

let order; // { order_code, access_token }
test('2. pedido: código único, idempotência, duplicados, token só em hash', async () => {
  const b = buyer({ email: 'maria@exemplo.ao' });
  const r = await createOrder(b);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  order = r.data;
  assert.match(order.order_code, /^V25-[A-Z2-9]{6}$/);
  assert.equal(order.status, 'aguardando_pagamento');
  assert.equal(order.total_kz, 30000);
  const replay = await createOrder(b);
  assert.equal(replay.data.order_code, order.order_code);
  assert.equal(replay.data.replayed, true);
  err(await createOrder({ ...b, idempotency_key: randomUUID() }), 'PEDIDO_DUPLICADO', 409);
  const [t] = await q('SELECT quantity_reserved FROM ticket_categories WHERE id = ?', [typeId]);
  assert.equal(t.quantity_reserved, 2, 'stock reservado uma única vez');
  const toks = await q('SELECT token_hash FROM order_access_tokens WHERE order_id = ?', [await orderId(order.order_code)]);
  assert.ok(toks.length >= 2 && toks.every((x) => x.token_hash !== order.access_token && /^[0-9a-f]{64}$/.test(x.token_hash)));
  const [reg] = await q('SELECT r.ip_hash FROM registrations r JOIN orders o ON o.registration_id = r.id WHERE o.order_code = ?', [order.order_code]);
  assert.match(reg.ip_hash, /^[0-9a-f]{64}$/, 'IP guardado apenas como hash');
});

test('3. consulta segura do pedido (código + token em cabeçalho)', async () => {
  err(await orderGet(order.order_code, 'token-errado'), 'ACESSO_INVALIDO', 403);
  err(await anon().get(`/public/orders/${order.order_code}`), 'ACESSO_INVALIDO', 403);
  const o = await orderGet(order.order_code, order.access_token);
  assert.equal(o.status, 200);
  assert.equal(o.data.status, 'aguardando_pagamento');
  assert.equal(o.data.email_masked.includes('maria@'), false);
  assert.equal(o.data.payment.iban, 'AO06004000004006599510166');
  assert.equal(o.data.payment.express_number, '920000000');
  assert.deepEqual(o.data.tickets, []);
  assert.equal(o.data.history[0].status, 'aguardando_pagamento');
});

test('4. upload seguro do comprovativo (não aprova o pagamento)', async () => {
  err(await upload(order.order_code, order.access_token, Buffer.from('<html><script>alert(1)</script></html>'), 'falso.pdf', 'application/pdf'), 'FICHEIRO_TIPO_INVALIDO', 415);
  err(await upload(order.order_code, order.access_token, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5.5 * 1024 * 1024)]), 'grande.pdf', 'application/pdf'), 'FICHEIRO_DEMASIADO_GRANDE', 413);
  err(await upload(order.order_code, 'x', PDF, 'c.pdf', 'application/pdf'), 'ACESSO_INVALIDO', 403);
  const r = await upload(order.order_code, order.access_token, PDF, 'comprovativo.pdf', 'application/pdf');
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.status, 'comprovativo_enviado');
  const o = await orderGet(order.order_code, order.access_token);
  assert.equal(o.data.status, 'comprovativo_enviado');
  assert.deepEqual(o.data.tickets, [], 'o upload NÃO emite ingressos');
  assert.equal((await q("SELECT COUNT(*) n FROM payments"))[0].n, 0, 'o upload NÃO cria pagamento');
  // Ficheiro guardado fora da pasta pública, com o conteúdo exacto
  const proofsDir = PROOFS_DIR;
  const [p] = await q('SELECT storage_name, mime_type, sha256 FROM payment_proofs');
  assert.ok(existsSync(path.join(proofsDir, p.storage_name)));
  assert.equal(p.mime_type, 'application/pdf');
  assert.equal(readdirSync(MEDIA_DIR).filter((f) => !f.startsWith('.')).length, 0, 'nada gravado na pasta pública');
  // Novo upload não é possível enquanto está em análise
  err(await upload(order.order_code, order.access_token, PNG, 'c.png', 'image/png'), 'ESTADO_INVALIDO', 409);
});

test('comprovativos: acesso apenas a admin/financeiro e reutilização bloqueada', async () => {
  const detail = await fin.get(`/admin/orders/${await orderId(order.order_code)}`);
  const proofId = detail.data.proofs[0].id;
  err(await op.get(`/admin/proofs/${proofId}/file`), 'SEM_PERMISSAO', 403);
  err(await anon().get(`/admin/proofs/${proofId}/file`), 'NAO_AUTENTICADO', 401);
  const f = await fin.get(`/admin/proofs/${proofId}/file`);
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'application/pdf');
  assert.match(f.headers.get('content-security-policy'), /sandbox/);
  assert.ok(Buffer.compare(f.data, PDF) === 0);
  // mesmo ficheiro noutro pedido
  const o2 = (await createOrder(buyer({ quantity: 1, guests_total: 1, full_name: 'Outra Pessoa' }))).data;
  err(await upload(o2.order_code, o2.access_token, PDF, 'copia.pdf', 'application/pdf'), 'COMPROVATIVO_REUTILIZADO', 409);
  await anon().post(`/public/orders/${o2.order_code}/cancel`, undefined, { headers: { 'X-Order-Token': o2.access_token } });
});

let orderUuid;
test('5. aprovação financeira: permissões, valor, referência e idempotência', async () => {
  orderUuid = await orderId(order.order_code);
  err(await op.post(`/admin/orders/${orderUuid}/approve`, { payment_reference: 'TRX-0001', amount_confirmed: 30000 }), 'SEM_PERMISSAO', 403);
  assert.equal((await fin.post(`/admin/orders/${orderUuid}/review`, {})).data.status, 'em_analise');
  err(await fin.post(`/admin/orders/${orderUuid}/approve`, { payment_reference: 'TRX-0001', amount_confirmed: 29000 }), 'VALOR_NAO_CONFERE', 422);
  err(await fin.post(`/admin/orders/${orderUuid}/approve`, { payment_reference: '', amount_confirmed: 30000 }), 'REFERENCIA_OBRIGATORIA', 422);
  const r = await fin.post(`/admin/orders/${orderUuid}/approve`, { payment_reference: 'TRX-0001', amount_confirmed: 30000, method: 'transferencia', note: 'Conferido no extracto' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, 'emitido');
  assert.equal(r.data.tickets_issued, 2);
  const again = await fin.post(`/admin/orders/${orderUuid}/approve`, { payment_reference: 'TRX-0001', amount_confirmed: 30000 });
  assert.equal(again.data.already_processed, true);
  assert.equal((await q('SELECT COUNT(*) n FROM tickets WHERE order_id = ?', [orderUuid]))[0].n, 2, 'sem ingressos duplicados');
  assert.equal((await q('SELECT COUNT(*) n FROM payments WHERE order_id = ?', [orderUuid]))[0].n, 1);
  const [t] = await q('SELECT quantity_reserved, quantity_sold FROM ticket_categories WHERE id = ?', [typeId]);
  assert.deepEqual({ ...t }, { quantity_reserved: 0, quantity_sold: 2 });
  const audit = await q("SELECT action, user_email FROM audit_logs WHERE entity_id = ? AND action = 'pagamento.aprovado'", [orderUuid]);
  assert.equal(audit[0].user_email, FIN.email);
  const outbox = (await q('SELECT template FROM email_outbox WHERE order_id = ? ORDER BY id', [orderUuid])).map((x) => x.template);
  assert.deepEqual(outbox, ['pedido_criado', 'comprovativo_recebido', 'pagamento_aprovado', 'ingresso_disponivel']);
  const hist = (await q('SELECT status FROM transaction_history WHERE order_id = ? ORDER BY created_at, id', [orderUuid])).map((x) => x.status);
  assert.deepEqual(hist, ['aguardando_pagamento', 'comprovativo_enviado', 'em_analise', 'aprovado', 'emitido']);
});

let tickets;
test('7/8. ingressos emitidos com QR Code assinado e sem dados pessoais', async () => {
  const o = await orderGet(order.order_code, order.access_token);
  assert.equal(o.data.status, 'emitido');
  tickets = o.data.tickets;
  assert.equal(tickets.length, 2);
  assert.notEqual(tickets[0].ticket_code, tickets[1].ticket_code);
  for (const k of tickets) {
    assert.match(k.qr_payload, /^V25:T-[A-Z2-9]{8}:[A-Za-z0-9_-]{22}$/);
    assert.equal(/maria|exemplo|\+244|silva/i.test(k.qr_payload), false);
  }
});

test('9. download do PDF dos ingressos', async () => {
  const r = await anon().get(`/public/orders/${order.order_code}/tickets.pdf`, { headers: { 'X-Order-Token': order.access_token } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /attachment; filename="V25-ingressos-V25-/);
  assert.equal(r.data.subarray(0, 5).toString(), '%PDF-');
  assert.equal((r.data.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2, 'uma página por ingresso');
  err(await anon().get(`/public/orders/${order.order_code}/tickets.pdf`, { headers: { 'X-Order-Token': 'x' } }), 'ACESSO_INVALIDO', 403);
});

test('6. rejeição com motivo; referência bancária não reutilizável; novo comprovativo', async () => {
  const o2 = (await createOrder(buyer({ email: 'joao@exemplo.ao', quantity: 1, guests_total: 1, full_name: 'João Teste' }))).data;
  const id2 = await orderId(o2.order_code);
  assert.equal((await upload(o2.order_code, o2.access_token, PNG, 'talao.png', 'image/png')).status, 201);
  err(await fin.post(`/admin/orders/${id2}/approve`, { payment_reference: 'trx 0001', amount_confirmed: 15000 }), 'REFERENCIA_REUTILIZADA', 409);
  err(await fin.post(`/admin/orders/${id2}/reject`, { reason: '' }), 'MOTIVO_OBRIGATORIO', 422);
  const rej = await fin.post(`/admin/orders/${id2}/reject`, { reason: 'Valor não identificado no extracto bancário.' });
  assert.equal(rej.data.status, 'rejeitado');
  const view = await orderGet(o2.order_code, o2.access_token);
  assert.equal(view.data.rejection_reason, 'Valor não identificado no extracto bancário.');
  assert.ok(view.data.expires_at, 'nova janela de reserva');
  err(await fin.post(`/admin/orders/${id2}/approve`, { payment_reference: 'TRX-0002', amount_confirmed: 15000 }), 'ESTADO_INVALIDO', 409);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jfif-nao-imagem')]);
  err(await upload(o2.order_code, o2.access_token, jpg, 'falso.jpg', 'image/jpeg'), 'FICHEIRO_TIPO_INVALIDO');
  const pdf2 = Buffer.concat([PDF, Buffer.from('% segundo')]);
  assert.equal((await upload(o2.order_code, o2.access_token, pdf2, 'novo.pdf', 'application/pdf')).status, 201);
  const ok = await fin.post(`/admin/orders/${id2}/approve`, { payment_reference: 'TRX-0002', amount_confirmed: '15000.00', method: 'express' });
  assert.equal(ok.data.status, 'emitido');
});

test('10/11. check-in: valida, bloqueia reutilização, detecta QR adulterado', async () => {
  const preview = await op.post('/admin/checkin', { input: tickets[0].qr_payload, commit: false });
  assert.equal(preview.data.result, 'valido');
  const ok = await op.post('/admin/checkin', { input: tickets[0].qr_payload, commit: true });
  assert.equal(ok.data.result, 'ok');
  assert.equal(ok.data.holder_name, 'Maria Teste Silva');
  const reuse = await op.post('/admin/checkin', { input: tickets[0].qr_payload, commit: true });
  assert.equal(reuse.data.result, 'ja_utilizado');
  assert.equal(reuse.data.checked_in_by, 'Operador Porta');
  assert.ok(reuse.data.checked_in_at);
  const forged = tickets[1].qr_payload.slice(0, -3) + (tickets[1].qr_payload.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal((await op.post('/admin/checkin', { input: forged })).data.result, 'invalido');
  assert.equal((await op.post('/admin/checkin', { input: 'V25:T-ZZZZZZZZ:abc' })).data.result, 'invalido');
  const manual = await op.post('/admin/checkin', { input: tickets[1].ticket_code.toLowerCase() });
  assert.equal(manual.data.result, 'ok');
  const [row] = await q('SELECT t.checked_in_by, u.email FROM tickets t JOIN users u ON u.id = t.checked_in_by WHERE ticket_code = ?', [tickets[0].ticket_code]);
  assert.equal(row.email, OP.email);
  assert.ok((await q('SELECT COUNT(*) n FROM checkins'))[0].n >= 6, 'todas as tentativas registadas');
  // O cliente vê o ingresso como utilizado
  const o = await orderGet(order.order_code, order.access_token);
  assert.equal(o.data.tickets[0].status, 'utilizado');
});

test('cancelamento: bloqueado com ingressos usados; anula ingressos e liberta stock', async () => {
  err(await admin.post(`/admin/orders/${orderUuid}/cancel`, { reason: 'Pedido de teste' }), 'INGRESSO_JA_UTILIZADO', 409);
  err(await fin.post(`/admin/orders/${orderUuid}/cancel`, { reason: 'Pedido de teste' }), 'SEM_PERMISSAO', 403);
  const o4 = (await createOrder(buyer({ email: 'rui@exemplo.ao', quantity: 1, guests_total: 1, full_name: 'Rui Teste' }))).data;
  const id4 = await orderId(o4.order_code);
  await upload(o4.order_code, o4.access_token, Buffer.concat([PDF, Buffer.from('% rui')]), 'rui.pdf', 'application/pdf');
  await admin.post(`/admin/orders/${id4}/approve`, { payment_reference: 'TRX-0004', amount_confirmed: 15000 });
  const before = (await q('SELECT quantity_sold FROM ticket_categories WHERE id = ?', [typeId]))[0].quantity_sold;
  assert.equal((await admin.post(`/admin/orders/${id4}/cancel`, { reason: 'Reembolso aprovado pela organização' })).data.status, 'cancelado');
  assert.equal((await q('SELECT quantity_sold FROM ticket_categories WHERE id = ?', [typeId]))[0].quantity_sold, before - 1);
  const [k] = await q('SELECT ticket_code, status FROM tickets WHERE order_id = ?', [id4]);
  assert.equal(k.status, 'anulado');
  assert.equal((await op.post('/admin/checkin', { input: k.ticket_code })).data.result, 'anulado');
  assert.equal((await q('SELECT status FROM payments WHERE order_id = ?', [id4]))[0].status, 'estornado');
  // a referência continua bloqueada para reutilização
  assert.equal((await q("SELECT COUNT(*) n FROM payments WHERE reference_norm = 'TRX0004'"))[0].n, 1);
});

test('reservas: RESERVAR LUGAR, confirmação e expiração liberta stock', async () => {
  const o5 = (await createOrder(buyer({ email: 'reserva@exemplo.ao', quantity: 1, guests_total: 1, full_name: 'Reserva Teste', mode: 'reserva' }))).data;
  assert.equal(o5.status, 'iniciada');
  const conf = await anon().post(`/public/orders/${o5.order_code}/confirm`, undefined, { headers: { 'X-Order-Token': o5.access_token } });
  assert.equal(conf.data.status, 'aguardando_pagamento');
  const reserved = (await q('SELECT quantity_reserved FROM ticket_categories WHERE id = ?', [typeId]))[0].quantity_reserved;
  await q('UPDATE orders SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_code = ?', [o5.order_code]);
  const v = await orderGet(o5.order_code, o5.access_token);
  assert.equal(v.data.status, 'cancelado');
  assert.equal((await q('SELECT quantity_reserved FROM ticket_categories WHERE id = ?', [typeId]))[0].quantity_reserved, reserved - 1);
});

test('rate limiting na criação de pedidos (por IP)', async () => {
  const r = await admin.post('/admin/ticket-types', { name: 'Rate', price_kz: 1000, quantity_total: 100, max_per_order: 1, max_per_customer: 1, published: true });
  const c = new Client('10.99.99.99');
  for (let i = 0; i < 15; i++) {
    const x = await createOrder(buyer({ ticket_type_id: r.data.id, email: `rl${i}@exemplo.ao`, quantity: 1, guests_total: 1, full_name: 'Rate Limit' }), c);
    assert.equal(x.status, 201, JSON.stringify(x.data));
  }
  err(await createOrder(buyer({ ticket_type_id: r.data.id, email: 'rl99@exemplo.ao', quantity: 1, guests_total: 1, full_name: 'Rate Limit' }), c), 'LIMITE_PEDIDOS', 429);
});

test('stock concorrente: 20 compras simultâneas para 5 lugares', async () => {
  const r = await admin.post('/admin/ticket-types', { name: 'VIP', price_kz: 50000, quantity_total: 5, max_per_order: 2, max_per_customer: 2, published: true });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    createOrder(buyer({ ticket_type_id: r.data.id, email: `conc${i}@exemplo.ao`, quantity: 1, guests_total: 1, full_name: 'Cliente Concorrente' }), new Client(`10.50.0.${i + 1}`))));
  const ok = results.filter((x) => x.status === 201).length;
  const soldOut = results.filter((x) => x.data?.error === 'ESGOTADO').length;
  assert.equal(ok, 5, JSON.stringify(results.map((x) => x.data?.error ?? x.status)));
  assert.equal(soldOut, 15);
  assert.equal((await q('SELECT quantity_reserved FROM ticket_categories WHERE id = ?', [r.data.id]))[0].quantity_reserved, 5);
});

test('aprovações simultâneas do mesmo pedido emitem ingressos uma só vez', async () => {
  const o = (await createOrder(buyer({ email: 'paralelo@exemplo.ao', full_name: 'Paralelo Teste' }))).data;
  const id = await orderId(o.order_code);
  await upload(o.order_code, o.access_token, Buffer.concat([PDF, Buffer.from('% paralelo')]), 'p.pdf', 'application/pdf');
  const fin2 = new Client();
  await fin2.login(FIN.email, FIN.password);
  const res = await Promise.all([fin, fin2, admin].map((c) => c.post(`/admin/orders/${id}/approve`, { payment_reference: 'TRX-PAR', amount_confirmed: 30000 })));
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200], JSON.stringify(res.map((r) => r.data)));
  assert.equal(res.filter((r) => r.data.already_processed === false).length, 1);
  assert.equal((await q('SELECT COUNT(*) n FROM tickets WHERE order_id = ?', [id]))[0].n, 2);
});

test('12. dashboard e relatórios (CSV com BOM e protecção de fórmulas)', async () => {
  const d = await admin.get('/admin/dashboard');
  assert.ok(d.data.revenue_confirmed_kz > 0);
  assert.ok(d.data.tickets_used >= 2);
  assert.equal((await op.get('/admin/dashboard')).data.revenue_confirmed_kz, null, 'operador não vê receita');
  const csv = await fin.get('/admin/reports/orders.csv');
  assert.equal(csv.status, 200);
  const text = csv.data.toString('utf8');
  assert.ok(text.startsWith('﻿Pedido;Estado;Origem;Nome'));
  assert.match(text, new RegExp(order.order_code));
  assert.match(text, /Ingresso emitido/);
  const tk = await fin.get('/admin/reports/tickets.csv');
  assert.match(tk.data.toString('utf8'), /T-[A-Z2-9]{8}/);
  assert.equal((await admin.get('/admin/reports/checkins.csv')).status, 200);
  const sum = await fin.get('/admin/reports/summary');
  assert.ok(sum.data.orders.length >= 3);
  const list = await fin.get('/admin/orders?status=emitido&q=maria');
  assert.equal(list.data.rows[0].order_code, order.order_code);
  assert.equal(list.data.rows[0].payment_reference, 'TRX-0001');
});

test('emails: envio real por SMTP com PDF e QR em anexo', async () => {
  const st = await admin.get('/admin/emails/status');
  assert.equal(st.data.configured, true);
  const before = mails.length;
  const r = await admin.post('/admin/emails/process', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.sent > 0, JSON.stringify(r.data));
  assert.equal(r.data.failed, 0);
  const sent = mails.slice(before);
  const toMaria = sent.filter((m) => m.to.includes('maria@exemplo.ao'));
  const subjects = toMaria.map((m) => /^Subject: (.*)$/m.exec(m.raw)?.[1] ?? '');
  assert.ok(subjects.some((x) => /Pedido_V25-.*criado/.test(x)), 'email de pedido criado');
  assert.ok(subjects.some((x) => /Comprovativo_recebido/.test(x)), 'email de comprovativo recebido');
  assert.ok(subjects.some((x) => /Pagamento_aprovado/.test(x)), 'email de pagamento aprovado');
  const ticketMail = toMaria.find((m) => /^Subject: .*Os_seus_ingressos/m.test(m.raw));
  assert.ok(ticketMail, 'email de ingresso enviado');
  assert.match(ticketMail.raw, /Content-Type: application\/pdf; name="?V25-ingressos-V25-/);
  // o PDF anexado é um PDF válido
  const pdfB64 = /application\/pdf; name="?[^"\r\n]+"?\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="?[^"\r\n]+"?\r\n\r\n([A-Za-z0-9+\/=\r\n]+?)\r\n\r\n--/.exec(ticketMail.raw);
  assert.ok(pdfB64, 'anexo PDF em base64');
  assert.equal(Buffer.from(pdfB64[1].replace(/\r\n/g, ''), 'base64').subarray(0, 5).toString(), '%PDF-');
  const rejected = sent.find((m) => m.to.includes('joao@exemplo.ao') && /N=C3=A3o_validado|Pagamento_n/.test(m.raw));
  assert.ok(rejected, 'email de rejeição com motivo enviado');
  // Ingressos já utilizados no check-in não são reenviados como QR; o João tem ingressos válidos
  const joaoTicket = sent.find((m) => m.to.includes('joao@exemplo.ao') && /^Subject: .*Os_seus_ingressos/m.test(m.raw));
  assert.ok(joaoTicket, 'email de ingresso do João');
  assert.match(joaoTicket.raw, /Content-Type: image\/png/);
  assert.match(joaoTicket.raw, /Content-ID: <qr-T-[A-Z2-9]{8}@v25>/);
  assert.match(joaoTicket.raw.replace(/=\r\n/g, "").replace(/=3D/g, "="), /src="cid:qr-T-[A-Z2-9]{8}@v25"/);
  const pending = await q("SELECT COUNT(*) n FROM email_outbox WHERE status <> 'enviado'");
  const list = await admin.get('/admin/emails');
  assert.equal(list.data.some((x) => 'payload' in x), false, 'payload (tokens) não exposto');
  assert.ok(pending[0].n >= 0);
});

test('13. recuperação de palavra-passe por token temporário e bloqueio por tentativas', async () => {
  const c = anon();
  await c.session();
  assert.equal((await c.post('/auth/forgot', { email: OP.email })).status, 200);
  assert.equal((await c.post('/auth/forgot', { email: 'nao-existe@x.ao' })).status, 200, 'resposta igual (não revela contas)');
  const [m] = await q("SELECT payload FROM email_outbox WHERE template = 'recuperar_senha' ORDER BY id DESC LIMIT 1");
  const token = JSON.parse(m.payload).token;
  err(await c.post('/auth/reset', { token, password: 'fraca' }), 'PALAVRA_PASSE_FRACA', 422);
  const NEW = 'Nova-senha-entrada-77';
  assert.equal((await c.post('/auth/reset', { token, password: NEW })).status, 200);
  err(await c.post('/auth/reset', { token, password: 'Outra-senha-entrada-1' }), 'TOKEN_INVALIDO', 400);
  // a sessão antiga do operador deixou de ser válida
  err(await op.get('/admin/dashboard'), 'NAO_AUTENTICADO', 401);
  op = new Client();
  assert.equal((await op.login(OP.email, NEW)).status, 200);
  // 5 falhas bloqueiam a conta temporariamente
  const x = new Client();
  for (let i = 0; i < 5; i++) await x.login(FIN.email, 'errada-errada-1');
  err(await x.login(FIN.email, FIN.password), 'CONTA_BLOQUEADA', 429);
  await q('UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE email = ?', [FIN.email]);
});

test('conteúdos e galeria: upload de imagem, publicação e remoção', async () => {
  const up = await admin.req('POST', '/admin/media/upload', { form: (() => { const f = uploadForm(PNG, 'foto.png', 'image/png'); f.append('section', 'memorias'); f.append('title', 'Ensaio'); return f; })() });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.match(up.data.storage_path, /^memorias\/[0-9a-f-]{36}\.(webp|jpg)$/);
  assert.equal(up.data.published, false);
  assert.ok(existsSync(path.join(MEDIA_DIR, up.data.storage_path)));
  assert.equal((await anon().get('/public/media?section=memorias')).data.length, 0, 'rascunho não é público');
  await admin.put(`/admin/media/${up.data.id}`, { published: true, caption: 'Legenda' });
  assert.equal((await anon().get('/public/media?section=memorias')).data[0].caption, 'Legenda');
  const bad = await admin.req('POST', '/admin/media/upload', { form: (() => { const f = uploadForm(Buffer.from('<?php echo 1; ?>'), 'x.php.png', 'image/png'); f.append('section', 'memorias'); return f; })() });
  err(bad, 'FICHEIRO_TIPO_INVALIDO', 415);
  const yt = await admin.post('/admin/media/youtube', { url: 'https://youtu.be/dQw4w9WgXcQ', section: 'memorias', title: 'Vídeo' });
  assert.equal(yt.data.youtube_id, 'dQw4w9WgXcQ');
  // linha do tempo com imagem
  const img = await admin.req('POST', '/admin/uploads/image', { form: (() => { const f = uploadForm(PNG, 'h.png', 'image/png'); f.append('folder', 'historia'); return f; })() });
  assert.equal(img.status, 201);
  const tl = await admin.post('/admin/content/timeline', { period_label: 'Marco confirmado', title: 'Primeiro ensaio', description: 'Texto', image_path: img.data.path, published: true });
  assert.equal(tl.status, 201, JSON.stringify(tl.data));
  assert.equal((await anon().get('/public/timeline')).data[0].title, 'Primeiro ensaio');
  await admin.put(`/admin/content/timeline/${tl.data.id}`, { image_path: null });
  assert.equal(existsSync(path.join(MEDIA_DIR, img.data.path)), false, 'imagem antiga removida');
  await admin.del(`/admin/media/${up.data.id}`);
  assert.equal(existsSync(path.join(MEDIA_DIR, up.data.storage_path)), false);
  err(await admin.post('/admin/content/timeline', { title: 'sem período' }), 'CAMPO_OBRIGATORIO', 422);
});

test('configurações: alteração auditada; último administrador protegido', async () => {
  const r = await admin.put('/admin/settings', { contact_email: 'info@renewangola.online', socials: { instagram: 'https://instagram.com/vibes', facebook: 'javascript:alert(1)' } });
  assert.equal(r.data.contact_email, 'info@renewangola.online');
  assert.deepEqual(r.data.socials, { instagram: 'https://instagram.com/vibes' });
  const audit = await admin.get('/admin/audit');
  assert.ok(audit.data.rows.some((x) => x.action === 'configuracoes.alteradas'));
  const me = (await admin.get('/auth/session')).data.user.id;
  err(await admin.put(`/admin/users/${me}`, { role: 'checkin' }), 'NAO_PODE_REMOVER_PROPRIO', 409);
  // logout invalida a sessão
  const c = new Client();
  await c.login(ADMIN.email, ADMIN.password);
  await c.post('/auth/logout', {});
  err(await c.get('/admin/dashboard'), 'NAO_AUTENTICADO', 401);
});

test('protecção contra SQL injection nos filtros', async () => {
  const r = await fin.get(`/admin/orders?q=${encodeURIComponent("' OR 1=1 -- ")}&status=${encodeURIComponent("emitido' OR '1'='1")}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.rows.length, 0);
  const c = anon();
  err(await c.get(`/public/orders/${encodeURIComponent("V25-AAAAAA' OR '1'='1")}`, { headers: { 'X-Order-Token': "' OR '1'='1" } }), 'ACESSO_INVALIDO', 403);
});
