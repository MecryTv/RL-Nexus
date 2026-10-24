import path from "path";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { ChatInputCommandInteraction, Interaction } from "discord.js";
import BotClient from "./client/BotClient";
import IGuardian from "./interfaces/services/guardian/IGuardian";
import ComponentV2Builder from "./builder/ComponentV2Builder";
import logger from "./utils/logger";

/**
 * So lange gilt ein Fehler als derselbe. Ein Fehler, der im Sekundentakt
 * auftritt, soll nicht im Sekundentakt als DM ankommen - sonst schaltet der
 * Erste, der ihn liest, die Nachrichten ab.
 */
const REPEAT_WINDOW = 10 * 60 * 1000;

/** So viel vom Stack passt in eine Nachricht, ohne sie zu sprengen. */
const STACK_LIMIT = 1200;

/** Woher ein Bericht kommt: Bot, Bot-Dashboard im Browser oder eine Meldung über „Fehler melden“. */
export type ErrorKind = "bot" | "dashboard" | "report";

/** A–Z und 2–9 ohne I und O: nichts, was man beim Abtippen mit 1 oder 0 verwechselt. */
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Die Fehler-ID: `NEXUS-<Unix-Sekunden>-<6 Zeichen>`, etwa NEXUS-1792841102-M2XD7K. */
export function NewErrorId(now = new Date()): string {
    const random = Array.from({ length: 6 }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join("");

    return `NEXUS-${Math.floor(now.getTime() / 1000)}-${random}`;
}

/**
 * Woran derselbe Fehler zu erkennen ist: Art, Stelle und Meldung ohne Zahlen,
 * damit „Unknown Channel 1059…39“ und „… 1059…40“ einer sind. Die Stelle steht
 * vor der Meldung, damit eine lange Meldung sie beim Kürzen nicht verdrängt.
 */
export function ErrorSignature(kind: ErrorKind, message: string, where: string): string {
    const text = message.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

    return `${kind}|${where}|${text}`.slice(0, 255);
}

/** Eine Stelle im eigenen Code: Datei ab `src/`, Zeile, Funktion. */
export interface IWhere {
    file: string;
    line: number;
    fn: string | null;
}

/**
 * Wo es passiert ist: der erste Rahmen im eigenen Code, nicht in
 * `node_modules`, nicht in Node selbst und nicht im Guardian. Der Bot läuft
 * mit Source Maps (`--enable-source-maps`), die Pfade zeigen also auf `src/`.
 */
export function WhereOf(stack: string): IWhere | null {
    for (const raw of stack.split("\n").slice(1)) {
        const frame = raw.trim().match(/^at (?:async )?(?:(.+?) \()?(?:file:\/\/)?(.+?):(\d+):\d+\)?$/);

        if (!frame) continue;

        const [, name, file] = frame;

        if (file.includes("node_modules") || file.startsWith("node:") || /[\\/]Guardian\.[jt]s$/.test(file)) continue;

        const own = file.replace(/\\/g, "/");
        const at = own.lastIndexOf("/src/");
        const fn = name ? (name.replace(/^new /, "").split(".").pop() ?? null) : null;

        return { file: at === -1 ? own : own.slice(at + 1), line: Number(frame[3]), fn: fn === "<anonymous>" ? null : fn };
    }

    return null;
}

/** Drei Zeilen um die Stelle, die Fehlerzeile mit ›. */
function Lines(source: string, line: number): string | null {
    const all = source.split(/\r?\n/);

    if (line < 1 || line > all.length) return null;

    const width = String(Math.min(line + 1, all.length)).length;

    return all
        .slice(Math.max(line - 2, 0), Math.min(line + 1, all.length))
        .map((text, index) => {
            const number = Math.max(line - 1, 1) + index;

            return `${String(number).padStart(width)} ${number === line ? "›" : " "} ${text.trimEnd().slice(0, 120)}`;
        })
        .join("\n");
}

/**
 * Der Ausschnitt aus der Quelle. Im Image liegt `src/` nicht: Dann kommen die
 * Zeilen aus den eingebetteten Quellen der Karte unter `dist/` (tsc mit
 * `inlineSources`). Lokal mit tsx steht die Datei selbst da.
 */
export function Excerpt(file: string, line: number, root = process.cwd()): string | null {
    if (file.startsWith("src/")) {
        try {
            const map = JSON.parse(readFileSync(path.join(root, "dist", `${file.slice(4).replace(/\.ts$/, "")}.js.map`), "utf8")) as { sourcesContent?: (string | null)[] };
            const source = map.sourcesContent?.[0];

            if (source) return Lines(source, line);
        } catch {
            // Keine Karte: dann die Datei selbst.
        }
    }

    try {
        return Lines(readFileSync(path.join(root, file), "utf8"), line);
    } catch {
        return null;
    }
}

export default class Guardian implements IGuardian {
    client: BotClient;

    /** Gesehene Fehler: Signatur zu Zeitpunkt und wie oft seitdem. */
    private readonly seen = new Map<string, { at: number; count: number }>();

    constructor(client: BotClient) {
        this.client = client;
    }

    Initialize(): void {
        this._initializeGlobalHandlers();
        logger.guardian("info", "✅  Guardian is operational");
    }

    private _initializeGlobalHandlers(): void {
        process.on("unhandledRejection", (reason) => {
            logger.guardian("error", "Unhandled Rejection erfasst:", reason);

            const error =
                reason instanceof Error
                    ? reason
                    : new Error(String(reason ?? "Unbekannter Promise Rejection Grund"));

            this.ReportError(error, null, "Unhandled Rejection").catch(() => {});
        });

        process.on("uncaughtException", (err, origin) => {
            logger.guardian("error", `Uncaught Exception erfasst: ${err}`, `Origin: ${origin}`);

            this.ReportError(err, null, "Uncaught Exception")
                .catch(() => {})
                .finally(() => process.exit(1));
        });
    }

    private _clamp(value: string | undefined, max: number): string {
        const text = value?.trim();
        if (!text) return "N/A";
        return text.length > max ? `${text.substring(0, max)}…` : text;
    }

    private async _sendUserReply(interaction: Interaction, errorId: string): Promise<void> {
        if (!interaction.isRepliable()) return;

        try {
            const replyMSG = new ComponentV2Builder({ accentColor: "Red" })
                .title("🛠️ | Oops, da ist etwas schiefgelaufen")
                .separator()
                .text(`Ein unerwarteter Fehler ist aufgetreten.\n**Fehler ID:** \`${errorId}\``)
                .subtext("Melde dich beim Team und gib die Fehler ID an, damit dir schnell geholfen wird.")
                .toMessage({ ephemeral: true });

            if (interaction.replied || interaction.deferred) await interaction.followUp(replyMSG);
            else await interaction.reply(replyMSG);
        } catch (error) {
            logger.guardian("error", `Fehler beim Senden der Antwort an den Benutzer: ${error}`);
        }
    }

    private _parseStackForLocation(error: Error) {
        if (!error.stack) return null;

        const stackLines = error.stack.split("\n").slice(1);
        const relevantLine = stackLines.find((line) => !line.includes("Guardian."));

        if (!relevantLine) return null;

        const locationMatch = relevantLine.match(/\((.*?)\)/);

        if (!locationMatch || !locationMatch[1]) return null;

        const fullPath = locationMatch[1];
        const parts = fullPath.split(":");
        const line = parts[parts.length - 2] || "N/A";
        const filePath = parts.slice(0, parts.length - 2).join(":") || "N/A";
        const fileName = path.basename(filePath) || "N/A";

        return { fileName, filePath, line };
    }

    GenErrorID(): string {
        return NewErrorId();
    }

    async ReportError(error: Error, interaction: Interaction | null, type = "Unknown Error"): Promise<void> {
        const errorCode = (error as Error & { code?: number | string }).code;
        const normalizedCode = typeof errorCode === "string" ? Number(errorCode) : errorCode;

        if (typeof normalizedCode === "number" && [10062, 10008, 40060].includes(normalizedCode)) {
            return logger.guardian(
                "warn",
                `Ignored expired/already-acknowledged interaction [${errorCode}] in ${type} (Nutzer war vermutlich zu langsam oder hat doppelt geklickt).`
            );
        }

        const errorId = this.GenErrorID();

        logger.guardian("error", `Fehler gefunden [ID: ${errorId}] | Type: ${type}:`, error);

        const location = this._parseStackForLocation(error);
        if (location) {
            logger.guardian(
                "error",
                `📍 Error location: ${location.fileName} (line: ${location.line}) | Path: ${location.filePath}`
            );
        }

        // Konsole und Logdatei haben ihn schon; die Entwickler bekommen ihn
        // zusaetzlich als DM. Faellt das aus, darf es den Fehlerbericht nicht
        // mitreissen - sonst verschwindet der eigentliche Fehler.
        await this._dmDevelopers(error, interaction, type, errorId, location).catch((problem) =>
            logger.guardian("warn", `Fehlerbericht ging nicht an die Entwickler: ${String(problem)}`)
        );

        if (interaction) await this._sendUserReply(interaction, errorId);
    }

    /* ------------------------------------------------------------------
       Der Weg zu den Entwicklern
       ------------------------------------------------------------------ */
    /**
     * Wie oft dieser Fehler gerade auftritt. Beim ersten Mal 0, danach zaehlt
     * er hoch und die DM bleibt aus, bis das Fenster um ist - dann steht in der
     * naechsten Nachricht, wie oft er zwischendurch kam.
     */
    private _repeats(signature: string): number | null {
        const now = Date.now();
        const hit = this.seen.get(signature);

        // Aufraeumen, damit die Karte nicht mit der Laufzeit waechst.
        if (this.seen.size > 200) {
            for (const [key, entry] of this.seen) {
                if (now - entry.at > REPEAT_WINDOW) this.seen.delete(key);
            }
        }

        if (!hit || now - hit.at > REPEAT_WINDOW) {
            this.seen.set(signature, { at: now, count: 0 });

            return hit && now - hit.at > REPEAT_WINDOW ? hit.count : 0;
        }

        hit.count++;

        return null;
    }

    /** Woher der Fehler kam - so viel, wie ohne Raten zu holen ist. */
    private _context(interaction: Interaction | null): string[] {
        if (!interaction) return [];

        const lines: string[] = [];
        const guild = interaction.guild;

        lines.push(`**Nutzer** ${interaction.user.tag} \`${interaction.user.id}\``);

        if (guild) lines.push(`**Server** ${guild.name} \`${guild.id}\``);
        if (interaction.channelId) lines.push(`**Kanal** <#${interaction.channelId}>`);

        if (interaction.isChatInputCommand()) {
            const command = interaction as ChatInputCommandInteraction;
            const sub = command.options.getSubcommand(false);

            lines.push(`**Befehl** \`/${command.commandName}${sub ? ` ${sub}` : ""}\``);
        } else if ("customId" in interaction && typeof interaction.customId === "string") {
            lines.push(`**Custom-ID** \`${interaction.customId}\``);
        }

        return lines;
    }

    private async _dmDevelopers(
        error: Error,
        interaction: Interaction | null,
        type: string,
        errorId: string,
        location: { fileName: string; line: string; filePath: string } | null
    ): Promise<void> {
        const ids = this.client.config.DEV_USER_IDs;

        if (!ids.length || !this.client.isReady()) return;

        const where = location ? `${location.fileName}:${location.line}` : "unbekannt";
        const missed = this._repeats(`${type}|${error.message}|${where}`);

        // null heisst: derselbe Fehler kam eben erst raus.
        if (missed === null) return;

        const stack = this._clamp(error.stack ?? error.message, STACK_LIMIT);
        const card = new ComponentV2Builder({ accentColor: "#ff1e2d" })
            .title("🛠️ Fehler im Bot", `ID \`${errorId}\` · ${this.client.developerMode ? "Entwicklung" : "Produktion"}`)
            .separator()
            .text(
                [
                    `**Was** ${this._clamp(`${error.name}: ${error.message}`, 400)}`,
                    `**Typ** ${this._clamp(type, 120)}`,
                    `**Wo** \`${where}\``,
                    `**Wann** <t:${Math.floor(Date.now() / 1000)}:f>`,
                    ...this._context(interaction),
                ].join("\n")
            )
            .separator()
            .text(`\`\`\`js\n${stack}\n\`\`\``);

        if (missed > 0) card.subtext(`Derselbe Fehler kam in den letzten ${Math.round(REPEAT_WINDOW / 60_000)} Minuten noch ${missed}-mal.`);

        // toMessage() setzt die V2-Flagge schon - mehr braucht eine DM nicht.
        const message = card.toMessage();

        for (const id of ids) {
            const user = await this.client.users.fetch(id).catch(() => null);

            if (!user) {
                logger.guardian("warn", `Entwickler ${id} nicht gefunden - keine DM.`);

                continue;
            }

            await user
                .send(message)
                .catch(() => logger.guardian("warn", `DM an ${user.tag} ging nicht raus - Direktnachrichten zu?`));
        }
    }

    async HandleCommand(
        errorMSG: string,
        interaction: Interaction | null,
        type = "Command Logic Error"
    ): Promise<void> {
        await this.ReportError(new Error(errorMSG), interaction, type);
    }

    async HandleEvent(errorMSG: string, context: { eventName?: string }): Promise<void> {
        const type = context?.eventName ? `Event Logic Error: ${context.eventName}` : "Event Logic Error";
        await this.ReportError(new Error(errorMSG), null, type);
    }

    async HandleGeneric(errorMSG: string, type = "Generic Error", stackTrace: string | null = null): Promise<void> {
        const error = new Error(errorMSG);
        if (stackTrace) error.stack = stackTrace;
        await this.ReportError(error, null, type);
    }

    async HandleRLAPI(errorMSG: string, context: { endpoint?: string }): Promise<void> {
        const error = new Error(errorMSG);
        const type = context?.endpoint ? `RLAPI Error: ${context.endpoint}` : "RLAPI Error";
        await this.ReportError(error, null, type);
    }

    async HandleRunnable(errorMSG: string, context: { taskName?: string; stack?: string }): Promise<void> {
        const error = new Error(errorMSG);
        if (context?.stack) error.stack = context.stack;
        const type = context?.taskName ? `Runnable Error: ${context.taskName}` : "Runnable Error";
        await this.ReportError(error, null, type);
    }

    async HandleServer(errorMSG: string, context: { route?: string; stack?: string }): Promise<void> {
        const error = new Error(errorMSG);
        if (context?.stack) error.stack = context.stack;
        const type = context?.route ? `Server Error: ${context.route}` : "Server Error";
        await this.ReportError(error, null, type);
    }
}
