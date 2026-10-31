/**
 * Plan 36: die Studio-Hülle, die jeder Builder im Dashboard nutzt (Spec
 * 2026-10-31-studio-design.md, Entwurf builder-varianten.html Variante A).
 *
 * Oben die Leiste, links Fächer mit Symbol und Beschriftung (eins klappt
 * daneben auf), in der Mitte die Bühne, rechts der Inspektor. Die Hülle
 * kennt keinen Inhalt: Bühne, Fächer und Inspektor füllt der Builder.
 * Rechnen (Rückgängig, Einrasten, Kürzel) liegt in StudioCore.ts.
 */

import { icon } from "../core/Dom.js";
import { button, el } from "../core/Ui.js";
import { shortcutOwner, studioShortcut } from "./StudioCore.js";

export interface IStudioPanel {
    id: string;
    label: string;
    /** Symbol aus dem Sprite, etwa "#i-image". */
    icon: string;
    /** Füllt das Fach, das daneben aufklappt. Ohne: das Fach öffnet nichts daneben, nur `onPanel` meldet es. */
    render?: (host: HTMLElement) => void;
}

export interface IStudioOptions {
    title: string;
    /** Steht neben dem Titel - etwa Reiter oder die Art einer Nachricht. */
    head?: HTMLElement;
    panels: IStudioPanel[];
    open?: string | null;
    /** Einrasten, Raster und Zoom - nur bei Bild-Bühnen. */
    stageTools?: boolean;
    pill?: string;
    onUndo: () => void;
    onRedo: () => void;
    onPanel?: (id: string | null) => void;
    test?: () => Promise<void>;
    save?: () => Promise<boolean>;
    /** Plan 40: den Speichern-Knopf der Seite spiegeln - an, wenn er an ist; ein Klick klickt ihn. */
    mirror?: () => HTMLButtonElement | null;
    /** Weitere Knöpfe rechts in der Leiste. */
    extra?: HTMLElement[];
}

export type StudioZoom = "fit" | 1 | 1.5;

export interface IStudio {
    root: HTMLElement;
    canvas: HTMLElement;
    inspector: HTMLElement;
    setHistory(canUndo: boolean, canRedo: boolean): void;
    setDirty(dirty: boolean): void;
    openPanel(id: string | null): void;
    refreshPanel(): void;
    /** Plan 42: andere Fächer links - etwa für die eigene Art einer Nachricht. Das offene Fach schließt. */
    setPanels(panels: IStudioPanel[]): void;
    panel(): string | null;
    snap(): boolean;
    grid(): boolean;
    zoom(): StudioZoom;
    onTools(handler: () => void): void;
}

const NS = "http://www.w3.org/2000/svg";

/** Die paar Symbole, die das Sprite nicht hat. */
const PATHS = {
    undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
    redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
    magnet: "m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15M5 8l4 4M12 15l4 4",
    grid: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
    send: "m22 2-7 20-4-9-9-4ZM22 2 11 13",
} as const;

/** Ein Strich-Symbol aus einem Pfad (24 × 24), für alles, was das Sprite nicht hat. */
export function pathIcon(d: string): SVGSVGElement {
    const svg = document.createElementNS(NS, "svg");
    const path = document.createElementNS(NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("sto-glyph");
    path.setAttribute("d", d);
    svg.append(path);

    return svg;
}

export function glyph(name: keyof typeof PATHS): SVGSVGElement {
    return pathIcon(PATHS[name]);
}

/** Ein Knopf nur mit Symbol - immer mit Namen für Screenreader und Tooltip. */
export function iconButton(symbol: SVGSVGElement, label: string, className = "sto-ib"): HTMLButtonElement {
    const action = button(className, symbol);

    action.title = label;
    action.setAttribute("aria-label", label);

    return action;
}

/* Ungespeichertes in irgendeinem Studio: der Browser fragt vor dem Verlassen. */
const dirtyStudios = new Set<HTMLElement>();

window.addEventListener("beforeunload", (event) => {
    if (![...dirtyStudios].some((root) => root.isConnected)) return;

    event.preventDefault();
    event.returnValue = "";
});

/*
 * Review I1: Kürzel hören auf dem Dokument. Viele Aktionen bauen den Knopf
 * neu, der den Fokus hatte - dann liegt er auf der Seite, und Strg+Z ginge
 * sonst ins Leere. shortcutOwner entscheidet, welches Studio es bekommt.
 */
const keyStudios = new Set<{ root: HTMLElement; undo: () => void; redo: () => void; recent: number }>();
let touched = 0;

document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const list = [...keyStudios].filter((entry) => entry.root.isConnected);
    const loose = !target || target === document.body || target === document.documentElement;
    const owner = list[shortcutOwner(list.map((entry) => ({ inside: Boolean(target && entry.root.contains(target)), visible: entry.root.getClientRects().length > 0, recent: entry.recent })), loose)];

    if (!owner) return;

    const action = studioShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, target: target as (HTMLElement & { type?: string }) | null });

    if (!action) return;

    event.preventDefault();

    if (action === "undo") owner.undo();
    else owner.redo();
});

export function studio(host: HTMLElement, options: IStudioOptions): IStudio {
    let open: string | null = options.open ?? null;
    let snapOn = true;
    let gridOn = false;
    let zoom: StudioZoom = "fit";
    const toolHandlers: (() => void)[] = [];

    const undo = iconButton(glyph("undo"), "Rückgängig (Strg+Z)");
    const redo = iconButton(glyph("redo"), "Wiederholen (Strg+Y)");
    const fly = el("div", "sto__fly");
    const rail = el("nav", "sto__rail");
    const canvas = el("div", "sto__canvas");
    const inspector = el("aside", "sto__insp");
    const top = el("div", "sto__top", el("span", "sto__title", options.title));
    const root = el("div", "sto", top, rail, fly, canvas, inspector);

    rail.setAttribute("aria-label", "Fächer");
    inspector.setAttribute("aria-label", "Einstellungen");
    undo.disabled = redo.disabled = true;

    if (options.head) top.append(options.head);

    top.append(undo, redo);
    undo.addEventListener("click", () => options.onUndo());
    redo.addEventListener("click", () => options.onRedo());

    if (options.stageTools) {
        const snap = iconButton(glyph("magnet"), "Einrasten");
        const grid = iconButton(glyph("grid"), "Raster 10 px");
        const zooms = el("div", "sto-seg sto-zoom");
        const tools = (): void => {
            snap.setAttribute("aria-pressed", String(snapOn));
            grid.setAttribute("aria-pressed", String(gridOn));

            for (const option of zooms.querySelectorAll<HTMLButtonElement>("button")) option.setAttribute("aria-pressed", String(option.dataset.zoom === String(zoom)));

            for (const handler of toolHandlers) handler();
        };

        snap.addEventListener("click", () => {
            snapOn = !snapOn;
            tools();
        });
        grid.addEventListener("click", () => {
            gridOn = !gridOn;
            tools();
        });

        for (const [value, label] of [["fit", "Einpassen"], ["1", "100 %"], ["1.5", "150 %"]] as const) {
            const option = button("", label);

            option.dataset.zoom = value;
            option.addEventListener("click", () => {
                zoom = value === "fit" ? "fit" : (Number(value) as 1 | 1.5);
                tools();
            });
            zooms.append(option);
        }

        zooms.setAttribute("aria-label", "Zoom");
        top.append(el("span", "sto-sep"), snap, grid, zooms);
        queueMicrotask(tools);
    }

    if (options.pill) top.append(el("span", "sto-pill", el("i", ""), options.pill));

    top.append(el("span", "sto-grow"), ...(options.extra ?? []));

    let saveButton: HTMLButtonElement | null = null;

    if (options.test) {
        const test = button("sto-bt", glyph("send"), "Test senden");
        const run = options.test;

        test.addEventListener("click", async () => {
            test.disabled = true;
            await run();
            test.disabled = false;
        });
        top.append(test);
    }

    if (options.save) {
        const save = button("sto-bt sto-bt--primary", icon("#i-check"), "Speichern");
        const run = options.save;

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;
            save.classList.add("is-busy");

            const ok = await run();

            save.classList.remove("is-busy");
            if (!ok) save.disabled = false;
        });
        top.append(save);
        saveButton = save;
    }

    if (options.mirror) {
        const save = button("sto-bt sto-bt--primary", icon("#i-check"), "Speichern");
        const find = options.mirror;
        const sync = (target: HTMLButtonElement | null): void => {
            save.disabled = !target || target.disabled;

            // Hat die Seite Ungespeichertes, fragt der Browser vor dem Verlassen (Spec Teil 1).
            if (save.disabled) dirtyStudios.delete(root);
            else dirtyStudios.add(root);
        };

        save.disabled = true;
        save.addEventListener("click", () => find()?.click());
        top.append(save);

        // Den Knopf der Seite baut sie oft erst nach dem Studio, im selben Durchlauf.
        queueMicrotask(() => {
            const target = find();

            sync(target);

            if (target) new MutationObserver(() => sync(target)).observe(target, { attributes: true, attributeFilter: ["disabled"] });
        });
    }

    /* --- Fächer --- */
    const railButtons = new Map<string, HTMLButtonElement>();
    let panels = options.panels;

    function buildRail(): void {
        railButtons.clear();
        rail.replaceChildren();

        for (const panel of panels) {
            const tab = button("sto-rail", icon(panel.icon), el("span", "", panel.label));

            tab.addEventListener("click", () => openPanel(open === panel.id ? null : panel.id));
            railButtons.set(panel.id, tab);
            rail.append(tab);
        }
    }

    buildRail();

    function openPanel(id: string | null): void {
        open = id;

        for (const [panelId, tab] of railButtons) tab.setAttribute("aria-pressed", String(panelId === id));

        const panel = panels.find((entry) => entry.id === id);

        fly.replaceChildren();
        root.classList.toggle("is-fly", Boolean(panel?.render));

        if (panel?.render) panel.render(fly);

        options.onPanel?.(id);
    }

    /* --- Kürzel: siehe keyStudios oben; wer zuletzt benutzt wurde, gewinnt, wenn der Fokus auf der Seite liegt --- */
    const entry = { root, undo: options.onUndo, redo: options.onRedo, recent: 0 };
    const mark = (): void => void (entry.recent = ++touched);

    root.addEventListener("pointerdown", mark);
    root.addEventListener("focusin", mark);
    keyStudios.add(entry);

    host.classList.add("sto-wrap");
    host.replaceChildren(root);

    // Gefüllt wird erst, wenn der Builder bereit ist - er ruft openPanel selbst.
    for (const [panelId, tab] of railButtons) tab.setAttribute("aria-pressed", String(panelId === open));

    return {
        root,
        canvas,
        inspector,
        setHistory(canUndo, canRedo) {
            undo.disabled = !canUndo;
            redo.disabled = !canRedo;
        },
        setDirty(dirty) {
            if (saveButton && !saveButton.classList.contains("is-busy")) saveButton.disabled = !dirty;
            if (dirty) dirtyStudios.add(root);
            else dirtyStudios.delete(root);
        },
        openPanel,
        refreshPanel: () => openPanel(open),
        setPanels(next) {
            panels = next;
            buildRail();
            openPanel(null);
        },
        panel: () => open,
        snap: () => snapOn,
        grid: () => gridOn,
        zoom: () => zoom,
        onTools: (handler) => void toolHandlers.push(handler),
    };
}
