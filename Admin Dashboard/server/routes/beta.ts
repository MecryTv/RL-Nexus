import type { FastifyInstance, FastifyRequest } from "fastify";
import { normalizeCode, type IBetaCode, type IBetaView } from "../../shared/beta.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import { createCodes, listCodes, listTesters, parseCodesInput, redeem, removeTester, revokeCode } from "../beta/store.ts";
import { verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { readSettings } from "../shop/store.ts";
import { userRefs } from "../users.ts";
import { body, id, snowflake } from "../validate.ts";

/**
 * Beta Access (Plan 22). Die Verwaltung unter /api/beta braucht eine Sitzung
 * im Admin Dashboard. Eingelöst wird über /internal/beta/redeem: Das ruft nur
 * der Bot, wenn jemand auf seiner Sperrseite einen Code eingibt, mit Token
 * (Scope "beta", sub "dashboard:<ID>") wie bei den Backups. Umgeschaltet wird
 * der Modus unter Shop → Einstellungen (PUT /api/shop/access).
 */
const SCOPE = "beta";
const SUBJECT = /^dashboard:(\d{17,20})$/;
const INVALID = "Diesen Code gibt es nicht, oder er ist schon aufgebraucht.";

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

/** Wer auf der Sperrseite einlöst. Ohne gültiges Token: 401. */
function botActor(config: IConfig, request: FastifyRequest): IActor {
    const authorization = request.headers.authorization ?? "";
    const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;
    const match = payload?.scope.includes(SCOPE) ? SUBJECT.exec(payload.sub) : null;

    if (!match) throw new PublicError(401, "Nur für den Bot.");

    const raw = request.headers["x-actor-name"];
    let name = match[1];

    try {
        if (typeof raw === "string" && raw !== "") name = decodeURIComponent(raw).slice(0, 64);
    } catch {
        // Kaputt kodiert: dann eben die ID.
    }

    return { id: match[1], name };
}

/** Admin Dashboard: Codes und Tester. */
export async function betaRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/beta", async (): Promise<IBetaView> => {
        requireDatabase();

        const [settings, codes, testers] = await Promise.all([readSettings(), listCodes(), listTesters()]);
        const refs = await userRefs(config, testers.map((tester) => tester.userId));

        return {
            mode: settings.mode,
            changedAt: settings.modeChangedAt?.toISOString() ?? null,
            codes,
            testers: testers.map((tester) => ({
                userId: tester.userId,
                name: refs.get(tester.userId)?.name ?? null,
                avatar: refs.get(tester.userId)?.avatar ?? null,
                code: tester.code,
                redeemedAt: tester.redeemedAt.toISOString(),
            })),
        };
    });

    app.post("/api/beta/codes", async (request): Promise<{ codes: IBetaCode[] }> => {
        const actor = accessOf(request);
        const input = parseCodesInput(request.body);

        requireDatabase();

        const codes = await createCodes(input, actor.id);
        const uses = input.maxUses === 1 ? "je eine Nutzung" : `je ${input.maxUses} Nutzungen`;

        await audit(actor, "beta.codes", null, `${codes.length} ${codes.length === 1 ? "Code" : "Codes"}, ${uses}${input.note ? ` · ${input.note}` : ""}`);
        publish("beta");

        return { codes };
    });

    app.post("/api/beta/codes/:id/revoke", async (request): Promise<{ ok: true }> => {
        const actor = accessOf(request);
        const codeId = id((request.params as { id?: string }).id);

        requireDatabase();

        const code = await revokeCode(codeId);
        if (!code) throw new PublicError(404, "Diesen Code gibt es nicht, oder er ist schon gesperrt.");

        await audit(actor, "beta.revoke", null, code);
        publish("beta");

        return { ok: true };
    });

    app.delete("/api/beta/members/:userId", async (request): Promise<{ ok: true }> => {
        const actor = accessOf(request);
        const userId = snowflake((request.params as { userId?: string }).userId);

        requireDatabase();

        if (!(await removeTester(userId))) throw new PublicError(404, "Diese Person hat keinen Beta-Zugang.");

        await audit(actor, "beta.remove", userId);
        publish("beta");

        return { ok: true };
    });
}

/** Für den Bot: einen Code einlösen. 200 { ok, already? }, 400 mit Satz, 401 ohne Token. */
export async function internalBetaRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    // Je Person statt je Absender: Alle Anfragen kommen vom Bot. Ohne gültiges Token zählt die Adresse.
    const perPerson = (request: FastifyRequest): string => {
        try {
            return `beta:${botActor(config, request).id}`;
        } catch {
            return request.ip;
        }
    };

    app.post("/internal/beta/redeem", { config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: perPerson } } }, async (request): Promise<{ ok: true; already?: true }> => {
        const actor = botActor(config, request);
        const code = normalizeCode(body(request.body).code);

        requireDatabase();

        if (!code) throw new PublicError(400, INVALID);

        const result = await redeem(actor.id, code);

        if (result === "invalid") throw new PublicError(400, INVALID);
        if (result === "already") return { ok: true, already: true };

        await audit(actor, "beta.redeem", actor.id, code);
        publish("beta");

        return { ok: true };
    });
}
