# Relatório de testes — migração para PHP + MySQL

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
