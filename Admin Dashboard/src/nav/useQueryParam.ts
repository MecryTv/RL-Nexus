import { useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Der Suchbegriff einer Liste, vorbelegt aus `?q=`: Ein Treffer der Suche
 * (W-0059) öffnet die Seite schon gefiltert, auch wenn sie schon offen ist.
 * Tippen ins Feld ändert die Adresse nicht.
 */
export function useQueryParam(): [string, Dispatch<SetStateAction<string>>] {
    const [params] = useSearchParams();
    const given = params.get("q") ?? "";
    const [value, setValue] = useState(given);
    const [seen, setSeen] = useState(given);

    // Neue Adresse, neuer Begriff: beim Rendern angleichen statt in einem Effekt.
    if (seen !== given) {
        setSeen(given);
        setValue(given);
    }

    return [value, setValue];
}
