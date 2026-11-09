import { ModuleId } from "../../../constants/Modules";
import { IPanelModule, PanelModuleId } from "../SettingsModel";

/**
 * Module ohne eigene Einstellungen (W-0014 Teil 4, A1): Sie stehen in der
 * Übersicht und lassen sich ein- und ausschalten, alles andere ist ein
 * Baukasten im Dashboard. Statt Kacheln steht ein Satz, warum.
 */
function Simple(id: PanelModuleId & ModuleId, name: string, emoji: string, color: `#${string}`, about: string): IPanelModule<Record<string, never>> {
    return {
        id,
        module: id,
        name,
        emoji,
        color,
        permanent: false,
        dashOnly: [],
        about,
        sections: [],
        load: async () => ({}),
        save: async () => null,
    };
}

export const ReactionRolesPanel = Simple("reaction-roles", "Self Roles", "🎭", "#a46cf0", "Jedes Rollen-Panel ist ein Baukasten mit eigenem Aussehen. Du baust es im Dashboard.");
export const RoleListsPanel = Simple("role-lists", "Rollen-Listen", "📋", "#5aa9e6", "Jede Liste hat ihr eigenes Design. Du legst sie im Dashboard an.");
export const GiveawaysPanel = Simple("giveaways", "Giveaways", "🎉", "#f0b232", "Jede Verlosung hat ihre eigenen Einstellungen. Du legst sie mit /giveaway oder im Dashboard an.");
export const PollsPanel = Simple("polls", "Umfragen", "📊", "#23a55a", "Jede Umfrage hat ihre eigenen Einstellungen. Du legst sie mit /umfrage oder im Dashboard an.");
export const CustomMessagePanel = Simple("custom-message", "Custom Message", "💬", "#80848e", "Nachrichten und Auto-Antworten sind Baukästen. Du baust sie im Dashboard.");
