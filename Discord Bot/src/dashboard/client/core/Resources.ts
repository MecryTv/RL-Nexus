/**
 * Kanäle, Rollen und Emojis bleiben im offenen Dashboard aktuell. Legt jemand
 * in Discord einen Kanal an, benennt eine Rolle um oder löscht ein Emoji,
 * meldet der Bot das über den Puls ("guild"). Die Seite holt die Listen dann
 * einmal neu und
 *
 *  - gleicht die Listen in den Antworten ab, die sie schon hat (data.guild,
 *    data.resources, data.targets): was sich später neu zeichnet, kennt den
 *    neuen Kanal;
 *  - trägt ihn in jedes offene Auswahlfeld ein, in dem schon Kanäle stehen,
 *    benennt Umbenanntes um und nimmt Gelöschtes heraus.
 *
 * Neu gezeichnet wird dabei nichts: was jemand gerade einträgt, bleibt stehen.
 * Die Rechnung steht in ResourceDiff.ts.
 */

import { BASE } from "./Base.js";
import { debounce, onPulse } from "./Pulse.js";
import { Bag, IOptionLike, isBag, KINDS, Known, learn, mergeList, planSelect, settle, Step } from "./ResourceDiff.js";

interface IState {
    /** Die Listen aus jeder Antwort, je Route und Feld die letzte. */
    bags: Map<string, Bag>;
    known: Known;
}

const guilds = new Map<string, IState>();

/** Merkt sich die Listen aus einer Antwort. Mit der ersten hört die Seite auf den Puls des Servers. */
export function trackResources(guildId: string, key: string, bag: unknown): void {
    if (!isBag(bag)) return;

    let state = guilds.get(guildId);

    if (!state) {
        const fresh: IState = { bags: new Map(), known: new Map() };

        state = fresh;
        guilds.set(guildId, fresh);
        onPulse(guildId, ["guild"], debounce(() => void refresh(guildId, fresh), 250));
    }

    state.bags.set(key, bag);
    learn(state.known, bag);
}

/** Jede Antwort einer Modul-Route: die Listen stehen unter guild, resources oder targets. */
export function trackAnswer(base: string, key: string, answer: unknown): void {
    const guildId = /\/api\/guild\/(\d{17,20})(?:\/|$)/.exec(base)?.[1];

    if (!guildId || typeof answer !== "object" || answer === null) return;

    for (const field of ["guild", "resources", "targets"]) trackResources(guildId, `${key}#${field}`, (answer as Record<string, unknown>)[field]);
}

async function refresh(guildId: string, state: IState): Promise<void> {
    let fresh: Bag;

    try {
        const response = await fetch(`${BASE}/api/guild/${encodeURIComponent(guildId)}/resources`, { headers: { Accept: "application/json" } });

        if (!response.ok) return;

        fresh = (await response.json()) as Bag;
    } catch {
        return;
    }

    // Beides gegen den alten Stand: erst die Daten der Seiten, dann die offenen Felder.
    for (const bag of state.bags.values()) {
        for (const kind of KINDS) {
            const list = bag[kind];
            const next = fresh[kind];

            if (list && next) mergeList(list, next, state.known);
        }
    }

    for (const select of document.querySelectorAll("select")) {
        const options: IOptionLike[] = [...select.options].map((option) => ({ value: option.value, text: option.text, selected: option.selected }));

        apply(select, planSelect(options, state.known, fresh));
    }

    settle(state.known, fresh);
}

function apply(select: HTMLSelectElement, steps: Step[]): void {
    const find = (value: string | null): HTMLOptionElement | null => (value === null ? null : ([...select.options].find((option) => option.value === value) ?? null));

    for (const step of steps) {
        if (step.op === "drop") {
            find(step.value)?.remove();
            continue;
        }

        if (step.op === "text") {
            const option = find(step.value);

            if (option) option.text = step.text;

            continue;
        }

        const option = new Option(step.text, step.value);
        const before = find(step.before);
        const after = find(step.after);

        if (before) before.before(option);
        else if (after) after.after(option);
        else select.append(option);
    }
}
