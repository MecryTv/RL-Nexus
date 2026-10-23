import { ModuleCategory, ModuleStatus } from "../domain/enums/ModuleCategory";
import type { IModuleDefinition } from "../domain/interfaces/IModule";

/**
 * Jedes Modul des Bots.
 *
 * Reine Daten - die Reihenfolge hier spielt keine Rolle, sortiert wird in der
 * `ModuleRegistry`. `status` ist der Stand im Bot-Projekt: `Live` heißt, das
 * Modul ist dort programmiert und im Dashboard einstellbar, `Beta` heißt in
 * Arbeit, `Planned` heißt angekündigt. Beim Ausliefern eines Moduls wird hier
 * eine Zeile geändert.
 *
 * Die IDs sind dieselben wie im Bot (`src/constants/Modules.ts` dort). Nur
 * `rl-tracking` und `dashboard` stehen dort nicht: beide gehören fest zum Bot
 * und haben keinen Schalter.
 *
 * Der ausführliche Teil - Einleitung, Begriffe, Automatiken, FAQ - steht in
 * `moduleDetails.data.ts` und wird nur von der Detailseite geladen. Getrennt,
 * weil diese Liste sonst zwischen tausend Zeilen Fließtext nicht mehr zu
 * überblicken wäre - und weil die Startseite die Texte nie zeigt und sie
 * deshalb auch nicht mitladen soll.
 */
export const MODULE_DEFINITIONS: readonly IModuleDefinition[] = [
    /* ------------------------------------------------------------------
       Community
       ------------------------------------------------------------------ */
    {
        id: "welcome",
        name: "Welcome System",
        tagline: "Der erste Eindruck, den dein Server macht.",
        description:
            "Begrüßt neue Mitglieder mit einer gezeichneten Welcome Card, einer Karte im Components-V2-Stil, " +
            "einem Embed oder einer normalen Nachricht. Dazu Rollen, die jeder Neue automatisch bekommt, und " +
            "auf Wunsch ein Abschied, wenn jemand geht.",
        category: ModuleCategory.Community,
        status: ModuleStatus.Live,
        icon: "wave",
        featured: true,
        highlights: [
            "Welcome Card mit Avatar, Hintergrund aus der Galerie und Server-Icon",
            "Auto-Rollen, getrennt für Mitglieder und Bots",
            "Vier Arten: Bild, Karte, Embed oder reiner Text",
            "Platzhalter wie Mitgliedsnummer, Beitrittsdatum und Kontoalter",
            "Abschied mit eigenem Kanal und eigenem Text",
        ],
    },
    {
        id: "apply",
        name: "Apply System",
        tagline: "Bewerbungen, die nicht in Direktnachrichten versanden.",
        description:
            "Bewerbungen laufen über einen öffentlichen Link mit Formularen, die dein Server selbst baut. Jede " +
            "Bewerbung landet als Karte im Team-Kanal und im Dashboard, mit Annehmen und Ablehnen. Wer " +
            "angenommen wird, bekommt die Rolle automatisch.",
        category: ModuleCategory.Community,
        status: ModuleStatus.Live,
        icon: "clipboard",
        featured: true,
        highlights: [
            "Bis zu 15 Formulare mit je bis zu 20 Fragen",
            "Karte im Team-Kanal mit Annehmen und Ablehnen",
            "Rolle bei Annahme und Nachricht an den Bewerber",
            "Kurze Antwort, langer Text oder Auswahl",
            "Pause nach Absage, Mindestalter des Kontos, Voraussetzungsrolle",
        ],
    },
    {
        id: "reaction-roles",
        name: "Self Roles",
        tagline: "Rollen per Klick, ohne dass ein Moderator etwas tun muss.",
        description:
            "Mitglieder holen sich ihre Rollen selbst aus einem Panel, als Knopfreihe oder als Auswahlmenü. " +
            "Regeln legen fest, wie viele es sein dürfen und wer überhaupt wählen darf.",
        category: ModuleCategory.Community,
        status: ModuleStatus.Live,
        icon: "sparkle",
        highlights: [
            "Knöpfe mit Emoji und Farbe oder ein Auswahlmenü",
            "„Genau eine“ für Plattform, Region oder Farbe",
            "Höchstzahl und Voraussetzungsrolle je Panel",
            "Gesperrte Rollen, die sich nicht wieder abwählen lassen",
            "Bis zu 25 Panels je Server",
        ],
    },
    {
        id: "voice-hub",
        name: "Temp Voice",
        tagline: "Ein eigener Sprachkanal auf Zuruf, der wieder verschwindet.",
        description:
            "Wer den Hub betritt, bekommt seinen eigenen Sprachkanal und wird hineingezogen. Ist der Letzte " +
            "draußen, verschwindet der Kanal wieder. Eingestellt wird er über ein Menü, und wer mag, speichert " +
            "sich seine Einstellungen als Preset.",
        category: ModuleCategory.Community,
        status: ModuleStatus.Live,
        icon: "mic",
        highlights: [
            "Bis zu zehn Hubs mit eigener Namensvorlage und Kategorie",
            "Panel mit 13 Optionen: umbenennen, sperren, begrenzen, einladen und mehr",
            "Presets, die beim nächsten eigenen Kanal von selbst gelten",
            "Der Kanal geht an den Nächsten, wenn der Besitzer geht",
            "Support-Hub: Talk ohne Panel, Warteraum aus der Moderation",
        ],
    },

    /* ------------------------------------------------------------------
       Wettbewerb
       ------------------------------------------------------------------ */
    {
        id: "rl-tracking",
        name: "RL Tracking",
        tagline: "Ränge, Karriere-Werte und Season-Reward direkt in Discord.",
        description:
            "Verknüpft Discord-Konten mit Epic-Konten und holt Ränge, MMR, Spielzahlen und Karriere-Werte " +
            "aus Rocket League. Das Ergebnis ist die Rang-Karte, dieselbe, deren Farben diese Seite trägt. " +
            "Auch ohne Verknüpfung durchsuchbar, wenn du wissen willst, wen du da gerade scoutest.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "crosshair",
        featured: true,
        builtIn: true,
        highlights: [
            "Ränge für 1v1, 2v2 und 3v3 mit MMR und Serie",
            "Karriere-Werte: Tore, Vorlagen, Paraden, MVPs",
            "Suche nach fremden Spielern ohne Verknüpfung",
            "Season-Reward-Fortschritt mit Balken",
            "Ingame-Club direkt auf der Karte",
        ],
        commands: ["rank me", "rank search", "rank link", "rank unlink"],
    },
    {
        id: "rank-roles",
        name: "Rank Roles",
        tagline: "Die Rangrolle kommt aus dem Spiel, nicht aus der Selbstauskunft.",
        description:
            "Rollen nach Rocket-League-Rang, je Playlist eine eigene. Wer den Command eingibt, bekommt die " +
            "Rolle, die zu seinem aktuellen Rang gehört. Der Rang kommt aus dem verknüpften Epic-Konto, einen " +
            "fremden Namen kann niemand angeben.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "tag",
        highlights: [
            "Alle 22 Ränge einzeln zuordenbar, von Bronze I bis Supersonic Legend",
            "1v1, 2v2 und 3v3 getrennt eingestellt",
            "Beim Aufstieg geht die alte Rolle derselben Playlist",
            "Keine Rolle, solange die Platzierungsspiele laufen",
            "Command auf Wunsch nur in einem Kanal",
        ],
        commands: ["rangrollen holen", "rangrollen ablegen"],
    },
    {
        id: "teams",
        name: "RL Team-Übersicht",
        tagline: "Kader anlegen, besetzen und aktuell halten.",
        description:
            "Teams mit Name, Kürzel, Logo und Kader, gegliedert in Gruppen und angezeigt in einem Kanal. Von " +
            "Hand kommt nur der Peak: Name, aktuelle MMR und Rang holt der Bot selbst. Daraus rechnet er die " +
            "Team-MMR, nach WTSI oder nach deiner eigenen Formel.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "shield-users",
        featured: true,
        highlights: [
            "Captain, Co-Captain, Stamm, Ersatz, Trial, Coach und Manager",
            "Ränge und MMR holt der Bot über den Epic-Namen",
            "Team-MMR nach WTSI oder eigener Formel",
            "Eine Übersicht für alle oder eine Karte je Team",
            "Auswahlmenü, über das jeder die Karte eines Teams aufruft",
            "Tracker-Link neben jedem Spieler",
        ],
    },
    {
        id: "lft",
        name: "Looking for",
        tagline: "Spieler suchen Teams, Teams suchen Spieler.",
        description:
            "Wer sucht, gibt einen Command ein, und der Bot fragt per Direktnachricht die Fragen ab, die euer " +
            "Team im Dashboard festgelegt hat. Erst nach der Vorschau entsteht der Beitrag im Forum, mit Tag " +
            "und einem Knopf, der die Suche beendet.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "user-search",
        highlights: [
            "Spieler-Suche und Team-Suche mit eigenen Fragen",
            "Frage für Frage per Direktnachricht, mit Vorschau vor dem Abschicken",
            "Beitrag im Forum mit Tags, die der Bot selbst anlegt",
            "Suchen laufen nach einer festen Zahl von Tagen ab",
            "Meldung ans Team, sobald ein Beitrag entsteht",
        ],
        commands: ["lookingfor spieler", "lookingfor team", "lookingfor beenden"],
    },
    {
        id: "matchups",
        name: "Matchups",
        tagline: "Anstehende Partien, eingetragen von denen, die sie spielen.",
        description:
            "Captains, Manager und Coaches tragen die Partien ihres Teams selbst ein, über einen Link und ohne " +
            "Rechte im Dashboard. Der Bot kündigt jede Partie im Kanal an, erinnert kurz vor Anpfiff und hält " +
            "danach das Ergebnis fest.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "swords",
        highlights: [
            "Eintragen über einen Link, lesen ohne Anmeldung",
            "Gegner, Liga, Modus, Best-of, Stream-Link und Notiz",
            "Erinnerung vor Anpfiff, ab Werk 30 Minuten vorher",
            "Änderungen ziehen die Ankündigung nach, ohne erneuten Ping",
            "Ergebnis mit Sieg, Niederlage oder Unentschieden",
        ],
    },
    {
        id: "rl-6mans",
        name: "2, 4 & 6 Mans",
        tagline: "Warteschlangen für 1v1, 2v2 und 3v3, mit eigener Wertung.",
        description:
            "Mitglieder stellen sich in eine Warteschlange, und sobald genug da sind, teilt der Bot zwei " +
            "möglichst gleich starke Teams ein. Er legt Sprachkanäle an, würfelt Lobby-Name und Passwort und " +
            "passt nach dem Spiel die MMR an. Die Wertung gehört deinem Server und hat mit den Rängen im Spiel " +
            "nichts zu tun.",
        category: ModuleCategory.Competition,
        status: ModuleStatus.Live,
        icon: "gamepad",
        featured: true,
        highlights: [
            "Faire Teams aus der MMR deines Servers",
            "Sprachkanäle für Blau und Orange, Lobby-Name und Passwort",
            "Getrennte Warteschlangen, MMR und Ranglisten je Modus",
            "Ergebnis per Knopf, auf Wunsch von beiden Teams bestätigt",
            "Eigene Stufen mit Namen, Zeichen und Farbe",
            "Öffentliche Rangliste ohne Anmeldung",
        ],
    },

    /* ------------------------------------------------------------------
       Moderation
       ------------------------------------------------------------------ */
    {
        id: "moderation",
        name: "Moderation",
        tagline: "Verwarnen, stummschalten, kicken und bannen, mit Akte.",
        description:
            "Jede Aktion wird ein Fall mit fortlaufender Nummer, Grund, Dauer und Verlauf, egal ob sie aus " +
            "Discord oder aus dem Dashboard kommt. Dazu Notizen und Beweise am Fall, eine Karte im Log-Kanal " +
            "und auf Wunsch eine Direktnachricht an den Betroffenen.",
        category: ModuleCategory.Moderation,
        status: ModuleStatus.Live,
        icon: "gavel",
        featured: true,
        highlights: [
            "Verwarnung, Timeout, Kick und Bann, befristet oder dauerhaft",
            "Stufen: ab einer Zahl von Verwarnungen folgt die Strafe von selbst",
            "Notizen und Beweisbilder an jedem Fall",
            "Verlauf je Mitglied im Dashboard",
            "Befristete Banns hebt der Bot selbst wieder auf",
        ],
        commands: [
            "warn",
            "unwarn",
            "timeout",
            "untimeout",
            "kick",
            "ban",
            "unban",
            "purge",
            "fall zeigen",
            "fall notiz",
            "fall beweis",
            "verlauf",
        ],
    },
    {
        id: "automod",
        name: "Auto Mod",
        tagline: "Die Regeln, die sonst nachts niemand durchsetzt.",
        description:
            "Nimmt aus dem Chat, was niemand sehen soll, bevor ein Moderator online ist. Acht Filter, jeder " +
            "einzeln schaltbar und jeder mit eigener Folge, vom bloßen Löschen bis zum Bann. Auch nachträglich " +
            "bearbeitete Nachrichten werden geprüft.",
        category: ModuleCategory.Moderation,
        status: ModuleStatus.Live,
        icon: "shield-check",
        highlights: [
            "Wortliste, Einladungen, Links, Spam, Wiederholung, Erwähnungen, Großbuchstaben, Emojis",
            "Folge je Filter: löschen, verwarnen, Timeout, Kick oder Bann",
            "Erkennt Schreibtricks wie „1d10t“ oder „i.d.i.o.t“",
            "Ausnahmen für Kanäle, Kategorien und Rollen",
            "Probe im Dashboard, ohne jemanden zu bestrafen",
        ],
    },
    {
        id: "logging",
        name: "Logging System",
        tagline: "Nachvollziehen, was passiert ist, auch drei Wochen später.",
        description:
            "Schreibt mit, was auf deinem Server passiert: 38 Ereignisse in fünf Gruppen, jedes einzeln " +
            "schaltbar und auf Wunsch mit eigenem Kanal. Gelöschte Nachrichten bleiben lesbar, und aus dem " +
            "Audit-Log steht dabei, wer es war.",
        category: ModuleCategory.Moderation,
        status: ModuleStatus.Live,
        icon: "scroll",
        highlights: [
            "38 Ereignisse in fünf Gruppen, jedes einzeln schaltbar",
            "Gelöschte und bearbeitete Nachrichten im Wortlaut",
            "Wer es war, aus dem Audit-Log",
            "Ein Kanal je Gruppe, einzelne Ereignisse auf Wunsch woandershin",
            "Textkanal oder Beitrag in einem Forum",
            "Kanäle, Rollen und Bots lassen sich übergehen",
        ],
    },
    {
        id: "tickets",
        name: "Ticket System",
        tagline: "Support, der nicht in deinen Direktnachrichten landet.",
        description:
            "Support-Anfragen als eigener Kanal, als Beitrag in einem Forum oder ganz per Direktnachricht an " +
            "den Bot. Beim Schließen entsteht ein Transcript im Discord-Look, und im Dashboard liest das Team " +
            "offene Tickets live mit.",
        category: ModuleCategory.Moderation,
        status: ModuleStatus.Live,
        icon: "ticket",
        featured: true,
        highlights: [
            "Kanal, Forum-Beitrag oder ModMail per Direktnachricht",
            "Transcript beim Schließen, samt gesicherter Anhänge",
            "Live Tickets: im Dashboard mitlesen und antworten",
            "Themen mit eigenem Kürzel und eigener Support-Rolle",
            "15 Aktionen, von Übernehmen und Priorität bis Einfrieren",
            "Sperrliste und Grenze für offene Tickets",
        ],
        commands: ["ticket setup", "ticket panel", "ticket entsperren"],
    },

    /* ------------------------------------------------------------------
       Aktivität
       ------------------------------------------------------------------ */
    {
        id: "levels",
        name: "Level System",
        tagline: "Aktivität, die man sieht.",
        description:
            "Punkte fürs Schreiben und für die Zeit im Sprachkanal, Belohnungsrollen ab einem bestimmten Level " +
            "und eine Rangliste. Die Level-Karte hat denselben Stil wie die Rang-Karte, damit auf deinem Server " +
            "nicht zwei verschiedene Produkte nebeneinanderstehen.",
        category: ModuleCategory.Engagement,
        status: ModuleStatus.Live,
        icon: "chart-up",
        featured: true,
        highlights: [
            "Punkte für Chat und Sprachkanal, mit Sperre gegen Spam",
            "Bis zu 25 Belohnungsrollen, sammeln oder ersetzen",
            "Level-Karte im Stil der Rang-Karte",
            "Bonus-Faktoren je Rolle und je Kanal",
            "Öffentliche Rangliste, wenn du sie freigibst",
        ],
        commands: ["level rang", "level rangliste"],
    },
    {
        id: "giveaways",
        name: "Giveaways",
        tagline: "Verlosungen mit Bedingungen, die auch geprüft werden.",
        description:
            "Verlosungen mit Laufzeit, mehreren Gewinnern und Bedingungen, die beim Mitmachen und noch einmal " +
            "beim Auslosen geprüft werden. Bonus-Lose für bestimmte Rollen, und wer seinen Gewinn nicht " +
            "rechtzeitig annimmt, wird automatisch ersetzt.",
        category: ModuleCategory.Engagement,
        status: ModuleStatus.Live,
        icon: "gift",
        highlights: [
            "Bedingungen: Rollen, Booster, Zeit auf dem Server, Kontoalter, Nachrichten",
            "Bonus-Lose je Rolle, gewichtet gezogen",
            "Frist zum Annehmen, danach wird neu gelost",
            "Sofort oder geplant, bis zu 60 Tage Laufzeit",
            "Neu auslosen, auch für einzelne Gewinner",
        ],
        commands: ["giveaway start", "giveaway beenden", "giveaway neu", "giveaway abbrechen"],
    },
    {
        id: "polls",
        name: "Umfragen",
        tagline: "Abstimmungen im Kanal, mit dem Ergebnis auf einen Blick.",
        description:
            "Eigene Umfragen mit Knöpfen und Balken oder Discords eigene Umfrage, je Umfrage wählbar. Mit " +
            "Laufzeit oder ohne Ende, mit Mehrfachwahl und auf Wunsch anonym.",
        category: ModuleCategory.Engagement,
        status: ModuleStatus.Live,
        icon: "list-checks",
        highlights: [
            "Eigene Umfrage mit Knöpfen oder Discord-Umfrage",
            "Anonym: niemand sieht, wer was gewählt hat",
            "Zwei bis zehn Antworten, auf Wunsch mit Mehrfachwahl",
            "Balken immer, nach der eigenen Stimme oder erst am Ende",
            "Abstimmen nur für bestimmte Rollen",
        ],
        commands: ["umfrage erstellen", "umfrage beenden"],
    },

    /* ------------------------------------------------------------------
       Inhalte
       ------------------------------------------------------------------ */
    {
        id: "twitch-notifier",
        name: "Twitch Notifier",
        tagline: "Deine Leute erfahren es, wenn es anfängt.",
        description:
            "Meldet, wenn jemand aus deiner Organisation auf Twitch live geht, mit einer Karte, die sich " +
            "während des Streams nachzieht. Danach wird daraus auf Wunsch eine Zusammenfassung mit Dauer und " +
            "Zuschauer-Höchststand, und für die Dauer des Streams gibt es eine Live-Rolle.",
        category: ModuleCategory.Content,
        status: ModuleStatus.Live,
        icon: "twitch",
        featured: true,
        highlights: [
            "Karte mit Titel, Spiel, Zuschauern und Vorschaubild",
            "Aktualisiert sich, solange der Stream läuft",
            "Live-Rolle für die Dauer des Streams",
            "Zusammenfassung, Löschen oder Stehenlassen nach dem Stream",
            "Eigene Nachricht und eigener Ping je Streamer",
            "Bis zu 25 Streamer je Server",
        ],
    },
    {
        id: "youtube-notifier",
        name: "YouTube Notifier",
        tagline: "Neue Videos, Shorts und Livestreams, sobald sie da sind.",
        description:
            "Meldet neue Videos, Shorts und Livestreams der YouTube-Kanäle deiner Organisation. Jede Art " +
            "bekommt ihre eigene Nachricht, und wer an einem Kanal als Discord-Mitglied eingetragen ist, " +
            "bekommt während seines Livestreams die Live-Rolle.",
        category: ModuleCategory.Content,
        status: ModuleStatus.Live,
        icon: "youtube",
        highlights: [
            "Videos, Shorts und Livestreams getrennt",
            "Eigene Nachricht je Art",
            "Kanal per ID, Link oder @Handle eintragen",
            "Keine Flut alter Videos beim Eintragen",
            "Live-Rolle während des Livestreams",
        ],
    },
    {
        id: "gallery",
        name: "Gallery System",
        tagline: "Bilder verwalten, statt sie zu suchen.",
        description:
            "Die Bildverwaltung deiner Organisation: Logos, Grafiken und Vorlagen in Alben sortieren, " +
            "durchblättern und wiederfinden, in Discord über ein Panel oder im Dashboard per Ziehen und " +
            "Ablegen. Die anderen Module holen ihre Bilder von hier, etwa den Hintergrund der Welcome Card.",
        category: ModuleCategory.Content,
        status: ModuleStatus.Live,
        icon: "image",
        builtIn: true,
        highlights: [
            "Alben und Unteralben statt verstreuter Kanäle",
            "Hochladen im Dashboard oder über ein Panel in Discord",
            "Jedes Bild wird verkleinert und als WebP gespeichert",
            "Verschieben, löschen und Alben anlegen an einer Stelle",
            "Fest eingebaut: die anderen Module greifen darauf zu",
        ],
        commands: ["gallery"],
    },
    {
        id: "clips",
        name: "Clips der Woche",
        tagline: "Jede Woche die beste Szene deines Servers.",
        description:
            "Mitglieder reichen ihre besten Szenen ein, und jede Woche wird der beste Clip gekürt. So landen " +
            "die Highlights deiner Organisation an einer Stelle, statt in fünf Kanälen unterzugehen.",
        category: ModuleCategory.Content,
        status: ModuleStatus.Planned,
        icon: "play",
        highlights: [
            "Mitglieder reichen ihre Szenen ein",
            "Jede Woche wird der beste Clip gekürt",
            "Einzeln zuschaltbar wie jedes andere Modul",
        ],
    },

    /* ------------------------------------------------------------------
       Werkzeug
       ------------------------------------------------------------------ */
    {
        id: "custom-message",
        name: "Custom Message",
        tagline: "Nachrichten im Namen des Bots, gestaltet statt getippt.",
        description:
            "Eigene Nachrichten im Dashboard bauen, als Karte, Embed oder normaler Text, mit Knöpfen darunter. " +
            "Gesendet wird von Hand oder nach Termin, und eine gesendete Nachricht lässt sich nachträglich " +
            "ändern. Dazu Stichwörter, auf die der Bot von selbst antwortet.",
        category: ModuleCategory.Utility,
        status: ModuleStatus.Live,
        icon: "megaphone",
        highlights: [
            "Karte, Embed oder normaler Text mit Live-Vorschau",
            "Knöpfe für Rollen, Links oder versteckte Antworten",
            "Einmal, täglich oder wöchentlich nach Termin",
            "Gesendete Nachrichten nachträglich ändern",
            "Stichwörter mit automatischer Antwort, auch als Regex",
        ],
    },
    {
        id: "dashboard",
        name: "Web-Dashboard",
        tagline: "Jedes Modul im Browser einstellen, nicht per Command.",
        description:
            "Alle Module lassen sich im Dashboard zuschalten und einstellen, dazu eine Übersicht über das, was " +
            "auf deinem Server los ist. Angemeldet wird mit Discord, und von dort wird der Bot auch auf deinen " +
            "Server eingeladen.",
        category: ModuleCategory.Utility,
        status: ModuleStatus.Live,
        icon: "dashboard",
        builtIn: true,
        highlights: [
            "Module einzeln an- und abschalten",
            "Übersicht mit Nachrichten, Voice-Zeit, Beitritten und Rang-Verteilung",
            "Moderatoren sehen Tickets und Moderation, aber keine Einstellungen",
            "Anmeldung über Discord, nur mit Zwei-Faktor-Schutz",
            "Änderungen greifen sofort, ohne Neustart",
        ],
        commands: ["module an", "module aus", "module liste"],
    },
    {
        id: "backups",
        name: "Backups",
        tagline: "Der alte Stand ist nur ein paar Klicks entfernt.",
        description:
            "Sichert Module, Einstellungen, Nachrichten und die Daten deiner Mitglieder, von Hand oder automatisch " +
            "in deinem Rhythmus. Geht etwas schief, holst du im Dashboard den alten Stand zurück, ganz oder nur " +
            "einzelne Bereiche wie Level oder Tickets.",
        category: ModuleCategory.Utility,
        status: ModuleStatus.Live,
        icon: "archive",
        builtIn: true,
        highlights: [
            "Von Hand sichern, mit Notiz, bis zu zehn Backups je Server",
            "Automatisch jeden Tag, alle drei Tage, jede Woche oder jeden Monat",
            "Einzelne Bereiche zurückladen statt alles auf einmal",
            "Vor jedem Zurückladen sichert der Bot den jetzigen Stand",
            "Fehlende Panels postet der Bot danach von selbst neu",
        ],
    },
];
