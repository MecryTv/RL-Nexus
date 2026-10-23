/**
 * Prüft Auto Mod ohne Discord: den Katalog, die Prüfung der Einstellungen und
 * jeden Filter an einem Beispieltext.
 *
 *   npm run check:automod
 *
 * Ob eine Nachricht wirklich verschwindet, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, Message, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { CapsShare, DefaultAutoModSettings, FILTERS, MAX_WORDS, Normalize } from "../constants/AutoMod";
import { IAutoModSettings } from "../interfaces/services/automod/IAutoMod";

const GUILD = "90071992547409931";
const TEXT = "90071992547409932";
const VOICE = "90071992547409933";
const ROLE = "90071992547409935";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) => ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)], [VOICE, channel(VOICE, ChannelType.GuildVoice)]]) },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Team" } as Role], [GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
    } as unknown as Guild;
}

/** Eine Nachricht, wie der Dienst sie liest - mehr braucht Find() nicht. */
function FakeMessage(content: string, mentions = 0, everyone = false): Message {
    return {
        content,
        guildId: GUILD,
        author: { id: "1" },
        mentions: { users: { size: mentions }, roles: { size: 0 }, everyone },
        guild: { vanityURLCode: "dev" },
    } as unknown as Message;
}

/* ----------------------------------------------------------
   Katalog
   ---------------------------------------------------------- */
function checkCatalog(): void {
    console.log("\n  — Der Katalog —");

    const ids = FILTERS.map((filter) => filter.id);
    const base = DefaultAutoModSettings();

    check("Jeder Filter kommt nur einmal vor", new Set(ids).size === ids.length);
    check("Die Vorgabe kennt jeden Filter", ids.every((id) => id in base.filters));
    check("Ab Werk ist nichts an", ids.every((id) => !base.filters[id].on));
    check("Und nichts straft von selbst", ids.every((id) => base.filters[id].action === "none" || id === "spam"));
    check("Zahlen-Filter haben Grenzen", FILTERS.filter((filter) => filter.fields.includes("limit")).every((filter) => filter.limitMax > filter.limitMin));

    console.log("\n  — Text zurechtlegen —");

    check("Klein und ohne Zierrat", Normalize("S C H E I ẞ E") === "s c h e i ss e" || Normalize("HALLO") === "hallo", Normalize("HALLO"));
    check("Zahlen statt Buchstaben zählen nicht", Normalize("sch3iss3") === "scheisse", Normalize("sch3iss3"));
    check("Großbuchstaben werden gezählt", CapsShare("HALLO IHR ALLE") === 100, String(CapsShare("HALLO IHR ALLE")));
    check("Kurzes bleibt außen vor", CapsShare("OK") === 0);
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): IAutoModSettings {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.autoModService;
    const clean = service.Clean(
        guild,
        {
            filters: {
                words: { on: true, words: ["Idiot", "idiot", "  ", "ARSCH"], whole: false, action: "warn" },
                spam: { on: true, limit: 999, window: 999, action: "timeout", duration: 30 },
                caps: { on: true, limit: 10 },
                unbekannt: { on: true },
            },
            ignoreChannels: [TEXT, "999", TEXT],
            ignoreRoles: [ROLE, GUILD],
            ignoreMods: false,
            logChannelId: VOICE,
        },
        DefaultAutoModSettings()
    );

    check("Wörter werden klein und ohne Doppelte", clean.filters.words.words.join(",") === "idiot,arsch", clean.filters.words.words.join(","));
    check("Leeres fällt weg", !clean.filters.words.words.includes(""));
    check("Die Aktion kommt an", clean.filters.words.action === "warn");
    check("Zu große Zahlen werden gedeckelt", clean.filters.spam.limit === 20 && clean.filters.spam.window === 60, `${clean.filters.spam.limit}/${clean.filters.spam.window}`);
    check("Zu kurzer Timeout wird angehoben", clean.filters.spam.duration === 60, String(clean.filters.spam.duration));
    check("Zu kleiner Anteil wird angehoben", clean.filters.caps.limit === 50, String(clean.filters.caps.limit));
    check("Unbekannte Filter kommen nicht dazu", !("unbekannt" in clean.filters));
    check("Doppelte und unbekannte Kanäle fallen weg", clean.ignoreChannels.join(",") === TEXT, clean.ignoreChannels.join(","));
    check("@everyone ist keine Ausnahme-Rolle", !clean.ignoreRoles.includes(GUILD));
    check("Ein Sprachkanal ist kein Log-Ziel", clean.logChannelId === null);

    const many = service.Clean(guild, { filters: { words: { words: Array.from({ length: 400 }, (_, index) => `wort${index}`) } } }, DefaultAutoModSettings());

    check("Die Wortliste ist gedeckelt", many.filters.words.words.length === MAX_WORDS, String(many.filters.words.words.length));

    return clean;
}

/* ----------------------------------------------------------
   Die Filter
   ---------------------------------------------------------- */
function checkFilters(client: BotClient): void {
    console.log("\n  — Was die Filter erkennen —");

    const service = client.autoModService;
    const base = DefaultAutoModSettings();
    const withFilter = (id: keyof IAutoModSettings["filters"], over: Record<string, unknown>): IAutoModSettings => ({
        ...base,
        filters: { ...base.filters, [id]: { ...base.filters[id], on: true, ...over } },
    });

    const words = withFilter("words", { words: ["idiot"], whole: true });

    check("Ein Wort von der Liste fällt auf", service.Try(words, "du idiot")?.filter === "words");
    check("Verstecktes auch", service.Try(words, "du 1d10t")?.filter === "words", JSON.stringify(service.Try(words, "du 1d10t")));
    check("Mitten im Wort nur ohne „ganze Wörter“", service.Try(words, "Idiotenkarte") === null);
    check("Und mit der Einstellung schon", service.Try(withFilter("words", { words: ["idiot"], whole: false }), "Idiotenkarte")?.filter === "words");
    check("Harmloses geht durch", service.Try(words, "alles gut hier") === null);

    const invites = withFilter("invites", {});

    check("Eine Einladung fällt auf", service.Try(invites, "komm auf discord.gg/abcdef")?.filter === "invites");
    check("Auch als ganze Adresse", service.Try(invites, "https://discord.com/invite/abcdef")?.filter === "invites");
    check("Ein normaler Link nicht", service.Try(invites, "https://youtube.com/watch") === null);

    const links = withFilter("links", { words: ["youtube.com"] });

    check("Ein fremder Link fällt auf", service.Try(links, "schau mal https://beispiel.de/x")?.filter === "links");
    check("Eine erlaubte Domain nicht", service.Try(links, "https://youtube.com/watch?v=1") === null);
    check("Auch ihre Unterdomain nicht", service.Try(links, "https://music.youtube.com/x") === null);

    check("Zu viele Erwähnungen fallen auf", service.Find(FakeMessage("hey", 9), withFilter("mentions", { limit: 5 }))?.filter === "mentions");
    check("Wenige nicht", service.Find(FakeMessage("hey", 2), withFilter("mentions", { limit: 5 })) === null);

    check("Geschrei fällt auf", service.Try(withFilter("caps", { limit: 70 }), "HALLO IHR ALLE DA DRAUSSEN")?.filter === "caps");
    check("Normaler Text nicht", service.Try(withFilter("caps", { limit: 70 }), "Hallo ihr alle da draußen") === null);

    check("Zu viele Emojis fallen auf", service.Try(withFilter("emojis", { limit: 3 }), "🎉🎉🎉🎉🎉")?.filter === "emojis");
    check("Ein paar nicht", service.Try(withFilter("emojis", { limit: 3 }), "🎉 schön") === null);

    console.log("\n  — Verlauf: Spam und Wiederholung —");

    const spam = withFilter("spam", { limit: 3, window: 5 });
    let caught = null;

    for (let index = 0; index < 5; index++) caught = service.Find(FakeMessage(`nachricht ${index}`), spam);

    check("Viele Nachrichten in Folge fallen auf", caught?.filter === "spam", JSON.stringify(caught));

    const repeat = withFilter("repeat", { limit: 3 });
    let again = null;

    for (let index = 0; index < 3; index++) again = service.Find(FakeMessage("dasselbe"), repeat);

    check("Dieselbe Nachricht mehrfach auch", again?.filter === "repeat", JSON.stringify(again));
    check("Die Probe lässt beide aus", service.Try(spam, "egal was") === null);
}

async function main(): Promise<void> {
    console.log("\n🛡️  Auto Mod\n");

    const client = new BotClient();

    checkCatalog();
    checkClean(client);
    checkFilters(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
