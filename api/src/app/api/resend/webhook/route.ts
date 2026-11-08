import { NextRequest, NextResponse } from "next/server";
import { verifyStandardWebhookSignature } from "@/lib/auth-hook";
import { rest } from "@/lib/shares";

// Resend delivery events (Svix = Standard Webhooks signature) → delivery status
// of document shares, so the practice sees a bounce. Setup: README.md.

export const runtime = "nodejs";

const STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  // Resend uses svix-* header names for the same scheme
  const h = new Headers(req.headers);
  for (const k of ["id", "timestamp", "signature"]) if (!h.get(`webhook-${k}`) && h.get(`svix-${k}`)) h.set(`webhook-${k}`, h.get(`svix-${k}`) as string);
  if (!verifyStandardWebhookSignature(raw, h, secret)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let evt: { type?: string; data?: { email_id?: string; tags?: Record<string, string> | { name: string; value: string }[] } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad payload" }, { status: 400 }); }
  const status = STATUS[evt.type || ""];
  const emailId = evt.data?.email_id;
  if (!status || !emailId) return NextResponse.json({ ok: true });
  // "delivered" must not overwrite a later bounce or complaint
  const guard = status === "delivered" ? "&delivery_status=eq.sent" : "";
  await rest(`document_shares?resend_id=eq.${encodeURIComponent(emailId)}${guard}`, { method: "PATCH", body: JSON.stringify({ delivery_status: status }) });
  return NextResponse.json({ ok: true });
}
