-- =============================================================================
-- V25 — O LEGADO · Funções (RPC), regras de negócio e permissões
-- Convenção de erros: as excepções levantam um código curto em MAIÚSCULAS
-- (ex.: 'ESGOTADO'), traduzido para português no frontend (src/lib/errors.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitários privados
-- -----------------------------------------------------------------------------
create or replace function private.random_code(p_len int)
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(p_len);
  result text := '';
begin
  for i in 0 .. p_len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

create or replace function private.random_token()
returns text language sql volatile as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

create or replace function private.sha256_hex(p text)
returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(p, 'UTF8'), 'sha256'), 'hex');
$$;

-- IP do cliente (cabeçalhos passados pelo PostgREST); devolve hash para não guardar IP em claro.
create or replace function private.client_ip_hash()
returns text language plpgsql stable as $$
declare
  headers json;
  ip text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  ip := coalesce(
    headers ->> 'cf-connecting-ip',
    split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1),
    headers ->> 'x-real-ip');
  ip := nullif(trim(ip), '');
  return private.sha256_hex(coalesce(ip, 'desconhecido'));
end $$;

-- Rate limiting por janela fixa. Levanta 'LIMITE_PEDIDOS' quando excedido.
create or replace function private.hit_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns void language plpgsql security definer set search_path = private, public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into private.rate_limits as r (bucket, key, window_start, hits)
  values (p_bucket, p_key, w, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  if n > p_max then
    raise exception 'LIMITE_PEDIDOS';
  end if;
  -- limpeza oportunista
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
end $$;

-- Assinatura HMAC do conteúdo do QR Code (não contém dados pessoais).
create or replace function private.qr_signature(p_ticket_code text)
returns text language sql stable security definer set search_path = private, public as $$
  select left(translate(encode(extensions.hmac(convert_to('V25|' || p_ticket_code, 'UTF8'),
                                               convert_to(value, 'UTF8'), 'sha256'), 'base64'),
                        '+/=', '-_'), 22)
  from private.app_secrets where name = 'qr_hmac';
$$;

create or replace function private.qr_payload(p_ticket_code text)
returns text language sql stable as $$
  select 'V25:' || p_ticket_code || ':' || private.qr_signature(p_ticket_code);
$$;

-- -----------------------------------------------------------------------------
-- Perfis e permissões
-- -----------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where user_id = auth.uid() and active;
$$;

create or replace function public.has_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                 where user_id = auth.uid() and active and role = any (p_roles));
$$;

create or replace function private.require_role(variadic p_roles text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'NAO_AUTENTICADO';
  end if;
  if not public.has_role(variadic p_roles) then
    raise exception 'SEM_PERMISSAO';
  end if;
end $$;

create or replace function private.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, details)
  values (auth.uid(), (select email::text from public.staff where user_id = auth.uid()),
          p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function private.enqueue_email(p_template text, p_order_id uuid, p_to text,
                                                 p_payload jsonb default '{}'::jsonb, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_outbox (template, order_id, to_email, payload, dedupe_key)
  values (p_template, p_order_id, p_to, coalesce(p_payload, '{}'::jsonb), p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- Expiração de reservas não pagas (liberta stock). Pode ser agendada com pg_cron.
-- -----------------------------------------------------------------------------
create or replace function public.expire_stale_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  o record;
  n int := 0;
begin
  for o in
    select id, ticket_type_id, quantity from public.orders
    where status in ('iniciada', 'aguardando_pagamento', 'rejeitado')
      and expires_at is not null and expires_at < now()
    order by ticket_type_id
    for update skip locked
  loop
    update public.ticket_types set quantity_reserved = quantity_reserved - o.quantity
    where id = o.ticket_type_id;
    update public.orders set status = 'cancelado', cancel_reason = 'Reserva expirada sem comprovativo de pagamento.'
    where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- PÚBLICO: ingressos disponíveis
-- -----------------------------------------------------------------------------
create or replace function public.list_ticket_types()
returns table (
  id uuid, name text, lot_label text, description text, price_kz numeric,
  available integer, quantity_total integer, max_per_order integer, max_per_customer integer,
  persons_per_ticket integer, on_sale boolean, sales_start timestamptz, sales_end timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.lot_label, t.description, t.price_kz,
         greatest(t.quantity_total - t.quantity_reserved - t.quantity_sold, 0),
         t.quantity_total, t.max_per_order, t.max_per_customer, t.persons_per_ticket,
         (s.sales_open and t.price_kz is not null
          and (t.sales_start is null or t.sales_start <= now())
          and (t.sales_end is null or t.sales_end > now())),
         t.sales_start, t.sales_end
  from public.ticket_types t cross join public.event_settings s
  where t.published
  order by t.sort_order, t.price_kz nulls last, t.name;
$$;

-- -----------------------------------------------------------------------------
-- PÚBLICO: criar pedido (COMPRAR INGRESSO / RESERVAR LUGAR)
-- -----------------------------------------------------------------------------
create or replace function public.create_order(
  p_ticket_type_id uuid,
  p_quantity int,
  p_guests_total int,
  p_full_name text,
  p_email text,
  p_phone text,
  p_consent boolean,
  p_consent_version text,
  p_idempotency_key uuid,
  p_mode text default 'compra',
  p_honeypot text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.event_settings;
  t public.ticket_types;
  existing public.orders;
  new_order public.orders;
  ip text := private.client_ip_hash();
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_code text;
  v_token text;
  v_customer_qty int;
begin
  if coalesce(p_honeypot, '') <> '' then
    raise exception 'PEDIDO_INVALIDO';
  end if;
  if p_idempotency_key is null then
    raise exception 'PEDIDO_INVALIDO';
  end if;

  -- Repetição do mesmo envio (duplo clique / rede): devolve o mesmo pedido com novo token.
  select * into existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    v_token := private.random_token();
    insert into public.order_access_tokens (order_id, token_hash) values (existing.id, private.sha256_hex(v_token));
    return jsonb_build_object('order_code', existing.order_code, 'access_token', v_token,
                              'total_kz', existing.total_kz, 'status', existing.status,
                              'expires_at', existing.expires_at, 'replayed', true);
  end if;

  perform private.hit_rate_limit('create_order_ip', ip, 8, 600);
  perform private.hit_rate_limit('create_order_email', v_email, 5, 3600);

  -- Validação (espelha a validação do frontend em src/lib/validation.ts)
  if p_consent is distinct from true then raise exception 'CONSENTIMENTO_OBRIGATORIO'; end if;
  if length(v_name) < 3 or length(v_name) > 120 or v_name !~ '[[:alpha:]].*\s.*[[:alpha:]]' then
    raise exception 'NOME_INVALIDO';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'EMAIL_INVALIDO'; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'TELEFONE_INVALIDO'; end if;
  if v_phone like '+244%' and v_phone !~ '^\+244[29][0-9]{8}$' then raise exception 'TELEFONE_INVALIDO'; end if;
  if p_mode not in ('compra', 'reserva') then raise exception 'PEDIDO_INVALIDO'; end if;

  perform public.expire_stale_orders();

  select * into s from public.event_settings where id = 1;
  -- Bloqueio da linha do ingresso: serializa compras concorrentes do mesmo stock.
  select * into t from public.ticket_types where id = p_ticket_type_id for update;
  if not found or not t.published then raise exception 'INGRESSO_INEXISTENTE'; end if;
  if not s.sales_open or t.price_kz is null
     or (t.sales_start is not null and t.sales_start > now())
     or (t.sales_end is not null and t.sales_end <= now()) then
    raise exception 'VENDAS_FECHADAS';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > t.max_per_order then
    raise exception 'QUANTIDADE_INVALIDA';
  end if;
  if p_guests_total is null or p_guests_total < p_quantity or p_guests_total > p_quantity * t.persons_per_ticket then
    raise exception 'CONVIDADOS_INVALIDO';
  end if;
  if t.quantity_total - t.quantity_reserved - t.quantity_sold < p_quantity then
    raise exception 'ESGOTADO';
  end if;
  if s.capacity is not null and (
       select coalesce(sum(guests_total), 0) from public.orders
       where status not in ('cancelado')) + p_guests_total > s.capacity then
    raise exception 'ESGOTADO';
  end if;

  -- Pedidos repetidos: já existe pedido em aberto para o mesmo email e categoria.
  if exists (select 1 from public.orders
             where email = v_email and ticket_type_id = t.id
               and status in ('iniciada', 'aguardando_pagamento', 'comprovativo_enviado', 'em_analise', 'rejeitado')) then
    raise exception 'PEDIDO_DUPLICADO';
  end if;

  select coalesce(sum(quantity), 0) into v_customer_qty from public.orders
  where email = v_email and ticket_type_id = t.id and status not in ('cancelado');
  if v_customer_qty + p_quantity > t.max_per_customer then
    raise exception 'LIMITE_POR_CLIENTE';
  end if;

  loop
    v_code := 'V25-' || private.random_code(6);
    exit when not exists (select 1 from public.orders where order_code = v_code);
  end loop;

  insert into public.orders (order_code, status, ticket_type_id, quantity, guests_total, unit_price_kz, total_kz,
                             full_name, email, phone, consent_at, consent_version, idempotency_key,
                             created_ip_hash, expires_at)
  values (v_code, case p_mode when 'reserva' then 'iniciada' else 'aguardando_pagamento' end,
          t.id, p_quantity, p_guests_total, t.price_kz, t.price_kz * p_quantity,
          v_name, v_email, v_phone, now(), coalesce(nullif(p_consent_version, ''), 'v1'), p_idempotency_key,
          ip, now() + make_interval(hours => s.reservation_hours))
  returning * into new_order;

  update public.ticket_types set quantity_reserved = quantity_reserved + p_quantity where id = t.id;

  v_token := private.random_token();
  insert into public.order_access_tokens (order_id, token_hash) values (new_order.id, private.sha256_hex(v_token));

  perform private.enqueue_email('pedido_criado', new_order.id, v_email, '{}'::jsonb, 'pedido_criado:' || new_order.id);

  return jsonb_build_object('order_code', new_order.order_code, 'access_token', v_token,
                            'total_kz', new_order.total_kz, 'status', new_order.status,
                            'expires_at', new_order.expires_at, 'replayed', false);
end $$;

-- -----------------------------------------------------------------------------
-- PÚBLICO: acesso seguro ao pedido (código + token)
-- -----------------------------------------------------------------------------
create or replace function private.order_by_token(p_code text, p_token text)
returns public.orders language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
begin
  select o2.* into o
  from public.orders o2
  join public.order_access_tokens a on a.order_id = o2.id
  where o2.order_code = upper(trim(coalesce(p_code, '')))
    and a.token_hash = private.sha256_hex(coalesce(p_token, ''))
    and a.revoked_at is null;
  -- Tokens com 256 bits de entropia: tentativa e erro é inviável. (Contadores de falhas
  -- seriam anulados pelo rollback da excepção, por isso não são usados aqui.)
  if not found then
    raise exception 'ACESSO_INVALIDO';
  end if;
  return o;
end $$;

create or replace function private.mask_email(p text)
returns text language sql immutable as $$
  select case when position('@' in p) > 2
              then left(p, 2) || repeat('•', greatest(position('@' in p) - 3, 1)) || substr(p, position('@' in p))
              else '•' || substr(p, position('@' in p)) end;
$$;

create or replace function public.get_order(p_code text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  s public.event_settings;
  t public.ticket_types;
begin
  perform public.expire_stale_orders();
  o := private.order_by_token(p_code, p_token);
  select * into s from public.event_settings where id = 1;
  select * into t from public.ticket_types where id = o.ticket_type_id;
  return jsonb_build_object(
    'order_code', o.order_code,
    'status', o.status,
    'full_name', o.full_name,
    'email_masked', private.mask_email(o.email::text),
    'phone_masked', left(o.phone, 4) || repeat('•', greatest(length(o.phone) - 7, 1)) || right(o.phone, 3),
    'ticket_type', jsonb_build_object('name', t.name, 'lot_label', t.lot_label, 'persons_per_ticket', t.persons_per_ticket),
    'quantity', o.quantity,
    'guests_total', o.guests_total,
    'unit_price_kz', o.unit_price_kz,
    'total_kz', o.total_kz,
    'expires_at', case when o.status in ('iniciada', 'aguardando_pagamento', 'rejeitado') then o.expires_at end,
    'rejection_reason', case when o.status = 'rejeitado' then o.rejection_reason end,
    'cancel_reason', case when o.status = 'cancelado' then o.cancel_reason end,
    'created_at', o.created_at,
    'payment', jsonb_build_object(
      'account_name', s.bank_account_name, 'account_number', s.bank_account_number,
      'iban', s.bank_iban, 'express_number', s.express_number, 'instructions', s.payment_instructions),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at), '[]')
                from public.order_events e where e.order_id = o.id),
    'proofs', (select coalesce(jsonb_agg(jsonb_build_object('uploaded_at', p.uploaded_at, 'status', p.status,
                                                            'mime_type', p.mime_type) order by p.uploaded_at), '[]')
               from public.payment_proofs p where p.order_id = o.id),
    'tickets', case when o.status = 'emitido' then
                 (select coalesce(jsonb_agg(jsonb_build_object(
                    'ticket_code', k.ticket_code, 'seq', k.seq, 'holder_name', k.holder_name,
                    'status', k.status, 'qr_payload', private.qr_payload(k.ticket_code),
                    'checked_in_at', k.checked_in_at) order by k.seq), '[]')
                  from public.tickets k where k.order_id = o.id)
               else '[]'::jsonb end
  );
end $$;

-- Converter uma reserva em compra (RESERVAR → pagar)
create or replace function public.confirm_reservation(p_code text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
begin
  o := private.order_by_token(p_code, p_token);
  select * into o from public.orders where id = o.id for update;
  if o.status <> 'iniciada' then raise exception 'ESTADO_INVALIDO'; end if;
  update public.orders set status = 'aguardando_pagamento' where id = o.id;
  return jsonb_build_object('status', 'aguardando_pagamento');
end $$;

-- Cancelamento pelo cliente (apenas antes da validação do pagamento)
create or replace function public.cancel_order(p_code text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
begin
  o := private.order_by_token(p_code, p_token);
  select * into o from public.orders where id = o.id for update;
  if o.status not in ('iniciada', 'aguardando_pagamento', 'rejeitado') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  update public.ticket_types set quantity_reserved = quantity_reserved - o.quantity where id = o.ticket_type_id;
  update public.orders set status = 'cancelado', cancel_reason = 'Cancelado pelo cliente.' where id = o.id;
  return jsonb_build_object('status', 'cancelado');
end $$;

-- Recuperar acesso: envia por email novas ligações seguras para os pedidos desse endereço.
-- Responde sempre da mesma forma para não revelar se o email existe.
create or replace function public.request_order_access(p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  o record;
begin
  perform private.hit_rate_limit('access_ip', private.client_ip_hash(), 5, 900);
  perform private.hit_rate_limit('access_email', v_email, 3, 3600);
  for o in select id from public.orders where email = v_email and created_at > now() - interval '1 year' loop
    perform private.enqueue_email('acesso_pedido', o.id, v_email, '{}'::jsonb, null);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------------------
-- PÚBLICO: comprovativos (upload em 2 passos para bucket privado)
-- -----------------------------------------------------------------------------
create or replace function public.begin_proof_upload(p_code text, p_token text, p_mime text, p_size int, p_sha256 text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  ext text;
  v_path text;
  slot_id uuid;
begin
  o := private.order_by_token(p_code, p_token);
  perform private.hit_rate_limit('proof_upload', o.id::text, 10, 3600);
  if o.status not in ('iniciada', 'aguardando_pagamento', 'rejeitado') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  ext := case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' end;
  if ext is null then raise exception 'FICHEIRO_TIPO_INVALIDO'; end if;
  if p_size is null or p_size < 1 or p_size > 5 * 1024 * 1024 then raise exception 'FICHEIRO_DEMASIADO_GRANDE'; end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'PEDIDO_INVALIDO'; end if;
  if p_sha256 is not null and exists (
       select 1 from public.payment_proofs p where p.sha256 = p_sha256 and p.order_id <> o.id) then
    raise exception 'COMPROVATIVO_REUTILIZADO';
  end if;

  v_path := 'orders/' || o.id || '/' || gen_random_uuid() || '.' || ext;
  insert into public.proof_upload_slots (order_id, storage_path, mime_type, size_bytes, sha256, expires_at)
  values (o.id, v_path, p_mime, p_size, p_sha256, now() + interval '15 minutes')
  returning id into slot_id;
  return jsonb_build_object('path', v_path, 'slot_id', slot_id);
end $$;

create or replace function public.complete_proof_upload(p_code text, p_token text, p_path text)
returns jsonb language plpgsql volatile security definer set search_path = public, storage as $$
declare
  o public.orders;
  sl public.proof_upload_slots;
  obj record;
begin
  o := private.order_by_token(p_code, p_token);
  select * into o from public.orders where id = o.id for update;
  select * into sl from public.proof_upload_slots
  where order_id = o.id and storage_path = p_path for update;
  if not found or sl.used_at is not null then raise exception 'UPLOAD_INVALIDO'; end if;
  if o.status not in ('iniciada', 'aguardando_pagamento', 'rejeitado') then raise exception 'ESTADO_INVALIDO'; end if;

  select name, metadata into obj from storage.objects where bucket_id = 'proofs' and name = p_path;
  if not found then raise exception 'UPLOAD_NAO_ENCONTRADO'; end if;
  if coalesce(obj.metadata ->> 'mimetype', sl.mime_type) not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'FICHEIRO_TIPO_INVALIDO';
  end if;
  if coalesce((obj.metadata ->> 'size')::bigint, sl.size_bytes) > 5 * 1024 * 1024 then
    raise exception 'FICHEIRO_DEMASIADO_GRANDE';
  end if;

  update public.proof_upload_slots set used_at = now() where id = sl.id;
  insert into public.payment_proofs (order_id, storage_path, mime_type, size_bytes, sha256, duplicate_of)
  values (o.id, p_path, coalesce(obj.metadata ->> 'mimetype', sl.mime_type),
          coalesce((obj.metadata ->> 'size')::int, sl.size_bytes), sl.sha256,
          (select p.order_id from public.payment_proofs p where p.sha256 = sl.sha256 and p.order_id <> o.id limit 1));
  -- Um comprovativo NÃO confirma o pagamento: o pedido apenas passa a aguardar análise manual.
  update public.orders set status = 'comprovativo_enviado', expires_at = null, rejection_reason = null where id = o.id;
  perform private.enqueue_email('comprovativo_recebido', o.id, o.email::text, '{}'::jsonb, 'comprovativo:' || sl.id);
  return jsonb_build_object('status', 'comprovativo_enviado');
end $$;

-- -----------------------------------------------------------------------------
-- ADMIN / FINANCEIRO: análise, aprovação, rejeição, emissão
-- -----------------------------------------------------------------------------
create or replace function public.admin_mark_in_review(p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_role('admin', 'financeiro');
  update public.orders set status = 'em_analise'
  where id = p_order_id and status = 'comprovativo_enviado';
  if found then
    perform private.audit('pedido.em_analise', 'order', p_order_id::text);
  end if;
end $$;

create or replace function private.issue_tickets(p_order public.orders)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text;
  n int := 0;
begin
  for i in 1 .. p_order.quantity loop
    if not exists (select 1 from public.tickets where order_id = p_order.id and seq = i) then
      loop
        v_code := 'T-' || private.random_code(8);
        exit when not exists (select 1 from public.tickets where ticket_code = v_code);
      end loop;
      insert into public.tickets (order_id, ticket_type_id, ticket_code, seq, holder_name)
      values (p_order.id, p_order.ticket_type_id, v_code, i, p_order.full_name);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.admin_approve_order(p_order_id uuid, p_payment_reference text,
                                                      p_amount_confirmed numeric, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_ref text := upper(regexp_replace(coalesce(p_payment_reference, ''), '[^A-Za-z0-9]', '', 'g'));
  issued int;
begin
  perform private.require_role('admin', 'financeiro');
  -- Bloqueio do pedido: duas aprovações simultâneas são serializadas.
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;

  -- Idempotência: um pedido já aprovado/emitido não é processado de novo.
  if o.status in ('aprovado', 'emitido') then
    return jsonb_build_object('status', o.status, 'already_processed', true);
  end if;
  if o.status not in ('comprovativo_enviado', 'em_analise') then raise exception 'ESTADO_INVALIDO'; end if;
  if length(v_ref) < 4 then raise exception 'REFERENCIA_OBRIGATORIA'; end if;
  if exists (select 1 from public.orders
             where upper(regexp_replace(payment_reference, '[^A-Za-z0-9]', '', 'g')) = v_ref and id <> o.id) then
    raise exception 'REFERENCIA_REUTILIZADA';
  end if;
  if p_amount_confirmed is null or p_amount_confirmed <> o.total_kz then
    raise exception 'VALOR_NAO_CONFERE';
  end if;

  update public.orders set status = 'aprovado', payment_reference = v_ref, amount_confirmed_kz = p_amount_confirmed,
         reviewed_by = auth.uid(), reviewed_at = now(), expires_at = null
  where id = o.id;
  update public.payment_proofs set status = 'aceite' where order_id = o.id and status = 'pendente';
  update public.ticket_types set quantity_reserved = quantity_reserved - o.quantity,
                                 quantity_sold = quantity_sold + o.quantity
  where id = o.ticket_type_id;

  issued := private.issue_tickets(o);
  update public.orders set status = 'emitido' where id = o.id;

  perform private.enqueue_email('pagamento_aprovado', o.id, o.email::text, '{}'::jsonb, 'aprovado:' || o.id);
  perform private.enqueue_email('ingresso_disponivel', o.id, o.email::text, '{}'::jsonb, 'ingresso:' || o.id);
  perform private.audit('pagamento.aprovado', 'order', o.id::text,
    jsonb_build_object('order_code', o.order_code, 'referencia', v_ref, 'valor', p_amount_confirmed,
                       'ingressos', issued, 'nota', p_note));
  return jsonb_build_object('status', 'emitido', 'tickets_issued', issued, 'already_processed', false);
end $$;

create or replace function public.admin_reject_order(p_order_id uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  s public.event_settings;
begin
  perform private.require_role('admin', 'financeiro');
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if o.status = 'rejeitado' then return jsonb_build_object('status', 'rejeitado', 'already_processed', true); end if;
  if o.status not in ('comprovativo_enviado', 'em_analise') then raise exception 'ESTADO_INVALIDO'; end if;
  select * into s from public.event_settings where id = 1;
  -- O lugar continua reservado durante uma nova janela, para o cliente enviar comprovativo correcto.
  update public.orders set status = 'rejeitado', rejection_reason = trim(p_reason),
         reviewed_by = auth.uid(), reviewed_at = now(),
         expires_at = now() + make_interval(hours => s.reservation_hours)
  where id = o.id;
  update public.payment_proofs set status = 'rejeitado' where order_id = o.id and status = 'pendente';
  perform private.enqueue_email('pagamento_rejeitado', o.id, o.email::text,
                                jsonb_build_object('motivo', trim(p_reason)), null);
  perform private.audit('pagamento.rejeitado', 'order', o.id::text,
                        jsonb_build_object('order_code', o.order_code, 'motivo', trim(p_reason)));
  return jsonb_build_object('status', 'rejeitado', 'already_processed', false);
end $$;

create or replace function public.admin_cancel_order(p_order_id uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
begin
  perform private.require_role('admin');
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if o.status = 'cancelado' then return jsonb_build_object('status', 'cancelado', 'already_processed', true); end if;
  if exists (select 1 from public.tickets where order_id = o.id and status = 'utilizado') then
    raise exception 'INGRESSO_JA_UTILIZADO';
  end if;
  if o.status in ('aprovado', 'emitido') then
    update public.ticket_types set quantity_sold = quantity_sold - o.quantity where id = o.ticket_type_id;
  else
    update public.ticket_types set quantity_reserved = quantity_reserved - o.quantity where id = o.ticket_type_id;
  end if;
  update public.tickets set status = 'anulado' where order_id = o.id and status = 'valido';
  update public.orders set status = 'cancelado', cancel_reason = trim(p_reason) where id = o.id;
  perform private.enqueue_email('pedido_cancelado', o.id, o.email::text, jsonb_build_object('motivo', trim(p_reason)), null);
  perform private.audit('pedido.cancelado', 'order', o.id::text,
                        jsonb_build_object('order_code', o.order_code, 'motivo', trim(p_reason), 'estado_anterior', o.status));
  return jsonb_build_object('status', 'cancelado', 'already_processed', false);
end $$;

create or replace function public.admin_resend_tickets(p_order_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
begin
  perform private.require_role('admin', 'financeiro');
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  if o.status <> 'emitido' then raise exception 'ESTADO_INVALIDO'; end if;
  perform private.enqueue_email('ingresso_disponivel', o.id, o.email::text, jsonb_build_object('reenvio', true), null);
  perform private.audit('ingresso.reenviado', 'order', o.id::text, jsonb_build_object('order_code', o.order_code));
  return jsonb_build_object('ok', true);
end $$;

-- Ligação segura (para a equipa partilhar com o cliente, ex.: por telefone/WhatsApp)
create or replace function public.admin_issue_access_link(p_order_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_token text := private.random_token();
begin
  perform private.require_role('admin', 'financeiro');
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;
  insert into public.order_access_tokens (order_id, token_hash) values (o.id, private.sha256_hex(v_token));
  perform private.audit('pedido.link_gerado', 'order', o.id::text, jsonb_build_object('order_code', o.order_code));
  return jsonb_build_object('order_code', o.order_code, 'access_token', v_token);
end $$;

-- Usado APENAS pela Edge Function de envio de emails (service_role)
create or replace function public.service_issue_access_token(p_order_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_token text := private.random_token();
begin
  insert into public.order_access_tokens (order_id, token_hash) values (p_order_id, private.sha256_hex(v_token));
  return v_token;
end $$;

create or replace function public.service_order_email_context(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_code', o.order_code, 'status', o.status, 'full_name', o.full_name,
    'quantity', o.quantity, 'guests_total', o.guests_total, 'total_kz', o.total_kz,
    'expires_at', o.expires_at, 'rejection_reason', o.rejection_reason,
    'ticket_type', t.name, 'lot_label', t.lot_label,
    'event', jsonb_build_object('name', s.event_name, 'starts_at', s.starts_at, 'venue', s.venue,
                                'address', s.address, 'maps_url', s.maps_url, 'timezone', s.timezone),
    'payment', jsonb_build_object('account_name', s.bank_account_name, 'account_number', s.bank_account_number,
                                  'iban', s.bank_iban, 'express_number', s.express_number),
    'sender', jsonb_build_object('name', s.email_sender_name, 'reply_to', s.email_reply_to,
                                 'contact_email', s.contact_email, 'contact_phone', s.contact_phone),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object('ticket_code', k.ticket_code, 'seq', k.seq,
                                                             'qr_payload', private.qr_payload(k.ticket_code)) order by k.seq), '[]')
                from public.tickets k where k.order_id = o.id and k.status = 'valido'))
  from public.orders o
  join public.ticket_types t on t.id = o.ticket_type_id
  cross join public.event_settings s
  where o.id = p_order_id;
$$;

-- Lembrete do evento: coloca na fila um email por pedido emitido (sem duplicar)
create or replace function public.admin_queue_event_reminders()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  n int;
begin
  perform private.require_role('admin');
  insert into public.email_outbox (template, order_id, to_email, dedupe_key)
  select 'lembrete_evento', o.id, o.email, 'lembrete:' || o.id
  from public.orders o where o.status = 'emitido'
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  perform private.audit('email.lembretes', 'email_outbox', null, jsonb_build_object('enfileirados', n));
  return n;
end $$;

create or replace function public.admin_queue_test_email(p_to text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_role('admin');
  perform private.enqueue_email('teste_smtp', null, lower(trim(p_to)), '{}'::jsonb, null);
  perform private.audit('email.teste', 'email_outbox', null, jsonb_build_object('para', p_to));
end $$;

create or replace function public.admin_retry_email(p_id bigint)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_role('admin');
  update public.email_outbox set status = 'pendente', last_error = null where id = p_id and status in ('falhou', 'cancelado');
end $$;

-- -----------------------------------------------------------------------------
-- CHECK-IN (admin + operador de check-in)
-- -----------------------------------------------------------------------------
create or replace function public.checkin_ticket(p_input text, p_commit boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_in text := upper(trim(coalesce(p_input, '')));
  v_code text;
  v_sig text;
  k public.tickets;
  o public.orders;
  t public.ticket_types;
  staff_name text;
  v_result text;
begin
  perform private.require_role('admin', 'checkin');
  perform private.hit_rate_limit('checkin', auth.uid()::text, 120, 60);

  if v_in like 'V25:%' then
    -- QR Code: V25:<código>:<assinatura>. A assinatura é sensível a maiúsculas.
    v_code := split_part(v_in, ':', 2);
    v_sig := split_part(trim(p_input), ':', 3);
    if v_sig is distinct from private.qr_signature(v_code) then
      insert into public.checkin_log (input_code, result, staff_id) values (left(v_code, 20), 'assinatura_invalida', auth.uid());
      return jsonb_build_object('result', 'invalido', 'message', 'QR Code inválido ou adulterado.');
    end if;
  else
    v_code := v_in;
  end if;

  select * into k from public.tickets where ticket_code = v_code for update;
  if not found then
    insert into public.checkin_log (input_code, result, staff_id) values (left(v_code, 20), 'inexistente', auth.uid());
    return jsonb_build_object('result', 'invalido', 'message', 'Ingresso não encontrado.');
  end if;
  select * into o from public.orders where id = k.order_id;
  select * into t from public.ticket_types where id = k.ticket_type_id;

  if k.status = 'utilizado' then
    select coalesce(nullif(full_name, ''), email::text) into staff_name from public.staff where user_id = k.checked_in_by;
    v_result := 'ja_utilizado';
  elsif k.status = 'anulado' or o.status <> 'emitido' then
    v_result := 'anulado';
  elsif p_commit then
    update public.tickets set status = 'utilizado', checked_in_at = now(), checked_in_by = auth.uid()
    where id = k.id returning * into k;
    v_result := 'ok';
  else
    v_result := 'valido';
  end if;

  insert into public.checkin_log (ticket_id, input_code, result, staff_id) values (k.id, k.ticket_code, v_result, auth.uid());
  return jsonb_build_object(
    'result', v_result,
    'ticket_code', k.ticket_code,
    'holder_name', k.holder_name,
    'seq', k.seq,
    'order_quantity', o.quantity,
    'ticket_type', t.name,
    'persons_per_ticket', t.persons_per_ticket,
    'checked_in_at', k.checked_in_at,
    'checked_in_by', staff_name);
end $$;

-- -----------------------------------------------------------------------------
-- DASHBOARD
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform private.require_role('admin', 'financeiro', 'checkin');
  perform public.expire_stale_orders();
  select jsonb_build_object(
    'orders_total', (select count(*) from public.orders),
    'orders_pending_payment', (select count(*) from public.orders where status in ('iniciada', 'aguardando_pagamento')),
    'proofs_in_review', (select count(*) from public.orders where status in ('comprovativo_enviado', 'em_analise')),
    'payments_approved', (select count(*) from public.orders where status in ('aprovado', 'emitido')),
    'payments_rejected', (select count(*) from public.orders where status = 'rejeitado'),
    'orders_cancelled', (select count(*) from public.orders where status = 'cancelado'),
    'tickets_issued', (select count(*) from public.tickets where status <> 'anulado'),
    'tickets_used', (select count(*) from public.tickets where status = 'utilizado'),
    'revenue_confirmed_kz', case when public.has_role('admin', 'financeiro')
                              then (select coalesce(sum(amount_confirmed_kz), 0) from public.orders where status in ('aprovado', 'emitido'))
                            end,
    'guests_confirmed', (select coalesce(sum(guests_total), 0) from public.orders where status in ('aprovado', 'emitido')),
    'capacity', (select capacity from public.event_settings where id = 1),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', id, 'name', name, 'lot_label', lot_label, 'price_kz', price_kz, 'total', quantity_total,
                  'reserved', quantity_reserved, 'sold', quantity_sold,
                  'available', quantity_total - quantity_reserved - quantity_sold, 'published', published)
                  order by sort_order), '[]') from public.ticket_types)
  ) into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- GESTÃO DE EQUIPA
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_staff(p_email text, p_role text, p_full_name text default '', p_active boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  uid uuid;
begin
  perform private.require_role('admin');
  if p_role not in ('admin', 'financeiro', 'checkin') then raise exception 'PERFIL_INVALIDO'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'UTILIZADOR_INEXISTENTE'; end if;
  if uid = auth.uid() and (p_role <> 'admin' or not p_active) then raise exception 'NAO_PODE_REMOVER_PROPRIO'; end if;
  insert into public.staff (user_id, email, full_name, role, active)
  values (uid, lower(trim(p_email)), coalesce(p_full_name, ''), p_role, p_active)
  on conflict (user_id) do update set role = excluded.role, active = excluded.active,
    full_name = case when excluded.full_name <> '' then excluded.full_name else public.staff.full_name end;
  perform private.audit('equipa.definida', 'staff', uid::text, jsonb_build_object('email', p_email, 'perfil', p_role, 'activo', p_active));
  return jsonb_build_object('user_id', uid);
end $$;

-- Primeiro administrador: executar no SQL Editor do Supabase (não acessível pela API).
create or replace function public.bootstrap_admin(p_email text)
returns void language plpgsql volatile security definer set search_path = public, auth as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'UTILIZADOR_INEXISTENTE'; end if;
  insert into public.staff (user_id, email, role) values (uid, lower(trim(p_email)), 'admin')
  on conflict (user_id) do update set role = 'admin', active = true;
end $$;

-- -----------------------------------------------------------------------------
-- Auditoria automática de alterações de configuração e preços
-- -----------------------------------------------------------------------------
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.audit(lower(tg_op), tg_table_name,
    coalesce(case when tg_op = 'DELETE' then old.id::text else new.id::text end, ''),
    case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new))
         when tg_op = 'DELETE' then jsonb_build_object('antes', to_jsonb(old))
         else jsonb_build_object('depois', to_jsonb(new)) end);
  return coalesce(new, old);
end $$;

create trigger audit_ticket_types_ins_del after insert or delete on public.ticket_types
for each row execute function private.audit_row_change();
-- Alterações de stock feitas pelas funções de venda não são registadas aqui (já têm auditoria própria).
create trigger audit_ticket_types_upd after update on public.ticket_types
for each row when (
  (old.name, old.lot_label, old.description, old.price_kz, old.quantity_total, old.max_per_order,
   old.max_per_customer, old.persons_per_ticket, old.sales_start, old.sales_end, old.published, old.sort_order)
  is distinct from
  (new.name, new.lot_label, new.description, new.price_kz, new.quantity_total, new.max_per_order,
   new.max_per_customer, new.persons_per_ticket, new.sales_start, new.sales_end, new.published, new.sort_order))
execute function private.audit_row_change();
create trigger audit_settings after update on public.event_settings
for each row execute function private.audit_row_change();

-- =============================================================================
-- PERMISSÕES DE EXECUÇÃO
-- =============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

grant execute on function public.list_ticket_types() to anon, authenticated;
grant execute on function public.create_order(uuid, int, int, text, text, text, boolean, text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_order(text, text) to anon, authenticated;
grant execute on function public.confirm_reservation(text, text) to anon, authenticated;
grant execute on function public.cancel_order(text, text) to anon, authenticated;
grant execute on function public.request_order_access(text) to anon, authenticated;
grant execute on function public.begin_proof_upload(text, text, text, int, text) to anon, authenticated;
grant execute on function public.complete_proof_upload(text, text, text) to anon, authenticated;

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.has_role(text[]) to anon, authenticated;
grant execute on function public.admin_mark_in_review(uuid) to authenticated;
grant execute on function public.admin_approve_order(uuid, text, numeric, text) to authenticated;
grant execute on function public.admin_reject_order(uuid, text) to authenticated;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;
grant execute on function public.admin_resend_tickets(uuid) to authenticated;
grant execute on function public.admin_issue_access_link(uuid) to authenticated;
grant execute on function public.admin_queue_event_reminders() to authenticated;
grant execute on function public.admin_queue_test_email(text) to authenticated;
grant execute on function public.admin_retry_email(bigint) to authenticated;
grant execute on function public.checkin_ticket(text, boolean) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_set_staff(text, text, text, boolean) to authenticated;

grant execute on function public.service_issue_access_token(uuid) to service_role;
grant execute on function public.service_order_email_context(uuid) to service_role;
grant execute on function public.expire_stale_orders() to service_role;
-- bootstrap_admin: sem grants (apenas postgres / SQL Editor)
