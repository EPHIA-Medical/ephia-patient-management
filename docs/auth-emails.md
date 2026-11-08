# Auth-Mails (Bestätigung, Passwort zurücksetzen)

Die App selbst versendet keine Mails. Supabase Auth (Projekt
`grfngjgjiipbgntsduom`) löst sie aus, seit November 2026 aber nicht mehr über
die eingebauten Supabase-Templates, sondern über den Auth-Hook "Send Email",
der auf die ephia-admin-App zeigt:

    https://admin.ephia.de/api/auth/invoicing-email-hook

Dort entsteht die EPHIA-Mail (Absender `noreply@ephia.de`, Versand über
Resend). Texte sind im Admin unter Transaktionale E-Mails, Funnel
"Ärzt:innen — Patient:innenverwaltung (Login)", editierbar.

Der Link in jeder Mail ist derselbe, den Supabase auch vorher gebaut hat
(`/auth/v1/verify?token=…&type=…&redirect_to=https://invoicing.ephia.de/`),
Supabase leitet nach der Prüfung mit der Session im URL-Hash zurück in die
App (`App.jsx`, `checkSession`). Für die App hat sich am Ablauf nichts
geändert; der Link funktioniert in jedem Browser und auf jedem Gerät.

Einrichtung, Betrieb und Fehlersuche: `docs/invoicing-auth-emails.md` im
Repository `ephia-admin`. Hook im Supabase-Dashboard deaktivieren = sofortiger
Rückfall auf die Supabase-Standardmails.
