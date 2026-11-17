import type { JSX } from "react";
import type { IActivityView } from "../../shared/activity";
import { useApi } from "../api/useApi";
import { Tiles } from "./ActivityCharts";
import styles from "./activity.module.scss";

/** W-0138: die Aktivität der letzten 7 Tage als Abschnitt auf der Übersicht. Ein Klick auf eine Kachel führt zur Seite. */
export function ActivityOverview(): JSX.Element {
    const { data, error } = useApi<IActivityView>("/api/activity?range=7d&service=all", 60_000);

    if (error && !data) return <p className={styles.muted}>Aktivität gerade nicht abrufbar: {error.message}</p>;
    if (!data) return <p className={styles.muted}>Aktivität lädt …</p>;
    if (data.since === null) return <p className={styles.muted}>Noch keine Daten. Sobald nginx in das eigene Protokoll schreibt, zählt das Admin mit.</p>;

    return <Tiles view={data} heading="h3" link />;
}
