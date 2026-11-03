import type { IServerOptionView, LeftReason, RequestKind } from "../../shared/servers.ts";
import { audit } from "../audit.ts";
import { botExempt, botLeave, botServer, botServers } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { postDirectMessage } from "../discord.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { personBase } from "../userdata/flow.ts";
import { deadlineText, inviteUrl, sendServerDm, STRIPS, type IServerImage, type IServerTile, type ServerExtra, type TileTag } from "./dm.ts";
import { CHOICE_HOURS, choiceStep, decideJoin, keepAlone, signature, THINK_TIME, type JoinDecision } from "./rules.ts";
import * as store from "./store.ts";
import type { IInviteRow, IRequestRow } from "./store.ts";

/**
 * Ein Server pro Person (W-0064): der Ablauf. Der Bot meldet Beitritte, die
 * Uhr (clock.ts) treibt Wahl und Abgleich, das Team entscheidet über die
 * Seite Server-Freigaben und das Profil. Alles, was Server verlässt oder
 * Freigaben ändert, läuft nacheinander (serial), damit zwei Beitritte
 * derselben Person nicht beide Hauptserver werden.
 */

export interface ITeamActor {
    readonly id: string;
    readonly name: string;
    readonly role: "Developer" | "Administrator";
}

const CLOCK = { id: "0", name: "Ein Server pro Person" };
const PERSON = { id: "0", name: "Die Person selbst" };
const HOUR = 3_600_000;

let chain: Promise<unknown> = Promise.resolve();

/** Eins nach dem anderen im Prozess. */
function serial<T>(job: () => Promise<T>): Promise<T> {
    const next = chain.then(job, job);
    chain = next.catch(() => undefined);

    return next;
}

const names = (rows: readonly { readonly guild_name: string }[]): string => {
    const list = rows.map((row) => row.guild_name);

    return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} und ${list.at(-1)}`;
};

const count = (value: number): string => ["null", "einen", "zwei", "drei", "vier", "fünf"][value] ?? String(value);

function tiles(rows: readonly IInviteRow[], tag: (row: IInviteRow) => TileTag): IServerTile[] {
    return rows.map((row) => ({ id: row.guild_id, name: row.guild_name, members: row.members, since: row.invited_at, tag: tag(row) }));
}

async function dm(config: IConfig, userId: string, image: Omit<IServerImage, "person">, extra: ServerExtra = { kind: "none" }): Promise<string | null> {
    const person = await personBase(config, userId, null);
    const error = await sendServerDm(config, userId, { ...image, person }, extra);

    if (error) await audit(CLOCK, "servers.dm", userId, `DM nicht zugestellt: ${error}`.slice(0, 250));

    return error;
}

/** Bot verlässt den Server, vorher steht text im Log-Kanal. Danach ist die Zeile verlassen. false: Bot nicht erreicht. */
async function leave(config: IConfig, row: IInviteRow, reason: LeftReason, text: string): Promise<boolean> {
    const done = await botLeave(config, row.guild_id, text);
    if (done === false) return false;

    await store.markLeft(row.guild_id, reason);

    return true;
}

async function personName(config: IConfig, userId: string): Promise<string> {
    return (await personBase(config, userId, null)).name;
}

/* --- Beitritt ------------------------------------------------------------- */

/**
 * Der Bot ist auf einem Server (neu oder beim Abgleich gefunden). Trägt ihn
 * ein und entscheidet. null: Der Bot kennt den Server nicht (mehr).
 */
export function checkGuild(config: IConfig, guildId: string): Promise<JoinDecision | null> {
    return serial(() => checkNow(config, guildId));
}

async function checkNow(config: IConfig, guildId: string): Promise<JoinDecision | null> {
    const detail = await botServer(config, guildId);
    if (!detail) return null;

    const [existing, started] = await Promise.all([store.inviteOf(guildId), store.ruleStarted()]);
    const joinedAt = new Date(detail.joinedAt);

    // Schon eingetragen und noch da: nur nachziehen. Entschieden wurde beim Eintragen.
    if (existing?.state === "active") {
        await store.touchInvite(guildId, detail.name, detail.icon, detail.members);

        return null;
    }

    const legacy = started === null || joinedAt.getTime() < started.getTime();

    await store.putInvite({ guildId, name: detail.name, icon: detail.icon, userId: detail.inviter.userId, source: detail.inviter.source, ownerId: detail.ownerId, invitedAt: joinedAt, members: detail.members, legacy });

    const row = (await store.inviteOf(guildId))!;
    const userId = row.user_id;
    const [isBlocked, approval, others] = await Promise.all([store.blocked(guildId), store.approvalFor(userId, guildId), store.othersActive(userId, guildId)]);
    const decision = decideJoin({ started: started !== null, blocked: isBlocked, exempt: detail.exempt, legacy, approved: approval !== null, others: others.length });

    if (decision === "blocked") {
        await leave(config, row, "blocked", "RL Nexus ist gegangen: Dieser Server ist für RL Nexus gesperrt.");
        await audit(CLOCK, "servers.blocked", guildId, detail.name);
    } else if (decision === "approved") {
        await store.setApproval(guildId, approval!.id);
    } else if (decision === "over") {
        const name = await personName(config, userId);

        // Erst die DM (die Person teilt mit dem Bot noch den Hauptserver), dann gehen.
        await dm(
            config,
            userId,
            {
                strip: STRIPS.limit,
                title: "Ein Server pro Person",
                sub: `Hallo ${name}, RL Nexus läuft schon auf deinem Server. Für einen ${others.length === 1 ? "zweiten" : "weiteren"} braucht es eine Freigabe.`,
                tiles: [...tiles(others, () => (others.length === 1 ? "main" : null)), ...tiles([row], () => "gone")],
                note: `Mit Freigabe kommt ${row.guild_name} dazu und bekommt die Signatur von RL Nexus. Den Hauptserver wechseln geht nur über das Team.`,
            },
            { kind: "limit", guildId }
        );
        await leave(config, row, "limit", `RL Nexus ist gegangen: Pro Person läuft RL Nexus auf einem Server, und ${name} hat ihn schon auf einem anderen. Für einen weiteren braucht es eine Freigabe vom Team.`);
        await audit(CLOCK, "servers.limit", userId, `${detail.name} (${guildId}) verlassen, schon auf ${names(others)}`.slice(0, 500));
    }

    publish("servers");

    return decision;
}

/** Alle Server des Bots mit der Tabelle abgleichen: fehlende eintragen, verschwundene als verlassen markieren. */
export async function reconcile(config: IConfig): Promise<void> {
    const list = await botServers(config);
    if (!list) return;

    const present = new Set(list.map((server) => server.id));

    for (const server of list) {
        const row = await store.inviteOf(server.id);

        if (row?.state === "active") await store.touchInvite(server.id, server.name, server.icon, server.members);
        else await checkGuild(config, server.id);
    }

    for (const row of await store.activeInvites()) {
        if (!present.has(row.guild_id)) await serial(() => store.markLeft(row.guild_id, "gone"));
    }
}

/* --- Start der Regel und Wahl --------------------------------------------- */

/** Personen mit zwei oder mehr aktiven Servern ohne Freigabe, die nicht ausgenommen sind. */
async function multiServer(config: IConfig): Promise<Map<string, IInviteRow[]>> {
    const byUser = new Map<string, IInviteRow[]>();

    for (const row of await store.activeInvites()) {
        if (row.approval_id !== null) continue;

        byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
    }

    for (const [userId, rows] of byUser) {
        // Weiß der Bot es nicht, lieber keine DM als eine falsche.
        if (rows.length < 2 || (await botExempt(config, userId)) !== false) byUser.delete(userId);
    }

    return byUser;
}

export async function previewStart(config: IConfig): Promise<number> {
    return (await multiServer(config)).size;
}

function roleOn(row: IInviteRow, userId: string): string {
    return row.owner_id === userId ? "Owner" : "Admin";
}

export function optionsOf(rows: readonly IInviteRow[], userId: string): IServerOptionView[] {
    return rows.map((row) => ({ id: row.guild_id, name: row.guild_name, members: row.members, role: roleOn(row, userId) }));
}

function choiceImage(name: string, rows: readonly IInviteRow[], deadline: Date, now: number): Omit<IServerImage, "person"> {
    return {
        strip: STRIPS.choice,
        title: "Wähle deinen Server",
        sub: `Hallo ${name}, RL Nexus gibt es jetzt für einen Server pro Person. Du hast ihn auf ${count(rows.length)} eingeladen.`,
        big: { label: "Entscheide dich bis", value: deadlineText(deadline), progress: 1 - (deadline.getTime() - now) / (CHOICE_HOURS * HOUR) },
        tiles: tiles(rows, () => null),
        note: `Die anderen verlässt der Bot nach deiner Wahl. Wählst du nicht, verlässt er alle ${count(rows.length)}.`,
    };
}

/** „Regel starten“ auf der Seite Server-Freigaben. Gibt zurück, wie viele Personen die Wahl-DM bekommen haben. */
export async function startRuleNow(config: IConfig, actor: ITeamActor, now = new Date()): Promise<number> {
    // Erst abgleichen, solange die Regel noch nicht läuft: Was jetzt da ist, zählt als alt.
    await reconcile(config);

    if (!(await store.startRule(now))) throw new PublicError(409, "Die Regel läuft schon.");

    const deadline = new Date(now.getTime() + CHOICE_HOURS * HOUR);
    const people = await multiServer(config);

    for (const [userId, rows] of people) {
        await store.addChoice(userId, deadline);

        const name = await personName(config, userId);
        const error = await dm(config, userId, choiceImage(name, rows, deadline, now.getTime()), { kind: "choice", deadline, options: optionsOf(rows, userId) });

        await store.setChoiceDm(userId, error);
    }

    await audit(actor, "servers.start", null, `Regel gestartet als ${actor.role}, Wahl-DM an ${people.size} Personen`);
    publish("servers");

    return people.size;
}

/** Aktive Server der Person ohne Freigabe, deren Uhr nicht wegen einer offenen Anfrage steht. */
async function leavable(userId: string, keep: string | null): Promise<IInviteRow[]> {
    const rows = await store.othersActive(userId, keep);
    const paused = new Set((await store.requestsOf(userId)).filter((request) => request.status === "open").map((request) => request.guild_id));

    return rows.filter((row) => !paused.has(row.guild_id));
}

async function finishChoice(config: IConfig, choice: store.IChoiceRow): Promise<void> {
    if (!choice.chosen_guild || !(await store.endChoice(choice.user_id, "chosen", "done"))) return;

    const name = await personName(config, choice.user_id);
    const kept = await store.inviteOf(choice.chosen_guild);
    const gone: IInviteRow[] = [];

    for (const row of await leavable(choice.user_id, choice.chosen_guild)) {
        if (await leave(config, row, "choice", `RL Nexus verlässt diesen Server: ${name} hat RL Nexus auf mehreren Servern eingeladen und sich für einen anderen entschieden (ein Server pro Person).`)) gone.push(row);
    }

    await dm(config, choice.user_id, {
        strip: STRIPS.ok,
        title: `Erledigt: ${kept?.guild_name ?? "dein Server"} bleibt`,
        sub: gone.length ? `Der Bot hat ${names(gone)} verlassen. Deren Owner haben Bescheid im Log-Kanal bekommen.` : "Alle anderen Server hatte der Bot schon verlassen.",
        tiles: kept ? tiles([kept], () => "main") : [],
    });
    await audit(CLOCK, "servers.choice", choice.user_id, `${kept?.guild_name ?? choice.chosen_guild} bleibt, verlassen: ${names(gone) || "keine"}`.slice(0, 500));
}

async function timeoutChoice(config: IConfig, choice: store.IChoiceRow): Promise<void> {
    if (!(await store.endChoice(choice.user_id, "open", "timeout"))) return;

    const name = await personName(config, choice.user_id);
    const gone: IInviteRow[] = [];

    for (const row of await leavable(choice.user_id, null)) {
        if (await leave(config, row, "timeout", `RL Nexus verlässt diesen Server: ${name} hat sich in 24 Stunden für keinen Server entschieden (ein Server pro Person).`)) gone.push(row);
    }

    await dm(
        config,
        choice.user_id,
        {
            strip: STRIPS.grey,
            title: "RL Nexus hat deine Server verlassen",
            sub: `Du hast keinen Server gewählt. Der Bot ist von ${names(gone) || "deinen Servern"} gegangen.`,
            note: "Einladen kannst du ihn jederzeit wieder, dann für einen Server.",
        },
        { kind: "link", label: "Wieder einladen", url: inviteUrl(config) }
    );
    await audit(CLOCK, "servers.timeout", choice.user_id, `keine Wahl, verlassen: ${names(gone) || "keine"}`.slice(0, 500));
}

async function remind(config: IConfig, choice: store.IChoiceRow): Promise<void> {
    await store.setReminded(choice.user_id);

    const rows = await store.othersActive(choice.user_id, null);
    const clock = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(choice.deadline);

    await dm(
        config,
        choice.user_id,
        { strip: STRIPS.choice, title: "Noch 2 Stunden", sub: `Du hast noch keinen Server gewählt. Um ${clock} Uhr verlässt RL Nexus alle ${count(rows.length)}.`, tiles: tiles(rows, () => null) },
        { kind: "remind" }
    );
}

/** Eine Runde der Uhr: Erinnerungen, abgelaufene Bedenkzeit, abgelaufene Frist. */
export async function choiceRound(config: IConfig, now = Date.now()): Promise<void> {
    if ((await store.ruleStarted()) === null) return;

    for (const choice of await store.runningChoices()) {
        const step = choiceStep({ state: choice.state, deadline: choice.deadline.getTime(), reminded: choice.reminded === 1, chosenAt: choice.chosen_at?.getTime() ?? null }, now);

        if (step === "remind") await remind(config, choice);
        else if (step === "finish") await serial(() => finishChoice(config, choice));
        else if (step === "timeout") await serial(() => timeoutChoice(config, choice));

        if (step) publish("servers");
    }
}

/* --- Aus der DM (Bot leitet weiter) --------------------------------------- */

export interface IReply {
    readonly message: string;
    readonly undo?: boolean;
    readonly options?: readonly IServerOptionView[];
}

/** Anfrage aus der DM: weiterer Server oder Wechsel des Hauptservers. */
export async function requestFromDm(userId: string, guildId: string, kind: RequestKind, reason: string): Promise<IReply> {
    const text = reason.trim();
    if (text.length < 3 || text.length > 300) return { message: "Bitte schreib kurz dazu, wofür (3 bis 300 Zeichen)." };

    const row = await store.inviteOf(guildId);
    if (!row || row.user_id !== userId) return { message: "Diesen Server kennen wir nicht als einen von deinen." };
    if (kind === "extra" && (await store.approvalFor(userId, guildId))) return { message: `„${row.guild_name}“ ist schon freigegeben.` };

    const choice = await store.choiceOf(userId);
    const origin = choice && (choice.state === "open" || choice.state === "chosen") ? "wahl" : "dm";
    const id = await store.addRequest(userId, guildId, row.guild_name, kind, text, origin);

    if (id === null) return { message: `Für „${row.guild_name}“ läuft schon eine Anfrage. Das Team meldet sich.` };

    await audit(PERSON, "servers.request", userId, `${kind === "extra" ? "Weiterer Server" : "Wechsel"}: ${row.guild_name} (${guildId}) · ${text}`.slice(0, 500));
    publish("servers");

    if (kind === "switch") return { message: "Anfrage gesendet. Das Team schaut sie sich an, du bekommst eine DM." };

    return {
        message:
            row.state === "active"
                ? `Anfrage gesendet. Bis das Team entschieden hat, bleibt RL Nexus auf „${row.guild_name}“. Du bekommst eine DM.`
                : "Anfrage gesendet. Das Team schaut sie sich an, du bekommst eine DM. Ist sie freigegeben, kommt der Link zum Einladen gleich mit.",
    };
}

/** Server zur Auswahl: für „Zweiten Server anfragen“ und „Jetzt wählen“. */
export async function choiceOptions(userId: string): Promise<IReply> {
    const rows = await store.othersActive(userId, null);

    if (rows.length === 0) return { message: "Gerade läuft RL Nexus auf keinem deiner Server ohne Freigabe." };

    return { message: "Wähle einen Server.", options: optionsOf(rows, userId) };
}

export async function chooseFromDm(userId: string, guildId: string): Promise<IReply> {
    const choice = await store.choiceOf(userId);
    if (!choice || (choice.state !== "open" && choice.state !== "chosen")) return { message: "Die Wahl ist vorbei. Ändern geht jetzt nur noch über das Team." };

    const rows = await store.othersActive(userId, null);
    const picked = rows.find((row) => row.guild_id === guildId);
    if (!picked) return { message: "Diesen Server kennen wir nicht als einen von deinen." };
    if (!(await store.choose(userId, guildId))) return { message: "Die Wahl ist vorbei. Ändern geht jetzt nur noch über das Team." };

    // Wer einen Server mit offener Anfrage wählt, braucht die Anfrage nicht mehr.
    const open = await store.openRequestFor(userId, guildId);
    if (open) await store.decideRequest(open.id, "open", "done", null);

    const others = rows.filter((row) => row.guild_id !== guildId);
    await audit(PERSON, "servers.choose", userId, `${picked.guild_name} gewählt`);
    publish("servers");

    return { message: `${picked.guild_name} bleibt.${others.length ? ` ${names(others)} verlässt der Bot in ${THINK_TIME / 60_000} Minuten.` : ""} In den ${THINK_TIME / 60_000} Minuten kannst du die Wahl ändern, danach nur noch über das Team.`, undo: true };
}

export async function undoFromDm(userId: string): Promise<IReply> {
    const choice = await store.choiceOf(userId);
    if (choice?.state !== "chosen" || !(await store.choose(userId, null))) return { message: "Die Wahl lässt sich nicht mehr ändern. Frag das Team." };

    publish("servers");

    return { message: `Zurückgenommen. Wähle neu, bis <t:${Math.floor(choice.deadline.getTime() / 1000)}:f>.`, options: optionsOf(await store.othersActive(userId, null), userId) };
}

/* --- Entscheidungen des Teams ---------------------------------------------- */

async function mainOf(userId: string, except: string | null): Promise<IInviteRow | null> {
    return (await store.othersActive(userId, except))[0] ?? null;
}

async function openRequest(id: number): Promise<IRequestRow> {
    const request = await store.requestOf(id);
    if (!request || request.status !== "open") throw new PublicError(409, "Diese Anfrage ist schon entschieden.");

    return request;
}

/** Wechsel: Der Bot verlässt die bisherigen Server ohne Freigabe, target wird Hauptserver. */
async function applySwitch(config: IConfig, userId: string, guildId: string, guildName: string): Promise<void> {
    const name = await personName(config, userId);
    const gone: IInviteRow[] = [];

    for (const row of await store.othersActive(userId, guildId)) {
        if (await leave(config, row, "switch", `RL Nexus verlässt diesen Server: Das Team hat für ${name} einen anderen Hauptserver eingetragen (ein Server pro Person).`)) gone.push(row);
    }

    const target = await store.inviteOf(guildId);
    const there = target?.state === "active" && target.user_id === userId;

    if (there) await store.setApproval(guildId, null);

    await dm(
        config,
        userId,
        {
            strip: STRIPS.switch,
            title: "Hauptserver gewechselt",
            sub: `Das Team hat ${guildName} zu deinem Hauptserver gemacht.${gone.length ? ` ${names(gone)} verlässt der Bot.` : ""}`,
            note: there ? undefined : `Lade RL Nexus jetzt auf ${guildName} ein.`,
        },
        there ? { kind: "none" } : { kind: "link", label: "Jetzt einladen", url: inviteUrl(config, guildId) }
    );
}

export function approve(config: IConfig, id: number, actor: ITeamActor): Promise<void> {
    return serial(async () => {
        const request = await openRequest(id);
        if (!(await store.decideRequest(id, "open", "approved", actor))) throw new PublicError(409, "Diese Anfrage ist schon entschieden.");

        if (request.kind === "switch") {
            await applySwitch(config, request.user_id, request.guild_id, request.guild_name);
        } else {
            const row = await store.inviteOf(request.guild_id);
            const there = row?.state === "active" && row.user_id === request.user_id;

            if (there) await store.setApproval(request.guild_id, id);

            await dm(
                config,
                request.user_id,
                {
                    strip: STRIPS.ok,
                    title: "Freigegeben",
                    sub: `„${request.guild_name}“ ist freigegeben (✦ ${signature(id)}).${there ? " RL Nexus bleibt dort." : " Lade RL Nexus jetzt ein."}`,
                },
                there ? { kind: "none" } : { kind: "link", label: "Jetzt einladen", url: inviteUrl(config, request.guild_id) }
            );
        }

        await audit(actor, "servers.approve", request.user_id, `${request.kind === "extra" ? `${signature(id)} weiterer Server` : "Wechsel"}: ${request.guild_name} (${request.guild_id}) als ${actor.role}`.slice(0, 500));
        publish("servers");
    });
}

/** Ablehnen oder zurücknehmen: Steht der Bot noch dort und hat die Person einen anderen Server, geht er. */
async function dropServer(config: IConfig, userId: string, guildId: string, reason: "declined" | "revoked"): Promise<boolean> {
    const row = await store.inviteOf(guildId);
    if (row?.state !== "active" || row.user_id !== userId) return false;

    await store.setApproval(guildId, null);
    if (keepAlone((await store.othersActive(userId, guildId)).length)) return false;

    const name = await personName(config, userId);

    return leave(config, row, reason, `RL Nexus verlässt diesen Server: Für ${name} gibt es hier keine Freigabe für einen weiteren Server (ein Server pro Person).`);
}

export function decline(config: IConfig, id: number, actor: ITeamActor): Promise<void> {
    return serial(async () => {
        const request = await openRequest(id);
        if (!(await store.decideRequest(id, "open", "declined", actor))) throw new PublicError(409, "Diese Anfrage ist schon entschieden.");

        const left = request.kind === "extra" ? await dropServer(config, request.user_id, request.guild_id, "declined") : false;
        const main = await mainOf(request.user_id, request.guild_id);

        await dm(config, request.user_id, {
            strip: STRIPS.grey,
            title: "Nicht freigegeben",
            sub:
                request.kind === "switch"
                    ? `Einen Wechsel zu „${request.guild_name}“ gibt es nicht.${main ? ` RL Nexus bleibt auf ${main.guild_name}.` : ""}`
                    : `Für „${request.guild_name}“ gibt es keine Freigabe.${left ? " RL Nexus hat den Server verlassen." : ""}${main ? ` RL Nexus bleibt auf ${main.guild_name}.` : ""}`,
        });
        await audit(actor, "servers.decline", request.user_id, `${request.kind === "extra" ? "Weiterer Server" : "Wechsel"}: ${request.guild_name} (${request.guild_id}) als ${actor.role}`.slice(0, 500));
        publish("servers");
    });
}

export function revoke(config: IConfig, id: number, actor: ITeamActor): Promise<void> {
    return serial(async () => {
        const request = await store.requestOf(id);
        if (!request || request.kind !== "extra" || !(await store.decideRequest(id, "approved", "revoked", actor))) throw new PublicError(409, "Diese Freigabe gibt es nicht mehr.");

        const left = await dropServer(config, request.user_id, request.guild_id, "revoked");

        await dm(config, request.user_id, {
            strip: STRIPS.grey,
            title: "Freigabe zurückgenommen",
            sub: `Die Freigabe ✦ ${signature(id)} für „${request.guild_name}“ gilt nicht mehr.${left ? " RL Nexus hat den Server verlassen." : ""}`,
        });
        await audit(actor, "servers.revoke", request.user_id, `${signature(id)}: ${request.guild_name} (${request.guild_id}) als ${actor.role}`.slice(0, 500));
        publish("servers");
    });
}

/** Im Profil: „Hauptserver wechseln“ auf einen anderen Server der Person. */
export function switchMain(config: IConfig, userId: string, guildId: string, actor: ITeamActor): Promise<void> {
    return serial(async () => {
        const row = await store.inviteOf(guildId);
        if (!row || row.user_id !== userId) throw new PublicError(404, "Diesen Server hat die Person nicht eingeladen.");

        const id = await store.addDecided(userId, guildId, row.guild_name, "switch", "Vom Team gewechselt", actor);

        await applySwitch(config, userId, guildId, row.guild_name);
        await audit(actor, "servers.switch", userId, `Hauptserver jetzt ${row.guild_name} (${guildId}), Anfrage ${id}, als ${actor.role}`.slice(0, 500));
        publish("servers");
    });
}

/** Im Profil: „Bot entfernen“. */
export function removeFromProfile(config: IConfig, guildId: string, actor: ITeamActor): Promise<void> {
    return serial(async () => {
        const row = await store.inviteOf(guildId);
        if (!row || row.state !== "active") throw new PublicError(404, "Auf diesem Server ist RL Nexus nicht mehr.");
        if (!(await leave(config, row, "team", `Das Team von RL Nexus hat den Bot von diesem Server entfernt (als ${actor.role}).`))) throw new PublicError(502, "Der Bot antwortet nicht, er bleibt auf dem Server.");

        await audit(actor, "servers.remove", row.user_id, `${row.guild_name} (${guildId}) als ${actor.role}`);
        publish("servers");
    });
}

export interface IRemovedInput {
    readonly guildId: string;
    readonly guildName: string;
    readonly ownerId: string;
    readonly reason: string;
    readonly notifyOwner: boolean;
    readonly block: boolean;
}

/** Aus dem Bot-Dashboard (P1-A+): Protokoll, Sperre, DM an den Owner. Der Bot geht danach selbst. */
export async function recordRemoved(config: IConfig, input: IRemovedInput, actor: ITeamActor): Promise<{ readonly dm: boolean | null }> {
    if (input.block) await store.addBlock(input.guildId, actor.id, actor.name, input.reason);

    let delivered: boolean | null = null;

    if (input.notifyOwner) {
        const sent = await postDirectMessage(config, input.ownerId, { content: `Das Team von RL Nexus hat den Bot von „${input.guildName}“ entfernt. Fragen: support@nexus-emb.de` });
        delivered = !("error" in sent);
    }

    await serial(() => store.markLeft(input.guildId, "team"));
    await audit(actor, "servers.remove", input.guildId, `${input.guildName} als ${actor.role}: ${input.reason}${input.block ? " · neues Einladen gesperrt" : ""}${delivered === false ? " · DM an den Owner nicht zugestellt" : ""}`.slice(0, 500));
    publish("servers");

    return { dm: delivered };
}
