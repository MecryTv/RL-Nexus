/**
 * /hilfe (W-0014, Plan 45): Bereiche, Links und die Form der Hilfetexte.
 * Die Texte selbst stehen in HelpCatalog.ts, die Felder kommen immer aus der
 * Definition des Befehls (services/help/HelpModel.ts).
 */

export const HELP_PREFIX = "hilfe:";
export const HELP_ACCENT = 0xff1e2d;
export const STATUS_URL = "https://status.nexus-emb.de";
export const SUPPORT_URL = "https://discord.gg/CjG2HFGw95";
/** W-0060: „RL Nexus EMB | Support“, der Server hinter SUPPORT_URL. Wer den Bot einlädt, kommt dort hinein. */
export const SUPPORT_GUILD_ID = "1547258700480253982";

/** Ein Bereich der Leiste. W-0085: Neue legt das Admin Dashboard an, deshalb ein freier Text. */
export type HelpAreaId = string;

/** Die Bereiche aus dem Code. Hilfetexte nennen nur diese, ein Tippfehler fällt so beim Bauen auf. */
export type BuiltInAreaId = "always" | "rocket-league" | "community" | "support" | "moderation" | "content" | "general";

/** Wie in der Leiste des Dashboards, dazu „Allgemein“ für Befehle ohne Modul. */
export const HELP_AREAS: { id: HelpAreaId; name: string; emoji: string }[] = [
    { id: "always", name: "Immer dabei", emoji: "⭐" },
    { id: "rocket-league", name: "Rocket League", emoji: "🎮" },
    { id: "community", name: "Community", emoji: "💬" },
    { id: "support", name: "Support", emoji: "🎫" },
    { id: "moderation", name: "Moderation", emoji: "🛡️" },
    { id: "content", name: "Inhalte & Meldungen", emoji: "📣" },
    { id: "general", name: "Allgemein", emoji: "🧭" },
];

/** Der Stand aus dem Code, bevor ein Katalog aus dem Admin Dashboard drüberkommt. */
const BUILT_IN_AREAS = HELP_AREAS.map((area) => ({ ...area }));

/** W-0085: Modul → Bereich laut Admin Dashboard. Leer: es gilt der Bereich am Hilfetext. */
export const MODULE_AREA = new Map<string, HelpAreaId>();

/**
 * W-0085: Bereichsnamen, Reihenfolge und Modul-Zuordnung aus dem Admin
 * Dashboard (services/CatalogService.ts). Emojis bleiben, ein neuer Bereich
 * bekommt 📦. Bereiche aus dem Code, die dort fehlen, bleiben hinten dran,
 * damit kein Befehl ohne Bereich dasteht; „Allgemein“ steht immer zuletzt.
 * `null`: zurück auf den Stand aus dem Code.
 */
export function ApplyHelpCatalog(catalog: { categories: { id: string; name: string }[]; modules: { id: string; category: string }[] } | null): void {
    const general = BUILT_IN_AREAS.find((area) => area.id === "general")!;
    const own = BUILT_IN_AREAS.filter((area) => area.id !== "general");
    // „general“ ist „Allgemein“ und steht immer zuletzt. Ein gleichnamiger Bereich aus dem Admin gäbe die ID zweimal, Discord lehnte das Menü ab.
    const areas = catalog
        ? catalog.categories.filter((entry) => entry.id !== general.id).map((entry) => ({ id: entry.id, name: entry.name, emoji: own.find((area) => area.id === entry.id)?.emoji ?? "📦" }))
        : own.map((area) => ({ ...area }));

    for (const area of own) if (!areas.some((entry) => entry.id === area.id)) areas.push({ ...area });

    HELP_AREAS.splice(0, HELP_AREAS.length, ...areas, { ...general });
    MODULE_AREA.clear();

    for (const module of catalog?.modules ?? []) MODULE_AREA.set(module.id, module.category);
}

/** Wer darf: alle, das Team (Moderation, Support) oder wer den Server verwaltet. */
export type HelpWho = "alle" | "team" | "verwalter";

export const WHO_LABELS: Record<HelpWho, string> = { alle: "alle", team: "Team", verwalter: "Verwalter" };

/** Ein Befehl oder Unterbefehl, ganz erklärt (Befehlsseite A). */
export interface IHelpText {
    emoji: string;
    area: BuiltInAreaId;
    /** Abschnitt im Dashboard (/guild/<id>/<module>), null ohne eigene Seite. */
    module: string | null;
    /** W-0085: Modul im Admin Dashboard, wenn es keine Seite im Dashboard hat (RL Tracking). Bestimmt nur den Bereich. */
    catalog?: string;
    who: HelpWho;
    /** Der Satz, welches Recht es braucht, etwa „Team mit „Mitglieder moderieren““. */
    whoText: string;
    what: string;
    examples: { code: string; text: string }[];
    /** Je Feld der Definition ein Satz. */
    fields: Record<string, string>;
    after: string[];
    tip?: string;
    /** Nur bei Unterbefehlen: die kleine Zeile über dem Kapitel (Gruppe K). */
    when?: string;
    /** Strafen: die Seite bekommt das Kapitel „Beweise anhängen“. */
    evidence?: true;
}

/** Ein Befehl mit Unterbefehlen (Gruppe K). Die Reihenfolge in subs ist die der Kapitel. */
export interface IHelpGroupText {
    emoji: string;
    area: BuiltInAreaId;
    module: string | null;
    /** W-0085: wie IHelpText.catalog. */
    catalog?: string;
    what: string;
    tip?: string;
    subs: Record<string, IHelpText>;
}

/** Schlüssel: der Befehlsname, wie er registriert ist (auch „Hack melden“). */
export type HelpCatalog = Record<string, IHelpText | IHelpGroupText>;

export function IsGroupText(text: IHelpText | IHelpGroupText): text is IHelpGroupText {
    return "subs" in text;
}
