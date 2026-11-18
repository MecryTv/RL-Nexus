import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { PageTabs } from "../components/PageTabs";
import { useTitle } from "../useTitle";
import { SlowView } from "./SlowView";
import { VitalsView } from "./VitalsView";

/**
 * W-0141: Developer → Leistung. Reiter „Ladezeiten“ (Entwurf 19-A): echte
 * Ladezeiten von Webseite und Bot-Dashboard. Reiter „Langsame Anfragen“
 * (Entwurf 11-B): Ausreißer von Admin-Server und Bot seit ihrem Start.
 */
export function PerformancePage(): JSX.Element {
    const slow = useLocation().pathname.startsWith("/dev/leistung/langsam");

    useTitle(slow ? "Langsame Anfragen" : "Ladezeiten");

    return (
        <>
            <PageHeader title="Leistung" />
            <PageTabs
                label="Leistung"
                tabs={[
                    { to: "/dev/leistung", label: "Ladezeiten", icon: "pulse", end: true },
                    { to: "/dev/leistung/langsam", label: "Langsame Anfragen", icon: "clock" },
                ]}
            />
            {slow ? <SlowView /> : <VitalsView />}
        </>
    );
}
