-- A five-minute database watchdog restarts the classification chain if a
-- serverless continuation is interrupted. Normal batches still chain
-- immediately; this job is only a durable safety net.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.classification_worker_state
  add column if not exists trigger_url text,
  add column if not exists trigger_token text;

create or replace function public.authorize_classification_worker(p_token text)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select coalesce(
    length(p_token) >= 32
    and trigger_token is not null
    and extensions.crypt(p_token, extensions.crypt(trigger_token, extensions.gen_salt('bf'))) = extensions.crypt(trigger_token, extensions.crypt(trigger_token, extensions.gen_salt('bf'))),
    false
  )
  from public.classification_worker_state
  where id = 1;
$$;

-- Use digest comparison rather than returning or exposing the stored trigger
-- token. The table itself remains private to service_role/postgres.
create or replace function public.authorize_classification_worker(p_token text)
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
  from public.classification_worker_state
  where id = 1;
$$;

create or replace function public.wake_classification_worker()
returns bigint
language plpgsql
security invoker
set search_path = public, net
as $$
declare
  target_url text;
  token text;
begin
  select trigger_url, trigger_token
  into target_url, token
  from public.classification_worker_state
  where id = 1;

  if coalesce(target_url, '') = '' or coalesce(token, '') = '' then
    return null;
  end if;

  return net.http_post(
    url := target_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-street-worker-token', token
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke execute on function public.authorize_classification_worker(text) from public, anon, authenticated;
revoke execute on function public.wake_classification_worker() from public, anon, authenticated;
grant execute on function public.authorize_classification_worker(text) to service_role;
grant execute on function public.wake_classification_worker() to service_role;

-- Keep the schedule idempotent across restores and repeated migrations.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'street-classification-watchdog'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'street-classification-watchdog',
    '*/5 * * * *',
    'select public.wake_classification_worker();'
  );
end;
$$;

comment on function public.wake_classification_worker() is
  'Securely wakes the Street AI classification queue through pg_net.';
