-- =============================================================================
-- V25 — O LEGADO · Row Level Security e Storage
-- Regra geral: dados pessoais (pedidos, ingressos, comprovativos) nunca são
-- legíveis por anon. Escritas sensíveis só acontecem através das funções RPC.
-- =============================================================================

alter table public.staff               enable row level security;
alter table public.event_settings      enable row level security;
alter table public.ticket_types        enable row level security;
alter table public.orders              enable row level security;
alter table public.order_access_tokens enable row level security;
alter table public.order_events        enable row level security;
alter table public.proof_upload_slots  enable row level security;
alter table public.payment_proofs      enable row level security;
alter table public.tickets             enable row level security;
alter table public.checkin_log         enable row level security;
alter table public.timeline_entries    enable row level security;
alter table public.media_items         enable row level security;
alter table public.members             enable row level security;
alter table public.faqs                enable row level security;
alter table public.email_outbox        enable row level security;
alter table public.audit_log           enable row level security;

-- Por omissão, sem privilégios de tabela para anon/authenticated; concedemos só o necessário.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------- equipa
grant select on public.staff to authenticated;
create policy staff_self_or_admin on public.staff for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
-- alterações de equipa apenas via admin_set_staff()

-- ---------------------------------------------------------------- configuração
grant select on public.event_settings to anon, authenticated;
grant update on public.event_settings to authenticated;
create policy settings_public_read on public.event_settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.event_settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------- ingressos (catálogo)
-- Leitura pública através de list_ticket_types(); a tabela é gerida pelo administrador.
grant select, insert, delete on public.ticket_types to authenticated;
grant update (name, lot_label, description, price_kz, quantity_total, max_per_order, max_per_customer,
              persons_per_ticket, sales_start, sales_end, published, sort_order)
  on public.ticket_types to authenticated;
create policy ticket_types_staff_read on public.ticket_types for select to authenticated
  using (public.has_role('admin', 'financeiro'));
create policy ticket_types_admin_insert on public.ticket_types for insert to authenticated
  with check (public.has_role('admin') and quantity_reserved = 0 and quantity_sold = 0);
create policy ticket_types_admin_update on public.ticket_types for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ticket_types_admin_delete on public.ticket_types for delete to authenticated
  using (public.has_role('admin') and quantity_reserved = 0 and quantity_sold = 0
         and not exists (select 1 from public.orders o where o.ticket_type_id = ticket_types.id));

-- ---------------------------------------------------------------- pedidos e pagamentos (só leitura para a equipa)
grant select on public.orders, public.order_events, public.payment_proofs to authenticated;
create policy orders_finance_read on public.orders for select to authenticated
  using (public.has_role('admin', 'financeiro'));
create policy order_events_finance_read on public.order_events for select to authenticated
  using (public.has_role('admin', 'financeiro'));
create policy proofs_finance_read on public.payment_proofs for select to authenticated
  using (public.has_role('admin', 'financeiro'));
-- order_access_tokens e proof_upload_slots: sem políticas (inacessíveis pela API).

grant select on public.tickets to authenticated;
create policy tickets_finance_read on public.tickets for select to authenticated
  using (public.has_role('admin', 'financeiro'));

grant select on public.checkin_log to authenticated;
create policy checkin_log_read on public.checkin_log for select to authenticated
  using (public.has_role('admin') or (public.has_role('checkin') and staff_id = auth.uid()));

-- ---------------------------------------------------------------- conteúdos públicos
grant select on public.timeline_entries, public.media_items, public.members, public.faqs to anon, authenticated;
grant insert, update, delete on public.timeline_entries, public.media_items, public.members, public.faqs to authenticated;

create policy timeline_public on public.timeline_entries for select to anon, authenticated
  using (published or public.has_role('admin'));
create policy timeline_admin_write on public.timeline_entries for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy media_public on public.media_items for select to anon, authenticated
  using (published or public.has_role('admin'));
create policy media_admin_write on public.media_items for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy members_public on public.members for select to anon, authenticated
  using (published or public.has_role('admin'));
create policy members_admin_write on public.members for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy faqs_public on public.faqs for select to anon, authenticated
  using (published or public.has_role('admin'));
create policy faqs_admin_write on public.faqs for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------- emails e auditoria
grant select on public.email_outbox to authenticated;
create policy outbox_admin_read on public.email_outbox for select to authenticated
  using (public.has_role('admin'));

grant select on public.audit_log to authenticated;
create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.has_role('admin'));

-- =============================================================================
-- STORAGE
--   proofs  → privado, 5 MB, PDF/JPG/PNG. Upload anónimo só para um "slot"
--             criado por begin_proof_upload(); leitura só admin/financeiro
--             (o frontend gera URLs assinadas temporárias).
--   media   → público (fotografias/vídeos do site), escrita só admin.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.proof_slot_open(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.proof_upload_slots
                 where storage_path = p_name and used_at is null and expires_at > now());
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.proof_slot_open(text) to anon, authenticated;

create policy proofs_insert_slot on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'proofs' and private.proof_slot_open(name));
create policy proofs_finance_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.has_role('admin', 'financeiro'));
-- Sem políticas de update/delete em "proofs": comprovativos não podem ser substituídos nem apagados pela API.

create policy media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.has_role('admin'));
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.has_role('admin'));
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.has_role('admin'));
