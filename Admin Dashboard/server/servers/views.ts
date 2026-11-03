import type { IChoiceView, IFreigaben, IInvitedServer, IMemberPage, IPersonServers, IRequestView, MemberFilter } from "../../shared/servers.ts";
import { MEMBERS_PER_PAGE } from "../../shared/servers.ts";
import { fold } from "../../shared/search.ts";
import type { IMe } from "../../shared/api.ts";
import { botExempt, botMembers, botServerFacts } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { userRefs } from "../users.ts";
import { personIndex } from "../userdata/find.ts";
import { previewStart, type ITeamActor } from "./flow.ts";
import { signature } from "./rules.ts";
import * as store from "./store.ts";
import type { IInviteRow, IRequestRow } from "./store.ts";

/** Was die Seiten Server-Freigaben und Eingeladene Server zeigen (W-0064). */

export function teamActor(me: IMe): ITeamActor {
    return { id: me.id, name: me.name, role: me.role === "developer" ? "Developer" : "Administrator" };
}

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

async function requestViews(config: IConfig, rows: readonly IRequestRow[]): Promise<IRequestView[]> {
    const people = await userRefs(config, rows.map((row) => row.user_id));
    const views: IRequestView[] = [];

    for (const row of rows) {
        const [invite, others] = await Promise.all([store.inviteOf(row.guild_id), store.othersActive(row.user_id, row.guild_id)]);
        const person = people.get(row.user_id);
        const botThere = invite?.state === "active" && invite.user_id === row.user_id;

        views.push({
            id: row.id,
            person: { id: row.user_id, name: person?.name ?? row.user_id, avatar: person?.avatar ?? null },
            guildId: row.guild_id,
            guildName: row.guild_name,
            members: invite?.members ?? null,
            kind: row.kind,
            reason: row.reason,
            origin: row.origin,
            status: row.status,
            createdAt: row.created_at.toISOString(),
            main: others[0] ? { id: others[0].guild_id, name: others[0].guild_name } : null,
            botThere,
            signature: row.kind === "extra" && row.status === "approved" ? signature(row.id) : null,
            decided: row.decided_at && row.decided_name ? { name: row.decided_name, role: row.decided_role, at: row.decided_at.toISOString() } : null,
        });
    }

    return views;
}

export async function freigaben(config: IConfig): Promise<IFreigaben> {
    const [started, open, approved, choices, paid] = await Promise.all([store.ruleStarted(), store.requestsWith("open"), store.requestsWith("approved"), store.runningChoices(), store.limitedMode()]);
    const people = await userRefs(config, choices.map((choice) => choice.user_id));
    const choiceViews: IChoiceView[] = [];

    for (const choice of choices) {
        const person = people.get(choice.user_id);
        const rows = await store.othersActive(choice.user_id, null);

        choiceViews.push({
            person: { id: choice.user_id, name: person?.name ?? choice.user_id, avatar: person?.avatar ?? null },
            deadline: choice.deadline.toISOString(),
            state: choice.state === "chosen" ? "chosen" : "open",
            chosen: rows.find((row) => row.guild_id === choice.chosen_guild)?.guild_name ?? null,
            servers: rows.map((row) => ({ id: row.guild_id, name: row.guild_name })),
            dmError: choice.dm_error,
        });
    }

    return {
        started: iso(started),
        paid,
        preview: started === null ? await previewStart(config) : 0,
        open: await requestViews(config, open),
        approved: await requestViews(config, approved.filter((row) => row.kind === "extra")),
        choices: choiceViews,
    };
}

function stateOf(row: IInviteRow, request: IRequestRow | undefined): IInvitedServer["state"] {
    if (row.state === "left") return request?.status === "open" ? "waiting" : "left";
    if (row.approval_id !== null) return "approved";
    if (request?.status === "open") return "waiting";

    return "main";
}

/** Reiter „Eingeladene Server“ im Profil. viewer: wer im Admin Dashboard schaut (für „du bist Mitglied“). */
export async function personServers(config: IConfig, userId: string, viewer: string): Promise<IPersonServers> {
    const [started, rows, requests, choice, exempt] = await Promise.all([store.ruleStarted(), store.invitesOf(userId), store.requestsOf(userId), store.choiceOf(userId), botExempt(config, userId)]);
    const active = rows.filter((row) => row.state === "active");
    const facts = (await botServerFacts(config, active.map((row) => row.guild_id), viewer)) ?? {};
    const views = new Map((await requestViews(config, requests)).map((view) => [view.id, view]));
    // Je Server die maßgebliche Anfrage: die Freigabe dieses Servers, sonst eine offene, sonst die neueste.
    const requestFor = (row: IInviteRow): IRequestRow | undefined =>
        requests.find((request) => request.id === row.approval_id) ?? requests.find((request) => request.guild_id === row.guild_id && request.status === "open") ?? requests.find((request) => request.guild_id === row.guild_id);
    const owners = await userRefs(config, rows.map((row) => row.owner_id));

    const servers: IInvitedServer[] = rows.map((row) => {
        const request = requestFor(row);
        let state = stateOf(row, request);

        // Mehrere aktive ohne Freigabe (Wahl läuft): Hauptserver ist erst einer nach der Wahl.
        if (state === "main" && active.filter((entry) => entry.approval_id === null).length > 1) state = "active";

        return {
            id: row.guild_id,
            name: row.guild_name,
            icon: row.guild_icon,
            members: row.members,
            ownerId: row.owner_id,
            ownerName: facts[row.guild_id]?.ownerName ?? owners.get(row.owner_id)?.name ?? null,
            invitedAt: row.invited_at.toISOString(),
            source: row.source,
            state,
            leftAt: iso(row.left_at),
            leftReason: row.left_reason,
            request: request ? (views.get(request.id) ?? null) : null,
            facts: facts[row.guild_id] ?? null,
        };
    });

    const order = { main: 0, active: 1, approved: 2, waiting: 3, left: 4 } as const;
    servers.sort((a, b) => order[a.state] - order[b.state] || b.invitedAt.localeCompare(a.invitedAt));

    return {
        started: started !== null,
        exempt: exempt === true,
        servers,
        choice: choice && (choice.state === "open" || choice.state === "chosen") ? { deadline: choice.deadline.toISOString(), chosen: choice.chosen_guild } : null,
    };
}

/** Mitglieder eines Servers, eine Minute zwischengespeichert: Filter, Suche und Blättern fragen den Bot so nicht jedes Mal. */
const cache = new Map<string, { readonly at: number; readonly value: Awaited<ReturnType<typeof botMembers>> }>();
const MEMBER_TTL = 60_000;

export async function memberPage(config: IConfig, guildId: string, viewer: string, filter: MemberFilter, search: string, page: number, now = Date.now()): Promise<IMemberPage | null> {
    let entry = cache.get(guildId);

    if (!entry || now - entry.at > MEMBER_TTL) {
        // ponytail: ganze Liste je Server im Speicher, bei sehr großen Servern (100k+) lieber blättern im Bot.
        entry = { at: now, value: await botMembers(config, guildId, viewer) };
        if (entry.value) cache.set(guildId, entry);
    }

    const list = entry.value;
    if (!list) return null;

    const people = await personIndex();
    const rows = list.members.map((member) => ({ ...member, hasData: people.has(member.id) }));
    const needle = fold(search.trim());
    const matches = rows
        .filter((row) => filter === "alle" || (filter === "personen" && !row.bot) || (filter === "bots" && row.bot) || (filter === "daten" && row.hasData))
        .filter((row) => !needle || row.id.includes(needle) || fold(row.name).includes(needle) || fold(row.handle).includes(needle))
        .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? ""));
    const last = Math.max(0, Math.ceil(matches.length / MEMBERS_PER_PAGE) - 1);
    const current = Math.min(Math.max(0, page), last);

    return {
        total: list.total,
        persons: rows.filter((row) => !row.bot).length,
        bots: rows.filter((row) => row.bot).length,
        team: rows.filter((row) => row.team).length,
        withData: rows.filter((row) => row.hasData).length,
        complete: list.complete,
        at: new Date(entry.at).toISOString(),
        matches: matches.length,
        page: current,
        rows: matches.slice(current * MEMBERS_PER_PAGE, (current + 1) * MEMBERS_PER_PAGE),
    };
}
