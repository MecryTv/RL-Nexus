/**
 * Prüft die Staff-Freigabe (W-0011, Plan 44) ohne Discord: die Regeln, den
 * Ablauf einer Anfrage und - mit gefakten Diensten - Dienst, Zugriff und Routen.
 *
 *   npm run check:staffgrant
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { Guild } from "discord.js";
import fastify, { FastifyReply, FastifyRequest } from "fastify";
import RouteManager from "../handler/RouteManager";
import Route from "../structures/Route";
import { DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";
import IDashboardGuild from "../interfaces/services/dashboard/IDashboardGuild";
import { StaffOverlay } from "../services/DashboardService";
import { ManageGate, PrivateGate, PrivateItem } from "../utils/managegate";
import { SessionOf } from "../utils/dashboard";
import BotClient from "../client/BotClient";
import { PRIVATE_HINT, REQUEST_TTL_MS } from "../constants/StaffGrant";
import { IStaffGrant, IStaffLogEntry } from "../interfaces/services/staffgrant/IStaffGrant";
import PulseService from "../services/PulseService";
import StaffGrantService, { StaffGrantBlocked } from "../services/StaffGrantService";
import { ActionText, AskList, ParseDuration } from "../services/staffgrant/Rules";
import { Answer, AnswerPrivate, AskPrivate, CanRequest, End, Extend, RemovePrivate, StaffGrantError, Tick, Withdraw } from "../services/staffgrant/Machine";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Der Satz, mit dem eine Aktion scheitert - oder null, wenn sie durchgeht. */
function fails(run: () => unknown): string | null {
    try {
        run();

        return null;
    } catch (error) {
        return error instanceof StaffGrantError ? error.message : `kein StaffGrantError: ${String(error)}`;
    }
}

const T0 = Date.UTC(2026, 10, 1, 10, 0, 0);
const MIN = 60_000;

function Grant(over: Partial<IStaffGrant> = {}): IStaffGrant {
    return {
        id: 1,
        guildId: "100",
        staffId: "900",
        staffName: "MecryTv | Joe",
        staffRole: "Developer",
        reason: "Zeige dir die Rangliste",
        minutes: 60,
        mode: "free",
        asked: ["1", "2"],
        denied: [],
        status: "open",
        createdAt: T0,
        expiresAt: T0 + REQUEST_TTL_MS,
        answeredBy: null,
        startsAt: null,
        endsAt: null,
        endedBy: null,
        endedAt: null,
        private: "none",
        privateReason: null,
        privateAskedAt: null,
        privateDeniedAt: null,
        privateDenied: [],
        privateBy: null,
        dms: {},
        ...over,
    };
}

const Running = (over: Partial<IStaffGrant> = {}): IStaffGrant =>
    Grant({ status: "active", answeredBy: "1", startsAt: T0, endsAt: T0 + 60 * MIN, ...over });

function checkRules(): void {
    console.log("\n📏 Regeln\n");

    const durations: [string, number | null][] = [
        ["45 Min.", 45],
        ["2 Std.", 120],
        ["1:30", 90],
        ["45", 45],
        ["2h", 120],
        ["1,5 Std.", 90],
        ["5 Min.", null],
        ["25 Std.", null],
        ["0:05", null],
        ["abc", null],
        ["", null],
    ];

    for (const [text, minutes] of durations) check(`Dauer „${text}“ → ${String(minutes)}`, ParseDuration(text) === minutes, String(ParseDuration(text)));

    const ok = new Set(["o", "a", "c"]);
    const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((entry, index) => entry === b[index]);

    check("Free fragt den Owner", same(AskList("free", "o", ["a", "b"], new Set()), ["o"]));
    check("Paid mit Zugang beim Owner fragt nur ihn", same(AskList("paid", "o", ["a", "b", "c"], ok), ["o"]));
    check("Paid ohne Owner-Zugang fragt Verwalter mit Zugang", same(AskList("paid", "x", ["a", "b", "c"], ok), ["a", "c"]));
    check("Paid ohne jemand mit Zugang fragt niemanden", AskList("paid", "x", ["b"], ok).length === 0);
    check("Beta fragt Owner und Verwalter mit Code, ohne Doppelte", same(AskList("beta", "o", ["a", "o", "b", "a"], ok), ["o", "a"]));

    const many = Array.from({ length: 15 }, (_, index) => `m${index}`);
    check("Nie mehr als 10 Gefragte", AskList("paid", "x", many, new Set(many)).length === 10);

    check("Aktion „save“", ActionText("Level System", "save") === "Level System › gespeichert");
    check("Unbekannte Aktion bleibt stehen", ActionText("Level System", "xyz") === "Level System › xyz");
    check("Ohne Aktion: geändert", ActionText("Level System", undefined) === "Level System › geändert");
}

function checkAnswer(): void {
    console.log("\n✅ Antworten\n");

    const yes = Answer(Grant(), "1", true, 60, false, T0 + 1000);
    check("Ja gibt frei", yes.status === "active" && yes.answeredBy === "1" && yes.startsAt === T0 + 1000 && yes.endsAt === T0 + 1000 + 60 * MIN);
    check("Ja ohne angefragte private Bereiche: none", yes.private === "none");
    check("Ja mit Schalter an: private on", Answer(Grant({ private: "asked" }), "1", true, 60, true, T0).private === "on");
    check("Ja mit Schalter aus: private denied", Answer(Grant({ private: "asked" }), "1", true, 60, false, T0).private === "denied");
    check("Eigene Dauer gilt", Answer(Grant(), "1", true, 45, false, T0).endsAt === T0 + 45 * MIN);

    const one = Answer(Grant(), "1", false, 60, false, T0);
    check("Ein Nein von zweien: bleibt offen", one.status === "open" && one.denied.includes("1"));

    const both = Answer(one, "2", false, 60, false, T0 + 5);
    check("Nein von allen: abgelehnt", both.status === "denied" && both.endedAt === T0 + 5);

    check("Nach Ablauf: verfallen", fails(() => Answer(Grant(), "1", true, 60, false, T0 + REQUEST_TTL_MS)) === "Die Anfrage ist schon verfallen.");
    check("Zweite Antwort nach dem Ja: schon beantwortet", fails(() => Answer(yes, "2", false, 60, false, T0 + 2000)) === "Schon beantwortet.");
    check("Nicht gefragt: abgewiesen", fails(() => Answer(Grant(), "3", true, 60, false, T0)) === "Diese Anfrage ist nicht an dich.");
    check("5 Minuten: abgewiesen", fails(() => Answer(Grant(), "1", true, 5, false, T0)) === "Bitte 10 Minuten bis 24 Stunden.");
}

function checkTick(): void {
    console.log("\n⏱️  Ablauf\n");

    check("Offen nach 10 Minuten: verfallen", Tick(Grant(), T0 + REQUEST_TTL_MS)?.status === "expired");
    check("Offen davor: unverändert", Tick(Grant(), T0 + REQUEST_TTL_MS - 1) === null);

    const ended = Tick(Running(), T0 + 60 * MIN);
    check("Laufend nach Ende: beendet ohne Person", ended?.status === "ended" && ended.endedBy === null && ended.endedAt === T0 + 60 * MIN);

    const asked = Tick(Running({ private: "asked", privateAskedAt: T0 }), T0 + REQUEST_TTL_MS);
    check("Späte private Anfrage verfällt", asked?.private === "none" && asked.status === "active");
    check("Laufend davor: unverändert", Tick(Running(), T0 + 59 * MIN) === null);
}

function checkExtendEnd(): void {
    console.log("\n➕ Verlängern und Beenden\n");

    let grant = Running();

    for (let i = 0; i < 3; i++) grant = Extend(grant, T0 + MIN);

    check("Dreimal +30 Min.", grant.endsAt === T0 + 150 * MIN);
    check("Bis an 24 Stunden heran", Extend(Running({ endsAt: T0 + 1430 * MIN }), T0).endsAt === T0 + 1440 * MIN);
    check("Über 24 Stunden: abgewiesen", fails(() => Extend(Running({ endsAt: T0 + 1440 * MIN }), T0)) === "Mehr als 24 Stunden geht nicht.");
    check("Offene Anfrage verlängern: abgewiesen", fails(() => Extend(Grant(), T0)) !== null);

    const end = End(Running(), "1", T0 + 5 * MIN);
    check("Beenden", end.status === "ended" && end.endedBy === "1" && end.endedAt === T0 + 5 * MIN);
    check("Offene Anfrage beenden: abgewiesen", fails(() => End(Grant(), "1", T0)) !== null);

    check("Zurückziehen", Withdraw(Grant(), T0).status === "withdrawn");
    check("Laufende zurückziehen: abgewiesen", fails(() => Withdraw(Running(), T0)) !== null);
}

function checkPrivate(): void {
    console.log("\n🔏 Private Bereiche\n");

    const asked = AskPrivate(Running(), "Ticket #0142 hängt", T0 + MIN);
    check("Später anfragen", asked.private === "asked" && asked.privateReason === "Ticket #0142 hängt" && asked.privateAskedAt === T0 + MIN);
    check("Ohne laufende Freigabe: abgewiesen", fails(() => AskPrivate(Grant(), "x", T0)) !== null);
    check("Ohne Grund: abgewiesen", fails(() => AskPrivate(Running(), "  ", T0)) !== null);
    check("Grund über 200 Zeichen: abgewiesen", fails(() => AskPrivate(Running(), "x".repeat(201), T0)) !== null);
    check("Schon offen: abgewiesen", fails(() => AskPrivate(Running({ private: "on" }), "x", T0)) !== null);
    check("Nach Nein vor 9 Min.: gesperrt", fails(() => AskPrivate(Running({ private: "denied", privateDeniedAt: T0 }), "x", T0 + 9 * MIN)) !== null);
    check("Nach Nein vor 11 Min.: geht", AskPrivate(Running({ private: "denied", privateDeniedAt: T0 }), "x", T0 + 11 * MIN).private === "asked");

    const on = AnswerPrivate(asked, "2", true, T0 + 2 * MIN);
    check("Ja öffnet", on.private === "on" && on.privateBy === "2");

    const no = AnswerPrivate(asked, "1", false, T0 + 2 * MIN);
    check("Ein Nein von zweien: bleibt angefragt", no.private === "asked" && no.privateDenied.includes("1"));

    const denied = AnswerPrivate(no, "2", false, T0 + 3 * MIN);
    check("Nein von allen: abgelehnt", denied.private === "denied" && denied.privateDeniedAt === T0 + 3 * MIN);
    check("Nicht gefragt: abgewiesen", fails(() => AnswerPrivate(asked, "3", true, T0)) === "Diese Anfrage ist nicht an dich.");

    check("Wegnehmen", RemovePrivate(on, "1").private === "removed");
    check("Wegnehmen ohne offene: abgewiesen", fails(() => RemovePrivate(Running(), "1")) !== null);
}

function checkCanRequest(): void {
    console.log("\n🚦 Neue Anfrage\n");

    check("Ohne andere: geht", CanRequest([], "900", T0) === null);
    check("Offene im Server: Satz", CanRequest([Grant({ staffId: "901" })], "900", T0) === "Gerade läuft schon eine Anfrage für diesen Server.");
    check("Laufende im Server: Satz mit Name", CanRequest([Running({ staffId: "901", staffName: "Ana" })], "900", T0) === "Ana bearbeitet diesen Server gerade.");

    const denied = Grant({ status: "denied", endedAt: T0 });
    const nine = CanRequest([denied], "900", T0 + 9 * MIN);
    check("Nein vor 9 Min.: Sperre bis HH:MM", /^Nach einem Nein geht die nächste Anfrage erst um \d\d:\d\d\.$/.test(nine ?? ""), String(nine));
    check("Nein vor 11 Min.: geht", CanRequest([denied], "900", T0 + 11 * MIN) === null);
    check("Nein an anderen Staff: geht", CanRequest([{ ...denied, staffId: "901" }], "900", T0 + MIN) === null);
    check("Beendete: geht", CanRequest([Running({ status: "ended", endedAt: T0 })], "900", T0 + MIN) === null);
}

/* ----------------------------------------------------------
   Task 2: Dienst mit gefakten Modellen, persönlicher Puls
   ---------------------------------------------------------- */

function FakeStore() {
    const grants = new Map<number, IStaffGrant>();
    const log: IStaffLogEntry[] = [];
    let next = 1;

    return {
        grants,
        log,
        staffGrants: {
            Live: async () => [...grants.values()].filter((g) => g.status === "open" || g.status === "active").map((g) => ({ ...g })),
            Save: async (g: IStaffGrant) => {
                const id = g.id || next++;

                grants.set(id, { ...g, id });

                return id;
            },
            OfGuild: async (guildId: string, since: number) =>
                [...grants.values()].filter((g) => g.guildId === guildId && (g.createdAt >= since || (g.endedAt ?? 0) >= since)).map((g) => ({ ...g })),
            Prune: async () => 0,
        },
        staffGrantLog: {
            Add: async (entry: Omit<IStaffLogEntry, "id">) => {
                log.push({ ...entry, id: log.length + 1 });
            },
            Of: async (grantId: number, limit: number) => log.filter((entry) => entry.grantId === grantId).slice(-limit).reverse(),
            OfGuild: async (guildId: string, since: number) => log.filter((entry) => entry.guildId === guildId && entry.at >= since).reverse(),
            Prune: async () => 0,
        },
    };
}

function FakeClient(store: ReturnType<typeof FakeStore>): BotClient {
    return {
        ...store,
        pulseService: new PulseService({} as BotClient),
        databaseService: { Ready: true },
        guilds: { cache: new Map() },
        users: { cache: new Map() },
    } as unknown as BotClient;
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function FakeService(store: ReturnType<typeof FakeStore>, asked: Record<string, string[]> = { "100": ["1", "2"] }): StaffGrantService {
    const service = new StaffGrantService(FakeClient(store));

    service.Askees = async (guild: Guild) => ({ mode: "free", users: asked[guild.id] ?? [] });
    service.dm = {
        Send: async (_grant: IStaffGrant, userId: string) => {
            if (userId === "2") throw new Error("Cannot send messages to this user");

            return { channelId: "dm", messageId: `m${userId}` };
        },
        Changed: () => undefined,
        Logged: () => undefined,
    };

    return service;
}

const GUILD = { id: "100", name: "Nova Esports" } as unknown as Guild;
const OTHER = { id: "101", name: "Leer" } as unknown as Guild;

function RequestOf(guild: Guild, staffId = "900") {
    return { guild, staffId, staffName: staffId === "900" ? "Joe" : "Ana", staffRole: "Developer" as const, reason: "Zeige dir die Rangliste", minutes: 60, private: false };
}

async function checkService(): Promise<void> {
    console.log("\n🗄️  Dienst\n");

    const store = FakeStore();
    const service = FakeService(store);
    const heard: string[] = [];

    service["client"].pulseService.SubscribeUser("1", (kind) => heard.push(kind), () => undefined);

    const grant = await service.Request(RequestOf(GUILD));
    await flush();

    check("Anfrage ist offen und gespeichert", grant.status === "open" && store.grants.get(grant.id)?.status === "open");
    check("DM an 1 ging raus, an 2 nicht (Review 5)", grant.dms["1"]?.messageId === "m1" && grant.dms["2"] === null);
    check("Protokoll: Angefragt", store.log.some((entry) => entry.text === "Angefragt von Joe für 1 Std."), store.log.map((entry) => entry.text).join(" | "));
    check("Current kennt sie", service.Current("100")?.id === grant.id);
    check("Gefragter hört den Puls", heard.includes("staff"));
    check("OpenFor zeigt sie dem Gefragten", service.OpenFor("1").length === 1 && service.OpenFor("3").length === 0);

    let error = await service.Request(RequestOf(GUILD, "901")).then(() => null, (thrown: unknown) => thrown);
    check("Zweite Anfrage im Server: blockiert", error instanceof StaffGrantBlocked && error.message === "Gerade läuft schon eine Anfrage für diesen Server.");

    error = await service.Request(RequestOf(OTHER)).then(() => null, (thrown: unknown) => thrown);
    check("Ohne Gefragte: abgewiesen", error instanceof StaffGrantError && error.message === "Niemand kann gerade gefragt werden.");

    await service.Answer(grant.id, "1", true, 60, false);
    await flush();

    const active = service.Active("900", "100");
    check("Nach dem Ja: Active", active?.status === "active");
    check("Protokoll: Erteilt", store.log.some((entry) => entry.text === "Erteilt von 1 für 1 Std."));
    check("Active ist null, sobald die Zeit um ist, auch vor dem Tick (Review 1)", service.Active("900", "100", active!.endsAt!) === null);

    // Neustart: ein frischer Dienst auf demselben Speicher (Review 2).
    const restarted = FakeService(store);
    await restarted.Load();
    check("Nach Load gilt die Freigabe weiter", restarted.Active("900", "100")?.id === grant.id);

    await restarted.Tick(active!.endsAt! + 1);
    await flush();
    check("Tick beendet sie", restarted.Active("900", "100") === null && store.grants.get(grant.id)?.status === "ended");
    check("Protokoll: Zeit abgelaufen", store.log.some((entry) => entry.text === "Zeit abgelaufen"));

    const seenStore = FakeStore();
    const seen = FakeService(seenStore);
    const open = await seen.Request(RequestOf(GUILD));
    const running = await seen.Answer(open.id, "1", true, 60, true);
    const before = seenStore.log.length;

    seen.Seen(running, "Live Tickets", "Ticket #12", T0);
    seen.Seen(running, "Live Tickets", "Ticket #12", T0 + 9 * MIN);
    await flush();
    check("Dasselbe Ansehen in 10 Min.: ein Eintrag", seenStore.log.length === before + 1);

    seen.Seen(running, "Live Tickets", "Ticket #12", T0 + 11 * MIN);
    await flush();
    check("Nach 11 Min.: zweiter Eintrag", seenStore.log.length === before + 2);
    check("Text des Ansehens", seenStore.log.at(-1)?.text === "Live Tickets › Ticket #12 geöffnet" && seenStore.log.at(-1)?.area === "Live Tickets");
}

function checkPulse(): void {
    console.log("\n📡 Persönlicher Puls\n");

    const pulse = new PulseService({} as BotClient);
    const got: string[] = [];

    pulse.SubscribeUser("1", (kind) => got.push(`1:${kind}`), () => undefined);
    pulse.SubscribeUser("2", (kind) => got.push(`2:${kind}`), () => undefined);
    pulse.EmitUser("1", "staff");

    check("Nur der Nutzer selbst hört", got.length === 1 && got[0] === "1:staff");
    check("Online stimmt", pulse.Online("1") && !pulse.Online("3"));

    for (let i = 0; i < 3; i++) pulse.SubscribeUser("1", () => undefined, () => undefined);

    check("Fünftes persönliches Fenster: abgewiesen", pulse.SubscribeUser("1", () => undefined, () => undefined) === null);
    check("Server-Puls zählt getrennt", pulse.Subscribe("100", "1", () => undefined, () => undefined) !== null);
}

/* ----------------------------------------------------------
   Task 3: Zugriff mit Freigabe
   ---------------------------------------------------------- */

function Card(id: string, role: IDashboardGuild["role"]): IDashboardGuild {
    const manage = role === "Owner" || role === "Admin";

    return { id, name: id, role, canManage: manage, canSupport: manage, canModerate: manage, canReview: manage } as IDashboardGuild;
}

function checkOverlay(): void {
    console.log("\n🪪 Karte mit Freigabe\n");

    const running = Running({ endsAt: T0 + 60 * MIN });
    const cards = [Card("100", "Staff"), Card("101", "Owner"), Card("102", "Staff")];
    const out = StaffOverlay(cards, (guildId) => (guildId === "100" || guildId === "101" ? running : null));

    check("Staff mit Freigabe darf verwalten", out[0].canManage && out[0].staff?.grantId === running.id && out[0].staff?.until === running.endsAt);
    check("Ohne private Bereiche: kein Support, keine Moderation, keine Bewerbungen", !out[0].canSupport && !out[0].canModerate && !out[0].canReview && out[0].staff?.private === false);
    check("Mit privaten Bereichen: alles offen", StaffOverlay([Card("100", "Staff")], () => Running({ private: "on" }))[0].canSupport);
    check("Owner-Karte bleibt, wie sie ist", out[1] === cards[1]);
    check("Staff ohne Freigabe bleibt nur lesend", !out[2].canManage && !out[2].staff);
}

const GATE_GUILD = "112233445566778899";

class GateProbe extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/probe`,
            description: "Prüft ManageGate",
            prefixed: false,
            requiresAuth: false,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const access = await ManageGate(this.client, request, reply, "levels");

        if (!access) return reply;
        if (request.method === "POST" && (request.body as { action?: string } | undefined)?.action === "bad") return reply.code(400).send({ error: "nein" });

        return reply.send({ actor: access.actor, member: access.member.id });
    }
}

function GateApp(options: { grant: IStaffGrant | null; canManage: boolean; bot?: boolean; member?: boolean }) {
    const logged: string[] = [];
    const guild = {
        id: GATE_GUILD,
        members: {
            cache: new Map(options.member ? [["900", { id: "900", displayName: "Joe als Mitglied" }]] : []),
            fetch: async () => {
                throw new Error("Unknown Member");
            },
            me: options.bot === false ? null : { id: "bot", displayName: "RL Nexus" },
        },
    };
    const client = {
        dashboardService: {
            Session: (cookie: string | undefined) =>
                cookie === "gueltig" ? { id: "s", userId: "900", username: "Joe", avatar: null, accessToken: "x", mfa: true, expiresAt: Date.now() + 60_000 } : null,
            CanManage: async () => options.canManage,
            Secure: false,
        },
        databaseService: { Ready: true },
        guilds: { cache: new Map([[GATE_GUILD, guild]]) },
        settings: { Of: async () => ({ modules: ["levels"] }) },
        staffGrantService: {
            Active: () => options.grant,
            Log: (_grant: IStaffGrant, _area: string, text: string) => logged.push(text),
        },
    } as unknown as BotClient;
    const instance = fastify({ logger: false });
    const manager = new RouteManager(client);

    manager.Register(new GateProbe(client));
    manager.Apply(instance);

    const call = (method: "GET" | "POST", action?: string) =>
        instance.inject({
            method,
            url: `${DASHBOARD_PATH}/api/guild/${GATE_GUILD}/probe`,
            headers: { cookie: `${SESSION_COOKIE}=gueltig`, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
            ...(method === "POST" ? { payload: JSON.stringify({ action }) } : {}),
        });

    return { call, logged };
}

async function checkGate(): Promise<void> {
    console.log("\n🚪 ManageGate mit Freigabe\n");

    const running = Running({ endsAt: Date.now() + 60 * MIN });

    let app = GateApp({ grant: null, canManage: false });
    check("Staff ohne Freigabe: 403", (await app.call("GET")).statusCode === 403);

    app = GateApp({ grant: running, canManage: true });
    const read = await app.call("GET");
    const body = read.json() as { actor: { id: string; name: string; staff: boolean }; member: string };
    check("Mit Freigabe, ohne Mitgliedschaft: 200", read.statusCode === 200, read.body);
    check("Akteur ist Staff, Mitglied ist der Bot", body.actor?.id === "900" && body.actor.name === "Joe (RL Nexus Staff)" && body.actor.staff && body.member === "bot", read.body);

    check("Speichern: 200", (await app.call("POST", "save")).statusCode === 200);
    await flush();
    check("Speichern schreibt „Level System › gespeichert“", app.logged.length === 1 && app.logged[0] === "Level System › gespeichert", app.logged.join(" | "));
    check("Abgewiesen (400): kein Eintrag", (await app.call("POST", "bad")).statusCode === 400 && (await flush(), app.logged.length === 1));
    check("Lesen: kein Eintrag", (await app.call("GET")).statusCode === 200 && (await flush(), app.logged.length === 1));

    app = GateApp({ grant: running, canManage: true, member: true });
    const both = (await app.call("GET")).json() as { actor: { staff: boolean }; member: string };
    check("Staff ist auch Mitglied: trotzdem Bot und Staff-Akteur", both.actor?.staff === true && both.member === "bot");

    app = GateApp({ grant: null, canManage: false });
    check("Nach dem Ende: 403 (Review 1)", (await app.call("POST", "save")).statusCode === 403);

    app = GateApp({ grant: running, canManage: false });
    check("Freigabe da, aber Karte weg (Gruppe verloren): 403 (Review 3)", (await app.call("GET")).statusCode === 403);

    app = GateApp({ grant: running, canManage: true, bot: false });
    const nobot = await app.call("GET");
    check("Bot-Mitglied fehlt: 403 mit Hinweis", nobot.statusCode === 403 && (nobot.json() as { hint?: string }).hint === "Der Bot fehlt gerade im Speicher dieses Servers. Bitte gleich noch mal.", nobot.body);
}

/* ----------------------------------------------------------
   Task 4: Private Bereiche
   ---------------------------------------------------------- */

class PrivateProbe extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/private/:ticket?`,
            description: "Prüft PrivateGate",
            prefixed: false,
            requiresAuth: false,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const session = SessionOf(this.client, request)!;
        const { id } = request.params as { id: string };

        if (!PrivateGate(this.client, session, id, reply, "Live Tickets", PrivateItem(request))) return reply;

        return reply.send({ ok: true });
    }
}

function PrivateApp(grant: IStaffGrant | null) {
    const logged: string[] = [];
    const client = {
        dashboardService: {
            Session: (cookie: string | undefined) =>
                cookie === "gueltig" ? { id: "s", userId: "900", username: "Joe", avatar: null, accessToken: "x", mfa: true, expiresAt: Date.now() + 60_000 } : null,
            Secure: false,
        },
        staffGrantService: {
            Active: () => grant,
            Seen: (_grant: IStaffGrant, area: string, item: string) => logged.push(`${area} › ${item} geöffnet`),
            Log: (_grant: IStaffGrant, _area: string, text: string) => logged.push(text),
        },
    } as unknown as BotClient;
    const instance = fastify({ logger: false });
    const manager = new RouteManager(client);

    manager.Register(new PrivateProbe(client));
    manager.Apply(instance);

    const call = (method: "GET" | "POST", suffix = "") =>
        instance.inject({
            method,
            url: `${DASHBOARD_PATH}/api/guild/${GATE_GUILD}/private${suffix}`,
            headers: { cookie: `${SESSION_COOKIE}=gueltig`, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
            ...(method === "POST" ? { payload: JSON.stringify({ action: "send" }) } : {}),
        });

    return { call, logged };
}

async function checkPrivateGate(): Promise<void> {
    console.log("\n🔏 Riegel vor den privaten Bereichen\n");

    const item = (params: Record<string, string>, query: Record<string, string> = {}) => PrivateItem({ params, query } as unknown as FastifyRequest);

    check("Gegenstand: Ticket", item({ ticket: "12" }) === "Ticket #12");
    check("Gegenstand: Fall aus der Adresse", item({ case: "7" }) === "Fall #7");
    check("Gegenstand: Fall aus der Abfrage", item({}, { case: "8" }) === "Fall #8");
    check("Gegenstand: sonst Liste", item({}) === "Liste");

    let app = PrivateApp(Running({ endsAt: Date.now() + 60 * MIN }));
    const shut = await app.call("GET", "/12");
    check("Freigabe ohne private Bereiche: 403 mit Hinweis", shut.statusCode === 403 && (shut.json() as { hint?: string }).hint === PRIVATE_HINT, shut.body);
    check("Gesperrt: nichts im Protokoll", app.logged.length === 0);

    app = PrivateApp(Running({ endsAt: Date.now() + 60 * MIN, private: "on" }));
    check("Mit privaten Bereichen: durch", (await app.call("GET", "/12")).statusCode === 200);
    check("Ansehen steht im Protokoll", app.logged[0] === "Live Tickets › Ticket #12 geöffnet", app.logged.join(" | "));
    check("Schreiben: durch", (await app.call("POST", "/12")).statusCode === 200);
    await flush();
    check("Schreiben steht im Protokoll", app.logged.includes("Live Tickets › gesendet"), app.logged.join(" | "));

    app = PrivateApp(null);
    check("Ohne Staff-Freigabe: durch, nichts im Protokoll", (await app.call("GET", "/12")).statusCode === 200 && app.logged.length === 0);
}

async function main(): Promise<void> {
    checkRules();
    checkAnswer();
    checkTick();
    checkExtendEnd();
    checkPrivate();
    checkCanRequest();
    checkPulse();
    await checkService();
    checkOverlay();
    await checkGate();
    await checkPrivateGate();

    console.log(failures ? `\n❌ ${failures} Prüfung(en) fehlgeschlagen` : "\n✅ Alles in Ordnung");
    process.exit(failures ? 1 : 0);
}

void main();
