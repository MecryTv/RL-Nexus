import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { dayClock, etaLine, progress, type IWebsiteMaintenance } from "./logic";
import styles from "./MaintenanceScreen.module.scss";

const STATUS_URL = import.meta.env.VITE_STATUS_URL || "https://status.nexus-emb.de";

/** Ohne eigenen Grund: dieser Satz. */
const NO_REASON = "Wir arbeiten gerade am System.";

/**
 * Der Wartungsbildschirm der Webseite (Plan 23, Variante B mit Zeitleiste).
 * Er steht an Stelle der ganzen App, ohne Kopf und Fuß, und braucht keinen
 * Router: Die Links zu den Rechtstexten laden die Seite neu, die bleiben
 * während der Wartung offen.
 */
export function MaintenanceScreen({ state, preview = false }: { readonly state: IWebsiteMaintenance; readonly preview?: boolean }): JSX.Element {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (preview) return;

        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.append(robots);
        document.title = "Wartung · RL Nexus";

        return () => robots.remove();
    }, [preview]);

    const share = progress(state, now);
    const late = state.endsAt !== null && Date.parse(state.endsAt) <= now.getTime();

    return (
        <main className={styles.page}>
            <div className={styles.inner}>
                <p className={styles.wordmark}>
                    RL <span>NEXUS</span>
                </p>
                <p className={styles.label}>Wartung</p>
                <h1 className={styles.title}>Wir sind gleich wieder da</h1>
                <p className={styles.reason}>{state.reason ?? NO_REASON}</p>

                {share === null || state.endsAt === null ? (
                    <p className={styles.eta}>{etaLine(state, now)}</p>
                ) : (
                    <div className={styles.timeline}>
                        <div className={styles.track} role="progressbar" aria-label="Fortschritt der Wartung" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
                            <span className={styles.fill} style={{ "--share": share } as CSSProperties} />
                        </div>
                        <p className={styles.ends}>
                            <span>
                                Seit <b>{dayClock(state.startedAt, now)}</b>
                            </span>
                            <span>{late ? etaLine(state, now) : <>Zurück gegen <b>{dayClock(state.endsAt, now)}</b></>}</span>
                        </p>
                    </div>
                )}

                <p className={styles.note}>Diese Seite lädt von selbst neu, sobald wir fertig sind. Der Bot auf Discord läuft normal weiter.</p>
                <a className={styles.status} href={STATUS_URL} target="_blank" rel="noopener noreferrer">
                    Aktuellen Stand ansehen
                </a>
                <nav className={styles.legal} aria-label="Rechtliches">
                    <a href="/impressum">Impressum</a>
                    <a href="/datenschutz">Datenschutz</a>
                    <a href="/agb">AGB</a>
                    <a href="/widerruf">Widerruf</a>
                </nav>
            </div>
        </main>
    );
}
