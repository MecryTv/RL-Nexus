import {
    BANNER_KINDS,
    COMMAND_NAME,
    CONTENT_LIMITS,
    MODULE_ID,
    type IBanner,
    type IBlock,
    type ICategories,
    type ICategory,
    type IContentMeta,
    type IMember,
    type IModuleDefinition,
    type IModuleDetail,
    type IModules,
    type IOpenRole,
    type ITeam,
} from "../shared/content.ts";
import { InvalidInput } from "./errors.ts";
import { link, oneOf, text } from "./validate.ts";

/**
 * Prüfregeln für die Inhalte der Hauptseite. Jede Funktion gibt den sauberen
 * Inhalt zurück (getrimmt, ohne fremde Felder) oder wirft InvalidInput mit
 * einem Satz, der sagt, wo es klemmt: „Modul 3 („Self Roles“): Die Tagline
 * darf höchstens 140 Zeichen lang sein.“
 *
 * Symbole, Farben, Kategorien und Status kommen aus `meta.json` der Webseite:
 * Was die Webseite nicht zeichnen kann, kommt nicht durch.
 */

const TEAM = CONTENT_LIMITS.team;
const MODULE = CONTENT_LIMITS.modules;
const CATEGORY = CONTENT_LIMITS.categories;
const DETAIL = CONTENT_LIMITS.detail;

type Shape = Record<string, unknown>;

function object(value: unknown, label: string): Shape {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidInput(`${label} hat keine gültige Form.`);

    return value as Shape;
}

function list<T>(value: unknown, label: string, { min = 0, max }: { readonly min?: number; readonly max: number }, parse: (item: unknown, index: number) => T): T[] {
    if (!Array.isArray(value)) throw new InvalidInput(`${label} muss eine Liste sein.`);
    if (value.length < min) throw new InvalidInput(min === 1 ? `${label} braucht mindestens einen Eintrag.` : `${label} braucht mindestens ${min} Einträge.`);
    if (value.length > max) throw new InvalidInput(`${label} hat mehr als ${max} Einträge.`);

    return value.map(parse);
}

/** Ein Schalter, der fehlen darf. */
function flag(value: unknown, label: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new InvalidInput(`${label} muss an oder aus sein.`);

    return value;
}

function required(value: unknown, label: string, max: number): string {
    return text(value, label, { min: 1, max });
}

function icon(value: unknown, label: string, meta: IContentMeta): string {
    if (typeof value !== "string" || !meta.icons.some((entry) => entry.name === value)) {
        throw new InvalidInput(`${label} ist kein Symbol der Webseite.`);
    }

    return value;
}

const SINGLE = /^var\((--c-[a-z0-9-]+)\)$/;
const MIX = /^color-mix\(in srgb, var\((--c-[a-z0-9-]+)\) (\d{1,3})%, var\((--c-[a-z0-9-]+)\)\)$/;

/**
 * Eine Farbe der Webseite als `var(--c-…)`, oder eine Mischung aus zweien,
 * wie sie heute in einem Modultext steht. Nichts sonst: Der Wert landet in
 * einer CSS-Variable, und ein `url()` darin lüde fremde Dateien.
 */
function color(value: unknown, label: string, meta: IContentMeta): string {
    const known = (token: string | undefined): boolean => meta.colors.some((entry) => entry.token === token);

    if (typeof value === "string") {
        const single = SINGLE.exec(value);
        if (single && known(single[1])) return value;

        const mix = MIX.exec(value);
        if (mix && known(mix[1]) && Number(mix[2]) <= 100 && known(mix[3])) return value;
    }

    throw new InvalidInput(`${label} ist keine Farbe der Webseite.`);
}

/** Bis Oktober 2026 hieß die Art `tone` und kannte nur info und warn. */
const LEGACY_KIND = { info: "info", warn: "stoerung" } as const;

/** Ein Zeitpunkt, der fehlen darf. Gespeichert wird er immer als ISO in UTC. */
function moment(value: unknown, label: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new InvalidInput(`${label} ist kein gültiger Zeitpunkt.`);

    return new Date(value).toISOString();
}

export function parseBanner(value: unknown): IBanner {
    const data = object(value, "Das Banner");
    const enabled = flag(data.enabled, "Das Banner") ?? false;
    const kind = data.kind === undefined && (data.tone === "info" || data.tone === "warn") ? LEGACY_KIND[data.tone] : oneOf(data.kind, BANNER_KINDS, "Die Art");
    const title = text(data.title ?? "", "Der Titel", { max: CONTENT_LIMITS.banner.title });

    // Ausgeschaltet darf der Text leer sein, eingeschaltet nicht.
    const message = text(data.text, "Der Text", { min: enabled ? 1 : 0, max: CONTENT_LIMITS.banner.text });

    const showFrom = moment(data.showFrom, "„Sichtbar ab“");
    const showUntil = moment(data.showUntil, "„Sichtbar bis“");
    const countdownTo = moment(data.countdownTo, "Das Ziel des Countdowns");

    if (showFrom !== undefined && showUntil !== undefined && Date.parse(showUntil) <= Date.parse(showFrom)) {
        throw new InvalidInput("„Sichtbar bis“ muss nach „Sichtbar ab“ liegen.");
    }

    // Nur setzen, was gesetzt ist: So bleibt die Datei so knapp wie der Standard der Webseite.
    const times = { ...(showFrom ? { showFrom } : {}), ...(showUntil ? { showUntil } : {}), ...(countdownTo ? { countdownTo } : {}) };
    const banner = { enabled, kind, title, text: message };

    if (data.link === undefined || data.link === null) return { ...banner, ...times };

    const raw = object(data.link, "Der Link");
    const href = link(raw.href, "Die Adresse des Links", CONTENT_LIMITS.banner.href);
    const label = text(raw.label, "Die Beschriftung des Links", { max: CONTENT_LIMITS.banner.linkLabel });

    if (href === null && label === "") return { ...banner, ...times };
    if (href === null) throw new InvalidInput("Der Link braucht eine Adresse.");
    if (label === "") throw new InvalidInput("Der Link braucht eine Beschriftung.");

    return { ...banner, link: { href, label }, ...times };
}

/** Ein gespeicherter Banner in der neuen Form, auch aus der alten. `null`, wenn er nicht zu lesen ist. */
export function bannerOf(value: unknown): IBanner | null {
    try {
        return parseBanner(value);
    } catch {
        return null;
    }
}

function parseMember(value: unknown, index: number, meta: IContentMeta): IMember {
    const where = `Mitglied ${index + 1}`;
    const data = object(value, where);
    const name = required(data.name, `${where}: Der Name`, TEAM.name);
    const at = `${where} („${name}“)`;

    const member: IMember = {
        name,
        handle: required(data.handle, `${at}: Der Discord-Name`, TEAM.handle),
        role: required(data.role, `${at}: Die Rolle`, TEAM.role),
        text: required(data.text, `${at}: Der Text`, TEAM.text),
        focus: list(data.focus ?? [], `${at}: Die Schwerpunkte`, { max: TEAM.focus }, (entry, i) => required(entry, `${at}: Schwerpunkt ${i + 1}`, TEAM.focusEntry)),
        accent: color(data.accent, `${at}: Die Farbe`, meta),
    };

    if (data.links === undefined) return member;

    const links = list(data.links, `${at}: Die Links`, { max: TEAM.links }, (entry, i) => {
        const raw = object(entry, `${at}: Link ${i + 1}`);
        const href = link(raw.href, `${at}: Die Adresse von Link ${i + 1}`, TEAM.href);
        if (href === null) throw new InvalidInput(`${at}: Link ${i + 1} braucht eine Adresse.`);

        return {
            label: required(raw.label, `${at}: Die Beschriftung von Link ${i + 1}`, TEAM.linkLabel),
            href,
            icon: icon(raw.icon, `${at}: Das Symbol von Link ${i + 1}`, meta),
        };
    });

    return links.length > 0 ? { ...member, links } : member;
}

function parseOpenRole(value: unknown, index: number, meta: IContentMeta): IOpenRole {
    const where = `Offene Stelle ${index + 1}`;
    const data = object(value, where);

    return {
        title: required(data.title, `${where}: Der Titel`, TEAM.roleTitle),
        text: required(data.text, `${where}: Der Text`, TEAM.roleText),
        icon: icon(data.icon, `${where}: Das Symbol`, meta),
    };
}

export function parseTeam(value: unknown, meta: IContentMeta): ITeam {
    const data = object(value, "Das Team");

    return {
        members: list(data.members, "Die Mitglieder", { max: TEAM.members }, (entry, i) => parseMember(entry, i, meta)),
        openRoles: list(data.openRoles, "Die offenen Stellen", { max: TEAM.openRoles }, (entry, i) => parseOpenRole(entry, i, meta)),
    };
}

function parseModule(value: unknown, index: number, meta: IContentMeta, categoryIds: readonly string[]): IModuleDefinition {
    const where = `Modul ${index + 1}`;
    const data = object(value, where);
    const name = required(data.name, `${where}: Der Name`, MODULE.name);
    const at = `${where} („${name}“)`;

    const id = required(data.id, `${at}: Die ID`, MODULE.id);
    if (!MODULE_ID.test(id)) throw new InvalidInput(`${at}: Die ID besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und beginnt mit einem Buchstaben.`);

    const module: IModuleDefinition = {
        id,
        name,
        tagline: required(data.tagline, `${at}: Die Tagline`, MODULE.tagline),
        description: required(data.description, `${at}: Die Beschreibung`, MODULE.description),
        category: oneOf(data.category, categoryIds, `${at}: Die Kategorie`),
        status: oneOf(data.status, meta.statuses.map((entry) => entry.id), `${at}: Der Status`),
        icon: icon(data.icon, `${at}: Das Symbol`, meta),
        highlights: list(data.highlights, `${at}: Die Stichpunkte`, { min: 1, max: MODULE.highlights }, (entry, i) => required(entry, `${at}: Stichpunkt ${i + 1}`, MODULE.highlight)),
    };

    const commands =
        data.commands === undefined
            ? []
            : list(data.commands, `${at}: Die Commands`, { max: MODULE.commands }, (entry, i) => {
                  const command = required(entry, `${at}: Command ${i + 1}`, MODULE.command);
                  if (!COMMAND_NAME.test(command)) throw new InvalidInput(`${at}: Command ${i + 1} („${command}“) ist kein Command-Name. Ohne Schrägstrich, klein geschrieben.`);

                  return command;
              });

    const featured = flag(data.featured, `${at}: „Auf der Startseite“`);
    const builtIn = flag(data.builtIn, `${at}: „Fest eingebaut“`);

    // Nur setzen, was gesetzt ist: so bleibt die Datei so knapp wie die Daten der Webseite.
    return {
        ...module,
        ...(commands.length > 0 ? { commands } : {}),
        ...(featured ? { featured } : {}),
        ...(builtIn ? { builtIn } : {}),
    };
}

/** `categoryIds`: die Kategorien aus categories.json. Ohne Angabe die eingebauten aus meta.json. */
export function parseModules(value: unknown, meta: IContentMeta, categoryIds: readonly string[] = meta.categories.map((entry) => entry.id)): IModules {
    const data = object(value, "Die Modulliste");
    const modules = list(data.modules, "Die Modulliste", { min: 1, max: MODULE.count }, (entry, i) => parseModule(entry, i, meta, categoryIds));
    const seen = new Set<string>();

    for (const module of modules) {
        if (seen.has(module.id)) throw new InvalidInput(`Die ID „${module.id}“ steht zweimal in der Liste. Sie steckt in der Adresse der Detailseite und muss eindeutig sein.`);
        seen.add(module.id);
    }

    return { modules };
}

const HEX = /^#[0-9a-f]{6}$/;
const TOKEN = /^var\((--c-[a-z0-9-]+)\)$/;

/** Hex in Kleinbuchstaben oder eine Farbe der Webseite, nichts anderes. */
function categoryColor(value: unknown, label: string, meta: IContentMeta): string {
    if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        if (HEX.test(lower)) return lower;

        const token = TOKEN.exec(value.trim());
        if (token && meta.colors.some((entry) => entry.token === token[1])) return value.trim();
    }

    throw new InvalidInput(`${label} ist keine Farbe: Hex wie #ff4a3d oder eine Farbe der Webseite.`);
}

/**
 * categories.json. `modules` und `previous` braucht die Prüfung, weil eine
 * Kategorie, in der noch Module stecken, nicht verschwinden darf. Die Meldung
 * nennt sie beim alten Namen.
 */
export function parseCategories(
    value: unknown,
    meta: IContentMeta,
    { modules, previous }: { readonly modules: IModules | null; readonly previous: readonly ICategory[] }
): ICategories {
    const data = object(value, "Die Kategorien");
    if (Array.isArray(data.categories) && data.categories.length > CATEGORY.count) throw new InvalidInput(`Höchstens ${CATEGORY.count} Kategorien.`);
    const categories = list(data.categories, "Die Kategorien", { min: 1, max: CATEGORY.count }, (entry, index): ICategory => {
        const where = `Kategorie ${index + 1}`;
        const item = object(entry, where);
        const label = required(item.label, `${where}: Der Name`, CATEGORY.label.max);
        if (label.length < CATEGORY.label.min) throw new InvalidInput(`${where}: Der Name braucht mindestens ${CATEGORY.label.min} Zeichen.`);

        const at = `${where} („${label}“)`;
        const id = required(item.id, `${at}: Die ID`, CATEGORY.id);
        if (!MODULE_ID.test(id)) throw new InvalidInput(`${at}: Die ID besteht aus Kleinbuchstaben, Ziffern und Bindestrichen und beginnt mit einem Buchstaben.`);

        const description = item.description === undefined || item.description === "" ? undefined : required(item.description, `${at}: Die Beschreibung`, CATEGORY.description);

        return { id, label, color: categoryColor(item.color, `${at}: Die Farbe`, meta), ...(description === undefined ? {} : { description }) };
    });

    const ids = new Set<string>();
    for (const category of categories) {
        if (ids.has(category.id)) throw new InvalidInput(`Die ID „${category.id}“ steht zweimal in der Liste.`);
        ids.add(category.id);
    }

    for (const module of modules?.modules ?? []) {
        if (ids.has(module.category)) continue;

        const count = (modules?.modules ?? []).filter((other) => other.category === module.category).length;
        const name = previous.find((entry) => entry.id === module.category)?.label ?? module.category;
        throw new InvalidInput(`${name} hat noch ${count} Module.`);
    }

    return { categories };
}

function block<T>(value: unknown, label: string, parseEntry: (entry: unknown, index: number) => T): IBlock<T> | undefined {
    if (value === undefined || value === null) return undefined;

    const data = object(value, label);

    return {
        title: required(data.title, `${label}: Die Überschrift`, DETAIL.blockTitle),
        lead: required(data.lead, `${label}: Die Einleitung`, DETAIL.blockLead),
        entries: list(data.entries, `${label}: Die Einträge`, { min: 1, max: DETAIL.entries }, parseEntry),
    };
}

export function parseDetail(value: unknown, meta: IContentMeta): IModuleDetail {
    const data = object(value, "Der Detailtext");

    const intro = list(data.intro, "Die Einleitung", { min: 1, max: DETAIL.intro }, (entry, i) => required(entry, `Absatz ${i + 1} der Einleitung`, DETAIL.paragraph));

    const concepts = block(data.concepts, "Begriffe", (entry, i) => {
        const raw = object(entry, `Begriff ${i + 1}`);

        return {
            label: required(raw.label, `Begriff ${i + 1}: Die Bezeichnung`, DETAIL.conceptLabel),
            text: required(raw.text, `Begriff ${i + 1}: Der Text`, DETAIL.conceptText),
            color: color(raw.color, `Begriff ${i + 1}: Die Farbe`, meta),
        };
    });

    const automations = block(data.automations, "Automatisch", (entry, i) => {
        const raw = object(entry, `Automatik ${i + 1}`);

        return {
            title: required(raw.title, `Automatik ${i + 1}: Der Titel`, DETAIL.entryTitle),
            text: required(raw.text, `Automatik ${i + 1}: Der Text`, DETAIL.entryText),
            icon: icon(raw.icon, `Automatik ${i + 1}: Das Symbol`, meta),
        };
    });

    const setup = block(data.setup, "Einrichtung", (entry, i) => {
        const raw = object(entry, `Schritt ${i + 1}`);

        return {
            title: required(raw.title, `Schritt ${i + 1}: Der Titel`, DETAIL.entryTitle),
            text: required(raw.text, `Schritt ${i + 1}: Der Text`, DETAIL.entryText),
        };
    });

    const parts =
        data.parts === undefined || data.parts === null
            ? []
            : list(data.parts, "„Kommt mit“", { max: DETAIL.parts }, (entry, i) => {
                  const raw = object(entry, `Teil ${i + 1}`);

                  return { name: required(raw.name, `Teil ${i + 1}: Der Name`, DETAIL.partName), text: required(raw.text, `Teil ${i + 1}: Der Text`, DETAIL.partText) };
              });

    const showcase = data.showcase === undefined || data.showcase === null || data.showcase === "" ? undefined : oneOf(data.showcase, meta.showcases, "Das Beispiel");

    return {
        intro,
        ...(concepts ? { concepts } : {}),
        ...(automations ? { automations } : {}),
        ...(setup ? { setup } : {}),
        ...(parts.length > 0 ? { parts } : {}),
        ...(showcase ? { showcase } : {}),
    };
}
