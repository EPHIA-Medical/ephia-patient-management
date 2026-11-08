# Dermalfiller als Behandlungstyp in der Rechnungs-App

Stand: 08.11.2026. Entwurf zur medizinischen und abrechnerischen Freigabe durch Sophia. Technische Umsetzung folgt erst nach Freigabe.

## 1. Worum es geht

Die Rechnungs-App bildet heute eine Behandlung ab: Botulinumtoxin A, ästhetisch oder mit medizinischer Indikation. Dermalfiller sollen als zweiter Behandlungstyp dazukommen, mit eigenem Aufklärungsbogen, eigener Behandlungsdoku und eigener Rechnungslogik.

Grundlage für diesen Entwurf ist der Thieme-Compliance-Bogen "Gewebeunterspritzung im Gesichtsbereich (Dermalfiller)", PO 6/Derma 26, Stand 07/2016. Der Bogen liefert die medizinische Struktur. Er enthält keine Abrechnungsinhalte, dafür macht dieser Entwurf Vorschläge.

Zwei Einschränkungen vorab:

- Im Scan fehlt Seite 4 von 6. Sie ist angefragt. Vermutlich steht dort der Rest der Verhaltenshinweise. Der Entwurf wird ergänzt, sobald die Seite da ist.
- Der Thieme-Text ist urheberrechtlich geschützt und nicht für Software lizenziert. Wie beim Botulinum-Bogen (Version 3.0) schreiben wir den Aufklärungstext selbst. Der Thieme-Bogen dient nur als inhaltliche Checkliste.

## 2. Was der Thieme-Bogen liefert

**Behandlungsregionen** (Ankreuzliste und Gesichtsschema): Stirnfalten, Zornesfalten, Krähenfüße, Lachfalten im Wangenbereich, Falten im Lippenbereich, Aknenarben, Gewebeschwund im Gesicht, andere Falten/Gewebedefekte.

**Substanzklassen**: körpereigen (Eigenfett, Bindegewebe, PRP), naturidentisch (Hyaluronsäure, Calciumhydroxylapatit, Polymilchsäure), künstlich und nicht resorbierbar (mikroverkapselte Kunststoffkügelchen). Der Bogen rät zu einer Zuordnung des Präparats bereits in der Aufklärung ("Zu verwendende Substanzen").

**Risiken**, die der Bogen hervorhebt und die in unseren Text müssen: Rötung, Schwellung, Hämatom, Infektion, Herpes-Reaktivierung, Granulome, Fibrosen, Allergie bis Schock, Tyndall-Effekt, Gefäßverschluss mit Hautnekrose, in Ausnahmefällen Sehstörungen bis Erblindung, Nasenspitzennekrose, Über- und Unterkorrektur, Auflösung von Hyaluronsäure mit Hyaluronidase, fehlende Langzeitdaten bei nicht resorbierbaren Materialien.

**Anamnese**: 14 Fragen plus Zusatzfrage Schwangerschaft. Deckungsgleich mit unserer Botulinum-Anamnese bis auf Nerven- und Muskelerkrankungen, die beim Filler keine Rolle spielen.

**Einwilligung, Ablehnung, Vermerke der Ärzt:in, Verhaltenshinweise** vor und nach der Behandlung. Alles Slots, die die App heute schon hat.

## 3. Was der Bogen nicht liefert

GOÄ-Ziffern, Preise, Präparateliste, Einheiten, Chargendokumentation, Umgang mit Hyaluronidase. Dafür stehen unten Vorschläge, die Sophia bestätigen oder korrigieren soll.

## 4. Vorschlag Abrechnung

### GOÄ-Ziffern

| Ziffer | Leistung | Punkte | Einfachsatz | Einsatz beim Filler |
|---|---|---|---|---|
| 1 | Beratung | 80 | 4,66 € | wie heute, 2,3-fach Regelhöchstsatz |
| 5 | Symptombezogene Untersuchung | 80 | 4,66 € | wie heute |
| 267 | Medikamentöse Infiltrationsbehandlung, eine Körperregion, je Sitzung | 80 | 4,66 € | Standard für die Filler-Injektion |
| 268 | Medikamentöse Infiltrationsbehandlung, mehrere Körperregionen, je Sitzung | 130 | 7,58 € | statt 267, wenn mehrere Regionen behandelt werden |
| 490 | Infiltrationsanästhesie kleiner Bezirke | 60 | 3,50 € | nur bei echter Infiltrationsanästhesie, optional |
| 491 | Infiltrationsanästhesie großer Bezirke | 120 | 6,99 € | optional, siehe oben |

Offen ist, ob das Gesicht als eine Körperregion gilt (dann immer 267) oder ob Lippen, Wangen und Kinn in einer Sitzung die 268 rechtfertigen. Abrechnungsstellen sehen das unterschiedlich. Vorschlag: 267 als Standard, 268 wählbar mit Hinweistext. Betäubungscreme ist nicht gesondert abrechenbar und bleibt draußen. Lidocain im Filler selbst ist Teil des Präparats, keine eigene Anästhesieleistung.

Wie beim Botulinum reichen die Ziffern auch zum 3,5-fachen Satz nicht an übliche Filler-Preise heran. Der gewünschte Gesamtbetrag wird deshalb praktisch immer eine Honorarvereinbarung nach § 2 GOÄ brauchen. Die bestehende HV-Logik (vor der Behandlung unterschrieben, Ziffern und Sätze gedeckelt) gilt unverändert.

### Sachkosten

Filler sind CE-zertifizierte Medizinprodukte der Klasse III, keine Arzneimittel. Die Spritze wird als Auslage nach § 10 Abs. 1 GOÄ in tatsächlicher Höhe weiterberechnet, ohne Aufschlag. Anders als eine Botulinum-Ampulle kann eine angebrochene Fillerspritze nicht bei einer anderen Person weiterverwendet werden. Daher:

- Einheit ist die Spritze (0,5 ml, 0,55 ml, 1 ml, 1,2 ml je nach Produkt), nicht der anteilige Milliliter.
- Die Rechnungszeile lautet "1 Spritze [Präparat] 1 ml" mit dem Einkaufspreis als Auslage.
- Die Ampullen-Logik aus der Botulinum-Rechnung (ganze Ampulle vs. Einheiten) entfällt beim Filler.

### Umsatzsteuer

Ästhetische Indikation: 19 % USt wie heute, § 4 Nr. 14 UStG greift nicht. Medizinische Indikation ist beim Filler selten, aber möglich. Vorschlag für die ICD-Liste beim Filler, zur Bestätigung:

| Diagnose | ICD-10 |
|---|---|
| Lipodystrophie, z.B. HIV-assoziierte Lipoatrophie | E88.1 |
| Narben und Fibrosen der Haut, z.B. Aknenarben, Narbenkorrektur nach Trauma | L90.5 |
| Hemiatrophia faciei (Parry-Romberg) | G51.8 |

Die Masseter-, Migräne- und Hyperhidrose-Diagnosen der Botulinum-Liste werden beim Filler nicht angezeigt.

## 5. Vorschlag Aufklärungsbogen (Template filler_v1)

Eigener Text in der Sie-Form wie beim Botulinum-Bogen 3.0, gleiche Abschnittsstruktur:

1. Zu diesem Aufklärungsbogen
2. Was sind Dermalfiller und wie wirken sie (Substanzklassen, Abbaubarkeit, Wirkdauer)
3. Ablauf der Behandlung (Nadel oder Kanüle, Betäubung, Massage, Mehrfachsitzungen)
4. Wann darf nicht behandelt werden (Schwangerschaft, Stillzeit, aktive Hautinfektion, Herpes, Autoimmunerkrankung je nach Abwägung, bekannte Allergie gegen Präparat oder Lidocain, permanente Filler in der Region)
5. Zulassung (Medizinprodukt, kein Arzneimittel, Off-Label gibt es hier nicht in der Form)
6. Kosten
7. Erfolgsaussichten (Wirkdauer je Substanz, Nachbehandlung, keine Garantie)
8. Mögliche Risiken und Nebenwirkungen (vollständige Liste aus Abschnitt 2, Gefäßverschluss und Erblindung ausdrücklich, Hyaluronidase als Korrekturmöglichkeit nur bei Hyaluronsäure)
9. Andere Möglichkeiten (Botulinumtoxin, Laser, Peeling, Fäden, operative Verfahren, Eigenfett)
10. Was Sie vor und nach der Behandlung beachten sollten (Blutverdünner, Alkohol, Sport, Hitze, Make-up, Massage, Zahnbehandlungen in den ersten Wochen)

**Anamnesefragen**: die Liste aus Botulinum 3.0 ohne die Fragen zu Nerven- und Muskelerkrankungen und Lidschwäche, dafür zusätzlich:

- Wurden Sie schon einmal mit Fillern behandelt? Wenn ja, welches Präparat, wann, und gab es Komplikationen?
- Wurde bei Ihnen jemals ein nicht abbaubarer (permanenter) Filler verwendet?
- Haben Sie eine Autoimmunerkrankung oder nehmen Sie Medikamente, die das Immunsystem beeinflussen?
- Reagieren Sie allergisch auf Lidocain oder andere örtliche Betäubungsmittel?
- Reagieren Sie allergisch auf Bienen- oder Wespenstiche? (Hinweis auf mögliche Kreuzreaktion bei Hyaluronidase)
- Sind in den nächsten vier Wochen Zahnbehandlungen oder Operationen geplant?
- Neigen Sie zu Herpes im Gesicht?

Fragen zu Blutverdünnern, Blutungsneigung, Wundheilung, Keloiden, Infektionskrankheiten, Herz-Kreislauf, Stoffwechsel, Psyche, früheren Eingriffen im Gesicht, Rauchen, Schwangerschaft und Stillzeit bleiben wie beim Botulinum.

**Geplante Behandlung**: "Unterspritzung von Falten oder Volumendefiziten im Gesicht mit [Substanzklasse]." Präparat und Regionen werden aus der Aufklärung in die Behandlungsdoku übernommen.

## 6. Vorschlag Behandlungsdoku

Die bestehende Behandlungsdoku mit Gesichtsschema, Markern, Linien und Fächern bleibt. Änderungen für den Filler:

- **Einheit** pro Präparat: ml statt SE. Pro Punkt oder Linie wird die Menge in ml dokumentiert, die Summe läuft gegen die Spritzengröße.
- **Regionenliste** als Vorauswahl: die Liste des Thieme-Bogens ist von 2016. Vorschlag, sie um die heute üblichen Regionen zu ergänzen: Nasolabialfalten, Marionettenfalten, Kinn, Jawline, Tränenrinne, Wangen und Mittelgesicht, Schläfen, Nase, Lippen (Volumen und Kontur), Hals. Sophia entscheidet, welche in den Kurs passen.
- **Chargennummer** pro Spritze als neues Pflichtfeld. Filler sind Medizinprodukte der Klasse III, die Rückverfolgbarkeit der Charge gehört in die Behandlungsdokumentation nach § 630f BGB. Beim Botulinum ist das Feld optional, beim Filler soll die App ohne Charge nicht speichern.
- **Technik** pro Präparat optional: Nadel oder Kanüle, Injektionstiefe. Kein Pflichtfeld.
- **Zeitpunkt der Nachkontrolle** optional, Standard zwei Wochen.

## 7. Hyaluronidase

Der Thieme-Bogen nennt Hyaluronidase als Korrekturmöglichkeit. Für die App sind zwei Fälle zu unterscheiden:

- **Notfall** (Gefäßverschluss): eigene Behandlungsdoku-Zeile mit Präparat Hyaluronidase, Einheit I.E., Zeitstempel. Keine Rechnung. Der Aufklärungstext muss den Notfalleinsatz abdecken, damit im Notfall keine gesonderte Einwilligung nötig ist.
- **Geplante Korrektur** (Überkorrektur, Unzufriedenheit): eigene Aufklärung, da Hyaluronidase selbst Allergierisiken hat. Ob dafür eine Rechnung gestellt wird oder die Korrektur in den Preis der Erstbehandlung eingeschlossen ist, ist eine Produktentscheidung. Vorschlag: Rechnung möglich, aber Standard ist "ohne Berechnung", die Ärzt:in schaltet das aktiv um.

## 8. Fragen an Sophia

1. Stimmt der GOÄ-Satz 1, 5, 267 für die Standard-Filler-Sitzung mit dem überein, was im Kurs gelehrt wird? Wann 268?
2. Sollen 490 und 491 überhaupt angeboten werden, oder reicht in der Praxis Lidocain im Filler plus Creme?
3. Ist die ICD-Liste für medizinische Indikationen richtig und vollständig genug für den Kursalltag?
4. Welche Regionen sollen in der Vorauswahl stehen? Welche gehören nicht in den Kurs (z.B. Nase, Tränenrinne als Hochrisikoregionen)?
5. Passen die zusätzlichen Anamnesefragen? Fehlt etwas, etwa Fragen zu Fadenlifting oder Implantaten im Gesicht?
6. Welche Präparate sollen als Vorschlagsliste hinterlegt werden (Hersteller, Produktlinie, Spritzengrößen)?
7. Hyaluronidase: eigene Aufklärung als Template, oder Abschnitt im Filler-Bogen?
8. Soll die Chargennummer wirklich Pflicht sein, oder reicht eine deutliche Warnung?

## 9. Umsetzung nach Freigabe

Kurz für Marc, in der Reihenfolge der Abhängigkeiten:

1. Behandlungstyp "filler" neben "botox" an Rechnung, HV, Aufklärungsbogen und Behandlungsdoku. GOÄ-Set und ICD-Liste je Typ in den Konstanten.
2. Template filler_v1 in den Consent-Templates, gleicher Aufbau wie botox_v3.
3. Präparat-Modell um Chargennummer und Spritzengröße erweitern, Einheit ml als Standard beim Filler, Ampullen-Logik nur bei Botulinum anzeigen.
4. Rechnungszeilen: Spritze als Auslage, Ziffernauswahl 267 oder 268, optional 490 oder 491.
5. Hyaluronidase als Präparat mit Einheit I.E. und Schalter "ohne Berechnung".
6. Tests für Rechnungssummen, HV-Prüfung und Template-Rendering mit dem neuen Typ.

Die Arbeit berührt den geteilten Checkout und wird in einem eigenen Branch gemacht.
