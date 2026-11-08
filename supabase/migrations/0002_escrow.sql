-- Key escrow columns for MEK recovery (docs/escrow-recovery-plan.md, step 1).
-- Additive only: every column is nullable, nothing reads them until release A.

alter table public.profiles
  add column if not exists escrow_wrapped_mek text,
  add column if not exists escrow_key_id text,
  add column if not exists mek_check text,
  add column if not exists mek_check_iv text,
  add column if not exists escrow_release text,
  add column if not exists escrow_release_iv text,
  add column if not exists escrow_release_salt text,
  add column if not exists escrow_release_expires_at timestamptz;

comment on column public.profiles.escrow_wrapped_mek is 'MEK wrapped with the EPHIA escrow public key (RSA-OAEP, label = user id)';
comment on column public.profiles.escrow_key_id is 'Which escrow key pair wrapped escrow_wrapped_mek';
comment on column public.profiles.mek_check is 'Known plaintext encrypted under the MEK, verified before any recovery write';
comment on column public.profiles.escrow_release is 'MEK wrapped under a one-time recovery code; set by support during a recovery, cleared by the app';
