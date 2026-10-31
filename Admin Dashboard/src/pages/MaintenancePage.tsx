import type { JSX } from "react";
import type { IMaintenanceState } from "../../shared/api";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { PlanForm } from "../maintenance/PlanForm";
import { RunningPanel } from "../maintenance/RunningPanel";
import { AREA_NAMES, clock } from "../maintenance/time";
import { useTitle } from "../useTitle";

/**
 * Developer → Wartung (Plan 23). Aus: Wartung mit Text, Ende und Fahrplan
 * planen. An: Schritte weiterschalten, Ende verschieben, beenden. Das Admin
 * Dashboard schreibt dafür die Schalter und data/flags/wartung.json, die
 * Wartungsseite (public/wartung.html) liest sie.
 */
function meta(state: IMaintenanceState): string {
    const flag = state.website ?? state.dashboard;

    if (state.plan) return `Läuft seit ${clock(state.plan.since)}${flag?.by ? `, eingeschaltet von ${flag.by}` : ""}`;
    if (flag) return `Läuft ohne Fahrplan${flag.since ? ` seit ${clock(flag.since)}` : ""}`;

    return `${AREA_NAMES.website}: normal · ${AREA_NAMES.dashboard}: normal`;
}

export function MaintenancePage(): JSX.Element {
    useTitle("Wartung");

    const { data, error, reload } = useApi<IMaintenanceState>("/api/maintenance");

    // Schaltet jemand anders um, steht es hier sofort.
    useLive("maintenance", reload);

    const running = data !== null && (data.plan !== null || data.website !== null || data.dashboard !== null);

    return (
        <>
            <PageHeader title="Wartung" meta={data ? meta(data) : undefined} />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Wartung wird geladen" />
            ) : running ? (
                <RunningPanel state={data} onChange={reload} />
            ) : (
                <PlanForm onStarted={reload} />
            )}
        </>
    );
}
