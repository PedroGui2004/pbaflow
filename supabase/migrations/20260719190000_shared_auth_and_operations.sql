-- Shared authentication and operational state for PBA Flow.
-- Keeps the factory floor usable without passwords while protecting management changes.

alter table public.repairs add column if not exists timer_paused boolean not null default true;
alter table public.repairs add column if not exists pause_reason text;
alter table public.repairs add column if not exists waiting_reason text;
alter table public.repairs add column if not exists waiting_notes text;
alter table public.repairs add column if not exists time_corrections jsonb not null default '[]'::jsonb;

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  name text not null,
  registration text not null unique,
  shift text not null default 'T1',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wait_reasons (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bios_entries (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  op text not null,
  serial text not null,
  destination text not null check (destination in ('kvm', 'repair')),
  issue text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
create index if not exists bios_entries_recorded_at_idx on public.bios_entries(recorded_at desc);
create index if not exists bios_entries_serial_idx on public.bios_entries(serial);

create table if not exists public.op_priorities (
  op text primary key,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_app_meta_data ->> 'role' in ('technician', 'manager', 'developer')
      then new.raw_app_meta_data ->> 'role'
    else 'technician'
  end;

  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    coalesce(new.email, new.id::text),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'Operador'), '@', 1)),
    requested_role,
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    role = case
      when new.raw_app_meta_data ->> 'role' in ('technician', 'manager', 'developer') then requested_role
      else public.profiles.role
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.ensure_current_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  jwt_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  jwt_role := case
    when auth.jwt() -> 'app_metadata' ->> 'role' in ('technician', 'manager', 'developer')
      then auth.jwt() -> 'app_metadata' ->> 'role'
    else 'technician'
  end;

  insert into public.profiles (id, email, display_name, role, active)
  values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text),
    coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', split_part(coalesce(auth.jwt() ->> 'email', 'Operador'), '@', 1)),
    jwt_role,
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    role = case
      when auth.jwt() -> 'app_metadata' ->> 'role' in ('technician', 'manager', 'developer') then jwt_role
      else public.profiles.role
    end,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.ensure_current_profile() to authenticated;

create or replace function public.set_management_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name in ('op_priorities', 'operational_settings') then
    new.updated_by = auth.uid();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.technicians;
create trigger set_updated_at before update on public.technicians
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.wait_reasons;
create trigger set_updated_at before update on public.wait_reasons
  for each row execute function public.set_updated_at();
drop trigger if exists set_management_audit on public.op_priorities;
create trigger set_management_audit before insert or update on public.op_priorities
  for each row execute function public.set_management_audit_fields();
drop trigger if exists set_management_audit on public.operational_settings;
create trigger set_management_audit before insert or update on public.operational_settings
  for each row execute function public.set_management_audit_fields();

alter table public.technicians enable row level security;
alter table public.wait_reasons enable row level security;
alter table public.bios_entries enable row level security;
alter table public.op_priorities enable row level security;
alter table public.operational_settings enable row level security;

drop policy if exists technicians_read_anon on public.technicians;
create policy technicians_read_anon on public.technicians for select to anon using (true);
drop policy if exists technicians_read_authenticated on public.technicians;
create policy technicians_read_authenticated on public.technicians for select to authenticated using (true);
drop policy if exists technicians_manage on public.technicians;
create policy technicians_manage on public.technicians for all to authenticated
  using (public.is_manager_or_developer()) with check (public.is_manager_or_developer());

drop policy if exists wait_reasons_read_anon on public.wait_reasons;
create policy wait_reasons_read_anon on public.wait_reasons for select to anon using (true);
drop policy if exists wait_reasons_read_authenticated on public.wait_reasons;
create policy wait_reasons_read_authenticated on public.wait_reasons for select to authenticated using (true);
drop policy if exists wait_reasons_manage on public.wait_reasons;
create policy wait_reasons_manage on public.wait_reasons for all to authenticated
  using (public.is_manager_or_developer()) with check (public.is_manager_or_developer());

drop policy if exists bios_entries_read_anon on public.bios_entries;
create policy bios_entries_read_anon on public.bios_entries for select to anon using (true);
drop policy if exists bios_entries_write_anon on public.bios_entries;
create policy bios_entries_write_anon on public.bios_entries for insert to anon with check (true);
drop policy if exists bios_entries_update_anon on public.bios_entries;
create policy bios_entries_update_anon on public.bios_entries for update to anon using (true) with check (true);
drop policy if exists bios_entries_read_authenticated on public.bios_entries;
create policy bios_entries_read_authenticated on public.bios_entries for select to authenticated using (true);
drop policy if exists bios_entries_write_authenticated on public.bios_entries;
create policy bios_entries_write_authenticated on public.bios_entries for insert to authenticated with check (true);
drop policy if exists bios_entries_update_authenticated on public.bios_entries;
create policy bios_entries_update_authenticated on public.bios_entries for update to authenticated using (true) with check (true);

drop policy if exists op_priorities_read_anon on public.op_priorities;
create policy op_priorities_read_anon on public.op_priorities for select to anon using (true);
drop policy if exists op_priorities_read_authenticated on public.op_priorities;
create policy op_priorities_read_authenticated on public.op_priorities for select to authenticated using (true);
drop policy if exists op_priorities_manage on public.op_priorities;
create policy op_priorities_manage on public.op_priorities for all to authenticated
  using (public.is_manager_or_developer()) with check (public.is_manager_or_developer());

drop policy if exists operational_settings_read_anon on public.operational_settings;
create policy operational_settings_read_anon on public.operational_settings for select to anon using (true);
drop policy if exists operational_settings_read_authenticated on public.operational_settings;
create policy operational_settings_read_authenticated on public.operational_settings for select to authenticated using (true);
drop policy if exists operational_settings_manage on public.operational_settings;
create policy operational_settings_manage on public.operational_settings for all to authenticated
  using (public.is_manager_or_developer()) with check (public.is_manager_or_developer());

grant select on public.technicians to anon, authenticated;
grant insert, update, delete on public.technicians to authenticated;
grant select on public.wait_reasons to anon, authenticated;
grant insert, update, delete on public.wait_reasons to authenticated;
grant select, insert, update on public.bios_entries to anon, authenticated;
grant select on public.op_priorities to anon, authenticated;
grant insert, update, delete on public.op_priorities to authenticated;
grant select on public.operational_settings to anon, authenticated;
grant insert, update, delete on public.operational_settings to authenticated;

insert into public.technicians (legacy_key, name, registration, shift, active) values
  ('technician:4', 'Pedro', '4', 'T1', true),
  ('technician:1', 'Fabio', '1', 'T1', true),
  ('technician:3', 'Washington', '3', 'T1', true),
  ('technician:5', 'Fransmiler', '5', 'T1', true)
on conflict (legacy_key) do nothing;

insert into public.wait_reasons (legacy_key, name, active) values
  ('wait:gabinete', 'Aguardando gabinete', true),
  ('wait:comercial', 'Aguardando comercial', true),
  ('wait:estoque', 'Aguardando estoque', true),
  ('wait:gestor', 'Aguardando aprovação do gestor', true),
  ('wait:setor', 'Aguardando outro setor', true)
on conflict (legacy_key) do nothing;

insert into public.operational_settings (key, value) values
  ('repair_alert_minutes', '60'::jsonb),
  ('repair_critical_minutes', '100'::jsonb),
  ('repair_auto_pause_time', '"18:05"'::jsonb),
  ('repair_auto_pause_timezone', '"America/Sao_Paulo"'::jsonb)
on conflict (key) do nothing;

create or replace function public.enforce_repair_shift_pause()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local_now timestamp := timezone('America/Sao_Paulo', now());
begin
  if new.status = 'active'
    and coalesce(new.timer_paused, false) = false
    and local_now::time >= time '18:05'
  then
    if new.started_at is not null then
      new.elapsed_seconds := greatest(
        0,
        coalesce(new.elapsed_seconds, 0) + floor(extract(epoch from (now() - new.started_at)))::integer
      );
    end if;
    new.started_at := null;
    new.timer_paused := true;
    new.pause_reason := 'Pausa automática do turno · 18:05';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_repair_shift_pause on public.repairs;
create trigger enforce_repair_shift_pause
  before insert or update on public.repairs
  for each row execute function public.enforce_repair_shift_pause();

create or replace function public.pause_due_repairs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('America/Sao_Paulo', now());
  affected integer := 0;
begin
  if local_now::time < time '18:05' then
    return 0;
  end if;

  update public.repairs
  set
    elapsed_seconds = greatest(
      0,
      elapsed_seconds + case
        when started_at is null then 0
        else floor(extract(epoch from (now() - started_at)))::integer
      end
    ),
    started_at = null,
    timer_paused = true,
    pause_reason = 'Pausa automática do turno · 18:05',
    updated_at = now()
  where status = 'active'
    and coalesce(timer_paused, false) = false;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.pause_due_repairs() from public, anon, authenticated;

-- Supabase projects normally expose pg_cron. The trigger above remains the final
-- server-side guard even if the extension is unavailable in a local environment.
do $$
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception when others then
    raise notice 'pg_cron is unavailable; automatic trigger protection remains active: %', sqlerrm;
  end;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.unschedule(jobid)
        from cron.job
        where jobname = 'pba-flow-repair-autopause'
      $cron$;
    exception when others then
      null;
    end;

    execute $cron$
      select cron.schedule(
        'pba-flow-repair-autopause',
        '* * * * *',
        'select public.pause_due_repairs();'
      )
    $cron$;
  end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['technicians', 'wait_reasons', 'bios_entries', 'op_priorities', 'operational_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
