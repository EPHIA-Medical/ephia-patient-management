# Strix scan instructions (EPHIA Patient Management System)

This file is passed to every Strix scan via `--instruction-file` (see
`.github/workflows/strix-security.yml`). Strix's agents read it as part
of their briefing before testing.

## Scope rules

- This is a code-only scan of the checked-out repository. Do NOT send any
  request to production hosts: `invoicing.ephia.de`, `api.pms.ephia.de`,
  `*.supabase.co` (in particular project `grfngjgjiipbgntsduom`), Railway,
  Stripe or Resend. If you want to exercise the app, run it locally inside
  the sandbox.
- The app stores patient data end-to-end encrypted in the browser
  (`src/`), with a server-side API in `api/` (Next.js route handlers) and
  Postgres row-level security in `supabase/migrations/`. Pay particular
  attention to key derivation and IV handling, anything that could leak
  plaintext patient data or key material, RLS policies, the auth email
  hook, invite and share links, and authorization in `api/`.

## Accepted risks

The findings listed below have been reviewed by the team and are
consciously accepted. Do NOT report them as findings, do not count them
toward the scan result, and do not fail the scan because of them, even if
you rediscover them. Only report an accepted item again if the risk has
materially changed since it was accepted.

Template:

    ### <short title>
    - File(s): <path(s)>
    - Finding: <what Strix reports>
    - Why accepted: <reasoning / compensating controls>
    - Accepted: <YYYY-MM-DD>

(no accepted risks yet)
