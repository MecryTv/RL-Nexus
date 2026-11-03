import { EVIDENCE_MAX, EVIDENCE_TYPES, type ISuspectView, type IVpnLoginView, type Preset } from "../../shared/security.ts";
import { formatBytes } from "../format";

/** Kleinkram für den Bereich Sicherheit (W-0057), ohne Komponenten. */

export const PRESET_TONE: Readonly<Record<Preset, "danger" | "warn" | "info">> = { voll: "danger", besitz: "warn", eigene: "info" };

export const RESULT_LABELS: Readonly<Record<IVpnLoginView["result"], string>> = {
    in: "rein",
    marked: "rein, markiert",
    blocked: "blockiert",
    unchecked: "ohne Prüfung",
    banned: "gesperrt",
};

export const RESULT_TONE: Readonly<Record<IVpnLoginView["result"], "ok" | "info" | "warn" | "danger" | "neutral">> = {
    in: "ok",
    marked: "info",
    blocked: "warn",
    unchecked: "neutral",
    banned: "danger",
};

/** „12 Tage“, „5 Monate“, „2 Jahre“ */
export function ageText(days: number): string {
    if (days < 60) return `${days} ${days === 1 ? "Tag" : "Tage"}`;
    if (days < 730) return `${Math.floor(days / 30)} Monate`;

    return `${Math.floor(days / 365)} Jahre`;
}

/** Der Hinweis zu einem Verdachtsfall wie in der Spec. */
export function suspectHint(suspect: Pick<ISuspectView, "kind" | "banned">): string {
    const who = suspect.banned?.name ?? "einer gesperrten Person";

    if (suspect.kind === "same_ip") return `gleiche IP wie ${who}, ohne VPN`;
    if (suspect.kind === "net") return `VPN, gleiches Netz wie ${who}`;

    return "VPN, Konto unter 30 Tage";
}

export const DISCORD_MESSAGE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(?:\d{17,20}|@me)\/\d{17,20}\/\d{17,20}$/;

/** Ein Beleg, der noch hochgeladen wird: Bild als base64 oder Link zu einer Discord-Nachricht. */
export type PendingEvidence = { readonly kind: "file"; readonly name: string; readonly mime: string; readonly size: number; readonly data: string } | { readonly kind: "link"; readonly link: string };

/** Liest ein Bild für die Belege. Wirft mit einem Satz, wenn Typ oder Größe nicht passen. */
export async function readEvidence(file: File): Promise<PendingEvidence> {
    if (!(EVIDENCE_TYPES as readonly string[]).includes(file.type)) throw new Error(`${file.name}: nur PNG, JPG oder WebP.`);
    if (file.size > EVIDENCE_MAX) throw new Error(`${file.name}: höchstens ${formatBytes(EVIDENCE_MAX)} je Bild.`);

    const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`${file.name} ließ sich nicht lesen.`));
        reader.readAsDataURL(file);
    });

    return { kind: "file", name: file.name || "bild.png", mime: file.type, size: file.size, data: url.slice(url.indexOf(",") + 1) };
}

export function evidenceBody(entry: PendingEvidence): Readonly<Record<string, unknown>> {
    return entry.kind === "link" ? { link: entry.link } : { name: entry.name, mime: entry.mime, data: entry.data };
}
