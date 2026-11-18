import type { CSSProperties, JSX } from "react";
import { useSearchParams } from "react-router-dom";
import { ACTIVITY_RANGES, ACTIVITY_SERVICES, type ActivityDevice, type ActivityRange, type ActivityService, type ActivitySource, type IActivityView } from "../../shared/activity";
import { NEUTRAL, SERVICE_COLORS, SERVICE_LABELS } from "../../shared/activityChart";
import { useApi } from "../api/useApi";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useTitle } from "../useTitle";
import { Bars, Heatmap, LineChart, Tiles } from "./ActivityCharts";
import styles from "./activity.module.scss";

/**
 * W-0138: Start → Aktivität nach Entwurf D. Oben die drei Dienste und ihr
 * Verlauf, darunter „Details für“ alle drei (grau) oder einen Dienst (in seiner
 * Farbe): wann, womit, woher, und die Fehler. Zeitraum und Filter stehen in der
 * Adresse (?zeitraum=, ?dienst=).
 */

/** Die Seite fragt jede Minute nach, so oft liest der Server das Protokoll. */
const REFRESH = 60_000;

const RANGE_LABELS: Readonly<Record<ActivityRange, string>> = {
    "24h": "24 Std.",
    "7d": "7 Tage",
    "30d": "30 Tage",
};
const DEVICE_LABELS: Readonly<Record<ActivityDevice, string>> = {
    mobile: "Handy",
    desktop: "Desktop",
    tablet: "Tablet",
};
const SOURCE_LABELS: Readonly<Record<ActivitySource, string>> = {
    discord: "Discord",
    direct: "Direkt",
    google: "Google",
    topgg: "top.gg",
    other: "Sonstige",
};
/** Ampel: grün bis 2 % (404 von eigenen Seiten, W-0139) und 0,5 % (5xx), darüber gelb mit Warnzeichen. */
const LIMITS = { client: 0.02, server: 0.005 } as const;

const PERCENT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

function rangeOf(value: string | null): ActivityRange {
    return ACTIVITY_RANGES.includes(value as ActivityRange) ? (value as ActivityRange) : "7d";
}

function serviceOf(value: string | null): ActivityService | "all" {
    return ACTIVITY_SERVICES.includes(value as ActivityService) ? (value as ActivityService) : "all";
}

function ErrorRow({ share, limit, label }: { readonly share: number; readonly limit: number; readonly label: string }): JSX.Element {
    const high = share > limit;

    return (
        <div className={high ? styles.errHigh : styles.errOk}>
            <Icon name={high ? "alert" : "check"} size={18} />
            <div>
                <b>{PERCENT.format(share * 100)} %</b>
                <span>
                    {label}, {high ? "erhöht" : "in Ordnung"}
                </span>
            </div>
        </div>
    );
}

export function ActivityPage(): JSX.Element {
    useTitle("Aktivität");

    const [params, setParams] = useSearchParams();
    const range = rangeOf(params.get("zeitraum"));
    const service = serviceOf(params.get("dienst"));
    const { data, error, loading, reload } = useApi<IActivityView>(`/api/activity?range=${range}&service=${service}`, REFRESH);

    const set = (key: "zeitraum" | "dienst", value: string, fallback: string): void => {
        setParams(
            (previous) => {
                const next = new URLSearchParams(previous);

                if (value === fallback) next.delete(key);
                else next.set(key, value);

                return next;
            },
            { replace: true },
        );
    };

    // Gezeichnet wird, was die Antwort sagt, nicht was die Adresse schon will: bis die
    // neue Antwort da ist (oder wenn sie scheitert), stünden sonst alte Daten unter neuer Beschriftung.
    const shown = data?.range ?? range;
    const detail = data?.service ?? service;
    const detailColor = detail === "all" ? NEUTRAL : SERVICE_COLORS[detail];
    const meta = data?.since ? `Zählung seit ${formatDateTime(data.since)}` : undefined;

    return (
        <>
            <PageHeader title="Aktivität" meta={meta}>
                <Segmented
                    name="zeitraum"
                    legend="Zeitraum"
                    options={ACTIVITY_RANGES.map((value) => ({
                        value,
                        label: RANGE_LABELS[value],
                    }))}
                    value={range}
                    onChange={(value) => set("zeitraum", value, "7d")}
                />
            </PageHeader>
            <p className={styles.note}>Gezählt wird jeder Seitenaufruf, der beim Server ankommt: der erste Aufruf und jedes Neuladen. Wechsel innerhalb einer Seite zählen nicht, etwa zwischen Unterseiten der Webseite oder Bereichen im Bot-Dashboard.</p>

            {loading && !data && <Loading label="Aktivität lädt" />}
            {error && <Failure message={error.message} onRetry={reload} />}

            {data && data.since === null && (
                <Panel className={styles.empty}>
                    <h2>Noch keine Daten</h2>
                    <p>Sobald nginx in das eigene Protokoll schreibt, zählt das Admin jede Minute mit. Die ersten Zahlen stehen dann hier.</p>
                </Panel>
            )}

            {data && data.since !== null && (
                <>
                    <Tiles view={data} heading="h2" />

                    <Panel as="section" className={styles.card}>
                        <header className={styles.cardHead}>
                            <h2>{shown === "24h" ? "Aufrufe je Stunde" : "Aufrufe je Tag"}</h2>
                            <div className={styles.legend} aria-hidden="true">
                                {ACTIVITY_SERVICES.map((entry) => (
                                    <span key={entry}>
                                        <i style={{ background: SERVICE_COLORS[entry] }} />
                                        {SERVICE_LABELS[entry]}
                                    </span>
                                ))}
                            </div>
                        </header>
                        <LineChart series={data.series} range={shown} title={`Aufrufe je ${shown === "24h" ? "Stunde" : "Tag"}, ${RANGE_LABELS[shown]}`} />
                    </Panel>

                    <fieldset className={styles.filter}>
                        <legend>Details für</legend>
                        {(["all", ...ACTIVITY_SERVICES] as const).map((entry) => (
                            <label
                                key={entry}
                                className={styles.chip}
                                style={
                                    {
                                        "--chip": entry === "all" ? NEUTRAL : SERVICE_COLORS[entry],
                                    } as CSSProperties
                                }
                            >
                                <input type="radio" name="dienst" value={entry} checked={service === entry} onChange={() => set("dienst", entry, "all")} />
                                {entry !== "all" && <i aria-hidden="true" />}
                                {entry === "all" ? "Alle drei" : SERVICE_LABELS[entry]}
                            </label>
                        ))}
                    </fieldset>

                    <div className={styles.details}>
                        <Panel as="section" className={`${styles.card} ${styles.wide}`}>
                            <header className={styles.cardHead}>
                                <h2>Wann sie kommen</h2>
                                <span className={styles.muted}>Wochentag × Stunde, Berliner Zeit</span>
                            </header>
                            <Heatmap grid={data.heatmap} />
                        </Panel>

                        <Panel as="section" className={styles.card}>
                            <header className={styles.cardHead}>
                                <h2>Geräte</h2>
                            </header>
                            <Bars
                                rows={(Object.keys(DEVICE_LABELS) as ActivityDevice[]).map((key) => ({
                                    label: DEVICE_LABELS[key],
                                    value: data.devices[key],
                                }))}
                                color={detailColor}
                                caption="Aufrufe nach Gerät"
                            />
                        </Panel>

                        <Panel as="section" className={`${styles.card} ${styles.wide}`}>
                            <header className={styles.cardHead}>
                                <h2>Woher die Besucher kommen</h2>
                            </header>
                            <Bars
                                rows={(Object.keys(SOURCE_LABELS) as ActivitySource[]).map((key) => ({
                                    label: SOURCE_LABELS[key],
                                    value: data.sources[key],
                                }))}
                                color={detailColor}
                                caption="Aufrufe nach Herkunft"
                            />
                        </Panel>

                        <Panel as="section" className={styles.card}>
                            <header className={styles.cardHead}>
                                <h2>Fehler</h2>
                                <span className={styles.muted}>Anteil der gezählten Anfragen</span>
                            </header>
                            <div className={styles.errors}>
                                <ErrorRow share={data.errors.client} limit={LIMITS.client} label="Seite nicht gefunden (404)" />
                                <ErrorRow share={data.errors.server} limit={LIMITS.server} label="Serverfehler (5xx)" />
                            </div>
                            <p className={styles.muted}>In Ordnung bis 2 % (404) und 0,5 % (5xx). Als 404 zählen nur Anfragen unserer eigenen Seiten, die ins Leere gehen (fehlende Dateien, Bilder, Schnittstellen); unbekannte Unterseiten von Webseite und Statusseite antworten mit 200 und fallen hier nicht auf. Bots, Scanner, andere 4xx und Wartungszeiten zählen gar nicht mit.</p>
                        </Panel>
                    </div>
                </>
            )}
        </>
    );
}
