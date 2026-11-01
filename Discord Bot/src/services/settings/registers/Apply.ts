import { ChannelType } from "discord.js";
import { IApplySettings } from "../../../interfaces/services/apply/IApply";
import { IPanelModule } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IApplySettings;

export const ApplyPanel: IPanelModule<S> = {
    id: "apply",
    module: "apply",
    name: "Apply",
    emoji: "📝",
    color: "#00afff",
    permanent: false,
    dashOnly: ["Formulare und Fragen", "Panel-Text"],
    sections: [
        {
            title: "Bewerben",
            fields: [
                F<S>("toggle", "open", "Bewerbungen offen", "Aus: niemand kann sich bewerben, auf keinem Weg.", (s) => s.open, (value: boolean) => ({ open: value })),
                F<S>("choice", "mode", "Weg", "Wo man das Formular ausfüllt.", (s) => s.mode, (value: string) => ({ mode: value }), {
                    choices: [
                        ["web", "Webseite"],
                        ["modal", "Fenster in Discord"],
                        ["dm", "DM mit dem Bot"],
                    ],
                }),
                F<S>("roles", "reviewers", "Prüfer-Rollen", "Wer Bewerbungen sehen und entscheiden darf.", (s) => s.reviewRoles, (value: string[]) => ({ reviewRoles: value }), { max: 25 }),
            ],
        },
        {
            title: "Wohin die Bewerbung geht",
            fields: [
                F<S>("channel", "channel", "Kanal für die Karten", "Gilt für Formulare ohne eigenen Kanal.", (s) => s.channelId, (value: string | null) => ({ channelId: value }), { channelTypes: TEXT }),
                F<S>("choice", "target", "Wohin", "Alle Karten in einen Kanal oder je Bewerbung ein eigener Kanal.", (s) => s.target, (value: string) => ({ target: value }), {
                    choices: [
                        ["shared", "Sammelkanal"],
                        ["channel", "Eigener Kanal je Bewerbung"],
                    ],
                }),
                F<S>("channel", "category", "Kategorie", "Hier entstehen die eigenen Kanäle.", (s) => s.categoryId, (value: string | null) => ({ categoryId: value }), { channelTypes: [ChannelType.GuildCategory] }),
                F<S>("text", "channelName", "Kanalname", "Name des eigenen Kanals, mit {user}, {nummer} und {formular}.", (s) => s.channelName, (value: string) => ({ channelName: value }), { max: 90 }),
                F<S>("choice", "after", "Nach der Entscheidung", "Was mit dem eigenen Kanal passiert.", (s) => s.afterDecision, (value: string) => ({ afterDecision: value }), {
                    choices: [
                        ["delete", "Kanal löschen"],
                        ["close", "Kanal schließen"],
                        ["keep", "Kanal behalten"],
                    ],
                }),
            ],
        },
    ],
    load(client, guild) {
        return client.applyService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        return (await client.applyService.SaveSettings(guild, patch)).warning;
    },
};
