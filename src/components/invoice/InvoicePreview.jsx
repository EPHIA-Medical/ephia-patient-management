import React from "react";
import { fmtDate, fmt, fmtPhone } from "../../utils/helpers";

// ═══════════════════ Invoice Preview ═══════════════════

export default function InvoicePreview({ practice, patient: rawPatient, invoiceMeta, lineItems, begruendung, targetGesamt, voucherRedemption, paymentStatus }) {
  const patient = rawPatient || {};
  const isPaid = paymentStatus === "bezahlt";
  // Bank details are pointless on a settled invoice and can be disabled globally in settings
  const showBank = !isPaid && practice.showBankOnInvoice !== false;
  const zwischensumme = lineItems.reduce((s, it) => s + it.betrag, 0);
  const isKlein = practice.kleinunternehmer;
  const isAusland = patient.country && patient.country !== "Deutschland";
  const isMedical = !!(invoiceMeta && invoiceMeta.diagnose);
  const noMwst = isKlein || isAusland || isMedical;
  // When targetGesamt is set, force the total to match and derive MwSt as the difference
  const standardMwst = noMwst ? 0 : Math.round(zwischensumme * 0.19 * 100) / 100;
  const standardGesamt = Math.round((zwischensumme + standardMwst) * 100) / 100;
  const gesamt = (targetGesamt && !noMwst && targetGesamt !== standardGesamt) ? targetGesamt : standardGesamt;
  const mwst = (targetGesamt && !noMwst && targetGesamt !== standardGesamt) ? Math.round((targetGesamt - zwischensumme) * 100) / 100 : standardMwst;
  const hasHonorarvereinbarung = lineItems.some((it) => it.steigerung != null && it.steigerung > 3.5);

  const S = {
    page: { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "11px", lineHeight: "1.55", color: "#1a1a1a", padding: "40px 44px", width: "210mm", minHeight: "297mm", margin: "0 auto", background: "white", position: "relative", boxSizing: "border-box", overflow: "hidden" },
    h: { fontSize: "16px", fontWeight: "700", color: "#222", marginBottom: "4px" },
    addr: { fontSize: "11px", color: "#444", marginBottom: "28px" },
    patLabel: { fontSize: "9.5px", color: "#999", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" },
    th: { textAlign: "left", padding: "5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thFirst: { textAlign: "left", padding: "5px 6px 5px 0", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thR: { textAlign: "right", padding: "5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thRLast: { textAlign: "right", padding: "5px 0 5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    td: { padding: "5px 6px", borderBottom: "0.5px solid #e5e5e5", wordWrap: "break-word", overflow: "hidden" },
    tdFirst: { padding: "5px 6px 5px 0", borderBottom: "0.5px solid #e5e5e5", wordWrap: "break-word", overflow: "hidden" },
    tdR: { padding: "5px 6px", textAlign: "right", borderBottom: "0.5px solid #e5e5e5" },
    tdRLast: { padding: "5px 0 5px 6px", textAlign: "right", borderBottom: "0.5px solid #e5e5e5" },
  };

  return (
    <div id="invoice-preview" style={S.page}>
      {practice.logo && !practice.logoReplacesName && (
        <img src={practice.logo} alt="Logo" style={{ position: "absolute", top: "40px", right: "44px", maxHeight: "60px", maxWidth: "160px", objectFit: "contain" }} />
      )}
      {practice.logo && practice.logoReplacesName ? (
        <div style={{ marginBottom: "8px" }}>
          <img src={practice.logo} alt="Logo" style={{ maxHeight: "60px", maxWidth: "200px", objectFit: "contain", display: "block" }} />
        </div>
      ) : (
        <div style={S.h}>{practice.name || "Logo Arztpraxis"}</div>
      )}
      {practice.logo && practice.logoReplacesName && practice.name && (
        <div style={{ fontSize: "13px", fontWeight: "600", color: "#222", marginBottom: "2px" }}>{practice.name}</div>
      )}
      <div style={S.addr}>
        <div>{practice.address1}</div>
        <div>{practice.address2}</div>
        {practice.address3 && <div>{practice.address3}</div>}
      </div>

      <div style={{ marginBottom: "28px" }}>
        <div style={S.patLabel}>Anschrift Patient:in</div>
        <div>{[patient.vorname, patient.nachname].filter(Boolean).join(" ") || patient.name || ""}</div>
        <div>{patient.address1 || ""}</div>
        <div>{patient.address2 || ""}</div>
        {patient.country && patient.country !== "Deutschland" && (
          <div>{patient.country}</div>
        )}
      </div>

      <div style={{ marginBottom: "6px" }}>
        {invoiceMeta.ort}{invoiceMeta.ort && invoiceMeta.datum ? ", " : ""}{fmtDate(invoiceMeta.datum)}
      </div>
      <div style={{ fontWeight: "700", fontSize: "12px", marginBottom: invoiceMeta.diagnose ? "6px" : "18px" }}>
        Rechnung Nr. {invoiceMeta.nummer || "X"}
      </div>
      {invoiceMeta.diagnose && (
        <div style={{ fontSize: "10px", color: "#444", marginBottom: "14px" }}>
          Diagnose: {invoiceMeta.diagnose}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "11px", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "40%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={S.thFirst}>GOÄ-Ziffer</th>
            <th style={S.th}>Bezeichnung der Leistung</th>
            <th style={S.thR}>Punktzahl</th>
            <th style={S.thR}>Steigerungssatz</th>
            <th style={S.thRLast}>Betrag (€)</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((it, i) => (
            <tr key={i}>
              <td style={S.tdFirst}>{it.goaCode}</td>
              <td style={S.td}>{it.description}</td>
              <td style={S.tdR}>{it.punkte ?? ""}</td>
              <td style={S.tdR}>{it.steigerung != null ? (Math.round(it.steigerung * 100) / 100).toFixed(2).replace(".", ",") : ""}</td>
              <td style={S.tdRLast}>{fmt(it.betrag)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {!noMwst && (
            <tr style={{ borderTop: "1.5px solid #222" }}>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Zwischensumme</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(zwischensumme)}</td>
            </tr>
          )}
          {!noMwst && (
            <tr>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Zzgl. 19% MwSt.</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(mwst)}</td>
            </tr>
          )}
          <tr style={{ fontWeight: "700", borderTop: noMwst ? "1.5px solid #222" : undefined }}>
            <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Gesamtbetrag</td>
            <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(gesamt)}</td>
          </tr>
          {voucherRedemption && voucherRedemption.betrag > 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>
                Abzüglich Wertgutschein {voucherRedemption.code ? `(${voucherRedemption.code})` : ""}
              </td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>−{fmt(voucherRedemption.betrag)}</td>
            </tr>
          )}
          {voucherRedemption && voucherRedemption.betrag > 0 && (
            <tr style={{ fontWeight: "700", borderTop: "1.5px solid #222" }}>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Zahlbetrag</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(Math.round((gesamt - voucherRedemption.betrag) * 100) / 100)}</td>
            </tr>
          )}
          {isKlein && (
            <tr>
              <td colSpan={5} style={{ padding: "8px 0 0 0", fontSize: "9px", color: "#888" }}>
                Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
              </td>
            </tr>
          )}
          {isAusland && !isKlein && !isMedical && (
            <tr>
              <td colSpan={5} style={{ padding: "8px 0 0 0", fontSize: "9px", color: "#888" }}>
                Kein inländischer Wohnsitz. Umsatzsteuer entfällt.
              </td>
            </tr>
          )}
          {isMedical && !isKlein && (
            <tr>
              <td colSpan={5} style={{ padding: "8px 0 0 0", fontSize: "9px", color: "#888" }}>
                Umsatzsteuerbefreit gemäß §4 Nr. 14a UStG (Heilbehandlung im Bereich der Humanmedizin).
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {begruendung && (
        <div style={{ fontSize: "10px", color: "#444", marginBottom: "16px" }}>
          <span style={{ fontWeight: 600 }}>Begründung gemäß §5 Abs. 2 GOÄ:</span>{" "}
          <span style={{ fontStyle: "italic" }}>{begruendung}</span>
        </div>
      )}

      {hasHonorarvereinbarung && (
        <div style={{ fontSize: "10px", color: "#444", marginBottom: "16px", fontStyle: "italic" }}>
          Abrechnung gemäß § 2 GOÄ auf Grundlage einer vor Behandlungsbeginn geschlossenen Honorarvereinbarung.
        </div>
      )}

      {isPaid ? (
        <div style={{ fontSize: "10px", color: "#444", marginBottom: "16px" }}>
          Der Rechnungsbetrag wurde bereits vollständig beglichen. Betrag dankend erhalten.
        </div>
      ) : invoiceMeta.zahlungsfrist != null && invoiceMeta.zahlungsfrist !== "" && (
        <div style={{ fontSize: "10px", color: "#444", marginBottom: "16px" }}>
          Bitte überweisen Sie den Rechnungsbetrag innerhalb von {invoiceMeta.zahlungsfrist} Tagen
          {invoiceMeta.datum ? (() => { const d = new Date(invoiceMeta.datum); d.setDate(d.getDate() + Number(invoiceMeta.zahlungsfrist)); return ` (bis zum ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })})`; })() : ""}
          {showBank ? " auf das unten angegebene Konto." : "."}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#888", borderTop: "1px solid #ccc", paddingTop: "8px", position: "absolute", bottom: "40px", left: "44px", right: "44px" }}>
        <div>
          <div>{fmtPhone(practice.phone)}</div>
          <div>{practice.email}</div>
          {practice.steuernummer && <div>Steuernummer: {practice.steuernummer}</div>}
        </div>
        {showBank && (
          <div style={{ textAlign: "right" }}>
            {practice.bankName && <div>{practice.bankName}</div>}
            {practice.iban && <div>IBAN: {practice.iban}</div>}
            {practice.bic && <div>BIC: {practice.bic}</div>}
            {practice.paypal && <div>PayPal: {practice.paypal}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

