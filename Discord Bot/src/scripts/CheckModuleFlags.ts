/**
 * Prüft die Modul-Einstellungen aus dem Admin Dashboard (W-0131) ohne Discord
 * und ohne Datenbank: Status je Modul, Beta-Server, Hinweis, Verknüpfungsart,
 * Laden und den Bescheid des Admins.
 *
 *   npm run check:modulflags
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import BotClient from "../client/BotClient";
import CommandHandler from "../events/client/CommandHandler";
import GuildSettings from "../models/GuildSettings";
import PlayerAccount from "../models/PlayerAccount";
import { ApplyLinkMode } from "../utils/linkModeWatch";
import AdminModulesReload from "../routes/AdminModulesReload";
import { ActiveModules, ClosedText, CurrentLinkMode, LoadFlags, ModuleNotices, ModuleOpen, NoticeOf, OnFlagsLoaded, SetFlags } from "../utils/moduleFlags";

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

function Client(settings: Record<string, unknown>[], beta: string[], guilds: IFakeGuild[], fail = false): BotClient {
    return {
        databaseService: {
            Ready: true,
            Query: async (sql: string) => {
                if (fail) throw new Error("Tabelle fehlt");
                if (sql.includes("bot_module_settings")) return settings;
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
    OnFlagsLoaded((previous, next) => seen.push(`${previous}>${next}`));

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
    check("Nach dem Laden erfahren Zuhörer die Art vorher und nachher", seen.join(",") === "login>name", seen.join(","));

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

    console.log(failures > 0 ? `\n  ${failures} Prüfung(en) fehlgeschlagen.\n` : "\n  Alles ok.\n");
    process.exit(failures > 0 ? 1 : 0);
}

void main();
