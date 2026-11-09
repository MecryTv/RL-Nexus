import { IVoiceModuleSettings } from "../../../interfaces/services/voice/IVoice";
import { VoiceError } from "../../VoiceService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IVoiceModuleSettings;

/**
 * „Wohin“ und „Panel-Kanal“ sind im Speichern ein Wert: ein fester Kanal gilt
 * nur mit einem Kanal, und ohne festen Ort verwirft es den Kanal. Darum ein
 * Feld - leer heißt im Chat des eigenen Sprachkanals.
 */
export const TempVoicePanel: IPanelModule<S> = {
    id: "voice-hub",
    module: "voice-hub",
    name: "Temp Voice",
    emoji: "🔊",
    color: "#23a55a",
    permanent: false,
    dashOnly: ["Hubs mit ihren Vorlagen"],
    sections: [
        {
            title: "Steuer-Panel",
            fields: [
                F<S>(
                    "channel",
                    "panel",
                    "Panel fest in",
                    "Das Steuer-Panel steht fest in diesem Kanal, leer heißt im Chat des eigenen Sprachkanals.",
                    (s) => (s.panel === "channel" ? s.panelChannelId : null),
                    (value: string | null) => (value ? { panel: "channel", panelChannelId: value } : { panel: "voice", panelChannelId: null }),
                    { channelTypes: TEXT }
                ),
            ],
        },
    ],
    load(client, guild) {
        return client.voiceService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            const settings = await client.voiceService.SaveSettings(guild, patch);

            // Wie im Dashboard: Speichern schickt das Panel nicht, das macht dort der Knopf „Panel senden“.
            return settings.panel === "channel" && !settings.panelMessageId ? "Das Panel steht dort erst, wenn du es im Dashboard unter Temp Voice mit „Panel senden“ schickst." : null;
        } catch (error) {
            if (error instanceof VoiceError) throw new PanelError(error.message);

            throw error;
        }
    },
};
