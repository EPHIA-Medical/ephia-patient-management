import React from "react";
import Select from "../ui/Select";
import { markerColor } from "./markerUtils";
import { isGuide, addMarker } from "../../utils/markers";

// ═══════════════════ Lines and fans (injection vectors) ═══════════════════
//
// Follows the common face-chart convention:
//   • filled dot      = injection point / bolus (existing markers)
//   ○ open circle     = entry point of a line or fan, labelled with the amount
//   arrow             = direction the needle or cannula is advanced (linear, retrograde)
//   arrows from one ○ = fan technique (e.g. Sculptra with a blunt cannula)
//   solid / dashed    = needle / cannula
// A vector is stored as a marker with { kind: "line" | "fan", x, y (entry), to: [{x, y}], tool?, depth? },
// so amounts, Präparat and colour work exactly like for points.

export const VECTOR_TOOLS = [
  { value: "nadel", label: "Nadel" },
  { value: "kanuele", label: "Kanüle" },
];
export const VECTOR_DEPTHS = [
  { value: "", label: "Tiefe offen" },
  { value: "intradermal", label: "intradermal" },
  { value: "subkutan", label: "subkutan" },
  { value: "supraperiostal", label: "supraperiostal" },
];

export const isVector = (m) => !!m && (m.kind === "line" || m.kind === "fan");

// Guide lines (Markierung, utils/markers.js): dashed grey polyline, no arrow, no dose
export const GUIDE_COLOR = "#4b5563";
const guidePoints = (m) => [{ x: m.x, y: m.y }, ...(m.to || [])];

const round2 = (n) => Math.round(n * 100) / 100;

// Extra fields persisted for a vector (see serializeMarkers)
export function serializeVector(m) {
  const out = { kind: m.kind, to: (m.to || []).map((p) => ({ x: round2(p.x), y: round2(p.y) })) };
  if (m.tool === "kanuele") out.tool = "kanuele";
  if (m.depth) out.depth = m.depth;
  return out;
}

// "Fächer · 3 Arme · Kanüle · subkutan"
export function vectorSummary(m) {
  if (!isVector(m)) return "";
  const n = (m.to || []).length;
  const parts = [m.kind === "fan" ? `Fächer · ${n} ${n === 1 ? "Arm" : "Arme"}` : "Linie"];
  parts.push(m.tool === "kanuele" ? "Kanüle" : "Nadel");
  if (m.depth) parts.push(m.depth);
  return parts.join(" · ");
}

// Arrowhead triangle at (x2, y2) pointing away from (x1, y1); units = % of the square face box
function arrowHead(x1, y1, x2, y2, size) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - size * Math.cos(a - spread), y2 - size * Math.sin(a - spread)],
    [x2 - size * Math.cos(a + spread), y2 - size * Math.sin(a + spread)],
  ];
}

// The arrow line ends at the base of the head, so the stroke does not poke out of the tip
const shorten = (x1, y1, x2, y2, by) => {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const k = Math.max(0, (len - by) / len);
  return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
};

// SVG overlay for the face box (which is square). `preview` draws the line being placed.
// With `onSelect`, every line, fan and Markierung gets a wide invisible click area and the
// selected one (`selectedId`) is underlaid in blue.
const SELECT_COLOR = "#2563eb";
export function VectorLayer({ markers, preview, scale = 1, onSelect, selectedId }) {
  const vecs = (markers || []).filter(isVector);
  const guides = (markers || []).filter(isGuide);
  if (!vecs.length && !guides.length && !preview) return null;
  const sw = 0.55 * scale, head = 2.4 * scale;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5, overflow: "visible" }}>
      {vecs.map((m, i) => {
        const c = markerColor(m);
        return (m.to || []).map((p, j) => {
          const [ex, ey] = shorten(m.x, m.y, p.x, p.y, head * 0.8);
          return (
            <g key={`${m.id ?? i}-${j}`}>
              <line x1={m.x} y1={m.y} x2={ex} y2={ey} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeDasharray={m.tool === "kanuele" ? `${1.6 * scale} ${1.2 * scale}` : undefined} />
              <polygon points={arrowHead(m.x, m.y, p.x, p.y, head).map((q) => q.join(",")).join(" ")} fill={c} />
            </g>
          );
        });
      })}
      {(markers || []).filter((m) => m.id != null && m.id === selectedId && (isVector(m) || isGuide(m))).map((m) => (
        <polyline key="selected" points={(isGuide(m) ? guidePoints(m) : (m.to || []).flatMap((p) => [{ x: m.x, y: m.y }, p])).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={SELECT_COLOR} strokeWidth={sw * 5} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
      ))}
      {guides.map((m, i) => (
        <polyline key={`g-${m.id ?? i}`} points={guidePoints(m).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={GUIDE_COLOR} strokeWidth={sw * 1.15} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${2 * scale} ${1.3 * scale}`} opacity={0.9} />
      ))}
      {onSelect && [...vecs, ...guides].map((m, i) => {
        const segs = isGuide(m) ? [guidePoints(m)] : (m.to || []).map((p) => [{ x: m.x, y: m.y }, p]);
        return segs.map((pts, j) => (
          <polyline key={`hit-${m.id ?? i}-${j}`} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={3.2 * scale} strokeLinecap="round" strokeLinejoin="round"
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onSelect(m.id); }} />
        ));
      })}
      {preview && (
        <line x1={preview.from.x} y1={preview.from.y} x2={preview.to.x} y2={preview.to.y} stroke={preview.color || "#6b7280"} strokeWidth={sw} strokeDasharray={`${1 * scale} ${1 * scale}`} opacity={0.7} />
      )}
    </svg>
  );
}

// PDF: html2canvas drops SVG images in some browsers, so vectors are drawn on a canvas
// and placed as one PNG over the face (same approach as the dot images).
export function makeVectorImage(markers, sizePx = 340) {
  const vecs = (markers || []).filter(isVector);
  const guides = (markers || []).filter(isGuide);
  if (!vecs.length && !guides.length) return null;
  const s = sizePx * 2; // 2x for sharpness
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d");
  const k = s / 100;
  const sw = 0.55 * k, head = 2.4 * k;
  for (const m of vecs) {
    const col = markerColor(m);
    for (const p of m.to || []) {
      const x1 = m.x * k, y1 = m.y * k, x2 = p.x * k, y2 = p.y * k;
      const [ex, ey] = shorten(x1, y1, x2, y2, head * 0.8);
      ctx.strokeStyle = col; ctx.lineWidth = sw; ctx.lineCap = "round";
      ctx.setLineDash(m.tool === "kanuele" ? [1.6 * k, 1.2 * k] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      const pts = arrowHead(x1, y1, x2, y2, head);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.closePath(); ctx.fill();
    }
  }
  for (const m of guides) {
    const pts = guidePoints(m);
    ctx.strokeStyle = GUIDE_COLOR; ctx.lineWidth = sw * 1.15; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([2 * k, 1.3 * k]);
    ctx.beginPath(); ctx.moveTo(pts[0].x * k, pts[0].y * k);
    for (const p of pts.slice(1)) ctx.lineTo(p.x * k, p.y * k);
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  return c.toDataURL("image/png");
}

// ── Editing: one hook + toolbar shared by both face editors ──
// handleClick(x, y) returns true when the click was used for a line/fan; otherwise the
// editor places a normal point as before.
export function useVectorTools({ markers, setMarkers, color, amount, praep, view = "face" }) {
  const [mode, setModeRaw] = React.useState("punkt"); // "punkt" | "linie" | "faecher" | "markierung"
  const [tool, setTool] = React.useState("nadel");
  const [depth, setDepth] = React.useState("");
  const [lineStart, setLineStart] = React.useState(null);
  const [activeFanId, setActiveFanId] = React.useState(null);
  const [activeGuideId, setActiveGuideId] = React.useState(null);
  const [hover, setHover] = React.useState(null);

  const activeFan = activeFanId != null ? markers.find((m) => m.id === activeFanId) : null;
  const activeGuide = activeGuideId != null ? markers.find((m) => m.id === activeGuideId) : null;
  // Ends the current line, fan or Markierung. A fan without arms or a Markierung without a
  // segment is dropped, it would only be a stray mark.
  const finish = () => {
    const stray = [activeFan, activeGuide].filter((m) => m && !(m.to || []).length).map((m) => m.id);
    if (stray.length) setMarkers(markers.filter((m) => !stray.includes(m.id)));
    setLineStart(null); setActiveFanId(null); setActiveGuideId(null); setHover(null);
  };
  const setMode = (m) => { finish(); setModeRaw(m); };

  const base = () => {
    const v = { id: Date.now() + Math.random(), amount: amount || "", color, tool };
    if (depth) v.depth = depth;
    if (praep > 0) v.p = praep;
    if (view && view !== "face") v.v = view;
    return v;
  };

  const handleClick = (x, y) => {
    if (mode === "linie") {
      if (!lineStart) { setLineStart({ x, y }); return true; }
      if (Math.hypot(x - lineStart.x, y - lineStart.y) < 3) { finish(); return true; } // click on the start again: cancel
      setMarkers(addMarker(markers, { ...base(), kind: "line", x: lineStart.x, y: lineStart.y, to: [{ x, y }] }));
      setLineStart(null); setHover(null);
      return true;
    }
    if (mode === "faecher") {
      if (!activeFan) {
        const fan = { ...base(), kind: "fan", x, y, to: [] };
        setMarkers(addMarker(markers, fan));
        setActiveFanId(fan.id);
        return true;
      }
      // Clicking the entry point again closes the fan
      if (Math.hypot(x - activeFan.x, y - activeFan.y) < 3) { finish(); return true; }
      setMarkers(markers.map((m) => (m.id === activeFan.id ? { ...m, to: [...(m.to || []), { x, y }] } : m)));
      return true;
    }
    if (mode === "markierung") {
      if (!activeGuide) {
        const guide = { id: Date.now() + Math.random(), kind: "guide", x, y, to: [] };
        if (view && view !== "face") guide.v = view;
        setMarkers(addMarker(markers, guide));
        setActiveGuideId(guide.id);
        return true;
      }
      // Clicking the last point again ends the Markierung
      const pts = guidePoints(activeGuide);
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last.x, y - last.y) < 3) { finish(); return true; }
      setMarkers(markers.map((m) => (m.id === activeGuide.id ? { ...m, to: [...(m.to || []), { x, y }] } : m)));
      return true;
    }
    return false;
  };

  const handleMove = (x, y) => { if (lineStart || activeFan || activeGuide) setHover({ x, y }); };
  const guideEnd = activeGuide ? guidePoints(activeGuide).slice(-1)[0] : null;
  const from = lineStart || (activeFan ? { x: activeFan.x, y: activeFan.y } : null) || guideEnd;
  const preview = from && hover ? { from, to: hover, color: activeGuide ? GUIDE_COLOR : color } : null;

  // Enter or Escape ends the drawing (captured so Escape does not close the dialog)
  const drawing = !!(lineStart || activeFan || activeGuide);
  const finishRef = React.useRef(finish);
  finishRef.current = finish;
  React.useEffect(() => {
    if (!drawing) return undefined;
    const onKey = (e) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      finishRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drawing]);

  return { mode, setMode, tool, setTool, depth, setDepth, handleClick, handleMove, preview, finish, activeFan, activeGuide, lineStart, drawing };
}

const segBtn = (active) => `px-2.5 text-xs rounded-md transition ${active ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500 hover:text-gray-800"}`;

// Shared label column for the editor's setting rows (Technik, Instrument, Präparat, Dosis, Farbe)
export const EDITOR_LABEL_WIDTH = 72;
export function EditorRow({ label, children }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 flex-shrink-0" style={{ width: EDITOR_LABEL_WIDTH, marginRight: 2 }}>{label}</span>
      {children}
    </div>
  );
}

const isTouch = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

// One line telling the user what the next click does
export function vectorInstruction(vt) {
  const k = isTouch() ? "Tippe" : "Klicke";
  if (vt.mode === "linie") return vt.lineStart ? `${k} auf das Ende der Linie.` : `${k} auf den Eintrittspunkt, dann auf das Ende der Linie. Der Pfeil zeigt die Vorschubrichtung.`;
  if (vt.mode === "markierung") return vt.activeGuide ? `${k} entlang der Struktur auf den nächsten Punkt. Zum Abschließen auf Fertig, Enter oder noch einmal auf den letzten Punkt.` : `${k} auf den Anfang, dann Punkt für Punkt entlang einer Struktur, die Du beim nächsten Mal wiederfinden möchtest, zum Beispiel eine markante Falte. Markierungen haben keine Menge.`;
  if (vt.mode === "faecher") return vt.activeFan ? `${k} auf das Ende des nächsten Arms. Zum Abschließen auf den Eintrittspunkt oder auf Fertig.` : `${k} auf den Eintrittspunkt, dann auf das Ende jedes Arms.`;
  return `${k} auf das Gesicht, um einen Punkt zu setzen, oder auf einen gesetzten Punkt oder eine Linie, um sie zu bearbeiten oder zu löschen.`;
}

export function VectorToolbar({ vt }) {
  return (
    <>
      <EditorRow label="Technik">
        <div className="inline-flex p-0.5 rounded-lg bg-gray-100" role="group" aria-label="Technik">
          {[["punkt", "Punkt"], ["linie", "Linie"], ["faecher", "Fächer"], ["markierung", "Markierung"]].map(([v, l]) => (
            <button key={v} type="button" className={segBtn(vt.mode === v)} style={{ height: 24 }} onClick={() => vt.setMode(v)}>{l}</button>
          ))}
        </div>
      </EditorRow>
      {(vt.mode === "linie" || vt.mode === "faecher") && (
        <EditorRow label="Instrument">
          <div className="inline-flex p-0.5 rounded-lg bg-gray-100" role="group" aria-label="Instrument">
            {VECTOR_TOOLS.map((t) => (
              <button key={t.value} type="button" className={segBtn(vt.tool === t.value)} style={{ height: 24 }} onClick={() => vt.setTool(t.value)}>{t.label}</button>
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-2">Tiefe</span>
          <Select className="border border-[#DFE3EB] rounded-md px-2 py-1 text-xs bg-white" value={vt.depth} onChange={(e) => vt.setDepth(e.target.value)} aria-label="Tiefe">
            {VECTOR_DEPTHS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </EditorRow>
      )}
    </>
  );
}

// Floating bar on the face while a line or fan is being drawn: shows the state and how to end it
export function VectorDrawingBar({ vt }) {
  if (!vt.drawing) return null;
  const n = ((vt.activeFan || vt.activeGuide)?.to || []).length;
  const text = vt.activeFan ? `Fächer · ${n} ${n === 1 ? "Arm" : "Arme"}` : vt.activeGuide ? `Markierung · ${n} ${n === 1 ? "Abschnitt" : "Abschnitte"}` : "Linie · Ende setzen";
  const canFinish = !!(vt.activeFan || vt.activeGuide);
  const stop = (e) => e.stopPropagation();
  return (
    <div className="absolute left-1/2 top-2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-gray-900/85 text-white text-xs pl-3 pr-1 py-1 shadow-lg" style={{ zIndex: 30, cursor: "default" }} onClick={stop} onTouchStart={stop} onTouchEnd={stop} onMouseMove={stop}>
      <span className="whitespace-nowrap">{text}</span>
      <button type="button" className={`rounded-full px-3 py-0.5 font-semibold transition ${canFinish ? "bg-white text-gray-900 hover:bg-gray-100" : "text-white/80 hover:text-white"}`} onClick={vt.finish}>
        {canFinish ? "Fertig" : "Abbrechen"}
      </button>
    </div>
  );
}

// Small line sample with arrowhead: solid for needle, dashed for cannula
export function ToolSwatch({ tool, color = "#374151", width = 24 }) {
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} className="flex-shrink-0" aria-hidden="true">
      <line x1="1" y1="5" x2={width - 6} y2="5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray={tool === "kanuele" ? "3.5 2.5" : undefined} />
      <polygon points={`${width - 1},5 ${width - 7},1.5 ${width - 7},8.5`} fill={color} />
    </svg>
  );
}

// "Fächer · 3 Arme · Kanüle" with the matching line sample in the marker's colour
export function GuideSwatch({ width = 24 }) {
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} className="flex-shrink-0" aria-hidden="true">
      <line x1="1" y1="5" x2={width - 1} y2="5" stroke={GUIDE_COLOR} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 2.6" />
    </svg>
  );
}

export function VectorSummary({ marker, className = "text-[11px] text-gray-500" }) {
  if (isGuide(marker)) {
    return <span className={`inline-flex items-center gap-1.5 ${className}`}><GuideSwatch />Markierung</span>;
  }
  if (!isVector(marker)) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <ToolSwatch tool={marker.tool} color={markerColor(marker)} />
      {vectorSummary(marker)}
    </span>
  );
}

// Key for the symbols, shown under the face whenever lines or fans are on it
export function VectorLegend({ markers, force = false, forceGuide = false, className = "" }) {
  const showVectors = force || (markers || []).some(isVector);
  const showGuide = forceGuide || (markers || []).some(isGuide);
  if (!showVectors && !showGuide) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 ${className}`}>
      {showGuide && <span className="inline-flex items-center gap-1.5"><GuideSwatch />Markierung (Orientierung, keine Injektion)</span>}
      {showVectors && <>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block rounded-full bg-white flex-shrink-0" style={{ width: 10, height: 10, border: "2px solid #374151" }} />
        Eintrittspunkt
      </span>
      <span className="inline-flex items-center gap-1.5"><ToolSwatch tool="nadel" />Nadel</span>
      <span className="inline-flex items-center gap-1.5"><ToolSwatch tool="kanuele" />Kanüle</span>
      <span>Pfeil = Vorschubrichtung</span>
      </>}
    </div>
  );
}
