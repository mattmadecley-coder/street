-- wake_classification_worker() was unconditionally POSTing to the Vercel
-- classify endpoint every time it ran, and the pg_cron job `classification-
-- watchdog` (see 20260720_classification_watchdog.sql) calls it every 5
-- minutes, 24/7 — so it was waking a fresh Vercel function ~288 times/day
-- even with zero products pending classification. Add a cheap pending-work
-- check (backed by products_classification_queue_idx) before firing the
-- HTTP call, using the same classification_status condition the actual
-- worker query uses (see recoverQueuedClassifications in
-- lib/classification-recovery.ts) so this can't drift out of sync with what
-- "pending" actually means and silently stop waking real work.
CREATE OR REPLACE FUNCTION public.wake_classification_worker()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'net'
AS $function$
declare
  target_url text;
  token text;
  has_pending boolean;
begin
  select exists(
    select 1
    from public.products
    where is_active = true
      and classification_status in ('pending', 'error')
    limit 1
  ) into has_pending;

  if not has_pending then
    return null;
  end if;

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
$function$;
