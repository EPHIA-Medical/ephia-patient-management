import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  IP_ATTEMPTS_PER_HOUR, allowedOrigin, answerMatches, b64url, buildShareMail, cleanMessage, cleanPractice, hashAnswer,
  ipAllowed, isB64url, isValidEmail, maskEmail, newShareId, openHalfB, sealHalfB, shareState,
} from "@/lib/shares";

beforeAll(() => {
  process.env.SHARE_KEY_SECRET = crypto.randomBytes(32).toString("base64");
  process.env.APP_URL = "https://invoicing.ephia.de/";
});

describe("shares", () => {
  it("makes 22-character url-safe ids", () => {
    const id = newShareId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newShareId()).not.toBe(id);
  });

  it("checks base64url sizes", () => {
    const k = b64url(crypto.randomBytes(32));
    expect(isB64url(k, 32, 32)).toBe(true);
    expect(isB64url(k, 16, 16)).toBe(false);
    expect(isB64url("abc+/", 1)).toBe(false);
    expect(isB64url(42)).toBe(false);
  });

  it("validates and masks email addresses", () => {
    expect(isValidEmail("anna@example.de")).toBe(true);
    expect(isValidEmail("anna@example")).toBe(false);
    expect(isValidEmail("a b@example.de")).toBe(false);
    expect(maskEmail("anna.muster@example.de")).toBe("a•••@example.de");
  });

  it("seals and opens halfB with the server secret", () => {
    const half = crypto.randomBytes(32);
    const sealed = sealHalfB(half);
    expect(openHalfB(sealed.enc, sealed.iv).equals(half)).toBe(true);
    const tampered = sealed.enc.slice(0, -2) + (sealed.enc.endsWith("A") ? "BB" : "AA");
    expect(() => openHalfB(tampered, sealed.iv)).toThrow();
  });

  it("matches the verifier only exactly", () => {
    const salt = crypto.randomBytes(16);
    const v = b64url(crypto.randomBytes(32));
    const h = hashAnswer(v, salt);
    expect(answerMatches(v, b64url(salt), h)).toBe(true);
    expect(answerMatches(b64url(crypto.randomBytes(32)), b64url(salt), h)).toBe(false);
  });

  it("derives the link state", () => {
    const base = { expires_at: new Date(Date.now() + 86400_000).toISOString(), revoked_at: null, locked_at: null, half_b_enc: "x" };
    expect(shareState(base)).toBe("ok");
    expect(shareState({ ...base, revoked_at: "2026-01-01" })).toBe("revoked");
    expect(shareState({ ...base, locked_at: "2026-01-01" })).toBe("locked");
    expect(shareState({ ...base, half_b_enc: null })).toBe("expired");
    expect(shareState({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe("expired");
  });

  it("cleans practice data and messages", () => {
    expect(cleanPractice({ name: "  " })).toBeNull();
    expect(cleanPractice({ name: "Praxis X", email: "nope", phone: "030 1" })).toEqual({ name: "Praxis X", email: "", phone: "030 1" });
    expect(cleanMessage("a".repeat(600)).length).toBe(500);
  });

  it("writes a neutral Du-form email with the link and no exclamation marks", () => {
    const mail = buildShareMail({
      firstName: "Anna",
      practice: { name: "Praxis <Test>", email: "praxis@example.de", phone: "" },
      link: "https://invoicing.ephia.de/d/?s=abc#HALF",
      factorType: "dob",
      expiresAt: "2026-12-08T10:00:00.000Z",
      message: "",
    });
    expect(mail.subject).toBe("Deine Unterlagen von Praxis <Test>");
    expect(mail.html).toContain("Hallo Anna,");
    expect(mail.html).toContain("Dein Geburtsdatum");
    expect(mail.html).toContain("https://invoicing.ephia.de/d/?s=abc#HALF");
    expect(mail.html).toContain("Praxis &lt;Test&gt;");
    expect(mail.html).not.toContain("<Test>");
    expect(mail.html).toContain("08.12.2026");
    expect(mail.text).not.toMatch(/!/);
    const code = buildShareMail({ firstName: "", practice: { name: "P", email: "", phone: "" }, link: "https://x.de", factorType: "code", expiresAt: "2026-12-08T10:00:00Z", message: "Bis bald" });
    expect(code.html).toContain("Hallo,");
    expect(code.html).toContain("sechsstelligen Code");
    expect(code.html).toContain("Bis bald");
  });

  it("allows only the app and local dev origins", () => {
    expect(allowedOrigin("https://invoicing.ephia.de")).toBe("https://invoicing.ephia.de");
    expect(allowedOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(allowedOrigin("https://evil.example")).toBeNull();
  });

  it("limits unlock attempts per IP and hour", () => {
    const now = Date.now();
    for (let i = 0; i < IP_ATTEMPTS_PER_HOUR; i++) expect(ipAllowed("ip-x", now + i)).toBe(true);
    expect(ipAllowed("ip-x", now + 100)).toBe(false);
    expect(ipAllowed("ip-x", now + 3600_000 + 200)).toBe(true);
  });
});
