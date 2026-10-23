/**
 * Prüft das Logging System ohne Discord: den Katalog der Ereignisse, die
 * Prüfung der Einstellungen, wohin ein Ereignis geht und was der Bot übergeht.
 *
 *   npm run check:logging
 *
 * Was wirklich im Kanal steht, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultLogSettings, LOG_CATEGORIES, LOG_EVENTS, MAX_IGNORE } from "../constants/Logging";
import { ILogSettings } from "../interfaces/services/logging/ILogging";

const GUILD = "90071992547409931";
const TEXT = "90071992547409932";
const VOICE = "90071992547409933";
const CATEGORY = "90071992547409934";
const ROLE = "90071992547409935";
const OTHER = "90071992547409936";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType, parentId: string | null = null) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, parentId, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, ChannelType.GuildText, CATEGORY)],
                [VOICE, channel(VOICE, ChannelType.GuildVoice)],
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
            ]),
        },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Team" } as Role], [GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
    } as unknown as Guild;
}

function FakeMember(roles: string[], bot = false): GuildMember {
    return { id: "1", user: { id: "1", bot, username: "lara" }, roles: { cache: new Map(roles.map((id) => [id, { id }])) } } as unknown as GuildMember;
}

/* ----------------------------------------------------------
   Der Katalog
   ---------------------------------------------------------- */
function checkCatalog(): void {
    console.log("\n  — Der Katalog —");

    const keys = LOG_EVENTS.map((event) => event.key);
    const categories = new Set(LOG_CATEGORIES.map((category) => category.id));
    const base = DefaultLogSettings();

    check("Jeder Schlüssel kommt nur einmal vor", new Set(keys).size === keys.length);
    check("Jedes Ereignis gehört zu einer Kategorie", LOG_EVENTS.every((event) => categories.has(event.category)));
    check("Jede Kategorie hat mindestens ein Ereignis", LOG_CATEGORIES.every((category) => LOG_EVENTS.some((event) => event.category === category.id)));
    check("Die Vorgabe kennt jedes Ereignis", keys.every((key) => key in base.events));
    check("Die Vorgabe hat kein Ziel", Object.values(base.categories).every((value) => value === null));
    check("Und übergeht Bots", base.ignoreBots === true);
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): ILogSettings {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.logService;
    const clean = service.Clean(
        guild,
        {
            categories: { messages: TEXT, members: VOICE, server: "999", voice: null, moderation: TEXT },
            events: {
                messageDelete: { on: true, channelId: TEXT },
                messageEdit: { on: false, channelId: null },
                unbekannt: { on: true, channelId: TEXT },
            },
            ignoreChannels: [TEXT, "999", TEXT, CATEGORY],
            ignoreRoles: [ROLE, GUILD, "999"],
            ignoreBots: false,
        },
        DefaultLogSettings()
    );

    check("Ein Textkanal wird übernommen", clean.categories.messages === TEXT);
    check("Ein Sprachkanal fällt weg", clean.categories.members === null);
    check("Ein unbekannter Kanal auch", clean.categories.server === null);
    check("Ein Ereignis darf einen eigenen Kanal haben", clean.events.messageDelete.channelId === TEXT);
    check("Ausgeschaltet bleibt ausgeschaltet", clean.events.messageEdit.on === false);
    check("Unbekannte Ereignisse kommen nicht dazu", !("unbekannt" in clean.events));
    check("Doppelte und unbekannte Kanäle fallen weg", clean.ignoreChannels.join(",") === `${TEXT},${CATEGORY}`, clean.ignoreChannels.join(","));
    check("@everyone ist keine Ausnahme-Rolle", !clean.ignoreRoles.includes(GUILD));
    check("Bots lassen sich mitprotokollieren", clean.ignoreBots === false);

    const many = service.Clean(guild, { ignoreChannels: Array.from({ length: 40 }, () => TEXT) }, DefaultLogSettings());

    check("Die Liste ist gedeckelt", many.ignoreChannels.length <= MAX_IGNORE);

    return clean;
}

/* ----------------------------------------------------------
   Wohin und was nicht
   ---------------------------------------------------------- */
function checkRouting(client: BotClient, settings: ILogSettings): void {
    console.log("\n  — Wohin ein Ereignis geht —");

    const service = client.logService;

    check("Der eigene Kanal gewinnt", service.Target(settings, "messageDelete") === TEXT);
    check("Sonst zählt die Kategorie", service.Target(settings, "messageBulk") === TEXT);
    check("Ausgeschaltet geht nirgendwohin", service.Target(settings, "messageEdit") === null);
    check("Ohne Ziel passiert nichts", service.Target(settings, "voiceJoin") === null);

    console.log("\n  — Was der Bot übergeht —");

    check("Ein Kanal auf der Liste", service.Skip(settings, { channel: { id: TEXT } }));
    check("Auch über seine Kategorie", service.Skip(settings, { channel: { id: OTHER, parentId: CATEGORY } }));
    check("Ein anderer Kanal nicht", !service.Skip(settings, { channel: { id: OTHER } }));
    check("Wer die Rolle hat", service.Skip(settings, { member: FakeMember([ROLE]) }));
    check("Wer sie nicht hat, nicht", !service.Skip(settings, { member: FakeMember([]) }));
    check("Bots nur, wenn eingestellt", !service.Skip(settings, { user: { id: "2", bot: true } }));
    check("Mit der Vorgabe schon", client.logService.Skip(DefaultLogSettings(), { user: { id: "2", bot: true } }));
}

async function main(): Promise<void> {
    console.log("\n📜 Logging System\n");

    const client = new BotClient();

    checkCatalog();

    const settings = checkClean(client);

    checkRouting(client, settings);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
