import { useState, type CSSProperties, type JSX } from "react";
import { VITAL_LIMITS, type IVitalStat, type IVitalsReport, type VitalDevice, type VitalService } from "../../shared/vitals";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { METRIC_TEXT, RATING_WORD, SCALE_MAX, formatVital, positionOf, ratingOf, verdictOf } from "./performance.ts";
import styles from "./Performance.module.scss";

const SERVICE_NAMES: Readonly<Record<VitalService, string>> = { website: "Webseite", dashboard: "Bot-Dashboard" };

type DeviceChoice = "all" | VitalDevice;
type DaysChoice = "7" | "30" | "90";

const PERCENT = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });

/** Ein Messwert: Name, Grenzen, p75 mit Wort, Skala gut · mittel · schlecht mit Strich, Anteile. */
function VitalRow({ stat }: { readonly stat: IVitalStat }): JSX.Element {
    const limits = VITAL_LIMITS[stat.metric];
    const text = METRIC_TEXT[stat.metric];
    const rating = stat.p75 === null ? null : ratingOf(stat.metric, stat.p75);
    const good = positionOf(stat.metric, limits.good);
    const poor = positionOf(stat.metric, limits.poor);
    const middle = stat.good === null || stat.poor === null ? null : Math.max(0, 1 - stat.good - stat.poor);

    return (
        <div className={styles.vital}>
            <div className={styles.vitalHead}>
                <p className={styles.vitalName}>
                    {text.name} ({stat.metric})
                    <small>
                        bis {formatVital(stat.metric, limits.good)} gut, über {formatVital(stat.metric, limits.poor)} schlecht
                    </small>
                </p>
                <p className={[styles.vitalValue, rating && styles[rating]].filter(Boolean).join(" ")}>
                    {stat.p75 === null ? "–" : formatVital(stat.metric, stat.p75)}
                    <small>{rating ? RATING_WORD[rating] : "keine Messung"}</small>
                </p>
            </div>
            <div className={styles.scale} aria-hidden="true">
                <span className={styles.zoneGood} style={{ width: `${good}%` }} />
                <span className={styles.zoneMid} style={{ width: `${poor - good}%` }} />
                <span className={styles.zonePoor} style={{ width: `${100 - poor}%` }} />
                {stat.p75 !== null && <span className={styles.mark} style={{ left: `${positionOf(stat.metric, stat.p75)}%` } as CSSProperties} />}
            </div>
            <div className={styles.ticks} aria-hidden="true">
                <span style={{ left: "0%" }}>0</span>
                <span style={{ left: `${good}%` }}>{formatVital(stat.metric, limits.good)}</span>
                <span style={{ left: `${poor}%` }}>{formatVital(stat.metric, limits.poor)}</span>
                <span style={{ left: "100%" }}>{formatVital(stat.metric, SCALE_MAX[stat.metric])}+</span>
            </div>
            {stat.good !== null && stat.poor !== null && middle !== null && (
                <p className={styles.shares}>
                    <span>
                        <b>{PERCENT.format(stat.good)}</b> gut
                    </span>
                    <span>
                        <b>{PERCENT.format(middle)}</b> mittel
                    </span>
                    <span>
                        <b>{PERCENT.format(stat.poor)}</b> schlecht
                    </span>
                    <span className={styles.dim}>{formatNumber(stat.samples)} gemessen</span>
                </p>
            )}
        </div>
    );
}

function ServiceCard({ service, stats }: { readonly service: VitalService; readonly stats: readonly IVitalStat[] }): JSX.Element {
    const verdict = verdictOf(stats);
    const visits = Math.max(0, ...stats.map((stat) => stat.samples));
    const id = `ladezeiten-${service}`;

    return (
        <Panel as="section" className={styles.service}>
            <header className={styles.serviceHead}>
                <h2 id={id} className={styles.serviceTitle}>
                    {SERVICE_NAMES[service]}
                </h2>
                <Badge tone={verdict.tone}>{verdict.text}</Badge>
            </header>
            <p className={styles.dim}>{visits === 0 ? "In diesem Zeitraum keine Messung." : `${formatNumber(visits)} Besuche gemessen`}</p>
            {stats.map((stat) => (
                <VitalRow key={stat.metric} stat={stat} />
            ))}
        </Panel>
    );
}

/** Reiter „Ladezeiten“, Entwurf 19-A. */
export function VitalsView(): JSX.Element {
    const [device, setDevice] = useState<DeviceChoice>("all");
    const [days, setDays] = useState<DaysChoice>("7");
    // Stundensummen: alle fünf Minuten reicht.
    const report = useApi<IVitalsReport>(`/api/dev/vitals?days=${days}`, 300_000);

    return (
        <>
            <div className={styles.bar}>
                <p className={styles.lead}>Echte Besuche, gemessen im Browser · p75 je Messwert: drei von vier Besuchen waren schneller.</p>
                <div className={styles.controls}>
                    <Segmented<DeviceChoice>
                        name="ladezeiten-geraet"
                        legend="Gerät"
                        value={device}
                        onChange={setDevice}
                        options={[
                            { value: "all", label: "Alle" },
                            { value: "mobile", label: "Handy" },
                            { value: "desktop", label: "Computer" },
                        ]}
                    />
                    <Segmented<DaysChoice>
                        name="ladezeiten-zeitraum"
                        legend="Zeitraum"
                        value={days}
                        onChange={setDays}
                        options={[
                            { value: "7", label: "7 Tage" },
                            { value: "30", label: "30 Tage" },
                            { value: "90", label: "90 Tage" },
                        ]}
                    />
                </div>
            </div>

            {report.data ? (
                <div className={styles.services}>
                    {report.data.services.map((entry) => (
                        <ServiceCard key={entry.service} service={entry.service} stats={device === "all" ? entry.all : entry.devices[device]} />
                    ))}
                </div>
            ) : report.error ? (
                <Failure message={report.error.message} onRetry={report.reload} />
            ) : (
                <Loading label="Ladezeiten werden geladen" />
            )}

            <div className={styles.legend}>
                <span>
                    <i className={styles.zoneGood} aria-hidden="true" />
                    gut
                </span>
                <span>
                    <i className={styles.zoneMid} aria-hidden="true" />
                    mittel
                </span>
                <span>
                    <i className={styles.zonePoor} aria-hidden="true" />
                    schlecht
                </span>
                <span>│ Strich: p75</span>
            </div>
            <p className={styles.dim}>Gespeichert sind nur Summen je Stunde, 90 Tage lang: kein Pfad, keine IP, kein Cookie.</p>
        </>
    );
}
