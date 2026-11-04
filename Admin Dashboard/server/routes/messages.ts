import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkMessage, type IMessageAudience, type IMessageContent, type IMessageDetail, type IMessageEntry, type IMessagePerson, type IMessageTemplate, type ISendResult } from "../../shared/messages.ts";
import { accessOf, developerOnly } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { previewMessage } from "../messages/dm.ts";
import { audienceView, cancelMessage, pauseMessage, personState, resumeMessage, sendOne, sendTest, startAll } from "../messages/flow.ts";
import { deleteTemplate, listMessages, listTemplates, messageOf, missesOf, saveTemplate, type IMessageRecord } from "../messages/store.ts";
import { personIndex } from "../userdata/find.ts";
import { knownRefs, lookupUser } from "../users.ts";
import { body, id, oneOf, snowflake, text } from "../validate.ts";

/**
 * Nachrichten über den Bot (W-0058, Spec Teil 5). Admin und Developer; an
 * alle, Anhalten, Weiter und Abbrechen nur Developer. Jeder Inhalt geht durch
 * checkMessage, der Satz kommt so an die Oberfläche.
 */

/** Was „An alle“ zum Bestätigen eingetippt braucht. */
const CONFIRM = "SENDEN";
const AUDIENCES = ["all", "one"] as const;

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

/** Namen ohne auf Discord zu warten: was der Speicher kennt, sonst der in den Nutzerdaten gespeicherte. */
async function namesOf(ids: readonly string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();

    const [refs, index] = await Promise.all([knownRefs(ids), personIndex()]);

    return new Map(ids.map((userId) => [userId, refs.get(userId)?.name ?? index.get(userId)?.name ?? null]));
}

function entryOf(record: IMessageRecord, names: ReadonlyMap<string, string | null>): IMessageEntry {
    return {
        id: record.id,
        templateName: record.templateName,
        title: record.content.title,
        audience: record.audience,
        target: record.targetUserId === null ? null : { id: record.targetUserId, name: names.get(record.targetUserId) ?? null },
        total: record.total,
        sent: record.sent,
        failed: record.failed,
        skipped: record.skipped,
        state: record.state,
        createdName: record.createdName,
        createdAt: record.createdAt.toISOString(),
        finishedAt: iso(record.finishedAt),
    };
}

export async function messageRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const ready = (): void => {
        if (!databaseReady()) throw new DatabaseUnavailable();
    };
    const actorOf = (request: FastifyRequest): IActor => {
        const me = accessOf(request);

        return { id: me.id, name: me.name };
    };
    const contentFrom = (value: unknown): IMessageContent => {
        const checked = checkMessage(value, config.guildId);
        if ("problem" in checked) throw new InvalidInput(checked.problem);

        return checked.content;
    };
    const templateOf = (value: unknown): string => text(value, "Der Name der Vorlage", { max: 60 });
    const messageId = (request: FastifyRequest): number => id((request.params as { id?: string }).id);

    app.get("/api/messages/audience", async (): Promise<IMessageAudience> => {
        ready();

        return audienceView(config);
    });

    app.post("/api/messages/preview", async (request, reply) => {
        const content = contentFrom(body(request.body).content);
        const image = await previewMessage(config, actorOf(request), content);

        return reply.type("image/png").header("Cache-Control", "no-store").send(image);
    });

    app.post("/api/messages/test", async (request): Promise<ISendResult> => sendTest(config, actorOf(request), contentFrom(body(request.body).content)));

    app.post("/api/messages/one", async (request): Promise<ISendResult> => {
        ready();

        const input = body(request.body);

        return sendOne(config, actorOf(request), snowflake(input.userId), templateOf(input.template), contentFrom(input.content));
    });

    app.post("/api/messages/all", { onRequest: developerOnly }, async (request): Promise<{ readonly id: number; readonly total: number }> => {
        ready();

        const input = body(request.body);
        const content = contentFrom(input.content);
        const template = templateOf(input.template);

        if (input.confirm !== CONFIRM) throw new InvalidInput(`Zum Bestätigen ${CONFIRM} eintippen.`);

        return startAll(actorOf(request), template, content);
    });

    for (const [action, run] of [
        ["pause", pauseMessage],
        ["resume", resumeMessage],
        ["cancel", cancelMessage],
    ] as const) {
        app.post(`/api/messages/:id/${action}`, { onRequest: developerOnly }, async (request, reply) => {
            ready();
            await run(actorOf(request), messageId(request));

            return reply.code(204).send();
        });
    }

    app.get("/api/messages", async (): Promise<IMessageEntry[]> => {
        ready();

        const records = await listMessages(50);
        const names = await namesOf(records.flatMap((record) => (record.targetUserId ? [record.targetUserId] : [])));

        return records.map((record) => entryOf(record, names));
    });

    /* --- Vorlagen --- */

    app.get("/api/messages/templates", async (): Promise<IMessageTemplate[]> => {
        ready();

        return listTemplates();
    });

    const templateInput = (value: unknown) => {
        const input = body(value);

        return { name: text(input.name, "Der Name der Vorlage", { min: 1, max: 60 }), audience: oneOf(input.audience, AUDIENCES, "Für wen"), content: contentFrom(input.content) };
    };
    const saved = async (templateId: number): Promise<IMessageTemplate> => {
        const found = (await listTemplates()).find((template) => template.id === templateId);
        if (!found) throw new PublicError(404, "Diese Vorlage gibt es nicht mehr.");

        return found;
    };

    app.post("/api/messages/templates", async (request): Promise<IMessageTemplate> => {
        ready();

        const input = templateInput(request.body);
        const actor = actorOf(request);
        const templateId = await saveTemplate(actor, { id: null, ...input });

        await audit(actor, "messages.template", null, `angelegt: ${input.name}`);
        publish("messages");

        return saved(templateId);
    });

    app.put("/api/messages/templates/:id", async (request): Promise<IMessageTemplate> => {
        ready();

        const templateId = messageId(request);
        const input = templateInput(request.body);
        const actor = actorOf(request);

        await saveTemplate(actor, { id: templateId, ...input });
        await audit(actor, "messages.template", null, `geändert: ${input.name}`);
        publish("messages");

        return saved(templateId);
    });

    app.delete("/api/messages/templates/:id", async (request, reply) => {
        ready();

        const templateId = messageId(request);
        const name = (await listTemplates()).find((template) => template.id === templateId)?.name;

        if (!name || !(await deleteTemplate(templateId))) throw new PublicError(404, "Diese Vorlage gibt es nicht mehr.");

        await audit(actorOf(request), "messages.template", null, `gelöscht: ${name}`);
        publish("messages");

        return reply.code(204).send();
    });

    /* --- Person --- */

    app.get("/api/messages/person/:id", async (request): Promise<IMessagePerson> => {
        ready();

        const userId = snowflake((request.params as { id?: string }).id);
        const [ref, state, index] = await Promise.all([lookupUser(config, userId).catch(() => null), personState(userId), personIndex()]);

        return { id: userId, name: ref?.name ?? index.get(userId)?.name ?? null, avatar: ref?.avatar ?? null, state };
    });

    /* --- Eine Nachricht --- */

    app.get("/api/messages/:id", async (request): Promise<IMessageDetail> => {
        ready();

        const record = await messageOf(messageId(request));
        if (!record) throw new PublicError(404, "Diese Nachricht gibt es nicht.");

        const misses = await missesOf(record.id);
        const names = await namesOf([...(record.targetUserId ? [record.targetUserId] : []), ...misses.map((miss) => miss.userId)]);

        return { ...entryOf(record, names), pauseReason: record.pauseReason, misses: misses.map((miss) => ({ id: miss.userId, name: names.get(miss.userId) ?? null, reason: miss.reason })) };
    });

    app.get("/api/messages/:id/bild", async (request, reply) => {
        ready();

        const record = await messageOf(messageId(request));
        if (!record) throw new PublicError(404, "Diese Nachricht gibt es nicht.");

        const image = await previewMessage(config, actorOf(request), record.content, record.createdAt, record.createdName);

        return reply.type("image/png").header("Cache-Control", "no-store").send(image);
    });
}
