// Guide lines ("Markierung") mark a structure on the chart so it is easy to find again
// at the next treatment, e.g. a pronounced wrinkle or a scar. They live in the same list
// as the injection points, so saving, loading, the PDF and "Aus früherer Behandlung
// übernehmen" carry them along. A guide is { kind: "guide", x, y, to: [{x, y}, ...], v? }:
// no dose, no Präparat, no colour, no running number, and it never counts as a point.

export const isGuide = (m) => !!m && m.kind === "guide";

/** Injection points, lines and fans: everything that counts as a point. */
export const treatmentPoints = (markers) => (markers || []).filter((m) => !isGuide(m));

export const guideLines = (markers) => (markers || []).filter(isGuide);

/** Points before guides, so a point's running number (its index) never skips a guide. */
export const orderMarkers = (markers) => [...treatmentPoints(markers), ...guideLines(markers)];

/** Adds a marker keeping that order: points go before the first guide, guides at the end. */
export function addMarker(markers, m) {
  const list = markers || [];
  if (isGuide(m)) return [...list, m];
  const i = list.findIndex(isGuide);
  return i < 0 ? [...list, m] : [...list.slice(0, i), m, ...list.slice(i)];
}
