import { useToast } from "../toast/context";

/** Kleinkram für Dev → Datenbank (W-0066), ohne Komponenten. */

export const LIVE_EVERY = 10_000;

/** „48 Min.“, „2 Std.“, „12 s“ */
export function duration(seconds: number): string {
    if (seconds < 60) return `${seconds} s`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)} Min.`;
    if (seconds < 172_800) return `${Math.round(seconds / 3_600)} Std.`;

    return `${Math.round(seconds / 86_400)} Tage`;
}

/** Text in die Zwischenablage, mit Rückmeldung. */
export function useCopy(): (text: string, done: string) => void {
    const notify = useToast();

    return (text, done) => {
        navigator.clipboard.writeText(text).then(
            () => notify(done),
            () => notify("Kopieren ging nicht. Der Browser erlaubt die Zwischenablage hier nicht.", "danger")
        );
    };
}
