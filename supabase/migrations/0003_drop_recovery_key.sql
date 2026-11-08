-- Step 6 of docs/escrow-recovery-plan.md: the server-readable recovery key is
-- gone for good. Run only after step 5 nulled the columns and every browser
-- has picked up release B (the last version that could still write them was
-- release A, 2026-11-08).

alter table public.profiles
  drop column if exists recovery_key,
  drop column if exists recovery_wrapped_mek,
  drop column if exists recovery_iv;
