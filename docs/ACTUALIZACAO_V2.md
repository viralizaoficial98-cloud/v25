# Actualização da plataforma V25 — versão 1 → versão 2 (White Premium, CMS, Galeria, VIP)

Este guia actualiza a instalação **já existente** em `renewangola.online` (base `renewangola_v25`
com 25 tabelas e o primeiro administrador). **Não é uma instalação nova.**

## O que NUNCA fazer

- Não importar `v25_mysql_schema.sql` (apagaria/duplicaria a base instalada). Só a migração **003**.
- Não substituir nem editar `v25_app/.env` — em especial `APP_KEY` (assina os QR dos ingressos já emitidos),
  credenciais MySQL e SMTP.
- Não apagar nem substituir `v25_app/storage/` (comprovativos, sessões, logs) nem `public_html/uploads/media/`.
- Não substituir `public_html/api/.user.ini` nem as configurações PHP do cPanel; não mexer nos certificados SSL.
- Não publicar directamente em produção sem passar pelo ensaio em staging (secção 2).

## 0. O que muda

| Área | Alteração |
|---|---|
| Base de dados | Migração `003_v2_checkout_vip_cms_gallery` (aditiva): CMS, galeria de eventos, VIP, histórico de preços, método de pagamento/origem nos pedidos, novas permissões |
| Categorias | Normal 12 500 Kz, Premium 25 000 Kz, VIP por consulta — **só são criadas se ainda não existir uma categoria com o mesmo nome**. Categorias já existentes não são alteradas |
| Stock | Normal/Premium/VIP novos ficam com quantidade **0** (“Disponibilidade a anunciar”) até o administrador definir as quantidades |
| Dados bancários | Deixam de estar na API pública; só aparecem na etapa de pagamento de cada pedido |
| Ficheiros | Novo frontend (public_html) e nova versão da aplicação privada (v25_app) |

## 1. Preparar os pacotes (no computador de desenvolvimento)

```bash
git fetch origin claude/blissful-pascal-awfcho
git checkout claude/blissful-pascal-awfcho
git pull origin claude/blissful-pascal-awfcho
npm ci
npm test && npm run test:api && npm run test:upgrade && npm run test:e2e   # tudo tem de passar
npm run build:deploy
```

Em `deploy/actualizacao-v2/` ficam:

| Ficheiro | Para quê |
|---|---|
| `v25-actualizacao-v2-public_html.zip` | Site + `api/index.php` (sem `.htaccess` principal, sem `api/.user.ini`, sem `uploads/`) |
| `v25-actualizacao-v2-v25_app.zip` | Aplicação privada (sem `.env`, sem `storage/`) |
| `003_actualizacao_v2_phpmyadmin.sql` | Migração 003 para phpMyAdmin (só se não usar `bin/migrate.php`) |
| `003_rollback.sql` | Reverte apenas a 003 |
| `htaccess-principal-v2.txt` | `.htaccess` principal da v2 (para comparar com o vosso) |

## 2. Ensaio em staging (obrigatório)

1. No cPanel → **Subdomínios**, criar `staging.renewangola.online` (pasta, por ex. `/home/renewangola/staging_html`).
2. **Bases de dados MySQL**: criar `renewangola_v25stg` e dar ao utilizador MySQL os mesmos privilégios.
3. phpMyAdmin → `renewangola_v25` → **Exportar** (SQL) → importar esse ficheiro em `renewangola_v25stg`
   (é uma cópia da produção; o staging trabalha sobre dados reais sem os alterar).
4. Copiar `/home/renewangola/v25_app` para `/home/renewangola/v25_app_staging` **incluindo** o `.env`; no `.env` do
   staging alterar só `DB_DATABASE=renewangola_v25stg`, `APP_URL=https://staging.renewangola.online`
   e, para não enviar emails reais a clientes, deixar `SMTP_HOST` vazio. **Manter o mesmo `APP_KEY`.**
5. Extrair os dois zips de actualização no staging (secção 3, passos 3–4, com as pastas do staging), copiar o
   `.htaccess` principal e `api/.user.ini` da produção para o staging e acrescentar ao `staging_html/api/.htaccess`
   a linha `SetEnv V25_APP_DIR /home/renewangola/v25_app_staging` (a API do staging passa a usar a cópia privada).
6. Aplicar a migração no staging (secção 3, passo 5) e testar a lista de verificação da secção 4.
7. Só depois de tudo OK, repetir na produção.

## 3. Actualização da produção

1. **Janela de manutenção**: escolher um horário com pouco tráfego (as vendas podem continuar abertas; a actualização demora poucos minutos).
2. **Backup completo (antes de qualquer alteração)**
   - cPanel → **Cópia de segurança** → “Transferir uma cópia de segurança da base de dados MySQL” → `renewangola_v25`.
   - Gestor de Ficheiros → comprimir `/home/renewangola/v25_app` (inclui `.env` e `storage/`) e `/home/renewangola/public_html`
     → transferir os dois `.zip` para o computador.
   - Ou, no Terminal do cPanel:
     ```bash
     cd ~ && STAMP=$(date +%Y%m%d-%H%M)
     mysqldump --single-transaction --routines renewangola_v25 > backup-v25-$STAMP.sql
     tar czf backup-v25_app-$STAMP.tar.gz v25_app
     tar czf backup-public_html-$STAMP.tar.gz public_html
     ```
3. **Aplicação privada**: carregar `v25-actualizacao-v2-v25_app.zip` para `/home/renewangola/v25_app` e **Extrair**
   (substituir ficheiros quando perguntado). O zip não contém `.env` nem `storage/`, por isso estes ficam intactos.
4. **Site público**: carregar `v25-actualizacao-v2-public_html.zip` para `/home/renewangola/public_html` e **Extrair**
   (substituir). Depois apagar de `public_html/assets/` apenas os ficheiros antigos que não vieram no zip (opcional; não afectam o site).
   - `.htaccess` principal: comparar o vosso com `htaccess-principal-v2.txt`. A única alteração da v2 é na linha
     `Content-Security-Policy`: em `frame-src` passa a constar `https://www.youtube-nocookie.com https://player.vimeo.com`
     (vídeos do Vimeo na galeria). Acrescentar só isso, mantendo os vossos redireccionamentos HTTPS.
5. **Migração da base de dados (só a 003)** — escolher UMA opção:
   - **A) Terminal do cPanel (recomendado)**
     ```bash
     cd ~/v25_app
     php bin/migrate.php --status   # deve mostrar [x] 001, [x] 002 e [ ] 003
     php bin/migrate.php            # "A aplicar 003_v2_checkout_vip_cms_gallery... ok"
     php bin/migrate.php --status   # agora [x] 003
     ```
   - **B) phpMyAdmin**: seleccionar `renewangola_v25` → **Importar** → `003_actualizacao_v2_phpmyadmin.sql`.
     Antes, confirmar no separador SQL: `SELECT * FROM schema_migrations;` tem 001 e 002 e **não** tem 003.
   - Requisito: MySQL 8.0.19+ ou MariaDB 10.4+ (verificado com MariaDB; o cPanel indica a versão em “Bases de dados MySQL”).
6. **Diagnóstico**: `php bin/check-environment.php` (Terminal) — todos os pontos a verde.
7. Abrir `https://renewangola.online` (forçar actualização: Ctrl+F5) e seguir a lista da secção 4.

## 4. Lista de verificação após actualizar

1. Site com fundo branco, Hero “V25 — O LEGADO” com a fotografia oficial, logótipo Renew no rodapé.
2. `/admin` → entrar com o administrador existente → aparecem **Gestão do Website**, **Galeria dos Eventos** e **Gestão VIP**.
3. **Ingressos, lotes e stock**: definir a quantidade de Normal, Premium e VIP (e confirmar preços).
   Se já existia uma categoria “Normal” com outro preço, editar o preço para 12 500 Kz (fica registado no histórico de preços;
   os pedidos antigos mantêm o preço da altura).
4. Pedidos e ingressos antigos continuam visíveis em **Inscrições e pedidos**; um QR antigo continua válido no **Check-in**
   (usar o botão “Validar” sem confirmar entrada, se existir, ou só ler e verificar a mensagem).
5. Uma compra de teste completa (Normal, 1 ingresso) até “PAGAMENTO EM ANÁLISE”; depois cancelar esse pedido no painel.
6. **Gestão do Website**: alterar um texto, “Guardar rascunho”, “Pré-visualizar rascunhos”, “Publicar”.
7. `https://renewangola.online/api/public/settings` **não** mostra IBAN nem número de conta.
8. `https://renewangola.online/api/.user.ini` devolve 403/404 (o `.env` está fora de `public_html` e não é acessível).

## 5. Rollback (se algo correr mal)

**Só ficheiros** (a migração 003 é compatível com a v1, que ignora as tabelas novas):
restaurar os zips de `v25_app` e `public_html` do backup — `.env` e `storage/` vêm no mesmo backup.

**Ficheiros + base de dados**:
- Opção 1 (sem perder vendas feitas depois da actualização): restaurar os ficheiros v1 e executar `003_rollback.sql`
  no phpMyAdmin. Remove apenas o que a 003 acrescentou (CMS, galeria, VIP, histórico de preços, novas colunas).
  Pedidos, pagamentos e ingressos ficam intactos.
- Opção 2 (voltar exactamente ao estado anterior): importar o backup `backup-v25-AAAAMMDD-HHMM.sql` numa base vazia
  e apontar o `.env` para ela, ou apagar as tabelas e reimportar. **Perde-se** tudo o que foi feito depois da actualização.

O ensaio automático `npm run test:upgrade` executa exactamente este percurso (v1 com dados → 003 → verificação
de que nada foi alterado → rollback → reaplicação) numa base temporária.
