-- The pre-launch site was crawled through every product page. Those requests did
-- not execute Street's browser tracker, so they have no visitor/session identity.
-- Lock both tables so a crawler cannot insert another anonymous row between the
-- cleanup and constraint validation.

lock table public.outbound_clicks in share row exclusive mode;
lock table public.site_events in share row exclusive mode;

delete from public.outbound_clicks
where coalesce(btrim(anonymous_user_id), '') = ''
   or coalesce(btrim(session_id), '') = '';

delete from public.site_events
where coalesce(btrim(anonymous_user_id), '') = ''
   or coalesce(btrim(session_id), '') = '';

-- Analytics v2 intentionally supports extensible event names, but the original
-- five-event whitelist was never removed and silently rejected add-to-cart,
-- product-impression, filter, sort, and technical-health events.
alter table public.site_events
  drop constraint if exists site_events_event_type_check;

alter table public.outbound_clicks
  drop constraint if exists outbound_clicks_tracking_identity_check;

alter table public.outbound_clicks
  add constraint outbound_clicks_tracking_identity_check
  check (
    coalesce(btrim(anonymous_user_id), '') <> ''
    and coalesce(btrim(session_id), '') <> ''
  );

alter table public.site_events
  drop constraint if exists site_events_tracking_identity_check;

alter table public.site_events
  add constraint site_events_tracking_identity_check
  check (
    coalesce(btrim(anonymous_user_id), '') <> ''
    and coalesce(btrim(session_id), '') <> ''
  );

comment on constraint outbound_clicks_tracking_identity_check on public.outbound_clicks is
  'Only first-party Street browser sessions may create outbound engagement rows.';

comment on constraint site_events_tracking_identity_check on public.site_events is
  'Only first-party Street browser sessions may create analytics events.';
