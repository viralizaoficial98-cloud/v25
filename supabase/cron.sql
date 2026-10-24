-- =============================================================================
-- OPCIONAL — agendamentos com pg_cron + pg_net (Supabase → Database → Extensions).
-- Executar no SQL Editor DEPOIS de activar as extensões e substituir os valores <...>.
-- Não é uma migração: contém a URL do projecto e a service_role key.
-- Recomendado: guardar a key no Vault em vez de a escrever aqui.
-- =============================================================================

-- 1) Libertar reservas expiradas a cada 10 minutos
select cron.schedule('v25-expirar-reservas', '*/10 * * * *', $$ select public.expire_stale_orders(); $$);

-- 2) Processar a fila de emails a cada 2 minutos
select cron.schedule('v25-enviar-emails', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
    body := '{"action":"process"}'::jsonb);
$$);

-- Para remover: select cron.unschedule('v25-enviar-emails');
