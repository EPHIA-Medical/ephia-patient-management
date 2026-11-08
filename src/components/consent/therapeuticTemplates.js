// ═══════════════════ Therapeutic Aufklärungsbögen (Botulinumtoxin A) ═══════════════════
//
// Written for EPHIA in our own words. Commercial forms were only used as a
// checklist of medically relevant topics. One Bogen per indication, so patients
// read only what concerns their treatment; the general parts are shared below.
// Medical content to be reviewed by the EPHIA Dozent:innen.

const INTRO = (krankheit) => ({
  type: "info",
  title: "Zu diesem Aufklärungsbogen",
  html: `<p>Bei Ihnen soll ${krankheit} mit Botulinumtoxin A behandelt werden. Dieser Bogen bereitet Sie auf das persönliche Aufklärungsgespräch vor und hält die wichtigsten Punkte schriftlich fest. Das Gespräch mit Ihrer Ärztin oder Ihrem Arzt ersetzt er nicht.</p><p>Bitte lesen Sie den Text in Ruhe und beantworten Sie die Fragen am Ende vollständig und ehrlich. Notieren Sie sich alles, was Sie im Gespräch noch klären möchten.</p>`,
});

const WIRKUNG = (zusatz) => ({
  type: "info",
  title: "Wie wirkt Botulinumtoxin A?",
  html: `<p>Botulinumtoxin A ist ein von Bakterien gebildetes Eiweiß. In sehr kleinen, genau dosierten Mengen unterbricht es an der Einstichstelle die Übertragung von Nervensignalen: Nerven geben an dieser Stelle für einige Monate kaum noch den Botenstoff Acetylcholin ab. Dadurch entspannen sich die behandelten Muskeln, oder Drüsen, die über diesen Botenstoff gesteuert werden, arbeiten weniger.</p>${zusatz ? `<p>${zusatz}</p>` : ""}<p>Die Wirkung bleibt im Wesentlichen auf den behandelten Bereich begrenzt und lässt nach einigen Monaten von selbst nach, weil die Nervenenden neue Verbindungen bilden.</p>`,
});

const ALLGEMEINE_RISIKEN = {
  type: "info",
  title: "Allgemeine Risiken",
  html: `<p>Botulinumtoxin A ist in der Regel gut verträglich. Trotz aller Sorgfalt kann es zu Nebenwirkungen und Komplikationen kommen, die selten weitere Behandlungen erfordern und in Ausnahmefällen lebensbedrohlich sein können. Wie häufig sie auftreten, hängt unter anderem von Dosis, Behandlungsbereich, Vorerkrankungen und persönlichen Besonderheiten ab.</p><ul><li><strong>Schmerzen, Rötung, Schwellung und blaue Flecken</strong> an den Einstichstellen, meist nur für kurze Zeit. Wer blutverdünnende Medikamente einnimmt, bekommt leichter blaue Flecken.</li><li><strong>Allgemeinbeschwerden</strong> in den Tagen nach der Behandlung, etwa Kopfschmerzen, Müdigkeit, grippeähnliches Krankheitsgefühl, Übelkeit, Schwindel, Muskel- oder Gliederschmerzen, Mundtrockenheit oder Hautreaktionen. Sie klingen meist von selbst ab.</li><li><strong>Infektionen</strong> an den Einstichstellen sind selten und lassen sich meist gut behandeln. Sehr selten bildet sich ein Abszess, in Ausnahmefällen kann sich eine Infektion im Körper ausbreiten (Blutvergiftung).</li><li><strong>Verletzungen benachbarter Strukturen</strong> wie Nerven oder Blutgefäße sind selten. Missempfindungen wie Kribbeln oder Taubheit bilden sich meist zurück, können in Einzelfällen aber bleiben.</li><li><strong>Ausbreitung des Wirkstoffs:</strong> Erreicht der Wirkstoff benachbarte Muskeln, können diese vorübergehend geschwächt sein. Sehr selten breitet er sich weiter im Körper aus und führt zu allgemeiner Muskelschwäche, Schluck-, Sprech- oder Atemstörungen. Diese Beschwerden sind ein Notfall und können eine Behandlung im Krankenhaus bis hin zur künstlichen Beatmung erforderlich machen.</li><li><strong>Allergische Reaktionen</strong> auf den Wirkstoff, Hilfsstoffe, Desinfektionsmittel oder Latex, etwa Juckreiz, Ausschlag oder Schwellungen. Sehr selten kommt es zu einem allergischen Schock, der sofort notfallmedizinisch behandelt werden muss und in Einzelfällen bleibende Schäden (z.B. an Organen oder am Gehirn) hinterlassen kann.</li><li>Botulinumtoxin-Präparate enthalten geringe Mengen menschlichen Bluteiweißes (Humanalbumin). Ein Übertragungsrisiko von Krankheitserregern gilt als äußerst gering; Übertragungen sind bisher nicht bekannt geworden.</li></ul>`,
};

const ERFOLG = (spezifisch) => ({
  type: "info",
  title: "Erfolgsaussichten",
  html: `<p>${spezifisch}</p><p>Wie stark und wie lange die Behandlung wirkt, ist von Mensch zu Mensch verschieden; ein bestimmter Erfolg kann nicht zugesichert werden. Lässt die Wirkung nach, kehren die Beschwerden allmählich zurück, und die Behandlung kann wiederholt werden.</p><p>Nach wiederholten Behandlungen kann der Körper Antikörper gegen den Wirkstoff bilden. Die Wirkung hält dann kürzer an oder bleibt aus; manchmal hilft ein Wechsel des Präparats.</p>`,
});

const ZULASSUNG_KOSTEN = (text) => ({ type: "info", title: "Zulassung und Kosten", html: text });

const VERHALTEN = (nachher) => ({
  type: "info",
  title: "Was Sie vor und nach der Behandlung beachten sollten",
  html: `<p><strong>Vorher:</strong> Bitte geben Sie alle Medikamente an, die Sie einnehmen, auch pflanzliche und rezeptfreie, insbesondere blutverdünnende Mittel (z.B. ASS/Aspirin®, Clopidogrel, Marcumar®, Xarelto®, Eliquis®, Lixiana®, Pradaxa®, Heparin) und Medikamente gegen Diabetes. Setzen Sie verordnete Medikamente nicht eigenmächtig ab. Bringen Sie vorhandene Unterlagen mit, etwa Allergie-, Marcumar-, Diabetes- oder Implantatpass, Befunde oder Kopfschmerztagebuch.</p><p><strong>Nachher:</strong> ${nachher} Sollte nach der Behandlung Ihr Sehen, Ihre Kraft oder Ihre Reaktionsfähigkeit beeinträchtigt sein, fahren Sie bitte kein Fahrzeug, bedienen Sie keine Maschinen und treffen Sie keine wichtigen Entscheidungen, bis die Beschwerden abgeklungen sind.</p><p>Steht bei Ihnen eine Operation an, informieren Sie bitte die Narkoseärztin oder den Narkosearzt über die Behandlung: Botulinumtoxin kann die Wirkung muskelentspannender Narkosemedikamente verstärken.</p><p><strong>Bitte melden Sie sich sofort</strong> bei Ihrer Ärztin oder Ihrem Arzt oder beim Notdienst, wenn Sie Schluck-, Sprech- oder Atembeschwerden, eine ausgeprägte Muskelschwäche, Sehstörungen, Fieber über 38 °C oder Anzeichen einer Entzündung bemerken.</p>`,
});

// Questionnaire shared by all therapeutic Bögen (ids prefixed "th_")
const FRAGEN = [
  { id: "th_medikamente", label: "Nehmen Sie regelmäßig oder derzeit Medikamente ein, auch pflanzliche oder rezeptfreie?", details: "(z.B. blutverdünnende Mittel, Schmerz- oder Migränemittel, Antibiotika, Muskelrelaxanzien, Mittel gegen Diabetes)", followUp: "Wenn ja, welche?" },
  { id: "th_allergie", label: "Haben Sie eine Allergie oder Unverträglichkeit?", details: "(z.B. gegen Medikamente, Betäubungsmittel, Desinfektionsmittel, Latex, Jod, Pflaster)", followUp: "Wenn ja, welche?" },
  { id: "th_blutung", label: "Neigen Sie zu verstärkten Blutungen oder blauen Flecken?", details: "(z.B. häufiges Nasen- oder Zahnfleischbluten, lange Nachblutungen nach Verletzungen)" },
  { id: "th_blutung_familie", label: "Gibt es in Ihrer Blutsverwandtschaft eine erhöhte Blutungsneigung?" },
  { id: "th_herzkreislauf", label: "Haben oder hatten Sie eine Herz-Kreislauf-Erkrankung?", details: "(z.B. Bluthochdruck, Herzrhythmusstörungen, Herzinfarkt, Schlaganfall, Herzklappenfehler)", followUp: "Wenn ja, welche?" },
  { id: "th_implantate", label: "Tragen Sie Implantate?", details: "(z.B. Herzschrittmacher, Defibrillator, Stent, künstliches Gelenk)", followUp: "Wenn ja, welche?" },
  { id: "th_neuromuskulaer", label: "Haben Sie oder Ihre Blutsverwandten eine Erkrankung von Nerven oder Muskeln?", details: "(z.B. Myasthenia gravis, Lambert-Eaton-Syndrom, angeborene Muskelschwäche, Lähmungen, Epilepsie, Parkinson, Polyneuropathie)", followUp: "Wenn ja, welche?" },
  { id: "th_schlucken", label: "Haben Sie Probleme beim Schlucken?", details: "(z.B. bei Speichel, Flüssigkeiten oder fester Nahrung)" },
  { id: "th_atemnot", label: "Bekommen Sie schon bei leichter Anstrengung Atemnot oder haben Sie eine Lungenerkrankung?", followUp: "Wenn ja, welche?" },
  { id: "th_muskel_skelett", label: "Haben Sie eine Muskel- oder Skeletterkrankung?", details: "(z.B. Muskelschwäche, Gelenkerkrankung, Osteoporose)", followUp: "Wenn ja, welche?" },
  { id: "th_augen", label: "Haben Sie eine Augenerkrankung oder ein hängendes Oberlid?", details: "(z.B. Grüner oder Grauer Star, trockene Augen, Doppelbilder)", followUp: "Wenn ja, welche?" },
  { id: "th_infektion", label: "Haben oder hatten Sie eine Infektionskrankheit?", details: "(z.B. Hepatitis, HIV, Tuberkulose)", followUp: "Wenn ja, welche?" },
  { id: "th_immunsystem", label: "Haben Sie eine Erkrankung des Immunsystems oder nehmen Sie Medikamente, die das Immunsystem unterdrücken?", details: "(z.B. Rheuma, chronisch-entzündliche Darmerkrankung, Multiple Sklerose, Kortison)", followUp: "Wenn ja, welche?" },
  { id: "th_stoffwechsel", label: "Haben Sie eine Stoffwechsel- oder Schilddrüsenerkrankung?", details: "(z.B. Diabetes, Gicht, Über- oder Unterfunktion der Schilddrüse)", followUp: "Wenn ja, welche?" },
  { id: "th_psyche", label: "Haben Sie eine psychische Erkrankung?", details: "(z.B. Depression, Angststörung)", followUp: "Wenn ja, welche?" },
  { id: "th_wundheilung", label: "Hatten Sie schon einmal Wundheilungsstörungen oder wuchernde Narben (Keloide)?" },
  { id: "th_impfung", label: "Wurden Sie in den letzten zwei Wochen geimpft?", followUp: "Wenn ja, wogegen?" },
  { id: "th_operation", label: "Ist bei Ihnen in nächster Zeit eine Operation mit Narkose geplant?" },
  { id: "th_botox_vorher", label: "Wurden Sie schon einmal mit Botulinumtoxin behandelt?", followUp: "Wenn ja, gab es dabei Komplikationen?", subQuestion: true },
  { id: "th_weitere", label: "Haben Sie weitere Erkrankungen, die wir kennen sollten?", followUp: "Wenn ja, welche?" },
];

const FRAGEN_FRAUEN = [
  { id: "th_schwanger", label: "Könnten Sie schwanger sein?" },
  { id: "th_stillen", label: "Stillen Sie?" },
];

const EINWILLIGUNG = (behandlung) =>
  `Ich habe diesen Aufklärungsbogen gelesen und verstanden. In einem persönlichen Gespräch hat mich meine Ärztin oder mein Arzt über ${behandlung}, über Art, Ablauf und Notwendigkeit der Behandlung, über Alternativen, Risiken und mögliche Komplikationen, die Erfolgsaussichten, die Zulassung des Präparats für diese Anwendung sowie die Kostenübernahme informiert. Alle meine Fragen wurden vollständig und verständlich beantwortet.\n\nIch fühle mich ausreichend informiert, hatte genug Zeit zum Überlegen und willige in die geplante Behandlung ein. Ebenso willige ich in notwendige Begleitmaßnahmen ein, etwa die Desinfektion der Haut oder eine örtliche Betäubung.\n\nDie Fragen habe ich nach bestem Wissen vollständig beantwortet. Die Hinweise zum Verhalten vor und nach der Behandlung werde ich beachten.`;

const ABLEHNUNG = "Ich wurde über die geplante Behandlung aufgeklärt und habe diesen Aufklärungsbogen gelesen. Ich willige in die Behandlung nicht ein. Mir wurde erklärt, dass meine Ablehnung gesundheitliche Nachteile für mich haben kann.";

const base = (id, fields) => ({
  version: "1.0",
  questions: FRAGEN,
  additionalQuestionsWomen: FRAGEN_FRAUEN,
  refusalText: ABLEHNUNG,
  ...fields,
  id,
  title: `Aufklärungsbogen — ${fields.shortName}`,
});

// Section order: the PDF starts a new page at "Erfolgsaussichten"; the sections
// before it (intro, mode of action, procedure, risks) fill about one page.
export const THERAPEUTIC_TEMPLATES = [
  base("botulinum_migraene_v1", {
    name: "Behandlung der chronischen Migräne mit Botulinumtoxin A",
    shortName: "Botulinumtoxin bei chronischer Migräne",
    plannedTreatment: "Injektion von Botulinumtoxin A in die Muskulatur von Stirn, Schläfen, Hinterkopf, Nacken und Schultern zur vorbeugenden Behandlung der chronischen Migräne.",
    consentText: EINWILLIGUNG("die vorbeugende Behandlung meiner chronischen Migräne mit Botulinumtoxin A"),
    sections: [
      INTRO("Ihre chronische Migräne"),
      WIRKUNG("Bei chronischer Migräne wirkt Botulinumtoxin A vorbeugend: Es soll die Zahl der Kopfschmerztage und die Stärke der Anfälle verringern. Wie genau es dabei wirkt, ist noch nicht vollständig geklärt; vermutlich hemmt es auch die Freisetzung schmerzvermittelnder Botenstoffe. Eine chronische Migräne liegt vor, wenn an mindestens 15 Tagen im Monat Kopfschmerzen bestehen, davon an mindestens acht Tagen mit Migränemerkmalen."),
      { type: "info", title: "Ablauf der Behandlung", html: `<p>Die Behandlung erfolgt ambulant. Mit einer sehr feinen Nadel wird der Wirkstoff nach einem festen Schema an etwa 30 bis 40 Stellen in die Muskulatur von Stirn, Schläfen, Hinterkopf, Nacken und Schultern gespritzt. Die Einstiche fühlen sich meist wie kurze Piekser an. Die Behandlung dauert etwa 15 bis 20 Minuten und wird in der Regel alle zwölf Wochen wiederholt.</p><p>Führen Sie bitte vor und während der Behandlungszeit ein Kopfschmerztagebuch. Es hilft, die Wirkung zu beurteilen.</p>` },
      ALLGEMEINE_RISIKEN,
      { type: "info", title: "Besondere Risiken bei der Migränebehandlung", html: `<ul><li><strong>Nacken- und Muskelschmerzen</strong> sowie ein Steifheitsgefühl im Nacken, meist vorübergehend.</li><li><strong>Schwäche der Nacken- oder Schultermuskulatur</strong>, die das Halten des Kopfes vorübergehend erschweren kann.</li><li><strong>Vorübergehend verstärkte Kopfschmerzen</strong> oder Migräneanfälle in den ersten Tagen.</li><li><strong>Hängendes Oberlid, abgesenkte oder ungleich hohe Augenbrauen</strong> und veränderte Mimik der Stirn; seltener <strong>Doppelbilder</strong>.</li><li>Selten <strong>Schluckbeschwerden</strong>, wenn sich der Wirkstoff in benachbarte Muskeln ausbreitet.</li></ul><p>Diese Beschwerden klingen in der Regel innerhalb einiger Wochen ab.</p>` },
      ERFOLG("Die Wirkung setzt meist nach ein bis zwei Wochen ein und hält etwa drei Monate an. Ob die Behandlung Ihnen hilft, lässt sich oft erst nach zwei bis drei Behandlungen sicher beurteilen. Ziel ist, die Kopfschmerztage deutlich zu verringern; ganz ohne Kopfschmerzen sind die wenigsten Behandelten."),
      ZULASSUNG_KOSTEN(`<p>Ein Botulinumtoxin-A-Präparat ist zur vorbeugenden Behandlung der chronischen Migräne bei Erwachsenen zugelassen, wenn andere vorbeugende Behandlungen nicht ausreichend gewirkt haben oder nicht vertragen wurden. Andere Präparate werden in dieser Anwendung außerhalb ihrer Zulassung eingesetzt; darüber klärt Ihre Ärztin oder Ihr Arzt Sie dann gesondert auf.</p><p>Die gesetzlichen und privaten Krankenversicherungen übernehmen die Kosten nur unter bestimmten Voraussetzungen. Bitte klären Sie vor der Behandlung mit Ihrer Ärztin oder Ihrem Arzt und Ihrer Versicherung, ob und in welchem Umfang die Kosten erstattet werden. Andernfalls tragen Sie die Kosten selbst.</p>`),
      { type: "info", title: "Andere Möglichkeiten", html: `<p>Zur Vorbeugung der Migräne kommen auch Medikamente in Frage, etwa Betablocker, Topiramat, Amitriptylin, Flunarizin oder Antikörper gegen den Botenstoff CGRP. Ergänzend helfen nichtmedikamentöse Maßnahmen wie regelmäßiger Ausdauersport, Entspannungsverfahren, ein geregelter Tagesablauf und gegebenenfalls eine Verhaltenstherapie. Welche Möglichkeit für Sie geeignet ist, besprechen Sie im Gespräch.</p>` },
      VERHALTEN("Massieren Sie die behandelten Stellen am Behandlungstag nicht und verzichten Sie für einige Stunden auf starke körperliche Anstrengung. Ihre gewohnten Akutmedikamente gegen Migräne dürfen Sie weiter nach Absprache einnehmen."),
    ],
  }),
  base("botulinum_hyperhidrose_v1", {
    name: "Behandlung von übermäßigem Schwitzen (Hyperhidrose) mit Botulinumtoxin A",
    shortName: "Botulinumtoxin bei Hyperhidrose",
    plannedTreatment: "Injektion von Botulinumtoxin A in die Haut der betroffenen Bereiche (z.B. Achseln, Handflächen oder Fußsohlen) zur Behandlung des übermäßigen Schwitzens.",
    consentText: EINWILLIGUNG("die Behandlung meines übermäßigen Schwitzens mit Botulinumtoxin A"),
    sections: [
      INTRO("Ihr übermäßiges Schwitzen (Hyperhidrose)"),
      WIRKUNG("Schweißdrüsen werden über denselben Botenstoff gesteuert wie Muskeln. In die Haut gespritzt, verringert Botulinumtoxin A deshalb die Schweißbildung im behandelten Bereich, ohne die Schweißdrüsen zu zerstören. Die Fähigkeit des Körpers, über die übrige Haut Wärme abzugeben, bleibt erhalten."),
      { type: "info", title: "Ablauf der Behandlung", html: `<p>Die Behandlung erfolgt ambulant. Häufig wird zunächst mit einem Farbtest (Jod-Stärke-Test) sichtbar gemacht, wo besonders viel geschwitzt wird. Dann wird der Wirkstoff mit einer sehr feinen Nadel an vielen Punkten im Abstand von etwa ein bis zwei Zentimetern flach in die Haut gespritzt.</p><p>In den Achseln ist das meist gut auszuhalten. Handflächen und Fußsohlen sind empfindlicher; dort kann vorher mit Kälte, einer betäubenden Creme oder einer örtlichen Betäubung der versorgenden Nerven gearbeitet werden.</p>` },
      ALLGEMEINE_RISIKEN,
      { type: "info", title: "Besondere Risiken bei der Behandlung des Schwitzens", html: `<ul><li><strong>Vermehrtes Schwitzen an anderen Körperstellen</strong> (kompensatorisches Schwitzen), meist vorübergehend.</li><li><strong>Juckreiz</strong>, ein veränderter Körpergeruch oder <strong>vorübergehender Haarausfall</strong> im behandelten Bereich.</li><li>Bei Behandlung der <strong>Handflächen</strong>: vorübergehend <strong>verminderte Kraft und Feinmotorik</strong> der Hand- und Fingermuskulatur, etwa beim Greifen, Schreiben oder Musizieren, für einige Wochen.</li><li>Bei Behandlung der <strong>Fußsohlen</strong>: stärkere Schmerzen bei der Injektion und selten eine vorübergehende Schwäche der Fußmuskeln.</li><li>Nach einer örtlichen Betäubung der Nerven an Hand oder Fuß: vorübergehendes Taubheitsgefühl, sehr selten eine Nervenschädigung.</li></ul>` },
      ERFOLG("Die Schweißbildung lässt meist nach zwei bis vierzehn Tagen deutlich nach. In den Achseln hält die Wirkung häufig vier bis neun Monate an, an Händen und Füßen oft kürzer, etwa drei bis sechs Monate."),
      ZULASSUNG_KOSTEN(`<p>Für die Behandlung des starken, dauerhaften Schwitzens in den Achseln (primäre axilläre Hyperhidrose) ist ein Botulinumtoxin-A-Präparat zugelassen, wenn äußerliche Behandlungen nicht ausreichend wirken. Die Behandlung von Handflächen, Fußsohlen oder anderen Bereichen erfolgt außerhalb der Zulassung („Off-Label-Use“). Sie ist nach ausführlicher Aufklärung und mit Ihrer Zustimmung möglich; unbekannte Risiken lassen sich dann nicht ausschließen, und der Hersteller haftet unter Umständen nicht.</p><p>Die Krankenversicherungen übernehmen die Kosten nicht regelmäßig, sondern meist nur im Einzelfall und auf vorherigen Antrag. Bitte klären Sie die Kostenübernahme vor der Behandlung. Andernfalls tragen Sie die Kosten selbst.</p>`),
      { type: "info", title: "Andere Möglichkeiten", html: `<p>Als Alternativen kommen aluminiumchloridhaltige Antitranspirantien, die Leitungswasser-Iontophorese (vor allem an Händen und Füßen) und Tabletten, die die Schweißbildung hemmen, in Frage; diese können allerdings Nebenwirkungen wie Mundtrockenheit haben. In den Achseln sind außerdem Verfahren möglich, die Schweißdrüsen dauerhaft entfernen oder zerstören, etwa die Saugkürettage oder Mikrowellen- und Laserverfahren. Eine Operation an den Nerven des Grenzstrangs (Sympathektomie) ist nur in Ausnahmefällen angezeigt, weil sie häufig zu starkem Schwitzen an anderen Körperstellen führt.</p>` },
      VERHALTEN("Rasieren Sie die Achseln möglichst ein bis zwei Tage vor und nicht direkt nach der Behandlung und verzichten Sie am Behandlungstag auf Sauna, Sport und Deodorant im behandelten Bereich. Massieren Sie die Einstichstellen nicht."),
    ],
  }),
  base("botulinum_bruxismus_v1", {
    name: "Behandlung von Zähneknirschen und Kieferpressen (Bruxismus) mit Botulinumtoxin A",
    shortName: "Botulinumtoxin bei Bruxismus",
    plannedTreatment: "Injektion von Botulinumtoxin A in die Kaumuskulatur (Musculus masseter, gegebenenfalls Musculus temporalis) zur Behandlung von Zähneknirschen und Kieferpressen.",
    consentText: EINWILLIGUNG("die Behandlung meines Zähneknirschens und Kieferpressens mit Botulinumtoxin A außerhalb der Zulassung"),
    sections: [
      INTRO("Ihr Zähneknirschen oder Kieferpressen (Bruxismus)"),
      WIRKUNG("Beim Bruxismus arbeiten die Kaumuskeln, vor allem nachts oder unter Anspannung, übermäßig stark. Das kann zu Kiefer- und Kopfschmerzen, Verspannungen und Schäden an Zähnen und Zahnersatz führen. Botulinumtoxin A schwächt die Kraft der behandelten Kaumuskeln gezielt ab, ohne das normale Kauen und Sprechen zu verhindern. Ein vergrößerter Kaumuskel kann sich dadurch mit der Zeit zurückbilden."),
      { type: "info", title: "Ablauf der Behandlung", html: `<p>Die Behandlung erfolgt ambulant. Der Wirkstoff wird mit einer feinen Nadel an mehreren Punkten pro Seite in den großen Kaumuskel am Unterkieferwinkel (Masseter) gespritzt, bei Bedarf zusätzlich in den Schläfenmuskel (Temporalis). Zum Auffinden der richtigen Stelle beißen Sie kurz die Zähne zusammen. Die Einstiche fühlen sich meist wie kurze Piekser an.</p>` },
      ALLGEMEINE_RISIKEN,
      { type: "info", title: "Besondere Risiken bei der Behandlung der Kaumuskulatur", html: `<ul><li><strong>Verminderte Kaukraft</strong>, vor allem bei zähen oder harten Speisen, für einige Wochen.</li><li><strong>Veränderte Gesichtskontur</strong> durch das Schlankerwerden des Kaumuskels; bei ohnehin schmalem Gesicht kann die Wange eingefallen wirken.</li><li><strong>Verändertes oder ungleichmäßiges Lächeln</strong>, wenn sich der Wirkstoff auf benachbarte mimische Muskeln ausbreitet; vorübergehend.</li><li>Eine sichtbare <strong>Vorwölbung</strong> nicht behandelter Muskelanteile beim Zubeißen.</li><li>Selten <strong>Mundtrockenheit</strong>, wenn die benachbarte Ohrspeicheldrüse betroffen ist.</li><li>Bei wiederholter Behandlung über längere Zeit wurde in Untersuchungen eine Abnahme der Knochendichte am Unterkieferwinkel beobachtet. Die Bedeutung ist noch nicht abschließend geklärt.</li></ul>` },
      ERFOLG("Die Wirkung setzt meist nach ein bis zwei Wochen ein und hält in der Regel drei bis sechs Monate an. Viele Behandelte bemerken weniger Kiefer- und Kopfschmerzen und weniger Knirschen; die Ursache des Bruxismus, etwa Stress oder Fehlstellungen, wird dadurch aber nicht behoben."),
      ZULASSUNG_KOSTEN(`<p>Für die Behandlung von Zähneknirschen und Kieferpressen ist in Deutschland bisher kein Botulinumtoxin-Präparat zugelassen. Die Behandlung erfolgt deshalb außerhalb der Zulassung („Off-Label-Use“). Sie ist nach ausführlicher Aufklärung und mit Ihrer Zustimmung möglich; unbekannte Risiken lassen sich dann nicht ausschließen, und der Hersteller haftet unter Umständen nicht.</p><p>Die Krankenversicherungen übernehmen die Kosten in der Regel nicht, auch nicht für die Behandlung möglicher Komplikationen. Sie tragen die Kosten deshalb meist selbst.</p>`),
      { type: "info", title: "Andere Möglichkeiten", html: `<p>Als Alternativen oder Ergänzung kommen eine zahnärztliche Aufbissschiene, Physiotherapie und Kiefergelenksübungen, Entspannungsverfahren und Stressbewältigung, die Behandlung von Fehlstellungen der Zähne oder des Kiefers sowie in einzelnen Fällen Medikamente in Frage. Eine Aufbissschiene schützt die Zähne, verringert aber nicht die Muskelkraft. Welche Kombination für Sie sinnvoll ist, besprechen Sie im Gespräch, gegebenenfalls zusammen mit Ihrer Zahnärztin oder Ihrem Zahnarzt.</p>` },
      VERHALTEN("Massieren Sie die behandelten Stellen am Behandlungstag nicht und vermeiden Sie in den ersten Stunden starkes Kauen (z.B. Kaugummi) und starke körperliche Anstrengung. Tragen Sie eine vorhandene Aufbissschiene weiter, solange nichts anderes besprochen ist."),
    ],
  }),
];
