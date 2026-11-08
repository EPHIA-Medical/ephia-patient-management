// Auftragsverarbeitungsvertrag (Art. 28 DSGVO) between the practice and EPHIA.
// The text lives here as data so that the page, the acceptance screen and the
// hash recorded in avv_acceptances all use exactly the same wording.
// Bump AVV_VERSION for any change that needs a fresh acceptance (Ziffer 11.3).

export const AVV_VERSION = "1.0";
export const AVV_DATE = "November 2026";

export const AVV_PROVIDER = {
  name: "EPHIA Medical GmbH",
  address: "Dorfstraße 30, 15913 Märkische Heide",
  represented: "vertreten durch die Geschäftsführerin Dr. Sophia Wilk-Vollmann",
  register: "HRB 279383 B",
  contact: "customerlove@ephia.de",
  privacyContact: "Marc Wyss",
};

// Sections: heading + paragraphs. A paragraph is a string, a bullet list
// { items: [] } or a table { table: { head?: [], rows: [[]] } }.
export const AVV_SECTIONS = [
  {
    heading: "1 Gegenstand, Rangfolge und Geltungsdauer",
    body: [
      "1.1 Der Auftragnehmer verarbeitet für den Auftraggeber personenbezogene Daten im Sinne des Art. 4 Ziff. 1 DSGVO. Gegenstand, Art und Zweck der Verarbeitung, die Art der Daten sowie der Kreis der betroffenen Personen ergeben sich aus Anhang 1 dieser Vereinbarung sowie aus dem Hauptvertrag.",
      "1.2 Die Parteien konkretisieren mit dieser Vereinbarung ihre beiderseitigen datenschutzrechtlichen Rechte und Pflichten. Im Zweifel gehen die Regelungen dieser Vereinbarung denen des Hauptvertrags vor.",
      "1.3 Diese Vereinbarung läuft so lange wie der Hauptvertrag. Sie gilt über das Ende des Hauptvertrags hinaus so lange fort, wie der Auftragnehmer über personenbezogene Daten verfügt, die der Auftraggeber ihm übermittelt hat oder die der Auftragnehmer für den Auftraggeber erhoben hat.",
    ],
  },
  {
    heading: "2 Rollenverteilung und Zweckbindung",
    body: [
      "2.1 Der Auftraggeber ist „Verantwortlicher\" im Sinne des Art. 4 Ziff. 7 DSGVO. Er ist im Rahmen dieser Vereinbarung für die Einhaltung der gesetzlichen Bestimmungen verantwortlich, insbesondere für die Rechtmäßigkeit der Datenübermittlung an den Auftragnehmer sowie für die Rechtmäßigkeit der Datenverarbeitung, einschließlich der Rechtsgrundlage für die Verarbeitung von Gesundheitsdaten nach Art. 9 Abs. 2 lit. h DSGVO.",
      "2.2 Der Auftragnehmer ist Auftragsverarbeiter im Sinne des Art. 4 Ziff. 8 DSGVO.",
      "2.3 Der Auftraggeber und der Auftragnehmer sind hinsichtlich der zu verarbeitenden Daten jeweils für die Einhaltung der für sie einschlägigen Datenschutzgesetze verantwortlich.",
      "2.4 Der Auftraggeber legt die Zwecke der Verarbeitung personenbezogener Daten fest. Eine Verarbeitung zu anderen Zwecken durch den Auftragnehmer ist unzulässig. Der Auftragnehmer nutzt die Daten des Auftraggebers insbesondere nicht für eigene Zwecke, nicht für Werbung und nicht zum Training von Software oder Modellen.",
      "2.5 Die Praxisdaten des Auftraggebers selbst (Name, Anschrift, Steuernummer, Bankverbindung, Kontodaten) verarbeitet der Auftragnehmer als eigener Verantwortlicher zur Durchführung des Hauptvertrags; sie sind nicht Gegenstand dieser Vereinbarung.",
    ],
  },
  {
    heading: "3 Weisungen des Auftraggebers",
    body: [
      "3.1 Der Auftragnehmer verarbeitet personenbezogene Daten ausschließlich im Rahmen der getroffenen Vereinbarungen und ausschließlich nach dokumentierter Weisung des Auftraggebers. Davon ausgenommen sind Fälle, in denen das Recht der EU oder nationales Recht den Auftragnehmer zu einer Verarbeitung verpflichtet. In diesen Fällen teilt der Auftragnehmer dem Auftraggeber die betreffenden rechtlichen Anforderungen vor der Verarbeitung mit; dies gilt nicht, sofern das jeweilige Recht eine solche Mitteilung wegen eines wichtigen öffentlichen Interesses verbietet.",
      `3.2 Die Nutzung der Anwendung durch den Auftraggeber (Anlegen, Ändern, Exportieren und Löschen von Daten in der App) gilt als Weisung. Darüber hinausgehende Weisungen, insbesondere der Antrag auf Wiederherstellung des Datenschlüssels nach Anhang 3 Ziffer 2, erteilt der Auftraggeber in Textform (E-Mail an ${AVV_PROVIDER.contact}). Der Auftragnehmer dokumentiert solche Weisungen.`,
      "3.3 Der Auftragnehmer informiert den Auftraggeber unverzüglich, wenn er der Meinung ist, eine Weisung verstoße gegen Datenschutzbestimmungen. Er darf die Durchführung dieser Weisung so lange aussetzen, bis der Auftraggeber die Weisung gegenüber dem Auftragnehmer bestätigt oder geändert hat.",
    ],
  },
  {
    heading: "4 Pflichten des Auftragnehmers",
    body: [
      "4.1 Der Auftragnehmer ergreift die in seinem Verantwortungsbereich erforderlichen technischen und organisatorischen Maßnahmen gemäß Art. 5 Abs. 1 und Art. 32 DSGVO und hat seine innerbetriebliche Organisation nach den datenschutzrechtlichen Anforderungen ausgestaltet. Die bei Vertragsschluss getroffenen Maßnahmen sind in Anhang 3 beschrieben. Der Auftragnehmer darf sie an den Stand der Technik anpassen, sofern das Schutzniveau nicht unterschritten wird; wesentliche Änderungen teilt er dem Auftraggeber in Textform mit.",
      "4.2 Der Auftragnehmer unterstützt den Auftraggeber angemessen bei den folgenden Pflichten des Auftraggebers:",
      { items: [
        "(a) Erfüllung der Rechte der betroffenen Personen nach Art. 12 bis 22 DSGVO,",
        "(b) Durchführung der erforderlichen Datenschutz-Folgenabschätzungen nach Art. 35 DSGVO,",
        "(c) vorherige Konsultation der zuständigen Datenschutzaufsichtsbehörden nach Art. 36 DSGVO,",
        "(d) Gewährleistung der Sicherheit der Verarbeitung gem. Art. 32 DSGVO sowie",
        "(e) Meldung von Verletzungen des Schutzes personenbezogener Daten an die Aufsichtsbehörde (Art. 33 DSGVO) und Benachrichtigung der von einer solchen Verletzung betroffenen Personen (Art. 34 DSGVO).",
      ] },
      "4.3 Werden Rechte betroffener Personen nach Art. 12 bis 22 DSGVO gegenüber dem Auftragnehmer geltend gemacht, so leitet der Auftragnehmer das jeweilige Ersuchen unverzüglich an den Auftraggeber weiter. Da Patient:innendaten beim Auftragnehmer nur verschlüsselt vorliegen, erfüllt der Auftraggeber Auskunfts-, Berichtigungs- und Löschersuchen selbst über die Funktionen der Anwendung.",
      "4.4 Der Auftragnehmer wahrt bei der auftragsgemäßen Verarbeitung der personenbezogenen Daten des Auftraggebers die Vertraulichkeit. Diese Pflicht besteht auch nach Beendigung des Vertrages fort. Sämtliche Personen, die auftragsgemäß personenbezogene Daten des Auftraggebers verarbeiten können, sind schriftlich zur Vertraulichkeit verpflichtet und über die sich aus diesem Auftrag ergebenden besonderen Datenschutzpflichten sowie über die bestehende Weisungs- und Zweckbindung belehrt.",
      "4.5 Berufsgeheimnis (§ 203 StGB). Der Auftraggeber unterliegt als Ärzt:in der ärztlichen Schweigepflicht. Der Auftragnehmer und alle bei ihm tätigen Personen, die im Rahmen dieses Auftrags Zugang zu Patient:innendaten erlangen können, sind „sonstige mitwirkende Personen\" im Sinne des § 203 Abs. 3 Satz 2 StGB. Der Auftragnehmer verpflichtet sich und diese Personen gemäß § 203 Abs. 4 Satz 2 Nr. 1 StGB zur Geheimhaltung und belehrt sie über die Strafbarkeit einer unbefugten Offenbarung. Er nimmt Kenntnis von Patient:innendaten nur, soweit dies für die Erbringung der Leistung erforderlich ist, insbesondere im Rahmen einer vom Auftraggeber beantragten Schlüsselwiederherstellung nach Anhang 3. Unterauftragnehmer, die Zugang zu Patient:innendaten erlangen können, verpflichtet er entsprechend.",
      `4.6 Der Auftragnehmer benennt dem Auftraggeber eine Ansprechperson für den Datenschutz: ${AVV_PROVIDER.privacyContact}, ${AVV_PROVIDER.contact}. Einen Wechsel teilt er dem Auftraggeber unverzüglich in Textform mit. Ein:e Datenschutzbeauftragte:r ist beim Auftragnehmer nach § 38 BDSG nicht zu benennen; sollte sich dies ändern, teilt er die Kontaktdaten mit.`,
      "4.7 Der Auftragnehmer unterrichtet den Auftraggeber unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnis, über jede Verletzung des Schutzes personenbezogener Daten des Auftraggebers sowie über jeden Verstoß, den er selbst oder eine bei ihm beschäftigte Person gegen Vorschriften zum Schutz personenbezogener Daten des Auftraggebers oder gegen die im Vertrag getroffenen Festlegungen begeht. Die Mitteilung enthält die Angaben nach Art. 33 Abs. 3 DSGVO, soweit bekannt. Der Auftragnehmer trifft die erforderlichen Maßnahmen zur Sicherung der Daten und zur Minderung möglicher nachteiliger Folgen für die Betroffenen und spricht sich hierzu unverzüglich mit dem Auftraggeber ab.",
    ],
  },
  {
    heading: "5 Pflichten des Auftraggebers",
    body: [
      "5.1 Der Auftraggeber ist für die Beurteilung der Zulässigkeit der Datenverarbeitung sowie für die Wahrung der Rechte der Betroffenen verantwortlich. Er trägt in seinem Verantwortungsbereich dafür Sorge, dass die gesetzlich notwendigen Voraussetzungen geschaffen werden, damit der Auftragnehmer die vereinbarten Leistungen rechtsverletzungsfrei erbringen kann. Dazu gehört die Information der Patient:innen nach Art. 13 DSGVO über den Einsatz des Auftragnehmers.",
      "5.2 Der Auftraggeber informiert den Auftragnehmer unverzüglich und vollständig, wenn er bei der Prüfung der Auftragsergebnisse Fehler oder Unregelmäßigkeiten hinsichtlich datenschutzrechtlicher Bestimmungen feststellt.",
      "5.3 Der Auftraggeber behandelt alle im Rahmen des Vertragsverhältnisses erlangten Kenntnisse von Betriebsgeheimnissen und Datensicherheitsmaßnahmen des Auftragnehmers vertraulich. Diese Verpflichtung besteht auch nach Beendigung des Vertragsverhältnisses fort.",
      "5.4 Der Auftraggeber stellt sicher, dass die aus Art. 32 DSGVO folgenden Anforderungen an die Sicherheit der Verarbeitung auf seiner Seite eingehalten werden. Dies betrifft insbesondere die Vertraulichkeit seines Passworts, die Sicherheit der Endgeräte und Browser, mit denen auf die Anwendung zugegriffen wird, und die Beschränkung des Zugangs auf berechtigte Personen seiner Praxis.",
      "5.5 Der Auftraggeber ist für die Einhaltung der für ihn geltenden Aufbewahrungspflichten verantwortlich (insbesondere § 630f Abs. 3 BGB, § 147 AO, § 14b UStG). Er exportiert seine Daten vor Beendigung des Hauptvertrags über die dafür vorgesehenen Funktionen der Anwendung (Ziffer 9.4).",
    ],
  },
  {
    heading: "6 Unterauftragsverhältnisse",
    body: [
      "6.1 Der Auftragnehmer erbringt die vertraglich vereinbarten Leistungen unter Einschaltung der in Anhang 2 genannten Unterauftragnehmer. Der Auftraggeber stimmt deren Einschaltung mit Abschluss dieser Vereinbarung zu.",
      "6.2 Der Auftragnehmer darf weitere Unterauftragnehmer hinzuziehen oder bestehende ersetzen, wenn er den Auftraggeber hiervon mindestens vier Wochen vor der Beauftragung in Textform (E-Mail an die Adresse des Kontos) in Kenntnis setzt und dieser nicht innerhalb dieser Frist aus einem wichtigen datenschutzrechtlichen Grund widerspricht. Widerspricht der Auftraggeber und ist dem Auftragnehmer die Leistungserbringung ohne den Unterauftragnehmer nicht zumutbar, kann jede Partei den Hauptvertrag mit einer Frist von vier Wochen kündigen. Der Auftragnehmer wählt Unterauftragnehmer sorgfältig nach deren Eignung und Zuverlässigkeit aus.",
      "6.3 Der Auftragnehmer verpflichtet jeden von ihm eingeschalteten Unterauftragnehmer entsprechend den Regelungen dieser Vereinbarung. Er stellt sicher, dass jedem Unterauftragnehmer dieselben Datenschutzpflichten auferlegt werden wie dem Auftragnehmer selbst.",
      "6.4 Soll ein Unterauftragnehmer in einem Drittland eingeschaltet werden, so stellt der Auftragnehmer sicher, dass bei diesem ein angemessenes Datenschutzniveau gewährleistet ist. Geht die Einschaltung des Unterauftragnehmers mit einem Drittlandtransfer einher, so schließt der Auftragnehmer mit dem Unterauftragnehmer die Standardvertragsklauseln (Durchführungsbeschluss (EU) 2021/914) in der jeweils aktuellen Fassung ab oder stützt den Transfer auf einen Angemessenheitsbeschluss der Kommission.",
      "6.5 Der Auftragnehmer weist dem Auftraggeber auf Verlangen nach, dass er die vorgenannten Vereinbarungen mit seinen Unterauftragnehmern abgeschlossen hat.",
    ],
  },
  {
    heading: "7 Verarbeitung in Drittländern",
    body: [
      "7.1 Der Auftragnehmer verarbeitet und speichert die Daten des Auftraggebers ausschließlich auf Servern innerhalb der EU oder des EWR (Datenbank und Authentifizierung: Region Irland).",
      "7.2 Eine Übermittlung personenbezogener Daten an einen Empfänger mit Sitz außerhalb des EWR ist nur unter den Voraussetzungen der Art. 44 ff. DSGVO zulässig. Soweit Unterauftragnehmer ihren Sitz in einem Drittland haben, die Daten aber im EWR verarbeiten (Anhang 2), stützt der Auftragnehmer einen etwaigen Zugriff aus dem Drittland, etwa zu Supportzwecken, auf die EU-Standardvertragsklauseln oder den Angemessenheitsbeschluss für das EU-US Data Privacy Framework. Die Patient:innendaten liegen dabei in jedem Fall nur verschlüsselt vor (Anhang 3).",
    ],
  },
  {
    heading: "8 Kontroll- und Nachweisrechte des Auftraggebers",
    body: [
      "8.1 Der Auftraggeber kann sich davon überzeugen, dass die Maßnahmen des Auftragnehmers angemessen sind, um die technischen und organisatorischen Erfordernisse der für die Auftragsverarbeitung einschlägigen Gesetze über den Datenschutz einzuhalten. Der Nachweis erfolgt vorrangig durch die Beschreibung der Maßnahmen in Anhang 3, durch Auskunft in Textform sowie durch Nachweise und Zertifizierungen der Unterauftragnehmer (z. B. SOC 2, ISO 27001).",
      "8.2 Eine Prüfung in den Betriebsstätten des Auftragnehmers ist bei begründetem Anlass möglich. Sie setzt eine rechtzeitige Anmeldung in Textform mit einer Frist von mindestens zwei Wochen voraus; sie erfolgt zu den üblichen Geschäftszeiten und ohne Störung des Betriebsablaufs. Die Verarbeitung findet technisch bei den in Anhang 2 genannten Unterauftragnehmern statt; dort gelten deren Prüfregelungen.",
      "8.3 Der Auftragnehmer ist verpflichtet,",
      { items: [
        "(a) die Kontrollen des Auftraggebers nach diesem Vertrag zu dulden,",
        "(b) Mitwirkungsleistungen zu erbringen, soweit diese für die Kontrolle des Auftraggebers nach diesem Vertrag erforderlich sind, und",
        "(c) dem Auftraggeber auf Anforderung in Textform innerhalb einer angemessenen Frist, spätestens nach vier Wochen, alle Informationen zur Verfügung zu stellen, die zum Nachweis der Einhaltung der Anforderungen des Art. 28 DSGVO sowie der Anforderungen aus dieser Vereinbarung erforderlich sind.",
      ] },
      "8.4 Auf Anforderung legt der Auftragnehmer das Protokoll der Schlüsselwiederherstellungen vor, soweit es das Konto des Auftraggebers betrifft (Anhang 3 Ziffer 2).",
    ],
  },
  {
    heading: "9 Berichtigung, Einschränkung der Verarbeitung, Löschung und Rückgabe",
    body: [
      "9.1 Der Auftraggeber berichtigt, löscht und exportiert die vertragsgegenständlichen Daten während der laufenden Beauftragung selbst über die Funktionen der Anwendung. Der Auftragnehmer nimmt eigene Berichtigungen, Löschungen oder Einschränkungen nur auf Weisung des Auftraggebers vor.",
      "9.2 Nach Beendigung des Hauptvertrags löscht der Auftragnehmer sämtliche Daten des Auftraggebers einschließlich des verschlüsselten Datenbestands und der hinterlegten Schlüssel innerhalb von 30 Tagen, sofern nicht eine gesetzliche Aufbewahrungspflicht des Auftragnehmers entgegensteht. Sicherungskopien (Backups) werden spätestens sieben Tage nach der Löschung überschrieben. Auf Anforderung bestätigt der Auftragnehmer die Löschung in Textform.",
      "9.3 Der Auftraggeber kann vor Ablauf der Frist nach 9.2 die Fortdauer der Speicherung bis zu einem benannten Datum verlangen, höchstens jedoch für drei Monate, um den Export abzuschließen.",
      "9.4 Die Anwendung stellt dem Auftraggeber Exportfunktionen bereit (Rechnungen und Dokumente als PDF, Patient:innendaten als Datei). Der Export erfolgt im Browser des Auftraggebers in entschlüsselter Form; der Auftragnehmer erhält davon keine Kenntnis.",
      "9.5 Dokumentationen, die dem Nachweis der auftrags- und ordnungsgemäßen Datenverarbeitung dienen (insbesondere das Protokoll der Schlüsselwiederherstellungen und die Nachweise über den Abschluss dieser Vereinbarung), bewahrt der Auftragnehmer entsprechend den gesetzlichen Aufbewahrungsfristen über das Vertragsende hinaus auf und speichert sie lediglich für diese Zwecke.",
    ],
  },
  {
    heading: "10 Haftung",
    body: [
      "Hinsichtlich der Haftung wird auf Art. 82 DSGVO verwiesen. Im Übrigen gelten die Haftungsregelungen des Hauptvertrags.",
    ],
  },
  {
    heading: "11 Abschluss in elektronischer Form und Schlussbestimmungen",
    body: [
      `11.1 Diese Vereinbarung wird gemäß Art. 28 Abs. 9 DSGVO in elektronischer Form geschlossen. Der Auftraggeber schließt sie ab, indem er bei der ersten Anmeldung nach Bereitstellung dieser Fassung die Erklärung „Ich schließe den Auftragsverarbeitungsvertrag (Version ${AVV_VERSION}) ab\" durch Setzen eines gesonderten Kontrollkästchens aktiv bestätigt. Vor der Bestätigung kann die Vereinbarung vollständig gelesen und als PDF gespeichert werden.`,
      "11.2 Der Auftragnehmer dokumentiert den Abschluss mit Kontokennung, Version und Prüfsumme des Dokuments sowie Zeitpunkt der Bestätigung und stellt dem Auftraggeber die abgeschlossene Fassung mit diesen Angaben in der App zum Abruf bereit.",
      "11.3 Änderungen dieser Vereinbarung, insbesondere der Anhänge, teilt der Auftragnehmer dem Auftraggeber in Textform mit. Änderungen, die die Pflichten der Parteien nicht zum Nachteil des Auftraggebers verändern (etwa die Anpassung der Maßnahmen in Anhang 3 an den Stand der Technik), gelten mit der Mitteilung. Alle übrigen Änderungen bedürfen einer erneuten Bestätigung nach 11.1 unter neuer Versionsnummer.",
      "11.4 Die Einrede des Zurückbehaltungsrechts i.S.v. § 273 BGB wird hinsichtlich der für den Auftraggeber verarbeiteten Daten ausgeschlossen.",
      "11.5 Nebenabreden bedürfen der Textform.",
      "11.6 Sind einzelne Teile dieser Vereinbarung unwirksam, so berührt dies die Wirksamkeit der Vereinbarung im Übrigen nicht.",
      "11.7 Es gilt deutsches Recht. Gerichtsstand ist, soweit der Auftraggeber Kaufmann oder Unternehmer ist, der Sitz des Auftragnehmers.",
    ],
  },
  {
    heading: "Anhang 1: Angaben zur Datenverarbeitung",
    body: [
      { table: { rows: [
        ["Gegenstand, Art und Zweck der Verarbeitung", "Bereitstellung und Betrieb der Web-Anwendung „EPHIA Patient:innenmanagement\" zur Verwaltung von Patient:innen, Behandlungsdokumentation, Aufklärungsbögen, Honorarvereinbarungen, Gutscheinen und Rechnungsstellung nach GOÄ für die Praxis des Auftraggebers. Speicherung der vom Auftraggeber im Browser verschlüsselten Daten, Authentifizierung der Nutzer:innen, tägliche Sicherung, Support. Wiederherstellung des Datenschlüssels nur auf Antrag des Auftraggebers (Anhang 3)."],
        ["Art der personenbezogenen Daten", "Patient:innenstammdaten: Name, Anschrift, Geburtsdatum, E-Mail-Adresse, Telefonnummer. Behandlungsdaten: Behandlungsdokumentation mit Präparaten, Dosierungen und Einstichstellen, Anamnese, Aufklärungsbögen mit Unterschrift, Fotos, Notizen. Abrechnungsdaten: GOÄ-Ziffern, Diagnosen, Beträge, Rechnungsnummern, Zahlungsstatus. Diese Daten enthalten Gesundheitsdaten im Sinne des Art. 9 DSGVO. Sie liegen beim Auftragnehmer ausschließlich verschlüsselt vor. Unverschlüsselt: Nutzungsereignisse der Anwendung (Art des Ereignisses, Zeitpunkt, Konto) zur Fehleranalyse."],
        ["Kategorien betroffener Personen", "Patient:innen des Auftraggebers. Nutzer:innen des Kontos (Auftraggeber und von ihm berechtigte Praxismitarbeitende)."],
        ["Dauer", "Für die Laufzeit des Hauptvertrags; Löschung nach Ziffer 9."],
      ] } },
    ],
  },
  {
    heading: "Anhang 2: Unterauftragnehmer",
    body: [
      "Für die Leistungserbringung werden die nachstehend aufgeführten Unterauftragnehmer eingesetzt.",
      { table: { head: ["Unterauftragnehmer und Anschrift", "Erbrachte Datenverarbeitung", "Ort der Leistungserbringung", "Grundlage"], rows: [
        ["Supabase, Inc., 970 Toa Payoh North #07-04, Singapore 318992", "Datenbank, Authentifizierung (E-Mail-Adresse und Passwort-Hash des Kontos, Versand der Anmelde- und Passwort-E-Mails), Speicherung der verschlüsselten Daten, tägliche Sicherungen", "Irland (AWS eu-west-1)", "Data Processing Addendum von Supabase mit EU-Standardvertragsklauseln"],
        ["GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA", "Auslieferung der Anwendung als statische Dateien (GitHub Pages); dabei werden IP-Adressen der Nutzer:innen in Serverprotokollen verarbeitet, keine Inhaltsdaten", "USA / weltweite Auslieferung", "GitHub Data Protection Agreement mit EU-Standardvertragsklauseln, EU-US Data Privacy Framework"],
        ["Bitwarden, Inc., 1 North Calle Cesar Chavez, Suite 102, Santa Barbara, CA 93103, USA", "Verwahrung des privaten Wiederherstellungsschlüssels des Auftragnehmers (Anhang 3); keine Verarbeitung von Daten des Auftraggebers", "USA (Ende-zu-Ende-verschlüsselter Tresor)", "Bitwarden Data Processing Addendum"],
      ] } },
    ],
  },
  {
    heading: "Anhang 3: Technische und organisatorische Maßnahmen",
    body: [
      `Stand: ${AVV_DATE}. Die Maßnahmen beschreiben den tatsächlichen Betrieb der Anwendung.`,
      "1 Verschlüsselung der Patient:innendaten (Art. 32 Abs. 1 lit. a DSGVO)",
      { items: [
        "Alle Patient:innen-, Behandlungs- und Dokumentdaten werden im Browser des Auftraggebers mit AES-256-GCM verschlüsselt, bevor sie an den Server übertragen werden. Auf dem Server und in den Sicherungen liegen ausschließlich verschlüsselte Daten.",
        "Jedes Konto hat einen eigenen Datenschlüssel (Master Encryption Key, MEK). Er wird mit einem aus dem Passwort des Auftraggebers abgeleiteten Schlüssel (PBKDF2, 100.000 Iterationen, SHA-256) geschützt und nur im Browser des Auftraggebers entschlüsselt.",
        "Zur Zuordnung ohne Klartext werden E-Mail-Adressen von Patient:innen nur als Hash gespeichert.",
        "Der Auftragnehmer hat im laufenden Betrieb keinen Zugriff auf Patient:innendaten im Klartext.",
      ] },
      "2 Schlüsselwiederherstellung",
      { items: [
        "Der MEK jedes Kontos wird zusätzlich mit einem öffentlichen RSA-4096-Schlüssel des Auftragnehmers verschlüsselt (RSA-OAEP, an die Kontokennung gebunden) und im Profil gespeichert.",
        "Der zugehörige private Schlüssel wird nicht in der Datenbank und nicht auf Servern des Auftragnehmers gespeichert, sondern ausschließlich in einem Passwort-Tresor (Bitwarden-Organisation), auf den zwei benannte Personen des Auftragnehmers Zugriff haben.",
        `Eine Wiederherstellung erfolgt nur auf Antrag des Auftraggebers in Textform an ${AVV_PROVIDER.contact}, nachdem dieser sein Passwort über den E-Mail-Link zurückgesetzt hat. Der Auftragnehmer erzeugt daraus einen Einmalcode (acht Wörter, 48 Stunden gültig), der an die E-Mail-Adresse des Kontos gesendet wird. Der Datenschlüssel selbst wird dabei nicht übertragen und nicht gespeichert.`,
        "Jede Wiederherstellung wird mit Datum, Anfragekennung und ausführender Person protokolliert. Das Protokoll wird dem Auftraggeber auf Anforderung vorgelegt (Ziffer 8.4).",
      ] },
      "3 Zugangs- und Zugriffskontrolle",
      { items: [
        "Anmeldung mit E-Mail-Adresse und Passwort (mindestens 6 Zeichen; Empfehlung an den Auftraggeber: 12 Zeichen) über Supabase Auth; Passwörter werden nur als Hash gespeichert. Passwort-Zurücksetzung über einen zeitlich begrenzten E-Mail-Link.",
        "Zeilenbasierte Zugriffsregeln in der Datenbank (Row Level Security): jedes Konto kann ausschließlich seine eigenen Datensätze lesen und schreiben.",
        "Der Datenschlüssel verbleibt für die Dauer der Browsersitzung im Sitzungsspeicher und wird beim Abmelden und beim Schließen des Browsers gelöscht. Optionale automatische Abmeldung nach Inaktivität und Praxis-PIN für Aufklärungsbögen auf gemeinsam genutzten Geräten.",
        "Administrative Zugangsdaten zur Datenbank (Service-Schlüssel) sind nicht in der Anwendung hinterlegt und werden nur für einzelne, dokumentierte Wartungsarbeiten durch benannte Personen genutzt.",
      ] },
      "4 Übertragungskontrolle",
      { items: ["Jede Verbindung zwischen Browser, Anwendung und Datenbank ist TLS-verschlüsselt."] },
      "5 Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b und c DSGVO)",
      { items: [
        "Tägliche Sicherung der Datenbank beim Unterauftragnehmer Supabase, Aufbewahrung sieben Tage, Rechenzentrum in Irland.",
        "Der Auftraggeber kann seine Daten jederzeit selbst exportieren (Ziffer 9.4).",
      ] },
      "6 Trennung",
      { items: ["Daten verschiedener Auftraggeber sind logisch durch die Kontokennung und die Zugriffsregeln getrennt und mit jeweils eigenen Schlüsseln verschlüsselt."] },
      "7 Organisation",
      { items: [
        "Alle Personen beim Auftragnehmer mit möglichem Zugang zu Daten des Auftraggebers sind schriftlich zur Vertraulichkeit und nach § 203 StGB verpflichtet (Ziffer 4.4 und 4.5).",
        "Änderungen an Verschlüsselung und Schlüsselverwaltung werden vor der Einführung dokumentiert und mit Testkonten geprüft; sie werden nie an Daten von Auftraggebern erprobt.",
        "Sicherheitsvorfälle werden nach Ziffer 4.7 gemeldet.",
      ] },
    ],
  },
];

// Flat text of the contract for the hash recorded with every acceptance.
// The party block is not part of it (it carries the practice's own data).
export function avvCanonicalText() {
  const lines = [`AVV ${AVV_VERSION} (${AVV_DATE})`];
  for (const s of AVV_SECTIONS) {
    lines.push(s.heading);
    for (const b of s.body) {
      if (typeof b === "string") lines.push(b);
      else if (b.items) lines.push(...b.items);
      else if (b.table) { if (b.table.head) lines.push(b.table.head.join(" | ")); for (const r of b.table.rows) lines.push(r.join(" | ")); }
    }
  }
  return lines.join("\n");
}

export async function avvDocumentHash() {
  const data = new TextEncoder().encode(avvCanonicalText());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
