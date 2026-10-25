// Teste ponta-a-ponta pela interface: build de produção + API PHP + MySQL/MariaDB reais.
// Percorre: instalação → ingressos → inscrição/checkout → comprovativo → aprovação →
// ingressos/QR/PDF → check-in (e reutilização) → relatórios, com 3 perfis diferentes.
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
try {
  // ── Landing page com dados da API ──────────────────────────────────────────
  const visitor = await newPage('visitante');
  await visitor.goto(BASE + '/');
  await visitor.getByRole('heading', { name: /V25/ }).first().waitFor();
  await visitor.getByText('A AGUARDAR ABERTURA DAS VENDAS').waitFor();
  await visitor.waitForTimeout(1500);
  await shot(visitor, '01-landing-desktop');
  step('Landing page carregada a partir da API (vendas fechadas: A AGUARDAR ABERTURA DAS VENDAS)');

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

  // ── Categoria de ingresso + abertura de vendas ─────────────────────────────
  await admin.getByRole('link', { name: 'Ingressos, lotes e stock' }).click();
  await admin.getByRole('button', { name: 'Nova categoria' }).click();
  await admin.getByLabel('Nome *').fill('Normal');
  await admin.getByLabel('Lote').fill('1.º Lote');
  await admin.getByLabel('Preço (Kz)').fill('15000');
  await admin.getByLabel('Quantidade total *').fill('100');
  await admin.getByRole('switch', { name: 'Publicado no site' }).click();
  await admin.getByRole('button', { name: 'Guardar' }).click();
  await admin.getByText('Ingresso guardado.').waitFor();
  await admin.getByRole('switch', { name: 'Vendas fechadas' }).click();
  await admin.getByText('Vendas abertas.').waitFor();
  step('Administrador criou categoria (15 000 Kz, 100 lugares) e abriu as vendas');

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

  // ── Cliente (telemóvel): inscrição e checkout ─────────────────────────────
  const client = await newPage('cliente', { width: 390, height: 844 });
  await client.goto(BASE + '/');
  await client.locator('#ingressos').scrollIntoViewIfNeeded();
  await client.getByText('15 000 Kz').first().waitFor();
  await shot(client, '02-ingressos-mobile');
  await client.getByRole('link', { name: 'Comprar ingresso' }).click();
  await client.getByRole('heading', { name: 'Comprar ingresso' }).waitFor();
  await client.getByLabel('Nome completo').fill('Maria da Silva');
  await client.getByLabel(/^Email/).fill('maria@exemplo.ao');
  await client.getByRole('textbox', { name: /Telefone/ }).fill('923 456 789');
  await client.getByRole('button', { name: 'Continuar para revisão' }).click();
  await client.getByText('É necessário o seu consentimento para continuar.').waitFor();
  await client.getByRole('checkbox').check();
  await client.getByRole('button', { name: 'Continuar para revisão' }).click();
  await client.getByText('+244923456789').waitFor();
  await shot(client, '03-checkout-revisao-mobile');
  await client.getByRole('button', { name: /Confirmar pedido/ }).click();
  await client.waitForURL(/\/pedido\/V25-/);
  const h1 = client.getByRole('heading', { level: 1, name: /^V25-[A-Z2-9]{6}$/ });
  await h1.waitFor();
  const code = (await h1.innerText()).trim();
  if (!/^V25-[A-Z2-9]{6}$/.test(code)) throw new Error('Código do pedido inesperado: ' + code);
  await client.getByText('AO06 0040 0000 4006 5995 1016 6').waitFor();
  await client.getByRole('button', { name: 'Copiar IBAN' }).waitFor();
  await shot(client, '04-pedido-pagamento-mobile');
  step(`Cliente criou o pedido ${code} pelo checkout (validação de consentimento, telefone +244 normalizado, dados bancários)`);

  // ── Comprovativo ──────────────────────────────────────────────────────────
  const proof = path.join(stack.env.V25_TMP, 'comprovativo.png');
  writeFileSync(proof, await sharp({ create: { width: 600, height: 400, channels: 3, background: '#ffffff' } }).png().toBuffer());
  await client.getByLabel('Ficheiro do comprovativo').setInputFiles(proof);
  await client.getByRole('button', { name: 'Enviar comprovativo' }).click();
  await client.getByRole('heading', { name: 'Comprovativo em análise' }).waitFor();
  await client.getByText('Isto ainda não confirma o pagamento').waitFor();
  step('Cliente enviou o comprovativo; pedido em análise, sem ingresso emitido');

  // ── Financeiro: análise e aprovação ───────────────────────────────────────
  const fin = await newPage('financeiro');
  await login(fin, FIN);
  if (await fin.getByRole('link', { name: 'Utilizadores e permissões' }).count()) throw new Error('Financeiro vê gestão de utilizadores');
  await fin.getByRole('link', { name: 'Validação de pagamentos' }).click();
  await fin.getByRole('cell', { name: code }).waitFor();
  await fin.getByRole('row', { name: new RegExp(code) }).getByRole('button', { name: 'Abrir' }).click();
  const [popup] = await Promise.all([fin.waitForEvent('popup'), fin.getByRole('button', { name: /Ver \(link temporário\)/ }).click()]);
  await popup.waitForLoadState();
  const proofUrl = popup.url();
  // O documento do comprovativo é servido com CSP "sandbox"; verificamos a resposta a partir da sessão do financeiro
  const proofResp = await fin.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy') }; }, proofUrl);
  const anonResp = await visitor.evaluate(async (u) => (await fetch(u)).status, proofUrl);
  if (anonResp !== 401) throw new Error('Comprovativo acessível sem sessão: ' + anonResp);
  if (proofResp.status !== 200 || proofResp.type !== 'image/png') throw new Error('Comprovativo não abriu: ' + JSON.stringify(proofResp));
  await popup.close();
  await fin.getByRole('dialog').getByText('Em análise', { exact: true }).waitFor();
  await fin.getByRole('button', { name: 'Aprovar pagamento' }).click();
  await fin.getByLabel('Referência/ID da transacção no banco *').fill('TRX-E2E-0001');
  await fin.getByLabel('Valor confirmado no extracto (Kz) *').fill('15000');
  await fin.getByRole('checkbox').check();
  await shot(fin, '05-aprovacao-financeiro');
  await fin.getByRole('button', { name: 'Aprovar e emitir ingressos' }).click();
  await fin.getByText('Pagamento aprovado e ingressos emitidos.').waitFor();
  step('Financeiro abriu o comprovativo (privado, via API) e aprovou com referência e valor conferido');

  // ── Cliente: ingresso, QR e PDF ───────────────────────────────────────────
  await client.reload();
  await client.getByRole('heading', { name: 'Os seus ingressos' }).waitFor();
  const qr = client.getByRole('img', { name: /QR Code do ingresso T-/ });
  await qr.waitFor();
  const ticketCode = (await qr.getAttribute('alt')).replace('QR Code do ingresso ', '');
  await shot(client, '06-ingresso-mobile');
  const [download] = await Promise.all([client.waitForEvent('download'), client.getByRole('button', { name: 'Descarregar PDF' }).click()]);
  const pdfPath = path.join(stack.env.V25_TMP, 'ingresso.pdf');
  await download.saveAs(pdfPath);
  await download.saveAs(path.join(SHOTS, 'ingresso.pdf'));
  const pdf = readFileSync(pdfPath);
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF inválido');
  step(`Ingresso ${ticketCode} emitido com QR Code; PDF descarregado (${pdf.length} bytes, %PDF válido)`);

  // ── Check-in ──────────────────────────────────────────────────────────────
  const op = await newPage('checkin');
  await login(op, OP);
  if (await op.getByRole('link', { name: 'Inscrições e pedidos' }).count()) throw new Error('Operador vê pedidos');
  await op.getByRole('link', { name: 'Check-in' }).click();
  await op.getByLabel('Código do ingresso').fill(ticketCode);
  await op.getByRole('button', { name: 'Validar' }).click();
  await op.getByRole('status').getByText('ENTRADA VALIDADA').waitFor();
  await shot(op, '07-checkin-ok');
  await op.getByLabel('Código do ingresso').fill(ticketCode);
  await op.getByRole('button', { name: 'Validar' }).click();
  await op.getByRole('status').getByText('JÁ UTILIZADO').waitFor();
  await op.getByText(/por Operador Porta/).waitFor();
  await shot(op, '08-checkin-reutilizacao');
  step('Operador validou a entrada; segunda leitura bloqueada (JÁ UTILIZADO, com hora e operador)');

  // ── Relatórios ────────────────────────────────────────────────────────────
  await fin.keyboard.press('Escape');
  await fin.getByRole('link', { name: 'Relatórios' }).click();
  const [csv] = await Promise.all([fin.waitForEvent('download'), fin.getByRole('button', { name: 'Pedidos (CSV)' }).click()]);
  const csvPath = path.join(stack.env.V25_TMP, 'pedidos.csv');
  await csv.saveAs(csvPath);
  const csvText = readFileSync(csvPath, 'utf8');
  if (!csvText.includes(code) || !csvText.includes('TRX-E2E-0001')) throw new Error('CSV sem o pedido');
  await fin.getByRole('link', { name: 'Dashboard' }).click();
  await fin.getByText('Receita confirmada').waitFor();
  await fin.getByText('15 000 Kz').first().waitFor();
  await shot(fin, '09-dashboard-financeiro');
  step('Financeiro exportou CSV de pedidos e viu a receita confirmada no dashboard');

  // Cliente vê o ingresso como utilizado
  await client.reload();
  await client.getByText('Utilizado').first().waitFor();
  step('Página do cliente mostra o ingresso como utilizado');

  // Acessibilidade básica: imagens com alt e um único h1 na landing
  const a11y = await visitor.evaluate(() => ({ imgsSemAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length, h1: document.querySelectorAll('h1').length }));
  if (a11y.imgsSemAlt || a11y.h1 !== 1) throw new Error('Acessibilidade: ' + JSON.stringify(a11y));
  const overflow = await client.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) throw new Error('Scroll horizontal no telemóvel: ' + overflow + 'px');
  step('Acessibilidade básica (alt em imagens, h1 único) e sem scroll horizontal no telemóvel');
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
