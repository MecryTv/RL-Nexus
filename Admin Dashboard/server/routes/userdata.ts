import type { FastifyInstance } from "fastify";
import { PAGE_SIZE } from "../../shared/limits.ts";
import { fold } from "../../shared/search.ts";
import {
    DELETION_FILTERS,
    DELETION_MAX_MS,
    DELETION_MIN_MS,
    USERDATA_AREA_IDS,
    USERDATA_AREAS,
    USERDATA_FILTERS,
    USERDATA_NOTE_MAX,
    type IDeletion,
    type IDeletionCounts,
    type IUserdataList,
    type IUserdataProfile,
    type IUserdataRule,
} from "../../shared/userdata.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { publish } from "../events.ts";
import { PublicError } from "../errors.ts";
import { knownName, lookupUser, userRefs } from "../users.ts";
import { cancelDeletion, deletionCounts, deletionOf, latestDeletionOf, listDeletions, planDeletion, publicDeletion } from "../userdata/deletions.ts";
import { renderDeletionImage, sendDeletionDm } from "../userdata/dm.ts";
import { personExport, personIndex, personRows, userdataRules } from "../userdata/find.ts";
import { announcementInput, followUp, plainInput } from "../userdata/flow.ts";
import { deletionReceipt } from "../userdata/receipt.ts";
import { oneOf, snowflake, text } from "../validate.ts";

/** So viele Zeilen zeigt die Zeitleiste im Profil; die Auskunft enthält alle. */
const TIMELINE = 100;

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

const BERLIN = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

/** Die Frist aus der Anfrage: ein Zeitpunkt zwischen 5 Minuten und 30 Tagen. */
function dueOf(value: unknown, now = Date.now()): Date {
    const due = new Date(typeof value === "string" ? value : Number.NaN);
    const ahead = due.getTime() - now;

    if (!(ahead >= DELETION_MIN_MS && ahead <= DELETION_MAX_MS)) throw new PublicError(400, "Die Frist liegt zwischen 5 Minuten und 30 Tagen.");

    return due;
}

function deletionIdOf(value: string | undefined): number {
    const id = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(id) || id < 1) throw new PublicError(400, "Diese Löschung gibt es nicht.");

    return id;
}

/** Bereich Datenschutz (W-0051, Teil 3a): wer Daten hat, was es ist, Auskunft, was bleibt. */
export async function userdataRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/userdata", async (request): Promise<IUserdataList> => {
        requireDatabase();

        const params = request.query as { seite?: string; q?: unknown; filter?: unknown };
        const page = Math.max(1, Number.parseInt(params.seite ?? "1", 10) || 1);
        const wanted = fold(text(params.q, "Die Suche", { max: 100 }));
        const filter = params.filter === undefined ? "alle" : oneOf(params.filter, USERDATA_FILTERS, "Der Filter");
        const open = new Map((await listDeletions("offen", "")).map((entry) => [entry.userId, { state: entry.state, dueAt: entry.dueAt }]));
        const people = [...(await personIndex()).values()]
            .map((person) => ({ ...person, name: knownName(person.id) ?? person.name, deletion: open.get(person.id) ?? null }))
            .filter((person) => !wanted || person.id.includes(wanted) || fold(person.name ?? "").includes(wanted))
            // Laufende Löschungen stehen oben (Entwurf C4), die nächste Frist zuerst.
            .sort((a, b) => Number(Boolean(b.deletion)) - Number(Boolean(a.deletion)) || (a.deletion?.dueAt ?? "").localeCompare(b.deletion?.dueAt ?? "") || b.rows - a.rows || a.id.localeCompare(b.id));
        const shown = filter === "shop" ? people.filter((person) => person.shop) : filter === "laeuft" ? people.filter((person) => person.deletion) : people;
        const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        // Nur für die sichtbare Seite und nur, wo kein Name bekannt ist: höchstens 50 Abfragen, eine Stunde gemerkt.
        const unknown = visible.filter((person) => person.name === null).map((person) => person.id);
        const refs = unknown.length > 0 ? await userRefs(config, unknown) : new Map<string, { readonly name: string | null }>();

        return {
            people: visible.map((person) => ({ ...person, name: person.name ?? refs.get(person.id)?.name ?? null })),
            total: shown.length,
            counts: { alle: people.length, laeuft: people.filter((person) => person.deletion).length, shop: people.filter((person) => person.shop).length },
            page,
            pageSize: PAGE_SIZE,
        };
    });

    app.get("/api/userdata/regeln", async (): Promise<IUserdataRule[]> => {
        requireDatabase();

        return userdataRules();
    });

    app.put("/api/userdata/regeln/:area", async (request, reply) => {
        requireDatabase();

        const area = oneOf((request.params as { area?: string }).area, USERDATA_AREA_IDS, "Der Bereich");
        const body = (request.body ?? {}) as { keep?: unknown; note?: unknown };
        if (typeof body.keep !== "boolean") throw new PublicError(400, "Sag, ob der Bereich bleibt oder gelöscht wird.");

        const note = text(body.note, "Der Satz", { max: USERDATA_NOTE_MAX }) || null;
        if (body.keep && note === null) throw new PublicError(400, "Schreib dazu, warum es bleibt. Der Satz steht in der DM an die Person.");

        await query("INSERT INTO userdata_rules (area, keep, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE keep = VALUES(keep), note = VALUES(note)", [area, body.keep ? 1 : 0, note]);
        await audit(accessOf(request), "userdata.rules", area, body.keep ? `behalten: ${note}` : "löschen");

        return reply.code(204).send();
    });

    app.get("/api/userdata/:id", async (request): Promise<IUserdataProfile> => {
        const id = snowflake((request.params as { id?: string }).id);
        requireDatabase();

        const rows = await personRows(id);
        if (rows.length === 0) throw new PublicError(404, "Zu dieser ID gibt es bei RL Nexus keine Daten.");

        const [user, bot, rules, auditRows, deletion] = await Promise.all([
            lookupUser(config, id).catch(() => null),
            botOverview(config, accessOf(request).id).catch(() => null),
            userdataRules(),
            query<{ action: string; user_name: string; detail: string | null; created_at: Date }[]>(
                "SELECT action, user_name, detail, created_at FROM admin_audit WHERE target = ? AND action LIKE 'userdata.%' ORDER BY id DESC LIMIT 50",
                [id]
            ),
            latestDeletionOf(id),
        ]);
        const guildNames = new Map((bot?.guilds ?? []).map((guild) => [guild.id, guild.name]));
        const named = rows.map((row) => ({ ...row, guildName: row.guildId ? (guildNames.get(row.guildId) ?? null) : null }));
        const newest = [...named].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
        const times = named.flatMap((row) => (row.at ? [row.at] : [])).sort();
        const servers = new Map<string, number>();

        for (const row of named) if (row.guildId) servers.set(row.guildId, (servers.get(row.guildId) ?? 0) + 1);

        return {
            id,
            name: user?.name ?? (await personIndex()).get(id)?.name ?? null,
            avatar: user?.avatar ?? null,
            firstAt: times[0] ?? null,
            lastAt: times.at(-1) ?? null,
            servers: [...servers].map(([guild, count]) => ({ id: guild, name: guildNames.get(guild) ?? null, rows: count })).sort((a, b) => b.rows - a.rows),
            areas: USERDATA_AREAS.map((area) => {
                const inArea = newest.filter((row) => row.area === area.id);
                const rule = rules.find((entry) => entry.area === area.id);

                return { id: area.id, label: area.label, rows: inArea.length, first: inArea.slice(0, 3).map((row) => row.label), keep: rule?.keep ? rule.note : null };
            }),
            timeline: newest.slice(0, TIMELINE),
            audit: auditRows.map((row) => ({ action: row.action, by: row.user_name, at: row.created_at.toISOString(), detail: row.detail })),
            deletion: deletion ? publicDeletion(deletion) : null,
        };
    });

    /** Die Auskunft als Datei. Steht im Protokoll, auch wenn sie leer ist. */
    app.get("/api/userdata/:id/auskunft", async (request, reply) => {
        const id = snowflake((request.params as { id?: string }).id);
        requireDatabase();

        const now = new Date();
        const copy = { person: id, erstellt: now.toISOString(), von: "RL Nexus", bereiche: await personExport(id) };

        await audit(accessOf(request), "userdata.export", id, `${Object.keys(copy.bereiche).length} Bereiche`);

        return reply
            .type("application/json; charset=utf-8")
            .header("Content-Disposition", `attachment; filename="rl-nexus-${id}-${now.toISOString().slice(0, 10)}.json"`)
            .send(JSON.stringify(copy, null, 2));
    });

    /** Löschung planen (Teil 3b, Fenster D1): Bestätigung durch die ID, Frist, Grund; danach geht die Ankündigung raus. */
    app.post("/api/userdata/:id/loeschung", async (request): Promise<IDeletion> => {
        const id = snowflake((request.params as { id?: string }).id);
        const body = (request.body ?? {}) as { dueAt?: unknown; reason?: unknown; confirm?: unknown };

        if (body.confirm !== id) throw new PublicError(400, "Tipp zur Bestätigung die ID der Person ein.");

        const reason = text(body.reason, "Der Grund", { min: 1, max: 200 });
        const dueAt = dueOf(body.dueAt);
        requireDatabase();

        if ((await personRows(id)).length === 0) throw new PublicError(404, "Zu dieser ID gibt es bei RL Nexus keine Daten.");

        const actor = accessOf(request);
        const input = await announcementInput(config, id, dueAt, (await personIndex()).get(id)?.name ?? null);
        const record = await planDeletion({ userId: id, userName: input.name, dueAt, reason, by: actor });

        await sendDeletionDm(config, record, "ankuendigung", input);
        await audit(actor, "userdata.plan", id, `endgültig ${BERLIN.format(dueAt)} · ${reason}`);
        publish("userdata");

        return publicDeletion((await deletionOf(record.id)) ?? record);
    });

    /** Die Ankündigung als Bild, für die Vorschau im Fenster. Schickt nichts. */
    app.get("/api/userdata/:id/vorschau", async (request, reply) => {
        const id = snowflake((request.params as { id?: string }).id);
        const dueAt = dueOf((request.query as { dueAt?: unknown }).dueAt);
        requireDatabase();

        const image = await renderDeletionImage("ankuendigung", await announcementInput(config, id, dueAt, (await personIndex()).get(id)?.name ?? null));

        return reply.type("image/png").header("Cache-Control", "no-store").send(image.data);
    });

    app.get("/api/userdata/loeschungen", async (request): Promise<{ deletions: IDeletion[]; counts: IDeletionCounts }> => {
        requireDatabase();

        const params = request.query as { filter?: unknown; q?: unknown };
        const filter = params.filter === undefined ? "offen" : oneOf(params.filter, DELETION_FILTERS, "Der Filter");
        const [deletions, counts] = await Promise.all([listDeletions(filter, text(params.q, "Die Suche", { max: 100 })), deletionCounts()]);

        return { deletions: deletions.map(publicDeletion), counts };
    });

    /** Für die gelbe Zahl in der Leiste. */
    app.get("/api/userdata/loeschungen/angehalten", async (): Promise<{ count: number }> => ({ count: databaseReady() ? (await deletionCounts()).halted : 0 }));

    /** Abbrechen, bei angehalten auch „Schließen“ (Spec-Entscheidung 42): die Person bekommt „abgebrochen“. */
    app.post("/api/userdata/loeschungen/:deletion/abbrechen", async (request): Promise<IDeletion> => {
        const id = deletionIdOf((request.params as { deletion?: string }).deletion);
        requireDatabase();

        const actor = accessOf(request);
        const record = await cancelDeletion(id, actor);

        await followUp(config, record, "abgebrochen", await plainInput(config, record));
        await audit(actor, "userdata.cancel", record.userId, record.stoppedAt ? "nach „Das war ich nicht“" : null);
        publish("userdata");

        return publicDeletion(record);
    });

    app.get("/api/userdata/loeschungen/:deletion/beleg", async (request, reply) => {
        const id = deletionIdOf((request.params as { deletion?: string }).deletion);
        requireDatabase();

        const record = await deletionOf(id);
        if (!record) throw new PublicError(404, "Diese Löschung gibt es nicht.");
        if (record.state !== "geloescht") throw new PublicError(409, "Einen Beleg gibt es erst nach dem Löschen.");

        return reply
            .type("application/pdf")
            .header("Content-Disposition", `attachment; filename="rl-nexus-loeschung-${record.id}.pdf"`)
            .send(await deletionReceipt(record));
    });
}
