import { LINK_MODE_LABELS, MODULE_STATUS_LABELS, type IBotModuleOverride, type IBotModuleView, type LinkMode, type ModuleStatus } from "../../shared/botModules";
import { settingsOf, type IModuleSettingDef } from "../../shared/botModuleSettings";

/**
 * W-0133: Entwürfe auf der Seite „Module“. Für alle Server ist jeder Wert
 * gesetzt (Standard aufgefüllt); für einen Server stehen nur die eigenen Werte
 * drin, alles andere übernimmt er von „Alle Server“. Zahlen bleiben beim
 * Tippen Text und werden erst beim Speichern geprüft.
 */
export interface IAllDraft {
    readonly kind: "all";
    readonly status: ModuleStatus;
    readonly notice: string;
    readonly linkMode: LinkMode | null;
    readonly values: Readonly<Record<string, string>>;
    readonly askable: Readonly<Record<string, boolean>>;
}

export interface IServerDraft {
    readonly kind: "server";
    /** null: wie alle. */
    readonly status: "on" | "off" | null;
    /** null: wie alle. */
    readonly notice: string | null;
    readonly linkMode: LinkMode | null;
    /** Nur die eigenen Werte. */
    readonly values: Readonly<Record<string, string>>;
    readonly note: string;
}

export type Draft = IAllDraft | IServerDraft;

export interface IChange {
    readonly label: string;
    readonly before: string;
    readonly after: string;
}

const text = (values: Readonly<Record<string, number>>): Record<string, string> => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));

export function allDraftOf(module: IBotModuleView): IAllDraft {
    return { kind: "all", status: module.status, notice: module.notice ?? "", linkMode: module.linkMode, values: text(module.values), askable: { ...module.askable } };
}

export function serverDraftOf(override: IBotModuleOverride | undefined): IServerDraft {
    return {
        kind: "server",
        status: override?.status ?? null,
        notice: override?.notice ?? null,
        linkMode: override?.linkMode ?? null,
        values: text(override?.values ?? {}),
        note: override?.note ?? "",
    };
}

/** Fehlertext für ein Feld, null wenn die Zahl passt. */
export function valueError(def: IModuleSettingDef, raw: string | undefined): string | null {
    if (raw === undefined || raw.trim() === "") return "Zahl fehlt";
    if (!/^\d+$/.test(raw.trim())) return "Nur ganze Zahlen";

    const value = Number(raw);

    return value < def.min || value > def.max ? `${def.min} bis ${def.max}` : null;
}

const withUnit = (def: IModuleSettingDef, value: number | string): string => (def.unit ? `${value} ${def.unit}` : String(value));
const noticeShort = (value: string | null): string => (value ? "gesetzt" : "leer");

export function allChanges(saved: IBotModuleView, draft: IAllDraft): IChange[] {
    const list: IChange[] = [];
    const notice = draft.notice.trim();

    if (draft.status !== saved.status) list.push({ label: "Status", before: MODULE_STATUS_LABELS[saved.status], after: MODULE_STATUS_LABELS[draft.status] });
    if (notice !== (saved.notice ?? "")) list.push({ label: "Hinweis", before: noticeShort(saved.notice), after: notice ? "neu" : "leer" });
    if (draft.linkMode && saved.linkMode && draft.linkMode !== saved.linkMode) list.push({ label: "Epic-Konto verbinden", before: LINK_MODE_LABELS[saved.linkMode], after: LINK_MODE_LABELS[draft.linkMode] });

    for (const def of settingsOf(saved.module)) {
        if (draft.values[def.key] !== String(saved.values[def.key])) list.push({ label: def.label, before: withUnit(def, saved.values[def.key]), after: withUnit(def, draft.values[def.key] || "–") });
        if (draft.askable[def.key] !== saved.askable[def.key]) list.push({ label: `Auf Anfrage bei „${def.label}“`, before: saved.askable[def.key] ? "an" : "aus", after: draft.askable[def.key] ? "an" : "aus" });
    }

    return list;
}

export function serverChanges(module: IBotModuleView, saved: IBotModuleOverride | undefined, draft: IServerDraft): IChange[] {
    const list: IChange[] = [];
    const inherit = (value: string): string => `wie alle (${value})`;
    const status = (value: "on" | "off" | null): string => (value ? MODULE_STATUS_LABELS[value] : inherit(MODULE_STATUS_LABELS[module.status]));
    const link = (value: LinkMode | null): string => (value ? LINK_MODE_LABELS[value] : inherit(module.linkMode ? LINK_MODE_LABELS[module.linkMode] : "–"));
    const notice = draft.notice === null ? null : draft.notice.trim() || null;
    const was = serverDraftOf(saved);

    if (draft.status !== was.status) list.push({ label: "Status", before: status(was.status), after: status(draft.status) });
    if (notice !== was.notice) list.push({ label: "Hinweis", before: was.notice === null ? "wie alle" : "eigener", after: notice === null ? "wie alle" : "eigener" });
    if (draft.linkMode !== was.linkMode) list.push({ label: "Epic-Konto verbinden", before: link(was.linkMode), after: link(draft.linkMode) });

    for (const def of settingsOf(module.module)) {
        const before = was.values[def.key];
        const after = draft.values[def.key];

        if (before !== after) {
            list.push({
                label: def.label,
                before: before === undefined ? inherit(withUnit(def, module.values[def.key])) : withUnit(def, before),
                after: after === undefined ? inherit(withUnit(def, module.values[def.key])) : withUnit(def, after || "–"),
            });
        }
    }

    // Die Notiz allein zählt nur, wenn es den Server-Wert schon gibt.
    if (saved && draft.note.trim() !== was.note) list.push({ label: "Notiz", before: was.note || "leer", after: draft.note.trim() || "leer" });

    return list;
}

/** Erste ungültige Zahl, damit Speichern sie nennen kann. */
export function firstError(module: string, draft: Draft): string | null {
    for (const def of settingsOf(module)) {
        if (draft.kind === "server" && draft.values[def.key] === undefined) continue;

        const error = valueError(def, draft.values[def.key]);

        if (error) return `${def.label}: ${error}`;
    }

    return null;
}

/** Body für PUT /api/bot-modules/:id. Für alle nur geänderte Werte, für einen Server der ganze eigene Stand. */
export function bodyOf(saved: IBotModuleView, draft: Draft, server: string | null): Record<string, unknown> {
    if (draft.kind === "server") {
        return {
            server,
            status: draft.status,
            notice: draft.notice === null ? null : draft.notice.trim() || null,
            linkMode: draft.linkMode,
            values: Object.fromEntries(Object.entries(draft.values).map(([key, value]) => [key, Number(value)])),
            note: draft.note.trim() || null,
        };
    }

    const values: Record<string, number> = {};
    const askable: Record<string, boolean> = {};

    for (const def of settingsOf(saved.module)) {
        if (Number(draft.values[def.key]) !== saved.values[def.key]) values[def.key] = Number(draft.values[def.key]);
        if (draft.askable[def.key] !== saved.askable[def.key]) askable[def.key] = draft.askable[def.key];
    }

    return { status: draft.status, notice: draft.notice, ...(draft.linkMode ? { linkMode: draft.linkMode } : {}), values, askable };
}

/** Grenzen, die für alle sinken. */
export function lowered(saved: IBotModuleView, draft: IAllDraft): IChange[] {
    return settingsOf(saved.module)
        .filter((def) => Number(draft.values[def.key]) < saved.values[def.key])
        .map((def) => ({ label: def.label, before: withUnit(def, saved.values[def.key]), after: withUnit(def, draft.values[def.key]) }));
}

/** „Gewinner höchstens 100 (alle: 50)“ je eigenem Wert eines Servers. */
export function overrideSummary(module: IBotModuleView, override: IBotModuleOverride): string {
    const parts: string[] = [];

    if (override.status) parts.push(`Status ${MODULE_STATUS_LABELS[override.status]} (alle: ${MODULE_STATUS_LABELS[module.status]})`);
    if (override.notice) parts.push("eigener Hinweis");
    if (override.linkMode) parts.push(`${LINK_MODE_LABELS[override.linkMode]} (alle: ${module.linkMode ? LINK_MODE_LABELS[module.linkMode] : "–"})`);

    for (const def of settingsOf(module.module)) {
        const value = override.values[def.key];

        if (value !== undefined) parts.push(`${def.label} ${value} (alle: ${module.values[def.key]})`);
    }

    return parts.join(" · ");
}

/** Zahl der eigenen Angaben eines Servers bei einem Modul. */
export function ownCount(override: IBotModuleOverride | undefined): number {
    if (!override) return 0;

    return (override.status ? 1 : 0) + (override.notice ? 1 : 0) + (override.linkMode ? 1 : 0) + Object.keys(override.values).length;
}

/* Liste: Kategorien und Filter. */
export type Filter = "all" | "off" | "beta" | "own";

export const CATEGORIES: readonly { readonly id: string | null; readonly label: string }[] = [
    { id: "competition", label: "Competition" },
    { id: "community", label: "Community" },
    { id: "moderation", label: "Moderation" },
    { id: "engagement", label: "Engagement" },
    { id: "content", label: "Content" },
    { id: "utility", label: "Utility" },
    { id: null, label: "Sonstige" },
];

export function categoryOf(module: IBotModuleView): string | null {
    return CATEGORIES.some((entry) => entry.id !== null && entry.id === module.category) ? module.category : null;
}

export const color = (category: string | null): string => (category ? `var(--c-mod-${category})` : "var(--c-text-faint)");

/** Was die Liste zeigt. Mit Suche oder Filter alle Kategorien, sonst nur die gewählte. */
export function visibleModules(
    modules: readonly IBotModuleView[],
    { serverOverrides, category, filter, search }: { readonly serverOverrides: ReadonlyMap<string, IBotModuleOverride> | null; readonly category: string | null; readonly filter: Filter; readonly search: string }
): IBotModuleView[] {
    const term = search.trim().toLowerCase();
    const wide = term !== "" || filter !== "all";

    return modules.filter((entry) => {
        if (term && !`${entry.name} ${entry.module}`.toLowerCase().includes(term)) return false;
        if (filter === "own" && !(serverOverrides ? serverOverrides.has(entry.module) : entry.overrides > 0)) return false;
        if ((filter === "off" || filter === "beta") && (serverOverrides?.get(entry.module)?.status ?? entry.status) !== filter) return false;

        return wide || categoryOf(entry) === category;
    });
}
