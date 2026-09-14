import React from "react";
import { evalAmount } from "../../utils/helpers";

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

// Label shown inside a dot: the evaluated units if entered, else the running number
export const markerLabel = (m, idx) => {
  const v = evalAmount(m.amount);
  return v > 0 ? fmtNum(v) : String(idx + 1);
};

// Strip runtime ids before persisting (keeps colour when set)
export const serializeMarkers = (markers) => (markers || []).map((m) => {
  const out = { x: m.x, y: m.y, amount: m.amount };
  if (m.color) out.color = m.color;
  return out;
});

// Pill-shaped dot that grows with its label (e.g. "12,5")
export function MarkerDot({ marker, idx, size = 18, fontSize = 9, shadow = false, style = {} }) {
  const label = markerLabel(marker, idx);
  const bg = markerColor(marker);
  return (
    <span
      className="flex items-center justify-center font-bold select-none flex-shrink-0"
      style={{
        minWidth: size,
        height: size,
        padding: label.length > 2 ? `0 ${Math.round(size * 0.3)}px` : 0,
        borderRadius: 999,
        background: bg,
        color: markerTextColor(bg),
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
// chip again clears the preset; anything else goes into the free-text field.
export function DoseChips({ value, onChange, einheit, color, label = "Dosis für neue Punkte" }) {
  const { main, more } = dosePresetsFor(einheit);
  const inMore = more.some((d) => sameAmount(d, value));
  const [expanded, setExpanded] = React.useState(false);
  const showMore = expanded || inMore;
  const presets = showMore ? [...main, ...more] : main;
  const isPreset = presets.some((d) => sameAmount(d, value));
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 mr-0.5">{label}:</span>
      {presets.map((d) => {
        const active = sameAmount(d, value);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(active ? "" : d)}
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
        inputMode="text"
        className="px-2 py-1 text-xs border border-[#DFE3EB] rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400"
        style={{ width: 88 }}
        placeholder="Andere, z.B. 2x3"
        value={isPreset ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs text-gray-400">{einheit}</span>
    </div>
  );
}

// Colour swatch row used in the editor
export function ColorSwatches({ value, onChange, label = "Farbe für neue Punkte" }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">{label}:</span>
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
