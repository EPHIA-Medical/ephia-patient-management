import React, { useState } from "react";
import { createPortal } from "react-dom";

// ═══════════════════ Info Tooltip ═══════════════════
//
// Rendered into document.body (so no overflow or transformed parent can clip it)
// and placed after measuring: above the trigger when it fits, otherwise below,
// clamped to the viewport with an 8px margin. If neither side has room, the
// tooltip takes the larger side and scrolls inside.

const MARGIN = 8;
const GAP = 6;

export function Tooltip({ content, children, wide, width, className = "inline-flex items-center" }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = React.useRef(null);
  const tipRef = React.useRef(null);
  const hideTimeout = React.useRef(null);
  const tooltipW = width || (wide ? 384 : 256);

  const cancelHide = () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  const scheduleHide = () => { cancelHide(); hideTimeout.current = setTimeout(() => setShow(false), 150); };
  const open = () => { cancelHide(); setShow(true); };

  const place = React.useCallback(() => {
    const t = triggerRef.current, tip = tipRef.current;
    if (!t || !tip) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(tooltipW, vw - 2 * MARGIN);
    const h = tip.scrollHeight;
    const above = r.top - GAP - MARGIN;
    const below = vh - r.bottom - GAP - MARGIN;
    let top, maxHeight;
    if (h <= above) top = r.top - GAP - h;
    else if (h <= below) top = r.bottom + GAP;
    else if (above >= below) { maxHeight = above; top = MARGIN; }
    else { maxHeight = below; top = r.bottom + GAP; }
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    setPos({ top, left, width: w, maxHeight });
  }, [tooltipW]);

  // Measure after the tooltip is in the DOM, before the browser paints
  React.useLayoutEffect(() => {
    if (!show) return undefined;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    // The text can reflow after the first measurement (web font arriving), so follow size changes
    const ro = typeof ResizeObserver !== "undefined" && tipRef.current ? new ResizeObserver(onMove) : null;
    if (ro) ro.observe(tipRef.current);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); if (ro) ro.disconnect(); };
  }, [show, place]);

  React.useEffect(() => () => cancelHide(), []);

  return (
    <span className={className}>
      <span
        ref={triggerRef}
        className="inline-flex items-center"
        onMouseEnter={open}
        onMouseLeave={scheduleHide}
        onClick={(e) => { e.stopPropagation(); if (show) setShow(false); else open(); }}
      >
        {children}
      </span>
      {show && typeof document !== "undefined" && createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg"
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: "1.5",
            position: "fixed",
            zIndex: 9999,
            width: pos ? pos.width : Math.min(tooltipW, window.innerWidth - 2 * MARGIN),
            top: pos ? pos.top : 0,
            left: pos ? pos.left : 0,
            maxHeight: pos?.maxHeight,
            overflowY: pos?.maxHeight ? "auto" : undefined,
            visibility: pos ? "visible" : "hidden",
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  );
}

export default function InfoTooltip({ children, wide }) {
  return (
    <Tooltip content={children} wide={wide}>
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-xs cursor-help font-bold leading-none">?</span>
    </Tooltip>
  );
}
