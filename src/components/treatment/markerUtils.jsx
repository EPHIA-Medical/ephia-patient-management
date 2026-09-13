import React from "react";
import { evalAmount } from "../../utils/helpers";

// ═══════════════════ Shared injection-point helpers ═══════════════════
// Markers are stored as { x, y, amount, color? }. `color` is optional and new;
// older documents without it render in the classic red.

// All shades give white labels at least 4.5:1 contrast (WCAG AA), which matters
// because the unit numbers inside the dots are only ~9px.
export const MARKER_COLORS = [
  { hex: "#dc2626", name: "Rot" },
  { hex: "#2563eb", name: "Blau" },
  { hex: "#15803d", name: "Grün" },
  { hex: "#c2410c", name: "Orange" },
  { hex: "#9333ea", name: "Lila" },
  { hex: "#0f766e", name: "Türkis" },
  { hex: "#db2777", name: "Pink" },
  { hex: "#4f46e5", name: "Indigo" },
  { hex: "#92400e", name: "Braun" },
  { hex: "#6b7280", name: "Grau" },
];
export const DEFAULT_MARKER_COLOR = MARKER_COLORS[0].hex;

// Earlier palette shades were too light for white text; documents that stored
// them are rendered with the matching darker shade instead.
const LEGACY_COLORS = {
  "#ef4444": "#dc2626",
  "#3b82f6": "#2563eb",
  "#22c55e": "#15803d",
  "#f59e0b": "#c2410c",
  "#a855f7": "#9333ea",
  "#14b8a6": "#0f766e",
  "#ec4899": "#db2777",
  "#6366f1": "#4f46e5",
};

export const markerColor = (m) => {
  const c = (m && m.color) || DEFAULT_MARKER_COLOR;
  return LEGACY_COLORS[c.toLowerCase()] || c;
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
  return (
    <span
      className="flex items-center justify-center text-white font-bold select-none flex-shrink-0"
      style={{
        minWidth: size,
        height: size,
        padding: label.length > 2 ? `0 ${Math.round(size * 0.3)}px` : 0,
        borderRadius: 999,
        background: markerColor(marker),
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
          style={{ width: 22, height: 22, background: c.hex, outline: value === c.hex ? `2px solid ${c.hex}` : "none", outlineOffset: 2, opacity: value === c.hex ? 1 : 0.75 }}
        />
      ))}
    </div>
  );
}
