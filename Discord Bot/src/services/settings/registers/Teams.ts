import { HUB_ROWS, LAYOUT_LABELS, MMR_LABELS, RANK_STYLES, ROLE_LABELS, ROLE_ORDER } from "../../../constants/Teams";
import { ITeamSettings } from "../../../interfaces/services/teams/ITeams";
import { RoleProblem, TeamError } from "../../TeamService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = ITeamSettings;

const STYLES = Object.entries(RANK_STYLES) as [string, string][];

/**
 * Das Dashboard tauscht beim Wechsel auf den Hub den Kopf gegen die Vorlage, wenn
 * {teams} darin steht - im Hub bliebe er sonst leer. Das Panel kann den Kopf nicht
 * mit ändern, ohne dass ein Feld ein anderes ändert. Lieber ein Satz.
 */
function Layout(value: string, s: S): Record<string, unknown> {
    if (value === "hub" && s.layout !== "hub" && /\{teams(\.short)?\}/i.test(JSON.stringify(s.board.doc))) {
        throw new PanelError("Im Kopf steht {teams}, das bliebe im Hub leer. Stell die Anzeige im Dashboard um, dort passt sich der Kopf an.");
    }

    return { layout: value };
}

export const TeamsPanel: IPanelModule<S> = {
    id: "teams",
    module: "teams",
    name: "RL Team-Übersicht",
    emoji: "👥",
    color: "#5aa9e6",
    permanent: false,
    dashOnly: ["Teams und Kader", "Formel", "Karten-Design", "Abzeichen", "Reihenfolge", "Texte und Bilder des Hubs"],
    sections: [
        {
            title: "Übersicht",
            fields: [
                F<S>("channel", "channel", "Kanal", "Hier steht die Übersicht der Teams.", (s) => s.channelId, (value: string | null) => ({ channelId: value }), { channelTypes: TEXT }),
                // Dieselben Namen wie im Dashboard (constants/Teams.ts).
                F<S>("choice", "layout", "Anzeige", "Ein Hub mit Menü oder jedes Team als eigene Nachricht.", (s) => s.layout, (value: string, s) => Layout(value, s), { choices: Object.entries(LAYOUT_LABELS) }),
                F<S>("choice", "mmr", "MMR", "Wie die Team-MMR gerechnet wird. Die eigene Rechnung stellst du im Dashboard ein.", (s) => s.mmr.mode, (value: string, s) => ({ mmr: { ...s.mmr, mode: value } }), { choices: Object.entries(MMR_LABELS) }),
                F<S>("choice", "rankStyle", "Ränge zeigen als", "So stehen Ränge in Kader, Aufstellung und Rang.", (s) => s.rankStyle, (value: string) => ({ rankStyle: value }), { choices: STYLES }),
                F<S>("choice", "roleStyle", "Aufgaben zeigen als", "So stehen Captain, Ersatz und Co. in Kader und Aufstellung.", (s) => s.roleStyle, (value: string) => ({ roleStyle: value }), { choices: STYLES }),
                F<S>("number", "hubRows", "Teams je Kategorie", "So viele Teams einer Kategorie stehen im Hub als Zeile.", (s) => s.hubRows, (value: number) => ({ hubRows: value }), { min: HUB_ROWS[0], max: HUB_ROWS[1] }),
            ],
        },
        {
            title: "Rollen im Kader",
            // Nur der eine Wert, wie im Dashboard: CleanRoles nimmt für alles Fehlende den alten Stand. Die ganze
            // Liste mitzuschicken prüfte jede Rolle neu, eine gelöschte würde dabei still leer.
            fields: [
                F<S>("toggle", "sync", "Rollen vergeben", "Wer im Kader steht, bekommt die Rollen und verliert sie, wenn er rausgeht.", (s) => s.roles.sync, (value: boolean) => ({ roles: { sync: value } })),
                ...ROLE_ORDER.map((role) =>
                    F<S>("role", `role-${role}`, ROLE_LABELS[role], `Diese Rolle bekommt, wer in einem Kader ${ROLE_LABELS[role]} ist.`, (s) => s.roles.positions[role], (value: string | null) => ({ roles: { positions: { [role]: value } } }))
                ),
            ],
        },
    ],
    load(client, guild) {
        return client.teamService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        // SaveSettings gibt die Rollen gleich an die Kader, wie im Dashboard.
        try {
            await client.teamService.SaveSettings(guild, patch);
        } catch (error) {
            if (error instanceof TeamError) throw new PanelError(error.message);

            throw error;
        }

        // Wie der Hinweis im Dashboard: Eine Rolle, die der Bot nicht vergeben kann, nimmt er zwar an, gibt sie aber niemandem.
        if ("roles" in patch) {
            const positions = (patch.roles as { positions?: Record<string, string | null> }).positions ?? {};

            return Object.values(positions).map((id) => (id ? RoleProblem(guild, id) : null)).find((problem) => problem !== null) ?? null;
        }

        // Das Dashboard sendet die Übersicht nach dem Speichern auch nicht neu, das macht dort ein eigener Knopf.
        return "Im Kanal zeigt sich das, sobald du die Übersicht im Dashboard neu sendest.";
    },
};
