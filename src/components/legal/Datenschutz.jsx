import React from "react";

// ═══════════════════ Datenschutzerklärung ═══════════════════

export default function DatenschutzPage({ onBack }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow border border-[#DFE3EB] p-8">
        {onBack && (
          <button onClick={onBack} className="mb-6 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            &larr; Zurück
          </button>
        )}
        <h1 className="text-xl font-bold text-gray-800 mb-1">Datenschutzerklärung</h1>
        <p className="text-xs text-gray-400 mb-6">EPHIA Medical GmbH · Stand: November 2026</p>

        <div className="prose prose-sm max-w-none text-gray-700 text-sm leading-relaxed space-y-5">
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">1. Verantwortliche:r</h2>
            <p>Verantwortlich für die Datenverarbeitung im Sinne der DSGVO:</p>
            <p>EPHIA Medical GmbH<br />Dorfstraße 30<br />15913 Märkische Heide<br />Deutschland<br />E-Mail: customerlove@ephia.de</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">2. Erhebung und Verarbeitung personenbezogener Daten</h2>
            <p>Wir verarbeiten Deine personenbezogenen Daten nur, soweit dies zur Bereitstellung unserer App und der damit verbundenen Leistungen erforderlich ist. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">3. Kategorien verarbeiteter Daten</h2>
            <p><strong>Kontodaten:</strong> Deine E-Mail-Adresse und ein Passwort-Hash zur Authentifizierung.</p>
            <p><strong>Praxisdaten:</strong> Praxisname, Anschrift, Steuernummer, Bankverbindung und weitere geschäftliche Angaben. Diese Daten werden unverschlüsselt gespeichert, um die Geschäftsabwicklung zu ermöglichen.</p>
            <p><strong>Rechnungsdaten:</strong> Rechnungsnummern, Leistungspositionen (GOÄ-Ziffern), Beträge und Datumsangaben. Diese Daten werden unverschlüsselt gespeichert.</p>
            <p><strong>Patient:innendaten:</strong> Name, Adresse, Geburtsdatum und E-Mail-Adresse Deiner Patient:innen. Diese Daten werden in Deinem Browser verschlüsselt, bevor sie an den Server übertragen werden, und dort ausschließlich verschlüsselt gespeichert (siehe Abschnitt 5). Im laufenden Betrieb hat EPHIA keinen Zugriff auf diese Daten im Klartext.</p>
            <p><strong>Technische Daten:</strong> Bei der Nutzung der App werden automatisch technische Informationen wie IP-Adresse, Browsertyp und Zugriffszeiten erfasst. Diese Daten werden ausschließlich zur Sicherstellung des Betriebs und zur Fehlerbehebung verwendet.</p>
            <p><strong>Nutzungsdaten:</strong> Wenn Du angemeldet bist, speichern wir, welche Funktionen der App Du verwendest, zum Beispiel das Anlegen einer Behandlungsdokumentation oder das Teilen eines PDFs. Gespeichert werden die Art der Aktion, der Zeitpunkt, Dein Konto und technische Merkmale wie der Dokumenttyp. Patient:innendaten oder Inhalte Deiner Dokumente sind darin nicht enthalten. Wir nutzen diese Daten ausschließlich intern, um die App zu verbessern und Fehler zu erkennen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der Weiterentwicklung und Qualitätssicherung der App. Du kannst dieser Verarbeitung jederzeit widersprechen (Art. 21 DSGVO), eine kurze Nachricht an uns genügt. Die Nutzungsdaten werden nach 24 Monaten gelöscht, spätestens mit der Löschung Deines Kontos.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">4. Verarbeitung von Gesundheitsdaten</h2>
            <p>Im Rahmen der Rechnungsstellung können mittelbar Gesundheitsdaten gemäß Art. 9 DSGVO verarbeitet werden, da aus Behandlungspositionen auf den Gesundheitszustand geschlossen werden kann. Die Verarbeitung erfolgt auf Grundlage von Art. 9 Abs. 2 lit. h DSGVO (Gesundheitsversorgung). Durch die Verschlüsselung (siehe Abschnitt 5) sind patient:innenidentifizierende Daten auf unseren Servern nicht im Klartext gespeichert; Rechnungspositionen können serverseitig keiner identifizierbaren Person zugeordnet werden.</p>
            <p>Du bist als verantwortliche Stelle für die von Dir eingegebenen Patient:innendaten verantwortlich und stellst sicher, dass Du über die erforderliche Rechtsgrundlage verfügst.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">5. Verschlüsselung der Patient:innendaten</h2>
            <p>Patient:innendaten werden mit AES-256-GCM verschlüsselt. Die Verschlüsselung erfolgt direkt in Deinem Browser, bevor Daten an unsere Server übertragen werden.</p>
            <p><strong>Schlüsselhierarchie:</strong> Aus Deinem Passwort wird mittels PBKDF2 ein Schlüssel abgeleitet, der den eigentlichen Datenschlüssel (Master Encryption Key, MEK) schützt. Für die Arbeit in der App wird der MEK ausschließlich in Deinem Browser entschlüsselt.</p>
            <p><strong>Wiederherstellung:</strong> Damit Deine Daten bei Verlust Deines Passworts nicht verloren gehen, wird der MEK zusätzlich mit einem öffentlichen Schlüssel von EPHIA verschlüsselt in Deinem Profil gespeichert. Der zugehörige private Schlüssel wird getrennt von der Datenbank verwahrt und nur auf Deine Anfrage an customerlove@ephia.de verwendet, um Dir den Zugriff auf Deine Daten zurückzugeben. Jede Wiederherstellung wird protokolliert. Außerhalb einer solchen Wiederherstellung hat EPHIA keinen Zugriff auf Deine Patient:innendaten im Klartext.</p>
            <p><strong>Konsequenz:</strong> In der Datenbank liegen ausschließlich verschlüsselte Daten. Ein unbefugter Zugriff auf die Datenbank allein ermöglicht keine Entschlüsselung, weil der dafür nötige Schlüssel dort nicht gespeichert ist.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">6. Hosting und Datenverarbeitung</h2>
            <p><strong>Hosting:</strong> Die App wird über GitHub Pages (GitHub, Inc.) als statische Webanwendung bereitgestellt. Es werden dabei keine personenbezogenen Daten serverseitig durch GitHub verarbeitet.</p>
            <p><strong>Datenbank:</strong> Sämtliche Daten werden auf Servern innerhalb der Europäischen Union gespeichert. Als Datenbankdienstleister wird Supabase mit EU-Serverstandort eingesetzt. Patient:innendaten werden zusätzlich durch Verschlüsselung geschützt (siehe Abschnitt 5).</p>
            <p><strong>Authentifizierung:</strong> Die Authentifizierung erfolgt über Supabase Auth. Dabei werden E-Mail-Adresse und Passwort-Hash verarbeitet.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">7. Cookies und Tracking</h2>
            <p>Die App verwendet keine Cookies. Im Browser werden nur technisch notwendige Daten gespeichert: Deine Anmeldung im localStorage, damit Du angemeldet bleibst, bis Du Dich abmeldest, und der Schlüssel zur Entschlüsselung Deiner Patient:innendaten im sessionStorage. Der Schlüssel wird beim Schließen des Browsers automatisch gelöscht.</p>
            <p>Die in Abschnitt 3 beschriebenen Nutzungsdaten werden auf unseren eigenen Servern gespeichert und nicht an Dritte weitergegeben. Externe Analyse- oder Trackingdienste setzen wir nicht ein.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">8. Deine Rechte</h2>
            <p>Du hast gemäß DSGVO folgende Rechte:</p>
            <p><strong>Auskunftsrecht (Art. 15):</strong> Du kannst Auskunft über die zu Deiner Person gespeicherten Daten verlangen.</p>
            <p><strong>Berichtigungsrecht (Art. 16):</strong> Du kannst die Berichtigung unrichtiger Daten verlangen.</p>
            <p><strong>Löschungsrecht (Art. 17):</strong> Du kannst die Löschung Deiner Daten verlangen, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
            <p><strong>Einschränkung der Verarbeitung (Art. 18):</strong> Du kannst die Einschränkung der Verarbeitung Deiner Daten verlangen.</p>
            <p><strong>Datenübertragbarkeit (Art. 20):</strong> Du kannst Deine Daten in einem gängigen Format erhalten.</p>
            <p><strong>Widerspruchsrecht (Art. 21):</strong> Du kannst der Verarbeitung Deiner Daten widersprechen.</p>
            <p>Zur Ausübung Deiner Rechte schreib uns einfach an: customerlove@ephia.de</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">9. Beschwerderecht</h2>
            <p>Du hast das Recht, Dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung Deiner personenbezogenen Daten zu beschweren. Die für uns zuständige Aufsichtsbehörde ist:</p>
            <p>Die Landesbeauftragte für den Datenschutz und für das Recht auf Akteneinsicht Brandenburg<br />Stahnsdorfer Damm 77<br />14532 Kleinmachnow</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">10. Speicherdauer</h2>
            <p>Personenbezogene Daten werden gelöscht, sobald der Zweck der Speicherung entfällt. Nach Kündigung Deines Kontos werden alle personenbezogenen Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten (z. B. steuerrechtliche Aufbewahrungsfristen von bis zu 10 Jahren) entgegenstehen.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">11. Änderungen dieser Datenschutzerklärung</h2>
            <p>Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen. Die aktuelle Version ist jederzeit in der App einsehbar.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">Kontakt</h2>
            <p>EPHIA Medical GmbH<br />E-Mail: customerlove@ephia.de</p>
          </section>
        </div>
      </div>
    </div>
  );
}

