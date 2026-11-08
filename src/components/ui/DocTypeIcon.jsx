import React from "react";

// One icon and tint per document type, so the four kinds are told apart at a glance.
// Green and amber are left out on purpose: the status pills next to them use those.
const TYPES = {
  "Aufklärungsbogen": {
    tint: "bg-violet-50 text-violet-500",
    // clipboard with check
    d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  "Honorarvereinbarung": {
    tint: "bg-cyan-50 text-cyan-600",
    // scale: agreement on the fee
    d: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
  },
  "Rechnung": {
    tint: "bg-blue-50 text-blue-500",
    // receipt
    d: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM9 8h6M9 12h6",
  },
  "Behandlungsdoku": {
    tint: "bg-rose-50 text-rose-500",
    // syringe (shape after Lucide, ISC licence)
    d: "M18 2l4 4M17 7l3-3M19 9L8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6",
  },
};

export default function DocTypeIcon({ label }) {
  const t = TYPES[label] || { tint: "bg-gray-100 text-gray-400", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" };
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ${t.tint}`} aria-hidden="true">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.d} /></svg>
    </span>
  );
}
