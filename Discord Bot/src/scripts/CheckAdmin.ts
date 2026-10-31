/**
 * Prüft die beiden Routen für das Admin Dashboard ohne Discord-Login:
 * startet nur den Fastify-Server und klopft sie mit und ohne Token ab.
 *
 *   npm run check:admin
 *
 * Wie die übrigen Checks ohne Test-Framework. Exit-Code 1, sobald etwas nicht stimmt.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { glob } from "glob";
import path from "path";
import { pathToFileURL } from "node:url";
import BotClient from "../client/BotClient";
import { ADMIN_ENV_KEYS, ADMIN_SCOPE, RESTART_DELAY } from "../constants/Admin";
import { MODULE_IDS } from "../constants/Modules";
import Command from "../structures/Command";
import { ApplyPanelRef, FetchState, PanelDiff } from "../utils/guildpanels";
import { CreateToken } from "../utils/jwt";

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

async function main(): Promise<void> {
    const client = new BotClient();

    client.server.Port = PORT;
    await client.server.Start();

    const secret = client.config.SERVER_JWT_SECRET;
    const admin = CreateToken(secret, "admin-dashboard:123456789012345678", 60_000, [ADMIN_SCOPE]);
    const plugin = CreateToken(secret, "minecraft-plugin", 60_000);
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

    console.log("\n  — /dcapi/admin/overview —");

    const none = await fetch(`${BASE}/dcapi/admin/overview`);
    check("Ohne Token 401", none.status === 401, `${none.status}`);

    const foreign = await fetch(`${BASE}/dcapi/admin/overview`, { headers: bearer(plugin) });
    check("Token ohne Scope admin 403", foreign.status === 403, `${foreign.status}`);

    const ok = await fetch(`${BASE}/dcapi/admin/overview`, { headers: bearer(admin) });
    const body = (await ok.json()) as Record<string, any>;

    check("Mit Scope 200", ok.status === 200, `${ok.status}`);
    check(
        "Bereitschaft, Laufzeit und Versionen sind da",
        typeof body.ready === "boolean" && typeof body.uptime === "number" && typeof body.versions?.discordjs === "string",
        JSON.stringify(body).slice(0, 200)
    );
    check("Server kommen als Liste", Array.isArray(body.guilds));
    check(
        "Umgebung nur als true/false und genau die Schlüssel aus .env.example",
        Object.keys(body.env ?? {}).length === ADMIN_ENV_KEYS.length && Object.values(body.env ?? {}).every((value) => typeof value === "boolean")
    );
    check("Kein Wert aus der .env in der Antwort", !JSON.stringify(body).includes(secret));

    console.log("\n  — /dcapi/admin/restart —");

    const realExit = process.exit;
    let exited: number | undefined;

    // Der Neustart ruft process.exit(0). Für den Check wird nur mitgeschrieben.
    process.exit = ((code?: number) => {
        exited = code ?? 0;
    }) as unknown as typeof process.exit;

    try {
        const unauth = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST" });
        check("Ohne Token 401", unauth.status === 401, `${unauth.status}`);

        const scopeless = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST", headers: bearer(plugin) });
        check("Token ohne Scope admin 403", scopeless.status === 403, `${scopeless.status}`);
        check("Nach 403 beendet sich nichts", exited === undefined, String(exited));

        const accepted = await fetch(`${BASE}/dcapi/admin/restart`, { method: "POST", headers: bearer(admin) });
        check("Mit Scope 202", accepted.status === 202, `${accepted.status}`);

        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY + 300));
        check("Danach beendet sich der Prozess mit 0", exited === 0, String(exited));
    } finally {
        process.exit = realExit;
    }

    console.log("\n  — Backups: Panels eines Servers —");

    const ref = (messageId: string, label: string) => ({ kind: "selfrole" as const, key: messageId, channelId: "1", messageId, label });
    const diff = PanelDiff([ref("m1", "A"), ref("m2", "B")], [ref("m1", "A")]);
    check(
        "PanelDiff: neu angelegtes Panel fällt weg, gleiches bleibt",
        diff.remove.map((panel) => panel.label).join() === "B" && diff.keep.map((panel) => panel.label).join() === "A",
        JSON.stringify(diff)
    );

    const apply = ApplyPanelRef({ channelId: "1", messageId: "2" });
    check(
        "Bewerbungs-Panel zählt mit, wenn es liegt",
        apply?.kind === "apply" && apply.key === "apply" && apply.messageId === "2" && ApplyPanelRef({ channelId: "1", messageId: null }) === null,
        JSON.stringify(apply)
    );

    check(
        "Panel fehlt nur bei Unknown Message (10008), sonst nicht prüfbar",
        FetchState({ code: 10008 }) === "missing" && FetchState({ code: 50001 }) === "unknown" && FetchState(new Error("503")) === "unknown"
    );

    const panelsUrl = `${BASE}/dcapi/admin/guilds/300000000000000001/panels`;
    const restoredUrl = `${BASE}/dcapi/admin/guilds/300000000000000001/restored`;
    const restoredBody = { method: "POST", body: JSON.stringify({ tables: ["levels"], before: null }) };

    check("Panels ohne Token 401", (await fetch(panelsUrl)).status === 401);
    check("Panels ohne Scope admin 403", (await fetch(panelsUrl, { headers: bearer(plugin) })).status === 403);
    check("Panels: Bot nicht auf dem Server 404", (await fetch(panelsUrl, { headers: bearer(admin) })).status === 404);
    check(
        "Nach dem Zurückladen ohne Scope admin 403",
        (await fetch(restoredUrl, { ...restoredBody, headers: { ...bearer(plugin), "Content-Type": "application/json" } })).status === 403
    );
    check(
        "Nach dem Zurückladen: Bot nicht auf dem Server 404",
        (await fetch(restoredUrl, { ...restoredBody, headers: { ...bearer(admin), "Content-Type": "application/json" } })).status === 404
    );
    check(
        "Nach dem Zurückladen: ungültige Tabellen 400",
        (
            await fetch(restoredUrl, {
                method: "POST",
                body: JSON.stringify({ tables: ["levels; DROP"], before: null }),
                headers: { ...bearer(admin), "Content-Type": "application/json" },
            })
        ).status === 400
    );

    console.log("\n  — /dcapi/admin/commands —");

    // Nachgestellt: ein Command mit Unterbefehl, Gruppe und einfacher Option, einer ganz ohne Unterbefehle.
    const fake = (name: string, module: string | null, json: unknown): Command =>
        ({ name, description: `${name} kurz`, module, data: { toJSON: () => json } }) as unknown as Command;

    client.commands.set(
        "probe",
        fake("probe", "moderation", {
            name: "probe",
            description: "probe kurz",
            options: [
                { type: 1, name: "zeigen", description: "Zeigt etwas" },
                { type: 2, name: "notiz", description: "Gruppe", options: [{ type: 1, name: "neu", description: "Neue Notiz" }] },
            ],
        })
    );
    client.commands.set("solo", fake("solo", "dashboard", { name: "solo", description: "solo kurz", options: [{ type: 3, name: "wert", description: "Ein Wert" }] }));
    client.commands.set("intern", fake("intern", null, { name: "intern", description: "intern kurz" }));

    const commandsNone = await fetch(`${BASE}/dcapi/admin/commands`);
    check("Ohne Token 401", commandsNone.status === 401, `${commandsNone.status}`);

    const commandsForeign = await fetch(`${BASE}/dcapi/admin/commands`, { headers: bearer(plugin) });
    check("Token ohne Scope admin 403", commandsForeign.status === 403, `${commandsForeign.status}`);

    const listed = await fetch(`${BASE}/dcapi/admin/commands`, { headers: bearer(admin) });
    const commandsBody = (await listed.json()) as { commands?: { name: string; module: string | null; paths: unknown }[] };
    const byName = (name: string) => commandsBody.commands?.find((entry) => entry.name === name);

    check("Mit Scope 200", listed.status === 200, `${listed.status}`);
    check(
        "Unterbefehle und Gruppen werden zu Pfaden",
        JSON.stringify(byName("probe")?.paths) === JSON.stringify([
            { path: "probe zeigen", description: "Zeigt etwas" },
            { path: "probe notiz neu", description: "Neue Notiz" },
        ]),
        JSON.stringify(byName("probe"))
    );
    check(
        "Ohne Unterbefehle zählt der Name, das Modul steht dabei",
        JSON.stringify(byName("solo")?.paths) === JSON.stringify([{ path: "solo", description: "solo kurz" }]) && byName("solo")?.module === "dashboard",
        JSON.stringify(byName("solo"))
    );
    check("Commands ohne Modul kommen mit module null", byName("intern")?.module === null, JSON.stringify(byName("intern")));

    console.log("\n  — Jeder Command hat ein Modul —");

    // Nur bauen, nicht bei Discord registrieren: Der Konstruktor legt Name, Modul und data fest.
    const known = new Set<string>([...MODULE_IDS, "rl-tracking", "dashboard"]);
    const files = await glob("**/*.{ts,js}", { cwd: path.join(__dirname, "../commands"), absolute: true });

    for (const file of files.sort()) {
        const imported = await import(pathToFileURL(file).href);
        const CommandClass = imported.default?.default ?? imported.default;
        const command = new CommandClass(client) as Command;
        const relative = path.relative(path.join(__dirname, "../commands"), file).replace(/\\/g, "/");

        if (relative.startsWith("dev/")) check(`${relative}: ohne Modul`, command.module === null, String(command.module));
        else check(`${relative}: ${command.module ?? "kein Modul"}`, command.module !== null && known.has(command.module), String(command.module));
    }

    await client.server.Stop();

    console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
