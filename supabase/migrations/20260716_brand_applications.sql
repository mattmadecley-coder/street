create table if not exists public.brand_applications (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  applicant_name text not null,
  role text not null,
  website text not null,
  instagram text not null,
  fulfillment text not null check (fulfillment in ('premade','preorder','both')),
  direct_checkout_interest text not null check (direct_checkout_interest in ('yes','maybe','no')),
  phone text not null,
  email text not null,
  notes text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','approved','declined','contacted')),
  created_at timestamptz not null default now()
);

create index if not exists brand_applications_created_at_idx on public.brand_applications (created_at desc);
create index if not exists brand_applications_status_idx on public.brand_applications (status);

alter table public.brand_applications enable row level security;
-- No public insert policy is required: submissions go through Street's server route
-- using the Supabase service-role key. Keep direct browser access blocked.
