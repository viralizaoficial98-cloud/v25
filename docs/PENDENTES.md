# Configurações pendentes

Itens que dependem da organização ou do alojamento. Nenhum deles foi simulado: enquanto não
forem feitos, a plataforma mostra estados honestos (vendas fechadas, emails “pendentes”, etc.).

## No servidor (Renew Angola / cPanel)

| # | Item | Onde | Bloqueia |
|---|---|---|---|
| 1 | Utilizador MySQL e palavra-passe para `renewangola_v25` | cPanel → Bases de dados MySQL; `.env` (`DB_USERNAME`, `DB_PASSWORD`) | tudo |
| 2 | `APP_KEY` e `SETUP_TOKEN` gerados | `.env` | tudo |
| 3 | Confirmar PHP ≥ 8.1 e extensões; limites de upload ≥ 6M (52M para vídeos) | Select PHP Version / MultiPHP INI Editor | uploads |
| 4 | Importar `v25_mysql_schema.sql` | phpMyAdmin | tudo |
| 5 | Carregar os dois pacotes nas pastas correctas | Gestor de Ficheiros | tudo |
| 6 | Correr o diagnóstico e corrigir falhas | `bin/check-environment.php` ou `/api/setup/check` | — |
| 7 | Criar o primeiro administrador e **apagar `SETUP_TOKEN`** | `/admin` | painel |
| 8 | Certificado SSL (AutoSSL) e depois activar redireccionamento HTTPS/HSTS no `.htaccess` | SSL/TLS Status | câmara do check-in, segurança |
| 9 | DNS de `renewangola.online` / `www` a apontar para o alojamento (se ainda não estiver) | registo do domínio | SSL |
| 10 | Conta de email + credenciais SMTP (porta 465) + SPF/DKIM | Contas de Email, Email Deliverability, `.env` | envio de emails |
| 11 | Cron job `bin/cron.php` (2–5 min) | Cron Jobs | envio automático de emails |
| 12 | Política de backups (BD + `storage/proofs` + `uploads/media` + `.env`) | Cópia de segurança | recuperação |

## No painel (organização do evento)

| # | Item | Página |
|---|---|---|
| 13 | Categorias de ingresso, **preços em Kz**, lotes, quantidades e limites | Ingressos, lotes e stock |
| 14 | Confirmar o número **Transferência Express `920000000`** (veio no briefing; parece um valor de exemplo) | Evento e conteúdos |
| 15 | Confirmar os dados bancários (pré-carregados do briefing) | Evento e conteúdos |
| 16 | Ligação exacta do Google Maps (actualmente uma pesquisa por “Hotel Brisa Tropical, Morro Bento, Luanda”) | Evento e conteúdos |
| 17 | Contactos, redes sociais, copyright/créditos | Evento e conteúdos |
| 18 | Rever política de privacidade e termos (há texto base) | Evento e conteúdos |
| 19 | Regras ainda não definidas no FAQ (reembolsos, crianças, dress code, estacionamento) | FAQ |
| 20 | Marcos da linha do tempo, integrantes, fotografias e vídeos adicionais | Linha do tempo, Integrantes, Fotografias e vídeos |
| 21 | Contas Financeiro e Operador de check-in | Utilizadores e permissões |
| 22 | Capacidade total do evento (opcional) e prazo de reserva (48 h por omissão) | Evento e conteúdos |
| 23 | Teste completo em produção e só depois **abrir as vendas** | Ingressos, lotes e stock |

## Opcional / recomendado

- Testar a leitura de QR pela câmara nos telemóveis que serão usados à entrada (exige HTTPS).
- Activar `TRUST_PROXY_HEADERS=true` apenas se o domínio ficar atrás de Cloudflare.
- Monitorizar `v25_app/storage/logs/` nas primeiras semanas de vendas.
