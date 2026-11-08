import React from "react";
import Select from "../ui/Select";
import { markerColor } from "./markerUtils";

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
export function VectorLayer({ markers, preview, scale = 1 }) {
  const vecs = (markers || []).filter(isVector);
  if (!vecs.length && !preview) return null;
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
  if (!vecs.length) return null;
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
  return c.toDataURL("image/png");
}

// ── Editing: one hook + toolbar shared by both face editors ──
// handleClick(x, y) returns true when the click was used for a line/fan; otherwise the
// editor places a normal point as before.
export function useVectorTools({ markers, setMarkers, color, amount, praep }) {
  const [mode, setModeRaw] = React.useState("punkt"); // "punkt" | "linie" | "faecher"
  const [tool, setTool] = React.useState("nadel");
  const [depth, setDepth] = React.useState("");
  const [lineStart, setLineStart] = React.useState(null);
  const [activeFanId, setActiveFanId] = React.useState(null);
  const [hover, setHover] = React.useState(null);

  const finish = () => { setLineStart(null); setActiveFanId(null); setHover(null); };
  const setMode = (m) => { finish(); setModeRaw(m); };
  const activeFan = activeFanId != null ? markers.find((m) => m.id === activeFanId) : null;

  const base = () => {
    const v = { id: Date.now() + Math.random(), amount: amount || "", color, tool };
    if (depth) v.depth = depth;
    if (praep > 0) v.p = praep;
    return v;
  };

  const handleClick = (x, y) => {
    if (mode === "linie") {
      if (!lineStart) { setLineStart({ x, y }); return true; }
      if (Math.hypot(x - lineStart.x, y - lineStart.y) < 1.5) return true; // second click on the start: ignore
      setMarkers([...markers, { ...base(), kind: "line", x: lineStart.x, y: lineStart.y, to: [{ x, y }] }]);
      setLineStart(null); setHover(null);
      return true;
    }
    if (mode === "faecher") {
      if (!activeFan) {
        const fan = { ...base(), kind: "fan", x, y, to: [] };
        setMarkers([...markers, fan]);
        setActiveFanId(fan.id);
        return true;
      }
      if (Math.hypot(x - activeFan.x, y - activeFan.y) < 1.5) return true;
      setMarkers(markers.map((m) => (m.id === activeFan.id ? { ...m, to: [...(m.to || []), { x, y }] } : m)));
      return true;
    }
    return false;
  };

  const handleMove = (x, y) => { if (lineStart || activeFan) setHover({ x, y }); };
  const from = lineStart || (activeFan ? { x: activeFan.x, y: activeFan.y } : null);
  const preview = from && hover ? { from, to: hover, color } : null;

  const hint = mode === "linie"
    ? (lineStart ? "Jetzt den Endpunkt anklicken. Der Pfeil zeigt die Vorschubrichtung." : "Eintrittspunkt anklicken, dann den Endpunkt.")
    : mode === "faecher"
      ? (activeFan ? `Jeder weitere Klick fügt einen Arm hinzu (${(activeFan.to || []).length} bisher).` : "Eintrittspunkt anklicken, dann die Arme des Fächers.")
      : null;

  return { mode, setMode, tool, setTool, depth, setDepth, handleClick, handleMove, preview, finish, hint, activeFan, lineStart };
}

const segBtn = (active) => `px-2.5 py-1 text-xs rounded-md transition ${active ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500 hover:text-gray-800"}`;

export function VectorToolbar({ vt }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex p-0.5 rounded-lg bg-gray-100" role="group" aria-label="Technik">
        {[["punkt", "Punkt"], ["linie", "Linie"], ["faecher", "Fächer"]].map(([v, l]) => (
          <button key={v} type="button" className={segBtn(vt.mode === v)} onClick={() => vt.setMode(v)}>{l}</button>
        ))}
      </div>
      {vt.mode !== "punkt" && (
        <>
          <div className="inline-flex p-0.5 rounded-lg bg-gray-100" role="group" aria-label="Instrument">
            {VECTOR_TOOLS.map((t) => (
              <button key={t.value} type="button" className={segBtn(vt.tool === t.value)} onClick={() => vt.setTool(t.value)}>{t.label}</button>
            ))}
          </div>
          <Select className="border border-[#DFE3EB] rounded-md px-2 py-1 text-xs bg-white" value={vt.depth} onChange={(e) => vt.setDepth(e.target.value)} aria-label="Tiefe">
            {VECTOR_DEPTHS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          {vt.activeFan && (
            <button type="button" className="px-2.5 py-1 text-xs rounded-md bg-blue-500 text-white hover:bg-blue-600 transition" onClick={vt.finish}>Fächer abschließen</button>
          )}
        </>
      )}
      {vt.hint && <p className="w-full text-xs text-gray-500">{vt.hint}</p>}
    </div>
  );
}
