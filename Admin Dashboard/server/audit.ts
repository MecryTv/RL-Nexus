import { databaseReady, query } from "./db.ts";

export interface IActor {
    readonly id: string;
    readonly name: string;
}

/**
 * Eine Zeile ins Protokoll. Wirft nie: ein fehlender Eintrag darf keine
 * Aktion verhindern. Ohne Datenbank passiert nichts.
 */
export async function audit(actor: IActor, action: string, target: string | null = null, detail: string | null = null): Promise<void> {
    if (!databaseReady()) return;

    try {
        await query("INSERT INTO admin_audit (user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?)", [
            actor.id,
            actor.name.slice(0, 64),
            action,
            target?.slice(0, 190) ?? null,
            detail?.slice(0, 500) ?? null,
        ]);
    } catch (error) {
        console.error(`⚠️  Protokoll nicht geschrieben (${action}): ${error instanceof Error ? error.message : String(error)}`);
    }
}
