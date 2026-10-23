import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import type { IMe } from "../../shared/api";
import { ApiError, SIGNED_OUT, api } from "../api/client";
import { SessionContext, type SessionState } from "./context";

/**
 * Wer angemeldet ist, einmal beim Laden geholt. Bekommt später irgendeine
 * Anfrage 401 (Sitzung abgelaufen, Rolle weg), meldet api() das als Ereignis,
 * und jede Seite landet wieder bei der Anmeldung.
 */
export function SessionProvider({ children }: { readonly children: ReactNode }): JSX.Element {
    const [state, setState] = useState<SessionState>({ status: "loading" });

    const load = useCallback(() => {
        api<IMe>("/api/me")
            .then((me) => setState({ status: "signed-in", me }))
            .catch((error: unknown) => {
                if (error instanceof ApiError && error.status === 401) setState({ status: "signed-out" });
                else setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
            });
    }, []);

    /** Für „Neu laden“: erst zurück auf „lädt“, dann fragen. Beim Start steht der Zustand schon dort. */
    const reload = useCallback(() => {
        setState({ status: "loading" });
        load();
    }, [load]);

    const signOut = useCallback(async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        setState({ status: "signed-out" });
    }, []);

    useEffect(() => load(), [load]);

    useEffect(() => {
        const onSignedOut = (): void => setState({ status: "signed-out" });

        window.addEventListener(SIGNED_OUT, onSignedOut);

        return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
    }, []);

    const value = useMemo(() => ({ state, reload, signOut }), [state, reload, signOut]);

    return <SessionContext value={value}>{children}</SessionContext>;
}
