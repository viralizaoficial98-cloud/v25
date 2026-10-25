// Ambiente de teste completo: BD MySQL/MariaDB temporária (importada do ficheiro do
// phpMyAdmin) + API PHP real em `php -S` (8 workers) + docroot opcional (dist/).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, openSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

export async function startStack({ docroot } = {}) {
  spawnSync(process.execPath, ['scripts/build-mysql-schema.mjs'], { stdio: 'inherit' });
  const conn = {
    user: process.env.TEST_MYSQL_USER || 'root',
    password: process.env.TEST_MYSQL_PASSWORD || '',
    ...(process.env.TEST_MYSQL_HOST
      ? { host: process.env.TEST_MYSQL_HOST, port: Number(process.env.TEST_MYSQL_PORT || 3306) }
      : { socketPath: process.env.TEST_MYSQL_SOCKET || '/run/mysqld/mysqld.sock' }),
  };
  const db = `v25_test_${Date.now()}`;
  const dbUser = `v25t_${randomBytes(3).toString('hex')}`;
  const dbPass = randomBytes(12).toString('hex');
  const root = await mysql.createConnection({ ...conn, multipleStatements: true });
  await root.query(`CREATE DATABASE ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  // Utilizador restrito à BD, como no cPanel
  await root.query(`CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'`);
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON ${db}.* TO '${dbUser}'@'localhost'`);
  await root.query(`USE ${db}`);
  await root.query(readFileSync('backend/app/database/v25_mysql_schema.sql', 'utf8'));

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'v25-stack-'));
  for (const d of ['storage/proofs', 'storage/logs', 'storage/sessions', 'storage/tmp', 'media']) mkdirSync(path.join(tmp, d), { recursive: true });
  const port = 18000 + Math.floor(Math.random() * 1000);
  const smtpPort = port + 1000;
  const env = {
    ...process.env,
    APP_ENV: 'testing',
    APP_URL: `http://127.0.0.1:${port}`,
    APP_KEY: randomBytes(32).toString('hex'),
    DB_HOST: 'localhost',
    DB_DATABASE: db,
    DB_USERNAME: dbUser,
    DB_PASSWORD: dbPass,
    ...(conn.socketPath ? { DB_SOCKET: conn.socketPath } : { DB_HOST: conn.host, DB_PORT: String(conn.port) }),
    STORAGE_PATH: path.join(tmp, 'storage'),
    MEDIA_PATH: path.join(tmp, 'media'),
    MEDIA_URL: '/uploads/media',
    SETUP_TOKEN: randomBytes(16).toString('hex'),
    TRUST_PROXY_HEADERS: 'true', // permite simular IPs diferentes (X-Forwarded-For)
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_ENCRYPTION: 'none',
    SMTP_USERNAME: 'teste',
    SMTP_PASSWORD: 'teste',
    SMTP_FROM_ADDRESS: 'bilhetes@renewangola.online',
    V25_APP_DIR: path.resolve('backend/app'),
    V25_DOCROOT: docroot ? path.resolve(docroot) : '',
    V25_MEDIA_DIR: path.join(tmp, 'media'),
    PHP_CLI_SERVER_WORKERS: '8',
  };
  // Registo do servidor em ficheiro: um pipe não drenado bloquearia o PHP.
  const serverLog = path.join(tmp, 'php-server.log');
  const server = spawn('php', ['-d', 'upload_max_filesize=8M', '-d', 'post_max_size=10M', '-S', `127.0.0.1:${port}`, 'backend/tests/router.php'], {
    env,
    stdio: ['ignore', 'ignore', openSync(serverLog, 'w')],
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const testEnv = {
    ...env,
    V25_BASE: `http://127.0.0.1:${port}`,
    V25_SMTP_PORT: String(smtpPort),
    V25_DB: db,
    V25_DB_USER: dbUser,
    V25_DB_PASS: dbPass,
    V25_TMP: tmp,
    V25_DB_SOCKET: conn.socketPath ?? '',
    V25_DB_HOST: conn.host ?? '',
    V25_DB_PORT: String(conn.port ?? ''),
  };

  async function stop() {
    server.kill();
    const serverErr = readFileSync(serverLog, 'utf8');
    const phpErrors = serverErr.split('\n').filter((l) => /PHP (Fatal|Warning|Notice|Deprecated)/.test(l));
    if (phpErrors.length) console.error('Avisos/erros PHP no servidor:\n' + phpErrors.join('\n'));
    let logs = '';
    try {
      logs = readFileSync(path.join(tmp, 'storage/logs', `app-${new Date().toISOString().slice(0, 7)}.log`), 'utf8');
    } catch {}
    const appErrors = logs.split('\n').filter((l) => l.includes(' ERROR '));
    if (appErrors.length) console.error('Erros registados pela aplicação:\n' + appErrors.join('\n'));
    await root.query(`DROP DATABASE ${db}`);
    await root.query(`DROP USER '${dbUser}'@'localhost'`);
    await root.end();
    rmSync(tmp, { recursive: true, force: true });
    return { phpErrors, appErrors };
  }
  return { env: testEnv, stop };
}
