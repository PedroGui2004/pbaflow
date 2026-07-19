-- PBA Flow foundation schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'technician' check (role in ('technician', 'manager', 'developer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_manager_or_developer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('manager', 'developer'), false)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, coalesce(new.email, new.id::text),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'Operador'), '@', 1)),
    'technician')
  on conflict (id) do update set email = excluded.email, display_name = excluded.display_name, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  item_type text not null check (item_type in ('problem', 'solution', 'part')),
  code text, name text not null, active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  op text not null, serial text not null unique, equipment_code text,
  sector text not null default 'assembly' check (sector in ('assembly', 'assistance', 'rma')),
  expected_os text, actual_os text, stage text not null default 'Vinculacao',
  result text, certificate_status text not null default 'Nao iniciado',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  technician_id uuid references public.profiles(id), technician_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists machines_op_idx on public.machines(op);
create index if not exists machines_stage_idx on public.machines(stage);
create index if not exists machines_priority_idx on public.machines(priority);

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  machine_id uuid references public.machines(id) on delete set null,
  op text not null, serial text not null, problem text not null, notes text,
  technician_id uuid references public.profiles(id), technician_name text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'planned' check (status in ('planned', 'active', 'waiting', 'history')),
  current_stage integer not null default 0 check (current_stage between 0 and 4),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz, completed_at timestamptz, part_code text, solution text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repairs_serial_idx on public.repairs(serial);
create index if not exists repairs_status_idx on public.repairs(status);

create table if not exists public.repair_events (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs(id) on delete cascade,
  machine_id uuid references public.machines(id) on delete set null,
  event_type text not null, stage integer, cycle_number integer not null default 1,
  technician_id uuid references public.profiles(id), notes text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.kvm_channels (
  id text primary key, bay integer not null, channel integer not null,
  connection_type text not null default 'HDMI', active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (bay, channel)
);

create table if not exists public.kvm_sessions (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  machine_id uuid references public.machines(id) on delete set null,
  channel_id text not null references public.kvm_channels(id),
  op text not null, serial text not null, operating_system text,
  technician_id uuid references public.profiles(id), technician_name text,
  status text not null default 'testing' check (status in ('testing', 'paused', 'approved', 'rejected', 'failed', 'finished')),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz, finished_at timestamptz,
  failures integer not null default 0 check (failures >= 0),
  paused_by_global boolean not null default false, connection_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kvm_queue (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  machine_id uuid references public.machines(id) on delete cascade,
  op text not null, serial text not null, origin text not null default 'BIOS',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  attempts integer not null default 0, operating_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.serial_batches (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  op text not null, equipment_code text, operating_system text,
  first_serial text not null, last_serial text not null,
  quantity integer not null check (quantity > 0),
  serials jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  machine_id uuid references public.machines(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  module text not null, title text not null, message text not null,
  resolved boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','catalog_items','machines','repairs','kvm_channels','kvm_sessions','kvm_queue'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.catalog_items enable row level security;
alter table public.machines enable row level security;
alter table public.repairs enable row level security;
alter table public.repair_events enable row level security;
alter table public.kvm_channels enable row level security;
alter table public.kvm_sessions enable row level security;
alter table public.kvm_queue enable row level security;
alter table public.serial_batches enable row level security;
alter table public.alerts enable row level security;

create policy "profiles_read_self_or_management" on public.profiles for select to authenticated using (id = auth.uid() or public.is_manager_or_developer());
create policy "profiles_update_self_or_management" on public.profiles for update to authenticated using (id = auth.uid() or public.is_manager_or_developer()) with check ((id = auth.uid() and role = public.current_user_role()) or public.is_manager_or_developer());

create policy "catalog_read" on public.catalog_items for select to authenticated using (true);
create policy "catalog_write" on public.catalog_items for all to authenticated using (true) with check (true);
create policy "machines_read" on public.machines for select to authenticated using (true);
create policy "machines_write" on public.machines for all to authenticated using (true) with check (true);
create policy "repairs_read" on public.repairs for select to authenticated using (true);
create policy "repairs_write" on public.repairs for all to authenticated using (true) with check (true);
create policy "repair_events_read" on public.repair_events for select to authenticated using (true);
create policy "repair_events_insert" on public.repair_events for insert to authenticated with check (true);
create policy "kvm_channels_read" on public.kvm_channels for select to authenticated using (true);
create policy "kvm_channels_manage" on public.kvm_channels for all to authenticated using (public.is_manager_or_developer()) with check (public.is_manager_or_developer());
create policy "kvm_sessions_read" on public.kvm_sessions for select to authenticated using (true);
create policy "kvm_sessions_write" on public.kvm_sessions for all to authenticated using (true) with check (true);
create policy "kvm_queue_read" on public.kvm_queue for select to authenticated using (true);
create policy "kvm_queue_write" on public.kvm_queue for all to authenticated using (true) with check (true);
create policy "serial_batches_read" on public.serial_batches for select to authenticated using (true);
create policy "serial_batches_write" on public.serial_batches for all to authenticated using (true) with check (true);
create policy "alerts_read" on public.alerts for select to authenticated using (true);
create policy "alerts_write" on public.alerts for all to authenticated using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['profiles','catalog_items','machines','repairs','repair_events','kvm_channels','kvm_sessions','kvm_queue','serial_batches','alerts'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update, delete on public.machines to authenticated;
grant select, insert, update, delete on public.repairs to authenticated;
grant select, insert on public.repair_events to authenticated;
grant select, insert, update, delete on public.kvm_channels to authenticated;
grant select, insert, update, delete on public.kvm_sessions to authenticated;
grant select, insert, update, delete on public.kvm_queue to authenticated;
grant select, insert, update, delete on public.serial_batches to authenticated;
grant select, insert, update, delete on public.alerts to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager_or_developer() to authenticated;

insert into public.kvm_channels (id, bay, channel, connection_type, active)
select 'B' || bay || 'C' || channel, bay, channel,
  case when channel <= 3 then 'HDMI + VGA' when channel <= 7 then 'HDMI' else 'VGA' end, true
from generate_series(1, 4) as bay
cross join lateral generate_series(1, case when bay = 4 then 7 else 14 end) as channel
on conflict (id) do nothing;