/**
 * Prüft die Staff-Freigabe (W-0011, Plan 44) ohne Discord: die Regeln, den
 * Ablauf einer Anfrage und - mit gefakten Diensten - Dienst, Zugriff und Routen.
 *
 *   npm run check:staffgrant
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { REQUEST_TTL_MS } from "../constants/StaffGrant";
import { IStaffGrant } from "../interfaces/services/staffgrant/IStaffGrant";
import { ActionText, AskList, ParseDuration } from "../services/staffgrant/Rules";
import { Answer, AnswerPrivate, AskPrivate, CanRequest, End, Extend, RemovePrivate, StaffGrantError, Tick, Withdraw } from "../services/staffgrant/Machine";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Der Satz, mit dem eine Aktion scheitert - oder null, wenn sie durchgeht. */
function fails(run: () => unknown): string | null {
    try {
        run();

        return null;
    } catch (error) {
        return error instanceof StaffGrantError ? error.message : `kein StaffGrantError: ${String(error)}`;
    }
}

const T0 = Date.UTC(2026, 10, 1, 10, 0, 0);
const MIN = 60_000;

function Grant(over: Partial<IStaffGrant> = {}): IStaffGrant {
    return {
        id: 1,
        guildId: "100",
        staffId: "900",
        staffName: "MecryTv | Joe",
        staffRole: "Developer",
        reason: "Zeige dir die Rangliste",
        minutes: 60,
        mode: "free",
        asked: ["1", "2"],
        denied: [],
        status: "open",
        createdAt: T0,
        expiresAt: T0 + REQUEST_TTL_MS,
        answeredBy: null,
        startsAt: null,
        endsAt: null,
        endedBy: null,
        endedAt: null,
        private: "none",
        privateReason: null,
        privateAskedAt: null,
        privateDeniedAt: null,
        privateDenied: [],
        privateBy: null,
        dms: {},
        ...over,
    };
}

const Running = (over: Partial<IStaffGrant> = {}): IStaffGrant =>
    Grant({ status: "active", answeredBy: "1", startsAt: T0, endsAt: T0 + 60 * MIN, ...over });

function checkRules(): void {
    console.log("\n📏 Regeln\n");

    const durations: [string, number | null][] = [
        ["45 Min.", 45],
        ["2 Std.", 120],
        ["1:30", 90],
        ["45", 45],
        ["2h", 120],
        ["1,5 Std.", 90],
        ["5 Min.", null],
        ["25 Std.", null],
        ["0:05", null],
        ["abc", null],
        ["", null],
    ];

    for (const [text, minutes] of durations) check(`Dauer „${text}“ → ${String(minutes)}`, ParseDuration(text) === minutes, String(ParseDuration(text)));

    const ok = new Set(["o", "a", "c"]);
    const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((entry, index) => entry === b[index]);

    check("Free fragt den Owner", same(AskList("free", "o", ["a", "b"], new Set()), ["o"]));
    check("Paid mit Zugang beim Owner fragt nur ihn", same(AskList("paid", "o", ["a", "b", "c"], ok), ["o"]));
    check("Paid ohne Owner-Zugang fragt Verwalter mit Zugang", same(AskList("paid", "x", ["a", "b", "c"], ok), ["a", "c"]));
    check("Paid ohne jemand mit Zugang fragt niemanden", AskList("paid", "x", ["b"], ok).length === 0);
    check("Beta fragt Owner und Verwalter mit Code, ohne Doppelte", same(AskList("beta", "o", ["a", "o", "b", "a"], ok), ["o", "a"]));

    const many = Array.from({ length: 15 }, (_, index) => `m${index}`);
    check("Nie mehr als 10 Gefragte", AskList("paid", "x", many, new Set(many)).length === 10);

    check("Aktion „save“", ActionText("Level System", "save") === "Level System › gespeichert");
    check("Unbekannte Aktion bleibt stehen", ActionText("Level System", "xyz") === "Level System › xyz");
    check("Ohne Aktion: geändert", ActionText("Level System", undefined) === "Level System › geändert");
}

function checkAnswer(): void {
    console.log("\n✅ Antworten\n");

    const yes = Answer(Grant(), "1", true, 60, false, T0 + 1000);
    check("Ja gibt frei", yes.status === "active" && yes.answeredBy === "1" && yes.startsAt === T0 + 1000 && yes.endsAt === T0 + 1000 + 60 * MIN);
    check("Ja ohne angefragte private Bereiche: none", yes.private === "none");
    check("Ja mit Schalter an: private on", Answer(Grant({ private: "asked" }), "1", true, 60, true, T0).private === "on");
    check("Ja mit Schalter aus: private denied", Answer(Grant({ private: "asked" }), "1", true, 60, false, T0).private === "denied");
    check("Eigene Dauer gilt", Answer(Grant(), "1", true, 45, false, T0).endsAt === T0 + 45 * MIN);

    const one = Answer(Grant(), "1", false, 60, false, T0);
    check("Ein Nein von zweien: bleibt offen", one.status === "open" && one.denied.includes("1"));

    const both = Answer(one, "2", false, 60, false, T0 + 5);
    check("Nein von allen: abgelehnt", both.status === "denied" && both.endedAt === T0 + 5);

    check("Nach Ablauf: verfallen", fails(() => Answer(Grant(), "1", true, 60, false, T0 + REQUEST_TTL_MS)) === "Die Anfrage ist schon verfallen.");
    check("Zweite Antwort nach dem Ja: schon beantwortet", fails(() => Answer(yes, "2", false, 60, false, T0 + 2000)) === "Schon beantwortet.");
    check("Nicht gefragt: abgewiesen", fails(() => Answer(Grant(), "3", true, 60, false, T0)) === "Diese Anfrage ist nicht an dich.");
    check("5 Minuten: abgewiesen", fails(() => Answer(Grant(), "1", true, 5, false, T0)) === "Bitte 10 Minuten bis 24 Stunden.");
}

function checkTick(): void {
    console.log("\n⏱️  Ablauf\n");

    check("Offen nach 10 Minuten: verfallen", Tick(Grant(), T0 + REQUEST_TTL_MS)?.status === "expired");
    check("Offen davor: unverändert", Tick(Grant(), T0 + REQUEST_TTL_MS - 1) === null);

    const ended = Tick(Running(), T0 + 60 * MIN);
    check("Laufend nach Ende: beendet ohne Person", ended?.status === "ended" && ended.endedBy === null && ended.endedAt === T0 + 60 * MIN);

    const asked = Tick(Running({ private: "asked", privateAskedAt: T0 }), T0 + REQUEST_TTL_MS);
    check("Späte private Anfrage verfällt", asked?.private === "none" && asked.status === "active");
    check("Laufend davor: unverändert", Tick(Running(), T0 + 59 * MIN) === null);
}

function checkExtendEnd(): void {
    console.log("\n➕ Verlängern und Beenden\n");

    let grant = Running();

    for (let i = 0; i < 3; i++) grant = Extend(grant, T0 + MIN);

    check("Dreimal +30 Min.", grant.endsAt === T0 + 150 * MIN);
    check("Bis an 24 Stunden heran", Extend(Running({ endsAt: T0 + 1430 * MIN }), T0).endsAt === T0 + 1440 * MIN);
    check("Über 24 Stunden: abgewiesen", fails(() => Extend(Running({ endsAt: T0 + 1440 * MIN }), T0)) === "Mehr als 24 Stunden geht nicht.");
    check("Offene Anfrage verlängern: abgewiesen", fails(() => Extend(Grant(), T0)) !== null);

    const end = End(Running(), "1", T0 + 5 * MIN);
    check("Beenden", end.status === "ended" && end.endedBy === "1" && end.endedAt === T0 + 5 * MIN);
    check("Offene Anfrage beenden: abgewiesen", fails(() => End(Grant(), "1", T0)) !== null);

    check("Zurückziehen", Withdraw(Grant(), T0).status === "withdrawn");
    check("Laufende zurückziehen: abgewiesen", fails(() => Withdraw(Running(), T0)) !== null);
}

function checkPrivate(): void {
    console.log("\n🔏 Private Bereiche\n");

    const asked = AskPrivate(Running(), "Ticket #0142 hängt", T0 + MIN);
    check("Später anfragen", asked.private === "asked" && asked.privateReason === "Ticket #0142 hängt" && asked.privateAskedAt === T0 + MIN);
    check("Ohne laufende Freigabe: abgewiesen", fails(() => AskPrivate(Grant(), "x", T0)) !== null);
    check("Ohne Grund: abgewiesen", fails(() => AskPrivate(Running(), "  ", T0)) !== null);
    check("Grund über 200 Zeichen: abgewiesen", fails(() => AskPrivate(Running(), "x".repeat(201), T0)) !== null);
    check("Schon offen: abgewiesen", fails(() => AskPrivate(Running({ private: "on" }), "x", T0)) !== null);
    check("Nach Nein vor 9 Min.: gesperrt", fails(() => AskPrivate(Running({ private: "denied", privateDeniedAt: T0 }), "x", T0 + 9 * MIN)) !== null);
    check("Nach Nein vor 11 Min.: geht", AskPrivate(Running({ private: "denied", privateDeniedAt: T0 }), "x", T0 + 11 * MIN).private === "asked");

    const on = AnswerPrivate(asked, "2", true, T0 + 2 * MIN);
    check("Ja öffnet", on.private === "on" && on.privateBy === "2");

    const no = AnswerPrivate(asked, "1", false, T0 + 2 * MIN);
    check("Ein Nein von zweien: bleibt angefragt", no.private === "asked" && no.privateDenied.includes("1"));

    const denied = AnswerPrivate(no, "2", false, T0 + 3 * MIN);
    check("Nein von allen: abgelehnt", denied.private === "denied" && denied.privateDeniedAt === T0 + 3 * MIN);
    check("Nicht gefragt: abgewiesen", fails(() => AnswerPrivate(asked, "3", true, T0)) === "Diese Anfrage ist nicht an dich.");

    check("Wegnehmen", RemovePrivate(on, "1").private === "removed");
    check("Wegnehmen ohne offene: abgewiesen", fails(() => RemovePrivate(Running(), "1")) !== null);
}

function checkCanRequest(): void {
    console.log("\n🚦 Neue Anfrage\n");

    check("Ohne andere: geht", CanRequest([], "900", T0) === null);
    check("Offene im Server: Satz", CanRequest([Grant({ staffId: "901" })], "900", T0) === "Gerade läuft schon eine Anfrage für diesen Server.");
    check("Laufende im Server: Satz mit Name", CanRequest([Running({ staffId: "901", staffName: "Ana" })], "900", T0) === "Ana bearbeitet diesen Server gerade.");

    const denied = Grant({ status: "denied", endedAt: T0 });
    const nine = CanRequest([denied], "900", T0 + 9 * MIN);
    check("Nein vor 9 Min.: Sperre bis HH:MM", /^Nach einem Nein geht die nächste Anfrage erst um \d\d:\d\d\.$/.test(nine ?? ""), String(nine));
    check("Nein vor 11 Min.: geht", CanRequest([denied], "900", T0 + 11 * MIN) === null);
    check("Nein an anderen Staff: geht", CanRequest([{ ...denied, staffId: "901" }], "900", T0 + MIN) === null);
    check("Beendete: geht", CanRequest([Running({ status: "ended", endedAt: T0 })], "900", T0 + MIN) === null);
}

async function main(): Promise<void> {
    checkRules();
    checkAnswer();
    checkTick();
    checkExtendEnd();
    checkPrivate();
    checkCanRequest();

    console.log(failures ? `\n❌ ${failures} Prüfung(en) fehlgeschlagen` : "\n✅ Alles in Ordnung");
    process.exit(failures ? 1 : 0);
}

void main();
