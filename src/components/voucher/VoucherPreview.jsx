import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fmt, fmtDate, fmtPhone } from "../../utils/helpers";

// ═══════════════════ Geschenkgutschein (the gift card itself) ═══════════════════
// Customer-facing artifact: branded card (EPHIA cream/blue, Roboto) on an A4 page
// so it prints / shares as PDF cleanly. The QR encodes the plaintext voucher code,
// which the practice scans in the invoice form to redeem. Offline-friendly: the QR
// is just the code string, no URL.

export default function VoucherPreview({ practice = {}, voucher = {} }) {
  const [qrUrl, setQrUrl] = useState("");
  const code = voucher.code || "";
  const nennwert = Number(voucher.nennwert) || 0;

  useEffect(() => {
    if (!code) { setQrUrl(""); return; }
    let cancelled = false;
    QRCode.toDataURL(code, { margin: 0, width: 320, errorCorrectionLevel: "M", color: { dark: "#0a1f44", light: "#FAEBE1" } })
      .then((url) => { if (!cancelled) setQrUrl(url); })
      .catch(() => { if (!cancelled) setQrUrl(""); });
    return () => { cancelled = true; };
  }, [code]);

  const BRAND = "#0066FF";
  const INK = "#0a1f44";
  const FONT = "Roboto, 'Segoe UI', Arial, sans-serif";

  // One shared eyebrow-label style so every uppercase caption matches.
  const label = { fontSize: "11px", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" };

  const S = {
    page: { fontFamily: FONT, width: "210mm", minHeight: "297mm", margin: "0 auto", background: "white", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" },
    card: { width: "170mm", background: "#FAEBE1", borderRadius: "24px", padding: "48px 52px", color: INK, position: "relative", boxSizing: "border-box", fontFamily: FONT },
  };

  return (
    <div id="voucher-preview" style={S.page}>
      <div style={S.card}>
        {/* Header: practice identity */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" }}>
          {practice.logo ? (
            <img src={practice.logo} alt="Logo" style={{ maxHeight: "54px", maxWidth: "200px", objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: "20px", fontWeight: 700 }}>{practice.name || "Praxis"}</div>
          )}
          <div style={{ ...label, color: BRAND, paddingTop: "6px" }}>
            Geschenkgutschein
          </div>
        </div>

        {/* Value */}
        <div style={{ ...label, opacity: 0.55, marginBottom: "8px" }}>Wert</div>
        <div style={{ fontSize: "64px", fontWeight: 700, lineHeight: 1, marginBottom: "40px" }}>
          {fmt(nennwert)} €
        </div>

        {/* QR + code */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px", background: "rgba(255,255,255,0.45)", borderRadius: "16px", padding: "24px 28px", marginBottom: "36px" }}>
          {qrUrl ? (
            <img src={qrUrl} alt="QR-Code" style={{ width: "128px", height: "128px", flexShrink: 0 }} />
          ) : (
            <div style={{ width: "128px", height: "128px", flexShrink: 0, background: "#fff", borderRadius: "8px" }} />
          )}
          <div>
            <div style={{ ...label, opacity: 0.55, marginBottom: "6px" }}>Gutscheincode</div>
            <div style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "1px" }}>{code || "—"}</div>
            {voucher.gueltigBis && (
              <div style={{ fontSize: "13px", fontWeight: 400, opacity: 0.7, marginTop: "10px" }}>Gültig bis {fmtDate(voucher.gueltigBis)}</div>
            )}
          </div>
        </div>

        {/* CTA: how to book an appointment */}
        {(practice.phone || practice.email) && (
          <div style={{ background: BRAND, color: "#fff", borderRadius: "16px", padding: "22px 28px", marginBottom: "28px" }}>
            <div style={{ ...label, opacity: 0.9, marginBottom: "12px" }}>
              Jetzt Termin vereinbaren
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", fontSize: "17px", fontWeight: 600 }}>
              {practice.phone && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  {fmtPhone(practice.phone)}
                </span>
              )}
              {practice.email && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
                  {practice.email}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer note */}
        <div style={{ fontSize: "12px", fontWeight: 400, lineHeight: 1.6, opacity: 0.7 }}>
          Einzulösen bei {[practice.name || "uns", practice.address1, practice.address2, practice.address3].filter(Boolean).join(", ")}. Übertragbar · keine Barauszahlung.
        </div>
      </div>
    </div>
  );
}
