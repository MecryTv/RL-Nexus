import { ChannelType } from "discord.js";
import { KIND_LABELS, MAX_EXPIRE, MAX_MANAGERS, MAX_PINGS } from "../../../constants/Lft";
import { ILftSettings, LftKind } from "../../../interfaces/services/lft/ILft";
import { LftError } from "../../LookingForService";
import { IPanelField, IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = ILftSettings;

const KINDS: LftKind[] = ["player", "team"];

/**
 * Spieler- und Team-Suche: an/aus und das Forum. Nur der eine Wert geht mit, wie
 * im Dashboard - CleanSide nimmt für alles Fehlende den alten Stand. Die ganze
 * Seite mitzuschicken prüfte Fragen, Beitrag und Vorschau neu, und ein alter Text
 * ließe dann den Schalter scheitern.
 */
function Side(kind: LftKind): IPanelField<S>[] {
    const name = KIND_LABELS[kind];

    return [
        F<S>("toggle", kind, name, `Die ${name} nimmt Anfragen an.`, (s) => s[kind].on, (value: boolean) => ({ [kind]: { on: value } })),
        F<S>("channel", `${kind}Forum`, kind === "player" ? "Spieler-Forum" : "Team-Forum", `Hier entstehen die Beiträge der ${name}.`, (s) => s[kind].forumId, (value: string | null) => ({ [kind]: { forumId: value } }), { channelTypes: [ChannelType.GuildForum] }),
    ];
}

export const LookingForPanel: IPanelModule<S> = {
    id: "lft",
    module: "lft",
    name: "Looking for",
    emoji: "🔎",
    color: "#5aa9e6",
    permanent: false,
    dashOnly: ["Fragen", "Tags", "Beitrags- und DM-Texte", "Panel"],
    sections: [
        { title: "Suchen", fields: KINDS.flatMap(Side) },
        {
            title: "Meldung ans Team",
            fields: [
                // Wie bei den Suchen nur der eine Wert, sonst prüfte das Speichern den Text der Meldung neu.
                F<S>("channel", "notice", "Kanal", "Hier meldet der Bot jede neue Suche. Ohne Kanal keine Meldung.", (s) => s.notice.channelId, (value: string | null) => ({ notice: { channelId: value } }), { channelTypes: TEXT }),
                F<S>("roles", "pings", "Ping-Rollen", "Diese Rollen werden bei der Meldung gepingt.", (s) => s.notice.roles, (value: string[]) => ({ notice: { roles: value } }), { max: MAX_PINGS }),
            ],
        },
        {
            title: "Regeln",
            fields: [
                // Dieselben Namen wie im Dashboard (GuildLft.ts, ASKS).
                F<S>("choice", "ask", "Fragen", "Wie der Bot die Fragen stellt.", (s) => s.ask, (value: string) => ({ ask: value }), {
                    choices: [
                        ["dm", "Per DM"],
                        ["modal", "Im Fenster"],
                    ],
                }),
                F<S>("number", "expire", "Schließen nach", "Nach so vielen Tagen schließt der Bot eine Suche. 0 heißt nie.", (s) => s.expireDays, (value: number) => ({ expireDays: value }), { min: 0, max: MAX_EXPIRE, unit: "Tage" }),
                F<S>("roles", "managers", "Dürfen beenden", "Diese Rollen dürfen fremde Suchen beenden und Beiträge löschen.", (s) => s.manageRoles, (value: string[]) => ({ manageRoles: value }), { max: MAX_MANAGERS }),
            ],
        },
    ],
    load(client, guild) {
        return client.lookingForService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        // Wie im Dashboard: SaveSettings legt die Tags im Forum an und zieht das Panel nach.
        try {
            const { settings, warning } = await client.lookingForService.SaveSettings(guild, patch);
            const open = KINDS.filter((kind) => settings[kind].on && !settings[kind].forumId).map((kind) => KIND_LABELS[kind]);

            // Derselbe Hinweis wie im Dashboard (Foren).
            return warning ?? (open.length ? `Ohne Forum entsteht kein Beitrag: ${open.join(" und ")} nimmt Anfragen an, hat aber kein Forum.` : null);
        } catch (error) {
            if (error instanceof LftError) throw new PanelError(error.message);

            throw error;
        }
    },
};
