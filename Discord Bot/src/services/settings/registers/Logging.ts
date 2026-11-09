import { LOG_CATEGORIES, MAX_IGNORE } from "../../../constants/Logging";
import { ILogSettings, LogCategoryId } from "../../../interfaces/services/logging/ILogging";
import { IPanelModule } from "../SettingsModel";
import { F, LOG, TEXT } from "./Shared";

type S = ILogSettings;

/** Je Bereich ein Satz. Die Namen kommen aus LOG_CATEGORIES, wie im Dashboard. */
const HINTS: Record<LogCategoryId, string> = {
    messages: "Hierhin gehen gelöschte, bearbeitete und angepinnte Nachrichten und Reaktionen.",
    members: "Hierhin gehen Beitritte, Austritte, neue Namen, Rollen und Boosts.",
    server: "Hierhin gehen Änderungen an Kanälen, Rollen, Emojis, Terminen und Webhooks.",
    voice: "Hierhin geht, wer wo mitredet und wer verschoben wird.",
    moderation: "Hierhin gehen Bann, Kick, Timeout und Auto Mod.",
};

export const LoggingPanel: IPanelModule<S> = {
    id: "logging",
    module: "logging",
    name: "Logging System",
    emoji: "📜",
    color: "#80848e",
    permanent: false,
    dashOnly: ["Einzelne Ereignisse an/aus", "Eigene Ziele je Ereignis"],
    sections: [
        {
            title: "Ziel je Bereich",
            fields: LOG_CATEGORIES.map((category) =>
                F<S>("channel", category.id, category.name, HINTS[category.id], (s) => s.categories[category.id] ?? null, (value: string | null, s) => ({ categories: { ...s.categories, [category.id]: value } }), { channelTypes: LOG })
            ),
        },
        {
            title: "Übergehen",
            fields: [
                // Dieselben Kanalarten wie die Auswahl im Dashboard: Andere zeigte es dort als „gelöschter Kanal“ (Review 09.11.).
                F<S>("channels", "noChannels", "Kanäle übergehen", "Was dort passiert, taucht in keinem Log auf.", (s) => s.ignoreChannels, (value: string[]) => ({ ignoreChannels: value }), { max: MAX_IGNORE, channelTypes: TEXT }),
                F<S>("roles", "noRoles", "Rollen übergehen", "Wer eine davon hat, wird nicht protokolliert.", (s) => s.ignoreRoles, (value: string[]) => ({ ignoreRoles: value }), { max: MAX_IGNORE }),
                F<S>("toggle", "bots", "Bots übergehen", "Bots machen sonst den größten Teil der Einträge aus.", (s) => s.ignoreBots, (value: boolean) => ({ ignoreBots: value })),
            ],
        },
    ],
    load(client, guild) {
        return client.logService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        // Wie die Route: erst die Ziele in den Cache, sonst hielte Clean einen archivierten Beitrag für weg und leerte ihn.
        await client.logService.Warm(guild, patch);
        await client.logService.Save(guild, patch);

        return null;
    },
};
