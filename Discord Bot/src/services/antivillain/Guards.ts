import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { BRANDS, HOP_MIN_TEXT, HOP_WINDOW_MS, SCAM_DOMAINS, SLEEPER_MS, STAFF_WORDS } from "../../constants/AntiVillain";

/**
 * Die Wächter von Anti Villain ohne Bilder (Plan 31). Reine Funktionen, ohne
 * Discord - der Dienst reicht hinein, was er aus einer Nachricht weiß.
 */

export interface IPrintInput {
    content: string;
    attachments: { size: number; width: number | null; height: number | null; contentType: string | null }[];
}

/**
 * Fingerabdrücke einer Nachricht: der Text ohne Erwähnungen, klein und mit
 * zusammengefasstem Leerraum, dazu je Anhang Größe, Maße und Typ. Damit fällt
 * dasselbe Bild auch unter anderem Namen auf. Kurze Texte geben keinen Abdruck.
 */
export function Fingerprints(input: IPrintInput): string[] {
    const prints: string[] = [];
    const text = input.content
        .replace(/<(@[!&]?|#)\d+>/g, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    if (text.length >= HOP_MIN_TEXT) prints.push(`t:${createHash("sha1").update(text).digest("hex")}`);
    for (const file of input.attachments) prints.push(`f:${file.size}:${file.width ?? 0}:${file.height ?? 0}:${file.contentType ?? ""}`);

    return prints;
}

/**
 * Kanal-Sprung: in wie vielen verschiedenen Kanälen einer der Fingerabdrücke in
 * der letzten Minute auftauchte.
 *
 * ponytail: im Arbeitsspeicher, je Person höchstens 50 Einträge, nach einer Minute weg.
 */
export class HopTracker {
    private readonly seen = new LRUCache<string, { print: string; channelId: string; at: number }[]>({ max: 5_000, ttl: HOP_WINDOW_MS });

    Note(key: string, channelId: string, prints: string[], now: number): number {
        const recent = (this.seen.get(key) ?? []).filter((entry) => now - entry.at <= HOP_WINDOW_MS);

        for (const print of prints) recent.push({ print, channelId, at: now });
        this.seen.set(key, recent.slice(-50));

        let most = 0;
        for (const print of prints) most = Math.max(most, new Set(recent.filter((entry) => entry.print === print).map((entry) => entry.channelId)).size);

        return most;
    }
}

export function Levenshtein(a: string, b: string): number {
    if (a === b) return 0;

    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let i = 1; i <= a.length; i++) {
        const current = [i];

        for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));

        previous = current;
    }

    return previous[b.length];
}

/** Die Hauptdomain: die letzten beiden Teile, gift.discorcl.com → discorcl.com. */
function MainDomain(host: string): string {
    return host.split(".").slice(-2).join(".");
}

const BRAND_LABELS = [...new Set(BRANDS.map((brand) => brand.split(".")[0]))];
const HOST = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:[a-z]{2,24}))(?=[/\s:?#)]|$)/g;

/** Die Domains in text, die nach Betrug aussehen: bekannt, Punycode oder nachgemacht. Echte Marken nie. */
export function ScamLinks(text: string): string[] {
    const found = new Set<string>();

    for (const match of text.toLowerCase().matchAll(HOST)) {
        const host = match[1];
        const main = MainDomain(host);

        if (BRANDS.includes(main)) continue;
        if (SCAM_DOMAINS.includes(main) || SCAM_DOMAINS.includes(host)) {
            found.add(main);
            continue;
        }
        if (host.split(".").some((part) => part.startsWith("xn--"))) {
            found.add(main);
            continue;
        }

        const label = main.split(".")[0];
        // Lange Marken vertragen zwei falsche Zeichen, kurze nur eins - sonst wäre „disco“ schon Discord.
        if (BRAND_LABELS.some((brand) => brand !== label && Levenshtein(label, brand) <= (brand.length >= 7 ? 2 : 1))) found.add(main);
    }

    return [...found];
}

/** Schreibt jemand @everyone oder @here, ohne es zu dürfen? */
export function EveryoneAttempt(text: string, allowed: boolean): boolean {
    return !allowed && /@(everyone|here)\b/i.test(text);
}

const LOOKS_LIKE: Record<string, string> = { "1": "i", l: "i", "|": "i", "!": "i", "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };

/**
 * Ein Name zum Vergleichen: nur der Teil vor einem Trennzeichen, ohne Team-Wörter,
 * klein, verwechselbare Zeichen gleichgemacht. „Tlm | Admin“ → „tim“.
 */
export function NormalizeName(name: string): string {
    const head = name.split(/\s[|·\-–—]\s|[[(]/)[0] ?? name;
    const words = head
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word && !STAFF_WORDS.includes(word));

    return [...words.join("")]
        .map((char) => LOOKS_LIKE[char] ?? char)
        .join("")
        .replace(/[^a-z0-9äöüß]/g, "");
}

/** 0 bis 1: wie gleich zwei schon normalisierte Namen sind. */
export function NameSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;

    return 1 - Levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Mindestens 90 Tage nichts geschrieben. Ohne Daten kein Schläfer. */
export function IsSleeper(lastMessage: number | null, now: number): boolean {
    return lastMessage !== null && lastMessage > 0 && now - lastMessage >= SLEEPER_MS;
}
