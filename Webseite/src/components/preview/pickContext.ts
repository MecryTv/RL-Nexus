import { createContext } from "react";

export type PickAction = "hoch" | "runter" | "kopie" | "weg" | "aus";

export interface IPickContext {
    readonly selected: string | null;
    readonly onPick: (part: string) => void;
    readonly onAction: (part: string, action: PickAction) => void;
}

/**
 * W-0062: Nur in der Vorschau für die Studios gesetzt. Ohne sie zeigt `Pick`
 * einfach den Inhalt, die echten Seiten merken davon nichts.
 */
export const PickContext = createContext<IPickContext | null>(null);
