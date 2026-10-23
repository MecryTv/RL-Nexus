import type { FastifyInstance, FastifyRequest } from "fastify";
import { AREAS, BACKUP_NOTE_MAX, PLAN_EVERY, PLAN_KEEP_MAX, SERVER_HAND_MAX, type IBackupDetail, type IBackupMeta, type IBackupPlan, type IPlanState, type IRestoreResult, type IServerBackups, type PlanEvery } from "../../shared/backups.ts";
import { audit, type IActor } from "../audit.ts";
import { planState } from "../backups/plan.ts";
import { restoreBackup } from "../backups/restore.ts";
import { backupData, countHand, createBackup, deleteBackup, listBackups, readPlan, savePlan } from "../backups/store.ts";
import { verifyToken } from "../bot.ts";
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

    return { enabled: input.enabled, every: input.every as PlanEvery, weekday: input.weekday as number, hour: input.hour as number, keep: input.keep as number };
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
        const raw = body(request.body).note;
        const note = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
        if (note !== null && note.length > BACKUP_NOTE_MAX) throw new PublicError(400, `Die Notiz darf höchstens ${BACKUP_NOTE_MAX} Zeichen haben.`);

        await needBackups(config);

        if ((await countHand(guildId, "server")) >= SERVER_HAND_MAX) throw new PublicError(409, `Alle ${SERVER_HAND_MAX} Plätze sind belegt. Lösch erst ein altes Backup.`);

        const meta = await createBackup({ guildId, guildName: header(request, "x-guild-name") ?? guildId, kind: "hand", note, byName: actor.name, origin: "server" });
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

        const found = (await listBackups(guildId, "server")).find((entry) => entry.id === backupId);
        if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");
        if (input.confirm.toLowerCase() !== found.guildName.trim().toLowerCase()) throw new PublicError(400, `Tipp den Namen des Servers genau so ein: „${found.guildName}“.`);

        const result = await restoreBackup(config, { guildId, backupId, areas: input.areas, actor, origin: "server" });
        const labels = AREAS.filter((area) => input.areas.includes(area.id)).map((area) => area.label);
        await audit(actor, "backups.restore", guildId, `${VIA} · ${labels.join(", ")} · Backup ${backupId}`);

        return result;
    });
}
