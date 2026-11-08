-- Bestätigungen: Rechnung über 3,5-fach ohne in EPHIA hinterlegte Honorarvereinbarung
--
-- Run this in the Supabase SQL editor (or via the Supabase CLI) against the
-- ephia-invoicing project. It is idempotent: safe to run more than once.
--
-- Purpose: proof that a doctor was shown, and confirmed, the § 2 Abs. 2 GOÄ
-- notice before creating a Rechnung above 3,5-fach without an HV in the app.
-- The app writes a row BEFORE saving such a Rechnung and does not save the
-- Rechnung if this insert fails.
--
-- Deliberately NOT encrypted and WITHOUT patient data: no patient, no
-- document content, no invoice number. Only who (user_id, set by the
-- database), when, which notice text (version + SHA-256 of the exact text)
-- and where it was confirmed. Rows cannot be changed or deleted by users.

create table if not exists public.hv_waivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  text_version integer not null,
  text_sha256 text not null,
  context text not null check (context in ('rechnung', 'schnellrechnung')),
  max_steigerung numeric(6, 2)
);

create index if not exists hv_waivers_user_id_idx on public.hv_waivers (user_id, created_at desc);

alter table public.hv_waivers enable row level security;

drop policy if exists hv_waivers_select_own on public.hv_waivers;
create policy hv_waivers_select_own on public.hv_waivers
  for select using (auth.uid() = user_id);

drop policy if exists hv_waivers_insert_own on public.hv_waivers;
create policy hv_waivers_insert_own on public.hv_waivers
  for insert with check (auth.uid() = user_id);

-- No update/delete policies: confirmations are append-only for users.
