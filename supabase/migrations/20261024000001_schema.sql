-- =============================================================================
-- V25 — O LEGADO · Esquema base
-- Supabase PostgreSQL (>= 15). Todas as operações críticas (criação de pedidos,
-- aprovação de pagamentos, emissão de ingressos e check-in) são feitas por
-- funções SECURITY DEFINER (ver migração seguinte). As tabelas sensíveis não têm
-- políticas de escrita para anon/authenticated.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- O schema "private" não é exposto pela API (PostgREST expõe apenas "public").

-- -----------------------------------------------------------------------------
-- Equipa e perfis
-- -----------------------------------------------------------------------------
create table public.staff (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null unique,
  full_name   text not null default '',
  role        text not null check (role in ('admin', 'financeiro', 'checkin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Configuração do evento (linha única, id = 1)
-- -----------------------------------------------------------------------------
create table public.event_settings (
  id                    smallint primary key default 1 check (id = 1),
  event_name            text not null default 'V25 — O LEGADO',
  subtitle              text not null default '25 Anos de Música, Fé, Amizade e História',
  slogan                text not null default 'Uma história que nos une. Um legado que permanece.',
  group_name            text not null default 'Vibes – Grupo Vocal',
  starts_at             timestamptz not null default '2026-12-20 16:00:00+01',
  timezone              text not null default 'Africa/Luanda',
  venue                 text not null default 'Hotel Brisa Tropical',
  address               text not null default 'Morro Bento, Luanda, Angola',
  maps_url              text not null default 'https://www.google.com/maps/search/?api=1&query=Hotel%20Brisa%20Tropical%2C%20Morro%20Bento%2C%20Luanda',
  about_text            text not null default '',
  closing_message       text not null default '25 anos. Uma história. Muitas vozes. Um legado.',
  -- Vendas
  sales_open            boolean not null default false,
  sales_closed_message  text not null default 'A AGUARDAR ABERTURA DAS VENDAS',
  capacity              integer check (capacity is null or capacity > 0),
  reservation_hours     integer not null default 48 check (reservation_hours between 1 and 720),
  -- Pagamento manual
  bank_account_name     text not null default '',
  bank_account_number   text not null default '',
  bank_iban             text not null default '',
  express_number        text not null default '',
  payment_instructions  text not null default '',
  -- Contactos, rodapé e textos legais
  contact_email         text not null default '',
  contact_phone         text not null default '',
  socials               jsonb not null default '{}'::jsonb,
  copyright_text        text not null default '',
  credits_text          text not null default '',
  privacy_text          text not null default '',
  terms_text            text not null default '',
  email_sender_name     text not null default 'V25 — O Legado',
  email_reply_to        text not null default '',
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

-- -----------------------------------------------------------------------------
-- Ingressos (categorias / lotes) e stock
-- -----------------------------------------------------------------------------
create table public.ticket_types (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) between 2 and 80),
  lot_label           text not null default '',           -- ex.: "1.º Lote"
  description         text not null default '',
  price_kz            numeric(14, 2) check (price_kz is null or price_kz > 0),
  quantity_total      integer not null default 0 check (quantity_total >= 0),
  quantity_reserved   integer not null default 0 check (quantity_reserved >= 0),
  quantity_sold       integer not null default 0 check (quantity_sold >= 0),
  max_per_order       integer not null default 4 check (max_per_order between 1 and 100),
  max_per_customer    integer not null default 10 check (max_per_customer between 1 and 500),
  persons_per_ticket  integer not null default 1 check (persons_per_ticket between 1 and 50),
  sales_start         timestamptz,
  sales_end           timestamptz,
  published           boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint stock_ok check (quantity_reserved + quantity_sold <= quantity_total),
  constraint published_requires_price check (not published or price_kz is not null)
);

-- -----------------------------------------------------------------------------
-- Pedidos / inscrições
-- -----------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_code          text not null unique,
  status              text not null default 'aguardando_pagamento' check (status in (
                        'iniciada', 'aguardando_pagamento', 'comprovativo_enviado', 'em_analise',
                        'aprovado', 'rejeitado', 'cancelado', 'emitido')),
  ticket_type_id      uuid not null references public.ticket_types (id),
  quantity            integer not null check (quantity > 0),
  guests_total        integer not null check (guests_total > 0),
  unit_price_kz       numeric(14, 2) not null check (unit_price_kz > 0),
  total_kz            numeric(14, 2) not null check (total_kz > 0),
  full_name           text not null check (length(full_name) between 3 and 120),
  email               extensions.citext not null,
  phone               text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  consent_at          timestamptz not null,
  consent_version     text not null,
  idempotency_key     uuid not null unique,
  created_ip_hash     text,
  expires_at          timestamptz,
  payment_reference   text,
  amount_confirmed_kz numeric(14, 2),
  rejection_reason    text,
  cancel_reason       text,
  reviewed_by         uuid references auth.users (id),
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index orders_status_idx on public.orders (status);
create index orders_email_idx on public.orders (email);
create index orders_created_idx on public.orders (created_at desc);
-- A mesma referência bancária não pode validar dois pedidos (evita reutilização de transacções)
create unique index orders_payment_reference_uniq
  on public.orders (upper(regexp_replace(payment_reference, '[^A-Za-z0-9]', '', 'g')))
  where payment_reference is not null;

-- Tokens de acesso do cliente (guardados apenas como hash SHA-256)
create table public.order_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- Histórico de estados do pedido
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      text not null,
  note        text,
  actor_id    uuid,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- -----------------------------------------------------------------------------
-- Comprovativos (ficheiros no bucket privado "proofs")
-- -----------------------------------------------------------------------------
create table public.proof_upload_slots (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  storage_path  text not null unique,
  mime_type     text not null,
  size_bytes    integer not null,
  sha256        text,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table public.payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  storage_path  text not null unique,
  mime_type     text not null,
  size_bytes    integer not null,
  sha256        text,
  duplicate_of  uuid references public.orders (id),  -- aviso: mesmo ficheiro usado noutro pedido
  status        text not null default 'pendente' check (status in ('pendente', 'aceite', 'rejeitado')),
  uploaded_at   timestamptz not null default now()
);
create index payment_proofs_order_idx on public.payment_proofs (order_id);
create index payment_proofs_sha_idx on public.payment_proofs (sha256);

-- -----------------------------------------------------------------------------
-- Ingressos emitidos e check-in
-- -----------------------------------------------------------------------------
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  ticket_type_id  uuid not null references public.ticket_types (id),
  ticket_code     text not null unique,
  seq             integer not null,
  holder_name     text not null,
  status          text not null default 'valido' check (status in ('valido', 'utilizado', 'anulado')),
  issued_at       timestamptz not null default now(),
  checked_in_at   timestamptz,
  checked_in_by   uuid references auth.users (id),
  unique (order_id, seq)
);

create table public.checkin_log (
  id          bigint generated always as identity primary key,
  ticket_id   uuid references public.tickets (id) on delete set null,
  input_code  text,
  result      text not null,
  staff_id    uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Conteúdos da página
-- -----------------------------------------------------------------------------
create table public.timeline_entries (
  id            uuid primary key default gen_random_uuid(),
  period_label  text not null,            -- texto livre (ex.: "2001", "Início") — nada é inventado
  title         text not null,
  description   text not null default '',
  image_path    text,                     -- caminho no bucket público "media"
  sort_order    integer not null default 0,
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.media_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('foto', 'video', 'youtube')),
  section       text not null default 'memorias' check (section in ('grupo', 'memorias')),
  title         text not null default '',
  caption       text not null default '',
  storage_path  text,                     -- foto/vídeo no bucket "media"
  youtube_id    text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  width         integer,
  height        integer,
  sort_order    integer not null default 0,
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint media_source check (
    (kind = 'youtube' and youtube_id is not null) or (kind <> 'youtube' and storage_path is not null))
);

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  voice         text not null default '',
  period_label  text not null default '',
  is_current    boolean not null default true,
  bio           text not null default '',
  photo_path    text,
  sort_order    integer not null default 0,
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  category    text not null default 'geral',
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Emails (fila processada pela Edge Function "send-emails")
-- -----------------------------------------------------------------------------
create table public.email_outbox (
  id           bigint generated always as identity primary key,
  template     text not null check (template in (
                 'pedido_criado', 'comprovativo_recebido', 'pagamento_aprovado',
                 'pagamento_rejeitado', 'ingresso_disponivel', 'lembrete_evento',
                 'acesso_pedido', 'pedido_cancelado', 'teste_smtp')),
  to_email     extensions.citext not null,
  order_id     uuid references public.orders (id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pendente' check (status in ('pendente', 'a_enviar', 'enviado', 'falhou', 'cancelado')),
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  dedupe_key   text unique
);
create index email_outbox_status_idx on public.email_outbox (status, created_at);

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- Privado: segredos, rate limiting
-- -----------------------------------------------------------------------------
create table private.app_secrets (
  name   text primary key,
  value  text not null
);
-- Segredo HMAC para assinar o conteúdo dos QR Codes (gerado na base de dados; nunca sai dela)
insert into private.app_secrets (name, value)
values ('qr_hmac', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict do nothing;

create table private.rate_limits (
  bucket        text not null,
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, key, window_start)
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger staff_touch before update on public.staff for each row execute function private.touch_updated_at();
create trigger settings_touch before update on public.event_settings for each row execute function private.touch_updated_at();
create trigger ticket_types_touch before update on public.ticket_types for each row execute function private.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function private.touch_updated_at();
create trigger timeline_touch before update on public.timeline_entries for each row execute function private.touch_updated_at();

-- Histórico de estado automático
create or replace function private.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, note, actor_id)
    values (new.id, new.status,
            case new.status
              when 'rejeitado' then new.rejection_reason
              when 'cancelado' then new.cancel_reason
              else null end,
            auth.uid());
  end if;
  return new;
end $$;
create trigger orders_status_history after insert or update of status on public.orders
for each row execute function private.log_order_status();

insert into public.event_settings (id) values (1) on conflict do nothing;
