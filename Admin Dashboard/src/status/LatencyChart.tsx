import { useId, useMemo, useState, type JSX, type MouseEvent } from "react";
import { STATUS_SERVICE_LABELS, type DetailRange, type IServiceDetail } from "../../shared/status";
import { Segmented } from "../components/Segmented";
import { formatDuration, formatNumber } from "../format";
import { chartGeometry } from "./chart";
import styles from "./LatencyChart.module.scss";

const WIDTH = 900;
const HEIGHT = 160;
const DAY = 86_400_000;
/** Abstand der Linie zum Rand, wie PAD in chart.ts: für die Lage der Achsenwerte. */
const PAD = 4;

const RANGE_OPTIONS: readonly {
    readonly value: DetailRange;
    readonly label: string;
}[] = [
    { value: "24h", label: "24 Std." },
    { value: "7d", label: "7 Tage" },
    { value: "30d", label: "30 Tage" },
];
const RANGE_DAYS: Readonly<Record<DetailRange, number>> = {
    "24h": 1,
    "7d": 7,
    "30d": 30,
};
const RANGE_TEXT: Readonly<Record<DetailRange, string>> = {
    "24h": "24 Stunden",
    "7d": "7 Tage",
    "30d": "30 Tage",
};
const STATE_TEXT = {
    ok: "gemessen",
    warn: "langsam",
    down: "Ausfall",
    gap: "nicht gemessen",
} as const;

const TIME = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
});
const DATE = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
});
const STAMP = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
});

const percentX = (x: number): string => `${(x / WIDTH) * 100}%`;

/** Die Antwortzeit eines Dienstes: Linie, nicht gemessene Zeit schraffiert, Ausfälle rot, langsame Prüfungen als Punkt. */
export function LatencyChart({
    service,
    range,
    dataRange,
    onRange,
    now,
}: {
    readonly service: IServiceDetail;
    /** Gewählt: Die Antwort dazu kann noch unterwegs sein. */
    readonly range: DetailRange;
    /** Der Zeitraum, aus dem `service` stammt. Danach richtet sich die Achse, sonst lägen kurz alte Punkte auf neuer Achse. */
    readonly dataRange: DetailRange;
    readonly onRange: (range: DetailRange) => void;
    readonly now: number;
}): JSX.Element {
    const pattern = useId();
    const from = now - RANGE_DAYS[dataRange] * DAY;
    const geometry = useMemo(
        () =>
            chartGeometry({
                points: service.points,
                spans: service.spans,
                from,
                to: now,
                p95: service.p95,
                width: WIDTH,
                height: HEIGHT,
                range: dataRange,
                now,
            }),
        [service, from, now, dataRange],
    );
    const [hover, setHover] = useState<{
        readonly left: number;
        readonly text: string;
    } | null>(null);

    const name = STATUS_SERVICE_LABELS[service.id];
    const outages = service.spans.filter((span) => span.kind === "down").length;
    const untracked = service.spans
        .filter((span) => span.kind === "gap")
        .reduce((sum, span) => sum + (Date.parse(span.end ?? new Date(now).toISOString()) - Math.max(Date.parse(span.start), from)), 0);
    const summary = [
        `${name}, ${RANGE_TEXT[dataRange]}`,
        service.median === null ? "keine Antwortzeit gemessen" : `Median ${service.median} ms`,
        `${outages} ${outages === 1 ? "Ausfall" : "Ausfälle"}`,
        untracked > 0 ? `${formatDuration(untracked / 1000)} nicht gemessen` : "durchgehend gemessen",
    ].join(", ");

    const ticks = Array.from({ length: 5 }, (_, index) => from + (index * (now - from)) / 4);
    // Drei Werte an der Achse: oben, Mitte, null. Die Lage wie y() in chart.ts.
    const scale = [geometry.top, geometry.top / 2, 0].map((value) => ({
        value,
        top: ((HEIGHT - PAD - (value / geometry.top) * (HEIGHT - 2 * PAD)) / HEIGHT) * 100,
    }));

    function move(event: MouseEvent<SVGSVGElement>): void {
        const box = event.currentTarget.getBoundingClientRect();
        const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
        const time = from + share * (now - from);
        const span = service.spans.find((entry) => Date.parse(entry.start) <= time && time <= Date.parse(entry.end ?? new Date(now).toISOString()));
        const nearest = service.points.reduce<(typeof service.points)[number] | null>(
            (best, point) => (best === null || Math.abs(Date.parse(point.at) - time) < Math.abs(Date.parse(best.at) - time) ? point : best),
            null,
        );

        const text = span
            ? `${STAMP.format(Date.parse(span.start))}–${span.end === null ? "jetzt" : TIME.format(Date.parse(span.end))} · ${span.kind === "gap" ? "nicht gemessen" : "Ausfall"}`
            : nearest
              ? `${STAMP.format(Date.parse(nearest.at))} · ${nearest.value === null ? "–" : `${nearest.value} ms`} · ${STATE_TEXT[nearest.state]}`
              : "nicht gemessen";

        setHover({ left: share * 100, text });
    }

    return (
        <div className={styles.chart}>
            <div className={styles.head}>
                <span className={styles.title}>{service.id === "bot" ? "Ping zu Discord" : "Antwortzeit"}</span>
                <Segmented name={`zeitraum-${service.id}`} legend="Zeitraum" options={RANGE_OPTIONS} value={range} onChange={onRange} />
            </div>

            <div className={styles.frame}>
                <div className={styles.scale} aria-hidden="true">
                    {scale.map((tick) => (
                        <span key={tick.top} style={{ top: `${tick.top}%` }}>
                            {formatNumber(Math.round(tick.value))} ms
                        </span>
                    ))}
                </div>

                <div className={styles.plot}>
                    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg} role="img" aria-label={summary} onMouseMove={move} onMouseLeave={() => setHover(null)}>
                        <defs>
                            <pattern id={pattern} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <rect width="1.5" height="8" className={styles.hatch} />
                            </pattern>
                        </defs>
                        {[0, 1, 2].map((row) => (
                            <line key={row} x1={0} x2={WIDTH} y1={PAD + (row * (HEIGHT - 2 * PAD)) / 2} y2={PAD + (row * (HEIGHT - 2 * PAD)) / 2} className={styles.grid} />
                        ))}
                        {geometry.spans.map((span, index) => (
                            <g key={`${span.kind}-${index}`} className={span.kind === "gap" ? styles.gap : styles.down}>
                                <rect x={span.x} y={0} width={Math.max(span.width, 2)} height={HEIGHT} />
                                {span.kind === "gap" && <rect x={span.x} y={0} width={Math.max(span.width, 2)} height={HEIGHT} fill={`url(#${pattern})`} />}
                            </g>
                        ))}
                        {geometry.bridges.map((bridge, index) => (
                            <path key={`bruecke-${index}`} d={bridge} className={styles.bridge} />
                        ))}
                        <path d={geometry.line} className={styles.line} />
                        {geometry.slow.map((point, index) => (
                            <circle key={`langsam-${index}`} cx={point.x} cy={point.y} r={3.5} className={styles.slow} />
                        ))}
                    </svg>

                    {/* Beschriftungen als Text über dem Graphen: gleich groß bei jeder Breite, im eigenen Feld gekürzt statt darüber hinaus. */}
                    <div className={styles.labels} aria-hidden="true">
                        {geometry.spans
                            .map((span, index) => ({ span, index }))
                            .filter(({ span }) => span.label !== null)
                            .map(({ span, index }) => (
                                <span
                                    key={`text-${index}`}
                                    className={span.kind === "gap" ? styles.gapLabel : styles.downLabel}
                                    style={{
                                        left: percentX(span.x),
                                        width: percentX(span.width),
                                    }}
                                    title={span.label ?? undefined}
                                >
                                    {span.label}
                                </span>
                            ))}
                    </div>

                    {hover && (
                        <span className={styles.tip} style={{ left: `${hover.left}%` }} aria-hidden="true">
                            {hover.text}
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.axis} aria-hidden="true">
                {ticks.map((tick, index) => (
                    <span key={tick}>{index === ticks.length - 1 ? "jetzt" : dataRange === "24h" ? TIME.format(tick) : DATE.format(tick)}</span>
                ))}
            </div>

            <ul className={styles.legend} aria-label="Legende">
                <li>
                    <i className={styles.keyLine} aria-hidden="true" />
                    gemessen
                </li>
                <li>
                    <i className={styles.keySlow} aria-hidden="true" />
                    langsam
                </li>
                <li>
                    <i className={styles.keyDown} aria-hidden="true" />
                    keine Antwort (Ausfall)
                </li>
                <li>
                    <i className={styles.keyGap} aria-hidden="true" />
                    nicht gemessen
                </li>
            </ul>
        </div>
    );
}
