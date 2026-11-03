import type { FastifyInstance } from "fastify";
import { BAN_REASONS, BLOCKS, EVIDENCE_MAX, EVIDENCE_TYPES, normalScope, type IBanProfile, type IPersonPrefill, type ISecurityOverview, type ISuspectView, type IVpnView } from "../../shared/security.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { botMessage } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { banPeople, changeBan, clearSuspect, liftBan } from "../security/flow.ts";
import { proxycheck } from "../security/proxycheck.ts";
import { banProfile, openSuspectCount, openSuspects, overview, personPrefill, vpnView } from "../security/views.ts";
import { teamActor } from "../servers/views.ts";
import { body, id, oneOf, snowflake, text } from "../validate.ts";

/** Bereich Sicherheit (W-0057, A2). Admin und Developer, alles im Protokoll. */

const IPISH = /^[0-9a-fA-F:.]{2,45}$/;
const MESSAGE_LINK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d{17,20}|@me)\/(\d{17,20})\/(\d{17,20})$/;

function list(value: unknown, allowed: readonly string[]): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && allowed.includes(entry)) : [];
}

function ids(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && /^\d{17,20}$/.test(entry)).slice(0, 50) : [];
}

export async function securityRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const ready = (): void => {
        if (!databaseReady()) throw new DatabaseUnavailable();
    };
    const actorOf = (request: Parameters<typeof accessOf>[0]) => teamActor(accessOf(request));

    app.get("/api/security", async (request): Promise<ISecurityOverview> => {
        ready();

        return overview(config, (request.query as { stand?: string }).stand === "aufgehoben" ? "lifted" : "active");
    });

    // Für die Zahl am Bereich in der Leiste; ohne Datenbank 0 statt Fehler.
    app.get("/api/security/count", async (): Promise<{ suspects: number }> => ({ suspects: databaseReady() ? await openSuspectCount() : 0 }));

    app.get("/api/security/bans/:id", async (request): Promise<IBanProfile> => {
        ready();

        return banProfile(config, id((request.params as { id?: string }).id));
    });

    app.get("/api/security/person/:id", async (request): Promise<IPersonPrefill> => {
        ready();

        return personPrefill(config, snowflake((request.params as { id?: string }).id));
    });

    app.post("/api/security/bans", async (request) => {
        ready();

        const input = body(request.body);
        const result = await banPeople(
            config,
            {
                userId: snowflake(input.userId, "Die Discord-ID"),
                scope: normalScope(list(input.scope, BLOCKS)),
                reasons: list(input.reasons, BAN_REASONS),
                note: typeof input.note === "string" ? input.note.slice(0, 2000) : "",
                leave: ids(input.leave),
                linked: ids(input.linked),
                ref: input.ref === undefined || input.ref === null ? null : id(String(input.ref)),
            },
            actorOf(request)
        );

        return result;
    });

    app.post("/api/security/bans/:id/change", async (request) => {
        ready();

        const input = body(request.body);

        await changeBan(
            config,
            id((request.params as { id?: string }).id),
            { scope: normalScope(list(input.scope, BLOCKS)), note: typeof input.note === "string" ? input.note.slice(0, 2000) : "", leave: ids(input.leave), allow: ids(input.allow) },
            actorOf(request)
        );

        return { ok: true };
    });

    app.post("/api/security/bans/:id/lift", async (request) => {
        ready();
        await liftBan(config, id((request.params as { id?: string }).id), typeof body(request.body).note === "string" ? String(body(request.body).note).slice(0, 2000) : "", actorOf(request));

        return { ok: true };
    });

    // Beleg: Bild als base64 (höchstens 8 MB) oder Link zu einer Discord-Nachricht, die der Bot liest.
    app.post("/api/security/bans/:id/evidence", { bodyLimit: 12 * 1024 * 1024 }, async (request) => {
        ready();

        const banId = id((request.params as { id?: string }).id);
        const input = body(request.body);
        const actor = actorOf(request);
        const [ban] = await query<{ state: string }[]>("SELECT state FROM security_bans WHERE id = ?", [banId]);

        if (!ban) throw new PublicError(404, "Diese Sperre gibt es nicht.");
        if (ban.state !== "active") throw new PublicError(409, "Diese Sperre ist aufgehoben.");

        if (typeof input.link === "string") {
            const match = MESSAGE_LINK.exec(input.link.trim());
            if (!match) throw new PublicError(400, "Das ist kein Link zu einer Discord-Nachricht.");

            const message = await botMessage(config, match[2]!, match[3]!, actor.id);

            await query("INSERT INTO security_evidence (ban_id, kind, name, message, error, by_id) VALUES (?, 'discord', ?, ?, ?, ?)", [banId, input.link.trim().slice(0, 200), message ? JSON.stringify(message) : null, message ? null : "Nachricht nicht gefunden oder Bot nicht erreichbar", actor.id]);
        } else {
            const mime = oneOf(input.mime, EVIDENCE_TYPES, "Das Bildformat");
            const data = Buffer.from(text(input.data, "Das Bild", { min: 10, max: Math.ceil((EVIDENCE_MAX * 4) / 3) + 8 }), "base64");

            if (data.length > EVIDENCE_MAX) throw new PublicError(400, "Ein Bild darf höchstens 8 MB groß sein.");

            await query("INSERT INTO security_evidence (ban_id, kind, name, mime, size, data, by_id) VALUES (?, 'file', ?, ?, ?, ?, ?)", [banId, text(input.name, "Der Dateiname", { min: 1, max: 200 }), mime, data.length, data, actor.id]);
        }

        await query("INSERT INTO security_ban_changes (ban_id, action, note, by_id, by_name) VALUES (?, 'evidence', ?, ?, ?)", [banId, typeof input.link === "string" ? "Discord-Nachricht" : "Bild", actor.id, actor.name.slice(0, 100)]);
        await audit(actor, "security.evidence", String(banId), typeof input.link === "string" ? "Discord-Nachricht" : "Bild");
        publish("security");

        return { ok: true };
    });

    app.get("/api/security/evidence/:id", async (request, reply) => {
        ready();

        const row = (await query<{ mime: string | null; data: Buffer | null }[]>("SELECT mime, data FROM security_evidence WHERE id = ? AND kind = 'file'", [id((request.params as { id?: string }).id)]))[0];
        if (!row?.data || !row.mime) throw new PublicError(404, "Diesen Beleg gibt es nicht.");

        return reply.header("Content-Type", row.mime).header("Cache-Control", "private, max-age=300").send(row.data);
    });

    // Ein Bild aus einer gesicherten Discord-Nachricht. Nur Rasterbilder: Ein SVG könnte hier Skript ausführen.
    app.get("/api/security/evidence/:id/bild/:n", async (request, reply) => {
        ready();

        const params = request.params as { id?: string; n?: string };
        const row = (await query<{ message: unknown }[]>("SELECT message FROM security_evidence WHERE id = ? AND kind = 'discord'", [id(params.id)]))[0];
        const message = (typeof row?.message === "string" ? JSON.parse(row.message) : row?.message) as { images?: { url?: string }[] } | null | undefined;
        const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(message?.images?.[Number(params.n)]?.url ?? "");

        if (!match) throw new PublicError(404, "Dieses Bild gibt es nicht.");

        return reply.header("Content-Type", match[1]!).header("Cache-Control", "private, max-age=300").send(Buffer.from(match[2]!, "base64"));
    });

    app.get("/api/security/suspects", async (): Promise<ISuspectView[]> => {
        ready();

        return openSuspects(config);
    });

    app.post("/api/security/suspects/:id/ok", async (request) => {
        ready();
        await clearSuspect(id((request.params as { id?: string }).id), actorOf(request));

        return { ok: true };
    });

    app.get("/api/security/vpn", async (): Promise<IVpnView> => {
        ready();

        return vpnView(config);
    });

    // Testabfrage: Ergebnis wird gezeigt, die IP nirgends gespeichert.
    app.post("/api/security/vpn/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
        const ip = text(body(request.body).ip, "Die Adresse", { min: 2, max: 45 });
        if (!IPISH.test(ip)) throw new PublicError(400, "Das ist keine IP-Adresse.");
        if (!config.proxycheckKey) throw new PublicError(409, "Es ist kein Proxycheck-Key gesetzt.");

        const started = Date.now();
        const result = await proxycheck(config.proxycheckKey, ip);
        if (!result) throw new PublicError(502, "Proxycheck antwortet gerade nicht.");

        return { ...result, ms: Date.now() - started };
    });
}
