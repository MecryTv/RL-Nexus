import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type BannerKind, bannerState, type IBanner, type ILoaded } from "../../services/Content";
import { Icon } from "../ui/Icon";
import styles from "./Banner.module.scss";

/** Unter diesem Schlüssel steht die Revision, die zuletzt weggeklickt wurde. */
const STORAGE_KEY = "rlnexus.banner";

/** Farbe, Symbol und Name je Art. Dieselben stehen im Admin Dashboard (BannerPage.tsx). */
const LOOK: Readonly<Record<BannerKind, { readonly label: string; readonly color: string; readonly icon: string }>> = {
    info: { label: "Info", color: "var(--c-blue)", icon: "megaphone" },
    update: { label: "Update", color: "var(--c-win)", icon: "sparkle" },
    event: { label: "Event", color: "var(--c-mod-moderation)", icon: "trophy" },
    wartung: { label: "Wartung", color: "var(--c-mod-engagement)", icon: "clock" },
    stoerung: { label: "Störung", color: "var(--c-loss)", icon: "alert" },
};

const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function dismissedRevision(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Die Uhrzeit, die der Banner gerade braucht. Nur solange der Tab sichtbar
 * ist, und sofort, wenn er wieder sichtbar wird. `null` heißt: keine Uhr.
 */
function useNow(interval: number | null): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (interval === null) return;

        const tick = (): void => {
            if (document.visibilityState === "visible") setNow(Date.now());
        };
        const timer = window.setInterval(tick, interval);
        document.addEventListener("visibilitychange", tick);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [interval]);

    return now;
}

/** „3T 04:12:09“, unter einem Tag „04:12:09“. */
function countdownText(milliseconds: number): string {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(total / 86_400);
    const pad = (value: number): string => String(value).padStart(2, "0");
    const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;

    return days > 0 ? `${days}T ${clock}` : clock;
}

/** Für Vorleser: „Noch 3 Tage und 4 Stunden, bis 11. Oktober um 20:00“. */
function countdownSpoken(milliseconds: number, target: number): string {
    const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
    const units = [
        [Math.floor(minutes / 1440), "Tag", "Tage"],
        [Math.floor((minutes % 1440) / 60), "Stunde", "Stunden"],
        [minutes % 60, "Minute", "Minuten"],
    ] as const;
    const parts = units.filter(([value]) => value > 0).slice(0, 2).map(([value, one, many]) => `${value} ${value === 1 ? one : many}`);

    return `Noch ${parts.join(" und ")}, bis ${DATE.format(target)}.`;
}

/**
 * Ein Hinweis unten auf der Seite, gepflegt im Admin Dashboard.
 *
 * Schwebt mittig über dem Inhalt. Damit er den Fuß nicht verdeckt, meldet er
 * seine Höhe als `--banner-space` an `<html>`, und der body hält so viel
 * Abstand. Zeitfenster und Countdown rechnet er mit der Uhr des Besuchers.
 *
 * Wegklicken gilt für die laufende Sitzung und genau diesen Stand: gemerkt
 * wird die Revision. Ändert jemand das Banner, erscheint es wieder. Ohne
 * Speicher (gesperrt, privates Fenster) gilt das Wegklicken bis zum Neuladen.
 */
export function Banner({ banner }: { readonly banner: ILoaded<IBanner> | null }): JSX.Element | null {
    const [hidden, setHidden] = useState(() => banner !== null && dismissedRevision() === String(banner.revision));
    const element = useRef<HTMLElement>(null);

    const data = banner?.data ?? null;
    const target = data?.countdownTo === undefined ? null : Date.parse(data.countdownTo);
    const [startNow] = useState(() => Date.now());
    const ticking = target !== null && target > startNow;

    // Mit laufendem Countdown jede Sekunde, sonst jede Minute für das Zeitfenster.
    const now = useNow(data === null || !data.enabled || hidden ? null : ticking ? 1000 : 60_000);
    const visible = data !== null && !hidden && bannerState(data, now) === "sichtbar";

    useEffect(() => {
        const node = element.current;
        if (!visible || node === null) return;

        const root = document.documentElement;
        const measure = (): void => root.style.setProperty("--banner-space", `${node.offsetHeight + 24}px`);

        // Sofort messen: Der Observer meldet sich erst beim nächsten Zeichnen, im Hintergrund-Tab gar nicht.
        measure();

        const observer = new ResizeObserver(measure);
        observer.observe(node);

        return () => {
            observer.disconnect();
            root.style.removeProperty("--banner-space");
        };
    }, [visible]);

    if (!visible || banner === null || data === null) return null;

    const look = LOOK[data.kind];
    const left = target === null ? 0 : target - now;
    const revision = banner.revision;

    function dismiss(): void {
        try {
            sessionStorage.setItem(STORAGE_KEY, String(revision));
        } catch {
            // Ohne Speicher bleibt es beim Ausblenden bis zum Neuladen.
        }

        setHidden(true);
    }

    return (
        <aside ref={element} className={styles.banner} style={{ "--accent": look.color } as CSSProperties} aria-label={`Hinweis: ${look.label}`}>
            <span className={styles.kind}>
                <Icon name={look.icon} size={14} />
                {look.label}
            </span>
            <p className={styles.text}>
                {data.title !== "" && <strong className={styles.title}>{data.title}</strong>} {data.text}
                {data.link !== undefined &&
                    (data.link.href.startsWith("/") ? (
                        <Link className={styles.link} to={data.link.href}>
                            {data.link.label}
                            <Icon name="arrow-right" size={14} />
                        </Link>
                    ) : (
                        <a className={styles.link} href={data.link.href} target="_blank" rel="noopener noreferrer">
                            {data.link.label}
                            <Icon name="arrow-up-right" size={14} />
                        </a>
                    ))}
            </p>
            {target !== null && left > 0 && (
                <span className={styles.count}>
                    <span aria-hidden="true">{countdownText(left)}</span>
                    <span className="u-sr">{countdownSpoken(left, target)}</span>
                </span>
            )}
            <button type="button" className={styles.close} onClick={dismiss} aria-label="Hinweis ausblenden">
                <Icon name="close" size={18} />
            </button>
        </aside>
    );
}
