import { useState, type CSSProperties, type JSX } from "react";
import { channelLabel } from "../../shared/status.ts";
import logo from "../assets/logo.webp";
import { Button } from "../components/Button";
import { Failure, Loading } from "../components/Status";
import { discordLines, postSummary } from "./discord.ts";
import { ChannelDialog } from "./ChannelDialog";
import styles from "./DiscordTab.module.scss";
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

const time = (iso: string): string => new Date(iso).toLocaleTimeString("de-DE");

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
function Part({ part, now, context }: { readonly part: IPart; readonly now: number; readonly context?: string }): JSX.Element {
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
        case 9: {
            // Zwei Knöpfe heißen „Öffnen“: Der Name des Abschnitts unterscheidet sie für Screenreader.
            const name = (part.components?.[0]?.content ?? "").split("\n")[0].replace(/^#+\s*/, "").split(" · ")[0];

            return (
                <div className={styles.section}>
                    <div>{children}</div>
                    {part.accessory && <Part part={part.accessory} now={now} context={name} />}
                </div>
            );
        }
        case 1:
            return <div className={styles.row}>{children}</div>;
        case 2:
            return (
                <a className={styles.button} href={part.url} target="_blank" rel="noreferrer" aria-label={context ? `${part.label}: ${context}` : undefined}>
                    {part.label}
                </a>
            );
        case 12:
            return (
                <div className={styles.gallery} data-count={part.items?.length ?? 0}>
                    {(part.items ?? []).map((item, index) => {
                        const url = item.media?.url ?? "";
                        const src = url.startsWith("attachment://") ? `/api/status/discord/image/${encodeURIComponent(url.slice("attachment://".length))}` : url;

                        return <img key={index} src={src} alt={item.description ?? ""} />;
                    })}
                </div>
            );
        default:
            return <p className={styles.unknown}>(Baustein {part.type} nicht in der Vorschau)</p>;
    }
}

/** Großer Ring bis zur nächsten Runde von selbst. */
function Ring({ remaining, total }: { readonly remaining: number; readonly total: number }): JSX.Element {
    const seconds = Math.ceil(remaining / 1000);
    const length = 2 * Math.PI * 26;
    const done = Math.min(1, Math.max(0, 1 - remaining / total));

    return (
        <div className={styles.ring}>
            <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                <circle cx="32" cy="32" r="26" className={styles.track} />
                <circle cx="32" cy="32" r="26" className={styles.progress} strokeDasharray={`${done * length} ${length}`} transform="rotate(-90 32 32)" />
            </svg>
            <div>
                <b className={styles.ringTime}>
                    {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </b>
                <span className={styles.ringNote}>von selbst, alle {Math.round(total / 60_000)} Minuten</span>
            </div>
        </div>
    );
}

/**
 * Reiter „Discord-Meldung“ (W-0052, Entwurf D1): links die Nachricht, wie sie
 * im Kanal steht, rechts alles zum Handeln.
 */
export function DiscordTab({ post, now }: { readonly post: IDiscordPost; readonly now: number }): JSX.Element {
    const { state, busy, waitUntil, nextUntil, refresh } = post;
    const [choosing, setChoosing] = useState(false);
    const data = state.data;

    if (data === null) return state.error ? <Failure message={state.error.message} onRetry={state.reload} /> : <Loading label="Discord-Meldung wird geladen" />;

    const first = data.channels[0] ?? null;
    const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));
    const remaining = nextUntil === null ? null : Math.max(0, nextUntil - now);
    const manual = data.manual;
    const manualSummary = manual ? postSummary(manual.result) : null;

    return (
        <div className={styles.tab}>
            <section className={styles.frame} aria-label="Vorschau der Discord-Nachricht" tabIndex={0}>
                <header className={styles.channel}>
                    <span className={styles.hash} aria-hidden="true">
                        #
                    </span>
                    {first ? (first.name ?? first.id) : "kein Statuskanal"}
                    <small>So steht die Nachricht gerade im Kanal</small>
                </header>

                {data.components === null ? (
                    <p className={styles.empty}>Noch nichts gemessen. Die erste Prüfung kommt gleich.</p>
                ) : (
                    <div className={styles.message}>
                        <img className={styles.avatar} src={logo} alt="" width={40} height={40} />
                        <div className={styles.body}>
                            <div className={styles.who}>
                                <b>RL Nexus</b>
                                <span className={styles.app}>APP</span>
                                {data.lastAt && <small>Heute um {new Date(data.lastAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</small>}
                            </div>
                            {data.components.map((part, index) => (
                                <Part key={index} part={part as IPart} now={now} />
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <aside className={styles.side} aria-label="Discord-Meldung steuern">
                <div className={styles.box}>
                    <span className={styles.label}>Nächste Runde</span>
                    {remaining !== null && <Ring remaining={remaining} total={data.everySeconds * 1000} />}
                    <Button variant="primary" icon="refresh" busy={busy} disabled={wait > 0 || first === null} onClick={() => void refresh()}>
                        {wait > 0 ? `Wieder in ${wait} Sek.` : "Jetzt aktualisieren"}
                    </Button>
                    <p className={styles.note}>Schreibt die Nachricht sofort in den Statuskanal neu. Höchstens alle 10 Sekunden.</p>
                </div>

                <div className={styles.box}>
                    <span className={styles.label}>Statuskanal</span>
                    {data.channels.length === 0 ? (
                        <p className={styles.note}>Kein Statuskanal eingestellt.</p>
                    ) : (
                        data.channels.map((channel) => (
                            <p key={channel.id} className={styles.channelRow}>
                                <span className={styles.dot} aria-hidden="true" />
                                {channelLabel(channel)}
                                <small>{data.lastAt ? `zuletzt ${time(data.lastAt)}` : "noch nie seit dem Start"}</small>
                            </p>
                        ))
                    )}
                    <button type="button" className={styles.link} onClick={() => setChoosing(true)}>
                        {data.channels.length === 0 ? "Kanal wählen" : "Kanal ändern"}
                    </button>
                </div>

                <div className={styles.box}>
                    <span className={styles.label}>Zuletzt von Hand</span>
                    {manual && manualSummary ? (
                        <p className={manualSummary.ok ? styles.ok : styles.bad}>
                            {manualSummary.text}
                            <small>
                                {manual.by} · {time(manual.result.at)}
                            </small>
                        </p>
                    ) : (
                        <p className={styles.note}>Seit dem Start noch nicht.</p>
                    )}
                </div>
            </aside>

            {choosing && <ChannelDialog current={first?.id ?? null} onClose={() => setChoosing(false)} onChanged={state.reload} />}
        </div>
    );
}
