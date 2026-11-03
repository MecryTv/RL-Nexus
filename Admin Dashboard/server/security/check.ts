/**
 * Prüfung bei jeder Anmeldung (W-0057, D3), die Entscheidung ohne Datenbank.
 * Reihenfolge: Sperre der Discord-ID; gleiche IP wie eine gesperrte Person
 * ohne VPN (rein, Verdacht); VPN mit Konto unter 30 Tagen oder im Netz einer
 * gesperrten Person (blockiert, Verdacht); sonst VPN markiert. Ohne Ergebnis
 * von Proxycheck wird niemand blockiert.
 */

export const YOUNG_DAYS = 30;

export type LoginResult = "in" | "marked" | "blocked" | "unchecked" | "banned";
export type SuspectKind = "same_ip" | "vpn_young" | "net";

export interface ILoginInput {
    /** Die Sperre der Person gilt für diesen Dienst. */
    readonly banned: boolean;
    /** Sperre einer anderen Person mit derselben IP. */
    readonly sameIp: number | null;
    /** Sperre einer anderen Person im selben Netz. */
    readonly sameNet: number | null;
    /** Ergebnis von Proxycheck, null: nicht geprüft. */
    readonly vpn: boolean | null;
    readonly accountDays: number;
}

export function decideLogin(input: ILoginInput): { readonly result: LoginResult; readonly suspect: { readonly kind: SuspectKind; readonly banId: number | null } | null } {
    if (input.banned) return { result: "banned", suspect: null };

    if (input.vpn === true) {
        if (input.sameNet !== null) return { result: "blocked", suspect: { kind: "net", banId: input.sameNet } };
        if (input.accountDays < YOUNG_DAYS) return { result: "blocked", suspect: { kind: "vpn_young", banId: null } };

        return { result: "marked", suspect: null };
    }

    const suspect = input.sameIp !== null ? { kind: "same_ip" as const, banId: input.sameIp } : null;

    return { result: input.vpn === null ? "unchecked" : "in", suspect };
}
