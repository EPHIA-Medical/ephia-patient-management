-- Records which account accepted which version of the Auftragsverarbeitungsvertrag
-- (Art. 28 Abs. 9 DSGVO, electronic form). One row per account and version,
-- written by the account itself, never updated or deleted by the app.

create table if not exists public.avv_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  document_sha256 text not null,
  practice_snapshot jsonb,
  user_agent text,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.avv_acceptances is 'AVV click-to-accept records; document_sha256 is the hash of the accepted text';

alter table public.avv_acceptances enable row level security;

create policy "avv: read own" on public.avv_acceptances
  for select to authenticated using (auth.uid() = user_id);

create policy "avv: insert own" on public.avv_acceptances
  for insert to authenticated with check (auth.uid() = user_id);

-- no update or delete policies on purpose
