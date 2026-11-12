import { ChannelType, Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRouletteSettings, MAX_FIXED_CHANNELS, MAX_LOBBY_NAME, MAX_PASSWORD, ROULETTE_MODULE } from "../constants/RocketRoulette";
import { IRouletteSettings, RouletteTeamSize } from "../interfaces/services/roulette/IRoulette";

/** Ein Fehler, den der Nutzer lesen soll: die Meldung geht so in Discord oder ins Dashboard. */
export class RouletteError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rocket Roulette (W-0087): Roulette-Abende mit privaten Rocket-League-Lobbys.
 * Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md.
 */
export default class RouletteService {
    constructor(private readonly client: BotClient) {}

    async Settings(guildId: string): Promise<IRouletteSettings> {
        const stored = await this.client.moduleSettings.Of<IRouletteSettings>(guildId, ROULETTE_MODULE, DefaultRouletteSettings());
        const base = DefaultRouletteSettings();

        return {
            ...base,
            ...stored,
            fixedChannelIds: Array.isArray(stored.fixedChannelIds) ? stored.fixedChannelIds : [],
            password: { ...base.password, ...(IsRecord(stored.password) ? stored.password : {}) },
        };
    }

    /** Was aus dem Dashboard oder /einstellungen kommt. Nicht angegeben heißt: wie vorher. */
    Clean(guild: Guild, input: unknown, previous: IRouletteSettings): IRouletteSettings {
        const raw = IsRecord(input) ? input : {};
        const kind = (value: unknown, ...types: ChannelType[]): string | null => {
            const channel = typeof value === "string" ? guild.channels.cache.get(value) : undefined;

            return channel && types.includes(channel.type) ? channel.id : null;
        };
        const pick = <K extends keyof IRouletteSettings>(key: K, clean: (value: unknown) => IRouletteSettings[K]): IRouletteSettings[K] => (raw[key] === undefined ? previous[key] : clean(raw[key]));

        return {
            categoryId: pick("categoryId", (value) => kind(value, ChannelType.GuildCategory)),
            infoChannelId: pick("infoChannelId", (value) => kind(value, ChannelType.GuildText)),
            controlChannelId: pick("controlChannelId", (value) => kind(value, ChannelType.GuildText)),
            waitingRoomId: pick("waitingRoomId", (value) => kind(value, ChannelType.GuildVoice)),
            mainVoiceId: pick("mainVoiceId", (value) => kind(value, ChannelType.GuildVoice)),
            moderatorRoleId: pick("moderatorRoleId", (value) => (typeof value === "string" && value !== guild.id && guild.roles.cache.has(value) ? value : null)),
            teamChannels: pick("teamChannels", (value) => (value === "fixed" ? "fixed" : "auto")),
            fixedChannelIds: pick("fixedChannelIds", (value) =>
                Array.isArray(value) ? [...new Set(value.map((id) => kind(id, ChannelType.GuildVoice)).filter((id): id is string => id !== null))].slice(0, MAX_FIXED_CHANNELS) : []
            ),
            teamSize: pick("teamSize", (value) => (value === 1 || value === 2 || value === 3 ? (value as RouletteTeamSize) : 3)),
            lobbyName: pick("lobbyName", (value) => {
                const name = typeof value === "string" ? value.trim().slice(0, MAX_LOBBY_NAME) : "";

                return name || DefaultRouletteSettings().lobbyName;
            }),
            password: pick("password", (value) => this.CleanPassword(value, previous.password)),
        };
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IRouletteSettings> {
        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, ROULETTE_MODULE, settings);

        return settings;
    }

    private CleanPassword(input: unknown, previous: IRouletteSettings["password"]): IRouletteSettings["password"] {
        const raw = IsRecord(input) ? input : {};
        const mode = raw.mode === "random" || raw.mode === "fixed" ? raw.mode : previous.mode;
        const value = typeof raw.value === "string" ? raw.value.trim().slice(0, MAX_PASSWORD) : previous.value;

        // Fest: wie getippt (das Beispiel des Nutzers ist „testo“). Gewürfelt wird aus PASSWORD_ALPHABET.
        if (mode === "fixed" && !/^[A-Za-z0-9]+$/.test(value)) {
            throw new RouletteError("Das feste Passwort braucht Buchstaben und Ziffern, ohne Leer- oder Sonderzeichen.");
        }

        return { mode, value: value || previous.value };
    }
}
