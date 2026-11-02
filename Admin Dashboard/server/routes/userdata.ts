import type { FastifyInstance } from "fastify";
import { PAGE_SIZE } from "../../shared/limits.ts";
import { fold } from "../../shared/search.ts";
import { USERDATA_AREA_IDS, USERDATA_AREAS, USERDATA_FILTERS, USERDATA_NOTE_MAX, type IUserdataList, type IUserdataProfile, type IUserdataRule } from "../../shared/userdata.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { knownName, lookupUser, userRefs } from "../users.ts";
import { personExport, personIndex, personRows, userdataRules } from "../userdata/find.ts";
import { oneOf, snowflake, text } from "../validate.ts";

/** So viele Zeilen zeigt die Zeitleiste im Profil; die Auskunft enthält alle. */
const TIMELINE = 100;

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

/** Bereich Datenschutz (W-0051, Teil 3a): wer Daten hat, was es ist, Auskunft, was bleibt. */
export async function userdataRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/userdata", async (request): Promise<IUserdataList> => {
        requireDatabase();

        const params = request.query as { seite?: string; q?: unknown; filter?: unknown };
        const page = Math.max(1, Number.parseInt(params.seite ?? "1", 10) || 1);
        const wanted = fold(text(params.q, "Die Suche", { max: 100 }));
        const filter = params.filter === undefined ? "alle" : oneOf(params.filter, USERDATA_FILTERS, "Der Filter");
        const people = [...(await personIndex()).values()]
            .map((person) => ({ ...person, name: knownName(person.id) ?? person.name }))
            .filter((person) => !wanted || person.id.includes(wanted) || fold(person.name ?? "").includes(wanted))
            .sort((a, b) => b.rows - a.rows || a.id.localeCompare(b.id));
        const shown = filter === "shop" ? people.filter((person) => person.shop) : people;
        const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        // Nur für die sichtbare Seite und nur, wo kein Name bekannt ist: höchstens 50 Abfragen, eine Stunde gemerkt.
        const unknown = visible.filter((person) => person.name === null).map((person) => person.id);
        const refs = unknown.length > 0 ? await userRefs(config, unknown) : new Map<string, { readonly name: string | null }>();

        return {
            people: visible.map((person) => ({ ...person, name: person.name ?? refs.get(person.id)?.name ?? null })),
            total: shown.length,
            counts: { alle: people.length, shop: people.filter((person) => person.shop).length },
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

        const [user, bot, rules, auditRows] = await Promise.all([
            lookupUser(config, id).catch(() => null),
            botOverview(config, accessOf(request).id).catch(() => null),
            userdataRules(),
            query<{ action: string; user_name: string; detail: string | null; created_at: Date }[]>(
                "SELECT action, user_name, detail, created_at FROM admin_audit WHERE target = ? AND action LIKE 'userdata.%' ORDER BY id DESC LIMIT 50",
                [id]
            ),
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
}
