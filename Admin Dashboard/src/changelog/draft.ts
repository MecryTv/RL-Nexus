import type { ChangeArea, ChangeKind, IVersionInput } from "../../shared/changelog.ts";

/** Eine Version im Formular, bevor checkVersionInput sie prüft. Die Aufgabe ist Text, leer heißt keine. */

export interface IDraftItem {
    /** Nur für React, damit Zeilen beim Verschieben ihren Zustand behalten. */
    readonly key: number;
    readonly kind: ChangeKind;
    readonly area: ChangeArea;
    readonly text: string;
    readonly task: string;
}

export interface IDraft {
    readonly version: string;
    readonly releasedOn: string;
    readonly title: string;
    readonly items: readonly IDraftItem[];
}

let nextKey = 1;

export const draftItem = (item: Partial<Omit<IDraftItem, "key">> = {}): IDraftItem => ({ key: nextKey++, kind: "neu", area: "bot", text: "", task: "", ...item });

/** Heute in Berlin als JJJJ-MM-TT. */
export const todayInBerlin = (): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

export function draftOf(version: IVersionInput | null): IDraft {
    if (!version) return { version: "", releasedOn: todayInBerlin(), title: "", items: [draftItem()] };

    return { version: version.version, releasedOn: version.releasedOn, title: version.title, items: version.items.map((item) => draftItem({ ...item, task: item.task ?? "" })) };
}
