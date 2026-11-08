import React from "react";

// Shared building blocks for the top-level list pages (Patient:innen, Dokumente,
// Gutscheine) so all three use one layout: a white card whose header holds the
// title or tabs on the left and the primary action plus search on the right,
// followed by a sortable table.

export const thCls = "text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none whitespace-nowrap";
export const thStaticCls = "text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide select-none whitespace-nowrap";
export const theadRowCls = "bg-gray-50 border-b border-gray-100";
export const rowCls = "border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer";
export const tdCls = "px-3 py-3 align-middle";

export function ListCard({ left, actions, children }) {
  return (
    <div className="bg-white rounded-lg border border-[#DFE3EB]">
      <div className="px-3 sm:px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 relative z-10">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto hide-scrollbar">{left}</div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function ListTitle({ children }) {
  return <h2 className="px-1 py-2 text-base font-semibold text-gray-800 whitespace-nowrap">{children}</h2>;
}

export function PrimaryButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition whitespace-nowrap"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

export function ListSearch({ value, onChange, placeholder = "Suchen..." }) {
  return (
    <div className="relative flex-1 sm:flex-none">
      <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <input
        className="pl-8 pr-3 py-1.5 text-xs border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-full sm:w-56"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function DeleteIconButton({ onClick, title = "Löschen" }) {
  return (
    <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title={title} onClick={onClick}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
    </button>
  );
}

export function ListEmpty({ title, hint, children }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {children && <div className="mt-4 flex items-center justify-center gap-3">{children}</div>}
    </div>
  );
}
