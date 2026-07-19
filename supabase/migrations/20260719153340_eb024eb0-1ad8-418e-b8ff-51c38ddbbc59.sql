-- Grant anon access to operational tables (factory floor screens without login)
grant usage on schema public to anon;
grant select, insert, update, delete on public.catalog_items to anon;
grant select, insert, update, delete on public.machines to anon;
grant select, insert, update, delete on public.repairs to anon;
grant select, insert, update, delete on public.kvm_channels to anon;
grant select, insert, update, delete on public.kvm_sessions to anon;
grant select, insert, update, delete on public.kvm_queue to anon;
grant select, insert, update, delete on public.serial_batches to anon;
grant select, insert, update, delete on public.alerts to anon;

create policy "catalog_anon_all" on public.catalog_items for all to anon using (true) with check (true);
create policy "machines_anon_all" on public.machines for all to anon using (true) with check (true);
create policy "repairs_anon_all" on public.repairs for all to anon using (true) with check (true);
create policy "kvm_channels_anon_read" on public.kvm_channels for select to anon using (true);
create policy "kvm_channels_anon_write" on public.kvm_channels for update to anon using (true) with check (true);
create policy "kvm_sessions_anon_all" on public.kvm_sessions for all to anon using (true) with check (true);
create policy "kvm_queue_anon_all" on public.kvm_queue for all to anon using (true) with check (true);
create policy "serial_batches_anon_all" on public.serial_batches for all to anon using (true) with check (true);
create policy "alerts_anon_all" on public.alerts for all to anon using (true) with check (true);