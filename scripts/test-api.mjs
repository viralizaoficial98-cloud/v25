// Testes de integração da API PHP + MySQL/MariaDB reais (ver scripts/lib/stack.mjs).
// Cada ficheiro corre numa base de dados nova, importada do ficheiro de instalação.
// Requisitos: php >= 8.1 com pdo_mysql e um servidor MySQL/MariaDB local.
// Ligação de administração: TEST_MYSQL_SOCKET (omissão /run/mysqld/mysqld.sock) ou
// TEST_MYSQL_HOST/PORT, TEST_MYSQL_USER (root), TEST_MYSQL_PASSWORD.
import { spawnSync } from 'node:child_process';
import { startStack } from './lib/stack.mjs';

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['backend/tests/api.test.mjs', 'backend/tests/api-v2.test.mjs'];
let ok = true;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const stack = await startStack();
  const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', file], { stdio: 'inherit', env: stack.env });
  const { phpErrors } = await stack.stop();
  ok &&= res.status === 0 && !phpErrors.length;
}
process.exit(ok ? 0 : 1);
