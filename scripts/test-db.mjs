// Testes de integração da base de dados (regras de negócio, RLS, concorrência).
// Usa TEST_DATABASE_URL se definido; caso contrário cria um cluster PostgreSQL
// temporário local (requer binários do PostgreSQL >= 15 instalados).
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const asPg = process.getuid?.() === 0; // initdb recusa correr como root
const run = (cmd, args, opts = {}) => {
  const [c, a] = asPg ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args];
  return execFileSync(c, a, { stdio: 'pipe', ...opts });
};

function findBin(name) {
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const p = path.join(base, v, 'bin', name);
      if (existsSync(p)) return p;
    }
  }
  return name;
}

let url = process.env.TEST_DATABASE_URL;
let cleanup = () => {};
if (!url) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'v25-pg-'));
  chmodSync(dir, 0o777);
  const data = path.join(dir, 'data');
  const port = 54000 + Math.floor(Math.random() * 900);
  run(findBin('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  run(findBin('pg_ctl'), ['-D', data, '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-l', path.join(dir, 'log'), '-w', 'start']);
  url = `postgresql://postgres@/postgres?host=${encodeURIComponent(dir)}&port=${port}`;
  cleanup = () => {
    try { run(findBin('pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {}
    rmSync(dir, { recursive: true, force: true });
  };
}

const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'supabase/tests/db.test.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: url },
});
cleanup();
process.exit(res.status ?? 1);
