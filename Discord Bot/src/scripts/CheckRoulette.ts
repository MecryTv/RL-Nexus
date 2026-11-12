/**
 * Prüft Rocket Roulette ohne Discord: Einstellungen, Auslosung, Tabellen,
 * Bilder, Nachrichten und den Ablauf eines Abends (W-0087).
 *
 *   npm run check:roulette
 *
 * Wie check:sixmans ohne Test-Framework. Was in die Datenbank geht, hängt an
 * einer erfundenen Guild-ID und wird am Ende wieder entfernt.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRouletteSettings, LobbyCode, LobbyLabel } from "../constants/RocketRoulette";
import { RouletteError } from "../services/RouletteService";

const GUILD = "90071992547409971";
const TEXT = "90071992547409972";
const TEXT2 = "90071992547409973";
const NEWS = "90071992547409974";
const VOICE1 = "90071992547409975";
const VOICE2 = "90071992547409976";
const VOICE3 = "90071992547409977";
const CATEGORY = "90071992547409978";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function Throws(run: () => unknown, type: new (...args: never[]) => Error): string | null {
    try {
        run();
    } catch (error) {
        return error instanceof type ? error.message : null;
    }

    return null;
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement || type === ChannelType.GuildVoice, isThread: () => false }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, ChannelType.GuildText)],
                [TEXT2, channel(TEXT2, ChannelType.GuildText)],
                [NEWS, channel(NEWS, ChannelType.GuildAnnouncement)],
                [VOICE1, channel(VOICE1, ChannelType.GuildVoice)],
                [VOICE2, channel(VOICE2, ChannelType.GuildVoice)],
                [VOICE3, channel(VOICE3, ChannelType.GuildVoice)],
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
            ]),
        },
        roles: { cache: new Map([[GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
        iconURL: () => null,
    } as unknown as Guild;
}

function checkSettings(client: BotClient): void {
    console.log("  — Einstellungen —");

    const defaults = DefaultRouletteSettings();
    const service = client.rouletteService;
    const guild = FakeGuild();

    check("Vorgaben", defaults.lobbyName === "Lobby{teams}" && defaults.password.mode === "fixed" && defaults.password.value === "testo" && defaults.teamSize === 3 && defaults.teamChannels === "auto");
    check("Lobby-Name aus Teamnummern", LobbyLabel("Lobby{teams}", [1, 2]) === "Lobby12" && LobbyLabel("Lobby{teams}", [11, 12]) === "Lobby1112" && LobbyLabel("Roulette", [3, 4]) === "Roulette34");
    check("Code ohne verwechselbare Zeichen", /^[abcdefghjkmnpqrstuvwxyz23456789]{200}$/.test(LobbyCode(200)));

    const full = service.Clean(guild, { infoChannelId: TEXT, controlChannelId: TEXT2, waitingRoomId: VOICE1, mainVoiceId: VOICE2, categoryId: CATEGORY }, defaults);

    check("Clean: Kanäle der richtigen Art bleiben", full.infoChannelId === TEXT && full.controlChannelId === TEXT2 && full.waitingRoomId === VOICE1 && full.mainVoiceId === VOICE2 && full.categoryId === CATEGORY);
    check("Clean: Textkanal als Warteraum fällt weg", service.Clean(guild, { waitingRoomId: TEXT }, defaults).waitingRoomId === null);
    check("Clean: Ankündigungskanal als Info-Kanal geht nicht", service.Clean(guild, { infoChannelId: NEWS }, defaults).infoChannelId === null);
    check("Clean: Sprachkanal als Info-Kanal geht nicht", service.Clean(guild, { infoChannelId: VOICE1 }, defaults).infoChannelId === null);
    check("Clean: Teamgröße 4 wird 3", service.Clean(guild, { teamSize: 4 }, defaults).teamSize === 3);
    check("Clean: Teamgröße 2 bleibt", service.Clean(guild, { teamSize: 2 }, defaults).teamSize === 2);
    check("Clean: nichts angegeben, alles wie vorher", JSON.stringify(service.Clean(guild, {}, full)) === JSON.stringify(full));

    const badPassword = Throws(() => service.Clean(guild, { password: { mode: "fixed", value: "te st!" } }, defaults), RouletteError);

    check("Clean: festes Passwort mit Leer- oder Sonderzeichen wird abgelehnt", badPassword !== null && badPassword.includes("Buchstaben und Ziffern"), String(badPassword));
    check("Clean: festes Passwort bleibt wie getippt (außen ohne Leerzeichen)", service.Clean(guild, { password: { mode: "fixed", value: " TeStO1 " } }, defaults).password.value === "TeStO1");
    check("Clean: leeres festes Passwort wird abgelehnt", Throws(() => service.Clean(guild, { password: { mode: "fixed", value: "  " } }, defaults), RouletteError) !== null);
    check("Clean: zufälliges Passwort behält den festen Wert", service.Clean(guild, { password: { mode: "random" } }, defaults).password.mode === "random");

    const fixed = service.Clean(guild, { teamChannels: "fixed", fixedChannelIds: [VOICE1, VOICE3, TEXT, VOICE1] }, defaults);

    check("Clean: feste Kanäle nur Sprachkanäle, ohne Doppelte", fixed.teamChannels === "fixed" && fixed.fixedChannelIds.join() === `${VOICE1},${VOICE3}`, fixed.fixedChannelIds.join());
    check("Clean: höchstens 40 feste Kanäle", service.Clean(guild, { fixedChannelIds: Array.from({ length: 50 }, () => VOICE1) }, defaults).fixedChannelIds.length <= 40);
    check("Clean: Lobby-Name höchstens 20 Zeichen", service.Clean(guild, { lobbyName: "x".repeat(40) }, defaults).lobbyName.length <= 20);
    check("Clean: leerer Lobby-Name wird die Vorgabe", service.Clean(guild, { lobbyName: "  " }, defaults).lobbyName === "Lobby{teams}");
}

async function main(): Promise<void> {
    console.log("\n🎰 Rocket Roulette\n");

    const client = new BotClient();

    checkSettings(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
