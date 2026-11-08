import React, { useEffect, useState } from "react";
import { sendSecureShare, listShares, revokeShare } from "../../lib/shareApi";
import { generateCode, normalizeDob } from "../../lib/shareCrypto";
import CopyButton from "../ui/CopyButton";

// Sends documents to the patient. Two ways:
//  - "Per E-Mail" (when `secure` is given): the PDFs are encrypted in this browser and
//    the patient gets a protected link, opened with the date of birth or a code
//    (src/lib/shareApi.js, api/src/app/api/shares). No health data in the email.
//  - "Teilen oder herunterladen": the device's share sheet or plain downloads, as before.
// The PDFs are built when the dialog opens, so a share call runs directly inside the
// click (Safari drops the share permission after async work).
//
// docs:   [{ key: "rechnung"|"behandlung"|…, label, elementId, filename, ref }]
// secure: { token, email, firstName, dob, practice: { name, email, phone } } (optional)

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

function shareStatus(s) {
  if (s.revoked_at) return { text: "Widerrufen", tone: "gray" };
  if (s.delivery_status === "bounced" || s.delivery_status === "failed") return { text: "Zustellung fehlgeschlagen", tone: "red" };
  if (s.locked_at) return { text: "Gesperrt (5 Fehlversuche)", tone: "red" };
  if (!s.active || Date.parse(s.expires_at) <= Date.now()) return { text: "Abgelaufen", tone: "gray" };
  if (s.opened_at) return { text: `Geöffnet am ${fmtDate(s.opened_at)}`, tone: "green" };
  return { text: "Noch nicht geöffnet", tone: "amber" };
}
const toneCls = { green: "bg-green-50 text-green-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", gray: "bg-gray-100 text-gray-500" };

export default function SendToPatientDialog({ docs, makeFile, onClose, onDone, secure }) {
  const [mode, setMode] = useState(secure ? "email" : "share");
  const [selected, setSelected] = useState(() => Object.fromEntries(docs.map((d) => [d.key, true])));
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");

  // Secure sending
  const knownDob = secure ? normalizeDob(secure.dob) : "";
  const [email, setEmail] = useState(secure?.email || "");
  const [factorType, setFactorType] = useState(knownDob ? "dob" : "dob");
  const [dobInput, setDobInput] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { recipient_masked, expires_at, code? }
  const [shares, setShares] = useState(null);
  // Email sending needs the API set up (migration, keys); until then only share/download
  const [secureReady, setSecureReady] = useState(!!secure);

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

  const refs = docs.map((d) => d.ref).filter(Boolean);
  const loadShares = () => {
    if (!secure?.token) return;
    listShares(secure.token, refs).then((r) => setShares(r.shares || [])).catch((e) => {
      setShares([]);
      if (e.status === 503 || e.status === 0 || e.status >= 500 || e.status === 404) { setSecureReady(false); setMode("share"); }
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadShares, []);

  const chosenDocs = docs.filter((d) => selected[d.key]);
  const chosen = files ? chosenDocs.filter((d) => files[d.key]).map((d) => files[d.key]) : [];
  const canShareFiles = chosen.length > 0 && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: chosen });

  const share = async () => {
    if (!chosen.length) return;
    const types = chosenDocs.map((d) => d.key);
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

  const dobValue = knownDob || normalizeDob(dobInput);
  const emailOk = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/.test(email.trim());
  const factorOk = factorType === "code" || !!dobValue;
  const canSendSecure = !!files && chosen.length > 0 && emailOk && factorOk && !sending && !!secure?.practice?.name;

  const sendEmail = async () => {
    if (!canSendSecure) return;
    setSending(true); setError("");
    try {
      const code = factorType === "code" ? generateCode() : "";
      const res = await sendSecureShare({
        token: secure.token,
        files: chosenDocs.map((d) => ({ kind: d.key, ref: d.ref, label: d.label, file: files[d.key] })),
        factor: { type: factorType, value: factorType === "code" ? code : dobValue },
        recipient: { email: email.trim(), first_name: secure.firstName || "" },
        practice: secure.practice,
        message,
      });
      setResult({ ...res, code });
      onDone("emailed", chosenDocs.map((d) => d.key), { factor: factorType });
      loadShares();
    } catch (e) {
      setError(e.message || "Senden ist fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  };

  const revoke = async (id) => {
    try { await revokeShare(secure.token, id); loadShares(); } catch (e) { setError(e.message); }
  };

  const tabBtn = (v, label) => (
    <button type="button" className={`px-3 py-1.5 text-xs rounded-md transition ${mode === v ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500 hover:text-gray-800"}`} onClick={() => { setMode(v); setError(""); }}>{label}</button>
  );
  const inputCls = "w-full border border-[#DFE3EB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div data-doc-modal-inner-dialog className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="send-patient-title" className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 id="send-patient-title" className="text-sm font-semibold text-gray-800">An Patient:in senden</h3>
          <button aria-label="Schließen" className="p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" onClick={onClose}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {secure && secureReady && !result && (
            <div className="inline-flex p-0.5 rounded-lg bg-gray-100">
              {tabBtn("email", "Per E-Mail")}
              {tabBtn("share", "Teilen oder herunterladen")}
            </div>
          )}

          {!result && (
            <div className="space-y-1.5">
              {docs.map((d) => (
                <label key={d.key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={!!selected[d.key]} onChange={(e) => setSelected({ ...selected, [d.key]: e.target.checked })} />
                  <span className="text-sm text-gray-700">{d.label}</span>
                </label>
              ))}
            </div>
          )}

          {mode === "email" && secure && secureReady && !result && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-Mail der Patient:in</label>
                <input type="email" className={inputCls} value={email} placeholder="name@beispiel.de" onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Öffnen mit</label>
                <div className="inline-flex p-0.5 rounded-lg bg-gray-100 mb-2">
                  <button type="button" className={`px-3 py-1 text-xs rounded-md transition ${factorType === "dob" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`} onClick={() => setFactorType("dob")}>Geburtsdatum</button>
                  <button type="button" className={`px-3 py-1 text-xs rounded-md transition ${factorType === "code" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`} onClick={() => setFactorType("code")}>Code</button>
                </div>
                {factorType === "dob" ? (
                  knownDob ? (
                    <p className="text-xs text-gray-500">Das Geburtsdatum aus den Patientendaten wird verwendet. Die Patient:in gibt es beim Öffnen ein.</p>
                  ) : (
                    <>
                      <input type="text" inputMode="numeric" className={inputCls} value={dobInput} placeholder="Geburtsdatum, TT.MM.JJJJ" onChange={(e) => setDobInput(e.target.value)} />
                      <p className="text-[11px] text-gray-400 mt-1">In den Patientendaten ist kein Geburtsdatum hinterlegt. Trägst Du es dort ein, ist es beim nächsten Versand schon da.</p>
                    </>
                  )
                ) : (
                  <p className="text-xs text-gray-500">Nach dem Senden siehst Du einen sechsstelligen Code. Gib ihn der Patient:in persönlich oder am Telefon. Gut bei einem gemeinsamen Postfach.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Persönliche Nachricht (optional)</label>
                <textarea className={inputCls} rows={2} maxLength={500} value={message} placeholder="z.B. Schön, dass Du da warst." onChange={(e) => setMessage(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">Bitte keine Gesundheitsdaten in die Nachricht, sie steht unverschlüsselt in der E-Mail.</p>
              </div>
              {!secure.practice?.name && <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">Bitte trage zuerst den Praxisnamen in den Praxiseinstellungen ein.</p>}
              <p className="text-[11px] text-gray-400 leading-relaxed">Die Dokumente werden in Deinem Browser verschlüsselt. Die E-Mail enthält nur einen Link, der 30 Tage gültig ist.</p>
            </>
          )}

          {mode === "share" && !result && (
            <>
              <p className="text-xs text-gray-500">Die Dokumente werden als einzelne PDF-Dateien übergeben.</p>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2 leading-relaxed">
                Versand per E-Mail-Anhang oder Messenger bitte nur auf ausdrücklichen Wunsch der Patient:in. Dokumentiere den Wunsch in der Patient:innenakte.
              </p>
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <p className="text-sm text-gray-700">Gesendet an {result.recipient_masked}. Der Link ist bis {fmtDate(result.expires_at)} gültig.</p>
              </div>
              {result.code && (
                <div className="rounded-lg bg-[#FAEBE1] px-4 py-3">
                  <p className="text-xs text-gray-600 mb-1">Code für die Patient:in, wird nur jetzt angezeigt</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold tracking-[0.3em] text-gray-900 tabular-nums">{result.code}</span>
                    <CopyButton value={result.code} />
                  </div>
                </div>
              )}
            </div>
          )}

          {secure && shares && shares.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Bisher gesendet</p>
              <div className="space-y-1.5">
                {shares.slice(0, 5).map((s) => {
                  const st = shareStatus(s);
                  const live = !s.revoked_at && s.active && Date.parse(s.expires_at) > Date.now();
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 tabular-nums">{fmtDate(s.created_at)}</span>
                      <span className="text-gray-700 truncate">{s.recipient_masked}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${toneCls[st.tone]}`}>{st.text}</span>
                      {live && <button className="text-gray-400 hover:text-red-600" title="Link widerrufen" onClick={() => revoke(s.id)}>Widerrufen</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end flex-shrink-0">
          {result ? (
            <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" onClick={onClose}>Fertig</button>
          ) : (
            <>
              <button className="px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 transition" onClick={onClose}>Abbrechen</button>
              {mode === "email" && secure && secureReady ? (
                <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canSendSecure} onClick={sendEmail}>
                  {!files && !error ? "Wird vorbereitet…" : sending ? "Wird verschlüsselt und gesendet…" : "Sicher senden"}
                </button>
              ) : (
                <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={!files || !chosen.length} onClick={share}>
                  {!files && !error ? "Wird vorbereitet…" : canShareFiles ? "Teilen" : "Herunterladen"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
