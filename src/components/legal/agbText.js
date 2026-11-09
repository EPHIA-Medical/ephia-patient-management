// Allgemeine Geschäftsbedingungen of the EPHIA Patient Management System.
// The text lives here as data so that the page, the acceptance screen and the
// hash recorded in agb_acceptances all use exactly the same wording.
// Any change to the text needs a new AGB_VERSION and a row in agb_versions
// with the new hash (see supabase/migrations/0007_agb_acceptances.sql), and
// every account accepts the new version on its next login.

export const AGB_VERSION = "1.0";
export const AGB_DATE = "November 2026";

export const AGB_SECTIONS = [
  {
    heading: "§ 1 Geltungsbereich",
    body: [
      "Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der webbasierten Anwendung „EPHIA Patient Management System\" (nachfolgend „App\"), bereitgestellt von der EPHIA Medical GmbH (nachfolgend „Anbieter\"). Sie werden Vertragsbestandteil, indem Du sie vor der ersten Nutzung der App durch Setzen eines Kontrollkästchens ausdrücklich bestätigst.",
    ],
  },
  {
    heading: "§ 2 Leistungsbeschreibung",
    body: [
      "Die App ermöglicht niedergelassenen Ärzt:innen und Praxen die digitale Verwaltung von Patient:innendaten sowie die Erstellung, Verwaltung und den Export von Rechnungen für Privatpatient:innen. Der Anbieter stellt die App als Software-as-a-Service (SaaS) über das Internet zur Verfügung. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.",
    ],
  },
  {
    heading: "§ 2a Alpha-Testphase",
    body: [
      "(1) Die App befindet sich in einer Alpha-Testphase. Funktionen können sich ändern, fehlerhaft sein, entfallen oder zeitweise nicht zur Verfügung stehen. Der Anbieter kann die Stabilität, Verfügbarkeit und Fehlerfreiheit der App in dieser Phase nicht gewährleisten.",
      "(2) Ein Verlust oder eine Beschädigung von Daten kann in der Alpha-Testphase nicht ausgeschlossen werden. Du verpflichtest Dich deshalb, Rechnungen, Behandlungsdokumentationen und alle weiteren Unterlagen, für die gesetzliche Aufbewahrungspflichten gelten (insbesondere § 630f BGB und § 147 AO), zusätzlich außerhalb der App zu sichern, zum Beispiel durch regelmäßiges Speichern als PDF.",
      "(3) Für den Verlust oder die Beschädigung von Daten haftet der Anbieter nur in Höhe des Aufwands, der für ihre Wiederherstellung aus Deinen Sicherungen nach Absatz 2 erforderlich gewesen wäre. Diese Beschränkung gilt nicht bei Vorsatz oder grober Fahrlässigkeit des Anbieters und nicht für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit.",
      "(4) Der Anbieter teilt Dir das Ende der Alpha-Testphase in Textform mit.",
    ],
  },
  {
    heading: "§ 3 Registrierung und Konto",
    body: [
      "(1) Zur Nutzung der App ist eine Registrierung mit einer gültigen E-Mail-Adresse und einem Passwort erforderlich.",
      "(2) Du bist verpflichtet, Deine Zugangsdaten vertraulich zu behandeln und nicht an Dritte weiterzugeben.",
      "(3) Du bist für alle Aktivitäten verantwortlich, die über Dein Konto ausgeführt werden.",
    ],
  },
  {
    heading: "§ 4 Datenschutz und Verschlüsselung",
    body: [
      "(1) Der Schutz personenbezogener Daten hat für uns höchste Priorität. Die Verarbeitung personenbezogener Daten erfolgt ausschließlich im Einklang mit der Datenschutz-Grundverordnung (DSGVO) und dem Bundesdatenschutzgesetz (BDSG).",
      "(2) Patient:innendaten (Name, Adresse, Geburtsdatum und weitere personenbezogene Informationen) werden mit AES-256-GCM verschlüsselt. Die Verschlüsselung erfolgt direkt in Deinem Browser, bevor Daten an den Server übermittelt werden. Im laufenden Betrieb hat der Anbieter keinen Zugriff auf unverschlüsselte Patient:innendaten.",
      "(3) Der Datenschlüssel (Master Encryption Key) wird durch Dein Passwort geschützt. Für die Wiederherstellung bei Passwortverlust wird er zusätzlich mit einem Schlüssel des Anbieters verschlüsselt hinterlegt, dessen privater Teil getrennt von der Datenbank verwahrt wird. Eine Wiederherstellung erfolgt nur auf Deine Anfrage an customerlove@ephia.de und wird protokolliert.",
      "(4) Praxisdaten (Praxisname, Adresse, Steuernummer etc.) sowie Rechnungsbeträge und Leistungspositionen werden nicht verschlüsselt gespeichert, um eine ordnungsgemäße Geschäftsabwicklung zu ermöglichen.",
      "(5) Rechtsgrundlage für die Verarbeitung ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 9 Abs. 2 lit. h DSGVO für die Verarbeitung von Gesundheitsdaten im Rahmen der Gesundheitsversorgung.",
    ],
  },
  {
    heading: "§ 5 Umgang mit Gesundheitsdaten",
    body: [
      "(1) Die App verarbeitet im Rahmen der Rechnungsstellung mittelbar Gesundheitsdaten im Sinne von Art. 9 DSGVO, da aus Rechnungspositionen auf Behandlungen und somit auf den Gesundheitszustand geschlossen werden kann. Durch die in § 4 beschriebene Verschlüsselung sind patient:innenidentifizierende Daten auf den Servern von EPHIA nicht im Klartext gespeichert; Rechnungspositionen können serverseitig keiner identifizierbaren Person zugeordnet werden.",
      "(2) Du bist als verantwortliche Stelle im Sinne der DSGVO für die von Dir eingegebenen Patient:innendaten verantwortlich. Du stellst sicher, dass Du über die erforderliche Rechtsgrundlage zur Verarbeitung der jeweiligen Patient:innendaten verfügst.",
      "(3) Die technischen und organisatorischen Maßnahmen umfassen insbesondere die unter § 4 beschriebene Verschlüsselung.",
    ],
  },
  {
    heading: "§ 6 Deine Pflichten",
    body: [
      "(1) Du verpflichtest Dich, die App nur im Rahmen der geltenden Gesetze zu nutzen.",
      "(2) Du bist für die Richtigkeit und Vollständigkeit der eingegebenen Rechnungsdaten selbst verantwortlich.",
      "(3) Du bist verpflichtet, Dein Passwort sicher zu wählen und regelmäßig zu ändern. Bei Verdacht auf unbefugten Zugriff informiere uns bitte unverzüglich.",
    ],
  },
  {
    heading: "§ 7 Haftung",
    body: [
      "(1) Der Anbieter haftet unbeschränkt für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.",
      "(2) Für leichte Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten. Die Haftung ist in diesen Fällen auf den vorhersehbaren, vertragstypischen Schaden begrenzt.",
      "(3) Die App ersetzt keine steuerliche oder rechtliche Beratung. Der Anbieter übernimmt keine Haftung für die steuerliche oder rechtliche Korrektheit der erstellten Rechnungen.",
      "(4) Bei Verlust Deines Passworts kann der Zugriff über das in § 4 beschriebene Wiederherstellungsverfahren zurückgegeben werden. Schlägt dies fehl, können wir verschlüsselte Patient:innendaten nicht wiederherstellen. Der Anbieter haftet nicht für Datenverluste, die auf den Verlust des Verschlüsselungsschlüssels zurückzuführen sind.",
      "(5) Für Datenverluste während der Alpha-Testphase gilt ergänzend § 2a Absatz 3.",
    ],
  },
  {
    heading: "§ 8 Laufzeit und Kündigung",
    body: [
      "(1) Das Nutzungsverhältnis beginnt mit der Registrierung und wird auf unbestimmte Zeit geschlossen.",
      "(2) Beide Parteien können das Nutzungsverhältnis jederzeit ohne Angabe von Gründen kündigen.",
      "(3) Bei Kündigung werden alle Deine personenbezogenen Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.",
    ],
  },
  {
    heading: "§ 9 Änderungen der AGB",
    body: [
      "Wir behalten uns vor, diese AGB zu ändern. Geänderte AGB werden Dir vor ihrer Geltung in der App angezeigt und gelten erst, wenn Du sie dort ausdrücklich bestätigst. Bis dahin kannst Du die App nicht weiter nutzen; Deine Daten bleiben erhalten.",
    ],
  },
  {
    heading: "§ 10 Schlussbestimmungen",
    body: [
      "(1) Es gilt das Recht der Bundesrepublik Deutschland.",
      "(2) Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      "(3) Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des Anbieters.",
    ],
  },
  {
    heading: "Kontakt",
    body: ["EPHIA Medical GmbH, E-Mail: customerlove@ephia.de"],
  },
];

export function agbCanonicalText() {
  const lines = [`AGB ${AGB_VERSION} (${AGB_DATE})`];
  for (const s of AGB_SECTIONS) {
    lines.push(s.heading);
    lines.push(...s.body);
  }
  return lines.join("\n");
}

export async function agbDocumentHash() {
  const data = new TextEncoder().encode(agbCanonicalText());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
