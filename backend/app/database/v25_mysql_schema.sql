-- =============================================================================
-- V25 — O LEGADO · INSTALAÇÃO COMPLETA (MySQL 8.0+ / MariaDB 10.4+)
-- Importar no phpMyAdmin (cPanel) com a base de dados renewangola_v25 seleccionada.
-- Ficheiro GERADO por scripts/build-mysql-schema.mjs a partir de database/migrations/.
-- Não editar à mão. Para actualizações futuras use as migrações (bin/migrate.php)
-- ou importe apenas os ficheiros de migração novos.
-- Migrações incluídas: 001_initial_schema.sql, 002_seed_official_data.sql
-- =============================================================================

-- >>> 001_initial_schema.sql
-- =============================================================================
-- V25 — O LEGADO · Migração 001 — esquema inicial (MySQL 8.0+ / MariaDB 10.4+)
-- InnoDB · utf8mb4 · datas em UTC (a API converte para Africa/Luanda).
-- Sem triggers nem procedimentos: toda a lógica transaccional está na API PHP.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Controlo de migrações ------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(64)  NOT NULL PRIMARY KEY,
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1–2. Perfis, permissões e utilizadores -------------------------------------
CREATE TABLE roles (
  id           VARCHAR(20)  NOT NULL PRIMARY KEY,
  name         VARCHAR(60)  NOT NULL,
  description  VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id           VARCHAR(50)  NOT NULL PRIMARY KEY,
  description  VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_id        VARCHAR(20) NOT NULL,
  permission_id  VARCHAR(50) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  email                VARCHAR(254) NOT NULL,
  full_name            VARCHAR(120) NOT NULL DEFAULT '',
  password_hash        VARCHAR(255) NULL,           -- NULL até o convite ser aceite
  role_id              VARCHAR(20)  NOT NULL,
  active               TINYINT(1)   NOT NULL DEFAULT 1,
  failed_logins        INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until         DATETIME     NULL,
  last_login_at        DATETIME     NULL,
  password_changed_at  DATETIME     NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     CHAR(36)    NOT NULL,
  token_hash  CHAR(64)    NOT NULL,
  purpose     ENUM('reset','convite') NOT NULL DEFAULT 'reset',
  expires_at  DATETIME    NOT NULL,
  used_at     DATETIME    NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pr_token (token_hash),
  KEY ix_pr_user (user_id),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Evento ------------------------------------------------------------------
CREATE TABLE events (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL,
  subtitle              VARCHAR(200) NOT NULL DEFAULT '',
  slogan                VARCHAR(200) NOT NULL DEFAULT '',
  group_name            VARCHAR(120) NOT NULL DEFAULT '',
  starts_at             DATETIME     NOT NULL,      -- UTC
  timezone              VARCHAR(40)  NOT NULL DEFAULT 'Africa/Luanda',
  venue                 VARCHAR(160) NOT NULL DEFAULT '',
  address               VARCHAR(255) NOT NULL DEFAULT '',
  maps_url              VARCHAR(500) NOT NULL DEFAULT '',
  about_text            TEXT         NOT NULL,
  closing_message       VARCHAR(255) NOT NULL DEFAULT '',
  sales_open            TINYINT(1)   NOT NULL DEFAULT 0,
  sales_closed_message  VARCHAR(160) NOT NULL DEFAULT 'A AGUARDAR ABERTURA DAS VENDAS',
  capacity              INT UNSIGNED NULL,
  reservation_hours     INT UNSIGNED NOT NULL DEFAULT 48,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_events_resv CHECK (reservation_hours BETWEEN 1 AND 720)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Configurações gerais (chave/valor) --------------------------------------
CREATE TABLE settings (
  setting_key    VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value  TEXT        NOT NULL,
  updated_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by     CHAR(36)    NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Categorias de ingressos (lotes e stock) ----------------------------------
CREATE TABLE ticket_categories (
  id                  CHAR(36)      NOT NULL PRIMARY KEY,
  event_id            INT UNSIGNED  NOT NULL,
  name                VARCHAR(80)   NOT NULL,
  lot_label           VARCHAR(60)   NOT NULL DEFAULT '',
  description         TEXT          NOT NULL,
  price_kz            DECIMAL(14,2) NULL,
  quantity_total      INT UNSIGNED  NOT NULL DEFAULT 0,
  quantity_reserved   INT UNSIGNED  NOT NULL DEFAULT 0,
  quantity_sold       INT UNSIGNED  NOT NULL DEFAULT 0,
  max_per_order       INT UNSIGNED  NOT NULL DEFAULT 4,
  max_per_customer    INT UNSIGNED  NOT NULL DEFAULT 10,
  persons_per_ticket  INT UNSIGNED  NOT NULL DEFAULT 1,
  sales_start         DATETIME      NULL,
  sales_end           DATETIME      NULL,
  published           TINYINT(1)    NOT NULL DEFAULT 0,
  sort_order          INT           NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_tc_event (event_id, published, sort_order),
  CONSTRAINT fk_tc_event FOREIGN KEY (event_id) REFERENCES events (id),
  CONSTRAINT ck_tc_price CHECK (price_kz IS NULL OR price_kz > 0),
  CONSTRAINT ck_tc_stock CHECK (quantity_reserved + quantity_sold <= quantity_total),
  CONSTRAINT ck_tc_publish CHECK (published = 0 OR price_kz IS NOT NULL),
  CONSTRAINT ck_tc_limits CHECK (max_per_order BETWEEN 1 AND 100 AND max_per_customer BETWEEN 1 AND 500 AND persons_per_ticket BETWEEN 1 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Inscrições (dados do participante) --------------------------------------
CREATE TABLE registrations (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  event_id         INT UNSIGNED NOT NULL,
  full_name        VARCHAR(120) NOT NULL,
  email            VARCHAR(254) NOT NULL,
  phone            VARCHAR(16)  NOT NULL,
  consent_at       DATETIME     NOT NULL,
  consent_version  VARCHAR(40)  NOT NULL,
  ip_hash          CHAR(64)     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reg_email (email),
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Pedidos -----------------------------------------------------------------
CREATE TABLE orders (
  id                CHAR(36)      NOT NULL PRIMARY KEY,
  event_id          INT UNSIGNED  NOT NULL,
  registration_id   CHAR(36)      NOT NULL,
  order_code        VARCHAR(12)   NOT NULL,
  status            ENUM('iniciada','aguardando_pagamento','comprovativo_enviado','em_analise',
                         'aprovado','rejeitado','cancelado','emitido') NOT NULL DEFAULT 'aguardando_pagamento',
  total_kz          DECIMAL(14,2) NOT NULL,
  guests_total      INT UNSIGNED  NOT NULL,
  idempotency_key   CHAR(36)      NOT NULL,
  expires_at        DATETIME      NULL,
  rejection_reason  VARCHAR(500)  NULL,
  cancel_reason     VARCHAR(500)  NULL,
  reviewed_by       CHAR(36)      NULL,
  reviewed_at       DATETIME      NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_code (order_code),
  UNIQUE KEY uq_orders_idem (idempotency_key),
  KEY ix_orders_status (status, expires_at),
  KEY ix_orders_created (created_at),
  CONSTRAINT fk_orders_event FOREIGN KEY (event_id) REFERENCES events (id),
  CONSTRAINT fk_orders_reg FOREIGN KEY (registration_id) REFERENCES registrations (id),
  CONSTRAINT fk_orders_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_orders_total CHECK (total_kz > 0 AND guests_total > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Itens do pedido ---------------------------------------------------------
CREATE TABLE order_items (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id            CHAR(36)      NOT NULL,
  category_id         CHAR(36)      NOT NULL,
  quantity            INT UNSIGNED  NOT NULL,
  unit_price_kz       DECIMAL(14,2) NOT NULL,
  persons_per_ticket  INT UNSIGNED  NOT NULL DEFAULT 1,
  line_total_kz       DECIMAL(14,2) NOT NULL,
  UNIQUE KEY uq_oi (order_id, category_id),
  KEY ix_oi_category (category_id),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_category FOREIGN KEY (category_id) REFERENCES ticket_categories (id),
  CONSTRAINT ck_oi_qty CHECK (quantity > 0 AND unit_price_kz > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acesso seguro do cliente ao pedido (apenas hash SHA-256 do token)
CREATE TABLE order_access_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id    CHAR(36) NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at  DATETIME NULL,
  UNIQUE KEY uq_oat_hash (token_hash),
  KEY ix_oat_order (order_id),
  CONSTRAINT fk_oat_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Pagamentos confirmados (um por pedido; referência bancária única) --------
CREATE TABLE payments (
  id              CHAR(36)      NOT NULL PRIMARY KEY,
  order_id        CHAR(36)      NOT NULL,
  method          ENUM('transferencia','express') NOT NULL DEFAULT 'transferencia',
  reference       VARCHAR(80)   NOT NULL,
  reference_norm  VARCHAR(80)   NOT NULL,        -- maiúsculas, só [A-Z0-9]
  amount_kz       DECIMAL(14,2) NOT NULL,
  status          ENUM('confirmado','estornado') NOT NULL DEFAULT 'confirmado',
  note            VARCHAR(500)  NULL,
  confirmed_by    CHAR(36)      NULL,
  confirmed_at    DATETIME      NOT NULL,
  UNIQUE KEY uq_pay_order (order_id),              -- impede aprovação duplicada
  UNIQUE KEY uq_pay_ref (reference_norm),          -- impede reutilização de transacção
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_pay_user FOREIGN KEY (confirmed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_pay_amount CHECK (amount_kz > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Comprovativos (ficheiros guardados fora da pasta pública) ---------------
CREATE TABLE payment_proofs (
  id                     CHAR(36)     NOT NULL PRIMARY KEY,
  order_id               CHAR(36)     NOT NULL,
  storage_name           VARCHAR(80)  NOT NULL,
  original_name          VARCHAR(255) NOT NULL DEFAULT '',
  mime_type              VARCHAR(40)  NOT NULL,
  size_bytes             INT UNSIGNED NOT NULL,
  sha256                 CHAR(64)     NOT NULL,
  duplicate_of_order_id  CHAR(36)     NULL,
  status                 ENUM('pendente','aceite','rejeitado') NOT NULL DEFAULT 'pendente',
  uploaded_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proof_storage (storage_name),
  KEY ix_proof_order (order_id),
  KEY ix_proof_sha (sha256),
  CONSTRAINT fk_proof_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Ingressos digitais -----------------------------------------------------
CREATE TABLE tickets (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  order_id       CHAR(36)     NOT NULL,
  category_id    CHAR(36)     NOT NULL,
  ticket_code    VARCHAR(12)  NOT NULL,
  seq            INT UNSIGNED NOT NULL,
  holder_name    VARCHAR(120) NOT NULL,
  status         ENUM('valido','utilizado','anulado') NOT NULL DEFAULT 'valido',
  issued_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_at  DATETIME     NULL,
  checked_in_by  CHAR(36)     NULL,
  UNIQUE KEY uq_tickets_code (ticket_code),
  UNIQUE KEY uq_tickets_seq (order_id, seq),       -- impede emissão duplicada
  KEY ix_tickets_status (status),
  CONSTRAINT fk_tickets_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_tickets_category FOREIGN KEY (category_id) REFERENCES ticket_categories (id),
  CONSTRAINT fk_tickets_checker FOREIGN KEY (checked_in_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Validação e check-in (todas as tentativas) ------------------------------
CREATE TABLE checkins (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id   CHAR(36)    NULL,
  input_code  VARCHAR(40) NULL,
  result      VARCHAR(30) NOT NULL,
  user_id     CHAR(36)    NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_checkins_ticket (ticket_id),
  KEY ix_checkins_created (created_at),
  CONSTRAINT fk_checkins_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE SET NULL,
  CONSTRAINT fk_checkins_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Histórico de transacções / estados do pedido ----------------------------
CREATE TABLE transaction_history (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id       CHAR(36)     NOT NULL,
  status         VARCHAR(30)  NOT NULL,
  note           VARCHAR(500) NULL,
  actor_user_id  CHAR(36)     NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_th_order (order_id, created_at),
  CONSTRAINT fk_th_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Auditoria --------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     CHAR(36)     NULL,
  user_email  VARCHAR(254) NULL,
  action      VARCHAR(60)  NOT NULL,
  entity      VARCHAR(40)  NOT NULL,
  entity_id   VARCHAR(64)  NULL,
  details     LONGTEXT     NOT NULL,                -- JSON
  ip_hash     CHAR(64)     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_audit_created (created_at),
  KEY ix_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Conteúdos do website ---------------------------------------------------
CREATE TABLE timeline_entries (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  period_label  VARCHAR(80)  NOT NULL,
  title         VARCHAR(160) NOT NULL,
  description   TEXT         NOT NULL,
  image_path    VARCHAR(255) NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  published     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_tl_pub (published, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE members (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  voice         VARCHAR(80)  NOT NULL DEFAULT '',
  period_label  VARCHAR(80)  NOT NULL DEFAULT '',
  is_current    TINYINT(1)   NOT NULL DEFAULT 1,
  bio           TEXT         NOT NULL,
  photo_path    VARCHAR(255) NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  published     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_members_pub (published, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faqs (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  question    VARCHAR(255) NOT NULL,
  answer      TEXT         NOT NULL,
  category    VARCHAR(30)  NOT NULL DEFAULT 'geral',
  sort_order  INT          NOT NULL DEFAULT 0,
  published   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_faqs_pub (published, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Galeria fotográfica e vídeos -------------------------------------------
CREATE TABLE media_items (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  kind          ENUM('foto','video','youtube') NOT NULL,
  section       ENUM('grupo','memorias') NOT NULL DEFAULT 'memorias',
  title         VARCHAR(160) NOT NULL DEFAULT '',
  caption       VARCHAR(500) NOT NULL DEFAULT '',
  storage_path  VARCHAR(255) NULL,
  youtube_id    CHAR(11)     NULL,
  width         INT UNSIGNED NULL,
  height        INT UNSIGNED NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  published     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_media_pub (section, published, sort_order),
  CONSTRAINT ck_media_src CHECK ((kind = 'youtube' AND youtube_id IS NOT NULL) OR (kind <> 'youtube' AND storage_path IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Notificações e emails (fila SMTP) --------------------------------------
CREATE TABLE email_outbox (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template    VARCHAR(40)  NOT NULL,
  to_email    VARCHAR(254) NOT NULL,
  order_id    CHAR(36)     NULL,
  user_id     CHAR(36)     NULL,
  payload     LONGTEXT     NOT NULL,                -- JSON (nunca contém palavras-passe)
  status      ENUM('pendente','a_enviar','enviado','falhou','cancelado') NOT NULL DEFAULT 'pendente',
  attempts    INT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NULL,
  dedupe_key  VARCHAR(80)  NULL,
  locked_at   DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME     NULL,
  UNIQUE KEY uq_outbox_dedupe (dedupe_key),
  KEY ix_outbox_status (status, id),
  CONSTRAINT fk_outbox_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_outbox_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rate limiting --------------------------------------------------------------
CREATE TABLE rate_limits (
  bucket        VARCHAR(40) NOT NULL,
  rl_key        CHAR(64)    NOT NULL,
  window_start  DATETIME    NOT NULL,
  hits          INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, rl_key, window_start),
  KEY ix_rl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Dados de referência
-- =============================================================================
INSERT INTO roles (id, name, description) VALUES
 ('admin', 'Administrador', 'Acesso total à plataforma'),
 ('financeiro', 'Financeiro', 'Pedidos, comprovativos, aprovação de pagamentos e relatórios'),
 ('checkin', 'Operador de check-in', 'Validação de ingressos à entrada');

INSERT INTO permissions (id, description) VALUES
 ('dashboard.view', 'Ver dashboard'),
 ('orders.view', 'Ver inscrições, pedidos e participantes'),
 ('payments.review', 'Analisar, aprovar e rejeitar pagamentos'),
 ('orders.cancel', 'Cancelar pedidos'),
 ('tickets.resend', 'Reenviar ingressos e gerar ligações de acesso'),
 ('checkin.scan', 'Validar ingressos (check-in)'),
 ('ticket_types.manage', 'Gerir categorias, preços, lotes e stock'),
 ('content.manage', 'Gerir conteúdos, galeria, linha do tempo e FAQ'),
 ('settings.manage', 'Gerir configurações do evento'),
 ('emails.manage', 'Gerir fila de emails e SMTP'),
 ('users.manage', 'Gerir utilizadores e perfis'),
 ('audit.view', 'Consultar auditoria'),
 ('reports.view', 'Relatórios financeiros e exportações'),
 ('reports.checkins', 'Exportar registo de check-in');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'admin', id FROM permissions;
INSERT INTO role_permissions (role_id, permission_id) VALUES
 ('financeiro', 'dashboard.view'), ('financeiro', 'orders.view'), ('financeiro', 'payments.review'),
 ('financeiro', 'tickets.resend'), ('financeiro', 'reports.view'),
 ('checkin', 'dashboard.view'), ('checkin', 'checkin.scan');

-- >>> 002_seed_official_data.sql
-- =============================================================================
-- V25 — O LEGADO · Migração 002 — dados oficiais iniciais
-- Apenas informação fornecida pela organização. NÃO cria preços, categorias de
-- ingresso nem marcos históricos (definidos no painel administrativo).
-- =============================================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 20/12/2026 16h00 em Luanda (WAT, UTC+1) = 15h00 UTC
INSERT INTO events (id, name, subtitle, slogan, group_name, starts_at, timezone, venue, address, maps_url,
                    about_text, closing_message, sales_open, sales_closed_message, reservation_hours)
VALUES (1, 'V25 — O LEGADO', '25 Anos de Música, Fé, Amizade e História',
        'Uma história que nos une. Um legado que permanece.', 'Vibes – Grupo Vocal',
        '2026-12-20 15:00:00', 'Africa/Luanda', 'Hotel Brisa Tropical', 'Morro Bento, Luanda, Angola',
        'https://www.google.com/maps/search/?api=1&query=Hotel%20Brisa%20Tropical%2C%20Morro%20Bento%2C%20Luanda',
        'Em 2026, o Vibes – Grupo Vocal celebra 25 anos de uma trajectória marcada pela música, pela fé, pela amizade e por histórias que atravessam gerações.\n\nO V25 — O Legado será muito mais do que um concerto: será um reencontro emocionante entre antigos e actuais integrantes, reunindo vozes, memórias e pessoas que fizeram parte desta caminhada, incluindo membros que regressam de outros países para celebrar este marco especial.\n\nUma tarde única para recordar o passado, celebrar o presente e honrar o legado que continuará a inspirar as próximas gerações.',
        '25 anos. Uma história. Muitas vozes. Um legado.', 0, 'A AGUARDAR ABERTURA DAS VENDAS', 48);

INSERT INTO settings (setting_key, setting_value) VALUES
 ('bank_account_name', '27 LUAS COMUNICACAO E MARKETING SU LDA'),
 ('bank_account_number', '140065995 10 001'),
 ('bank_iban', 'AO06004000004006599510166'),
 ('express_number', '920000000'),
 ('payment_instructions', 'Indique o código do pedido no descritivo da transferência. Após a transferência, carregue o comprovativo (PDF, JPG ou PNG). O pagamento só é considerado confirmado depois da verificação manual pela equipa financeira.'),
 ('contact_email', ''), ('contact_phone', ''), ('socials', '{}'),
 ('copyright_text', ''), ('credits_text', ''), ('privacy_text', ''), ('terms_text', ''),
 ('email_sender_name', 'V25 — O Legado'), ('email_reply_to', '');

INSERT INTO faqs (id, question, answer, category, sort_order, published) VALUES
 ('5611ca10-3bbc-5d49-b744-5f96d7e9c04f', 'Como compro o meu ingresso?', 'Escolha a categoria na secção Ingressos, preencha a inscrição e receberá um código de pedido e os dados bancários. Faça a transferência e carregue o comprovativo na página do seu pedido.', 'bilhetes', 10, 1),
 ('cd0f0681-dbee-5261-a949-0b52b943866e', 'Carregar o comprovativo confirma o meu pagamento?', 'Não. O comprovativo é analisado manualmente pela equipa financeira, que confirma a entrada do valor na conta. Só depois dessa verificação o pagamento é aprovado e o ingresso digital é emitido.', 'pagamentos', 20, 1),
 ('ba17aa1e-29fe-5023-ada8-af5f089f8b5a', 'Que formatos de comprovativo são aceites?', 'PDF, JPG ou PNG, com o máximo de 5 MB. Os comprovativos são guardados de forma privada e apenas a equipa autorizada os pode consultar.', 'comprovativos', 30, 1),
 ('87ac2b78-f987-5681-a858-40d5539adc56', 'Que formas de pagamento estão disponíveis?', 'Transferência bancária ou Transferência Express, para os dados indicados no seu pedido. Indique o código do pedido no descritivo.', 'pagamentos', 40, 1),
 ('4d86d88a-1804-54db-ab43-c5fde02931b1', 'Durante quanto tempo fica o meu lugar reservado?', 'O pedido mantém o lugar reservado durante o prazo indicado na página do pedido. Se o comprovativo não for enviado dentro desse prazo, a reserva expira e os lugares voltam a ficar disponíveis.', 'bilhetes', 50, 1),
 ('226aad81-f48c-5855-86fb-b996328b88e6', 'Como acompanho o estado do meu pedido?', 'Através da ligação segura que recebe ao criar o pedido. Se a perder, use a opção "Consultar pedido" e enviaremos novas ligações para o email usado na inscrição.', 'bilhetes', 60, 1),
 ('3ebfbee4-f12d-5914-a10b-148e530d303a', 'Como entro no evento?', 'Cada ingresso aprovado tem um QR Code individual. Apresente-o à entrada (no telemóvel ou impresso). Cada QR Code só pode ser utilizado uma vez.', 'entradas', 70, 1),
 ('5814ac98-2153-5cc0-a983-62c632b5a44d', 'Quando e onde é o evento?', 'A 20 de Dezembro de 2026, às 16h00, no Hotel Brisa Tropical, Morro Bento, Luanda.', 'evento', 80, 1);

-- Registo das migrações incluídas
INSERT INTO schema_migrations (version) VALUES ('001_initial_schema'), ('002_seed_official_data');
