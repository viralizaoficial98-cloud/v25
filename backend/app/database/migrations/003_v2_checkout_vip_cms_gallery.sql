-- =============================================================================
-- V25 — O LEGADO · Migração 003 — versão 2: checkout, VIP, CMS e galeria de eventos
-- INCREMENTAL: só acrescenta tabelas/colunas e insere dados que ainda não existam.
-- Não apaga nem altera pedidos, pagamentos, comprovativos, ingressos ou utilizadores.
-- Requer MariaDB 10.2+ / MySQL 8.0.19+ (ALTER TABLE … DROP CONSTRAINT).
-- Reverter: database/rollback/003_down.sql
-- =============================================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Categorias: modalidade de venda (directa / por consulta), benefícios e destaque ----
ALTER TABLE ticket_categories
  ADD COLUMN sale_mode ENUM('directo','consulta') NOT NULL DEFAULT 'directo' AFTER lot_label,
  ADD COLUMN benefits LONGTEXT NULL AFTER description,
  ADD COLUMN badge VARCHAR(40) NOT NULL DEFAULT '' AFTER benefits;
ALTER TABLE ticket_categories DROP CONSTRAINT ck_tc_publish;
ALTER TABLE ticket_categories ADD CONSTRAINT ck_tc_publish_v2 CHECK (published = 0 OR price_kz IS NOT NULL OR sale_mode = 'consulta');

-- 2. Histórico de preços ----------------------------------------------------------
CREATE TABLE ticket_price_history (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id  CHAR(36)      NOT NULL,
  old_price_kz DECIMAL(14,2) NULL,
  new_price_kz DECIMAL(14,2) NULL,
  changed_by   CHAR(36)      NULL,
  changed_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_tph_cat (category_id, changed_at),
  CONSTRAINT fk_tph_cat FOREIGN KEY (category_id) REFERENCES ticket_categories (id) ON DELETE CASCADE,
  CONSTRAINT fk_tph_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Pedidos: método de pagamento escolhido, origem e expiração ------------------------
ALTER TABLE orders
  ADD COLUMN payment_method ENUM('transferencia','express') NULL AFTER status,
  ADD COLUMN source ENUM('checkout','vip') NOT NULL DEFAULT 'checkout' AFTER payment_method,
  ADD COLUMN expired_at DATETIME NULL AFTER expires_at;
-- Reservas já expiradas antes desta versão
UPDATE orders SET expired_at = updated_at
 WHERE status = 'cancelado' AND cancel_reason = 'Reserva expirada sem comprovativo de pagamento.' AND expired_at IS NULL;

-- 4. VIP: solicitações e propostas ----------------------------------------------------
CREATE TABLE vip_requests (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  request_code     VARCHAR(12)  NOT NULL,
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(254) NOT NULL,
  phone            VARCHAR(16)  NOT NULL,
  participants     INT UNSIGNED NOT NULL,
  message          TEXT         NULL,
  status           ENUM('nova','em_analise','proposta_enviada','aceite','recusada_cliente','rejeitada','cancelada') NOT NULL DEFAULT 'nova',
  status_reason    VARCHAR(500) NULL,
  admin_notes      TEXT         NULL,
  consent_at       DATETIME     NOT NULL,
  consent_version  VARCHAR(40)  NOT NULL,
  ip_hash          CHAR(64)     NULL,
  handled_by       CHAR(36)     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vip_code (request_code),
  KEY ix_vip_status (status, created_at),
  KEY ix_vip_email (email),
  CONSTRAINT fk_vip_user FOREIGN KEY (handled_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_vip_participants CHECK (participants BETWEEN 1 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vip_access_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id  CHAR(36) NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vat_hash (token_hash),
  KEY ix_vat_req (request_id),
  CONSTRAINT fk_vat_req FOREIGN KEY (request_id) REFERENCES vip_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vip_proposals (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  request_id    CHAR(36)      NOT NULL,
  tickets       INT UNSIGNED  NOT NULL,
  total_kz      DECIMAL(14,2) NOT NULL,
  conditions    TEXT          NOT NULL,
  valid_until   DATETIME      NOT NULL,
  status        ENUM('enviada','aceite','recusada','expirada','substituida') NOT NULL DEFAULT 'enviada',
  order_id      CHAR(36)      NULL,
  created_by    CHAR(36)      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at  DATETIME      NULL,
  KEY ix_vp_req (request_id, created_at),
  UNIQUE KEY uq_vp_order (order_id),
  CONSTRAINT fk_vp_req FOREIGN KEY (request_id) REFERENCES vip_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_vp_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_vp_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_vp_values CHECK (tickets BETWEEN 1 AND 100 AND total_kz > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Gestão do website (CMS): secções com rascunho/publicado e histórico ---------------
CREATE TABLE site_sections (
  section_key     VARCHAR(40)  NOT NULL PRIMARY KEY,
  label           VARCHAR(80)  NOT NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  draft_data      LONGTEXT     NOT NULL,
  published_data  LONGTEXT     NOT NULL,
  has_draft       TINYINT(1)   NOT NULL DEFAULT 0,
  published_at    DATETIME     NULL,
  updated_by      CHAR(36)     NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ss_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_revisions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  section_key  VARCHAR(40)  NOT NULL,
  action       ENUM('rascunho','publicado','restaurado','visibilidade','ordem') NOT NULL,
  data         LONGTEXT     NOT NULL,
  user_id      CHAR(36)     NULL,
  user_email   VARCHAR(254) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_sr_section (section_key, id),
  CONSTRAINT fk_sr_section FOREIGN KEY (section_key) REFERENCES site_sections (section_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Galeria dos eventos -----------------------------------------------------------
CREATE TABLE gallery_albums (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  title          VARCHAR(160) NOT NULL,
  slug           VARCHAR(180) NOT NULL,
  category       VARCHAR(60)  NOT NULL DEFAULT '',
  event_date     DATE         NULL,
  location       VARCHAR(160) NOT NULL DEFAULT '',
  description    TEXT         NOT NULL,
  cover_item_id  CHAR(36)     NULL,
  published      TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order     INT          NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga_slug (slug),
  KEY ix_ga_pub (published, event_date, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gallery_items (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  album_id    CHAR(36)     NOT NULL,
  kind        ENUM('foto','video','video_url') NOT NULL,
  path        VARCHAR(255) NULL,
  thumb_path  VARCHAR(255) NULL,
  video_url   VARCHAR(500) NULL,
  width       INT UNSIGNED NULL,
  height      INT UNSIGNED NULL,
  caption     VARCHAR(500) NOT NULL DEFAULT '',
  alt_text    VARCHAR(255) NOT NULL DEFAULT '',
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_gi_album (album_id, sort_order),
  CONSTRAINT fk_gi_album FOREIGN KEY (album_id) REFERENCES gallery_albums (id) ON DELETE CASCADE,
  CONSTRAINT ck_gi_src CHECK ((kind = 'video_url' AND video_url IS NOT NULL) OR (kind <> 'video_url' AND path IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gallery_albums ADD CONSTRAINT fk_ga_cover FOREIGN KEY (cover_item_id) REFERENCES gallery_items (id) ON DELETE SET NULL;

-- 7. Permissões novas ----------------------------------------------------------------
INSERT IGNORE INTO permissions (id, description) VALUES
 ('site.manage', 'Gestão do website: textos, imagens, secções, SEO'),
 ('gallery.manage', 'Galeria dos eventos'),
 ('vip.manage', 'Solicitações e propostas VIP');
INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
 ('admin', 'site.manage'), ('admin', 'gallery.manage'), ('admin', 'vip.manage');

-- 8. Categorias oficiais (só se ainda não existir uma categoria com o mesmo nome) -------
--    Quantidade inicial 0: o administrador define o stock antes de abrir as vendas.
INSERT INTO ticket_categories (id, event_id, name, lot_label, sale_mode, description, benefits, badge, price_kz, quantity_total, max_per_order, max_per_customer, persons_per_ticket, published, sort_order)
SELECT 'b8a502ed-5e59-5669-a2b3-77b5889524d1', 1, 'Normal', '', 'directo', 'A opção ideal para quem quer fazer parte desta grande celebração.', '["Acesso ao concerto V25 — O Legado.", "Acesso à área destinada ao público geral.", "Participação na experiência musical e comemorativa dos 25 anos do Vibes — Grupo Vocal."]', '', 12500.00, 0, 10, 10, 1, 1, 10
FROM DUAL WHERE EXISTS (SELECT 1 FROM events WHERE id = 1) AND NOT EXISTS (SELECT 1 FROM ticket_categories WHERE name = 'Normal');
INSERT INTO ticket_categories (id, event_id, name, lot_label, sale_mode, description, benefits, badge, price_kz, quantity_total, max_per_order, max_per_customer, persons_per_ticket, published, sort_order)
SELECT '276ae596-340c-5dbb-8251-3610f15d485f', 1, 'Premium', '', 'directo', 'Uma experiência diferenciada para quem deseja desfrutar do concerto com maior exclusividade.', '["Todos os benefícios da categoria Normal.", "Acesso a uma área Premium reservada.", "Lugares numa zona privilegiada, com boa visibilidade do palco, de acordo com a disposição do recinto."]', 'Mais exclusivo', 25000.00, 0, 10, 10, 1, 1, 20
FROM DUAL WHERE EXISTS (SELECT 1 FROM events WHERE id = 1) AND NOT EXISTS (SELECT 1 FROM ticket_categories WHERE name = 'Premium');
INSERT INTO ticket_categories (id, event_id, name, lot_label, sale_mode, description, benefits, badge, price_kz, quantity_total, max_per_order, max_per_customer, persons_per_ticket, published, sort_order)
SELECT 'e4f2c934-12a7-55c9-bf2b-069cca98cb9f', 1, 'VIP', '', 'consulta', 'Modalidade exclusiva para quem deseja viver o V25 de forma especial e contribuir para a continuidade do ministério Vibes.', '["Todos os benefícios Premium.", "Acesso à área VIP exclusiva.", "Lugares nas posições mais privilegiadas disponíveis.", "Integração na rede de doadores e apoiantes do ministério Vibes.", "Oferta de lembrança comemorativa dos 25 anos.", "Atendimento diferenciado, sujeito às condições da organização."]', 'Por consulta', NULL, 0, 1, 1, 1, 1, 30
FROM DUAL WHERE EXISTS (SELECT 1 FROM events WHERE id = 1) AND NOT EXISTS (SELECT 1 FROM ticket_categories WHERE name = 'VIP');

-- 9. Secções do website com os textos oficiais (só as que ainda não existirem) -----------
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('hero', 'Hero (topo)', 10, 1, '{"eyebrow": "Vibes — Grupo Vocal · Celebração dos 25 anos", "title": "V25 — O LEGADO", "subtitle": "25 Anos de Música, Fé, Amizade e História", "description": "Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!", "slogan": "25 anos de música. Uma história. Um legado. Uma celebração para recordar.", "cta_primary": {"label": "GARANTE JÁ O TEU INGRESSO", "href": "#ingressos"}, "cta_secondary": {"label": "Conhecer a nossa história", "href": "#historia"}, "image": "", "image_alt": "Os integrantes do Vibes — Grupo Vocal reunidos em estúdio", "show_countdown": true}', '{"eyebrow": "Vibes — Grupo Vocal · Celebração dos 25 anos", "title": "V25 — O LEGADO", "subtitle": "25 Anos de Música, Fé, Amizade e História", "description": "Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!", "slogan": "25 anos de música. Uma história. Um legado. Uma celebração para recordar.", "cta_primary": {"label": "GARANTE JÁ O TEU INGRESSO", "href": "#ingressos"}, "cta_secondary": {"label": "Conhecer a nossa história", "href": "#historia"}, "image": "", "image_alt": "Os integrantes do Vibes — Grupo Vocal reunidos em estúdio", "show_countdown": true}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('about', 'Sobre o evento', 20, 1, '{"eyebrow": "Sobre o evento", "title": "Muito mais do que", "title_highlight": "um concerto.", "body": "", "image": "", "image_alt": "Integrantes do Vibes — Grupo Vocal a cantar em conjunto", "pillars": ["Música", "Fé", "Amizade", "História"]}', '{"eyebrow": "Sobre o evento", "title": "Muito mais do que", "title_highlight": "um concerto.", "body": "", "image": "", "image_alt": "Integrantes do Vibes — Grupo Vocal a cantar em conjunto", "pillars": ["Música", "Fé", "Amizade", "História"]}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('banner', 'Banners / chamadas', 30, 1, '{"items": [{"title": "VEM FAZER PARTE DESTA HISTÓRIA!", "text": "25 anos de música. Uma história. Um legado. Uma celebração para recordar.", "cta_label": "Garante já o teu ingresso", "cta_href": "#ingressos", "image": ""}]}', '{"items": [{"title": "VEM FAZER PARTE DESTA HISTÓRIA!", "text": "25 anos de música. Uma história. Um legado. Uma celebração para recordar.", "cta_label": "Garante já o teu ingresso", "cta_href": "#ingressos", "image": ""}]}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('tickets', 'Ingressos', 40, 1, '{"eyebrow": "Ingressos e inscrições", "title": "Escolhe a tua", "title_highlight": "experiência", "intro": "Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!", "buy_label": "Comprar ingresso", "vip_label": "Solicitar acesso VIP", "note": "Pagamento por transferência bancária ou Transferência Express. O ingresso é emitido após a confirmação do pagamento pela equipa financeira."}', '{"eyebrow": "Ingressos e inscrições", "title": "Escolhe a tua", "title_highlight": "experiência", "intro": "Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!", "buy_label": "Comprar ingresso", "vip_label": "Solicitar acesso VIP", "note": "Pagamento por transferência bancária ou Transferência Express. O ingresso é emitido após a confirmação do pagamento pela equipa financeira."}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('event_info', 'Informações do evento', 50, 1, '{"eyebrow": "Informações do evento", "title": "Marque na sua agenda", "maps_label": "Ver localização"}', '{"eyebrow": "Informações do evento", "title": "Marque na sua agenda", "maps_label": "Ver localização"}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('history', '25 anos de história', 60, 1, '{"eyebrow": "25 anos de história", "title": "Uma caminhada feita de", "title_highlight": "vozes", "intro": "Os marcos que construíram o legado do Vibes — Grupo Vocal, contados por quem os viveu.", "empty_text": "Estamos a recolher datas, fotografias e memórias junto de antigos e actuais integrantes. Os marcos serão publicados aqui em breve."}', '{"eyebrow": "25 anos de história", "title": "Uma caminhada feita de", "title_highlight": "vozes", "intro": "Os marcos que construíram o legado do Vibes — Grupo Vocal, contados por quem os viveu.", "empty_text": "Estamos a recolher datas, fotografias e memórias junto de antigos e actuais integrantes. Os marcos serão publicados aqui em breve."}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('group', 'O grupo', 70, 1, '{"eyebrow": "O grupo", "title": "Vozes que se tornaram", "title_highlight": "família", "intro": "Antigos e actuais integrantes reúnem-se para celebrar 25 anos de harmonia."}', '{"eyebrow": "O grupo", "title": "Vozes que se tornaram", "title_highlight": "família", "intro": "Antigos e actuais integrantes reúnem-se para celebrar 25 anos de harmonia."}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('event_gallery', 'Galeria dos eventos', 80, 1, '{"eyebrow": "Galeria dos eventos", "title": "GALERIA DOS EVENTOS", "title_highlight": "", "intro": "Revive os momentos especiais que marcaram a história do Vibes — Grupo Vocal.", "more_label": "Ver mais fotografias"}', '{"eyebrow": "Galeria dos eventos", "title": "GALERIA DOS EVENTOS", "title_highlight": "", "intro": "Revive os momentos especiais que marcaram a história do Vibes — Grupo Vocal.", "more_label": "Ver mais fotografias"}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('memories', 'Memórias', 90, 1, '{"eyebrow": "Memórias e galeria", "title": "Momentos que", "title_highlight": "ficam", "intro": "Fotografias e vídeos de 25 anos de palco, ensaios e amizade."}', '{"eyebrow": "Memórias e galeria", "title": "Momentos que", "title_highlight": "ficam", "intro": "Fotografias e vídeos de 25 anos de palco, ensaios e amizade."}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('faq', 'Perguntas frequentes', 100, 1, '{"eyebrow": "Perguntas frequentes", "title": "Tudo o que precisa de saber"}', '{"eyebrow": "Perguntas frequentes", "title": "Tudo o que precisa de saber"}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('footer', 'Rodapé', 110, 1, '{"closing_message": "25 anos. Uma história. Muitas vozes. Um legado.", "tagline": "25 Anos de Música, Fé, Amizade e História", "show_partner_logo": true, "partner_label": "Organização e produção"}', '{"closing_message": "25 anos. Uma história. Muitas vozes. Um legado.", "tagline": "25 Anos de Música, Fé, Amizade e História", "show_partner_logo": true, "partner_label": "Organização e produção"}', UTC_TIMESTAMP());
INSERT IGNORE INTO site_sections (section_key, label, sort_order, enabled, draft_data, published_data, published_at) VALUES ('seo', 'SEO e partilha', 900, 1, '{"meta_title": "V25 — O Legado · 25 Anos do Vibes — Grupo Vocal", "meta_description": "V25 — O Legado: 25 anos de música, fé, amizade e história do Vibes — Grupo Vocal. 20 de Dezembro de 2026, 16h00, Hotel Brisa Tropical, Morro Bento, Luanda. Garante já o teu ingresso.", "og_image": ""}', '{"meta_title": "V25 — O Legado · 25 Anos do Vibes — Grupo Vocal", "meta_description": "V25 — O Legado: 25 anos de música, fé, amizade e história do Vibes — Grupo Vocal. 20 de Dezembro de 2026, 16h00, Hotel Brisa Tropical, Morro Bento, Luanda. Garante já o teu ingresso.", "og_image": ""}', UTC_TIMESTAMP());
