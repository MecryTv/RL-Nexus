/**
 * Abschnitt „Level-Karte“ (Plan 35, Plan 36, Plan 38): drei Reiter, jeder ein
 * Studio aus layout/LevelStudio.ts - Level-Karte, Aufstieg und seit Plan 38
 * auch die Rangliste mit ihren vier Bereichen. Alle drei werden einmal gebaut
 * und nur umgeschaltet, so geht beim Wechseln nichts verloren.
 */

import { BASE } from "../core/Base.js";
import { need } from "../core/Dom.js";
import { api, button, el, loading } from "../core/Ui.js";
import { levelStudio } from "../layout/LevelStudio.js";
import { IBoardDesign, ICardDesign } from "../../../interfaces/services/levels/ILevelDesign.js";

interface IPayload {
    upMode: "image" | "text";
    settings: { upLine?: string };
    designs: { card: ICardDesign | null; up: ICardDesign | null; boardDesign: IBoardDesign | null };
    templates: { card: Record<string, ICardDesign>; up: Record<string, ICardDesign>; board: Record<string, IBoardDesign> };
    designPlaceholders: string[];
    boardFramePlaceholders: string[];
    boardEntryPlaceholders: string[];
}

type Tab = "card" | "up" | "board";

const TABS: [Tab, string][] = [
    ["card", "Karte"],
    ["up", "Aufstieg"],
    ["board", "Rangliste"],
];

export function renderLevelCard(guildId: string): void {
    const host = need<HTMLElement>("#levelCardBody");
    const note = need<HTMLElement>("#levelCardNote");
    const request = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/levels`, note);
    const call = <T>(body: Record<string, unknown>): Promise<T | null> => request<T>("", body);
    const hosts: Record<Tab, HTMLElement> = { card: el("div", ""), up: el("div", ""), board: el("div", "") };
    const segments: HTMLElement[] = [];

    /** Die Reiter stehen in jeder Studio-Leiste - alle zeigen denselben Stand. */
    function tabs(): HTMLElement {
        const box = el("div", "sto-seg");

        box.setAttribute("aria-label", "Bild");

        for (const [tab, label] of TABS) {
            const option = button("", label);

            option.dataset.tab = tab;
            option.addEventListener("click", () => show(tab));
            box.append(option);
        }

        segments.push(box);

        return box;
    }

    function show(tab: Tab): void {
        for (const [key, node] of Object.entries(hosts)) node.hidden = key !== tab;

        for (const box of segments) for (const option of box.querySelectorAll<HTMLButtonElement>("button")) option.setAttribute("aria-pressed", String(option.dataset.tab === tab));
    }

    /** Review I2: ein Link von anderswo (Belohnungen) wünscht sich einen Reiter - beim ersten Öffnen oder später. */
    function wanted(): Tab | null {
        const holder = window as { levelCardTab?: string };
        const tab = TABS.find(([key]) => key === holder.levelCardTab)?.[0] ?? null;

        delete holder.levelCardTab;

        return tab;
    }

    document.addEventListener("level-card:tab", () => {
        // Noch nicht gebaut: das erste show() unten nimmt den Wunsch mit.
        if (!segments.length) return;

        const tab = wanted();

        if (tab) show(tab);
    });

    /* ------------------------------------------------------------
       Laden
       ------------------------------------------------------------ */
    loading(host, 0, 2);
    void request<IPayload>("").then((data) => {
        if (!data) return;

        host.replaceChildren(hosts.card, hosts.up, hosts.board);

        levelStudio(hosts.card, {
            kind: "card",
            design: data.designs.card,
            fallback: "klassisch",
            templates: data.templates.card,
            placeholders: data.designPlaceholders,
            guildId,
            head: tabs(),
            call,
        });
        levelStudio(hosts.up, {
            kind: "up",
            design: data.designs.up,
            fallback: "banner",
            templates: data.templates.up,
            placeholders: data.designPlaceholders,
            guildId,
            upLine: data.settings.upLine ?? "{user}",
            upMode: data.upMode,
            head: tabs(),
            call,
        });
        // Plan 38: die Rangliste im Baukasten mit Kopf, Podium, Zeile und Fuß.
        levelStudio(hosts.board, {
            kind: "board",
            design: data.designs.boardDesign,
            fallback: "podium",
            templates: data.templates.board,
            placeholders: data.boardFramePlaceholders,
            areaPlaceholders: { frame: data.boardFramePlaceholders, entry: data.boardEntryPlaceholders },
            guildId,
            head: tabs(),
            call,
        });
        show(wanted() ?? "card");
    });
}
