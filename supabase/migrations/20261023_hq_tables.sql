-- Street HQ: tables backing the /admin/hq office page.
-- Source of truth stays the hq/ markdown files on Matthew's PC; GM syncs
-- a derived copy here nightly so the deployed admin app (reachable from
-- Matthew's phone) can show live department state. No anon/authenticated
-- policies are added -- this is admin-internal data read only by the
-- server-side admin app using the service role key, same as other
-- admin-only tables in this project.

create table public.hq_departments (
  id text primary key,
  display_name text not null,
  last_run_at timestamptz,
  last_status text,
  updated_at timestamptz not null default now()
);

create table public.hq_logs (
  id uuid primary key default gen_random_uuid(),
  department text not null references public.hq_departments(id),
  ran_at timestamptz not null default now(),
  message text not null,
  created_at timestamptz not null default now()
);

create table public.hq_questions (
  id uuid primary key default gen_random_uuid(),
  department text not null references public.hq_departments(id),
  question text not null,
  recommendation text,
  status text not null default 'open' check (status in ('open','answered')),
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table public.hq_goals (
  id uuid primary key default gen_random_uuid(),
  department text not null references public.hq_departments(id),
  goal text not null,
  status text not null default 'open' check (status in ('open','done','blocked')),
  note text,
  updated_at timestamptz not null default now()
);

create table public.hq_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.hq_departments enable row level security;
alter table public.hq_logs enable row level security;
alter table public.hq_questions enable row level security;
alter table public.hq_goals enable row level security;
alter table public.hq_briefs enable row level security;

insert into public.hq_departments (id, display_name) values
  ('gm', 'General Manager'),
  ('infrastructure', 'Infrastructure & Security'),
  ('analytics', 'Analytics & Insights'),
  ('catalog', 'Catalog & Merchandising'),
  ('partnerships', 'Brand Partnerships'),
  ('qa', 'QA Reviewer'),
  ('product', 'Product & Engineering'),
  ('growth-social', 'Growth: Social'),
  ('growth-seo', 'Growth: SEO'),
  ('growth-lifecycle', 'Growth: Lifecycle'),
  ('legal', 'Legal & Compliance'),
  ('finance', 'Finance & Operations')
on conflict (id) do nothing;
