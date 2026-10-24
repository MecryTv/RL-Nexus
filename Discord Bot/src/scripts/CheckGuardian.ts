/**
 * Prüft den Guardian und die Fehlerberichte für die Devs (Plan 24).
 *
 *   npm run check:guardian
 *
 * Ohne Datenbank laufen nur die Teile ohne Speicher. Mit Datenbank (DATABASE_*)
 * legt der Bot seine Tabellen selbst an.
 */
import BotClient from "../client/BotClient";
import { ErrorSignature, NewErrorId } from "../Guardian";

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
