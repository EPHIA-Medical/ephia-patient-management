-- Product usage events of the EPHIA Patient Management System, written by
-- src/lib/analytics.js (trackEvent). The client code has sent these since
-- March 2026, but the table never existed, so nothing was recorded until this
-- migration. Events carry an event name plus types/counts only, never patient
-- data. They are usage data of the doctor's account (covered in the PMS
-- Datenschutzerklärung).
-- Write-only through the API: an account can insert its own events and read
-- none; analysis happens with the service role / SQL editor.
-- Idempotent: safe to run twice.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null check (event_name ~ '^[a-z0-9_]{1,64}$'),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now()
);

comment on table public.analytics_events is 'PMS usage events (name + types/counts, no patient data); user_id and created_at are set server-side by trigger';

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at);
create index if not exists analytics_events_name_idx on public.analytics_events (event_name, created_at);

-- The client also sends created_at; the server clock and the caller's id win.
create or replace function public.analytics_event_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists analytics_event_stamp on public.analytics_events;
create trigger analytics_event_stamp
  before insert on public.analytics_events
  for each row execute function public.analytics_event_stamp();

alter table public.analytics_events enable row level security;

revoke all on public.analytics_events from anon;
revoke all on public.analytics_events from authenticated;
grant insert (event_name, metadata, created_at) on public.analytics_events to authenticated;

drop policy if exists "analytics: insert own" on public.analytics_events;
create policy "analytics: insert own" on public.analytics_events
  for insert to authenticated with check (auth.uid() = user_id);

-- no select, update or delete policies on purpose
