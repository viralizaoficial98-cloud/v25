# Referência da API REST — `/api`

JSON (UTF-8), mesma origem do site. Datas em ISO 8601 UTC. Erros: `{"error": "CODIGO"}` com
código HTTP adequado (mensagens em português no frontend: `src/lib/errors.ts`).

**Autenticação do painel:** cookie de sessão `v25_sess` (HttpOnly) + cabeçalho `X-CSRF-Token`
em todos os pedidos que alteram dados (token obtido em `GET /api/auth/session`).
**Acesso do cliente a um pedido:** cabeçalho `X-Order-Token: <token>`. **Solicitação VIP:** `X-Vip-Token: <token>`.

## Público

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Estado da API |
| GET | `/public/settings` | Evento, contactos, textos (**sem** dados bancários desde a v2) |
| GET | `/public/ticket-types` | Categorias publicadas: preço (`null` se `sale_mode = consulta`), `benefits`, `badge`, `stock_defined`, disponibilidade, `on_sale` |
| GET | `/public/site` | Secções publicadas do CMS (ordem, visibilidade, conteúdo) |
| GET | `/public/gallery/albums?year=&category=` | Álbuns publicados + anos e categorias para filtros |
| GET | `/public/gallery/albums/{slug}?offset=&limit=` | Álbum com fotografias/vídeos (paginação, máx. 60) |
| POST | `/public/vip` | Solicitação VIP `{full_name, email, phone, participants, message, consent, consent_version, website}` → `{request_code, access_token}` |
| GET | `/public/vip/{code}` | Estado da solicitação e proposta (cabeçalho `X-Vip-Token`) |
| POST | `/public/vip/{code}/accept` · `/decline` | Aceitar (cria o pedido de pagamento com o valor aprovado) ou recusar a proposta (token) |
| POST | `/public/orders/{code}/payment-method` | `{method: transferencia\|express}` (token) |
| GET | `/public/timeline` · `/public/members` · `/public/faqs` | Conteúdos publicados |
| GET | `/public/media?section=grupo\|memorias&offset=0&limit=12` | Galeria (paginação) |
| POST | `/public/orders` | Criar inscrição/pedido. Corpo: `ticket_type_id, quantity, guests_total, full_name, email, phone (E.164), consent:true, consent_version, idempotency_key (UUID), mode: compra\|reserva, website (honeypot)` → `201 {order_code, access_token, total_kz, status, expires_at, replayed}` |
| GET | `/public/orders/{code}` | Pedido (token) — estado, histórico, **dados de pagamento**, método, origem, comprovativos, ingressos com `qr_payload` |
| POST | `/public/orders/{code}/confirm` | Reserva → aguardando pagamento (token) |
| POST | `/public/orders/{code}/cancel` | Cancelar antes da validação (token) |
| POST | `/public/orders/{code}/proofs` | Upload multipart `file` (PDF/JPG/PNG ≤ 5 MB) + `method` opcional (token) → `comprovativo_enviado` |
| GET | `/public/orders/{code}/tickets.pdf` | PDF dos ingressos (token; só pedidos emitidos) |
| POST | `/public/access-request` | `{email}` → envia novas ligações (resposta igual exista ou não) |

## Autenticação e instalação

| Método | Rota | Descrição |
|---|---|---|
| GET | `/auth/session` | `{user, role, permissions, csrf_token, needs_setup}` |
| POST | `/auth/login` | `{email, password}` (CSRF) |
| POST | `/auth/logout` | (CSRF) |
| POST | `/auth/forgot` | `{email}` → email com ligação (1 h) |
| POST | `/auth/reset` | `{token, password}` |
| POST | `/auth/password` | `{current_password, new_password}` (sessão) |
| POST | `/setup/check` | `{setup_token}` → diagnóstico do alojamento |
| POST | `/setup/admin` | `{setup_token, full_name, email, password}` → primeiro administrador (só com base sem utilizadores) |

## Painel (sessão + permissão + CSRF)

| Método | Rota | Permissão |
|---|---|---|
| GET | `/admin/dashboard` | `dashboard.view` (receita só com `reports.view`/`payments.review`) |
| GET | `/admin/orders?status=&q=&page=&page_size=` | `orders.view` (`status=review` = comprovativos por analisar) |
| GET | `/admin/orders/{id}` | `orders.view` — pedido, comprovativos, ingressos, histórico |
| POST | `/admin/orders/{id}/review` | `payments.review` — marcar “em análise” |
| POST | `/admin/orders/{id}/approve` | `payments.review` — `{payment_reference, amount_confirmed, method: transferencia\|express, note}` (idempotente) |
| POST | `/admin/orders/{id}/reject` | `payments.review` — `{reason}` |
| POST | `/admin/orders/{id}/cancel` | `orders.cancel` — `{reason}` |
| POST | `/admin/orders/{id}/resend` | `tickets.resend` — reenviar ingressos por email |
| POST | `/admin/orders/{id}/access-link` | `tickets.resend` — nova ligação segura para o cliente |
| GET | `/admin/proofs/{id}/file` | `payments.review` — ficheiro do comprovativo (auditado) |
| POST | `/admin/checkin` | `checkin.scan` — `{input: QR ou código, commit: bool}` → `ok\|valido\|ja_utilizado\|anulado\|invalido` |
| GET/POST/PUT/DELETE | `/admin/ticket-types[/{id}]` | `ticket_types.manage` |
| GET | `/admin/settings` | `settings.manage` — configuração completa (inclui dados bancários) |
| POST | `/admin/settings/payment-confirmation` | `settings.manage` — `{confirm: true\|false}` valida (ou retira) as coordenadas bancárias actuais; sem validação não há vendas nem dados bancários para o comprador (`PAGAMENTO_POR_VALIDAR`) |
| GET | `/admin/ticket-types/{id}/price-history` | `ticket_types.manage` |
| PUT | `/admin/settings` | `settings.manage` (ou só `{sales_open}` com `ticket_types.manage`) |
| GET/POST/PUT/DELETE | `/admin/content/{timeline\|members\|faqs}[/{id}]` | `content.manage` |
| GET | `/admin/media?section=` | `content.manage` |
| POST | `/admin/media/upload` (multipart `file, section, title`) · `/admin/media/youtube` | `content.manage` |
| PUT/DELETE | `/admin/media/{id}` | `content.manage` |
| POST | `/admin/uploads/image` (multipart `file, folder: historia\|integrantes\|site`) | `content.manage` (`site`: `site.manage`) |
| GET | `/admin/emails` · `/admin/emails/status` | `emails.manage` |
| POST | `/admin/emails/process` · `/admin/emails/test {to}` · `/admin/emails/reminders` · `/admin/emails/{id}/retry` | `emails.manage` |
| GET | `/admin/reports/orders.csv` · `/admin/reports/tickets.csv` · `/admin/reports/summary` | `reports.view` |
| GET | `/admin/reports/checkins.csv` | `reports.checkins` |
| GET | `/admin/reports/orders.csv` e `/summary` aceitam `?status=&category=&source=checkout\|vip&from=AAAA-MM-DD&to=` | `reports.view` |
| GET | `/admin/reports/vip.csv` | `vip.manage` |
| GET | `/admin/site` · `/admin/site/preview` | `site.manage` |
| PUT | `/admin/site/order` `{keys}` · `/admin/site/{key}` `{data, publish}` · `/admin/site/{key}/visibility` `{enabled}` | `site.manage` |
| POST | `/admin/site/{key}/publish` · `/discard` · `/restore {revision_id}`; GET `/admin/site/{key}/revisions` | `site.manage` |
| GET/POST | `/admin/gallery/albums` · GET/PUT/DELETE `/admin/gallery/albums/{id}` | `gallery.manage` |
| POST | `/admin/gallery/albums/{id}/items` (multipart `file, caption, alt_text`) · `/videos {url, caption}`; PUT `/order {ids}` | `gallery.manage` |
| PUT/DELETE | `/admin/gallery/items/{id}`; POST `/admin/gallery/items/{id}/replace` | `gallery.manage` |
| GET | `/admin/vip?status=abertas\|todas\|…` · `/admin/vip/{id}` | `vip.manage` |
| PUT | `/admin/vip/{id}` `{admin_notes}` ou `{status: em_analise\|rejeitada\|cancelada, reason}` | `vip.manage` |
| POST | `/admin/vip/{id}/proposals` `{tickets, total_kz, conditions, valid_days}` · `/access-link` | `vip.manage` |
| GET/POST | `/admin/users` · PUT `/admin/users/{id}` · POST `/admin/users/{id}/reset` | `users.manage` |
| GET | `/admin/audit?page=` | `audit.view` |

## Perfis

| Permissão | Administrador | Financeiro | Check-in |
|---|:-:|:-:|:-:|
| dashboard.view | ✔ | ✔ | ✔ |
| orders.view, payments.review, tickets.resend, reports.view | ✔ | ✔ | |
| checkin.scan | ✔ | | ✔ |
| orders.cancel, ticket_types.manage, content.manage, settings.manage, emails.manage, users.manage, audit.view, reports.checkins | ✔ | | |
| site.manage, gallery.manage, vip.manage (v2) | ✔ | | |

Permissões editáveis na tabela `role_permissions`.
