create table if not exists public.homepage_feature_schedule (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references public.brands(slug) on update cascade on delete cascade,
  starts_at timestamptz not null,
  hero_image_url text not null default '',
  hero_video_url text not null default '',
  cta_label text not null default 'Shop this brand',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homepage_feature_schedule_starts_at_idx
  on public.homepage_feature_schedule (starts_at desc)
  where is_enabled = true;

alter table public.homepage_feature_schedule enable row level security;
revoke all on table public.homepage_feature_schedule from anon, authenticated;
grant all on table public.homepage_feature_schedule to service_role;

comment on table public.homepage_feature_schedule is
  'Future homepage hero and featured-brand changes. The latest enabled row whose starts_at has passed becomes active.';
