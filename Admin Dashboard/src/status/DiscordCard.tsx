import type { CSSProperties, JSX } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { discordLines } from "./discord.ts";
import styles from "./DiscordCard.module.scss";
import type { IDiscordPost } from "./useDiscordPost";

/** Die Bausteine von Components V2, so weit `payload()` sie nutzt. Die Zahlen sind Discords. */
interface IPart {
    readonly type: number;
    readonly components?: readonly IPart[];
    readonly content?: string;
    readonly accent_color?: number;
    readonly accessory?: IPart;
    readonly items?: readonly { readonly media?: { readonly url?: string }; readonly description?: string }[];
    readonly label?: string;
    readonly url?: string;
}

function Text({ content, now }: { readonly content: string; readonly now: number }): JSX.Element {
    return (
        <div className={styles.block}>
            {discordLines(content, now).map((line, index) => (
                <p key={index} className={styles[line.kind]}>
                    {line.segments.map((part, at) => (part.bold ? <strong key={at}>{part.text}</strong> : <span key={at}>{part.text}</span>))}
                </p>
            ))}
        </div>
    );
}

/** Ein Baustein. Was `payload()` nicht kennt, steht als Hinweis da, statt die Vorschau zu brechen. */
function Part({ part, now }: { readonly part: IPart; readonly now: number }): JSX.Element {
    const children = (part.components ?? []).map((child, index) => <Part key={index} part={child} now={now} />);

    switch (part.type) {
        case 17:
            return (
                <div className={styles.container} style={{ "--accent": `#${(part.accent_color ?? 0).toString(16).padStart(6, "0")}` } as CSSProperties}>
                    {children}
                </div>
            );
        case 10:
            return <Text content={part.content ?? ""} now={now} />;
        case 9:
            return (
                <div className={styles.section}>
                    <div>{children}</div>
                    {part.accessory && <Part part={part.accessory} now={now} />}
                </div>
            );
        case 1:
            return <div className={styles.row}>{children}</div>;
        case 2:
            return (
                <a className={styles.button} href={part.url} target="_blank" rel="noreferrer">
                    {part.label}
                </a>
            );
        case 12:
            return (
                <div className={styles.gallery}>
                    {(part.items ?? []).map((item, index) => {
                        const url = item.media?.url ?? "";

                        return <img key={index} src={url.startsWith("attachment://") ? "/api/status/discord/banner" : url} alt={item.description ?? ""} />;
                    })}
                </div>
            );
        default:
            return <p className={styles.unknown}>(Baustein {part.type} nicht in der Vorschau)</p>;
    }
}

/** Ring bis zur nächsten Runde von selbst. */
function Ring({ remaining, total }: { readonly remaining: number; readonly total: number }): JSX.Element {
    const seconds = Math.ceil(remaining / 1000);
    const length = 2 * Math.PI * 8;
    const done = Math.min(1, Math.max(0, 1 - remaining / total));

    return (
        <span className={styles.ring}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <circle cx="10" cy="10" r="8" className={styles.track} />
                <circle cx="10" cy="10" r="8" className={styles.progress} strokeDasharray={`${done * length} ${length}`} transform="rotate(-90 10 10)" />
            </svg>
            von selbst in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
    );
}

/**
 * Karte „Discord-Meldung“ (W-0052, Entwurf B2): die Nachricht, wie sie gleich
 * in Discord steht, darüber Kanal und Zeitpunkt, darunter der Knopf und der
 * Ring bis zur nächsten Runde.
 */
export function DiscordCard({ post, now }: { readonly post: IDiscordPost; readonly now: number }): JSX.Element {
    const { state, busy, waitUntil, refresh } = post;
    const data = state.data;

    if (data === null) return state.error ? <Failure message={state.error.message} onRetry={state.reload} /> : <Loading label="Discord-Meldung wird geladen" />;

    const first = data.channels[0];
    const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));
    const remaining = data.nextSeconds === null || state.updatedAt === null ? null : Math.max(0, state.updatedAt + data.nextSeconds * 1000 - now);

    return (
        <Panel className={styles.card}>
            <header className={styles.head}>
                <h2 className={styles.title}>Discord-Meldung</h2>
                {first && (
                    <span className={styles.meta}>
                        #{first.name ?? first.id}
                        {data.channels.length > 1 && ` · ${data.channels.length} Kanäle, überall gleich`} · zuletzt{" "}
                        {data.lastAt === null ? "noch nie seit dem Start" : new Date(data.lastAt).toLocaleTimeString("de-DE")}
                    </span>
                )}
            </header>

            {data.channels.length === 0 ? (
                <p className={styles.none}>Kein Statuskanal eingestellt.</p>
            ) : (
                <>
                    <div className={styles.preview}>
                        {data.components === null ? (
                            <p className={styles.unknown}>Noch nichts gemessen. Die erste Prüfung kommt gleich.</p>
                        ) : (
                            data.components.map((part, index) => <Part key={index} part={part as IPart} now={now} />)
                        )}
                    </div>

                    <div className={styles.actions}>
                        <Button variant="primary" size="sm" icon="refresh" busy={busy} disabled={wait > 0} onClick={() => void refresh()}>
                            {wait > 0 ? `Wieder in ${wait} Sek.` : "Jetzt aktualisieren"}
                        </Button>
                        {remaining !== null && <Ring remaining={remaining} total={data.everySeconds * 1000} />}
                        <p className={styles.hint}>Schreibt die Nachricht sofort in jeden Statuskanal neu. Höchstens alle 10 Sekunden, danach zieht sie wieder alle zwei Minuten von selbst nach.</p>
                    </div>
                </>
            )}
        </Panel>
    );
}
