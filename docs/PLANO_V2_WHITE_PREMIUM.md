# V25 — versão 2 (White Premium, CMS, Galeria de Eventos, VIP) — análise e plano

## 1. Estado actual analisado (versão em produção)

| Área | Situação |
|---|---|
| Frontend | React 18 + Vite + Tailwind; tema escuro (tokens `ink`/`cream`/`gold`); one page com Hero, Sobre, 25 anos, Grupo, Informações, Ingressos, Memórias, FAQ |
| Checkout | 2 passos (dados → revisão) + página do pedido com dados bancários, upload e ingressos |
| API | PHP 8.1+ (`backend/app`), 60+ rotas REST, sessão + CSRF, perfis admin/financeiro/checkin |
| Base de dados | 25 tabelas (`001_initial_schema`, `002_seed_official_data`) — **em produção, com o 1.º administrador criado** |
| Conteúdos geríveis | evento/configurações, linha do tempo, integrantes, FAQ, galeria simples (`media_items`) |
| Não geríveis (hardcoded) | textos do Hero/secções, CTAs, ordem das secções, imagens do Hero, SEO |
| Ingressos | categorias com preço único; VIP “por consulta” não suportado (publicar exige preço) |
| Dados bancários | devolvidos por `/api/public/settings` (visíveis a qualquer visitante) |
| Dependências | vulnerabilidades: DOMPurify (via jsPDF), react-router, zod, vite/esbuild/vitest (dev) |

## 2. Princípios da actualização

- Nada é recriado do zero: componentes, API, testes e deploy existentes são estendidos.
- **Só migrações incrementais** (`003_…`), aditivas; nunca reimportar `v25_mysql_schema.sql` em produção.
- `.env`, `APP_KEY`, credenciais, `storage/` e `uploads/` de produção nunca são substituídos.
- Preço aplicado guardado no pedido (já existia em `order_items.unit_price_kz`) + histórico de preços.
- Todo o conteúdo editável passa a viver no MySQL, com rascunho, publicação, pré-visualização e histórico.
- Testes antes de publicar: API, E2E, Apache e **ensaio de actualização** a partir de uma base com dados.

## 3. Migração `003_v2_checkout_vip_cms_gallery.sql`

| Alteração | Tipo |
|---|---|
| `ticket_categories`: `sale_mode` (`directo`/`consulta`), `benefits` (JSON), `badge` | colunas novas |
| `CHECK ck_tc_publish` substituída para permitir publicar categorias “por consulta” sem preço | restrição |
| `ticket_price_history` | tabela nova |
| `orders`: `payment_method` (preferência do cliente), `source` (`checkout`/`vip`), `expired_at` | colunas novas |
| `vip_requests` (solicitações) e `vip_proposals` (propostas, condições, preço aprovado, aceitação) | tabelas novas |
| `site_sections` (rascunho/publicado, ordem, visibilidade) e `site_revisions` (histórico) | tabelas novas |
| `gallery_albums` e `gallery_items` (fotos com miniatura, vídeos, legenda, texto alternativo, ordem, capa) | tabelas novas |
| Categorias oficiais Normal 12 500 Kz, Premium 25 000 Kz, VIP por consulta | inseridas **só se ainda não existirem** com o mesmo nome |
| Secções do site com os textos oficiais | inseridas **só se não existirem** |
| Novas permissões `vip.manage`, `gallery.manage`, `site.manage` | dados de referência |

Inclui `database/rollback/003_down.sql` para reverter apenas o que a 003 acrescenta.

## 4. Implementação

1. Dependências: jsPDF 4, react-router 7, zod 4, vite/vitest actualizados (sem `--force`; compatibilidade verificada por testes).
2. Backend: serviços `SiteService` (CMS), `GalleryService`, `VipService`; checkout com método de pagamento; dados bancários só no pedido; dashboard e relatórios alargados.
3. Frontend: tema White Premium por tokens (sem alterar estrutura), Hero com fotografia oficial, secções a partir do CMS, checkout em 5 etapas, VIP, Galeria dos Eventos, painel com Gestão do Website, Galeria, VIP.
4. Testes: API (novos fluxos), E2E (Normal, Premium, VIP, CMS, galeria), Apache, ensaio de actualização 002→003 com dados.
5. Documentação: actualização em produção (backup, staging, deploy, migração, rollback).

## 6. Estado

Implementado e testado (ver [RELATORIO_TESTES.md](RELATORIO_TESTES.md)). Publicação: [ACTUALIZACAO_V2.md](ACTUALIZACAO_V2.md).
O ficheiro da migração chama-se `003_v2_checkout_vip_cms_gallery.sql`.
