import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isLegalPath, websiteInMaintenance } from "../services/maintenance";

/**
 * Während der Wartung lässt nginx nur die Rechtstexte durch. Die App wäre aber
 * einmal geladen: Ein Klick im Impressum auf das Logo führte sonst per Router
 * auf jede andere Seite. Deshalb wird dann jede Navigation außerhalb der
 * Rechtstexte zu einem vollen Seitenaufruf, und nginx zeigt die Wartungsseite.
 *
 * Gefragt wird bei jedem Seitenwechsel, nicht nur beim Laden: Auch ein Tab, der
 * schon vor der Wartung offen war, landet so auf der Wartungsseite (W-0022).
 */
export function useMaintenanceGuard(): void {
    const { pathname, search } = useLocation();

    useEffect(() => {
        if (isLegalPath(pathname)) return;

        let current = true;

        void websiteInMaintenance().then((on) => {
            if (on && current) window.location.assign(pathname + search);
        });

        return () => {
            current = false;
        };
    }, [pathname, search]);
}
