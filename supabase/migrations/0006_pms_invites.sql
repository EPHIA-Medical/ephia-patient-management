-- Invitations to the EPHIA Patient Management System, sent by the EPHIA team
-- (customer love) from admin.ephia.de through the PMS API (POST /api/invites).
--
-- The invite email links to https://api.pms.ephia.de/i/<token>. The token is
-- valid for 14 days and only its SHA-256 is stored. Opening it shows a page
-- with one button; the POST behind it asks Supabase for a fresh invite (or,
-- if the account already exists without keys, recovery) link and redirects
-- there, so Supabase's one-hour link lifetime starts at the click.
--
-- No patient data here: only the invited doctor's address and first name.
-- All access goes through the API (service role). Idempotent: safe to run twice.

create table if not exists public.pms_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,                    -- lower-cased
  first_name  text not null default '',
  token_hash  text not null unique,             -- base64url SHA-256 of the link token
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  sent_by     text not null default '',         -- who sent it in admin.ephia.de (staff email)
  resend_id   text,
  clicked_at  timestamptz,                      -- last time the button on /i/<token> was used
  accepted_at timestamptz,                      -- first seen with keys set up (account in use)
  revoked_at  timestamptz,                      -- set when a newer invite to the same address replaces it
  user_id     uuid references auth.users (id) on delete set null
);

create index if not exists pms_invites_email_idx on public.pms_invites (email, created_at desc);

-- Service role only: RLS on, no policies.
alter table public.pms_invites enable row level security;

-- Account state for an address, without listing auth.users through the admin API.
--   has_keys: the doctor has logged in with a password at least once, so the
--   E2EE key material (profiles.encrypted_mek) exists. That is "account in use".
create or replace function public.pms_account_status(p_email text)
returns table (user_id uuid, confirmed boolean, has_keys boolean)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id,
         (u.email_confirmed_at is not null),
         exists (select 1 from public.profiles p where p.id = u.id and p.encrypted_mek is not null)
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.pms_account_status(text) from public, anon, authenticated;
grant execute on function public.pms_account_status(text) to service_role;
