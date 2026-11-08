# Plan: replace the plaintext recovery key with EPHIA key escrow

Status 2026-11-08: steps 0 to 3 done. Key pair in the EPHIA Bitwarden organisation (Marc,
Sophia), migration 0002 applied, release A live, step 2 gate passed on two accounts. Step 3
run 2026-11-08 ~16:00 UTC: 18 profiles (17 + the test account), 16 migrated, `--verify`
reports 18 verified, 0 failed. Both mechanisms are live now.

Release B (step 4) is written on branch `release-b` and must not be merged into `main`
before 2026-11-15. Before the merge: the eight end-to-end checks in step 4 on the test
account, against a preview build of the branch. The encrypted export (step 0.4) is still
needed before step 5.

## 1. Why

Today every `profiles` row holds `recovery_key` in plaintext next to `recovery_wrapped_mek`.
Anyone who can read the database (EPHIA, the Supabase service role, a dump, a backup) can
unwrap every doctor's Master Encryption Key (MEK) and decrypt all patient data. The AGB (§ 4)
and the Datenschutzerklärung (sections 3 and 5) claim the opposite.

Goal: a database dump on its own must be worthless, EPHIA must not be able to read patient data
in normal operation, and a doctor who loses their password must still be able to get their
data back. The MEK itself does not change; only who can unwrap it.

## 2. Current state (what the code really does)

Key hierarchy (`src/lib/crypto.js`, `src/App.jsx`):

| Column (profiles)                  | Content                                              |
|------------------------------------|------------------------------------------------------|
| `encrypted_mek`, `mek_iv`, `mek_salt`, `mek_params` | MEK wrapped with PBKDF2(password), 100k iterations |
| `recovery_wrapped_mek`, `recovery_iv` | MEK wrapped with a random AES key                 |
| `recovery_key`                     | that random AES key, plaintext base64                |
| `encryption_version`               | 1                                                    |

Code paths that touch these columns:

1. `initializeEncryption` (App.jsx:678): first login after signup. Generates MEK, salt,
   recovery key, writes all of the above.
2. `unlockMEK` (App.jsx:712): every login. Unwraps with the password; if that fails, falls back
   to `recovery_key`, re-wraps the MEK under the current password and generates a new recovery
   key. **This is the path that actually recovers a doctor after a password reset.**
3. `SetNewPasswordScreen.onSubmit` (App.jsx:2478): after clicking the reset link. Tries to
   re-wrap the MEK right there, but the code is broken: it filters `profiles?user_id=eq.`
   (the column is `id`), writes `mek_wrapped` (the column is `encrypted_mek`) and uses
   `encryptData` instead of `wrapMEK`, so the result would not be readable by `unwrapMEK`.
   Everything is inside a try/catch that only logs, so it fails silently and path 2 does the
   real work at the next login. This block has to be deleted, not fixed.
4. `SettingsPage.handleChangePassword` (SettingsPage.jsx:45): password change while logged
   in. Re-wraps the MEK under the new password before changing the auth password. Correct,
   does not touch recovery columns.
5. Session restore (App.jsx:409): the raw MEK sits in `sessionStorage` for the tab lifetime.
   Unchanged by this plan.

Facts that shape the plan:

- The app is a static SPA on GitHub Pages talking straight to Supabase. There is no server.
- Supabase project `grfngjgjiipbgntsduom` is separate from ephia-admin's project and was never
  in Railway, so there is no known leak of these recovery keys. Only the Supabase backups
  retain the plaintext keys after we remove them (see 7.4).
- Because `recovery_key` is readable today, EPHIA can migrate every existing account
  server-side, with verification, without waiting for anyone to log in. That is the single
  most important safety property of this plan: no doctor's recovery depends on a browser
  running migration code at the right moment.

## 3. Target design

### 3.1 Escrow wrapping

- EPHIA owns one RSA-OAEP 4096 key pair ("escrow key"). Key id `2026-11` (string, stored with
  every blob so the key can be rotated later).
- The **public key** (SPKI, base64) is a constant in `src/lib/escrow.js` and ships with the
  bundle.
- The **private key** (PKCS8) exists in exactly two places: Bitwarden (EPHIA vault, Marc +
  Sophia) and, in phase 2, as a Cloudflare Worker secret. Never in Supabase, never in the repo,
  never in `.env` files.
- The browser wraps the raw MEK: `RSA-OAEP(pub, label = user id, data = MEK raw 32 bytes)`.
  The OAEP label binds the blob to the account; a blob copied into another profile row will not
  unwrap.
- New columns on `profiles`:

  | Column              | Type  | Content                                                |
  |---------------------|-------|--------------------------------------------------------|
  | `escrow_wrapped_mek`| text  | base64 RSA-OAEP ciphertext                             |
  | `escrow_key_id`     | text  | `2026-11`                                              |
  | `mek_check`, `mek_check_iv` | text | AES-GCM(MEK, "ephia-mek-check-v1"), lets any recovery verify it holds the right MEK before writing anything |
  | `escrow_release`, `escrow_release_iv`, `escrow_release_salt`, `escrow_release_expires_at` | text / timestamptz | MEK wrapped under a one-time code, written during a recovery (see 3.2); null otherwise |
  | `encryption_version`| int   | bumped to 2 once the escrow blob exists and the old recovery columns are null |

- Removed at the end: `recovery_key`, `recovery_wrapped_mek`, `recovery_iv`.

### 3.2 Recovery flow

Phase 1 (manual, break-glass; ships first and stays as the fallback forever):

1. Doctor uses "Passwort vergessen", sets a new password via the Supabase link (unchanged).
2. Doctor logs in. `unlockMEK` fails (MEK is wrapped under the old password). The app shows a
   dedicated screen: "Dein Passwort wurde zurückgesetzt. Damit Deine Patient:innendaten wieder
   entschlüsselt werden können, stellen wir Deinen Schlüssel wieder her. Schreib uns an
   customerlove@ephia.de, wir melden uns telefonisch." The screen shows the account email and a
   short request id (first 8 chars of the user id) to quote. The app does not touch any key
   columns at this point.
3. Marc runs `scripts/escrow-recover.mjs` on his Mac. Input: the user id, the escrow blob
   (copied from the Supabase dashboard), `mek_check`/`mek_check_iv`, the private key (pasted
   from Bitwarden, read from stdin, never written to disk). The script unwraps the MEK, checks
   it against `mek_check`, then wraps the MEK under a one-time code (8 random words, PBKDF2
   300k) and prints the four `escrow_release*` values plus the code. Marc pastes the values
   into the profile row in the dashboard (expiry: 48 h), then sends the code to the account
   email address from `auth.users`, never to the address the request came from. This is as
   strong as the Supabase password reset, which goes to the same mailbox.
4. Doctor logs in again. The app sees `escrow_release` not null and not expired, asks for the
   code, unwraps the MEK, verifies it against `mek_check`, re-wraps it under the new password
   (`encrypted_mek`, `mek_iv`, `mek_salt`), then nulls the `escrow_release*` columns. Only
   after all three writes succeed does it continue to the app. The escrow blob is unchanged
   (the MEK is the same key).
5. Marc records the recovery in a log (date, request id, request email). This log is the
   Art. 30 / AVV evidence that recovery only happens on request.

Phase 2 (self-service, optional, after phase 1 has run cleanly for a few weeks):

- A Cloudflare Worker (`ephia-invoicing-escrow`) holds the private key as a secret.
  `POST /recover` with the Supabase access token and the escrow blob. The Worker verifies the
  token by calling `GET {SUPABASE_URL}/auth/v1/user` (no JWT secret needed), unwraps with the
  user id from that response as the OAEP label, and returns the raw MEK over TLS. The browser
  verifies it against `mek_check` and re-wraps as in step 4. Rate limit 3 per user per day, a
  log line per call, and a notification email to the doctor ("Dein Schlüssel wurde
  wiederhergestellt") via Resend.
- The Worker only ever matters for recovery. Normal login and decryption never call it, so a
  Worker outage can not lock anyone out.
- Phase 1's script stays as the fallback.

### 3.3 What EPHIA can and cannot do after this

- Normal operation: EPHIA cannot read patient data. The database holds only ciphertext and
  an RSA blob that needs a key kept outside Supabase.
- With the escrow private key, EPHIA can decrypt any account. That is the point (recovery and
  the 10-year retention duty), and it must be stated as such in the Datenschutzerklärung and
  the AGB: "verschlüsselt; EPHIA hat im Normalbetrieb keinen Zugriff; eine Wiederherstellung ist
  nur auf Deine Anfrage möglich, über einen getrennt verwahrten Schlüssel, und wird
  protokolliert." No more "zu keinem Zeitpunkt".

## 4. Rollout, step by step

Every step is reversible until step 6, and no step deletes anything before the replacement is
verified. Each step has a gate that must pass before the next one starts.

### Step 0: preparation (no deploy, no data change)

1. Generate the key pair offline:
   create a Bitwarden organisation "EPHIA" (free tier, 2 members), invite Sophia, confirm
   she can log in. Then `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096` and
   `openssl pkey -pubout`, private key pasted into a secure note in the organisation's
   collection, public key into `src/lib/escrow.js`. Sophia confirms she can open the note.
   Delete every local copy of the private key.
2. Create a test account on production (placeholder practice, three placeholder patients, one
   invoice, one voucher). No real data.
3. Confirm in the Supabase dashboard that RLS on `profiles` allows a user to read and update
   only `id = auth.uid()` and that `anon` has no access. Write the result into this document.
4. Export the key columns of all profiles (`id, encrypted_mek, mek_iv, mek_salt, mek_params,
   recovery_wrapped_mek, recovery_iv, recovery_key, encryption_version`) from the dashboard.
   Encrypt the file with `age` using a passphrase stored in Bitwarden, keep it until step 7 is
   done, then delete it. This is the rollback for steps 5 and 6; step 3 does not modify the
   old columns, so the export is required before step 5, not before step 3.
5. Backup retention is 7 daily backups (checked 2026-11-08). The plaintext keys survive 7 days
   after step 5.

Gate: Bitwarden item verified by two people, export encrypted and stored, RLS confirmed.

### Step 1: add columns (SQL migration, additive only)

`supabase/migrations/0002_escrow.sql`: add the columns from 3.1, all nullable, no defaults, no
constraints that could reject existing rows. Nothing reads them yet.

Gate: migration applied, app unchanged and working (login with the test account).

### Step 2: release A, write escrow blobs alongside the old mechanism

Code changes:

- `src/lib/escrow.js`: public key constant, `wrapMEKForEscrow(mek, userId)`,
  `makeMekCheck(mek)`, `verifyMekCheck(mek, profile)`.
- `initializeEncryption`: additionally writes `escrow_wrapped_mek`, `escrow_key_id`,
  `mek_check`, `mek_check_iv`. Still writes the old recovery columns.
- `unlockMEK`: after a successful password unwrap, if `escrow_wrapped_mek` is null, write it
  (and `mek_check`). This covers accounts created between the step 0 export and step 3. The
  old fallback via `recovery_key` is untouched.
- Delete the broken re-wrap block in `SetNewPasswordScreen.onSubmit` (App.jsx:2492-2536).
  It never worked; removing it changes nothing in behaviour.
- Unit tests in `node --test` for `escrow.js`: wrap with the public key, unwrap with a
  throwaway private key, wrong label fails, `mek_check` round-trips.

Verification:

- Test account: log in, confirm the new columns are filled. Copy the blob, run
  `scripts/escrow-recover.mjs` with the real private key, confirm it yields the MEK and the
  `mek_check` verifies. This proves the public key constant in the bundle matches the private
  key in Bitwarden. Do this before step 3, not after.
- Marc's own account: same check.

Gate: round-trip verified with the production private key on two accounts. Deploy verified
(workflow green, deployed sha matches).

### Step 3: migrate all existing accounts (one script, run once by Marc)

`scripts/escrow-migrate.mjs`, run on Marc's Mac with the service role key and the private
key both read from stdin:

1. Fetch all profiles where `encrypted_mek` is not null and `escrow_wrapped_mek` is null.
2. For each: unwrap `recovery_wrapped_mek` with `recovery_key` to get the MEK. If that fails,
   log the id and skip (the account's recovery is already broken today; see 7.2).
3. Wrap the MEK for escrow with the user id as label, build `mek_check`.
4. **Verify before writing:** unwrap the new blob with the private key, compare byte-for-byte
   with the MEK from step 2, verify `mek_check`. If anything differs, abort the whole run.
5. Write `escrow_wrapped_mek`, `escrow_key_id`, `mek_check`, `mek_check_iv`. Do not touch any
   other column.
6. Print a summary: migrated, skipped (with ids), failed. Second run must report 0 to migrate
   (idempotent).

The service role key is used only for this run and only on Marc's Mac; it is not stored.

Gate: `select count(*) from profiles where encrypted_mek is not null and escrow_wrapped_mek is
null` is 0 (or only the skipped ids from step 3.2). Spot-check three accounts by running the
recover script against their blobs; it must yield a MEK that verifies against their
`mek_check`. Then wait one week with both mechanisms live.

### Step 4: release B, switch recovery to escrow

Code changes:

- `initializeEncryption` stops writing `recovery_*`.
- `unlockMEK`: the fallback via `recovery_key` is removed. On password unwrap failure the app
  checks `escrow_release`: present and not expired, ask for the one-time code (3.2 step 4);
  otherwise show the recovery screen (3.2 step 2). Every write in the release path is
  verified (`mek_check`) before the next write, and the old `encrypted_mek` is only replaced
  after the MEK has been verified.
- New screens: "Wiederherstellung nötig" and "Wiederherstellungscode eingeben".
- `scripts/escrow-recover.mjs` as described in 3.2.
- Datenschutzerklärung sections 3, 5, 7 and AGB § 4 (2)-(3), § 5 (3), § 9 (4) rewritten to
  the wording in 3.3. Same deploy.
- `encryption_version` set to 2 by the app once an account has the escrow blob.

Verification on the test account, end to end, before deploying to everyone (preview build on
4173 against production Supabase with the test account):

1. Password reset through the real email link, new password set.
2. Login: recovery screen appears, nothing written.
3. Run the recover script, paste the release values, log in with the code.
4. Patient list decrypts, invoice PDF renders, voucher list loads.
5. Log out and in again with the new password: no code asked, data decrypts.
6. Change the password in Settings, log out and in: data decrypts.
7. Enter a wrong code: clear error, nothing written, retry works.
8. Let the release expire (set the timestamp in the past): recovery screen again.

Gate: all eight pass on the test account. Deploy. Repeat 5 and 6 with Marc's real account
after the deploy. Then run a real password reset on the test account against the deployed app
once more.

### Step 5: null the old recovery columns

One SQL statement, run by Marc, only after step 4 has been live for at least one week and the
count from step 3's gate is still 0:

`update profiles set recovery_key = null, recovery_wrapped_mek = null, recovery_iv = null
where escrow_wrapped_mek is not null;`

From this moment the database no longer contains the means to decrypt itself. The plaintext
keys survive only in Supabase backups for the retention window noted in step 0.5 and in the
`age`-encrypted export from step 0.4.

Gate: `select count(*) from profiles where recovery_key is not null` is 0 or equals the
skipped ids from step 3. Login with the test account and with Marc's account works.

### Step 6: drop the columns

Two weeks after step 5, `supabase/migrations/0003_drop_recovery.sql` drops
`recovery_key`, `recovery_wrapped_mek`, `recovery_iv`. Delete the step 0.4 export once the
backup retention window has also passed.

### Step 7: documentation and legal

- ARCHITECTURE notes in this repo (or this file, moved to `docs/encryption.md`): the key
  hierarchy, the escrow design, the recovery runbook, the log location.
- Recovery log: a sheet in the EPHIA Drive, columns date, request id, who called, who ran the
  script.
- AVV TOM annex describes exactly this (see the separate AVV plan).

## 5. Phase 2 (self-service Worker), summary

Only after phase 1 is stable. Separate plan, separate deploy. Needs: Worker with the private
key as secret, Supabase token check via `/auth/v1/user`, rate limit, log, Resend notification.
The browser side reuses the same verify-then-write sequence as the one-time code path. Nothing
in phase 1 has to change for phase 2.

## 6. What could break, and what prevents it

| Risk | Prevention |
|------|------------|
| Public key constant in the bundle does not match the private key in Bitwarden | Step 2 gate: round-trip with the production private key before any migration runs |
| Migration writes a wrong blob | Step 3.4: every blob is unwrapped and compared before the write; abort on first mismatch |
| Migration misses accounts | Count query gates in steps 3 and 5; step 2 `unlockMEK` also fills blobs for anyone who logs in |
| An account whose `recovery_key` is already broken today | Logged and skipped in step 3, not nulled in step 5; handled by hand (the doctor still has password access; the app writes the escrow blob at their next login via step 2) |
| Private key lost | Two people hold the Bitwarden item; checked in step 0 and again before step 5 |
| Private key leaks | Rotate: new key pair with a new `escrow_key_id`, the app re-wraps at every login (same mechanism as step 2), old key retired once all rows carry the new id |
| Old recovery keys in Supabase backups | Known, time-limited (retention window), documented. No MEK rotation, since there is no indication of a leak and re-encrypting every row is the riskiest operation available |
| Recovery code path writes a wrong MEK under the new password | `mek_check` verified before any write; `encrypted_mek` replaced only after that |
| Doctor loses password while `escrow_release` is pending | Expiry, and the recover script can simply be run again |
| Worker (phase 2) down | Recovery falls back to phase 1; login never depends on the Worker |
| Legal text still claims zero-knowledge | Rewritten in the same deploy as step 4 |

## 7. Numbers and open points

Production figures (2026-11-08, read by Marc in the SQL editor):

| | |
|---|---|
| auth users | 26 |
| signed in within 30 days | 5 |
| ever requested a password reset | 1 |
| profiles with `encrypted_mek` (accounts the step 3 script will migrate) | 17 |
| of those with `recovery_key` | 17 (no already-broken accounts) |

The 9 accounts without `encrypted_mek` signed up but never completed a first login; they get
the escrow blob through `initializeEncryption` whenever they do, with no migration involved.

Consequences: step 3 handles 17 rows and can be checked by hand. With one reset in eight
months, phase 2 (the Worker) is not needed; the manual recovery in 3.2 is the design, not a
stopgap. Section 5 stays as a note for later.

Settled (2026-11-08):

- Backups: daily physical backups around 02:35 UTC, 7 days retained (Pro plan, no PITR).
  After step 5 the plaintext recovery keys are gone from every backup 7 days later; the
  `age` export from step 0.4 is deleted after that.
- Recovery channel: requests to `customerlove@ephia.de`, code sent to the account email (no phone
  line exists).
- Key storage: the escrow key pair does not exist yet; it is generated in step 0. Marc uses
  Bitwarden personally. Step 0 creates a free Bitwarden organisation for EPHIA with Marc and
  Sophia as members; the private key lives in a collection both can open. One holder would be
  a single point of failure for every doctor's recovery.

## 8. Effort

Step 0: half a day (mostly key handling and the export). Steps 1 to 4: two days of
implementation and testing. Steps 5 and 6: minutes each, but spread over three weeks of
waiting. Phase 2: one day, later.
