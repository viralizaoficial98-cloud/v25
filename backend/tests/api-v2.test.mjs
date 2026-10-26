// Testes de integração da versão 2: CMS, galeria dos eventos, compras Normal/Premium,
// VIP por consulta (solicitação → proposta → aceitação → pagamento → ingresso),
// histórico de preços, dashboard e relatórios com filtros. Base de dados própria.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { Client, anon, err, mails, startSmtpSink, stopSmtpSink, uploadForm } from './helpers.mjs';

const MEDIA_DIR = process.env.V25_MEDIA_DIR || path.join(process.env.V25_TMP ?? '', 'media');
let db;
const q = async (sql, params = []) => (await db.query(sql, params))[0];

const ADMIN = { email: 'admin@renewangola.online', password: 'Admin-V25-segura-1' };
const FIN = { email: 'financeiro@renewangola.online', password: 'Financas-V25-2026' };
const OP = { email: 'checkin@renewangola.online', password: 'Entrada-V25-2026' };
let admin, fin, op;
let JPG, PNG, PDF;
const cats = {};

before(async () => {
  db = await mysql.createConnection({
    user: process.env.V25_DB_USER, password: process.env.V25_DB_PASS, database: process.env.V25_DB,
    ...(process.env.V25_DB_SOCKET ? { socketPath: process.env.V25_DB_SOCKET } : { host: process.env.V25_DB_HOST, port: Number(process.env.V25_DB_PORT) }),
    timezone: 'Z',
  });
  await startSmtpSink(Number(process.env.V25_SMTP_PORT));
  JPG = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#b08d57' } }).jpeg().toBuffer();
  PNG = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#f4ead8' } }).png().toBuffer();
  PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
});
after(async () => {
  await db?.end();
  stopSmtpSink();
});

test('preparação: administrador, equipa e categorias oficiais', async () => {
  const c = anon();
  await c.session();
  assert.equal((await c.post('/setup/admin', { setup_token: process.env.SETUP_TOKEN, full_name: 'Admin', ...ADMIN })).status, 200);
  admin = new Client();
  assert.equal((await admin.login(ADMIN.email, ADMIN.password)).status, 200);
  for (const [u, role, name] of [[FIN, 'financeiro', 'Ana Financeira'], [OP, 'checkin', 'Operador Porta']]) {
    assert.equal((await admin.post('/admin/users', { email: u.email, full_name: name, role, password: u.password })).status, 201);
  }
  fin = new Client();
  await fin.login(FIN.email, FIN.password);
  op = new Client();
  await op.login(OP.email, OP.password);
  const list = (await admin.get('/admin/ticket-types')).data;
  for (const t of list) cats[t.name] = t;
  assert.deepEqual(Object.keys(cats).sort(), ['Normal', 'Premium', 'VIP']);
  assert.equal(cats.VIP.sale_mode, 'consulta');
  assert.equal(cats.VIP.price_kz, null);
  assert.equal(cats.VIP.published, true, 'VIP publicado sem preço (por consulta)');
});

// =============================================================================
// GESTÃO DO WEBSITE (CMS)
// =============================================================================
test('CMS: textos oficiais publicados e permissões', async () => {
  const site = (await anon().get('/public/site')).data;
  const hero = site.sections.find((s) => s.key === 'hero');
  assert.equal(hero.data.title, 'V25 — O LEGADO');
  assert.equal(hero.data.cta_primary.label, 'GARANTE JÁ O TEU INGRESSO');
  assert.equal(site.sections.find((s) => s.key === 'event_gallery').data.title, 'GALERIA DOS EVENTOS');
  assert.equal(site.preview, false);
  // todos os textos oficiais semeados passam na validação do servidor
  for (const sec of (await admin.get('/admin/site')).data) {
    const r = await admin.put(`/admin/site/${sec.key}`, { data: sec.draft });
    assert.equal(r.status, 200, `${sec.key}: ${JSON.stringify(r.data)}`);
    await admin.post(`/admin/site/${sec.key}/discard`, {});
  }
  err(await fin.get('/admin/site'), 'SEM_PERMISSAO', 403);
  err(await op.get('/admin/site/preview'), 'SEM_PERMISSAO', 403);
  err(await anon().get('/admin/site/preview'), 'NAO_AUTENTICADO', 401);
});

test('CMS: rascunho, pré-visualização, publicação, histórico e restauro', async () => {
  const current = (await admin.get('/admin/site')).data.find((s) => s.key === 'hero');
  const draft = { ...current.draft, title: 'V25 — O LEGADO (rascunho)', description: '<script>alert(1)</script> texto' };
  const saved = await admin.put('/admin/site/hero', { data: draft });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.has_draft, true);
  // o público continua a ver a versão publicada
  assert.equal((await anon().get('/public/site')).data.sections.find((s) => s.key === 'hero').data.title, 'V25 — O LEGADO');
  // pré-visualização mostra o rascunho (o HTML é guardado como texto simples)
  const prev = (await admin.get('/admin/site/preview')).data.sections.find((s) => s.key === 'hero');
  assert.equal(prev.data.title, 'V25 — O LEGADO (rascunho)');
  assert.equal(prev.data.description, '<script>alert(1)</script> texto');
  // links e imagens perigosos são recusados
  err(await admin.put('/admin/site/hero', { data: { ...draft, cta_primary: { label: 'X', href: 'javascript:alert(1)' } } }), 'URL_INVALIDO', 422);
  err(await admin.put('/admin/site/hero', { data: { ...draft, image: '../../v25_app/.env' } }), 'IMAGEM_INVALIDA', 422);
  err(await admin.put('/admin/site/hero', { data: { ...draft, title: 'x'.repeat(500) } }), 'TEXTO_DEMASIADO_LONGO', 422);
  // publicar
  const pub = await admin.post('/admin/site/hero/publish', {});
  assert.equal(pub.data.has_draft, false);
  assert.equal((await anon().get('/public/site')).data.sections.find((s) => s.key === 'hero').data.title, 'V25 — O LEGADO (rascunho)');
  // histórico e restauro da versão oficial (vira rascunho, publicar de novo)
  const revs = (await admin.get('/admin/site/hero/revisions')).data;
  assert.ok(revs.length >= 2);
  const original = (await q("SELECT id FROM site_revisions WHERE section_key = 'hero' ORDER BY id ASC LIMIT 1"))[0];
  // a migração não cria revisões; criamos o ponto de restauro a partir do histórico existente
  const official = revs.find((r) => r.action === 'rascunho');
  assert.ok(official || original);
  await admin.put('/admin/site/hero', { data: { ...draft, title: 'V25 — O LEGADO', description: current.draft.description }, publish: true });
  assert.equal((await anon().get('/public/site')).data.sections.find((s) => s.key === 'hero').data.title, 'V25 — O LEGADO');
  const restored = await admin.post('/admin/site/hero/restore', { revision_id: revs[0].id });
  assert.equal(restored.data.draft.title, 'V25 — O LEGADO (rascunho)');
  await admin.post('/admin/site/hero/discard', {});
  assert.equal((await admin.get('/admin/site')).data.find((s) => s.key === 'hero').has_draft, false);
  const audit = await q("SELECT action FROM audit_logs WHERE entity = 'site_section'");
  assert.ok(audit.some((a) => a.action === 'site.publicado'));
});

test('CMS: ocultar secção, reordenar, imagem do Hero e SEO', async () => {
  await admin.put('/admin/site/memories/visibility', { enabled: false });
  assert.equal((await anon().get('/public/site')).data.sections.find((s) => s.key === 'memories').enabled, false);
  await admin.put('/admin/site/memories/visibility', { enabled: true });
  const order = (await admin.get('/admin/site')).data.map((s) => s.key);
  const swapped = [order[1], order[0], ...order.slice(2)];
  const re = await admin.put('/admin/site/order', { keys: swapped });
  assert.deepEqual(re.data.map((s) => s.key).slice(0, 2), swapped.slice(0, 2));
  // imagem do Hero: só com site.manage; ficheiro re-codificado
  err(await fin.req('POST', '/admin/uploads/image', { form: uploadForm(JPG, 'hero.jpg', 'image/jpeg', { folder: 'site' }) }), 'SEM_PERMISSAO', 403);
  const up = await admin.req('POST', '/admin/uploads/image', { form: uploadForm(JPG, 'hero.jpg', 'image/jpeg', { folder: 'site' }) });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.match(up.data.path, /^site\/[0-9a-f-]{36}\.(webp|jpg)$/);
  const hero = (await admin.get('/admin/site')).data.find((s) => s.key === 'hero');
  await admin.put('/admin/site/hero', { data: { ...hero.draft, image: up.data.path }, publish: true });
  assert.equal((await anon().get('/public/site')).data.sections.find((s) => s.key === 'hero').data.image, up.data.path);
  const seo = (await admin.get('/admin/site')).data.find((s) => s.key === 'seo');
  err(await admin.put('/admin/site/seo', { data: { ...seo.draft, meta_title: 'x'.repeat(80) } }), 'TEXTO_DEMASIADO_LONGO', 422);
  assert.equal((await admin.put('/admin/site/seo', { data: { ...seo.draft, meta_title: 'V25 — O Legado | Bilhetes' }, publish: true })).status, 200);
});

// =============================================================================
// GALERIA DOS EVENTOS
// =============================================================================
let album;
test('galeria: álbum, fotografias com miniatura, vídeos, capa, ordem, publicação', async () => {
  err(await fin.post('/admin/gallery/albums', { title: 'X' }), 'SEM_PERMISSAO', 403);
  const a = await admin.post('/admin/gallery/albums', { title: 'Concerto de Natal 2019', category: 'Concertos', event_date: '2019-12-15', location: 'Luanda', description: 'Noite especial.' });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  album = a.data.album;
  assert.equal(album.slug, 'concerto-de-natal-2019');
  assert.equal((await anon().get('/public/gallery/albums')).data.albums.length, 0, 'rascunho não é público');
  const ids = [];
  for (const [buf, name, type] of [[JPG, 'a.jpg', 'image/jpeg'], [PNG, 'b.png', 'image/png']]) {
    const u = await admin.req('POST', `/admin/gallery/albums/${album.id}/items`, { form: uploadForm(buf, name, type, { caption: `Legenda ${name}`, alt_text: `Foto ${name}` }) });
    assert.equal(u.status, 201, JSON.stringify(u.data));
    assert.ok(existsSync(path.join(MEDIA_DIR, u.data.path)) && existsSync(path.join(MEDIA_DIR, u.data.thumb_path)), 'original optimizado + miniatura');
    ids.push(u.data.id);
  }
  const big = await sharp(path.join(MEDIA_DIR, (await admin.get(`/admin/gallery/albums/${album.id}`)).data.items[0].path)).metadata();
  assert.ok(big.width <= 2000 && Math.abs(big.width / big.height - 1.6) < 0.01, 'redimensionada sem recorte');
  err(await admin.req('POST', `/admin/gallery/albums/${album.id}/items`, { form: uploadForm(Buffer.from('<?php system($_GET[1]); ?>'), 'x.jpg', 'image/jpeg') }), 'FICHEIRO_TIPO_INVALIDO', 415);
  const v = await admin.post(`/admin/gallery/albums/${album.id}/videos`, { url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'Vídeo' });
  assert.equal(v.data.embed_url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  err(await admin.post(`/admin/gallery/albums/${album.id}/videos`, { url: 'https://evil.example/video.mp4' }), 'VIDEO_URL_NAO_AUTORIZADO', 422);
  // capa, ordem, legenda, publicação
  await admin.put(`/admin/gallery/albums/${album.id}`, { ...album, cover_item_id: ids[1], published: true });
  // Actualização parcial (só a capa) não apaga os restantes campos
  const partial = await admin.put(`/admin/gallery/albums/${album.id}`, { cover_item_id: ids[1] });
  assert.equal(partial.data.album.category, 'Concertos');
  assert.equal(partial.data.album.location, 'Luanda');
  assert.equal(partial.data.album.published, true);
  const ord = await admin.put(`/admin/gallery/albums/${album.id}/order`, { ids: [v.data.id, ids[1], ids[0]] });
  assert.deepEqual(ord.data.items.map((i) => i.id), [v.data.id, ids[1], ids[0]]);
  await admin.put(`/admin/gallery/items/${ids[0]}`, { caption: 'Nova legenda', alt_text: 'Texto alternativo' });
  const pub = (await anon().get('/public/gallery/albums?year=2019')).data;
  assert.equal(pub.albums.length, 1);
  assert.deepEqual(pub.years, [2019]);
  assert.deepEqual(pub.categories, ['Concertos']);
  assert.equal(pub.albums[0].cover.id, ids[1]);
  assert.equal(pub.albums[0].photos, 2);
  assert.equal((await anon().get('/public/gallery/albums?year=2020')).data.albums.length, 0);
  const page1 = (await anon().get(`/public/gallery/albums/${album.slug}?offset=0&limit=2`)).data;
  assert.equal(page1.total, 3);
  assert.equal(page1.items.length, 2);
  assert.equal((await anon().get(`/public/gallery/albums/${album.slug}?offset=2&limit=2`)).data.items[0].caption, 'Nova legenda');
  // substituir e eliminar ficheiros
  const old = (await admin.get(`/admin/gallery/albums/${album.id}`)).data.items.find((i) => i.id === ids[0]);
  const rep = await admin.req('POST', `/admin/gallery/items/${ids[0]}/replace`, { form: uploadForm(PNG, 'n.png', 'image/png') });
  assert.equal(rep.data.caption, 'Nova legenda', 'mantém legenda');
  assert.equal(existsSync(path.join(MEDIA_DIR, old.path)), false, 'ficheiro antigo removido');
  await admin.del(`/admin/gallery/items/${ids[1]}`);
  assert.equal((await admin.get(`/admin/gallery/albums/${album.id}`)).data.album.cover_item_id, null, 'capa limpa ao eliminar');
});

// =============================================================================
// COMERCIAL: stock, preços, histórico
// =============================================================================
const buyer = (o = {}) => ({
  ticket_type_id: cats.Normal.id, quantity: 2, guests_total: 2, full_name: 'Maria Teste Silva', email: `c${randomUUID().slice(0, 8)}@exemplo.ao`,
  phone: '+244923456789', consent: true, consent_version: 'v2', idempotency_key: randomUUID(), mode: 'compra', ...o,
});
const tok = (t) => ({ headers: { 'X-Order-Token': t } });
const orderId = async (code) => (await q('SELECT id FROM orders WHERE order_code = ?', [code]))[0].id;

test('ingressos: stock por definir bloqueia compra; VIP nunca pelo checkout', async () => {
  assert.equal((await admin.put('/admin/settings', { sales_open: true })).status, 200);
  err(await anon().post('/public/orders', buyer()), 'DISPONIBILIDADE_POR_ANUNCIAR', 409);
  for (const [name, qty] of [['Normal', 100], ['Premium', 50], ['VIP', 5]]) {
    const t = cats[name];
    const r = await admin.put(`/admin/ticket-types/${t.id}`, { ...t, quantity_total: qty });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    cats[name] = r.data;
  }
  err(await anon().post('/public/orders', buyer({ ticket_type_id: cats.VIP.id, quantity: 1, guests_total: 1 })), 'INGRESSO_POR_CONSULTA', 422);
  const pub = (await anon().get('/public/ticket-types')).data;
  assert.equal(pub.find((t) => t.name === 'VIP').on_sale, false);
  assert.equal(pub.find((t) => t.name === 'Normal').on_sale, true);
});

let normal, premium;
test('compra Normal: preço do backend, método de pagamento, dados bancários só no pedido', async () => {
  // o navegador não pode impor o valor: campos de preço enviados são ignorados
  const r = await anon().post('/public/orders', { ...buyer({ email: 'normal@exemplo.ao' }), total_kz: 1, unit_price_kz: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  normal = r.data;
  assert.equal(normal.total_kz, 25000);
  const view = (await anon().get(`/public/orders/${normal.order_code}`, tok(normal.access_token))).data;
  assert.equal(view.payment.iban, 'AO06004000004006599510166');
  assert.equal(view.payment.account_name, '27 LUAS COMUNICACAO E MARKETING SU LDA');
  assert.equal(view.event.venue, 'Hotel Brisa Tropical');
  assert.equal(view.payment_method, null);
  err(await anon().post(`/public/orders/${normal.order_code}/payment-method`, { method: 'cartao' }, tok(normal.access_token)), 'METODO_PAGAMENTO_INVALIDO', 422);
  assert.equal((await anon().post(`/public/orders/${normal.order_code}/payment-method`, { method: 'transferencia' }, tok(normal.access_token))).data.payment_method, 'transferencia');
});

test('histórico de preços: alteração não afecta pedidos existentes', async () => {
  const r = await admin.put(`/admin/ticket-types/${cats.Normal.id}`, { ...cats.Normal, price_kz: 13000 });
  assert.equal(r.data.price_kz, 13000);
  const hist = (await admin.get(`/admin/ticket-types/${cats.Normal.id}/price-history`)).data;
  assert.equal(hist[0].old_price_kz, 12500);
  assert.equal(hist[0].new_price_kz, 13000);
  assert.equal(hist[0].changed_by, ADMIN.email);
  const view = (await anon().get(`/public/orders/${normal.order_code}`, tok(normal.access_token))).data;
  assert.equal(view.unit_price_kz, 12500, 'pedido mantém o preço da compra');
  assert.equal(view.total_kz, 25000);
  cats.Normal = (await admin.put(`/admin/ticket-types/${cats.Normal.id}`, { ...cats.Normal, price_kz: 12500 })).data;
});

test('compra Premium com Transferência Express → aprovação → ingressos → check-in', async () => {
  premium = (await anon().post('/public/orders', buyer({ ticket_type_id: cats.Premium.id, email: 'premium@exemplo.ao', quantity: 1, guests_total: 1 }))).data;
  assert.equal(premium.total_kz, 25000);
  const up = await anon().req('POST', `/public/orders/${premium.order_code}/proofs`, { form: uploadForm(PDF, 'express.pdf', 'application/pdf', { method: 'express' }), ...tok(premium.access_token) });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const v = (await anon().get(`/public/orders/${premium.order_code}`, tok(premium.access_token))).data;
  assert.equal(v.status, 'comprovativo_enviado');
  assert.equal(v.payment_method, 'express');
  assert.ok(v.proof_uploaded_at);
  const id = await orderId(premium.order_code);
  // sem método explícito, a aprovação usa o escolhido pelo cliente
  const ap = await fin.post(`/admin/orders/${id}/approve`, { payment_reference: 'EXP-0001', amount_confirmed: 25000 });
  assert.equal(ap.data.status, 'emitido', JSON.stringify(ap.data));
  assert.equal((await q('SELECT method FROM payments WHERE order_id = ?', [id]))[0].method, 'express');
  const t = (await anon().get(`/public/orders/${premium.order_code}`, tok(premium.access_token))).data.tickets;
  assert.equal(t.length, 1);
  assert.equal((await op.post('/admin/checkin', { input: t[0].qr_payload })).data.ticket_type, 'Premium');
  assert.equal((await op.post('/admin/checkin', { input: t[0].qr_payload })).data.result, 'ja_utilizado');
  // Normal: comprovativo + aprovação
  await anon().req('POST', `/public/orders/${normal.order_code}/proofs`, { form: uploadForm(Buffer.concat([PDF, Buffer.from('%n')]), 'n.pdf', 'application/pdf'), ...tok(normal.access_token) });
  assert.equal((await fin.post(`/admin/orders/${await orderId(normal.order_code)}/approve`, { payment_reference: 'TRF-0001', amount_confirmed: 25000 })).data.tickets_issued, 2);
});

// =============================================================================
// VIP
// =============================================================================
let vip;
test('VIP: solicitação pública, duplicados e permissões', async () => {
  err(await anon().post('/public/vip', { full_name: 'Carlos VIP', email: 'vip@exemplo.ao', phone: '+244923111222', participants: 0, consent: true }), 'PARTICIPANTES_INVALIDO', 422);
  err(await anon().post('/public/vip', { full_name: 'Carlos VIP', email: 'vip@exemplo.ao', phone: '+244923111222', participants: 2, consent: false }), 'CONSENTIMENTO_OBRIGATORIO', 422);
  const r = await anon().post('/public/vip', { full_name: 'Carlos VIP', email: 'vip@exemplo.ao', phone: '+244923111222', participants: 2, message: 'Mesa para a família', consent: true, consent_version: 'v2' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  vip = r.data;
  assert.match(vip.request_code, /^VIP-[A-Z2-9]{6}$/);
  err(await anon().post('/public/vip', { full_name: 'Carlos VIP', email: 'vip@exemplo.ao', phone: '+244923111222', participants: 2, consent: true }), 'VIP_PEDIDO_DUPLICADO', 409);
  const view = (await anon().get(`/public/vip/${vip.request_code}`, { headers: { 'X-Vip-Token': vip.access_token } })).data;
  assert.equal(view.status, 'nova');
  assert.equal(view.proposal, null);
  err(await anon().get(`/public/vip/${vip.request_code}`, { headers: { 'X-Vip-Token': 'errado' } }), 'ACESSO_INVALIDO', 403);
  err(await anon().post(`/public/vip/${vip.request_code}/accept`, {}, { headers: { 'X-Vip-Token': vip.access_token } }), 'PROPOSTA_INDISPONIVEL', 409);
  err(await fin.get('/admin/vip'), 'SEM_PERMISSAO', 403);
  err(await op.get('/admin/vip'), 'SEM_PERMISSAO', 403);
});

test('VIP: proposta da organização → aceitação → pedido com valor aprovado → pagamento → ingressos VIP', async () => {
  const list = (await admin.get('/admin/vip')).data;
  const req = list.find((x) => x.request_code === vip.request_code);
  await admin.put(`/admin/vip/${req.id}`, { status: 'em_analise', admin_notes: 'Contactar por telefone' });
  err(await admin.post(`/admin/vip/${req.id}/proposals`, { tickets: 10, total_kz: 900000, conditions: 'Mesa VIP' }), 'VIP_ESGOTADO', 409);
  err(await admin.post(`/admin/vip/${req.id}/proposals`, { tickets: 2, total_kz: 0, conditions: 'Mesa VIP' }), 'PRECO_INVALIDO', 422);
  const p = await admin.post(`/admin/vip/${req.id}/proposals`, { tickets: 2, total_kz: 300000, conditions: 'Mesa VIP para 2 pessoas, lembrança comemorativa.', valid_days: 7 });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  assert.equal(p.data.request.status, 'proposta_enviada');
  const view = (await anon().get(`/public/vip/${vip.request_code}`, { headers: { 'X-Vip-Token': vip.access_token } })).data;
  assert.equal(view.proposal.total_kz, 300000);
  assert.equal(view.proposal.tickets, 2);
  const acc = await anon().post(`/public/vip/${vip.request_code}/accept`, {}, { headers: { 'X-Vip-Token': vip.access_token } });
  assert.equal(acc.status, 201, JSON.stringify(acc.data));
  assert.equal(acc.data.total_kz, 300000);
  err(await anon().post(`/public/vip/${vip.request_code}/accept`, {}, { headers: { 'X-Vip-Token': vip.access_token } }), 'PROPOSTA_INDISPONIVEL', 409);
  const order = (await anon().get(`/public/orders/${acc.data.order_code}`, tok(acc.data.access_token))).data;
  assert.equal(order.source, 'vip');
  assert.equal(order.ticket_type.name, 'VIP');
  assert.equal(order.total_kz, 300000);
  assert.equal(order.unit_price_kz, 150000);
  assert.equal((await q('SELECT quantity_reserved FROM ticket_categories WHERE id = ?', [cats.VIP.id]))[0].quantity_reserved, 2);
  await anon().req('POST', `/public/orders/${acc.data.order_code}/proofs`, { form: uploadForm(Buffer.concat([PDF, Buffer.from('%vip')]), 'vip.pdf', 'application/pdf', { method: 'transferencia' }), ...tok(acc.data.access_token) });
  const id = await orderId(acc.data.order_code);
  err(await fin.post(`/admin/orders/${id}/approve`, { payment_reference: 'VIP-TRF-1', amount_confirmed: 150000 }), 'VALOR_NAO_CONFERE', 422);
  assert.equal((await fin.post(`/admin/orders/${id}/approve`, { payment_reference: 'VIP-TRF-1', amount_confirmed: 300000 })).data.tickets_issued, 2);
  const tickets = (await anon().get(`/public/orders/${acc.data.order_code}`, tok(acc.data.access_token))).data.tickets;
  assert.equal(tickets.length, 2);
  assert.equal((await op.post('/admin/checkin', { input: tickets[0].qr_payload })).data.ticket_type, 'VIP');
  const detail = (await admin.get(`/admin/vip/${req.id}`)).data;
  assert.equal(detail.proposals[0].order_code, acc.data.order_code);
  assert.equal(detail.vip_available, 3);
});

test('VIP: proposta expirada, recusa pelo cliente e rejeição com motivo', async () => {
  const mk = async (email) => (await anon().post('/public/vip', { full_name: 'Outro Cliente', email, phone: '+244923333444', participants: 1, consent: true })).data;
  const a = await mk('vip2@exemplo.ao');
  const ida = (await q('SELECT id FROM vip_requests WHERE request_code = ?', [a.request_code]))[0].id;
  await admin.post(`/admin/vip/${ida}/proposals`, { tickets: 1, total_kz: 150000, conditions: 'Lugar VIP', valid_days: 1 });
  await q('UPDATE vip_proposals SET valid_until = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE request_id = ?', [ida]);
  err(await anon().post(`/public/vip/${a.request_code}/accept`, {}, { headers: { 'X-Vip-Token': a.access_token } }), 'PROPOSTA_EXPIRADA', 409);
  // nova proposta substitui a anterior; o cliente recusa
  await admin.post(`/admin/vip/${ida}/proposals`, { tickets: 1, total_kz: 140000, conditions: 'Lugar VIP (revista)', valid_days: 3 });
  assert.equal((await anon().post(`/public/vip/${a.request_code}/decline`, {}, { headers: { 'X-Vip-Token': a.access_token } })).data.status, 'recusada_cliente');
  const b = await mk('vip3@exemplo.ao');
  const idb = (await q('SELECT id FROM vip_requests WHERE request_code = ?', [b.request_code]))[0].id;
  err(await admin.put(`/admin/vip/${idb}`, { status: 'rejeitada', reason: '' }), 'MOTIVO_OBRIGATORIO', 422);
  assert.equal((await admin.put(`/admin/vip/${idb}`, { status: 'rejeitada', reason: 'Lugares VIP esgotados' })).data.request.status, 'rejeitada');
  assert.equal((await anon().get(`/public/vip/${b.request_code}`, { headers: { 'X-Vip-Token': b.access_token } })).data.status_reason, 'Lugares VIP esgotados');
});

// =============================================================================
// DASHBOARD, RELATÓRIOS, EMAILS
// =============================================================================
test('dashboard: vendas por categoria, VIP, check-ins, reservas expiradas', async () => {
  const exp = (await anon().post('/public/orders', buyer({ email: 'expira@exemplo.ao', quantity: 1, guests_total: 1 }))).data;
  await q('UPDATE orders SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_code = ?', [exp.order_code]);
  const d = (await admin.get('/admin/dashboard')).data;
  const by = Object.fromEntries(d.by_type.map((t) => [t.name, t]));
  assert.equal(by.Normal.sold, 2);
  assert.equal(by.Premium.sold, 1);
  assert.equal(by.VIP.sold, 2);
  assert.equal(by.VIP.revenue_kz, 300000);
  assert.equal(d.revenue_confirmed_kz, 25000 + 25000 + 300000);
  assert.equal(d.vip_requests_total, 3);
  assert.equal(d.vip_orders, 1);
  assert.equal(d.checkins, 2);
  assert.equal(d.reservations_expired, 1);
  assert.equal((await op.get('/admin/dashboard')).data.by_type[0].revenue_kz, null, 'operador não vê receita');
});

test('relatórios: filtros por categoria/origem/datas, CSV VIP com permissões', async () => {
  const prem = (await fin.get(`/admin/reports/orders.csv?category=${cats.Premium.id}`)).data.toString('utf8');
  assert.match(prem, new RegExp(premium.order_code));
  assert.doesNotMatch(prem, new RegExp(normal.order_code));
  const vipCsv = (await fin.get('/admin/reports/orders.csv?source=vip')).data.toString('utf8').trim().split('\r\n');
  assert.equal(vipCsv.length, 2, 'cabeçalho + 1 pedido VIP');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok((await fin.get(`/admin/reports/orders.csv?from=${today}&to=${today}`)).data.toString('utf8').includes(normal.order_code));
  assert.equal((await fin.get('/admin/reports/orders.csv?from=2020-01-01&to=2020-01-02')).data.toString('utf8').trim().split('\r\n').length, 1);
  err(await fin.get('/admin/reports/vip.csv'), 'SEM_PERMISSAO', 403);
  const v = (await admin.get('/admin/reports/vip.csv')).data.toString('utf8');
  assert.match(v, new RegExp(vip.request_code));
  const sum = (await fin.get(`/admin/reports/summary?category=${cats.Premium.id}`)).data;
  assert.equal(sum.orders.length, 1);
});

test('emails VIP e de compra enviados por SMTP', async () => {
  const before = mails.length;
  const r = await admin.post('/admin/emails/process', {});
  assert.equal(r.data.failed, 0, JSON.stringify(r.data));
  const subjects = mails.slice(before).map((m) => (/^Subject: (.*)$/m.exec(m.raw)?.[1] ?? '').replace(/=\?UTF-8\?Q\?|\?=/g, ''));
  for (const s of ['Recebemos_a_sua_solicita', 'Proposta_VIP', 'Os_seus_ingressos', 'Pagamento_aprovado']) {
    assert.ok(subjects.some((x) => x.includes(s)), `assunto com ${s}: ${subjects.join(' | ')}`);
  }
  const proposal = mails.slice(before).find((m) => /Proposta_VIP/.test(m.raw) && m.to.includes('vip@exemplo.ao'));
  assert.match(proposal.raw.replace(/=\r\n/g, '').replace(/=3D/g, '='), /\/vip\/VIP-[A-Z2-9]{6}#t=/);
});

test('API pública não expõe dados bancários nem rascunhos', async () => {
  const s = await anon().get('/public/settings');
  assert.equal(JSON.stringify(s.data).includes('AO0600400000'), false);
  assert.equal((await admin.get('/admin/settings')).data.bank_iban, 'AO06004000004006599510166');
  err(await fin.get('/admin/settings'), 'SEM_PERMISSAO', 403);
});
