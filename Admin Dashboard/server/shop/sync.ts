import type { IConfig } from "../config.ts";
import { addGuildMember, fetchMember, fetchRoles, refreshShopTokens, setMemberRole, type IShopTokens } from "../discord.ts";
import { open, seal } from "../session.ts";
import { isActive, rolePlan, type IGrant } from "./grants.ts";
import { clearTokens, grantsOf, logEvent, markJoined, saveTokens, tokensOf } from "./records.ts";
import { tokenSecret } from "./session.ts";

/**
 * Bringt Server und Rollen einer Person auf den Stand ihrer Zugänge. Wird
 * nach Login, Test, Kauf, Ablauf und Sperre aufgerufen. Scheitert Discord,
 * gilt der Zugang zum Dashboard trotzdem: Der Schritt wird gelb, der Grund
 * steht im Verlauf. Beendete Zugänge versucht der Ablauf-Job jede Minute
 * weiter, gescheiterte Freischaltungen nach einem Kauf alle 30 Minuten, sieben
 * Tage lang.
 */

export type SyncStep = "done" | "warn" | "skip";

export interface ISyncResult {
    readonly joined: SyncStep;
    readonly roles: SyncStep;
    /** Keine Rolle mehr da, die weg muss: entfernt, nichts zu entfernen oder die Person ist nicht auf dem Server. */
    readonly cleared: boolean;
    readonly notes: readonly string[];
}

export interface ISyncOutcome extends ISyncResult {
    /** Was mit den gespeicherten Tokens passieren soll. */
    readonly tokens: "keep" | "clear" | IShopTokens;
    readonly joinedNow: boolean;
}

const ADMINISTRATOR = 1n << 3n;
const ROLE_CACHE = 60_000;
/** Erneuern, wenn das Token in der nächsten Minute abläuft. */
const TOKEN_SLACK = 60_000;

let adminRoles: { readonly at: number; readonly ids: ReadonlySet<string> } | null = null;

/** Für die Checks: die gemerkte Liste vergessen. */
export function forgetAdministratorRoles(): void {
    adminRoles = null;
}

/** Rollen mit Administrator-Recht vergibt der Shop nie, egal was eingestellt ist. Die Liste hält eine Minute. */
async function administratorRoles(config: IConfig): Promise<ReadonlySet<string>> {
    if (adminRoles && Date.now() - adminRoles.at < ROLE_CACHE) return adminRoles.ids;

    const ids = new Set((await fetchRoles(config)).filter((role) => (BigInt(role.permissions || "0") & ADMINISTRATOR) !== 0n).map((role) => role.id));
    adminRoles = { at: Date.now(), ids };

    return ids;
}

function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Die Discord-Seite, ohne Datenbank. Die Checks rufen das mit erfundenen Zugängen auf. */
export async function syncWith(config: IConfig, userId: string, grants: readonly IGrant[], stored: IShopTokens | null, now = new Date()): Promise<ISyncOutcome> {
    const notes: string[] = [];
    const hasAccess = grants.some((grant) => isActive(grant, now));
    let tokens: ISyncOutcome["tokens"] = "keep";
    let joinedNow = false;

    let member;
    try {
        member = await fetchMember(config, userId);
    } catch (error) {
        return { joined: "warn", roles: "warn", cleared: false, notes: [`Discord antwortet nicht: ${reason(error)}`], tokens, joinedNow };
    }

    if (!member) {
        // Wer keinen Zugang hat, wird auch nicht auf den Server geholt.
        if (!hasAccess) return { joined: "skip", roles: "skip", cleared: true, notes, tokens, joinedNow };

        if (!stored) {
            return {
                joined: "warn",
                roles: "warn",
                cleared: true,
                notes: ["Kein gültiges Discord-Token mehr. Die Person muss sich auf der Preisseite neu anmelden, dann holt der Shop sie auf den Server."],
                tokens,
                joinedNow,
            };
        }

        try {
            let current = stored;
            if (current.expiresAt - TOKEN_SLACK < Date.now()) current = await refreshShopTokens(config, current.refreshToken);

            joinedNow = (await addGuildMember(config, userId, current.accessToken)) === "added";
            tokens = "clear";
            member = await fetchMember(config, userId);
        } catch (error) {
            return { joined: "warn", roles: "warn", cleared: true, notes: [reason(error)], tokens, joinedNow };
        }

        if (!member) return { joined: "warn", roles: "warn", cleared: true, notes: ["Beigetreten, aber Discord kennt die Person auf dem Server noch nicht."], tokens, joinedNow };
    } else if (stored) {
        // Schon Mitglied: Die Tokens braucht niemand mehr.
        tokens = "clear";
    }

    const plan = rolePlan(grants, now, member.roles);

    if (plan.add.length === 0 && plan.remove.length === 0) return { joined: "done", roles: hasAccess ? "done" : "skip", cleared: true, notes, tokens, joinedNow };

    let rolesOk = true;
    let removedOk = true;
    let blocked: ReadonlySet<string> = new Set();

    if (plan.add.length > 0) {
        try {
            blocked = await administratorRoles(config);
        } catch (error) {
            return { joined: "done", roles: "warn", cleared: plan.remove.length === 0, notes: [`Die Rollen des Servers ließen sich nicht lesen: ${reason(error)}`], tokens, joinedNow };
        }
    }

    for (const role of plan.add) {
        if (blocked.has(role)) {
            rolesOk = false;
            notes.push(`Die Rolle ${role} hat das Recht „Administrator“ und wird vom Shop nie vergeben. Bitte eine eigene Shop-Rolle einstellen.`);
            continue;
        }

        try {
            await setMemberRole(config, userId, role, true);
        } catch (error) {
            rolesOk = false;
            notes.push(reason(error));
        }
    }

    for (const role of plan.remove) {
        try {
            await setMemberRole(config, userId, role, false);
        } catch (error) {
            rolesOk = false;
            removedOk = false;
            notes.push(reason(error));
        }
    }

    return { joined: "done", roles: rolesOk ? "done" : "warn", cleared: removedOk, notes, tokens, joinedNow };
}

/** Mit Datenbank: Zugänge und Tokens lesen, abgleichen, Ergebnis festhalten. */
export async function syncMember(config: IConfig, userId: string): Promise<ISyncResult> {
    const grants = await grantsOf(userId);
    const sealed = await tokensOf(userId);
    const stored = sealed ? open<IShopTokens>(sealed, tokenSecret(config)) : null;
    const outcome = await syncWith(config, userId, grants, stored);

    if (outcome.tokens === "clear") {
        await clearTokens(userId);
        await markJoined(userId);
    } else if (outcome.tokens !== "keep") {
        await saveTokens(userId, seal(outcome.tokens, tokenSecret(config)), new Date(Date.now() + 7 * 86_400_000));
    }

    if (outcome.joinedNow) await logEvent(userId, "member.joined");
    for (const note of outcome.notes) await logEvent(userId, "sync.warn", note);
    if (outcome.notes.length > 0) console.warn(`🛒 Abgleich für ${userId}: ${outcome.notes.join(" | ")}`);

    return { joined: outcome.joined, roles: outcome.roles, cleared: outcome.cleared, notes: outcome.notes };
}
