import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../app.ts";
import { commandsByModule, syncCommands } from "../commands-sync.ts";
import { loadConfig } from "../config.ts";
import { readContent } from "../content.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { BOT_COMMANDS, USERS, fake } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

/** Die Commands kommen aus dem Bot und landen als commands.json für die Webseite. */
export async function checkCommands(): Promise<void> {
    section("Commands vom Bot");

    const siteDir = await mkdtemp(path.join(tmpdir(), "rlnexus-commands-"));
    const config = loadConfig({ ...ENV, SITE_DIR: siteDir }, []);

    try {
        await check("Nach Modul geordnet, Commands ohne Modul fallen weg", () => {
            assert.deepEqual(commandsByModule(BOT_COMMANDS), {
                moderation: [
                    { path: "fall zeigen", description: "Zeigt einen Fall" },
                    { path: "warn", description: "Verwarnt ein Mitglied" },
                ],
                "rl-tracking": [{ path: "rank me", description: "Zeigt deine eigenen Ränge" }],
            });
        });

        await check("Erster Abgleich schreibt commands.json, gleicher Stand keine neue Revision", async () => {
            assert.equal(await syncCommands(config, "Bot"), "changed");

            const first = await readContent(config, "commands.json");
            assert.equal(first?.revision, 1);
            assert.equal(first?.updatedBy, "Bot");

            assert.equal(await syncCommands(config, "Bot"), "same");
            assert.equal((await readContent(config, "commands.json"))?.revision, 1);
        });

        await check("Antwortet der Bot nicht, bleibt commands.json, wie sie ist", async () => {
            fake.botDown = true;

            try {
                assert.equal(await syncCommands(config, "Bot"), "offline");
            } finally {
                fake.botDown = false;
            }

            assert.equal((await readContent(config, "commands.json"))?.revision, 1);
        });

        await check("Routen: lesen mit Sitzung, abholen holt neu, ohne Bot ein Satz", async () => {
            const app = await buildApp(config);
            const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
            const fetchNow = () => app.inject({ method: "POST", url: "/api/content/commands/abholen", headers: { cookie, origin: config.publicUrl } });

            try {
                assert.equal((await app.inject({ method: "GET", url: "/api/content/commands" })).statusCode, 401);

                const read = await app.inject({ method: "GET", url: "/api/content/commands", headers: { cookie } });
                assert.deepEqual([read.statusCode, read.json().revision, read.json().data.modules["rl-tracking"][0].path], [200, 1, "rank me"]);

                fake.commands = [...BOT_COMMANDS, { name: "level", description: "Level", module: "levels", paths: [{ path: "level rang", description: "Zeigt deinen Rang" }] }];
                const fetched = await fetchNow();
                assert.deepEqual([fetched.statusCode, fetched.json().result, fetched.json().envelope.revision], [200, "changed", 2]);
                assert.deepEqual(fetched.json().envelope.data.modules.levels, [{ path: "level rang", description: "Zeigt deinen Rang" }]);

                // Die Übersicht zählt aus commands.json: 4 Commands in 3 Modulen.
                assert.deepEqual((await app.inject({ method: "GET", url: "/api/overview", headers: { cookie } })).json().commands, { count: 4, modules: 3 });

                fake.botDown = true;
                const offline = await fetchNow();
                assert.deepEqual([offline.statusCode, offline.json().error], [503, "Der Bot antwortet gerade nicht. Die Commands bleiben, wie sie sind."]);
            } finally {
                fake.botDown = false;
                fake.commands = BOT_COMMANDS;
                await app.close();
            }
        });
    } finally {
        await rm(siteDir, { recursive: true, force: true });
    }
}
