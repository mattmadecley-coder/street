-- The 2026-10-01 Codex database review found 39 catalog_sync_runs rows stuck
-- at status='running' -- all from a single batch that started around
-- 2026-09-25 14:25-14:32 UTC and have been "running" for six days straight.
-- These are orphaned: whatever process was updating them (a server restart,
-- a deploy, a crashed sync) never got to mark them success/failed. Nothing
-- in the schema ever timed these out, so they would have sat as "running"
-- forever and any dashboard reading sync health would misreport active work
-- that doesn't exist.
--
-- One-time cleanup: close out the specific orphaned batch identified in the
-- review (anything still "running" after a generous 2-hour ceiling -- a
-- normal brand sync completes in well under that).
update public.catalog_sync_runs
set status = 'failed',
    completed_at = now(),
    error_message = coalesce(error_message, '') || case when coalesce(error_message, '') = '' then '' else ' ' end
      || 'Marked failed by the 2026-10-01 watchdog cleanup: row was stuck at status=running for over 2 hours with no completion, indicating the sync process that owned it was interrupted (server restart, deploy, or crash) before it could record a result.'
where status = 'running'
  and started_at < now() - interval '2 hours';

-- Ongoing watchdog: same pattern as the classification worker's pg_cron job
-- (20260720_classification_watchdog.sql) -- a periodic sweep that closes out
-- any future orphaned run so "running" always reflects reality.
create or replace function public.close_orphaned_catalog_sync_runs()
returns integer
language sql
security definer
set search_path = public
as $$
  with closed as (
    update public.catalog_sync_runs
    set status = 'failed',
        completed_at = now(),
        error_message = coalesce(error_message, '') || case when coalesce(error_message, '') = '' then '' else ' ' end
          || 'Marked failed by the catalog sync watchdog: exceeded the 2-hour running ceiling with no completion.'
    where status = 'running'
      and started_at < now() - interval '2 hours'
    returning 1
  )
  select count(*)::integer from closed;
$$;

revoke execute on function public.close_orphaned_catalog_sync_runs() from public, anon, authenticated;
grant execute on function public.close_orphaned_catalog_sync_runs() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'street-catalog-sync-watchdog'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'street-catalog-sync-watchdog',
    '*/15 * * * *',
    'select public.close_orphaned_catalog_sync_runs();'
  );
end;
$$;

comment on function public.close_orphaned_catalog_sync_runs() is
  'Closes out any catalog_sync_runs row stuck at status=running past a 2-hour ceiling, so sync-health reporting never shows phantom in-progress syncs.';
