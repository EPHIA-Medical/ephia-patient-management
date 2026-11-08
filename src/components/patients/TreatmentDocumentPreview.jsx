import React from "react";
import { fmtDate, fmtPhone, evalAmount, fmtBetrag } from "../../utils/helpers";
import { MARKER_COLORS, markerColor, markerLabel, markerTextColor, fmtNum } from "../treatment/markerUtils";
import { getPraeparate, praeparatTotals, praepMengeStr } from "../../utils/praeparate";
import { isVector, vectorSummary, makeVectorImage } from "../treatment/vectors";
import { chartById, chartPng, markerView, usedViews } from "../treatment/charts";
import { isGuide, treatmentPoints } from "../../utils/markers";

// ═══════════════════ Treatment Document Preview (for PDF) ═══════════════════

// Pre-render a labelled pill as a tiny canvas → data URL image
// html2canvas renders <img> tags perfectly, unlike CSS text centering.
// Returns { src, w, h } in CSS pixels (drawn at 2x for sharpness).
export function makeDotImage(label, color = "#dc2626", hollow = false) {
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
  if (hollow) {
    // Entry point of a line or fan: open pill with coloured border
    ctx2.fillStyle = "#ffffff";
    ctx2.fill();
    ctx2.lineWidth = 4;
    ctx2.strokeStyle = color;
    ctx2.save(); ctx2.clip(); ctx2.stroke(); ctx2.restore();
    ctx2.fillStyle = markerTextColor(color) === "#111827" ? "#111827" : color;
  } else {
    ctx2.fillStyle = color;
    ctx2.fill();
    ctx2.fillStyle = markerTextColor(color);
  }
  ctx2.font = `bold ${fontPx}px Arial, sans-serif`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.fillText(String(label), w / 2, h / 2 + 1);
  return { src: c.toDataURL("image/png"), w: w / 2, h: h / 2 };
}

export default function TreatmentDocPreview({ practice, patient, treatmentDoc, einheit, id: previewId, facePhoto, showPatientHinweis = true }) {
  const td = treatmentDoc || {};
  const markers = td.markers || [];
  const praep = td.praeparat || "";
  const einh = einheit || td.einheit || "SE";
  // Several Präparate in one session: each point carries its Präparat letter
  const praeparate = getPraeparate(td);
  const praepCount = praeparate.length;
  const multiPraep = praepCount > 1;
  const praepTotals = praeparatTotals(td);
  const allEinh = praepTotals.map((t) => t.einheit);
  const sameEinh = allEinh.every((e) => e === allEinh[0]);
  const datumStr = td.behandlungsDatum ? fmtDate(td.behandlungsDatum) : "–";
  const totalUnits = Math.round(markers.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  const totalStr = totalUnits % 1 === 0 ? totalUnits.toString() : totalUnits.toFixed(2).replace(/0+$/, "").replace(".", ",");
  const pat = patient || {};
  const hinweis = showPatientHinweis ? (td.patientHinweis || "").trim() : "";
  const betrag = showPatientHinweis ? (td.patientBetrag || "").trim() : "";
  const hasBank = !!(practice.iban || practice.bankName || practice.paypal);
  const patName = [pat.vorname, pat.nachname].filter(Boolean).join(" ") || pat.name || "";

  // Pre-generate dot images for all markers (memoized on their content)
  const markersKey = JSON.stringify(markers.map((m) => [m.amount, m.color || "", m.p || 0, m.kind || ""])) + praepCount;
  const dotImages = React.useMemo(() => markers.map((m, i) => makeDotImage(markerLabel(m, i, praepCount), markerColor(m), isVector(m))), [markersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lines and fans drawn into one PNG over the face (SVG would be dropped by html2canvas in some browsers)
  const vectors = markers.map((m, idx) => ({ m, idx })).filter(({ m }) => isVector(m));
  // Markierungen (guide lines) go into the same PNG, so they are part of the key
  const vectorsKey = JSON.stringify(markers.filter((m) => isVector(m) || isGuide(m)).map((m) => [m.kind, m.x, m.y, m.to, m.tool || "", m.color || "", m.v || ""]));
  const pointCount = treatmentPoints(markers).length;
  const hasGuides = pointCount < markers.length;
  // Body regions with points: one chart each. Drawn charts become PNGs first (html2canvas and SVG images do not mix well).
  const views = usedViews(markers);
  const viewsKey = views.join(",");
  const chartSize = views.length === 1 ? 340 : views.length === 2 ? 340 : 222;
  const vectorImages = React.useMemo(() => Object.fromEntries(views.map((v) => [v, makeVectorImage(markers.filter((m) => markerView(m) === v), chartSize)])), [vectorsKey, viewsKey, chartSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chartPngs, setChartPngs] = React.useState({});
  React.useEffect(() => {
    let alive = true;
    Promise.all(views.map((v) => chartPng(v).then((src) => [v, src]))).then((pairs) => { if (alive) setChartPngs(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [viewsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartBox = (v) => (
    <div key={v} style={{ flexShrink: 0 }}>
      <div style={{ position: "relative", width: `${chartSize}px`, height: `${chartSize}px`, border: "1px solid #e5e5e5", borderRadius: "6px", overflow: "hidden", background: "#ffffff" }}>
        <img src={v === "face" && facePhoto ? facePhoto : (chartPngs[v] || chartById(v).png || "")} alt={chartById(v).label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        {vectorImages[v] && <img src={vectorImages[v]} alt="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 5 }} />}
        {markers.map((m, idx) => {
          if (markerView(m) !== v || isGuide(m)) return null;
          const d = dotImages[idx] || { src: "", w: 20, h: 20 };
          return (
            <img key={idx} src={d.src} alt={markerLabel(m, idx)} style={{ position: "absolute", left: `${m.x}%`, top: `${m.y}%`, width: d.w, height: d.h, marginLeft: -d.w / 2, marginTop: -d.h / 2, zIndex: 10 }} />
          );
        })}
      </div>
      {views.length > 1 && <div style={{ fontSize: "10px", color: "#666", marginTop: "3px" }}>{chartById(v).label}</div>}
    </div>
  );

  // Legend grouped by colour: count of points and units per colour
  const colorGroups = (() => {
    const map = new Map();
    treatmentPoints(markers).forEach((m) => {
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

      {/* Präparat(e) + Menge */}
      {multiPraep ? (
        <div style={{ marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Präparate</div>
          {praepTotals.map((t) => (
            <div key={t.idx} style={{ fontSize: "11px", color: "#333", display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
              <span style={{ display: "inline-block", minWidth: 14, height: 14, lineHeight: "14px", textAlign: "center", borderRadius: 3, background: "#1f2937", color: "#fff", fontSize: "9px", fontWeight: 700 }}>{t.letter}</span>
              <span>{t.name || "Präparat"}{praepMengeStr(t) ? ` — ${praepMengeStr(t)}` : ""}{t.count > 0 ? ` (${t.count} ${t.count === 1 ? "Punkt" : "Punkte"})` : ""}{t.charge ? ` · Charge ${t.charge}` : ""}</span>
            </div>
          ))}
          {totalUnits > 0 && sameEinh && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>Gesamt: {totalStr} {einh}</div>}
        </div>
      ) : praep && (
        <div style={{ marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Präparat</div>
          <div style={{ fontSize: "11px", color: "#333" }}>
            {praep}{totalUnits > 0 ? ` — ${totalStr} ${einh} gesamt` : td.amount ? ` — ${td.amount} ${einh} gesamt` : ""}{(td.charge || praeparate[0]?.charge) ? ` · Charge ${td.charge || praeparate[0].charge}` : ""}
          </div>
        </div>
      )}

      {/* Injection points — face diagram with legend on the right */}
      {markers.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Injektionspunkte</div>
          {views.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>{views.map(chartBox)}</div>
          )}
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {views.length === 1 && chartBox(views[0])}
            {/* Legend: the dots show the units per point; summarise per colour */}
            <div style={{ fontSize: "11px", color: "#333", lineHeight: "1.6" }}>
              <div style={{ color: "#666", marginBottom: "6px" }}>{multiPraep ? `Die Zahl im Punkt ist die Menge${sameEinh ? ` in ${einh}` : ""}, der Buchstabe das Präparat.` : `Die Zahl im Punkt ist die Menge in ${einh}.`}</div>
              {multiPraep && praepTotals.map((t) => (
                <div key={t.idx} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <span style={{ display: "inline-block", minWidth: 14, height: 14, lineHeight: "14px", textAlign: "center", borderRadius: 3, background: "#1f2937", color: "#fff", fontSize: "9px", fontWeight: 700, flexShrink: 0 }}>{t.letter}</span>
                  <span>{t.name || "Präparat"} · {t.count} {t.count === 1 ? "Punkt" : "Punkte"}{t.units > 0 ? ` · ${fmtNum(t.units)} ${t.einheit}` : ""}</span>
                </div>
              ))}
              {multiPraep && <div style={{ height: 4 }} />}
              {multiColor && colorGroups.map((g) => (
                <div key={g.hex} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: g.hex, flexShrink: 0 }} />
                  <span>{g.count} {g.count === 1 ? "Punkt" : "Punkte"}{g.units > 0 ? ` · ${fmtNum(g.units)} ${einh}` : ""}</span>
                </div>
              ))}
              <div style={{ marginTop: multiColor ? "6px" : 0, fontWeight: 600 }}>
                {pointCount} {pointCount === 1 ? "Punkt" : "Punkte"}{totalUnits > 0 && (!multiPraep || sameEinh) ? ` · ${totalStr} ${einh} gesamt` : ""}
              </div>
              {hasGuides && (
                <div style={{ marginTop: "10px", color: "#666" }}>Gestrichelte graue Linie: Markierung zur Orientierung, keine Injektion.</div>
              )}
              {vectors.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ color: "#666", marginBottom: "4px" }}>Gefüllter Punkt: Injektion. Offener Kreis: Eintrittspunkt, Pfeil: Vorschubrichtung. Durchgezogen: Nadel, gestrichelt: Kanüle.</div>
                  {vectors.map(({ m, idx }) => (
                    <div key={idx} style={{ marginBottom: "2px" }}>
                      {idx + 1}. {vectorSummary(m)}{evalAmount(m.amount) > 0 ? ` · ${fmtNum(evalAmount(m.amount))} ${einh}` : ""}{views.length > 1 ? ` · ${chartById(markerView(m)).label}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Patient-facing note + optional amount with bank details */}
      {(hinweis || betrag) && (
        <div style={{ marginTop: "8px", marginBottom: "16px" }}>
          <div style={S.sectionTitle}>Hinweis</div>
          {hinweis && <div style={{ fontSize: "11px", color: "#333", whiteSpace: "pre-wrap", marginBottom: betrag ? "8px" : 0 }}>{hinweis}</div>}
          {betrag && (
            <div style={{ fontSize: "11px", color: "#333" }}>
              <div style={{ fontWeight: 600, marginBottom: hasBank ? "4px" : 0 }}>Zu zahlender Betrag: {fmtBetrag(betrag)} €</div>
              {hasBank && (
                <div style={{ color: "#444" }}>
                  {practice.bankName && <div>{practice.bankName}</div>}
                  {practice.iban && <div>IBAN: {practice.iban}</div>}
                  {practice.bic && <div>BIC: {practice.bic}</div>}
                  {practice.paypal && <div>PayPal: {practice.paypal}</div>}
                  <div>Verwendungszweck: Behandlung {datumStr}{patName ? `, ${patName}` : ""}</div>
                </div>
              )}
            </div>
          )}
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

