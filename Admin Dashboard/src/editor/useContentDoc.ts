import { useCallback, useEffect, useState } from "react";
import type { IEnvelope } from "../../shared/content";
import { ApiError, api } from "../api/client";
import { useToast } from "../toast/context";

export interface IContentDoc<T> {
    /** null: lädt noch oder Laden ist gescheitert (dann steht der Grund in loadError). */
    readonly saved: IEnvelope<T> | null;
    /** Der bearbeitete Stand. Nur gültig, wenn saved nicht null ist. */
    readonly draft: T;
    readonly loadError: string | null;
    /** Was beim letzten Speichern nicht gepasst hat, als Satz des Servers. */
    readonly problem: string | null;
    /** Jemand anderes hat inzwischen gespeichert. Hilft nur Neuladen. */
    readonly conflict: boolean;
    readonly dirty: boolean;
    readonly busy: boolean;
    readonly update: (change: (draft: T) => T) => void;
    readonly discard: () => void;
    /** Speichert den Entwurf, oder `next`, wenn angegeben (für Änderungen, die sofort gelten sollen). */
    readonly save: (next?: T) => Promise<boolean>;
    readonly reset: () => Promise<void>;
    readonly reload: () => void;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Ein Inhalt der Webseite im Editor: laden, bearbeiten, speichern,
 * zurücksetzen. Gespeichert wird mit der Revision, die geladen wurde. Hat
 * inzwischen jemand anderes gespeichert, antwortet der Server 409, und der
 * Editor bietet Neuladen an statt zu überschreiben.
 */
export function useContentDoc<T>(path: string): IContentDoc<T> {
    const notify = useToast();
    const [doc, setDoc] = useState<{ readonly saved: IEnvelope<T>; readonly draft: T } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const controller = new AbortController();

        api<IEnvelope<T>>(path, { signal: controller.signal })
            .then((saved) => {
                setDoc({ saved, draft: saved.data });
                setLoadError(null);
                setProblem(null);
                setConflict(false);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) setLoadError(messageOf(failure));
            });

        return () => controller.abort();
    }, [path, tick]);

    const update = useCallback((change: (draft: T) => T) => setDoc((current) => current && { ...current, draft: change(current.draft) }), []);

    const discard = useCallback(() => {
        setDoc((current) => current && { ...current, draft: current.saved.data });
        setProblem(null);
    }, []);

    const reload = useCallback(() => setTick((value) => value + 1), []);

    async function save(next?: T): Promise<boolean> {
        if (doc === null) return false;

        const sent = next ?? doc.draft;

        setBusy(true);

        try {
            const saved = await api<IEnvelope<T>>(path, { method: "PUT", body: { revision: doc.saved.revision, data: sent } });

            // Wer während des Speicherns weitergetippt hat, behält das: dann
            // ist der Entwurf neuer als das Gespeicherte und bleibt stehen.
            setDoc((current) => ({ saved, draft: current !== null && current.draft !== doc.draft ? current.draft : saved.data }));
            setProblem(null);
            setConflict(false);
            notify("Gespeichert");

            return true;
        } catch (failure) {
            setConflict(failure instanceof ApiError && failure.status === 409);
            setProblem(messageOf(failure));

            return false;
        } finally {
            setBusy(false);
        }
    }

    async function reset(): Promise<void> {
        setBusy(true);

        try {
            const saved = await api<IEnvelope<T>>(path, { method: "DELETE" });

            setDoc({ saved, draft: saved.data });
            setProblem(null);
            setConflict(false);
            notify("Auf den Stand der Webseite zurückgesetzt");
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    }

    return {
        saved: doc?.saved ?? null,
        draft: doc?.draft as T,
        loadError,
        problem,
        conflict,
        dirty: doc !== null && JSON.stringify(doc.draft) !== JSON.stringify(doc.saved.data),
        busy,
        update,
        discard,
        save,
        reset,
        reload,
    };
}
