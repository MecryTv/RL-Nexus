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
import AdminModulesReload from "../routes/AdminModulesReload";
import { ActiveModules, ClosedText, CurrentLinkMode, LoadFlags, ModuleOpen, NoticeOf, OnFlagsLoaded, SetFlags } from "../utils/moduleFlags";

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

    console.log(failures > 0 ? `\n  ${failures} Prüfung(en) fehlgeschlagen.\n` : "\n  Alles ok.\n");
    process.exit(failures > 0 ? 1 : 0);
}

void main();
