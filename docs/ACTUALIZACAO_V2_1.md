# Actualização v2.1 — logótipo no menu e compra real de Normal/Premium

Actualização **só de ficheiros** (frontend + aplicação PHP). **Não há migração**: a 003 já está aplicada em
produção e não deve ser executada de novo. Não toca em `.env`, `APP_KEY`, utilizadores, `storage/`, `uploads/`,
`api/.user.ini`, `.htaccess` principal nem certificados.

## O que muda

| Área | Alteração |
|---|---|
| Cabeçalho | Usa o mesmo logótipo Renew do rodapé (mesmo ficheiro `images/renew-logo-*`), com link para a página inicial |
| Dados bancários | Passam a exigir **validação administrativa** (“Evento e conteúdos” → “Confirmar dados de pagamento”). Sem validação: nenhum pedido é aceite e nenhuma coordenada é mostrada. Alterar titular/banco/conta/IBAN/Express anula a validação |
| Campo “Banco” | Novo campo opcional no painel; só aparece ao comprador se for preenchido |
| Ingressos | Painel mostra o estado de venda de cada categoria e o motivo de qualquer bloqueio; o botão de compra só aparece com stock real |
| Pedido | Depois do comprovativo: estado “A aguardar confirmação de pagamento” |

**Porque é que os botões mostravam “Disponibilidade a anunciar”:** a migração 003 criou Normal e Premium com
quantidade 0. O desbloqueio faz-se no painel (secção 4), não no código nem na base de dados.

## 1. Gerar os pacotes (computador de desenvolvimento)

```bash
git fetch origin claude/blissful-pascal-awfcho && git checkout claude/blissful-pascal-awfcho && git pull
npm ci
npm run typecheck && npm test && npm run test:api && npm run test:e2e
npm run build:deploy
# usar: deploy/actualizacao-v2/v25-actualizacao-v2-public_html.zip e v25-actualizacao-v2-v25_app.zip
```

## 2. Backup na VPS (SSH como utilizador `renewangola`, ou Terminal do cPanel)

```bash
cd ~ && STAMP=$(date +%Y%m%d-%H%M)
mysqldump --single-transaction --routines renewangola_v25 > backup-v25-$STAMP.sql
tar czf backup-v25_app-$STAMP.tar.gz v25_app
tar czf backup-public_html-$STAMP.tar.gz public_html
ls -lh backup-*-$STAMP*
```

(No WHM, como root, o equivalente é `su - renewangola` antes dos comandos.)

## 3. Publicar os ficheiros

Copiar os dois zips para a VPS (Gestor de Ficheiros do cPanel ou `scp`):

```bash
scp deploy/actualizacao-v2/v25-actualizacao-v2-*.zip renewangola@renewangola.online:~/
```

Na VPS:

```bash
cd ~/v25_app && unzip -o ~/v25-actualizacao-v2-v25_app.zip          # não contém .env nem storage/
cd ~/public_html && unzip -o ~/v25-actualizacao-v2-public_html.zip   # não contém .htaccess, api/.user.ini nem uploads/
cd ~/v25_app && php bin/migrate.php --status                          # deve mostrar [x] 001, 002 e 003 — NÃO há nada a aplicar
php bin/check-environment.php
find ~/v25_app ~/public_html -type d -exec chmod 755 {} + ; find ~/v25_app ~/public_html -type f -exec chmod 644 {} +
chmod 600 ~/v25_app/.env
```

Se `migrate.php --status` mostrar `[ ] 003`, **parar** e contactar o suporte técnico (a base não está no estado esperado).

## 4. Activar a venda no painel (`https://renewangola.online/admin`)

1. **Evento e conteúdos → Pagamento**: conferir titular, banco (opcional), conta, IBAN e número Express com o
   documento oficial do banco. Se o número Express não estiver confirmado, apagar o campo (deixa de ser oferecido). **Guardar**.
2. **Validação dos dados de pagamento → Confirmar dados de pagamento → “Sim, são os dados oficiais”** (fica na auditoria).
3. **Ingressos, lotes e stock**: editar Normal e Premium → **Quantidade total** (a lotação real autorizada pela organização),
   confirmar preço (12 500 Kz / 25 000 Kz), limites e datas. Editar VIP → quantidade de lugares VIP disponíveis.
4. Ligar **Vendas abertas**. O painel “Estado de venda no site” deve mostrar “À venda” em Normal e Premium;
   caso contrário indica o motivo (sem quantidade, vendas fechadas, dados por validar, fora do período…).
5. **Gestão do Website → Ingressos → Texto do botão de compra**: `Comprar bilhete` → **Publicar**.

## 5. Verificação (sem criar pedidos reais)

- Site (Ctrl+F5): logótipo Renew no menu e no rodapé, link para o início; Normal 12 500 Kz e Premium 25 000 Kz com
  “COMPRAR BILHETE”; VIP “Por consulta” com “SOLICITAR ACESSO VIP”.
- Clicar “COMPRAR BILHETE” abre o checkout com a categoria seleccionada (pode avançar até ao **Resumo** sem confirmar;
  só o botão “Confirmar e avançar para pagamento” cria o pedido).
- `https://renewangola.online/api/public/settings` → contém `"payment_ready":true` e **não** contém IBAN/conta.
- Para um teste completo em produção, criar um pedido de 1 bilhete com um email da organização, verificar dados
  bancários e estado, e depois **cancelá-lo** em “Inscrições e pedidos” (o stock é libertado).

## 6. Rollback

```bash
cd ~ && rm -rf v25_app.v21 public_html.v21 && mv v25_app v25_app.v21 && mv public_html public_html.v21
tar xzf backup-v25_app-AAAAMMDD-HHMM.tar.gz && tar xzf backup-public_html-AAAAMMDD-HHMM.tar.gz
```

A base de dados não precisa de rollback (não houve migração; a validação dos dados de pagamento é só uma linha em
`settings`, ignorada pela versão anterior).
