# EPHIA Patient:innenverwaltung API

Server side of the Patient:innenverwaltung. The frontend in the repository
root is a static SPA on GitHub Pages; this folder is a small Next.js service
(route handlers only, no UI) that runs on Railway and holds everything that
needs a secret: today the Supabase auth mails, next the Stripe integration.

    api/
      src/app/api/health/route.ts          Railway health check
      src/app/api/auth/email-hook/route.ts Supabase "Send Email" hook
      src/lib/auth-hook.ts                 signature, payload, link planning (tested)
      src/lib/auth-emails.ts               German copy of the seven auth mails
      src/lib/email-layout.ts              EPHIA email layout (port of ephia-admin's)
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

4. Settings → Networking → Custom Domain, e.g. `api.invoicing.ephia.de`,
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
