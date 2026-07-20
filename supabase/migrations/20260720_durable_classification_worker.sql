-- Keep the AI classification queue single-consumer even when several brand
-- imports, manual retries, and cron invocations all try to start it at once.
-- A short database lease prevents duplicate OpenRouter requests while still
-- recovering automatically when a serverless invocation is interrupted.

create table if not exists public.classification_worker_state (
  id smallint primary key default 1 check (id = 1),
  lease_owner uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_processed integer not null default 0,
  total_processed bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.classification_worker_state (id)
values (1)
on conflict (id) do nothing;

alter table public.classification_worker_state enable row level security;
revoke all on table public.classification_worker_state from anon, authenticated;
grant all on table public.classification_worker_state to service_role;

create or replace function public.claim_classification_worker(
  p_owner uuid,
  p_lease_seconds integer default 55
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  acquired boolean;
begin
  insert into public.classification_worker_state (
    id,
    lease_owner,
    lease_until,
    last_started_at,
    last_error,
    updated_at
  )
  values (
    1,
    p_owner,
    now() + make_interval(secs => greatest(10, least(p_lease_seconds, 120))),
    now(),
    null,
    now()
  )
  on conflict (id) do update
  set lease_owner = excluded.lease_owner,
      lease_until = excluded.lease_until,
      last_started_at = excluded.last_started_at,
      last_error = null,
      updated_at = excluded.updated_at
  where public.classification_worker_state.lease_until is null
     or public.classification_worker_state.lease_until < now()
     or public.classification_worker_state.lease_owner = p_owner
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.finish_classification_worker(
  p_owner uuid,
  p_processed integer,
  p_error text default null
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.classification_worker_state
  set lease_owner = null,
      lease_until = null,
      last_finished_at = now(),
      last_processed = greatest(coalesce(p_processed, 0), 0),
      total_processed = total_processed + greatest(coalesce(p_processed, 0), 0),
      last_error = nullif(left(coalesce(p_error, ''), 2000), ''),
      updated_at = now()
  where id = 1
    and lease_owner = p_owner;
$$;

revoke execute on function public.claim_classification_worker(uuid, integer) from public, anon, authenticated;
revoke execute on function public.finish_classification_worker(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_classification_worker(uuid, integer) to service_role;
grant execute on function public.finish_classification_worker(uuid, integer, text) to service_role;

comment on table public.classification_worker_state is
  'Singleton lease and health record for Street AI product classification.';
