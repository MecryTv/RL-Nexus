/**
 * Prüft die Modul-Einstellungen aus dem Admin Dashboard (W-0131) ohne Discord
 * und ohne Datenbank: Status je Modul, Beta-Server, Hinweis, Verknüpfungsart,
 * Laden und den Bescheid des Admins.
 *
 *   npm run check:modulflags
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { MessageFlags, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import BotClient from "../client/BotClient";
import { AskLine, IsServerAdmin, LimitReply } from "../builder/LimitReply";
import { SUPPORT_URL } from "../constants/Help";
import CommandHandler from "../events/client/CommandHandler";
import GuildSettings from "../models/GuildSettings";
import PlayerAccount, { LinkUsable } from "../models/PlayerAccount";
import RankRoleService, { LOGIN_ONLY, RankRoleError } from "../services/RankRoleService";
import Module from "../commands/admin/Module";
import { ApplyLinkMode, SyncLinkModes } from "../utils/linkModeWatch";
import AdminModulesReload from "../routes/AdminModulesReload";
import AdminModulesState from "../routes/AdminModulesState";
import {
    ActiveModules,
    BetaGuildCount,
    ClosedText,
    CurrentLinkMode,
    IModuleOverrideRow,
    LimitInfo,
    LoadFlags,
    ModuleLimits,
    ModuleNotices,
    ModuleOpen,
    ModuleValue,
    NoticeOf,
    RankOpen,
    OnFlagsLoaded,
    SetFlags,
} from "../utils/moduleFlags";
import { settingDef, settingsOf } from "../constants/ModuleSettings";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${!passed && detail ? `  → ${detail}` : ""}`);
}

const CLOSED = "Dieses Modul ist gerade abgeschaltet.";

interface IFakeGuild {
    id: string;
    ownerId: string;
    members: { cache: Map<string, { permissions: { has: (flag: unknown) => boolean } }> };
}

function Guild(id: string, ownerId: string, managers: string[] = []): IFakeGuild {
    return { id, ownerId, members: { cache: new Map(managers.map((userId) => [userId, { permissions: { has: () => true } }])) } };
}

function Client(settings: Record<string, unknown>[], beta: string[], guilds: IFakeGuild[], fail = false, overrides: Record<string, unknown>[] = []): BotClient {
    return {
        databaseService: {
            Ready: true,
            Query: async (sql: string) => {
                if (fail) throw new Error("Tabelle fehlt");
                if (sql.includes("bot_module_settings")) return settings;
                if (sql.includes("bot_module_overrides")) return overrides;
                if (sql.includes("beta_members")) return beta.map((user_id) => ({ user_id }));

                return [];
            },
        },
        guilds: { cache: new Map(guilds.map((guild) => [guild.id, guild])) },
    } as unknown as BotClient;
}

function Reply(): { statusCode: number; code: (status: number) => unknown; send: (body?: unknown) => unknown } {
    const reply = {
        statusCode: 200,
        code(status: number) {
            reply.statusCode = status;

            return reply;
        },
        send() {
            return reply;
        },
    };

    return reply;
}

/** Ein Server mit gespeicherter Modulliste, ohne Datenbank darunter. Write merkt sich, was gespeichert würde. */
function SettingsClient(stored: string[]): { client: BotClient; written: string[][] } {
    const written: string[][] = [];
    let modules = JSON.stringify(stored);
    const row = () => ({ guild_id: "g1", modules, rank_roles: "{}", match_channel: null, queue_channel: null, moderators: "{}" });

    const client = {
        databaseService: {
            Ready: true,
            Cached: (_table: string, _key: string, load: () => unknown) => load(),
            One: async () => row(),
            Query: async () => [row()],
            Write: async (_sql: string, values: unknown[]) => {
                modules = String(values[1]);
                written.push(JSON.parse(modules) as string[]);

                return { affectedRows: 1, insertId: 0 };
            },
            Bump: () => undefined,
        },
    } as unknown as BotClient;

    return { client, written };
}

async function checkGating(): Promise<void> {
    console.log("\n  — Abschalten wirkt (W-0131) —");

    const { client, written } = SettingsClient(["polls", "welcome"]);
    const settings = new GuildSettings(client);

    SetFlags([{ module: "polls", status: "off", notice: null }], [], []);
    const off = (await settings.Of("g1")).modules;
    check("Global aus: Modul fehlt in der Liste des Servers, gespeichert bleibt es", !off.includes("polls") && off.includes("welcome") && (await settings.RawModules("g1")).includes("polls"), off.join(","));

    const many = await settings.ModulesOf(["g1"]);
    check("Auch die Liste für mehrere Server lässt es weg", !(many.get("g1") ?? []).includes("polls"));

    const toggled = await settings.Toggle("g1", "clips", true);
    check("Ein anderes Modul schalten lässt das abgeschaltete in der Spalte", (written.at(-1) ?? []).includes("polls") && (written.at(-1) ?? []).includes("clips") && !toggled.includes("polls"), JSON.stringify(written.at(-1)));

    SetFlags([], [], []);
    check("Wieder an: der Server hat es ohne Zutun zurück", (await settings.Of("g1")).modules.includes("polls"));

    // Befehle eines geschlossenen Moduls laufen nicht, der Bot antwortet mit dem Hinweis, ohne Ping.
    SetFlags([{ module: "polls", status: "off", notice: "@everyone **Umbau**" }], [], []);
    let ran = 0;
    const replies: Record<string, unknown>[] = [];
    const command = (module?: string) => ({ name: "umfrage", module, developerOnly: false, cooldown: 1, Execute: async () => void ran++ });
    const handlerClient = (module?: string) =>
        ({
            commands: new Map([["umfrage", command(module)]]),
            cooldowns: new Map(),
            config: { DEV_USER_IDs: [] },
        }) as unknown as BotClient;
    const interaction = () => ({
        commandName: "umfrage",
        guildId: null,
        user: { id: "u1" },
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        isContextMenuCommand: () => false,
        isUserContextMenuCommand: () => false,
        isMessageContextMenuCommand: () => false,
        inCachedGuild: () => false,
        reply: async (message: Record<string, unknown>) => void replies.push(message),
    });

    await new CommandHandler(handlerClient("polls")).Execute(interaction() as never);
    const answer = JSON.stringify(replies.at(-1) ?? {});
    check("Befehl eines abgeschalteten Moduls läuft nicht", ran === 0);
    check("Antwort mit dem Hinweis, nur für die Person, ohne Ping", answer.includes("Umbau") && answer.includes('"parse":[]') && (replies.at(-1)?.flags !== undefined || answer.includes("ephemeral") || answer.includes('"flags"')), answer.slice(0, 300));

    await new CommandHandler(handlerClient(undefined)).Execute(interaction() as never);
    check("Befehl ohne Modul läuft", ran === 1);

    SetFlags([{ module: "polls", status: "off", notice: "<b>Umbau</b>" }, { module: "clips", status: "on", notice: "Neu" }], [], []);
    const notices = ModuleNotices(["polls", "clips", "welcome"], "g1");
    check(
        "Dashboard: Hinweise und Sperren je Modul, Text roh (das Dashboard setzt ihn als Text)",
        notices.polls?.open === false && notices.polls?.text === "<b>Umbau</b>" && notices.clips?.open === true && notices.clips?.text === "Neu" && !("welcome" in notices),
        JSON.stringify(notices)
    );
    SetFlags([], [], []);
}

/** W-0131: Was eine Verknüpfung per Name (verified 0) je Art darf, und das Entfernen der Rang-Rollen beim Verschärfen. */
async function checkTrust(): Promise<void> {
    console.log("\n  — Vertrauen je Verknüpfungsart (W-0131) —");

    const byName = { user_id: "u1", account_id: "a1", display_name: "Nova", verified: 0 } as never;
    const byLogin = { user_id: "u2", account_id: "a2", display_name: "Echt", verified: 1 } as never;
    const model = (row: unknown) => ({ On: async () => row, Where: async () => (row ? [row] : []) }) as unknown as PlayerAccount;
    const linked = (row: unknown, need: "card" | "trusted") => PlayerAccount.prototype.Linked.call(model(row), "u1", "epic", need);
    const owner = (row: unknown) => PlayerAccount.prototype.TrustedOwner.call(model(row), "epic", "a1");
    const mode = (linkMode: "login" | "name" | "both") => SetFlags([{ module: "rl-tracking", status: "on", notice: null, linkMode }], [], []);

    mode("name");
    check("Nur Name: Verknüpfung per Name zählt überall", !!(await linked(byName, "card")) && !!(await linked(byName, "trusted")) && (await owner(byName)) === "u1");

    mode("both");
    check("Beides: per Name für Karte ja, für Rollen, Giveaways und Besitzer nein", !!(await linked(byName, "card")) && (await linked(byName, "trusted")) === null && (await owner(byName)) === null);

    mode("login");
    check("Anmeldung: per Name gilt als nicht verbunden", (await linked(byName, "card")) === null && (await linked(byName, "trusted")) === null && (await owner(byName)) === null);
    check("Per Login verbunden zählt immer", !!(await linked(byLogin, "card")) && !!(await linked(byLogin, "trusted")) && (await owner(byLogin)) === "u2");

    // Merker in bot_state: zuletzt angewandte Art. Strenger geworden heißt: Rang-Rollen ohne Anmeldung weg.
    const state = new Map<string, string>();
    let strips = 0;
    const client = {
        databaseService: {
            Ready: true,
            Query: async (sql: string, values: string[] = []) => {
                if (sql.startsWith("SELECT")) return state.has("link_mode_applied") ? [{ value: state.get("link_mode_applied") }] : [];

                state.set(values[0]!, values[1]!);

                return [];
            },
        },
        rankRoleService: { StripUnverified: async () => void strips++ },
    } as unknown as BotClient;

    check("Ohne Merker gilt Anmeldung: nichts zu entfernen", !(await ApplyLinkMode(client, "login")) && strips === 0 && state.get("link_mode_applied") === "login");
    check("Lockerer (Anmeldung → Name): nichts entfernt, Merker folgt", !(await ApplyLinkMode(client, "name")) && strips === 0 && state.get("link_mode_applied") === "name");
    check("Strenger (Name → Anmeldung), auch nach Neustart: einmal entfernt", (await ApplyLinkMode(client, "login")) && strips === 1 && state.get("link_mode_applied") === "login");
    check("Danach nicht noch einmal", !(await ApplyLinkMode(client, "login")) && strips === 1);
    state.set("link_mode_applied", "name");
    check("Name → Beides ist auch strenger", (await ApplyLinkMode(client, "both")) && strips === 2);

    // W-0133: Art je Server. Alle mit Anmeldung, Server A mit Beides.
    const perServer = (global: "login" | "name" | "both", guildId: string, linkMode: "login" | "name" | "both") =>
        SetFlags([{ module: "rl-tracking", status: "on", notice: null, linkMode: global }], [], [], [{ module: "rl-tracking", guildId, status: null, notice: null, linkMode, values: {}, updatedAt: null }]);

    perServer("login", "A", "both");
    check("Art je Server: per Name zählt für die Karte auf A, nicht auf B", LinkUsable(byName, "card", "A") && !LinkUsable(byName, "card", "B"));
    check("Art je Server: Rang-Rollen auf A mit Beides nicht per Name", !LinkUsable(byName, "trusted", "A"));
    check(
        "Art je Server: Linked und TrustedOwner fragen den Server",
        !!(await PlayerAccount.prototype.Linked.call(model(byName), "u1", "epic", "card", "A")) &&
            (await PlayerAccount.prototype.Linked.call(model(byName), "u1", "epic", "card", "B")) === null &&
            (await PlayerAccount.prototype.TrustedOwner.call(model(byName), "epic", "a1", "A")) === null
    );

    // Merker je Server: link_mode_applied für alle, link_mode_applied:<Server> je Server.
    const markers = new Map<string, string>([["link_mode_applied", "name"]]);
    const stripped: string[] = [];
    const linkClient = {
        databaseService: {
            Ready: true,
            Query: async (sql: string, values: string[] = []) => {
                if (sql.startsWith("SELECT value")) return markers.has(values[0]!) ? [{ value: markers.get(values[0]!) }] : [];
                if (sql.startsWith("SELECT name")) return [...markers].filter(([name]) => name.startsWith("link_mode_applied:")).map(([name, value]) => ({ name, value }));
                if (sql.startsWith("DELETE")) {
                    markers.delete(values[0]!);

                    return [];
                }

                markers.set(values[0]!, values[1]!);

                return [];
            },
        },
        rankRoleService: { StripUnverified: async (guildId?: string) => void stripped.push(guildId ?? "alle") },
    } as unknown as BotClient;

    check(
        "Server A von Nur Name auf Anmeldung: Rollen nur auf A weg, Merker nur für A",
        (await ApplyLinkMode(linkClient, "login", "A")) && stripped.join(",") === "A" && markers.get("link_mode_applied:A") === "login" && markers.get("link_mode_applied") === "name",
        `${stripped.join(",")} ${JSON.stringify([...markers])}`
    );
    check("Server B ohne eigenen Merker folgt dem für alle: Nur Name bleibt, nichts weg", !(await ApplyLinkMode(linkClient, "name", "B")) && stripped.join(",") === "A");

    // Eigene Art von A wieder entfernt: A folgt der Art für alle, der Merker von A verschwindet.
    await SyncLinkModes(linkClient, new Map([[null, "name"]]));
    check("Eigene Art entfernt: Merker des Servers weg, nichts entfernt", !markers.has("link_mode_applied:A") && stripped.join(",") === "A", JSON.stringify([...markers]));

    await SyncLinkModes(linkClient, new Map<string | null, "login" | "name" | "both">([[null, "name"], ["A", "both"]]));
    check("Später wieder strenger für A: wird erneut angewandt", stripped.join(",") === "A,A" && markers.get("link_mode_applied:A") === "both", stripped.join(","));

    // Review: Ist Rank Roles global aus, muss das Aufräumen trotzdem die gespeicherten Server erreichen.
    SetFlags([{ module: "rank-roles", status: "off", notice: null }], [], []);
    const removed: string[] = [];
    const member = { id: "u1", roles: { cache: new Set(["r1"]), remove: async (roles: string[]) => void removed.push(...roles) } };
    const guild = { id: "g1", members: { cache: new Map([["u1", member]]), fetch: async () => null } };
    const service = new RankRoleService({
        guilds: { cache: new Map([["g1", guild]]) },
        settings: { Of: async () => ({ modules: ActiveModules("g1", ["rank-roles"]) }), RawModules: async () => ["rank-roles"] },
        config: { GUILD_MEMBER_INTENT: false },
    } as unknown as BotClient) as unknown as Record<string, unknown> & { Strip: (userId: string) => Promise<number> };

    service.Settings = async () => ({});
    service.Managed = () => new Set(["r1"]);
    service.Blocked = () => null;

    const count = await service.Strip("u1");
    check("Rank Roles global aus: Trennen nimmt die Rollen trotzdem ab (gespeicherte Server zählen)", count === 1 && removed.includes("r1"), `${count} ${removed.join(",")}`);

    SetFlags([], [], []);
}

/** W-0133: Werte je Modul, Werte je Server, Status und Hinweis je Server, Laden und die Zustands-Route. */
async function checkValues(): Promise<void> {
    console.log("\n  — Werte je Modul und Server (W-0133) —");

    const at = new Date("2026-11-16T21:05:00.000Z");
    const over = (module: string, guildId: string, extra: Record<string, unknown>): IModuleOverrideRow =>
        ({ module, guildId, status: null, notice: null, linkMode: null, values: {}, updatedAt: null, ...extra }) as IModuleOverrideRow;

    SetFlags([], [], []);
    check("Ohne Zeilen gilt der Standard aus dem Verzeichnis", ModuleValue("giveaways", "maxWinners", "g1") === 50 && ModuleValue("rl-tracking", "switchDays", null) === 3);

    SetFlags([{ module: "giveaways", status: "on", notice: null, values: { maxWinners: 30 } }], [], []);
    check("Wert für alle, fehlende Schlüssel mit Standard", ModuleValue("giveaways", "maxWinners", "g1") === 30 && ModuleValue("giveaways", "maxDays", "g1") === 60);

    SetFlags(
        [
            { module: "giveaways", status: "on", notice: null, values: { maxWinners: 30 } },
            { module: "rl-tracking", status: "on", notice: null, values: { switchDays: 5 } },
        ],
        [],
        [],
        [over("giveaways", "g1", { values: { maxWinners: 100 }, updatedAt: at }), over("rl-tracking", "g1", { values: { switchDays: 9 } })]
    );
    check("Server-Wert schlägt den für alle, nur auf diesem Server", ModuleValue("giveaways", "maxWinners", "g1") === 100 && ModuleValue("giveaways", "maxWinners", "g2") === 30);
    check("„Nur alle“-Schlüssel übergehen Server-Werte", ModuleValue("rl-tracking", "switchDays", "g1") === 5);

    const granted = LimitInfo("giveaways", "maxWinners", "g1");
    const plain = LimitInfo("giveaways", "maxWinners", "g2");
    check(
        "LimitInfo: freigeschaltet nur mit Server-Wert, standard ist der Wert für alle",
        granted.granted && granted.value === 100 && granted.standard === 30 && granted.since?.getTime() === at.getTime() && !plain.granted && plain.value === 30 && plain.since === null,
        JSON.stringify({ granted, plain })
    );
    check("Auf Anfrage: Voreinstellung aus dem Verzeichnis", granted.askable && !LimitInfo("giveaways", "scheduleDays", "g1").askable && granted.def.label === "Gewinner höchstens");

    SetFlags([{ module: "giveaways", status: "on", notice: null, askable: { maxWinners: false } }], [], []);
    check("Auf Anfrage: gespeicherter Schalter gilt", !LimitInfo("giveaways", "maxWinners", "g1").askable);

    SetFlags([{ module: "polls", status: "on", notice: "Für alle" }], [], [], [over("polls", "g1", { status: "off", notice: "Nur hier" })]);
    check("Server-Status aus schließt nur diesen Server", !ModuleOpen("polls", "g1") && ModuleOpen("polls", "g2") && ModuleOpen("polls", null, "u1"));
    check("Server-Hinweis vor dem für alle", NoticeOf("polls", "g1") === "Nur hier" && NoticeOf("polls", "g2") === "Für alle" && ClosedText("polls", "g1") === "Nur hier");

    SetFlags([{ module: "polls", status: "off", notice: null }], [], [], [over("polls", "g1", { status: "on" })]);
    check("Server-Status an öffnet trotz Aus für alle", ModuleOpen("polls", "g1") && !ModuleOpen("polls", "g2"));
    check("Modulliste des Servers folgt dem Server-Status", ActiveModules("g1", ["polls"]).includes("polls") && !ActiveModules("g2", ["polls"]).includes("polls"));

    // Review Focus 2: Server-Wert entfernt, beim nächsten Stand gilt sofort wieder der Wert für alle.
    SetFlags([{ module: "giveaways", status: "on", notice: null, values: { maxWinners: 30 } }], [], [], [over("giveaways", "g1", { values: { maxWinners: 100 } })]);
    SetFlags([{ module: "giveaways", status: "on", notice: null, values: { maxWinners: 30 } }], [], []);
    check("Server-Wert entfernt: sofort wieder der Wert für alle", ModuleValue("giveaways", "maxWinners", "g1") === 30 && !LimitInfo("giveaways", "maxWinners", "g1").granted);

    SetFlags([{ module: "rl-tracking", status: "on", notice: null, linkMode: "login" }], [], [], [over("rl-tracking", "g1", { linkMode: "both" })]);
    check("Verknüpfungsart: Server-Wert vor dem für alle", CurrentLinkMode("g1") === "both" && CurrentLinkMode("g2") === "login" && CurrentLinkMode() === "login");

    SetFlags([], [], ["g1", "g2"]);
    check("Beta-Server werden gezählt", BetaGuildCount() === 2);

    // Review W-0133: Werte aus der Datenbank gelten nur innerhalb der harten Grenzen.
    SetFlags([{ module: "tickets", status: "on", notice: null, values: { maxOpenPerUser: 99 } }], [], [], [over("giveaways", "g1", { values: { maxWinners: 9999 } })]);
    check("Harte Grenzen: zu große Werte aus der Datenbank werden geklemmt", ModuleValue("tickets", "maxOpenPerUser", "g1") === 24 && ModuleValue("giveaways", "maxWinners", "g1") === 500);

    // Laden: Werte, Anfrage-Schalter und Server-Werte aus der Datenbank.
    const states: string[] = [];
    OnFlagsLoaded((state) => states.push(`${state.linkModes.get(null)}|${state.linkModes.get("g7") ?? "-"}`));
    const loaded = await LoadFlags(
        Client(
            [{ module: "giveaways", status: "on", notice: null, config: JSON.stringify({ values: { maxWinners: 40 }, askable: { maxWinners: false } }) }],
            [],
            [],
            false,
            [
                { module: "giveaways", guild_id: "g7", status: null, notice: null, config: JSON.stringify({ values: { maxWinners: 120 } }), updated_at: at },
                { module: "rl-tracking", guild_id: "g7", status: null, notice: null, config: JSON.stringify({ linkMode: "name", values: {} }), updated_at: at },
            ]
        )
    );
    check(
        "Laden liest Werte, Anfrage-Schalter und Server-Werte",
        loaded && ModuleValue("giveaways", "maxWinners", "g7") === 120 && ModuleValue("giveaways", "maxWinners", "g1") === 40 && !LimitInfo("giveaways", "maxWinners", "g1").askable && CurrentLinkMode("g7") === "name"
    );
    check("Nach dem Laden bekommen Zuhörer die Arten je Bereich", states.at(-1) === "login|name", states.join(","));

    // W-0131-Rest: Ein älterer, langsamer Ladevorgang überschreibt keinen neueren.
    const delayed = (linkMode: string, ms: number): BotClient =>
        ({
            databaseService: {
                Ready: true,
                Query: async (sql: string) => {
                    await new Promise((resolve) => setTimeout(resolve, ms));

                    return sql.includes("bot_module_settings") ? [{ module: "rl-tracking", status: "on", notice: null, config: JSON.stringify({ linkMode }) }] : [];
                },
            },
            guilds: { cache: new Map() },
        }) as unknown as BotClient;
    const slow = LoadFlags(delayed("name", 60));
    const fast = LoadFlags(delayed("both", 5));

    await Promise.all([slow, fast]);
    check("Zwei Ladevorgänge überlappen: der neuere gewinnt", CurrentLinkMode() === "both", CurrentLinkMode());

    // W-0133: der Kasten „Grenzen von RL Nexus“ im Bot-Dashboard.
    SetFlags([], [], []);
    const plainLimits = ModuleLimits("g1").giveaways ?? [];
    check("Grenzen: Giveaways mit vier Werten, ohne Server-Wert ist alles der Wert für alle", plainLimits.length === 4 && plainLimits.every((entry) => entry.value === entry.standard && !entry.granted && entry.since === null), JSON.stringify(plainLimits));
    check("Grenzen: nur Werte, die je Server gehen (keine Sperrfrist von RL Tracking)", !(ModuleLimits("g1")["rl-tracking"] ?? []).some((entry) => entry.key === "switchDays"));
    SetFlags([], [], [], [over("giveaways", "g1", { values: { maxWinners: 100 }, updatedAt: at })]);
    const grantedLimit = (ModuleLimits("g1").giveaways ?? []).find((entry) => entry.key === "maxWinners");
    check("Grenzen: freigeschaltet mit Datum", grantedLimit?.granted === true && grantedLimit.value === 100 && grantedLimit.standard === 50 && grantedLimit.since === at.toISOString(), JSON.stringify(grantedLimit));

    // Zustand für das Admin: Beta-Server.
    SetFlags([], [], ["g1", "g2", "g3"]);
    const route = new AdminModulesState(Client([], [], []));
    const denied = Reply();
    await route.Handle({ token: { scope: ["dashboard"] } } as never, denied as never);
    check("Zustand ohne Admin-Recht: 403", denied.statusCode === 403, String(denied.statusCode));

    const allowed = Reply();
    const body = (await route.Handle({ token: { scope: ["admin"] } } as never, allowed as never)) as { betaServers?: number };
    check("Zustand mit Admin-Recht: Zahl der Beta-Server", allowed.statusCode === 200 && body?.betaServers === 3, JSON.stringify(body));

    SetFlags([], [], []);
}

/** W-0133, Entwurf M: Satz und Knopf „auf Anfrage“, Karte bei erreichter Grenze. */
async function checkAsk(): Promise<void> {
    console.log("\n  — Meldungen „auf Anfrage“ (W-0133) —");

    const guildId = "1162553851187040326";

    SetFlags([], [], []);
    const admin = AskLine({ module: "giveaways", key: "maxWinners", guildId, admin: true, asked: 80 });
    check("Admin, auf Anfrage: Satz mit Server-ID und Wunsch, Knopf zum Support", admin.text.includes(guildId) && admin.text.includes("80") && admin.button?.url === SUPPORT_URL, admin.text);

    const member = AskLine({ module: "giveaways", key: "maxWinners", guildId, admin: false, asked: 80 });
    check("Mitglied: kein Knopf, keine Server-ID (Review Focus 3)", member.button === null && !member.text.includes(guildId) && member.text.includes("Server-Admin"), member.text);

    const fixed = AskLine({ module: "giveaways", key: "scheduleDays", guildId, admin: true });
    check("Auf Anfrage aus: nur der kurze Satz", fixed.button === null && fixed.text === "ℹ️ Die Grenze legt RL Nexus fest.", fixed.text);

    const link = AskLine({ module: "rl-tracking", key: "linkMode", guildId, admin: false });
    check("Verknüpfungsart für Mitglieder: nennt die Art, keine Server-ID", link.text.includes("Epic-Anmeldung") && !link.text.includes(guildId) && link.button === null, link.text);

    const reply = LimitReply({
        module: "giveaways",
        key: "maxWinners",
        guildId,
        admin: true,
        title: "Höchstens 50 Gewinner",
        text: "Du hast **80** angegeben.",
        asked: 80,
        fallback: { label: "Mit 50 Gewinnern starten", customId: "gw:limit:abc" },
    });
    const json = JSON.stringify(reply.components);
    check(
        "LimitReply: Ersatz und Abbrechen, Anfrage-Knopf, nur für die Person, ohne Pings",
        json.includes('"gw:limit:abc"') && json.includes("gw:limit:abc:abbrechen") && json.includes(SUPPORT_URL) && (reply.flags & MessageFlags.Ephemeral) !== 0 && reply.allowedMentions.parse.length === 0,
        json.slice(0, 300)
    );
    check(
        "IsServerAdmin: nur mit „Server verwalten“",
        IsServerAdmin({ permissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild) } as never) && !IsServerAdmin({ permissions: "0" } as never) && !IsServerAdmin(null)
    );
}

/**
 * W-0137: Grenzen für alle Module, wie am 18.11.2026 freigegeben
 * (docs/superpowers/specs/2026-11-18-grenzen-alle-module-design.md). Standard =
 * heutige Konstante, alle je Server änderbar; backups kommt mit Task 7.
 */
function checkAllModules(): void {
    console.log("\n— Grenzen für alle Module (W-0137) —");

    // Modul, Schlüssel, Standard, min, max, auf Anfrage
    const expected: [string, string, number, number, number, boolean][] = [
        ["rl-6mans", "maxRanks", 12, 1, 25, true],
        ["rl-6mans", "maxRunning", 10, 1, 50, true],
        ["lft", "maxQuestions", 15, 1, 25, true],
        ["lft", "maxExpireDays", 180, 1, 365, false],
        ["matchups", "maxLeagues", 12, 1, 25, true],
        ["matchups", "maxAheadDays", 180, 30, 365, false],
        ["matchups", "maxOpen", 100, 10, 500, true],
        ["rocket-roulette", "maxFixedChannels", 40, 2, 50, true],
        ["rocket-roulette", "maxLobbies", 20, 1, 24, false],
        ["rocket-roulette", "maxPlanned", 10, 1, 30, false],
        ["role-lists", "maxLists", 10, 1, 25, true],
        ["role-lists", "maxRoles", 20, 1, 25, true],
        ["role-lists", "maxPresets", 10, 1, 25, false],
        ["moderation", "maxStages", 10, 1, 20, false],
        ["moderation", "maxEvidence", 20, 1, 50, true],
        ["moderation", "evidenceMegabytes", 8, 1, 25, true],
        ["automod", "maxWords", 200, 10, 1000, true],
        ["automod", "maxIgnore", 25, 1, 25, false],
        ["logging", "maxIgnore", 25, 1, 25, false],
        ["welcome", "maxRoles", 10, 1, 25, true],
        ["apply", "maxForms", 15, 1, 25, true],
        ["apply", "maxQuestions", 20, 1, 50, true],
        ["apply", "maxReviewers", 15, 1, 25, false],
        ["reaction-roles", "maxPanels", 25, 1, 50, true],
        ["reaction-roles", "maxRoles", 25, 1, 25, false],
        ["reaction-roles", "maxReactions", 20, 1, 20, false],
        ["polls", "maxOptions", 10, 2, 10, false],
        ["polls", "maxOpen", 25, 1, 100, true],
        ["voice-hub", "maxHubs", 10, 1, 25, true],
        ["voice-hub", "maxTempChannels", 50, 5, 200, true],
        ["voice-hub", "maxTrusted", 25, 1, 25, false],
        ["custom-message", "maxMessages", 50, 1, 200, true],
        ["custom-message", "maxResponses", 50, 1, 200, true],
        ["backups", "maxHand", 10, 1, 25, true],
        ["backups", "maxPlanKeep", 14, 1, 30, false],
    ];
    const wrong = expected.filter(([module, key, standard, min, max, askable]) => {
        const def = settingDef(module, key);

        return !def || def.standard !== standard || def.min !== min || def.max !== max || def.askable !== askable || !def.server || !def.label.endsWith("höchstens");
    });

    check("Neue Grenzen im Verzeichnis wie freigegeben", wrong.length === 0, wrong.map(([module, key]) => `${module}.${key}`).join(", "));
    check(
        "Galerie und Transkript-Größe sind keine Grenzen mehr, Transkript-Nachrichten bleiben",
        !settingDef("gallery", "imageMegabytes") && settingsOf("gallery").length === 0 && !settingDef("tickets", "transcriptMegabytes") && settingDef("tickets", "transcriptMessages")?.standard === 5000
    );
    check("Rank Roles bleibt ohne Grenze (Ausnahme des Nutzers)", settingsOf("rank-roles").length === 0);

    // Gespeicherte Werte der entfernten Schlüssel dürfen nichts stören.
    SetFlags([], [], [], [
        { module: "gallery", guildId: "g9", status: null, notice: null, linkMode: null, values: { imageMegabytes: 20 }, updatedAt: null },
        { module: "tickets", guildId: "g9", status: null, notice: null, linkMode: null, values: { transcriptMegabytes: 300, maxOpenPerUser: 12 }, updatedAt: null },
    ] as IModuleOverrideRow[]);

    const limits = ModuleLimits("g9");

    check(
        "Alte Werte stören nicht: kein Galerie-Eintrag, keine Transkript-Größe, andere Werte gelten",
        !("gallery" in limits) && (limits.tickets ?? []).every((entry) => entry.key !== "transcriptMegabytes") && ModuleValue("tickets", "maxOpenPerUser", "g9") === 12
    );
    check("Reiter Grenzen kennt die neuen Module", ["role-lists", "voice-hub", "polls", "rl-6mans", "custom-message"].every((module) => (limits[module] ?? []).length > 0), Object.keys(limits).join(","));
    SetFlags([], [], []);
}

/** W-0133: Reste aus dem Review von W-0131. */
async function checkLeftovers(): Promise<void> {
    console.log("\n  — Reste aus W-0131 —");

    SetFlags([{ module: "rl-tracking", status: "beta", notice: null }], [], []);
    check("Abgelaufener Knopf bei Beta: nicht als abgeschaltet behandelt", RankOpen(null, undefined));
    SetFlags([{ module: "rl-tracking", status: "off", notice: null }], [], []);
    check("Bei Aus bleibt es abgeschaltet", !RankOpen(null, undefined));

    // /module an X, wenn RL Nexus das Modul abgeschaltet hat.
    SetFlags([{ module: "polls", status: "off", notice: "Umbau bis Freitag" }], [], []);
    const replies: Record<string, unknown>[] = [];
    let toggled = false;
    const command = new Module({
        databaseService: { Ready: true },
        settings: { Toggle: async () => ((toggled = true), ["polls"]) },
    } as unknown as BotClient);

    await command.Execute({
        guildId: "g1",
        memberPermissions: { has: () => true },
        options: { getSubcommand: () => "an", getString: () => "polls" },
        reply: async (message: Record<string, unknown>) => void replies.push(message),
    } as never);
    const text = JSON.stringify(replies.at(-1) ?? {});
    check("/module an bei abgeschaltetem Modul: Hinweis, nichts geschaltet", !toggled && text.includes("abgeschaltet") && text.includes("Umbau bis Freitag"), text.slice(0, 300));

    // /rank me: per Name verbunden, Rang-Rollen nur mit Anmeldung - der Satz kommt an.
    const service = new RankRoleService({ settings: { Of: async () => ({ modules: ["rank-roles"] }) } } as unknown as BotClient) as unknown as RankRoleService & Record<string, unknown>;

    service.Apply = async () => {
        throw new RankRoleError(LOGIN_ONLY);
    };
    const notice = await service.AfterRankMe({ guild: { id: "g1" } } as never, {} as never);
    check("/rank me per Name: Hinweis „nur mit Anmeldung“ statt Schweigen", !!notice && "notice" in notice && notice.notice === LOGIN_ONLY, JSON.stringify(notice));

    SetFlags([], [], []);
}

async function main(): Promise<void> {
    console.log("\n  — Modul-Einstellungen (W-0131) —");

    check("Ohne Stand ist alles offen, auch in DMs, Art ist die Anmeldung", ModuleOpen("polls", "g1") && ModuleOpen("rl-tracking", null, "u1") && CurrentLinkMode() === "login");

    SetFlags([{ module: "polls", status: "off", notice: null }], [], []);
    check("Aus schließt auf Servern und in DMs", !ModuleOpen("polls", "g1") && !ModuleOpen("polls", null, "u1") && ModuleOpen("clips", "g1"));
    check("Ohne Hinweis der Standardsatz", ClosedText("polls") === CLOSED && NoticeOf("polls") === null);

    SetFlags([{ module: "clips", status: "beta", notice: "@everyone <b>x</b>" }], ["u9"], ["g2"]);
    check("Beta: offen nur auf Beta-Servern und für Beta-Tester in DMs", ModuleOpen("clips", "g2") && !ModuleOpen("clips", "g1") && ModuleOpen("clips", null, "u9") && !ModuleOpen("clips", null, "u1"));
    check("Hinweis kommt unverändert zurück, maskiert wird bei der Ausgabe", ClosedText("clips") === "@everyone <b>x</b>" && NoticeOf("clips") === "@everyone <b>x</b>");
    check("Was nicht gesetzt ist, bleibt offen", ModuleOpen("polls", "g1"));

    SetFlags(
        [
            { module: "polls", status: "off", notice: null },
            { module: "gallery", status: "off", notice: null },
        ],
        [],
        []
    );
    const active = ActiveModules("g1", ["gallery", "polls", "welcome"]);
    check("Modulliste: abgeschaltete fallen raus, feste Module bleiben", active.join(",") === "gallery,welcome", active.join(","));

    SetFlags([{ module: "rl-tracking", status: "on", notice: null, linkMode: "both" }], [], []);
    check("Verknüpfungsart aus der Zeile von RL Tracking", CurrentLinkMode() === "both");

    // Laden: Beta-Server aus Inhabern und Verwaltern, die Beta-Tester sind.
    SetFlags([], [], []);
    const seen: string[] = [];
    OnFlagsLoaded((state) => seen.push(state.linkModes.get(null) ?? "-"));

    const loaded = await LoadFlags(
        Client(
            [
                { module: "clips", status: "beta", notice: null, config: null },
                { module: "rl-tracking", status: "on", notice: null, config: JSON.stringify({ linkMode: "name" }) },
            ],
            ["u9", "u8"],
            [Guild("g3", "u9"), Guild("g4", "u1", ["u8"]), Guild("g5", "u1")]
        )
    );
    check("Laden liest Status und Art", loaded && CurrentLinkMode() === "name" && !ModuleOpen("clips", "g5"));
    check("Beta-Server: Inhaber oder Verwalter ist Beta-Tester", ModuleOpen("clips", "g3") && ModuleOpen("clips", "g4"));
    check("Nach dem Laden erfahren Zuhörer die Art", seen.join(",") === "name", seen.join(","));

    const failed = await LoadFlags(Client([], [], [], true));
    check("Scheitert das Laden, bleibt der alte Stand", !failed && CurrentLinkMode() === "name" && ModuleOpen("clips", "g3"));

    // Der Bescheid des Admins.
    const route = new AdminModulesReload(Client([], [], []));
    const denied = Reply();
    await route.Handle({ token: { scope: ["dashboard"] } } as never, denied as never);
    check("Bescheid ohne Admin-Recht: 403", denied.statusCode === 403, String(denied.statusCode));

    const allowed = Reply();
    await route.Handle({ token: { scope: ["admin"] } } as never, allowed as never);
    check("Bescheid mit Admin-Recht lädt neu: 204", allowed.statusCode === 204, String(allowed.statusCode));

    const broken = Reply();
    await new AdminModulesReload(Client([], [], [], true)).Handle({ token: { scope: ["admin"] } } as never, broken as never);
    check("Tabelle nicht lesbar: 503", broken.statusCode === 503, String(broken.statusCode));

    await checkGating();
    await checkTrust();
    await checkValues();
    await checkAsk();
    await checkLeftovers();
    checkAllModules();

    console.log(failures > 0 ? `\n  ${failures} Prüfung(en) fehlgeschlagen.\n` : "\n  Alles ok.\n");
    process.exit(failures > 0 ? 1 : 0);
}

void main();
