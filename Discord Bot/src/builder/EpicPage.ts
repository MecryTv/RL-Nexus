import { DASHBOARD_PATH } from "../constants/Dashboard";
import { RANK_ICONS } from "../constants/RankCard";
import { EscapeHtml } from "../services/DashboardService";
import { DiscordBack } from "../utils/epicLogin";

/**
 * W-0125: die Platzhalter für dashboard/public/epic.html. Eine Vorlage für alle
 * Stände des Epic-Logins: bestätigen, verbunden, abgelehnt. Alles, was von außen
 * kommt (Namen, Adressen), wird hier maskiert - die Vorlage setzt es roh ein.
 *
 * Design W-0130 (Richtung B): links das Discord-Konto, rechts das Epic-Konto,
 * dazwischen die Leitung. Die Vorlage setzt nichts doppelt ein, deshalb bauen die
 * Bild-Adressen hier mit DASHBOARD_PATH statt mit dem Platzhalter der Vorlage.
 */
const ZONE = "Europe/Berlin";
const IMAGES = `${DASHBOARD_PATH}/assets/images/rocketleague`;

const ICONS = {
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
    /** Unterbrochene Leitung: Absage, nichts verbunden. */
    broken: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M3 3l18 18"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`,
    swap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke-linecap="round"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
};

/**
 * „Zur App“ öffnet Discord per discord:// im Kanal von /rank link.
 * discord.com/app führte in den Browser, und dort ist meist niemand angemeldet.
 * Daneben derselbe Kanal im Browser, für alle ohne App.
 */
function backButtons(place: string | null): string {
    const back = DiscordBack(place);

    return (
        `<a class="b main" href="${EscapeHtml(back.app)}" aria-label="Zurück zu Discord, in der App">${ICONS.discord}Zur App</a>` +
        `<a class="b" href="${EscapeHtml(back.web)}" aria-label="Zurück zu Discord, im Browser">Im Browser</a>`
    );
}

export interface IEpicWho {
    name: string;
    /** Der eindeutige @Name. Den Anzeigenamen kann jeder auf den eines anderen setzen, den @Namen nicht. */
    handle?: string | null;
    avatar: string | null;
}

/** Ein Rang für die Fertig-Seite: Modus („2v2“, „Hoops“), Stufe von Prime und ihr Name. */
export interface IEpicRank {
    mode: string;
    tier: number;
    name: string;
}

/** „Joe (@mecrytv)“ - der @Name macht ein fremdes Konto mit gleichem Anzeigenamen erkennbar. */
function label(person: IEpicWho): string {
    return person.handle && person.handle !== person.name ? `${person.name} (@${person.handle})` : person.handle ? `@${person.handle}` : person.name;
}

type Values = Record<"PAGE" | "STEP" | "TONE" | "DISCORD" | "ICON" | "EPIC" | "TITLE" | "TEXT" | "RANKS" | "ALERT" | "WHY" | "BUTTONS" | "MORE" | "FOOT", string>;

const time = (at: number): string => `${new Date(at).toLocaleTimeString("de-DE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" })} Uhr`;
const date = (at: number): string => new Date(at).toLocaleDateString("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

/** Linke Karte. Ohne Person (Rückweg ohne Cookie) eine leere. */
function discordCard(person: IEpicWho | null): string {
    if (!person) return `<div class="pic q" aria-hidden="true">?</div><b>Dein Discord-Konto</b><small>unbekannt</small>`;

    const mark = person.avatar ? `<img src="${EscapeHtml(person.avatar)}" alt="">` : EscapeHtml((person.name.trim()[0] ?? "?").toUpperCase());
    const handle = person.handle ? `<small>@${EscapeHtml(person.handle)}</small>` : "";

    return `<div class="pic d" aria-hidden="true">${mark}</div><b>${EscapeHtml(person.name)}</b>${handle}`;
}

/** Rechte Karte, solange kein Epic-Konto dran ist. */
function epicOpen(name: string, sub: string): string {
    return `<div class="pic q" aria-hidden="true">?</div><b>${EscapeHtml(name)}</b><small>${EscapeHtml(sub)}</small>`;
}

function chip(rank: IEpicRank): string {
    const file = RANK_ICONS[rank.tier] ?? RANK_ICONS[0];

    return `<span class="chip"><img src="${IMAGES}/rlranks/small/${encodeURIComponent(file)}.webp" alt=""><span>${EscapeHtml(rank.mode)}</span>${EscapeHtml(rank.name)}</span>`;
}

/** Befehle wie /rank link im Klartext fett, nach dem Maskieren. */
const commands = (escaped: string): string => escaped.replace(/\/rank (link|unlink|me|search)\b/g, "<b>$&</b>");

/** Vor dem Weg zu Epic: welches Discord-Konto das Epic-Konto bekommt. */
export function EpicConfirmPage(person: IEpicWho, goURL: string, validUntil: number, siteURL: string): Values {
    return {
        PAGE: "Epic-Konto verbinden",
        STEP: "Schritt 2 von 3",
        TONE: "brand",
        DISCORD: discordCard(person),
        ICON: ICONS.link,
        EPIC: epicOpen("Dein Epic-Konto", "nach der Anmeldung"),
        TITLE: "Ist links dein Konto?",
        TEXT: `Dein Epic-Konto gehört danach zum Discord-Konto <b>${EscapeHtml(label(person))}</b>. Hat dir jemand diesen Link geschickt, schließ die Seite.`,
        RANKS: "",
        ALERT: "",
        WHY: "",
        BUTTONS: `<a class="b main" href="${EscapeHtml(goURL)}">Weiter zu Epic Games${ICONS.arrow}</a>`,
        MORE: `<a href="${EscapeHtml(siteURL)}">${ICONS.cross}Nicht mein Konto, abbrechen</a>`,
        FOOT: `${ICONS.shield}<span>Link gültig bis ${time(validUntil)}. RL Nexus sieht dein Epic-Passwort nie, nur Konto-ID und Namen.</span>`,
    };
}

/**
 * Verbunden. Mit swapURL und fixUntil (W-0125): noch im Korrektur-Fenster, ein
 * Link führt zur neuen Anmeldung bei Epic, falls das falsche Konto dran war.
 */
export function EpicDonePage(
    person: IEpicWho | null,
    epicName: string,
    ranks: IEpicRank[],
    nextChange: number,
    swapURL: string | null = null,
    fixUntil: number | null = null,
    place: string | null = null
): Values {
    const fix = swapURL && fixUntil;

    return {
        PAGE: "Epic-Konto verbunden",
        STEP: "Fertig",
        TONE: "win",
        DISCORD: discordCard(person),
        ICON: ICONS.check,
        EPIC: `<div class="pic e" aria-hidden="true"><img src="${IMAGES}/plattforms/epicgames.png" alt=""></div><b>${EscapeHtml(epicName)}</b><small>Epic-Konto</small>`,
        TITLE: "Verbunden",
        TEXT: `<b>${EscapeHtml(epicName)}</b> gehört jetzt zu deinem Discord-Konto. Niemand sonst kann es verbinden.`,
        RANKS: ranks.length > 0 ? ranks.map(chip).join("") : `<span class="chip none">Noch keine Ränge</span>`,
        ALERT: "",
        WHY: "Letzter Schritt: In Discord zeigt <b>/rank me</b> deine Karte und gibt dir dabei die Rang-Rollen des Servers.",
        BUTTONS: backButtons(place),
        MORE: fix ? `<a href="${EscapeHtml(swapURL)}">${ICONS.swap}Falsches Konto? Anderes Epic-Konto verbinden</a>` : "",
        FOOT: fix
            ? `${ICONS.shield}<span>Korrigieren bis ${time(fixUntil)} ohne Wartezeit, danach erst wieder ab dem ${date(nextChange)}.</span>`
            : `${ICONS.shield}<span>Ein anderes Epic-Konto kannst du ab dem ${date(nextChange)} verbinden.</span>`,
    };
}

/** Alles, was nicht geklappt hat. title, text und why sind Klartext. */
export function EpicFailPage(title: string, text: string, why: string, person: IEpicWho | null = null, place: string | null = null): Values {
    return {
        PAGE: EscapeHtml(title),
        STEP: "Nicht verbunden",
        TONE: "warn",
        DISCORD: discordCard(person),
        ICON: ICONS.broken,
        EPIC: epicOpen("Epic-Konto", "nicht verbunden"),
        TITLE: EscapeHtml(title),
        TEXT: commands(EscapeHtml(text)),
        RANKS: "",
        ALERT: ` role="alert"`,
        WHY: `<b>So geht's weiter:</b> ${commands(EscapeHtml(why))}`,
        BUTTONS: backButtons(place),
        MORE: "",
        FOOT: "",
    };
}
