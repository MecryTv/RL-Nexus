import {
    INCIDENT_KINDS,
    INCIDENT_LIMITS,
    INCIDENT_STATES_OF,
    STATUS_SERVICES,
    type IIncident,
    type IIncidentInput,
    type IIncidentUpdate,
    type IncidentState,
    type StatusService,
} from "../../shared/status.ts";
import { query } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { body as shape, oneOf, text } from "../validate.ts";

/**
 * Eigene Meldungen für Statusseite und Discord: Störungen mit Updates und
 * geplante Wartungen. Angelegt im Admin Dashboard, jedes Update ist eine
 * eigene Zeile, damit die Statusseite den Verlauf zeigen kann.
 */

/** So viele vergangene Meldungen zeigt das Admin Dashboard. */
const PAST = 30;

function services(value: unknown): StatusService[] {
    if (!Array.isArray(value) || value.length === 0) throw new InvalidInput("Wähle mindestens einen Dienst, der betroffen ist.");

    const chosen = value.map((entry) => oneOf(entry, STATUS_SERVICES, "Der Dienst"));

    return STATUS_SERVICES.filter((service) => chosen.includes(service));
}

function moment(value: unknown, label: string): string {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new InvalidInput(`${label} fehlt oder ist kein Zeitpunkt.`);

    return new Date(value).toISOString();
}

function message(value: unknown): string {
    return text(value, "Der Text", INCIDENT_LIMITS.body);
}

/** Eine neue Meldung, geprüft. Eine Wartung braucht Beginn und Ende, eine Störung nicht. */
export function parseIncident(value: unknown): IIncidentInput {
    const data = shape(value);
    const kind = oneOf(data.kind, INCIDENT_KINDS, "Die Art");
    const title = text(data.title, "Der Titel", INCIDENT_LIMITS.title);
    const affected = services(data.services);

    // Eine neue Meldung ist nie schon gelöst.
    const state = oneOf(
        data.state ?? INCIDENT_STATES_OF[kind][0],
        INCIDENT_STATES_OF[kind].filter((entry) => entry !== "geloest"),
        "Der Stand"
    );

    if (kind === "stoerung") return { kind, title, services: affected, state, body: message(data.body) };

    const startsAt = moment(data.startsAt, "Der Beginn");
    const endsAt = moment(data.endsAt, "Das Ende");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new InvalidInput("Das Ende muss nach dem Beginn liegen.");

    return { kind, title, services: affected, state, body: message(data.body), startsAt, endsAt };
}

/** Ein Update. Welche Stände gehen, hängt an der Art der Meldung. */
export function parseUpdate(value: unknown, kind: IIncident["kind"]): { readonly state: IncidentState; readonly body: string } {
    const data = shape(value);

    return { state: oneOf(data.state, INCIDENT_STATES_OF[kind], "Der Stand"), body: message(data.body) };
}

interface IIncidentRow {
    readonly id: number;
    readonly kind: IIncident["kind"];
    readonly title: string;
    readonly services: string;
    readonly state: IncidentState;
    readonly starts_at: Date | null;
    readonly ends_at: Date | null;
    readonly created_at: Date;
    readonly resolved_at: Date | null;
}

interface IUpdateRow {
    readonly id: number;
    readonly incident_id: number;
    readonly state: IncidentState;
    readonly body: string;
    readonly by_name: string;
    readonly created_at: Date;
}

const COLUMNS = "id, kind, title, services, state, starts_at, ends_at, created_at, resolved_at";

async function withUpdates(rows: readonly IIncidentRow[]): Promise<IIncident[]> {
    if (rows.length === 0) return [];

    const updates = await query<IUpdateRow[]>(
        `SELECT id, incident_id, state, body, by_name, created_at FROM status_incident_updates WHERE incident_id IN (${rows.map(() => "?").join(", ")}) ORDER BY created_at DESC, id DESC`,
        rows.map((row) => row.id)
    );

    return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        services: row.services.split(",").filter((entry): entry is StatusService => (STATUS_SERVICES as readonly string[]).includes(entry)),
        state: row.state,
        startsAt: row.starts_at?.toISOString() ?? null,
        endsAt: row.ends_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        resolvedAt: row.resolved_at?.toISOString() ?? null,
        updates: updates
            .filter((update) => update.incident_id === row.id)
            .map((update): IIncidentUpdate => ({ id: update.id, state: update.state, body: update.body, by: update.by_name, createdAt: update.created_at.toISOString() })),
    }));
}

/** Offene Meldungen (nicht gelöst) und die letzten gelösten. */
export async function listIncidents(): Promise<{ readonly open: IIncident[]; readonly past: IIncident[] }> {
    const [open, past] = await Promise.all([
        query<IIncidentRow[]>(`SELECT ${COLUMNS} FROM status_incidents WHERE resolved_at IS NULL ORDER BY created_at DESC`),
        query<IIncidentRow[]>(`SELECT ${COLUMNS} FROM status_incidents WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT ${PAST}`),
    ]);

    return { open: await withUpdates(open), past: await withUpdates(past) };
}

/** Gelöste Meldungen seit einem Zeitpunkt, für „Störungen der letzten 14 Tage“. */
export async function resolvedSince(since: Date): Promise<IIncident[]> {
    return withUpdates(await query<IIncidentRow[]>(`SELECT ${COLUMNS} FROM status_incidents WHERE resolved_at >= ? ORDER BY resolved_at DESC`, [since]));
}

export async function createIncident(input: IIncidentInput, actor: { readonly id: string; readonly name: string }): Promise<number> {
    const result = await query<{ insertId: number }>(
        "INSERT INTO status_incidents (kind, title, services, state, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [input.kind, input.title, input.services.join(","), input.state, input.startsAt ? new Date(input.startsAt) : null, input.endsAt ? new Date(input.endsAt) : null, actor.id]
    );

    await query("INSERT INTO status_incident_updates (incident_id, state, body, by_name) VALUES (?, ?, ?, ?)", [result.insertId, input.state, input.body, actor.name]);

    return result.insertId;
}

/** Die Art einer Meldung. 404, wenn es sie nicht gibt oder sie schon gelöst ist. */
export async function openKindOf(id: number): Promise<IIncident["kind"]> {
    const [row] = await query<{ kind: IIncident["kind"]; resolved_at: Date | null }[]>("SELECT kind, resolved_at FROM status_incidents WHERE id = ?", [id]);

    if (!row) throw new PublicError(404, "Diese Meldung gibt es nicht.");
    if (row.resolved_at !== null) throw new PublicError(409, "Diese Meldung ist schon gelöst.");

    return row.kind;
}

export async function addUpdate(id: number, update: { readonly state: IncidentState; readonly body: string }, actor: { readonly name: string }): Promise<void> {
    await query("INSERT INTO status_incident_updates (incident_id, state, body, by_name) VALUES (?, ?, ?, ?)", [id, update.state, update.body, actor.name]);
    await query(
        "UPDATE status_incidents SET state = ?, resolved_at = IF(? = 'geloest', CURRENT_TIMESTAMP, NULL) WHERE id = ?",
        [update.state, update.state, id]
    );
}

export async function deleteIncident(id: number): Promise<string> {
    const [row] = await query<{ title: string }[]>("SELECT title FROM status_incidents WHERE id = ?", [id]);
    if (!row) throw new PublicError(404, "Diese Meldung gibt es nicht.");

    await query("DELETE FROM status_incidents WHERE id = ?", [id]);

    return row.title;
}
