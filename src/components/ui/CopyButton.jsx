import React, { useEffect, useRef, useState } from "react";
import { showToast } from "../../utils/toast";

// Small icon button that copies `value` to the clipboard and shows a check
// mark for a moment. Renders nothing when there is nothing to copy.
export default function CopyButton({ value, label = "Kopieren", className = "" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = (value ?? "").toString().trim();
  if (!text) return null;

  const copy = async (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts / older browsers
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Kopieren nicht möglich", { error: true });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Kopiert" : label}
      aria-label={copied ? "Kopiert" : label}
      className={`flex-shrink-0 p-1 rounded transition ${copied ? "text-green-600" : "text-gray-300 hover:text-gray-600 hover:bg-gray-100"} ${className}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15V6a2 2 0 012-2h9" /></svg>
      )}
    </button>
  );
}
