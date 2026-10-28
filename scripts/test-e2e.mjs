// Teste ponta-a-ponta pela interface: build de produção + API PHP + MySQL/MariaDB reais.
// Percorre (v2): landing White Premium → instalação → gestão comercial → CMS (rascunho,
// pré-visualização, publicação) → galeria → compras Normal/Premium → VIP (proposta e
// aceitação) → aprovação manual → ingressos/QR/PDF → check-in → relatórios, com 3 perfis.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { startStack } from './lib/stack.mjs';

// Playwright pode estar instalado no projecto ou globalmente (NODE_PATH)
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const SHOTS = process.env.V25_SHOTS || 'e2e-screenshots';
mkdirSync(SHOTS, { recursive: true });
// Modo externo: V25_E2E_BASE=https://… V25_E2E_SETUP_TOKEN=… testa uma instalação já feita
// (BD acabada de importar, sem utilizadores). Caso contrário cria o ambiente local completo.
const external = process.env.V25_E2E_BASE;
let stack;
if (external) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'v25-e2e-'));
  stack = { env: { V25_BASE: external.replace(/\/$/, ''), SETUP_TOKEN: process.env.V25_E2E_SETUP_TOKEN, V25_TMP: tmp }, stop: async () => ({ phpErrors: [], appErrors: [] }) };
} else {
  const build = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(1);
  stack = await startStack({ docroot: 'dist' });
}
const BASE = stack.env.V25_BASE;
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const problems = [];
const steps = [];
const step = (s) => { steps.push(s); console.log('✔', s); };

async function newPage(name, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  // IP simulado apenas nos pedidos à API (cada perfil com o seu IP, como na vida real)
  const ip = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await ctx.route(`${BASE}/api/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name}] erro JS: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${name}] consola: ${m.text()}`));
  page.on('response', (r) => r.status() >= 500 && problems.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
  return page;
}
// Percorre a página para disparar animações de entrada e imagens lazy antes de uma captura completa
async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.7)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 350));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}
async function noOverflow(page, where) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o > 0) throw new Error(`Scroll horizontal no telemóvel (${where}): ${o}px`);
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

const ADMIN = { email: 'admin@renewangola.online', password: 'Admin-V25-segura-1' };
const FIN = { email: 'financeiro@renewangola.online', password: 'Financas-V25-2026' };
const OP = { email: 'checkin@renewangola.online', password: 'Entrada-V25-2026' };

async function login(page, u) {
  await page.goto(`${BASE}/admin`);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Palavra-passe').fill(u.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
}

let exitCode = 0;
const IBAN = 'AO06 0040 0000 4006 5995 1016 6';
const card = (page, name) => page.locator('#ingressos li', { has: page.getByRole('heading', { name, exact: true }) });

let proofSeq = 0;
async function uploadProof(page) {
  // Cada pedido tem o seu próprio comprovativo (o sistema bloqueia ficheiros reutilizados)
  const file = path.join(stack.env.V25_TMP, `comprovativo-${++proofSeq}.png`);
  writeFileSync(file, await sharp({ create: { width: 600 + proofSeq, height: 400, channels: 3, background: '#ffffff' } }).png().toBuffer());
  await page.getByLabel('Ficheiro do comprovativo').setInputFiles(file);
  await page.getByRole('button', { name: 'Enviar comprovativo' }).click();
  // No popup: ecrã “Comprovativo enviado”; na página do pedido: “PAGAMENTO EM ANÁLISE”
  await page.getByRole('heading', { name: /^(PAGAMENTO EM ANÁLISE|Comprovativo enviado)$/ }).waitFor();
  await page.getByText('O comprovativo ainda não confirma o pagamento.').first().waitFor();
  await page.getByText('Aguardando validação financeira').first().waitFor();
}

/** Compra pelo popup: etapas 1–2, devolve o código do pedido (etapa 3 visível). */
async function buy(page, category, qty, who) {
  await page.goto(BASE + '/');
  await card(page, category).getByRole('button', { name: /comprar bilhete/i }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('heading', { name: '1. Seleção do bilhete' }).waitFor();
  const radio = dlg.getByRole('radio', { name: new RegExp(`^${category}`) });
  if ((await radio.getAttribute('aria-checked')) !== 'true') throw new Error(`Categoria ${category} não pré-seleccionada`);
  for (let i = 1; i < qty; i++) await dlg.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await dlg.getByLabel('Nome completo').fill(who.name);
  await dlg.getByLabel(/^Email/).fill(who.email);
  await dlg.getByRole('textbox', { name: /Telefone/ }).fill(who.phone);
  await dlg.getByRole('checkbox').check();
  await dlg.getByRole('button', { name: /Confirmar pedido e ver pagamento/ }).click();
  const ok = dlg.getByText(/^Pedido V25-[A-Z2-9]{6} registado$/);
  await ok.waitFor();
  return (await ok.innerText()).match(/V25-[A-Z2-9]{6}/)[0];
}

async function orderCode(page) {
  await page.waitForURL(/\/pedido\/V25-/);
  const h1 = page.getByRole('heading', { level: 1, name: /^V25-[A-Z2-9]{6}$/ });
  await h1.waitFor();
  return (await h1.innerText()).trim();
}

async function approve(fin, code, amount) {
  await fin.getByRole('link', { name: 'Validação de pagamentos' }).click();
  await fin.getByRole('cell', { name: code }).waitFor();
  await fin.getByRole('row', { name: new RegExp(code) }).getByRole('button', { name: 'Abrir' }).click();
  await fin.getByRole('button', { name: 'Aprovar pagamento' }).click();
  await fin.getByLabel('Referência/ID da transacção no banco *').fill(`TRX-${code}`);
  await fin.getByLabel('Valor confirmado no extracto (Kz) *').fill(String(amount));
  await fin.getByRole('checkbox').check();
  await fin.getByRole('button', { name: 'Aprovar e emitir ingressos' }).click();
  await fin.getByText('Pagamento aprovado e ingressos emitidos.').waitFor();
  await fin.keyboard.press('Escape');
}

try {
  // ── Landing page (White Premium) com dados da API e do CMS ────────────────
  const visitor = await newPage('visitante');
  await visitor.goto(BASE + '/');
  await visitor.getByRole('heading', { level: 1, name: 'V25 — O LEGADO' }).waitFor();
  await visitor.getByText('25 Anos de Música, Fé, Amizade e História').first().waitFor();
  await visitor.getByText('12 500 Kz').waitFor();
  await visitor.getByText('25 000 Kz').waitFor();
  await card(visitor, 'VIP').getByText('Por consulta', { exact: true }).first().waitFor();
  await visitor.getByText('A AGUARDAR ABERTURA DAS VENDAS').waitFor();
  if (await visitor.getByRole('button', { name: /comprar bilhete/i }).count()) throw new Error('Compra disponível com vendas fechadas');
  const bg = await visitor.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bg !== 'rgb(255, 255, 255)') throw new Error('Fundo não é branco: ' + bg);
  // Mesmo logótipo Renew (mesmo ficheiro) no cabeçalho, com link para o início, e no rodapé
  const headerLogo = visitor.getByRole('link', { name: 'V25 — O Legado, página inicial' }).getByRole('img');
  const footerLogo = visitor.locator('footer').getByAltText('Renew — Criando momentos épicos para si');
  const srcs = [await headerLogo.getAttribute('src'), await footerLogo.getAttribute('src')];
  if (!srcs[0] || srcs[0] !== srcs[1]) throw new Error('Logótipo do cabeçalho diferente do rodapé: ' + srcs.join(' / '));
  await visitor.waitForTimeout(1200);
  await shot(visitor, '01-landing-desktop');
  await scrollThrough(visitor);
  await visitor.screenshot({ path: path.join(SHOTS, '01b-landing-desktop-completa.png'), fullPage: true });
  step('Landing White Premium: textos oficiais do CMS, Normal 12 500 Kz, Premium 25 000 Kz, VIP por consulta, vendas fechadas, logótipo Renew idêntico no cabeçalho e no rodapé');

  // ── Instalação: primeiro administrador ─────────────────────────────────────
  const admin = await newPage('admin');
  await admin.goto(`${BASE}/admin`);
  await admin.getByText('Criar o primeiro administrador').waitFor();
  await admin.getByLabel('Código de instalação (SETUP_TOKEN)').fill(stack.env.SETUP_TOKEN);
  await admin.getByLabel('Nome').fill('Administração V25');
  await admin.getByLabel('Email').fill(ADMIN.email);
  await admin.getByLabel('Palavra-passe', { exact: true }).fill(ADMIN.password);
  await admin.getByLabel('Confirmar palavra-passe').fill(ADMIN.password);
  await admin.getByRole('button', { name: 'Criar administrador' }).click();
  await admin.getByRole('heading', { name: 'Dashboard' }).waitFor();
  step('Instalação: primeiro administrador criado com SETUP_TOKEN e sessão iniciada');

  // ── Gestão comercial: quantidades + abertura de vendas ─────────────────────
  await admin.getByRole('link', { name: 'Ingressos, lotes e stock' }).click();
  for (const [name, qty] of [['Normal', '100'], ['Premium', '50'], ['VIP', '10']]) {
    await admin.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
    await admin.getByLabel('Quantidade total *').fill(qty);
    await admin.getByRole('button', { name: 'Guardar' }).click();
    await admin.getByText('Ingresso guardado.').waitFor();
  }
  await admin.getByRole('button', { name: 'Editar Normal', exact: true }).click();
  await admin.getByLabel('Preço (Kz)').fill('13000');
  await admin.getByRole('button', { name: 'Guardar' }).click();
  await admin.getByText('Ingresso guardado.').waitFor();
  await admin.getByRole('button', { name: 'Editar Normal', exact: true }).click();
  await admin.getByLabel('Preço (Kz)').fill('12500');
  await admin.getByRole('button', { name: 'Guardar' }).click();
  await admin.getByText('Ingresso guardado.').waitFor();
  await admin.getByRole('button', { name: 'Histórico de preços de Normal' }).click();
  await admin.getByRole('dialog').getByText('13 000 Kz').first().waitFor();
  await admin.keyboard.press('Escape');
  await admin.getByText('Bloqueado: vendas fechadas · dados de pagamento por validar').first().waitFor();
  await admin.getByRole('switch', { name: 'Vendas fechadas' }).click();
  await admin.getByText('Vendas abertas.').waitFor();
  // Vendas abertas mas coordenadas bancárias por validar: o site continua sem botão de compra
  await visitor.reload();
  await card(visitor, 'Normal').getByText('Brevemente').waitFor();
  if (await visitor.getByRole('button', { name: /comprar bilhete/i }).count()) throw new Error('Compra disponível sem dados de pagamento validados');
  await admin.getByRole('link', { name: 'Evento e conteúdos' }).click();
  await admin.getByText('Por validar — vendas bloqueadas').waitFor();
  await admin.getByRole('button', { name: 'Confirmar dados de pagamento' }).click();
  await admin.getByRole('dialog').getByText('27 LUAS COMUNICACAO E MARKETING SU LDA').waitFor();
  await admin.getByRole('button', { name: 'Sim, são os dados oficiais' }).click();
  await admin.getByText('Dados de pagamento confirmados.').waitFor();
  await admin.getByText(/Confirmados por admin@renewangola\.online/).waitFor();
  await shot(admin, '03b-validacao-dados-pagamento');
  await admin.getByRole('link', { name: 'Ingressos, lotes e stock' }).click();
  await admin.getByText('À venda — botão “Comprar bilhete” activo').first().waitFor();
  await shot(admin, '03c-estado-de-venda');
  // Suspender e reabrir uma categoria no painel (efeito imediato no site, sem recompilar)
  admin.once('dialog', (d) => d.accept());
  await admin.getByLabel('Estado de venda de Premium').selectOption('suspensas');
  await admin.getByText('Premium: Vendas suspensas.').waitFor();
  await visitor.reload();
  await card(visitor, 'Premium').getByText('Vendas suspensas').first().waitFor();
  if (await card(visitor, 'Premium').getByRole('button', { name: /comprar bilhete/i }).count()) throw new Error('Premium suspensa com compra activa');
  admin.once('dialog', (d) => d.accept());
  await admin.getByLabel('Estado de venda de Premium').selectOption('abertas');
  await admin.getByText('Premium: Vendas abertas.').waitFor();
  step('Gestão comercial: stock Normal 100 / Premium 50 / VIP 10, histórico de preços, vendas abertas; compra só depois de validar os dados bancários; Premium suspensa e reaberta no painel (site actualizado sem recompilar)');

  // ── CMS: rascunho → pré-visualização → publicação ─────────────────────────
  const SLOGAN = 'Teste E2E — uma celebração para recordar.';
  await admin.getByRole('link', { name: 'Gestão do Website' }).click();
  await admin.getByRole('heading', { name: 'Gestão do Website' }).waitFor();
  await admin.getByLabel('Slogan').fill(SLOGAN);
  await admin.getByRole('button', { name: 'Guardar rascunho' }).click();
  await admin.getByText(/Rascunho guardado/).waitFor();
  await visitor.reload();
  await visitor.getByRole('heading', { level: 1, name: 'V25 — O LEGADO' }).waitFor();
  if (await visitor.getByText(SLOGAN).count()) throw new Error('Rascunho visível ao público');
  const preview = await admin.context().newPage();
  await preview.goto(`${BASE}/?preview=1`);
  await preview.getByText('Pré-visualização de rascunhos').waitFor();
  await preview.getByText(SLOGAN).waitFor();
  await shot(preview, '02-cms-preview');
  await preview.close();
  await admin.getByRole('button', { name: 'Publicar' }).click();
  await admin.getByRole('button', { name: 'Publicar agora' }).click();
  await admin.getByText(/Publicado\. O site público/).waitFor();
  await shot(admin, '03-cms-editor');
  await visitor.reload();
  await visitor.getByText(SLOGAN).waitFor();
  await admin.getByRole('button', { name: 'Histórico' }).click();
  await admin.getByRole('dialog').getByText('Publicado').first().waitFor();
  await admin.keyboard.press('Escape');
  await admin.getByRole('button', { name: /^Ingressos/ }).click();
  await admin.getByLabel('Texto do botão de compra').fill('Comprar bilhete');
  await admin.getByRole('button', { name: 'Publicar' }).click();
  await admin.getByRole('button', { name: 'Publicar agora' }).click();
  await admin.getByText(/Publicado\. O site público/).waitFor();
  await visitor.reload();
  await card(visitor, 'Normal').getByRole('button', { name: /comprar bilhete/i }).waitFor();
  step('CMS: slogan editado em rascunho (invisível ao público), pré-visualizado, publicado e registado no histórico; botão “Comprar bilhete” configurado no painel');

  // ── Galeria dos eventos: álbum, upload múltiplo, publicação ───────────────
  const photos = [];
  for (const [i, color] of ['#c9a45c', '#8a6527', '#f3e7cf'].entries()) {
    const f = path.join(stack.env.V25_TMP, `foto-${i}.jpg`);
    writeFileSync(f, await sharp({ create: { width: 1600, height: 1000 + i * 100, channels: 3, background: color } }).jpeg().toBuffer());
    photos.push(f);
  }
  await admin.getByRole('link', { name: 'Galeria dos Eventos' }).click();
  await admin.getByRole('button', { name: 'Novo álbum' }).click();
  await admin.getByLabel('Nome do evento / álbum').fill('Concerto de Natal 2019');
  await admin.getByLabel('Categoria').fill('Concertos');
  await admin.getByLabel('Data do evento').fill('2019-12-15');
  await admin.getByLabel('Local').fill('Luanda');
  await admin.getByRole('switch', { name: 'Publicado no site' }).click();
  await admin.getByRole('button', { name: 'Guardar' }).click();
  await admin.getByRole('heading', { name: 'Concerto de Natal 2019' }).waitFor();
  await admin.getByLabel('Ficheiros para o álbum').setInputFiles(photos);
  await admin.getByText('Itens do álbum (3)').waitFor({ timeout: 30000 });
  await shot(admin, '04-galeria-admin');
  await visitor.reload();
  await visitor.locator('#galeria').scrollIntoViewIfNeeded();
  await visitor.getByRole('button', { name: /Concerto de Natal 2019/ }).click();
  await visitor.getByRole('heading', { name: 'Concerto de Natal 2019' }).waitFor();
  await visitor.getByRole('button', { name: /Abrir fotografia/ }).first().click();
  await visitor.getByText('1 / 3').waitFor();
  await visitor.keyboard.press('ArrowRight');
  await visitor.getByText('2 / 3').waitFor();
  await shot(visitor, '05-galeria-lightbox');
  await visitor.keyboard.press('Escape');
  step('Galeria dos Eventos: álbum criado, 3 fotografias carregadas (WebP + miniaturas), publicado, aberto no site com lightbox e navegação');

  // ── Equipa ────────────────────────────────────────────────────────────────
  await admin.getByRole('link', { name: 'Utilizadores e permissões' }).click();
  for (const [u, role, name] of [[FIN, 'financeiro', 'Ana Financeira'], [OP, 'checkin', 'Operador Porta']]) {
    await admin.getByLabel('Email *').fill(u.email);
    await admin.getByLabel('Nome (aparece no registo de check-in)').fill(name);
    await admin.getByLabel('Perfil', { exact: true }).selectOption(role);
    await admin.getByLabel('Palavra-passe inicial (opcional)').fill(u.password);
    await admin.getByRole('button', { name: 'Criar' }).click();
    await admin.getByText('Utilizador criado.').waitFor();
    await admin.getByRole('cell', { name: new RegExp(u.email) }).waitFor();
  }
  step('Administrador criou utilizadores Financeiro e Operador de check-in');

  // ── Compra Normal (telemóvel): etapas 1–5 ─────────────────────────────────
  const client = await newPage('cliente', { width: 390, height: 844 });
  await client.goto(BASE + '/');
  await client.locator('#ingressos').scrollIntoViewIfNeeded();
  await shot(client, '06-ingressos-mobile');
  await card(client, 'Normal').getByRole('button', { name: /comprar bilhete/i }).click();
  const cdlg = client.getByRole('dialog');
  await cdlg.getByRole('heading', { name: '1. Seleção do bilhete' }).waitFor();
  if ((await cdlg.getByRole('radio', { name: /^Normal/ }).getAttribute('aria-checked')) !== 'true') throw new Error('Normal não pré-seleccionada');
  await cdlg.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await cdlg.getByText('25 000 Kz').first().waitFor(); // 2 × 12 500 calculado pelo servidor
  await shot(client, '07-popup-selecao-mobile');
  await cdlg.getByRole('button', { name: 'Continuar' }).click();
  await cdlg.getByLabel('Nome completo').fill('Maria da Silva');
  await cdlg.getByLabel(/^Email/).fill('maria@exemplo.ao');
  await cdlg.getByRole('textbox', { name: /Telefone/ }).fill('923 456 789');
  await cdlg.getByRole('button', { name: /Confirmar pedido e ver pagamento/ }).click();
  await cdlg.getByText('É necessário o seu consentimento para continuar.').waitFor();
  await cdlg.getByRole('button', { name: 'Voltar' }).click();
  await cdlg.getByRole('heading', { name: '1. Seleção do bilhete' }).waitFor();
  if ((await cdlg.getByLabel('Quantidade de bilhetes').inputValue()) !== '2') throw new Error('Quantidade perdida ao voltar');
  await cdlg.getByRole('button', { name: 'Continuar' }).click();
  await cdlg.getByLabel('Nome completo').fill('Maria da Silva Santos');
  await cdlg.getByRole('checkbox').check();
  await noOverflow(client, 'popup — dados');
  await shot(client, '08-popup-dados-mobile');
  await cdlg.getByRole('button', { name: /Confirmar pedido e ver pagamento/ }).click();
  const okMsg = cdlg.getByText(/^Pedido V25-[A-Z2-9]{6} registado$/);
  await okMsg.waitFor();
  const code = (await okMsg.innerText()).match(/V25-[A-Z2-9]{6}/)[0];
  await cdlg.getByText('Etapa 3 · Pagamento').waitFor();
  await cdlg.getByText(IBAN).waitFor();
  await cdlg.getByText('27 LUAS COMUNICACAO E MARKETING SU LDA').waitFor();
  await cdlg.getByText('Transfira exactamente').waitFor();
  await cdlg.getByRole('tab', { name: 'Transferência Express' }).click();
  await cdlg.getByText('920000000').waitFor();
  await noOverflow(client, 'popup — pagamento');
  await shot(client, '09-popup-pagamento-mobile');
  await cdlg.getByRole('button', { name: /Já transferi/ }).click();
  await uploadProof(client);
  await cdlg.getByText(code).first().waitFor();
  await shot(client, '10-popup-comprovativo-enviado-mobile');
  await cdlg.getByRole('link', { name: 'Acompanhar o pedido' }).click();
  if ((await orderCode(client)) !== code) throw new Error('Página do pedido diferente');
  await client.getByRole('heading', { name: 'PAGAMENTO EM ANÁLISE' }).waitFor();
  await client.getByText('Transferência Express', { exact: true }).last().waitFor();
  step(`Compra Normal ${code} pelo popup (telemóvel): categoria pré-seleccionada, 2 × 12 500 = 25 000 Kz calculado no servidor, dados +244 com consentimento, coordenadas oficiais, Express, comprovativo → Aguardando validação financeira`);

  // ── Compra Premium (desktop, transferência bancária) ──────────────────────
  const premium = await newPage('cliente-premium');
  const codePremium = await buy(premium, 'Premium', 1, { name: 'João Baptista', email: 'joao@exemplo.ao', phone: '912 345 678' });
  await premium.getByRole('dialog').getByText(IBAN).waitFor();
  await shot(premium, '11-popup-pagamento-desktop');
  await premium.getByRole('dialog').getByRole('button', { name: /Já transferi/ }).click();
  await uploadProof(premium);
  step(`Compra Premium ${codePremium}: 25 000 Kz por transferência bancária, comprovativo enviado`);

  // ── VIP: solicitação → proposta → aceitação → pedido de pagamento ─────────
  const vip = await newPage('cliente-vip');
  await vip.goto(BASE + '/');
  await card(vip, 'VIP').getByRole('button', { name: /solicitar acesso vip/i }).click();
  const dlg = vip.getByRole('dialog');
  await dlg.getByLabel('Nome completo').fill('Empresa Exemplo Lda');
  await dlg.getByLabel(/^Email/).fill('eventos@empresa.ao');
  await dlg.getByLabel('Participantes').fill('4');
  await dlg.getByRole('textbox', { name: /Telefone/ }).fill('934 000 111');
  await dlg.getByLabel(/Mensagem/).fill('Mesa para a direcção da empresa.');
  await dlg.getByRole('checkbox').check();
  await shot(vip, '10-vip-solicitacao');
  await dlg.getByRole('button', { name: 'Enviar solicitação' }).click();
  await vip.waitForURL(/\/vip\/VIP-/);
  await vip.getByText('Solicitação recebida').waitFor();
  await vip.getByText('A aguardar proposta').waitFor();
  const vipCode = (await vip.getByRole('heading', { level: 1 }).innerText()).trim();

  await admin.getByRole('link', { name: 'Gestão VIP' }).click();
  await admin.getByRole('row', { name: new RegExp(vipCode) }).getByRole('button', { name: 'Abrir' }).click();
  await admin.getByText('Mesa para a direcção da empresa.').waitFor();
  await admin.getByLabel('N.º de ingressos').fill('4');
  await admin.getByLabel('Valor total (Kz)').fill('200000');
  await admin.getByLabel('Condições individuais').fill('Mesa reservada para 4 pessoas, cocktail de boas-vindas e lugar na zona VIP.');
  await admin.getByRole('button', { name: 'Enviar proposta' }).click();
  await admin.getByText(/Proposta enviada ao cliente/).waitFor();
  await shot(admin, '11-vip-admin-proposta');

  await vip.getByRole('button', { name: 'Actualizar' }).click();
  await vip.getByText('200 000 Kz').first().waitFor();
  await vip.getByText(/Mesa reservada para 4 pessoas/).waitFor();
  await shot(vip, '12-vip-proposta-cliente');
  await vip.getByRole('button', { name: /Aceitar e avançar para pagamento/ }).click();
  await vip.getByRole('button', { name: 'Sim, aceitar' }).click();
  const codeVip = await orderCode(vip);
  await vip.getByText('200 000 Kz').first().waitFor();
  await vip.getByText(IBAN).waitFor();
  await uploadProof(vip);
  step(`VIP ${vipCode}: solicitação sem preço público → proposta de 200 000 Kz com condições → aceite pelo cliente → pedido ${codeVip} → comprovativo`);

  // ── Financeiro: aprovação manual (Normal e VIP) ───────────────────────────
  const fin = await newPage('financeiro');
  await login(fin, FIN);
  if (await fin.getByRole('link', { name: 'Utilizadores e permissões' }).count()) throw new Error('Financeiro vê gestão de utilizadores');
  if (await fin.getByRole('link', { name: 'Gestão do Website' }).count()) throw new Error('Financeiro vê o CMS');
  await fin.getByRole('link', { name: 'Validação de pagamentos' }).click();
  await fin.getByRole('row', { name: new RegExp(code) }).getByRole('button', { name: 'Abrir' }).click();
  const [popup] = await Promise.all([fin.waitForEvent('popup'), fin.getByRole('button', { name: /Ver \(link temporário\)/ }).click()]);
  await popup.waitForLoadState();
  const proofUrl = popup.url();
  const proofResp = await fin.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type') }; }, proofUrl);
  const anonResp = await visitor.evaluate(async (u) => (await fetch(u)).status, proofUrl);
  if (anonResp !== 401) throw new Error('Comprovativo acessível sem sessão: ' + anonResp);
  if (proofResp.status !== 200 || proofResp.type !== 'image/png') throw new Error('Comprovativo não abriu: ' + JSON.stringify(proofResp));
  await popup.close();
  await fin.keyboard.press('Escape');
  await approve(fin, code, 25000);
  await approve(fin, codeVip, 200000);
  await shot(fin, '13-pagamentos-financeiro');
  step('Financeiro abriu o comprovativo (privado, 401 sem sessão) e aprovou manualmente os pedidos Normal e VIP');

  // ── Cliente: ingressos, QR e PDF ──────────────────────────────────────────
  await client.reload();
  await client.getByRole('heading', { name: 'Os seus ingressos' }).waitFor();
  const qrs = client.getByRole('img', { name: /QR Code do ingresso T-/ });
  await qrs.first().waitFor();
  if ((await qrs.count()) !== 2) throw new Error('Esperados 2 ingressos individuais');
  const ticketCode = (await qrs.first().getAttribute('alt')).replace('QR Code do ingresso ', '');
  await shot(client, '14-ingressos-mobile');
  const [download] = await Promise.all([client.waitForEvent('download'), client.getByRole('button', { name: 'Descarregar PDF' }).click()]);
  const pdfPath = path.join(stack.env.V25_TMP, 'ingresso.pdf');
  await download.saveAs(pdfPath);
  await download.saveAs(path.join(SHOTS, 'ingresso.pdf'));
  const pdf = readFileSync(pdfPath);
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF inválido');
  await vip.reload();
  await vip.getByRole('img', { name: /QR Code do ingresso T-/ }).first().waitFor();
  if ((await vip.getByRole('img', { name: /QR Code do ingresso T-/ }).count()) !== 4) throw new Error('VIP: esperados 4 ingressos');
  step(`Ingressos individuais emitidos com QR assinado (2 Normal, 4 VIP); PDF descarregado (${pdf.length} bytes)`);

  // ── Check-in ──────────────────────────────────────────────────────────────
  const op = await newPage('checkin');
  await login(op, OP);
  if (await op.getByRole('link', { name: 'Inscrições e pedidos' }).count()) throw new Error('Operador vê pedidos');
  await op.getByRole('link', { name: 'Check-in' }).click();
  await op.getByLabel('Código do ingresso').fill(ticketCode);
  await op.getByRole('button', { name: 'Validar' }).click();
  await op.getByRole('status').getByText('ENTRADA VALIDADA').waitFor();
  await shot(op, '15-checkin-ok');
  await op.getByLabel('Código do ingresso').fill(ticketCode);
  await op.getByRole('button', { name: 'Validar' }).click();
  await op.getByRole('status').getByText('JÁ UTILIZADO').waitFor();
  await op.getByText(/por Operador Porta/).waitFor();
  step('Check-in: entrada validada; segunda leitura bloqueada (JÁ UTILIZADO, com hora e operador)');

  // ── Relatórios, dashboard ─────────────────────────────────────────────────
  await fin.getByRole('link', { name: 'Relatórios' }).click();
  // A página é carregada a pedido: repete a escolha se coincidir com a montagem do React
  for (let i = 0; i < 5 && !(await fin.getByText('Origem: VIP').count()); i++) {
    await fin.getByLabel('Origem').selectOption('vip');
    await fin.waitForTimeout(200);
  }
  await fin.getByText('Origem: VIP').waitFor();
  const [csv] = await Promise.all([fin.waitForEvent('download'), fin.getByRole('button', { name: 'Pedidos (CSV)' }).click()]);
  const csvPath = path.join(stack.env.V25_TMP, 'pedidos.csv');
  await csv.saveAs(csvPath);
  const csvText = readFileSync(csvPath, 'utf8');
  if (!csvText.includes(codeVip) || csvText.includes(code)) throw new Error('CSV filtrado por origem VIP incorrecto:\n' + csvText.slice(0, 600));
  const [pdfRep] = await Promise.all([fin.waitForEvent('download'), fin.getByRole('button', { name: /Relatório de vendas \(PDF\)/ }).click()]);
  if ((await pdfRep.path()) === null) throw new Error('PDF de relatório não gerado');
  await fin.getByRole('link', { name: 'Dashboard' }).click();
  await fin.getByText('Normal vendidos').waitFor();
  await fin.getByText('Receita confirmada').waitFor();
  await fin.getByText('225 000 Kz').first().waitFor();
  await shot(fin, '16-dashboard-financeiro');
  step('Relatórios: CSV filtrado por origem VIP, PDF com filtros; dashboard com vendidos por categoria e receita confirmada 225 000 Kz');

  await client.reload();
  await client.getByText('Utilizado').first().waitFor();
  step('Página do cliente mostra o ingresso como utilizado');

  // Acessibilidade e responsividade
  await visitor.goto(BASE + '/');
  await visitor.getByRole('heading', { level: 1 }).waitFor();
  const a11y = await visitor.evaluate(() => ({ imgsSemAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length, h1: document.querySelectorAll('h1').length }));
  if (a11y.imgsSemAlt || a11y.h1 !== 1) throw new Error('Acessibilidade: ' + JSON.stringify(a11y));
  await client.goto(BASE + '/');
  await client.getByRole('heading', { level: 1 }).waitFor();
  await scrollThrough(client);
  await client.screenshot({ path: path.join(SHOTS, '17-landing-mobile-completa.png'), fullPage: true });
  await visitor.reload();
  await visitor.getByRole('heading', { level: 1 }).waitFor();
  await scrollThrough(visitor);
  await visitor.screenshot({ path: path.join(SHOTS, '19-landing-desktop-vendas-abertas.png'), fullPage: true });
  const overflow = await client.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) throw new Error('Scroll horizontal no telemóvel: ' + overflow + 'px');
  await client.getByRole('button', { name: 'Abrir menu' }).click();
  await client.getByRole('link', { name: 'Galeria' }).waitFor();
  await shot(client, '18-menu-mobile');
  step('Acessibilidade básica (alt em imagens, h1 único), menu móvel e sem scroll horizontal no telemóvel');
} catch (e) {
  exitCode = 1;
  console.error('✘ FALHOU:', e.message);
} finally {
  await browser.close();
  const { phpErrors, appErrors } = await stack.stop();
  const relevant = problems.filter((p) => !/Failed to load resource.*(401|403|404|409|422)/.test(p));
  if (relevant.length) {
    console.error('Problemas detectados no browser:\n' + relevant.join('\n'));
    exitCode = 1;
  }
  if (phpErrors.length || appErrors.length) exitCode = 1;
  console.log(`\n${steps.length} etapas concluídas${exitCode ? ' — COM FALHAS' : ' — OK'}`);
  process.exit(exitCode);
}
