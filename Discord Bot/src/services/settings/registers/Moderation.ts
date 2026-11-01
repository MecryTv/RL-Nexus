import { ChannelType } from "discord.js";
import { MAX_SUPPORT_REMIND, MAX_SUPPORT_ROLES, PROOF_TIMEOUT_CHOICES } from "../../../constants/Moderation";
import { IModConfig } from "../../../interfaces/services/moderation/IModeration";
import { IPanelModule } from "../SettingsModel";
import { F, LOG, MODERATORS, ModeratorsField, SaveModerators, TEXT, TeamRoles } from "./Shared";

type S = IModConfig & { teamRoles: string[] };

const DAYS: [string, string][] = [
    ["0", "für immer"],
    ["30", "30 Tage"],
    ["60", "60 Tage"],
    ["90", "90 Tage"],
    ["180", "180 Tage"],
    ["365", "365 Tage"],
];

export const ModerationPanel: IPanelModule<S> = {
    id: "moderation",
    module: "moderation",
    name: "Moderation",
    emoji: "🛡️",
    color: "#ff4d5e",
    permanent: false,
    dashOnly: ["Fälle und Verlauf"],
    sections: [
        {
            title: "Log und DM",
            fields: [
                F<S>("channel", "log", "Log-Kanal", "Hierhin meldet der Bot jeden Fall, ein Textkanal oder ein Forum-Beitrag.", (s) => s.logChannelId, (value: string | null) => ({ logChannelId: value }), { channelTypes: LOG }),
                F<S>("toggle", "dm", "DM an den User", "Grund und Dauer gehen per DM raus, ohne den Namen des Moderators.", (s) => s.dm, (value: boolean) => ({ dm: value })),
            ],
        },
        {
            title: "Verwarnungen",
            fields: [
                F<S>("choice", "warnDays", "Verwarnungen zählen", "Ältere Verwarnungen zählen für die Stufen nicht mehr mit.", (s) => String(s.warnDays), (value: string) => ({ warnDays: Number(value) }), { choices: DAYS }),
                F<S>("stages", "stages", "Stufen", "Ab so vielen aktiven Verwarnungen folgt die Strafe von selbst. Eine Zeile je Stufe.", (s) => s.stages, (value: unknown) => ({ stages: value })),
            ],
        },
        {
            title: "Beweis-Pflicht",
            fields: [
                F<S>("toggle", "proofBan", "Bann braucht Beweis", "Ohne Bild, Link oder gesicherte Nachricht lehnt der Bot einen Bann ab.", (s) => s.proof.ban, (value: boolean, s) => ({ proof: { ...s.proof, ban: value } })),
                F<S>("toggle", "proofKick", "Kick braucht Beweis", "Ohne Beweis lehnt der Bot einen Kick ab.", (s) => s.proof.kick, (value: boolean, s) => ({ proof: { ...s.proof, kick: value } })),
                F<S>("choice", "proofTimeout", "Timeout braucht Beweis", "Kurze Timeouts gehen ohne, ab dieser Länge nicht.", (s) => (s.proof.timeoutFrom === null ? "" : String(s.proof.timeoutFrom)), (value: string, s) => ({ proof: { ...s.proof, timeoutFrom: value ? Number(value) : null } }), {
                    choices: PROOF_TIMEOUT_CHOICES.map(([seconds, label]): [string, string] => [seconds === null ? "" : String(seconds), label]),
                }),
                F<S>("toggle", "proofWarn", "Verwarnung braucht Beweis", "Ohne Beweis lehnt der Bot eine Verwarnung ab.", (s) => s.proof.warn, (value: boolean, s) => ({ proof: { ...s.proof, warn: value } })),
            ],
        },
        {
            title: "Support-Warteraum",
            fields: [
                F<S>("channel", "room", "Warteraum", "Ein gewöhnlicher Sprachkanal. Wer ihn betritt, wird im Team-Kanal gemeldet.", (s) => s.support.channelId, (value: string | null, s) => ({ support: { ...s.support, channelId: value } }), { channelTypes: [ChannelType.GuildVoice] }),
                F<S>("channel", "notify", "Meldung in", "Dorthin geht die Karte, wenn jemand wartet.", (s) => s.support.notifyChannelId, (value: string | null, s) => ({ support: { ...s.support, notifyChannelId: value } }), { channelTypes: TEXT }),
                F<S>("roles", "ping", "Ping-Rollen", "Wer gepingt wird, wenn jemand wartet. Ohne Rolle kommt die Karte ohne Ping.", (s) => s.support.roles, (value: string[], s) => ({ support: { ...s.support, roles: value } }), { max: MAX_SUPPORT_ROLES }),
                F<S>("number", "remind", "Erinnern nach", "Nach so vielen Minuten erinnert der Bot einmal. 0 heißt nie.", (s) => s.support.remindAfter, (value: number, s) => ({ support: { ...s.support, remindAfter: value } }), { min: 0, max: MAX_SUPPORT_REMIND, unit: "Min." }),
            ],
        },
        { title: "Team", fields: [ModeratorsField<S>()] },
    ],
    async load(client, guild) {
        return { ...(await client.modSettings.Of(guild.id)), teamRoles: await TeamRoles(client, guild.id) };
    },
    async save(client, guild, patch) {
        if (MODERATORS in patch) await SaveModerators(client, guild, patch[MODERATORS]);
        else await client.moderationService.SaveConfig(guild, patch);

        return null;
    },
};
