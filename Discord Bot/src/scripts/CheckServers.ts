/**
 * Prüft den Teil des Bots an „ein Server pro Person“ und am Team-Kasten
 * (W-0064): wer eingeladen hat, die customIds der DMs, Fehler beim Beitreten.
 * Ohne Discord-Login.
 *
 *   npm run check:servers
 *
 * Wie die übrigen Checks ohne Test-Framework. Exit-Code 1, sobald etwas nicht stimmt.
 */
import { ParseServerId } from "../events/servers/ServerLimitButtons";
import { JoinProblem, SameName } from "../routes/DashboardApiTeam";
import { PickInviter } from "../utils/servers";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const BOT = "100000000000000001";
const OWNER = "200000000000000002";
const A = "300000000000000003";
const B = "400000000000000004";

console.log("\nEinlader");
check("Ohne Eintrag gilt der Owner", JSON.stringify(PickInviter([], BOT, OWNER)) === JSON.stringify({ userId: OWNER, source: "owner" }));
check(
    "Der neueste Eintrag mit dem Bot als Ziel zählt, fremde Bots nicht",
    PickInviter(
        [
            { targetId: BOT, executorId: A, createdTimestamp: 1 },
            { targetId: "999999999999999999", executorId: B, createdTimestamp: 5 },
            { targetId: BOT, executorId: B, createdTimestamp: 3 },
        ],
        BOT,
        OWNER
    ).userId === B
);
check("Eintrag ohne Ausführenden zählt nicht", PickInviter([{ targetId: BOT, executorId: null, createdTimestamp: 9 }], BOT, OWNER).source === "owner");

console.log("\ncustomIds der DMs");
check("Freigabe anfragen", JSON.stringify(ParseServerId(`sv:ask:extra:${A}`)) === JSON.stringify({ kind: "ask", type: "extra", guildId: A }));
check("Fenster mit Wechsel", ParseServerId(`sv:modal:switch:${A}`)?.kind === "modal");
check("Wählen, Zurück, Mehr, Erinnerung ohne Zusatz", ["sv:pick", "sv:undo", "sv:more", "sv:remind", "sv:morepick"].every((id) => ParseServerId(id) !== null));
check("Fremde oder kaputte IDs nicht", [`ud:copy:1`, `sv:ask:other:${A}`, "sv:ask:extra:abc", "sv:pick:1", "sv:"].every((id) => ParseServerId(id) === null));

console.log("\nTeam-Kasten");
check("Servername bestätigen: Leerzeichen am Rand und Groß/klein egal", SameName("  rl ranked de ", "RL Ranked DE") && !SameName("RL Ranked", "RL Ranked DE"));
check("Gebannt und voll ergeben denselben Satz ohne Code", JoinProblem(40007) === JoinProblem(30001) && !/\d/.test(JoinProblem(40007) ?? "1"));
check("Fehlendes Recht heißt: einmal zustimmen", JoinProblem(50025) === null);

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
process.exit(failures ? 1 : 0);
