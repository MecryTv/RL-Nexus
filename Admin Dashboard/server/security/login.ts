import { blocks, type Block, type IBlockedView, type Service } from "../../shared/security.ts";
import { discordSince } from "../../shared/userdata.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { decideLogin, type LoginResult } from "./check.ts";
import { hashSecret, ipHashes } from "./hash.ts";
import { proxycheck } from "./proxycheck.ts";
import * as store from "./store.ts";

/**
 * Prüfung D3 bei jeder Anmeldung mit Discord (W-0057): Webseite und Shop
 * über den Shop-Callback, das Bot-Dashboard über /internal/security/check.
 * Wirft nie: Jeder Fehler heißt „ohne Prüfung“, und dann ist man drin.
 * Die IP steht nirgends, weder in der Datenbank noch im Log.
 */

export interface ILoginCheck {
    readonly userId: string;
    readonly name: string;
    readonly avatar: string | null;
    readonly ip: string;
    readonly service: Service;
}

export interface ILoginOutcome {
    readonly result: LoginResult;
    /** Für Sperrseite oder VPN-Seite, wenn die Anmeldung nicht durchgeht. */
    readonly view: IBlockedView | null;
}

const DAY = 86_400_000;

export async function checkLogin(config: IConfig, input: ILoginCheck, now = new Date()): Promise<ILoginOutcome> {
    const unchecked: ILoginOutcome = { result: "unchecked", view: null };

    if (!databaseReady()) return unchecked;

    try {
        const ban = await store.activeBanOf(input.userId);
        const scope: Block[] = ban ? store.scopeOfRow(ban) : [];
        const hashes = ipHashes(hashSecret(config.ipHashSecret, config.jwtSecret), input.ip);
        const view = (kind: "ban" | "vpn"): IBlockedView => ({
            kind,
            service: input.service,
            name: input.name,
            avatar: input.avatar,
            scope: kind === "ban" ? scope : [],
            since: kind === "ban" && ban ? ban.created_at.toISOString() : null,
            changedAt: kind === "ban" && ban?.changed_at ? ban.changed_at.toISOString() : null,
            checkedAt: now.toISOString(),
        });

        // Auch nach dem Sperrtag: neue Adressen der gesperrten Person kommen zur Sperre (gleiche IP, neues Konto).
        if (ban && hashes) await store.keepHashes(ban.id, hashes);

        if (ban && blocks(scope, input.service)) {
            if (hashes) await store.recordLogin({ userId: input.userId, service: input.service, ipHash: hashes.ip, netHash: hashes.net, asn: null, vpn: null, result: "banned", reason: `Sperre ${ban.id}` });

            return { result: "banned", view: view("ban") };
        }

        if (!hashes) return unchecked;

        const [sameIp, sameNet, proxy] = await Promise.all([
            store.banWithHash("ip_hash", hashes.ip, input.userId),
            store.banWithHash("net_hash", hashes.net, input.userId),
            proxycheck(config.proxycheckKey, input.ip),
        ]);
        const accountDays = (now.getTime() - new Date(discordSince(input.userId)).getTime()) / DAY;
        const decision = decideLogin({ banned: false, sameIp, sameNet, vpn: proxy?.vpn ?? null, accountDays });

        await store.recordLogin({
            userId: input.userId,
            service: input.service,
            ipHash: hashes.ip,
            netHash: hashes.net,
            asn: proxy?.asn ?? null,
            vpn: proxy ? proxy.vpn : null,
            result: decision.result,
            reason: decision.suspect ? `${decision.suspect.kind}${decision.suspect.banId ? ` Sperre ${decision.suspect.banId}` : ""}` : proxy?.type ?? null,
        });

        if (decision.suspect) await store.addSuspect(input.userId, decision.suspect.banId, decision.suspect.kind, input.service);

        return { result: decision.result, view: decision.result === "blocked" ? view("vpn") : null };
    } catch (error) {
        // Nur der Text des Fehlers, nie die IP.
        console.error(`🛡️  Anmeldeprüfung nicht möglich, Person darf rein: ${error instanceof Error ? error.message : String(error)}`);

        return unchecked;
    }
}
