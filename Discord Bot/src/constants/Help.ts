/**
 * /hilfe (W-0014, Plan 45): Bereiche, Links und die Form der Hilfetexte.
 * Die Texte selbst stehen in HelpCatalog.ts, die Felder kommen immer aus der
 * Definition des Befehls (services/help/HelpModel.ts).
 */

export const HELP_PREFIX = "hilfe:";
export const HELP_ACCENT = 0xff1e2d;
export const STATUS_URL = "https://status.nexus-emb.de";
export const SUPPORT_URL = "https://discord.gg/CjG2HFGw95";

export type HelpAreaId = "always" | "rocket-league" | "community" | "support" | "moderation" | "content" | "general";

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

/** Wer darf: alle, das Team (Moderation, Support) oder wer den Server verwaltet. */
export type HelpWho = "alle" | "team" | "verwalter";

export const WHO_LABELS: Record<HelpWho, string> = { alle: "alle", team: "Team", verwalter: "Verwalter" };

/** Ein Befehl oder Unterbefehl, ganz erklärt (Befehlsseite A). */
export interface IHelpText {
    emoji: string;
    area: HelpAreaId;
    /** Abschnitt im Dashboard (/guild/<id>/<module>), null ohne eigene Seite. */
    module: string | null;
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
    area: HelpAreaId;
    module: string | null;
    what: string;
    tip?: string;
    subs: Record<string, IHelpText>;
}

/** Schlüssel: der Befehlsname, wie er registriert ist (auch „Hack melden“). */
export type HelpCatalog = Record<string, IHelpText | IHelpGroupText>;

export function IsGroupText(text: IHelpText | IHelpGroupText): text is IHelpGroupText {
    return "subs" in text;
}
