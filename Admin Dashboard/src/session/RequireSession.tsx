import type { JSX, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Centered, Failure, Loading } from "../components/Status";
import { useSession } from "./context";

/** Lässt nur Angemeldete durch. Alle anderen gehen zur Anmeldung und kommen danach hierher zurück. */
export function RequireSession({ children }: { readonly children: ReactNode }): JSX.Element {
    const { state, reload } = useSession();
    const location = useLocation();

    if (state.status === "loading") {
        return (
            <Centered>
                <Loading label="Anmeldung wird geprüft" />
            </Centered>
        );
    }

    if (state.status === "error") {
        return (
            <Centered>
                <Failure message={state.message} onRetry={reload} />
            </Centered>
        );
    }

    if (state.status === "signed-out") {
        const target = `${location.pathname}${location.search}`;

        return <Navigate to={target === "/" ? "/anmelden" : `/anmelden?return=${encodeURIComponent(target)}`} replace />;
    }

    return <>{children}</>;
}
