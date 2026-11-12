import { ChannelType } from "discord.js";
import { MAX_IDLE, MAX_K, MAX_START, MIN_K, MIN_START, MODES, MODE_HINTS, MODE_LABELS } from "../../../constants/SixMans";
import { IMansSettings } from "../../../interfaces/services/sixmans/ISixMans";
import { SixMansError } from "../../SixMansService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IMansSettings;

export const SixMansPanel: IPanelModule<S> = {
    id: "rl-6mans",
    module: "rl-6mans",
    name: "2, 4 & 6 Mans",
    emoji: "🏆",
    color: "#f0b232",
    permanent: false,
    dashOnly: ["Stufen", "Texte für Panel, Runde, Ergebnis und DM"],
    sections: [
        {
            title: "Warteschlangen",
            fields: [
                ...MODES.map((mode) =>
                    F<S>("toggle", `mode${mode}`, MODE_LABELS[mode], `${MODE_LABELS[mode]} (${MODE_HINTS[mode]}) steht als Warteschlange im 6-Mans-Kanal. Aus leert sie.`, (s) => s.modes[mode], (value: boolean, s) => ({ modes: { ...s.modes, [mode]: value } }))
                ),
                F<S>("number", "idle", "Rauswurf nach", "So lange ohne Runde, dann fliegt man aus der Warteschlange. 0 heißt nie.", (s) => s.idleMinutes, (value: number) => ({ idleMinutes: value }), { min: 0, max: MAX_IDLE, unit: "Min." }),
            ],
        },
        {
            title: "Runden",
            fields: [
                F<S>("channel", "channel", "Kanal", "Hier stehen das Panel und die Runden.", (s) => s.channelId, (value: string | null) => ({ channelId: value }), { channelTypes: TEXT }),
                F<S>("channel", "category", "Kategorie", "Hier entstehen die Sprachkanäle für Blau und Orange.", (s) => s.categoryId, (value: string | null) => ({ categoryId: value }), { channelTypes: [ChannelType.GuildCategory] }),
                F<S>("toggle", "voice", "Sprachkanäle", "Zwei Sprachkanäle je Runde, wer schon im Voice sitzt, wird hinübergezogen.", (s) => s.voice, (value: boolean) => ({ voice: value })),
                F<S>("toggle", "dm", "DM beim Start", "Jeder Teilnehmer bekommt Lobby und Passwort per DM.", (s) => s.dm, (value: boolean) => ({ dm: value })),
                F<S>("toggle", "confirm", "Ergebnis bestätigen", "An: Das andere Team muss dasselbe melden. Aus: Ein Klick genügt.", (s) => s.confirm, (value: boolean) => ({ confirm: value })),
            ],
        },
        {
            title: "Wertung",
            fields: [
                F<S>("number", "start", "Start-MMR", "Damit fängt jeder in jedem Modus an.", (s) => s.start, (value: number) => ({ start: value }), { min: MIN_START, max: MAX_START }),
                F<S>("number", "k", "Höchste Änderung", "So viel MMR bewegt eine Runde höchstens.", (s) => s.k, (value: number) => ({ k: value }), { min: MIN_K, max: MAX_K }),
                F<S>("toggle", "board", "Rangliste öffentlich", "Die Rangliste ist ohne Anmeldung zu sehen.", (s) => s.board.open, (value: boolean, s) => ({ board: { ...s.board, open: value } })),
            ],
        },
    ],
    load(client, guild) {
        return client.sixMansService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        // Wie im Dashboard: SaveSettings leert abgeschaltete Warteschlangen und zieht das Panel im Kanal nach.
        try {
            await client.sixMansService.SaveSettings(guild, patch);
        } catch (error) {
            if (error instanceof SixMansError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
