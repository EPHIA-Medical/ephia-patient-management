import React, { useState } from "react";
import { fmtDate } from "../../utils/helpers";
import { invoiceGesamt } from "../../utils/invoiceTotals";
import { spawnConfetti } from "../ui/ConfettiBurst";

const fmtEuro = (n) => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// Date of the Zahlungseingang under the paid button; click to change it
function PaidDate({ inv, onChange }) {
  const [editing, setEditing] = useState(false);
  if (!onChange) return inv.paidAt ? <span className="text-[11px] text-gray-400">am {fmtDate(inv.paidAt)}</span> : null;
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={inv.paidAt || ""}
        className="border border-[#DFE3EB] rounded px-1.5 py-0.5 text-xs bg-white"
        style={{ colorScheme: "light" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { e.currentTarget.dataset.cancel = "1"; e.currentTarget.blur(); }
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value;
          setEditing(false);
          if (e.currentTarget.dataset.cancel || !v || v === inv.paidAt) return;
          onChange(v);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="text-[11px] text-gray-400 hover:text-blue-600 hover:underline"
      title="Datum des Zahlungseingangs ändern"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {inv.paidAt ? `am ${fmtDate(inv.paidAt)}` : "Datum eintragen"}
    </button>
  );
}

// Rechnungen of one patient: open/paid totals, one row per Rechnung with a
// payment toggle. Clicking a row opens the Rechnung (modal on the patient page).
export default function PatientInvoicesTab({ invoices, behandlungen, kleinunternehmer, onView, onSetPaymentStatus }) {
  const rows = invoices
    .map((inv) => ({ inv, gesamt: invoiceGesamt(inv, kleinunternehmer), paid: inv.paymentStatus === "bezahlt" }))
    .sort((a, b) => (b.inv.invoiceMeta?.datum || b.inv.savedAt || "").localeCompare(a.inv.invoiceMeta?.datum || a.inv.savedAt || ""));
  const offen = rows.filter((r) => !r.paid).reduce((s, r) => s + r.gesamt, 0);
  const bezahlt = rows.filter((r) => r.paid).reduce((s, r) => s + r.gesamt, 0);
  const behById = new Map((behandlungen || []).map((b) => [b._id, b]));

  if (rows.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm px-5">Noch keine Rechnungen vorhanden.</div>;
  }

  return (
    <div>
      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-gray-100">
        <div className="rounded-lg bg-amber-50/70 px-4 py-3">
          <div className="text-xs text-amber-700/80 font-medium">Offen</div>
          <div className="text-base font-semibold text-amber-800 mt-0.5">{fmtEuro(offen)}</div>
        </div>
        <div className="rounded-lg bg-green-50/70 px-4 py-3">
          <div className="text-xs text-green-700/80 font-medium">Bezahlt</div>
          <div className="text-base font-semibold text-green-800 mt-0.5">{fmtEuro(bezahlt)}</div>
        </div>
      </div>

      {/* Rows */}
      <ul>
        {rows.map(({ inv, gesamt, paid }) => {
          const beh = inv._behandlungId ? behById.get(inv._behandlungId) : null;
          const nr = inv.invoiceMeta?.nummer && inv.invoiceMeta.nummer !== "—" ? inv.invoiceMeta.nummer : null;
          return (
            <li key={inv._supabaseId || inv.id} className="border-b border-gray-50 last:border-b-0">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition cursor-pointer"
                onClick={() => onView && onView(inv)}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onView && onView(inv); } }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{nr ? `Rechnung ${nr}` : "Rechnung"}</span>
                    <span className="text-xs text-gray-400">{fmtDate(inv.invoiceMeta?.datum)}</span>
                  </div>
                  {beh && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Behandlung {fmtDate(beh.datum)}{beh.titel ? ` · ${beh.titel}` : ""}
                    </div>
                  )}
                </div>
                <span className="text-sm text-gray-700 tabular-nums flex-shrink-0">{fmtEuro(gesamt)}</span>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                {onSetPaymentStatus ? (
                  <button
                    type="button"
                    title={paid ? `Bezahlt${inv.paidAt ? ` am ${fmtDate(inv.paidAt)}` : ""}. Klicken, um als ausstehend zu markieren` : "Als bezahlt markieren (Zahlungseingang heute)"}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition flex-shrink-0 ${paid ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
                    style={{ minWidth: 84 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!paid) spawnConfetti(e.currentTarget);
                      onSetPaymentStatus(inv, paid ? "ausstehend" : "bezahlt");
                    }}
                  >
                    {paid ? "Bezahlt" : "Ausstehend"}
                  </button>
                ) : (
                  <span className={`text-xs flex-shrink-0 ${paid ? "text-green-600" : "text-amber-500"}`}>{paid ? "Bezahlt" : "Ausstehend"}</span>
                )}
                {paid && <PaidDate inv={inv} onChange={onSetPaymentStatus ? (date) => onSetPaymentStatus(inv, "bezahlt", date) : null} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
