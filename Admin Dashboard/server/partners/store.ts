import { checkEntryInput, slugify, type EntryKind, type IEntry, type IEntryInput, type IRoleState } from "../../shared/partners.ts";
import type { IActor } from "../audit.ts";
import { query, withTransaction, type TransactionQuery } from "../db.ts";
import { PublicError } from "../errors.ts";

/** Die Tabellen von W-0062 (Migration 023). Nur SQL; Regeln in shared/partners.ts, Rolle in role.ts. */

interface IEntryRow {
    readonly id: number;
    readonly kind: EntryKind;
    readonly slug: string;
    readonly name: string;
    readonly details: string | Record<string, unknown>;
    readonly contact_id: string | null;
    readonly access: "free" | "paid" | null;
    readonly group_granted: number;
    readonly server_id: string | null;
    readonly visible: number;
    readonly position: number;
    readonly created_name: string;
    readonly created_at: Date;
    readonly updated_at: Date;
}

interface IRoleRow {
    readonly user_id: string;
    readonly state: "given" | "pending" | "missing";
    readonly note: string | null;
    readonly updated_at: Date;
}

const COLUMNS = "id, kind, slug, name, details, contact_id, access, group_granted, server_id, visible, position, created_name, created_at, updated_at";
const ORDER = "ORDER BY FIELD(kind, 'partner', 'sponsor', 'supporter'), position, id";

/** Was in details landet: alles außer den eigenen Spalten. */
function detailsOf(input: IEntryInput): string {
    const { kind: _kind, name: _name, contactId: _contact, access: _access, guildId: _guild, visible: _visible, tournamentIds: _tournaments, ...rest } = input;

    return JSON.stringify(rest);
}

function roleOf(contactId: string | null, roles: ReadonlyMap<string, IRoleState>): IRoleState | null {
    if (!contactId) return { state: "none", note: null, since: null };

    return roles.get(contactId) ?? null;
}

function record(row: IEntryRow, tournaments: readonly number[], roles: ReadonlyMap<string, IRoleState>): IEntry {
    const details = typeof row.details === "string" ? (JSON.parse(row.details) as Record<string, unknown>) : row.details;
    const raw = {
        ...details,
        kind: row.kind,
        name: row.name,
        contactId: row.contact_id,
        access: row.access,
        guildId: row.server_id,
        visible: Boolean(row.visible),
        tournamentIds: tournaments,
    };
    const checked = checkEntryInput(raw);

    if ("problem" in checked) console.warn(`[partner] Eintrag ${row.id} passt nicht mehr zu den Regeln: ${checked.problem}`);

    const input = "input" in checked ? checked.input : (raw as unknown as IEntryInput);

    return {
        ...input,
        id: Number(row.id),
        slug: row.slug,
        position: Number(row.position),
        createdName: row.created_name,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        role: roleOf(row.contact_id, roles),
        groupGranted: Boolean(row.group_granted),
    };
}

async function hydrate(rows: readonly IEntryRow[]): Promise<IEntry[]> {
    if (rows.length === 0) return [];

    const links = await query<{ entry_id: number; post_id: number }[]>("SELECT entry_id, post_id FROM partner_tournaments WHERE entry_id IN (?)", [rows.map((row) => row.id)]);
    const roles = await roleStates();

    return rows.map((row) => record(row, links.filter((link) => Number(link.entry_id) === Number(row.id)).map((link) => Number(link.post_id)), roles));
}

export async function listEntries(): Promise<IEntry[]> {
    return hydrate(await query<IEntryRow[]>(`SELECT ${COLUMNS} FROM partner_entries ${ORDER}`));
}

export async function getEntry(id: number): Promise<IEntry | null> {
    const [entry] = await hydrate(await query<IEntryRow[]>(`SELECT ${COLUMNS} FROM partner_entries WHERE id = ?`, [id]));

    return entry ?? null;
}

export async function entriesOfContact(userId: string): Promise<IEntry[]> {
    return hydrate(await query<IEntryRow[]>(`SELECT ${COLUMNS} FROM partner_entries WHERE contact_id = ? ${ORDER}`, [userId]));
}

/** Höchstens ein Hauptsponsor: Wer neu Hauptsponsor wird, stuft den bisherigen auf Sponsor zurück. */
async function oneMainSponsor(run: TransactionQuery, id: number, input: IEntryInput): Promise<void> {
    if (input.kind !== "sponsor" || input.tier !== "main") return;

    await run(
        `UPDATE partner_entries SET details = JSON_SET(details, '$.tier', 'sponsor'), updated_at = CURRENT_TIMESTAMP(3)
          WHERE kind = 'sponsor' AND id <> ? AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.tier')) = 'main'`,
        [id]
    );
}

async function writeTournaments(run: TransactionQuery, id: number, ids: readonly number[]): Promise<void> {
    await run("DELETE FROM partner_tournaments WHERE entry_id = ?", [id]);

    if (ids.length > 0) await run(`INSERT INTO partner_tournaments (entry_id, post_id) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap((postId) => [id, postId]));
}

async function nextPosition(run: TransactionQuery, kind: EntryKind): Promise<number> {
    const [row] = await run<{ next: number | null }[]>("SELECT MAX(position) + 1 AS next FROM partner_entries WHERE kind = ?", [kind]);

    return Number(row?.next ?? 0);
}

export async function createEntry(input: IEntryInput, actor: IActor): Promise<IEntry> {
    const id = await withTransaction(async (run) => {
        const slugs = await run<{ slug: string }[]>("SELECT slug FROM partner_entries");
        const slug = slugify(input.name, new Set(slugs.map((row) => row.slug)));
        const inserted = await run<{ insertId: number }>(
            `INSERT INTO partner_entries (kind, slug, name, details, contact_id, access, server_id, visible, position, created_by, created_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.kind, slug, input.name, detailsOf(input), input.contactId, input.access, input.guildId, input.visible ? 1 : 0, await nextPosition(run, input.kind), actor.id, actor.name.slice(0, 100)]
        );
        const created = Number(inserted.insertId);

        await oneMainSponsor(run, created, input);
        await writeTournaments(run, created, input.tournamentIds);

        return created;
    });

    return (await getEntry(id))!;
}

/** Die Adresse bleibt beim Umbenennen, damit geteilte Links weiter gehen. */
export async function updateEntry(id: number, input: IEntryInput, _actor: IActor): Promise<IEntry> {
    await withTransaction(async (run) => {
        const [current] = await run<{ kind: EntryKind }[]>("SELECT kind FROM partner_entries WHERE id = ? FOR UPDATE", [id]);

        if (!current) throw new PublicError(404, "Diesen Eintrag gibt es nicht mehr.");

        const position = current.kind === input.kind ? null : await nextPosition(run, input.kind);

        await run(
            `UPDATE partner_entries SET kind = ?, name = ?, details = ?, contact_id = ?, access = ?, server_id = ?, visible = ?,
                    position = COALESCE(?, position), updated_at = CURRENT_TIMESTAMP(3)
              WHERE id = ?`,
            [input.kind, input.name, detailsOf(input), input.contactId, input.access, input.guildId, input.visible ? 1 : 0, position, id]
        );
        await oneMainSponsor(run, id, input);
        await writeTournaments(run, id, input.tournamentIds);
    });

    return (await getEntry(id))!;
}

export async function deleteEntry(id: number): Promise<void> {
    await withTransaction(async (run) => {
        await run("DELETE FROM partner_tournaments WHERE entry_id = ?", [id]);
        await run("DELETE FROM partner_entries WHERE id = ?", [id]);
    });
}

/** Reihenfolge innerhalb einer Art, etwa der Unterstützer-Leiste. */
export async function orderEntries(kind: EntryKind, ids: readonly number[]): Promise<void> {
    await withTransaction(async (run) => {
        for (const [position, id] of ids.entries()) await run("UPDATE partner_entries SET position = ? WHERE id = ? AND kind = ?", [position, id, kind]);
    });
}

/** Ob dieser Eintrag die Gruppe Partner vergeben hat (role.ts). */
export async function groupGranted(id: number): Promise<boolean> {
    const [row] = await query<{ group_granted: number }[]>("SELECT group_granted FROM partner_entries WHERE id = ?", [id]);

    return Boolean(row?.group_granted);
}

export async function setGroupGranted(id: number, granted: boolean): Promise<void> {
    await query("UPDATE partner_entries SET group_granted = ? WHERE id = ?", [granted ? 1 : 0, id]);
}

export async function setRoleState(userId: string, state: "given" | "pending" | "missing" | null, note: string | null): Promise<void> {
    if (state === null) {
        await query("DELETE FROM partner_roles WHERE user_id = ?", [userId]);

        return;
    }

    await query(
        `INSERT INTO partner_roles (user_id, state, note) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = IF(state = VALUES(state), updated_at, CURRENT_TIMESTAMP(3)), state = VALUES(state)`,
        [userId, state, note?.slice(0, 190) ?? null]
    );
}

export async function roleStates(): Promise<Map<string, IRoleState>> {
    const rows = await query<IRoleRow[]>("SELECT user_id, state, note, updated_at FROM partner_roles");

    return new Map(rows.map((row) => [row.user_id, { state: row.state, note: row.note, since: new Date(row.updated_at).toISOString() }]));
}
