-- Records which account accepted which version of the Auftragsverarbeitungsvertrag
-- (Art. 28 Abs. 9 DSGVO, electronic form). One row per account and version,
-- written by the account itself, never updated or deleted by the app.
-- Idempotent: safe to run twice.

-- Published contract versions with the SHA-256 of their text (avvCanonicalText()).
-- Only the server knows what a valid hash is; the client cannot invent one.
create table if not exists public.avv_versions (
  version text primary key,
  document_sha256 text not null,
  published_at timestamptz not null default now()
);
insert into public.avv_versions (version, document_sha256)
  values ('1.0', '22da570ae2d7fa1a0421f92d2e49afd55fb88134a782bf0e614bfea0f9d49259')
  on conflict (version) do update set document_sha256 = excluded.document_sha256;

create table if not exists public.avv_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null references public.avv_versions (version),
  document_sha256 text not null,
  practice_snapshot jsonb,
  user_agent text,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.avv_acceptances is 'AVV click-to-accept records; the evidential fields are set server-side by trigger';

-- The evidential fields come from the server, whatever the client sends.
create or replace function public.avv_acceptance_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  new.id := gen_random_uuid();
  new.accepted_at := now();
  new.user_id := auth.uid();
  select document_sha256 into expected from public.avv_versions where version = new.version;
  if expected is null then
    raise exception 'unknown AVV version %', new.version;
  end if;
  if new.document_sha256 is distinct from expected then
    raise exception 'AVV text hash does not match the published version %', new.version;
  end if;
  return new;
end;
$$;

drop trigger if exists avv_acceptance_stamp on public.avv_acceptances;
create trigger avv_acceptance_stamp
  before insert on public.avv_acceptances
  for each row execute function public.avv_acceptance_stamp();

alter table public.avv_acceptances enable row level security;
alter table public.avv_versions enable row level security;

drop policy if exists "avv: read own" on public.avv_acceptances;
create policy "avv: read own" on public.avv_acceptances
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "avv: insert own" on public.avv_acceptances;
create policy "avv: insert own" on public.avv_acceptances
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "avv versions: read" on public.avv_versions;
create policy "avv versions: read" on public.avv_versions
  for select to authenticated using (true);

-- no update or delete policies on purpose
