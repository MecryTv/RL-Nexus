/**
 * Prüft den Teil des Bots an der Löschung von Nutzerdaten (W-0051, Teil 3b):
 * Zwischenspeicher vergessen, die Knöpfe der Lösch-DM fragen das Admin
 * Dashboard, die Route /dcapi/admin/users/:id/forget. Ohne Discord-Login.
 *
 *   npm run check:userdata
 *
 * Wie die übrigen Checks ohne Test-Framework. Exit-Code 1, sobald etwas nicht stimmt.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import BotClient from "../client/BotClient";
import { ADMIN_SCOPE } from "../constants/Admin";
import { AskAdmin, UNREACHABLE } from "../events/userdata/UserdataButtons";
import ActivityService from "../services/ActivityService";
import LevelService from "../services/LevelService";
import MessageIndex from "../services/antivillain/MessageIndex";
import { CreateToken } from "../utils/jwt";

const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
const GONE = "111111111111111111";
const STAYS = "222222222222222222";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Der Inhalt eines Tokens, ohne die Signatur zu prüfen. */
function payloadOf(token: string): { sub?: string; scope?: string[] } {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string; scope?: string[] };
}

async function main(): Promise<void> {
    console.log("\n  — Zwischenspeicher vergessen —");

    const activity = new ActivityService({} as BotClient);
    const buffers = activity as unknown as { members: Map<string, unknown>; voice: Map<string, unknown> };
    buffers.members.set(`9:20000:${GONE}`, {});
    buffers.members.set(`9:20000:${STAYS}`, {});
    buffers.voice.set(`9:${GONE}`, {});
    buffers.voice.set(`9:${STAYS}`, {});
    activity.ForgetUser(GONE);
    check("Aktivität: Puffer der Person weg, andere bleiben", [...buffers.members.keys(), ...buffers.voice.keys()].join(",") === `9:20000:${STAYS},9:${STAYS}`, [...buffers.members.keys()].join(","));

    const levels = new LevelService({} as BotClient);
    const cooldowns = (levels as unknown as { cooldowns: Map<string, number> }).cooldowns;
    cooldowns.set(`9:${GONE}`, 1);
    cooldowns.set(`9:${STAYS}`, 1);
    levels.ForgetUser(GONE);
    check("Level: Abklingzeit der Person weg", [...cooldowns.keys()].join(",") === `9:${STAYS}`);

    const index = new MessageIndex();
    const people = (index as unknown as { people: Map<string, unknown[]> }).people;
    people.set(`9:${GONE}`, []);
    people.set(`8:${GONE}`, []);
    people.set(`9:${STAYS}`, []);
    index.ForgetUser(GONE);
    check("Anti-Villain: Nachrichten der Person auf allen Servern weg", [...people.keys()].join(",") === `9:${STAYS}`);

    console.log("\n  — Knöpfe fragen das Admin Dashboard —");

    const real = globalThis.fetch;
    let seen: { url: string; token: string } | null = null;
    let answer: Response = new Response(JSON.stringify({ message: "Angehalten." }), { status: 200 });

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen = { url: String(input), token: (headers.get("authorization") ?? "").replace("Bearer ", "") };

        return answer;
    }) as typeof fetch;

    try {
        check("Antwort des Admin Dashboards kommt als Satz zurück", (await AskAdmin("http://admin", "s".repeat(48), GONE, 7, "stop")) === "Angehalten.");

        const asked = seen as { url: string; token: string } | null;
        const token = payloadOf(asked?.token ?? "..");
        check("Adresse /internal/userdata/7/stop", asked?.url === "http://admin/internal/userdata/7/stop", asked?.url);
        check("Token: Subjekt ist die klickende Person, Scope userdata", token.sub === `discord:${GONE}` && token.scope?.join(",") === "userdata", JSON.stringify(token));

        answer = new Response(JSON.stringify({ error: "Diese Löschung läuft nicht mehr." }), { status: 409 });
        check("Ein Fehler kommt als Satz zurück", (await AskAdmin("http://admin", "s".repeat(48), GONE, 7, "copy")) === "Diese Löschung läuft nicht mehr.");

        globalThis.fetch = (async () => {
            throw new Error("weg");
        }) as typeof fetch;
        check("Nicht erreichbar: ein freundlicher Satz", (await AskAdmin("http://admin", "s".repeat(48), GONE, 7, "copy")) === UNREACHABLE);
    } finally {
        globalThis.fetch = real;
    }

    console.log("\n  — /dcapi/admin/users/:id/forget —");

    const client = new BotClient();
    client.server.Port = PORT;
    await client.server.Start();

    const secret = client.config.SERVER_JWT_SECRET;
    const admin = CreateToken(secret, "admin-dashboard:123456789012345678", 60_000, [ADMIN_SCOPE]);
    const plugin = CreateToken(secret, "minecraft-plugin", 60_000);
    const forget = (id: string, token?: string) => fetch(`${BASE}/dcapi/admin/users/${id}/forget`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

    check("ohne Token 401", (await forget(GONE)).status === 401);
    check("Token ohne Admin-Scope 403", (await forget(GONE, plugin)).status === 403);
    check("falsche ID 400", (await forget("abc", admin)).status === 400);
    check("mit Admin-Token 204", (await forget(GONE, admin)).status === 204);

    await client.server.Stop?.();

    console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

void main();
