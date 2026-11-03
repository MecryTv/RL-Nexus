import type { FastifyInstance } from "fastify";
import { verifyToken } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { checkLogin, type ILoginOutcome } from "../security/login.ts";
import { body, snowflake, text } from "../validate.ts";

/**
 * Das Bot-Dashboard fragt bei jeder Anmeldung nach (W-0057, D3, Entscheidung
 * 47): Sperre, gleiche IP, VPN. Token mit Scope "security". Proxycheck fragt
 * nur dieses Dashboard, der Key liegt nur hier.
 */
export async function internalSecurityRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.post("/internal/security/check", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request): Promise<ILoginOutcome> => {
        const authorization = request.headers.authorization ?? "";
        const payload = authorization.startsWith("Bearer ") ? verifyToken(config.jwtSecret, authorization.slice(7)) : null;

        if (!payload?.scope.includes("security")) throw new PublicError(401, "Nur für den Bot.");

        const input = body(request.body);
        const avatar = typeof input.avatar === "string" && input.avatar.startsWith("https://") ? input.avatar.slice(0, 300) : null;

        return checkLogin(config, {
            userId: snowflake(input.userId, "Die Discord-ID"),
            name: text(input.name, "Der Name", { min: 1, max: 100 }),
            avatar,
            ip: text(input.ip, "Die Adresse", { min: 2, max: 64 }),
            service: "dashboard",
        });
    });
}
