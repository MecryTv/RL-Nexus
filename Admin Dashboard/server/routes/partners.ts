import type { FastifyInstance, FastifyRequest } from "fastify";
import { AUDIT_LABELS } from "../../shared/limits.ts";
import { checkEntryInput, ENTRY_KINDS, type IEntry, type IEntryInput } from "../../shared/partners.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import { botShowcase } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { DiscordUnavailable, fetchMember } from "../discord.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { groupOf } from "../groups.ts";
import { applyContact, checkAssignable, syncPartnerRole } from "../partners/role.ts";
import { createEntry, deleteEntry, getEntry, listEntries, orderEntries, updateEntry } from "../partners/store.ts";
import { publishSite } from "../site/publish.ts";
import { userRefs } from "../users.ts";
import { body, id, oneOf, snowflake } from "../validate.ts";

/**
 * Partner, Sponsoren und Unterstützer (W-0062) für Admins und Developer. Jede
 * Änderung gleicht Gruppe und Rolle ab (partners/role.ts), schreibt ins
 * Protokoll mit target „partner:<id>“ und baut die Webseite neu.
 */

const actorOf = (request: FastifyRequest): IActor => {
    const me = accessOf(request);

    return { id: me.id, name: me.name };
};

function inputOf(value: unknown): IEntryInput {
    const checked = checkEntryInput(value);

    if ("problem" in checked) throw new InvalidInput(checked.problem);

    return checked.input;
}

const target = (entry: Pick<IEntry, "id">): string => `partner:${entry.id}`;

export async function partnerRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    const changed = async (): Promise<void> => {
        publish("partners");
        // Auch die News: Sie nennen Name, Logo und Adresse verknüpfter Einträge (Review-Fund 3).
        await publishSite(config, ["partners", "news"]);
    };
    const entryOf = async (request: FastifyRequest): Promise<IEntry> => {
        const entry = await getEntry(id((request.params as { id?: string }).id));

        if (!entry) throw new PublicError(404, "Diesen Eintrag gibt es nicht mehr.");

        return entry;
    };

    app.get("/api/partners", async () => {
        const entries = await listEntries();

        return { entries, missingRoles: entries.filter((entry) => entry.role?.state === "missing").length };
    });

    app.post("/api/partners", async (request) => {
        const actor = actorOf(request);
        const entry = await createEntry(inputOf(request.body), actor);

        await applyContact(config, entry, null, actor);
        await audit(actor, "partner.create", target(entry), entry.name);
        await changed();

        return (await getEntry(entry.id)) ?? entry;
    });

    app.put("/api/partners/order", async (request, reply) => {
        const input = body(request.body);
        const kind = oneOf(input.kind, ENTRY_KINDS, "Die Art");
        const ids = Array.isArray(input.ids) ? input.ids.map((value) => id(value)) : null;

        if (!ids || ids.length > 200) throw new InvalidInput("Die Reihenfolge hat nicht die erwartete Form.");

        await orderEntries(kind, ids);
        await audit(actorOf(request), "partner.order", null, kind);
        await changed();

        return reply.code(204).send();
    });

    app.put("/api/partners/:id", async (request) => {
        const actor = actorOf(request);
        const previous = await entryOf(request);
        const next = await updateEntry(previous.id, inputOf(request.body), actor);

        await applyContact(config, next, previous, actor);
        await audit(actor, "partner.update", target(next), next.name);
        await changed();

        return (await getEntry(next.id)) ?? next;
    });

    app.delete("/api/partners/:id", async (request, reply) => {
        const actor = actorOf(request);
        const previous = await entryOf(request);

        await deleteEntry(previous.id);
        await applyContact(config, null, previous, actor);
        await audit(actor, "partner.delete", target(previous), previous.name);
        await changed();

        return reply.code(204).send();
    });

    /**
     * W-0062 Teil 2: Live-Zahlen eines Servers für die Vorschau im Studio, auch
     * bevor der Eintrag gespeichert ist. null: Der Bot ist nicht dort oder antwortet nicht.
     */
    app.get("/api/partners/showcase/:guildId", async (request) => botShowcase(config, snowflake((request.params as { guildId?: string }).guildId)));

    /** Vorab-Prüfung im Anlege-Dialog: Wer ist das, welche Gruppe, auf dem Server, welche Server mit RL Nexus, darf der Bot die Rolle geben. */
    app.get("/api/partners/contact/:userId", async (request) => {
        const userId = snowflake((request.params as { userId?: string }).userId);
        let member = false;

        try {
            member = (await fetchMember(config, userId)) !== null;
        } catch (error) {
            if (!(error instanceof DiscordUnavailable)) throw error;
        }

        const servers = await query<{ guild_id: string; guild_name: string; guild_icon: string | null }[]>(
            "SELECT guild_id, guild_name, guild_icon FROM server_invites WHERE state = 'active' AND (user_id = ? OR owner_id = ?) ORDER BY guild_name",
            [userId, userId]
        );

        return {
            user: (await userRefs(config, [userId])).get(userId) ?? null,
            group: await groupOf(userId),
            member,
            servers: servers.map((row) => ({ id: row.guild_id, name: row.guild_name, icon: row.guild_icon })),
            assignable: await checkAssignable(config),
        };
    });

    /** „Erneut prüfen“ im Konto-Reiter. */
    app.post("/api/partners/:id/role", async (request) => {
        const entry = await entryOf(request);

        if (!entry.contactId || entry.kind === "supporter") throw new InvalidInput("Dieser Eintrag hat keinen Ansprechpartner.");

        return syncPartnerRole(config, entry.contactId, { mayRemove: false, actor: actorOf(request) });
    });

    app.get("/api/partners/:id/protokoll", async (request) => {
        const entry = await entryOf(request);
        const rows = await query<{ id: number; action: string; user_name: string; detail: string | null; created_at: Date }[]>(
            "SELECT id, action, user_name, detail, created_at FROM admin_audit WHERE target = ? OR (target = ? AND action LIKE 'partner.role.%') ORDER BY id DESC LIMIT 50",
            [target(entry), entry.contactId ?? "-"]
        );

        return {
            events: rows.map((row) => ({ id: Number(row.id), action: row.action, label: AUDIT_LABELS[row.action] ?? row.action, by: row.user_name, detail: row.detail, at: new Date(row.created_at).toISOString() })),
        };
    });
}
