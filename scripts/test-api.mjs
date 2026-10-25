// Testes de integração da API PHP + MySQL/MariaDB reais (ver scripts/lib/stack.mjs).
// Requisitos: php >= 8.1 com pdo_mysql e um servidor MySQL/MariaDB local.
// Ligação de administração: TEST_MYSQL_SOCKET (omissão /run/mysqld/mysqld.sock) ou
// TEST_MYSQL_HOST/PORT, TEST_MYSQL_USER (root), TEST_MYSQL_PASSWORD.
import { spawnSync } from 'node:child_process';
import { startStack } from './lib/stack.mjs';

const stack = await startStack();
const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'backend/tests/api.test.mjs'], { stdio: 'inherit', env: stack.env });
const { phpErrors } = await stack.stop();
process.exit(res.status === 0 && !phpErrors.length ? 0 : 1);
