import type { Role } from "../../shared/api.ts";
import type { INavEntry } from "./search.ts";

/**
 * Bereiche und Seiten der Leiste (W-0053). Leiste, Suche und Seitenkopf lesen
 * alles von hier. Ohne React, damit npm run check es prüfen kann.
 */

export interface INavPage {
    readonly to: string;
    readonly label: string;
    readonly icon: string;
    /** Ein Satz, was die Seite zeigt. Steht im Seitenkopf und in der Suche. */
    readonly description: string;
    /** Nur für die Developer-Rolle. Der Server prüft das ohnehin selbst. */
    readonly developer?: boolean;
    /** Zeigt die Zahl ungelesener Post an diesem Eintrag. */
    readonly unread?: boolean;
    /** Weitere Adressen, die zu dieser Seite gehören. */
    readonly also?: readonly string[];
}

export interface INavArea {
    readonly id: "start" | "bot" | "shop" | "webseite" | "dev";
    readonly label: string;
    /** Unter dem Symbol in der Leiste, 74 px breit. */
    readonly short: string;
    readonly icon: string;
    readonly pages: readonly INavPage[];
}

export const AREAS: readonly INavArea[] = [
    {
        id: "start",
        label: "Start",
        short: "Start",
        icon: "home",
        pages: [
            { to: "/", label: "Übersicht", icon: "dashboard", description: "Dienste, Postfächer, neueste Mails und letzte Aktionen auf einen Blick." },
            { to: "/post", label: "Postfach", icon: "mail", unread: true, also: ["/kontakt"], description: "Mails und Formulare an die Postfächer von RL Nexus." },
        ],
    },
    {
        id: "bot",
        label: "Bot",
        short: "Bot",
        icon: "bot",
        pages: [
            { to: "/server", label: "Server", icon: "server", description: "Alle Server, auf denen der Bot ist." },
            { to: "/backups", label: "Backups", icon: "archive", description: "Sicherungen je Server, ansehen und zurückladen." },
            { to: "/gruppen", label: "Gruppen", icon: "shield-check", description: "Wer im Bot-Dashboard welche Gruppe hat." },
            { to: "/beta", label: "Beta Access", icon: "sparkle", description: "Tester und Codes für den Zugang zur Beta." },
            { to: "/meldungen", label: "Meldungen", icon: "bell", description: "Nachrichten an das Postfach im Bot-Dashboard." },
            { to: "/status", label: "Status", icon: "pulse", description: "Zustand der Dienste, Störungen und Statusseite." },
        ],
    },
    {
        id: "shop",
        label: "Shop",
        short: "Shop",
        icon: "cart",
        pages: [
            { to: "/shop/produkte", label: "Produkte", icon: "tag", description: "Was im Shop steht, mit Preis und Reihenfolge." },
            { to: "/shop/kunden", label: "Kunden", icon: "users", description: "Käufe, Tests und Sperren je Kunde." },
            { to: "/shop/einstellungen", label: "Einstellungen", icon: "sliders", description: "Was für alle Produkte im Shop gilt." },
        ],
    },
    {
        id: "webseite",
        label: "Webseite",
        short: "Web",
        icon: "globe",
        pages: [
            { to: "/webseite/banner", label: "Banner", icon: "megaphone", description: "Die Leiste unten auf der Webseite." },
            { to: "/webseite/team", label: "Team", icon: "users", description: "Personen und offene Stellen auf der Team-Seite." },
            { to: "/webseite/module", label: "Module", icon: "puzzle", also: ["/webseite/neues-modul"], description: "Kacheln und Detailseiten der Module auf der Webseite." },
        ],
    },
    {
        id: "dev",
        label: "Developer",
        short: "Dev",
        icon: "code",
        pages: [
            { to: "/dev/logs", label: "Logs", icon: "file-text", developer: true, description: "Sessions und Logdateien des Bots." },
            { to: "/dev/datenbank", label: "Datenbank", icon: "database", developer: true, description: "Tabellen der Datenbank ansehen, ändern geht hier nicht." },
            { to: "/dev/technik", label: "Technik", icon: "cpu", developer: true, description: "Bot und Datenbank: Ping, Speicher, Versionen, Migrationen." },
            { to: "/dev/wartung", label: "Wartung", icon: "wrench", developer: true, description: "Wartung planen, ankündigen und beenden." },
            { to: "/dev/protokoll", label: "Protokoll", icon: "history", developer: true, description: "Wer im Admin Dashboard was geändert hat." },
        ],
    },
];

/** `/` nur genau, sonst die Adresse selbst oder alles darunter. */
function matches(path: string, pathname: string): boolean {
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

export function pageOf(pathname: string): { readonly area: INavArea; readonly page: INavPage } | null {
    for (const area of AREAS) {
        for (const page of area.pages) {
            if ([page.to, ...(page.also ?? [])].some((path) => matches(path, pathname))) return { area, page };
        }
    }

    return null;
}

export function areaOf(pathname: string): INavArea | null {
    return pageOf(pathname)?.area ?? null;
}

/** Die Bereiche, wie die Person sie sieht: ohne Seiten, die sie nicht darf, ohne leere Bereiche. */
export function visibleAreas(role: Role): INavArea[] {
    return AREAS.map((area) => ({ ...area, pages: area.pages.filter((page) => !page.developer || role === "developer") })).filter((area) => area.pages.length > 0);
}

export function navEntries(role: Role): INavEntry[] {
    return visibleAreas(role).flatMap((area) => area.pages.map((page) => ({ href: page.to, name: page.label, icon: page.icon, area: area.label, text: page.description })));
}
