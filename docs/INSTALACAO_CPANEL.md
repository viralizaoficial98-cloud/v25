# Instalação no cPanel — V25 — O Legado (renewangola.online)

Guia passo a passo para instalar a plataforma no alojamento cPanel da Renew Angola
(utilizador `renewangola`, base de dados `renewangola_v25`).

> Tempo estimado: 30–45 minutos. Não é necessário Node.js nem Composer no servidor:
> os pacotes já incluem o site compilado e as bibliotecas PHP.

---

## 0. O que vai ser instalado

| Pacote | Destino no servidor | Conteúdo |
|---|---|---|
| `v25-public_html.zip` | `/home/renewangola/public_html` | site compilado, `api/index.php`, `.htaccess`, pasta `uploads/` |
| `v25_app.zip` | `/home/renewangola/v25_app` (**fora** de `public_html`) | código da API, `.env.example`, bibliotecas, migrações, `storage/` privado |
| `v25_mysql_schema.sql` | phpMyAdmin | todas as tabelas + dados oficiais do evento |

Gerar os pacotes (no computador de desenvolvimento): `npm ci && npm run build:deploy` → pasta `deploy/`.

---

## 1. Verificar o PHP

cPanel → **Select PHP Version** (ou *MultiPHP Manager*):

1. Versão **PHP 8.2** ou **8.3** para o domínio `renewangola.online` (mínimo 8.1).
2. Extensões activas: `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`, `gd`, `json`, `ctype`, `iconv`.
3. cPanel → **MultiPHP INI Editor** → domínio → definir:
   - `upload_max_filesize = 52M`
   - `post_max_size = 56M`
   - `memory_limit = 256M`
   (O pacote inclui `public_html/api/.user.ini` com estes valores, que funciona em PHP-FPM;
   o INI Editor garante o mesmo em qualquer modo.)

## 2. Base de dados

Ver também `BASE_DE_DADOS.md`.

1. cPanel → **Bases de dados MySQL**:
   - A base `renewangola_v25` já existe (não criar outra).
   - Criar um utilizador (ex.: `renewangola_v25u`) com palavra-passe forte (use o gerador).
   - **Adicionar utilizador à base de dados** → marcar privilégios: SELECT, INSERT, UPDATE,
     DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES (ou *ALL PRIVILEGES*).
2. cPanel → **phpMyAdmin** → seleccionar `renewangola_v25` (coluna esquerda) →
   **Importar** → escolher `v25_mysql_schema.sql` → Formato SQL → **Executar**.
3. Confirmar: 25 tabelas; tabela `events` com 1 linha; `faqs` com 8 linhas.

## 3. Ficheiros

cPanel → **Gestor de Ficheiros**:

1. Fazer uma cópia de segurança do conteúdo actual de `public_html` (se existir).
2. Abrir `/home/renewangola` (pasta *home*, **acima** de `public_html`), criar a pasta
   `v25_app`, entrar nela, **Carregar** `v25_app.zip` e **Extrair**.
3. Abrir `public_html`, **Carregar** `v25-public_html.zip` e **Extrair**.
4. Activar *Definições → Mostrar ficheiros ocultos* e confirmar que existem
   `public_html/.htaccess`, `public_html/api/.htaccess` e `public_html/uploads/.htaccess`.

Estrutura final:

```
/home/renewangola/
├── public_html/
│   ├── index.html, assets/, images/, .htaccess …
│   ├── api/            index.php, .htaccess, .user.ini
│   └── uploads/media/  (galeria — gravável)
└── v25_app/            (privado)
    ├── .env            ← criar no passo 4
    ├── bootstrap.php, routes.php, src/, vendor/, bin/, database/
    └── storage/        proofs/, logs/, sessions/, tmp/  (graváveis)
```

> Se preferir outro local para a pasta privada, edite `public_html/api/.htaccess` e
> descomente `SetEnv V25_APP_DIR /caminho/absoluto`.

## 4. Configuração privada (`.env`)

Em `/home/renewangola/v25_app`, copiar `.env.example` para `.env` e editar:

```ini
APP_ENV=production
APP_URL=https://renewangola.online
APP_KEY=<64 caracteres hex>
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=renewangola_v25
DB_USERNAME=renewangola_v25u
DB_PASSWORD=<palavra-passe do passo 2>
SETUP_TOKEN=<32 caracteres hex>
MEDIA_PATH=/home/renewangola/public_html/uploads/media
MEDIA_URL=/uploads/media
```

Gerar `APP_KEY` e `SETUP_TOKEN`:
- com Terminal: `cd ~/v25_app && php bin/generate-key.php`
- sem Terminal: qualquer gerador de valores aleatórios hexadecimais (64 e 32 caracteres).

> ⚠️ **Não altere o `APP_KEY` depois de emitir ingressos**: os QR Codes são assinados com ele.
> Guarde uma cópia do `.env` num local seguro (fora do servidor).

## 5. Permissões

| Caminho | Permissão |
|---|---|
| `v25_app/.env` | `600` (ou `640`) |
| `v25_app/storage` e subpastas | `750` (ou `755`) |
| `public_html/uploads/media` | `755` |
| restantes pastas / ficheiros | `755` / `644` |

Em cPanel o PHP corre normalmente com o utilizador `renewangola`, que é o dono dos ficheiros —
não é necessário `777` (nunca usar).

## 6. Diagnóstico e primeiro administrador

1. Abrir `https://renewangola.online/admin` → aparece **Instalação do painel**.
2. (Recomendado) Verificar o alojamento:
   - com Terminal: `php ~/v25_app/bin/check-environment.php`
   - sem Terminal: o mesmo diagnóstico está disponível em `POST /api/setup/check` com o
     `SETUP_TOKEN` (ex.: `curl -X POST -H 'Content-Type: application/json' -d '{"setup_token":"…"}' https://renewangola.online/api/setup/check`).
   Corrigir todas as linhas `[FALHA]`.
3. No ecrã de instalação, preencher o **código de instalação** (`SETUP_TOKEN`), nome, email
   e palavra-passe (≥ 10 caracteres, letras e números) → **Criar administrador**.
4. **Apagar a linha `SETUP_TOKEN` do `.env`** (a instalação deixa de estar disponível).

Alternativa por Terminal: `php bin/create-admin.php email@renewangola.online "Nome"`.

## 7. HTTPS

**Não assumir que o SSL já está activo.**

1. cPanel → **SSL/TLS Status** → seleccionar `renewangola.online` e `www.renewangola.online`
   → **Run AutoSSL**. Aguardar o cadeado verde.
2. Testar `https://renewangola.online` no navegador.
3. Só depois, em `public_html/.htaccess`, descomentar:
   - as duas linhas de redireccionamento para HTTPS;
   - opcionalmente `Strict-Transport-Security` (HSTS).
4. Com HTTPS, o cookie de sessão passa automaticamente a `Secure` (`SESSION_SECURE=auto`).
   Pode fixar `SESSION_SECURE=true` no `.env`.
5. A câmara do scanner de check-in **só funciona em HTTPS** (requisito dos navegadores).

## 8. DNS

Se o domínio ainda não aponta para o alojamento: no registo do domínio, registos `A`
de `renewangola.online` e `www` para o IP indicado pela Renew Angola em
*cPanel → Informações gerais → IP partilhado* (ou nameservers do alojamento).
A propagação pode demorar até 24–48 h. O AutoSSL só funciona depois do DNS propagado.

## 9. Email (SMTP)

1. cPanel → **Contas de Email** → criar, por exemplo, `bilhetes@renewangola.online`.
2. *Connect Devices* → copiar servidor de saída (ex.: `mail.renewangola.online`), porta **465** (SSL).
3. No `.env`:
   ```ini
   SMTP_HOST=mail.renewangola.online
   SMTP_PORT=465
   SMTP_ENCRYPTION=ssl
   SMTP_USERNAME=bilhetes@renewangola.online
   SMTP_PASSWORD=<palavra-passe da conta de email>
   SMTP_FROM_ADDRESS=bilhetes@renewangola.online
   SMTP_FROM_NAME="V25 — O Legado"
   ```
4. cPanel → **Email Deliverability** → corrigir SPF e DKIM (botão *Repair*); recomendado DMARC.
5. Painel → **Emails e SMTP** → *Testar* (para o seu email) → *Processar fila agora*.

Enquanto o SMTP não estiver configurado, os emails ficam na fila com estado `pendente`
e **não** são dados como enviados.

## 10. Tarefas automáticas (cron)

cPanel → **Cron Jobs** → *Adicionar*:

- Intervalo: a cada 2 minutos (`*/2 * * * *`) — ou 5 minutos se o alojamento limitar.
- Comando:
  ```
  /usr/local/bin/php /home/renewangola/v25_app/bin/cron.php >/dev/null 2>&1
  ```
  (confirme o caminho do PHP em *Cron Jobs* → exemplos, ou use `php` se estiver no PATH;
  em alguns servidores: `/opt/cpanel/ea-php83/root/usr/bin/php`).

O cron envia a fila de emails e liberta reservas expiradas (a expiração também acontece
automaticamente sempre que alguém consulta ou cria pedidos).

## 11. Configurar o evento e abrir vendas

No painel (`/admin`), como administrador:

1. **Evento e conteúdos** → confirmar dados bancários, Transferência Express, contactos,
   redes sociais, textos legais, ligação do Google Maps.
2. **Utilizadores e permissões** → criar contas *Financeiro* e *Operador de check-in*
   (com palavra-passe inicial ou convite por email).
3. **Ingressos, lotes e stock** → criar categorias com os preços oficiais e publicar.
4. Fazer um teste completo (ver checklist no fim) e só então ligar **Vendas abertas**.

## 12. Actualizações futuras (sem perda de dados)

1. Gerar novos pacotes (`npm run build:deploy`).
2. **Backup** (ver secção 13).
3. Substituir os ficheiros de `public_html` (excepto `uploads/`) e de `v25_app`
   (excepto `.env` e `storage/`).
4. Aplicar migrações novas:
   - Terminal: `php ~/v25_app/bin/migrate.php` (aplica só as pendentes; `--status` lista);
   - sem Terminal: importar no phpMyAdmin **apenas** os ficheiros novos de
     `v25_app/database/migrations/` (nunca reimportar `v25_mysql_schema.sql` numa base com dados)
     e registar cada um: `INSERT INTO schema_migrations (version) VALUES ('003_…');`

## 13. Backups e recuperação

**O que guardar:**
1. Base de dados `renewangola_v25` (pedidos, pagamentos, ingressos).
2. `v25_app/storage/proofs/` (comprovativos).
3. `public_html/uploads/media/` (galeria).
4. `v25_app/.env` (sobretudo o `APP_KEY`).

**Como:**
- cPanel → **Cópia de segurança** → *Transferir uma cópia de segurança da base de dados MySQL*
  (`renewangola_v25`) e *Cópia de segurança do directório pessoal* (inclui `v25_app` e `public_html`).
- Recomendado: diariamente durante o período de vendas e antes de cada actualização;
  guardar cópias fora do servidor.
- Alternativa: phpMyAdmin → `renewangola_v25` → **Exportar** → Rápido → SQL.

**Recuperar:** cPanel → Cópia de segurança → *Restaurar base de dados MySQL* (ficheiro `.sql.gz`)
e restaurar a pasta pessoal; ou phpMyAdmin → Importar o `.sql` numa base vazia; repor `.env`.

## 14. Registos e resolução de problemas

| Sintoma | Verificar |
|---|---|
| Site carrega mas “Não foi possível carregar…” | `https://renewangola.online/api/health` deve devolver `{"ok":true}` |
| `{"error":"API_NAO_INSTALADA"}` | a pasta `v25_app` não está em `/home/renewangola/v25_app` → mover ou definir `V25_APP_DIR` |
| `{"error":"ERRO_INTERNO","request_id":"…"}` | `v25_app/storage/logs/app-AAAA-MM.log` (procure o `request_id`) e `php-errors.log` |
| Páginas `/pedido/…` ou `/admin` dão 404 | `public_html/.htaccess` em falta ou `mod_rewrite` desactivado |
| Upload de comprovativo falha (> 2 MB) | limites PHP (secção 1) |
| Emails não chegam | Painel → Emails e SMTP (estado e último erro); SPF/DKIM; pasta de spam |
| Câmara do check-in não abre | é obrigatório HTTPS; autorizar a câmara no navegador; alternativa: código manual |

Os registos ficam em `v25_app/storage/logs/` (fora da pasta pública) e não contêm palavras-passe.

## 15. Checklist antes de abrir as vendas

- [ ] Diagnóstico sem `[FALHA]`
- [ ] `SETUP_TOKEN` removido do `.env`
- [ ] HTTPS activo e redireccionamento ligado
- [ ] Email de teste recebido; cron configurado
- [ ] Dados bancários e número Express confirmados no painel
- [ ] Categorias e preços oficiais publicados
- [ ] Contas Financeiro e Check-in testadas
- [ ] Teste real: pedido → comprovativo → aprovação → email com ingresso → PDF → check-in → 2.ª leitura bloqueada
- [ ] Backup configurado
- [ ] Vendas abertas
