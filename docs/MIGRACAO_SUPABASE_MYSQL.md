# Migração Supabase → PHP + MySQL (cPanel Renew Angola)

Relatório técnico da migração da camada de dados, autenticação, armazenamento e serviços
do V25 — O Legado, de Supabase para uma API PHP com MySQL/MariaDB alojada no cPanel.

O frontend (React + TypeScript + Vite + Tailwind) e o design aprovado **não foram
reconstruídos**: mudou apenas a camada que fala com o servidor.

---

## 1. Arquitectura final

```
Navegador ──HTTPS──► Apache (cPanel) ── /home/renewangola/public_html
                       ├─ /                → React compilado (index.html, assets/, images/)
                       ├─ /api/*           → api/index.php  (apenas o ponto de entrada)
                       └─ /uploads/media/* → fotografias/vídeos da galeria (sem execução de scripts)
                                   │
                                   ▼  require (fora da pasta pública)
                     /home/renewangola/v25_app
                       ├─ .env          (credenciais MySQL/SMTP, chave da aplicação)
                       ├─ src/          (API: autenticação, serviços, e-mails, PDF, QR)
                       ├─ storage/      (comprovativos, sessões, logs — privado)
                       ├─ vendor/       (PHPMailer, php-qrcode, FPDF)
                       └─ bin/          (cron, migrações, diagnóstico, criar admin)
                                   │ PDO (prepared statements) · localhost
                                   ▼
                     MySQL/MariaDB  renewangola_v25  (InnoDB, utf8mb4)
```

- **Sem processo Node.js no servidor.** O Node só é usado para compilar o frontend (localmente/CI).
- O React **nunca** liga à base de dados: comunica apenas com `/api` (JSON, mesma origem).
- As credenciais **não** usam variáveis `VITE_` (que ficariam públicas no JavaScript).

## 2. Compatibilidade do alojamento

Não foi possível aceder ao servidor da Renew Angola a partir deste ambiente. Por isso:

1. A aplicação foi construída para requisitos mínimos comuns em cPanel e **testada** em
   PHP 8.3 + MariaDB 10.11 + **Apache 2.4 com `.htaccess`** (ver `RELATORIO_TESTES.md`).
2. Foi incluída uma **ferramenta de diagnóstico** para confirmar a compatibilidade no
   servidor real antes de abrir as vendas:
   - com Terminal: `php bin/check-environment.php`
   - sem Terminal: no ecrã de instalação do painel (`/admin`) através do `SETUP_TOKEN`
     (`POST /api/setup/check`), descrito em `INSTALACAO_CPANEL.md`.

| Requisito | Mínimo | Notas |
|---|---|---|
| PHP | 8.1 (recomendado 8.2/8.3) | `composer.json` fixa a plataforma em 8.1 |
| Extensões | pdo_mysql, mbstring, openssl, fileinfo, gd, json, ctype, iconv | padrão no cPanel; activar em *Select PHP Version* se faltar |
| MySQL / MariaDB | MySQL 5.7+ / MariaDB 10.2+ (recomendado MySQL 8 / MariaDB 10.4+) | as restrições `CHECK` só são aplicadas em MySQL ≥ 8.0.16 / MariaDB ≥ 10.2; a API valida tudo na mesma |
| Apache | 2.4 com `mod_rewrite` | `mod_headers` recomendado (CSP e cabeçalhos de segurança) |
| Limites PHP | `upload_max_filesize` ≥ 6M (comprovativos), ≥ 50M para vídeos | `api/.user.ini` define-os em PHP-FPM; com mod_php use *MultiPHP INI Editor* |
| Cron | cPanel → Cron Jobs | envio de emails e expiração de reservas |
| Privilégios MySQL | SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES | **não** são necessários TRIGGER, ROUTINE nem EVENT |

**Limitação identificada:** o valor por omissão de `upload_max_filesize` no PHP é 2 MB —
inferior aos 5 MB aceites para comprovativos. O diagnóstico assinala-o como falha
obrigatória até ser corrigido (`.user.ini` incluído ou *MultiPHP INI Editor*).

Nenhuma limitação encontrada exigiu mudar a tecnologia acordada (PHP + MySQL).

## 3. Inventário das dependências Supabase e respectivos substitutos

| Supabase (antes) | Onde era usado | Substituto (agora) |
|---|---|---|
| **Supabase Auth** (`signInWithPassword`, `getSession`, `onAuthStateChange`, `signOut`) | `src/admin/session.tsx` | Sessões PHP próprias: `password_hash`/`password_verify`, cookie `HttpOnly` + `SameSite=Lax` + `Secure` (em HTTPS), regeneração de ID no login, token CSRF por sessão, bloqueio após 5 falhas, expiração por inactividade, recuperação por token de uso único (`App\Auth\Auth`, `/api/auth/*`) |
| Função `bootstrap_admin` (SQL Editor) | instalação | Ecrã de instalação com `SETUP_TOKEN` (`/api/setup/admin`) ou `php bin/create-admin.php` |
| **Supabase Database** via SDK (`from('…')`, ~15 tabelas) | painel e site | Endpoints REST JSON (`routes.php`) com PDO e prepared statements reais (`ATTR_EMULATE_PREPARES=false`) |
| **RPCs PL/pgSQL** (20 funções: `create_order`, `get_order`, `begin/complete_proof_upload`, `admin_approve_order`, `admin_reject_order`, `admin_cancel_order`, `checkin_ticket`, `admin_dashboard`, …) | regras de negócio | Serviços PHP (`src/Services/*`) com transacções InnoDB, `SELECT … FOR UPDATE` e chaves únicas como garantia final de idempotência |
| **Row Level Security** | todas as tabelas | Verificação de sessão + permissão em **cada** endpoint (`Auth::require(..., 'permissao')`); permissões por perfil na tabela `role_permissions` |
| **Supabase Storage** — bucket privado `proofs` (URLs assinadas) | comprovativos | `storage/proofs` fora de `public_html`; servidos só por `/api/admin/proofs/{id}/file` a quem tem `payments.review`; CSP `sandbox` na resposta |
| **Supabase Storage** — bucket público `media` | galeria, linha do tempo, integrantes | `public_html/uploads/media` com `.htaccess` que impede execução de scripts; imagens re-codificadas com GD |
| **Edge Function** `send-emails` (Deno + nodemailer) | fila de emails | `MailQueue` + PHPMailer (SMTP autenticado) executado por **cron do cPanel** (`bin/cron.php`) ou botão no painel |
| `pg_cron` (expiração de reservas) | opcional | `bin/cron.php` + expiração oportunista em cada pedido |
| HMAC do QR em `private.app_secrets` | ingressos | `APP_KEY` no `.env` privado (HMAC-SHA256) |
| Hash de IP via cabeçalhos PostgREST | rate limiting | `Request::ip()` (+ `TRUST_PROXY_HEADERS` opcional) e tabela `rate_limits` (as tentativas falhadas agora também contam) |
| PDF dos ingressos gerado no navegador (jsPDF) | página do pedido | PDF gerado no servidor (FPDF) — **o mesmo** que segue em anexo no email; descarregado por `/api/public/orders/{code}/tickets.pdf` |
| **Supabase Realtime** | — | Não era usado (nada a substituir) |
| Variáveis `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | build | Removidas. Opcionais: `VITE_API_BASE`, `VITE_MEDIA_URL` (públicas, sem segredos) |
| SDK `@supabase/supabase-js` | `package.json` | Removido; `src/lib/http.ts` (fetch + CSRF) |
| Pasta `supabase/` (migrações PL/pgSQL, testes PostgreSQL) | — | Removida (fica no histórico Git). Substituída por `backend/app/database/` e `backend/tests/` |

Verificação: `grep -ri supabase src backend` não devolve resultados.

## 4. Esquema MySQL

17 grupos pedidos → 25 tabelas (InnoDB, utf8mb4, FKs, índices, `UNIQUE`, `CHECK`):

| Pedido | Tabela(s) |
|---|---|
| 1. Administradores e utilizadores | `users`, `password_resets` |
| 2. Perfis e permissões | `roles`, `permissions`, `role_permissions` |
| 3. Eventos | `events` |
| 4. Categorias de ingressos | `ticket_categories` (preço, lote, stock total/reservado/vendido, limites, período) |
| 5. Inscrições | `registrations` (nome, email, telefone, consentimento) |
| 6. Pedidos | `orders`, `order_access_tokens` |
| 7. Itens dos pedidos | `order_items` |
| 8. Pagamentos | `payments` (um por pedido; referência bancária normalizada **única**) |
| 9. Comprovativos | `payment_proofs` (SHA-256 para detectar reutilização) |
| 10. Ingressos digitais | `tickets` (`UNIQUE(order_id, seq)` impede emissão duplicada) |
| 11. Validação e check-in | `checkins` (todas as tentativas) + colunas `checked_in_*` em `tickets` |
| 12. Histórico de transacções | `transaction_history` |
| 13. Auditoria | `audit_logs` |
| 14. Conteúdos | `timeline_entries`, `members`, `faqs` |
| 15. Galeria | `media_items` |
| 16. Configurações | `settings` (chave/valor) + `events` |
| 17. Notificações e emails | `email_outbox` |
| (suporte) | `rate_limits`, `schema_migrations` |

Detalhes em `BASE_DE_DADOS.md`.

## 5. Garantias de integridade (transacções e idempotência)

| Risco | Protecção |
|---|---|
| Vender mais lugares do que o stock | `SELECT … FOR UPDATE` no evento e na categoria durante a criação do pedido; `CHECK (reservado + vendido ≤ total)` |
| Duplo clique / reenvio do formulário | `orders.idempotency_key` único; repetição devolve o mesmo pedido |
| Aprovação duplicada | pedido bloqueado com `FOR UPDATE`; `payments.order_id` único |
| Reutilização da mesma transferência | `payments.reference_norm` único (maiúsculas, só A–Z0–9) |
| Ingressos emitidos duas vezes | `UNIQUE(order_id, seq)` em `tickets` |
| QR usado duas vezes | `FOR UPDATE` no ingresso durante o check-in |
| Deadlocks sob carga | `Db::tx()` repete automaticamente (erros InnoDB 1213/1205) |
| Comprovativo ≠ pagamento | o upload só muda o estado para *Comprovativo enviado*; ingressos só após aprovação manual com referência e valor conferido |

## 6. Dados existentes no Supabase

Este projecto não chegou a ter um ambiente Supabase de produção configurado nesta sessão
(as credenciais estavam pendentes), por isso **não há dados a transferir**: a instalação
MySQL começa limpa, com os dados oficiais do evento (`002_seed_official_data.sql`).

Se entretanto foi criado um projecto Supabase com pedidos reais, exporte cada tabela em
CSV (Table Editor → Export) e peça a importação assistida — os campos têm correspondência
directa (`orders`+`registrations`+`order_items`, `payment_proofs`, `tickets`, …), mas os
ficheiros dos comprovativos terão de ser descarregados do bucket e copiados para
`storage/proofs`.

## 7. Alterações no frontend (sem mudanças de design)

- `src/lib/http.ts` (novo): cliente da API, CSRF automático, renovação do token, 401 → ecrã de entrada.
- `src/lib/api.ts`: mesmas funções, agora sobre REST; token do pedido enviado em cabeçalho
  `X-Order-Token` (nunca no URL); download do PDF gerado no servidor.
- `src/admin/session.tsx`: sessão própria, permissões vindas do servidor.
- `src/admin/AdminApp.tsx`: ecrãs de **instalação**, **recuperação** e **definição de palavra-passe**
  (com o mesmo estilo do ecrã de entrada).
- Páginas do painel: chamadas convertidas; acrescentado o campo *Método* (Transferência / Express)
  na aprovação e a criação de utilizadores com convite por email.
- Removidos: `src/lib/supabase.ts`, estados “Supabase não configurado”, dependência `@supabase/supabase-js`.

Paleta, fotografias, tipografia, layout, animações, navegação e responsividade não foram alterados
(confirmado por capturas de ecrã nos testes ponta-a-ponta).
