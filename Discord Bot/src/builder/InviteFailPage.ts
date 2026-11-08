import { DASHBOARD_HOME, DASHBOARD_PATH, Initials } from "../constants/Dashboard";
import { EscapeHtml } from "../services/DashboardService";
import type { RefuseReason } from "../utils/invitepass";
import { INVITE_LIFETIME, IInviteState, InviteFailReason } from "../utils/invitestate";

/**
 * W-0069, Entwurf B+: die Werte für einladen.html, wenn der Rückweg von Discord
 * nach „Bot einladen“ nicht passt. Oben der Server, dann Grund, Ablauf in drei
 * Schritten, konkrete Angaben, Entwarnung und ein Hauptknopf. Jeder Name kommt
 * von Discord und wird maskiert.
 */

const ZONE = "Europe/Berlin";
const MINUTES = Math.round(INVITE_LIFETIME / 60_000);

export interface IInviteFailView {
    reason: InviteFailReason;
    state: IInviteState | null;
    now: number;
    /** Wer gerade im Dashboard angemeldet ist. */
    session: { name: string; avatar: string | null } | null;
    /** Der Server, den Discord beim Rückweg nennt, falls die Person ihn verwaltet. */
    chosen: { id: string; name: string; icon: string | null } | null;
    /** Discord hat nicht geantwortet: Ob der Bot beigetreten ist, ist offen. */
    unsure?: boolean;
    /** Warum GuildJoined den Bot wieder gehen ließ (Grund refused). */
    refused?: RefuseReason;
    /** Die Hauptseite ohne Schrägstrich am Ende, für „Zugang ansehen“. */
    siteURL: string;
}

const SAFE = "Es ist nichts passiert: Der Bot ist keinem Server beigetreten und hat keine Rechte bekommen.";

const time = (at: number): string => `${new Date(at).toLocaleTimeString("de-DE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" })} Uhr`;

function picture(name: string, image: string | null, className: string): string {
    const inner = image ? `<img src="${EscapeHtml(image)}" alt="">` : EscapeHtml(Initials(name));

    return `<span class="${className}">${inner}</span>`;
}

function server(name: string, icon: string | null): string {
    return (
        `<span class="invfail__srvwrap">${picture(name, icon, "invfail__avatar")}` +
        `<span class="invfail__badge"><svg aria-hidden="true"><use href="#i-warn"/></svg></span></span>` +
        `<span class="invfail__name">${EscapeHtml(name)}</span>`
    );
}

function facts(rows: { key: string; value: string; off?: boolean }[]): string {
    return `<dl class="invfail__facts">${rows.map((row) => `<div><dt>${row.key}</dt><dd${row.off ? ' class="is-off"' : ""}>${row.value}</dd></div>`).join("")}</dl>`;
}

const mini = (name: string, image: string | null, alt = false): string => `${picture(name, image, `invfail__mini${alt ? " invfail__mini--alt" : ""}`)}${EscapeHtml(name)}`;

const arrow = '<svg aria-hidden="true"><use href="#i-arrow"/></svg>';
const listIcon = '<svg aria-hidden="true"><use href="#i-list"/></svg>';
const userIcon = '<svg aria-hidden="true"><use href="#i-user"/></svg>';

export function InviteFailPage(view: IInviteFailView): { page: string; values: Record<string, string> } {
    const { reason, state, now, session, chosen } = view;
    const guildId = state?.guildId ?? chosen?.id ?? null;
    const again = guildId ? `${DASHBOARD_PATH}/einladen?guild=${guildId}` : null;
    const home = `<a class="invfail__back" href="${DASHBOARD_HOME}">${listIcon}Zur Serverliste</a>`;
    const inviteAgain = again ? `<a class="invfail__go" href="${again}">Noch einmal einladen${arrow}</a>` : "";

    let title: string;
    let text: string;
    let step: string;
    let rows = "";
    let action = inviteAgain;
    let pill = "Bot nicht beigetreten";
    let safe = SAFE;

    switch (reason) {
        case "discord":
            title = "Discord hat die Einladung nicht bestätigt";
            text = view.unsure
                ? "Discord hat beim Abschluss nicht geantwortet. Schau in der Serverliste nach, ob der Bot schon da ist; wenn nicht, lade ihn noch einmal ein."
                : "Beim Abschluss bei Discord ist etwas schiefgegangen, etwa weil der Rückweg doppelt geladen wurde oder Discord gerade Probleme hat. Versuch es in ein paar Minuten noch einmal.";
            step = "Discord-Fehler";
            if (view.unsure) safe = "Ob der Bot beigetreten ist, zeigt die Serverliste. Steht der Server dort ohne Bot, ist nichts passiert.";
            break;

        case "refused":
            title = "Bot wieder gegangen";
            text =
                view.refused === "pass"
                    ? "Der Bot ist beigetreten, hat den Server aber gleich wieder verlassen, weil die Freigabe aus dem Dashboard nicht ankam. Lade ihn noch einmal ein."
                    : "Der Bot ist beigetreten, hat den Server aber gleich wieder verlassen: Dort verwaltet niemand den Server, der Zugang zu RL Nexus hat. Der Owner hat dazu eine Direktnachricht bekommen.";
            step = view.refused === "pass" ? "Keine Freigabe" : "Kein Zugang";
            pill = "Bot wieder gegangen";
            safe = "Der Bot ist nicht mehr auf dem Server.";
            if (view.refused !== "pass") action = `<a class="invfail__go" href="${EscapeHtml(view.siteURL)}/preise">Zugang ansehen${arrow}</a>`;
            break;

        case "expired": {
            const created = state?.createdAt ?? now;
            const minutes = Math.max(MINUTES + 1, Math.round((now - created) / 60_000));

            title = "Einladung abgelaufen";
            text = `Zwischen „Bot einladen“ und der Freigabe bei Discord lagen ${minutes} Minuten. Eine Einladung gilt ${MINUTES} Minuten.`;
            step = "Zu spät zurück";
            rows = facts([
                { key: "Gestartet", value: time(created) },
                { key: "Zurück von Discord", value: time(now), off: true },
            ]);
            break;
        }

        case "guild":
            title = "Anderer Server gewählt";
            text = "Bei Discord wurde ein anderer Server gewählt als im Dashboard. Damit der Bot nicht auf dem falschen Server landet, haben wir die Einladung gestoppt.";
            step = "Anderer Server";
            rows = state
                ? facts([
                      { key: "Im Dashboard", value: mini(state.guildName, state.guildIcon) },
                      { key: "Bei Discord", value: chosen ? mini(chosen.name, chosen.icon, true) : "ein anderer Server", off: true },
                  ])
                : "";
            break;

        case "account":
            title = "Anderes Konto angemeldet";
            text = session
                ? "Die Einladung hat ein anderes Discord-Konto gestartet, als jetzt im Dashboard angemeldet ist. Melde dich mit dem Konto an, das den Server verwaltet."
                : "Im Dashboard ist gerade niemand angemeldet. Melde dich mit dem Konto an, das den Server verwaltet, dann geht die Einladung neu los.";
            step = "Anderes Konto";
            rows = state
                ? facts([
                      { key: "Eingeladen von", value: mini(state.userName, state.userAvatar) },
                      { key: "Angemeldet als", value: session ? mini(session.name, session.avatar, true) : "niemand", off: true },
                  ])
                : "";
            action = again ? `<a class="invfail__go" href="${DASHBOARD_PATH}/logout?return=${encodeURIComponent(again)}">${userIcon}Neu anmelden und einladen</a>` : "";
            break;

        default:
            title = "Einladung nicht mehr gültig";
            text = `Zu diesem Rückweg von Discord gibt es keine offene Einladung, etwa weil der Tab zu lange offen lag oder die Einladung in einem anderen Browser begonnen wurde. Eine Einladung gilt ${MINUTES} Minuten.`;
            step = "Nicht gültig";
            break;
    }

    const guild = state ? server(state.guildName, state.guildIcon) : chosen ? server(chosen.name, chosen.icon) : "";

    return {
        page: "einladen.html",
        values: {
            TITLE: title,
            TEXT: text,
            SERVER: guild,
            STATE: pill,
            STEP: step,
            FACTS: rows,
            SAFE: safe,
            // Ohne bekannten Server ist die Serverliste der einzige Weg weiter, dann als Hauptknopf.
            ACTIONS: action ? action + home : home.replace("invfail__back", "invfail__go"),
        },
    };
}
