import { FILTERS, MAX_IGNORE } from "../../../constants/AutoMod";
import { FilterId, IAutoModSettings } from "../../../interfaces/services/automod/IAutoMod";
import { IPanelModule } from "../SettingsModel";
import { F, LOG, TEXT } from "./Shared";

type S = IAutoModSettings;

/** Je Filter ein Satz. Die Namen kommen aus FILTERS, wie im Dashboard. Die Aktion je Filter bleibt dort (Nutzer, 08.11.). */
const HINTS: Record<FilterId, string> = {
    words: "Fängt Wörter von der Liste ab. Die Liste pflegst du im Dashboard.",
    invites: "Fängt Einladungen zu fremden Servern ab.",
    links: "Fängt alle Links ab, außer denen, die im Dashboard erlaubt sind.",
    spam: "Fängt zu viele Nachrichten in kurzer Zeit ab.",
    repeat: "Fängt dieselbe Nachricht mehrfach hintereinander ab.",
    mentions: "Fängt zu viele @ in einer Nachricht ab.",
    caps: "Fängt Geschrei in Großbuchstaben ab.",
    emojis: "Fängt zu viele Emojis in einer Nachricht ab.",
};

export const AutoModPanel: IPanelModule<S> = {
    id: "automod",
    module: "automod",
    name: "Auto Mod",
    emoji: "🤖",
    color: "#5aa9e6",
    permanent: false,
    dashOnly: ["Wortliste und erlaubte Links", "Aktion je Filter", "Grenzen", "Dauer", "Hinweis im Kanal"],
    sections: [
        {
            title: "Filter",
            fields: FILTERS.map((info) =>
                F<S>("toggle", info.id, info.name, HINTS[info.id], (s) => s.filters[info.id]?.on === true, (value: boolean, s) => ({ filters: { ...s.filters, [info.id]: { ...s.filters[info.id], on: value } } }))
            ),
        },
        {
            title: "Log und Ausnahmen",
            fields: [
                F<S>("channel", "log", "Log-Kanal", "Hierhin meldet der Bot jeden Treffer, ein Textkanal oder ein Forum-Beitrag.", (s) => s.logChannelId, (value: string | null) => ({ logChannelId: value }), { channelTypes: LOG }),
                // Dieselben Kanalarten wie die Auswahl im Dashboard: Andere zeigte es dort als „gelöschter Kanal“ (Review 09.11.).
                F<S>("channels", "noChannels", "Kanäle ausnehmen", "In diesen Kanälen greift der Bot nicht ein.", (s) => s.ignoreChannels, (value: string[]) => ({ ignoreChannels: value }), { max: MAX_IGNORE, channelTypes: TEXT }),
                F<S>("roles", "noRoles", "Rollen ausnehmen", "Wer eine davon hat, wird nicht gefiltert.", (s) => s.ignoreRoles, (value: string[]) => ({ ignoreRoles: value }), { max: MAX_IGNORE }),
                F<S>("toggle", "mods", "Moderatoren ausnehmen", "Wer „Nachrichten verwalten“ darf, bleibt außen vor.", (s) => s.ignoreMods, (value: boolean) => ({ ignoreMods: value })),
            ],
        },
    ],
    load(client, guild) {
        return client.autoModService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        const settings = await client.autoModService.Save(guild, patch);
        const cases = FILTERS.some((info) => settings.filters[info.id]?.on && settings.filters[info.id].action !== "none");

        // Derselbe Hinweis wie im Dashboard (GuildAutoMod.ts, notices).
        if (cases && !(await client.settings.Of(guild.id)).modules.includes("moderation")) {
            return "Verwarnen, Timeout, Kick und Bann legen einen Fall in der Moderation an, und die ist auf diesem Server aus. Bis dahin löscht der Bot nur.";
        }

        return null;
    },
};
