// Gera backend/app/database/v25_mysql_schema.sql (importação única no phpMyAdmin)
// a partir das migrações versionadas, marcando-as como aplicadas.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = 'backend/app/database/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const header = `-- =============================================================================
-- V25 — O LEGADO · INSTALAÇÃO COMPLETA (MySQL 8.0+ / MariaDB 10.4+)
-- Importar no phpMyAdmin (cPanel) com a base de dados renewangola_v25 seleccionada.
-- Ficheiro GERADO por scripts/build-mysql-schema.mjs a partir de database/migrations/.
-- Não editar à mão. Para actualizações futuras use as migrações (bin/migrate.php)
-- ou importe apenas os ficheiros de migração novos.
-- Migrações incluídas: ${files.join(', ')}
-- =============================================================================

`;
const body = files.map((f) => `-- >>> ${f}\n${readFileSync(`${dir}/${f}`, 'utf8').trim()}\n`).join('\n');
const mark = `\n-- Registo das migrações incluídas\nINSERT INTO schema_migrations (version) VALUES ${files.map((f) => `('${f.replace(/\.sql$/, '')}')`).join(', ')};\n`;
writeFileSync('backend/app/database/v25_mysql_schema.sql', header + body + mark);
console.log(`v25_mysql_schema.sql gerado (${files.length} migrações).`);
