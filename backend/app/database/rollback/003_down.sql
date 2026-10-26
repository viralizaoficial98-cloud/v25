-- =============================================================================
-- ROLLBACK da migração 003 — remove APENAS o que a 003 acrescentou.
-- ATENÇÃO: apaga solicitações VIP, conteúdos do CMS, álbuns da galeria e histórico de preços
-- criados depois da actualização. Faça backup antes. Pedidos/ingressos são preservados
-- (pedidos VIP já convertidos continuam como pedidos normais).
-- =============================================================================
SET NAMES utf8mb4;
DROP TABLE IF EXISTS site_revisions;
DROP TABLE IF EXISTS site_sections;
ALTER TABLE gallery_albums DROP FOREIGN KEY fk_ga_cover;
DROP TABLE IF EXISTS gallery_items;
DROP TABLE IF EXISTS gallery_albums;
DROP TABLE IF EXISTS vip_proposals;
DROP TABLE IF EXISTS vip_access_tokens;
DROP TABLE IF EXISTS vip_requests;
DROP TABLE IF EXISTS ticket_price_history;
ALTER TABLE orders DROP COLUMN payment_method, DROP COLUMN source, DROP COLUMN expired_at;
-- Categorias "por consulta" voltam a não poder estar publicadas sem preço
UPDATE ticket_categories SET published = 0 WHERE sale_mode = 'consulta' AND price_kz IS NULL;
ALTER TABLE ticket_categories DROP CONSTRAINT ck_tc_publish_v2;
ALTER TABLE ticket_categories ADD CONSTRAINT ck_tc_publish CHECK (published = 0 OR price_kz IS NOT NULL);
ALTER TABLE ticket_categories DROP COLUMN sale_mode, DROP COLUMN benefits, DROP COLUMN badge;
DELETE FROM role_permissions WHERE permission_id IN ('site.manage','gallery.manage','vip.manage');
DELETE FROM permissions WHERE id IN ('site.manage','gallery.manage','vip.manage');
DELETE FROM schema_migrations WHERE version = '003_v2_checkout_vip_cms_gallery';
