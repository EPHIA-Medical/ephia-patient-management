import { buildEmailHtml, escapeHtml } from "@/lib/email-layout";
import type { AuthMailKind, PlannedAuthMail } from "@/lib/auth-hook";

// Auth mails sent by src/app/api/auth/email-hook/route.ts in place of
// Supabase's built-in templates. Copy lives here in code; change it with a
// commit. Customer-facing German: "Du" capitalised, gender colon, no
// exclamation marks, no dashes as punctuation (BRAND_MANUAL in ephia-admin).
//
// Link validity: Supabase Auth → Email → "Email OTP Expiration" of the
// project. The copy says one hour (Supabase default, 3600 s); if that
// setting changes, change the text here too.
//
// The app registers accounts with email and password only, so there is
// usually no first name and the greeting falls back to "Hallo,".

export const PRODUCT_NAME = "EPHIA Patient Management System";

interface LinkCopy {
  subject: string;
  intro: string;
  button: string;
}

const IGNORE = "Wenn Du das nicht warst, kannst Du diese E-Mail einfach ignorieren.";

export const LINK_COPY: Record<Exclude<AuthMailKind, "reauthentication">, LinkCopy> = {
  signup: {
    subject: "Bitte bestätige Deine E-Mail-Adresse",
    intro: `Du hast ein Konto für das ${PRODUCT_NAME} angelegt. Bestätige bitte Deine E-Mail-Adresse mit einem Klick auf den Button, danach kannst Du Dich anmelden. Der Link ist eine Stunde gültig. Wenn Du kein Konto angelegt hast, kannst Du diese E-Mail einfach ignorieren.`,
    button: "E-Mail-Adresse bestätigen",
  },
  recovery: {
    subject: "Passwort zurücksetzen",
    intro: `Du hast einen Link zum Zurücksetzen Deines Passworts für das ${PRODUCT_NAME} angefordert. Klicke auf den Button unten, um ein neues Passwort zu setzen. Der Link ist eine Stunde gültig. ${IGNORE}`,
    button: "Neues Passwort setzen",
  },
  magiclink: {
    subject: "Dein Anmeldelink",
    intro: `Mit diesem Link meldest Du Dich ohne Passwort beim ${PRODUCT_NAME} an. Der Link ist eine Stunde gültig und funktioniert nur einmal. Wenn Du keine Anmeldung angefordert hast, kannst Du diese E-Mail einfach ignorieren.`,
    button: "Jetzt anmelden",
  },
  invite: {
    subject: `Deine Einladung zum ${PRODUCT_NAME}`,
    intro: `Du wurdest zum ${PRODUCT_NAME} eingeladen. Klicke auf den Button, um Dein Konto einzurichten und ein Passwort zu wählen. Der Link ist eine Stunde gültig.`,
    button: "Einladung annehmen",
  },
  email_change_new: {
    subject: "Bitte bestätige Deine neue E-Mail-Adresse",
    intro: `Du möchtest Dein Konto beim ${PRODUCT_NAME} auf die Adresse {{neue_email}} umstellen. Bestätige die neue Adresse bitte mit einem Klick auf den Button. Der Link ist eine Stunde gültig.`,
    button: "Neue E-Mail-Adresse bestätigen",
  },
  email_change_current: {
    subject: "Änderung Deiner E-Mail-Adresse bestätigen",
    intro: `Für Dein Konto beim ${PRODUCT_NAME} wurde eine Änderung der E-Mail-Adresse auf {{neue_email}} angefordert. Bitte bestätige die Änderung auch von Deiner bisherigen Adresse aus. Wenn Du das nicht warst, ändere bitte umgehend Dein Passwort und schreib uns an customerlove@ephia.de.`,
    button: "Änderung bestätigen",
  },
};

export const CODE_COPY = {
  subject: "Dein Bestätigungscode",
  intro: `Zur Bestätigung Deiner Identität im ${PRODUCT_NAME} brauchst Du diesen Code. Gib ihn in der App ein. Er ist nur kurze Zeit gültig. Wenn Du keinen Code angefordert hast, kannst Du diese E-Mail einfach ignorieren.`,
  codeLabel: "Dein Code",
};

/** One planned mail in, subject and HTML out. */
export function buildAuthMail(
  mail: PlannedAuthMail,
  firstName: string,
): { subject: string; html: string } {
  if (mail.kind === "reauthentication") {
    return {
      subject: CODE_COPY.subject,
      html: buildEmailHtml({
        firstName,
        title: CODE_COPY.subject,
        intro: escapeHtml(CODE_COPY.intro),
        infoBox: { eyebrow: CODE_COPY.codeLabel, headline: mail.code ?? "" },
      }),
    };
  }
  const copy = LINK_COPY[mail.kind];
  const intro = escapeHtml(copy.intro).replace(
    "{{neue_email}}",
    `<strong>${escapeHtml(mail.newEmail ?? "")}</strong>`,
  );
  return {
    subject: copy.subject,
    html: buildEmailHtml({
      firstName,
      title: copy.subject,
      intro,
      button: { label: copy.button, url: mail.link ?? "" },
    }),
  };
}
