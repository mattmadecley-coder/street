-- `app/api/cron/catalog/route.ts` and `app/api/cron/storefront-health/route.ts`
-- both accept a watchdog continuation call authenticated by an
-- `x-street-worker-token` header, verified via `rpc/authorize_cron_watchdog`.
-- That function was never created by a migration -- only the single-purpose
-- `authorize_classification_worker` (20260720_classification_watchdog.sql)
-- exists. Every watchdog-style call to these two routes has been failing
-- PostgREST's "function not found in schema cache" check (see
-- storefront-health's "watchdog authorization failed" log line); the normal
-- GitHub Actions cron calls are unaffected because they authenticate with
-- the regular cron secret instead, via `hasCronSecretAccess`.
--
-- This generalizes the classification worker's pattern (one row/token per
-- named job instead of one dedicated table+column) so both routes resolve
-- to a real function instead of erroring.
create table if not exists public.cron_watchdog_jobs (
  job_key text primary key,
  trigger_token text,
  trigger_url text,
  updated_at timestamptz not null default now()
);

create or replace function public.authorize_cron_watchdog(p_job_key text, p_token text)
returns boolean
language sql
security invoker
set search_path = public, extensions
as $$
  select coalesce(
    length(p_token) >= 32
    and trigger_token is not null
    and digest(p_token, 'sha256') = digest(trigger_token, 'sha256'),
    false
  )
  from public.cron_watchdog_jobs
  where job_key = p_job_key;
$$;

revoke execute on function public.authorize_cron_watchdog(text, text) from public, anon, authenticated;
grant execute on function public.authorize_cron_watchdog(text, text) to service_role;

comment on function public.authorize_cron_watchdog(text, text) is
  'Validates a watchdog continuation token for a named cron job (catalog, storefront-health) against public.cron_watchdog_jobs. Generalizes authorize_classification_worker by job_key instead of one dedicated table per job.';

-- Placeholder rows so the two known callers resolve to a real (if inactive)
-- job row instead of "no rows" -- trigger_token stays null until someone
-- sets a real token, which keeps authorize_cron_watchdog() returning false
-- (safe default) for both until that's done deliberately.
insert into public.cron_watchdog_jobs (job_key)
values ('catalog'), ('storefront-health')
on conflict (job_key) do nothing;
