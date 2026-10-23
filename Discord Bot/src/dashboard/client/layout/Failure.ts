/**
 * Wenn der Inhalt nicht kommt.
 *
 * Dieselbe Ansage wie auf der Fehlerseite des Bots (public/error.html), nur
 * eben im Browser gebaut: Wer auf einer Seite sitzt, deren Daten nicht laden,
 * soll nicht auf ein Skelett starren, das nie fertig wird.
 *
 * Gleiche Klassen, gleiches Aussehen - wer eine der beiden anfasst, sollte auch
 * die andere ansehen.
 */

import { BASE } from "../core/Base.js";
import { icon } from "../core/Dom.js";
import { el } from "../core/Ui.js";

export interface IFailure {
    /** Was oben in der Marke steht - "503", "Offline", "Fehler". */
    code: string;
    title: string;
    text: string;
    /** Die kleine Zeile unter den Knöpfen. */
    hint?: string;
    /** Der erste Knopf. Ohne Angabe führt er zur Übersicht. */
    action?: { label: string; href: string };
}

/**
 * Zeichnet die Ansage in den Hauptbereich der Seite. Der zweite Knopf lädt
 * immer neu - ein leerer Link zeigt auf genau diese Adresse und braucht kein
 * Skript.
 */
export function showFailure(failure: IFailure): void {
    const host = document.querySelector("main");

    if (!host) return;

    const action = failure.action ?? { label: "Zur Übersicht", href: `${BASE}/` };
    const go = el("a", "erract erract--go");
    const again = el("a", "erract");

    go.href = action.href;
    go.append(action.label, icon("#i-arrow"));

    again.href = "";
    again.append(icon("#i-refresh"), "Neu laden");

    host.replaceChildren(
        el(
            "div",
            "stage",
            el(
                "div",
                "empty empty--error errpage",
                el("span", "empty__mark", icon("#i-warn")),
                el("span", "errcode", failure.code),
                el("h2", "", failure.title),
                el("p", "", failure.text),
                el("div", "erracts", go, again),
                ...(failure.hint ? [el("p", "errhint", failure.hint)] : [])
            )
        )
    );
}
