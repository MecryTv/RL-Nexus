/**
 * W-0136: Die Logik hinter dem Reiter „Grenzen“ auf der Seite Module.
 *
 * Alles hier ist rein (kein DOM): Status, Zahlen für Filter und Reiter, welche
 * Karten erscheinen, der Anfragetext und die Adresse. check:dashboard prüft es
 * direkt; GuildLimits.ts zeichnet daraus die Seite.
 */

import { IModuleLimit } from "../interfaces/IGuild.js";
import { MODULES } from "./Modules.js";

export type LimitStatus = "ask" | "granted" | "fixed";
export type LimitFilter = "all" | LimitStatus;

export interface ILimitCard {
    id: string;
    name: string;
    rows: IModuleLimit[];
    /** Alle Grenzen des Moduls, unabhängig vom Filter. */
    total: number;
    /** Davon „auf Anfrage“. */
    askable: number;
}

export interface ILimitTab {
    id: "module" | "grenzen";
    label: string;
    count: number | null;
}

/** Ein eigener Wert für diesen Server geht vor „auf Anfrage“. */
export function limitStatus(entry: IModuleLimit): LimitStatus {
    if (entry.granted) return "granted";

    return entry.askable ? "ask" : "fixed";
}

export function limitStatusText(entry: IModuleLimit): string {
    const status = limitStatus(entry);

    if (status === "ask") return "auf Anfrage";
    if (status === "fixed") return "fest";
    if (!entry.since) return "für euch angepasst";

    const day = new Date(entry.since).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

    return `für euch seit ${day}`;
}

/** Die Zeile zeigt den Wert daneben; „höchstens“ am Ende wäre doppelt. */
export function limitName(label: string): string {
    return label.replace(/\s+höchstens$/u, "");
}

function moduleName(id: string): string {
    return MODULES.find((entry) => entry.id === id)?.name ?? id;
}

/** Nur Module, die es in den Grenzen gibt, in der Reihenfolge der Leiste. */
function ordered(limits: Record<string, IModuleLimit[]>): string[] {
    const known = MODULES.map((entry) => entry.id).filter((id) => (limits[id]?.length ?? 0) > 0);
    const rest = Object.keys(limits).filter((id) => !known.includes(id) && (limits[id]?.length ?? 0) > 0);

    return [...known, ...rest];
}

function within(limits: Record<string, IModuleLimit[]>, module: string | null): string[] {
    const ids = ordered(limits);

    return module && ids.includes(module) ? [module] : ids;
}

export function limitCounts(limits: Record<string, IModuleLimit[]>, module: string | null): Record<LimitFilter, number> {
    const counts: Record<LimitFilter, number> = { all: 0, ask: 0, granted: 0, fixed: 0 };

    for (const id of within(limits, module)) {
        for (const entry of limits[id] ?? []) {
            counts.all += 1;
            counts[limitStatus(entry)] += 1;
        }
    }

    return counts;
}

export function askableCount(limits: Record<string, IModuleLimit[]>): number {
    return limitCounts(limits, null).ask;
}

export function limitCards(limits: Record<string, IModuleLimit[]>, opts: { filter: LimitFilter; search: string; module: string | null }): ILimitCard[] {
    const term = opts.search.trim().toLocaleLowerCase("de-DE");
    const cards: ILimitCard[] = [];

    for (const id of within(limits, opts.module)) {
        const all = limits[id] ?? [];
        const name = moduleName(id);
        // Trifft die Suche den Modulnamen, zählen alle seine Zeilen als Treffer.
        const byModule = term !== "" && name.toLocaleLowerCase("de-DE").includes(term);
        const rows = all.filter(
            (entry) =>
                (opts.filter === "all" || limitStatus(entry) === opts.filter) &&
                (term === "" || byModule || limitName(entry.label).toLocaleLowerCase("de-DE").includes(term))
        );

        if (rows.length === 0) continue;

        cards.push({ id, name, rows, total: all.length, askable: all.filter((entry) => limitStatus(entry) === "ask").length });
    }

    return cards;
}

/**
 * Der Text für den Support. Der Servername kommt so, wie er ist - ausgegeben
 * wird er nur über textContent.
 */
export function limitRequestText(server: string, module: string, entry: Pick<IModuleLimit, "label" | "unit">, wish: number, reason: string): string {
    const amount = Number.isFinite(wish) ? `${wish}${entry.unit ? ` ${entry.unit}` : ""}` : "…";
    const why = reason.trim() || "…";

    return `Anfrage für „${server}“: ${module}, ${entry.label} bis ${amount}, weil ${why}`;
}

export function wishProblem(entry: Pick<IModuleLimit, "value" | "unit">, wish: number): string | null {
    if (!Number.isFinite(wish)) return "Zahl eintragen";
    if (!Number.isInteger(wish)) return "Ganze Zahl eintragen";
    if (wish <= entry.value) return `Mehr als ${entry.value}${entry.unit ? ` ${entry.unit}` : ""}`;

    return null;
}

export function limitsHref(base: string, guildId: string, module?: string): string {
    return `${base}/guild/${guildId}/module?reiter=grenzen${module ? `&modul=${encodeURIComponent(module)}` : ""}`;
}

export function parseLimitsQuery(search: string): { tab: "module" | "grenzen"; module: string | null } {
    const params = new URLSearchParams(search);

    if (params.get("reiter") !== "grenzen") return { tab: "module", module: null };

    const module = params.get("modul");

    return { tab: "grenzen", module: module && /^[a-z0-9-]+$/.test(module) ? module : null };
}

/** Wer den Server nicht verwaltet, sieht keine Reiter - wie früher keinen Kasten. */
export function limitTabs(canManage: boolean, askable: number): ILimitTab[] {
    if (!canManage) return [];

    return [
        { id: "module", label: "Module", count: null },
        { id: "grenzen", label: "Grenzen", count: askable > 0 ? askable : null },
    ];
}
