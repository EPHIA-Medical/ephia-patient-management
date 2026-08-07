import React, { useState } from "react";

// ═══════════════════ Auth Screens ═══════════════════

export function LoginScreen({ onSignInClick, onSignUpClick, onResetClick, onAGBClick, onImpressumClick, onDatenschutzClick, isLoading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full border border-[#DFE3EB]">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Patientenmanagement</div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">E-Mail</label>
          <input
            type="email"
            className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="deine@email.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Passwort</label>
          <input
            type="password"
            className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <button
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => onSignInClick(email, password)}
          disabled={isLoading}
        >
          {isLoading ? "Wird angemeldet..." : "Anmelden"}
        </button>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 border-t border-[#DFE3EB]"></div>
          <span className="text-xs text-gray-400">oder</span>
          <div className="flex-1 border-t border-[#DFE3EB]"></div>
        </div>

        <button
          className="w-full border border-[#DFE3EB] text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition disabled:opacity-50"
          onClick={() => onSignUpClick(email, password)}
          disabled={isLoading}
        >
          Neues Konto erstellen
        </button>

        <div className="mt-4 text-center">
          <button
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            onClick={() => onResetClick(email)}
            disabled={isLoading}
          >
            Passwort vergessen?
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-400">
          Sichere Authentifizierung · <button className="text-blue-500 hover:text-blue-600 underline" onClick={onAGBClick}>AGB</button> · <button className="text-blue-500 hover:text-blue-600 underline" onClick={onDatenschutzClick}>Datenschutz</button> · <button className="text-blue-500 hover:text-blue-600 underline" onClick={onImpressumClick}>Impressum</button>
        </div>
      </div>
    </div>
  );
}

export function SignUpScreen({ onSignUpClick, onBackClick, isLoading, error, success, successEmail }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const passwordsMatch = password && passwordConfirm && password === passwordConfirm;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full border border-[#DFE3EB]">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Neues Konto</div>
        </div>

        {success ? (
          <div>
            <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-center">
              <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" /></svg>
              <p className="text-sm font-medium text-green-800 mb-1">Fast geschafft!</p>
              <p className="text-xs text-green-700">Wir haben eine Bestätigungsmail an <strong>{successEmail}</strong> geschickt. Öffne die E-Mail und klicke auf den Link, um Dein Konto zu aktivieren.</p>
            </div>
            <p className="text-xs text-gray-400 text-center mb-4">Sobald Du Deine E-Mail bestätigt hast, kannst Du Dich anmelden.</p>
            <button
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition"
              onClick={onBackClick}
            >
              Zur Anmeldung
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">E-Mail</label>
              <input
                type="email"
                className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="deine@email.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Passwort</label>
              <input
                type="password"
                className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Mindestens 6 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Passwort wiederholen</label>
              <input
                type="password"
                className={`w-full border rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 ${
                  password && !passwordsMatch ? "border-red-300 focus:ring-red-400" : "border-[#DFE3EB] focus:ring-blue-400"
                }`}
                placeholder="Passwort wiederholen"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={isLoading}
              />
              {password && !passwordsMatch && (
                <p className="text-xs text-red-600 mt-1">Passwörter stimmen nicht überein</p>
              )}
            </div>

            <button
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onSignUpClick(email, password)}
              disabled={isLoading || !passwordsMatch}
            >
              {isLoading ? "Wird erstellt..." : "Konto erstellen"}
            </button>

            <div className="mt-4 text-center">
              <button
                className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                onClick={onBackClick}
                disabled={isLoading}
              >
                ← Zurück zur Anmeldung
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-400">
              Sichere Authentifizierung
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordScreen({ onResetClick, onBackClick, isLoading, error, success }) {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full border border-[#DFE3EB]">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Passwort zurücksetzen</div>
        </div>

        {success && (
          <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
            Passwort-Reset-Link wurde an deine E-Mail gesendet. Bitte überprüfe dein Postfach.<br /><strong>Wichtig:</strong> Der Link muss im selben Browser geöffnet werden, in dem du ihn angefordert hast.
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">E-Mail-Adresse</label>
          <input
            type="email"
            className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="deine@email.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || success}
          />
        </div>

        <button
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => onResetClick(email)}
          disabled={isLoading || success}
        >
          {isLoading ? "Wird gesendet..." : "Passwort-Reset-Link senden"}
        </button>

        <div className="mt-4 text-center">
          <button
            className="text-xs text-gray-600 hover:text-gray-800 font-medium"
            onClick={onBackClick}
            disabled={isLoading}
          >
            ← Zurück zur Anmeldung
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-400">
          Sichere Authentifizierung
        </div>
      </div>
    </div>
  );
}

export function SetNewPasswordScreen({ onSubmit, onBackClick, isLoading, error, success }) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const passwordsMatch = password && passwordConfirm && password === passwordConfirm;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full border border-[#DFE3EB]">
        <div className="text-center mb-8">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Neues Passwort festlegen</div>
        </div>

        {success && (
          <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
            Passwort erfolgreich geändert. Du kannst dich jetzt anmelden.
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        {!success && (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Neues Passwort</label>
              <input
                type="password"
                className="w-full border border-[#DFE3EB] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Mindestens 6 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Passwort bestätigen</label>
              <input
                type="password"
                className={`w-full border rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-1 ${password && passwordConfirm && !passwordsMatch ? "border-red-300 focus:ring-red-400" : "border-[#DFE3EB] focus:ring-blue-400"}`}
                placeholder="Passwort wiederholen"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <button
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onSubmit(password)}
              disabled={isLoading || !passwordsMatch || password.length < 6}
            >
              {isLoading ? "Wird gespeichert..." : "Passwort speichern"}
            </button>
          </>
        )}

        <div className="mt-4 text-center">
          <button
            className="text-xs text-gray-600 hover:text-gray-800 font-medium"
            onClick={onBackClick}
          >
            ← Zurück zur Anmeldung
          </button>
        </div>
      </div>
    </div>
  );
}


export default { LoginScreen, SignUpScreen, ResetPasswordScreen, SetNewPasswordScreen };
