# Checklist de segurança — V25 — O Legado

Estado de cada controlo: ✅ implementado e testado · 🔧 depende de configuração no servidor.

## Credenciais e configuração
- ✅ Nenhuma credencial no código nem no repositório (`.env` ignorado pelo Git; `.env.example` sem segredos).
- ✅ Credenciais MySQL/SMTP só em `v25_app/.env`, **fora** de `public_html`; não usam variáveis `VITE_`.
- ✅ O React nunca liga à base de dados — apenas à API `/api`.
- 🔧 `.env` com permissões `600`/`640`; cópia de segurança do `APP_KEY` guardada fora do servidor.
- 🔧 `SETUP_TOKEN` apagado do `.env` depois de criar o primeiro administrador (o diagnóstico avisa).
- ✅ `APP_ENV=production` esconde detalhes de erros (resposta só com `request_id`; detalhe no log privado).

## Autenticação e sessões
- ✅ Palavras-passe com `password_hash` (bcrypt) e `password_verify`; rehash automático.
- ✅ Política: mínimo 10 caracteres com letras e números.
- ✅ Cookie de sessão `HttpOnly`, `SameSite=Lax`, `Secure` automático em HTTPS; ID regenerado no login (anti-fixação).
- ✅ Sessões guardadas em `storage/sessions` (privado), expiração por inactividade (120 min, configurável).
- ✅ Alterar/redefinir a palavra-passe invalida as sessões abertas noutros dispositivos.
- ✅ Bloqueio de 15 min após 5 falhas; limite de 20 tentativas por IP / 15 min; tempo de resposta igual para emails inexistentes.
- ✅ Recuperação por token aleatório (256 bits), guardado só em hash, uso único, válido 1 h (convites 72 h); resposta igual exista ou não a conta.
- ✅ Utilizadores desactivados perdem acesso imediatamente (verificado em cada pedido).
- ✅ Não é possível remover o próprio perfil de administrador nem o último administrador activo.

## CSRF e origem
- ✅ Token CSRF por sessão obrigatório (`X-CSRF-Token`) em todos os pedidos do painel que alteram dados, incluindo login.
- ✅ Pedidos `POST/PUT/DELETE` com cabeçalho `Origin` de outro domínio são recusados.
- ✅ Endpoints públicos de pedido não usam cookies (token próprio em cabeçalho), logo não são vulneráveis a CSRF.

## Autorização
- ✅ Permissões verificadas **no servidor** em cada endpoint (`role_permissions`), nunca só no frontend.
- ✅ Perfis: Administrador (tudo), Financeiro (pedidos, comprovativos, pagamentos, relatórios), Check-in (só validação de entradas).
- ✅ Operador de check-in não vê receita, pedidos nem comprovativos (testado).

## Base de dados
- ✅ PDO com prepared statements reais (`EMULATE_PREPARES=false`) em todas as consultas; testes de SQL injection.
- ✅ Utilizador MySQL dedicado, restrito à base `renewangola_v25` (testado com privilégios mínimos).
- ✅ Transacções InnoDB + `SELECT … FOR UPDATE` + chaves únicas: sem stock negativo, sem aprovações/ingressos duplicados, sem reutilização de referências bancárias (testado com pedidos simultâneos).
- ✅ Tokens (pedido, recuperação) guardados só como hash; IPs guardados como HMAC.

## Comprovativos e uploads
- ✅ Comprovativos em `storage/proofs` fora da pasta pública; acesso só via API com `payments.review`, auditado.
- ✅ Tipo real verificado no servidor (finfo + assinatura de bytes + `getimagesize`): só PDF/JPG/PNG ≤ 5 MB; nomes de ficheiro gerados pelo servidor.
- ✅ Resposta do comprovativo com `Content-Security-Policy: sandbox` e `nosniff`.
- ✅ Mesmo ficheiro (SHA-256) noutro pedido é recusado.
- ✅ Galeria: imagens re-codificadas com GD (remove metadados/conteúdo embutido); vídeos só MP4/WebM.
- ✅ `uploads/.htaccess` impede execução de PHP/CGI e serve de HTML/SVG/JS (testado no Apache: `evil.php` → 403).
- ✅ **O envio de um comprovativo nunca aprova o pagamento**; ingressos só após aprovação manual com referência e valor conferido.

## Ingressos e check-in
- ✅ QR Code contém apenas `V25:<código>:<assinatura HMAC-SHA256>` — nenhum dado pessoal.
- ✅ QR adulterado ou inexistente é recusado e registado.
- ✅ Bloqueio de reutilização com registo de data/hora e operador.
- ✅ Acesso do cliente ao pedido por código + token (256 bits) em cabeçalho — nunca no URL do servidor; email e telefone mascarados.

## Abuso e disponibilidade
- ✅ Rate limiting persistente (MySQL): criação de pedidos (15/10 min por IP, 6/h por email), consultas com token inválido, recuperação de acesso, uploads, check-in, diagnóstico.
- ✅ Armadilha anti-spam (honeypot) no formulário.
- ✅ Reservas não pagas expiram e libertam stock.
- 🔧 `TRUST_PROXY_HEADERS=true` apenas se o site estiver atrás de Cloudflare/proxy de confiança.

## Servidor web (Apache / cPanel)
- ✅ `.htaccess`: CSP restritiva nas páginas, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- ✅ Bloqueio de `.env`, `.git`, `*.sql`, `*.log`, `*.ini` na pasta pública; ficheiros ocultos da API bloqueados; sem listagem de pastas.
- ✅ API com `Cache-Control: no-store`, `X-Frame-Options: DENY`, `nosniff`.
- 🔧 Activar HTTPS (AutoSSL) e só depois o redireccionamento e o HSTS.
- 🔧 PHP actualizado (8.2/8.3) com `display_errors=Off` (incluído em `api/.user.ini`).

## Dados pessoais
- ✅ Recolha mínima (nome, email, telefone) com consentimento explícito e versão registada.
- ✅ Exportações CSV com protecção contra injecção de fórmulas; cada exportação é auditada.
- 🔧 Rever a política de privacidade e os termos no painel (texto base incluído).
- 🔧 Backups cifrados/guardados em local de acesso restrito.

## Auditoria e registos
- ✅ `audit_logs`: login/logout, aprovações, rejeições, cancelamentos, ligações geradas, consulta de comprovativos, preços, configurações, equipa, conteúdos, exportações.
- ✅ Logs da aplicação em `storage/logs` (privado), sem palavras-passe nem tokens.
- ✅ A lista da fila de emails no painel não expõe o conteúdo (tokens); tokens de recuperação são apagados após o envio.

## Versão 2

- Dados bancários retirados de `/api/public/settings`; só aparecem no pedido do próprio cliente (token) e no painel (`settings.manage`).
- VIP: nenhum preço público e nenhuma cobrança sem proposta enviada pela organização **e** aceite pelo cliente; o valor do pedido VIP vem sempre da proposta guardada no servidor; acesso do cliente por token (`X-Vip-Token`, só o hash na BD); limites por IP e por email.
- Checkout: o total é sempre recalculado no servidor a partir do preço em vigor (preços enviados pelo cliente são ignorados); o comprovativo nunca confirma pagamento.
- CMS: todos os campos são validados por esquema no servidor; texto simples (o React escapa tudo, sem `dangerouslySetInnerHTML`); ligações só `https?://`, `/`, `#âncora`, `mailto:` e `tel:` (validadas no servidor e no browser); imagens só caminhos gerados pelo próprio upload; pré-visualização de rascunhos exige sessão com `site.manage`; todas as alterações ficam em `site_revisions` e na auditoria.
- Galeria: imagens re-codificadas com GD (remove metadados/código embebido, corrige orientação), tipo verificado pelos bytes, limites 15 MB (foto) / 50 MB (vídeo MP4/WebM), 500 itens por álbum; vídeos externos só YouTube (`youtube-nocookie`) e Vimeo, também restringidos na CSP (`frame-src`).
- Novas permissões `site.manage`, `gallery.manage`, `vip.manage` (só administrador por omissão; editáveis em `role_permissions`).
- Operações destrutivas no painel (publicar, ocultar secções, eliminar álbuns/itens, rejeitar VIP, restaurar versões) exigem confirmação explícita.
- Dependências: `npm audit` sem vulnerabilidades após actualizar jsPDF 4 (DOMPurify), react-router 7 e zod 4, com compatibilidade verificada por testes (sem `npm audit fix --force`).
