/**
 * Compact port of the EPHIA email design system (ephia-admin,
 * src/lib/email-layout.ts and docs/email/DESIGN.md): same tokens, same
 * components, reduced to what auth mails need. Pure functions returning
 * HTML strings; every text argument is escaped unless documented as HTML.
 *
 * Rules kept: white page, Roboto, "Hallo {Vorname}," or "Hallo,", at most
 * one primary button and one peach info box, hidden preheader, footer with
 * logo, company line, Impressum and Datenschutz, light-only colour scheme,
 * no exclamation marks or emojis in body text.
 */

export const EMAIL_TOKENS = {
  pageBackground: "#ffffff",
  text: "#14151f",
  muted: "#61626f",
  primary: "#0066ff",
  highlight: "#faebe1",
  divider: "#e3ddd8",
  fontStack: "Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif",
  logoUrl: "https://kurse.ephia.de/logos/ephia-logo.png",
  impressumUrl: "https://ephia.de/impressum",
  datenschutzUrl: "https://ephia.de/datenschutz",
} as const;

const T = EMAIL_TOKENS;
const BODY_STYLE = `font-family:${T.fontStack};font-size:16px;line-height:1.65;color:${T.text};`;
const FOOTER_COMPANY_LINE = "EPHIA Medical GmbH · Dorfstraße 30 · 15913 Märkische Heide";
const PREHEADER_MAX = 90;

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** http(s) and mailto links only; anything else renders as plain text. */
export function safeLinkUrl(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (/^mailto:/i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&zwnj;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Hallo Anna," or "Hallo," when there is no name. */
export function greeting(firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  return `<p style="margin:0 0 16px;${BODY_STYLE}">Hallo${name ? ` ${escapeHtml(name)}` : ""},</p>`;
}

/** Body paragraph. `html` is inline HTML, already safe. */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 20px;${BODY_STYLE}">${html}</p>`;
}

/** Primary button (600 15px, 13px 24px, radius 8px, white on primary). */
export function button(href: string, label: string): string {
  const url = safeLinkUrl(href);
  if (!url) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr><td style="border-radius:8px;background-color:${T.primary};"><a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${T.fontStack};font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** The peach highlight box for the one thing the reader must not miss. */
export function infoBox(eyebrow: string, headlineValue: string): string {
  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 6px;${BODY_STYLE}font-size:11px;line-height:1.4;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${T.muted};">${escapeHtml(eyebrow)}</p>`
    : "";
  const headlineHtml = headlineValue
    ? `<p style="margin:0;${BODY_STYLE}font-size:19px;line-height:1.35;font-weight:600;">${escapeHtml(headlineValue)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-ephia-infobox="1" style="margin:0 0 24px;"><tr><td class="ephia-box" style="background-color:${T.highlight};border-radius:16px;padding:24px 28px;">${eyebrowHtml}${headlineHtml}</td></tr></table>`;
}

/** Sign-off of system-sent mail. */
export function teamSignature(): string {
  return `<p style="margin:28px 0 0;${BODY_STYLE}">Liebe Grüße</p><p style="margin:6px 0 0;${BODY_STYLE}font-size:14px;line-height:1.5;"><strong style="color:${T.text};">Dein EPHIA-Team</strong></p>`;
}

function footer(): string {
  const muted = `font-family:${T.fontStack};font-size:12px;line-height:1.6;color:${T.muted};`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-ephia-footer="1" style="margin-top:40px;"><tr><td style="border-top:1px solid ${T.divider};padding:24px 0 0;">
<img src="${T.logoUrl}" width="96" height="24" alt="EPHIA" style="display:block;width:96px;height:24px;border:0;margin:0 0 12px;">
<p style="margin:0;${muted}">${FOOTER_COMPANY_LINE}</p>
<p style="margin:6px 0 0;${muted}"><a href="${T.impressumUrl}" style="color:${T.muted};text-decoration:underline;">Impressum</a> · <a href="${T.datenschutzUrl}" style="color:${T.muted};text-decoration:underline;">Datenschutz</a></p>
</td></tr></table>`;
}

/** Trim text to the preheader length at a word boundary. */
export function clampPreheader(text: string): string {
  const t = htmlToText(text);
  if (t.length <= PREHEADER_MAX) return t;
  const cut = t.slice(0, PREHEADER_MAX + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut.slice(0, PREHEADER_MAX)).replace(/[,;:]$/, "")}…`;
}

/**
 * The full email document: light-only head with the Roboto import, hidden
 * preheader, centred content column, footer. `bodyHtml` is the composed
 * body (greeting, paragraphs, button or info box, signature).
 */
export function layout(preheader: string, bodyHtml: string, title: string): string {
  const pre = clampPreheader(preheader);
  const padding = "&nbsp;&zwnj;".repeat(60);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap');
body { margin:0; padding:0; background-color:${T.pageBackground}; }
@media only screen and (max-width:600px) {
  .ephia-content { padding:32px 16px 40px !important; }
  .ephia-box { padding:20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${T.pageBackground};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${T.pageBackground};opacity:0;">${escapeHtml(pre)}${padding}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${T.pageBackground};">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td class="ephia-content" style="padding:40px 20px 48px;text-align:left;${BODY_STYLE}">
${bodyHtml}
${footer()}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export interface BuildEmailHtmlArgs {
  /** Recipient's first name. Empty renders "Hallo,". */
  firstName: string;
  /** Document title, usually the subject. */
  title: string;
  /** First paragraph after the greeting (inline HTML, already safe). */
  intro: string;
  /** The one primary button. */
  button?: { label: string; url: string };
  /** The one highlight box, e.g. a code. */
  infoBox?: { eyebrow: string; headline: string };
}

export function buildEmailHtml(args: BuildEmailHtmlArgs): string {
  const body = [
    greeting(args.firstName),
    paragraph(args.intro),
    args.button ? button(args.button.url, args.button.label) : "",
    args.infoBox ? infoBox(args.infoBox.eyebrow, args.infoBox.headline) : "",
    teamSignature(),
  ]
    .filter(Boolean)
    .join("\n");
  return layout(args.intro, body, args.title);
}
