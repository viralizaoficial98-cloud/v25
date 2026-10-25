# Manual da base de dados — `renewangola_v25`

MySQL 8.0+ / MariaDB 10.4+ (funciona em MySQL 5.7 / MariaDB 10.2+), motor **InnoDB**,
conjunto de caracteres **utf8mb4** (`utf8mb4_unicode_ci`). Todas as datas são guardadas em
**UTC**; a API converte para a hora de Luanda (WAT, UTC+1).

## Ficheiros

| Ficheiro | Uso |
|---|---|
| `backend/app/database/v25_mysql_schema.sql` | **Instalação inicial** pelo phpMyAdmin (gerado a partir das migrações — não editar à mão) |
| `backend/app/database/migrations/001_initial_schema.sql` | Tabelas, índices, chaves, perfis e permissões |
| `backend/app/database/migrations/002_seed_official_data.sql` | Dados oficiais: evento, dados bancários, FAQ base (sem preços inventados) |
| `backend/app/bin/migrate.php` | Aplica migrações pendentes (`--status` para listar) |
| `scripts/build-mysql-schema.mjs` | Regenera o ficheiro de instalação a partir das migrações |

Não há triggers, procedimentos nem eventos: o import funciona com os privilégios normais
de um utilizador cPanel.

## Instalação

**phpMyAdmin:** seleccionar `renewangola_v25` → Importar → `v25_mysql_schema.sql` → Executar.

**Terminal (alternativa):** configurar `v25_app/.env` e correr `php bin/migrate.php`.

Os dois métodos produzem exactamente o mesmo esquema (verificado com `mysqldump --no-data`).

## Utilizador MySQL

Crie um utilizador dedicado (cPanel → Bases de dados MySQL) e dê-lhe acesso **apenas** a
`renewangola_v25`. Privilégios necessários: `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER,
INDEX, DROP, REFERENCES` (os quatro primeiros bastam em funcionamento; os restantes servem
para migrações). Credenciais apenas em `v25_app/.env`.

## Tabelas

| Tabela | Descrição | Pontos-chave |
|---|---|---|
| `roles` | Perfis: `admin`, `financeiro`, `checkin` | |
| `permissions` | Permissões granulares (`payments.review`, `checkin.scan`, …) | |
| `role_permissions` | Permissões de cada perfil | editável para ajustar perfis |
| `users` | Equipa | `email` único; `password_hash` (bcrypt/argon via `password_hash`); bloqueio `locked_until` |
| `password_resets` | Tokens de recuperação/convite | só o hash SHA-256; uso único; expiração 1 h / 72 h |
| `events` | O evento V25 (id = 1) | `starts_at` em UTC (`2026-12-20 15:00:00` = 16h00 Luanda); vendas abertas/fechadas; capacidade; prazo de reserva |
| `settings` | Configurações gerais (chave/valor) | dados bancários, Express, contactos, redes sociais, textos legais |
| `ticket_categories` | Categorias/lotes | `price_kz` DECIMAL(14,2); stock `quantity_total/reserved/sold`; `CHECK` stock e preço para publicar |
| `registrations` | Dados do participante | nome, email, telefone E.164, consentimento + versão; IP só em hash |
| `orders` | Pedidos | `order_code` único (`V25-XXXXXX`); `idempotency_key` único; estado (8 estados); prazo |
| `order_items` | Itens do pedido | categoria, quantidade, preço unitário no momento da compra |
| `order_access_tokens` | Acesso seguro do cliente | só hash SHA-256 do token |
| `payments` | Pagamentos confirmados | 1 por pedido (`UNIQUE order_id`); `reference_norm` **única** (impede reutilizar transferências); método transferência/express; quem confirmou |
| `payment_proofs` | Comprovativos | ficheiro em `storage/proofs` (privado); tipo, tamanho, SHA-256 |
| `tickets` | Ingressos | `ticket_code` único; `UNIQUE(order_id, seq)`; estado válido/utilizado/anulado; quem e quando fez check-in |
| `checkins` | Todas as tentativas de validação | inclui QR adulterados, inexistentes e reutilizações |
| `transaction_history` | Histórico de estados de cada pedido | |
| `audit_logs` | Auditoria administrativa | aprovações, rejeições, cancelamentos, preços, configurações, equipa, exportações, consulta de comprovativos |
| `timeline_entries`, `members`, `faqs` | Conteúdos do site | publicados/rascunho; ordem |
| `media_items` | Galeria (foto, vídeo, YouTube) | ficheiro em `public_html/uploads/media` |
| `email_outbox` | Fila de emails | estado, tentativas, último erro; `dedupe_key` evita duplicados |
| `rate_limits` | Limites de tentativas | limpo automaticamente |
| `schema_migrations` | Migrações aplicadas | |

### Estados do pedido

`iniciada` (reserva) → `aguardando_pagamento` → `comprovativo_enviado` → `em_analise` →
`aprovado` → `emitido`; ou `rejeitado` (pode reenviar comprovativo) / `cancelado`
(cliente, administrador ou reserva expirada).

## Consultas úteis (phpMyAdmin → SQL)

```sql
-- Vendas por categoria
SELECT name, price_kz, quantity_total, quantity_reserved, quantity_sold,
       quantity_total - quantity_reserved - quantity_sold AS disponiveis
FROM ticket_categories ORDER BY sort_order;

-- Receita confirmada
SELECT COUNT(*) AS pagamentos, SUM(amount_kz) AS total_kz FROM payments WHERE status = 'confirmado';

-- Pedidos à espera de análise
SELECT o.order_code, r.full_name, o.total_kz, o.updated_at
FROM orders o JOIN registrations r ON r.id = o.registration_id
WHERE o.status IN ('comprovativo_enviado','em_analise') ORDER BY o.updated_at;

-- Entradas por hora no dia do evento (hora de Luanda)
SELECT DATE_FORMAT(CONVERT_TZ(checked_in_at,'+00:00','+01:00'),'%H:00') hora, COUNT(*)
FROM tickets WHERE status = 'utilizado' GROUP BY hora;
```

> Faça alterações de dados pelo **painel**, não directamente na base: o painel mantém o
> stock, o histórico e a auditoria coerentes.

## Migrações futuras

1. Criar `database/migrations/003_descricao.sql` (apenas instruções aditivas/compatíveis;
   sem `DROP` de dados).
2. `npm run build:schema` para actualizar o ficheiro de instalação.
3. Em produção: backup → `php bin/migrate.php` (ou importar só o ficheiro novo no phpMyAdmin e
   registar `INSERT INTO schema_migrations (version) VALUES ('003_descricao');`).

## Backup e restauro

Ver `INSTALACAO_CPANEL.md` § 13. Backup lógico por Terminal:

```bash
mysqldump --single-transaction -u renewangola_v25u -p renewangola_v25 | gzip > v25-$(date +%F).sql.gz
```

`--single-transaction` produz uma cópia consistente sem bloquear as vendas (InnoDB).
