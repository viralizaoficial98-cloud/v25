# Actualização v2.2 — Gestão Comercial de Bilhetes e Checkout Premium

Actualiza uma produção que está na **v2.1** (migrações 001, 002 e 003 aplicadas).
Traz **uma migração nova, a 004**, incremental e reversível: acrescenta só a coluna
`ticket_categories.sales_status` (`abertas` / `suspensas` / `esgotadas`), com o valor por omissão `abertas`.
Não altera preços, stock, pedidos, pagamentos, bilhetes, utilizadores nem configurações.

**Não executar novamente 001, 002 ou 003. Não substituir `.env`, `APP_KEY`, `storage/`, `uploads/`, `api/.user.ini`
nem o `.htaccess` principal.** Os pacotes de actualização não contêm nenhum destes ficheiros.

## O que muda

| Área | Alteração |
|---|---|
| Painel → Ingressos, lotes e stock | Estado de venda por categoria (Abertas / Suspensas / Esgotada), editável no formulário e com selector rápido; motivos de bloqueio por categoria |
| Site | “COMPRAR BILHETE” abre um **popup** de compra (o mesmo fluxo continua disponível em `/checkout?tipo=…`). Mensagens: “Disponibilidade a anunciar”, “Esgotado”, “Vendas suspensas”, “Vendas encerradas”, “Vendas a partir de …”, “Vendas brevemente” |
| Popup | 1 Seleção (total calculado pelo servidor) → 2 Dados do comprador → 3 Coordenadas oficiais validadas (copiar titular, IBAN, conta, Express, valor e referência) → 4 Comprovativo → “Aguardando validação financeira” |
| API | `POST /api/public/orders/quote` (cálculo prévio, não reserva stock); estado `sales_status` em `/api/public/ticket-types` |
| Comprovativos | Também se exige que a extensão corresponda ao tipo real; PDFs com JavaScript/acções de arranque/ficheiros embebidos são recusados |
| Painel financeiro | Detalhe do pedido mostra a auditoria do pedido (quem marcou em análise, aprovou/rejeitou, consultou o comprovativo) |

## 1. Gerar e validar os pacotes (computador de desenvolvimento)

```bash
git fetch origin claude/blissful-pascal-awfcho
git checkout claude/blissful-pascal-awfcho && git pull origin claude/blissful-pascal-awfcho
npm ci
npm run typecheck && npm test && npm run test:api && npm run test:upgrade && npm run test:e2e
npm run build:deploy
ls deploy/actualizacao-v2/
# v25-actualizacao-v2-public_html.zip  v25-actualizacao-v2-v25_app.zip
# 004_actualizacao_v2_2_phpmyadmin.sql  004_rollback.sql
```

## 2. Backup na VPS (SSH como `renewangola` ou Terminal do cPanel; no WHM: `su - renewangola`)

```bash
cd ~ && STAMP=$(date +%Y%m%d-%H%M)
mysqldump --single-transaction --routines renewangola_v25 > backup-v25-$STAMP.sql
tar czf backup-v25_app-$STAMP.tar.gz v25_app
tar czf backup-public_html-$STAMP.tar.gz public_html
ls -lh backup-*-$STAMP*
```

## 3. Enviar e extrair os ficheiros

```bash
# no computador de desenvolvimento
scp deploy/actualizacao-v2/v25-actualizacao-v2-*.zip deploy/actualizacao-v2/004_*.sql renewangola@renewangola.online:~/
```

```bash
# na VPS
cd ~/v25_app && unzip -o ~/v25-actualizacao-v2-v25_app.zip          # sem .env e sem storage/
cd ~/public_html && unzip -o ~/v25-actualizacao-v2-public_html.zip   # sem .htaccess, api/.user.ini e uploads/
```

## 4. Migração 004 (só esta)

```bash
cd ~/v25_app
php bin/migrate.php --status   # esperado: [x] 001, [x] 002, [x] 003, [ ] 004
php bin/migrate.php            # "A aplicar 004_v2_2_estado_vendas_categoria... ok"
php bin/migrate.php --status   # agora [x] 004
php bin/check-environment.php
```

Se `--status` mostrar 001, 002 ou 003 por aplicar, **parar**: a base não está no estado esperado.

Alternativa sem SSH: phpMyAdmin → `renewangola_v25` → separador SQL: `SELECT version FROM schema_migrations;`
(tem de listar 001, 002 e 003 e **não** a 004) → Importar `004_actualizacao_v2_2_phpmyadmin.sql`.

## 5. Permissões de ficheiros

```bash
find ~/v25_app ~/public_html -type d -exec chmod 755 {} + ; find ~/v25_app ~/public_html -type f -exec chmod 644 {} +
chmod 600 ~/v25_app/.env
```

## 6. Configuração no painel (antes de abrir vendas reais)

As vendas **não abrem sozinhas**. Todas as condições abaixo são exigidas pelo servidor:

1. **Evento e conteúdos → Validação dos dados de pagamento**: conferir titular, banco, conta, IBAN e Express com o documento
   oficial do banco (apagar o Express se não estiver confirmado) → Guardar → “Confirmar dados de pagamento”.
2. **Ingressos, lotes e stock** → editar Normal e Premium: preço (12 500 Kz / 25 000 Kz — não são alterados pela actualização),
   **Quantidade total** (lotação autorizada), máximo por pedido/cliente, datas, “Publicado no site”, estado **Abertas**.
3. VIP: publicado, modo “Por consulta”, quantidade de lugares VIP, estado Abertas.
4. Interruptor **Vendas abertas**.
5. Confirmar no painel “Estado de venda no site”: Normal e Premium “À venda”.
6. **Gestão do Website → Ingressos → Texto do botão de compra** = `Comprar bilhete` → Publicar (se ainda não estiver).

Para interromper rapidamente uma categoria: selector “Estado de venda” → **Suspensas** (ou **Esgotada**). O site muda de imediato.

## 7. Verificação sem criar pedidos reais

- Site (Ctrl+F5): “COMPRAR BILHETE” abre o popup com a categoria seleccionada; mudar a quantidade actualiza o total
  (calculado pelo servidor). Pode avançar até ao passo 2 e fechar — **só “Confirmar pedido e ver pagamento” cria o pedido**.
- `https://renewangola.online/api/public/ticket-types` → cada categoria tem `sales_status` e `on_sale`.
- `https://renewangola.online/api/public/settings` → `"payment_ready": true` e sem IBAN.
- Teste completo opcional: 1 bilhete com um email da organização → ver coordenadas → **cancelar** o pedido em “Inscrições e pedidos”.

## 8. Rollback

Ficheiros:

```bash
cd ~ && mv v25_app v25_app.v22 && mv public_html public_html.v22
tar xzf backup-v25_app-AAAAMMDD-HHMM.tar.gz && tar xzf backup-public_html-AAAAMMDD-HHMM.tar.gz
```

Base de dados (só depois de repor os ficheiros da v2.1):

```bash
mysql renewangola_v25 < ~/004_rollback.sql    # remove só a coluna sales_status e o registo da 004
```

A v2.1 também funciona com a coluna presente (ignora-a), por isso o rollback da base é opcional.
