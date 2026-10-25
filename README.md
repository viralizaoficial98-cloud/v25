# V25 — O LEGADO

Plataforma oficial do evento de celebração dos **25 anos do Vibes – Grupo Vocal**
— 20 de Dezembro de 2026, 16h00, Hotel Brisa Tropical, Morro Bento, Luanda.

Divulgação do evento, inscrição, pagamento manual por transferência bancária ou
Transferência Express, validação de comprovativos pela equipa financeira, ingressos digitais
com QR Code assinado (PDF e email), check-in com bloqueio de reutilização e painel administrativo.

Alojamento: **cPanel da Renew Angola** (`renewangola.online`) com **PHP + MySQL** — sem Node.js
no servidor. (Migrado de Supabase: ver [`docs/MIGRACAO_SUPABASE_MYSQL.md`](docs/MIGRACAO_SUPABASE_MYSQL.md).)

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS, componentes estilo shadcn/ui (Radix), Framer Motion, Lucide |
| API | PHP 8.1+ (REST JSON em `/api`), PDO MySQL, sessões seguras, PHPMailer, FPDF, chillerlan/php-qrcode |
| Base de dados | MySQL 8 / MariaDB 10.4+ (InnoDB, utf8mb4) — base `renewangola_v25` |
| Alojamento | Apache 2.4 (cPanel) + `.htaccess`; cron do cPanel para emails |

## Estrutura

```
src/                    Frontend (inalterado no design)
  lib/http.ts           Cliente da API (CSRF, erros)
  lib/api.ts            Chamadas públicas (pedidos, comprovativos, PDF)
  admin/                Painel /admin (sessão, permissões, páginas)
backend/
  app/                  → /home/renewangola/v25_app (PRIVADO, fora de public_html)
    src/                API: Auth, Http, Services, Mail, Support
    routes.php          Todas as rotas REST
    database/           migrations/ + v25_mysql_schema.sql (phpMyAdmin)
    bin/                migrate, cron, check-environment, create-admin, generate-key
    storage/            comprovativos, sessões, logs (privado)
    .env.example        Configuração (sem segredos)
  public/               → /home/renewangola/public_html
    api/                index.php (único ponto de entrada) + .htaccess + .user.ini
    uploads/            galeria (sem execução de scripts)
  tests/                Testes de integração da API + router de testes
public/                 Ficheiros estáticos do site e .htaccess principal
scripts/                build:deploy, build:schema, test:api, test:e2e
docs/                   Instalação, base de dados, segurança, API, testes, pendentes
```

## Desenvolvimento

```bash
npm install
cd backend/app && composer install && cp .env.example .env   # DB_*, APP_KEY, APP_URL=http://localhost:5173,
                                                             # MEDIA_PATH=<repo>/backend/public/uploads/media
php bin/migrate.php                                          # cria as tabelas
cd ../.. && npm run api:dev     # API PHP em http://127.0.0.1:8080 (terminal 1)
npm run dev                     # Vite com proxy /api → 8080 (terminal 2)
```

## Testes

```bash
npm test            # frontend (Vitest)
npm run test:api    # API PHP + MySQL/MariaDB reais (cria uma BD temporária)
npm run test:e2e    # fluxo completo pela interface (build + API + BD + Chromium)
npm run typecheck
```

`test:api`/`test:e2e` precisam de PHP 8.1+ com `pdo_mysql` e de um MySQL/MariaDB local
(ligação de administração por `TEST_MYSQL_SOCKET` ou `TEST_MYSQL_HOST/USER/PASSWORD`).
Resultados: [`docs/RELATORIO_TESTES.md`](docs/RELATORIO_TESTES.md).

## Deploy no cPanel

```bash
npm ci && npm run build:deploy
# deploy/v25-public_html.zip → public_html
# deploy/v25_app.zip         → /home/renewangola/v25_app
# deploy/v25_mysql_schema.sql → phpMyAdmin (renewangola_v25)
```

Guia completo: [`docs/INSTALACAO_CPANEL.md`](docs/INSTALACAO_CPANEL.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [INSTALACAO_CPANEL.md](docs/INSTALACAO_CPANEL.md) | Instalação, `.env`, permissões, HTTPS, DNS, SMTP, cron, actualizações, backups |
| [BASE_DE_DADOS.md](docs/BASE_DE_DADOS.md) | Esquema, importação, migrações, consultas, backup |
| [SEGURANCA.md](docs/SEGURANCA.md) | Checklist de segurança |
| [API.md](docs/API.md) | Endpoints e permissões |
| [RELATORIO_TESTES.md](docs/RELATORIO_TESTES.md) | Testes executados e o que falta validar em produção |
| [PENDENTES.md](docs/PENDENTES.md) | Configurações ainda por fazer |
| [MIGRACAO_SUPABASE_MYSQL.md](docs/MIGRACAO_SUPABASE_MYSQL.md) | Análise e mapeamento da migração |

## Regras de negócio essenciais

- O envio de um comprovativo **nunca** confirma o pagamento.
- Os ingressos só são emitidos depois de a equipa financeira confirmar a transferência
  (referência bancária única + valor igual ao total).
- Cada QR Code é individual, assinado e válido para uma única entrada.
- Sem preços publicados, o site mostra “A AGUARDAR ABERTURA DAS VENDAS”.
