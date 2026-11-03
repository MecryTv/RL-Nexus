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
import { GateFresh, GateNow, GATE_NO_TTL, GATE_OK_TTL, PassUsable, RefuseFor } from "../utils/invitepass";
import { NoAccessReply, PickInviter } from "../utils/servers";

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

console.log("\nFreigabe-Pass und Ansprechpartner (Punkt 4 und 5)");
check("Pass gilt 15 Minuten und nur einmal", PassUsable({ expires_at: 2_000, used_at: null }, 1_000) && !PassUsable({ expires_at: 2_000, used_at: 1_500 }, 1_000) && !PassUsable({ expires_at: 900, used_at: null }, 1_000));
check("Ohne Pass geht der Bot, außer das Team hat eingeladen", RefuseFor({ pass: false, team: false, contacts: 3 }) === "pass" && RefuseFor({ pass: false, team: true, contacts: 0 }) === null);
check("Ohne Ansprechpartner geht er, unbekannt heißt bleiben", RefuseFor({ pass: true, team: false, contacts: 0 }) === "contact" && RefuseFor({ pass: true, team: false, contacts: null }) === null);
check(
    "Review 5: Alter Eintrag gilt sofort und wird im Hintergrund erneuert, nur ohne Eintrag wird gewartet",
    JSON.stringify(GateNow({ ok: false, at: 0 }, GATE_OK_TTL * 2)) === JSON.stringify({ ok: false, refresh: true }) &&
        JSON.stringify(GateNow({ ok: true, at: 0 }, 1)) === JSON.stringify({ ok: true, refresh: false }) &&
        JSON.stringify(GateNow(undefined, 0)) === JSON.stringify({ ok: null, refresh: true })
);
check("Mit Ansprechpartner gilt die Prüfung einen Tag, ohne fünf Minuten", GateFresh({ ok: true, at: 0 }, GATE_OK_TTL - 1) && !GateFresh({ ok: true, at: 0 }, GATE_OK_TTL) && !GateFresh({ ok: false, at: 0 }, GATE_NO_TTL) && !GateFresh(undefined, 0));

void (async () => {
    const reply = JSON.stringify(await NoAccessReply("Chill Zone", false, "https://nexus-emb.de/preise"));
    const managerReply = JSON.stringify(await NoAccessReply("Chill Zone", true, "https://nexus-emb.de/preise"));
    check("Antwort ohne Zugang: Mitglieder wenden sich an Owner oder Admin, nur Admins sehen „Zugang holen“", reply.includes("Kein Admin mit Zugang") && reply.includes("Wende dich an den Owner") && !reply.includes("Zugang holen") && managerReply.includes("Zugang holen") && managerReply.includes("Server verwalten"));

    console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
    process.exit(failures ? 1 : 0);
})();
