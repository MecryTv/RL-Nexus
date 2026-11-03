/**
 * VPN-Erkennung über proxycheck.io (W-0057, D3). Fragt nur das Admin
 * Dashboard (Entscheidung 47). Ohne Key, bei einem Fehler oder nach 3
 * Sekunden ohne Antwort kommt null zurück: Dann wird niemand blockiert.
 * Die IP geht nur an Proxycheck und steht nirgends im Log.
 */

export const PROXYCHECK_TIMEOUT = 3_000;

export interface IProxyResult {
    readonly vpn: boolean;
    readonly type: string | null;
    readonly asn: string | null;
    readonly provider: string | null;
}

export async function proxycheck(key: string | null, ip: string, timeout = PROXYCHECK_TIMEOUT): Promise<IProxyResult | null> {
    if (!key) return null;

    try {
        const response = await fetch(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?${new URLSearchParams({ key, vpn: "1", asn: "1" })}`, { signal: AbortSignal.timeout(timeout) });
        if (!response.ok) return null;

        const body = (await response.json()) as Record<string, unknown>;
        const entry = body[ip] as { proxy?: unknown; type?: unknown; asn?: unknown; provider?: unknown } | undefined;

        if ((body.status !== "ok" && body.status !== "warning") || !entry || (entry.proxy !== "yes" && entry.proxy !== "no")) return null;

        const text = (value: unknown): string | null => (typeof value === "string" && value ? value.slice(0, 60) : null);

        return { vpn: entry.proxy === "yes", type: text(entry.type), asn: text(entry.asn), provider: text(entry.provider) };
    } catch {
        return null;
    }
}
