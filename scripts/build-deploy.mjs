// Gera os pacotes de instalação para o cPanel (Renew Angola):
//   deploy/public_html/  → conteúdo para /home/renewangola/public_html
//   deploy/v25_app/      → pasta PRIVADA /home/renewangola/v25_app (fora da pasta pública)
//   deploy/*.zip         → os mesmos conteúdos comprimidos (carregar e "Extrair" no Gestor de Ficheiros)
// Requer: node, composer (para as bibliotecas PHP), zip.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`Falhou: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
};

rmSync('deploy', { recursive: true, force: true });
mkdirSync('deploy/public_html', { recursive: true });

// 1) Frontend
run('node', ['scripts/build-mysql-schema.mjs']);
run('npx', ['tsc', '-b']);
run('npx', ['vite', 'build']);
cpSync('dist', 'deploy/public_html', { recursive: true });

// 2) Pontos de entrada públicos da API e pasta de uploads (sem código da aplicação)
cpSync('backend/public/api', 'deploy/public_html/api', { recursive: true });
cpSync('backend/public/uploads', 'deploy/public_html/uploads', { recursive: true });
mkdirSync('deploy/public_html/uploads/media', { recursive: true });

// 3) Aplicação privada (código, migrações, bibliotecas, armazenamento)
const app = 'deploy/v25_app';
for (const p of ['bootstrap.php', 'routes.php', 'composer.json', 'composer.lock', '.env.example', '.htaccess', 'src', 'bin', 'database']) {
  cpSync(`backend/app/${p}`, `${app}/${p}`, { recursive: true });
}
for (const d of ['proofs', 'logs', 'sessions', 'tmp']) {
  mkdirSync(`${app}/storage/${d}`, { recursive: true });
  writeFileSync(`${app}/storage/${d}/.gitkeep`, '');
}
cpSync('backend/app/storage/.htaccess', `${app}/storage/.htaccess`);
run('composer', ['install', '--no-dev', '--prefer-dist', '--optimize-autoloader', '--no-interaction', '--no-progress', '--working-dir', app], {
  env: { ...process.env, COMPOSER_ALLOW_SUPERUSER: '1' },
});
if (!existsSync(`${app}/vendor/autoload.php`)) process.exit(1);
// Remove histórico Git, exemplos e testes das bibliotecas (não são necessários em produção)
for (const pkg of ['phpmailer/phpmailer', 'chillerlan/php-qrcode', 'chillerlan/php-settings-container', 'setasign/fpdf']) {
  for (const junk of ['.git', '.github', 'examples', 'tests', 'test', 'docs', 'tutorial', 'doc']) {
    rmSync(`${app}/vendor/${pkg}/${junk}`, { recursive: true, force: true });
  }
}

// 4) Instalação de referência na raiz do pacote
cpSync('backend/app/database/v25_mysql_schema.sql', 'deploy/v25_mysql_schema.sql');
cpSync('docs/INSTALACAO_CPANEL.md', 'deploy/LEIA-ME_INSTALACAO.md');

// 5) Zips (instalação nova)
run('zip', ['-qr', '../v25-public_html.zip', '.'], { cwd: 'deploy/public_html' });
run('zip', ['-qr', '../v25_app.zip', '.'], { cwd: app });

// 6) Pacote de ACTUALIZAÇÃO de uma instalação existente (v1 → v2).
//    Nunca inclui: .env, storage/ (comprovativos, sessões, logs), uploads/media, api/.user.ini
//    nem o .htaccess principal (podem ter configurações próprias do servidor).
const up = 'deploy/actualizacao-v2';
mkdirSync(`${up}/public_html`, { recursive: true });
cpSync('deploy/public_html', `${up}/public_html`, {
  recursive: true,
  filter: (src) => !/public_html[\\/](\.htaccess|api[\\/]\.user\.ini|uploads)$/.test(src) && !/[\\/]uploads[\\/]/.test(src),
});
mkdirSync(`${up}/v25_app`, { recursive: true });
cpSync(app, `${up}/v25_app`, { recursive: true, filter: (src) => !/v25_app[\\/](storage|\.env)$/.test(src) });
// Migração 003 para importar no phpMyAdmin (só se não for possível usar bin/migrate.php)
writeFileSync(
  `${up}/003_actualizacao_v2_phpmyadmin.sql`,
  readFileSync('backend/app/database/migrations/003_v2_checkout_vip_cms_gallery.sql', 'utf8') +
    "\n-- Regista a migração (evita que bin/migrate.php a volte a aplicar)\nINSERT INTO schema_migrations (version) VALUES ('003_v2_checkout_vip_cms_gallery');\n",
);
cpSync('backend/app/database/rollback/003_down.sql', `${up}/003_rollback.sql`);
// v2.2: migração 004 (estado de venda por categoria) — a única a aplicar numa base com 001–003
writeFileSync(
  `${up}/004_actualizacao_v2_2_phpmyadmin.sql`,
  readFileSync('backend/app/database/migrations/004_v2_2_estado_vendas_categoria.sql', 'utf8') +
    "\n-- Regista a migração (evita que bin/migrate.php a volte a aplicar)\nINSERT INTO schema_migrations (version) VALUES ('004_v2_2_estado_vendas_categoria');\n",
);
cpSync('backend/app/database/rollback/004_down.sql', `${up}/004_rollback.sql`);
cpSync('docs/ACTUALIZACAO_V2_2.md', `${up}/LEIA-ME_ACTUALIZACAO_V2_2.md`);
cpSync('public/.htaccess', `${up}/htaccess-principal-v2.txt`);
cpSync('docs/ACTUALIZACAO_V2.md', `${up}/LEIA-ME_ACTUALIZACAO.md`);
run('zip', ['-qr', '../v25-actualizacao-v2-public_html.zip', '.'], { cwd: `${up}/public_html` });
run('zip', ['-qr', '../v25-actualizacao-v2-v25_app.zip', '.'], { cwd: `${up}/v25_app` });
console.log('\nPacotes prontos em deploy/: instalação nova (v25-public_html.zip, v25_app.zip, v25_mysql_schema.sql)');
console.log('e actualização v1 → v2 em deploy/actualizacao-v2/ (ver LEIA-ME_ACTUALIZACAO.md)');
