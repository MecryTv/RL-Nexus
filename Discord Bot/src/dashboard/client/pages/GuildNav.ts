/**
 * Leiste der Serverseite (W-0055): links die Bereiche, daneben die Module des
 * gewählten Bereichs. Die Links selbst baut bindModules in Guild.ts, samt
 * hidden für „aus“ oder „darf nicht“ - hier wird nur entschieden, welcher
 * Bereich zu sehen ist. Teile eines Moduls stehen nicht in der Spalte, sie
 * sind Reiter auf der Seite. Spec: 2026-11-01-sidebar-design.md.
 */

import { CATEGORIES, IModule, MODULES } from "../constants/Modules.js";
import { icon, need } from "../core/Dom.js";
import { clickSound } from "../core/Sound.js";

/** Kurz genug für die schmale Bereichsleiste. Der volle Name steht im Tooltip. */
export const AREA_SHORT: Record<string, string> = {
    always: "Immer",
    "rocket-league": "RL",
    community: "Community",
    support: "Support",
    moderation: "Mod",
    content: "Inhalte",
};

const AREA_ICON: Record<string, string> = {
    always: "#i-star",
    "rocket-league": "#i-gamepad",
    community: "#i-users",
    support: "#i-ticket",
    moderation: "#i-gavel",
    content: "#i-play",
};

/** Das Modul eines Abschnitts: das Modul selbst oder das, zu dem der Teil gehört. */
export function ownerOf(section: string): IModule | undefined {
    return MODULES.find((module) => module.id === section || module.parts?.some((part) => part.id === section));
}

export interface INav {
    /** Nach jeder Änderung an den Links: Zahlen neu, ein leer gewordener Bereich wird abgewählt. */
    refresh(): void;
    /** Der gewählte Bereich, null solange keiner Module hat. */
    area(): string | null;
}

export function bindNav(): INav {
    const rail = need<HTMLElement>("#setRail");
    const nav = need<HTMLElement>("#setNav");
    const head = need<HTMLElement>("#navHead");
    const tabs = need<HTMLElement>("#modTabs");
    const cards = need<HTMLElement>("#moduleCards");
    const buttons = new Map<string, HTMLButtonElement>();
    let chosen: string | null = null;
    let section = "";
    let drawn = "";

    const group = (area: string): HTMLElement | null => nav.querySelector<HTMLElement>(`.setnav__group[data-area="${area}"]`);
    const count = (area: string): number =>
        [...(group(area)?.querySelectorAll<HTMLAnchorElement>("a[data-section]:not(.is-sub)") ?? [])].filter((link) => !link.hidden).length;

    for (const category of CATEGORIES) {
        const button = document.createElement("button");
        const label = document.createElement("span");
        const badge = document.createElement("span");

        button.type = "button";
        button.className = "setrail__area";
        button.dataset.area = category.id;
        button.title = category.name;
        button.hidden = true;
        button.setAttribute("aria-label", category.name);
        button.setAttribute("aria-pressed", "false");
        label.textContent = AREA_SHORT[category.id] ?? category.name;
        badge.className = "setrail__count";
        badge.setAttribute("aria-hidden", "true");
        button.append(icon(AREA_ICON[category.id] ?? "#i-grid"), label, badge);
        button.addEventListener("click", () => {
            select(category.id);
            clickSound("primary");
        });
        rail.append(button);
        buttons.set(category.id, button);
    }

    function select(area: string | null): void {
        chosen = area;

        for (const [id, button] of buttons) button.setAttribute("aria-pressed", String(id === area));
        for (const box of nav.querySelectorAll<HTMLElement>(".setnav__group")) box.hidden = box.dataset.area !== area;

        const category = CATEGORIES.find((entry) => entry.id === area);

        if (!area || !category) return void head.replaceChildren();

        const name = document.createElement("b");
        const sub = document.createElement("small");
        const n = count(area);

        name.textContent = category.name;
        sub.textContent = `${n} ${n === 1 ? "Modul" : "Module"} an`;
        head.replaceChildren(name, sub);
    }

    // Ein Teil ist offen: sein Modul steht markiert in der Spalte, damit man sieht, wo man ist.
    function mark(): void {
        for (const link of nav.querySelectorAll<HTMLAnchorElement>('a[aria-current="true"]')) link.removeAttribute("aria-current");

        const owner = ownerOf(section);

        if (owner && owner.id !== section) nav.querySelector<HTMLAnchorElement>(`a[data-section="${owner.id}"]:not(.is-sub)`)?.setAttribute("aria-current", "true");
    }

    /**
     * Reiter über der Seite: das Modul („Einstellungen“) und seine Teile, soweit
     * ihr Link in der Leiste nicht versteckt ist. Unter zwei Reitern keine Zeile.
     * Bleibt es dasselbe Modul, wandert nur die Markierung - der Fokus bleibt
     * auf dem Reiter, den man gerade gedrückt hat.
     */
    function paintTabs(): void {
        const owner = ownerOf(section);
        const items = owner?.parts?.length ? [{ id: owner.id, name: "Einstellungen", icon: "#i-sliders" }, ...owner.parts] : [];
        const open = items.flatMap((item) => {
            const link = nav.querySelector<HTMLAnchorElement>(`a[data-section="${item.id}"]:not([data-liste])`);

            return link && !link.hidden ? [{ item, href: link.href }] : [];
        });
        const key = open.length > 1 ? open.map(({ item }) => item.id).join(",") : "";

        tabs.hidden = !key;
        cards.classList.toggle("is-tabbed", Boolean(key));

        if (key !== drawn) {
            drawn = key;
            tabs.replaceChildren();

            if (owner && key) {
                const title = document.createElement("h2");
                const row = document.createElement("nav");

                title.className = "modhead";
                title.append(icon(owner.icon), owner.name);
                row.className = "modtabs__row";
                row.setAttribute("aria-label", `${owner.name}: Seiten`);

                for (const { item, href } of open) {
                    const tab = document.createElement("a");

                    tab.href = href;
                    tab.dataset.section = item.id;
                    tab.append(icon(item.icon), item.name);
                    row.append(tab);
                }

                tabs.append(title, row);
            }
        }

        for (const tab of tabs.querySelectorAll<HTMLAnchorElement>("a[data-section]")) {
            if (tab.dataset.section === section) tab.setAttribute("aria-current", "page");
            else tab.removeAttribute("aria-current");
        }
    }

    /** Der erste Bereich in der Liste, der Module hat und den es noch gibt. */
    function pick(...wanted: (string | null | undefined)[]): string | null {
        return wanted.find((area): area is string => Boolean(area) && count(area!) > 0) ?? [...buttons.keys()].find((area) => count(area) > 0) ?? null;
    }

    function refresh(): void {
        for (const [area, button] of buttons) {
            const n = count(area);

            button.hidden = n === 0;
            button.querySelector(".setrail__count")!.textContent = String(n);
        }

        select(pick(chosen, ownerOf(section)?.category));
        mark();
        paintTabs();
    }

    // Nach jedem Seitenwechsel steht der Bereich der offenen Seite. Auf Übersicht,
    // Module und Moderatoren bleibt der zuletzt gewählte.
    window.addEventListener("guild:shown", (event) => {
        section = (event as CustomEvent<string>).detail;
        select(pick(ownerOf(section)?.category, chosen));
        mark();
        paintTabs();
    });

    return { refresh, area: () => chosen };
}
