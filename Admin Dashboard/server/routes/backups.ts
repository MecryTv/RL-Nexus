import type { FastifyInstance, FastifyRequest } from "fastify";
import { AREA_IDS, AREAS, BACKUP_NOTE_MAX, type AreaId, type IBackupDetail, type IBackupsOverview, type IGuildBackups, type IGuildTile, type IRestoreInput } from "../../shared/backups.ts";
import type { IGuildRow } from "../../shared/api.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { allTables } from "../backups/data.ts";
import { restoreBackup } from "../backups/restore.ts";
import { nightsOf, roundRunning, runRound, summarizeRound } from "../backups/round.ts";
import { planState } from "../backups/plan.ts";
import { backupData, backupGuilds, backupsReady, createBackup, deleteBackup, handDates, lastFullRound, listBackups, readPlan, recentRuns, type IRunRow } from "../backups/store.ts";
import { botOverview, botRestored } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { body, id, snowflake } from "../validate.ts";

/** Backups im Admin Dashboard: Lagebild, Server, Sichern, Ansehen, Löschen, Zurückladen. Für Admins und Developer. */

async function reasonNow(config: IConfig): Promise<string | null> {
    return databaseReady() ? backupsReady(config) : "Ohne Datenbank gibt es keine Backups.";
}

export async function needBackups(config: IConfig): Promise<void> {
    const reason = await reasonNow(config);
    if (reason !== null) throw new PublicError(503, reason);
}

function guildOf(request: FastifyRequest): string {
    return snowflake((request.params as { guildId?: string }).guildId, "Der Server");
}

/** Bereiche und Bestätigung prüfen, bevor irgendetwas die Datenbank fragt. */
export function parseRestore(raw: unknown): IRestoreInput {
    const input = body(raw);
    const areas = Array.isArray(input.areas) ? input.areas : [];

    if (areas.length === 0) throw new PublicError(400, "Wähl mindestens einen Bereich, der zurückkommen soll.");
    for (const area of areas) {
        if (typeof area !== "string" || !(AREA_IDS as readonly string[]).includes(area)) throw new PublicError(400, `Diesen Bereich gibt es nicht: ${String(area)}`);
    }

    const confirm = typeof input.confirm === "string" ? input.confirm.trim() : "";
    if (confirm === "") throw new PublicError(400, "Tipp zum Bestätigen den Namen des Servers ein.");

    return { areas: [...new Set(areas as AreaId[])], confirm };
}

function tileOf(guild: { id: string; name: string; members: number | null; modules: number | null; present: boolean }, runs: readonly IRunRow[], hand: readonly Date[], last: IGuildTile["last"], now: number): IGuildTile {
    const mine = runs.filter((run) => run.guildId === guild.id);
    const latest = mine.at(-1);

    return {
        ...guild,
        nights: nightsOf(mine, hand, now),
        last,
        problem: latest && !latest.ok ? (latest.reason ?? "unbekannter Fehler") : null,
    };
}

async function overview(config: IConfig): Promise<IBackupsOverview> {
    const now = Date.now();
    // Antwortet der Bot nicht oder ist er noch nicht bereit, weiß niemand, wo er ist: dann gelten die Server der letzten Runde.
    const overview = await botOverview(config, "backups");
    const bot = overview?.ready ? overview : null;
    const fromBot = (guild: IGuildRow) => ({ id: guild.id, name: guild.name, members: guild.members, modules: guild.modules.length, present: true });
    const reason = await reasonNow(config);

    if (reason !== null) {
        return { available: false, reason, round: null, running: false, guilds: (bot?.guilds ?? []).map((guild) => tileOf(fromBot(guild), [], [], null, now)) };
    }

    const [runs, stored, hand] = await Promise.all([recentRuns(), backupGuilds(), handDates()]);
    const lastOf = new Map(stored.map((entry) => [entry.guildId, { at: entry.last.at.toISOString(), kind: entry.last.kind }]));
    const present = bot
        ? bot.guilds.map(fromBot)
        : ((await lastFullRound())?.guilds ?? []).map((guild) => ({ id: guild.id, name: guild.name, members: null, modules: null, present: true }));
    const gone = stored.filter((entry) => !present.some((guild) => guild.id === entry.guildId)).map((entry) => ({ id: entry.guildId, name: entry.guildName, members: null, modules: null, present: false }));

    return {
        available: true,
        reason: null,
        running: roundRunning(),
        round: summarizeRound(runs),
        guilds: [...present, ...gone].map((guild) => tileOf(guild, runs, hand.get(guild.id) ?? [], lastOf.get(guild.id) ?? null, now)),
    };
}

export async function backupRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/backups", async (): Promise<IBackupsOverview> => overview(config));

    app.post("/api/backups/run", async (request, reply) => {
        await needBackups(config);

        void runRound(config).catch(() => undefined);
        await audit(accessOf(request), "backups.run");

        return reply.code(202).send({ running: true });
    });

    app.get("/api/backups/:guildId", async (request): Promise<IGuildBackups> => {
        await needBackups(config);

        const guildId = guildOf(request);
        const tile = (await overview(config)).guilds.find((guild) => guild.id === guildId);
        if (!tile) throw new PublicError(404, "Zu diesem Server gibt es keine Backups.");

        return { guild: tile, plan: planState(await readPlan(guildId)), backups: await listBackups(guildId) };
    });

    app.post("/api/backups/:guildId/run", async (request, reply) => {
        await needBackups(config);

        const guildId = guildOf(request);
        void runRound(config, [guildId]).catch(() => undefined);
        await audit(accessOf(request), "backups.catchup", guildId);

        return reply.code(202).send({ running: true });
    });

    app.post("/api/backups/:guildId", async (request) => {
        const guildId = guildOf(request);
        const raw = body(request.body).note;
        const note = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
        if (note !== null && note.length > BACKUP_NOTE_MAX) throw new PublicError(400, `Die Notiz darf höchstens ${BACKUP_NOTE_MAX} Zeichen haben.`);

        await needBackups(config);

        const actor = accessOf(request);
        const name = (await overview(config)).guilds.find((guild) => guild.id === guildId)?.name ?? (await listBackups(guildId))[0]?.guildName ?? guildId;
        const meta = await createBackup({ guildId, guildName: name, kind: "hand", note, byName: actor.name });

        await audit(actor, "backups.create", guildId, note);

        return meta;
    });

    app.get("/api/backups/:guildId/:backupId", async (request): Promise<IBackupDetail> => {
        await needBackups(config);

        const found = await backupData(id((request.params as { backupId?: string }).backupId), guildOf(request));
        if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");

        return { ...found.meta, tables: Object.fromEntries(Object.entries(found.tables).map(([table, rows]) => [table, rows.length])) };
    });

    app.delete("/api/backups/:guildId/:backupId", async (request, reply) => {
        await needBackups(config);

        const guildId = guildOf(request);
        const backupId = id((request.params as { backupId?: string }).backupId);
        const result = await deleteBackup(backupId, guildId);

        if (result === "missing") throw new PublicError(404, "Dieses Backup gibt es nicht.");
        if (result === "automatic") throw new PublicError(409, "Automatische Backups löschen sich nach 72 Stunden selbst.");

        await audit(accessOf(request), "backups.delete", guildId, String(backupId));

        return reply.code(204).send();
    });

    app.post("/api/backups/:guildId/:backupId/restore", async (request) => {
        const guildId = guildOf(request);
        const backupId = id((request.params as { backupId?: string }).backupId);
        const input = parseRestore(request.body);

        await needBackups(config);

        const found = (await listBackups(guildId)).find((entry) => entry.id === backupId);
        if (!found) throw new PublicError(404, "Dieses Backup gibt es nicht.");
        if (input.confirm.toLowerCase() !== found.guildName.trim().toLowerCase()) throw new PublicError(400, `Tipp den Namen des Servers genau so ein: „${found.guildName}“.`);

        const actor = accessOf(request);
        const result = await restoreBackup(config, { guildId, backupId, areas: input.areas, actor });
        const labels = AREAS.filter((area) => input.areas.includes(area.id)).map((area) => area.label);

        await audit(actor, "backups.restore", guildId, `${labels.join(", ")} · Backup ${backupId}`);

        return result;
    });

    app.post("/api/backups/:guildId/panels", async (request) => {
        const guildId = guildOf(request);
        const actor = accessOf(request);
        const report = await botRestored(config, guildId, allTables(), null, actor.id);

        await audit(actor, "backups.panels", guildId);

        return report;
    });
}
