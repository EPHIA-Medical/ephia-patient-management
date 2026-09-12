import React, { useState } from "react";
import { fmtDate } from "../../utils/helpers";
import { showToast } from "../../utils/toast";

export default function PatientBehandlungenSidebar({
  patientBeh, matchingInvoices, patientDbId, patient,
  newBehandlungOpen, setNewBehandlungOpen, newBehDatum, setNewBehDatum, newBehZeit, setNewBehZeit,
  expandedBeh, setExpandedBeh,
  onCreateBehandlung, onDeleteBehandlung, onStartConsent, onNewHV, onCreateInvoice,
  setCenterView, setNewTreatmentBehId,
  onViewConsent, onViewHV, onView,
  setViewingTreatment, setConfirmDeleteBeh,
  hasConsentRisks, getDocLabel, getDocStatus, handleDocClick,
  onLinkDocToBehandlung, onDelete,
}) {
  const [dragOverBehId, setDragOverBehId] = useState(null);

  const handleDragStart = (e, doc) => {
    e.dataTransfer.setData("text/plain", doc._supabaseId || doc.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, behId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverBehId !== behId) setDragOverBehId(behId);
  };

  const handleDragLeave = (e, behId) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX, y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverBehId(null);
    }
  };

  const handleDrop = (e, behId) => {
    e.preventDefault();
    setDragOverBehId(null);
    const docId = e.dataTransfer.getData("text/plain");
    if (docId && behId && onLinkDocToBehandlung) {
      onLinkDocToBehandlung(docId, behId);
    }
  };

  const standaloneDocs = matchingInvoices.filter(inv => !inv._behandlungId);

  return (
    <div className="flex-1 min-w-0">
      {/* Header with + button */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Behandlungen ({patientBeh.length})</h3>
        <button className="text-sm text-blue-500 hover:text-blue-700 font-medium transition" onClick={() => setNewBehandlungOpen(true)}>+ Neue Behandlung</button>
      </div>

      {/* New Behandlung form */}
      {newBehandlungOpen && (
        <div className="mx-5 my-3 p-4 border border-blue-100 rounded-lg bg-blue-50/50">
          <div className="text-sm font-semibold text-gray-700 mb-3">Neue Behandlung</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Datum</label>
              <input type="date" value={newBehDatum} onChange={e => setNewBehDatum(e.target.value)} className="w-full border rounded-md px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Uhrzeit (optional)</label>
              <input type="time" value={newBehZeit} onChange={e => setNewBehZeit(e.target.value)} className="w-full border rounded-md px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm rounded-md bg-gray-800 text-white hover:bg-gray-700 transition" onClick={async () => {
              if (!newBehDatum) return;
              try {
                const newId = await onCreateBehandlung(patientDbId, { datum: newBehDatum, zeit: newBehZeit || "", status: "planned" });
                setNewBehandlungOpen(false);
                setNewBehDatum(new Date().toISOString().slice(0, 10));
                setNewBehZeit("");
                if (newId) setExpandedBeh(newId);
              } catch (e) { showToast("Fehler: " + e.message, { error: true }); }
            }}>Erstellen</button>
            <button className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition" onClick={() => setNewBehandlungOpen(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* Behandlung cards */}
      {patientBeh.length === 0 && !newBehandlungOpen && (
        <div className="text-center py-12 text-gray-400 text-sm px-5">Noch keine Behandlungen vorhanden.</div>
      )}

      <div className="px-4 py-3">
        {patientBeh.map(beh => {
          const behDocs = matchingInvoices.filter(inv => inv._behandlungId === beh._id);
          const isExpanded = expandedBeh === beh._id;
          const isDragOver = dragOverBehId === beh._id;
          return (
            <div
              key={beh._id}
              className={`mb-3 border rounded-lg overflow-hidden bg-white transition-colors ${isDragOver ? "border-blue-400 bg-blue-50/30 ring-2 ring-blue-200" : "border-[#DFE3EB]"}`}
              onDragOver={(e) => handleDragOver(e, beh._id)}
              onDragLeave={(e) => handleDragLeave(e, beh._id)}
              onDrop={(e) => handleDrop(e, beh._id)}
            >
              <button className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition" onClick={() => setExpandedBeh(isExpanded ? null : beh._id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{fmtDate(beh.datum)}</span>
                  {beh.zeit && <span className="text-sm text-gray-500">{beh.zeit} Uhr</span>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{behDocs.length} Dok.</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100">
                  {behDocs.length === 0 && (
                    <div className="px-4 py-5 text-center text-gray-400 text-sm">Noch keine Dokumente in dieser Behandlung.</div>
                  )}
                  {behDocs.map(doc => {
                    const status = getDocStatus(doc);
                    return (
                      <div key={doc._supabaseId || doc.id} role="button" tabIndex={0} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition border-b border-gray-50 last:border-b-0 cursor-pointer" onClick={() => handleDocClick(doc)} onKeyDown={(e) => { if (e.key === "Enter") handleDocClick(doc); }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-sm text-gray-400">{"\u{1F4C4}"}</span>
                          <span className="text-sm text-gray-700">{getDocLabel(doc)}</span>
                          {doc.invoiceMeta?.nummer && doc.invoiceMeta.nummer !== "\u2014" && <span className="text-xs text-gray-400">#{doc.invoiceMeta.nummer}</span>}
                          {status.risk && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Risiko</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs ${status.color} inline-flex items-center gap-1`}>{status.done && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}{status.label}</span>
                          {onDelete && (
                            <button
                              className="p-1 text-gray-300 hover:text-red-500 transition"
                              title="Dokument löschen"
                              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Add document to Behandlung */}
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { onStartConsent && onStartConsent(patient, beh._id); }}>+ Aufkl&auml;rung</button>
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { onNewHV && onNewHV(beh._id); }}>+ HV</button>
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { if (setNewTreatmentBehId) setNewTreatmentBehId(beh._id); setCenterView("behandlungen_add"); }}>+ Behandlungsdoku</button>
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { onCreateInvoice && onCreateInvoice(patient, beh._id); }}>+ Rechnung</button>
                  </div>
                  {/* Delete Behandlung */}
                  <div className="px-4 py-2.5 border-t border-gray-100 flex justify-end">
                    <button className="text-xs text-red-400 hover:text-red-600" onClick={() => setConfirmDeleteBeh(beh)}>Behandlung l&ouml;schen</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Standalone documents (draggable) */}
      {standaloneDocs.length > 0 && (
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 px-1 flex items-center gap-2">
            Einzelne Dokumente
            {patientBeh.length > 0 && <span className="text-[10px] font-normal normal-case tracking-normal text-gray-300">Drag &amp; Drop in Behandlung</span>}
          </div>
          {standaloneDocs.map(doc => {
            const status = getDocStatus(doc);
            return (
              <div
                key={doc._supabaseId || doc.id}
                draggable={!!doc._supabaseId && patientBeh.length > 0}
                onDragStart={(e) => handleDragStart(e, doc)}
                className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition border-b border-gray-50 ${doc._supabaseId && patientBeh.length > 0 ? "cursor-grab active:cursor-grabbing" : ""}`}
                onClick={() => handleDocClick(doc)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {doc._supabaseId && patientBeh.length > 0 && (
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  )}
                  <span className="text-sm text-gray-400">{"\u{1F4C4}"}</span>
                  <span className="text-sm text-gray-700">{getDocLabel(doc)}</span>
                  {doc.invoiceMeta?.nummer && doc.invoiceMeta.nummer !== "\u2014" && <span className="text-xs text-gray-400">#{doc.invoiceMeta.nummer}</span>}
                  {doc.invoiceMeta?.datum && <span className="text-xs text-gray-400">{fmtDate(doc.invoiceMeta.datum)}</span>}
                  {status.risk && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Risiko</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs ${status.color} inline-flex items-center gap-1`}>{status.done && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}{status.label}</span>
                  {onDelete && (
                    <button
                      className="p-1 text-gray-300 hover:text-red-500 transition"
                      title="Dokument löschen"
                      onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
