-- Records which account accepted which version of the AGB of the EPHIA Patient
-- Management System (click-to-accept, required before the first use and again
-- for every new version, see AGB § 1 and § 9). Same pattern as
-- 0004_avv_acceptances: one row per account and version, written by the
-- account itself, evidential fields stamped by the server.
-- Idempotent: safe to run twice.

-- Published AGB versions with the SHA-256 of their text (agbCanonicalText()).
create table if not exists public.agb_versions (
  version text primary key,
  document_sha256 text not null,
  published_at timestamptz not null default now()
);
insert into public.agb_versions (version, document_sha256)
  values ('1.0', 'd6d7a16efd99d6f1a5209164491197f08542e7d77f29c374e9284282314a7797')
  on conflict (version) do update set document_sha256 = excluded.document_sha256;

create table if not exists public.agb_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null references public.agb_versions (version),
  document_sha256 text not null,
  user_agent text,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.agb_acceptances is 'AGB click-to-accept records; the evidential fields are set server-side by trigger';

create or replace function public.agb_acceptance_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  new.id := gen_random_uuid();
  new.accepted_at := now();
  new.user_id := auth.uid();
  select document_sha256 into expected from public.agb_versions where version = new.version;
  if expected is null then
    raise exception 'unknown AGB version %', new.version;
  end if;
  if new.document_sha256 is distinct from expected then
    raise exception 'AGB text hash does not match the published version %', new.version;
  end if;
  return new;
end;
$$;

drop trigger if exists agb_acceptance_stamp on public.agb_acceptances;
create trigger agb_acceptance_stamp
  before insert on public.agb_acceptances
  for each row execute function public.agb_acceptance_stamp();

alter table public.agb_acceptances enable row level security;
alter table public.agb_versions enable row level security;

drop policy if exists "agb: read own" on public.agb_acceptances;
create policy "agb: read own" on public.agb_acceptances
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "agb: insert own" on public.agb_acceptances;
create policy "agb: insert own" on public.agb_acceptances
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "agb versions: read" on public.agb_versions;
create policy "agb versions: read" on public.agb_versions
  for select to authenticated using (true);

-- no update or delete policies on purpose
