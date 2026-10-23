import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useMe } from "./context";

/**
 * Developer-Seiten. Der Server lehnt ohne die Rolle ohnehin mit 403 ab, das
 * hier spart nur die Fehlermeldung: Wer über einen alten Link kommt, liest
 * gleich, warum es nicht geht.
 */
export function RequireDeveloper({ children }: { readonly children: ReactNode }): JSX.Element {
    const me = useMe();

    if (me.role === "developer") return <>{children}</>;

    return (
        <>
            <PageHeader title="Nur für Developer" />
            <p>
                Für diese Seite brauchst du die Developer-Rolle auf dem Discord-Server. <Link to="/">Zur Übersicht</Link>
            </p>
        </>
    );
}
