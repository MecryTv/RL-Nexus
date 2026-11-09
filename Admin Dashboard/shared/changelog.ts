/**
 * Changelog im Admin Dashboard (W-0061): eine Version mit ihren Änderungen,
 * ihre Regeln, das Einfügen aus `works changelog`, Suche und Filter. Gilt
 * für Server und Oberfläche; der Server prüft verbindlich, die Oberfläche
 * zeigt denselben Satz schon beim Tippen. Spec:
 * docs/superpowers/specs/2026-11-09-changelog-design.md.
 */

export const CHANGE_KINDS = ["neu", "verbessert", "behoben", "intern"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const KIND_LABELS: Readonly<Record<ChangeKind, string>> = { neu: "Neu", verbessert: "Verbessert", behoben: "Behoben", intern: "Intern" };

export const CHANGE_AREAS = ["bot", "dashboard", "admin", "webseite"] as const;
export type ChangeArea = (typeof CHANGE_AREAS)[number];

export const AREA_LABELS: Readonly<Record<ChangeArea, string>> = { bot: "Bot", dashboard: "Bot-Dashboard", admin: "Admin", webseite: "Webseite" };

export const CHANGELOG_LIMITS = { title: 80, text: 200, items: 30 } as const;

export interface IChangeItem {
    readonly kind: ChangeKind;
    readonly area: ChangeArea;
    readonly text: string;
    /** W-0000 oder null. */
    readonly task: string | null;
}

export interface IVersionInput {
    /** 1.4.0 */
    readonly version: string;
    /** JJJJ-MM-TT */
    readonly releasedOn: string;
    readonly title: string;
    readonly items: readonly IChangeItem[];
}

export interface IChangelogVersion extends IVersionInput {
    readonly id: number;
    readonly createdName: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    /** stale: seit dem Posten geändert, „Post aktualisieren“ zeigt es. */
    readonly posted: { readonly channelId: string; readonly messageId: string; readonly at: string; readonly stale: boolean } | null;
}

export interface IChangelogView {
    readonly versions: readonly IChangelogVersion[];
    readonly channel: { readonly id: string; readonly name: string | null } | null;
}

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TASK = /^W-\d{4}$/;

class Problem extends Error {}

const record = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

function textOf(value: unknown, label: string, max: number): string {
    if (typeof value !== "string") throw new Problem(`${label} fehlt.`);

    const text = value.replace(/\s+/g, " ").trim();

    if (!text) throw new Problem(`${label} fehlt.`);
    if (text.length > max) throw new Problem(`${label} darf höchstens ${max} Zeichen haben.`);

    return text;
}

function itemOf(value: unknown): IChangeItem {
    if (!record(value)) throw new Problem("Eine Änderung hat nicht die erwartete Form.");

    const kind = CHANGE_KINDS.find((entry) => entry === value.kind);
    const area = CHANGE_AREAS.find((entry) => entry === value.area);
    const task = typeof value.task === "string" ? value.task.trim() : null;

    if (!kind) throw new Problem("Diese Art gibt es nicht.");
    if (!area) throw new Problem("Diesen Bereich gibt es nicht.");
    if (task && !TASK.test(task)) throw new Problem("Die Aufgabe braucht die Form W-0014.");

    return { kind, area, text: textOf(value.text, "Der Text einer Änderung", CHANGELOG_LIMITS.text), task: task || null };
}

function shape(value: unknown): IVersionInput {
    if (!record(value)) throw new Problem("Die Version hat nicht die erwartete Form.");

    const version = typeof value.version === "string" ? value.version.trim() : "";
    const releasedOn = typeof value.releasedOn === "string" ? value.releasedOn.trim() : "";

    if (!VERSION.test(version)) throw new Problem("Die Version braucht die Form 1.4.0.");
    if (!DAY.test(releasedOn) || Number.isNaN(Date.parse(`${releasedOn}T00:00:00Z`))) throw new Problem("Das Datum braucht die Form JJJJ-MM-TT.");

    const title = textOf(value.title, "Der Titel", CHANGELOG_LIMITS.title);

    if (!Array.isArray(value.items) || value.items.length === 0) throw new Problem("Eine Version braucht mindestens eine Änderung.");
    if (value.items.length > CHANGELOG_LIMITS.items) throw new Problem(`Höchstens ${CHANGELOG_LIMITS.items} Änderungen je Version.`);

    return { version, releasedOn, title, items: value.items.map(itemOf) };
}

/** Prüft eine Version. Gibt sie bereinigt zurück, sonst den Satz für die Oberfläche. */
export function checkVersionInput(value: unknown): { readonly input: IVersionInput } | { readonly problem: string } {
    try {
        return { input: shape(value) };
    } catch (error) {
        if (error instanceof Problem) return { problem: error.message };

        throw error;
    }
}

/* --- Einfügen aus works -------------------------------------------------- */

const SECTIONS: Readonly<Record<string, ChangeKind>> = { neu: "neu", verbessert: "verbessert", behoben: "behoben", sonstiges: "intern" };
/** Der Anfang des Textes verrät den Bereich; die works-Ausgabe kennt keinen. */
const PREFIXES: readonly [RegExp, ChangeArea][] = [
    [/^(admin dashboard|admin):\s*/i, "admin"],
    [/^(bot-dashboard|dashboard):\s*/i, "dashboard"],
    [/^webseite:\s*/i, "webseite"],
];
const LINE = /^-\s+(.+?)(?:\s+\((W-\d{4})\))?\s*$/;

/**
 * Die Ausgabe von `works changelog`: Abschnitte `### Neu`, `### Verbessert`,
 * `### Behoben`, `### Sonstiges` (wird Intern) mit Zeilen `- Text (W-0014)`.
 * Was nicht erkannt wird, kommt als rest zurück und bleibt im Feld stehen.
 */
export function parseWorksChangelog(text: string): { readonly items: IChangeItem[]; readonly rest: string } {
    const items: IChangeItem[] = [];
    const rest: string[] = [];
    let kind: ChangeKind | null = null;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();

        if (!line || /^##\s/.test(line)) continue;

        const heading = /^###\s+(.+)$/.exec(line);

        if (heading) {
            kind = SECTIONS[heading[1]!.trim().toLowerCase()] ?? null;
            if (!kind) rest.push(line);
            continue;
        }

        const entry = LINE.exec(line);

        if (!entry || !kind) {
            rest.push(line);
            continue;
        }

        let body = entry[1]!;
        let area: ChangeArea = "bot";

        for (const [prefix, found] of PREFIXES) {
            if (prefix.test(body)) {
                body = body.replace(prefix, "");
                area = found;
                break;
            }
        }

        items.push({ kind, area, text: body.slice(0, CHANGELOG_LIMITS.text), task: entry[2] ?? null });
    }

    return { items, rest: rest.join("\n") };
}

/* --- Suche und Filter ---------------------------------------------------- */

export interface IChangelogFilter {
    readonly query: string;
    /** Leer: alle Arten. */
    readonly kinds: readonly ChangeKind[];
    /** Leer: alle Bereiche. */
    readonly areas: readonly ChangeArea[];
    readonly task: string | null;
}

/**
 * Versionen mit den Zeilen, die passen. Die Suche geht ohne Groß- und
 * Kleinschreibung über Text, Aufgabe, Version und Titel; trifft Version
 * oder Titel, zählen alle Zeilen der Version. Versionen ohne Zeile fallen weg.
 */
export function filterVersions(versions: readonly IChangelogVersion[], filter: IChangelogFilter): { readonly version: IChangelogVersion; readonly items: readonly IChangeItem[] }[] {
    const wanted = filter.query.trim().toLowerCase();

    return versions.flatMap((version) => {
        const head = wanted !== "" && `${version.version} ${version.title}`.toLowerCase().includes(wanted);
        const items = version.items.filter(
            (entry) =>
                (filter.kinds.length === 0 || filter.kinds.includes(entry.kind)) &&
                (filter.areas.length === 0 || filter.areas.includes(entry.area)) &&
                (filter.task === null || entry.task === filter.task) &&
                (wanted === "" || head || `${entry.text} ${entry.task ?? ""}`.toLowerCase().includes(wanted))
        );

        return items.length ? [{ version, items }] : [];
    });
}

/* --- Post ---------------------------------------------------------------- */

/** Was in den Post darf: alles außer Intern. */
export function postableItems(items: readonly IChangeItem[]): IChangeItem[] {
    return items.filter((entry) => entry.kind !== "intern");
}

/** Der Stempel im Bild: die Art mit den meisten Zeilen, bei Gleichstand Neu vor Verbessert vor Behoben. */
export function stampKind(items: readonly IChangeItem[]): Exclude<ChangeKind, "intern"> | null {
    let best: Exclude<ChangeKind, "intern"> | null = null;
    let most = 0;

    for (const kind of ["neu", "verbessert", "behoben"] as const) {
        const count = items.filter((entry) => entry.kind === kind).length;

        if (count > most) {
            best = kind;
            most = count;
        }
    }

    return best;
}
