import type { IModuleDetail } from "../domain/interfaces/IModuleDetail";

/**
 * Der ausführliche Teil jedes Moduls.
 *
 * Getrennt von `modules.data.ts`, weil die Kacheldaten sonst zwischen tausend
 * Zeilen Fließtext verschwinden würden. Der Schlüssel ist die Modul-ID; fehlt
 * ein Eintrag, zeigt die Detailseite nur Beschreibung und Stichpunkte.
 *
 * Aufbau je Modul, alles optional außer `intro`:
 *
 *   intro        - zwei bis vier Absätze: was es löst und für wen
 *   concepts     - die Begriffe, die man auseinanderhalten muss
 *   automations  - was der Bot von selbst erledigt
 *   setup        - die Einrichtung in Schritten
 *   parts        - was im Dashboard mitkommt, ohne eigenen Schalter
 *   showcase     - ein sichtbares Beispiel statt einer Beschreibung
 *
 * Was hier steht, folgt dem Bot-Projekt (`docs/*.md` dort). Ändert sich dort
 * ein Verhalten, ändert sich der Text hier mit, sonst verspricht die Seite
 * etwas, das der Bot nicht tut.
 */
export const MODULE_DETAILS: Readonly<Record<string, IModuleDetail>> = {
    /* ==================================================================
       Community
       ================================================================== */
    welcome: {
        intro: [
            "Die ersten dreißig Sekunden auf einem Server entscheiden, ob jemand bleibt. In dieser Zeit sieht ein neues Mitglied eine Kanalliste, die es nicht einordnen kann, und im besten Fall eine angepinnte Nachricht von vor acht Monaten. Das Welcome System füllt genau diese Lücke: mit einer Nachricht, die zeigt, wer gerade gekommen ist, und mit den Rollen, die er zum Mitreden braucht.",
            "Die Welcome Card zeichnet der Bot selbst, mit denselben Schriften wie die Rang-Karte: Hintergrund aus der Galerie, Avatar, drei Textzeilen und das Server-Icon. Abgeschaltete Bausteine hinterlassen keine Lücken, ohne Avatar rücken die Texte einfach nach links. Wer keine Grafik will, schickt stattdessen eine Karte, ein Embed oder eine normale Nachricht.",
            "Und der Teil, der oft fehlt: der Abschied. Wer einen Server verlässt, verschwindet lautlos, und drei Wochen später fragt jemand, warum man nichts mehr von ihm hört. Eine Nachricht im Abschiedskanal beantwortet das, ohne dass jemand suchen muss.",
        ],
        concepts: {
            title: "Vier Arten, eine Nachricht",
            lead: "Für Begrüßung und Abschied getrennt wählbar, je nachdem, wie viel dein Server zeigen will.",
            entries: [
                {
                    label: "Welcome Card",
                    text: "Ein Bild, das der Bot zeichnet: Hintergrund, Avatar, drei Zeilen und das Server-Icon. Darüber passt eine Textzeile, damit die Erwähnung auch ankommt.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "Karte",
                    text: "Der Container des Bots im Components-V2-Stil, mit Text, Bildern, Galerie und Farbbalken.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Embed",
                    text: "Das klassische Embed mit Überschrift, Farbe, Bildern, Autor, Fußzeile und bis zu zehn Feldern.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Normale Nachricht",
                    text: "Reiner Text bis 2000 Zeichen. Für Server, denen eine Zeile im Chat reicht.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Alles, was du sonst bei jedem Beitritt von Hand machst, und beim fünfzigsten nicht mehr.",
            entries: [
                {
                    title: "Auto-Rollen werden vergeben",
                    text: "Bis zu zehn Rollen für jedes neue Mitglied, dazu eine eigene Liste für Bots, die jemand einlädt.",
                    icon: "tag",
                },
                {
                    title: "Die Karte wird gezeichnet",
                    text: "Mit einem Hintergrund aus der Galerie oder einem Farbverlauf aus deiner Akzentfarbe. Abdunkeln hält den Text auch auf hellen Bildern lesbar.",
                    icon: "image",
                },
                {
                    title: "Platzhalter werden gefüllt",
                    text: "Erwähnung, Name, Mitgliedsnummer, Mitgliederzahl, Beitrittsdatum und Kontoalter lassen sich mitten im Text einsetzen.",
                    icon: "message-square",
                },
                {
                    title: "Bots werden nicht begrüßt",
                    text: "Ein neuer Bot bekommt seine Rollen, aber keine Willkommensnachricht. Sonst begrüßt dein Server jedes Werkzeug wie ein Mitglied.",
                    icon: "filter",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Kanal, Nachricht, Rollen. Dann läuft es.",
            entries: [
                { title: "Kanal wählen", text: "Wo die Begrüßung erscheint, und auf Wunsch ein zweiter Kanal für den Abschied." },
                {
                    title: "Nachricht gestalten",
                    text: "Art wählen, Vorlage anklicken oder selbst schreiben, daneben die Vorschau. „Test senden“ schickt sie mit deinen eigenen Daten, bevor sie ein neues Mitglied sieht.",
                },
                { title: "Auto-Rollen festlegen", text: "Welche Rollen neue Mitglieder bekommen, und welche neue Bots." },
            ],
        },
    },

    apply: {
        intro: [
            "Bewerbungen laufen auf den meisten Servern über Direktnachrichten an die Person, die gerade online ist. Das funktioniert, bis es zwei Bewerbungen gleichzeitig gibt: dann weiß niemand, wer schon geantwortet hat, die Zusage kommt doppelt, und drei Wochen später kann keiner mehr sagen, warum jemand abgelehnt wurde.",
            "Das Apply System verlegt den Vorgang dorthin, wo alle Beteiligten ihn sehen. Dein Server baut sich seine Formulare selbst, und Bewerber füllen sie über einen öffentlichen Link aus, angemeldet mit Discord. Jede Bewerbung landet als Karte im Team-Kanal, mit den Antworten oben und zwei Knöpfen darunter. Wer annimmt, vergibt damit gleichzeitig die Rolle.",
            "Für eine Organisation mit mehreren Teams ist das keine Bequemlichkeit, sondern eine Voraussetzung: Main, Academy und Content-Team suchen unterschiedliche Leute und stellen unterschiedliche Fragen. Jedes Formular hat seine eigenen Fragen, seinen eigenen Kanal und seine eigene Rolle bei Annahme.",
        ],
        concepts: {
            title: "Der Weg einer Bewerbung",
            lead: "Drei Zustände, und entschieden wird genau einmal.",
            entries: [
                {
                    label: "Offen",
                    text: "Die Bewerbung ist eingegangen und liegt als Karte im Team-Kanal. Solange sie offen ist, nimmt das Formular von derselben Person keine zweite an.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Angenommen",
                    text: "Die Rolle des Formulars kommt dazu, und die Karte zeigt, wer entschieden hat. Auf Wunsch geht eine Nachricht an den Bewerber.",
                    color: "var(--c-win)",
                },
                {
                    label: "Abgelehnt",
                    text: "Im Dashboard mit einer Notiz, die in der Nachricht an den Bewerber mitgeht. Eine Pause nach Absage verhindert, dass er sich am nächsten Tag neu bewirbt.",
                    color: "var(--c-loss)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Der Verwaltungsteil, der sonst an einer Person hängt.",
            entries: [
                {
                    title: "Karte im Team-Kanal",
                    text: "Mit allen Antworten, und bis zu fünf Rollen werden angepingt. Nach der Entscheidung schreibt der Bot die Karte um.",
                    icon: "bell",
                },
                {
                    title: "Annahme vergibt die Rolle",
                    text: "Ein Klick statt drei Schritte. Welche Rolle das ist, steht am Formular, nicht im Kopf der Person, die gerade zusagt.",
                    icon: "tag",
                },
                {
                    title: "Nachricht an den Bewerber",
                    text: "Zu- und Absage kommen als Direktnachricht von RL Nexus, auf Wunsch mit eurer Notiz.",
                    icon: "mail",
                },
                {
                    title: "Regeln gegen Wegwerf-Konten",
                    text: "Mindestalter des Discord-Kontos und Voraussetzungsrolle prüft der Bot selbst. Die Seite im Browser könnte das nicht verhindern.",
                    icon: "shield-check",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Formular bauen, Prüfer eintragen, Link teilen.",
            entries: [
                {
                    title: "Formular anlegen",
                    text: "Name, Beschreibung und bis zu 20 Fragen: kurze Antwort, langer Text oder Auswahl. Bis zu 15 Formulare je Server.",
                },
                {
                    title: "Prüfer festlegen",
                    text: "Rollen und einzelne Mitglieder, die Bewerbungen sehen und entscheiden dürfen. Formulare bearbeiten bleibt bei denen, die den Server verwalten.",
                },
                {
                    title: "Link teilen",
                    text: "Die Adresse steht im Dashboard zum Kopieren. Lesen kann jeder, abschicken nur, wer mit Discord angemeldet und auf deinem Server ist.",
                },
            ],
        },
        parts: [
            {
                name: "Bewerbungen",
                text: "Was eingegangen ist: Antworten lesen, annehmen oder ablehnen, gefiltert nach Formular und Stand.",
            },
        ],
    },

    "reaction-roles": {
        intro: [
            "Plattform, Zeitzone, welche Benachrichtigungen jemand will, welche Spielmodi ihn interessieren: Das sind Angaben, die nur die Person selbst kennt, und trotzdem vergibt sie auf den meisten Servern ein Moderator von Hand. Das skaliert bis etwa dreißig Mitglieder.",
            "Self Roles drehen das um. Ein Panel im Kanal, Knöpfe oder ein Auswahlmenü, ein Klick, fertig. Über Discords eigene Bauteile statt über Reaktionen: Eine Reaktion ist ein Emoji unter einer Nachricht und sagt niemandem, was passiert, wenn man draufklickt. Ein beschrifteter Knopf sagt es.",
            "Der Teil, der in einer Org wirklich zählt, sind die Regeln. Bei „Genau eine“ ersetzt die neue Rolle die vorherige aus demselben Panel: Wer seine Plattform von PC auf Konsole ändert, verliert die alte Rolle automatisch, statt nach einem halben Jahr in drei Plattformrollen gleichzeitig zu stehen.",
        ],
        concepts: {
            title: "Die Regeln eines Panels",
            lead: "Dieselbe Mechanik, verschiedene Regeln dahinter.",
            entries: [
                {
                    label: "Mehrere möglich",
                    text: "Der Standard: jede Rolle lässt sich einzeln an- und abwählen. Für Benachrichtigungen, etwa Scrim- und Turnier-Pings.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "Genau eine",
                    text: "Die neue Rolle ersetzt die vorherige aus diesem Panel. Für Plattform, Region oder Farbe.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Höchstzahl",
                    text: "Etwa drei. Wer mehr will, bekommt eine Absage mit Hinweis, statt dass stillschweigend nichts passiert.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Voraussetzung",
                    text: "Ohne diese Rolle tut das Panel nichts und sagt, welche fehlt.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Nur dazu",
                    text: "Eine gesperrte Rolle kommt dazu und lässt sich nicht wieder abwählen. Auch „Genau eine“ nimmt sie nicht weg.",
                    color: "var(--c-red)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Fälle, an die man beim Einrichten nicht denkt.",
            entries: [
                {
                    title: "Änderungen ziehen nach",
                    text: "Ist das Panel gesendet, übernimmt jede Änderung im Dashboard die Nachricht in Discord. Neu schicken musst du nichts.",
                    icon: "refresh",
                },
                {
                    title: "Nur für den Klickenden sichtbar",
                    text: "Die Bestätigung sieht nur die Person selbst. Ein Kanal mit hundert Bestätigungen wäre kein Kanal mehr.",
                    icon: "eye",
                },
                {
                    title: "Rechte werden vorher geprüft",
                    text: "Eine Rolle über der höchsten Rolle des Bots meldet das Dashboard schon beim Speichern, nicht erst, wenn jemand klickt.",
                    icon: "shield-check",
                },
                {
                    title: "Knöpfe überleben Neustarts",
                    text: "Jeder Knopf trägt Panel und Rolle in sich. Ein Panel von vor einem Jahr funktioniert weiter, solange es die Rollen gibt.",
                    icon: "check",
                },
            ],
        },
    },

    "voice-hub": {
        intro: [
            "Sprachkanäle sind das einzige, was auf einem Rocket-League-Server wirklich dauerhaft belegt ist, und gleichzeitig das, was die Kanalliste am schnellsten unbrauchbar macht. Irgendwann stehen dort dreißig Kanäle mit Namen wie „3v3 #7“, von denen zwei benutzt werden.",
            "Ein Hub dreht das um: Es gibt einen Kanal zum Betreten. Wer hineingeht, bekommt sofort einen eigenen Kanal und wird hineingezogen. Wer ihn als Letzter verlässt, löscht ihn damit. Die Liste ist also immer genau so lang wie die Zahl der Gruppen, die gerade spielen.",
            "Der Besitzer stellt seinen Kanal über ein Menü ein: umbenennen, Plätze begrenzen, privat machen, Leute einladen oder hinauswerfen. Wer das jedes Mal gleich haben will, speichert es als Preset, und beim nächsten eigenen Kanal gilt es von selbst, auf jedem Server mit RL Nexus.",
        ],
        concepts: {
            title: "Wer darf was im eigenen Kanal",
            lead: "Ein temporärer Kanal hat einen Besitzer, und das ist nicht der Moderator.",
            entries: [
                {
                    label: "Besitzer",
                    text: "Darf alles, was das Panel anbietet. Geht er und bleibt jemand drin, übernimmt der Nächste den Kanal, und der Bot sagt es im Chat.",
                    color: "var(--c-red)",
                },
                {
                    label: "Vertraut",
                    text: "Kommt hinein, auch wenn der Kanal privat ist. Die Liste lässt sich im Preset mitspeichern.",
                    color: "var(--c-win)",
                },
                {
                    label: "Blockiert",
                    text: "Kommt nicht mehr hinein, sieht den Kanal nicht und fliegt sofort raus.",
                    color: "var(--c-loss)",
                },
                {
                    label: "Unsichtbar",
                    text: "Der Kanal taucht für andere gar nicht erst auf. Für Runden, die niemanden etwas angehen.",
                    color: "var(--c-mod-moderation)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Aufräumen, ohne dass jemand aufräumt.",
            entries: [
                {
                    title: "Kanal entsteht beim Betreten",
                    text: "Mit dem Namen aus der Vorlage, etwa „Laras Kanal“ oder dem Spiel, das Discord gerade anzeigt.",
                    icon: "mic",
                },
                {
                    title: "Und verschwindet beim Verlassen",
                    text: "Sobald der Letzte draußen ist. Was einen Neustart nicht überlebt hat, räumt der Bot beim Start weg.",
                    icon: "trash",
                },
                {
                    title: "Presets gelten von selbst",
                    text: "Das Standard-Preset greift beim nächsten eigenen Kanal, ohne dass jemand etwas einstellt.",
                    icon: "refresh",
                },
                {
                    title: "Support ohne Panel",
                    text: "Ein Hub lässt sich als Support-Hub markieren. Wer vom Team ihn betritt, bekommt einen Talk ohne Panel. Den Warteraum dazu legst du in der Moderation fest, und „Übernehmen“ holt die wartende Person in diesen Talk.",
                    icon: "bell",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Ein Kanal genügt.",
            entries: [
                {
                    title: "Hub wählen",
                    text: "Einen normalen Sprachkanal, etwa „Hier klicken“. Bis zu zehn Hubs, zum Beispiel für 2v2, 3v3 und Chill.",
                },
                {
                    title: "Vorgaben festlegen",
                    text: "Namensvorlage, Kategorie, Plätze, Zutritt und welche der 13 Optionen im Panel stehen.",
                },
                {
                    title: "Panel platzieren",
                    text: "In den Chat jedes neuen Kanals, oder einmal in einen festen Kanal, der für alle gilt.",
                },
            ],
        },
    },

    /* ==================================================================
       Wettbewerb
       ================================================================== */
    "rl-tracking": {
        showcase: "rank-card",
        intro: [
            "Ein Rocket-League-Server ohne Rangdaten führt zwangsläufig eine Tabelle. Irgendwo liegt eine Liste mit Namen und Rängen, die einmal richtig war, und jeder Scrim beginnt mit der Frage, ob die Zahlen noch stimmen.",
            "RL Tracking holt sie direkt aus dem Spiel. Ein Mitglied verknüpft einmal sein Epic-Konto, und ab da kennt der Bot Rang, MMR, Spielzahl und Serie für 1v1, 2v2 und 3v3, dazu den Fortschritt beim Season-Reward und die Karriere-Werte. Das Ergebnis ist die Rang-Karte, dieselbe, deren Farben diese ganze Seite trägt.",
            "Auch ohne Verknüpfung durchsuchbar: Wer einen Gegner oder einen Bewerber einschätzen will, gibt den Epic-Namen ein und bekommt dieselbe Karte. Was der Bot nicht tut, ist raten. Gibt es den Namen nicht, sagt er genau das.",
        ],
        concepts: {
            title: "Was auf der Karte steht",
            lead: "Fünf Blöcke, und jeder beantwortet eine andere Frage.",
            entries: [
                {
                    label: "Season Reward",
                    text: "Welche Belohnungsstufe erreicht ist und wie viele Siege bis zur nächsten fehlen. Der Balken zeigt den Fortschritt, nicht nur die Stufe.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Playlists",
                    text: "1v1, 2v2 und 3v3 einzeln, jede mit Rang, Division und MMR. Die Farbe folgt der Rangstufe. Diamant blau, Champion violett, Grand Champion rot.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Platzierung",
                    text: "Solange die Platzierungsspiele laufen, zeigt die Karte kein Abzeichen, sondern wie viele Spiele noch fehlen. Genau wie das Spiel selbst.",
                    color: "var(--c-text-faint)",
                },
                {
                    label: "Streak",
                    text: "Siege oder Niederlagen am Stück, grün oder rot. Sagt mehr über die Tagesform als die MMR-Zahl daneben.",
                    color: "var(--c-win)",
                },
                {
                    label: "Karriere",
                    text: "Schüsse, Tore, Vorlagen, MVPs, Paraden, Siege. Über alle Seasons. Jeder Wert in eigener Farbe, damit die Reihe nicht zu einem Band verschwimmt.",
                    color: "var(--c-mod-utility)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Datenpflege, die es damit nicht mehr gibt.",
            entries: [
                {
                    title: "Werte kommen aus dem Spiel",
                    text: "Die Karte holt Rang und MMR bei jedem Aufruf aus Rocket League. Niemand meldet mehr einen Aufstieg von Hand.",
                    icon: "refresh",
                },
                {
                    title: "Zehn Minuten zwischengespeichert",
                    text: "Wer zweimal kurz hintereinander nachsieht, löst nur eine Anfrage aus. Das schont die Schnittstelle und macht die Antwort schneller.",
                    icon: "clock",
                },
                {
                    title: "Rollen gibt es dazu",
                    text: "Mit dem Modul Rank Roles holt sich jedes Mitglied die Rolle zu seinem Rang selbst ab, je Playlist eine.",
                    icon: "tag",
                },
                {
                    title: "Die Verknüpfung gehört dem Mitglied",
                    text: "Sie entsteht nur auf eigenen Wunsch und lässt sich wieder lösen. Wechseln geht alle drei Tage, damit niemand fremde Ränge ausleiht.",
                    icon: "lock",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Für dich nichts, für deine Mitglieder ein Schritt.",
            entries: [
                {
                    title: "Nichts einschalten",
                    text: "/rank gehört fest zum Bot und funktioniert auf jedem Server, auf dem er ist.",
                },
                {
                    title: "Konto verknüpfen",
                    text: "Einmal /rank link mit dem Epic-Namen, genau wie im Spiel geschrieben.",
                },
                {
                    title: "Karte abrufen",
                    text: "Danach reicht /rank me. Fremde Spieler findet /rank search.",
                },
            ],
        },
    },

    "rank-roles": {
        intro: [
            "Rangrollen sind auf fast jedem Rocket-League-Server Handarbeit. Jemand schreibt „bin jetzt Champ“ in einen Kanal, ein Moderator vergibt die Rolle, und nach der nächsten Season stimmt die Hälfte davon nicht mehr, weil niemand die Abstiege nachträgt.",
            "Rank Roles holt den Rang aus dem Spiel statt aus dem Chat. Wer /rangrollen holen eingibt, bekommt die Rolle, die zu seinem aktuellen Rang gehört, je Playlist eine eigene. Grundlage ist das verknüpfte Epic-Konto. Einen fremden Namen kann niemand angeben, sonst holte man sich Rollen mit dem Konto eines anderen.",
            "Der Bot fragt dabei von sich aus nichts nach. Wer aufsteigt, gibt den Command noch einmal ein, und die alte Rolle derselben Playlist geht auf Wunsch im selben Zug weg.",
        ],
        concepts: {
            title: "Wie ein Rang zur Rolle wird",
            lead: "Vier Regeln, die man kennen sollte, bevor man die erste Rolle zuordnet.",
            entries: [
                {
                    label: "Zuordnung",
                    text: "Alle 22 Ränge einzeln, von Bronze I bis Supersonic Legend. Wer gröber unterteilen will, legt dieselbe Rolle auf mehrere Ränge.",
                    color: "var(--c-mod-competition)",
                },
                {
                    label: "Playlist",
                    text: "1v1, 2v2 und 3v3 haben eigene Schalter und eigene Zuordnungen. Wer in zwei Playlists spielt, trägt zwei Rangrollen.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Platzierung",
                    text: "Wer in einer Playlist noch Platzierungsspiele hat, bleibt dort ohne Rolle. Im Spiel steht dort auch kein Rang.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Unranked",
                    text: "Bekommt nie eine Rolle. Wer nicht platziert ist, hat keinen Rang.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Beim Command, nicht im Hintergrund.",
            entries: [
                {
                    title: "Die alte Rolle geht",
                    text: "Beim Aufstieg nimmt der Bot die vorherige Rolle derselben Playlist ab. Wer das nicht will, schaltet es aus.",
                    icon: "refresh",
                },
                {
                    title: "Gründe statt Schweigen",
                    text: "Fehlt die Verknüpfung, steht eine Rolle über dem Bot oder läuft noch die Platzierung, sagt die Antwort genau das.",
                    icon: "message-square",
                },
                {
                    title: "Nur für dich sichtbar",
                    text: "Beide Antworten sieht nur, wer den Command eingegeben hat.",
                    icon: "eye",
                },
                {
                    title: "Auf Wunsch nur in einem Kanal",
                    text: "Der Command geht dann nur dort und bleibt aus dem restlichen Server heraus.",
                    icon: "filter",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Einmal zuordnen, dann holt sich jeder seine Rolle selbst.",
            entries: [
                { title: "Modul einschalten", text: "Im Dashboard unter Module oder mit /module an." },
                {
                    title: "Ränge zuordnen",
                    text: "Je Playlist eine Karte mit allen 22 Rängen. Welche Rolle zu welchem Rang gehört, entscheidest du.",
                },
                {
                    title: "Mitglieder verknüpfen sich",
                    text: "Einmal /rank link mit dem Epic-Namen, danach reicht /rangrollen holen.",
                },
            ],
        },
    },

    teams: {
        showcase: "team-roster",
        intro: [
            "Eine Organisation besteht aus Teams, nicht aus einer Mitgliederliste. Trotzdem ist der Kader auf den meisten Servern eine angepinnte Nachricht, die zuletzt geändert wurde, als der aktuelle Ersatzspieler noch gar nicht da war.",
            "Die Team-Übersicht macht daraus etwas, das sich selbst pflegt. Ein Team hat Name, Kürzel, Logo, Farbe und einen Kader, gegliedert in Gruppen wie Main und Academy. Von Hand kommt nur der Peak: Name, aktuelle MMR und Rang holt der Bot über den Epic-Namen selbst, und nach jeder Änderung zieht er die Karte im Kanal nach.",
            "Daraus rechnet er die Team-MMR, ab Werk nach WTSI: gewichtet nach dem Peak des Spielers, gedämpft um seine aktuelle Form. Eine Pechsträhne kostet wenig, absichtliches Runterspielen bringt nichts. Wer anders rechnen will, schreibt seine eigene Formel.",
        ],
        concepts: {
            title: "Sieben Aufgaben im Kader",
            lead: "Wer fest spielt, zählt in die Team-MMR. Wer getestet wird oder daneben steht, nicht.",
            entries: [
                {
                    label: "Captain",
                    text: "Spielt und führt das Team. Darf zusammen mit Manager und Coach die Partien des Teams eintragen.",
                    color: "var(--c-red)",
                },
                {
                    label: "Co-Captain",
                    text: "Spielt fest mit und vertritt den Captain, wenn der fehlt. Zählt in die Team-MMR.",
                    color: "color-mix(in srgb, var(--c-red) 60%, var(--c-text))",
                },
                {
                    label: "Stamm",
                    text: "Steht in der Aufstellung und zählt in die Team-MMR.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Ersatz",
                    text: "Springt ein, wenn jemand ausfällt, und zählt ebenfalls mit. Er spielt ja.",
                    color: "var(--c-text-faint)",
                },
                {
                    label: "Trial",
                    text: "Wird gerade getestet. Steht sichtbar im Kader, zählt aber erst in die Team-MMR, wenn er fest übernommen ist.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Coach",
                    text: "Sieht alles, spielt nicht. Taucht in keiner Rechnung auf.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Manager",
                    text: "Kümmert sich um Termine und Organisation und spielt nicht mit.",
                    color: "var(--c-mod-utility)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Datenpflege, die es damit nicht mehr gibt.",
            entries: [
                {
                    title: "Ränge kommen aus dem Spiel",
                    text: "Neben jedem Namen steht der Rang aus Rocket League, nicht der, den jemand von sich behauptet. Der Stand hält 30 Minuten und wird dann neu geholt.",
                    icon: "crosshair",
                },
                {
                    title: "Die Karte zieht nach",
                    text: "Nach jeder Änderung an einem Team aktualisiert der Bot die Nachricht im Kanal. Niemand bearbeitet mehr eine angepinnte Nachricht.",
                    icon: "refresh",
                },
                {
                    title: "Der Epic-Name kommt mit",
                    text: "Hat ein Mitglied sein Konto verknüpft, trägt der Bot den Epic-Namen selbst ein. Sonst sagt die Zeile, dass er fehlt.",
                    icon: "link",
                },
                {
                    title: "Gerechnet wird im Bot",
                    text: "Die Team-MMR kommt nie aus dem Browser. Eine Formel, die nicht aufgeht, wird schon beim Speichern abgewiesen.",
                    icon: "lock",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Gruppen, Teams, Anzeige.",
            entries: [
                {
                    title: "Gruppen anlegen",
                    text: "Überschriften wie Main, Academy oder Content. Bis zu 12 Gruppen und 40 Teams.",
                },
                {
                    title: "Teams besetzen",
                    text: "Mitglied wählen, Aufgabe festlegen, Peaks eintragen. Bis zu 12 Spieler je Team.",
                },
                {
                    title: "Anzeige senden",
                    text: "Eine Nachricht für alle Teams oder eine Karte je Team, als Karte, Embed oder Text. Auf Wunsch mit Auswahlmenü.",
                },
            ],
        },
        parts: [
            {
                name: "Anzeige",
                text: "Wo die Übersicht steht, wie sie aussieht und was darin steht, mit Senden und Einsammeln.",
            },
        ],
    },

    lft: {
        intro: [
            "Die Suche nach Mitspielern läuft auf fast jedem Server gleich: Jemand schreibt „3v3, Champ 2, suche Team“ in einen Kanal, und drei Tage später schreibt er es wieder, weil die Nachricht weggescrollt ist. Wer sucht, findet nichts, und wer sich anbietet, wird übersehen.",
            "Looking for macht aus der Nachricht einen Beitrag. Wer sucht, gibt /lookingfor spieler oder /lookingfor team ein, und der Bot fragt per Direktnachricht nacheinander die Fragen ab, die euer Team im Dashboard festgelegt hat. Am Ende steht eine Vorschau mit zwei Knöpfen, und erst danach entsteht der Beitrag im Forum.",
            "Im Forum sagt der Tag auf einen Blick, wer hier sucht: ein Spieler ein Team oder ein Team einen Spieler. Beendet wird per Knopf am Beitrag, mit einem Command oder nach einer festen Zahl von Tagen von selbst. Dann bekommt der Beitrag den Tag „Beendet“ und bleibt lesbar.",
        ],
        concepts: {
            title: "Zwei Richtungen, ein Forum",
            lead: "Wer sucht, und wonach.",
            entries: [
                {
                    label: "Spieler-Suche",
                    text: "Ein Spieler sucht ein Team. Die Fragen stellt ihr: Rang, Position, Zeiten, was euch eben wichtig ist.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Team-Suche",
                    text: "Ein Team sucht Verstärkung, etwa einen Stammspieler, einen Ersatz, einen Coach oder einen Manager.",
                    color: "var(--c-mod-competition)",
                },
                {
                    label: "Tags",
                    text: "Je Seite einer und einer für beendete Suchen. Der Bot legt sie im Forum selbst an.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "Ablauf",
                    text: "Ab Werk endet eine Suche nach 30 Tagen von allein. Sonst steht in einem Jahr ein Forum voller Gesuche von Leuten, die längst ein Team haben.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Das Gespräch, das sonst niemand führt.",
            entries: [
                {
                    title: "Fragen per Direktnachricht",
                    text: "Eine Frage je Nachricht, Auswahlfragen als Menü. Freiwillige Fragen lassen sich mit „-“ überspringen.",
                    icon: "message-square",
                },
                {
                    title: "Vorschau vor dem Beitrag",
                    text: "Erst nach „Abschicken“ entsteht der Beitrag. Wer abbricht oder zehn Minuten nicht antwortet, hinterlässt nichts.",
                    icon: "eye",
                },
                {
                    title: "Meldung ans Team",
                    text: "Sobald ein Beitrag entsteht, geht eine Nachricht in euren Kanal, mit Knöpfen zum Beenden und Löschen.",
                    icon: "bell",
                },
                {
                    title: "Eine Suche je Seite",
                    text: "Spieler- und Team-Suche gehen gleichzeitig, dieselbe zweimal nicht. Der Command verweist dann auf den offenen Beitrag.",
                    icon: "filter",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Forum wählen, Fragen stellen.",
            entries: [
                {
                    title: "Forum wählen",
                    text: "Eines für beide Seiten oder je Seite ein eigenes. Die Tags legt der Bot an.",
                },
                {
                    title: "Fragen festlegen",
                    text: "Freitext oder Auswahl, jeweils Pflicht oder freiwillig, getrennt für Spieler- und Team-Suche.",
                },
                {
                    title: "Beitrag gestalten",
                    text: "Titel und Nachricht mit Platzhaltern für die Antworten, als Karte, Embed oder Text, mit Live-Vorschau.",
                },
            ],
        },
        parts: [
            { name: "Spieler-Suche", text: "Schalter, Titel, Fragen und Beitrag für Spieler, dazu alle, die gerade ein Team suchen." },
            { name: "Team-Suche", text: "Dasselbe für Teams, die gerade Spieler suchen." },
            { name: "Anfragen", text: "Alles, was gesucht wird: beenden, löschen und nachlesen." },
        ],
    },

    matchups: {
        intro: [
            "Die Frage „Wann spielen wir eigentlich gegen wen?“ wird auf den meisten Servern im Chat beantwortet, und zwar mehrmals, von verschiedenen Leuten, mit verschiedenen Uhrzeiten. Wer erst später dazukommt, scrollt, und wer nicht scrollt, verpasst den Anpfiff.",
            "Matchups legt die Partien dorthin, wo sie jeder findet. Eingetragen werden sie von denen, die sie organisieren: Captain, Manager und Coach eines Teams, über einen Link und ohne Rechte im Dashboard. Für welches Team jemand sprechen darf, steht in der Team-Übersicht.",
            "Der Bot kündigt jede Partie im Kanal an, erinnert kurz vor Anpfiff und hält danach das Ergebnis fest. Ändert sich die Uhrzeit, zieht er die Ankündigung nach, ohne alle ein zweites Mal anzupingen. Wird abgesagt, bleibt die Nachricht stehen, mit „Abgesagt“ darüber, damit niemand vergeblich wartet.",
        ],
        concepts: {
            title: "Wer eintragen darf",
            lead: "Nicht jeder im Kader, sonst weiß niemand, welcher Termin gilt.",
            entries: [
                {
                    label: "Captain, Manager, Coach",
                    text: "Tragen für genau ihr Team ein, über den Link. Grundlage ist der Kader in der Team-Übersicht.",
                    color: "var(--c-red)",
                },
                {
                    label: "Stamm und Ersatz",
                    text: "Sehen die Partien, tragen aber nichts ein. Einer entscheidet, nicht fünf.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Server-Verwaltung",
                    text: "Darf für jedes Team eintragen, im Dashboard und über den Link.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Alle anderen",
                    text: "Lesen die Seite ohne Anmeldung. Eintragen geht nur angemeldet, damit klar ist, wer für welches Team spricht.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Drei Nachrichten je Partie.",
            entries: [
                {
                    title: "Ankündigung",
                    text: "Beim Eintragen, auf Wunsch mit Ping: Team gegen Gegner, Liga, Modus, Best-of und Stream-Link.",
                    icon: "megaphone",
                },
                {
                    title: "Erinnerung",
                    text: "Kurz vor Anpfiff, ab Werk 30 Minuten vorher, und genau einmal.",
                    icon: "clock",
                },
                {
                    title: "Ergebnis",
                    text: "Sobald jemand das Ergebnis meldet, mit Sieg, Niederlage oder Unentschieden.",
                    icon: "trophy",
                },
                {
                    title: "Zeit in jeder Zeitzone",
                    text: "Die Zeiten stehen als Discord-Zeitstempel. Jeder sieht sie in seiner eigenen Zeit, und der Countdown läuft von allein.",
                    icon: "calendar",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Kanal wählen, Link teilen.",
            entries: [
                {
                    title: "Kanal festlegen",
                    text: "Wohin Ankündigung, Erinnerung und Ergebnis gehen, und wer dabei angepingt wird.",
                },
                {
                    title: "Nachrichten gestalten",
                    text: "Alle drei als Karte, Embed oder Text, mit Vorlagen, Platzhaltern und Live-Vorschau.",
                },
                {
                    title: "Link teilen",
                    text: "Ab da tragen die Captains selbst ein. Mit „Link offen“ lässt sich die Seite schließen, ohne das Modul abzuschalten.",
                },
            ],
        },
        parts: [
            { name: "Eintragen", text: "Eine Partie eintragen oder ändern, mit demselben Formular wie über den Link." },
            { name: "Alle Partien", text: "Was ansteht und was war: absagen, Ergebnis melden, löschen." },
        ],
    },

    "rl-6mans": {
        intro: [
            "Wer an einem Abend spielen will, aber kein festes Team hat, schreibt „wer ist dabei?“ in den Chat und wartet. Irgendwann sind es sechs, dann beginnt die Diskussion, wer mit wem spielt, und die besten drei landen zufällig im selben Team.",
            "2, 4 & 6 Mans macht daraus eine Warteschlange. Im Kanal steht ein Panel mit einem Knopf je Modus. Sobald genug Leute da sind, rechnet der Bot die fairste Aufteilung aus, legt Sprachkanäle für Blau und Orange an, zieht alle hinüber, die schon im Voice sitzen, und schreibt Lobby-Name und Passwort in die Karte.",
            "Nach dem Spiel melden die Spieler das Ergebnis per Knopf, und die MMR passt sich an, wie bei Elo, nur mit dem Schnitt beider Teams. Wer den Favoriten schlägt, bekommt mehr. Die Wertung gehört deinem Server: Jeder Modus hat seine eigene MMR und seine eigene Rangliste, mit den Rängen im Spiel hat das nichts zu tun.",
        ],
        concepts: {
            title: "Drei Modi, getrennt gewertet",
            lead: "Wer in 6 Mans oben steht, fängt in 2 Mans trotzdem bei 600 an.",
            entries: [
                { label: "2 Mans", text: "1v1, voll bei zwei Spielern.", color: "var(--c-mod-community)" },
                { label: "4 Mans", text: "2v2, voll bei vier Spielern.", color: "var(--c-blue)" },
                { label: "6 Mans", text: "3v3, voll bei sechs Spielern.", color: "var(--c-mod-competition)" },
                {
                    label: "Stufen",
                    text: "Aus der MMR wird eine Stufe mit eigenem Namen, Zeichen und Farbe. Bis zu zwölf, und jeder Server legt sie selbst fest.",
                    color: "var(--c-mod-engagement)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Vom vollen Panel bis zur neuen Rangliste.",
            entries: [
                {
                    title: "Faire Teams",
                    text: "Der Bot prüft jede mögliche Aufteilung und nimmt die mit dem kleinsten Abstand zwischen beiden Teams.",
                    icon: "users",
                },
                {
                    title: "Lobby ohne Vertipper",
                    text: "Name und Passwort kommen ohne i, l, o, 0 und 1 aus. Auf einem Controller vertippt man sich sonst.",
                    icon: "gamepad",
                },
                {
                    title: "Ergebnis mit Gegenprobe",
                    text: "Auf Wunsch muss das andere Team dasselbe melden. Bei Streit entscheidet, wer den Server verwaltet.",
                    icon: "shield-check",
                },
                {
                    title: "Aufräumen",
                    text: "Die Sprachkanäle verschwinden zwei Minuten nach dem Spiel, sobald niemand mehr drin sitzt. Wer eine Stunde wartet, fliegt aus der Warteschlange.",
                    icon: "trash",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Modi wählen, Panel senden.",
            entries: [
                {
                    title: "Modi festlegen",
                    text: "Welche Modi es gibt, dazu die Start-MMR und der höchste Ausschlag je Spiel.",
                },
                {
                    title: "Stufen einrichten",
                    text: "Eigene Namen, Zeichen und Farben, oder der Vorschlag ab Werk mit acht Stufen.",
                },
                {
                    title: "Panel senden",
                    text: "In den Kanal, in dem gespielt wird. Ab da stellen sich die Mitglieder selbst an.",
                },
            ],
        },
        parts: [
            { name: "Live", text: "Warteschlangen je Modus, laufende Runden und der Verlauf." },
            { name: "Rangliste", text: "Die Wertung je Modus, die Stufen und der öffentliche Link." },
        ],
    },

    /* ==================================================================
       Moderation
       ================================================================== */
    moderation: {
        intro: [
            "Moderation ohne Akte heißt: Jemand bekommt eine Verwarnung, und drei Wochen später weiß niemand mehr, ob es die erste war oder die fünfte. Der Grund steht in einem Chat, den keiner mehr findet, und der Beweis war ein Screenshot auf dem Rechner eines Moderators, der inzwischen nicht mehr dabei ist.",
            "Hier wird jede Aktion ein Fall: fortlaufend nummeriert, mit Grund, Dauer, Stand und Verlauf, egal ob sie per Command in Discord oder im Dashboard passiert. An jedem Fall hängen Notizen fürs Team und Beweise, Bilder oder Links. Im Log-Kanal steht eine Karte, die sich nachzieht, sobald sich am Fall etwas ändert.",
            "Stufen nehmen dir die Rechnung ab: ab drei Verwarnungen eine Stunde Timeout, ab fünf ein Kick, oder was dein Server festlegt. Befristete Banns hebt der Bot selbst wieder auf, und wer betroffen ist, bekommt auf Wunsch eine Direktnachricht mit Grund und Fallnummer, ohne den Namen des Moderators.",
        ],
        concepts: {
            title: "Ein Fall und sein Stand",
            lead: "Bann, Timeout und Verwarnung sind aktiv, bis sie enden.",
            entries: [
                {
                    label: "Aktiv",
                    text: "Der Fall wirkt noch: der Bann steht, der Timeout läuft, die Verwarnung zählt.",
                    color: "var(--c-loss)",
                },
                {
                    label: "Aufgehoben",
                    text: "Durch einen anderen Fall zurückgenommen, etwa mit /unban oder /unwarn. Beide Fälle verweisen aufeinander.",
                    color: "var(--c-win)",
                },
                {
                    label: "Abgelaufen",
                    text: "Die Frist ist um. Befristete Banns hebt der Bot selbst auf, Timeouts beendet Discord.",
                    color: "var(--c-text-faint)",
                },
                {
                    label: "Automatisch",
                    text: "Von einer Stufe ausgelöst, mit Verweis auf die Verwarnung, die dazu geführt hat.",
                    color: "var(--c-mod-moderation)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Arbeit neben der eigentlichen Entscheidung.",
            entries: [
                {
                    title: "Stufen greifen",
                    text: "Erreicht jemand die festgelegte Zahl aktiver Verwarnungen, folgt die Strafe als eigener Fall.",
                    icon: "filter",
                },
                {
                    title: "Die Log-Karte zieht nach",
                    text: "Jeder Fall steht als Karte im Log-Kanal, mit Knopf ins Dashboard. Neue Notizen und Beweise tauchen darin auf.",
                    icon: "scroll",
                },
                {
                    title: "Nachricht vor Bann und Kick",
                    text: "Die Direktnachricht an den Betroffenen geht vor der Aktion raus. Danach teilt er keinen Server mehr mit dem Bot.",
                    icon: "mail",
                },
                {
                    title: "Regeln vor jeder Aktion",
                    text: "Nicht sich selbst, nicht den Bot, nicht den Owner, nur nach unten in der Rollenreihenfolge. Scheitert die Aktion, verschwindet auch der Fall wieder.",
                    icon: "lock",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Moderatoren eintragen, Log-Kanal wählen.",
            entries: [
                {
                    title: "Moderatoren festlegen",
                    text: "Rollen und einzelne Mitglieder, je bis zu 25. Die Liste gilt für Moderation und Tickets zugleich.",
                },
                {
                    title: "Log-Kanal wählen",
                    text: "Ein Textkanal oder ein Beitrag in einem Forum. Dort steht jeder Fall als Karte.",
                },
                {
                    title: "Stufen einstellen",
                    text: "Bis zu zehn, etwa „ab 3 Verwarnungen: Timeout 1 Stunde“. Auf Wunsch zählen nur die Verwarnungen der letzten Tage.",
                },
            ],
        },
    },

    automod: {
        intro: [
            "Die meisten Regelverstöße passieren nachts. Nicht, weil nachts schlimmere Leute unterwegs sind, sondern weil dann niemand aus dem Team online ist. Ein Werbelink steht acht Stunden im Kanal, eine Massenerwähnung erreicht dreihundert Leute, und am Morgen ist die Aufregung größer als der Vorfall.",
            "Auto Mod greift in dem Moment, in dem etwas passiert. Acht Filter, jeder einzeln schaltbar, jeder mit eigener Folge: nur löschen, verwarnen, Timeout, Kick oder Bann. Die Strafen laufen als Fall über die Moderation, mit Nummer und Grund, und zählen in deren Stufen mit.",
            "Ab Werk ist alles aus. Ein Bot, der nach dem Einschalten ungefragt löscht, wäre die falsche Überraschung. Und der wichtigste Teil sind die Ausnahmen: Kanäle, Kategorien und Rollen lassen sich ausnehmen, Moderatoren sind es von vornherein.",
        ],
        concepts: {
            title: "Acht Filter",
            lead: "Greifen mehrere, zählt der erste. Doppelte Strafe für eine Nachricht gibt es nicht.",
            entries: [
                {
                    label: "Wortliste",
                    text: "Deine eigene Liste, auf Wunsch nur ganze Wörter. Bewusst nicht vorbelegt: Was auf deinem Server nicht in Ordnung ist, entscheidest du.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Einladungen",
                    text: "discord.gg und die üblichen Kurzformen. Die eigene Einladung lässt sich erlauben.",
                    color: "var(--c-red)",
                },
                {
                    label: "Links",
                    text: "Alle Links außer denen auf der Erlaubnisliste. Unterdomains zählen mit.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Spam, Wiederholung",
                    text: "Zu viele Nachrichten in kurzer Zeit, oder dieselbe mehrfach am Stück.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Erwähnungen, Großbuchstaben, Emojis",
                    text: "Zu viele @ in einer Nachricht, Geschrei ab zehn Zeichen Text, zu viele Emojis auf einmal.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Und was ausdrücklich nicht passiert.",
            entries: [
                {
                    title: "Tricks werden durchschaut",
                    text: "Der Text wird vorher vereinheitlicht. „1d10t“ fällt genauso auf wie „i.d.i.o.t“.",
                    icon: "search",
                },
                {
                    title: "Bearbeiten hilft nicht",
                    text: "Auch nachträglich geänderte Nachrichten werden geprüft. Sonst wäre das der Weg am Filter vorbei.",
                    icon: "refresh",
                },
                {
                    title: "Kurze Ansage im Kanal",
                    text: "Auf Wunsch mit Erwähnung des Betroffenen. Sie löscht sich nach acht Sekunden von selbst.",
                    icon: "message-square",
                },
                {
                    title: "Jeder Eingriff als Meldung",
                    text: "Wer, wo, was erkannt wurde und was daraus folgte, samt dem entfernten Text, in einem Kanal deiner Wahl.",
                    icon: "scroll",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Filter anschalten, Folge wählen, Probe machen.",
            entries: [
                {
                    title: "Filter wählen",
                    text: "Jeden einzeln anschalten und einstellen, etwa die Wortliste, die Anzahl oder das Zeitfenster.",
                },
                {
                    title: "Folge festlegen",
                    text: "Nur löschen, verwarnen, Timeout, Kick oder Bann. Alles außer Löschen braucht das Modul Moderation.",
                },
                {
                    title: "Probe machen",
                    text: "Einen Text eingeben und sehen, welcher Filter greifen würde, ohne dass jemand bestraft wird.",
                },
            ],
        },
    },

    logging: {
        intro: [
            "Die wichtigste Frage in jeder Moderationssituation lautet: Was ist eigentlich passiert? Und die übliche Antwort lautet: Weiß keiner mehr. Eine Nachricht wurde gelöscht, eine Rolle ist verschwunden, jemand hat plötzlich Rechte, die er nicht haben sollte, und Discords eigenes Audit-Log reicht dafür weder weit genug zurück noch tief genug hinein.",
            "Das Logging System schreibt mit, was auf deinem Server geschieht: 38 Ereignisse in fünf Gruppen, von gelöschten Nachrichten über Rollenänderungen bis zu Webhooks und Einladungen. Jede Gruppe hat ihren Kanal, und ein einzelnes Ereignis darf einen eigenen bekommen. Wer nach einem Rollenwechsel sucht, muss dafür nicht durch zweitausend Nachrichtenlöschungen scrollen.",
            "Entscheidend ist die Tiefe: Eine gelöschte Nachricht bleibt im Wortlaut lesbar, samt Anhängen. Wer etwas geändert hat, steht dabei, aus dem Audit-Log. Und weil das der Bereich mit den empfindlichsten Daten ist, lässt sich jedes Ereignis einzeln abschalten.",
        ],
        concepts: {
            title: "Fünf Gruppen, fünf Kanäle",
            lead: "Getrennt, weil sie unterschiedliche Leute interessieren und unterschiedlich empfindlich sind.",
            entries: [
                {
                    label: "Nachrichten",
                    text: "Gelöscht, bearbeitet, angeheftet, Reaktionen. Der empfindlichste Bereich, und der, den man bewusst einschalten sollte.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Mitglieder",
                    text: "Beitritte mit Kontoalter, Abgänge, Namen, Rollen, Profilbilder und Boosts.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "Server",
                    text: "Kanäle, Rechte, Rollen, Emojis, Einladungen, Threads, Webhooks, Integrationen und Server-Einstellungen.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Sprache",
                    text: "Wer wo mitredet, wer verschoben oder getrennt wurde, Stream und Kamera.",
                    color: "var(--c-mod-content)",
                },
                {
                    label: "Moderation",
                    text: "Bann, Kick und Timeout mit Moderator und Grund, auch wenn es nicht über den Bot lief.",
                    color: "var(--c-mod-utility)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Mitschreiben ist einfach. Brauchbar mitschreiben ist die Arbeit.",
            entries: [
                {
                    title: "Urheber werden aufgelöst",
                    text: "Der Bot schaut im Audit-Log nach, wer es war, und wartet dafür gut eine Sekunde, bis Discord den Eintrag geschrieben hat.",
                    icon: "user-search",
                },
                {
                    title: "Kick oder freiwillig",
                    text: "Discord meldet beides als „Mitglied weg“. Findet der Bot einen Kick, steht er unter Moderation, sonst unter Mitglieder.",
                    icon: "filter",
                },
                {
                    title: "Aufräumen als eine Karte",
                    text: "Werden viele Nachrichten auf einmal gelöscht, entsteht eine Karte je Aktion, nicht eine je Nachricht.",
                    icon: "archive",
                },
                {
                    title: "Die Farbe sagt, was passiert ist",
                    text: "Grün heißt dazugekommen, Rot weg, Blau geändert. Wo es passt, führt ein Knopf zur Nachricht.",
                    icon: "eye",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Kanäle zuweisen, Ereignisse auswählen, fertig.",
            entries: [
                {
                    title: "Kanäle zuweisen",
                    text: "Ein Kanal je Gruppe genügt zum Anfangen, als Textkanal oder als Beitrag in einem Forum.",
                },
                {
                    title: "Ereignisse auswählen",
                    text: "Jedes einzeln. Wer Nachrichteninhalte nicht protokollieren will, lässt genau das weg.",
                },
                {
                    title: "Übergehen",
                    text: "Kanäle, Kategorien und Rollen, die nicht auftauchen sollen. Bots sind ab Werk ausgenommen.",
                },
            ],
        },
    },

    tickets: {
        intro: [
            "Support über Direktnachrichten funktioniert genau so lange, wie es eine Person gibt, die antwortet. Danach beginnt der Zustand, den jede größere Org kennt: Drei Leute beantworten dieselbe Frage unterschiedlich, eine vierte Frage bleibt liegen, und niemand weiß, was letztes Mal entschieden wurde.",
            "Das Ticket System verlegt den Vorgang dorthin, wo das Team ihn sieht: als eigenen Kanal, als Beitrag in einem Forum oder ganz per Direktnachricht an den Bot, als ModMail. Jedes Thema hat sein eigenes Kürzel und seine eigene Support-Rolle, und jedes Ticket eine Nummer wie SUP-5, die es behält, auch wenn es später umzieht.",
            "Beim Schließen entsteht ein Transcript im Discord-Look, mit Anhängen, Embeds und Components V2, im Dashboard durchsuchbar und auf Wunsch als Datei im Log-Kanal. Und wer im Team gerade nicht in Discord sitzt, liest offene Tickets im Dashboard live mit und antwortet von dort.",
        ],
        concepts: {
            title: "Zwei Schalter statt drei Modi",
            lead: "Wo das Ticket liegt und wo der Ersteller schreibt, wird getrennt eingestellt.",
            entries: [
                {
                    label: "Kanal",
                    text: "Ein Textkanal je Ticket, den nur Ersteller und Support sehen.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Forum-Beitrag",
                    text: "Ein Forum, je Ticket ein Beitrag, Thema und Priorität als Tags. Jeder, der das Forum sieht, sieht alle Tickets.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Klassisch",
                    text: "Der Ersteller sitzt selbst im Ticket und schreibt dort.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "ModMail",
                    text: "Der Ersteller schreibt dem Bot per Direktnachricht, das Team antwortet im Ticket, und der Bot leitet hin und her.",
                    color: "var(--c-mod-moderation)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Alles zwischen dem Klick und dem Transcript.",
            entries: [
                {
                    title: "Prüfung vor dem Öffnen",
                    text: "Gesperrt? Schon ein Ticket zu diesem Thema? Grenze erreicht? Der Bot fragt das, bevor ein Kanal entsteht.",
                    icon: "filter",
                },
                {
                    title: "15 Aktionen in einem Menü",
                    text: "Übernehmen, verschieben, Priorität, Einfrieren, Slowmode, Notiz, Termin, anonymer Modus und mehr, in Discord wie im Dashboard.",
                    icon: "bolt",
                },
                {
                    title: "Transcript beim Schließen",
                    text: "Der ganze Verlauf, die Anhänge gesichert, bevor Discords Links ablaufen. Der Kanal verschwindet erst, wenn das Transcript steht.",
                    icon: "archive",
                },
                {
                    title: "Termine mit Erinnerung",
                    text: "Ein Gesprächstermin im Ticket, und kurz vorher pingt der Bot Ersteller und Bearbeiter.",
                    icon: "clock",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Themen überlegen, Panel senden.",
            entries: [
                {
                    title: "Themen anlegen",
                    text: "Support, Bewerbung, Beschwerde, je nachdem, was bei euch vorkommt. Jedes mit Kürzel, Emoji und Support-Rolle.",
                },
                {
                    title: "Modus wählen",
                    text: "Kanal oder Forum, klassisch oder ModMail. Dazu die Nachrichten, die der Bot beim Öffnen, Schließen und Einfrieren schickt.",
                },
                {
                    title: "Panel senden",
                    text: "Im Dashboard oder mit /ticket panel. Es gibt nie ein zweites: Das vorhandene wird aktualisiert oder zieht um.",
                },
            ],
        },
        parts: [
            { name: "Live Tickets", text: "Ticket-Chats live mitlesen und direkt mitschreiben, mit allen Aktionen." },
            {
                name: "Transcriptions",
                text: "Der Verlauf geschlossener Tickets zum Nachlesen, durchsuchbar nach Ticket, Mitglied oder ID.",
            },
        ],
    },

    /* ==================================================================
       Aktivität
       ================================================================== */
    levels: {
        intro: [
            "Ein Level-System ist kein Spiel, sondern ein Messgerät. Es zeigt, wer den Server trägt, und zwar nicht die zehn Leute, die am lautesten sind, sondern die, die jeden Tag da sind. Für eine Organisation ist das die Grundlage für Entscheidungen, die sonst nach Bauchgefühl fallen: Wen fragt man, wenn ein Platz im Kader frei wird? Wer bekommt Zugang zum internen Bereich?",
            "Punkte gibt es für Nachrichten und für Zeit im Sprachkanal, getrennt einstellbar. Das ist wichtiger, als es klingt: Auf einem Rocket-League-Server passiert der größte Teil des Miteinanders im Voice, und ein System, das nur Textnachrichten zählt, belohnt genau die Falschen. Sprachpunkte gibt es ab Werk nur, wenn jemand anderes dabei ist, und der AFK-Kanal zählt nie.",
            "Die Level-Karte hat denselben Stil wie die Rang-Karte: abgeschrägte Ecken, dieselbe Typografie, dieselben Farben. Damit auf deinem Server nicht zwei verschiedene Produkte nebeneinanderstehen, sondern eines.",
        ],
        concepts: {
            title: "Woraus sich ein Level ergibt",
            lead: "Vier Stellschrauben, und an der ersten hängt es meistens.",
            entries: [
                {
                    label: "Chatpunkte",
                    text: "Je Nachricht eine zufällige Zahl, ab Werk 15 bis 25, höchstens einmal pro Minute. Ohne Sperre gewinnt, wer am schnellsten kurze Wörter tippt.",
                    color: "var(--c-mod-community)",
                },
                {
                    label: "Voicepunkte",
                    text: "Je Minute im Sprachkanal, ab Werk fünf. Nur mit Gesellschaft und ohne sich selbst stummzuschalten.",
                    color: "var(--c-mod-content)",
                },
                {
                    label: "Bonus",
                    text: "Ein Faktor je Rolle und je Kanal, von 0,1 bis 5. Kanäle und Rollen, die leer ausgehen sollen, lassen sich ausnehmen.",
                    color: "var(--c-text-faint)",
                },
                {
                    label: "Belohnungsrollen",
                    text: "Bis zu 25, je eine ab einem Level. Entweder bleiben alle erreichten Rollen, oder nur die höchste.",
                    color: "var(--c-mod-engagement)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Zählen, vergeben, anzeigen.",
            entries: [
                {
                    title: "Rollen ab Level",
                    text: "Wer ein Level erreicht, bekommt die Rolle im selben Moment. „Rollen nachtragen“ vergibt, was nach einer späteren Änderung fehlt.",
                    icon: "tag",
                },
                {
                    title: "Aufstiegsmeldung, wo du willst",
                    text: "Im Kanal des Aufstiegs, in einem festen Kanal, per Direktnachricht oder gar nicht, mit Vorlagen zum Anklicken.",
                    icon: "chart-up",
                },
                {
                    title: "Die Karte wird gezeichnet",
                    text: "Avatar, Level, Platz, Fortschrittsbalken, Nachrichten und Voice-Zeit, im Stil der Rang-Karte.",
                    icon: "image",
                },
                {
                    title: "Keine Punkte gehen verloren",
                    text: "Zwei Nachrichten in derselben Sekunde bringen beide ihre Punkte, und die Sperre übersteht einen Neustart.",
                    icon: "check",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Punkte, Aufstieg, Rangliste.",
            entries: [
                {
                    title: "Punkte einstellen",
                    text: "Chat, Voice, die Bonus-Faktoren und die Kanäle und Rollen ohne Punkte.",
                },
                {
                    title: "Aufstieg festlegen",
                    text: "Wohin die Meldung geht, wie sie aussieht und welche Rollen es ab welchem Level gibt.",
                },
                {
                    title: "Rangliste freigeben",
                    text: "Wenn du willst: öffentlich unter einem Link, ohne Anmeldung. Ab Werk ist sie privat.",
                },
            ],
        },
        parts: [
            {
                name: "Rangliste",
                text: "Wer wie viele Punkte hat, Punkte von Hand und auf Wunsch der öffentliche Link.",
            },
        ],
    },

    giveaways: {
        intro: [
            "Verlosungen sind das schnellste Mittel, um einen Server für einen Abend zu beleben, und das schnellste Mittel, um Ärger zu bekommen, wenn sie schlecht gemacht sind. Der übliche Ablauf: Reaktion unter einer Nachricht, ein Moderator würfelt, und der Gewinner ist ein Konto, das dem Server drei Minuten vorher beigetreten ist.",
            "Das Giveaway-Modul prüft die Bedingungen, statt sie nur danebenzuschreiben: Rollen, Server-Booster, wie lange jemand auf dem Server ist, wie alt sein Konto ist, wie viel er zuletzt geschrieben hat. Wer nicht passt, erfährt beim Klick auf „Mitmachen“ genau, was ihm fehlt. Geprüft wird noch einmal beim Auslosen: Wer den Server verlassen oder seine Rolle verloren hat, gewinnt nicht.",
            "Dazu die zwei Dinge, an denen es in der Praxis scheitert: Die Verlosung endet nach Zeit, ohne dass jemand daran denken muss. Und wer seinen Gewinn nicht innerhalb der Frist annimmt, wird automatisch ersetzt, ohne dass die ganze Verlosung wiederholt werden muss.",
        ],
        concepts: {
            title: "Bedingungen, die geprüft werden",
            lead: "Alle freiwillig, alle kombinierbar.",
            entries: [
                {
                    label: "Rollen",
                    text: "Eine von mehreren oder alle davon. Auch als Ausschluss: mit dieser Rolle geht es nicht.",
                    color: "var(--c-red)",
                },
                {
                    label: "Dabei seit",
                    text: "Mindestens so viele Tage auf dem Server. Wer zu früh kommt, sieht, wie lange es noch dauert.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Kontoalter",
                    text: "Das Discord-Konto mindestens so viele Tage alt. Die wirksamste Bedingung gegen Zweitkonten.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Nachrichten",
                    text: "Mindestens so viele Nachrichten in den letzten 14 Tagen. Hält Konten fern, die nur zum Gewinnen kommen.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Verknüpftes Konto",
                    text: "Nur wer sein Rocket-League-Konto verbunden hat. Passt, wenn es etwas fürs Spiel zu gewinnen gibt.",
                    color: "var(--c-mod-competition)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Vom Start bis zur Übergabe.",
            entries: [
                {
                    title: "Startet und endet nach Zeit",
                    text: "Sofort oder bis zu 90 Tage im Voraus geplant, mit einer Laufzeit von einer Minute bis zu 60 Tagen.",
                    icon: "clock",
                },
                {
                    title: "Gewichtet gezogen",
                    text: "Bonus-Lose je Rolle, auch für Booster. Niemand gewinnt zweimal.",
                    icon: "gift",
                },
                {
                    title: "Frist zum Annehmen",
                    text: "Gewinner bekommen eine Direktnachricht mit Knopf. Wer die Frist verpasst, wird neu ausgelost.",
                    icon: "mail",
                },
                {
                    title: "Neu auslosen von Hand",
                    text: "Für alle, die noch nicht angenommen haben, für verpasste Fristen oder für einen einzelnen Gewinner.",
                    icon: "refresh",
                },
            ],
        },
    },

    polls: {
        intro: [
            "Die meisten Abstimmungen auf Discord laufen über Reaktionen: ein Daumen hoch, ein Daumen runter, und niemand weiß, ob der Bot mitgezählt hat, ob jemand zweimal geklickt hat oder wann die Abstimmung eigentlich endet.",
            "Umfragen gibt es hier in zwei Arten, je Umfrage wählbar. Die eigene mit Knöpfen zählt der Bot selbst: Balken in der Karte, auf Wunsch anonym, mit Laufzeit oder ohne Ende, und wer abgestimmt hat, steht im Dashboard. Oder Discords eigene Umfrage, wenn es das vertraute Element sein soll.",
            "Beendet wird von selbst, sobald die Zeit um ist. Danach sehen alle die Balken, die Knöpfe verschwinden, und die Karte wird grau. Bei Discord-Umfragen wartet der Bot eine Minute nach Ablauf, bis die Zahlen endgültig sind, und schreibt dann das Ergebnis fest.",
        ],
        concepts: {
            title: "Zwei Arten",
            lead: "Welche passt, hängt davon ab, was du über die Stimmen wissen willst.",
            entries: [
                {
                    label: "Eigene mit Knöpfen",
                    text: "Laufzeit von einer Minute bis zu einem Jahr oder ohne Ende, anonym möglich, auf bestimmte Rollen beschränkbar, mit Beschreibungstext.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Discord-Umfrage",
                    text: "Das Element von Discord, eine Stunde bis 32 Tage. Discord zählt selbst und zeigt, wer was gewählt hat.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Anonym",
                    text: "Niemand sieht, wer was gewählt hat, auch nicht im Dashboard.",
                    color: "var(--c-mod-moderation)",
                },
                {
                    label: "Balken",
                    text: "Immer sichtbar, erst nach der eigenen Stimme oder erst am Ende. Damit die ersten Stimmen nicht alle folgenden lenken.",
                    color: "var(--c-mod-community)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Zählen, zeigen, beenden.",
            entries: [
                {
                    title: "Ein Klick zählt, ein zweiter zieht zurück",
                    text: "Bei Mehrfachwahl schaltet jeder Knopf seine Antwort an und aus. Die Bestätigung sieht nur, wer abgestimmt hat.",
                    icon: "check",
                },
                {
                    title: "Die Karte hält Schritt",
                    text: "Die Balken zeichnen sich höchstens alle drei Sekunden neu. Auch 200 Stimmen in einer Minute überrennen Discord nicht.",
                    icon: "bar-chart",
                },
                {
                    title: "Endet von allein",
                    text: "Abgelaufene Umfragen beendet der Bot jede Minute. Eine Umfrage ohne Ende läuft, bis jemand sie beendet.",
                    icon: "clock",
                },
            ],
        },
    },

    /* ==================================================================
       Inhalte
       ================================================================== */
    "twitch-notifier": {
        intro: [
            "Ein Stream, von dem niemand weiß, ist kein Stream. Die Leute, die zuschauen würden, sind auf demselben Server. Sie erfahren nur nichts davon, weil die Meldung entweder gar nicht kommt oder als nackter Link in einem Kanal steht, den niemand liest.",
            "Der Twitch Notifier sagt Bescheid, sobald jemand aus deiner Organisation live geht: mit einer Karte, die Titel, Spiel, Zuschauer und Vorschaubild zeigt und sich während des Streams nachzieht. Wechselt Titel oder Spiel, sofort, sonst höchstens alle fünf Minuten.",
            "Nach dem Stream wird aus der Karte auf Wunsch eine Zusammenfassung: Titel, Spiel, Dauer, Zuschauer-Höchststand und, wenn es ihn schon gibt, ein Knopf zum VOD. Und für die Dauer des Streams bekommt die Person eine Live-Rolle, die sie in der Mitgliederliste nach oben zieht.",
        ],
        concepts: {
            title: "Nach dem Stream",
            lead: "Je Streamer einstellbar.",
            entries: [
                {
                    label: "Zusammenfassung",
                    text: "Der Standard. Aus der Karte wird „… war live“, mit Dauer und Zuschauer-Höchststand.",
                    color: "var(--c-mod-content)",
                },
                {
                    label: "Löschen",
                    text: "Die Meldung verschwindet, sobald der Stream vorbei ist.",
                    color: "var(--c-loss)",
                },
                {
                    label: "Stehen lassen",
                    text: "Die Karte bleibt, wie sie war.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Arbeit zwischen Streamstart und Streamende.",
            entries: [
                {
                    title: "Jede Minute nachgefragt",
                    text: "Alle Streamer aller Server in einem Rutsch, je Anfrage bis zu hundert.",
                    icon: "refresh",
                },
                {
                    title: "Live-Rolle kommt und geht",
                    text: "Über den Streaming-Status in Discord oder über die Liste. Nach dem Stream nimmt der Bot sie wieder weg.",
                    icon: "tag",
                },
                {
                    title: "Wer es in Discord ist",
                    text: "Der Bot erkennt das Discord-Konto am Streaming-Status oder an der Verknüpfung, die jemand beim Login ins Dashboard freigibt.",
                    icon: "user-search",
                },
                {
                    title: "Test ohne Stream",
                    text: "„Test senden“ schickt dieselbe Karte mit Beispielwerten in den Kanal, ohne auf den nächsten Stream zu warten.",
                    icon: "bell",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Streamer eintragen, Nachricht gestalten.",
            entries: [
                { title: "Streamer eintragen", text: "Name, @Name oder Link, bis zu 25 je Server." },
                {
                    title: "Kanal und Ping wählen",
                    text: "Ein Textkanal oder ein Beitrag in einem Forum, dazu @everyone, @here oder eine Rolle, je Streamer eigen.",
                },
                {
                    title: "Nachricht gestalten",
                    text: "Mit Platzhaltern für Titel, Spiel, Zuschauer und Vorschaubild, daneben die Live-Vorschau.",
                },
            ],
        },
    },

    "youtube-notifier": {
        intro: [
            "Auf YouTube passiert mehr als auf Twitch, nur leiser: ein neues Video am Dienstag, drei Shorts am Wochenende, ein Livestream nach dem Turnier. Wer nicht abonniert hat, bekommt davon nichts mit, auch wenn er auf demselben Discord-Server ist.",
            "Der YouTube Notifier meldet neue Videos, Shorts und Livestreams der Kanäle deiner Organisation. Jede Art bekommt ihre eigene Nachricht, und ein Kanal lässt sich über die ID, einen Link oder das @Handle eintragen. Beim Eintragen merkt sich der Bot, was schon im Kanal steht, damit nicht sofort eine Flut alter Videos kommt.",
            "Steht an einem Kanal ein Discord-Mitglied, bekommt es während seines Livestreams die Live-Rolle. Discord sieht YouTube-Livestreams selbst nicht, deshalb geht das nur über diese Zuordnung.",
        ],
        concepts: {
            title: "Drei Arten von Meldung",
            lead: "Jede mit eigener Nachricht, alle im selben Kanal.",
            entries: [
                { label: "Video", text: "Ein neues Video im Kanal.", color: "var(--c-red)" },
                {
                    label: "Short",
                    text: "Ein neuer Short. Den erkennt der Bot selbst, der Feed sagt es nicht.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Livestream",
                    text: "Ein laufender Livestream, mit Live-Rolle für das eingetragene Discord-Mitglied.",
                    color: "var(--c-mod-moderation)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Damit die Meldung stimmt.",
            entries: [
                {
                    title: "Alle fünf Minuten nachgesehen",
                    text: "Ein Feed je Kanal. Für Videos und Shorts braucht es keinen weiteren Schlüssel.",
                    icon: "refresh",
                },
                {
                    title: "Keine Flut beim Eintragen",
                    text: "Was beim Eintragen schon im Feed steht, gilt als gesehen.",
                    icon: "filter",
                },
                {
                    title: "Handles werden aufgelöst",
                    text: "@Handle und alte /c/- und /user/-Links werden in die Kanal-ID übersetzt.",
                    icon: "link",
                },
                {
                    title: "Fehler bleiben sichtbar",
                    text: "Geht eine Meldung nicht raus, steht der Grund am Kanal und im Dashboard. Gelöscht wird nichts.",
                    icon: "eye",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Kanal eintragen, Nachrichten gestalten.",
            entries: [
                { title: "Kanal eintragen", text: "Per Kanal-ID, Link oder @Handle, bis zu 25 je Server." },
                { title: "Arten wählen", text: "Videos, Shorts und Livestreams, jede mit eigener Nachricht." },
                {
                    title: "Discord-Mitglied zuordnen",
                    text: "Wenn du willst: für die Erwähnung in der Nachricht und für die Live-Rolle.",
                },
            ],
        },
    },

    gallery: {
        intro: [
            "Bilder sammeln sich auf einem Server schneller an als alles andere: Logos, Trikot-Entwürfe, Grafiken für Ankündigungen, Screenshots, Vorlagen. Sie liegen in fünf Kanälen verteilt, und wer eines davon wiederfinden will, scrollt.",
            "Das Gallery System ist die Bildverwaltung dazu. Bilder werden hochgeladen, in Alben und Unteralben einsortiert und lassen sich danach durchblättern, verschieben und wiederfinden. In Discord über ein einziges Panel mit /gallery, im Dashboard per Knopf oder durch Ziehen auf das Raster, mit einem Fortschrittsbalken je Datei.",
            "Es gehört fest zum Bot, weil die anderen Module ihre Bilder von hier holen: den Hintergrund der Welcome Card, die Bilder in Ticket-Nachrichten, das Logo eines Teams. Ein Bild liegt einmal in der Galerie und wird überall wiederverwendet, statt in jeder Einstellung neu hochgeladen zu werden.",
        ],
        concepts: {
            title: "Wie die Verwaltung aufgebaut ist",
            lead: "Zwei Ebenen, mehr braucht es nicht.",
            entries: [
                {
                    label: "Album",
                    text: "Ein benannter Ordner, etwa Logos oder Grafiken. Darunter auf Wunsch eine Ebene Unteralben.",
                    color: "var(--c-mod-content)",
                },
                {
                    label: "Bild",
                    text: "Die Datei, verkleinert auf höchstens 1920 Pixel und als WebP gespeichert. Animierte GIFs bleiben, wie sie sind.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Vorlagen",
                    text: "Mitgelieferte Bilder des Bots, etwa die Rang-Abzeichen. Sie stehen neben deinen, lassen sich aber nicht löschen.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "custom",
                    text: "Das Album, in das Uploads aus anderen Modulen fallen, etwa ein Hintergrund aus dem Welcome System.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Die Verwaltungsarbeit an einem Bildarchiv.",
            entries: [
                {
                    title: "Verkleinert beim Speichern",
                    text: "Jedes neue Bild, egal ob aus Discord oder aus dem Dashboard. Aus einem Foto mit mehreren Megabyte wird eine Datei, die schnell lädt.",
                    icon: "image",
                },
                {
                    title: "Mehrere auf einmal",
                    text: "In Discord zählt eine Nachricht mit bis zu zehn Anhängen und Links. Eine kaputte Quelle bricht den Rest nicht ab.",
                    icon: "upload",
                },
                {
                    title: "Nur Bilder werden angenommen",
                    text: "Bis 8 MB, erkannt am tatsächlichen Dateityp, nicht an der Endung.",
                    icon: "filter",
                },
                {
                    title: "Nichts wird überschrieben",
                    text: "Ein zweites Bild mit demselben Namen bekommt eine Nummer angehängt, statt das erste zu ersetzen.",
                    icon: "lock",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Alben anlegen, Bestand hochladen.",
            entries: [
                {
                    title: "Alben anlegen",
                    text: "So viele, wie ihr Kategorien habt. Vier Alben, die benutzt werden, schlagen zwölf, die keiner kennt.",
                },
                {
                    title: "Bestand hochladen",
                    text: "Im Dashboard per Ziehen auf das Raster oder in Discord über /gallery.",
                },
                {
                    title: "In den Modulen nutzen",
                    text: "Überall, wo ein Bild gebraucht wird, öffnet sich dieselbe Auswahl mit deinen Alben.",
                },
            ],
        },
    },

    clips: {
        intro: [
            "Die besten Szenen eines Servers landen irgendwo zwischen „schau mal“ und einem Link, der nach drei Tagen niemandem mehr etwas sagt. Ein Tor aus dem letzten Match, eine Rettung in letzter Sekunde, ein Flip Reset, den keiner für möglich gehalten hat.",
            "Clips der Woche sammelt diese Szenen an einer Stelle: Mitglieder reichen ihre besten ein, und jede Woche wird der beste Clip gekürt. Wie genau eingereicht und gekürt wird, steht fest, sobald das Modul ausgeliefert ist.",
        ],
    },

    /* ==================================================================
       Werkzeug
       ================================================================== */
    "custom-message": {
        intro: [
            "Ankündigungen sehen auf den meisten Servern aus wie Chatnachrichten, weil sie welche sind. Der Unterschied zwischen einer hingetippten Zeile und einer gestalteten Nachricht mit Logo, Farbe und Struktur ist der Unterschied zwischen einer Gruppe und einer Organisation.",
            "Custom Message gibt dir dafür einen Editor statt eines Textfelds: Karte, Embed oder normale Nachricht, mit Vorlagen, Platzhaltern und Server-Emojis, daneben die Vorschau. Darunter Knöpfe, die Rollen geben, Links öffnen oder eine Antwort zeigen, die nur der Klickende sieht.",
            "Der Punkt, der sonst am häufigsten fehlt: Eine gesendete Nachricht lässt sich ändern. Wer eine falsche Uhrzeit korrigiert, speichert einfach neu, und der Bot zieht die Nachricht in Discord nach, statt dass sie gelöscht und neu geschrieben werden muss.",
        ],
        concepts: {
            title: "Senden nach Termin",
            lead: "Einmal gebaut, dann von selbst.",
            entries: [
                { label: "Von Hand", text: "Nur auf Knopfdruck.", color: "var(--c-text-faint)" },
                { label: "Einmal", text: "Zu einem festen Zeitpunkt, danach wieder von Hand.", color: "var(--c-blue)" },
                { label: "Jeden Tag", text: "Zur eingestellten Uhrzeit.", color: "var(--c-mod-engagement)" },
                {
                    label: "Jede Woche",
                    text: "An einem Wochentag zur Uhrzeit. Auf Wunsch räumt der Bot die vorige Nachricht weg, damit immer nur die aktuelle im Kanal steht.",
                    color: "var(--c-mod-content)",
                },
            ],
        },
        automations: {
            title: "Was das Modul kann",
            lead: "Vier Dinge, die ein Textfeld nicht kann.",
            entries: [
                {
                    title: "Knöpfe, die bleiben",
                    text: "Bis zu zehn je Nachricht. Sie funktionieren auch Monate später und nach jedem Neustart.",
                    icon: "bolt",
                },
                {
                    title: "Vorschau vor dem Senden",
                    text: "Die Nachricht so sehen, wie sie ankommt, bevor sie ankommt.",
                    icon: "eye",
                },
                {
                    title: "Nachträglich ändern",
                    text: "Speichern ändert die Nachricht in Discord gleich mit. Der Link auf sie bleibt gültig.",
                    icon: "refresh",
                },
                {
                    title: "Stichwörter mit Antwort",
                    text: "Der Bot liest mit und antwortet, wenn etwas passt: enthält, ist genau, beginnt mit oder Regex. Mit Sperre, damit nichts im Kreis läuft.",
                    icon: "message-square",
                },
            ],
        },
    },

    backups: {
        intro: [
            "Eine falsch gesetzte Einstellung, ein gelöschtes Panel, ein Test, der mehr geändert hat als gedacht: Auf einem Server mit vielen Modulen ist schnell etwas weg, das jemand über Wochen eingerichtet hat.",
            "Backups sichert den ganzen Stand eines Servers. Welche Module an sind und wie sie eingestellt sind, Nachrichten und Panels, dazu die Daten der Mitglieder wie Level, Tickets oder Verwarnungen. Von Hand vor einem Umbau oder automatisch in dem Rhythmus, den du einstellst.",
            "Zurückgeladen wird im Dashboard in drei Schritten, und nur das, was du auswählst. Vorher sichert der Bot den jetzigen Stand, damit sich auch das Zurückladen wieder rückgängig machen lässt.",
        ],
        concepts: {
            title: "Welche Backups es gibt",
            lead: "Drei Arten, alle an einer Stelle.",
            entries: [
                {
                    label: "Von Hand",
                    text: "Mit einem Klick und einer Notiz, etwa vor dem Umbau der Rollen. Bleibt, bis du es löschst. Bis zu zehn je Server.",
                    color: "var(--c-blue)",
                },
                {
                    label: "Automatisch",
                    text: "Jeden Tag, alle drei Tage, jede Woche oder jeden Monat zur vollen Stunde. Du legst fest, wie viele bleiben, die ältesten gehen von selbst.",
                    color: "var(--c-mod-content)",
                },
                {
                    label: "Vor dem Zurückladen",
                    text: "Legt der Bot selbst an, bevor er zurücklädt. Damit lässt sich das Zurückladen 72 Stunden lang rückgängig machen.",
                    color: "var(--c-mod-engagement)",
                },
                {
                    label: "Bereiche",
                    text: "Module und Einstellungen, Nachrichten und Panels, Voice, Bewerbungen, Level, Tickets, Moderation, Community, Teams und Clips. Jeder lässt sich einzeln zurückholen.",
                    color: "var(--c-text-faint)",
                },
            ],
        },
        automations: {
            title: "Was von selbst passiert",
            lead: "Sichern soll keine Arbeit sein.",
            entries: [
                {
                    title: "Pünktlich gesichert",
                    text: "Zur eingestellten Stunde nach Berliner Zeit. Fällt ein Termin aus, etwa bei einer Wartung, kommt das Backup danach, aber nur einmal.",
                    icon: "clock",
                },
                {
                    title: "Alte Backups gehen",
                    text: "Sind mehr automatische da als eingestellt, löscht der Bot die ältesten. Die von Hand fasst er nicht an.",
                    icon: "trash",
                },
                {
                    title: "Panels kommen zurück",
                    text: "Nach dem Zurückladen prüft der Bot Rollen-, Ticket- und Voice-Panels und postet fehlende neu.",
                    icon: "refresh",
                },
                {
                    title: "Nichts bleibt halb",
                    text: "Alle gewählten Bereiche kommen zusammen zurück oder gar nicht. Klappt etwas nicht, bleibt alles, wie es war.",
                    icon: "shield-check",
                },
            ],
        },
        setup: {
            title: "Einrichten",
            lead: "Einmal einstellen, dann läuft es.",
            entries: [
                {
                    title: "Automatisch einschalten",
                    text: "Im Dashboard unter Backups: Rhythmus, Uhrzeit und wie viele bleiben sollen.",
                },
                {
                    title: "Vor Umbauten von Hand sichern",
                    text: "Mit einer kurzen Notiz, damit später klar ist, wofür es war.",
                },
                {
                    title: "Zurückladen",
                    text: "Unter Meine Backups das Backup wählen, Bereiche aussuchen und mit dem Namen des Servers bestätigen.",
                },
            ],
        },
        parts: [
            {
                name: "Meine Backups",
                text: "Alle Backups des Servers: ansehen, was drinsteckt, zurückladen oder löschen.",
            },
        ],
    },

    dashboard: {
        intro: [
            "Ein Bot, der nur über Commands eingestellt wird, hat ein Problem: Niemand kennt die Commands. Die Einrichtung landet bei der einen Person, die sie sich gemerkt hat, und wenn diese Person nicht mehr da ist, traut sich niemand mehr an die Einstellungen.",
            "Das Dashboard ist deshalb kein Zusatz, sondern der Hauptzugang. Jedes Modul hat dort seinen Schalter und seine Einstellungen: Kanäle, Rollen, Texte, Schwellenwerte, fast überall mit Live-Vorschau. Angemeldet wird mit Discord, und angezeigt werden nur die Server, auf denen du die Rechte dafür hast.",
            "Auf der Übersicht jedes Servers steht, was dort los ist: Nachrichten, Zeit im Sprachkanal, Beitritte und Abgänge der letzten 30 Tage, die aktivsten Kanäle und Mitglieder, eine Heatmap nach Wochentag und Uhrzeit und die Rang-Verteilung der verknüpften Spieler. Gezählt wird ab dem Tag, an dem RL Nexus auf dem Server läuft.",
        ],
        automations: {
            title: "Was das Dashboard kann",
            lead: "Und was dadurch nicht mehr über Commands laufen muss.",
            entries: [
                {
                    title: "Module einzeln schalten",
                    text: "Ein Schalter je Modul, auch per /module in Discord. Aus heißt aus.",
                    icon: "puzzle",
                },
                {
                    title: "Moderatoren mit eigenem Zugang",
                    text: "Wer auf der Moderatoren-Liste steht, sieht Live Tickets, Transcripts und die Moderation, aber keine Einstellungen.",
                    icon: "lock",
                },
                {
                    title: "Sofort wirksam",
                    text: "Änderungen greifen ohne Neustart. Offene Fenster ziehen sich selbst nach, wenn auf dem Server etwas Neues passiert.",
                    icon: "bolt",
                },
                {
                    title: "Anmeldung mit Zwei-Faktor",
                    text: "Kein zweites Passwort, aber auch kein Zugang ohne Zwei-Faktor-Schutz am Discord-Konto.",
                    icon: "discord",
                },
            ],
        },
    },
};
