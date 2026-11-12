import { IPanelModule, PanelModuleId } from "../SettingsModel";
import { AntiVillainPanel } from "./AntiVillain";
import { ApplyPanel } from "./Apply";
import { AutoModPanel } from "./AutoMod";
import { BackupsPanel } from "./Backups";
import { ClipsPanel } from "./Clips";
import { LevelsPanel } from "./Levels";
import { LoggingPanel } from "./Logging";
import { LookingForPanel } from "./LookingFor";
import { MatchupsPanel } from "./Matchups";
import { ModerationPanel } from "./Moderation";
import { RankRolesPanel } from "./RankRoles";
import { CustomMessagePanel, GiveawaysPanel, PollsPanel, ReactionRolesPanel, RoleListsPanel } from "./Simple";
import { SixMansPanel } from "./SixMans";
import { RocketRoulettePanel } from "./RocketRoulette";
import { TeamsPanel } from "./Teams";
import { TempVoicePanel } from "./TempVoice";
import { TicketsPanel } from "./Tickets";
import { TwitchPanel } from "./Twitch";
import { WelcomePanel } from "./Welcome";
import { YouTubePanel } from "./YouTube";

/**
 * Die Bereiche der Übersicht, wie im Entwurf (W-0014 Teil 4): Namen der
 * Dashboard-Leiste, Reihenfolge der Bereiche und Module wie im Entwurf (die
 * Leiste stellt Moderation hinter Support). Gallery fehlt.
 */
export const PANEL_AREAS: readonly { name: string; ids: readonly PanelModuleId[] }[] = [
    { name: "Immer dabei", ids: ["levels", "backups"] },
    { name: "Rocket League", ids: ["rl-6mans", "lft", "teams", "rank-roles", "clips", "matchups", "rocket-roulette"] },
    { name: "Moderation", ids: ["moderation", "automod", "anti-villain", "logging"] },
    { name: "Community", ids: ["welcome", "apply", "voice-hub", "reaction-roles", "role-lists", "giveaways", "polls"] },
    { name: "Support", ids: ["tickets"] },
    { name: "Inhalte & Meldungen", ids: ["twitch-notifier", "youtube-notifier", "custom-message"] },
];

const ALL: Record<PanelModuleId, IPanelModule<any>> = {
    levels: LevelsPanel,
    backups: BackupsPanel,
    "rl-6mans": SixMansPanel,
    "rocket-roulette": RocketRoulettePanel,
    lft: LookingForPanel,
    teams: TeamsPanel,
    "rank-roles": RankRolesPanel,
    clips: ClipsPanel,
    matchups: MatchupsPanel,
    moderation: ModerationPanel,
    automod: AutoModPanel,
    "anti-villain": AntiVillainPanel,
    logging: LoggingPanel,
    welcome: WelcomePanel,
    apply: ApplyPanel,
    "voice-hub": TempVoicePanel,
    "reaction-roles": ReactionRolesPanel,
    "role-lists": RoleListsPanel,
    giveaways: GiveawaysPanel,
    polls: PollsPanel,
    tickets: TicketsPanel,
    "twitch-notifier": TwitchPanel,
    "youtube-notifier": YouTubePanel,
    "custom-message": CustomMessagePanel,
};

/** Die Module im Panel, in der Reihenfolge der Übersicht - neue kommen in ALL und PANEL_AREAS dazu. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_MODULES: Record<PanelModuleId, IPanelModule<any>> = Object.fromEntries(PANEL_AREAS.flatMap((area) => area.ids.map((id) => [id, ALL[id]]))) as Record<PanelModuleId, IPanelModule<any>>;

export function IsPanelModule(id: unknown): id is PanelModuleId {
    return typeof id === "string" && Object.hasOwn(PANEL_MODULES, id);
}

/** Der Bereich eines Moduls in der Übersicht. */
export function AreaOf(id: PanelModuleId): string {
    return PANEL_AREAS.find((area) => area.ids.includes(id))?.name ?? "";
}
