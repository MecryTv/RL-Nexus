/**
 * Fertige Nachrichten zum Anklicken.
 *
 * Eine Vorlage füllt den Editor - Art, Text, Embed und die Karte. Gespeichert
 * wird erst, wenn jemand auf Speichern drückt; ein Klick daneben kostet also
 * nichts, und der Knopf „Zurück" holt den Stand davor wieder.
 *
 * Die Platzhalter je Zusammenhang stehen in constants/Placeholders.ts - was
 * hier steht, muss dazu passen.
 */

import { IBody, IEmbed } from "../layout/BodyEditor.js";
import { IMessageDoc } from "../layout/MessageEditor.js";

export interface ITemplate {
    id: string;
    name: string;
    hint: string;
    /** Was die Vorlage in den Editor schreibt. Fehlt ein Feld, bleibt es, wie es war. */
    body: Partial<IBody> & { doc?: IMessageDoc };
}

/** Wo Vorlagen angeboten werden. */
export type TemplateScope =
    | "welcomeJoin"
    | "welcomeLeave"
    | "levelUp"
    | "selfRoles"
    | "message"
    | "teamBoard"
    | "teamCard"
    | "lftPost"
    | "lftPreview"
    | "lftIntro"
    | "lftQuestion"
    | "lftDone"
    | "lftNotice"
    | "matchupAnnounce"
    | "matchupRemind"
    | "matchupResult"
    | "sixPanel"
    | "sixRound"
    | "sixResult"
    | "sixDm";

const BLUE = "#00afff";
const RED = "#ff1e2d";
const GREEN = "#3ba55c";

function card(accent: string, ...blocks: string[]): IMessageDoc {
    return { accent, blocks: blocks.map((body) => (body === "---" ? { type: "separator" as const } : { type: "text" as const, body })) };
}

function embed(over: Partial<IEmbed>): IEmbed {
    return {
        title: null,
        description: null,
        color: BLUE,
        url: null,
        image: null,
        thumbnail: null,
        author: null,
        footer: null,
        timestamp: false,
        fields: [],
        ...over,
    };
}

export const TEMPLATES: Record<TemplateScope, ITemplate[]> = {
    /* ---------------------------------------------------------- Begrüßung */
    welcomeJoin: [
        {
            id: "warm",
            name: "Herzlich",
            hint: "Karte mit Begrüßung, Mitgliedsnummer und einem Wort zum Start",
            body: {
                kind: "v2",
                content: "{user}",
                doc: card(
                    BLUE,
                    "## 👋 Willkommen, {user.name}!\nSchön, dass du auf **{guild}** gelandet bist.",
                    "---",
                    "Du bist Mitglied Nr. **{member.number}** – sag gern kurz Hallo.\n-# Konto erstellt {created}"
                ),
            },
        },
        {
            id: "rules",
            name: "Regeln zuerst",
            hint: "Embed, das auf Regeln und Rollen zeigt",
            body: {
                kind: "embed",
                content: "{user}",
                embed: embed({
                    title: "Willkommen auf {guild}",
                    description: "Schön, dass du da bist!\n\n**So kommst du rein:**\n• Lies kurz die Regeln\n• Hol dir deine Rollen\n• Sag Hallo im Chat",
                    color: BLUE,
                    footer: { text: "Mitglied Nr. {member.number}", icon: null },
                }),
            },
        },
        {
            id: "esports",
            name: "Esports",
            hint: "Kantige Karte in Rot – passt zum Rest des Bots",
            body: {
                kind: "v2",
                content: "{user}",
                doc: card(
                    RED,
                    "## NEUZUGANG\n**{user.name}** ist dem Roster beigetreten.",
                    "---",
                    "`#{member.number}` von aktuell **{guild.members}** Mitgliedern\n-# Willkommen bei {guild}"
                ),
            },
        },
        {
            id: "plain",
            name: "Eine Zeile",
            hint: "Nur Text, ohne Karte und ohne Embed",
            body: { kind: "text", content: "{user} ist da – willkommen auf **{guild}**! 👋" },
        },
    ],

    /* ---------------------------------------------------------- Abschied */
    welcomeLeave: [
        {
            id: "quiet",
            name: "Sachlich",
            hint: "Eine Zeile, ohne großes Aufheben",
            body: { kind: "text", content: "**{user.name}** hat den Server verlassen. Jetzt sind es {guild.members}." },
        },
        {
            id: "card",
            name: "Karte",
            hint: "Mit Name und wie lange derjenige dabei war",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    "#6b7683",
                    "## 👋 {user.name} ist weg\nWar schön mit dir.",
                    "---",
                    "-# Beigetreten {joined} · noch **{guild.members}** Mitglieder"
                ),
            },
        },
        {
            id: "embed",
            name: "Embed",
            hint: "Grau, mit Uhrzeit unten",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{user.name} hat {guild} verlassen",
                    description: "Beigetreten {joined}.",
                    color: "#6b7683",
                    timestamp: true,
                }),
            },
        },
    ],

    /* ---------------------------------------------------------- Aufstieg */
    levelUp: [
        {
            id: "default",
            name: "Standard",
            hint: "Kurz, mit Punkten und Platz",
            body: { doc: card(BLUE, "## 🎉 Level {level}!\n{user} ist aufgestiegen – weiter so.\n-# {xp} Punkte · Platz {rank}") },
        },
        {
            id: "hype",
            name: "Laut",
            hint: "Mit Trennlinie und dem Weg zum nächsten Level",
            body: {
                doc: card(
                    GREEN,
                    "# ⚡ LEVEL {level}\n{user} war fleißig.",
                    "---",
                    "**{xp}** Punkte insgesamt · Platz **{rank}**\n-# Noch {xp.next} Punkte bis Level {level}+1"
                ),
            },
        },
        {
            id: "dry",
            name: "Nüchtern",
            hint: "Eine Zeile, kein Bombast",
            body: { doc: card("#6b7683", "{user} → Level **{level}** (Platz {rank})") },
        },
        {
            id: "esports",
            name: "Esports",
            hint: "Rot, mit altem und neuem Level",
            body: {
                doc: card(
                    RED,
                    "## RANG UP\n**{user.name}** steigt von Level {level.old} auf **{level}**.",
                    "---",
                    "-# {xp} Punkte · Platz {rank} auf {guild}"
                ),
            },
        },
        {
            id: "plain",
            name: "Nur Text",
            hint: "Eine Zeile ohne Karte – gut für belebte Kanäle",
            body: { kind: "text", content: "🎉 {user} ist jetzt **Level {level}** · {xp} Punkte · Platz {rank}" },
        },
    ],

    /* ---------------------------------------------------------- Self Roles */
    selfRoles: [
        {
            id: "simple",
            name: "Schlicht",
            hint: "Überschrift und ein Satz darunter",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "## Hol dir deine Rollen\nKlick an, was auf dich passt – und wieder ab, wenn nicht mehr."),
            },
        },
        {
            id: "games",
            name: "Spiele",
            hint: "Für Spiel-Rollen, mit Hinweis auf Pings",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    RED,
                    "## 🎮 Was spielst du?",
                    "---",
                    "Wähl deine Spiele – so siehst du die passenden Kanäle und wirst nur dort gepingt, wo du mitspielst."
                ),
            },
        },
        {
            id: "pings",
            name: "Benachrichtigungen",
            hint: "Embed für Ankündigungs- und Event-Rollen",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "Benachrichtigungen",
                    description: "Such dir aus, worüber wir dich anpingen dürfen.\nAbwählen geht jederzeit.",
                    color: BLUE,
                }),
            },
        },
        {
            id: "plain",
            name: "Nur Text",
            hint: "Zwei Zeilen über den Knöpfen, ohne Karte",
            body: {
                kind: "text",
                content: "**Deine Rollen**\nKlick unten an, was auf dich passt – und wieder ab, wenn nicht mehr.",
            },
        },
    ],

    /* ---------------------------------------------------------- Custom Message */
    message: [
        {
            id: "announce",
            name: "Ankündigung",
            hint: "Karte mit Überschrift, Text und kleiner Fußzeile",
            body: {
                kind: "v2",
                content: "",
                doc: card(RED, "## 📣 Ankündigung\nHier steht, was ihr sagen wollt.", "---", "-# {guild} · Team"),
            },
        },
        {
            id: "rules",
            name: "Regeln",
            hint: "Nummerierte Liste als Embed",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "Regeln",
                    description: "**1.** Sei freundlich.\n**2.** Kein Spam.\n**3.** Keine Werbung ohne Absprache.\n**4.** Was das Team sagt, gilt.",
                    color: BLUE,
                    footer: { text: "Mit dem Bleiben stimmst du zu", icon: null },
                }),
            },
        },
        {
            id: "event",
            name: "Termin",
            hint: "Karte für ein Turnier oder einen Abend",
            body: {
                kind: "v2",
                content: "",
                doc: card(GREEN, "## 🗓️ Termin\n**Was:** …\n**Wann:** …\n**Wo:** …", "---", "-# Sagt Bescheid, wenn ihr dabei seid."),
            },
        },
        {
            id: "plain",
            name: "Nur Text",
            hint: "Ohne Karte, ohne Embed",
            body: { kind: "text", content: "Hier steht, was ihr sagen wollt." },
        },
    ],

    /* ---------------------------------------------------- Team-Übersicht */
    // Der Kopf des Hubs (Plan 27): immer eine Karte, die Teams setzt der Bot selbst darunter - deshalb ohne {teams} (W-0026).
    teamBoard: [
        {
            id: "starter",
            name: "Für den Anfang",
            hint: "Kurz und selbsterklärend, wie ab Werk",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "# 🛡️ Unsere Teams", "Hier steht, wer für uns spielt. Wähl unten ein Team, dann siehst du Kader, Ränge und MMR."),
            },
        },
        {
            id: "numbers",
            name: "Mit Zahlen",
            hint: "Server, Anzahl der Teams und Kategorien, Grundlage der MMR",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "# 🛡️ {guild}",
                    "{teams.count} Teams in {groups.count} Kategorien · Team-MMR nach {mmr.mode}",
                    "---",
                    "-# Die Ränge holt der Bot aus Rocket League · Stand {updated}"
                ),
            },
        },
        {
            id: "pick",
            name: "Zum Aussuchen",
            hint: "Rot, mit kurzem Hinweis aufs Menü",
            body: {
                kind: "v2",
                content: "",
                doc: card(RED, "# 🛡️ {guild}", "Wähl unten ein Team – den Kader siehst nur du.", "-# Die Ränge kommen aus Rocket League · Stand {updated}"),
            },
        },
    ],

    teamCard: [
        {
            id: "lineup",
            name: "Aufstellung",
            hint: "Kopf, Aufstellung mit Tracker-Link, darunter Coach, Manager und die Ligen",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    RED,
                    "## 🛡️ {team.name} `{team.tag}`\n{team.description}",
                    "---",
                    "**Ø Team-MMR** {team.mmr}  ·  **Kader** {team.players}  ·  {team.group}",
                    "{team.lineup}",
                    "---",
                    "{team.staff}",
                    "{team.leagues}",
                    "-# Ränge aus Rocket League · Stand {updated}"
                ),
            },
        },
        {
            id: "card",
            name: "Nach Aufgaben",
            hint: "Captain, Stamm, Ersatz, Trial und Staff jeweils mit Überschrift",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    RED,
                    "## {team.name} `{team.tag}`\n{team.description}",
                    "---",
                    "{team.roster}",
                    "{team.leagues}",
                    "-# Team-MMR {team.mmr} · {team.group} · Stand {updated}"
                ),
            },
        },
        {
            id: "short",
            name: "Knapp",
            hint: "Eine Karte ohne Kader – nur die Eckdaten",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "## {team.name} `{team.tag}`",
                    "**Team-MMR** {team.mmr} · **Captain** {team.captain} · {team.players} Spieler",
                    "-# {team.group} · Coach {team.coach} · {team.channel}"
                ),
            },
        },
        {
            id: "card-embed",
            name: "Als Embed",
            hint: "Mit dem Logo als Vorschaubild",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{team.name} {team.tag}",
                    description: "{team.description}\n\n{team.lineup}\n\n{team.staff}\n\n{team.leagues}",
                    color: RED,
                    thumbnail: "{team.logo}",
                    footer: { text: "Team-MMR {team.mmr} · {team.group}", icon: null },
                }),
            },
        },
        {
            id: "card-plain",
            name: "Nur Text",
            hint: "Ohne Karte – Tracker-Links stehen dann als volle Adresse da",
            body: {
                kind: "text",
                content: "**{team.name}** `{team.tag}` · Ø {team.mmr}\n\n{team.lineup}\n\n{team.staff}\n\n{team.leagues}",
            },
        },
    ],

    /* ---------------------------------------------------------- Looking for */
    lftPost: [
        {
            id: "lft-post-card",
            name: "Karte",
            hint: "Kopf mit Name, darunter alle Antworten – die Vorgabe",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "## 🔎 {user.name} sucht",
                    "-# {user} · {erstellt}",
                    "---",
                    "{antworten}",
                    "---",
                    "-# Interesse? Schreib hier in den Beitrag oder {user} direkt an."
                ),
            },
        },
        {
            id: "lft-post-steckbrief",
            name: "Steckbrief",
            hint: "Erst die Eckdaten aus den ersten Antworten, dann der Rest",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    RED,
                    "## {user.name}",
                    "**{frage1}** {antwort1}\n**{frage2}** {antwort2}",
                    "---",
                    "{antworten}",
                    "-# {art} · {erstellt} · Fragen gern direkt im Beitrag"
                ),
            },
        },
        {
            id: "lft-post-embed",
            name: "Als Embed",
            hint: "Mit Avatar als Vorschaubild",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{art}: {user.name}",
                    description: "{antworten}",
                    color: BLUE,
                    thumbnail: "{user.avatar}",
                    footer: { text: "Erstellt über /lookingfor", icon: null },
                    timestamp: true,
                }),
            },
        },
        {
            id: "lft-post-plain",
            name: "Nur Text",
            hint: "Ohne Karte und Embed – schlicht und kurz",
            body: {
                kind: "text",
                content: "**{art} · {user.name}**\n{user} · {erstellt}\n\n{antworten}",
            },
        },
    ],

    lftPreview: [
        {
            id: "lft-preview-card",
            name: "Mit Titel",
            hint: "Zeigt den Titel des Beitrags und alle Antworten",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "## 📋 Passt das so?",
                    "So kommt dein Beitrag ins Forum – Titel: **{post.titel}**",
                    "---",
                    "{antworten}",
                    "---",
                    "-# „Abschicken“ stellt ihn in {forum}. „Abbrechen“ wirft alles weg."
                ),
            },
        },
        {
            id: "lft-preview-short",
            name: "Knapp",
            hint: "Nur die Zeilen – für viele Fragen",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "### Letzter Blick", "{antworten.kurz}", "-# Geht nach {forum} als **{post.titel}**"),
            },
        },
        {
            id: "lft-preview-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "**Passt das so?**\n{post.titel}\n\n{antworten}\n\nAbschicken geht nach {forum}.",
            },
        },
    ],

    lftIntro: [
        {
            id: "lft-intro-card",
            name: "Freundlich",
            hint: "Sagt, wie viele Fragen kommen und wie man aussteigt",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "## 🔎 {art}",
                    "Ich stelle dir jetzt **{fragen.anzahl} Fragen**. Antworte einfach hier im Chat – eine Nachricht je Frage.",
                    "---",
                    "-# Schreib **abbrechen**, wenn du aussteigen willst. Freiwillige Fragen überspringst du mit **-**."
                ),
            },
        },
        {
            id: "lft-intro-short",
            name: "Kurz",
            hint: "Zwei Zeilen, dann los",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "**{fragen.anzahl} Fragen für deine {art}** – dein Beitrag landet danach in {forum}.", "-# **abbrechen** beendet das hier."),
            },
        },
        {
            id: "lft-intro-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "Hi {user.name}! Für deine {art} auf **{guild}** habe ich {fragen.anzahl} Fragen. Antworte einfach hier – **abbrechen** beendet es.",
            },
        },
    ],

    lftQuestion: [
        {
            id: "lft-question-card",
            name: "Mit Zähler",
            hint: "Frage 2 von 6, darunter die Frage und ihr Hinweis",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "### Frage {frage.nummer} von {fragen.anzahl}\n{frage}{frage.hinweis}"),
            },
        },
        {
            id: "lft-question-strict",
            name: "Mit Pflicht-Hinweis",
            hint: "Sagt zusätzlich, ob die Frage Pflicht ist",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "### {frage}", "{frage.hinweis}", "-# Frage {frage.nummer} von {fragen.anzahl} · {frage.pflicht}"),
            },
        },
        {
            id: "lft-question-plain",
            name: "Nur Text",
            hint: "Eine Zeile je Frage",
            body: {
                kind: "text",
                content: "**{frage.nummer}/{fragen.anzahl}** · {frage}{frage.hinweis}",
            },
        },
    ],

    lftDone: [
        {
            id: "lft-done-card",
            name: "Mit Link",
            hint: "Bestätigung mit Link zum Beitrag",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    GREEN,
                    "## ✅ Dein Beitrag steht",
                    "[{post.titel}]({post.url}) – ab jetzt sichtbar in {forum}.",
                    "---",
                    "-# Fertig mit der Suche? Der Knopf unter deinem Beitrag beendet sie, oder du nimmst `/lookingfor beenden`."
                ),
            },
        },
        {
            id: "lft-done-recap",
            name: "Mit Rückblick",
            hint: "Zeigt noch einmal, was im Beitrag steht",
            body: {
                kind: "v2",
                content: "",
                doc: card(GREEN, "## ✅ Fertig", "[{post.titel}]({post.url})", "---", "{antworten}"),
            },
        },
        {
            id: "lft-done-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "✅ Dein Beitrag steht: {post.url}\n-# Beenden geht mit `/lookingfor beenden`.",
            },
        },
    ],

    lftNotice: [
        {
            id: "lft-notice-card",
            name: "Karte",
            hint: "Wer sucht, Link zum Beitrag, Antworten in Kurzform",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "## 🔎 Neue {art}", "{user} hat gerade eine Anfrage erstellt: [{post.titel}]({post.url})", "---", "{antworten.kurz}"),
            },
        },
        {
            id: "lft-notice-full",
            name: "Mit allen Antworten",
            hint: "Für Teams, die direkt im Kanal lesen wollen",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "## 🔎 {art} von {user.name}", "-# {erstellt} · [Zum Beitrag]({post.url})", "---", "{antworten}"),
            },
        },
        {
            id: "lft-notice-embed",
            name: "Als Embed",
            hint: "Mit Avatar und Link im Titel",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "Neue {art}: {user.name}",
                    description: "{antworten.kurz}",
                    url: "{post.url}",
                    color: BLUE,
                    thumbnail: "{user.avatar}",
                    timestamp: true,
                }),
            },
        },
        {
            id: "lft-notice-plain",
            name: "Nur Text",
            hint: "Eine Zeile plus Link",
            body: {
                kind: "text",
                content: "🔎 **Neue {art}** von {user}: {post.url}",
            },
        },
    ],
    /* ---------------------------------------------------------- Matchups */
    matchupAnnounce: [
        {
            id: "mu-card",
            name: "Karte",
            hint: "Kopf mit beiden Teams, darunter Anpfiff und Countdown",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    RED,
                    "## ⚔️ {team} vs. {gegner}",
                    "-# {liga} · {modus}{bestof}",
                    "---",
                    "**Anpfiff** {zeit}\nDas ist **{countdown}**",
                    "{stream}",
                    "-# Eingetragen von {eingetragen}"
                ),
            },
        },
        {
            id: "mu-short",
            name: "Knapp",
            hint: "Zwei Zeilen – gut für Kanäle mit vielen Partien",
            body: {
                kind: "v2",
                content: "",
                doc: card(RED, "**⚔️ {team} vs. {gegner}** · {countdown}", "-# {liga} · {modus}{bestof} · {zeit.kurz} {stream}"),
            },
        },
        {
            id: "mu-embed",
            name: "Als Embed",
            hint: "Mit Server-Icon als Vorschaubild",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{team} vs. {gegner}",
                    description: "**Anpfiff** {zeit}\n{countdown}\n\n{stream}",
                    color: RED,
                    thumbnail: "{guild.icon}",
                    footer: { text: "{liga} · {modus}{bestof}", icon: null },
                }),
            },
        },
        {
            id: "mu-plain",
            name: "Nur Text",
            hint: "Ohne Karte und Embed",
            body: {
                kind: "text",
                content: "⚔️ **{team} vs. {gegner}** – {zeit} ({countdown})\n-# {liga} · {modus}{bestof}\n{stream}",
            },
        },
    ],

    matchupRemind: [
        {
            id: "mu-remind-card",
            name: "Gleich geht es los",
            hint: "Kurz, mit Countdown und Stream",
            body: {
                kind: "v2",
                content: "",
                doc: card("#ffc53d", "## ⏰ Gleich geht es los", "**{team} vs. {gegner}** – {countdown}", "-# {liga} · {modus}{bestof} · Anpfiff {zeit.kurz}", "{stream}"),
            },
        },
        {
            id: "mu-remind-role",
            name: "Mit Team-Rolle",
            hint: "Spricht die Rolle des Teams direkt an",
            body: {
                kind: "v2",
                content: "{team.role}",
                doc: card("#ffc53d", "## ⏰ {team}, aufstellen!", "Gegen **{gegner}** {countdown} – {liga}", "{stream}"),
            },
        },
        {
            id: "mu-remind-plain",
            name: "Nur Text",
            hint: "Eine Zeile",
            body: {
                kind: "text",
                content: "⏰ **{team} vs. {gegner}** {countdown} – {liga}{bestof} {stream}",
            },
        },
    ],

    matchupResult: [
        {
            id: "mu-result-card",
            name: "Karte",
            hint: "Ausgang, Ergebnis und die Eckdaten",
            body: {
                kind: "v2",
                content: "",
                doc: card(GREEN, "## {ausgang} {team} {ergebnis} {gegner}", "-# {liga} · {modus}{bestof} · {zeit.kurz}", "---", "{notiz}"),
            },
        },
        {
            id: "mu-result-short",
            name: "Knapp",
            hint: "Eine Zeile für den Ergebnis-Kanal",
            body: {
                kind: "v2",
                content: "",
                doc: card(GREEN, "{ausgang} **{team} {ergebnis} {gegner}** · {liga}"),
            },
        },
        {
            id: "mu-result-embed",
            name: "Als Embed",
            hint: "Mit Server-Icon und Zeitstempel",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{ausgang} {team} {ergebnis} {gegner}",
                    description: "{notiz}",
                    color: GREEN,
                    thumbnail: "{guild.icon}",
                    footer: { text: "{liga} · {modus}{bestof}", icon: null },
                    timestamp: true,
                }),
            },
        },
        {
            id: "mu-result-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "{ausgang} **{team} {ergebnis} {gegner}** – {liga} · {zeit.kurz}",
            },
        },
    ],
    /* ---------------------------------------------------- 2, 4 & 6 Mans */
    sixPanel: [
        {
            id: "six-panel",
            name: "Alle Modi",
            hint: "Zeigt jede Warteschlange untereinander",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "# 🎮 2, 4 & 6 Mans",
                    "Stell dich an, und sobald genug da sind, teilt der Bot die Teams nach eurer MMR auf.",
                    "---",
                    "{warteschlange}",
                    "-# {spieler} Spieler gewertet · {runden} Runden gespielt · 👑 {bester}"
                ),
            },
        },
        {
            id: "six-panel-short",
            name: "Knapp",
            hint: "Nur die Zahlen je Modus",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "## 🎮 Mans", "**2 Mans** {anzahl.2}/2 · **4 Mans** {anzahl.4}/4 · **6 Mans** {anzahl.6}/6", "-# {modi} · noch {frei.6} bis zur nächsten 6er-Runde"),
            },
        },
        {
            id: "six-panel-six",
            name: "Nur 6 Mans",
            hint: "Für Server, die vor allem 3v3 spielen",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "# 🎮 6 Mans", "**In der Warteschlange ({anzahl.6}/6)**\n{warteschlange.6}", "-# Noch {frei.6} · 👑 {bester}"),
            },
        },
        {
            id: "six-panel-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "**🎮 Mans** · {modi}\n{warteschlange}",
            },
        },
    ],

    sixRound: [
        {
            id: "six-round",
            name: "Mit Lobby",
            hint: "Beide Teams mit Stufe, Lobby und Passwort, dazu die Sprachkanäle",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    GREEN,
                    "## 🎮 {modus} · Runde #{runde}",
                    "**Lobby** `{lobby}`  ·  **Passwort** `{passwort}`  ·  {modus.spiel}",
                    "---",
                    "🔵 **Blau** · Ø {blau.mmr} · {blau.rang}\n{blau}",
                    "🟠 **Orange** · Ø {orange.mmr} · {orange.rang}\n{orange}",
                    "---",
                    "{kanal.blau} {kanal.orange}",
                    "-# Wer gewonnen hat, sagt es unten."
                ),
            },
        },
        {
            id: "six-round-short",
            name: "Knapp",
            hint: "Teams und Lobby in vier Zeilen",
            body: {
                kind: "v2",
                content: "",
                doc: card(GREEN, "### {modus} #{runde} · `{lobby}` / `{passwort}`", "🔵 {blau}", "🟠 {orange}"),
            },
        },
        {
            id: "six-round-embed",
            name: "Als Embed",
            hint: "Mit Server-Icon",
            body: {
                kind: "embed",
                content: "",
                embed: embed({
                    title: "{modus} · Runde #{runde}",
                    description: "**Lobby** {lobby} · **Passwort** {passwort}\n\n🔵 {blau}\n\n🟠 {orange}",
                    color: GREEN,
                    thumbnail: "{guild.icon}",
                    footer: { text: "Ø {mmr.schnitt} · {spieler} Spieler · {modus.spiel}", icon: null },
                }),
            },
        },
    ],

    sixResult: [
        {
            id: "six-result",
            name: "Karte",
            hint: "Sieger oben, beide Aufstellungen darunter",
            body: {
                kind: "v2",
                content: "",
                doc: card(
                    BLUE,
                    "## 🏁 {modus} · Runde #{runde} · {sieger.team} gewinnt",
                    "---",
                    "🔵 **Blau**\n{blau}",
                    "🟠 **Orange**\n{orange}",
                    "---",
                    "-# {veraenderung} MMR · Ø {mmr.schnitt} im Spiel"
                ),
            },
        },
        {
            id: "six-result-short",
            name: "Eine Zeile",
            hint: "Für Kanäle, in denen viel läuft",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "🏁 **{modus} #{runde}** · {sieger.team} gewinnt · {veraenderung} MMR"),
            },
        },
        {
            id: "six-result-plain",
            name: "Nur Text",
            hint: "Ohne Karte",
            body: {
                kind: "text",
                content: "🏁 {modus} Runde #{runde}: {sieger.team} gewinnt ({veraenderung} MMR)\n{sieger}",
            },
        },
    ],

    sixDm: [
        {
            id: "six-dm",
            name: "Mit Lobby",
            hint: "Alles, was man zum Starten braucht",
            body: {
                kind: "v2",
                content: "",
                doc: card(BLUE, "## 🎮 Deine Runde steht", "**{modus}** auf **{guild}** – Runde **#{runde}**, **Lobby** `{lobby}`, **Passwort** `{passwort}`.", "---", "🔵 {blau}\n🟠 {orange}"),
            },
        },
        {
            id: "six-dm-short",
            name: "Knapp",
            hint: "Zwei Zeilen",
            body: {
                kind: "text",
                content: "🎮 {modus} Runde #{runde} auf **{guild}** – Lobby `{lobby}`, Passwort `{passwort}`.",
            },
        },
    ],
};
