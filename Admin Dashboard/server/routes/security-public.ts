import type { FastifyInstance } from "fastify";
import type { IBlockedView } from "../../shared/security.ts";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { open, seal } from "../session.ts";

/**
 * Sperrseite und VPN-Seite der Webseite (W-0057, C4c und V-A+): Der
 * Shop-Callback schickt gesperrte oder blockierte Anmeldungen nach
 * /gesperrt?s=…, die Seite holt sich hier, was sie zeigt. Der Wert ist
 * versiegelt und 15 Minuten gültig, eine Sitzung entsteht dabei nicht.
 */

const LIFETIME = 15 * 60_000;

export function blockedToken(config: IConfig, view: IBlockedView, now = Date.now()): string {
    return seal({ ...view, exp: now + LIFETIME }, config.jwtSecret);
}

export async function publicSecurityRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/public/security/blocked", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request): Promise<IBlockedView> => {
        const token = String((request.query as { s?: string }).s ?? "");
        const value = token ? open<IBlockedView & { exp?: number }>(token, config.jwtSecret) : null;

        if (!value || typeof value.exp !== "number" || value.exp < Date.now() || (value.kind !== "ban" && value.kind !== "vpn")) throw new PublicError(404, "Dieser Link ist abgelaufen. Melde dich neu an.");

        const { exp: _exp, ...view } = value;

        return view;
    });
}
