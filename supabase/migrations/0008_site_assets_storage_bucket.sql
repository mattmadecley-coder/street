-- Public storage bucket for admin-uploaded images (brand logos, homepage
-- hero image). Uploads go through the server-side service-role key (admin
-- dashboard), which bypasses RLS, so only a public read policy is needed.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "public read site-assets" on storage.objects;
create policy "public read site-assets" on storage.objects
  for select using (bucket_id = 'site-assets');
