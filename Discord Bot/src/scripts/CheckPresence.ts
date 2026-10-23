/**
 * Prüft den Status des Bots ohne Discord: die fünf Ansagen, ihre Platzhalter
 * und den Wechsel.
 *
 *   npm run check:presence
 *
 * Ob Discord den Status wirklich anzeigt, sieht nur ein echter Login.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ActivityType, Collection, Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { PRESENCES, PRESENCE_INTERVAL } from "../constants/Presence";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

interface ISet {
    activities: { name: string; type: ActivityType }[];
}

/** Ein Client, der so tut, als wäre er angemeldet - mit zwei Servern. */
function Fake(client: BotClient): { sent: ISet[] } {
    const sent: ISet[] = [];
    const guilds = new Collection<string, Guild>([
        ["1", { id: "1", memberCount: 148 } as Guild],
        ["2", { id: "2", memberCount: 12_402 } as Guild],
    ]);

    Object.defineProperty(client, "guilds", { value: { cache: guilds }, configurable: true });
    Object.defineProperty(client, "user", { value: { setPresence: (data: ISet) => sent.push(data) }, configurable: true });
    Object.defineProperty(client, "isReady", { value: () => true, configurable: true });

    return { sent };
}

function main(): void {
    console.log("\n💬 Status des Bots\n");

    const client = new BotClient();
    const service = client.presenceService;
    const { sent } = Fake(client);

    console.log("  — Die Ansagen —");

    check("Es sind fünf", PRESENCES.length === 5, String(PRESENCES.length));
    check("Jede hat einen Text", PRESENCES.every((entry) => entry.text.trim().length > 0));
    check("Keine ist zu lang für Discord", PRESENCES.every((entry) => entry.text.length <= 128));
    check("Sie wiederholen sich nicht", new Set(PRESENCES.map((entry) => entry.text)).size === PRESENCES.length);

    const types = new Set(PRESENCES.map((entry) => entry.type));

    check("Es sind mehrere Arten dabei", types.size >= 3, `${types.size} Art(en)`);
    check(
        "Und alle kennt Discord",
        PRESENCES.every((entry) => [ActivityType.Playing, ActivityType.Watching, ActivityType.Listening, ActivityType.Competing].includes(entry.type))
    );
    check("Gewechselt wird alle 15 Sekunden", PRESENCE_INTERVAL === 15_000, String(PRESENCE_INTERVAL));

    console.log("\n  — Die Platzhalter —");

    check("Die Server werden gezählt", service.Fill("{server}") === "2", service.Fill("{server}"));
    // 148 + 12.402 = 12.550: ueber zehntausend rundet der Status auf ganze Tausender.
    check("Die Mitglieder werden gekürzt", service.Fill("{mitglieder}") === "13k", service.Fill("{mitglieder}"));
    check("Kleine Zahlen bleiben Zahlen", service.Fill("{befehle}") === String(client.commands.size));
    check("Die Adresse kommt ohne https", !service.Fill("{dashboard}").includes("http"), service.Fill("{dashboard}"));
    check("Unbekanntes bleibt stehen", service.Fill("{gibtsnicht}") === "{gibtsnicht}");
    check("Jede Ansage ergibt am Ende Text", service.Preview().every((entry) => entry.text.trim().length > 0));
    check("Und keine bleibt mit einem Platzhalter stehen", !service.Preview().some((entry) => /\{[a-zäöü.]+\}/.test(entry.text)), JSON.stringify(service.Preview()));

    console.log("\n  — Der Wechsel —");

    service.Start();

    check("Die erste steht sofort", sent.length === 1, String(sent.length));
    check("Und ist die erste aus der Liste", sent[0]?.activities[0]?.type === PRESENCES[0].type);

    for (let index = 0; index < PRESENCES.length; index++) service.Next();

    check("Nach fünf Schritten ist die erste wieder dran", sent[sent.length - 1]?.activities[0]?.type === PRESENCES[0].type);
    check("Jede war einmal an der Reihe", new Set(sent.slice(0, PRESENCES.length).map((entry) => entry.activities[0].name)).size === PRESENCES.length);

    service.Stop();

    const before = sent.length;

    service.Stop();

    check("Zweimal anhalten schadet nicht", sent.length === before);

    service.Start();

    check("Neu starten fängt wieder vorne an", sent[sent.length - 1]?.activities[0]?.type === PRESENCES[0].type);

    service.Stop();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

main();
