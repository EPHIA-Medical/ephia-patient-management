import React, { useState } from "react";

// Full-screen numeric PIN prompt used to exit patient-facing kiosk views
// (Aufklärungsbogen). Not a cryptographic barrier — it prevents patients
// from tapping their way into the practice's patient database.
export default function PinGate({ pin, title = "Praxis-PIN eingeben", subtitle, onSuccess, onCancel }) {
  const [entered, setEntered] = useState("");
  const [error, setError] = useState(false);
  const expected = String(pin || "");

  const press = (d) => {
    if (error) return;
    const next = entered + d;
    if (next.length >= expected.length) {
      if (next === expected) {
        setEntered(next);
        onSuccess();
        return;
      }
      setEntered(next);
      setError(true);
      setTimeout(() => { setError(false); setEntered(""); }, 650);
      return;
    }
    setEntered(next);
  };

  const backspace = () => {
    if (error) return;
    setEntered((prev) => prev.slice(0, -1));
  };

  const keyCls = "w-16 h-16 md:w-20 md:h-20 rounded-full text-xl md:text-2xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition select-none flex items-center justify-center";

  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center p-6">
      <style>{`@keyframes pinShake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }`}</style>
      <div className="w-full max-w-xs flex flex-col items-center">
        <svg className="w-10 h-10 text-teal-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-1 text-center">{title}</h3>
        {subtitle && <p className="text-xs md:text-sm text-gray-500 text-center mb-2">{subtitle}</p>}

        {/* PIN dots */}
        <div
          className="flex items-center justify-center gap-3 my-6 h-4"
          style={error ? { animation: "pinShake 0.5s ease" } : undefined}
        >
          {Array.from({ length: expected.length }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-colors ${i < entered.length ? (error ? "bg-red-500" : "bg-gray-800") : "bg-gray-200"}`}
            />
          ))}
        </div>
        {error && <p className="text-xs text-red-500 -mt-3 mb-3">Falsche PIN</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" className={keyCls} onClick={() => press(d)}>{d}</button>
          ))}
          <div />
          <button type="button" className={keyCls} onClick={() => press("0")}>0</button>
          <button type="button" className={keyCls + " !bg-transparent hover:!bg-gray-100"} onClick={backspace} aria-label="Löschen">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
          </button>
        </div>

        {onCancel && (
          <button type="button" className="mt-6 py-2 px-4 text-xs md:text-sm text-gray-400 hover:text-gray-600 transition" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
