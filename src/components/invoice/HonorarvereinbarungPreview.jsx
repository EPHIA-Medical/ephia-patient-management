import React from "react";
import { fmtDate, fmt } from "../../utils/helpers";

// ═══════════════════ Honorarvereinbarung Preview ═══════════════════

export default function HonorarvereinbarungPreview({ practice, patient: rawPatient, invoiceMeta, lineItems, isStandalone, signatures, onSignatureClick, onDoctorSign }) {
  const patient = rawPatient || {};
  const goaItems = lineItems.filter((it) => !it.isProduct);
  const praeparatItems = lineItems.filter((it) => it.isPraeparat);
  // For standalone HV: include all items (GOÄ + Präparat) in the table
  const tableItems = isStandalone ? lineItems.filter((it) => !it.isProduct || it.isPraeparat) : goaItems;
  const tableZwischensumme = tableItems.reduce((s, it) => s + it.betrag, 0);
  const isKlein = practice.kleinunternehmer;
  const isMedical = !!(invoiceMeta && invoiceMeta.diagnose);
  const noMwst = isKlein || isMedical;
  const tableMwst = noMwst ? 0 : Math.round(tableZwischensumme * 0.19 * 100) / 100;
  const tableGesamt = Math.round((tableZwischensumme + tableMwst) * 100) / 100;
  // For non-standalone, keep old variable names for backwards compat
  const goaZwischensumme = isStandalone ? tableZwischensumme : goaItems.reduce((s, it) => s + it.betrag, 0);
  const goaMwst = isStandalone ? tableMwst : (noMwst ? 0 : Math.round(goaZwischensumme * 0.19 * 100) / 100);
  const goaGesamt = isStandalone ? tableGesamt : Math.round((goaZwischensumme + goaMwst) * 100) / 100;
  const hasPraeparat = praeparatItems.length > 0;

  const S = {
    page: { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "11px", lineHeight: "1.55", color: "#1a1a1a", padding: "40px 44px", width: "210mm", minHeight: "297mm", margin: "0 auto", background: "white", position: "relative", boxSizing: "border-box", overflow: "hidden" },
    th: { textAlign: "left", padding: "5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thFirst: { textAlign: "left", padding: "5px 6px 5px 0", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thR: { textAlign: "right", padding: "5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    thRLast: { textAlign: "right", padding: "5px 0 5px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" },
    td: { padding: "5px 6px", borderBottom: "0.5px solid #e5e5e5", wordWrap: "break-word", overflow: "hidden" },
    tdFirst: { padding: "5px 6px 5px 0", borderBottom: "0.5px solid #e5e5e5", wordWrap: "break-word", overflow: "hidden" },
    tdR: { padding: "5px 6px", textAlign: "right", borderBottom: "0.5px solid #e5e5e5" },
    tdRLast: { padding: "5px 0 5px 6px", textAlign: "right", borderBottom: "0.5px solid #e5e5e5" },
    line: { borderBottom: "1px solid #222", display: "inline-block", minWidth: "340px" },
  };

  return (
    <div id="hv-preview" style={S.page}>
      {practice.logo && !practice.logoReplacesName && (
        <img src={practice.logo} alt="Logo" style={{ position: "absolute", top: "40px", right: "44px", maxHeight: "60px", maxWidth: "160px", objectFit: "contain" }} />
      )}
      {practice.logo && practice.logoReplacesName && (
        <div style={{ marginBottom: "8px" }}>
          <img src={practice.logo} alt="Logo" style={{ maxHeight: "60px", maxWidth: "200px", objectFit: "contain", display: "block" }} />
        </div>
      )}
      <div style={{ fontSize: "16px", fontWeight: "700", color: "#222", marginBottom: "24px" }}>
        Honorarvereinbarung gemäß § 2 GOÄ
      </div>

      <div style={{ marginBottom: "6px" }}>Zwischen</div>
      <div style={{ marginBottom: "4px" }}>{practice.name || "Name der Ärztin/des Arztes"}</div>
      <div style={{ marginBottom: "20px" }}>
        {practice.address1}{practice.address2 ? `, ${practice.address2}` : ""}
        {practice.address3 ? `, ${practice.address3}` : ""}
      </div>

      <div style={{ marginBottom: "20px" }}>und</div>

      <div style={{ marginBottom: "14px" }}>
        {[patient.vorname, patient.nachname].filter(Boolean).join(" ") || patient.name || ""}
      </div>
      <div style={{ marginBottom: "24px" }}>
        {[patient.address1, patient.address2, (patient.country && patient.country !== "Deutschland") ? patient.country : ""].filter(Boolean).join(", ") || ""}
      </div>

      <div style={{ marginBottom: "18px" }}>
        wird folgende Vereinbarung über ärztliche Leistungen geschlossen:
      </div>

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
          {tableItems.map((it, i) => (
            <tr key={i}>
              <td style={S.tdFirst}>{it.goaCode || (it.isPraeparat ? "—" : "")}</td>
              <td style={S.td}>{it.isPraeparat ? (it.einheit === "Spritze" ? `${it.description} (Präparat, ${fmt(it.unitPrice || 0)} €/Spritze)` : it.ganzeAmpulle ? `1 Ampulle ${it.praeparatName || it.description} (Präparat)` : `${it.quantity || ""}${it.einheit || "ml"} ${it.praeparatName || it.description} (Präparat, ${fmt(it.unitPrice || 0)} €/${it.einheit || "ml"})`) : it.description}</td>
              <td style={S.tdR}>{it.punkte != null ? it.punkte : ""}</td>
              <td style={S.tdR}>{it.steigerung != null ? (Math.round(it.steigerung * 100) / 100).toFixed(2).replace(".", ",") : ""}</td>
              <td style={S.tdRLast}>{fmt(it.betrag)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {!noMwst && (
            <tr style={{ borderTop: "1.5px solid #222" }}>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Zwischensumme</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(tableZwischensumme)}</td>
            </tr>
          )}
          {!noMwst && (
            <tr>
              <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Zzgl. 19% MwSt.</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(tableMwst)}</td>
            </tr>
          )}
          <tr style={{ fontWeight: "700", borderTop: noMwst ? "1.5px solid #222" : undefined }}>
            <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Gesamtbetrag</td>
            <td style={{ padding: "5px 0 5px 6px", textAlign: "right" }}>{fmt(tableGesamt)}</td>
          </tr>
          {isKlein && (
            <tr>
              <td colSpan={5} style={{ padding: "8px 0 0 0", fontSize: "9px", color: "#888" }}>
                Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
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

      {hasPraeparat && isStandalone && (
        <div style={{ marginBottom: "16px", fontSize: "10px", color: "#444" }}>
          Die tatsächlichen Kosten für das Präparat können je nach Behandlungsverlauf von den oben genannten geplanten Kosten abweichen.
        </div>
      )}
      {hasPraeparat && !isStandalone && (
        <div style={{ marginBottom: "16px", fontSize: "10px", color: "#444" }}>
          {praeparatItems.map((it, i) => (
            <div key={i}>Präparat: {it.praeparatName || it.description} — {fmt(it.unitPrice)} € pro {it.einheit || "ml"} {it.einheit === "Spritze" ? "(ganze Spritze, Auslage nach § 10 GOÄ)" : "(nach tatsächlichem Verbrauch)"}</div>
          ))}
          <div style={{ marginTop: "4px" }}>
            Die Kosten für Präparate und Sachkosten richten sich nach dem tatsächlichen Verbrauch im Rahmen der Behandlung und werden in der abschließenden Rechnung gesondert ausgewiesen.
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid #ccc", paddingTop: "14px", marginBottom: "20px" }}>
        <div style={{ fontWeight: "700", marginBottom: "4px" }}>Hinweis gemäß § 2 Abs. 2 Satz 2 GOÄ:</div>
        <div>
          Es wird ausdrücklich darauf hingewiesen, dass eine Erstattung der vereinbarten Vergütung durch
          Erstattungsstellen möglicherweise nicht in vollem Umfang gewährleistet ist.
        </div>
      </div>

      <div style={{ marginTop: "30px", marginBottom: "60px" }}>
        <span>Ort, Datum: {invoiceMeta.ort ? `${invoiceMeta.ort}, ${fmtDate(invoiceMeta.datum)}` : ""}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", marginTop: "30px" }}>
        <div
          style={{ textAlign: "center", minWidth: "160px", ...(onSignatureClick && !signatures?.patient ? { cursor: "pointer", borderRadius: "6px", padding: "8px", border: "2px dashed #93c5fd", background: "#eff6ff" } : {}) }}
          onClick={onSignatureClick && !signatures?.patient ? onSignatureClick : undefined}
          title={onSignatureClick && !signatures?.patient ? "Klicken zum Unterschreiben" : undefined}
        >
          {signatures?.patient ? (
            <img src={signatures.patient} alt="Patient:in" style={{ height: "55px", display: "block", margin: "0 auto 6px" }} />
          ) : onSignatureClick ? (
            <div style={{ height: "55px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "#3b82f6" }}>Hier unterschreiben</span>
            </div>
          ) : null}
          <div style={{ borderTop: "1.5px solid #222", paddingTop: "6px", fontSize: "10px" }}>
            <div style={{ fontWeight: "600" }}>{patient.vorname} {patient.nachname}</div>
            <div style={{ fontSize: "9px", color: "#888" }}>Patient:in</div>
          </div>
        </div>
        <div
          style={{ textAlign: "center", minWidth: "160px", ...(onDoctorSign && !signatures?.doctor ? { cursor: "pointer", borderRadius: "6px", padding: "8px", border: "2px dashed #93c5fd", background: "#eff6ff" } : {}) }}
          onClick={onDoctorSign && !signatures?.doctor ? onDoctorSign : undefined}
          title={onDoctorSign && !signatures?.doctor ? "Klicken zum Unterschreiben" : undefined}
        >
          {signatures?.doctor ? (
            <img src={signatures.doctor} alt="Ärzt:in" style={{ height: "55px", display: "block", margin: "0 auto 6px" }} />
          ) : onDoctorSign ? (
            <div style={{ height: "55px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "#3b82f6" }}>Hier unterschreiben</span>
            </div>
          ) : null}
          <div style={{ borderTop: "1.5px solid #222", paddingTop: "6px", fontSize: "10px" }}>
            <div style={{ fontWeight: "600" }}>{practice.name || "Ärzt:in"}</div>
            <div style={{ fontSize: "9px", color: "#888" }}>Ärzt:in</div>
          </div>
        </div>
      </div>
    </div>
  );
}

