import React from "react";
import ReactDOM from "react-dom/client";
import { fetchShareMeta, unlockShare } from "../lib/shareApi";
import "./share.css";

// ═══════════════════ Patient opening page for protected document links ═══════════════════
//
// URL: /d/?s=<share id>#<halfA>. The part after '#' never leaves this browser.
// The patient enters the date of birth or code; the server checks a verifier
// of it and releases halfB; the PDFs are decrypted here. See src/lib/shareCrypto.js.
// No third-party scripts or styles on this page (CSP in vite.config.js).

const params = new URLSearchParams(window.location.search);
const SHARE_ID = params.get("s") || "";
const HALF_A = window.location.hash.replace(/^#/, "");

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

function Card({ children }) {
  return (
    <main className="page">
      <div className="card">{children}</div>
    </main>
  );
}

function PracticeHead({ practice }) {
  return (
    <header>
      <p className="eyebrow">Deine Unterlagen</p>
      <h1 className="title">{practice?.name || "Deine Praxis"}</h1>
    </header>
  );
}

function Contact({ practice }) {
  const bits = [practice?.phone, practice?.email].filter(Boolean);
  if (!bits.length) return null;
  return (
    <p className="contact">
      {bits.map((b, i) => (
        <React.Fragment key={b}>
          {i > 0 && " · "}
          {b.includes("@")
            ? <a className="link" href={`mailto:${b}`}>{b}</a>
            : <a className="link" href={`tel:${b.replace(/[^\d+]/g, "")}`}>{b}</a>}
        </React.Fragment>
      ))}
    </p>
  );
}

const DocIcon = () => (
  <svg className="doc-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);

function SharePage() {
  const [meta, setMeta] = React.useState(null);
  const [loadError, setLoadError] = React.useState("");
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [docs, setDocs] = React.useState(null);

  React.useEffect(() => {
    if (!/^[A-Za-z0-9_-]{22}$/.test(SHARE_ID) || !/^[A-Za-z0-9_-]{43}$/.test(HALF_A)) { setMeta({ state: "broken" }); return; }
    fetchShareMeta(SHARE_ID).then(setMeta).catch((e) => {
      if (e.status === 404) setMeta({ state: "unknown" });
      else if (e.status >= 500) setMeta({ state: "error" });
      else setLoadError(e.message || "Die Seite konnte nicht geladen werden.");
    });
  }, []);

  // Object URLs live as long as the page
  React.useEffect(() => () => (docs || []).forEach((d) => URL.revokeObjectURL(d.url)), [docs]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const out = await unlockShare({ id: SHARE_ID, halfAB64: HALF_A, factorType: meta.factor_type, value, keySaltB64: meta.key_salt });
      setDocs(out.map((d) => ({ ...d, url: URL.createObjectURL(d.blob) })));
    } catch (err) {
      if (err.status === 401) {
        const left = err.data?.attempts_left ?? 0;
        if (err.data?.state === "locked" || left <= 0) setMeta({ ...meta, state: "locked" });
        else { setMeta({ ...meta, attempts_left: left }); setError(`Das passt leider nicht. Noch ${left} ${left === 1 ? "Versuch" : "Versuche"}.`); }
      } else if (err.status === 410) {
        setMeta({ ...meta, state: err.data?.state || "expired" });
      } else {
        setError(err.message || "Das Öffnen ist fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Card><p className="text">{loadError}</p></Card>;
  if (!meta) return <Card><p className="text">Wird geladen …</p></Card>;

  if (meta.state !== "ok") {
    const text = {
      broken: "Dieser Link ist unvollständig. Bitte öffne ihn direkt aus der E-Mail, ohne ihn abzuschreiben.",
      unknown: "Diesen Link gibt es nicht. Bitte öffne ihn direkt aus der E-Mail.",
      expired: "Dieser Link ist abgelaufen. Bitte wende Dich an Deine Praxis, sie kann Dir die Unterlagen erneut senden.",
      revoked: "Dieser Link wurde von der Praxis zurückgezogen. Bitte wende Dich an Deine Praxis.",
      locked: "Dieser Link ist nach mehreren falschen Eingaben gesperrt. Bitte wende Dich an Deine Praxis, sie kann Dir die Unterlagen erneut senden.",
      error: "Die Seite ist gerade nicht erreichbar. Bitte versuche es später noch einmal.",
    }[meta.state] || "Dieser Link ist nicht mehr gültig.";
    return (
      <Card>
        <PracticeHead practice={meta.practice} />
        <p className="text">{text}</p>
        <Contact practice={meta.practice} />
      </Card>
    );
  }

  if (docs) {
    return (
      <Card>
        <PracticeHead practice={meta.practice} />
        <div className="docs">
          {docs.map((d, i) => (
            <div key={i} className="doc">
              <div className="doc-head">
                <DocIcon />
                <span className="doc-name">{d.label}</span>
              </div>
              <div className="doc-actions">
                <a className="link" href={d.url} target="_blank" rel="noopener noreferrer">Ansehen</a>
                <a className="link" href={d.url} download={`${d.label.replace(/[^\wÄÖÜäöüß -]/g, "").trim() || "Dokument"}.pdf`}>Herunterladen</a>
              </div>
            </div>
          ))}
        </div>
        <p className="small">Die Unterlagen wurden nur in Deinem Browser entschlüsselt. Der Link ist bis {fmtDate(meta.expires_at)} gültig.</p>
        <Contact practice={meta.practice} />
      </Card>
    );
  }

  const isCode = meta.factor_type === "code";
  return (
    <Card>
      <PracticeHead practice={meta.practice} />
      <form onSubmit={submit}>
        <label htmlFor="factor" className="label">
          {isCode ? "Gib den sechsstelligen Code ein, den Du von der Praxis bekommen hast." : "Gib zum Öffnen Dein Geburtsdatum ein."}
        </label>
        <input
          id="factor"
          className="input"
          inputMode="numeric"
          autoComplete={isCode ? "one-time-code" : "bday"}
          placeholder={isCode ? "123456" : "TT.MM.JJJJ"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button" disabled={busy || !value.trim()}>
          {busy ? "Wird geöffnet …" : "Öffnen"}
        </button>
      </form>
      <p className="small">
        Die Unterlagen sind verschlüsselt und werden erst in Deinem Browser lesbar. Nach {meta.attempts_left} {meta.attempts_left === 1 ? "weiteren falschen Eingabe" : "falschen Eingaben"} wird der Link gesperrt.
      </p>
      <Contact practice={meta.practice} />
    </Card>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<SharePage />);
