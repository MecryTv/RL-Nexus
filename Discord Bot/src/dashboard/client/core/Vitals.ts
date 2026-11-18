/**
 * W-0141: echte Ladezeiten messen (web-vitals, ins eigene Bündel gebaut).
 *
 * Gemessen wird, wie schnell die Seite steht (LCP), wie schnell sie auf
 * Klicks reagiert (INP), wie sehr sie springt (CLS) und wann die erste
 * Antwort kam (TTFB). Beim ersten Verlassen der Seite geht genau eine kleine
 * Meldung an den eigenen Server: die Werte und ob es ein Handy war. Ohne
 * Cookies (credentials: "omit"), ohne Pfad, ohne Kennung. Gespeichert werden
 * im Admin Dashboard nur Summen je Stunde.
 *
 * Dieselbe Datei steht in der Webseite (src/services/vitals.ts).
 */
import { onCLS, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type VitalName = "LCP" | "INP" | "CLS" | "TTFB";

export function startVitals(endpoint: string): void {
    const values: Partial<Record<VitalName, number>> = {};
    const keep = (metric: Metric): void => {
        values[metric.name as VitalName] = metric.name === "CLS" ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value);
    };
    let sent = false;

    onLCP(keep);
    onINP(keep);
    onCLS(keep);
    onTTFB(keep);

    // Nach web-vitals angemeldet: Dessen eigene Listener schreiben die letzten Werte zuerst.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden" || sent || Object.keys(values).length === 0) return;

        sent = true;
        void fetch(endpoint, {
            method: "POST",
            keepalive: true,
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop", metrics: values }),
        }).catch(() => undefined);
    });
}
