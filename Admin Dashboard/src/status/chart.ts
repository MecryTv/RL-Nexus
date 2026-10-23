import type { DetailRange, IChartPoint, ISpan } from "../../shared/status.ts";
import { formatDuration } from "../format.ts";

/**
 * Die Geometrie des Antwortzeit-Graphen im Leitstand, ohne DOM: Linie, Brücken
 * über nicht gemessene Zeit, Felder für Lücken und Ausfälle, langsame Punkte.
 * Über einen Ausfall führt keine Brücke, damit der Graph nicht so tut, als
 * wäre alles gut gewesen (Spec 2026-10-17-status-leitstand-design.md).
 */

export interface IGeometry {
    readonly line: string;
    readonly bridges: readonly string[];
    readonly spans: readonly { readonly x: number; readonly width: number; readonly kind: "gap" | "down"; readonly label: string | null }[];
    readonly slow: readonly { readonly x: number; readonly y: number }[];
    readonly top: number;
}

/** Ab dieser Breite bekommt ein Feld eine Beschriftung. */
const LABEL_WIDTH = 70;
/** Abstand der Linie zum oberen und unteren Rand. */
const PAD = 4;

const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

const round = (value: number): string => (Math.round(value * 10) / 10).toString();

function label(span: ISpan, range: DetailRange, now: number): string {
    const start = Date.parse(span.start);
    const day = range === "24h" ? "" : `${DAY.format(start)} `;

    if (span.kind === "gap") return `${day}${TIME.format(start)}–${TIME.format(span.end === null ? now : Date.parse(span.end))} nicht gemessen`;
    if (span.end === null) return `${day}${TIME.format(start)} Ausfall, läuft noch`;

    return `${day}${TIME.format(start)} Ausfall ${formatDuration((Date.parse(span.end) - start) / 1000)}`;
}

export function chartGeometry(input: {
    readonly points: readonly IChartPoint[];
    readonly spans: readonly ISpan[];
    readonly from: number;
    readonly to: number;
    readonly p95: number | null;
    readonly width: number;
    readonly height: number;
    readonly range: DetailRange;
    readonly now: number;
}): IGeometry {
    const { from, to, width, height } = input;
    const points = [...input.points].map((point) => ({ ...point, time: Date.parse(point.at) })).sort((a, b) => a.time - b.time);
    const spans = [...input.spans].sort((a, b) => a.start.localeCompare(b.start));
    const values = points.map((point) => point.value).filter((value): value is number => value !== null);

    // Doppelter 95-%-Wert: Eine einzelne Spitze drückt die normale Linie nicht platt an den Boden.
    const top = 2 * Math.max(input.p95 ?? (values.length === 0 ? 1 : Math.max(...values)), 1);
    const x = (time: number): number => ((Math.min(Math.max(time, from), to) - from) / (to - from)) * width;
    const y = (value: number): number => height - PAD - (Math.min(value, top) / top) * (height - 2 * PAD);

    let line = "";
    let previous: (typeof points)[number] | null = null;

    for (const point of points) {
        if (point.value === null) {
            previous = null;
            continue;
        }

        // Liegt zwischen dem letzten Punkt und diesem ein Feld, setzt die Linie neu an.
        const split = previous !== null && spans.some((span) => Date.parse(span.start) >= previous!.time && Date.parse(span.start) <= point.time);
        line += `${previous === null || split ? "M" : "L"}${round(x(point.time))} ${round(y(point.value))}`;
        previous = point;
    }

    const valued = points.filter((point) => point.value !== null);
    const downs = spans.filter((span) => span.kind === "down").map((span) => ({ start: Date.parse(span.start), end: span.end === null ? input.now : Date.parse(span.end) }));
    const bridges = spans
        .filter((span) => span.kind === "gap")
        .flatMap((span) => {
            const before = valued.filter((point) => point.time <= Date.parse(span.start)).at(-1);
            const after = valued.find((point) => point.time >= (span.end === null ? to : Date.parse(span.end)));
            if (!before || !after) return [];

            // Grenzt ein Ausfall an die Lücke, liefe die Brücke über ihn: dann keine.
            if (downs.some((down) => down.start < after.time && down.end > before.time)) return [];

            return [`M${round(x(before.time))} ${round(y(before.value!))} L${round(x(after.time))} ${round(y(after.value!))}`];
        });

    return {
        line,
        bridges,
        spans: spans.map((span) => {
            const left = x(Date.parse(span.start));
            const spanWidth = x(span.end === null ? input.now : Date.parse(span.end)) - left;

            return { x: left, width: spanWidth, kind: span.kind, label: spanWidth >= LABEL_WIDTH ? label(span, input.range, input.now) : null };
        }),
        slow: points.filter((point) => point.state === "warn" && point.value !== null).map((point) => ({ x: x(point.time), y: y(point.value!) })),
        top,
    };
}
