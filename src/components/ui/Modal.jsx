import React, { useEffect, useRef } from "react";

// ═══════════════════ Modal ═══════════════════
//
// One shell for every large modal (document views and create forms), so they
// share backdrop, card shape, header and closing behaviour.
//
// size: "document" fits an A4 page (also used for forms), "wide" fits a form
//       next to an A4 preview.
// dismissible: Escape and a backdrop click close it. Keep false for forms
//       with unsaved input; they close via the X only.
// escapeBlocked: an outside dialog sits on top (e.g. a delete confirmation).

const WIDTHS = {
  document: "max-w-[calc(210mm+3rem)]",
  wide: "max-w-7xl",
};

export default function Modal({ title, badge, onClose, size = "document", z = "z-40", dismissible = true, escapeBlocked = false, bodyClassName = "", children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || escapeBlocked) return;
      // A dialog opened inside this modal handles Escape itself
      if (panelRef.current?.querySelector(".fixed.inset-0") || document.querySelector("[data-stacked-dialog]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible, escapeBlocked, onClose]);

  return (
    <div
      className={`fixed inset-0 ${z} bg-black/40 overflow-y-auto`}
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="min-h-full flex items-start justify-center py-4 sm:py-8 px-3 sm:px-4"
        onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}
      >
        <div ref={panelRef} className={`relative w-full ${WIDTHS[size] || WIDTHS.document} bg-white rounded-xl shadow-2xl`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>
            {badge}
            <button className="ml-auto p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" onClick={onClose} aria-label="Schließen">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className={`rounded-b-xl ${bodyClassName}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
