import type { FastifyReply, FastifyRequest } from "fastify";
import type { IMe, Role } from "../shared/api.ts";
import type { IConfig } from "./config.ts";
import { DiscordUnavailable, avatarUrl, displayName, fetchMember } from "./discord.ts";
import { SESSION_COOKIE, clearCookie, open, parseCookies, type ISession } from "./session.ts";

/**
 * Wer herein darf, und das bei jeder Anfrage aufs Neue.
 *
 * Die Rolle steht nicht im Cookie. Sie kommt aus einer Abfrage beim
 * Discord-Server, eine Minute zwischengespeichert: Wer die Rolle verliert, ist
 * nach spätestens einer Minute draußen, und ein Wechsel zwischen Admin und
 * Developer greift genauso schnell.
 */

declare module "fastify" {
    interface FastifyRequest {
        /** Gesetzt von requireSession, in jeder Route dahinter vorhanden. */
        access?: IMe;
    }
}

/** So lange gilt eine Prüfung. */
const FRESH = 60_000;
/** So lange gilt der letzte Stand, wenn Discord nicht antwortet. */
const STALE = 5 * 60_000;

export interface IMemberCheck {
    readonly member: boolean;
    readonly role: Role | null;
    readonly name: string;
    readonly avatar: string | null;
    readonly checkedAt: number;
}

export interface ICheckOptions {
    /** Die Uhrzeit, gegen die gerechnet wird. Nur der Check setzt sie. */
    readonly now?: number;
    /** Ohne Zwischenspeicher fragen, etwa direkt beim Login. */
    readonly force?: boolean;
}

// ponytail: Map ohne Obergrenze, ein Eintrag je Admin. Für eine Handvoll Leute
// reicht das, bei Tausenden bräuchte es einen LRU.
const checks = new Map<string, IMemberCheck>();

export function roleFrom(roles: readonly string[], config: Pick<IConfig, "adminRoleId" | "developerRoleId">): Role | null {
    if (roles.includes(config.developerRoleId)) return "developer";
    if (roles.includes(config.adminRoleId)) return "admin";

    return null;
}

export async function checkMember(
    config: IConfig,
    userId: string,
    fallback: { readonly name: string; readonly avatar: string | null },
    { now = Date.now(), force = false }: ICheckOptions = {}
): Promise<IMemberCheck> {
    const known = checks.get(userId);
    if (!force && known && now - known.checkedAt < FRESH) return known;

    try {
        const member = await fetchMember(config, userId);

        const result: IMemberCheck = member
            ? {
                  member: true,
                  role: roleFrom(member.roles, config),
                  name: member.user ? displayName(member.user, member.nick) : fallback.name,
                  avatar: member.user ? avatarUrl(userId, member.user.avatar) : fallback.avatar,
                  checkedAt: now,
              }
            : { member: false, role: null, name: fallback.name, avatar: fallback.avatar, checkedAt: now };

        checks.set(userId, result);

        return result;
    } catch (error) {
        if (error instanceof DiscordUnavailable && known && now - known.checkedAt < STALE) return known;

        throw error;
    }
}

/** Die gemerkte Prüfung vergessen, etwa beim Abmelden. */
export function forgetMember(userId: string): void {
    checks.delete(userId);
}

/** Nur eigene Pfade: keine volle Adresse, kein //fremde.seite, kein Backslash. */
export function safeReturn(value: unknown): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";

    return value;
}

export function readSession(request: FastifyRequest, config: IConfig, now = Date.now()): ISession | null {
    const session = open<ISession>(parseCookies(request.headers.cookie)[SESSION_COOKIE] ?? "", config.jwtSecret);

    if (!session || typeof session.id !== "string" || typeof session.exp !== "number") return null;

    return session.exp * 1000 > now ? session : null;
}

/** Wer anfragt. Hinter requireSession immer gesetzt. */
export function accessOf(request: FastifyRequest): IMe {
    if (!request.access) throw new Error("accessOf() ohne requireSession aufgerufen.");

    return request.access;
}

/** onRequest-Hook für alles, was eine Sitzung braucht. */
export function requireSession(config: IConfig) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const session = readSession(request, config);
        if (!session) return reply.code(401).send({ error: "Dafür musst du angemeldet sein." });

        let result: IMemberCheck;

        try {
            result = await checkMember(config, session.id, session);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`🔐 Rollenprüfung für ${session.id} gescheitert: ${reason}`);

            // Lokal mit --dev liegt es fast immer an der Einrichtung (Bot nicht
            // auf dem Server, falsche ID). Dann soll der Grund im Browser stehen.
            return reply
                .code(503)
                .send({ error: config.developerMode && error instanceof DiscordUnavailable ? reason : "Discord antwortet gerade nicht. Versuch es gleich noch einmal." });
        }

        if (!result.role) {
            return reply
                .code(401)
                .header("Set-Cookie", clearCookie(SESSION_COOKIE, "/", config.secureCookies))
                .send({ error: "Dir fehlt inzwischen die Rolle auf dem Discord-Server." });
        }

        request.access = { id: session.id, name: result.name, avatar: result.avatar, role: result.role };
    };
}

/** onRequest-Hook für Developer-Routen, läuft hinter requireSession. Die Oberfläche blendet sie nur aus. */
export async function developerOnly(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    if (request.access?.role !== "developer") return reply.code(403).send({ error: "Das dürfen nur Developer." });

    return undefined;
}

/**
 * Schreibende Anfragen nur von der eigenen Seite und nur als JSON.
 *
 * Zusammen mit SameSite=Lax reicht das gegen CSRF: Ein Browser schickt bei
 * jeder schreibenden Anfrage ein Origin mit, und eine fremde Seite kann es
 * nicht fälschen. Ausgenommen ist /public/, das Kontaktformular der Webseite.
 */
export function guardWrites(config: IConfig) {
    const origin = new URL(config.publicUrl).origin;

    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        // /internal/ ruft nur der Bot mit eigenem Token, kein Browser: Herkunft prüfen ergäbe dort nichts.
        if (request.method === "GET" || request.method === "HEAD" || request.url.startsWith("/public/") || request.url.startsWith("/internal/")) return;

        if (request.headers.origin !== origin) {
            return reply.code(403).send({ error: "Diese Anfrage kam nicht vom Admin Dashboard." });
        }

        const type = request.headers["content-type"];

        // Eine Ausnahme: Mails mit Anhängen kommen als multipart/form-data.
        // Die Herkunft ist oben trotzdem geprüft.
        const upload = type?.startsWith("multipart/form-data") === true && request.url.split("?")[0] === "/api/mail/send";

        if (type !== undefined && !type.startsWith("application/json") && !upload) {
            return reply.code(415).send({ error: "Hier geht nur JSON." });
        }
    };
}
