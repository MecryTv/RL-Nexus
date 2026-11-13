/**
 * Prüft die Abmeldungen im Modul RL Team-Übersicht (W-0095): Tage lesen und
 * rechnen, Grenzen, Zusammenlegen, wer was sieht, das Bild - und, sofern eine
 * Datenbank da ist, die Tabelle dahinter.
 *
 *   npm run check:absences
 *
 * Formular, Knöpfe und Panel im Kanal brauchen einen echten Server (Dev-Server).
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { AbsenceSettingsOf, AbsenceShown, AddDays, DayInput, DayLabel, DaysBetween, DefaultAbsenceSettings, ParseDay, ShortDay, Today } from "../constants/Absences";
import { AbsenceStatus, CheckAbsence, MergeAbsence, ReturnPlan, WarningText } from "../services/teams/Absences";
import { AddedReply } from "../builder/AbsenceView";
import { ITeamAbsence } from "../interfaces/services/teams/IAbsences";
import { ITeamPlayer } from "../interfaces/services/teams/ITeams";
import BotClient from "../client/BotClient";
import { RenderAbsenceCard } from "../builder/AbsenceCard";
import { AbsenceError } from "../services/AbsenceService";

const GUILD = "90071992547413001";
const NICO = "90071992547413002";
const ZEN = "90071992547413003";
const MAX = "90071992547413004";
const COACH = "90071992547413005";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Freitag, 13.11.2026, 12:00 deutscher Zeit. */
const NOW = Date.UTC(2026, 10, 13, 11, 0);

function checkDays(): void {
    console.log("\n  — Tage —");

    check("Heute in deutscher Zeit", Today(NOW) === "2026-11-13", Today(NOW));
    check("Kurz vor Mitternacht UTC ist in Berlin schon morgen", Today(Date.UTC(2026, 10, 13, 23, 30)) === "2026-11-14", Today(Date.UTC(2026, 10, 13, 23, 30)));
    check("Tage zählen über den Monatswechsel", AddDays("2026-11-29", 3) === "2026-12-02" && AddDays("2026-12-31", 1) === "2027-01-01");
    check("Abstand in Tagen", DaysBetween("2026-11-13", "2026-11-15") === 2 && DaysBetween("2026-11-15", "2026-11-13") === -2);
    check("Anzeige mit Wochentag", DayLabel("2026-11-13") === "Fr 13.11." && DayLabel("2026-11-15") === "So 15.11.", DayLabel("2026-11-13"));
    check("Kurze Anzeige", ShortDay("2026-11-05") === "05.11.");

    const cases: [string, string | null][] = [
        ["heute", "2026-11-13"],
        ["Heute", "2026-11-13"],
        ["morgen", "2026-11-14"],
        ["übermorgen", "2026-11-15"],
        ["uebermorgen", "2026-11-15"],
        ["fr", "2026-11-13"],
        ["Sa", "2026-11-14"],
        ["sonntag", "2026-11-15"],
        ["Do", "2026-11-19"],
        ["15.11.", "2026-11-15"],
        ["15.11", "2026-11-15"],
        ["3.1.", "2027-01-03"],
        ["12.11.", "2027-11-12"],
        ["20.11.2026", "2026-11-20"],
        ["20.11.26", "2026-11-20"],
        ["2026-11-20", "2026-11-20"],
        ["bis So", "2026-11-15"],
        ["ab morgen", "2026-11-14"],
        ["31.11.", null],
        ["29.02.2027", null],
        ["constructor", null],
        ["", null],
        ["irgendwann", null],
    ];

    for (const [text, want] of cases) {
        const got = ParseDay(text, NOW);

        check(`„${text}“ → ${want ?? "nichts"}`, got === want, String(got));
    }
}

function checkSettings(): void {
    console.log("\n  — Einstellungen —");

    const defaults = DefaultAbsenceSettings();

    check("Ab Werk an, Panel aus, Karte und Matchups an", defaults.enabled && !defaults.panel && defaults.card && defaults.matchupWarning);
    check("Ab Werk sehen Captain, Co-Captain, Manager und Coach die Gründe", defaults.viewers.join() === "captain,cocaptain,manager,coach", defaults.viewers.join());
    check("Ab Werk 60 Tage lang, 90 Tage im Voraus", defaults.maxDays === 60 && defaults.aheadDays === 90);
    check("Ohne Eingabe bleibt der alte Stand", JSON.stringify(AbsenceSettingsOf(undefined, defaults)) === JSON.stringify(defaults));

    const cleaned = AbsenceSettingsOf(
        {
            enabled: false,
            viewers: ["captain", "boss", "coach", "captain"],
            reasonRequired: true,
            reasons: ["  Urlaub ", "", "Urlaub", "x".repeat(60), ...Array.from({ length: 20 }, (_, index) => `Grund ${index}`)],
            maxDays: 9999,
            aheadDays: -3,
            panel: "ja",
            card: false,
            matchupWarning: false,
        },
        defaults
    );

    check("Schalter kommen an", !cleaned.enabled && cleaned.reasonRequired && !cleaned.card && !cleaned.matchupWarning);
    check("Kein Schalter aus Text", cleaned.panel === defaults.panel);
    check("Nur bekannte Rollen, jede einmal", cleaned.viewers.join() === "captain,coach", cleaned.viewers.join());
    check("Gründe getrimmt, ohne Leere und Doppelte, gekürzt, höchstens 10", cleaned.reasons[0] === "Urlaub" && cleaned.reasons[1]!.length === 40 && cleaned.reasons.length === 10, JSON.stringify(cleaned.reasons));
    check("Dauer und Vorlauf in Grenzen", cleaned.maxDays === 365 && cleaned.aheadDays === 1, `${cleaned.maxDays} ${cleaned.aheadDays}`);
    check("Ohne Gründe gibt es die Standardliste", AbsenceSettingsOf({ reasons: [] }, defaults).reasons.join() === defaults.reasons.join());
}

function Absence(id: number, userId: string, startsOn: string, endsOn: string, extra: Partial<ITeamAbsence> = {}): ITeamAbsence {
    return { id, guildId: GUILD, teamId: 1, userId, startsOn, endsOn, reason: "", note: "", createdAt: 0, ...extra };
}

function Player(id: string, discordId: string | null, role: ITeamPlayer["role"] = "player"): ITeamPlayer {
    return { id, discordId, name: id, epicName: id, role, peaks: { "1v1": null, "2v2": null, "3v3": null } };
}

function checkRules(): void {
    console.log("\n  — Regeln —");

    const settings = DefaultAbsenceSettings();
    const range = (from: string, to: string, extra: Partial<{ reason: string; note: string }> = {}) => CheckAbsence({ from, to, reason: "", note: "", ...extra }, settings, NOW);

    check("Heute bis Sonntag geht", JSON.stringify(range("heute", "So")) === JSON.stringify({ startsOn: "2026-11-13", endsOn: "2026-11-15", reason: "", note: "" }), JSON.stringify(range("heute", "So")));
    check("Ein Tag geht", "startsOn" in range("Sa", "Sa"));
    check("„Mi bis Fr“ meint den Freitag danach", (range("Mi", "Fr") as { endsOn?: string }).endsOn === "2026-11-20", JSON.stringify(range("Mi", "Fr")));
    check("Wochentag ab einem Starttag", ParseDay("Fr", NOW, "2026-11-18") === "2026-11-20" && ParseDay("Mi", NOW, "2026-11-18") === "2026-11-18");
    check("Ohne „bis“ nur der eine Tag", (range("Sa", "") as { endsOn?: string }).endsOn === "2026-11-14", JSON.stringify(range("Sa", "")));
    check("„Von“ unlesbar", (range("bald", "So") as { error?: string }).error?.includes("„Von“") === true);
    check("„Bis“ unlesbar", (range("heute", "irgendwann") as { error?: string }).error?.includes("„Bis“") === true);
    check("„Bis“ vor „Von“", (range("16.11.", "15.11.") as { error?: string }).error?.includes("vor") === true, JSON.stringify(range("16.11.", "15.11.")));
    check("Rückwirkend geht nicht", (range("12.11.2026", "So") as { error?: string }).error?.includes("rückwirkend") === true, JSON.stringify(range("12.11.2026", "So")));
    check(`Höchstens ${settings.maxDays} Tage am Stück`, (range("heute", AddDays("2026-11-13", settings.maxDays)) as { error?: string }).error?.includes("Tage am Stück") === true);
    check(`Genau ${settings.maxDays} Tage gehen`, "startsOn" in range("heute", AddDays("2026-11-13", settings.maxDays - 1)));
    check(`Höchstens ${settings.aheadDays} Tage im Voraus`, (range(AddDays("2026-11-13", settings.aheadDays + 1), "") as { error?: string }).error?.includes("im Voraus") === true);
    check("Grund aus der Liste geht", (range("heute", "", { reason: "Urlaub" }) as { reason?: string }).reason === "Urlaub");
    check("Fremder Grund geht nicht", "error" in range("heute", "", { reason: "Party" }));
    check("Grund Pflicht, wenn eingestellt", "error" in CheckAbsence({ from: "heute", to: "", reason: "", note: "" }, { ...settings, reasonRequired: true }, NOW));
    check("Ändern: der alte Start darf in der Vergangenheit liegen", "startsOn" in CheckAbsence({ from: "10.11.2026", to: "So", reason: "", note: "" }, settings, NOW, "2026-11-10"));
    check("Ändern: ein anderer Start in der Vergangenheit nicht", "error" in CheckAbsence({ from: "11.11.2026", to: "So", reason: "", note: "" }, settings, NOW, "2026-11-10"));
    check("Notiz wird getrimmt und gekürzt", (range("heute", "", { note: `  ${"x".repeat(300)}  ` }) as { note?: string }).note?.length === 200);

    // Review W-0095: Beim Ändern stand „10.11.“ ohne Jahr im Formular - vorbei, also nächstes Jahr, und „Bis vor Von“.
    check("Vorbelegung mit Jahr liest sich zurück", DayInput("2026-11-10") === "10.11.26" && ParseDay(DayInput("2026-11-10"), NOW) === "2026-11-10", DayInput("2026-11-10"));
    check("Laufende Abmeldung unverändert absenden geht", "startsOn" in CheckAbsence({ from: DayInput("2026-11-10"), to: DayInput("2026-11-20"), reason: "", note: "" }, settings, NOW, "2026-11-10"));
    check("Hub mit {team.absent} in der Zeile wird nachgezogen", AbsenceShown({ layout: "hub", hubLine: "{team.name} · {team.absent}", team: { kind: "v2" } }) === "hub");
    check("Karten mit {team.available} werden nachgezogen", AbsenceShown({ layout: "cards", hubLine: "", team: { content: "{team.available}" } }) === "cards");
    check("Ohne Platzhalter nichts", AbsenceShown({ layout: "hub", hubLine: "{team.name}", team: { content: "{team.absent}" } }) === null);
    check("Matchup-Hinweis: einer ist", WarningText(2, 3, ["Joe"]) === "1 von 3 ist dann abgemeldet: Joe.", WarningText(2, 3, ["Joe"]));
    check("Matchup-Hinweis: mehrere sind", WarningText(1, 3, ["Joe", "Kuzai"]) === "2 von 3 sind dann abgemeldet: Joe, Kuzai.", WarningText(1, 3, ["Joe", "Kuzai"]));
    check("Bestätigung ohne doppelten Punkt", !JSON.stringify(AddedReply([Absence(1, NICO, "2026-11-13", "2026-11-15")], new Map([[1, "Academy"]]), "2026-11-13")).includes(".."));

    console.log("\n  — Zusammenlegen —");

    const existing = [Absence(1, NICO, "2026-11-14", "2026-11-15"), Absence(2, NICO, "2026-11-20", "2026-11-21"), Absence(3, NICO, "2026-11-30", "2026-12-01")];
    const merged = MergeAbsence(existing, "2026-11-16", "2026-11-19");

    check("Angrenzende Zeiträume werden einer", merged.startsOn === "2026-11-14" && merged.endsOn === "2026-11-21", JSON.stringify(merged));
    check("Die älteste Zeile bleibt, die anderen gehen", merged.keep === 1 && merged.drop.join() === "2", JSON.stringify(merged));
    check("Ohne Berührung bleibt alles getrennt", MergeAbsence(existing, "2026-11-25", "2026-11-26").keep === null);

    console.log("\n  — Zurückmelden —");

    const plan = ReturnPlan([Absence(1, NICO, "2026-11-10", "2026-11-15"), Absence(2, NICO, "2026-11-13", "2026-11-14"), Absence(3, NICO, "2026-11-20", "2026-11-21")], "2026-11-13");

    check("Laufend seit gestern: endet gestern", plan.end.length === 1 && plan.end[0]!.id === 1 && plan.end[0]!.endsOn === "2026-11-12", JSON.stringify(plan));
    check("Erst heute begonnen: weg", plan.drop.join() === "2", JSON.stringify(plan));
    check("Spätere bleiben", !plan.drop.includes(3) && !plan.end.some((entry) => entry.id === 3));

    console.log("\n  — Stand je Team —");

    const players = [Player("lenni", NICO, "captain"), Player("kuzai", ZEN), Player("yoshi", MAX), Player("cloudz", null), Player("coachi", COACH, "coach")];
    const status = AbsenceStatus(players, [Absence(1, ZEN, "2026-11-13", "2026-11-15"), Absence(2, MAX, "2026-11-14", "2026-11-14"), Absence(3, COACH, "2026-11-13", "2026-11-13"), Absence(4, NICO, "2026-12-30", "2026-12-31")], "2026-11-13");

    check("Heute da: zählt nur, wer mitspielt", status.here === 3 && status.of === 4, `${status.here}/${status.of}`);
    check("Heute weg: auch der Coach steht in der Liste", status.now.map((entry) => entry.userId).join() === `${ZEN},${COACH}`, status.now.map((entry) => entry.userId).join());
    check("Bald weg: nur in den nächsten 14 Tagen", status.soon.map((entry) => entry.userId).join() === MAX, status.soon.map((entry) => entry.userId).join());
    check("Ohne Kader-Eintrag zählt eine Abmeldung nicht", AbsenceStatus([Player("lenni", NICO)], [Absence(1, ZEN, "2026-11-13", "2026-11-15")], "2026-11-13").now.length === 0);
}

async function refuses(name: string, run: () => Promise<unknown>, part: string): Promise<void> {
    try {
        await run();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof AbsenceError && error.message.includes(part), String(error));
    }
}

async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const service = client.absenceService;
    const team = await client.teams.CreateFull(GUILD, { name: "Prüf-Abmeldung", players: [Player("lenni", NICO, "captain"), Player("kuzai", ZEN), Player("cloudz", null)] });

    try {
        const [first] = await service.Add(GUILD, ZEN, [team.id], { from: "heute", to: "So", reason: "", note: "" }, NOW);

        check("Abmelden legt eine Zeile an", first?.startsOn === "2026-11-13" && first.endsOn === "2026-11-15" && first.teamId === team.id, JSON.stringify(first));

        const merged = await service.Add(GUILD, ZEN, [team.id], { from: "Sa", to: "Di", reason: "Urlaub", note: "Ostsee" }, NOW);
        const mine = await service.Mine(GUILD, ZEN, NOW);

        check("Überschneidung wird zusammengelegt", mine.length === 1 && mine[0]!.startsOn === "2026-11-13" && mine[0]!.endsOn === "2026-11-17" && merged[0]!.id === first!.id, JSON.stringify(mine));
        check("Grund und Notiz der neuen Angabe gelten", mine[0]!.reason === "Urlaub" && mine[0]!.note === "Ostsee");

        // Review W-0095: Aneinanderhängen darf die Höchstdauer nicht umgehen.
        await refuses(
            "Zusammengelegt höchstens 60 Tage am Stück",
            () => service.Add(GUILD, ZEN, [team.id], { from: "18.11.2026", to: AddDays("2026-11-18", 55), reason: "", note: "" }, NOW),
            "Tage am Stück"
        );
        await refuses("Wer nicht im Kader steht, kann sich nicht abmelden", () => service.Add(GUILD, MAX, [team.id], { from: "heute", to: "", reason: "", note: "" }, NOW), "Kader");
        await refuses("Unlesbares „bis“ wird abgelehnt", () => service.Add(GUILD, ZEN, [team.id], { from: "heute", to: "bald", reason: "", note: "" }, NOW), "„Bis“");

        const status = await service.Status(team, NOW);

        check("Stand: 2 von 3 heute da", status.here === 2 && status.of === 3 && status.now.length === 1, `${status.here}/${status.of}`);

        const edited = await service.Edit(GUILD, ZEN, first!.id, { from: "13.11.2026", to: "Mo", reason: "Krank", note: "" }, NOW);

        check("Ändern geht, auch mit dem alten Start", edited.endsOn === "2026-11-16" && edited.reason === "Krank", JSON.stringify(edited));
        await refuses("Fremde Abmeldung ändern geht nicht", () => service.Edit(GUILD, NICO, first!.id, { from: "heute", to: "", reason: "", note: "" }, NOW), "nicht");

        check("Zurückmelden am ersten Tag löscht", (await service.Return(GUILD, ZEN, NOW)) === 1 && (await service.Mine(GUILD, ZEN, NOW)).length === 0);

        const [later] = await service.Add(GUILD, ZEN, [team.id], { from: "Mi", to: "Fr", reason: "", note: "" }, NOW);

        check("Spätere Abmeldung liegt in der Zukunft", later?.startsOn === "2026-11-18" && later.endsOn === "2026-11-20", JSON.stringify(later));
        await refuses("Fremde Abmeldung löschen geht nicht", () => service.Remove(GUILD, NICO, later!.id), "nicht");
        await service.Remove(GUILD, ZEN, later!.id);
        check("Eigene löschen geht", (await service.Mine(GUILD, ZEN, NOW)).length === 0);

        await service.Add(GUILD, NICO, [team.id], { from: "heute", to: "", reason: "", note: "" }, NOW);
        check("Aufräumen löscht, was lange vorbei ist", (await client.teamAbsences.Prune("2027-01-01")) >= 1 && (await service.Mine(GUILD, NICO, NOW)).length === 0);
    } finally {
        await client.teams.Remove(team.id);
    }

    check("Mit dem Team gehen seine Abmeldungen", (await client.teamAbsences.OfUser(GUILD, ZEN, "2000-01-01")).length === 0);
}

async function checkImage(): Promise<void> {
    console.log("\n  — Bild —");

    const base = { title: "Abmeldungen", teamName: "Academy", tag: "ACA", logo: null, here: 3, of: 4, away: 1, soon: 1, next: { label: "SA 14.11. · 20:00", here: 2, of: 4 }, footer: "Abgemeldet über /abmelden", stamp: "Stand 13.11. 18:04" };
    const rows = [
        { name: "Kuzai", chip: { text: "Jetzt", tone: "now" as const }, period: "Fr 13.11. – So 15.11.", reason: "Urlaub", note: "Bin ab Montag wieder fit" },
        { name: "Yoshi", chip: { text: "Ab Sa", tone: "soon" as const }, period: "Sa 14.11.", reason: "", note: "" },
    ];
    const webp = (buffer: Buffer) => buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
    const many = Array.from({ length: 14 }, (_, index) => ({ ...rows[0]!, name: `Spieler ${index}` }));

    check("Mit Gründen wird gezeichnet", webp(await RenderAbsenceCard({ ...base, rows, reasons: true })));
    check("Ohne Gründe (Panel) auch", webp(await RenderAbsenceCard({ ...base, title: "Verfügbarkeit", rows, reasons: false })));
    check("Leer, ohne Matchup auch", webp(await RenderAbsenceCard({ ...base, here: 4, away: 0, soon: 0, next: null, rows: [], reasons: true })));
    check("Viele Zeilen: höchstens 10, Rest als „weitere“", webp(await RenderAbsenceCard({ ...base, rows: many, reasons: true })));
}

async function main(): Promise<void> {
    console.log("\n🗓 Abmeldungen\n");

    checkDays();
    checkSettings();
    checkRules();
    await checkImage();

    const client = new BotClient();

    await client.configService.Initialize();

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
        } finally {
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures > 0 ? 1 : 0);
}

void main();
