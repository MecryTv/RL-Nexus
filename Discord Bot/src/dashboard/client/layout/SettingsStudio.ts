/**
 * Plan 41: das Studio für Builder ohne Baukasten (Spec 2026-10-31-studio-design.md,
 * Teil 4) - Rollen-Listen-Bild und Team-Karte. Links die Bereiche als Fächer, in
 * der Mitte das Bild des Bots, rechts die Einstellungen des offenen Bereichs.
 *
 * Die Zeilen baut der Builder wie bisher. Rückgängig merkt sich, was `take`
 * liefert, und gibt es über `put` zurück; der Builder ruft `remember` vor jeder
 * Änderung.
 */

import { el } from "../core/Ui.js";
import { studio } from "./Studio.js";
import { History } from "./StudioCore.js";

export interface ISettingsPanel {
    id: string;
    label: string;
    /** Symbol aus dem Sprite, etwa "#i-image". */
    icon: string;
    rows: () => HTMLElement[];
}

export interface ISettingsStudioOptions<T> {
    title: string;
    panels: ISettingsPanel[];
    open?: string;
    /** Das Bild in der Mitte - die Seite füllt es, sobald der Bot gezeichnet hat. */
    stage: HTMLElement;
    take: () => T;
    put: (state: T) => void;
    pageSave?: () => HTMLButtonElement | null;
    extra?: HTMLElement[];
    /** Ein anderes Fach ist offen - etwa um es beim nächsten Aufbau wieder zu öffnen. */
    onOpen?: (id: string) => void;
}

export interface ISettingsStudio {
    /** Vor jeder Änderung. Gleicher Schlüssel kurz hintereinander (Tippen, Regler) ist ein Schritt. */
    remember(key?: string): void;
    /** Den Inspektor neu bauen, etwa wenn eine Wahl Zeilen ein- oder ausblendet. Das Fach bleibt offen. */
    repaint(): void;
    /** Rückgängig vergisst alles - etwa nach dem Wechsel zu einem anderen Team. */
    forget(): void;
}

export function settingsStudio<T>(host: HTMLElement, options: ISettingsStudioOptions<T>): ISettingsStudio {
    const history = new History<T>();
    let open = options.open ?? options.panels[0]!.id;

    const s = studio(host, {
        title: options.title,
        panels: options.panels.map(({ id, label, icon }) => ({ id, label, icon })),
        open,
        onUndo: () => travel(history.undo(options.take())),
        onRedo: () => travel(history.redo(options.take())),
        // Ein Bereich ist immer offen - ein zweiter Klick auf den offenen schließt ihn nicht.
        onPanel: (id) => {
            if (id === null) return s.openPanel(open);

            open = id;
            options.onOpen?.(id);
            paint();
        },
        ...(options.pageSave ? { mirror: options.pageSave } : {}),
        ...(options.extra ? { extra: options.extra } : {}),
    });

    s.canvas.classList.add("sto-setcanvas");
    s.canvas.append(options.stage);

    function paint(): void {
        const panel = options.panels.find((entry) => entry.id === open) ?? options.panels[0]!;
        // Wer gerade in einem Feld oder auf einem Knopf war, bleibt dort - auch wenn eine Wahl Zeilen ein- oder
        // ausblendet. Erst nach dem Namen; fehlt er oder gibt es ihn doppelt, nach der Stelle unter den Bedienelementen.
        const controls = (): HTMLElement[] => [...s.inspector.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")];
        const active = document.activeElement instanceof HTMLElement && s.inspector.contains(document.activeElement) ? document.activeElement : null;
        const name = active?.getAttribute("aria-label") ?? null;
        const index = active ? controls().indexOf(active) : -1;

        s.inspector.replaceChildren(el("section", "sto-group sto-rows", el("h3", "sto-h", panel.label), ...panel.rows()));

        if (!active) return;

        const now = controls();
        const named = name ? now.filter((control) => control.getAttribute("aria-label") === name) : [];

        (named.length === 1 ? named[0] : (now[index] ?? named[0]))?.focus();
    }

    function travel(state: T | null): void {
        if (state === null) return;

        options.put(state);
        paint();
        s.setHistory(history.canUndo, history.canRedo);
    }

    paint();

    return {
        remember(key = "") {
            history.remember(options.take(), key);
            s.setHistory(history.canUndo, history.canRedo);
        },
        repaint: paint,
        forget() {
            history.clear();
            s.setHistory(false, false);
        },
    };
}
