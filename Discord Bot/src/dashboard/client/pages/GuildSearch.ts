/**
 * Suche der Serverseite (W-0055): ein Fenster über der Seite, geöffnet mit der
 * rechten Umschalttaste, mit / oder Strg K, oder über „Suchen …“ in der Leiste.
 * Die Einträge kommen bei jedem Öffnen aus den Links der Leiste - gefunden wird
 * nur, was man dort auch erreicht, also auch nur, was only erlaubt. Treffer und
 * Tastenlogik: core/NavSearch.ts.
 */

import { CATEGORIES, MODULES } from "../constants/Modules.js";
import { icon, need } from "../core/Dom.js";
import { browseNav, INavEntry, NavKind, searchNav, ShiftTap } from "../core/NavSearch.js";
import { INav, ownerOf } from "./GuildNav.js";

const GROUP_NAMES: Record<NavKind, string> = { page: "Seiten", part: "Unterseiten", module: "Module", list: "Rollen-Listen", off: "Aus" };

const areaName = (id: string | null | undefined): string | undefined => CATEGORIES.find((category) => category.id === id)?.name;

/** In einem Feld schreibt die Taste, und über einem offenen Fenster öffnet sich kein zweites - auch nicht über einem ohne <dialog> (StaffPrompt sperrt mit sg-locked). */
function busy(): boolean {
    const active = document.activeElement;

    return (
        Boolean(active?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) ||
        document.querySelector("dialog[open], [aria-modal='true']") !== null ||
        document.body.classList.contains("sg-locked")
    );
}

/** canOff: ausgeschaltete Module mit anzeigen (nur wer den Server verwaltet, ohne only). */
export function bindNavSearch(canOff: boolean, nav: INav): { open(): void } {
    const side = need<HTMLElement>("#setSide");
    const find = need<HTMLButtonElement>("#navFind");
    const dialog = document.createElement("dialog");
    const bar = document.createElement("div");
    const input = document.createElement("input");
    const list = document.createElement("div");
    const foot = document.createElement("div");
    const targets = new Map<INavEntry, HTMLAnchorElement>();
    let entries: INavEntry[] = [];
    let hits: INavEntry[] = [];
    let active = 0;
    let before: HTMLElement | null = null;

    dialog.className = "modal navfind";
    dialog.setAttribute("aria-label", "Seite suchen");
    bar.className = "navfind__bar";
    input.type = "text";
    input.className = "navfind__input";
    input.placeholder = "Seite oder Modul suchen …";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "navFindList");
    list.className = "navfind__list";
    list.id = "navFindList";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Treffer");
    foot.className = "navfind__foot";
    foot.innerHTML = "<span><kbd>↑</kbd> <kbd>↓</kbd> wählen</span><span><kbd>Enter</kbd> öffnen</span><span><kbd>Esc</kbd> schließen</span>";
    bar.append(icon("#i-search"), input);
    dialog.append(bar, list, foot);
    document.body.append(dialog);

    function collect(): void {
        entries = [];
        targets.clear();

        const add = (entry: INavEntry, link: HTMLAnchorElement): void => {
            entries.push(entry);
            targets.set(entry, link);
        };

        for (const link of side.querySelectorAll<HTMLAnchorElement>("a[data-section]")) {
            const section = link.dataset.section ?? "";
            const liste = link.dataset.liste;

            if (link.hidden || liste === "neu") continue;

            const owner = ownerOf(section);
            const part = owner?.parts?.find((entry) => entry.id === section);
            const kind: NavKind = liste ? "list" : !owner ? "page" : part ? "part" : "module";

            add(
                {
                    section,
                    href: link.href,
                    name: link.title || (link.textContent ?? "").trim(),
                    kind,
                    icon: link.querySelector("use")?.getAttribute("href") ?? "#i-grid",
                    module: kind === "part" || kind === "list" ? owner?.name : undefined,
                    area: areaName(owner?.category),
                    text: kind === "list" ? undefined : (part ?? owner)?.description,
                    alone: link.classList.contains("is-alone"),
                },
                link
            );
        }

        const modules = side.querySelector<HTMLAnchorElement>('a[data-section="module"]');

        if (!canOff || !modules || modules.hidden) return;

        for (const module of MODULES) {
            const link = side.querySelector<HTMLAnchorElement>(`a[data-section="${module.id}"]:not(.is-sub)`);

            if (module.always || !link?.hidden) continue;

            add({ section: "module", href: modules.href, name: module.name, kind: "off", icon: module.icon, area: areaName(module.category), text: module.description }, modules);
        }
    }

    /** Den Treffer im Namen hervorheben, wenn er wörtlich drinsteht. */
    function label(name: string, query: string): HTMLElement {
        const span = document.createElement("span");
        const at = query ? name.toLowerCase().indexOf(query.toLowerCase()) : -1;

        if (at < 0) {
            span.textContent = name;

            return span;
        }

        const mark = document.createElement("mark");

        mark.textContent = name.slice(at, at + query.length);
        span.append(name.slice(0, at), mark, name.slice(at + query.length));

        return span;
    }

    function paint(): void {
        for (const [index, option] of [...list.querySelectorAll<HTMLElement>("[role=option]")].entries()) option.setAttribute("aria-selected", String(index === active));

        const current = list.querySelector<HTMLElement>(`#navfind-${active}`);

        input.setAttribute("aria-activedescendant", current ? current.id : "");
        current?.scrollIntoView({ block: "nearest" });
    }

    function render(): void {
        const query = input.value.trim();
        // Ohne Eingabe: was in der Spalte des gewählten Bereichs steht.
        const area = areaName(nav.area());

        hits = query ? searchNav(entries, query) : browseNav(entries, area);
        active = 0;
        list.replaceChildren();

        // Ohne Eingabe eine Gruppe für den Bereich, sonst eine je Art.
        let kind: NavKind | null = null;
        let group: HTMLElement = list;

        for (const [index, hit] of hits.entries()) {
            if (group === list || (query && hit.kind !== kind)) {
                const head = document.createElement("div");

                kind = hit.kind;
                group = document.createElement("div");
                group.setAttribute("role", "group");
                group.setAttribute("aria-labelledby", `navfind-group-${index}`);
                head.className = "navfind__group";
                head.id = `navfind-group-${index}`;
                head.setAttribute("role", "presentation");
                head.textContent = query ? GROUP_NAMES[hit.kind] : (area ?? GROUP_NAMES.module);
                group.append(head);
                list.append(group);
            }

            const option = document.createElement("div");
            const where = document.createElement("small");

            option.className = "navfind__hit";
            option.id = `navfind-${index}`;
            option.setAttribute("role", "option");
            where.textContent = hit.kind === "off" ? "aus · unter Module einschalten" : (hit.module ?? hit.area ?? "");
            option.append(icon(hit.icon), label(hit.name, query), where);
            // Der Fokus bleibt im Feld, sonst tippt man nach einem Klick ins Leere.
            option.addEventListener("mousedown", (event) => event.preventDefault());
            option.addEventListener("click", () => go(index));
            option.addEventListener("mousemove", () => {
                if (active === index) return;

                active = index;
                paint();
            });
            group.append(option);
        }

        if (!hits.length) {
            const empty = document.createElement("p");

            empty.className = "navfind__empty";
            empty.textContent = query ? "Nichts gefunden." : "Tipp los, um zu suchen.";
            list.append(empty);
        }

        paint();
    }

    function close(): void {
        if (!dialog.open) return;

        dialog.close();
    }

    // Wie ein Klick in der Leiste: dieselbe Adresse, Eintrag im Verlauf, Rollen-Listen samt ?liste=.
    // Danach steht der Fokus auf dem Link der neuen Seite, nicht wieder dort, wo man vorher war.
    function go(index: number): void {
        const target = hits[index] ? targets.get(hits[index]) : undefined;

        if (target) before = target;
        close();
        target?.click();
    }

    function open(): void {
        // Ohne sichtbare Links gibt es nichts zu finden, der Knopf ist dann auch weg.
        if (dialog.open || find.hidden) return;

        before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        collect();
        input.value = "";
        render();
        dialog.showModal();
        input.focus();
    }

    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (!hits.length) return;

            active = (active + (event.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
            paint();
        } else if (event.key === "Enter") {
            event.preventDefault();
            go(active);
        }
    });
    // Klick neben das Fenster schließt es. Esc schließt <dialog> von selbst.
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) close();
    });
    dialog.addEventListener("close", () => before?.focus());
    find.addEventListener("click", open);

    const tap = new ShiftTap();

    document.addEventListener("keydown", (event) => {
        // Gehalten wiederholt der Browser keydown - das darf die Uhr nicht neu stellen.
        if (event.repeat) return;

        tap.down(event.code, event.timeStamp, busy() || event.ctrlKey || event.altKey || event.metaKey);

        if (busy() || event.altKey) return;

        const slash = event.key === "/" && !event.ctrlKey && !event.metaKey;
        const k = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.shiftKey;

        if (!slash && !k) return;

        event.preventDefault();
        open();
    });
    document.addEventListener("keyup", (event) => {
        if (tap.up(event.code, event.timeStamp)) open();
    });
    // Umschalt-Klick markiert Text oder öffnet einen Link im neuen Fenster - das ist kein Tippen auf die Taste.
    document.addEventListener("pointerdown", () => tap.cancel(), true);

    return { open };
}
