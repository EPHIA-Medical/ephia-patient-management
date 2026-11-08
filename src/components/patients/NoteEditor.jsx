import React, { useEffect, useRef, useState } from "react";
import Spinner from "../ui/Spinner";
import { showToast } from "../../utils/toast";

// Free-text note with an inline editor. `onSave(text)` persists it (empty text
// removes the note). ⌘/Ctrl+Enter saves, Escape cancels.
export default function NoteEditor({ value, onSave, editing, setEditing, placeholder, rows = 3, autoFocus = true }) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value || "");
    if (autoFocus) setTimeout(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (saving) return;
    const text = draft.trim();
    if (text === (value || "").trim()) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(text);
      setEditing(false);
    } catch (e) {
      showToast("Notiz konnte nicht gespeichert werden: " + (e?.message || e), { error: true });
      setTimeout(() => ref.current?.focus(), 0);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return null;
  return (
    <div>
      <textarea
        ref={ref}
        rows={rows}
        className="w-full border border-[#DFE3EB] rounded-lg px-3 py-2 text-sm text-gray-800 leading-relaxed bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y"
        placeholder={placeholder}
        value={draft}
        readOnly={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); }
        }}
      />
      <div className="flex items-center gap-2 mt-2">
        <button className="px-3 py-1.5 text-xs rounded-md bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-60 inline-flex items-center gap-1.5" disabled={saving} onClick={save}>
          {saving && <Spinner className="h-3 w-3" />}
          {saving ? "Speichert…" : "Speichern"}
        </button>
        <button className="px-3 py-1.5 text-xs rounded-md text-gray-500 hover:bg-gray-100 transition" disabled={saving} onClick={() => setEditing(false)}>Abbrechen</button>
        <span className="ml-auto text-[11px] text-gray-400 hidden sm:inline">⌘/Strg + Enter zum Speichern</span>
      </div>
    </div>
  );
}
