import { ChannelType } from "discord.js";
import { CONTACTS, CONTACT_LABELS, DELETE_AFTER_HOURS, DELETE_NOW, MAX_LIMIT, PANEL_STYLES, STYLE_LABELS, SURFACES, SURFACE_LABELS } from "../../../constants/Tickets";
import { ITicketConfig } from "../../../interfaces/services/tickets/ITicket";
import { IPanelModule } from "../SettingsModel";
import { F, LOG, MODERATORS, ModeratorsField, PANEL, SaveModerators, TEXT, TeamRoles } from "./Shared";

type S = ITicketConfig & { teamRoles: string[] };

const DELETE_LABEL = (hours: number): string =>
    hours === 0 ? "nie" : hours === DELETE_NOW ? "sofort" : hours < 24 ? `${hours} Std.` : `${hours / 24} ${hours === 24 ? "Tag" : "Tage"}`;

export const TicketsPanel: IPanelModule<S> = {
    id: "tickets",
    module: "tickets",
    name: "Tickets",
    emoji: "🎫",
    color: "#3ba55d",
    permanent: false,
    dashOnly: ["Kategorien", "Nachrichten", "Tags", "Aktionen"],
    sections: [
        {
            title: "Grundlagen",
            fields: [
                F<S>("choice", "contact", "Kontaktweg", "Klassisch mit eigenem Kanal oder ModMail über die DMs des Bots.", (s) => s.contact, (value: string) => ({ contact: value }), { choices: CONTACTS.map((id): [string, string] => [id, CONTACT_LABELS[id]]) }),
                F<S>("choice", "surface", "Ort", "Ein Kanal je Ticket oder ein Beitrag in einem Forum.", (s) => s.surface, (value: string) => ({ surface: value }), { choices: SURFACES.map((id): [string, string] => [id, SURFACE_LABELS[id]]) }),
                F<S>("channel", "forum", "Forum", "Nur beim Ort Forum-Post: hier entstehen die Tickets.", (s) => s.forumId, (value: string | null) => ({ forumId: value }), { channelTypes: [ChannelType.GuildForum] }),
                F<S>("choice", "style", "Panel-Stil", "Wie man im Panel die Art des Tickets wählt.", (s) => s.style, (value: string) => ({ style: value }), { choices: PANEL_STYLES.map((id): [string, string] => [id, STYLE_LABELS[id]]) }),
                F<S>("role", "support", "Support-Rolle", "Sieht und bearbeitet alle Tickets.", (s) => s.supportRoleId, (value: string | null) => ({ supportRoleId: value })),
            ],
        },
        {
            title: "Grenzen",
            fields: [
                F<S>("number", "limit", "Offen je User", "So viele offene Tickets darf jemand gleichzeitig haben. 0 heißt ohne Grenze.", (s) => s.limit, (value: number) => ({ limit: value }), { min: 0, max: MAX_LIMIT }),
                F<S>("choice", "deleteAfter", "Löschen nach", "So lange bleibt ein geschlossenes Ticket stehen.", (s) => String(s.deleteAfter), (value: string) => ({ deleteAfter: Number(value) }), {
                    choices: DELETE_AFTER_HOURS.map((hours): [string, string] => [String(hours), DELETE_LABEL(hours)]),
                }),
            ],
        },
        {
            title: "Transcripts",
            fields: [
                F<S>("toggle", "transcripts", "Transcripts", "Nach dem Schließen gibt es den Verlauf als Datei und im Dashboard.", (s) => s.transcripts.enabled, (value: boolean, s) => ({ transcripts: { ...s.transcripts, enabled: value } })),
                F<S>("channel", "transcriptChannel", "Transcript-Kanal", "Hierhin schickt der Bot Karte, Link und Datei.", (s) => s.transcripts.channelId, (value: string | null, s) => ({ transcripts: { ...s.transcripts, channelId: value } }), { channelTypes: LOG }),
                F<S>("toggle", "transcriptDm", "Kopie per DM", "Der Ersteller bekommt den Verlauf auch per DM, nur bei Klassisch.", (s) => s.transcripts.dm, (value: boolean, s) => ({ transcripts: { ...s.transcripts, dm: value } })),
            ],
        },
        {
            title: "Team und Panel",
            fields: [
                ModeratorsField<S>(),
                F<S>("channel", "panel", "Panel-Kanal", "Hierhin schickt der Bot das Panel. Ändern schickt es sofort neu.", (s) => s.panel.channelId, (value: string | null) => ({ [PANEL]: value }), { channelTypes: TEXT }),
            ],
        },
    ],
    async load(client, guild) {
        return { ...(await client.ticketSettings.Of(guild.id)), teamRoles: await TeamRoles(client, guild.id) };
    },
    async save(client, guild, patch) {
        if (MODERATORS in patch) await SaveModerators(client, guild, patch[MODERATORS]);
        else if (PANEL in patch) await client.ticketService.SendPanel(guild, String(patch[PANEL] ?? ""));
        else await client.ticketService.Save(guild, patch);

        return null;
    },
};
