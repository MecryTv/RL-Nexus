import type { FastifyInstance } from "fastify";
import { channelLabel, DETAIL_RANGES, type DetailRange, type IDiscordPostResult, type IDiscordPostState, type IStatusChannelOption, type IIncidentList, type IStatusDetail } from "../../shared/status.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { addUpdate, createIncident, deleteIncident, listIncidents, openKindOf, parseIncident, parseUpdate } from "../status/incidents.ts";
import { loadDetail } from "../status/detail.ts";
import { renderStatusImages } from "../status/image.ts";
import { publicStatus, statusSnapshot } from "../status/snapshot.ts";
import { chooseChannel, discordPostState, refreshNow, rememberManual, statusChannelOptions, statusCycle } from "../status-post.ts";
import { id } from "../validate.ts";

function needDatabase(): void {
    if (!databaseReady()) throw new PublicError(503, "Ohne Datenbank lassen sich keine Meldungen anlegen.");
}

/**
 * Die Statusseite fragt das ohne Anmeldung ab, unter status.nexus-emb.de.
 * Geantwortet wird mit dem Stand nach der letzten Prüfung aus dem Speicher.
 */
export async function publicStatusRoutes(app: FastifyInstance): Promise<void> {
    app.get("/public/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (_request, reply) => {
        const status = publicStatus();

        if (status === null) throw new PublicError(503, "Der Status wird gerade zum ersten Mal geprüft. Versuch es in einer Minute noch einmal.");

        return reply.header("Cache-Control", "no-cache").send(status);
    });
}

/** Eigene Meldungen im Admin Dashboard. Nach jeder Änderung gehen Statusseite und Discord sofort neu raus. */
export async function statusRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const changed = (): void => void statusCycle(config);

    /** Der Leitstand unter Admin → Status. Ohne Datenbank kommt die letzte Messung ohne Verlauf. */
    app.get("/api/status/detail", async (request): Promise<IStatusDetail> => {
        const range = (request.query as { range?: string }).range ?? "24h";
        if (!(DETAIL_RANGES as readonly string[]).includes(range)) throw new PublicError(400, "Zeitraum ist 24h, 7d oder 30d.");

        return loadDetail(range as DetailRange);
    });

    /** Die Karte „Discord-Meldung“: Kanäle, zuletzt, nächste Runde, Vorschau (W-0052). */
    app.get("/api/status/discord", async (): Promise<IDiscordPostState> => discordPostState(config));

    /** „In Discord aktualisieren“: sofort neu schreiben. Die Sperre von zehn Sekunden steckt in refreshNow. */
    app.post("/api/status/discord", async (request): Promise<IDiscordPostResult> => {
        const actor = accessOf(request);
        const result = await refreshNow(config);
        const failed = result.channels.filter((channel) => !channel.ok);

        rememberManual(actor.name, result);

        await audit(
            actor,
            "status.discord",
            null,
            `${result.channels.length - failed.length} von ${result.channels.length} Kanälen${failed.length > 0 ? ` · ${failed.map((channel) => `${channelLabel(channel)}: ${channel.error}`).join(" · ")}` : ""}`
        );

        return result;
    });

    /** Die Textkanäle des Servers für das Fenster „Statuskanal wählen“ (K2). */
    app.get("/api/status/discord/channels", async (): Promise<IStatusChannelOption[]> => statusChannelOptions(config));

    /** Statuskanal wechseln: alte Meldung weg, neue sofort im neuen Kanal. */
    app.put("/api/status/discord/channel", async (request): Promise<IDiscordPostResult | null> => {
        const actor = accessOf(request);
        const body = request.body as { channelId?: unknown; confirm?: unknown } | null;
        const channelId = body?.channelId;

        // Der Bot räumt den Statuskanal auf. Wer wechselt, muss das ausdrücklich wissen.
        if (body?.confirm !== true) throw new PublicError(400, "Bestätige, dass der Bot im neuen Kanal alle anderen Nachrichten löscht.");
        if (typeof channelId !== "string" || !/^\d{17,20}$/.test(channelId)) throw new PublicError(400, "Wähl einen Kanal aus der Liste.");

        const { from, result } = await chooseChannel(config, channelId);
        const name = (id: string): string => channelLabel({ id, name: (result?.channels.find((channel) => channel.id === id)?.name ?? null) });

        await audit(actor, "status.channel", channelId, `${from ? name(from) : "keiner"} → ${name(channelId)}`);
        if (result) rememberManual(actor.name, result);

        return result;
    });

    /** Die Bilder der Meldung für die Vorschau. In Discord stecken sie als Anhang `attachment://<name>`. */
    app.get("/api/status/discord/image/:name", async (request, reply) => {
        const name = (request.params as { name?: string }).name;
        const snapshot = statusSnapshot();
        const image = snapshot === null ? undefined : (await renderStatusImages(snapshot)).find((entry) => entry.name === name);
        if (!image) throw new PublicError(404, "Dieses Bild gibt es nicht.");

        // Die Bilder ändern sich mit jeder Prüfung, die Adresse nicht.
        return reply.type("image/png").header("Cache-Control", "no-cache").send(image.data);
    });

    app.get("/api/status/incidents", async (): Promise<IIncidentList> => {
        needDatabase();

        return { ...(await listIncidents()), statusUrl: config.statusUrl };
    });

    app.post("/api/status/incidents", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const input = parseIncident(request.body);
        const created = await createIncident(input, actor);

        await audit(actor, "status.create", String(created), input.title);
        changed();

        return reply.code(201).send({ id: created });
    });

    app.post("/api/status/incidents/:id/updates", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const incident = id((request.params as { id?: string }).id);
        const update = parseUpdate(request.body, await openKindOf(incident));

        await addUpdate(incident, update, actor);
        await audit(actor, "status.update", String(incident), update.state);
        changed();

        return reply.code(204).send();
    });

    app.delete("/api/status/incidents/:id", async (request, reply) => {
        needDatabase();

        const actor = accessOf(request);
        const incident = id((request.params as { id?: string }).id);
        const title = await deleteIncident(incident);

        await audit(actor, "status.delete", String(incident), title);
        changed();

        return reply.code(204).send();
    });
}
