import { PUNKTWERT, BOTOX_GOA_ITEMS, ICD10_CODES, ZUSCHLAEGE } from "../constants";

// ═══════════════════ Helpers ═══════════════════

export function calcGoaBetrag(punkte, steigerung) {
  return Math.round(punkte * PUNKTWERT * steigerung * 100) / 100;
}

export function fmt(val) {
  return val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parsePlzOrt(address2) {
  if (!address2) return { plz: "", ort: "" };
  // Match leading digits (any length, to support partial typing) followed by optional separator and city
  const m = address2.match(/^(\d+)\s*,?\s*(.*)$/);
  if (m) return { plz: m[1], ort: m[2] };
  return { plz: "", ort: address2 };
}
export function combinePlzOrt(plz, ort) {
  if (plz && ort) return `${plz} ${ort}`;
  return plz || ort || "";
}

// Flash animation on auto-filled Ort input
export function flashOrtField(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove("plz-autofilled");
  void inputEl.offsetWidth; // force reflow to restart animation
  inputEl.classList.add("plz-autofilled");
}

// Auto-lookup city name from German PLZ via free API
const plzCache = {};
export async function lookupPlz(plz) {
  if (!plz || plz.length !== 5 || !/^\d{5}$/.test(plz)) return null;
  if (plzCache[plz] !== undefined) return plzCache[plz];
  try {
    const res = await fetch(`https://api.zippopotam.us/de/${plz}`);
    if (!res.ok) { plzCache[plz] = null; return null; }
    const data = await res.json();
    const place = data.places?.[0]?.["place name"] || null;
    plzCache[plz] = place;
    return place;
  } catch { plzCache[plz] = null; return null; }
}

export function fmtPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/[^\d+]/g, "");
  // +49 format: +49 XXX XXXX XXXX
  if (digits.startsWith("+49") && digits.length >= 12) {
    const rest = digits.slice(3);
    // Mobile (15x, 16x, 17x): +49 1XX XXXX XXXX
    if (rest.startsWith("1")) return `+49 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`.trim();
    // Landline: +49 XX XXXX XXXX or +49 XXX XXXX XXX
    return `+49 ${rest.slice(0, 2)} ${rest.slice(2, 6)} ${rest.slice(6)}`.trim();
  }
  // 0-prefix: 0XXX XXXX XXXX
  if (digits.startsWith("0") && digits.length >= 10) {
    if (digits.startsWith("01")) return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`.trim();
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`.trim();
  }
  // Other international: group in chunks of 4 after country code
  if (digits.startsWith("+") && digits.length > 6) {
    const cc = digits.match(/^\+\d{1,3}/)?.[0] || "";
    const rest = digits.slice(cc.length);
    return `${cc} ${rest.replace(/(\d{4})(?=\d)/g, "$1 ")}`.trim();
  }
  return phone; // Return as-is if no pattern matched
}

export function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function parseDE(str) {
  if (!str || str === "" || str === "," || str === "-") return 0;
  const cleaned = str.replace(",", ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Evaluate simple math expressions in amount fields, e.g. "6 x 3", "6*3", "6×3", "2x3x4"
export function evalAmount(str) {
  if (!str || typeof str !== "string") return parseFloat(String(str || "0").replace(",", ".")) || 0;
  const s = str.trim().replace(/,/g, ".");
  // Split on multiplication operators: x, X, ×, *
  const parts = s.split(/\s*[xX×*]\s*/);
  if (parts.length > 1) {
    return parts.reduce((acc, p) => {
      const v = parseFloat(p);
      return isNaN(v) ? acc : acc * v;
    }, 1);
  }
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

export function fmtUnits(markers) {
  const total = Math.round(markers.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  return total % 1 === 0 ? total.toString() : total.toFixed(2).replace(/0+$/, "").replace(".", ",");
}

// Detect pattern in invoice number and suggest the next one
// e.g. "RE-0003" → "RE-0004", "2026-005" → "2026-006", "17" → "18"
export function nextInvoiceNumber(nummer) {
  if (!nummer || typeof nummer !== "string") return "";
  // Find the LAST group of digits — this is the sequential counter
  // Handles: RE-0001, 2024/RE/001, R2024/003, INV-2024-0042, 001, etc.
  const match = nummer.match(/^(.*\D)?(\d+)(\D.*)?$/);
  if (!match) {
    // Entire string is digits
    const allDigits = nummer.match(/^(\d+)$/);
    if (!allDigits) return "";
    const n = (parseInt(allDigits[1], 10) + 1).toString();
    return n.length < allDigits[1].length ? n.padStart(allDigits[1].length, "0") : n;
  }
  const prefix = match[1] || "";
  const numPart = match[2];
  const suffix = match[3] || "";
  const nextNum = (parseInt(numPart, 10) + 1).toString();
  // Preserve zero-padding: if original was "003", next is "004"
  const padded = nextNum.length < numPart.length ? nextNum.padStart(numPart.length, "0") : nextNum;
  return prefix + padded + suffix;
}

export function toDE(num) {
  return num.toString().replace(".", ",");
}

export function buildLineItems(praeparat, ml, preisProMl, selectedZuschlaege, sachkosten, customS, einheit, useGoa3, ganzeAmpulle, ampullenpreis, beratungOnly) {
  // customS can be: { s1, s5, s267 } from calcWeightedForGesamt, or null
  // beratungOnly: consultation-only invoice — GOÄ 1/3 (+ Zuschläge/Sachkosten), no GOÄ 5/267, no product line
  const goaSource = beratungOnly ? BOTOX_GOA_ITEMS.filter((g) => g.goaCode === "1") : BOTOX_GOA_ITEMS;
  const goaLines = goaSource.map((g) => {
    // Swap GOÄ 1 → GOÄ 3 if extended consultation
    if (g.goaCode === "1" && useGoa3) {
      g = { ...g, goaCode: "3", description: "Eingehende Beratung (mehr als 10 Min.)", punkte: 150 };
    }
    if (customS != null) {
      const sMap = { "1": customS.s1, "3": customS.s1, "5": customS.s5, "267": customS.s267 };
      const s = sMap[g.goaCode] || g.steigerung;
      return { ...g, steigerung: s, betrag: calcGoaBetrag(g.punkte, s), isProduct: false };
    }
    return {
      ...g,
      betrag: calcGoaBetrag(g.punkte, g.steigerung),
      isProduct: false,
    };
  });

  // Add Zuschläge (factor 1.0, nicht steigerbar)
  const zuschlagLines = (selectedZuschlaege || []).map((code) => {
    const z = ZUSCHLAEGE.find((zs) => zs.code === code);
    if (!z) return null;
    return {
      goaCode: z.code,
      description: z.description,
      punkte: z.punkte,
      steigerung: 1.0,
      betrag: calcGoaBetrag(z.punkte, 1.0),
      isProduct: false,
      isZuschlag: true,
    };
  }).filter(Boolean);

  const productLine = {
    goaCode: "",
    description: ganzeAmpulle ? `1 Ampulle ${praeparat || "Präparat"}` : `${ml}${einheit || "ml"} ${praeparat || "Präparat"}`,
    punkte: null,
    steigerung: null,
    betrag: ganzeAmpulle ? Math.round((ampullenpreis || 0) * 100) / 100 : Math.round(ml * preisProMl * 100) / 100,
    isProduct: true,
    isPraeparat: true,
    unitPrice: preisProMl,
    quantity: ml,
    einheit: einheit || "ml",
    praeparatName: praeparat || "Präparat",
    ganzeAmpulle: !!ganzeAmpulle,
  };

  // Add Sachkosten lines
  const sachkostenLines = (sachkosten || []).map((sk) => ({
    goaCode: "",
    description: sk.description,
    punkte: null,
    steigerung: null,
    betrag: parseDE(sk.betragStr),
    isProduct: true,
  }));

  if (beratungOnly) return [...goaLines, ...zuschlagLines, ...sachkostenLines];
  return [...goaLines, ...zuschlagLines, productLine, ...sachkostenLines];
}

// Compute weighted Steigerungssätze to reach a desired Gesamtbetrag (inkl. MwSt.)
// Distribution ratio: GOÄ 1/3 and GOÄ 5 get weight 1, GOÄ 267 gets weight 3
// All start at base 2.3x, then excess is distributed by weight
export function calcWeightedForGesamt(desiredGesamt, ml, preisProMl, selectedZuschlaege, sachkosten, noMwst, useGoa3, ganzeAmpulle, ampullenpreis, beratungOnly) {
  const p1 = useGoa3 ? 150 : 80; // GOÄ 1 or 3
  const p5 = 80;                  // GOÄ 5
  const p267 = 80;                // GOÄ 267
  const productCost = beratungOnly ? 0 : ganzeAmpulle ? Math.round((ampullenpreis || 0) * 100) / 100 : Math.round(ml * preisProMl * 100) / 100;
  const sachkostenTotal = (sachkosten || []).reduce((sum, sk) => sum + parseDE(sk.betragStr), 0);
  const zuschlagTotal = (selectedZuschlaege || []).reduce((sum, code) => {
    const z = ZUSCHLAEGE.find((zs) => zs.code === code);
    return z ? sum + calcGoaBetrag(z.punkte, 1.0) : sum;
  }, 0);

  const desiredNetto = noMwst ? desiredGesamt : Math.round((desiredGesamt / 1.19) * 100) / 100;

  // Target netto that GOÄ lines must cover
  const goaTarget = desiredNetto - productCost - sachkostenTotal - zuschlagTotal;
  if (goaTarget <= 0) return { s1: 2.3, s5: 2.3, s267: 2.3 };

  // Consultation-only: the single GOÄ 1/3 line must carry the full target.
  // Full precision (like solveS267 below) so the Betrag lands on the exact cent.
  if (beratungOnly) {
    const targetBetrag1 = Math.round(goaTarget * 100) / 100;
    const s1 = targetBetrag1 / (p1 * PUNKTWERT);
    return { s1, s5: s1, s267: s1 };
  }

  // Strategy: round s1 and s5 to 2 decimals, then derive s267 with full precision
  // so that calcGoaBetrag(p267, s267) lands on the exact cent needed.
  // The invoice display uses targetGesamt to force the exact total, so any tiny
  // MwSt rounding difference is absorbed there.
  const solveS267 = (s1v, s5v) => {
    const usedByOthers = calcGoaBetrag(p1, s1v) + calcGoaBetrag(p5, s5v);
    const targetBetrag267 = Math.round((goaTarget - usedByOthers) * 100) / 100;
    const s267 = targetBetrag267 / (p267 * PUNKTWERT);
    return { s1: s1v, s5: s5v, s267 };
  };

  // Base cost at 2.3x
  const baseCost = (p1 + p5 + p267) * PUNKTWERT * 2.3;
  const excess = goaTarget - baseCost;

  if (excess <= 0) {
    const uniformS = Math.round((goaTarget / ((p1 + p5 + p267) * PUNKTWERT)) * 100) / 100;
    return solveS267(uniformS, uniformS);
  }

  // When GOÄ 3 is used (150 Punkte), lock it at 2.3x to avoid disproportional increases.
  if (useGoa3) {
    const weightedPunkte = p5 * 1 + p267 * 3;
    const d = excess / (PUNKTWERT * weightedPunkte);
    const s5 = Math.round((2.3 + d * 1) * 100) / 100;
    return solveS267(2.3, s5);
  }

  // Normal case (GOÄ 1): distribute across all three with weight 1:1:3
  const weightedPunkte = p1 * 1 + p5 * 1 + p267 * 3;
  const d = excess / (PUNKTWERT * weightedPunkte);
  const s1 = Math.round((2.3 + d * 1) * 100) / 100;
  const s5 = Math.round((2.3 + d * 1) * 100) / 100;
  return solveS267(s1, s5);
}

export function calcGesamt(lineItems, kleinunternehmer, isAusland, isMedical) {
  const zwischensumme = lineItems.reduce((s, it) => s + it.betrag, 0);
  const noMwst = kleinunternehmer || isAusland || isMedical;
  const mwst = noMwst ? 0 : Math.round(zwischensumme * 0.19 * 100) / 100;
  return Math.round((zwischensumme + mwst) * 100) / 100;
}

