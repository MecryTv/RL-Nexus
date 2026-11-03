import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

/**
 * IPs nie im Klartext (W-0057, Spec Teil 4): gespeichert wird ein HMAC-SHA256
 * der IP und einer des Netzes (IPv4 /24, IPv6 /48). Ohne den Schlüssel lässt
 * sich das nicht zurückrechnen, auch nicht durch Ausprobieren aller Adressen.
 */

/** IP_HASH_SECRET, sonst ein aus SERVER_JWT_SECRET abgeleiteter Schlüssel (Entscheidung 49). */
export function hashSecret(ipHashSecret: string | null, jwtSecret: string): string {
    return ipHashSecret || createHmac("sha256", jwtSecret).update("rl-nexus:ip-hash").digest("hex");
}

function expandIPv6(ip: string): string[] | null {
    const [head, tail, ...rest] = ip.split("::");
    if (rest.length) return null;

    const left = head ? head.split(":") : [];
    const right = tail === undefined ? [] : tail ? tail.split(":") : [];
    const missing = 8 - left.length - right.length;

    if (tail === undefined ? left.length !== 8 : missing < 1) return null;

    return [...left, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...right].map((group) => group.padStart(4, "0").toLowerCase());
}

/** Das Netz einer IP: „203.0.113.0/24“ bzw. „2001:0db8:abcd::/48“. null: keine gültige IP. */
export function networkOf(raw: string): string | null {
    const ip = raw.startsWith("::ffff:") && isIPv4(raw.slice(7)) ? raw.slice(7) : raw;

    if (isIPv4(ip)) return `${ip.split(".").slice(0, 3).join(".")}.0/24`;
    if (!isIPv6(ip)) return null;

    const groups = expandIPv6(ip.split("%")[0] ?? ip);

    return groups ? `${groups.slice(0, 3).join(":")}::/48` : null;
}

/** Die beiden Kürzel einer IP. null: keine gültige IP, dann wird nichts gespeichert. */
export function ipHashes(secret: string, raw: string): { readonly ip: string; readonly net: string } | null {
    const net = networkOf(raw);
    if (!net) return null;

    const ip = raw.startsWith("::ffff:") && isIPv4(raw.slice(7)) ? raw.slice(7) : raw.toLowerCase();

    return {
        ip: createHmac("sha256", secret).update(`ip:${ip}`).digest("hex"),
        net: createHmac("sha256", secret).update(`net:${net}`).digest("hex"),
    };
}
