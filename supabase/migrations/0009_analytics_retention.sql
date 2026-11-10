-- 0009: delete analytics_events older than 24 months, every night.
-- The Datenschutzerklärung (section 3, "Nutzungsdaten") promises this
-- retention period; changing the interval here means changing the text too.
-- Idempotent: re-running replaces the job with the same name.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule(
  'analytics-events-retention',
  '17 3 * * *',
  $$delete from public.analytics_events where created_at < now() - interval '24 months'$$
);
