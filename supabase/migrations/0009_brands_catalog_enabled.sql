-- Lets a brand be onboarded (logo set, reviewed) before it's swept into the
-- daily catalog sync — the /admin/brands/new wizard creates a brand row with
-- catalog_enabled=false and flips it on once the import step actually runs.
alter table public.brands add column if not exists catalog_enabled boolean not null default true;
create index if not exists brands_catalog_enabled_idx on public.brands (catalog_enabled) where is_active = true;
