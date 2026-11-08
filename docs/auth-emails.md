# Auth-Mails des EPHIA Patient Management Systems (Bestätigung, Passwort zurücksetzen)

Das Frontend versendet keine Mails. Supabase Auth (Projekt
`grfngjgjiipbgntsduom`) löst sie aus, seit November 2026 aber nicht mehr über
die eingebauten Supabase-Templates, sondern über den Auth-Hook "Send Email",
der auf den eigenen API-Dienst dieser App zeigt (`api/` in diesem
Repository, läuft auf Railway):

    https://<API-Domain>/api/auth/email-hook

Dort entsteht die EPHIA-Mail (Absender `noreply@ephia.de`, Versand über
Resend). Texte: `api/src/lib/auth-emails.ts`.

Der Link in jeder Mail ist derselbe, den Supabase auch vorher gebaut hat
(`/auth/v1/verify?token=…&type=…&redirect_to=https://invoicing.ephia.de/`),
Supabase leitet nach der Prüfung mit der Session im URL-Hash zurück in die
App (`App.jsx`, `checkSession`). Für das Frontend hat sich am Ablauf nichts
geändert; der Link funktioniert in jedem Browser und auf jedem Gerät.

Einrichtung, Betrieb und Fehlersuche: `api/README.md`. Hook im
Supabase-Dashboard deaktivieren = sofortiger Rückfall auf die
Supabase-Standardmails.
