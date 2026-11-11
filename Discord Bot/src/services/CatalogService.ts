import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ApplyHelpCatalog } from "../constants/Help";

/**
 * W-0085: Bereiche und Module, wie sie im Admin Dashboard stehen. Dieselben
 * Dateien liest die Webseite (categories.json, modules.json). Das Bot-Dashboard
 * übernimmt daraus Bereichsnamen und -reihenfolge, je Modul Name, Kurztext
 * (botText) und Bereich; /hilfe Bereichsnamen und die Zuordnung der Befehle.
 * Symbole, Schalter und Teile bleiben im Bot.
 *
 * Gelesen wird die gespeicherte Datei des Admin Dashboards (CONTENT_DIR), ohne
 * sie der Standard der Webseite (CONTENT_DEFAULT_DIR), ohne beide gilt der
 * Stand aus dem Code.
 */
export interface ICatalog {
    categories: { id: string; name: string }[];
    modules: { id: string; name: string; text: string | null; category: string }[];
}

const FILES = ["categories.json", "modules.json"] as const;
/** Höchstens so oft schaut der Bot nach, ob sich eine Datei geändert hat. */
const CHECK_MS = 5_000;
/** So oft auch ohne Anfrage, damit /hilfe nachzieht, wenn niemand das Dashboard öffnet. */
const REFRESH_MS = 30_000;
const ID = /^[a-z][a-z0-9-]{0,39}$/;

function Text(value: unknown, max: number): string | null {
    if (typeof value !== "string") return null;

    const clean = value.trim();

    return clean && clean.length <= max ? clean : null;
}

function DataOf(raw: unknown): Record<string, unknown> | null {
    const data = (raw as { data?: unknown } | null)?.data;

    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/** Nur was taugt: kaputte Einträge fallen still heraus. Ohne Bereiche oder Module `null`, dann gilt der Code. */
export function Catalog(categoriesFile: unknown, modulesFile: unknown): ICatalog | null {
    const rawCategories = DataOf(categoriesFile)?.categories;
    const rawModules = DataOf(modulesFile)?.modules;

    if (!Array.isArray(rawCategories) || !Array.isArray(rawModules)) return null;

    const categories = rawCategories.flatMap((entry: Record<string, unknown> | null) => {
        const id = Text(entry?.id, 40);
        const name = Text(entry?.label, 40);

        return id && name && ID.test(id) ? [{ id, name }] : [];
    });
    const known = new Set(categories.map((entry) => entry.id));
    const modules = rawModules.flatMap((entry: Record<string, unknown> | null) => {
        const id = Text(entry?.id, 40);
        const name = Text(entry?.name, 40);
        const category = Text(entry?.category, 40);

        return id && name && category && ID.test(id) && known.has(category) ? [{ id, name, text: Text(entry?.botText, 200), category }] : [];
    });

    return categories.length && modules.length ? { categories, modules } : null;
}

export default class CatalogService {
    private current: ICatalog | null = null;
    private stamp = "";
    private checkedAt = 0;
    private running: Promise<ICatalog | null> | null = null;

    constructor(private readonly dirs: readonly (string | null)[]) {}

    get Current(): ICatalog | null {
        return this.current;
    }

    /** Beim Start einmal lesen, danach alle 30 Sekunden nachsehen. */
    Start(): void {
        void this.Fresh();
        setInterval(() => void this.Fresh(), REFRESH_MS).unref();
    }

    /** Der aktuelle Stand. Neu gelesen wird nur, wenn sich eine Datei geändert hat. */
    async Fresh(): Promise<ICatalog | null> {
        if (Date.now() - this.checkedAt < CHECK_MS) return this.current;

        this.running ??= this.Load().finally(() => (this.running = null));

        return this.running;
    }

    private async Load(): Promise<ICatalog | null> {
        this.checkedAt = Date.now();

        const picked = await Promise.all(FILES.map((name) => this.Pick(name)));
        const stamp = picked.map((entry) => (entry ? `${entry.file}@${entry.mtime}` : "-")).join("|");

        if (stamp === this.stamp) return this.current;

        const [categories, modules] = await Promise.all(picked.map((entry) => (entry ? readFile(entry.file, "utf8").then(JSON.parse).catch(() => null) : null)));

        this.stamp = stamp;
        this.current = Catalog(categories, modules);
        ApplyHelpCatalog(this.current);

        return this.current;
    }

    /** Die gespeicherte Datei, sonst der Standard der Webseite. */
    private async Pick(name: string): Promise<{ file: string; mtime: number } | null> {
        for (const dir of this.dirs) {
            if (!dir) continue;

            const file = path.join(dir, name);
            const info = await stat(file).catch(() => null);

            if (info?.isFile()) return { file, mtime: info.mtimeMs };
        }

        return null;
    }
}
