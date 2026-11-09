# EPHIA Patient Management System API

Server side of the EPHIA Patient Management System. The frontend in the repository
root is a static SPA on GitHub Pages; this folder is a small Next.js service
(route handlers only, no UI) that runs on Railway and holds everything that
needs a secret: today the Supabase auth mails, next the Stripe integration.

    api/
      src/app/api/health/route.ts          Railway health check
      src/app/api/auth/email-hook/route.ts Supabase "Send Email" hook
      src/lib/auth-hook.ts                 signature, payload, link planning (tested)
      src/lib/auth-emails.ts               German copy of the seven auth mails
      src/lib/email-layout.ts              EPHIA email layout (port of ephia-admin's)
      src/app/api/shares/...               secure document sending (below)
      src/lib/shares.ts                    its crypto, storage, email (tested)
      src/app/api/invites/route.ts         invitations sent from admin.ephia.de (below)
      src/app/i/[token]/route.ts           the link in the invite email
      src/lib/invites.ts                   invite tokens, links, email, landing page (tested)
      scripts/auth-hook-test.ts            fires a signed test request

## Local

    cd api
    npm install
    cp .env.example .env.local   # fill AUTH_EMAIL_HOOK_SECRET and RESEND_API_KEY
    npm run dev                  # http://localhost:3010/api/health
    npm test
    npm run typecheck

## Railway (once)

1. Railway → New Project → Deploy from GitHub repo
   `EPHIA-Medical/ephia-patient-management`.
2. Service → Settings → Source → **Root Directory `api`**. Add a watch path
   `api/**` so frontend commits do not redeploy the API. Build and start
   come from `railway.json` (Nixpacks, `npm start`, health check
   `/api/health`).
3. Variables (Service → Variables):

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | `https://grfngjgjiipbgntsduom.supabase.co` |
   | `APP_URL` | `https://invoicing.ephia.de/` |
   | `RESEND_API_KEY` | a Resend key with sending rights for ephia.de (make a separate key for this service) |
   | `EMAIL_FROM` | `EPHIA <noreply@ephia.de>` |
   | `AUTH_EMAIL_HOOK_SECRET` | the secret from step 5, with its `v1,whsec_` prefix |

4. Settings → Networking → Custom Domain, e.g. `api.invoicing.ephia.de` (the frontend domain is still invoicing.ephia.de until it moves),
   and the CNAME it shows in Cloudflare (DNS only, not proxied, or proxied
   with the Railway-recommended setting). `GET /api/health` must answer
   `{"ok":true,...}` with every `configured` flag `true` before step 6.
5. Supabase dashboard of the project → Authentication → Hooks → "Send
   Email": Enable, type HTTPS, URL
   `https://<your domain>/api/auth/email-hook`, "Generate secret". Copy it
   to Railway (step 3) and wait for the redeploy **before** saving the hook.
6. Save the hook. From now on Supabase sends no auth mail itself.
7. Test on invoicing.ephia.de: "Passwort vergessen?" with your own address,
   then a signup with a throwaway address. Both mails arrive from
   noreply@ephia.de and the links land in the app.

Link validity is Authentication → Email → "Email OTP Expiration". The copy
in `src/lib/auth-emails.ts` says one hour (Supabase default); change both
together.

## Operations

- Resend tags every mail `ephia-purpose: pms-auth-<kind>`.
- 401 in the Railway logs (`[email-hook] Ungültige Signatur`): Railway
  variable and dashboard secret differ. Regenerate in Supabase, update
  Railway, save the hook again.
- 500 with a Resend error goes back to Supabase, which shows the user an
  error on signup / reset instead of pretending the mail went out. Supabase
  retries on timeout, so a slow Resend can produce a duplicate mail.
- Disabling the hook in the Supabase dashboard falls back to Supabase's
  own templates at any time.
- `AUTH_EMAIL_HOOK_SECRET=... npx tsx scripts/auth-hook-test.ts <url> <to>`
  sends a real recovery mail through a running instance.

## Secure document sending

Practices send documents to patients as a link (concept: "Sicherer
Dokumentenversand, Version A"). The browser encrypts the PDFs with
K = HKDF(halfA ‖ halfB ‖ F); see `src/lib/shareCrypto.js` in the app.
This service stores the ciphertext (bucket `document-shares`) and halfB
(encrypted with `SHARE_KEY_SECRET`), checks a PBKDF2 verifier of the date of
birth or code (stored as scrypt hash), and sends the email via Resend.
halfA and the recipient address pass through the send call into the email
and are never stored.

| Route | Who | Does |
|---|---|---|
| `POST /api/shares` | practice (Supabase token) | store files + halfB, send the email |
| `GET /api/shares?docs=a,b` | practice | status of the links of these documents |
| `GET /api/shares/:id` | public | practice name, factor type, state |
| `POST /api/shares/:id/unlock` | public, 5 tries per link, 20 per IP and hour | verifier → halfB + 5-minute file URLs |
| `POST /api/shares/:id/revoke` | practice | delete files and secrets |
| `POST /api/resend/webhook` | Resend (signed) | bounce / complaint → status |

Setup (once):

1. Run `supabase/migrations/0005_document_shares.sql` in the Supabase SQL editor.
2. Railway variables: `SUPABASE_SERVICE_ROLE_KEY`, `SHARE_KEY_SECRET`
   (`openssl rand -base64 32`), optionally `SHARE_EMAIL_FROM_ADDRESS`.
   `RESEND_API_KEY` is shared with the auth mails; a sending-only key is enough.
3. Resend → Webhooks → endpoint `https://<api domain>/api/resend/webhook`,
   events delivered, bounced, complained, failed; secret → `RESEND_WEBHOOK_SECRET`.
4. `GET /api/health`: all `configured` flags true.

Expired links lose files and secrets lazily on the next send (at most every
10 minutes); status rows are deleted after a year.

## Invitations from admin.ephia.de

The team sends an invitation from a person's page in admin.ephia.de
(card "Patient Management System"). ephia-admin calls `POST /api/invites`
with `Authorization: Bearer $PMS_INVITE_SECRET`; `GET /api/invites?email=`
returns the status (`none`, `invited`, `expired`, `active`).

The email links to `{API_URL}/i/<token>`, valid 14 days (only the token's
SHA-256 is stored in `pms_invites`). GET shows a page with one button; only
its POST asks Supabase (`admin/generate_link`, no Supabase mail) for an
invite link, or a recovery link if the account is already confirmed but has
no keys yet, and redirects there with `redirect_to = APP_URL?einladung=1`.
That way mail scanners cannot use up the link and Supabase's one hour starts
at the click. The app then shows "Passwort festlegen" with welcome wording; the
doctor signs in with her own address (no automatic sign-in from the URL
token, against login CSRF) and that first login creates the keys as after a
normal signup. A new invite to the same
address revokes the older one; addresses with keys get no mail (`active`).

Setup: run `supabase/migrations/0006_pms_invites.sql`, set
`PMS_INVITE_SECRET` here and the same value in ephia-admin, and
`/api/health` shows `pmsInviteSecret: true`.
