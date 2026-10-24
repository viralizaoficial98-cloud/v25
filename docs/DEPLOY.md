# Deploy — V25 — O Legado

Arquitectura de produção:

```
Navegador ──► Site estático (cPanel / public_html)   ← build Vite (HTML/JS/CSS/imagens)
          └─► Supabase (externo)                      ← PostgreSQL + Auth + Storage + Edge Function
                 └─► Servidor SMTP (porta 465)        ← emails transaccionais
```

O cPanel só serve ficheiros estáticos. **Nenhum processo Node.js persistente é necessário.**
Toda a lógica sensível (stock, pagamentos, ingressos, check-in) corre na base de dados
Supabase, protegida por RLS e funções transaccionais.

---

## 1. Supabase

1. Criar projecto em <https://supabase.com> (região mais próxima de Angola: Europa — ex. `eu-west`).
2. Instalar a CLI: `npm i -g supabase` e autenticar: `supabase login`.
3. Ligar o repositório ao projecto: `supabase link --project-ref <PROJECT_REF>`.
4. Aplicar as migrações: `supabase db push` (cria tabelas, funções, RLS e buckets `proofs`/`media`).
5. Carregar os dados iniciais seguros: abrir **SQL Editor** e executar `supabase/seed.sql`
   (identidade do evento, dados bancários oficiais e FAQ base — **não** cria preços).
6. **Authentication → Providers → Email**: desactivar *“Allow new users to sign up”*
   (as contas da equipa são criadas pelo administrador).
7. **Authentication → URL Configuration**: definir *Site URL* = URL público do site.

### Primeiro administrador
1. **Authentication → Users → Add user** (email + palavra-passe forte, *Auto confirm*).
2. No **SQL Editor**: `select public.bootstrap_admin('email@do-admin');`
   (esta função não está acessível pela API — só no SQL Editor).
3. Os restantes membros: criar a conta em *Add user / Invite* e atribuir o perfil em
   **Painel → Utilizadores e permissões** (Administrador, Financeiro, Operador de check-in).

### Edge Function de emails
```bash
supabase functions deploy send-emails
supabase secrets set \
  SMTP_HOST=mail.seudominio.ao SMTP_PORT=465 \
  SMTP_USER=bilhetes@seudominio.ao SMTP_PASS='********' \
  SMTP_FROM=bilhetes@seudominio.ao \
  SITE_URL=https://v25.seudominio.ao
```
- O Supabase bloqueia as portas SMTP 25 e 587: **use a porta 465 (SSL/TLS)**.
- As credenciais SMTP ficam apenas nos *secrets* da função — nunca no site nem na base de dados.
- Sem a função publicada/configurada, os emails ficam na fila com estado `pendente`
  (o painel mostra “Integração pendente”). Nada é dado como enviado sem envio real.
- Testar: **Painel → Emails e SMTP → Testar** e depois **Processar fila agora**.

### Agendamentos (recomendado)
Executar `supabase/cron.sql` (após activar `pg_cron` e `pg_net`) para:
- libertar reservas expiradas a cada 10 min (também acontece automaticamente a cada novo pedido/consulta);
- enviar a fila de emails a cada 2 min (sem isto, use o botão “Processar fila agora”).

---

## 2. Variáveis de ambiente do frontend

Copiar `.env.example` para `.env` e preencher:

| Variável | Onde obter | Notas |
|---|---|---|
| `VITE_SUPABASE_URL` | Project Settings → API | público |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon`/publishable | público, protegido por RLS. **Nunca** usar a `service_role` |
| `VITE_SITE_URL` | URL final do site | usado nas meta tags Open Graph |
| `VITE_BASE_PATH` | `/` ou subpasta, ex. `/v25/` | tem de terminar em `/` |

Estas variáveis são embutidas no build: ao alterá-las, gere o build de novo.

---

## 3. Build e instalação no cPanel (Viraliza)

```bash
npm ci
npm run build          # gera dist/ (inclui .htaccess)
```

### Na raiz do domínio (`public_html`)
1. cPanel → **Gestor de Ficheiros** → `public_html` (fazer cópia de segurança do conteúdo existente).
2. Carregar o **conteúdo** de `dist/` (não a pasta em si) — ou carregar um `.zip` e “Extrair”.
3. Confirmar que o ficheiro oculto `.htaccess` foi copiado (activar “Mostrar ficheiros ocultos”).

### Numa subpasta (ex.: `public_html/v25`)
1. `VITE_BASE_PATH=/v25/` no `.env` e `npm run build`.
2. No `dist/.htaccess`, alterar `RewriteBase /` para `RewriteBase /v25/`.
3. Carregar o conteúdo de `dist/` para `public_html/v25/`.

O `.htaccess` faz o *fallback* de rotas da SPA (ex.: `/pedido/...`, `/admin`) para `index.html`,
define cabeçalhos de segurança e cache. Requer `mod_rewrite` (padrão no cPanel).

---

## 4. DNS, HTTPS e SMTP

- **DNS**: registo `A` do domínio/subdomínio para o IP do alojamento (ou `CNAME` se indicado
  pela Viraliza). Propagação até 24–48 h.
- **HTTPS**: **não assumir que o SSL já está activo.** cPanel → *SSL/TLS Status* → *Run AutoSSL*
  (Let’s Encrypt/cPanel). Só depois de o certificado estar válido, descomentar no `.htaccess`
  as linhas de redirecionamento para HTTPS.
  A câmara do scanner de check-in **só funciona em HTTPS** (requisito dos navegadores).
- **SMTP**: criar a conta de email no cPanel (*Contas de Email*) e usar os dados em
  *Connect Devices* (servidor, porta 465 SSL). Configurar SPF, DKIM e DMARC em
  cPanel → *Email Deliverability* para evitar que os emails caiam no spam.
- **Supabase Auth**: em *URL Configuration* acrescentar o domínio final às *Redirect URLs*.

---

## 5. Checklist antes de abrir as vendas

- [ ] Migrações aplicadas e `seed.sql` executado
- [ ] Dados bancários conferidos em **Painel → Evento e conteúdos** (confirmar o número
      Transferência Express `920000000` fornecido no briefing)
- [ ] Localização confirmada (ligação Google Maps)
- [ ] Categorias criadas em **Ingressos, lotes e stock** com preços oficiais e publicadas
- [ ] Textos de privacidade/termos revistos pela organização
- [ ] SMTP testado (email de teste recebido) e agendamento da fila activo
- [ ] Contas Financeiro/Check-in criadas e testadas
- [ ] HTTPS activo e redireccionamento ligado
- [ ] Teste completo: pedido → comprovativo → aprovação → ingresso → check-in → reutilização bloqueada
- [ ] Abrir vendas (interruptor em **Ingressos, lotes e stock**)
