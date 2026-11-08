import React, { useState } from "react";
import { fmt, fmtDate } from "../../utils/helpers";
import { computeStatus, VOUCHER_STATUS } from "../../utils/vouchers";
import { ListCard, ListTitle, PrimaryButton, ListSearch, DeleteIconButton, ListEmpty, thCls, theadRowCls, rowCls, tdCls } from "../ui/ListCard";

const STATUS_LABEL = {
  [VOUCHER_STATUS.AKTIV]: { text: "Aktiv", cls: "bg-green-50 text-green-700" },
  [VOUCHER_STATUS.TEIL]: { text: "Teilweise eingelöst", cls: "bg-amber-50 text-amber-700" },
  [VOUCHER_STATUS.EINGELOEST]: { text: "Eingelöst", cls: "bg-gray-100 text-gray-600" },
  [VOUCHER_STATUS.ABGELAUFEN]: { text: "Abgelaufen", cls: "bg-red-50 text-red-700" },
  [VOUCHER_STATUS.STORNIERT]: { text: "Storniert", cls: "bg-gray-100 text-gray-500" },
};

export default function VoucherListView({ vouchers = [], onNew, onView, onDelete }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const today = new Date().toISOString().slice(0, 10);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortIndicator = (key) => (sortKey !== key ? " ↕" : sortDir === "asc" ? " ↑" : " ↓");

  const rows = vouchers.map((v) => ({
    v,
    status: computeStatus(v, today),
    rest: Math.round((v.restwert || 0) * 100) / 100,
    nenn: Math.round((v.nennwert || 0) * 100) / 100,
  }));

  const getters = {
    code: (r) => r.v.code || null,
    purchaser: (r) => r.v.purchaserName || null,
    issued: (r) => r.v.issuedAt || r.v._createdAt || null,
    gueltigBis: (r) => r.v.gueltigBis || null,
    rest: (r) => r.rest,
    status: (r) => (STATUS_LABEL[r.status] || {}).text || null,
  };

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(({ v }) => `${v.code} ${v.purchaserName || ""} ${v.anlass || ""}`.toLowerCase().includes(needle))
    : rows;

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return String(getters.issued(b) || "").localeCompare(String(getters.issued(a) || ""));
    const va = getters[sortKey](a);
    const vb = getters[sortKey](b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "de", { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <ListCard
      left={<ListTitle>Gutscheine</ListTitle>}
      actions={<>
        <PrimaryButton onClick={onNew}>Neuer Gutschein</PrimaryButton>
        {vouchers.length > 0 && <ListSearch value={q} onChange={setQ} placeholder="Code, Käufer:in, Anlass..." />}
      </>}
    >
      {vouchers.length === 0 ? (
        <ListEmpty title="Noch keine Gutscheine erstellt." hint="Geschenk- und Wertgutscheine können auf Behandlungen angerechnet werden." />
      ) : sorted.length === 0 ? (
        <ListEmpty title="Keine Treffer." />
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className={theadRowCls}>
                <th className={thCls} onClick={() => handleSort("code")}>Code{sortIndicator("code")}</th>
                <th className={thCls} onClick={() => handleSort("purchaser")}>Käufer:in{sortIndicator("purchaser")}</th>
                <th className={thCls + " hidden md:table-cell"} onClick={() => handleSort("issued")}>Ausgestellt{sortIndicator("issued")}</th>
                <th className={thCls + " hidden sm:table-cell"} onClick={() => handleSort("gueltigBis")}>Gültig bis{sortIndicator("gueltigBis")}</th>
                <th className={thCls} onClick={() => handleSort("rest")}>Restwert{sortIndicator("rest")}</th>
                <th className={thCls} onClick={() => handleSort("status")}>Status{sortIndicator("status")}</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ v, status, rest, nenn }) => {
                const badge = STATUS_LABEL[status] || STATUS_LABEL[VOUCHER_STATUS.AKTIV];
                const issued = v.issuedAt || v._createdAt;
                return (
                  <tr key={v.id || v.code} className={rowCls} onClick={() => onView(v)}>
                    <td className={tdCls}><span className="text-sm font-mono font-medium text-gray-700 whitespace-nowrap">{v.code}</span></td>
                    <td className={tdCls}><span className="text-sm text-gray-700">{v.purchaserName || "–"}</span></td>
                    <td className={tdCls + " hidden md:table-cell"}><span className="text-sm text-gray-500">{issued ? fmtDate(String(issued).slice(0, 10)) : "–"}</span></td>
                    <td className={tdCls + " hidden sm:table-cell"}><span className="text-sm text-gray-500">{v.gueltigBis ? fmtDate(v.gueltigBis) : "ohne Ablauf"}</span></td>
                    <td className={tdCls}>
                      <span className="text-sm text-gray-700 whitespace-nowrap">{fmt(rest)} €</span>
                      {rest !== nenn && <span className="text-xs text-gray-400 whitespace-nowrap"> von {fmt(nenn)} €</span>}
                    </td>
                    <td className={tdCls}><span className={`px-2.5 py-1 text-xs rounded-full font-medium whitespace-nowrap ${badge.cls}`}>{badge.text}</span></td>
                    <td className="px-5 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DeleteIconButton onClick={() => onDelete(v)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ListCard>
  );
}
