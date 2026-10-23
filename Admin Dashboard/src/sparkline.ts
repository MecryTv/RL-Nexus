/**
 * Punkte für eine kleine Kurve, als `points` für `<polyline>`: eine
 * durchgehende Linie durch alle Stunden mit Messung. Stunden ohne Messung
 * fallen weg, die Linie läuft von der Stunde davor direkt zur nächsten,
 * statt abzureißen oder auf null zu fallen. Der höchste Wert steht oben, zwei
 * Einheiten Rand bleiben frei. Ohne DOM, damit der Check unter Node mitlaufen kann.
 */
export function sparkline(series: readonly (number | null)[], width = 100, height = 30): string {
    const max = Math.max(1, ...series.filter((value): value is number => value !== null));
    const step = series.length > 1 ? width / (series.length - 1) : 0;
    const round = (value: number): number => Math.round(value * 10) / 10;
    const points = series.flatMap((value, index) => (value === null ? [] : [`${round(index * step)},${round(height - 2 - (value / max) * (height - 4))}`]));

    // Nur eine Stunde gemessen: doppelt, damit das runde Linienende wenigstens einen Punkt zeichnet.
    return points.length === 1 ? `${points[0]} ${points[0]}` : points.join(" ");
}
