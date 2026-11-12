import { ChannelType } from "discord.js";
import { IRouletteSettings, RouletteTeamSize } from "../../../interfaces/services/roulette/IRoulette";
import { RouletteError } from "../../RouletteService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IRouletteSettings;

const VOICE = [ChannelType.GuildVoice];

/** W-0087: Rocket Roulette in /einstellungen. Festes Passwort und feste Team-Kanäle nur im Dashboard. */
export const RocketRoulettePanel: IPanelModule<S> = {
    id: "rocket-roulette",
    module: "rocket-roulette",
    name: "Rocket Roulette",
    emoji: "🎰",
    color: "#ff1e2d",
    permanent: false,
    dashOnly: ["Festes Passwort", "Feste Team-Kanäle"],
    sections: [
        {
            title: "Kanäle",
            fields: [
                F<S>("channel", "info", "Info-Kanal", "Ankündigung und Rundenkarten mit allen Lobbys.", (s) => s.infoChannelId, (value: string | null) => ({ infoChannelId: value }), { channelTypes: TEXT }),
                F<S>("channel", "control", "Moderator-Kanal", "Steuerkarte, Einspring-Anfragen und die Übersicht am Ende.", (s) => s.controlChannelId, (value: string | null) => ({ controlChannelId: value }), { channelTypes: TEXT }),
                F<S>("channel", "waiting", "Warteraum", "Sprachkanal: Hier sammeln sich alle vor dem Start, später die Nachzügler.", (s) => s.waitingRoomId, (value: string | null) => ({ waitingRoomId: value }), { channelTypes: VOICE }),
                F<S>("channel", "main", "Treffpunkt", "Sprachkanal: ab dem Start und zwischen den Runden.", (s) => s.mainVoiceId, (value: string | null) => ({ mainVoiceId: value }), { channelTypes: VOICE }),
                F<S>("channel", "category", "Kategorie", "Hier legt der Bot die Team-Kanäle an.", (s) => s.categoryId, (value: string | null) => ({ categoryId: value }), { channelTypes: [ChannelType.GuildCategory] }),
                F<S>("choice", "channels", "Team-Kanäle", "Automatisch je Team ein Sprachkanal, oder feste Kanäle aus dem Dashboard.", (s) => s.teamChannels, (value: string) => ({ teamChannels: value }), {
                    choices: [
                        ["auto", "automatisch"],
                        ["fixed", "feste Kanäle"],
                    ],
                }),
            ],
        },
        {
            title: "Lobbys",
            fields: [
                F<S>("role", "moderators", "Moderator-Rolle", "Steuert den Abend und macht Lobbys auf.", (s) => s.moderatorRoleId, (value: string | null) => ({ moderatorRoleId: value })),
                F<S>("choice", "size", "Teamgröße", "Geht es nicht auf, kommen 2v2 oder 1v1 dazu.", (s) => String(s.teamSize), (value: string) => ({ teamSize: Number(value) as RouletteTeamSize }), {
                    choices: [
                        ["3", "3v3"],
                        ["2", "2v2"],
                        ["1", "1v1"],
                    ],
                }),
                F<S>("text", "name", "Lobby-Name", "{teams} wird zu den Teamnummern, Team 1 gegen 2 ergibt Lobby12.", (s) => s.lobbyName, (value: string) => ({ lobbyName: value })),
                F<S>("choice", "password", "Passwort", "Für alle Lobbys gleich oder je Lobby gewürfelt.", (s) => s.password.mode, (value: string, s) => ({ password: { ...s.password, mode: value } }), {
                    choices: [
                        ["fixed", "fest"],
                        ["random", "zufällig"],
                    ],
                }),
            ],
        },
    ],
    load(client, guild) {
        return client.rouletteService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            await client.rouletteService.SaveSettings(guild, patch);
        } catch (error) {
            if (error instanceof RouletteError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
