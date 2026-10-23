import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./client";

export interface IApiState<T> {
    readonly data: T | null;
    readonly error: ApiError | null;
    /** Nur beim allerersten Laden true. Danach bleiben alte Daten stehen, bis neue da sind. */
    readonly loading: boolean;
    readonly updatedAt: number | null;
    readonly reload: () => void;
}

/**
 * Holt Daten von der API. Mit `interval` fragt der Hook regelmäßig nach, aber
 * nur, solange der Tab sichtbar ist, und sofort, wenn er wieder sichtbar wird.
 */
export function useApi<T>(path: string, interval?: number): IApiState<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [tick, setTick] = useState(0);

    const reload = useCallback(() => setTick((value) => value + 1), []);

    useEffect(() => {
        const controller = new AbortController();

        api<T>(path, { signal: controller.signal })
            .then((value) => {
                setData(value);
                setError(null);
                setUpdatedAt(Date.now());
            })
            .catch((reason: unknown) => {
                if (controller.signal.aborted) return;

                setError(reason instanceof ApiError ? reason : new ApiError(0, String(reason)));
            });

        return () => controller.abort();
    }, [path, tick]);

    useEffect(() => {
        if (!interval) return;

        const refresh = (): void => {
            if (document.visibilityState === "visible") reload();
        };

        const timer = window.setInterval(refresh, interval);
        document.addEventListener("visibilitychange", refresh);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [interval, reload]);

    return { data, error, loading: data === null && error === null, updatedAt, reload };
}
