import React from "react";
import { fmtDate, fmtPhone, evalAmount } from "../../utils/helpers";
import { FACE_IMAGE_B64 } from "../../constants";
import { MARKER_COLORS, markerColor, markerLabel, fmtNum } from "../treatment/markerUtils";

// ═══════════════════ Treatment Document Preview (for PDF) ═══════════════════

// Pre-render a labelled pill as a tiny canvas → data URL image
// html2canvas renders <img> tags perfectly, unlike CSS text centering.
// Returns { src, w, h } in CSS pixels (drawn at 2x for sharpness).
export function makeDotImage(label, color = "#ef4444") {
  const h = 40; // 2x of 20px
  const fontPx = Math.round(h * 0.5);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `bold ${fontPx}px Arial, sans-serif`;
  const textW = ctx.measureText(String(label)).width;
  const w = Math.max(h, Math.ceil(textW + h * 0.6));
  c.width = w; c.height = h;
  const ctx2 = c.getContext("2d");
  const r = h / 2;
  ctx2.beginPath();
  ctx2.moveTo(r, 0);
  ctx2.lineTo(w - r, 0);
  ctx2.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx2.lineTo(r, h);
  ctx2.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
  ctx2.closePath();
  ctx2.fillStyle = color;
  ctx2.fill();
  ctx2.fillStyle = "white";
  ctx2.font = `bold ${fontPx}px Arial, sans-serif`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.fillText(String(label), w / 2, h / 2 + 1);
  return { src: c.toDataURL("image/png"), w: w / 2, h: h / 2 };
}

export default function TreatmentDocPreview({ practice, patient, treatmentDoc, einheit, id: previewId, facePhoto }) {
  const td = treatmentDoc || {};
  const markers = td.markers || [];
  const praep = td.praeparat || "";
  const einh = einheit || td.einheit || "SE";
  const datumStr = td.behandlungsDatum ? fmtDate(td.behandlungsDatum) : "–";
  const totalUnits = Math.round(markers.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  const totalStr = totalUnits % 1 === 0 ? totalUnits.toString() : totalUnits.toFixed(2).replace(/0+$/, "").replace(".", ",");
  const pat = patient || {};
  const patName = [pat.vorname, pat.nachname].filter(Boolean).join(" ") || pat.name || "";

  // Pre-generate dot images for all markers (memoized on their content)
  const markersKey = JSON.stringify(markers.map((m) => [m.amount, m.color || ""]));
  const dotImages = React.useMemo(() => markers.map((m, i) => makeDotImage(markerLabel(m, i), markerColor(m))), [markersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Legend grouped by colour: count of points and units per colour
  const colorGroups = (() => {
    const map = new Map();
    markers.forEach((m) => {
      const hex = markerColor(m);
      const g = map.get(hex) || { hex, count: 0, units: 0 };
      g.count += 1;
      g.units += evalAmount(m.amount);
      map.set(hex, g);
    });
    const order = MARKER_COLORS.map((c) => c.hex);
    return [...map.values()].sort((a, b) => {
      const ia = order.indexOf(a.hex), ib = order.indexOf(b.hex);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }).map((g) => ({ ...g, units: Math.round(g.units * 100) / 100 }));
  })();
  const multiColor = colorGroups.length > 1;

  const S = {
    page: { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "11px", lineHeight: "1.55", color: "#1a1a1a", padding: "40px 44px", width: "210mm", minHeight: "297mm", margin: "0 auto", background: "white", position: "relative", boxSizing: "border-box", overflow: "hidden" },
    h: { fontSize: "16px", fontWeight: "700", color: "#222", marginBottom: "4px" },
    addr: { fontSize: "11px", color: "#444", marginBottom: "28px" },
    patLabel: { fontSize: "9.5px", color: "#999", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" },
    sectionTitle: { fontSize: "12px", fontWeight: "600", color: "#333", marginBottom: "6px", marginTop: "20px" },
  };

  return (
    <div id={previewId || "treatment-doc-preview"} style={S.page}>
      {/* Practice Header — same as InvoicePreview */}
      {practice.logo && !practice.logoReplacesName && (
        <img src={practice.logo} alt="Logo" style={{ position: "absolute", top: "40px", right: "44px", maxHeight: "60px", maxWidth: "160px", objectFit: "contain" }} />
      )}
      {practice.logo && practice.logoReplacesName ? (
        <div style={{ marginBottom: "8px" }}>
          <img src={practice.logo} alt="Logo" style={{ maxHeight: "60px", maxWidth: "200px", objectFit: "contain", display: "block" }} />
        </div>
      ) : (
        <div style={S.h}>{practice.name || ""}</div>
      )}
      <div style={S.addr}>
        <div>{practice.address1}</div>
        <div>{practice.address2}</div>
        {practice.address3 && <div>{practice.address3}</div>}
      </div>

      {/* Patient address block */}
      <div style={{ marginBottom: "28px" }}>
        <div style={S.patLabel}>Patient:in</div>
        <div>{patName}</div>
        {pat.address1 && <div>{pat.address1}</div>}
        {pat.address2 && <div>{pat.address2}</div>}
        {pat.country && pat.country !== "Deutschland" && <div>{pat.country}</div>}
      </div>

      {/* Title + Date */}
      <div style={{ fontSize: "15px", fontWeight: "700", color: "#222", marginBottom: "4px" }}>Behandlungsdokumentation</div>
      <div style={{ fontSize: "11px", color: "#444", marginBottom: "20px" }}>Datum: {datumStr}</div>

      {/* Präparat + Menge */}
      {praep && (
        <div style={{ marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Präparat</div>
          <div style={{ fontSize: "11px", color: "#333" }}>
            {praep}{totalUnits > 0 ? ` — ${totalStr} ${einh} gesamt` : td.amount ? ` — ${td.amount} ${einh} gesamt` : ""}
          </div>
        </div>
      )}

      {/* Injection points — face diagram with legend on the right */}
      {markers.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Injektionspunkte</div>
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {/* Face diagram */}
            <div style={{ position: "relative", width: "340px", height: "340px", flexShrink: 0, border: "1px solid #e5e5e5", borderRadius: "6px", overflow: "hidden", background: "#fafafa" }}>
              <img src={facePhoto || FACE_IMAGE_B64} alt="Gesicht" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              {markers.map((m, idx) => {
                const d = dotImages[idx] || { src: "", w: 20, h: 20 };
                return (
                  <img key={idx} src={d.src} alt={markerLabel(m, idx)} style={{ position: "absolute", left: `${m.x}%`, top: `${m.y}%`, width: d.w, height: d.h, marginLeft: -d.w / 2, marginTop: -d.h / 2, zIndex: 10 }} />
                );
              })}
            </div>
            {/* Legend: the dots show the units per point; summarise per colour */}
            <div style={{ fontSize: "11px", color: "#333", lineHeight: "1.6" }}>
              <div style={{ color: "#666", marginBottom: "6px" }}>Die Zahl im Punkt ist die Menge in {einh}.</div>
              {multiColor && colorGroups.map((g) => (
                <div key={g.hex} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: g.hex, flexShrink: 0 }} />
                  <span>{g.count} {g.count === 1 ? "Punkt" : "Punkte"}{g.units > 0 ? ` · ${fmtNum(g.units)} ${einh}` : ""}</span>
                </div>
              ))}
              <div style={{ marginTop: multiColor ? "6px" : 0, fontWeight: 600 }}>
                {markers.length} {markers.length === 1 ? "Punkt" : "Punkte"}{totalUnits > 0 ? ` · ${totalStr} ${einh} gesamt` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contact info footer */}
      <div style={{ marginTop: "40px", fontSize: "10.5px", color: "#666", borderTop: "1px solid #e5e5e5", paddingTop: "14px" }}>
        Bei Fragen zu Deiner Behandlung erreichst Du uns
        {practice.phone ? ` unter ${fmtPhone(practice.phone)}` : ""}
        {practice.phone && practice.email ? " oder " : !practice.phone && practice.email ? " unter " : ""}
        {practice.email ? practice.email : ""}
        {practice.phone || practice.email ? "." : " jederzeit."}
      </div>
    </div>
  );
}

