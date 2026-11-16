import { EscapeHtml } from "../services/DashboardService";
import { DiscordBack } from "../utils/epicLogin";

/**
 * W-0125: die Platzhalter für dashboard/public/epic.html. Eine Vorlage für alle
 * Stände des Epic-Logins: bestätigen, verbunden, abgelehnt. Alles, was von außen
 * kommt (Namen, Adressen), wird hier maskiert - die Vorlage setzt es roh ein.
 */
const ZONE = "Europe/Berlin";

/**
 * „Zurück zu Discord“ öffnet die App (discord://) im Kanal von /rank link.
 * discord.com/app führte in den Browser, und dort ist meist niemand angemeldet.
 * Daneben derselbe Kanal im Browser, für alle ohne App.
 */
function backButtons(place: string | null, main: boolean): string {
    const back = DiscordBack(place);

    return `<a class="b${main ? " main" : ""}" href="${EscapeHtml(back.app)}">Zurück zu Discord</a><a class="b" href="${EscapeHtml(back.web)}">Discord im Browser</a>`;
}

const ICONS = {
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
    warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>`,
};

export interface IEpicWho {
    name: string;
    avatar: string | null;
}

type Values = Record<"TITLE" | "TEXT" | "TONE" | "ICON" | "FACTS" | "WHY" | "BUTTONS" | "WHO", string>;

const time = (at: number): string => `${new Date(at).toLocaleTimeString("de-DE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" })} Uhr`;
const date = (at: number): string => new Date(at).toLocaleDateString("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

function fact(label: string, value: string): string {
    return `<div class="fact"><span>${EscapeHtml(label)}</span><b>${EscapeHtml(value)}</b></div>`;
}

function who(person: IEpicWho | null, suffix: string): string {
    if (!person) return "";

    const mark = person.avatar ? `<img src="${EscapeHtml(person.avatar)}" alt="">` : EscapeHtml((person.name.trim()[0] ?? "?").toUpperCase());

    return `<span>${mark}</span>${EscapeHtml(person.name)} · ${EscapeHtml(suffix)}`;
}

/** Vor dem Weg zu Epic: welches Discord-Konto das Epic-Konto bekommt. */
export function EpicConfirmPage(person: IEpicWho, goURL: string, validUntil: number, siteURL: string): Values {
    return {
        TITLE: "Epic-Konto verbinden",
        TEXT: `Du meldest dich gleich bei Epic Games an. Danach gehört dein Epic-Konto zum Discord-Konto <b>${EscapeHtml(person.name)}</b>.`,
        TONE: "brand",
        ICON: ICONS.link,
        FACTS: fact("Discord-Konto", person.name) + fact("Link gültig bis", time(validUntil)) + fact("Anmeldung bei", "Epic Games"),
        WHY:
            "Mach nur weiter, wenn das oben dein eigenes Discord-Konto ist. Hat dir jemand diesen Link geschickt, schließ die Seite: " +
            "sonst hängt dein Epic-Konto an seinem Discord-Konto. RL Nexus sieht dein Epic-Passwort nie, nur Konto-ID und Namen.",
        BUTTONS: `<a class="b main" href="${EscapeHtml(goURL)}">Weiter zu Epic Games</a><a class="b" href="${EscapeHtml(siteURL)}">Abbrechen</a>`,
        WHO: who(person, "aus Discord"),
    };
}

/**
 * Verbunden. Mit swapURL und fixUntil (W-0125): noch im Korrektur-Fenster, ein
 * Knopf führt zur neuen Anmeldung bei Epic, falls das falsche Konto dran war.
 */
export function EpicDonePage(
    person: IEpicWho | null,
    epicName: string,
    ranks: string[],
    nextChange: number,
    swapURL: string | null = null,
    fixUntil: number | null = null,
    place: string | null = null
): Values {
    const fix = swapURL && fixUntil;

    return {
        TITLE: "Epic-Konto verbunden",
        TEXT: `<b>${EscapeHtml(epicName)}</b> gehört jetzt zu deinem Discord-Konto. Niemand sonst kann es verbinden.`,
        TONE: "win",
        ICON: ICONS.check,
        FACTS:
            fact("Epic-Konto", epicName) +
            fact("Ränge", ranks.length > 0 ? ranks.join(" · ") : "noch keine") +
            (fix ? fact("Korrigieren bis", time(fixUntil)) : fact("Wechseln ab", date(nextChange))),
        WHY:
            (fix ? `Nicht dein Konto? Bis <b>${time(fixUntil)}</b> kannst du ohne Wartezeit ein anderes Epic-Konto verbinden, danach erst ab dem ${date(nextChange)}. ` : "") +
            "Zurück in Discord zeigt <b>/rank me</b> deine Karte und gibt dir dabei die Rang-Rollen des Servers.",
        BUTTONS: backButtons(place, true) + (fix ? `<a class="b" href="${EscapeHtml(swapURL)}">Anderes Epic-Konto verbinden</a>` : ""),
        WHO: who(person, "verbunden"),
    };
}

/** Alles, was nicht geklappt hat. text ist Klartext. */
export function EpicFailPage(title: string, text: string, why: string, person: IEpicWho | null = null, place: string | null = null): Values {
    return {
        TITLE: EscapeHtml(title),
        TEXT: EscapeHtml(text),
        TONE: "warn",
        ICON: ICONS.warn,
        FACTS: "",
        WHY: EscapeHtml(why),
        BUTTONS: backButtons(place, false),
        WHO: who(person, "aus Discord"),
    };
}
