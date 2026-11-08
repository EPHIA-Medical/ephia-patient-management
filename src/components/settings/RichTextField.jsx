import React, { useEffect, useRef } from "react";
import { sanitizeConsentHtml } from "../consent/consentTemplateStore";

// Minimal rich-text field for the Aufklärungstext: paragraphs, bold, italic
// and lists. Uncontrolled contentEditable; emits sanitized HTML.
const TOOLS = [
  { cmd: "bold", label: "B", title: "Fett", cls: "font-bold" },
  { cmd: "italic", label: "I", title: "Kursiv", cls: "italic" },
  { cmd: "insertUnorderedList", label: "•", title: "Aufzählung", cls: "" },
  { cmd: "insertOrderedList", label: "1.", title: "Nummerierte Liste", cls: "" },
];

export default function RichTextField({ value, onChange, readOnly = false, minHeight = 140 }) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);

  // Only write into the DOM when the value changed from outside, so the caret survives typing
  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastEmitted.current) {
      ref.current.innerHTML = sanitizeConsentHtml(value || "");
      lastEmitted.current = value;
    }
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = sanitizeConsentHtml(ref.current.innerHTML);
    lastEmitted.current = html;
    onChange && onChange(html);
  };

  const exec = (cmd) => {
    ref.current?.focus();
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* not supported everywhere */ }
    document.execCommand(cmd, false, null);
    emit();
  };

  return (
    <div className={`rounded-lg border border-[#DFE3EB] overflow-hidden ${readOnly ? "bg-gray-50" : "bg-white focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent"}`}>
      {!readOnly && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
          {TOOLS.map((t) => (
            <button
              key={t.cmd}
              type="button"
              title={t.title}
              className={`w-7 h-7 rounded text-xs text-gray-600 hover:bg-white hover:text-gray-900 transition ${t.cls}`}
              onMouseDown={(e) => { e.preventDefault(); exec(t.cmd); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        className="consent-rte px-3 py-2.5 text-sm text-gray-700 leading-relaxed focus:outline-none [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1"
        style={{ minHeight }}
        onFocus={() => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* ignore */ } }}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Paste as plain text so foreign formatting never ends up in the Bogen
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
}
