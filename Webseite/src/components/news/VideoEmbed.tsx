import { type JSX, useState } from "react";
import { playerOf } from "../../services/video";
import styles from "./VideoEmbed.module.scss";

/**
 * W-0062: Video von YouTube oder Twitch. Vorher lädt nichts von dort; erst der
 * Klick auf „Video laden“ holt den Player, und der Satz darüber sagt, dass dabei
 * Daten an den Dienst gehen. Lässt sich der Link nicht einbetten, bleibt der Link.
 */
export function VideoEmbed({ url, title }: { readonly url: string; readonly title?: string }): JSX.Element {
    const [loaded, setLoaded] = useState(false);
    const player = playerOf(url, window.location.hostname);

    if (player && loaded) {
        return (
            <div className={styles.frame}>
                <iframe src={player.src} title={title ?? `Video auf ${player.service}`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
        );
    }

    const service = player?.service ?? (url.includes("twitch.tv") ? "Twitch" : "YouTube");

    return (
        <div className={[styles.frame, styles.idle].join(" ")}>
            <div className={styles.ask}>
                <p>
                    {player
                        ? `Das Video liegt bei ${service}. Beim Laden gehen Daten wie deine IP-Adresse an ${service}.`
                        : `Dieses Video lässt sich hier nicht abspielen.`}
                </p>
                <div className={styles.actions}>
                    {player && (
                        <button type="button" className={styles.load} onClick={() => setLoaded(true)}>
                            Video laden
                        </button>
                    )}
                    <a className={styles.out} href={url} target="_blank" rel="noopener noreferrer">
                        Auf {service} ansehen ↗
                    </a>
                </div>
            </div>
        </div>
    );
}
