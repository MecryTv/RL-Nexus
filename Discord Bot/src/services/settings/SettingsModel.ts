import { ChannelType, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { ModuleId } from "../../constants/Modules";
import { MAX_BAN, MAX_STAGES, MAX_TIMEOUT, MIN_DURATION, ParseDuration } from "../../constants/Moderation";
import { IModStage } from "../../interfaces/services/moderation/IModeration";
import { Cut } from "../../utils/cut";

/**
 * Das Einstellungs-Panel (/einstellungen, W-0014 Teil 3): Je Modul ein Register
 * aus Abschnitten und Feldern. Ein Feld weiß, wie es seinen Wert liest, wie es
 * ihn als Teil-Änderung schreibt - gespeichert wird über den Weg des Moduls,
 * dessen Clean den Rest unverändert lässt. Siehe docs/Settings.md.
 */

/** Was der Nutzer falsch eingegeben hat - die Antwort zeigt den Satz. */
export class PanelError extends Error {}

export type FieldKind = "toggle" | "channel" | "channels" | "role" | "roles" | "choice" | "number" | "text" | "stages";

/** Die Module im Panel - dieselben IDs wie in den Server-Einstellungen. Gallery fehlt: nichts einzustellen, ausschalten geht nicht. */
export type PanelModuleId =
    | "levels"
    | "backups"
    | "rl-6mans"
    | "lft"
    | "teams"
    | "rank-roles"
    | "clips"
    | "matchups"
    | "moderation"
    | "automod"
    | "anti-villain"
    | "logging"
    | "welcome"
    | "apply"
    | "voice-hub"
    | "reaction-roles"
    | "role-lists"
    | "giveaways"
    | "polls"
    | "tickets"
    | "twitch-notifier"
    | "youtube-notifier"
    | "custom-message";

/** So viele Kacheln fasst ein Bild in einem Abschnitt (vier Zeilen zu drei) - mehr schneidet der Zeichner ab. */
export const MAX_SECTION_FIELDS = 12;

export interface IPanelField<S> {
    /** Eindeutig im Modul, ohne Doppelpunkt - er steckt in den IDs. */
    key: string;
    label: string;
    /** Ein Satz, was die Einstellung bewirkt. */
    hint: string;
    kind: FieldKind;
    /** channel/channels: welche Arten zur Wahl stehen. */
    channelTypes?: ChannelType[];
    /** number: Grenzen; channels/roles: höchstens so viele. */
    min?: number;
    max?: number;
    /** number: hinter der Zahl, etwa „Std.“. */
    unit?: string;
    /** choice: [Wert, Anzeige]. */
    choices?: [string, string][];
    get(settings: S): unknown;
    /** Die Teil-Änderung für das Speichern - verschachtelte Teile vollständig aus settings. */
    set(value: unknown, settings: S): Record<string, unknown>;
}

export interface IPanelSection<S> {
    title: string;
    fields: IPanelField<S>[];
}

export interface IPanelModule<S> {
    id: PanelModuleId;
    /** Das Modul in den Server-Einstellungen (an/aus). */
    module: ModuleId;
    name: string;
    emoji: string;
    color: `#${string}`;
    /** Gehört fest dazu, kein Knopf zum Ausschalten. */
    permanent: boolean;
    sections: IPanelSection<S>[];
    /** Was nur im Dashboard geht - steht klein unter dem Bild. */
    dashOnly: string[];
    /** Module ohne eigene Einstellungen (A1): ein Satz, warum, statt der Kacheln. */
    about?: string;
    load(client: BotClient, guild: Guild): Promise<S>;
    /** Speichert über den Weg des Moduls. Gibt einen Hinweis zurück, wenn etwas so noch nicht greift. */
    save(client: BotClient, guild: Guild, patch: Record<string, unknown>): Promise<string | null>;
}

/* ----------------------------------------------------------
   IDs: set:<schritt>[:<modul>[:<feld>[:<zusatz>]]]
   ---------------------------------------------------------- */
/** s Übersicht, m Modul, w was ändern, c Kanal, r Rollen, t an/aus, o Auswahl, f Fenster, n keiner, b zurück, u rückgängig, p Panel senden, x Modul an/aus. */
export type PanelStep = "s" | "m" | "w" | "c" | "r" | "t" | "o" | "f" | "n" | "b" | "u" | "p" | "x";

const STEPS = new Set<string>(["s", "m", "w", "c", "r", "t", "o", "f", "n", "b", "u", "p", "x"]);

export function PanelId(step: PanelStep, module?: string, key?: string, extra?: string): string {
    // Nur hinten kürzen: Eine Lücke in der Mitte bleibt leer stehen, sonst rutscht extra an die Stelle von key (W-0014, „Modul an“).
    const parts = ["set", step, module, key, extra];

    while (parts.at(-1) === undefined) parts.pop();

    return parts.map((part) => part ?? "").join(":");
}

export function ReadPanelId(id: string): { step: PanelStep; module: string | null; key: string | null; extra: string | null } | null {
    const [prefix, step, module, key, extra, ...rest] = id.split(":");

    if (prefix !== "set" || !STEPS.has(step) || rest.length) return null;

    return { step: step as PanelStep, module: module ?? null, key: key ?? null, extra: extra ?? null };
}

/* ----------------------------------------------------------
   Stufen der Moderation als Text: eine Zeile je Stufe
   ---------------------------------------------------------- */
/** "3 timeout 1h", "5 kick", "7 ban 7d", "9 ban" (dauerhaft). */
export function ParseStages(text: string): IModStage[] {
    const lines = text.split("\n").map((line) => line.trim());
    const stages: IModStage[] = [];

    lines.forEach((line, index) => {
        if (!line) return;

        const fail = (why: string): never => {
            throw new PanelError(`Zeile ${index + 1}: ${why} Beispiel: „3 timeout 1h“, „5 kick“ oder „7 ban 7d“.`);
        };
        const [count, action, ...rest] = line.toLowerCase().split(/\s+/);
        const warns = Number(count);
        const kind = action === "bann" ? "ban" : action;
        const duration = rest.length ? ParseDuration(rest.join(" ")) : null;

        if (!Number.isInteger(warns) || warns < 1 || warns > 50) fail("Vorne steht die Zahl der Verwarnungen, 1 bis 50.");
        if (kind !== "timeout" && kind !== "kick" && kind !== "ban") fail("Danach timeout, kick oder ban.");
        if (rest.length && duration === null) fail(`„${rest.join(" ")}“ verstehe ich nicht als Dauer.`);
        if (kind === "timeout" && (duration === null || duration < MIN_DURATION || duration > MAX_TIMEOUT)) fail("Ein Timeout braucht eine Dauer von 1 Minute bis 28 Tage.");
        if (kind === "kick" && duration !== null) fail("Ein Kick hat keine Dauer.");
        if (kind === "ban" && duration !== null && (duration < MIN_DURATION || duration > MAX_BAN)) fail("Ein Bann dauert höchstens ein Jahr.");
        if (stages.some((stage) => stage.warns === warns)) fail(`Für ${warns} Verwarnungen gibt es schon eine Stufe.`);

        stages.push({ warns, action: kind as IModStage["action"], duration });
    });

    if (stages.length > MAX_STAGES) throw new PanelError(`Höchstens ${MAX_STAGES} Stufen.`);

    return stages.sort((a, b) => a.warns - b.warns);
}

/** 3600 -> "1h", 604800 -> "7d" - so, dass ParseDuration es wieder liest. */
function Compact(seconds: number): string {
    if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
    if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
    if (seconds % 60 === 0) return `${seconds / 60}m`;

    return `${seconds}s`;
}

export function StagesText(stages: IModStage[]): string {
    return stages.map((stage) => `${stage.warns} ${stage.action}${stage.duration ? ` ${Compact(stage.duration)}` : ""}`).join("\n");
}

/* ----------------------------------------------------------
   Anzeige eines Werts - im Bild und im Menü
   ---------------------------------------------------------- */
function Many(names: string[]): string {
    if (!names.length) return "–";

    return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}

export function ShowValue(field: Pick<IPanelField<unknown>, "kind" | "choices" | "unit">, value: unknown, guild: Guild): string {
    const channel = (id: unknown) => {
        const found = typeof id === "string" ? guild.channels.cache.get(id) : null;

        return found ? `#${found.name}` : "gelöscht";
    };
    const role = (id: unknown) => {
        const found = typeof id === "string" ? guild.roles.cache.get(id) : null;

        return found ? `@${found.name}` : "gelöscht";
    };
    const list = (value: unknown) => (Array.isArray(value) ? value : []);

    switch (field.kind) {
        case "toggle":
            return value ? "an" : "aus";
        case "channel":
            return value ? channel(value) : "–";
        case "role":
            return value ? role(value) : "–";
        case "channels":
            return Many(list(value).map(channel));
        case "roles":
            return Many(list(value).map(role));
        case "choice":
            return field.choices?.find(([key]) => key === value)?.[1] ?? String(value ?? "–");
        case "number":
            return `${Number(value ?? 0)}${field.unit ? ` ${field.unit}` : ""}`;
        case "text": {
            const text = typeof value === "string" ? value.trim() : "";

            return text ? Cut(text, 40) : "–";
        }
        case "stages": {
            const stages = Array.isArray(value) ? (value as IModStage[]) : [];

            return stages.length ? StagesText(stages).split("\n").join(" · ") : "keine";
        }
    }
}
