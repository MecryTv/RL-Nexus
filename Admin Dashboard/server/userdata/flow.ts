import { USERDATA_AREAS, type IDeletionResult } from "../../shared/userdata.ts";
import type { IConfig } from "../config.ts";
import { removeButtons } from "../discord.ts";
import { lookupUser } from "../users.ts";
import type { IDeletionRecord } from "./deletions.ts";
import { sendDeletionDm, type DmKind, type IDmInput } from "./dm.ts";
import { personRows, userdataRules } from "./find.ts";

/** Was die DMs zur Löschung brauchen (W-0051, Teil 3b): Name, Bild, Bereiche. */

async function avatarBytes(url: string | null): Promise<Buffer | null> {
    if (!url) return null;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    } catch {
        return null;
    }
}

/** Name und Profilbild aus Discord, sonst der gespeicherte Name. */
export async function personBase(config: IConfig, userId: string, stored: string | null): Promise<{ readonly name: string; readonly avatar: Buffer | null }> {
    const user = await lookupUser(config, userId).catch(() => null);

    return { name: user?.name ?? stored ?? "du", avatar: await avatarBytes(user?.avatar ?? null) };
}

/** Für Ankündigung und Vorschau: was gelöscht wird (je Bereich mit Servern) und was bleibt. */
export async function announcementInput(config: IConfig, userId: string, dueAt: Date, stored: string | null, now = new Date()): Promise<IDmInput> {
    const [base, rows, rules] = await Promise.all([personBase(config, userId, stored), personRows(userId), userdataRules()]);
    const areas: { label: string; rows: number; servers: number }[] = [];
    const kept: { label: string; rows: number; note: string }[] = [];
    const guilds = new Set<string>();

    for (const area of USERDATA_AREAS) {
        const found = rows.filter((row) => row.area === area.id);
        if (found.length === 0) continue;

        const inArea = new Set(found.flatMap((row) => (row.guildId ? [row.guildId] : [])));
        const rule = rules.find((entry) => entry.area === area.id);

        for (const guild of inArea) guilds.add(guild);
        if (rule?.keep) kept.push({ label: area.label, rows: found.length, note: rule.note ?? "" });
        else areas.push({ label: area.label, rows: found.length, servers: inArea.size });
    }

    areas.sort((a, b) => b.rows - a.rows);

    return { ...base, sentAt: now, dueAt, areas, kept, total: areas.reduce((sum, area) => sum + area.rows, 0), servers: guilds.size };
}

/** Folgenachrichten ohne Bereiche: angehalten, abgebrochen. */
export async function plainInput(config: IConfig, record: IDeletionRecord, now = new Date()): Promise<IDmInput> {
    return { ...(await personBase(config, record.userId, record.userName)), sentAt: now, dueAt: new Date(record.dueAt), areas: [], kept: [], total: 0, servers: 0 };
}

const sum = (counts: IDeletionResult["deleted"]): number => Object.values(counts).reduce((total, value) => total + (value ?? 0), 0);

/** Eine Folgenachricht schicken und die Knöpfe der Ankündigung entfernen. */
export async function followUp(config: IConfig, record: IDeletionRecord, kind: Exclude<DmKind, "ankuendigung" | "kopie">, input: IDmInput): Promise<void> {
    await sendDeletionDm(config, record, kind, input);

    if (record.dmChannelId && record.dmMessageId) await removeButtons(config, record.dmChannelId, record.dmMessageId);
}

/** Nach dem Löschen: „Erledigt“ mit den Zahlen. base kommt von vorher, der Name ist danach leer. */
export function finishedInput(base: { readonly name: string; readonly avatar: Buffer | null }, record: IDeletionRecord, result: IDeletionResult, now = new Date()): IDmInput {
    return { ...base, sentAt: now, dueAt: new Date(record.dueAt), areas: [], kept: result.kept, total: sum(result.deleted) + sum(result.anonymized), servers: result.servers };
}
