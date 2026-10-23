import { BETA_LIMITS, newCode, type IBetaCode, type IBetaCodesInput } from "../../shared/beta.ts";
import { query, withTransaction } from "../db.ts";
import { InvalidInput } from "../errors.ts";

/**
 * Beta Access (Plan 22): Codes und Tester. Der Bot liest beta_members, um zu
 * wissen, wer im Beta-Modus ins Bot-Dashboard darf; geschrieben wird nur hier.
 */

/** Wie viele einen Beta-Code eingelöst haben. */
export async function countTesters(): Promise<number> {
    const [row] = await query<{ n: number | bigint }[]>("SELECT COUNT(*) AS n FROM beta_members");

    return Number(row?.n ?? 0);
}

function whole(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** POST /api/beta/codes: Anzahl 1–50, Nutzungen 1–1000, Notiz bis 190 Zeichen. */
export function parseCodesInput(raw: unknown): IBetaCodesInput {
    const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

    if (!whole(input.count, 1, BETA_LIMITS.count)) throw new InvalidInput(`Die Anzahl muss eine ganze Zahl von 1 bis ${BETA_LIMITS.count} sein.`);
    if (!whole(input.maxUses, 1, BETA_LIMITS.uses)) throw new InvalidInput(`Die Nutzungen je Code müssen eine ganze Zahl von 1 bis ${BETA_LIMITS.uses} sein.`);

    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > BETA_LIMITS.note) throw new InvalidInput(`Die Notiz darf höchstens ${BETA_LIMITS.note} Zeichen haben.`);

    return { count: input.count, maxUses: input.maxUses, note: note || null };
}

interface ICodeRow {
    readonly id: number;
    readonly code: string;
    readonly max_uses: number;
    readonly uses: number;
    readonly note: string | null;
    readonly created_by: string | null;
    readonly created_at: Date;
    readonly revoked_at: Date | null;
}

function codeOf(row: ICodeRow): IBetaCode {
    return {
        id: row.id,
        code: row.code,
        maxUses: row.max_uses,
        uses: row.uses,
        note: row.note,
        createdBy: row.created_by,
        createdAt: row.created_at.toISOString(),
        revokedAt: row.revoked_at?.toISOString() ?? null,
    };
}

/** Legt die Codes an. Trifft ein Zufall einen vorhandenen Code, gibt es einen neuen. */
export async function createCodes(input: IBetaCodesInput, actorId: string): Promise<IBetaCode[]> {
    const ids: number[] = [];

    for (let index = 0; index < input.count; index++) {
        for (let attempt = 0; ; attempt++) {
            const result = await query<{ affectedRows: number; insertId: number | bigint }>(
                "INSERT IGNORE INTO beta_codes (code, max_uses, note, created_by) VALUES (?, ?, ?, ?)",
                [newCode(), input.maxUses, input.note, actorId]
            );

            if (result.affectedRows === 1) {
                ids.push(Number(result.insertId));
                break;
            }

            // 32^8 Möglichkeiten: Fünfmal hintereinander daneben heißt, etwas anderes stimmt nicht.
            if (attempt >= 5) throw new Error("Kein freier Beta-Code gefunden.");
        }
    }

    const rows = await query<ICodeRow[]>("SELECT * FROM beta_codes WHERE id IN (?) ORDER BY id", [ids]);

    return rows.map(codeOf);
}

export async function listCodes(): Promise<IBetaCode[]> {
    return (await query<ICodeRow[]>("SELECT * FROM beta_codes ORDER BY id DESC LIMIT 500")).map(codeOf);
}

/** Sperrt einen Code. Wer ihn schon eingelöst hat, bleibt Tester. false: den Code gibt es nicht oder er ist schon gesperrt. */
export async function revokeCode(id: number): Promise<string | null> {
    const result = await query<{ affectedRows: number }>("UPDATE beta_codes SET revoked_at = NOW(3) WHERE id = ? AND revoked_at IS NULL", [id]);
    if (result.affectedRows === 0) return null;

    const [row] = await query<{ code: string }[]>("SELECT code FROM beta_codes WHERE id = ?", [id]);

    return row?.code ?? null;
}

export async function listTesters(): Promise<{ userId: string; code: string | null; redeemedAt: Date }[]> {
    const rows = await query<{ user_id: string; code: string | null; redeemed_at: Date }[]>(
        "SELECT m.user_id, c.code, m.redeemed_at FROM beta_members m LEFT JOIN beta_codes c ON c.id = m.code_id ORDER BY m.redeemed_at DESC LIMIT 1000"
    );

    return rows.map((row) => ({ userId: row.user_id, code: row.code, redeemedAt: row.redeemed_at }));
}

/**
 * Entzieht den Beta-Zugang. Der eingelöste Code bleibt für diese Person
 * gesperrt (beta_removals), sonst brächte ein Code mit mehreren Nutzungen sie
 * gleich wieder herein. Ein neuer Code geht. false: die Person war kein Tester.
 */
export async function removeTester(userId: string): Promise<boolean> {
    await query("INSERT IGNORE INTO beta_removals (user_id, code_id) SELECT user_id, code_id FROM beta_members WHERE user_id = ? AND code_id IS NOT NULL", [userId]);

    return (await query<{ affectedRows: number }>("DELETE FROM beta_members WHERE user_id = ?", [userId])).affectedRows > 0;
}

const ALREADY = Symbol("already");

/**
 * Löst einen Code ein, in einer Transaktion: Zählen, Tester eintragen und das
 * Zurücknehmen gehen zusammen durch oder gar nicht, auch wenn die Datenbank
 * mittendrin aussteigt. Ein Code mit einer Nutzung gilt bei gleichzeitigen
 * Versuchen nur einmal (das UPDATE sperrt die Zeile). Wer schon Tester ist,
 * verbraucht nichts; zwei Versuche derselben Person zugleich nehmen die
 * doppelte Zählung mit dem Rollback zurück.
 */
export async function redeem(userId: string, code: string): Promise<"ok" | "already" | "invalid"> {
    if ((await query<{ user_id: string }[]>("SELECT user_id FROM beta_members WHERE user_id = ?", [userId])).length > 0) return "already";

    try {
        return await withTransaction(async (tx) => {
            // Wem der Zugang entzogen wurde, der kommt mit demselben Code nicht zurück. Gleicher Satz wie bei einem unbekannten Code.
            const removed = await tx<{ code_id: number }[]>("SELECT r.code_id FROM beta_removals r JOIN beta_codes c ON c.id = r.code_id WHERE r.user_id = ? AND c.code = ?", [userId, code]);
            if (removed.length > 0) return "invalid" as const;

            const taken = await tx<{ affectedRows: number }>("UPDATE beta_codes SET uses = uses + 1 WHERE code = ? AND revoked_at IS NULL AND uses < max_uses", [code]);
            if (taken.affectedRows === 0) return "invalid" as const;

            const [row] = await tx<{ id: number }[]>("SELECT id FROM beta_codes WHERE code = ?", [code]);
            const inserted = await tx<{ affectedRows: number }>("INSERT IGNORE INTO beta_members (user_id, code_id) VALUES (?, ?)", [userId, row.id]);

            if (inserted.affectedRows === 0) throw ALREADY;

            return "ok" as const;
        });
    } catch (error) {
        if (error === ALREADY) return "already";

        throw error;
    }
}
