import type { IMailBox } from "../../shared/api.ts";

/**
 * Adressen im Postfach (W-0053): ein Reiter je Postfach, keine Ansicht
 * „Alle Posteingänge“ mehr. Ohne React, damit npm run check es prüfen kann.
 */

/** Die Adresse eines Ordners oder einer Mail darin. Ordnernamen können Schrägstriche enthalten. */
export function mailPath(account: number, folder: string, uid?: number): string {
    return `/post/${account}/${encodeURIComponent(folder)}${uid === undefined ? "" : `/${uid}`}`;
}

/** Der Pfad des Posteingangs. Ist das Postfach nicht erreichbar, heißt er bei IMAP immer `INBOX`. */
export function inboxOf(box: IMailBox): string {
    return box.folders?.find((folder) => folder.role === "inbox")?.path ?? "INBOX";
}

export function inboxUnread(box: IMailBox): number {
    return box.folders?.find((folder) => folder.role === "inbox")?.unread ?? 0;
}

/** Wohin /post führt: das erste Postfach mit ungelesener Post, sonst das erste. Ohne Postfach nirgends hin. */
export function startPath(boxes: readonly IMailBox[]): string | null {
    const box = boxes.find((entry) => inboxUnread(entry) > 0) ?? boxes[0];

    return box ? mailPath(box.id, inboxOf(box)) : null;
}

/** Alte Links auf /post/alle/<Postfach>/<Mail> aus Hinweis-Mails und Discord. */
export function legacyAllPath(boxes: readonly IMailBox[], account: number | null, uid: number | null): string {
    const box = boxes.find((entry) => entry.id === account);

    if (box && uid !== null) return mailPath(box.id, inboxOf(box), uid);

    return startPath(boxes) ?? "/post";
}
