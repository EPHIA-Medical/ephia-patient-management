import React from "react";

// ═══════════════════ AGB / Terms & Conditions ═══════════════════

export default function AGBPage({ onBack }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow border border-[#DFE3EB] p-8">
        {onBack && (
          <button onClick={onBack} className="mb-6 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            &larr; Zurück
          </button>
        )}
        <h1 className="text-xl font-bold text-gray-800 mb-1">Allgemeine Geschäftsbedingungen (AGB)</h1>
        <p className="text-xs text-gray-400 mb-6">EPHIA Medical GmbH · Stand: März 2026</p>

        <div className="prose prose-sm max-w-none text-gray-700 text-sm leading-relaxed space-y-5">
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 1 Geltungsbereich</h2>
            <p>Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der webbasierten Anwendung „EPHIA Patientenmanagement" (nachfolgend „App"), bereitgestellt von der EPHIA Medical GmbH (nachfolgend „Anbieter"). Mit der Registrierung und Nutzung der App erklärst Du Dich mit diesen Bedingungen einverstanden.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 2 Leistungsbeschreibung</h2>
            <p>Die App ermöglicht niedergelassenen Ärzt:innen und Praxen die digitale Verwaltung von Patient:innendaten sowie die Erstellung, Verwaltung und den Export von Rechnungen für Privatpatient:innen. Der Anbieter stellt die App als Software-as-a-Service (SaaS) über das Internet zur Verfügung. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 3 Registrierung und Konto</h2>
            <p>(1) Zur Nutzung der App ist eine Registrierung mit einer gültigen E-Mail-Adresse und einem Passwort erforderlich.</p>
            <p>(2) Du bist verpflichtet, Deine Zugangsdaten vertraulich zu behandeln und nicht an Dritte weiterzugeben.</p>
            <p>(3) Du bist für alle Aktivitäten verantwortlich, die über Dein Konto ausgeführt werden.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 4 Datenschutz und Ende-zu-Ende-Verschlüsselung</h2>
            <p>(1) Der Schutz personenbezogener Daten hat für uns höchste Priorität. Die Verarbeitung personenbezogener Daten erfolgt ausschließlich im Einklang mit der Datenschutz-Grundverordnung (DSGVO) und dem Bundesdatenschutzgesetz (BDSG).</p>
            <p>(2) Patient:innendaten (Name, Adresse, Geburtsdatum und weitere personenbezogene Informationen) werden mittels Ende-zu-Ende-Verschlüsselung (E2EE) mit AES-256-GCM geschützt. Die Verschlüsselung erfolgt direkt in Deinem Browser, bevor Daten an den Server übermittelt werden. Der Anbieter hat zu keinem Zeitpunkt Zugriff auf unverschlüsselte Patient:innendaten.</p>
            <p>(3) Der Verschlüsselungsschlüssel (Master Encryption Key) wird aus Deinem Passwort abgeleitet und ist ausschließlich Dir zugänglich. Eine Wiederherstellung des Schlüssels ist über einen per E-Mail verifizierten Recovery-Mechanismus möglich.</p>
            <p>(4) Praxisdaten (Praxisname, Adresse, Steuernummer etc.) sowie Rechnungsbeträge und Leistungspositionen werden nicht verschlüsselt gespeichert, um eine ordnungsgemäße Geschäftsabwicklung zu ermöglichen.</p>
            <p>(5) Rechtsgrundlage für die Verarbeitung ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 9 Abs. 2 lit. h DSGVO für die Verarbeitung von Gesundheitsdaten im Rahmen der Gesundheitsversorgung.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 5 Umgang mit Gesundheitsdaten</h2>
            <p>(1) Die App verarbeitet im Rahmen der Rechnungsstellung mittelbar Gesundheitsdaten im Sinne von Art. 9 DSGVO, da aus Rechnungspositionen auf Behandlungen und somit auf den Gesundheitszustand geschlossen werden kann. Durch die in § 4 beschriebene Ende-zu-Ende-Verschlüsselung sind patient:innenidentifizierende Daten auf den Servern von EPHIA jedoch zu keinem Zeitpunkt im Klartext gespeichert oder einsehbar — Rechnungspositionen können serverseitig keiner identifizierbaren Person zugeordnet werden.</p>
            <p>(2) Du bist als verantwortliche Stelle im Sinne der DSGVO für die von Dir eingegebenen Patient:innendaten verantwortlich. Du stellst sicher, dass Du über die erforderliche Rechtsgrundlage zur Verarbeitung der jeweiligen Patient:innendaten verfügst.</p>
            <p>(3) Die technischen und organisatorischen Maßnahmen umfassen insbesondere die unter § 4 beschriebene Ende-zu-Ende-Verschlüsselung.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 6 Deine Pflichten</h2>
            <p>(1) Du verpflichtest Dich, die App nur im Rahmen der geltenden Gesetze zu nutzen.</p>
            <p>(2) Du bist für die Richtigkeit und Vollständigkeit der eingegebenen Rechnungsdaten selbst verantwortlich.</p>
            <p>(3) Du bist verpflichtet, Dein Passwort sicher zu wählen und regelmäßig zu ändern. Bei Verdacht auf unbefugten Zugriff informiere uns bitte unverzüglich.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 7 Haftung</h2>
            <p>(1) Der Anbieter haftet unbeschränkt für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.</p>
            <p>(2) Für leichte Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten. Die Haftung ist in diesen Fällen auf den vorhersehbaren, vertragstypischen Schaden begrenzt.</p>
            <p>(3) Die App ersetzt keine steuerliche oder rechtliche Beratung. Der Anbieter übernimmt keine Haftung für die steuerliche oder rechtliche Korrektheit der erstellten Rechnungen.</p>
            <p>(4) Bei Verlust Deines Passworts und Nichtfunktionieren des Recovery-Mechanismus können wir verschlüsselte Patient:innendaten nicht wiederherstellen. Der Anbieter haftet nicht für Datenverluste, die auf den Verlust des Verschlüsselungsschlüssels zurückzuführen sind.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 8 Laufzeit und Kündigung</h2>
            <p>(1) Das Nutzungsverhältnis beginnt mit der Registrierung und wird auf unbestimmte Zeit geschlossen.</p>
            <p>(2) Beide Parteien können das Nutzungsverhältnis jederzeit ohne Angabe von Gründen kündigen.</p>
            <p>(3) Bei Kündigung werden alle Deine personenbezogenen Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 9 Änderungen der AGB</h2>
            <p>Wir behalten uns vor, diese AGB jederzeit zu ändern. Du wirst über Änderungen per E-Mail informiert. Widersprichst Du nicht innerhalb von vier Wochen nach Zugang der Änderungsmitteilung, gelten die geänderten Bedingungen als akzeptiert.</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">§ 10 Schlussbestimmungen</h2>
            <p>(1) Es gilt das Recht der Bundesrepublik Deutschland.</p>
            <p>(2) Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
            <p>(3) Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des Anbieters.</p>
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

