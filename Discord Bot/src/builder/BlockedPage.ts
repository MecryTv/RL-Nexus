import { EscapeHtml } from "../services/DashboardService";
import { BLOCKS, Block, IBlockedView } from "../utils/security";

/**
 * W-0057: die Werte für gesperrt.html (C4c) und vpn.html (V-A+) im
 * Bot-Dashboard. Kein Grund, kein Ansprechpartner.
 */

const SHIELD_FULL =
    '<svg class="shield" viewBox="0 0 78 86" aria-hidden="true"><path d="M39 4l31 12v24c0 20-13 34-31 42C21 74 8 60 8 40V16z" fill="var(--tone-fill)" stroke="var(--tone)" stroke-width="2.5" stroke-linejoin="round"/><path d="M39 14l22 8.5V40c0 14-9 24-22 30-13-6-22-16-22-30V22.5z" fill="none" stroke="var(--tone-ring)" stroke-width="1.2"/><path d="M30 33l18 18M48 33L30 51" stroke="var(--tone)" stroke-width="3.5" stroke-linecap="round"/></svg>';
const SHIELD_PART =
    '<svg class="shield" viewBox="0 0 78 86" aria-hidden="true"><path d="M39 4l31 12v24c0 20-13 34-31 42C21 74 8 60 8 40V16z" fill="var(--tone-fill)" stroke="var(--tone)" stroke-width="2.5" stroke-linejoin="round"/><path d="M39 14l22 8.5V40c0 14-9 24-22 30-13-6-22-16-22-30V22.5z" fill="none" stroke="var(--tone-ring)" stroke-width="1.2"/><path d="M28 42h22" stroke="var(--tone)" stroke-width="3.5" stroke-linecap="round"/></svg>';

const ZONE = "Europe/Berlin";

const day = (iso: string): string => new Date(iso).toLocaleDateString("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

/** Die Schilder „Gesperrt“ und „Weiter nutzbar“ wie im Entwurf C4c: Bot auf allen Servern als ein Schild. */
export function Chips(scope: readonly Block[]): { blocked: string[]; usable: string[] } {
    const on = (block: Block): boolean => scope.includes(block);
    const blocked: string[] = [];
    const usable: string[] = [];

    if (on("others") && on("own")) blocked.push("Bot");
    else if (on("own")) {
        blocked.push("Eigene Server");
        usable.push("Bot auf anderen Servern");
    } else if (on("others")) {
        blocked.push("Bot auf anderen Servern");
        usable.push("Eigene Server");
    } else usable.push("Bot");

    for (const [block, label] of [["dashboard", "Dashboard"], ["website", "Webseite"], ["shop", "Shop"]] as const) (on(block) ? blocked : usable).push(label);

    return { blocked, usable };
}

function avatar(view: IBlockedView): string {
    return view.avatar ? `<img src="${EscapeHtml(view.avatar)}" alt="">` : EscapeHtml((view.name.trim()[0] ?? "?").toUpperCase());
}

export function BlockedPage(view: IBlockedView): { page: string; values: Record<string, string> } {
    if (view.kind === "vpn") {
        const time = `${new Date(view.checkedAt).toLocaleTimeString("de-DE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" })} Uhr`;

        return { page: "vpn.html", values: { TIME: time, NAME: EscapeHtml(view.name), AVATAR: avatar(view) } };
    }

    const full = BLOCKS.every((block) => view.scope.includes(block));
    const { blocked, usable } = Chips(view.scope);
    const group = (title: string, labels: string[], kind: "no" | "yes"): string =>
        labels.length ? `<div><span class="k">${title}</span><div class="pls">${labels.map((label) => `<span class="pl ${kind}">${label}</span>`).join("")}</div></div>` : "";

    return {
        page: "gesperrt.html",
        values: {
            TONE: full ? "full" : "part",
            SHIELD: full ? SHIELD_FULL : SHIELD_PART,
            STATE: full ? "Dauerhaft gesperrt" : "Teilweise gesperrt",
            TITLE: full ? "Zugang gesperrt" : "Dashboard gesperrt",
            NAME: EscapeHtml(view.name),
            AVATAR: avatar(view),
            GROUPS: group("Gesperrt", blocked, "no") + group("Weiter nutzbar", usable, "yes"),
            SINCE: [view.since ? `seit ${day(view.since)}` : "", view.changedAt ? `geändert am ${day(view.changedAt)}` : ""].filter(Boolean).join(" · "),
        },
    };
}
