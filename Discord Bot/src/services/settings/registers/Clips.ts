import { MAX_PER_USER, NOTICE_LABELS } from "../../../constants/Clips";
import { ClipNotice, IClipSettings } from "../../../interfaces/services/clips/IClips";
import { ClipError } from "../../ClipService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IClipSettings;

/** Die drei Ansagen an oder aus - Namen wie im Dashboard (NOTICE_LABELS). */
const NOTICES: [ClipNotice, string][] = [
    ["open", "Geht raus, sobald der Kanal aufgeht."],
    ["voting", "Kommt, wenn das Einreichen vorbei ist und abgestimmt wird."],
    ["winners", "Kommt nach dem Ende der Abstimmung und pingt die Gewinner."],
];

export const ClipsPanel: IPanelModule<S> = {
    id: "clips",
    module: "clips",
    name: "Clips der Woche",
    emoji: "🎬",
    color: "#a46cf0",
    permanent: false,
    dashOnly: ["Termine", "Preise", "Ansage-Texte", "Strafen", "Sperrliste"],
    sections: [
        {
            title: "Kanäle",
            fields: [
                F<S>("channel", "channel", "Clip-Kanal", "Nur hier wird hochgeladen und abgestimmt, der Bot öffnet, schließt und leert ihn selbst.", (s) => s.channelId, (value: string | null) => ({ channelId: value }), { channelTypes: TEXT }),
                F<S>("channel", "announce", "Ansage-Kanal", "Hierhin gehen die Ansagen, leer heißt in den Clip-Kanal.", (s) => s.announceChannelId, (value: string | null) => ({ announceChannelId: value }), { channelTypes: TEXT }),
            ],
        },
        {
            title: "Abstimmung",
            fields: [
                F<S>("number", "perUser", "Clips je Person", "So viele Clips darf jede Person je Runde einreichen.", (s) => s.maxPerUser, (value: number) => ({ maxPerUser: value }), { min: 1, max: MAX_PER_USER }),
                // Ein Server-Emoji als <a:name:id> hat höchstens 57 Zeichen (CleanEmoji).
                F<S>("text", "emoji", "Abstimm-Emoji", "Steht unter jedem Clip zum Abstimmen. Ein normales Emoji oder eins von diesem Server im Format <:name:id>.", (s) => s.emoji, (value: string) => ({ emoji: value }), { max: 57 }),
            ],
        },
        {
            title: "Runden",
            fields: [
                F<S>("toggle", "auto", "Termine automatisch", "An: Der Bot öffnet und schließt die Runden zu den Terminen aus dem Dashboard.", (s) => s.auto, (value: boolean) => ({ auto: value })),
                F<S>("toggle", "public", "Clip-Seite öffentlich", "Alle Runden mit Clips und Gewinnern sind ohne Anmeldung zu sehen.", (s) => s.publicBoard, (value: boolean) => ({ publicBoard: value })),
            ],
        },
        {
            title: "Ansagen",
            fields: NOTICES.map(([notice, hint]) =>
                F<S>("toggle", `notify-${notice}`, NOTICE_LABELS[notice], hint, (s) => s.notify[notice], (value: boolean, s) => ({ notify: { ...s.notify, [notice]: value } }))
            ),
        },
    ],
    load(client, guild) {
        return client.clipService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            const settings = await client.clipService.SaveSettings(guild, patch);
            const missing = client.clipService.Missing(guild, settings);

            // Wie der Hinweis im Dashboard: ohne diese Rechte läuft keine Runde.
            return missing.length ? `Dem Bot fehlen im Clip-Kanal diese Rechte: ${missing.join(", ")}.` : null;
        } catch (error) {
            if (error instanceof ClipError) throw new PanelError(error.message);

            throw error;
        }
    },
};
