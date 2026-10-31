/**
 * Die Platzhalter der Ticket-Nachrichten, mit Beschriftung und einem Beispiel
 * für die Vorschau. Der Bot führt dieselben Schlüssel (src/constants/Placeholders.ts);
 * npm run check:dashboard vergleicht beide Listen.
 */
export interface IPlaceholder {
    key: string;
    label: string;
    /** Was die Vorschau zeigt, solange es keinen echten Wert gibt. */
    sample: string;
    /** Eine Überschrift in der Auswahl, etwa je Spieler der Team-Übersicht. Ohne steht er oben. */
    group?: string;
}

export const PLACEHOLDERS: IPlaceholder[] = [
    { key: "user", label: "User (Erwähnung)", sample: "@du" },
    { key: "user.name", label: "Name des Users", sample: "du" },
    { key: "user.id", label: "ID des Users", sample: "123456789012345678" },
    { key: "user.avatar", label: "Avatar des Users (Bild)", sample: "" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.id", label: "Server-ID", sample: "123456789012345678" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "guild.members", label: "Mitgliederzahl", sample: "0" },
    { key: "ticket.id", label: "Ticket-ID", sample: "SUP-42" },
    { key: "user.code", label: "User-ID", sample: "U-7K3F" },
    { key: "ticket.option", label: "Gewählte Option", sample: "Support" },
    { key: "ticket.priority", label: "Priorität", sample: "Normal" },
    { key: "ticket.opened", label: "Geöffnet (Zeitpunkt)", sample: "vor 2 Minuten" },
    { key: "ticket.claimer", label: "Wer bearbeitet", sample: "niemand" },
    { key: "support.role", label: "Support-Rolle", sample: "@Team" },
    { key: "closer", label: "Wer geschlossen hat", sample: "@Team" },
    { key: "reason", label: "Grund", sample: "Erledigt" },
    { key: "bot", label: "Der Bot (Erwähnung)", sample: "@RL Nexus" },
];

/** Die beiden, die als Bildquelle taugen - sie ergeben eine URL. */
export const IMAGE_PLACEHOLDERS = ["{user.avatar}", "{guild.icon}"];

/** Twitch Notifier - dieselben Schlüssel wie TWITCH_PLACEHOLDER_KEYS im Bot (constants/Streams.ts). */
export const TWITCH_PLACEHOLDERS: IPlaceholder[] = [
    { key: "streamer", label: "Streamer", sample: "MecryTv" },
    { key: "streamer.login", label: "Twitch-Name", sample: "mecrytv" },
    { key: "streamer.avatar", label: "Profilbild (Bild)", sample: "" },
    { key: "stream.title", label: "Titel des Streams", sample: "Ranked 2v2 bis GC – !discord" },
    { key: "stream.game", label: "Spiel", sample: "Rocket League" },
    { key: "stream.url", label: "Link zum Stream", sample: "https://twitch.tv/mecrytv" },
    { key: "stream.viewers", label: "Zuschauer", sample: "128" },
    { key: "stream.preview", label: "Vorschaubild (Bild)", sample: "" },
    { key: "stream.started", label: "Live seit (Zeitpunkt)", sample: "vor 3 Minuten" },
    { key: "streamer.mention", label: "Streamer in Discord (Erwähnung)", sample: "@MecryTv" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
];

export const TWITCH_IMAGES = ["{stream.preview}", "{streamer.avatar}"];

/** YouTube Notifier - dieselben Schlüssel wie YOUTUBE_PLACEHOLDER_KEYS im Bot. */
export const YOUTUBE_PLACEHOLDERS: IPlaceholder[] = [
    { key: "channel", label: "Kanal", sample: "RL Nexus" },
    { key: "channel.avatar", label: "Kanalbild (Bild)", sample: "" },
    { key: "video.title", label: "Titel", sample: "Die 10 besten Aerial-Tore der Woche" },
    { key: "video.url", label: "Link", sample: "https://youtu.be/dQw4w9WgXcQ" },
    { key: "video.thumbnail", label: "Vorschaubild (Bild)", sample: "" },
    { key: "video.kind", label: "Art (Video, Short, Livestream)", sample: "Video" },
    { key: "video.published", label: "Veröffentlicht (Zeitpunkt)", sample: "vor 2 Minuten" },
    { key: "channel.mention", label: "Kanal in Discord (Erwähnung)", sample: "@MecryTv" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
];

export const YOUTUBE_IMAGES = ["{video.thumbnail}", "{channel.avatar}"];

/** Level System - dieselben Schlüssel wie LEVEL_PLACEHOLDER_KEYS im Bot. */
export const LEVEL_PLACEHOLDERS: IPlaceholder[] = [
    { key: "user", label: "User (Erwähnung)", sample: "@du" },
    { key: "user.name", label: "Name des Users", sample: "du" },
    { key: "user.id", label: "ID des Users", sample: "123456789012345678" },
    { key: "level", label: "Neues Level", sample: "7" },
    { key: "level.old", label: "Altes Level", sample: "6" },
    { key: "xp", label: "Punkte insgesamt", sample: "2800" },
    { key: "xp.next", label: "Punkte bis zum nächsten Level", sample: "400" },
    { key: "rank", label: "Platz in der Rangliste", sample: "12" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "channel", label: "Kanal (Erwähnung)", sample: "#allgemein" },
];

export const LEVEL_IMAGES: string[] = [];

/** Welcome System - dieselben Schlüssel wie WELCOME_PLACEHOLDER_KEYS im Bot. */
export const WELCOME_PLACEHOLDERS: IPlaceholder[] = [
    { key: "user", label: "User (Erwähnung)", sample: "@du" },
    { key: "user.name", label: "Anzeigename", sample: "Lara" },
    { key: "user.tag", label: "Discord-Name", sample: "lara" },
    { key: "user.id", label: "ID des Users", sample: "123456789012345678" },
    { key: "user.avatar", label: "Avatar (Bild)", sample: "" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "guild.members", label: "Mitgliederzahl", sample: "148" },
    { key: "member.number", label: "Das wievielte Mitglied", sample: "148" },
    { key: "joined", label: "Beigetreten (Zeitpunkt)", sample: "gerade eben" },
    { key: "created", label: "Konto erstellt (Zeitpunkt)", sample: "vor 2 Jahren" },
];

export const WELCOME_IMAGES = ["{user.avatar}", "{guild.icon}"];

/** Der Kopf des Hubs. Ohne {teams}: die Teams setzt der Bot selbst darunter (W-0026). */
export const TEAM_BOARD_PLACEHOLDERS: IPlaceholder[] = [
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "teams.count", label: "Anzahl der Teams", sample: "2" },
    { key: "groups.count", label: "Anzahl der Kategorien", sample: "2" },
    { key: "mmr.mode", label: "Grundlage der MMR", sample: "WTSI" },
    { key: "updated", label: "Stand der Werte", sample: "vor 5 Minuten" },
];

/** Eine einzelne Team-Karte. */
export const TEAM_CARD_PLACEHOLDERS: IPlaceholder[] = [
    { key: "team.name", label: "Name des Teams", sample: "Vyrox Main" },
    { key: "team.tag", label: "Kürzel", sample: "VYX" },
    { key: "team.region", label: "Region", sample: "EU" },
    { key: "team.group", label: "Kategorie", sample: "Main" },
    { key: "team.description", label: "Beschreibung", sample: "Unser Hauptkader für die Quali." },
    { key: "team.mmr", label: "Team-MMR", sample: "1386" },
    { key: "team.rank", label: "Team-Rang, nach „Ränge zeigen als“", sample: "Grand Champion I Div I" },
    { key: "team.rank.short", label: "Team-Rang kurz", sample: "GC1 D1" },
    { key: "team.rank.icon", label: "Team-Rang immer als Icon", sample: "Grand Champion I Div I" },
    { key: "team.roster", label: "Der ganze Kader", sample: "**Captain**\n@Nico `1478` · Grand Champion I Div III\n**Stamm**\n@Mo `1402` · Champion III Div II" },
    {
        key: "team.lineup",
        label: "Aufstellung (nur wer spielt)",
        sample: "**Captain** » @Nico · `1478` · Grand Champion I Div III · [Tracker](https://rocketleague.tracker.network)\n**Stamm** » @Mo · `1402` · Champion III Div II · [Tracker](https://rocketleague.tracker.network)\n**Ersatz** » @Jules · `1290` · Champion I Div II",
    },
    { key: "team.staff", label: "Coach und Manager", sample: "**Coach** » @Lara\n**Manager** » @Timo" },
    { key: "team.leagues", label: "Liga-Links", sample: "[RLCS Quali](https://rlcs.gg) · [Nexus Liga](https://start.gg)" },
    { key: "team.captain", label: "Captain", sample: "@Nico" },
    { key: "team.cocaptain", label: "Co-Captain", sample: "@Mo" },
    { key: "team.player", label: "Stamm", sample: "@Mo, @Lena" },
    { key: "team.sub", label: "Ersatz", sample: "@Jules" },
    { key: "team.trial", label: "Trial", sample: "—" },
    { key: "team.coach", label: "Coach", sample: "@Lara" },
    { key: "team.manager", label: "Manager", sample: "—" },
    { key: "team.players", label: "Wie viele spielen", sample: "4" },
    { key: "team.role", label: "Rolle des Teams", sample: "@Vyrox Main" },
    { key: "team.channel", label: "Kanal des Teams", sample: "#vyrox-main" },
    { key: "team.logo", label: "Logo (Bild)", sample: "" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "updated", label: "Stand der Werte", sample: "vor 5 Minuten" },
];

export const TEAM_IMAGES = ["{team.logo}", "{guild.icon}"];

/** Ein ausgeschriebener Rang: "Grand Champion I Div II", "Champion III", "Supersonic Legend". */
const RANK_TEXT = /(Grand Champion|Champion|Diamant|Platin|Gold|Silber|Bronze) (III|II|I)(?: Div (?:IV|III|II|I))?|Supersonic Legend|Unranked/g;

/**
 * Die Ränge in einem Vorschau-Wert so, wie „Ränge zeigen als“ gerade steht -
 * auch ungespeichert. Der Bot schickt sie ausgeschrieben, icons ordnet jedem
 * Rang sein Emoji zu ("Grand Champion I" → "<:rl_gc1:…>"). Ohne Icon bleibt der
 * Text, genau wie beim Senden (RankFormatter im Bot, check:teams vergleicht).
 */
export function styleRanks(text: string, style: "text" | "icon" | "both", icons: Record<string, string>): string {
    if (style === "text") return text;

    return text.replace(RANK_TEXT, (match: string, family?: string, step?: string) => {
        const icon = icons[family ? `${family} ${step}` : match];

        if (!icon) return match;

        return style === "icon" ? icon : `${icon} ${match}`;
    });
}

/**
 * Eine Aufgabe so, wie „Aufgaben zeigen als“ gerade steht - auch ungespeichert.
 * icons ordnet jeder Aufgabe ihr Abzeichen zu ("Captain" → "<:rl_role_captain:…>").
 * Ohne Abzeichen bleibt der Text, genau wie beim Senden (RoleFormatter im Bot).
 */
export function styleRole(label: string, style: "text" | "icon" | "both", icons: Record<string, string>): string {
    if (style === "text" || !Object.hasOwn(icons, label)) return label;

    return style === "icon" ? icons[label] : `${icons[label]} ${label}`;
}

/** Die Aufgaben in {team.lineup}, {team.roster} und {team.staff} - dort stehen sie fett: **Captain**. */
export function styleRoles(text: string, style: "text" | "icon" | "both", icons: Record<string, string>): string {
    if (style === "text") return text;

    return text.replace(/\*\*([^*\n]+)\*\*/g, (match: string, label: string) => (Object.hasOwn(icons, label) ? `**${styleRole(label, style, icons)}**` : match));
}

/**
 * Je Spieler mit Epic-Namen: {epicname} und was dahinter geht. Dieselben Felder
 * wie PLAYER_FIELDS im Bot (src/builder/TeamView.ts), npm run check:teams
 * vergleicht beide. Die Schlüssel selbst baut die Seite aus den Kadern.
 */
export const TEAM_PLAYER_FIELDS: [string, string][] = [
    ["", "Spieler"],
    ["rank", "Rang nach der Rechnung"],
    ["rank.short", "Rang kurz"],
    ["rank.icon", "Rang immer als Icon"],
    ["mmr", "MMR-Wert"],
    ["current", "Aktuelle MMR"],
    ["peak", "Peak"],
    ["tracker", "Tracker-Link"],
];

/* ----------------------------------------------------------
   Looking for
   ---------------------------------------------------------- */
/**
 * Die festen Platzhalter je Nachricht - dieselben Schlüssel wie LFT_*_KEYS im
 * Bot (src/constants/Lft.ts), npm run check:lft vergleicht beide Listen.
 *
 * Dazu kommen die beweglichen: je Frage ein {frageN} und ein {antwortN}. Die
 * baut die Seite selbst aus den eingestellten Fragen (pages/GuildLft.ts) -
 * eine feste Liste könnte sie nicht kennen.
 */
const LFT_WHO: IPlaceholder[] = [
    { key: "user", label: "Wer sucht (Erwähnung)", sample: "@Lara" },
    { key: "user.name", label: "Name", sample: "Lara" },
    { key: "user.id", label: "ID", sample: "123456789012345678" },
    { key: "user.avatar", label: "Avatar (Bild)", sample: "" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.id", label: "Server-ID", sample: "123456789012345678" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "art", label: "Art der Suche", sample: "Spieler-Suche" },
];

const ANSWER_SAMPLE = "**Welchen Rang hast du – aktuell und als Peak?**\n> Champ 1 Div 2, Peak Champ 2\n\n**Auf welcher Plattform spielst du?**\n> PC";

const LFT_ANSWERS: IPlaceholder[] = [
    { key: "antworten", label: "Alle Antworten (Frage und Antwort)", sample: ANSWER_SAMPLE },
    { key: "antworten.kurz", label: "Alle Antworten, je eine Zeile", sample: "**Welchen Rang hast du?** Champ 1 Div 2\n**Plattform** PC" },
];

/** Der Beitrag im Forum. */
export const LFT_POST_PLACEHOLDERS: IPlaceholder[] = [
    ...LFT_WHO,
    ...LFT_ANSWERS,
    { key: "erstellt", label: "Erstellt (Zeitpunkt)", sample: "vor 2 Minuten" },
];

/** Die Vorschau in der DM - sie kennt schon den Titel, den der Beitrag bekommt. */
export const LFT_PREVIEW_PLACEHOLDERS: IPlaceholder[] = [
    ...LFT_POST_PLACEHOLDERS,
    { key: "post.titel", label: "Titel des Beitrags", sample: "🔎 Lara sucht ein Team" },
    { key: "forum", label: "Das Forum (Erwähnung)", sample: "#lft" },
];

/** Die Begrüßung in der DM - Antworten gibt es dort noch nicht. */
export const LFT_INTRO_PLACEHOLDERS: IPlaceholder[] = [
    { key: "user", label: "Wer sucht (Erwähnung)", sample: "@Lara" },
    { key: "user.name", label: "Name", sample: "Lara" },
    { key: "user.avatar", label: "Avatar (Bild)", sample: "" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "art", label: "Art der Suche", sample: "Spieler-Suche" },
    { key: "fragen.anzahl", label: "Wie viele Fragen kommen", sample: "6" },
    { key: "forum", label: "Das Forum (Erwähnung)", sample: "#lft" },
];

/** Eine einzelne Frage in der DM. */
export const LFT_QUESTION_PLACEHOLDERS: IPlaceholder[] = [
    { key: "user.name", label: "Name", sample: "Lara" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "art", label: "Art der Suche", sample: "Spieler-Suche" },
    { key: "frage", label: "Die Frage", sample: "Welchen Rang hast du – aktuell und als Peak?" },
    { key: "frage.hinweis", label: "Hinweis zur Frage (leer, wenn keiner)", sample: "\n-# Zum Beispiel: Champ 1 Div 2, Peak Champ 2" },
    { key: "frage.nummer", label: "Die wievielte Frage", sample: "1" },
    { key: "frage.pflicht", label: "Pflicht oder freiwillig", sample: "Pflichtfrage" },
    { key: "fragen.anzahl", label: "Wie viele Fragen es sind", sample: "6" },
];

/** Die letzte Nachricht in der DM, wenn der Beitrag steht. */
export const LFT_DONE_PLACEHOLDERS: IPlaceholder[] = [
    { key: "user", label: "Wer sucht (Erwähnung)", sample: "@Lara" },
    { key: "user.name", label: "Name", sample: "Lara" },
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "art", label: "Art der Suche", sample: "Spieler-Suche" },
    ...LFT_ANSWERS.slice(0, 1),
    { key: "post.titel", label: "Titel des Beitrags", sample: "🔎 Lara sucht ein Team" },
    { key: "post.url", label: "Link zum Beitrag", sample: "https://discord.com/channels/1/2" },
    { key: "forum", label: "Das Forum (Erwähnung)", sample: "#lft" },
];

/** Die Meldung ans Team. */
export const LFT_NOTICE_PLACEHOLDERS: IPlaceholder[] = [
    ...LFT_WHO,
    ...LFT_ANSWERS,
    { key: "post.titel", label: "Titel des Beitrags", sample: "🔎 Lara sucht ein Team" },
    { key: "post.url", label: "Link zum Beitrag", sample: "https://discord.com/channels/1/2" },
    { key: "forum", label: "Das Forum (Erwähnung)", sample: "#lft" },
    { key: "erstellt", label: "Erstellt (Zeitpunkt)", sample: "vor 2 Minuten" },
];

/** Das Panel im Forum (Plan 30): gehört niemandem, deshalb nur der Server. Wie LFT_PANEL_KEYS im Bot. */
export const LFT_PANEL_PLACEHOLDERS: IPlaceholder[] = LFT_WHO.filter((entry) => entry.key.startsWith("guild"));

export const LFT_IMAGES = ["{user.avatar}", "{guild.icon}"];

/* ----------------------------------------------------------
   Matchups
   ---------------------------------------------------------- */
/**
 * Dieselben Schlüssel wie MATCHUP_KEYS im Bot (src/constants/Matchups.ts);
 * npm run check:matchups vergleicht beide Listen.
 *
 * {bestof} und {stream} bringen ihre Formatierung mit und sind leer, wenn es
 * nichts zu zeigen gibt - so bleibt keine halbe Zeile stehen.
 */
export const MATCHUP_PLACEHOLDERS: IPlaceholder[] = [
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "team", label: "Eigenes Team", sample: "Vyrox Main" },
    { key: "team.tag", label: "Kürzel", sample: "VYX" },
    { key: "team.role", label: "Rolle des Teams (Erwähnung)", sample: "@Vyrox Main" },
    { key: "team.logo", label: "Team-Logo (Bild, sonst Server-Icon)", sample: "" },
    { key: "gegner", label: "Gegner", sample: "Ascension" },
    { key: "liga", label: "Liga oder Turnier", sample: "RLCS Quali" },
    { key: "modus", label: "Modus", sample: "3v3 Standard" },
    { key: "bestof", label: "Best-of (mit Trenner, sonst leer)", sample: " · Bo5" },
    { key: "zeit", label: "Anpfiff (voll)", sample: "Samstag, 12. Oktober 2026 20:00" },
    { key: "zeit.kurz", label: "Anpfiff (kurz)", sample: "12.10.2026 20:00" },
    { key: "countdown", label: "Wie lange noch", sample: "in 2 Stunden" },
    { key: "stream", label: "Stream als Link (sonst leer)", sample: "📺 [Stream ansehen](https://twitch.tv/mecrytv)" },
    { key: "stream.link", label: "Stream als reine Adresse", sample: "https://twitch.tv/mecrytv" },
    { key: "notiz", label: "Notiz", sample: "Server EU, Anpfiff pünktlich." },
    { key: "eingetragen", label: "Wer eingetragen hat", sample: "Nico" },
    { key: "bilanz", label: "Bilanz des Teams", sample: "9 Siege · 3 Niederlagen" },
    { key: "serie", label: "Serie (ab zwei gleichen)", sample: "3 Siege in Folge" },
    { key: "form", label: "Form der letzten 5", sample: "🟩🟩🟩🟥🟩" },
];

/** Die Ergebnis-Nachricht kennt zusätzlich den Ausgang. */
export const MATCHUP_RESULT_PLACEHOLDERS: IPlaceholder[] = [
    ...MATCHUP_PLACEHOLDERS,
    { key: "ergebnis", label: "Ergebnis", sample: "3:1" },
    { key: "ausgang", label: "Sieg, Niederlage oder Unentschieden", sample: "✅ Sieg" },
];

export const MATCHUP_IMAGES = ["{team.logo}", "{guild.icon}"];

/* ----------------------------------------------------------
   2, 4 & 6 Mans
   ---------------------------------------------------------- */
/**
 * Dieselben Schlüssel wie PANEL_KEYS, ROUND_KEYS und RESULT_KEYS im Bot
 * (src/constants/SixMans.ts); npm run check:sixmans vergleicht beide Listen.
 *
 * Je Modus gibt es eigene Platzhalter: {anzahl.6} ist die Warteschlange von
 * 6 Mans, {warteschlange} sind alle drei untereinander.
 */
export const SIX_PANEL_PLACEHOLDERS: IPlaceholder[] = [
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    {
        key: "warteschlange",
        label: "Alle Modi untereinander",
        sample: "**2 Mans** · 1v1 · 1/2\n1. @Lara · ⚡ Boost-Jäger `640` · vor 2 Minuten\n\n**6 Mans** · 3v3 · 2/6\n1. @Nico · ⚡ Boost-Jäger `588` · gerade eben",
    },
    { key: "anzahl", label: "Wie viele insgesamt warten", sample: "3" },
    { key: "modi", label: "Welche Modi laufen", sample: "2 Mans, 4 Mans, 6 Mans" },
    { key: "runden", label: "Gespielte Runden", sample: "128" },
    { key: "spieler", label: "Gewertete Spieler", sample: "24" },
    { key: "bester", label: "Wer oben steht", sample: "Lara · 🪂 Luftikus 762 (6 Mans)" },
    { key: "anzahl.2", label: "In 2 Mans", sample: "1" },
    { key: "anzahl.4", label: "In 4 Mans", sample: "0" },
    { key: "anzahl.6", label: "In 6 Mans", sample: "2" },
    { key: "frei.2", label: "Noch frei in 2 Mans", sample: "1" },
    { key: "frei.4", label: "Noch frei in 4 Mans", sample: "4" },
    { key: "frei.6", label: "Noch frei in 6 Mans", sample: "4" },
    { key: "warteschlange.2", label: "Nur 2 Mans", sample: "1. @Lara · ⚡ Boost-Jäger `640` · vor 2 Minuten" },
    { key: "warteschlange.4", label: "Nur 4 Mans", sample: "_Noch niemand._" },
    { key: "warteschlange.6", label: "Nur 6 Mans", sample: "1. @Nico · ⚡ Boost-Jäger `588` · gerade eben" },
];

export const SIX_ROUND_PLACEHOLDERS: IPlaceholder[] = [
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "runde", label: "Nummer der Runde", sample: "129" },
    { key: "modus", label: "Der Modus", sample: "6 Mans" },
    { key: "modus.spiel", label: "Was im Spiel daraus wird", sample: "3v3" },
    { key: "blau", label: "Team Blau", sample: "• @Lara · 🧱 Wandfahrer `662`\n• @Nico · ⚡ Boost-Jäger `588`\n• @Mo · ⚡ Boost-Jäger `612`" },
    { key: "orange", label: "Team Orange", sample: "• @Jules · ⚡ Boost-Jäger `601`\n• @Timo · ⚡ Boost-Jäger `623`\n• @Kim · ⚡ Boost-Jäger `615`" },
    { key: "blau.mmr", label: "Schnitt Blau", sample: "620" },
    { key: "orange.mmr", label: "Schnitt Orange", sample: "613" },
    { key: "blau.rang", label: "Stufe von Blau", sample: "⚡ Boost-Jäger" },
    { key: "orange.rang", label: "Stufe von Orange", sample: "⚡ Boost-Jäger" },
    { key: "lobby", label: "Name der Lobby", sample: "m482kqx" },
    { key: "passwort", label: "Passwort der Lobby", sample: "hn4bx" },
    { key: "kanal.blau", label: "Sprachkanal Blau", sample: "🔵 #Runde 129 · Blau" },
    { key: "kanal.orange", label: "Sprachkanal Orange", sample: "🟠 #Runde 129 · Orange" },
    { key: "spieler", label: "Wie viele spielen", sample: "6" },
    { key: "mmr.schnitt", label: "Schnitt im Spiel", sample: "616" },
];

export const SIX_RESULT_PLACEHOLDERS: IPlaceholder[] = [
    ...SIX_ROUND_PLACEHOLDERS,
    { key: "sieger", label: "Das Siegerteam", sample: "• @Lara · 🧱 Wandfahrer `662`\n• @Nico · ⚡ Boost-Jäger `588`\n• @Mo · ⚡ Boost-Jäger `612`" },
    { key: "sieger.team", label: "Blau oder Orange", sample: "🔵 Blau" },
    { key: "verlierer", label: "Das andere Team", sample: "• @Jules · ⚡ Boost-Jäger `601`\n• @Timo · ⚡ Boost-Jäger `623`\n• @Kim · ⚡ Boost-Jäger `615`" },
    { key: "veraenderung", label: "Wie viel MMR bewegt wurde", sample: "±24" },
];

export const SIX_IMAGES = ["{guild.icon}"];

/* ----------------------------------------------------------
   Clips der Woche
   ---------------------------------------------------------- */
/**
 * Dieselben Schlüssel wie CLIP_KEYS und WINNER_KEYS im Bot
 * (src/constants/Clips.ts); npm run check:clips vergleicht beide Listen.
 *
 * {preise} und {link} bringen ihre Formatierung mit und sind leer, wenn es
 * nichts zu zeigen gibt.
 */
export const CLIP_PLACEHOLDERS: IPlaceholder[] = [
    { key: "guild", label: "Servername", sample: "Dein Server" },
    { key: "guild.icon", label: "Server-Icon (Bild)", sample: "" },
    { key: "kanal", label: "Der Clip-Kanal (Erwähnung)", sample: "#clips-der-woche" },
    { key: "max", label: "Clips je Person", sample: "bis zu 2 Clips" },
    { key: "preise", label: "Die Preise mit Überschrift (sonst leer)", sample: "**Zu gewinnen**\n🥇 Discord Nitro\n🥈 Rolle „Clip des Monats“" },
    { key: "emoji", label: "Das Emoji zum Abstimmen", sample: "🔥" },
    { key: "link", label: "Link zur öffentlichen Seite (sonst leer)", sample: "[Alle Clips ansehen](https://dashboard.nexus-emb.de/clips/1)" },
    { key: "runde", label: "Tag, an dem die Runde aufging", sample: "5. Oktober 2026" },
    { key: "schluss", label: "Einreichen bis (Zeitpunkt)", sample: "Freitag, 9. Oktober 2026 20:00" },
    { key: "schluss.countdown", label: "Einreichen: wie lange noch", sample: "in 4 Tagen" },
    { key: "ende", label: "Abstimmung bis (Zeitpunkt)", sample: "Sonntag, 11. Oktober 2026 20:00" },
    { key: "ende.countdown", label: "Abstimmung: wie lange noch", sample: "in 2 Tagen" },
    { key: "anzahl", label: "Wie viele Clips dabei sind", sample: "12 Clips" },
];

/** Die Gewinner-Ansage kennt zusätzlich die Plätze. */
export const CLIP_WINNER_PLACEHOLDERS: IPlaceholder[] = [
    ...CLIP_PLACEHOLDERS,
    { key: "gewinner", label: "Die Gewinner als Liste", sample: "🥇 @Sophie – 21 Stimmen · Discord Nitro\n🥈 @Mo – 14 Stimmen\n🥉 @Lara – 9 Stimmen" },
    { key: "platz1", label: "Platz 1 (Erwähnung)", sample: "@Sophie" },
    { key: "platz2", label: "Platz 2 (Erwähnung)", sample: "@Mo" },
    { key: "platz3", label: "Platz 3 (Erwähnung)", sample: "@Lara" },
];

export const CLIP_IMAGES = ["{guild.icon}"];

/**
 * Setzt ein, was bekannt ist. Unbekanntes bleibt stehen, wie beim Bot - und wie
 * dort ist Gross und klein egal, Unter- und Bindestriche auch ({MecryTv.rank}).
 */
export function fill(text: string, values: Record<string, string>): string {
    const own = (key: string): string | undefined => (Object.hasOwn(values, key) ? values[key] : undefined);

    return text.replace(/\{([A-Za-z0-9._-]+)\}/g, (match, key: string) => own(key) ?? own(key.toLowerCase().replace(/[_-]/g, "")) ?? match);
}
