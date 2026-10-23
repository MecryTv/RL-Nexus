import { useEffect } from "react";

/** Der Titel im Tab: erst die Seite, dann der Name. */
export function useTitle(title: string): void {
    useEffect(() => {
        document.title = `${title} · RL Nexus Admin`;
    }, [title]);
}
