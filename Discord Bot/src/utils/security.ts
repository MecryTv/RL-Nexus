import { Interaction } from "discord.js";
import { setTimeout as sleep } from "node:timers/promises";
import BotClient from "../client/BotClient";
import { WaitForDatabase } from "../services/DatabaseService";
import { CreateToken } from "./jwt";
import logger from "./logger";

/**
 * W-0057: die dauerhaften Sperren aus dem Admin Dashboard (Tabelle
 * security_bans in der gemeinsamen Datenbank). Der Bot hält sie im Speicher:
 * beim Start, nach jedem Bescheid (/dcapi/admin/security/reload) und alle
 * 5 Minuten neu. Er sieht nur Discord-IDs, nie IPs.
 */

export const BLOCKS = ["others", "own", "dashboard", "website", "shop"] as const;
export type Block = (typeof BLOCKS)[number];

export interface IBan {
    readonly scope: readonly Block[];
    readonly since: Date;
    readonly changedAt: Date | null;
}

export const RELOAD_EVERY = 5 * 60_000;
/** So lange wartet die erste Interaktion nach dem Start höchstens auf die Liste. */
const FIRST_WAIT = 2_000;

let bans = new Map<string, IBan>();
let loaded = false;
let first: Promise<void> | null = null;

export function ScopeOf(raw: string): Block[] {
    const parts = raw.split(",");

    return BLOCKS.filter((block) => parts.includes(block));
}

/** Für die Checks: die Liste von Hand setzen. */
export function SetBans(entries: Iterable<[string, IBan]>): void {
    bans = new Map(entries);
    loaded = true;
}

/** Liest die aktiven Sperren. Scheitert das, bleibt die alte Liste stehen. */
export async function LoadBans(client: BotClient): Promise<boolean> {
    if (!client.databaseService.Ready) return false;

    try {
        const rows = await client.databaseService.Query<{ user_id: string; scope: string; created_at: Date; changed_at: Date | null }>(
            "SELECT user_id, scope, created_at, changed_at FROM security_bans WHERE state = 'active'"
        );

        SetBans(rows.map((row) => [row.user_id, { scope: ScopeOf(row.scope), since: new Date(row.created_at), changedAt: row.changed_at ? new Date(row.changed_at) : null }]));

        return true;
    } catch (error) {
        logger.warn(`🚫 Sperrliste nicht geladen: ${String(error)}`);

        return false;
    }
}

export function StartBans(client: BotClient): void {
    void WaitForDatabase(client.databaseService).then(() => LoadBans(client));
    setInterval(() => void LoadBans(client), RELOAD_EVERY).unref();
}

export function BanOf(userId: string): IBan | null {
    return bans.get(userId) ?? null;
}

export function BannedFor(userId: string, block: Block): boolean {
    return bans.get(userId)?.scope.includes(block) === true;
}

/** Eigener Server oder alles andere: fremde Server und DMs mit dem Bot (Entscheidung 13). */
export function BlockOf(userId: string, ownerId: string | null): Block {
    return ownerId === userId ? "own" : "others";
}

/** Ob der Bot für diese Person an diesem Ort schweigt. ownerId null heißt DM. */
export function BlockedAt(userId: string, ownerId: string | null): boolean {
    return BannedFor(userId, BlockOf(userId, ownerId));
}

/**
 * Die Prüfstelle vor allen Handlern für Interaktionen (ConstructionHandler):
 * false heißt verwerfen, ohne Antwort. Nach dem Start wartet die erste
 * Interaktion kurz auf die Liste, damit niemand in der Lücke durchrutscht.
 */
export async function Admitted(client: BotClient, interaction: Interaction): Promise<boolean> {
    if (!loaded) {
        // Hängt die Datenbank, geht es nach FIRST_WAIT ohne Liste weiter; sie kommt dann später.
        first ??= Promise.race([WaitForDatabase(client.databaseService, FIRST_WAIT, 100).then(() => LoadBans(client)), sleep(FIRST_WAIT)]).then(() => undefined);
        await first;
    }

    return !BlockedAt(interaction.user.id, interaction.guild?.ownerId ?? null);
}

/** Was die Sperrseite (C4c) und die VPN-Seite (V-A+) zeigen, wie IBlockedView im Admin Dashboard. */
export interface IBlockedView {
    readonly kind: "ban" | "vpn";
    readonly name: string;
    readonly avatar: string | null;
    readonly scope: readonly Block[];
    readonly since: string | null;
    readonly changedAt: string | null;
    readonly checkedAt: string;
}

/**
 * Prüfung D3 bei der Anmeldung ins Bot-Dashboard: Schritt 1 aus der eigenen
 * Liste, Schritte 2 und 3 (gleiche IP, VPN) beim Admin Dashboard. Antwortet
 * das nicht, kommt die Person herein (wie ohne Proxycheck).
 */
export async function LoginCheck(
    client: BotClient,
    person: { userId: string; name: string; avatar: string | null; ip: string }
): Promise<IBlockedView | null> {
    const ban = BanOf(person.userId);

    if (ban?.scope.includes("dashboard")) {
        // Ohne zu warten: Das Admin Dashboard merkt sich den Versuch und neue Kürzel der Adresse.
        void AskAdmin(client, person);

        return { kind: "ban", name: person.name, avatar: person.avatar, scope: ban.scope, since: ban.since.toISOString(), changedAt: ban.changedAt?.toISOString() ?? null, checkedAt: new Date().toISOString() };
    }

    return AskAdmin(client, person);
}

/** Schritte 2 und 3 beim Admin Dashboard. Wirft nie, ohne Antwort heißt es null. */
async function AskAdmin(client: BotClient, person: { userId: string; name: string; avatar: string | null; ip: string }): Promise<IBlockedView | null> {
    const base = client.config.ADMIN_INTERNAL_URL;
    if (!base) return null;

    try {
        const response = await fetch(`${base}/internal/security/check`, {
            method: "POST",
            headers: { Authorization: `Bearer ${CreateToken(client.config.SERVER_JWT_SECRET, "bot", 60_000, ["security"])}`, "Content-Type": "application/json" },
            body: JSON.stringify(person),
            // Proxycheck hat drüben 3 Sekunden, dazu die Datenbank.
            signal: AbortSignal.timeout(6_000),
        });

        if (!response.ok) return null;

        const { view } = (await response.json()) as { view: (IBlockedView & { scope: string[] }) | null };

        return view ? { ...view, scope: ScopeOf(view.scope.join(",")) } : null;
    } catch (error) {
        logger.warn(`🚫 Anmeldung ${person.userId} nicht geprüft: ${String(error)}`);

        return null;
    }
}
