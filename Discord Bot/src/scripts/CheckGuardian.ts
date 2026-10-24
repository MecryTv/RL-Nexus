/**
 * Prüft den Guardian und die Fehlerberichte für die Devs (Plan 24).
 *
 *   npm run check:guardian
 *
 * Ohne Datenbank laufen nur die Teile ohne Speicher. Mit Datenbank (DATABASE_*)
 * legt der Bot seine Tabellen selbst an.
 */
import BotClient from "../client/BotClient";
import { readFile } from "node:fs/promises";
import { ReportError, ReportExtras } from "../services/ReportService";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { DoneJson, ErrorCard, ErrorSignature, Excerpt, IErrorInfo, NewErrorId, Translate, WhereOf } from "../Guardian";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (passed) {
        console.log(`  ok   ${name}`);

        return;
    }

    failures++;
    console.log(`  FAIL ${name}${detail ? `  → ${detail}` : ""}`);
}

/* ----------------------------------------------------------
   ID und Signatur
   ---------------------------------------------------------- */
function checkIds(): void {
    console.log("\n  — Fehler-ID und Signatur —");

    const id = NewErrorId(new Date(1_792_841_102_000));

    check("ID im Format NEXUS-<Sekunden>-<6 Zeichen>", /^NEXUS-1792841102-[A-HJ-NP-Z2-9]{6}$/.test(id), id);
    check("IDs wiederholen sich nicht", new Set(Array.from({ length: 500 }, () => NewErrorId())).size === 500);

    const one = ErrorSignature("bot", "Unknown Channel 1059621019947634739", "src/events/voice/VoicePanelHandler.ts:118");
    const two = ErrorSignature("bot", "Unknown Channel 1059621019947634740", "src/events/voice/VoicePanelHandler.ts:118");

    check("Signatur: andere ID in der Meldung, derselbe Fehler", one === two, `${one} | ${two}`);
    check("Signatur: andere Zahl in der Meldung, derselbe Fehler", ErrorSignature("bot", "Timeout after 5000ms", "x") === ErrorSignature("bot", "Timeout after 3000ms", "x"));
    check("Signatur: andere Stelle, anderer Fehler", one !== ErrorSignature("bot", "Unknown Channel 1", "src/events/voice/VoicePanelHandler.ts:120"));
    check("Signatur: andere Art, anderer Fehler", one !== ErrorSignature("dashboard", "Unknown Channel 1", "src/events/voice/VoicePanelHandler.ts:118"));
    check("Signatur passt in die Spalte (255 Zeichen)", ErrorSignature("bot", "x".repeat(2000), "y".repeat(500)).length <= 255);
}

/* ----------------------------------------------------------
   Wo im Code
   ---------------------------------------------------------- */
async function checkWhere(): Promise<void> {
    console.log("\n  — Wo im Code —");

    const stack = [
        "Error: Unknown Channel",
        "    at RequestManager.handle (/app/node_modules/@discordjs/rest/dist/index.js:1:2)",
        "    at node:internal/process/task_queues:95:5",
        "    at Guardian.ReportError (/app/src/Guardian.ts:150:10)",
        "    at async VoicePanelHandler.Rename (/app/src/events/voice/VoicePanelHandler.ts:118:9)",
        "    at async VoicePanelHandler.Execute (/app/src/events/voice/VoicePanelHandler.ts:40:5)",
    ].join("\n");
    const where = WhereOf(stack);

    check("Wo: erster eigener Rahmen, Pfad ab src/, Funktion ohne Klasse", JSON.stringify(where) === JSON.stringify({ file: "src/events/voice/VoicePanelHandler.ts", line: 118, fn: "Rename" }), JSON.stringify(where));
    check("Wo: auch ohne Funktionsnamen", JSON.stringify(WhereOf("Error: x\n    at /app/src/Server.ts:12:3")) === JSON.stringify({ file: "src/Server.ts", line: 12, fn: null }));
    check("Wo: ohne eigenen Rahmen nichts", WhereOf("Error: x\n    at node:internal/timers:1:1") === null);

    // Ausschnitt aus einer echten Datei unter src/ (so läuft es mit tsx).
    const own = Excerpt("src/Guardian.ts", 2);

    check("Ausschnitt: drei Zeilen, die Fehlerzeile in der Mitte markiert", own !== null && own.split("\n").length === 3 && own.split("\n")[1].startsWith("2 ›"), own ?? "null");

    // Im Image liegt src/ nicht: dann aus den Quellen in der Karte unter dist/.
    const root = await mkdtemp(path.join(tmpdir(), "guardian-"));

    try {
        await mkdir(path.join(root, "dist", "events"), { recursive: true });
        await writeFile(
            path.join(root, "dist", "events", "Voice.js.map"),
            JSON.stringify({ version: 3, sources: ["../../src/events/Voice.ts"], sourcesContent: ["eins\nzwei\ndrei\nvier"], mappings: "", names: [] })
        );

        const mapped = Excerpt("src/events/Voice.ts", 3, root);

        check("Ausschnitt: aus der Karte, wenn src/ fehlt", mapped === "2   zwei\n3 › drei\n4   vier", JSON.stringify(mapped));
        check("Ausschnitt: ohne Datei und Karte nichts", Excerpt("src/events/Gibtsnicht.ts", 3, root) === null);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

/* ----------------------------------------------------------
   Browser-Stacks zurückübersetzen
   ---------------------------------------------------------- */
async function checkTranslate(): Promise<void> {
    console.log("\n  — Browser-Stacks zurückübersetzen —");

    // Wie im echten Build: Quellen unter client/, Ausgabe unter public/assets, Karten danach in maps/.
    const root = await mkdtemp(path.join(tmpdir(), "karten-"));

    try {
        await mkdir(path.join(root, "client", "pages"), { recursive: true });
        await writeFile(path.join(root, "client", "pages", "Boom.ts"), "export function boom(value: number): number {\n    const doubled = value * 2;\n    if (doubled > 10) throw new Error(\"zu groß\");\n    return doubled;\n}\n");

        const result = await build({
            entryPoints: [path.join(root, "client", "pages", "Boom.ts")],
            bundle: true,
            minify: true,
            format: "esm",
            sourcemap: "external",
            sourcesContent: true,
            outdir: path.join(root, "public", "assets", "chunks"),
            write: false,
        });
        const js = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
        const map = result.outputFiles.find((file) => file.path.endsWith(".map"))!.text;
        const column = js.indexOf("throw") + 1;

        await mkdir(path.join(root, "maps", "chunks"), { recursive: true });
        await writeFile(path.join(root, "maps", "chunks", "Boom-ABC123.js.map"), map);

        const stack = `Error: zu groß\n    at a (https://dashboard.nexus-emb.de/assets/chunks/Boom-ABC123.js:1:${column})\n    at https://dashboard.nexus-emb.de/assets/app.js:1:10`;
        const translated = Translate(stack, path.join(root, "maps"));

        check("Browser-Stack: Zeile in der .ts statt im verkleinerten Bündel", translated.where?.file === "src/dashboard/client/pages/Boom.ts" && translated.where.line === 3 && !translated.missing, JSON.stringify(translated.where));
        check("Browser-Stack: Ausschnitt aus der Karte", translated.excerpt?.includes("3 › ") === true && translated.excerpt.includes("throw new Error"), translated.excerpt ?? "null");
        check("Browser-Stack: der übersetzte Stack nennt die Quelle", translated.stack.includes("src/dashboard/client/pages/Boom.ts:3"), translated.stack);

        const old = Translate(stack.replace("Boom-ABC123", "Boom-ALT999"), path.join(root, "maps"));

        check("Alter Tab nach einem Deploy: Karte fehlt, der Stack bleibt, wie er kam", old.missing && old.where === null && old.stack.includes("Boom-ALT999.js:1:"), JSON.stringify(old).slice(0, 200));
        check("Kaputte Eingabe wirft nicht", Translate("Unsinn ohne Rahmen", path.join(root, "maps")).where === null);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

/* ----------------------------------------------------------
   Die DMs
   ---------------------------------------------------------- */
const BOT: IErrorInfo = {
    id: "NEXUS-1792841102-M2XD7K",
    kind: "bot",
    title: "🛠️ Fehler im Bot",
    message: "Unknown Channel",
    where: "src/events/voice/VoicePanelHandler.ts:118 in Rename",
    fields: [
        ["Was", "DiscordAPIError[10003]: Unknown Channel"],
        ["Wo", "`src/events/voice/VoicePanelHandler.ts:118 in Rename`"],
    ],
    excerpt: "117   const channel = await this.Fetch(id);\n118 › await channel.setName(name);\n119   return true;",
    footer: "Stack: 6 Zeilen · Version 40e3226 · Sitzung #67",
};

/** Aller Text und alle Custom-IDs einer Karte, wie Discord sie bekommt. */
function JsonOf(message: { components?: { toJSON(): unknown }[] }): string {
    return JSON.stringify((message.components ?? []).map((entry) => entry.toJSON()));
}

function checkCards(): void {
    console.log("\n  — Die DMs —");

    const bot = JsonOf(ErrorCard(BOT, { buttons: true, repeats: 0, reopened: null, production: true }));

    check("Fehler im Bot: Titel, ID, Was, Wo, Ausschnitt, Stand", ["🛠️ Fehler im Bot", "NEXUS-1792841102-M2XD7K", "**Wo** `src/events/voice/VoicePanelHandler.ts:118 in Rename`", "118 › await channel.setName(name);", "Stack: 6 Zeilen · Version 40e3226 · Sitzung #67", "Produktion"].every((part) => bot.includes(part)), bot.slice(0, 300));
    check("Knöpfe „In DevLogs öffnen“ und „Erledigt“", bot.includes("guardian:logs:NEXUS-1792841102-M2XD7K") && bot.includes("guardian:done:NEXUS-1792841102-M2XD7K") && bot.includes("In DevLogs öffnen") && bot.includes("Erledigt"));
    check("Ohne Datenbank keine Knöpfe", !JsonOf(ErrorCard(BOT, { buttons: false, repeats: 0, reopened: null, production: true })).includes("guardian:"));
    check("Zusammengefasst: wie oft er dazwischen kam", JsonOf(ErrorCard(BOT, { buttons: true, repeats: 3, reopened: null, production: true })).includes("Derselbe Fehler kam in den letzten 10 Minuten noch 3-mal."));
    check(
        "Kam wieder nach Erledigt",
        JsonOf(ErrorCard(BOT, { buttons: true, repeats: 0, reopened: { by: "Mecry", at: new Date("2026-10-24T10:00:00Z") }, production: true })).includes("Kam wieder, nachdem Mecry ihn am 24.10.2026 als erledigt markiert hat.")
    );

    const dashboard = JsonOf(
        ErrorCard({ ...BOT, kind: "dashboard", title: "🌐 Fehler im Dashboard", steps: ["14:02:10 Seite /guild/1/levels", "14:02:15 Klick „Speichern“", "14:02:16 PUT /api/guild/1/levels → 500 · 120 ms"] }, { buttons: true, repeats: 0, reopened: null, production: true })
    );

    check("Fehler im Dashboard: mit den letzten Schritten", dashboard.includes("🌐 Fehler im Dashboard") && dashboard.includes("Letzte Schritte") && dashboard.includes("PUT /api/guild/1/levels → 500 · 120 ms"));

    const report = JsonOf(ErrorCard({ ...BOT, kind: "report", title: "📮 Speichern geht nicht", excerpt: null, footer: undefined, note: "Auch per Mail an support@nexus-emb.de" }, { buttons: true, repeats: 0, reopened: null, production: true }));

    check("Meldung: Betreff als Titel, Hinweis auf die Mail", report.includes("📮 Speichern geht nicht") && report.includes("Auch per Mail an support@nexus-emb.de"));

    const done = JSON.stringify(DoneJson(ErrorCard(BOT, { buttons: true, repeats: 0, reopened: null, production: true }).components[0].toJSON(), "Mecry", new Date("2026-10-24T14:05:00Z")));

    check(
        "Erledigt: Titel mit ✅, wer und wann, ohne Knöpfe, Inhalt bleibt",
        done.includes("✅ Erledigt · Fehler im Bot") && done.includes("Erledigt von Mecry um 16:05 Uhr. Kommt der Fehler wieder, gibt es eine neue DM.") && !done.includes("guardian:") && done.includes("118 › await channel.setName(name);"),
        done.slice(0, 300)
    );
}

/** Der Guardian mit nachgestellten Devs: wer welche DM bekam, was bearbeitet wurde. */
async function checkDelivery(client: BotClient, database: boolean): Promise<void> {
    console.log(`\n  — Zustellen${database ? " (mit Datenbank)" : " (ohne Datenbank)"} —`);

    const sent: { to: string; json: string }[] = [];
    const edited: string[] = [];
    const users = client.users as unknown as { fetch: unknown };
    const channels = client.channels as unknown as { fetch: unknown };
    const original = { users: users.fetch, channels: channels.fetch, ready: client.isReady, devs: client.config.DEV_USER_IDs };
    let next = 1000;

    users.fetch = async (id: string) => ({
        id,
        tag: `dev-${id}`,
        send: async (message: { components?: { toJSON(): unknown }[] }) => {
            sent.push({ to: id, json: JsonOf(message) });

            return { id: String(next++), channelId: `dm-${id}` };
        },
    });
    channels.fetch = async (id: string) => ({ isTextBased: () => true, messages: { edit: async (messageId: string) => void edited.push(`${id}/${messageId}`) } });
    client.isReady = (() => true) as typeof client.isReady;
    (client.config as { DEV_USER_IDs: string[] }).DEV_USER_IDs = ["111", "222"];

    const guardian = client.guardian;
    const message = `check:guardian Zustellen ${Date.now()}`;
    const info = (): IErrorInfo => ({ ...BOT, id: NewErrorId(), message });

    try {
        const first = guardian.Report(info());

        await first.sent;

        for (let index = 0; index < 99; index++) await guardian.Report(info()).sent;

        check("100 gleiche Fehler: eine DM je Dev", sent.length === 2, `${sent.length} DMs`);
        check(database ? "Mit Datenbank: Knöpfe in der DM" : "Ohne Datenbank: keine Knöpfe", sent.every((entry) => entry.json.includes("guardian:done:") === database));

        if (!database) return;

        check("Jedes Auftreten hat eine Zeile", (await client.databaseService.Query<{ id: string }>("SELECT id FROM error_reports WHERE signature = ?", [ErrorSignature("bot", message, BOT.where)])).length === 100);

        const press = (userId: string, action: string) => {
            const answers: string[] = [];

            return {
                answers,
                interaction: {
                    customId: `guardian:${action}:${first.id}`,
                    user: { id: userId, username: userId === "111" ? "Mecry" : "Fremd" },
                    message: { id: "1000", components: [{ toJSON: () => JSON.parse(sent[0].json)[0] }] },
                    isButton: () => true,
                    reply: async (payload: unknown) => void answers.push(`reply ${JSON.stringify(payload)}`),
                    update: async (payload: unknown) => void answers.push(`update ${JSON.stringify(payload)}`),
                },
            };
        };

        const stranger = press("999", "done");

        await guardian.HandleButton(stranger.interaction as never);
        check("Erledigt von jemandem ohne Dev-Rechte ändert nichts", (await client.errorReports.LastDone(ErrorSignature("bot", message, BOT.where))) === null && stranger.answers.join().includes("Nur die Devs"), stranger.answers.join());

        const dev = press("111", "done");

        await guardian.HandleButton(dev.interaction as never);
        check("Erledigt: gespeichert, die eigene DM aktualisiert, die des anderen Devs bearbeitet", (await client.errorReports.LastDone(ErrorSignature("bot", message, BOT.where)))?.by === "Mecry" && dev.answers.join().includes("✅ Erledigt") && edited.includes("dm-222/1001"), `${dev.answers.join()} | ${edited}`);

        const lost = press("111", "logs");

        lost.interaction.customId = "guardian:logs:NEXUS-1-AAAAAA";
        await guardian.HandleButton(lost.interaction as never);
        check("In DevLogs öffnen: Ist die Sitzung weg, sagt das Panel es", lost.answers.join().includes("Diese Sitzung gibt es nicht mehr"), lost.answers.join().slice(0, 200));

        sent.length = 0;
        await guardian.Report(info()).sent;
        check("Kommt er danach wieder: sofort eine neue DM mit „Kam wieder“", sent.length === 2 && sent[0].json.includes("Kam wieder, nachdem Mecry ihn am"), sent.map((entry) => entry.json.slice(0, 80)).join(" | "));
    } finally {
        users.fetch = original.users;
        channels.fetch = original.channels;
        client.isReady = original.ready;
        (client.config as { DEV_USER_IDs: string[] }).DEV_USER_IDs = original.devs;
        await client.databaseService.Write("DELETE FROM error_reports WHERE signature LIKE ?", ["%check:guardian Zustellen%"]).catch(() => undefined);
    }
}

/* ----------------------------------------------------------
   Speicher
   ---------------------------------------------------------- */
async function checkStore(client: BotClient): Promise<void> {
    console.log("\n  — Speicher (error_reports) —");

    const store = client.errorReports;
    const fresh = NewErrorId();
    const old = NewErrorId(new Date(Date.now() - 100 * 86_400_000));
    const signature = ErrorSignature("bot", `check:guardian ${Date.now()}`, "src/scripts/CheckGuardian.ts:1");

    try {
        await store.Add({ id: fresh, kind: "bot", signature, session: 7 });
        await store.Add({ id: old, kind: "dashboard", signature: "check:guardian alt", session: null, created_at: new Date(Date.now() - 100 * 86_400_000) });

        check("Ein neuer Bericht ist noch nicht erledigt", (await store.LastDone(signature)) === null);

        await store.SetDms(fresh, [{ userId: "1", channelId: "2", messageId: "3" }]);
        check("Die DMs je Dev werden gespeichert", JSON.stringify(await store.Dms(fresh)) === JSON.stringify([{ userId: "1", channelId: "2", messageId: "3" }]));

        const done = await store.MarkDone(fresh, "Mecry");
        const last = await store.LastDone(signature);

        check("Erledigt: wer und wann", done?.done_by === "Mecry" && last?.by === "Mecry" && last.at instanceof Date, JSON.stringify(last));
        check("Ein zweites Erledigt ändert nichts mehr", (await store.MarkDone(fresh, "Jemand")) === null && (await store.LastDone(signature))?.by === "Mecry");

        const due = (await store.Old(90)).map((row) => row.id);

        check("Nach 90 Tagen fällig: nur die alten", due.includes(old) && !due.includes(fresh), due.join(", "));
    } finally {
        await store.Remove([fresh, old]);
    }

    check("Entfernen löscht die Zeilen", (await store.Find(fresh)) === null && (await store.Find(old)) === null);
}

/* ----------------------------------------------------------
   Meldungen über „Fehler melden“ und /fehler
   ---------------------------------------------------------- */
async function checkReports(client: BotClient): Promise<void> {
    console.log("\n  — Meldungen als DM —");

    const extras = ReportExtras({ browser: "Firefox 140 · Windows", errorIds: ["NEXUS-1792841102-M2XD7K", "fremd", "NEXUS-1-ABC", "<script>", "NEXUS-1792841103-QQQQQQ"] });

    check("Fehler davor: nur IDs im echten Format, höchstens drei", JSON.stringify(extras.errorIds) === JSON.stringify(["NEXUS-1792841102-M2XD7K", "NEXUS-1792841103-QQQQQQ"]) && extras.browser === "Firefox 140 · Windows", JSON.stringify(extras));

    const service = client.reportService as unknown as { transport: unknown; Send: typeof client.reportService.Send };
    const sent: string[] = [];
    const users = client.users as unknown as { fetch: unknown };
    const original = { transport: service.transport, users: users.fetch, ready: client.isReady, devs: client.config.DEV_USER_IDs, mail: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client.reportService), "Ready") };
    let mailWorks = true;
    let next = 5000;

    Object.defineProperty(client.reportService, "Ready", { configurable: true, get: () => true });
    service.transport = { sendMail: async () => {
        if (!mailWorks) throw new Error("SMTP weg");
    } };
    users.fetch = async (id: string) => ({ id, send: async (message: { components?: { toJSON(): unknown }[] }) => (sent.push(JsonOf(message)), { id: String(next++), channelId: `dm-${id}` }) });
    client.isReady = (() => true) as typeof client.isReady;
    (client.config as { DEV_USER_IDs: string[] }).DEV_USER_IDs = ["111"];

    const report = { subject: "Speichern geht nicht", message: "Beim Level System passiert nichts, wenn ich auf Speichern klicke.", context: "Level System, Speichern", contact: "mecry@example.com", source: "dashboard" as const, user: { id: "1059621019947634751", name: "@mecry" }, guild: null, page: "/guild/1/levels", browser: "Firefox 140 · Windows", errorIds: ["NEXUS-1792841102-M2XD7K"] };

    try {
        await service.Send(report, `check-${Date.now()}-a`);
        check("Meldung: Mail und DM, mit Betreff, Fehler davor und Hinweis auf die Mail", sent.length === 1 && sent[0].includes("📮 Speichern geht nicht") && sent[0].includes("NEXUS-1792841102-M2XD7K") && sent[0].includes("Auch per Mail an support@nexus-emb.de"), sent[0]?.slice(0, 200));

        mailWorks = false;
        sent.length = 0;

        let failed: unknown = null;

        await service.Send(report, `check-${Date.now()}-b`).catch((error: unknown) => (failed = error));
        check("Mail scheitert, DM klappt: die Meldung gilt als angekommen", failed === null && sent.length === 1 && sent[0].includes("Die Mail an support@nexus-emb.de ging nicht raus"), String(failed));

        (client.config as { DEV_USER_IDs: string[] }).DEV_USER_IDs = [];
        failed = null;
        await service.Send(report, `check-${Date.now()}-c`).catch((error: unknown) => (failed = error));
        check("Mail und DM scheitern: Fehler wie bisher", failed instanceof ReportError && failed.status === 502, String(failed));
    } finally {
        service.transport = original.transport;
        users.fetch = original.users;
        client.isReady = original.ready;
        (client.config as { DEV_USER_IDs: string[] }).DEV_USER_IDs = original.devs;
        delete (client.reportService as unknown as Record<string, unknown>).Ready;
    }

    const form = await readFile(path.join(process.cwd(), "src", "dashboard", "client", "layout", "Report.ts"), "utf8");

    check("Formular: sagt, was automatisch mitgeht, und schickt es mit", form.includes("Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.") && form.includes("recentErrorIds()") && form.includes("browserOf("));
}

async function main(): Promise<void> {
    console.log("\n🛠️  Guardian und Fehlerberichte\n");

    const client = new BotClient();

    checkIds();
    await checkWhere();
    await checkTranslate();
    checkCards();
    await checkReports(client);

    if (await client.databaseService.Connect()) {
        try {
            await checkStore(client);
            await checkDelivery(client, true);
        } finally {
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Speicher —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
        await checkDelivery(client, false);
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

void main();
