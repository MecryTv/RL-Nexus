import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { afterSave, History } from "./history.ts";
import { studioShortcut } from "./shortcut.ts";

export interface IStudioDoc<T> {
    readonly value: T;
    /** Neuer Stand. `key` fasst Tippen im selben Feld zu einem Schritt zusammen. */
    readonly set: (next: T, key?: string) => void;
    readonly undo: () => void;
    readonly redo: () => void;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /** Anders als der zuletzt gespeicherte Stand. */
    readonly dirty: boolean;
    /** Nach dem Speichern: der Stand des Servers gilt als gespeichert und wird übernommen. */
    /** `sent`: der Entwurf, der geschickt wurde. Wer seitdem weitergetippt hat, behält das Getippte. */
    readonly markSaved: (saved: T, sent?: T) => void;
    /** Ein anderer Eintrag ist geladen: Stand ersetzen, Rückgängig leeren. */
    readonly reset: (next: T) => void;
}

/**
 * W-0062 Teil 2: der Entwurf eines Studios mit Rückgängig und Wiederholen
 * (50 Schritte) und den Kürzeln Strg+Z, Strg+Y, Strg+Umschalt+Z. In
 * Textfeldern gilt das Rückgängig des Browsers.
 */
export function useStudioDoc<T>(initial: T): IStudioDoc<T> {
    const history = useRef<History<T>>(null);
    const [value, setValue] = useState(initial);
    const [saved, setSaved] = useState(() => JSON.stringify(initial));
    const [steps, setSteps] = useState({ canUndo: false, canRedo: false });
    const current = useRef(value);

    history.current ??= new History<T>();

    useLayoutEffect(() => {
        current.current = value;
    }, [value]);

    const sync = useCallback((): void => {
        const stack = history.current!;

        setSteps({ canUndo: stack.canUndo, canRedo: stack.canRedo });
    }, []);

    const set = useCallback(
        (next: T, key = ""): void => {
            history.current!.remember(current.current, key);
            current.current = next;
            setValue(next);
            sync();
        },
        [sync]
    );

    const undo = useCallback((): void => {
        const previous = history.current!.undo(current.current);

        if (previous === null) return;

        current.current = previous;
        setValue(previous);
        sync();
    }, [sync]);

    const redo = useCallback((): void => {
        const next = history.current!.redo(current.current);

        if (next === null) return;

        current.current = next;
        setValue(next);
        sync();
    }, [sync]);

    const markSaved = useCallback((next: T, sent?: T): void => {
        const value = sent === undefined ? next : afterSave(current.current, sent, next);

        current.current = value;
        setValue(value);
        setSaved(JSON.stringify(next));
    }, []);

    const reset = useCallback(
        (next: T): void => {
            history.current!.clear();
            current.current = next;
            setValue(next);
            setSaved(JSON.stringify(next));
            sync();
        },
        [sync]
    );

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            const action = studioShortcut(event);

            if (!action) return;

            event.preventDefault();

            if (action === "undo") undo();
            else redo();
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [undo, redo]);

    const dirty = useMemo(() => JSON.stringify(value) !== saved, [value, saved]);

    return { value, set, undo, redo, canUndo: steps.canUndo, canRedo: steps.canRedo, dirty, markSaved, reset };
}
