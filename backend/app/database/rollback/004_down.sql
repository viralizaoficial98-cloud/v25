-- =============================================================================
-- ROLLBACK da migração 004 — remove APENAS a coluna sales_status.
-- As categorias voltam a depender só do interruptor global de vendas, do stock e do período.
-- =============================================================================
SET NAMES utf8mb4;
ALTER TABLE ticket_categories DROP COLUMN sales_status;
DELETE FROM schema_migrations WHERE version = '004_v2_2_estado_vendas_categoria';
