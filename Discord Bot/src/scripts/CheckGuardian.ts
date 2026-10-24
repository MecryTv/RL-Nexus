/**
 * Prüft den Guardian und die Fehlerberichte für die Devs (Plan 24).
 *
 *   npm run check:guardian
 *
 * Ohne Datenbank laufen nur die Teile ohne Speicher. Mit Datenbank (DATABASE_*)
 * legt der Bot seine Tabellen selbst an.
 */
import BotClient from "../client/BotClient";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ErrorSignature, Excerpt, NewErrorId, WhereOf } from "../Guardian";

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

async function main(): Promise<void> {
    console.log("\n🛠️  Guardian und Fehlerberichte\n");

    const client = new BotClient();

    checkIds();
    await checkWhere();

    if (await client.databaseService.Connect()) {
        try {
            await checkStore(client);
        } finally {
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Speicher —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

void main();
