import path from "path";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, Interaction, MessageFlags } from "discord.js";
import BotClient from "./client/BotClient";
import IGuardian from "./interfaces/services/guardian/IGuardian";
import ComponentV2Builder from "./builder/ComponentV2Builder";
import { NewPanelState, PanelStates, RenderPanel } from "./builder/DevLogsPanel";
import { IErrorDm, ParseDms } from "./models/ErrorReports";
import logger from "./utils/logger";

/**
 * So lange gilt ein Fehler als derselbe. Ein Fehler, der im Sekundentakt
 * auftritt, soll nicht im Sekundentakt als DM ankommen - sonst schaltet der
 * Erste, der ihn liest, die Nachrichten ab.
 */
const REPEAT_WINDOW = 10 * 60 * 1000;

/** So viel vom Stack passt in eine Nachricht, ohne sie zu sprengen. */
const STACK_LIMIT = 1200;

/** Die Karten des Dashboards: außerhalb von public/, damit niemand die Quellen abrufen kann (BuildDashboard.ts). */
const DASHBOARD_MAPS = path.join(process.cwd(), "src", "dashboard", "maps");

/** Geladene Karten je Datei, null: gibt es nicht. Klein gehalten, nach einem Deploy kommen neue Namen. */
const MAPS = new Map<string, { map: SourceMap; contents: Map<string, string> } | null>();

/** „../../client/pages/Guild.ts“ aus der Karte wird „src/dashboard/client/pages/Guild.ts“. */
function DashboardSource(source: string): string {
    const clean = source.replace(/^file:\/\//, "").replace(/\\/g, "/");
    const at = clean.lastIndexOf("client/");

    return at === -1 ? clean.replace(/^(\.\.\/)+/, "") : `src/dashboard/${clean.slice(at)}`;
}

function LoadMap(file: string, dir: string): { map: SourceMap; contents: Map<string, string> } | null {
    const key = `${dir}|${file}`;

    if (MAPS.has(key)) return MAPS.get(key) ?? null;
    if (MAPS.size > 100) MAPS.clear();

    let loaded: { map: SourceMap; contents: Map<string, string> } | null = null;

    // Nur Namen aus dem Build: Buchstaben, Ziffern, Punkt, Bindestrich und ein Unterordner.
    if (/^[\w-]+(?:\/[\w.-]+)?\.js$/.test(file)) {
        try {
            const payload = JSON.parse(readFileSync(path.join(dir, `${file}.map`), "utf8")) as { sources: string[]; sourcesContent?: (string | null)[] };
            const contents = new Map(payload.sources.map((source, index) => [DashboardSource(source), payload.sourcesContent?.[index] ?? ""] as const));

            loaded = { map: new SourceMap(payload as never), contents };
        } catch {
            loaded = null;
        }
    }

    MAPS.set(key, loaded);

    return loaded;
}

export interface ITranslated {
    /** Der Stack mit Quelle und Zeile, wo eine Karte half, sonst wie er kam. */
    stack: string;
    where: IWhere | null;
    excerpt: string | null;
    /** Zum ersten Rahmen fehlt die Karte: ein alter Tab nach einem Deploy. */
    missing: boolean;
}

/**
 * Übersetzt einen Stack aus dem Browser mit den Karten des Builds zurück auf
 * die Dateien unter `src/dashboard/client`. Fehlt eine Karte, bleibt der
 * Rahmen, wie er kam. Wirft nie.
 */
export function Translate(stack: string, dir = DASHBOARD_MAPS): ITranslated {
    let where: IWhere | null = null;
    let excerpt: string | null = null;
    let missing = false;
    let first = true;

    const lines = stack.split("\n").map((line, index) => {
        const frame = index === 0 ? null : line.match(/^(.*?)(?:https?:\/\/[^\s)]*?)?\/assets\/([\w./-]+?\.js):(\d+):(\d+)(\)?)\s*$/);

        if (!frame) return line;

        const [, before, file, row, column, close] = frame;
        const loaded = LoadMap(file, dir);

        if (first) {
            first = false;
            missing = loaded === null;
        }

        if (!loaded) return line;

        try {
            const entry = loaded.map.findEntry(Number(row) - 1, Number(column) - 1) as { originalSource?: string; originalLine?: number; originalColumn?: number; name?: string };

            if (entry.originalSource === undefined || entry.originalLine === undefined) return line;

            const source = DashboardSource(entry.originalSource);
            const original = entry.originalLine + 1;

            if (!where) {
                where = { file: source, line: original, fn: entry.name ?? null };

                const content = loaded.contents.get(source);

                excerpt = content ? Lines(content, original) : null;
            }

            return `${before}${source}:${original}:${(entry.originalColumn ?? 0) + 1}${close}`;
        } catch {
            return line;
        }
    });

    return { stack: lines.join("\n"), where, excerpt, missing };
}

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

/** Was eine DM an die Devs trägt. Die drei Arten unterscheiden sich nur in Titel und Feldern. */
export interface IErrorInfo {
    id: string;
    kind: ErrorKind;
    /** „🛠️ Fehler im Bot“, „🌐 Fehler im Dashboard“ oder bei Meldungen „📮 <Betreff>“. */
    title: string;
    /** Für die Signatur: die Meldung, ohne Nutzer und Zeit. */
    message: string;
    /** „src/…ts:118 in Rename“, für die Signatur und „Wo“. */
    where: string;
    /** Je Zeile „**Label** Wert“. */
    fields: [string, string][];
    excerpt: string | null;
    /** Die letzten Schritte im Dashboard, schon als Text. */
    steps?: string[];
    /** Klein unter dem Ausschnitt, etwa „Stack: 6 Zeilen · Version … · Sitzung #67“. */
    footer?: string;
    /** Ganz unten klein, etwa „Auch per Mail an support@nexus-emb.de“. */
    note?: string;
}

export interface ICardOptions {
    /** Erledigt und DevLogs gehen nur mit Datenbank. */
    buttons: boolean;
    /** Wie oft derselbe Fehler seit der letzten DM kam. */
    repeats: number;
    reopened: { by: string; at: Date } | null;
    production: boolean;
}

/** Anfang der Custom-IDs: guardian:done:<ID> und guardian:logs:<ID>. */
export const GUARDIAN_PREFIX = "guardian";

const DAY = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const CLOCK = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

/** Die DM an die Devs, nach dem Entwurf vom 24.10. */
export function ErrorCard(info: IErrorInfo, options: ICardOptions) {
    const card = new ComponentV2Builder({ accentColor: info.kind === "report" ? "#00afff" : "#ff1e2d" }).title(info.title, `ID \`${info.id}\` · ${options.production ? "Produktion" : "Entwicklung"}`);

    if (options.reopened) card.subtext(`Kam wieder, nachdem ${options.reopened.by} ihn am ${DAY.format(options.reopened.at)} als erledigt markiert hat.`);

    card.separator().text(info.fields.map(([label, value]) => `**${label}** ${value}`).join("\n"));

    if (info.excerpt) card.text(`\`\`\`ts\n${info.excerpt}\n\`\`\``);
    if (info.steps?.length) card.separator().text(`**Letzte Schritte**\n${info.steps.map((step) => `-# ${step}`).join("\n")}`);
    if (info.footer) card.subtext(info.footer);
    if (options.repeats > 0) card.subtext(`Derselbe Fehler kam in den letzten ${Math.round(REPEAT_WINDOW / 60_000)} Minuten noch ${options.repeats}-mal.`);
    if (info.note) card.subtext(info.note);

    if (options.buttons) {
        card.buttons(
            { customId: `${GUARDIAN_PREFIX}:logs:${info.id}`, label: "In DevLogs öffnen", tone: "secondary" },
            { customId: `${GUARDIAN_PREFIX}:done:${info.id}`, label: "Erledigt", tone: "success" }
        );
    }

    return card.toMessage();
}

/**
 * Eine DM als erledigt: ✅ im Titel, wer und wann darunter, keine Knöpfe mehr.
 * Arbeitet auf dem JSON der Nachricht, damit der Inhalt bleibt, wie er kam.
 */
export function DoneJson(container: unknown, by: string, at: Date): Record<string, unknown> {
    const copy = structuredClone(container) as Record<string, unknown> & { components?: Record<string, unknown>[] };
    const parts = (copy.components ?? []).filter((part) => part.type !== ComponentType.ActionRow);
    const head = parts.find((part) => part.type === ComponentType.TextDisplay);

    if (head && typeof head.content === "string") head.content = head.content.replace(/^# (?:[^\p{L}\p{N}\s]\S* )?(.*)$/mu, "# ✅ Erledigt · $1");

    parts.push({ type: ComponentType.TextDisplay, content: `-# Erledigt von ${by} um ${CLOCK.format(at)} Uhr. Kommt der Fehler wieder, gibt es eine neue DM.` });

    return { ...copy, accent_color: 0x3ddc97, components: parts };
}

/** Eine kurze Antwort nur für den, der geklickt hat. */
function Notice(title: string, text: string) {
    return new ComponentV2Builder({ accentColor: "Red" }).title(title).separator().text(text).toMessage({ ephemeral: true });
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

    GenErrorID(): string {
        return NewErrorId();
    }

    /** Ein Fehler im Bot: loggen, an die Devs, und wer ihn ausgelöst hat, bekommt die ID. Wartet auf die DMs. */
    async ReportError(error: Error, interaction: Interaction | null, type = "Unknown Error"): Promise<string | null> {
        const report = this._fromError(error, interaction, type);

        if (!report) return null;

        await report.sent;

        if (interaction) await this._sendUserReply(interaction, report.id);

        return report.id;
    }

    /** Baut den Bericht und stellt ihn zu. null: kein Fehler im Code (abgelaufene Interaktion). */
    private _fromError(error: Error, interaction: Interaction | null, type: string): { id: string; sent: Promise<void> } | null {
        const errorCode = (error as Error & { code?: number | string }).code;
        const normalizedCode = typeof errorCode === "string" ? Number(errorCode) : errorCode;

        if (typeof normalizedCode === "number" && [10062, 10008, 40060].includes(normalizedCode)) {
            logger.guardian(
                "warn",
                `Ignored expired/already-acknowledged interaction [${errorCode}] in ${type} (Nutzer war vermutlich zu langsam oder hat doppelt geklickt).`
            );

            return null;
        }

        const errorId = NewErrorId();
        const stack = error.stack ?? "";
        const where = WhereOf(stack);
        const whereText = where ? `${where.file}:${where.line}${where.fn ? ` in ${where.fn}` : ""}` : "unbekannt";

        logger.guardian("error", `Fehler gefunden [ID: ${errorId}] | Type: ${type}:`, error);

        if (where) logger.guardian("error", `📍 Fehlerstelle: ${whereText}`);

        return this.Report({
            id: errorId,
            kind: "bot",
            title: "🛠️ Fehler im Bot",
            message: `${type}: ${error.message}`,
            where: whereText,
            fields: [
                ["Was", this._clamp(`${error.name}: ${error.message}`, 400)],
                ["Typ", this._clamp(type, 120)],
                ["Wo", `\`${whereText}\``],
                ["Wann", `<t:${Math.floor(Date.now() / 1000)}:f>`],
                ...this._context(interaction),
            ],
            excerpt: where ? Excerpt(where.file, where.line) : null,
            footer: `Stack: ${Math.max(stack.split("\n").length - 1, 0)} Zeilen · Version ${logger.getGitCommit() ?? "unbekannt"} · Sitzung #${logger.getCurrentSessionNumber()}`,
        });
    }

    /* ------------------------------------------------------------------
       Der Weg zu den Entwicklern
       ------------------------------------------------------------------ */
    /**
     * Speichert den Bericht und schickt die DM. Die ID steht sofort fest, die
     * DMs laufen im Hintergrund (`sent`). Fällt dabei etwas aus, darf es den
     * eigentlichen Fehler nicht mitreißen.
     */
    Report(info: IErrorInfo): { id: string; sent: Promise<void> } {
        const signature = ErrorSignature(info.kind, info.message, info.where);
        const stored = this._store(info, signature);
        const sent = this._deliver(info, signature, stored).catch((problem: unknown) => logger.guardian("warn", `Fehlerbericht ging nicht an die Entwickler: ${String(problem)}`));

        return { id: info.id, sent };
    }

    /** Je Auftreten eine Zeile. false: ohne Datenbank, dann gibt es auch keine Knöpfe. */
    private async _store(info: IErrorInfo, signature: string): Promise<boolean> {
        if (!this.client.databaseService.Ready) return false;

        try {
            await this.client.errorReports.Add({ id: info.id, kind: info.kind, signature, session: logger.getCurrentSessionNumber() || null });

            return true;
        } catch (problem) {
            logger.guardian("warn", `Fehlerbericht ${info.id} nicht gespeichert: ${String(problem)}`);

            return false;
        }
    }

    private async _deliver(info: IErrorInfo, signature: string, stored: Promise<boolean>): Promise<void> {
        const ids = this.client.config.DEV_USER_IDs;
        const saved = await stored;

        if (!ids.length || !this.client.isReady()) return;

        // Meldungen von Nutzern werden nie zusammengefasst.
        const repeats = info.kind === "report" ? 0 : this._repeats(signature);

        // null heisst: derselbe Fehler kam eben erst raus.
        if (repeats === null) return;

        const reopened = saved ? await this.client.errorReports.LastDone(signature).catch(() => null) : null;
        const message = ErrorCard(info, { buttons: saved, repeats, reopened, production: !this.client.developerMode });
        const dms: IErrorDm[] = [];

        for (const id of ids) {
            const user = await this.client.users.fetch(id).catch(() => null);

            if (!user) {
                logger.guardian("warn", "Ein Entwickler aus DEV_USER_IDs wurde nicht gefunden - keine DM.");

                continue;
            }

            const sent = await user.send(message).catch(() => null);

            if (sent) dms.push({ userId: id, channelId: sent.channelId, messageId: sent.id });
            else logger.guardian("warn", "Eine DM an einen Entwickler ging nicht raus - Direktnachrichten zu?");
        }

        if (saved && dms.length) await this.client.errorReports.SetDms(info.id, dms).catch(() => undefined);
    }

    /** Die Knöpfe unter einer DM: Erledigt und In DevLogs öffnen. Nur für die Devs. */
    async HandleButton(interaction: ButtonInteraction): Promise<void> {
        const [, action, id] = interaction.customId.split(":");

        if (!this.client.config.DEV_USER_IDs.includes(interaction.user.id)) {
            await interaction.reply(Notice("Nur die Devs", "Diesen Knopf dürfen nur die Devs drücken."));

            return;
        }

        if (action === "done") await this._done(interaction, id);
        else if (action === "logs") await this._logs(interaction, id);
    }

    private async _done(interaction: ButtonInteraction, id: string): Promise<void> {
        const by = interaction.user.username;
        const row = await this.client.errorReports.MarkDone(id, by).catch(() => null);

        if (!row) {
            await interaction.reply(Notice("Schon erledigt", "Den Fehler hat schon jemand als erledigt markiert."));

            return;
        }

        // Alle Devs haben dieselbe Karte bekommen: einmal umbauen, überall einsetzen.
        const done = DoneJson(interaction.message.components[0].toJSON(), by, new Date());

        await interaction.update({ components: [done], flags: MessageFlags.IsComponentsV2 } as never);

        // Kommt er wieder, soll das sofort auffallen und nicht im Zehn-Minuten-Fenster verschwinden.
        this.seen.delete(row.signature);

        for (const dm of ParseDms(row.dms)) {
            if (dm.messageId === interaction.message.id) continue;

            const channel = await this.client.channels.fetch(dm.channelId).catch(() => null);

            if (channel?.isTextBased()) await channel.messages.edit(dm.messageId, { components: [done], flags: MessageFlags.IsComponentsV2 } as never).catch(() => undefined);
        }
    }

    /** Öffnet DevLogs bei der Sitzung des Fehlers und sucht nach seiner ID. */
    private async _logs(interaction: ButtonInteraction, id: string): Promise<void> {
        const row = await this.client.errorReports.Find(id).catch(() => null);
        const service = this.client.devLogsService;
        const state = NewPanelState();
        const session = row?.session ?? null;

        if (session !== null && service.Sessions().some((entry) => entry.sessionNumber === session)) {
            state.session = session;
            state.listPage = service.ListPageOf(session);
            state.view = "search";
            state.term = id;
        } else {
            state.notice = "⚠️ Diese Sitzung gibt es nicht mehr.";
        }

        const view = await RenderPanel(this.client, state);
        const response = await interaction.reply({ ...view, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, withResponse: true } as never);
        const messageId = (response as { resource?: { message?: { id: string } } } | undefined)?.resource?.message?.id;

        if (messageId) PanelStates.set(messageId, state);
    }

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
    private _context(interaction: Interaction | null): [string, string][] {
        if (!interaction) return [];

        const lines: [string, string][] = [];
        const guild = interaction.guild;

        lines.push(["Nutzer", `${interaction.user.tag} \`${interaction.user.id}\``]);

        if (guild) lines.push(["Server", `${guild.name} \`${guild.id}\``]);
        if (interaction.channelId) lines.push(["Kanal", `<#${interaction.channelId}>`]);

        if (interaction.isChatInputCommand()) {
            const command = interaction as ChatInputCommandInteraction;
            const sub = command.options.getSubcommand(false);

            lines.push(["Befehl", `\`/${command.commandName}${sub ? ` ${sub}` : ""}\``]);
        } else if ("customId" in interaction && typeof interaction.customId === "string") {
            lines.push(["Knopf", `\`${interaction.customId}\``]);
        }

        return lines;
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

    /** Ein Fehler im Server: die ID sofort, damit die Antwort sie tragen kann. Die DMs laufen im Hintergrund. */
    async HandleServer(errorMSG: string, context: { route?: string; stack?: string }): Promise<string | null> {
        const error = new Error(errorMSG);
        if (context?.stack) error.stack = context.stack;
        const type = context?.route ? `Server Error: ${context.route}` : "Server Error";

        return this._fromError(error, null, type)?.id ?? null;
    }
}
