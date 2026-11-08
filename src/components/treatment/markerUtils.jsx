import React from "react";
import { evalAmount } from "../../utils/helpers";
import { praepLetter, markerPraepIdx } from "../../utils/praeparate";
import { isVector, serializeVector } from "./vectors";
import { isGuide, orderMarkers, treatmentPoints } from "../../utils/markers";

// ═══════════════════ Shared injection-point helpers ═══════════════════
// Markers are stored as { x, y, amount, color? }. `color` is optional and new;
// older documents without it render in the classic red.

// Vivid palette. Bright shades (yellow, orange, green, ...) can't hold white
// text at readable contrast, so MarkerDot picks white or near-black per colour
// (markerTextColor); every entry reaches at least 4.5:1 (WCAG AA) that way.
export const MARKER_COLORS = [
  { hex: "#ef4444", name: "Rot" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#facc15", name: "Gelb" },
  { hex: "#22c55e", name: "Grün" },
  { hex: "#06b6d4", name: "Türkis" },
  { hex: "#2563eb", name: "Blau" },
  { hex: "#7c3aed", name: "Lila" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#84cc16", name: "Limette" },
  { hex: "#6b7280", name: "Grau" },
];
export const DEFAULT_MARKER_COLOR = MARKER_COLORS[0].hex;

// Two stored shades from earlier palettes fail contrast with both white and
// dark text; they render with the nearest passing shade instead.
const LEGACY_COLORS = {
  "#a855f7": "#7c3aed",
  "#6366f1": "#4f46e5",
};

export const markerColor = (m) => {
  const c = (m && m.color) || DEFAULT_MARKER_COLOR;
  return LEGACY_COLORS[c.toLowerCase()] || c;
};

const relLuminance = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

// White text on dark colours, near-black on bright ones (whichever contrasts more)
export const markerTextColor = (hex) => {
  const L = relLuminance(hex);
  const withWhite = 1.05 / (L + 0.05);
  const withDark = (L + 0.05) / (relLuminance("#111827") + 0.05);
  return withWhite >= withDark ? "#ffffff" : "#111827";
};

export const nextMarkerColor = (hex) => {
  const i = MARKER_COLORS.findIndex((c) => c.hex === markerColor({ color: hex }));
  return MARKER_COLORS[(i + 1) % MARKER_COLORS.length].hex;
};

export const fmtNum = (v) => (v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(".", ","));

// Label shown inside a dot: the evaluated units if entered, else the running
// number. With several Präparate on the document, the Präparat letter follows
// the units ("5A", "2,5B") so the face shows which product went where.
export const markerLabel = (m, idx, praepCount = 1) => {
  const v = evalAmount(m.amount);
  const base = v > 0 ? fmtNum(v) : String(idx + 1);
  return praepCount > 1 ? `${base}${praepLetter(markerPraepIdx(m, praepCount))}` : base;
};

// Strip runtime ids before persisting (keeps colour and Präparat when set; lines and
// fans keep their kind, end points, instrument and depth; fans without arms are dropped)
export const serializeMarkers = (markers) => orderMarkers(markers)
  .filter((m) => !((m.kind === "fan" || isGuide(m)) && !(m.to || []).length))
  .map((m) => {
    // Markierung: only its course and body region (utils/markers.js)
    if (isGuide(m)) {
      const g = { kind: "guide", x: m.x, y: m.y, to: m.to.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })) };
      if (m.v && m.v !== "face") g.v = m.v;
      return g;
    }
    const out = { x: m.x, y: m.y, amount: m.amount };
    if (m.color) out.color = m.color;
    if (Number.isInteger(m.p) && m.p > 0) out.p = m.p;
    // Body region (absent = face)
    if (m.v && m.v !== "face") out.v = m.v;
    if (isVector(m)) Object.assign(out, serializeVector(m));
    return out;
  });

// Pill-shaped dot that grows with its label (e.g. "12,5")
export function MarkerDot({ marker, idx, size = 18, fontSize = 9, shadow = false, style = {}, praepCount = 1 }) {
  const label = markerLabel(marker, idx, praepCount);
  const bg = markerColor(marker);
  // Entry point of a line or fan: open circle in the marker colour (face-chart convention)
  const hollow = isVector(marker);
  const hollowText = markerTextColor(bg) === "#111827" ? "#111827" : bg;
  return (
    <span
      className="flex items-center justify-center font-bold select-none flex-shrink-0"
      style={{
        minWidth: size,
        height: size,
        padding: label.length > 2 ? `0 ${Math.round(size * 0.3)}px` : 0,
        borderRadius: 999,
        background: hollow ? "#ffffff" : bg,
        color: hollow ? hollowText : markerTextColor(bg),
        border: hollow ? `${Math.max(1.5, Math.round(size / 9))}px solid ${bg}` : "none",
        boxSizing: "border-box",
        fontSize,
        lineHeight: 1,
        boxShadow: shadow ? "0 0 3px rgba(0,0,0,0.35)" : "none",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

// Dose presets offered as one-tap chips in the editor, per unit
// `main` is always visible, `more` unfolds behind a "Mehr" button
export const DOSE_PRESETS = {
  ml: { main: ["0,1", "0,2", "0,3", "0,5", "1"], more: ["0,05", "0,15", "0,25", "0,4", "0,7", "1,5", "2"] },
  SE: { main: ["2", "2,5", "5", "7,5", "10"], more: ["1", "1,5", "3", "4", "6", "8", "12", "15", "20"] },
};
DOSE_PRESETS.IE = DOSE_PRESETS.SE;
export const dosePresetsFor = (einheit) => DOSE_PRESETS[einheit] || DOSE_PRESETS.SE;

// Two amounts are the same dose when they evaluate to the same number ("2,5" == "2.5")
export const sameAmount = (a, b) => {
  const va = evalAmount(a), vb = evalAmount(b);
  return va > 0 && Math.abs(va - vb) < 1e-9;
};

// Dose chip row: pick the amount that new points receive. Selecting the active
// chip again clears the preset. The free-text field keeps its own text, so typing
// "1" on the way to "12" does not jump to the "1" chip and empty the field.
// onChange(value, { typed }) tells the editor whether the value came from the field.
export function DoseChips({ value, onChange, einheit, color, label = "Dosis für neue Punkte", labelWidth }) {
  const { main, more } = dosePresetsFor(einheit);
  const all = [...main, ...more];
  const [text, setText] = React.useState(() => (all.some((d) => sameAmount(d, value)) ? "" : value || ""));
  // Value changed from outside (e.g. reset or another Präparat): mirror it unless it is what was typed
  React.useEffect(() => {
    if (value === text || (text && sameAmount(value, text))) return;
    setText(all.some((d) => sameAmount(d, value)) ? "" : value || "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const chipValue = text ? "" : value;
  const inMore = more.some((d) => sameAmount(d, chipValue));
  const [expanded, setExpanded] = React.useState(false);
  const showMore = expanded || inMore;
  const presets = showMore ? all : main;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 mr-0.5 flex-shrink-0" style={labelWidth ? { width: labelWidth } : undefined}>{labelWidth ? label : `${label}:`}</span>
      {presets.map((d) => {
        const active = sameAmount(d, chipValue);
        return (
          <button
            key={d}
            type="button"
            onClick={() => { setText(""); onChange(active ? "" : d, { typed: false }); }}
            className="text-xs font-semibold rounded-full transition"
            style={{
              minWidth: 34,
              height: 26,
              padding: "0 9px",
              background: active ? color : "#f3f4f6",
              color: active ? markerTextColor(color) : "#374151",
              outline: active ? `2px solid ${color}` : "none",
              outlineOffset: 2,
            }}
          >
            {d}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-blue-500 hover:text-blue-700 px-1"
        style={{ height: 26 }}
      >
        {showMore ? "Weniger" : "Mehr"}
      </button>
      <input
        type="text"
        inputMode="decimal"
        className={`px-2.5 py-1 text-xs rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 ${text ? "border-2 font-semibold" : "border border-[#DFE3EB]"}`}
        style={{ width: 92, borderColor: text ? color : undefined }}
        placeholder="Andere"
        title="Eigene Menge, z.B. 3,5 oder 2x3"
        value={text}
        onChange={(e) => { const v = e.target.value.replace(/[^\d,.+*×x\- ]/g, ""); setText(v); onChange(v, { typed: true }); }}
      />
      <span className="text-xs text-gray-400">{einheit}</span>
    </div>
  );
}

// Präparat chip row: which Präparat newly placed points belong to
export function PraeparatChips({ praeparate, value, onChange, label = "Präparat für neue Punkte", labelWidth }) {
  if (!praeparate || praeparate.length < 2) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 mr-0.5 flex-shrink-0" style={labelWidth ? { width: labelWidth } : undefined}>{labelWidth ? label : `${label}:`}</span>
      {praeparate.map((p, i) => {
        const active = value === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`text-xs rounded-full transition px-2.5 ${active ? "bg-gray-800 text-white font-semibold" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            style={{ height: 26 }}
          >
            <span className="font-bold mr-1">{praepLetter(i)}</span>{p.name || `Präparat ${praepLetter(i)}`}
          </button>
        );
      })}
    </div>
  );
}

// Small letter badge on a marker row; clicking moves the point to the next Präparat
export function PraeparatBadge({ marker, praeparate, onCycle }) {
  if (!praeparate || praeparate.length < 2) return null;
  const idx = markerPraepIdx(marker, praeparate.length);
  const name = praeparate[idx]?.name || `Präparat ${praepLetter(idx)}`;
  return (
    <button
      type="button"
      className="flex-shrink-0 text-[10px] font-bold rounded bg-gray-800 text-white hover:bg-gray-600 transition"
      style={{ width: 18, height: 18, lineHeight: "18px" }}
      title={`${name} – klicken für nächstes Präparat`}
      onClick={() => onCycle && onCycle((idx + 1) % praeparate.length)}
    >
      {praepLetter(idx)}
    </button>
  );
}

// Colour swatch row used in the editor
export function ColorSwatches({ value, onChange, label = "Farbe für neue Punkte", labelWidth }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 flex-shrink-0" style={labelWidth ? { width: labelWidth } : undefined}>{labelWidth ? label : `${label}:`}</span>
      {MARKER_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.name}
          onClick={() => onChange(c.hex)}
          className="rounded-full transition"
          style={{ width: 22, height: 22, background: c.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)", outline: value === c.hex ? `2px solid ${c.hex}` : "none", outlineOffset: 2, opacity: value === c.hex ? 1 : 0.8 }}
        />
      ))}
    </div>
  );
}

// Live Gesamtmenge under the editor's point list: one total, or one row per Präparat
export function LiveTotal({ markers, praeparate, einheit }) {
  const list = Array.isArray(praeparate) && praeparate.length > 1 ? praeparate : null;
  const sum = (ms) => Math.round(ms.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  markers = treatmentPoints(markers);
  if (!markers.length) return null;
  const rows = list
    ? list.map((p, i) => {
        const own = markers.filter((m) => markerPraepIdx(m, list.length) === i);
        return { key: i, label: <><span className="font-bold mr-1">{praepLetter(i)}</span>{p.name || `Präparat ${praepLetter(i)}`}</>, units: sum(own), einheit: p.einheit || einheit, count: own.length };
      }).filter((r) => r.count > 0)
    : [{ key: 0, label: "Gesamtmenge", units: sum(markers), einheit, count: markers.length }];
  return (
    <div className="mt-3 pt-2.5 border-t border-gray-100">
      {list && <p className="text-xs text-gray-500 mb-1">Gesamtmenge</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
            <span className={list ? "text-gray-600 text-xs" : "text-gray-700 font-medium"}>{r.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtNum(r.units)} {r.einheit}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">Wird beim Speichern als Menge des Präparats übernommen.</p>
    </div>
  );
}
