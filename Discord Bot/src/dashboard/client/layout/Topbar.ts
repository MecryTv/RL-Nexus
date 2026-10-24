/**
 * Kopfzeile und Filterleiste bekommen erst beim Scrollen einen Grund. Oben
 * stehen beide durchsichtig auf dem Hintergrund, wie der Kopf der Webseite.
 */

import { icon, maybe } from "../core/Dom.js";
import { DashboardGroup, IPayload } from "../interfaces/IUser.js";

export function watchScroll(): void {
    // Ueber die Klasse, nicht die id: Doku und Datenschutz tragen ihre Kopfzeile
    // ohne id und blieben sonst auch beim Scrollen durchsichtig.
    const topbar = maybe<HTMLElement>(".topbar");

    if (!topbar) return;

    // Nur die Serverliste hat eine Filterleiste. Angedockt ist sie, sobald sie
    // die Unterkante der Kopfzeile erreicht - das +1 faengt krumme Pixel bei
    // Browser-Zoom ab.
    const controls = maybe<HTMLElement>(".controls");

    const update = (): void => {
        topbar.classList.toggle("is-stuck", window.scrollY > 8);

        if (controls) {
            const docked = controls.getBoundingClientRect().top <= topbar.offsetHeight + 1;
            controls.classList.toggle("is-stuck", docked);
        }
    };

    window.addEventListener("scroll", update, { passive: true });
    update();
}

/**
 * Wartung des Bot-Dashboards (Plan 23): Administrator und Developer kommen
 * herein, alle anderen sehen die Wartungsseite. Damit das niemand vergisst,
 * hängt unter der Kopfzeile ein Streifen, der beim Scrollen mitkommt.
 */
export function showMaintenance(note: IPayload["maintenance"], group: DashboardGroup): void {
    const topbar = maybe<HTMLElement>(".topbar");

    if (!note || !topbar) return;

    const bar = document.createElement("div");
    const inner = document.createElement("div");
    const text = document.createElement("p");
    const lead = document.createElement("b");

    bar.className = "staffbar";
    bar.setAttribute("role", "status");
    inner.className = "shell staffbar__inner";
    lead.textContent = "Wartung läuft";
    text.append(
        lead,
        `${note.until ? ` bis voraussichtlich ${note.until} Uhr.` : ", ohne Endzeit."} ` +
            `Du siehst das Dashboard, weil du ${group === "administrator" ? "Administrator" : "Developer"} bist. Alle anderen sehen die Wartungsseite. ` +
            "Schalter im Admin Dashboard unter Developer → Wartung."
    );
    inner.append(icon("#i-warn"), text);
    bar.append(inner);
    topbar.append(bar);
}
