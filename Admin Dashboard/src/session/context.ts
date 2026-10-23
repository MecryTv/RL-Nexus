import { createContext, useContext } from "react";
import type { IMe } from "../../shared/api";

export type SessionState =
    | { readonly status: "loading" }
    | { readonly status: "signed-out" }
    | { readonly status: "error"; readonly message: string }
    | { readonly status: "signed-in"; readonly me: IMe };

export interface ISessionContext {
    readonly state: SessionState;
    readonly reload: () => void;
    readonly signOut: () => Promise<void>;
}

export const SessionContext = createContext<ISessionContext | null>(null);

export function useSession(): ISessionContext {
    const value = useContext(SessionContext);
    if (value === null) throw new Error("useSession() braucht den SessionProvider.");

    return value;
}

/** Wer angemeldet ist. Nur innerhalb von RequireSession aufrufen, dort ist es sicher gesetzt. */
export function useMe(): IMe {
    const { state } = useSession();
    if (state.status !== "signed-in") throw new Error("useMe() außerhalb von RequireSession.");

    return state.me;
}
