/**
 * W-0136: Reiter „Grenzen“ auf der Seite Module (Entwurf C3).
 *
 * Über der Seite stehen zwei Reiter: „Module“ mit den Schaltern wie bisher und
 * „Grenzen“ mit allen Grenzen von RL Nexus als Karten je Modul. Wer den Server
 * nicht verwaltet, sieht keine Reiter. Gebaut wird nur über textContent - der
 * Servername kommt von außen.
 */

import { BASE } from "../core/Base.js";
import { icon } from "../core/Dom.js";
import { button, el } from "../core/Ui.js";
import { MODULES } from "../constants/Modules.js";
import { askableCount, ILimitCard, LimitFilter, limitCards, limitCounts, limitName, limitsHref, limitStatus, limitStatusText, limitTabs, parseLimitsQuery } from "../constants/Limits.js";
import { IGuild, IModuleLimit } from "../interfaces/IGuild.js";

type Tab = "module" | "grenzen";

const FILTERS: [LimitFilter, string][] = [
    ["all", "Alle"],
    ["ask", "Auf Anfrage"],
    ["granted", "Für euch angepasst"],
    ["fixed", "Fest"],
];
const TAB_ICONS: Record<Tab, string> = { module: "#i-puzzle", grenzen: "#i-sliders" };
const STATE_ICONS = { ask: "#i-message", granted: "#i-check", fixed: "#i-lock" } as const;

const amount = (value: number): string => value.toLocaleString("de-DE");

export function bindLimitsTab(guild: IGuild, section: HTMLElement): (limits: Record<string, IModuleLimit[]>) => void {
    const tabs = limitTabs(guild.canManage, 0);

    if (tabs.length === 0) return () => undefined;

    let limits: Record<string, IModuleLimit[]> = {};
    let tab: Tab = "module";
    let module: string | null = null;
    let filter: LimitFilter = "all";
    let search = "";

    // Die Schalter (und ihr Hinweis) wandern in ein eigenes Panel, damit der
    // Reiter Module sie zeigen und verbergen kann.
    const note = section.querySelector<HTMLElement>("#moduleNote")!;
    const switches = el("div");

    switches.id = "gzmodules";
    switches.setAttribute("role", "tabpanel");
    switches.setAttribute("aria-labelledby", "gztab-module");
    note.before(switches);
    switches.append(note, section.querySelector<HTMLElement>("#moduleList")!);

    const bar = el("div", "avnav");

    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Module und Grenzen");

    const buttons = new Map<Tab, HTMLButtonElement>();

    for (const entry of tabs) {
        const tabButton = button("", icon(TAB_ICONS[entry.id]), entry.label);

        tabButton.id = `gztab-${entry.id}`;
        tabButton.setAttribute("role", "tab");
        tabButton.setAttribute("aria-controls", entry.id === "module" ? "gzmodules" : "gzpanel");
        tabButton.addEventListener("click", () => choose(entry.id));
        buttons.set(entry.id, tabButton);
        bar.append(tabButton);
    }

    bar.addEventListener("keydown", (event) => {
        const index = tabs.findIndex((entry) => entry.id === tab);
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];

        if (next === undefined) return;

        event.preventDefault();
        choose(tabs[(next + tabs.length) % tabs.length]!.id);
        buttons.get(tab)?.focus();
    });

    // Reiter Grenzen: Satz, Suche, Filter, Karten.
    const panel = el("div", "gzpanel");
    const input = el("input");
    const chips = el("div", "gzchips");
    const head = el("div", "gzbar", el("label", "search", icon("#i-search"), input), chips);
    const body = el("div");

    panel.id = "gzpanel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "gztab-grenzen");
    input.type = "search";
    input.placeholder = "Grenze oder Modul suchen";
    input.setAttribute("aria-label", "Grenze oder Modul suchen");
    input.addEventListener("input", () => {
        search = input.value;
        paintBody();
    });
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Grenzen filtern");
    panel.append(
        el("p", "gzlead", "Was RL Nexus für alle Server festlegt. Reicht euch ein Wert nicht, stellt eine Anfrage; RL Nexus kann ihn für „", el("b", "", guild.name), "“ anpassen."),
        head,
        body
    );
    switches.before(bar);
    switches.after(panel);

    function address(): string {
        return tab === "module" ? `${BASE}/guild/${guild.id}/module` : limitsHref(BASE, guild.id, module ?? undefined);
    }

    function choose(next: Tab): void {
        tab = next;
        history.replaceState(null, "", address());
        paint();
    }

    function read(): void {
        ({ tab, module } = parseLimitsQuery(window.location.search));
    }

    function paint(): void {
        const counted = limitTabs(true, askableCount(limits));

        for (const entry of counted) {
            const tabButton = buttons.get(entry.id)!;

            tabButton.tabIndex = entry.id === tab ? 0 : -1;
            tabButton.setAttribute("aria-selected", String(entry.id === tab));
            tabButton.querySelector(".avnav__count")?.remove();

            if (entry.count !== null) tabButton.append(el("span", "avnav__count", String(entry.count)));
        }

        switches.hidden = tab !== "module";
        panel.hidden = tab !== "grenzen";

        if (tab === "grenzen") paintBody();
    }

    function paintBody(): void {
        const counts = limitCounts(limits, module);
        const focused = (document.activeElement as HTMLElement | null)?.dataset.gzfilter;

        head.hidden = Object.keys(limits).length === 0;

        // Ein Modulfilter aus der Adresse steht als eigener Filter vorn - aber
        // nur für ein Modul, das es in den Grenzen gibt.
        const named = module && limits[module]?.length ? (MODULES.find((entry) => entry.id === module)?.name ?? module) : null;
        const list: HTMLButtonElement[] = [];

        if (named) {
            const chip = button("gzchip gzchip--mod", named, icon("#i-x"));

            chip.dataset.gzfilter = "modul";
            chip.setAttribute("aria-label", `Filter ${named} entfernen`);
            chip.addEventListener("click", () => {
                module = null;
                history.replaceState(null, "", address());
                paintBody();
                chips.querySelector<HTMLElement>('[data-gzfilter="all"]')?.focus();
            });
            list.push(chip);
        }

        for (const [id, label] of FILTERS) {
            const chip = button("gzchip", label, el("b", "", String(counts[id])));

            chip.dataset.gzfilter = id;
            chip.setAttribute("aria-pressed", String(filter === id));
            chip.addEventListener("click", () => {
                filter = id;
                paintBody();
            });
            list.push(chip);
        }

        chips.replaceChildren(...list);

        if (focused) chips.querySelector<HTMLElement>(`[data-gzfilter="${focused}"]`)?.focus();

        const cards = limitCards(limits, { filter, search, module });

        if (Object.keys(limits).length === 0) body.replaceChildren(el("p", "gzempty", "Für diesen Server gelten gerade keine Grenzen."));
        else if (cards.length === 0) body.replaceChildren(empty());
        else body.replaceChildren(el("div", "gzcards", ...cards.map(card)));
    }

    function empty(): HTMLElement {
        const reset = button("btn", icon("#i-refresh"), "Filter zurücksetzen");
        const term = search.trim();

        reset.addEventListener("click", () => {
            filter = "all";
            search = "";
            input.value = "";
            module = null;
            history.replaceState(null, "", address());
            paintBody();
            input.focus();
        });

        return el("div", "gzempty", el("p", "", term ? `Keine Grenze passt zu „${term}“.` : "Keine Grenze passt zu diesem Filter."), reset);
    }

    function card(entry: ILimitCard): HTMLElement {
        const part = MODULES.find((candidate) => candidate.id === entry.id);
        const meta = `${entry.total} ${entry.total === 1 ? "Grenze" : "Grenzen"}${entry.askable > 0 ? ` · ${entry.askable} auf Anfrage` : ""}`;
        const header = el("header", "gzcard__head", icon(part?.icon ?? "#i-puzzle"), el("div", "gzcard__text", el("h3", "gzcard__title", entry.name), el("span", "gzcard__meta", meta)));
        // Grenzen kommen für alle Module; ins Modul führt der Link nur, wenn es
        // eingeschaltet ist - sonst landete er auf der Übersicht.
        const open = document.querySelector<HTMLAnchorElement>(`#setSide a[data-section="${entry.id}"]`);

        if (open && !open.hidden) {
            const go = el("a", "gzcard__go", "Einstellungen", icon("#i-arrow"));

            go.href = `${BASE}/guild/${guild.id}/${entry.id}`;
            go.setAttribute("aria-label", `Einstellungen von ${entry.name}`);
            go.addEventListener("click", (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

                event.preventDefault();
                history.pushState(null, "", go.href);
                window.dispatchEvent(new PopStateEvent("popstate"));
            });
            header.append(go);
        }

        return el("section", "gzcard", header, ...entry.rows.map(row));
    }

    function row(entry: IModuleLimit): HTMLElement {
        const status = limitStatus(entry);
        const value = el("span", "gzrow__val");
        const act = el("span", "gzrow__act", "—");

        if (status === "granted" && entry.value !== entry.standard) value.append(el("s", "", amount(entry.standard)), " ");

        value.append(amount(entry.value));

        if (entry.unit) value.append(el("small", "", entry.unit));

        act.setAttribute("aria-hidden", "true");

        const line = el("div", `gzrow is-${status}`, el("span", "gzrow__name", limitName(entry.label)), value, act, el("span", "gzrow__state", icon(STATE_ICONS[status]), limitStatusText(entry)));

        line.dataset.key = entry.key;

        return line;
    }

    // Auf die Seite Module kommt man über die Leiste, Zurück/Vorwärts oder den
    // Verweis einer Modulseite (limits:open, W-0136 Task 4); jedes Mal sagt die
    // Adresse, welcher Reiter offen ist.
    window.addEventListener("guild:shown", (event) => {
        if ((event as CustomEvent<string>).detail !== "module") return;

        read();
        paint();
    });
    window.addEventListener("limits:open", () => {
        filter = "all";
        search = "";
        input.value = "";
        read();
        paint();
    });

    read();
    paint();

    return (next) => {
        limits = next;
        paint();
    };
}
