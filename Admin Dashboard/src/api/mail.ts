import type { IMailAddress, IMailOverview } from "../../shared/api";
import { useLive } from "./live";
import { useApi, type IApiState } from "./useApi";

/**
 * Das Postfach im Browser: Adressen der Ansichten, die Übersicht mit allen
 * Postfächern und Ordnern und die Zahl für die Seitenleiste.
 */

/** Die Adresse eines Ordners oder einer Mail darin. Ordnernamen können Schrägstriche enthalten. */
export function mailPath(account: number, folder: string, uid?: number): string {
    return `/post/${account}/${encodeURIComponent(folder)}${uid === undefined ? "" : `/${uid}`}`;
}

/** „Alle Posteingänge“ oder eine Mail darin. */
export function allPath(account?: number, uid?: number): string {
    return account === undefined || uid === undefined ? "/post/alle" : `/post/alle/${account}/${uid}`;
}

const BOX_COLORS = ["var(--c-blue)", "var(--c-purple)", "var(--c-win)", "var(--c-red)"];

/** Jedes Postfach bekommt seinen Punkt, in der Seitenleiste wie in der Liste. */
export function boxColor(index: number): string {
    return BOX_COLORS[index % BOX_COLORS.length];
}

/**
 * Alle Postfächer mit Ordnern und Zahlen. Neue Mails meldet der Server über
 * `mail`. Die Minute bleibt als Netz, falls die Verbindung hängt.
 */
export function useMailOverview(): IApiState<IMailOverview> {
    const state = useApi<IMailOverview>("/api/mail", 60_000);

    useLive("mail", state.reload);

    return state;
}

/** Ungelesenes in den Posteingängen aller Postfächer. null: noch unbekannt. */
export function unreadOf(overview: IMailOverview | null): number | null {
    if (overview === null) return null;

    return overview.boxes.reduce((sum, box) => sum + (box.folders?.find((folder) => folder.role === "inbox")?.unread ?? 0), 0);
}

export function formatAddress(entry: IMailAddress): string {
    return entry.name ? `${entry.name} <${entry.address}>` : entry.address;
}

/** Wie jemand in Liste und Kopf heißt: Name, sonst Adresse. */
export function displayName(entry: IMailAddress | null): string {
    if (entry === null) return "Unbekannt";

    return entry.name || entry.address;
}

/** Zwei Buchstaben für das runde Bild neben dem Absender. */
export function initialsOf(entry: IMailAddress | null): string {
    const name = displayName(entry).replace(/["']/g, "").trim();
    const parts = name.split(/[\s@._-]+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);

    return letters.toUpperCase() || "?";
}

/** Zeit in der Liste: heute die Uhrzeit, dieses Jahr Tag und Monat, sonst mit Jahr. */
export function listTime(iso: string, now = new Date()): string {
    const date = new Date(iso);

    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "gestern";

    return date.toLocaleDateString("de-DE", date.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

    return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** „Re: “ nur einmal davor. */
export function prefixed(prefix: "Re" | "Fwd", subject: string): string {
    const pattern = prefix === "Re" ? /^(re|aw|antw):\s*/i : /^(fwd?|wg):\s*/i;

    return pattern.test(subject) ? subject : `${prefix}: ${subject}`;
}
