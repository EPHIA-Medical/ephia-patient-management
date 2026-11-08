import React, { useEffect, useState } from "react";

// Hands Rechnung and Behandlungsdokumentation to the device's share sheet as separate
// files in one go. The PDFs are built when the dialog opens, so the share call itself
// runs directly inside the click (Safari drops the share permission after async work).
// Without file sharing (most desktop browsers) the selected files are downloaded.
export default function SendToPatientDialog({ docs, makeFile, onClose, onDone }) {
  const [selected, setSelected] = useState(() => Object.fromEntries(docs.map((d) => [d.key, true])));
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = {};
        // Sequential: the PDF capture temporarily changes styles of hidden elements.
        for (const d of docs) out[d.key] = await makeFile(d.elementId, d.filename);
        if (!cancelled) setFiles(out);
      } catch (e) {
        console.error("Preparing PDFs failed:", e);
        if (!cancelled) setError("PDFs konnten nicht erstellt werden.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = files ? docs.filter((d) => selected[d.key] && files[d.key]).map((d) => files[d.key]) : [];
  const canShareFiles = chosen.length > 0 && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: chosen });

  const send = async () => {
    if (!chosen.length) return;
    const types = docs.filter((d) => selected[d.key]).map((d) => d.key);
    if (canShareFiles) {
      try {
        await navigator.share({ files: chosen });
        onDone("shared", types);
        onClose();
      } catch (e) {
        if (e.name !== "AbortError") { console.error("Share failed:", e); setError("Teilen ist fehlgeschlagen. Du kannst die Dateien stattdessen herunterladen."); }
      }
      return;
    }
    for (const f of chosen) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    onDone("downloaded", types);
    onClose();
  };

  return (
    <div data-doc-modal-inner-dialog className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="send-patient-title" className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 id="send-patient-title" className="text-base font-semibold text-gray-800">An Patient:in senden</h3>
          <button aria-label="Schließen" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">Die Dokumente werden als einzelne PDF-Dateien übergeben.</p>
          {docs.map((d) => (
            <label key={d.key} className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={!!selected[d.key]} onChange={(e) => setSelected({ ...selected, [d.key]: e.target.checked })} />
              <span className="text-sm text-gray-700">{d.label}</span>
            </label>
          ))}
          <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2 leading-relaxed">
            Versand per E-Mail oder Messenger bitte nur auf ausdrücklichen Wunsch der Patient:in. Dokumentiere den Wunsch in der Patient:innenakte.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 transition" onClick={onClose}>Abbrechen</button>
          <button
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!files || !chosen.length}
            onClick={send}
          >
            {!files && !error ? "Wird vorbereitet…" : canShareFiles ? "Teilen" : "Herunterladen"}
          </button>
        </div>
      </div>
    </div>
  );
}
