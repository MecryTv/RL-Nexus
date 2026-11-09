import { ANNOUNCE_DELETE, MAX_COOLDOWN, MAX_EXCLUDED, MAX_XP_PER_ACTION } from "../../../constants/Levels";
import { ILevelSettings } from "../../../interfaces/services/levels/ILevels";
import logger from "../../../utils/logger";
import { PostBoard } from "../../levels/BoardPost";
import { IPanelModule, PanelError } from "../SettingsModel";
import { CHAT, F, TEXT_OR_CATEGORY } from "./Shared";

type S = ILevelSettings;

/** Das Speichern tauscht „ab“ und „bis“ still, wenn sie verkehrt herum stehen - dann änderte ein Feld das andere. Lieber ein Satz. */
function Range(which: "min" | "max", value: number, s: S): Record<string, unknown> {
    if (which === "min" ? value > s.chat.max : value < s.chat.min) {
        throw new PanelError(which === "min" ? `„Punkte ab“ darf höchstens ${s.chat.max} sein, so viel wie „Punkte bis“.` : `„Punkte bis“ muss mindestens ${s.chat.min} sein, so viel wie „Punkte ab“.`);
    }

    return { chat: { ...s.chat, [which]: value } };
}

/** Die vier Schalter gegen Punkte-Farmen - Bezeichnung und Satz. */
const FAIR: [keyof S["fair"], string, string][] = [
    ["length", "Ab 5 Zeichen", "Kürzere Nachrichten geben keine Punkte."],
    ["repeat", "Keine Wiederholung", "Dieselbe Nachricht hintereinander zählt nur einmal."],
    ["punished", "Nicht bei Strafe", "Wer im Timeout oder in Quarantäne ist, sammelt nichts."],
    ["automod", "Nicht bei Auto Mod", "Nachrichten, die Auto Mod löscht, geben nichts."],
];

export const LevelsPanel: IPanelModule<S> = {
    id: "levels",
    module: "levels",
    name: "Level",
    emoji: "📈",
    color: "#f0b232",
    permanent: true,
    dashOnly: ["Belohnungen", "Bonus", "Boost-Zeiten", "Designs", "Nachrichten"],
    sections: [
        {
            title: "Punkte im Chat",
            fields: [
                F<S>("toggle", "chat", "Chat-Punkte", "Punkte für Nachrichten.", (s) => s.chat.on, (value: boolean, s) => ({ chat: { ...s.chat, on: value } })),
                F<S>("number", "chatMin", "Punkte ab", "Kleinste Zahl, zufällig bis zur größten.", (s) => s.chat.min, (value: number, s) => Range("min", value, s), { min: 0, max: MAX_XP_PER_ACTION }),
                F<S>("number", "chatMax", "Punkte bis", "Größte Zahl.", (s) => s.chat.max, (value: number, s) => Range("max", value, s), { min: 0, max: MAX_XP_PER_ACTION }),
                F<S>("number", "cooldown", "Abklingzeit", "So lange nach einer Nachricht gibt es keine neuen Punkte.", (s) => s.chat.cooldown, (value: number, s) => ({ chat: { ...s.chat, cooldown: value } }), { min: 0, max: MAX_COOLDOWN, unit: "Sek." }),
            ],
        },
        {
            title: "Punkte im Voice",
            fields: [
                F<S>("toggle", "voice", "Voice-Punkte", "Punkte für Zeit im Sprachkanal.", (s) => s.voice.on, (value: boolean, s) => ({ voice: { ...s.voice, on: value } })),
                F<S>("number", "voiceXp", "Punkte je Minute", "So viele Punkte je Minute im Sprachkanal.", (s) => s.voice.xp, (value: number, s) => ({ voice: { ...s.voice, xp: value } }), { min: 0, max: MAX_XP_PER_ACTION }),
                F<S>("toggle", "alone", "Allein zählt", "Auch wer allein im Sprachkanal sitzt, sammelt.", (s) => s.voice.alone, (value: boolean, s) => ({ voice: { ...s.voice, alone: value } })),
                F<S>("toggle", "muted", "Stumm zählt", "Auch wer stumm geschaltet ist, sammelt.", (s) => s.voice.muted, (value: boolean, s) => ({ voice: { ...s.voice, muted: value } })),
            ],
        },
        {
            title: "Aufstieg",
            fields: [
                F<S>("number", "base", "Steigung", "Level n braucht so viele Punkte mal n.", (s) => s.base, (value: number) => ({ base: value }), { min: 10, max: 1000 }),
                F<S>("choice", "announce", "Aufstieg wohin", "Wo die Aufstiegs-Nachricht erscheint.", (s) => s.announce, (value: string) => ({ announce: value }), {
                    choices: [
                        ["current", "Im selben Kanal"],
                        ["channel", "In einem festen Kanal"],
                        ["off", "Aus"],
                    ],
                }),
                F<S>("channel", "announceChannel", "Aufstiegs-Kanal", "Der feste Kanal, und für Voice auch beim selben Kanal.", (s) => s.announceChannelId, (value: string | null) => ({ announceChannelId: value }), { channelTypes: CHAT }),
                F<S>("choice", "announceDelete", "Löschen nach", "Die Nachricht im Chat verschwindet wieder.", (s) => String(s.announceDelete ?? 0), (value: string) => ({ announceDelete: Number(value) }), {
                    choices: ANNOUNCE_DELETE.map((minutes): [string, string] => [String(minutes), minutes ? `${minutes} Min.` : "nie"]),
                }),
                F<S>("toggle", "stack", "Rollen stapeln", "An: alte Belohnungsrollen bleiben. Aus: die neue ersetzt sie.", (s) => s.stack, (value: boolean) => ({ stack: value })),
                F<S>("toggle", "public", "Rangliste öffentlich", "Die Rangliste ist ohne Anmeldung zu sehen.", (s) => s.public, (value: boolean) => ({ public: value })),
            ],
        },
        {
            title: "Schutz gegen Farmen",
            fields: FAIR.map(([key, label, hint]) =>
                F<S>("toggle", `fair-${key}`, label, hint, (s) => s.fair[key], (value: boolean, s) => ({ fair: { ...s.fair, [key]: value } }))
            ),
        },
        {
            title: "Ausnahmen und Kanäle",
            fields: [
                F<S>("channels", "noChannels", "Keine Punkte in", "In diesen Kanälen gibt es keine Punkte.", (s) => s.noChannels, (value: string[]) => ({ noChannels: value }), { max: MAX_EXCLUDED, channelTypes: TEXT_OR_CATEGORY }),
                F<S>("roles", "noRoles", "Keine Punkte für", "Diese Rollen sammeln nichts.", (s) => s.noRoles, (value: string[]) => ({ noRoles: value }), { max: MAX_EXCLUDED }),
                F<S>("channel", "boost", "Boost-Kanal", "Hier kündigt der Bot doppelte Punkte an.", (s) => s.boostChannelId, (value: string | null) => ({ boostChannelId: value }), { channelTypes: CHAT }),
                F<S>("channel", "board", "Rangliste im Kanal", "Die Rangliste steht fest in diesem Kanal und zieht sich nach. Leer: aus.", (s) => (s.boardPost.on ? s.boardPost.channelId : null), (value: string | null, s) => ({ boardPost: { ...s.boardPost, on: value !== null, channelId: value } }), { channelTypes: CHAT }),
            ],
        },
    ],
    load(client, guild) {
        return client.levelService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        const before = (await client.levelService.Settings(guild.id)).boardPost;
        const settings = await client.levelService.Save(guild, patch);

        // Wie im Dashboard: Rangliste an, aus oder in einem anderen Kanal ist gleich sichtbar, nicht erst nach 10 Minuten.
        if (JSON.stringify(before) !== JSON.stringify(settings.boardPost)) {
            await PostBoard(client, guild, settings, true).catch((error: unknown) => logger.warn(`📈 Rangliste im Kanal auf ${guild.id} nach /einstellungen nicht gezeichnet - ${String(error)}`));
        }

        return null;
    },
};
