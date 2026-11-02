import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit } from "../audit.ts";
import { verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { markCopy, stopDeletion } from "../userdata/deletions.ts";
import { deletionCopy, sendDeletionDm } from "../userdata/dm.ts";
import { personRows } from "../userdata/find.ts";
import { followUp, personBase, plainInput } from "../userdata/flow.ts";

/**
 * Die Knöpfe der Lösch-DM (W-0051, Spec-Entscheidung 40): Der Bot nimmt den
 * Klick an und fragt hier, mit Token (Scope userdata) und der Discord-ID der
 * klickenden Person als Subjekt. Zählt nur für die Person der Löschung und
 * nur, solange sie geplant ist. Die Antwort ist der Satz für die Person.
 */

const SCOPE = "userdata";
const SUBJECT = /^discord:(\d{17,20})$/;
/** Im Protokoll: Die Person hat selbst gedrückt (keine Team-ID). */
const PERSON = { id: "0", name: "Die Person selbst" };

function clicker(config: IConfig, request: FastifyRequest): string {
    const authorization = request.headers.authorization ?? "";
    const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;
    const match = payload?.scope.includes(SCOPE) ? SUBJECT.exec(payload.sub) : null;

    if (!match) throw new PublicError(401, "Nur für den Bot.");

    return match[1];
}

export async function internalUserdataRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.post("/internal/userdata/:deletion/:action", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request): Promise<{ message: string }> => {
        const userId = clicker(config, request);
        if (!databaseReady()) throw new DatabaseUnavailable();

        const params = request.params as { deletion?: string; action?: string };
        const id = Number.parseInt(params.deletion ?? "", 10);
        if (!Number.isInteger(id) || id < 1) throw new PublicError(400, "Diese Löschung gibt es nicht.");

        if (params.action === "stop") {
            const record = await stopDeletion(id, userId);

            await followUp(config, record, "angehalten", await plainInput(config, record));
            await audit(PERSON, "userdata.stop", userId, null);
            publish("userdata");

            return { message: "Angehalten. Nichts wird gelöscht, das Team meldet sich bei dir." };
        }

        if (params.action === "copy") {
            const record = await markCopy(id, userId);
            const [file, rows, base] = await Promise.all([deletionCopy(userId), personRows(userId), personBase(config, userId, record.userName)]);

            await sendDeletionDm(config, record, "kopie", { ...base, sentAt: new Date(), dueAt: new Date(record.dueAt), areas: [], kept: [], total: rows.length, servers: 0, bytes: file.data.length }, file);
            await audit(PERSON, "userdata.copy", userId, `${rows.length} Einträge`);
            publish("userdata");

            return { message: "Die Kopie ist unterwegs, schau in deine Direktnachrichten." };
        }

        throw new PublicError(404, "Diesen Knopf gibt es nicht.");
    });
}
