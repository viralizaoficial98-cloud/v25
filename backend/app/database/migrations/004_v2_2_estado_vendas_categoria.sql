-- =============================================================================
-- V25 — O LEGADO · Migração 004 — versão 2.2: estado de venda por categoria
-- INCREMENTAL: acrescenta apenas a coluna sales_status a ticket_categories.
-- Valor por omissão 'abertas' = comportamento igual ao da v2.1 (a venda continua a
-- depender do interruptor global, do stock, do período e da validação dos dados bancários).
-- Não altera preços, stock, pedidos, pagamentos, ingressos nem utilizadores.
-- Reverter: database/rollback/004_down.sql
-- =============================================================================
SET NAMES utf8mb4;

-- abertas   = a categoria pode vender (se todas as outras condições se verificarem)
-- suspensas = venda interrompida pela organização (mensagem “Vendas suspensas”)
-- esgotadas = marcada como esgotada pela organização, mesmo que ainda haja stock
ALTER TABLE ticket_categories
  ADD COLUMN sales_status ENUM('abertas','suspensas','esgotadas') NOT NULL DEFAULT 'abertas' AFTER published;
