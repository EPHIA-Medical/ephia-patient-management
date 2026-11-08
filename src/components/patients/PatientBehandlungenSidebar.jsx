import React, { useState } from "react";
import { fmtDate } from "../../utils/helpers";
import { showToast } from "../../utils/toast";
import NoteEditor from "./NoteEditor";
import { spawnConfetti } from "../ui/ConfettiBurst";

export default function PatientBehandlungenSidebar({
  patientBeh, matchingInvoices, patientDbId, patient,
  newBehandlungOpen, setNewBehandlungOpen, newBehDatum, setNewBehDatum, newBehZeit, setNewBehZeit,
  expandedBeh, setExpandedBeh,
  onCreateBehandlung, onDeleteBehandlung, onUpdateBehandlung, onStartConsent, onNewHV, onCreateInvoice, onAddBehandlungsdoku,
  setCenterView, setNewTreatmentBehId,
  onViewConsent, onViewHV, onView,
  setViewingTreatment, setConfirmDeleteBeh,
  hasConsentRisks, getDocLabel, getDocStatus, handleDocClick,
  onLinkDocToBehandlung, onDelete, titleSuggestions = [], onSetPaymentStatus, hideHeader = false,
}) {
  // Rechnung: the payment status is a toggle (Ausstehend ⇄ Bezahlt); other documents show plain status text
  const renderStatus = (doc, status) => (status.payment && onSetPaymentStatus ? (
    <button
      type="button"
      title={status.paid ? `Bezahlt${status.paidAt ? ` am ${fmtDate(status.paidAt)}` : ""}. Klicken, um als ausstehend zu markieren` : "Als bezahlt markieren (Zahlungseingang heute)"}
      className={`text-xs px-2 py-0.5 rounded-full font-medium transition ${status.paid ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!status.paid) spawnConfetti(e.currentTarget);
        onSetPaymentStatus(doc, status.paid ? "ausstehend" : "bezahlt");
      }}
    >
      {status.label}
    </button>
  ) : (
    <span className={`text-xs ${status.color} inline-flex items-center gap-1`}>{status.done && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}{status.label}</span>
  ));
  const [dragOverBehId, setDragOverBehId] = useState(null);
  // Inline editing of a Behandlungstermin (date + time)
  const [editingBehId, setEditingBehId] = useState(null);
  const [editDatum, setEditDatum] = useState("");
  const [editZeit, setEditZeit] = useState("");
  const [editTitel, setEditTitel] = useState("");
  const [newBehTitel, setNewBehTitel] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // Free-text note per Behandlung (stored in the encrypted Behandlung payload)
  const [noteEditingBehId, setNoteEditingBehId] = useState(null);
  const saveBehNote = async (beh, text) => {
    const data = Object.fromEntries(Object.entries(beh).filter(([k]) => !k.startsWith("_")));
    await onUpdateBehandlung(beh._id, { ...data, notiz: text });
  };

  const startEditBeh = (beh) => {
    setEditDatum(beh.datum || "");
    setEditZeit(beh.zeit || "");
    setEditTitel(beh.titel || "");
    setEditingBehId(beh._id);
  };
  const saveEditBeh = async (beh) => {
    if (!editDatum || editSaving) return;
    // Persist the decrypted payload without the runtime `_` fields
    const data = Object.fromEntries(Object.entries(beh).filter(([k]) => !k.startsWith("_")));
    setEditSaving(true);
    try {
      await onUpdateBehandlung(beh._id, { ...data, datum: editDatum, zeit: editZeit || "", titel: editTitel.trim() });
      setEditingBehId(null);
    } catch (e) { showToast("Fehler: " + e.message, { error: true }); }
    finally { setEditSaving(false); }
  };

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

  // A Rechnung above 3,5-fach carries its Honorarvereinbarung inside the same document
  // (shown as a tab). List it as a row of its own so it is visible in the Behandlung.
  const hasEmbeddedHv = (inv) => getDocLabel(inv) === "Rechnung" && !inv._fromHvId
    && (inv.hasHV != null ? !!inv.hasHV : (inv.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5));
  const embeddedHvStatus = (inv) => {
    const sigs = inv._signatures;
    if (inv._signedHvUpload) return { label: "Hochgeladen", color: "text-green-600", done: true };
    if (sigs?.patient && sigs?.doctor) return { label: "Unterschrieben", color: "text-green-600", done: true };
    if (sigs?.patient) return { label: "Ärzt:in fehlt", color: "text-amber-500" };
    return { label: "Nicht unterschrieben", color: "text-amber-500" };
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header with + button (the patient page shows its own tab header instead) */}
      {!hideHeader && <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Behandlungen ({patientBeh.length})</h3>
        <button className="text-sm text-blue-500 hover:text-blue-700 font-medium transition" onClick={() => setNewBehandlungOpen(true)}>+ Neue Behandlung</button>
      </div>}

      {/* Suggestions for the Behandlung title: titles used before */}
      <datalist id="beh-titel-suggestions">
        {titleSuggestions.map((t) => <option key={t} value={t} />)}
      </datalist>

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
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Titel (optional)</label>
              <input type="text" list="beh-titel-suggestions" maxLength={80} value={newBehTitel} onChange={e => setNewBehTitel(e.target.value)} placeholder="z.B. Botulinum Stirn + Glabella" className="w-full border rounded-md px-3 py-1.5 text-sm bg-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm rounded-md bg-gray-800 text-white hover:bg-gray-700 transition" onClick={async () => {
              if (!newBehDatum) return;
              try {
                const newId = await onCreateBehandlung(patientDbId, { datum: newBehDatum, zeit: newBehZeit || "", titel: newBehTitel.trim(), status: "planned" });
                setNewBehandlungOpen(false);
                setNewBehDatum(new Date().toISOString().slice(0, 10));
                setNewBehZeit("");
                setNewBehTitel("");
                if (newId) setExpandedBeh(newId);
              } catch (e) { showToast("Fehler: " + e.message, { error: true }); }
            }}>Erstellen</button>
            <button className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition" onClick={() => { setNewBehandlungOpen(false); setNewBehTitel(""); }}>Abbrechen</button>
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
          const embeddedHvs = behDocs.filter(hasEmbeddedHv);
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
                  <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{fmtDate(beh.datum)}</span>
                  {beh.zeit && <span className="text-sm text-gray-500 flex-shrink-0">{beh.zeit} Uhr</span>}
                  {beh.titel && <span className="text-sm text-gray-600 truncate" title={beh.titel}>{beh.titel}</span>}
                  {beh.notiz && (
                    <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Hat eine Notiz"><title>Hat eine Notiz</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 8l-3 1 1-3V6a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H9l-2 2z" /></svg>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{behDocs.length + embeddedHvs.length} Dok.</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Behandlungstermin: editable in place */}
                  <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/60">
                    {editingBehId === beh._id ? (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div>
                          <label className="text-[10px] text-gray-500 block mb-0.5">Datum</label>
                          <input type="date" value={editDatum} onChange={(e) => setEditDatum(e.target.value)} className="border border-[#DFE3EB] rounded-md px-2 py-1 text-sm bg-white" style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block mb-0.5">Uhrzeit</label>
                          <input type="time" value={editZeit} onChange={(e) => setEditZeit(e.target.value)} className="border border-[#DFE3EB] rounded-md px-2 py-1 text-sm bg-white" style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }} />
                        </div>
                        <div className="flex-1 min-w-[10rem]">
                          <label className="text-[10px] text-gray-500 block mb-0.5">Titel</label>
                          <input type="text" list="beh-titel-suggestions" maxLength={80} value={editTitel} onChange={(e) => setEditTitel(e.target.value)} placeholder="optional" className="w-full border border-[#DFE3EB] rounded-md px-2 py-1 text-sm bg-white" onKeyDown={(e) => { if (e.key === "Enter") saveEditBeh(beh); if (e.key === "Escape") setEditingBehId(null); }} />
                        </div>
                        <button className="px-2.5 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50" disabled={!editDatum || editSaving} onClick={() => saveEditBeh(beh)}>{editSaving ? "Speichert…" : "Speichern"}</button>
                        <button className="px-2.5 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition" disabled={editSaving} onClick={() => setEditingBehId(null)}>Abbrechen</button>
                        <p className="w-full text-[10px] text-gray-400">Das Datum einer zugeordneten Behandlungsdoku wird mit angepasst, Rechnungen und Aufklärungen nicht.</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Termin: {fmtDate(beh.datum)}{beh.zeit ? `, ${beh.zeit} Uhr` : ""}</span>
                        {onUpdateBehandlung && (
                          <button className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition" title="Termin und Titel bearbeiten" onClick={() => startEditBeh(beh)}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        )}
                        {onUpdateBehandlung && !beh.notiz && noteEditingBehId !== beh._id && (
                          <button className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-medium transition" onClick={() => setNoteEditingBehId(beh._id)}>+ Notiz</button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Note for this Behandlung */}
                  {(beh.notiz || noteEditingBehId === beh._id) && (
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Notiz</span>
                        {noteEditingBehId !== beh._id && onUpdateBehandlung && (
                          <button className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition" title="Notiz bearbeiten" onClick={() => setNoteEditingBehId(beh._id)}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        )}
                      </div>
                      {noteEditingBehId === beh._id ? (
                        <NoteEditor
                          value={beh.notiz || ""}
                          editing
                          setEditing={(v) => setNoteEditingBehId(v ? beh._id : null)}
                          rows={3}
                          placeholder="z.B. Verlauf, Absprachen, nächste Schritte …"
                          onSave={(text) => saveBehNote(beh, text)}
                        />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{beh.notiz}</p>
                      )}
                    </div>
                  )}
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
                          {renderStatus(doc, status)}
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
                  {embeddedHvs.map((inv) => {
                    const status = embeddedHvStatus(inv);
                    return (
                      <div
                        key={"hv-" + (inv._supabaseId || inv.id)}
                        role="button"
                        tabIndex={0}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition border-b border-gray-50 cursor-pointer"
                        onClick={() => onViewHV && onViewHV(inv)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onViewHV && onViewHV(inv); } }}
                        title="Honorarvereinbarung zu dieser Rechnung öffnen"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-sm text-gray-400">{"\u{1F4C4}"}</span>
                          <span className="text-sm text-gray-700">Honorarvereinbarung</span>
                          {inv.invoiceMeta?.nummer && inv.invoiceMeta.nummer !== "\u2014" && <span className="text-xs text-gray-400">zu #{inv.invoiceMeta.nummer}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs ${status.color} inline-flex items-center gap-1`}>{status.done && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}{status.label}</span>
                          {/* Same width as the delete button of the other rows; this HV is deleted with its Rechnung */}
                          {onDelete && <span className="w-6" />}
                        </div>
                      </div>
                    );
                  })}
                  {/* Add document to Behandlung */}
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { onStartConsent && onStartConsent(patient, beh._id); }}>+ Aufkl&auml;rung</button>
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { onNewHV && onNewHV(beh._id); }}>+ HV</button>
                    <button className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => { if (onAddBehandlungsdoku) { onAddBehandlungsdoku(beh); return; } if (setNewTreatmentBehId) setNewTreatmentBehId(beh._id); setCenterView("behandlungen_add"); }}>+ Behandlungsdoku</button>
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
                  {renderStatus(doc, status)}
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
