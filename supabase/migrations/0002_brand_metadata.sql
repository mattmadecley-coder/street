alter table public.brands add column if not exists instagram_url text;
alter table public.brands add column if not exists metadata_synced_at timestamptz;
create index if not exists brands_active_idx on public.brands (is_active, name);
