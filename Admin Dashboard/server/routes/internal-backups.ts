import type { FastifyInstance, FastifyRequest } from "fastify";
import { AREA_IDS, AREAS, BACKUP_NOTE_MAX, BACKUP_PARTS, DEFAULT_PLAN, PLAN_EVERY, PLAN_KEEP_MAX, RESTORE_MODES, SERVER_HAND_MAX, SERVER_PART_IDS, type AreaId, type BackupPart, type RestoreMode, type ServerPartId, type IBackupDetail, type IBackupMeta, type IBackupPlan, type IPlanState, type IRestoreResult, type IServerBackups, type IServerPartJson, type PlanEvery } from "../../shared/backups.ts";
import { audit, type IActor } from "../audit.ts";
import { planState } from "../backups/plan.ts";
import { remapGuild } from "../backups/remap.ts";
import { restoreBackup } from "../backups/restore.ts";
import { backupData, backupServer, countHand, createBackup, deleteBackup, listBackups, readPlan, restoreRunning, savePlan } from "../backups/store.ts";
import { botSnapshot, verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { body, id, snowflake } from "../validate.ts";
import { needBackups, parseRestore } from "./backups.ts";

/**
 * Die Backups eines Servers für das Bot-Dashboard (Spec Backup-Modul). Nur der
 * Bot ruft hier an, im Docker-Netz als admin:3001; nginx sperrt /internal/ nach
 * außen. Er schickt ein Token mit Scope "backups" und sub "dashboard:<ID>",
 * dazu Name der Person und des Servers. Ob die Person den Server verwalten
 * darf, hat der Bot geprüft. Hier zählt nur: dieser Server, Herkunft "server".
 */

const SCOPE = "backups";
const SUBJECT = /^dashboard:(\d{17,20})$/;
const VIA = "über das Bot-Dashboard";

/**
 * Server, für die gerade ein Backup von Hand entsteht. Sonst zählen zwei Klicks
 * zugleich beide 9 von 10 und legen beide an (W-0023).
 * ponytail: Sperre im Prozess, reicht für den einen Admin-Container; bei mehreren eine Sperre in der Datenbank.
 */
const creating = new Set<string>();

function header(request: FastifyRequest, name: string): string | null {
    const raw = request.headers[name];
    if (typeof raw !== "string" || raw === "") return null;

    try {
        return decodeURIComponent(raw).slice(0, 100);
    } catch {
        return null;
    }
}

/** Wer im Bot-Dashboard klickt. Ohne gültiges Token: 401. */
function botActor(config: IConfig, request: FastifyRequest): IActor {
    const authorization = request.headers.authorization ?? "";
    const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;
    const match = payload?.scope.includes(SCOPE) ? SUBJECT.exec(payload.sub) : null;

    if (!match) throw new PublicError(401, "Nur für den Bot.");

    return { id: match[1], name: header(request, "x-actor-name") ?? match[1] };
}

function guildOf(request: FastifyRequest): string {
    return snowflake((request.params as { guildId?: string }).guildId, "Der Server");
}

function backupOf(request: FastifyRequest): number {
    return id((request.params as { backupId?: string }).backupId);
}

function whole(value: unknown, min: number, max: number): boolean {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Die Einstellung aus dem Bot-Dashboard, mit einem Satz für alles, was nicht passt. */
export function parsePlan(raw: unknown): IBackupPlan {
    const input = body(raw);

    if (typeof input.enabled !== "boolean") throw new PublicError(400, "Sag, ob automatische Backups an sein sollen.");
    if (typeof input.every !== "string" || !(PLAN_EVERY as readonly string[]).includes(input.every)) throw new PublicError(400, "Diesen Rhythmus gibt es nicht.");
    if (!whole(input.weekday, 0, 6)) throw new PublicError(400, "Der Wochentag geht von 0 (Montag) bis 6 (Sonntag).");
    if (!whole(input.hour, 0, 23)) throw new PublicError(400, "Die Uhrzeit ist eine volle Stunde von 0 bis 23.");
    if (!whole(input.keep, 1, PLAN_KEEP_MAX)) throw new PublicError(400, `Behalten geht von 1 bis ${PLAN_KEEP_MAX}.`);
    // Plan 32: Ein älteres Bot-Dashboard schickt die beiden Schalter nicht - dann gelten die Vorgaben.
    if (input.discord !== undefined && typeof input.discord !== "boolean") throw new PublicError(400, "Sag, ob der Discord-Server mitgesichert werden soll.");
    if (input.risky !== undefined && typeof input.risky !== "boolean") throw new PublicError(400, "Sag, ob vor riskanten Änderungen gesichert werden soll.");

    return {
        enabled: input.enabled,
        every: input.every as PlanEvery,
        weekday: input.weekday as number,
        hour: input.hour as number,
        keep: input.keep as number,
        discord: (input.discord as boolean | undefined) ?? DEFAULT_PLAN.discord,
        risky: (input.risky as boolean | undefined) ?? DEFAULT_PLAN.risky,
    };
}

/** Plan 32: welche Teile ein Backup bekommen soll. Ohne Angabe nur der Bot. */
function parseParts(raw: unknown): BackupPart[] {
    if (raw === undefined) return ["bot"];
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every((part) => (BACKUP_PARTS as readonly unknown[]).includes(part))) throw new PublicError(400, "Sag, was ins Backup soll: Bot, Discord-Server oder beides.");

    return BACKUP_PARTS.filter((part) => raw.includes(part));
}

/** Plan 32: was beim Laden des Discord-Servers kommen soll. */
export function parseServerRestore(raw: unknown): { confirm: string; parts: ServerPartId[]; areas: AreaId[]; mode: RestoreMode; targetGuildId: string | null } {
    const input = body(raw);
    const confirm = typeof input.confirm === "string" ? input.confirm.trim() : "";
    const list = (value: unknown, known: readonly string[]): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string" && known.includes(entry));

    if (confirm === "") throw new PublicError(400, "Tipp zum Bestätigen den Namen des Servers ein.");
    if (!list(input.parts, SERVER_PART_IDS) || input.parts.length === 0) throw new PublicError(400, "Wähl mindestens einen Teil des Discord-Servers.");
    if (input.areas !== undefined && !list(input.areas, AREA_IDS)) throw new PublicError(400, "Diesen Bereich gibt es nicht.");
    if (typeof input.mode !== "string" || !(RESTORE_MODES as readonly string[]).includes(input.mode)) throw new PublicError(400, "So lässt sich ein Backup nicht laden.");

    const mode = input.mode as RestoreMode;
    const targetGuildId = mode === "other" ? snowflake(input.targetGuildId, "Der andere Server") : null;

    return {
        confirm,
        parts: SERVER_PART_IDS.filter((part) => (input.parts as string[]).includes(part)),
        // Auf einen anderen Server kommen keine Bot-Daten (Spec).
        areas: mode === "other" ? [] : [...new Set((input.areas ?? []) as AreaId[])],
        mode,
        targetGuildId,
    };
}

/** Der Server-Teil vom Bot, wenn er gebraucht wird. Kommt er nicht, sagt der Fehler warum. */
async function serverPart(config: IConfig, guildId: string, actor: IActor, parts: readonly BackupPart[]): Promise<IServerPartJson | null> {
    if (!parts.includes("server")) return null;

    const server = await botSnapshot(config, guildId, actor.id);
    if (!server) throw new PublicError(502, "Den Discord-Server konnte der Bot gerade nicht lesen. Versuch es gleich noch einmal.");

    return server;
}

/** Der Server-Teil ohne die Bilder - sie machen ihn um ein Vielfaches größer und braucht nur das Laden. */
export function withoutImages(server: IServerPartJson): IServerPartJson {
    const strip = (list: unknown, key: string): unknown => (Array.isArray(list) ? list.map((entry: Record<string, unknown>) => ({ ...entry, [key]: null })) : list);
    const settings = server.settings as Record<string, unknown> | undefined;

    return {
        ...server,
        roles: strip(server.roles, "icon"),
        emojis: strip(server.emojis, "image"),
        stickers: strip(server.stickers, "image"),
        ...(settings ? { settings: { ...settings, icon: null, banner: null } } : {}),
    };
}

export async function internalBackupRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    // Erst das Token, dann alles andere: Wer nicht der Bot ist, erfährt nicht einmal, ob es Backups gibt.
    app.addHook("preHandler", async (request) => {
        botActor(config, request);
    });

    app.get("/internal/backups/:guildId", async (request): Promise<IServerBackups> => {
        await needBackups(config);

        const guildId = guildOf(request);

        return {
            guildId,
            plan: planState(await readPlan(guildId)),
            backups: await listBackups(guildId, "server"),
            hand: { used: await countHand(guildId, "server"), max: SERVER_HAND_MAX },
        };
    });

    app.post("/internal/backups/:guildId", async (request): Promise<IBackupMeta> => {
        const actor = botActor(config, request);
        const guildId = guildOf(request);
        const input = body(request.body);
        const raw = input.note;
        const note = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
        if (note !== null && note.length > BACKUP_NOTE_MAX) throw new PublicError(400, `Die Notiz darf höchstens ${BACKUP_NOTE_MAX} Zeichen haben.`);
        if (input.kind !== undefined && input.kind !== "hand" && input.kind !== "schutz") throw new PublicError(400, "Diese Art von Backup gibt es hier nicht.");

        const parts = parseParts(input.parts);

        await needBackups(config);

        // Plan 31: Anti Villain sichert vor einem Nuke. Ohne Plätze und ohne Sperre - es darf nie an einem vollen Server scheitern.
        // Plan 32: nur mit „Vor riskanten Änderungen“, dann mit Bot und Server. Kommt der Server nicht, wenigstens der Bot.
        if (input.kind === "schutz") {
            if (!(await readPlan(guildId) ?? { plan: DEFAULT_PLAN }).plan.risky) return { skipped: "Vor riskanten Änderungen ist aus." } as unknown as IBackupMeta;

            const server = await botSnapshot(config, guildId, actor.id);
            const safety = await createBackup({ guildId, guildName: header(request, "x-guild-name") ?? guildId, kind: "schutz", note, byName: actor.name, origin: "server", parts: ["bot", "server"], server });
            await audit(actor, "backups.create", guildId, `Sicherheits-Backup · ${note ?? "Anti Villain"}`);

            return safety;
        }

        if (await restoreRunning(guildId)) throw new PublicError(409, "Gerade wird ein Backup geladen. Danach geht es wieder.");
        if (creating.has(guildId)) throw new PublicError(409, "Gerade entsteht schon ein Backup. Warte kurz.");

        creating.add(guildId);

        let meta: IBackupMeta;

        try {
            if ((await countHand(guildId, "server")) >= SERVER_HAND_MAX) throw new PublicError(409, `Alle ${SERVER_HAND_MAX} Plätze sind belegt. Lösch erst ein altes Backup.`);

            const server = await serverPart(config, guildId, actor, parts);

            meta = await createBackup({ guildId, guildName: header(request, "x-guild-name") ?? guildId, kind: "hand", note, byName: actor.name, origin: "server", parts, server });
        } finally {
            creating.delete(guildId);
        }

        await audit(actor, "backups.create", guildId, note ? `${VIA} · ${note}` : VIA);

        return meta;
    });

    app.put("/internal/backups/:guildId/plan", async (request): Promise<IPlanState> => {
        const actor = botActor(config, request);
        const guildId = guildOf(request);
        const plan = parsePlan(request.body);

        await needBackups(config);

        const row = await savePlan(guildId, header(request, "x-guild-name") ?? guildId, plan, actor.name, new Date());
        await audit(actor, "backups.plan", guildId, plan.enabled ? `${VIA} · ${plan.every}, ${plan.hour}:00, ${plan.keep} behalten` : `${VIA} · aus`);

        return planState(row);
    });

    // Plan 32: der Server-Teil eines Backups - zum Ansehen, Vergleichen und Planen im Bot. Ohne Bilder, außer images=1.
    app.get("/internal/backups/:guildId/:backupId/server", async (request) => {
        botActor(config, request);

        const guildId = guildOf(request);
        const backupId = backupOf(request);

        await needBackups(config);

        if (!(await listBackups(guildId, "server")).some((entry) => entry.id === backupId)) throw new PublicError(404, "Dieses Backup gibt es nicht.");

        const server = await backupServer(backupId, guildId);
        if (!server) throw new PublicError(404, "Dieses Backup hat keinen Discord-Server.");
        if ((request.query as { images?: string }).images === "1") return server;

        return withoutImages(server);
    });

    // Plan 32: Laden des Discord-Servers beginnen. Prüft den Namen (beim anderen Server den des Ziels), legt
    // „vorher“ mit dem an, was geladen wird, und gibt den Server-Teil ohne Bilder zurück. Die Schritte macht der Bot.
    app.post("/internal/backups/:guildId/:backupId/server", async (request) => {
        const actor = botActor(config, request);
        const guildId = guildOf(request);
        const backupId = backupOf(request);
        const input = parseServerRestore(request.body);
        const target = input.targetGuildId ?? guildId;

        await needBackups(config);

        const found = (await listBackups(guildId, "server")).find((entry) => entry.id === backupId);
        if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");

        const server = await backupServer(backupId, guildId);
        if (!server) throw new PublicError(404, "Dieses Backup hat keinen Discord-Server.");

        const name = input.targetGuildId ? (header(request, "x-target-name") ?? target) : found.guildName;
        if (input.confirm.toLowerCase() !== name.trim().toLowerCase()) throw new PublicError(400, `Tipp den Namen des Servers genau so ein: „${name}“.`);
        if (await restoreRunning(target)) throw new PublicError(409, "Gerade wird dort schon ein Backup geladen.");

        const parts: BackupPart[] = input.areas.length > 0 ? ["bot", "server"] : ["server"];
        const safety = await createBackup({
            guildId: target,
            guildName: input.targetGuildId ? name : (header(request, "x-guild-name") ?? found.guildName),
            kind: "vorher",
            note: `vor dem Laden von Backup ${backupId}`,
            byName: actor.name,
            origin: "server",
            parts,
            server: await serverPart(config, target, actor, parts),
        });
        const how = input.mode === "repair" ? "Reparieren" : input.mode === "exact" ? "Genau wie im Backup" : `auf ${name}`;

        await audit(actor, "backups.restore", target, `${VIA} · Discord-Server, ${how} · Backup ${backupId}${input.targetGuildId ? ` von ${guildId}` : ""}`);

        // backup: Art und Zeit braucht der Bot für das Fenster der Anti-Nuke-Trümmer.
        return { safetyId: safety.id, server: withoutImages(server), backup: found };
    });

    // Plan 32: nach dem Laden die Daten des Bots auf die neuen IDs bringen.
    app.post("/internal/backups/:guildId/remap", async (request) => {
        botActor(config, request);

        return remapGuild(guildOf(request));
    });

    app.get("/internal/backups/:guildId/:backupId", async (request): Promise<IBackupDetail> => {
        await needBackups(config);

        const found = await backupData(backupOf(request), guildOf(request));
        if (!found || found.meta.origin !== "server") throw new PublicError(404, "Dieses Backup gibt es nicht.");

        return { ...found.meta, tables: Object.fromEntries(Object.entries(found.tables).map(([table, rows]) => [table, rows.length])) };
    });

    app.delete("/internal/backups/:guildId/:backupId", async (request, reply) => {
        const actor = botActor(config, request);
        const guildId = guildOf(request);
        const backupId = backupOf(request);

        await needBackups(config);

        const result = await deleteBackup(backupId, guildId, "server");
        if (result === "missing") throw new PublicError(404, "Dieses Backup gibt es nicht.");
        if (result === "automatic") throw new PublicError(409, "Automatische Backups löschen sich von selbst.");

        await audit(actor, "backups.delete", guildId, `${VIA} · Backup ${backupId}`);

        return reply.code(204).send();
    });

    app.post("/internal/backups/:guildId/:backupId/restore", async (request): Promise<IRestoreResult> => {
        const actor = botActor(config, request);
        const guildId = guildOf(request);
        const backupId = backupOf(request);
        const input = parseRestore(request.body);

        await needBackups(config);

        const backups = await listBackups(guildId, "server");
        const found = backups.find((entry) => entry.id === backupId);
        if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");
        if (input.confirm.toLowerCase() !== found.guildName.trim().toLowerCase()) throw new PublicError(400, `Tipp den Namen des Servers genau so ein: „${found.guildName}“.`);

        // Plan 32: Nach dem Laden des Discord-Servers gibt es das „vorher“ schon.
        const raw = (request.body as { safetyId?: unknown } | null)?.safetyId;
        const safetyId = raw === undefined ? undefined : id(String(raw));
        if (safetyId !== undefined && !backups.some((entry) => entry.id === safetyId && entry.kind === "vorher")) throw new PublicError(400, "Dieses Sicherheits-Backup gibt es nicht.");

        const result = await restoreBackup(config, { guildId, backupId, areas: input.areas, actor, origin: "server", safetyId });
        const labels = AREAS.filter((area) => input.areas.includes(area.id)).map((area) => area.label);
        await audit(actor, "backups.restore", guildId, `${VIA} · ${labels.join(", ")} · Backup ${backupId}`);

        return result;
    });
}
