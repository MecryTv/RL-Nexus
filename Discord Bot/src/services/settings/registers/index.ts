import { IPanelModule, PanelModuleId } from "../SettingsModel";
import { ApplyPanel } from "./Apply";
import { LevelsPanel } from "./Levels";
import { ModerationPanel } from "./Moderation";
import { TicketsPanel } from "./Tickets";
import { WelcomePanel } from "./Welcome";

/** Die Module im Panel, in dieser Reihenfolge - neue kommen hier dazu. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_MODULES: Record<PanelModuleId, IPanelModule<any>> = {
    moderation: ModerationPanel,
    tickets: TicketsPanel,
    apply: ApplyPanel,
    levels: LevelsPanel,
    welcome: WelcomePanel,
};

export function IsPanelModule(id: unknown): id is PanelModuleId {
    return typeof id === "string" && id in PANEL_MODULES;
}
