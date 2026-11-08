import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ═══════════════════ Select ═══════════════════
//
// Drop-in replacement for <select> with <option> children. Always renders its
// own list directly under the field (flips up when there is no room), because
// native popup menus are drawn by the browser/OS and can open far away from
// the field in zoomed or embedded views. No native fallback on touch devices:
// device detection proved unreliable (emulated or hybrid devices).
//
// onChange receives { target: { value } } like a native change event.

const flatten = (children) => {
  const out = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) { out.push(...flatten(child.props.children)); return; }
    if (child.type !== "option") return;
    const label = React.Children.toArray(child.props.children).join("");
    const hasValue = child.props.value !== undefined;
    const value = hasValue ? String(child.props.value) : label;
    const separator = !!child.props.disabled && !hasValue && /^[─—\-\s]*$/.test(label);
    out.push({ value, label, disabled: !!child.props.disabled, separator });
  });
  return out;
};

const PANEL_MAX_H = 288;
const GAP = 4;

export default function Select({ value, onChange, children, className = "", disabled, autoFocus, onBlur, onKeyDown, id, name, title, style, "aria-label": ariaLabel }) {
  const options = useMemo(() => flatten(children), [children]);
  const current = String(value ?? "");
  const selectedIdx = options.findIndex((o) => !o.separator && o.value === current);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : options.find((o) => !o.separator && !o.disabled);

  const btnRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const typeahead = useRef({ text: "", t: 0 });

  const selectable = (i) => i >= 0 && i < options.length && !options[i].disabled && !options[i].separator;
  const step = (from, dir) => {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i += dir;
      if (i < 0 || i >= options.length) return from;
      if (selectable(i)) return i;
    }
    return from;
  };

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const below = vh - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const wanted = Math.min(PANEL_MAX_H, options.length * 36 + 8);
    const up = below < Math.min(wanted, 160) && above > below;
    const maxH = Math.max(120, Math.min(PANEL_MAX_H, up ? above : below));
    const width = Math.max(r.width, 112);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    setPos(up ? { left, width, maxH, bottom: vh - r.top + GAP } : { left, width, maxH, top: r.bottom + GAP });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    // Safari does not focus buttons on click; keys and blur handling need focus
    if (document.activeElement !== btnRef.current) btnRef.current?.focus();
    setActive(selectedIdx >= 0 ? selectedIdx : step(-1, 1));
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };
  const choose = (i) => {
    if (!selectable(i)) return;
    close();
    if (options[i].value !== current && onChange) onChange({ target: { value: options[i].value, name } });
  };

  // Keep the panel attached to the field while scrolling or resizing
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open, place]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  // Scroll the active option into view
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (autoFocus && btnRef.current) { btnRef.current.focus(); openList(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKey = (e) => {
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { e.preventDefault(); openList(); return; }
      onKeyDown && onKeyDown(e);
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (k === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (k === "Home") { e.preventDefault(); setActive(step(-1, 1)); }
    else if (k === "End") { e.preventDefault(); setActive(step(options.length, -1)); }
    else if (k === "Enter") { e.preventDefault(); choose(active); }
    else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === "Tab") { setOpen(false); }
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead: jump to the first option starting with the typed letters
      const now = Date.now();
      const ta = typeahead.current;
      ta.text = (now - ta.t > 700 ? "" : ta.text) + k.toLowerCase();
      ta.t = now;
      const i = options.findIndex((o, idx) => selectable(idx) && o.label.toLowerCase().startsWith(ta.text));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        title={title}
        style={style}
        disabled={disabled}
        className={`ephia-select text-left truncate ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleKey}
        onBlur={(e) => { if (!open && onBlur) onBlur(e); }}
      >
        {selected ? selected.label : " "}
      </button>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          className="fixed z-[200] bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1 overflow-y-auto text-sm"
          style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, top: pos.top, bottom: pos.bottom, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
        >
          {options.map((o, i) => (
            o.separator ? (
              <li key={"sep" + i} role="separator" className="my-1 border-t border-gray-100" />
            ) : (
              <li
                key={o.value + i}
                data-idx={i}
                role="option"
                aria-selected={o.value === current}
                aria-disabled={o.disabled || undefined}
                className={`flex items-center gap-2 px-3 py-2 [@media(pointer:coarse)]:py-3 cursor-pointer select-none ${o.disabled ? "text-gray-300 cursor-default" : i === active ? "bg-blue-50 text-gray-900" : "text-gray-700"}`}
                // Keep focus on the field (inline editors close on blur)
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => selectable(i) && setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="flex-1 min-w-0 truncate">{o.label}</span>
                {o.value === current && (
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" /></svg>
                )}
              </li>
            )
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}
