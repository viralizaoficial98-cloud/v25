# Relatório de testes

## Versão 2.2 (gestão comercial por categoria, popup de compra) — 28/10/2026

| Suite | Resultado |
|---|---|
| `npm run typecheck`, `npm run build`, `php -l` em todo o backend | OK |
| `npm test` | **38/38** (estados de venda, abertura do popup com total do servidor, extensão do comprovativo) |
| `npm run test:api` | **27/27 + 20/20** |
| `npm run test:upgrade` | **9/9** — inclui o caso real da produção (001–003 aplicadas → só a 004; preços, stock e pedidos intactos; `004_down.sql` e reaplicação) |
| `npm run test:e2e` | **15/15 etapas** — compra Normal pelo popup no telemóvel, Premium no computador, VIP, suspender/reabrir Premium no painel |
| Staging Apache local (`/home/renewangola`, v2.1 → v2.2) | só a 004 aplicada; `.env`, `api/.user.ini` e `.htaccess` com o mesmo MD5; categorias, pedidos e utilizadores iguais |

Novos casos cobertos na API: cálculo prévio (`/public/orders/quote`) com preço da base de dados, limite por pedido, tipo
inválido, VIP recusado e sem reservar stock; categoria suspensa/esgotada recusada no cálculo e no pedido; guardar sem o campo
mantém o estado; Financeiro não pode alterar categorias (403); VIP suspenso não aceita solicitações; alterações auditadas;
auditoria do pedido visível ao Financeiro; comprovativo com extensão diferente do conteúdo, extensão `.php` e PDF com
JavaScript recusados.

Defeitos encontrados e corrigidos durante a v2.2: variável `$now` perdida na refactorização das regras de venda (erro 500 ao
criar pedidos, apanhado pelos testes antes do commit); nome do titular partido a meio da palavra no telemóvel.


## Versão 2.1 (logótipo no menu, compra Normal/Premium, validação dos dados bancários) — 27/10/2026

| Suite | Resultado |
|---|---|
| `npm run typecheck`, `npm run build`, `php -l` nos ficheiros alterados | OK |
| `npm test` (inclui novos testes do cartão de pagamento e dos botões de compra) | **33/33** |
| `npm run test:api` | **27/27 + 17/17** |
| `npm run test:e2e` | **15/15 etapas** |
| `npm run test:upgrade` | **8/8** (a v2.1 não traz migrações) |
| Cabeçalho em 390 / 768 / 1024 / 1366 px | logótipo carregado, sem overflow horizontal |

Novos casos cobertos: vendas abertas sem dados de pagamento validados → sem botão e pedido recusado
(`PAGAMENTO_POR_VALIDAR`); Financeiro não pode validar (403); validação regista quem/quando e auditoria; alterar o
IBAN anula a validação e esconde as coordenadas dos pedidos pendentes; validação recusada com dados incompletos;
Express vazio deixa de ser oferecido; quantidade 0 nunca mostra “Comprar”; esgotado; estado “A aguardar confirmação
de pagamento”; logótipo do cabeçalho igual ao do rodapé (mesmo ficheiro).


## Versão 2 (White Premium, checkout em etapas, CMS, Galeria dos Eventos, VIP) — 27/10/2026

Todos os resultados abaixo foram **efectivamente executados** neste ambiente (mesmo ambiente da secção da v1, mais abaixo).

| Suite | Comando | Resultado |
|---|---|---|
| API v1 (regressão) | `npm run test:api` | **27/27** |
| API v2 (novos fluxos) | `npm run test:api` | **16/16** |
| Frontend (Vitest) | `npm test` | **27/27** |
| Ponta-a-ponta (Chromium, build de produção) | `npm run test:e2e` | **15/15 etapas** |
| Ensaio de actualização v1 → v2 | `npm run test:upgrade` | **8/8 verificações** |
| Instalação Apache (staging local `/home/renewangola`) | pacote de actualização + `bin/migrate.php` | OK |
| Dependências | `npm audit` | **0 vulnerabilidades** (sem `--force`) |
| Tipos | `npm run typecheck` | OK |

### API v2 (`backend/tests/api-v2.test.mjs`)

1. Preparação: administrador, equipa e categorias oficiais (Normal 12 500, Premium 25 000, VIP por consulta)
2. CMS: textos oficiais publicados; permissões (`site.manage`)
3. CMS: rascunho invisível ao público, pré-visualização, publicação, histórico e restauro
4. CMS: ocultar secção, reordenar, imagem do Hero (upload validado), SEO; HTML guardado como texto simples (nunca interpretado pelo site), links `javascript:` recusados
5. Galeria: álbum, fotografias com miniatura WebP, vídeos YouTube/Vimeo (outros domínios recusados), ficheiro PHP disfarçado recusado, capa, ordem, publicação, actualização parcial sem perda de campos
6. Stock por definir bloqueia compra; VIP nunca pode ser comprado pelo checkout
7. Compra Normal: total calculado no backend (preços enviados pelo cliente ignorados), método de pagamento, dados bancários só no pedido
8. Histórico de preços: alterar o preço não afecta pedidos existentes
9. Premium por Transferência Express → aprovação manual → ingressos → check-in → reutilização bloqueada
10. VIP: solicitação pública, duplicados e permissões
11. VIP: proposta → aceitação → pedido com o valor aprovado → pagamento → ingressos VIP
12. VIP: proposta expirada, recusa pelo cliente, rejeição com motivo
13. Dashboard: vendas por categoria, VIP, check-ins, reservas expiradas, capacidade
14. Relatórios: filtros por categoria/origem/datas; CSV VIP com permissões
15. Emails VIP e de compra enviados por SMTP
16. A API pública não expõe dados bancários nem rascunhos

### Ponta-a-ponta (`scripts/test-e2e.mjs`, capturas em `e2e-screenshots/`)

1. Landing White Premium (fundo `#FFFFFF` verificado), textos do CMS, Normal/Premium/VIP, vendas fechadas, logótipo Renew
2. Instalação do 1.º administrador
3. Gestão comercial: quantidades, alteração de preço com histórico, abertura das vendas
4. CMS: rascunho invisível ao público → pré-visualização → publicação → histórico
5. Galeria: álbum + upload múltiplo (3 fotos) → publicado → aberto no site, lightbox com navegação por teclado
6. Equipa Financeiro e Check-in
7. Compra **Normal** no telemóvel: seleção 2 × 12 500, dados (+244), consentimento obrigatório, resumo com “Voltar e corrigir”, pagamento Express, comprovativo → **PAGAMENTO EM ANÁLISE**; sem scroll horizontal
8. Compra **Premium** (desktop, transferência bancária)
9. **VIP**: solicitação (sem preço) → proposta 200 000 Kz com condições → aceitação → pedido → comprovativo
10. Financeiro: comprovativo privado (401 sem sessão), aprovação manual Normal e VIP
11. Ingressos individuais com QR assinado (2 Normal, 4 VIP) + PDF
12. Check-in e bloqueio da 2.ª entrada
13. Relatórios: CSV filtrado por origem VIP, PDF com filtros, dashboard (receita 225 000 Kz)
14. Ingresso “Utilizado” na página do cliente
15. Acessibilidade básica (alt, h1 único), menu móvel, sem scroll horizontal

### Ensaio de actualização (`scripts/test-upgrade.mjs`)

BD v1 (001 + 002) com administrador, categoria “Normal” a 15 000 Kz, pedido emitido, pagamento e ingressos →
`bin/migrate.php` aplica **só a 003** → todos os dados existentes iguais byte a byte (utilizadores, pedidos, pagamentos,
ingressos, configurações, FAQ, permissões) → “Normal” não duplicada nem alterada → 2.ª execução sem migrações pendentes →
`003_down.sql` remove só o que a 003 criou (pedidos/ingressos intactos) → reaplicação OK.

### Staging local (Apache 2.4 + mod_php, `/home/renewangola`, base `renewangola_v25` igual à produção)

Seguido o guia `ACTUALIZACAO_V2.md`: backup (mysqldump + tar) → extracção dos zips de actualização → `migrate.php`.
Verificado: `.env` e `api/.user.ini` com o mesmo MD5 de antes; comprovativos em `storage/proofs` e ficheiros em
`uploads/media` preservados; pedido e ingresso v1 intactos (origem `checkout`); `/api/public/settings` sem IBAN/conta;
`/api/.user.ini` → 403; CSP com `player.vimeo.com`; landing móvel sem erros na consola; pré-visualização recusada sem sessão.

### Desempenho móvel v2 (Apache local, 390×844, CPU 4× mais lenta)

| Rede | FCP | LCP | CLS | Transferido |
|---|---|---|---|---|
| 4G lento | 0,98 s | 1,74 s | 0,000 | 206 KB |
| 3G rápido | 2,08 s | 2,83 s | 0,000 | 238 KB |

O formulário VIP (com a biblioteca de telefones) só é carregado quando é aberto; o painel e o checkout são carregados a pedido.

### Defeitos encontrados e corrigidos durante os testes v2

- Actualizar só a capa de um álbum apagava categoria/local/descrição (actualização parcial) — corrigido + teste.
- A página “Evento e conteúdos” gravaria os dados bancários vazios (deixaram de vir na API pública) — passa a ler `GET /admin/settings`.
- Resumo do checkout e botões longos ultrapassavam a largura no telemóvel — corrigido; o E2E verifica scroll horizontal no checkout e no pagamento.

### Não testado na v2

Os mesmos itens da secção 7 da v1 (servidor real, MySQL 8 Oracle, HTTPS, SMTP real, câmara) e ainda:
reprodução de vídeos do YouTube/Vimeo (sem internet neste ambiente; a validação dos URLs e o leitor incorporado estão testados).

---

# Versão 1 — migração para PHP + MySQL

Data de execução: 25/10/2026. Todos os resultados abaixo foram **efectivamente executados**
neste ambiente; o que não foi possível testar está identificado na secção 7.

## Ambiente de teste

| Componente | Versão |
|---|---|
| PHP | 8.3.6 (CLI, servidor embutido com 8 workers, e **Apache 2.4.58 + mod_php** prefork) |
| Base de dados | MariaDB 10.11.14 (InnoDB, utf8mb4) |
| Bibliotecas PHP | PHPMailer 6.12, chillerlan/php-qrcode 5.0.5, FPDF 1.9 |
| Frontend | build de produção Vite; Chromium (Playwright) |
| SMTP | servidor SMTP local de teste (aceita AUTH LOGIN/PLAIN e regista as mensagens) |

## 1. Testes de integração da API — `npm run test:api` → **27/27 passaram**

Base de dados temporária importada a partir do **mesmo ficheiro** usado no phpMyAdmin
(`v25_mysql_schema.sql`), com um utilizador MySQL restrito à base (como no cPanel).

Executados **duas vezes**: (a) servidor PHP embutido; (b) **Apache real** com o pacote de
deploy instalado em `/home/renewangola/{public_html,v25_app}` e a base `renewangola_v25` — 27/27 em ambos.

| # | Teste | Fluxo pedido |
|---|---|---|
| 1 | Configurações oficiais públicas, sem ingressos publicados, FAQ | — |
| 2 | Instalação: 1.º administrador exige `SETUP_TOKEN`, só funciona uma vez; diagnóstico do alojamento | — |
| 3 | Autenticação: CSRF obrigatório, credenciais inválidas, cookie `HttpOnly`/`SameSite`, origem estrangeira recusada | permissões |
| 4 | Equipa: criação de Financeiro e Check-in, convite por email, email duplicado recusado | 13 |
| 5 | Permissões por perfil verificadas no servidor (anónimo, Check-in, Financeiro) | 13 |
| 6 | Ingressos: preço obrigatório para publicar; vendas fechadas bloqueiam pedidos | — |
| 7 | Inscrição: validação no backend (consentimento, nome, email, telefone +244, quantidade, convidados, honeypot) | 1 |
| 8 | Pedido: código único, idempotência, duplicados, stock reservado uma vez, token e IP só em hash | 2 |
| 9 | Consulta segura do pedido (código + token em cabeçalho), dados mascarados | 3 |
| 10 | Upload: ficheiro disfarçado recusado, > 5 MB recusado, PDF aceite, **não cria pagamento nem ingressos**, ficheiro fora da pasta pública | 4 |
| 11 | Comprovativo só acessível a Admin/Financeiro (CSP sandbox); reutilização noutro pedido recusada | 4 |
| 12 | Aprovação: Check-in não pode aprovar; valor tem de coincidir; referência obrigatória; 2.ª aprovação não duplica; stock, auditoria, histórico e emails correctos | 5, 7 |
| 13 | QR Code assinado (HMAC) sem dados pessoais, códigos individuais | 8 |
| 14 | PDF dos ingressos (`%PDF`, uma página por ingresso), acesso negado com token errado | 9 |
| 15 | Rejeição com motivo; referência reutilizada recusada; novo comprovativo → aprovação por Transferência Express | 6 |
| 16 | Check-in: verificação, entrada, **reutilização bloqueada** (hora + operador), QR adulterado, código inexistente, código manual | 10, 11 |
| 17 | Cancelamento: bloqueado com ingressos usados; anula ingressos, estorna pagamento, liberta stock | — |
| 18 | Reserva (RESERVAR LUGAR), confirmação e expiração que liberta stock | — |
| 19 | Rate limiting na criação de pedidos por IP | segurança |
| 20 | **Stock concorrente: 20 compras simultâneas para 5 lugares → exactamente 5** | integridade |
| 21 | **3 aprovações simultâneas do mesmo pedido → ingressos emitidos uma só vez** | integridade |
| 22 | Dashboard (receita oculta ao Check-in) e relatórios CSV (BOM, separador `;`), filtros | 12 |
| 23 | **Envio SMTP real**: pedido criado, comprovativo recebido, pagamento aprovado, rejeição com motivo, ingresso com **PDF em anexo** e **QR inline**; payload com tokens não exposto | emails |
| 24 | Recuperação de palavra-passe por token (uso único), sessões antigas invalidadas, bloqueio após 5 falhas | 13 |
| 25 | Galeria e conteúdos: upload de imagem (re-codificada), `.php` disfarçado recusado, rascunho/publicação, YouTube, remoção de ficheiros | — |
| 26 | Configurações auditadas, URLs perigosos filtrados, último administrador protegido, logout | — |
| 27 | Protecção contra SQL injection nos filtros e no acesso ao pedido | segurança |

Sem avisos/erros PHP no servidor e sem erros no log da aplicação em ambas as execuções.

## 2. Teste ponta-a-ponta pela interface — `npm run test:e2e` → **12/12 etapas**

Build de produção + API + MariaDB, Chromium. Executado no servidor PHP embutido **e no
Apache real** (com o `.htaccess` e a CSP de produção) — 12/12 em ambos, sem erros de
consola, sem violações de CSP e sem erros HTTP 5xx.

1. Landing page carregada da API (vendas fechadas → “A AGUARDAR ABERTURA DAS VENDAS”).
2. Instalação pelo ecrã do painel (SETUP_TOKEN) e início de sessão.
3. Administrador cria categoria (15 000 Kz, 100 lugares) e abre as vendas.
4. Administrador cria utilizadores Financeiro e Check-in.
5. Cliente (telemóvel 390 px) compra pelo checkout: consentimento obrigatório, telefone `923 456 789` → `+244923456789`, dados bancários com IBAN formatado e botão copiar.
6. Cliente envia comprovativo → “Comprovativo em análise — isto ainda não confirma o pagamento”.
7. Financeiro abre o comprovativo (privado; sem sessão → 401) e aprova com referência + valor + confirmação.
8. Cliente vê o ingresso com QR Code e descarrega o PDF (validado `%PDF`).
9. Operador valida o código → “ENTRADA VALIDADA”; 2.ª leitura → “JÁ UTILIZADO … por Operador Porta”.
10. Financeiro exporta CSV e vê a receita no dashboard.
11. Cliente vê o ingresso como “Utilizado”.
12. Acessibilidade básica (todas as imagens com `alt`, um único `h1`) e sem scroll horizontal no telemóvel.

Verificação adicional: o QR impresso no PDF gerado pelo servidor foi lido por um descodificador
(jsQR) e corresponde ao conteúdo assinado `V25:T-XXXXXXXX:<assinatura>`.

## 3. Testes do frontend — `npm test` → **25/25 passaram**

Cliente HTTP (CSRF, renovação de token, erros, token do pedido só em cabeçalho), validação
(nome, email, telefone, limites, ficheiros por assinatura de bytes), datas/contagem no fuso
Africa/Luanda, formatação em Kz, CSV, secção de ingressos com dados simulados da API
(vendas fechadas / abertas / API indisponível), informações do evento e contagem acessível.
`tsc` sem erros.

## 4. Servidor Apache (regras `.htaccess`) — verificado com pedidos reais

| Pedido | Resultado |
|---|---|
| `/` | 200 com Content-Security-Policy |
| `/pedido/V25-…`, `/admin/redefinir` | 200 (fallback da SPA) |
| `/assets/*.js` | `Cache-Control: public, max-age=31536000, immutable` |
| `/.env`, `/backup.sql` | 403 |
| `/api/.user.ini` | 403 (corrigido durante os testes — estava 200) |
| `/uploads/media/evil.php` | 403, **não executado** |
| `/uploads/media/*.html`, `*.svg`, listagem `/uploads/` | 403 |
| `/v25_app/…` | inacessível (fora da pasta pública) |

Problemas encontrados **apenas** no Apache real e corrigidos:
- o código HTTP 419 (CSRF) era convertido em 500 pelo Apache → passou a 403;
- cabeçalhos de segurança duplicados nas respostas da API → regras de cabeçalhos do `.htaccess` limitadas às páginas;
- `.user.ini` legível na pasta da API → bloqueado.

## 5. Instalação e pacotes

- `npm run build:deploy` gera `v25-public_html.zip` (1,2 MB) e `v25_app.zip` (0,56 MB, com bibliotecas sem histórico Git/exemplos/testes).
- Pacotes extraídos para `/home/renewangola/…`, `.env` criado a partir do `.env.example`, schema importado com o utilizador restrito → funcionou sem configurar caminhos (`V25_APP_DIR` não foi necessário).
- `bin/migrate.php` numa base vazia e o import do `v25_mysql_schema.sql` produzem **esquemas idênticos** (`mysqldump --no-data` + `diff`).
- `bin/cron.php` executado como utilizador do servidor web: com o SMTP inalcançável, os emails ficaram `pendente` com a tentativa registada (sem falso “enviado”).
- `bin/check-environment.php` detectou correctamente o limite `upload_max_filesize = 2M` (valor por omissão do PHP).

## 6. Desempenho mobile (landing page, Apache local)

Chromium a simular telemóvel (390×844, DPR 2) com CPU 4× mais lenta. Fontes Google excluídas
(sem acesso à internet neste ambiente).

| Rede simulada | FCP | LCP | CLS | Transferido |
|---|---|---|---|---|
| 4G lento (9 Mbps, 170 ms) | 1,28 s | 2,04 s | 0,000 | 195 KB |
| 3G rápido (1,6 Mbps, 300 ms) | 2,24 s | 3,04 s | 0,000 | 230 KB |

LCP < 2,5 s (“bom”) em 4G; sem deslocamento de layout. Fotografias em AVIF/WebP responsivas.

## 7. O que NÃO foi testado (e porquê)

| Item | Motivo | Como validar em produção |
|---|---|---|
| Servidor real da Renew Angola (versões, limites, `mod_security`) | sem acesso a partir deste ambiente | `bin/check-environment.php` ou `/api/setup/check` + checklist em `INSTALACAO_CPANEL.md` |
| MySQL 8 (Oracle) | só MariaDB 10.11 disponível | o SQL evita funcionalidades exclusivas; importar e correr o diagnóstico |
| PHP 8.1 / 8.2 | testado em 8.3; dependências fixadas para 8.1 | diagnóstico + teste do fluxo |
| PHP-FPM (leitura de `.user.ini`) | testado com mod_php | diagnóstico mostra os limites efectivos |
| HTTPS / cookie `Secure` | ambiente local sem certificado | após AutoSSL, confirmar o atributo `Secure` no cookie `v25_sess` |
| Fornecedor SMTP real (entregabilidade, SPF/DKIM) | testado com servidor SMTP local | email de teste no painel |
| Leitura do QR pela **câmara** | requer dispositivo físico e HTTPS | testar no telemóvel do operador antes do evento (a validação manual e a lógica do QR estão testadas) |
| Carga elevada real (centenas de utilizadores) | fora do âmbito; concorrência testada com 20 pedidos simultâneos | — |
| Leitores de ecrã / auditoria completa de acessibilidade | só verificações automáticas básicas | auditoria manual recomendada |
