import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type PointerEvent,
  type RefObject,
} from "react";
import type {
  ActivityRange,
  ActivityService,
  IActivitySeries,
} from "../../shared/activity";
import {
  HEAT_RAMP,
  SERVICE_COLORS,
  SERVICE_LABELS,
  heatStep,
  linePath,
  niceMax,
} from "../../shared/activityChart";
import { formatNumber } from "../format";
import { sparkline } from "../sparkline";
import styles from "./activity.module.scss";

/**
 * W-0138: die Graphen der Seite Aktivität als eigenes SVG (Entwurf D), ohne
 * Bibliothek. Gezeichnet wird in der gemessenen Breite, damit die Schrift am
 * Handy so groß bleibt wie am Desktop. Jede Grafik hat eine Tabelle für
 * Bildschirmleser.
 */

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOUR_LABEL = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
});
const HOUR_LONG = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Beschriftung eines Punkts: „14 Uhr“ bei 24 Std., sonst „24.10.“. */
function pointLabel(at: string, range: ActivityRange, long = false): string {
  if (range === "24h")
    return long
      ? `${HOUR_LONG.format(new Date(at))} Uhr`
      : `${HOUR_LABEL.format(new Date(at))} Uhr`;

  const [, month, day] = at.split("-");

  return `${day}.${month}.`;
}

export function Spark({
  values,
  service,
}: {
  readonly values: readonly number[];
  readonly service: ActivityService;
}): JSX.Element {
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={sparkline(values)}
        fill="none"
        stroke={SERVICE_COLORS[service]}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function LineChart({
  series,
  range,
  title,
}: {
  readonly series: readonly IActivitySeries[];
  readonly range: ActivityRange;
  readonly title: string;
}): JSX.Element {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(280, measured);
  const wide = width >= 560;
  const height = wide ? 260 : 210;
  const pad = { left: 40, right: wide ? 112 : 12, top: 12, bottom: 26 };
  const inner = {
    width: width - pad.left - pad.right,
    height: height - pad.top - pad.bottom,
  };
  const count = series[0]?.points.length ?? 0;
  const max = niceMax(
    Math.max(
      0,
      ...series.flatMap((entry) => entry.points.map((point) => point.views)),
    ),
  );
  const x = (index: number): number =>
    pad.left + (count > 1 ? (inner.width * index) / (count - 1) : 0);
  const y = (value: number): number =>
    pad.top + inner.height - (value / max) * inner.height;
  const every = count > 12 ? Math.ceil(count / (wide ? 8 : 5)) : wide ? 1 : 2;
  const ticks = Array.from({ length: 6 }, (_, index) => (max / 5) * index);
  const points = series[0]?.points ?? [];

  const move = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;

    setHover(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  };

  return (
    <div ref={ref} className={styles.chartBox}>
      {measured > 0 && (
        <svg
          className={styles.chart}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={styles.grid}
                x1={pad.left}
                x2={pad.left + inner.width}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className={styles.tick}
                x={pad.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {points.map((point, index) =>
            index % every === 0 || index === count - 1 ? (
              <text
                key={point.at}
                className={styles.tick}
                x={x(index)}
                y={height - 8}
                textAnchor="middle"
              >
                {/* Der letzte Punkt ist angefangen; „heute“ sagt, warum er niedriger liegt. */}
                {index === count - 1
                  ? range === "24h"
                    ? "jetzt"
                    : "heute"
                  : pointLabel(point.at, range)}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <line
              className={styles.cross}
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + inner.height}
            />
          )}
          {series.map((entry) => {
            const values = entry.points.map((point) => point.views);
            const last = values.at(-1) ?? 0;

            return (
              <g key={entry.service}>
                <path
                  d={linePath(values, inner.width, inner.height, max)}
                  transform={`translate(${pad.left} ${pad.top})`}
                  fill="none"
                  stroke={SERVICE_COLORS[entry.service]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={x(count - 1)}
                  cy={y(last)}
                  r="4"
                  fill={SERVICE_COLORS[entry.service]}
                  className={styles.dot}
                />
                {hover !== null && (
                  <circle
                    cx={x(hover)}
                    cy={y(values[hover] ?? 0)}
                    r="4"
                    fill={SERVICE_COLORS[entry.service]}
                    className={styles.dot}
                  />
                )}
                {wide && (
                  <text
                    className={styles.endLabel}
                    x={x(count - 1) + 10}
                    y={y(last) + 4}
                  >
                    {SERVICE_LABELS[entry.service]}
                  </text>
                )}
              </g>
            );
          })}
          <rect
            x={pad.left}
            y={pad.top}
            width={inner.width}
            height={inner.height}
            fill="transparent"
            onPointerMove={move}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && points[hover] && (
        <div
          className={styles.tip}
          style={{ left: Math.min(x(hover) + 12, width - 190) }}
        >
          <b>{pointLabel(points[hover]!.at, range, true)}</b>
          {series.map((entry) => (
            <span key={entry.service}>
              <i style={{ background: SERVICE_COLORS[entry.service] }} />
              {SERVICE_LABELS[entry.service]}
              <b>{formatNumber(entry.points[hover]?.views ?? 0)}</b>
            </span>
          ))}
        </div>
      )}
      {/* Im div: eine Tabelle hält sich nicht an 1 px Breite und machte die Seite breit. */}
      <div className={styles.sr}>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{range === "24h" ? "Stunde" : "Tag"}</th>
              {series.map((entry) => (
                <th key={entry.service} scope="col">
                  {SERVICE_LABELS[entry.service]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={point.at}>
                <th scope="row">{pointLabel(point.at, range, true)}</th>
                {series.map((entry) => (
                  <td key={entry.service}>
                    {formatNumber(entry.points[index]?.views ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Heatmap({
  grid,
}: {
  readonly grid: readonly (readonly number[])[];
}): JSX.Element {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(
    null,
  );
  const label = 26;
  const gap = 2;
  const cell = Math.max(
    6,
    Math.floor((Math.max(280, measured) - label) / 24) - gap,
  );
  const width = label + 24 * (cell + gap);
  const height = 7 * (cell + gap) + 20;
  const max = Math.max(0, ...grid.flat());
  const text = (day: number, hour: number): string =>
    `${WEEKDAYS[day]}, ${hour}–${hour + 1} Uhr: ${formatNumber(grid[day]?.[hour] ?? 0)} Aufrufe`;

  return (
    <div ref={ref} className={styles.chartBox}>
      <p className={styles.hoverLine} aria-hidden="true">
        {hover
          ? text(hover.day, hover.hour)
          : "Zeiger auf ein Feld für die Zahl"}
      </p>
      {measured > 0 && (
        <svg
          className={styles.chart}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onPointerLeave={() => setHover(null)}
        >
          {WEEKDAYS.map((day, row) => (
            <g key={day}>
              <text
                className={styles.tick}
                x="0"
                y={row * (cell + gap) + cell - 2}
              >
                {day}
              </text>
              {Array.from({ length: 24 }, (_, hour) => (
                <rect
                  key={hour}
                  x={label + hour * (cell + gap)}
                  y={row * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx="2"
                  fill={HEAT_RAMP[heatStep(grid[row]?.[hour] ?? 0, max)]}
                  className={
                    hover?.day === row && hover.hour === hour
                      ? styles.heatOn
                      : undefined
                  }
                  onPointerEnter={() => setHover({ day: row, hour })}
                >
                  <title>{text(row, hour)}</title>
                </rect>
              ))}
            </g>
          ))}
          {[0, 6, 12, 18, 23].map((hour) => (
            <text
              key={hour}
              className={styles.tick}
              x={label + hour * (cell + gap) + cell / 2}
              y={height - 4}
              textAnchor="middle"
            >
              {hour}
            </text>
          ))}
        </svg>
      )}
      <div className={styles.scale} aria-hidden="true">
        <span>wenig</span>
        {HEAT_RAMP.map((color) => (
          <i key={color} style={{ background: color }} />
        ))}
        <span>viel</span>
      </div>
      {/* Im div: eine Tabelle hält sich nicht an 1 px Breite und machte die Seite breit. */}
      <div className={styles.sr}>
        <table>
          <caption>Aufrufe nach Wochentag und Stunde, Berliner Zeit</caption>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} scope="col">
                  {hour} Uhr
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day, row) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <td key={hour}>{formatNumber(grid[row]?.[hour] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Waagrechte Balken als echte Tabelle: lesbar für Bildschirmleser, Zahl und Anteil stehen daneben. */
export function Bars({
  rows,
  color,
  caption,
}: {
  readonly rows: readonly { label: string; value: number }[];
  readonly color: string;
  readonly caption: string;
}): JSX.Element {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const top = Math.max(1, ...rows.map((row) => row.value));

  return (
    <table className={styles.bars}>
      <caption className={styles.sr}>{caption}</caption>
      <tbody>
        {rows.map((row) => {
          const share = total === 0 ? 0 : Math.round((row.value / total) * 100);

          return (
            <tr
              key={row.label}
              title={`${row.label}: ${formatNumber(row.value)} Aufrufe, ${share} %`}
            >
              <th scope="row">{row.label}</th>
              <td className={styles.track} aria-hidden="true">
                <i
                  style={{
                    width: `${(row.value / top) * 100}%`,
                    background: color,
                  }}
                />
              </td>
              <td className={styles.value}>
                {formatNumber(row.value)}
                <small>{share} %</small>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
