/**
 * Die Vorlagen-Leiste über einem Editor.
 *
 * Ein Klick füllt den Editor mit einer fertigen Nachricht. Weil das den
 * bisherigen Inhalt ersetzt, merkt sich die Leiste den Stand davor und bietet
 * ihn als „Zurück" an - einmal, bis zur nächsten Vorlage.
 */

import { icon } from "../core/Dom.js";
import { button, el } from "../core/Ui.js";
import { ITemplate, TEMPLATES, TemplateScope } from "../constants/Templates.js";

export interface ITemplateHandlers<T, P = ITemplate> {
    /** Der Stand vor dem Klick - er landet hinter „Zurück". */
    take: () => T;
    /** Diesen Stand wiederherstellen. */
    put: (state: T) => void;
    /** Die Vorlage übernehmen. */
    apply: (template: P) => void;
}

export function templateBar<T>(scope: TemplateScope, handlers: ITemplateHandlers<T>): HTMLElement {
    return presetBar(TEMPLATES[scope] ?? [], handlers);
}

/** Dieselbe Leiste für alles, was einen Namen und einen Satz dazu hat - etwa die Vorlagen der Teams-Liste. */
export function presetBar<T, P extends { name: string; hint: string }>(list: P[], handlers: ITemplateHandlers<T, P>): HTMLElement {
    const box = el("div", "tplbar");
    let previous: T | null = null;

    const draw = (): void => {
        const undo = button("btn btn--quiet tplbar__undo", icon("#i-refresh"), "Zurück");

        undo.title = "Den Stand vor der Vorlage wiederherstellen";
        undo.addEventListener("click", () => {
            if (previous === null) return;

            handlers.put(previous);
            previous = null;
            draw();
        });

        box.replaceChildren(
            el("span", "tplbar__cap", "Vorlagen"),
            el(
                "div",
                "tplbar__list",
                ...list.map((template) => {
                    const chip = button("tplchip", el("b", "", template.name), el("span", "", template.hint));

                    chip.title = template.hint;
                    chip.addEventListener("click", () => {
                        previous = handlers.take();
                        handlers.apply(template);
                        draw();
                    });

                    return chip;
                })
            ),
            ...(previous === null ? [] : [undo])
        );
    };

    draw();

    return box;
}
