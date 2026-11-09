import { ChannelType } from "discord.js";
import { IBackupSettings } from "../../../constants/ServerBackup";
import { IPanelModule } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IBackupSettings;

export const BackupsPanel: IPanelModule<S> = {
    id: "backups",
    module: "backups",
    name: "Backups",
    emoji: "💾",
    color: "#80848e",
    permanent: true,
    dashOnly: ["Backups anlegen und zurückspielen"],
    sections: [
        {
            title: "Meldungen",
            fields: [
                // So viele Kanalarten, wie das Speichern annimmt (IsLogTarget).
                F<S>("channel", "log", "Meldekanal", "Hier meldet der Bot, wenn ein Backup geladen wird, halb klappt oder Anti Villain vorher gesichert hat.", (s) => s.logChannelId, (value: string | null) => ({ logChannelId: value }), {
                    channelTypes: [...TEXT, ChannelType.PublicThread, ChannelType.AnnouncementThread],
                }),
            ],
        },
    ],
    load(client, guild) {
        return client.serverBackupService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        await client.serverBackupService.SaveSettings(guild, patch);

        return null;
    },
};
