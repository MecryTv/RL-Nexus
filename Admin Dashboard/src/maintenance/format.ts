import { whenText, type IMaintenanceState } from "../../shared/maintenance.ts";

/**
 * Kleine Texte der Seite „Wartung“, ohne DOM, damit sie im Check mitlaufen.
 */

/** „1 Std. 30 Min.“, „45 Min.“, „2 Std.“ – auf volle Minuten gerundet. */
function span(ms: number): string {
    const minutes = Math.max(0, Math.round(ms / 60_000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) return `${rest} Min.`;

    return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
}

/** Die Zeile unter dem Abzeichen: ob und wann die Wartung von selbst endet. */
export function rowLine(state: IMaintenanceState, now: Date): string {
    if (state.endsAt === null) return "Ohne Endzeit: läuft, bis du sie beendest.";

    const when = whenText(state.endsAt, now);
    const left = Date.parse(state.endsAt) - now.getTime();

    if (state.autoEnd) return `Endet automatisch ${when}, in ${span(left)}`;
    if (left <= 0) return `Die Endzeit ${when} ist vorbei, die Wartung läuft noch.`;

    return `Endzeit ${when}, beendet sich aber nicht selbst.`;
}

/** Die Schnellwahl im Dialog: jetzt plus so viele Minuten, aufgerundet auf die nächste volle Minute. */
export function quickEnd(minutes: number, now: Date): string {
    return new Date(Math.ceil((now.getTime() + minutes * 60_000) / 60_000) * 60_000).toISOString();
}

/**
 * Neue Endzeit im Dialog. Kommt sie neu dazu, ist „automatisch beenden“ an:
 * Bei einer laufenden Wartung ohne Endzeit ist der Haken aus, und ein Datum
 * allein beendete sie sonst nie. Danach entscheidet der Haken.
 */
export function withEnd<T extends { readonly endsAt: string | undefined; readonly autoEnd: boolean }>(draft: T, endsAt: string | undefined): T {
    return { ...draft, endsAt, autoEnd: draft.endsAt === undefined && endsAt !== undefined ? true : draft.autoEnd };
}
