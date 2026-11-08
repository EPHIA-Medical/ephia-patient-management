-- Secure document sending (concept "Sicherer Dokumentenversand, Version A").
--
-- A practice sends documents to a patient as a link. The PDFs are encrypted in
-- the practice's browser with a key K = HKDF(halfA ‖ halfB ‖ F):
--   halfA  only in the link after '#', never reaches EPHIA
--   halfB  stored here (encrypted with a server secret), released by the API
--          after the patient enters the right date of birth or code
--   F      PBKDF2 of the date of birth or code, recomputed by the patient's browser
-- So nothing in these tables or in the bucket can be decrypted on its own.
--
-- All writes go through the API (service role). Practices may only read the
-- status of their own shares. Idempotent: safe to run twice.

create table if not exists public.document_shares (
  id text primary key,                          -- 128-bit random, base64url, part of the link
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_refs text[] not null default '{}',        -- ids of the shared documents (for the status in the app)
  doc_kinds text[] not null default '{}',       -- rechnung, behandlung, hv, aufklaerung
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  locked_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0,
  factor_type text not null check (factor_type in ('dob', 'code')),
  factor_hash text,                             -- scrypt of the normalised answer; null once expired
  factor_salt text,
  key_salt text not null,                       -- salt for F and HKDF (public)
  half_b_enc text,                              -- AES-GCM(server secret, halfB); null once expired or revoked
  half_b_iv text,
  attempts integer not null default 0,
  recipient_masked text not null,               -- e.g. m•••@gmail.com, never the full address
  delivery_status text not null default 'sent' check (delivery_status in ('sent', 'delivered', 'bounced', 'complained', 'failed')),
  resend_id text,
  practice jsonb not null default '{}'::jsonb   -- name, email, phone for the opening page (practice data, no patient data)
);

create index if not exists document_shares_user_idx on public.document_shares (user_id, created_at desc);
create index if not exists document_shares_doc_refs_idx on public.document_shares using gin (doc_refs);
create index if not exists document_shares_expires_idx on public.document_shares (expires_at);

create table if not exists public.document_share_files (
  id uuid primary key default gen_random_uuid(),
  share_id text not null references public.document_shares (id) on delete cascade,
  position integer not null default 0,
  storage_path text not null,
  iv text not null,
  label_enc text not null,                      -- file label ("Rechnung RE-0004") encrypted with K
  label_iv text not null,
  size_bytes integer not null
);

create index if not exists document_share_files_share_idx on public.document_share_files (share_id, position);

create table if not exists public.document_share_attempts (
  id bigserial primary key,
  share_id text not null references public.document_shares (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null,
  ip_hash text                                  -- cleared after 7 days by the API's cleanup
);

create index if not exists document_share_attempts_share_idx on public.document_share_attempts (share_id, at desc);

alter table public.document_shares enable row level security;
alter table public.document_share_files enable row level security;
alter table public.document_share_attempts enable row level security;

-- Practices read the status of their own shares; secrets stay with the service role.
revoke all on public.document_shares from anon, authenticated;
grant select (id, user_id, doc_refs, doc_kinds, created_at, expires_at, revoked_at, locked_at, opened_at, open_count, factor_type, attempts, recipient_masked, delivery_status)
  on public.document_shares to authenticated;
revoke all on public.document_share_files from anon, authenticated;
revoke all on public.document_share_attempts from anon, authenticated;

drop policy if exists "own shares readable" on public.document_shares;
create policy "own shares readable" on public.document_shares
  for select to authenticated using (user_id = auth.uid());

-- Private bucket for the encrypted PDFs; only the API (service role) reads and writes.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('document-shares', 'document-shares', false, 16777216)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
