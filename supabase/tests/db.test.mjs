// Testes de integração: fluxo de compra, upload, aprovação/rejeição, emissão,
// QR Code, check-in, permissões, RLS e stock concorrente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT_URL = process.env.TEST_DATABASE_URL;
const DB = `v25_test_${Date.now()}`;
let admin; // ligação superuser à base de testes
let dbUrl;

const ADMIN = randomUUID();
const FIN = randomUUID();
const OP = randomUUID();
const NOBODY = randomUUID();

function urlFor(db) {
  const u = new URL(ROOT_URL.replace(/^postgresql:\/\/postgres@\//, 'postgresql://postgres@localhost/'));
  u.pathname = `/${db}`;
  return u.toString().replace('postgresql://postgres@localhost/', 'postgresql://postgres@/');
}

before(async () => {
  const root = new pg.Client({ connectionString: ROOT_URL });
  await root.connect();
  await root.query(`create database ${DB}`);
  await root.end();
  dbUrl = urlFor(DB);
  admin = new pg.Client({ connectionString: dbUrl });
  await admin.connect();
  await admin.query(readFileSync('supabase/tests/supabase_stubs.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort()) {
    await admin.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
  await admin.query(readFileSync('supabase/seed.sql', 'utf8'));
  await admin.query(`insert into auth.users (id, email) values ($1,'admin@v25.test'),($2,'fin@v25.test'),($3,'op@v25.test'),($4,'x@v25.test')`,
    [ADMIN, FIN, OP, NOBODY]);
  await admin.query(`select public.bootstrap_admin('admin@v25.test')`);
});

after(async () => {
  await admin?.end();
  const root = new pg.Client({ connectionString: ROOT_URL });
  await root.connect();
  await root.query(`drop database if exists ${DB} with (force)`);
  await root.end();
});

/** Executa SQL como um papel Supabase (anon/authenticated) numa transacção própria. */
async function as(who, sql, params = [], { client = admin, ip = '10.0.0.1' } = {}) {
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  const uid = ['anon', 'service'].includes(who) ? '' : who;
  await client.query('begin');
  try {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true),
                               set_config('request.headers', $2, true)`, [uid, JSON.stringify({ 'x-forwarded-for': ip })]);
    await client.query(`set local role ${role}`);
    const r = await client.query(sql, params);
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
const rpc = async (who, fn, args = [], opts) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(',');
  const r = await as(who, `select public.${fn}(${ph}) as r`, args, opts);
  return r.rows[0].r;
};
const rejectsWith = (p, code) => assert.rejects(p, (e) => { assert.match(e.message, new RegExp(code)); return true; });

let typeId;
let ipSeq = 1;
const buyer = (over = {}) => ({
  type: typeId, qty: 2, guests: 2, name: 'Maria Teste Silva', email: `cliente${ipSeq}@exemplo.ao`,
  phone: '+244923456789', consent: true, key: randomUUID(), mode: 'compra', ...over,
});
const createOrder = (b, opts = { ip: `10.1.0.${ipSeq++}` }) =>
  rpc('anon', 'create_order', [b.type, b.qty, b.guests, b.name, b.email, b.phone, b.consent, 'v1', b.key, b.mode, null], opts);

test('anon não consegue ler dados pessoais nem tabelas internas', async () => {
  for (const t of ['orders', 'tickets', 'payment_proofs', 'audit_log', 'email_outbox', 'order_access_tokens']) {
    await rejectsWith(as('anon', `select * from public.${t}`), 'permission denied');
  }
  await rejectsWith(as('anon', 'select * from private.app_secrets'), 'permission denied');
  const s = await as('anon', 'select event_name, bank_iban from public.event_settings');
  assert.equal(s.rows[0].event_name, 'V25 — O LEGADO');
  assert.equal(s.rows[0].bank_iban, 'AO06004000004006599510166');
});

test('sem preços publicados não há venda (A AGUARDAR ABERTURA)', async () => {
  const list = await as('anon', 'select * from public.list_ticket_types()');
  assert.equal(list.rowCount, 0);
  // Ingresso publicado sem preço é recusado pela base de dados
  await rejectsWith(as(ADMIN, `insert into public.ticket_types (name, quantity_total, published) values ('Geral', 10, true)`),
    'published_requires_price');
});

test('perfis: apenas administrador gere ingressos, configurações e equipa', async () => {
  await rpc(ADMIN, 'admin_set_staff', ['fin@v25.test', 'financeiro', 'Fin', true]);
  await rpc(ADMIN, 'admin_set_staff', ['op@v25.test', 'checkin', 'Operador', true]);
  await rejectsWith(rpc(FIN, 'admin_set_staff', ['x@v25.test', 'admin', '', true]), 'SEM_PERMISSAO');
  await rejectsWith(rpc(NOBODY, 'admin_dashboard'), 'SEM_PERMISSAO');
  await rejectsWith(as(FIN, `insert into public.ticket_types (name, price_kz, quantity_total) values ('X', 1000, 1)`), 'row-level security');
  const upd = await as(FIN, `update public.event_settings set sales_open = true where id = 1`);
  assert.equal(upd.rowCount, 0, 'financeiro não altera configurações');
  // Stock não pode ser manipulado directamente (sem privilégio de coluna)
  const r = await as(ADMIN, `insert into public.ticket_types (name, lot_label, price_kz, quantity_total, max_per_order, max_per_customer, persons_per_ticket, published)
                             values ('Normal', '1.º Lote', 15000, 10, 4, 6, 1, true) returning id`);
  typeId = r.rows[0].id;
  await rejectsWith(as(ADMIN, `update public.ticket_types set quantity_sold = 5 where id = '${typeId}'`), 'permission denied');
  await rejectsWith(rpc(ADMIN, 'bootstrap_admin', ['x@v25.test']), 'permission denied');
});

test('vendas fechadas impedem pedidos mesmo com ingresso publicado', async () => {
  await rejectsWith(createOrder(buyer()), 'VENDAS_FECHADAS');
  await as(ADMIN, `update public.event_settings set sales_open = true where id = 1`);
  const list = await as('anon', 'select * from public.list_ticket_types()');
  assert.equal(list.rows[0].on_sale, true);
  assert.equal(list.rows[0].available, 10);
});

test('validação de formulário no backend', async () => {
  await rejectsWith(createOrder(buyer({ consent: false })), 'CONSENTIMENTO_OBRIGATORIO');
  await rejectsWith(createOrder(buyer({ name: 'Ana' })), 'NOME_INVALIDO');
  await rejectsWith(createOrder(buyer({ email: 'sem-arroba' })), 'EMAIL_INVALIDO');
  await rejectsWith(createOrder(buyer({ phone: '+244123' })), 'TELEFONE_INVALIDO');
  await rejectsWith(createOrder(buyer({ phone: '+244812345678' })), 'TELEFONE_INVALIDO');
  await rejectsWith(createOrder(buyer({ qty: 5, guests: 5 })), 'QUANTIDADE_INVALIDA');
  await rejectsWith(createOrder(buyer({ qty: 2, guests: 3 })), 'CONVIDADOS_INVALIDO');
});

let order; // { order_code, access_token }
let orderId;

test('criação de pedido, idempotência e duplicados', async () => {
  const b = buyer({ email: 'maria@exemplo.ao' });
  order = await createOrder(b);
  assert.match(order.order_code, /^V25-[A-Z2-9]{6}$/);
  assert.equal(order.status, 'aguardando_pagamento');
  assert.equal(Number(order.total_kz), 30000);
  assert.ok(order.access_token.length >= 40);

  const replay = await createOrder(b);
  assert.equal(replay.order_code, order.order_code);
  assert.equal(replay.replayed, true);

  await rejectsWith(createOrder({ ...b, key: randomUUID() }), 'PEDIDO_DUPLICADO');
  const t = await admin.query(`select quantity_reserved from public.ticket_types where id = $1`, [typeId]);
  assert.equal(t.rows[0].quantity_reserved, 2, 'stock reservado uma única vez');
  orderId = (await admin.query(`select id from public.orders where order_code = $1`, [order.order_code])).rows[0].id;
  const tok = await admin.query(`select token_hash from public.order_access_tokens where order_id = $1`, [orderId]);
  assert.ok(tok.rows.every((r) => r.token_hash !== order.access_token), 'token guardado apenas como hash');
});

test('consulta segura do pedido', async () => {
  await rejectsWith(rpc('anon', 'get_order', [order.order_code, 'token-errado']), 'ACESSO_INVALIDO');
  const o = await rpc('anon', 'get_order', [order.order_code, order.access_token]);
  assert.equal(o.status, 'aguardando_pagamento');
  assert.equal(o.email_masked.includes('maria@'), false);
  assert.equal(o.payment.iban, 'AO06004000004006599510166');
  assert.deepEqual(o.tickets, []);
});

let proofPath;
test('upload seguro do comprovativo', async () => {
  const args = (mime, size) => [order.order_code, order.access_token, mime, size, 'a'.repeat(64)];
  await rejectsWith(rpc('anon', 'begin_proof_upload', args('text/html', 1000)), 'FICHEIRO_TIPO_INVALIDO');
  await rejectsWith(rpc('anon', 'begin_proof_upload', args('application/pdf', 6 * 1024 * 1024)), 'FICHEIRO_DEMASIADO_GRANDE');
  await rejectsWith(rpc('anon', 'begin_proof_upload', [order.order_code, 'x', 'application/pdf', 1000, null]), 'ACESSO_INVALIDO');
  const slot = await rpc('anon', 'begin_proof_upload', args('application/pdf', 1000));
  proofPath = slot.path;
  assert.match(proofPath, new RegExp(`^orders/${orderId}/[0-9a-f-]+\\.pdf$`));

  // Upload anónimo fora do slot é recusado pela RLS do storage
  await rejectsWith(as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', 'orders/outro.pdf', '{}')`), 'row-level security');
  await rejectsWith(as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('media', 'x.jpg', '{}')`), 'row-level security');
  await rejectsWith(rpc('anon', 'complete_proof_upload', [order.order_code, order.access_token, proofPath]), 'UPLOAD_NAO_ENCONTRADO');
  await as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1, '{"mimetype":"application/pdf","size":1000}')`, [proofPath]);
  // anon não consegue ler o ficheiro
  const seen = await as('anon', `select * from storage.objects where bucket_id = 'proofs'`);
  assert.equal(seen.rowCount, 0);

  const done = await rpc('anon', 'complete_proof_upload', [order.order_code, order.access_token, proofPath]);
  assert.equal(done.status, 'comprovativo_enviado');
  await rejectsWith(rpc('anon', 'complete_proof_upload', [order.order_code, order.access_token, proofPath]), 'UPLOAD_INVALIDO');
  // Slot usado não permite novo upload
  await rejectsWith(as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1 || '.2', '{}')`, [proofPath]), 'row-level security');
  // O upload NÃO aprova o pagamento nem emite ingressos
  const o = await rpc('anon', 'get_order', [order.order_code, order.access_token]);
  assert.equal(o.status, 'comprovativo_enviado');
  assert.deepEqual(o.tickets, []);
  // financeiro vê o comprovativo; operador de check-in não
  assert.equal((await as(FIN, `select * from storage.objects where bucket_id = 'proofs'`)).rowCount, 1);
  assert.equal((await as(OP, `select * from storage.objects where bucket_id = 'proofs'`)).rowCount, 0);
  assert.equal((await as(OP, `select * from public.orders`)).rowCount, 0);
});

test('aprovação: permissões, valor, idempotência e emissão de ingressos', async () => {
  await rejectsWith(rpc(OP, 'admin_approve_order', [orderId, 'TRX-0001', 30000, null]), 'SEM_PERMISSAO');
  await rejectsWith(rpc('anon', 'admin_approve_order', [orderId, 'TRX-0001', 30000, null]), 'permission denied');
  await rpc(FIN, 'admin_mark_in_review', [orderId]);
  await rejectsWith(rpc(FIN, 'admin_approve_order', [orderId, 'TRX-0001', 29000, null]), 'VALOR_NAO_CONFERE');
  await rejectsWith(rpc(FIN, 'admin_approve_order', [orderId, '', 30000, null]), 'REFERENCIA_OBRIGATORIA');

  const r = await rpc(FIN, 'admin_approve_order', [orderId, 'TRX-0001', 30000, 'Conferido no extracto']);
  assert.equal(r.status, 'emitido');
  assert.equal(r.tickets_issued, 2);
  const again = await rpc(FIN, 'admin_approve_order', [orderId, 'TRX-0001', 30000, null]);
  assert.equal(again.already_processed, true);
  const tickets = await admin.query(`select * from public.tickets where order_id = $1`, [orderId]);
  assert.equal(tickets.rowCount, 2, 'aprovação dupla não duplica ingressos');
  const t = await admin.query(`select quantity_reserved, quantity_sold from public.ticket_types where id = $1`, [typeId]);
  assert.deepEqual(t.rows[0], { quantity_reserved: 0, quantity_sold: 2 });
  const audit = await as(ADMIN, `select action from public.audit_log where entity_id = $1`, [orderId]);
  assert.ok(audit.rows.some((a) => a.action === 'pagamento.aprovado'));
  const mails = await admin.query(`select template from public.email_outbox where order_id = $1 order by id`, [orderId]);
  assert.deepEqual(mails.rows.map((m) => m.template),
    ['pedido_criado', 'comprovativo_recebido', 'pagamento_aprovado', 'ingresso_disponivel']);
});

let tickets;
test('ingressos e QR Code sem dados pessoais', async () => {
  const o = await rpc('anon', 'get_order', [order.order_code, order.access_token]);
  assert.equal(o.status, 'emitido');
  tickets = o.tickets;
  assert.equal(tickets.length, 2);
  assert.notEqual(tickets[0].ticket_code, tickets[1].ticket_code);
  for (const k of tickets) {
    assert.match(k.qr_payload, /^V25:T-[A-Z2-9]{8}:[A-Za-z0-9_-]{22}$/);
    assert.equal(/maria|exemplo|\+244/i.test(k.qr_payload), false);
  }
});

test('reutilização de referência bancária é bloqueada; rejeição exige motivo', async () => {
  const o2 = await createOrder(buyer({ email: 'joao@exemplo.ao', qty: 1, guests: 1, name: 'João Teste' }));
  const id2 = (await admin.query(`select id from public.orders where order_code = $1`, [o2.order_code])).rows[0].id;
  const slot = await rpc('anon', 'begin_proof_upload', [o2.order_code, o2.access_token, 'image/png', 2000, null]);
  await as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1, '{"mimetype":"image/png","size":2000}')`, [slot.path]);
  await rpc('anon', 'complete_proof_upload', [o2.order_code, o2.access_token, slot.path]);

  await rejectsWith(rpc(FIN, 'admin_approve_order', [id2, 'trx 0001', 15000, null]), 'REFERENCIA_REUTILIZADA');
  await rejectsWith(rpc(FIN, 'admin_reject_order', [id2, '']), 'MOTIVO_OBRIGATORIO');
  const rej = await rpc(FIN, 'admin_reject_order', [id2, 'Valor não identificado no extracto bancário.']);
  assert.equal(rej.status, 'rejeitado');
  const view = await rpc('anon', 'get_order', [o2.order_code, o2.access_token]);
  assert.equal(view.rejection_reason, 'Valor não identificado no extracto bancário.');
  // Não pode aprovar um pedido rejeitado sem novo comprovativo
  await rejectsWith(rpc(FIN, 'admin_approve_order', [id2, 'TRX-0002', 15000, null]), 'ESTADO_INVALIDO');
  // Cliente envia novo comprovativo → volta para análise → aprovado
  const slot2 = await rpc('anon', 'begin_proof_upload', [o2.order_code, o2.access_token, 'image/jpeg', 3000, 'b'.repeat(64)]);
  await as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1, '{"mimetype":"image/jpeg","size":3000}')`, [slot2.path]);
  await rpc('anon', 'complete_proof_upload', [o2.order_code, o2.access_token, slot2.path]);
  const ok = await rpc(FIN, 'admin_approve_order', [id2, 'TRX-0002', 15000, null]);
  assert.equal(ok.status, 'emitido');
});

test('comprovativo idêntico noutro pedido é recusado', async () => {
  const o3 = await createOrder(buyer({ email: 'ana@exemplo.ao', qty: 1, guests: 1, name: 'Ana Teste' }));
  await rejectsWith(rpc('anon', 'begin_proof_upload', [o3.order_code, o3.access_token, 'application/pdf', 1000, 'a'.repeat(64)]),
    'COMPROVATIVO_REUTILIZADO');
  await rpc('anon', 'cancel_order', [o3.order_code, o3.access_token]);
});

test('check-in: validação, bloqueio de reutilização e assinatura', async () => {
  await rejectsWith(rpc(FIN, 'checkin_ticket', [tickets[0].qr_payload, true]), 'SEM_PERMISSAO');
  const preview = await rpc(OP, 'checkin_ticket', [tickets[0].qr_payload, false]);
  assert.equal(preview.result, 'valido');
  const ok = await rpc(OP, 'checkin_ticket', [tickets[0].qr_payload, true]);
  assert.equal(ok.result, 'ok');
  assert.equal(ok.holder_name, 'Maria Teste Silva');
  const reuse = await rpc(OP, 'checkin_ticket', [tickets[0].qr_payload, true]);
  assert.equal(reuse.result, 'ja_utilizado');
  assert.equal(reuse.checked_in_by, 'Operador');
  assert.ok(reuse.checked_in_at);

  const forged = tickets[1].qr_payload.slice(0, -3) + 'AAA';
  assert.equal((await rpc(OP, 'checkin_ticket', [forged, true])).result, 'invalido');
  assert.equal((await rpc(OP, 'checkin_ticket', ['V25:T-ZZZZZZZZ:abc', true])).result, 'invalido');
  // Entrada manual do código
  const manual = await rpc(OP, 'checkin_ticket', [tickets[1].ticket_code.toLowerCase(), true]);
  assert.equal(manual.result, 'ok');
  const log = await as(OP, 'select result from public.checkin_log');
  assert.ok(log.rowCount >= 5);
  const t = await admin.query(`select checked_in_by from public.tickets where ticket_code = $1`, [tickets[0].ticket_code]);
  assert.equal(t.rows[0].checked_in_by, OP);
});

test('cancelamento anula ingressos e liberta stock; não cancela ingressos já utilizados', async () => {
  await rejectsWith(rpc(ADMIN, 'admin_cancel_order', [orderId, 'Pedido de teste']), 'INGRESSO_JA_UTILIZADO');
  await rejectsWith(rpc(FIN, 'admin_cancel_order', [orderId, 'Pedido de teste']), 'SEM_PERMISSAO');
  const o4 = await createOrder(buyer({ email: 'rui@exemplo.ao', qty: 1, guests: 1, name: 'Rui Teste' }));
  const id4 = (await admin.query(`select id from public.orders where order_code = $1`, [o4.order_code])).rows[0].id;
  const slot = await rpc('anon', 'begin_proof_upload', [o4.order_code, o4.access_token, 'image/png', 10, null]);
  await as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1, '{"mimetype":"image/png","size":10}')`, [slot.path]);
  await rpc('anon', 'complete_proof_upload', [o4.order_code, o4.access_token, slot.path]);
  await rpc(ADMIN, 'admin_approve_order', [id4, 'TRX-0004', 15000, null]);
  const before = (await admin.query(`select quantity_sold from public.ticket_types where id = $1`, [typeId])).rows[0].quantity_sold;
  await rpc(ADMIN, 'admin_cancel_order', [id4, 'Pedido de reembolso aprovado']);
  const after = (await admin.query(`select quantity_sold from public.ticket_types where id = $1`, [typeId])).rows[0].quantity_sold;
  assert.equal(after, before - 1);
  const v = await rpc('anon', 'get_order', [o4.order_code, o4.access_token]);
  assert.equal(v.status, 'cancelado');
  const code = (await admin.query(`select ticket_code from public.tickets where order_id = $1`, [id4])).rows[0].ticket_code;
  assert.equal((await rpc(OP, 'checkin_ticket', [code, true])).result, 'anulado');
});

test('reservas expiradas libertam stock', async () => {
  const o5 = await createOrder(buyer({ email: 'expira@exemplo.ao', qty: 1, guests: 1, name: 'Expira Teste', mode: 'reserva' }));
  assert.equal(o5.status, 'iniciada');
  const reserved = (await admin.query(`select quantity_reserved from public.ticket_types where id = $1`, [typeId])).rows[0].quantity_reserved;
  await admin.query(`update public.orders set expires_at = now() - interval '1 minute' where order_code = $1`, [o5.order_code]);
  const v = await rpc('anon', 'get_order', [o5.order_code, o5.access_token]);
  assert.equal(v.status, 'cancelado');
  const after = (await admin.query(`select quantity_reserved from public.ticket_types where id = $1`, [typeId])).rows[0].quantity_reserved;
  assert.equal(after, reserved - 1);
});

test('rate limiting por IP na criação de pedidos', async () => {
  const r = await as(ADMIN, `insert into public.ticket_types (name, price_kz, quantity_total, published)
                             values ('Rate', 1000, 100, true) returning id`);
  const ip = '10.9.9.9';
  for (let i = 0; i < 8; i++) {
    await createOrder(buyer({ type: r.rows[0].id, email: `rl${i}@exemplo.ao`, qty: 1, guests: 1, name: 'Rate Limit' }), { ip });
  }
  await rejectsWith(createOrder(buyer({ type: r.rows[0].id, email: 'rl9@exemplo.ao', qty: 1, guests: 1, name: 'Rate Limit' }), { ip }),
    'LIMITE_PEDIDOS');
});

test('stock concorrente: nunca vende mais do que o disponível', async () => {
  const r = await as(ADMIN, `insert into public.ticket_types (name, price_kz, quantity_total, max_per_order, max_per_customer, published)
                             values ('VIP', 50000, 5, 2, 2, true) returning id`);
  const vip = r.rows[0].id;
  const N = 20;
  const clients = await Promise.all(Array.from({ length: N }, async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    return c;
  }));
  const results = await Promise.allSettled(clients.map((c, i) =>
    rpc('anon', 'create_order', [vip, 1, 1, 'Cliente Concorrente', `conc${i}@exemplo.ao`, '+244923000000', true, 'v1', randomUUID(), 'compra', null],
      { client: c, ip: `10.20.0.${i}` })));
  await Promise.all(clients.map((c) => c.end()));
  const ok = results.filter((x) => x.status === 'fulfilled').length;
  const soldOut = results.filter((x) => x.status === 'rejected' && /ESGOTADO/.test(x.reason.message)).length;
  assert.equal(ok, 5);
  assert.equal(soldOut, N - 5);
  const t = await admin.query(`select quantity_reserved from public.ticket_types where id = $1`, [vip]);
  assert.equal(t.rows[0].quantity_reserved, 5);
});

test('aprovações concorrentes do mesmo pedido emitem ingressos uma só vez', async () => {
  const o = await createOrder(buyer({ email: 'paralelo@exemplo.ao', qty: 2, guests: 2, name: 'Paralelo Teste' }));
  const id = (await admin.query(`select id from public.orders where order_code = $1`, [o.order_code])).rows[0].id;
  const slot = await rpc('anon', 'begin_proof_upload', [o.order_code, o.access_token, 'image/png', 10, null]);
  await as('anon', `insert into storage.objects (bucket_id, name, metadata) values ('proofs', $1, '{}')`, [slot.path]);
  await rpc('anon', 'complete_proof_upload', [o.order_code, o.access_token, slot.path]);
  const clients = await Promise.all([1, 2, 3].map(async () => { const c = new pg.Client({ connectionString: dbUrl }); await c.connect(); return c; }));
  const res = await Promise.allSettled(clients.map((c) => rpc(FIN, 'admin_approve_order', [id, 'TRX-PAR', 30000, null], { client: c })));
  await Promise.all(clients.map((c) => c.end()));
  assert.equal(res.filter((r) => r.status === 'fulfilled' && r.value.already_processed === false).length, 1);
  const n = await admin.query(`select count(*)::int as n from public.tickets where order_id = $1`, [id]);
  assert.equal(n.rows[0].n, 2);
});

test('dashboard por perfil (receita oculta ao operador de check-in)', async () => {
  const a = await rpc(ADMIN, 'admin_dashboard');
  assert.ok(Number(a.revenue_confirmed_kz) > 0);
  assert.ok(a.tickets_used >= 2);
  const op = await rpc(OP, 'admin_dashboard');
  assert.equal(op.revenue_confirmed_kz, null);
});
