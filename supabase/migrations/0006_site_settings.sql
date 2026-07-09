-- Admin-editable site settings (homepage hero image/video, featured brand
-- spotlight). Lets the /admin dashboard change these without a code deploy.
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "public can read site settings" on public.site_settings;
create policy "public can read site settings" on public.site_settings for select using (true);
-- Writes go through the server-side service-role key only (admin dashboard),
-- same pattern as brands/products — no insert/update policy for anon/authenticated.

insert into public.site_settings (key, value) values
  ('hero_image_url', ''),
  ('hero_video_url', ''),
  ('featured_brand_slug', 'seventy-four-uniform'),
  ('featured_brand_cta_label', 'Check out their collections')
on conflict (key) do nothing;
