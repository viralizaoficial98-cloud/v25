// Ensaio de actualização da base de dados em produção (v1 → v2), sem tocar na produção:
// 1) cria uma BD temporária igual à instalada (001 + 002, como o v25_mysql_schema.sql antigo)
// 2) insere dados representativos (administrador, categorias, pedido emitido, pagamento, ingresso)
// 3) aplica APENAS as migrações pendentes com bin/migrate.php (a 003)
// 4) verifica que os dados existentes ficaram intactos e que a 003 não duplicou nada
// 5) testa o rollback (003_down.sql) e a reaplicação
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const conn = {
  user: process.env.TEST_MYSQL_USER || 'root',
  password: process.env.TEST_MYSQL_PASSWORD || '',
  ...(process.env.TEST_MYSQL_HOST
    ? { host: process.env.TEST_MYSQL_HOST, port: Number(process.env.TEST_MYSQL_PORT || 3306) }
    : { socketPath: process.env.TEST_MYSQL_SOCKET || '/run/mysqld/mysqld.sock' }),
};
const db = `v25_upgrade_${Date.now()}`;
const user = `v25u_${randomBytes(3).toString('hex')}`;
const pass = randomBytes(12).toString('hex');
const root = await mysql.createConnection({ ...conn, multipleStatements: true });
const ok = (s) => console.log('✔', s);

function migrate(...args) {
  const r = spawnSync('php', ['backend/app/bin/migrate.php', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, APP_ENV: 'testing', APP_KEY: randomBytes(32).toString('hex'), DB_DATABASE: db, DB_USERNAME: user, DB_PASSWORD: pass,
      ...(conn.socketPath ? { DB_HOST: 'localhost', DB_SOCKET: conn.socketPath } : { DB_HOST: conn.host, DB_PORT: String(conn.port) }),
    },
  });
  if (r.status !== 0) throw new Error(`migrate.php falhou:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

let failed = false;
try {
  await root.query(`CREATE DATABASE ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  // Mesmos privilégios que o utilizador MySQL do cPanel
  await root.query(`CREATE USER '${user}'@'localhost' IDENTIFIED BY '${pass}'`);
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON ${db}.* TO '${user}'@'localhost'`);
  await root.query(`USE ${db}`);
  for (const f of ['001_initial_schema', '002_seed_official_data']) await root.query(readFileSync(`backend/app/database/migrations/${f}.sql`, 'utf8'));
  await root.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
  await root.query(`INSERT INTO schema_migrations (version) VALUES ('001_initial_schema'), ('002_seed_official_data')`);

  // ── Dados como os de produção ───────────────────────────────────────────
  const adminId = randomUUID(), normalId = randomUUID(), familyId = randomUUID(), regId = randomUUID(), orderId = randomUUID();
  await root.query(`INSERT INTO users (id, email, full_name, password_hash, role_id) VALUES (?, 'viralizahost@gmail.com', 'Admin', '$2y$12$abcdefghijklmnopqrstuuJ8m0x2bq3VnB1QpY5u7cH1z9yJ8m0x2b', 'admin')`, [adminId]);
  await root.query(`INSERT INTO ticket_categories (id, event_id, name, description, price_kz, quantity_total, quantity_sold, published, sort_order) VALUES
    (?, 1, 'Normal', 'Categoria criada antes da actualização', 15000, 100, 2, 1, 1), (?, 1, 'Bilhete Família', '', NULL, 0, 0, 0, 5)`, [normalId, familyId]);
  await root.query(`INSERT INTO registrations (id, event_id, full_name, email, phone, consent_at, consent_version) VALUES (?, 1, 'Maria Silva', 'maria@exemplo.ao', '+244923456789', UTC_TIMESTAMP(), 'v1')`, [regId]);
  await root.query(`INSERT INTO orders (id, event_id, registration_id, order_code, status, total_kz, guests_total, idempotency_key) VALUES (?, 1, ?, 'V25-ABC234', 'emitido', 30000, 2, ?)`, [orderId, regId, randomUUID()]);
  await root.query(`INSERT INTO order_items (order_id, category_id, quantity, unit_price_kz, line_total_kz) VALUES (?, ?, 2, 15000, 30000)`, [orderId, normalId]);
  await root.query(`INSERT INTO payments (id, order_id, reference, reference_norm, amount_kz, confirmed_by, confirmed_at) VALUES (?, ?, 'TRX-1', 'TRX1', 30000, ?, UTC_TIMESTAMP())`, [randomUUID(), orderId, adminId]);
  for (const seq of [1, 2]) await root.query(`INSERT INTO tickets (id, order_id, category_id, ticket_code, seq, holder_name) VALUES (?, ?, ?, ?, ?, 'Maria Silva')`, [randomUUID(), orderId, normalId, `T-ABC23${seq}`, seq]);
  await root.query(`UPDATE settings SET setting_value = JSON_QUOTE('AO06 PRODUCAO') WHERE setting_key = 'bank_iban'`);

  const TABLES = ['users', 'registrations', 'orders', 'order_items', 'payments', 'tickets', 'settings', 'events', 'faqs', 'role_permissions'];
  const snapshot = async () => {
    const out = {};
    for (const t of TABLES) {
      const [cols] = await root.query(`SHOW COLUMNS FROM ${t}`);
      out[t] = cols.map((c) => c.Field);
    }
    return out;
  };
  const before = await snapshot();
  const dump = async (cols) => {
    const out = {};
    for (const t of TABLES) {
      const list = cols[t].map((c) => `\`${c}\``).join(', ');
      const [rows] = await root.query(`SELECT ${list} FROM ${t} ORDER BY 1`);
      out[t] = JSON.stringify(rows);
    }
    const [cats] = await root.query('SELECT id, name, description, price_kz, quantity_total, quantity_sold, published FROM ticket_categories WHERE id IN (?, ?) ORDER BY name', [normalId, familyId]);
    out.categories = JSON.stringify(cats);
    return out;
  };
  const data0 = await dump(before);
  ok('BD v1 criada (001 + 002) com administrador, categorias, pedido emitido, pagamento e 2 ingressos');

  // ── Migração ─────────────────────────────────────────────────────────────
  const out = migrate();
  assert.match(out, /A aplicar 003_v2_checkout_vip_cms_gallery\.\.\. ok/);
  assert.doesNotMatch(out, /001_initial_schema|002_seed/, 'reaplicou migrações antigas');
  ok('bin/migrate.php aplicou apenas a 003');

  const data1 = await dump(before);
  for (const k of Object.keys(data0)) {
    if (k === 'role_permissions') {
      // A 003 só acrescenta permissões: todas as anteriores mantêm-se
      const now = new Set(JSON.parse(data1[k]).map((r) => `${r.role_id}:${r.permission_id}`));
      for (const r of JSON.parse(data0[k])) assert.ok(now.has(`${r.role_id}:${r.permission_id}`), `permissão removida: ${r.role_id}:${r.permission_id}`);
    } else assert.equal(data1[k], data0[k], `dados alterados em ${k}`);
  }
  ok('Todos os dados existentes ficaram intactos (utilizadores, pedidos, pagamentos, ingressos, configurações, FAQ, permissões)');

  const [cats] = await root.query('SELECT name, sale_mode, price_kz, published FROM ticket_categories ORDER BY sort_order, name');
  const names = cats.map((c) => c.name);
  assert.equal(names.filter((n) => n === 'Normal').length, 1, 'Normal duplicada');
  assert.ok(names.includes('Premium') && names.includes('VIP') && names.includes('Bilhete Família'));
  assert.equal(Number(cats.find((c) => c.name === 'Normal').price_kz), 15000, 'preço existente foi alterado');
  assert.equal(cats.find((c) => c.name === 'VIP').sale_mode, 'consulta');
  ok(`Categorias: “Normal” existente preservada (15 000 Kz, não duplicada); acrescentadas ${names.filter((n) => ['Premium', 'VIP'].includes(n)).join(' e ')}`);

  const [[o]] = await root.query("SELECT source, payment_method, expired_at FROM orders WHERE order_code = 'V25-ABC234'");
  assert.deepEqual({ ...o }, { source: 'checkout', payment_method: null, expired_at: null });
  const [[sec]] = await root.query('SELECT COUNT(*) n FROM site_sections');
  assert.equal(Number(sec.n), 12);
  const [perms] = await root.query("SELECT permission_id FROM role_permissions WHERE role_id = 'admin' AND permission_id IN ('site.manage','gallery.manage','vip.manage')");
  assert.equal(perms.length, 3);
  ok('Novas colunas com valores por omissão, 12 secções do CMS e permissões site/galeria/VIP para o administrador');

  assert.match(migrate(), /Nenhuma migração pendente/);
  ok('Segunda execução: nenhuma migração pendente (idempotente)');

  // ── Rollback e reaplicação ───────────────────────────────────────────────
  await root.query(readFileSync('backend/app/database/rollback/003_down.sql', 'utf8'));
  const [left] = await root.query("SHOW TABLES LIKE 'site_%'");
  assert.equal(left.length, 0);
  const data2 = await dump(before);
  assert.equal(data2.orders, data0.orders);
  assert.equal(data2.tickets, data0.tickets);
  assert.equal(data2.payments, data0.payments);
  ok('Rollback 003_down.sql: tabelas v2 removidas, pedidos/pagamentos/ingressos preservados');
  assert.match(migrate(), /003_v2_checkout_vip_cms_gallery\.\.\. ok/);
  ok('Reaplicação da 003 depois do rollback: ok');
} catch (e) {
  failed = true;
  console.error('✘ FALHOU:', e.message);
} finally {
  await root.query(`DROP DATABASE IF EXISTS ${db}`);
  await root.query(`DROP USER IF EXISTS '${user}'@'localhost'`);
  await root.end();
}
process.exit(failed ? 1 : 0);
