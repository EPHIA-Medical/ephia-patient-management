import React, { useState, useMemo } from "react";
import { fmtDate } from "../../utils/helpers";
import Select from "../ui/Select";

export default function PatientTimeline({
  patient, patientDbId, matchingInvoices, patientBeh, activityLog, lastActivity,
  onViewConsent, onViewHV, onView,
  setViewingTreatment, setCenterView, onClose,
}) {
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("alle");

  // Build timeline entries from activity log + legacy invoices/behandlungen
  const buildTimeline = useMemo(() => {
    const patientActivities = (activityLog || []).filter(a => a._patientId === patientDbId);
    const trackedEntityIds = new Set(patientActivities.map(a => a.entityId));
    const legacyEntries = matchingInvoices
      .filter(inv => inv._supabaseId && !trackedEntityIds.has(inv._supabaseId))
      .map(inv => ({
        _id: `legacy-${inv._supabaseId}`,
        entityType: inv._docType || (inv._consentForm ? "aufklaerung" : inv._hvOnly ? "hv" : inv._standalone ? "behandlungsdoku" : "rechnung"),
        entityId: inv._supabaseId,
        actionType: "created",
        description: `${inv._consentForm || inv._docType === "aufklaerung" ? "Aufklärungsbogen" : inv._hvOnly || inv._docType === "hv" ? "Honorarvereinbarung" : inv._standalone || inv._docType === "behandlungsdoku" ? "Behandlungsdoku" : "Rechnung"} erstellt${inv.invoiceMeta?.nummer && inv.invoiceMeta.nummer !== "\u2014" ? ` (${inv.invoiceMeta.nummer})` : ""}`,
        _createdAt: inv._createdAt || inv.savedAt,
        _inv: inv,
      }));
    const trackedBehIds = new Set(patientActivities.filter(a => a.entityType === "behandlung").map(a => a.entityId));
    const legacyBeh = patientBeh
      .filter(b => b._id && !trackedBehIds.has(b._id))
      .map(b => ({
        _id: `legacy-beh-${b._id}`,
        entityType: "behandlung",
        entityId: b._id,
        actionType: "created",
        description: `Behandlung am ${fmtDate(b.datum)} erstellt`,
        _createdAt: b._createdAt,
      }));
    return [...patientActivities, ...legacyEntries, ...legacyBeh]
      .sort((a, b) => (b._createdAt || "").localeCompare(a._createdAt || ""));
  }, [activityLog, patientDbId, matchingInvoices, patientBeh]);

  const filteredTimeline = buildTimeline.filter(entry => {
    if (timelineFilter !== "alle" && entry.entityType !== timelineFilter) return false;
    if (timelineSearch && !(entry.description || "").toLowerCase().includes(timelineSearch.toLowerCase())) return false;
    return true;
  });

  const groupedTimeline = {};
  for (const entry of filteredTimeline) {
    const date = entry._createdAt ? new Date(entry._createdAt) : new Date();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    if (!groupedTimeline[key]) groupedTimeline[key] = { label, entries: [] };
    groupedTimeline[key].entries.push(entry);
  }

  const entityIcon = (type) => {
    switch(type) {
      case "aufklaerung": return "\u{1F4CB}";
      case "hv": return "\u{1F4DD}";
      case "behandlungsdoku": return "\u{1F489}";
      case "rechnung": return "\u{1F4C4}";
      case "behandlung": return "\u{1F5D3}";
      case "patient": return "\u{1F464}";
      default: return "\u{1F4CC}";
    }
  };

  const entityActionColor = (action) => {
    switch(action) {
      case "created": return "text-green-600";
      case "updated": return "text-blue-600";
      case "deleted": return "text-red-500";
      default: return "text-gray-600";
    }
  };

  const handleTimelineClick = (entry) => {
    const inv = entry._inv || (entry.entityId && matchingInvoices.find(i => i._supabaseId === entry.entityId));
    // Opening a document closes the drawer so the document is not hidden behind it
    if (inv && onClose) onClose();
    if (entry._inv) {
      const inv = entry._inv;
      if (inv._consentForm || inv._docType === "aufklaerung") { onViewConsent && onViewConsent(inv); }
      else if (inv._hvOnly || inv._docType === "hv") { onViewHV && onViewHV(inv); }
      else if (inv._standalone || inv._docType === "behandlungsdoku") { setViewingTreatment(inv); setCenterView("behandlung_detail"); }
      else { onView && onView(inv); }
    } else if (entry.entityId) {
      const inv = matchingInvoices.find(i => i._supabaseId === entry.entityId);
      if (inv) {
        if (inv._consentForm || inv._docType === "aufklaerung") { onViewConsent && onViewConsent(inv); }
        else if (inv._hvOnly || inv._docType === "hv") { onViewHV && onViewHV(inv); }
        else if (inv._standalone || inv._docType === "behandlungsdoku") { setViewingTreatment(inv); setCenterView("behandlung_detail"); }
        else { onView && onView(inv); }
      }
    }
  };

  return (
    <>
      {/* Timeline header */}
      <div className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Historie</h3>
          {onClose && (
            <button className="p-1 -mr-1 text-gray-400 hover:text-gray-600 transition" onClick={onClose} aria-label="Historie schließen">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input type="text" placeholder="Durchsuchen..." className="w-full border border-[#DFE3EB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={timelineSearch} onChange={e => setTimelineSearch(e.target.value)} />
          <Select className="w-full border border-[#DFE3EB] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" value={timelineFilter} onChange={e => setTimelineFilter(e.target.value)}>
            <option value="alle">Alle</option>
            <option value="aufklaerung">Aufkl&auml;rung</option>
            <option value="hv">HV</option>
            <option value="behandlungsdoku">Behandlungsdoku</option>
            <option value="rechnung">Rechnung</option>
            <option value="behandlung">Behandlung</option>
            <option value="patient">Patient</option>
          </Select>
        </div>
      </div>

      {/* Timeline entries grouped by month */}
      <div>
        {Object.keys(groupedTimeline).length === 0 && (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">Noch keine Aktivit&auml;ten vorhanden.</div>
        )}
        {Object.keys(groupedTimeline).sort().reverse().map(key => {
          const group = groupedTimeline[key];
          return (
            <div key={key}>
              <div className="px-5 py-2.5 bg-gray-50/70 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
              </div>
              {group.entries.map(entry => (
                <div key={entry._id || entry.entityId || Math.random()} className="flex gap-3 py-3 px-5 hover:bg-gray-50 transition cursor-pointer border-b border-gray-50" onClick={() => handleTimelineClick(entry)}>
                  <span className="text-base flex-shrink-0 mt-0.5">{entityIcon(entry.entityType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{entry.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{entry._createdAt ? new Date(entry._createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                  </div>
                  <span className={`text-xs flex-shrink-0 mt-0.5 ${entityActionColor(entry.actionType)}`}>
                    {entry.actionType === "created" ? "Erstellt" : entry.actionType === "updated" ? "Aktualisiert" : entry.actionType === "deleted" ? "Gelöscht" : ""}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
