// ═══════════════════ Body-region charts ═══════════════════
//
// Every chart is a square line drawing (SVG), so a point's x/y stay "percent of a
// square box" exactly like on the face. A point stores its chart in `v`; points
// without `v` belong to the face, so documents from before regions existed keep
// working unchanged. face.svg is a potrace vectorisation of the original face
// PNG (FACE_IMAGE_B64), so it stays sharp when zoomed.

import { FACE_IMAGE_B64 } from "../../constants";
import faceSvg from "./charts/face.svg?raw";
import profileSvg from "./charts/profile.svg?raw";
import neckSvg from "./charts/neck.svg?raw";
import handsBackSvg from "./charts/hands_back.svg?raw";
import handsPalmSvg from "./charts/hands_palm.svg?raw";
import axillaeSvg from "./charts/axillae.svg?raw";

const svgUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

export const CHARTS = [
  { id: "face", label: "Gesicht", src: svgUrl(faceSvg), png: FACE_IMAGE_B64 },
  { id: "profile", label: "Profil", src: svgUrl(profileSvg) },
  { id: "neck", label: "Hals & Dekolleté", src: svgUrl(neckSvg) },
  { id: "hands_back", label: "Handrücken", src: svgUrl(handsBackSvg) },
  { id: "hands_palm", label: "Handflächen", src: svgUrl(handsPalmSvg) },
  { id: "axillae", label: "Achseln", src: svgUrl(axillaeSvg) },
];

const BY_ID = Object.fromEntries(CHARTS.map((c) => [c.id, c]));

export const chartById = (id) => BY_ID[id] || BY_ID.face;

// Which chart a point belongs to
export const markerView = (m) => (m && BY_ID[m.v] ? m.v : "face");

// Image to draw for a chart; a patient photo replaces the drawn face only
export const chartImage = (id, facePhoto) => (id === "face" && facePhoto ? facePhoto : chartById(id).src);

// Charts that carry points, in menu order; the face when there are none
export function usedViews(markers) {
  const used = new Set((markers || []).map(markerView));
  const list = CHARTS.filter((c) => used.has(c.id)).map((c) => c.id);
  return list.length ? list : ["face"];
}

// PNG of a chart for the PDF (html2canvas drops SVG images in some browsers).
// The face already has a PNG; the others are rasterised once and cached.
const pngCache = {};
export function chartPng(id, size = 800) {
  const c = chartById(id);
  if (c.png) return Promise.resolve(c.png);
  if (pngCache[id]) return pngCache[id];
  pngCache[id] = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(c.src);
    img.src = c.src;
  });
  return pngCache[id];
}
