import { useEffect, useState, type CSSProperties, type FormEvent, type JSX } from "react";
import { BANNER_KINDS, BANNER_KIND_LABELS, CONTENT_LIMITS, bannerState, type BannerKind, type IBanner } from "../../shared/content";
import { Badge, type BadgeTone } from "../components/Badge";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { EditorBar, ResetAction } from "../editor/EditorParts";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { useContentDoc } from "../editor/useContentDoc";
import { formatDateTime, fromLocalInput, toLocalInput } from "../format";
import { useTitle } from "../useTitle";
import styles from "./BannerPage.module.scss";

const LIMITS = CONTENT_LIMITS.banner;

const KIND_OPTIONS = BANNER_KINDS.map((value) => ({ value, label: BANNER_KIND_LABELS[value] }));

/** Wie auf der Webseite (Banner.tsx dort): Farbe und Symbol je Art. */
const KIND_LOOK: Readonly<Record<BannerKind, { readonly color: string; readonly icon: string }>> = {
    info: { color: "var(--c-blue)", icon: "megaphone" },
    update: { color: "var(--c-win)", icon: "sparkle" },
    event: { color: "var(--c-mod-moderation)", icon: "trophy" },
    wartung: { color: "var(--c-mod-engagement)", icon: "clock" },
    stoerung: { color: "var(--c-loss)", icon: "alert" },
};

type TimeKey = "showFrom" | "showUntil" | "countdownTo";

/** „3T 04:12:09“, unter einem Tag „04:12:09“. Wie auf der Webseite. */
function countdownText(milliseconds: number): string {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(total / 86_400);
    const pad = (value: number): string => String(value).padStart(2, "0");
    const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;

    return days > 0 ? `${days}T ${clock}` : clock;
}

/** Morgen um dieselbe Zeit, auf die Minute: der Vorschlag für einen neuen Countdown. */
function tomorrow(): string {
    return new Date(Math.ceil((Date.now() + 86_400_000) / 60_000) * 60_000).toISOString();
}

function useNow(interval: number): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), interval);

        return () => window.clearInterval(timer);
    }, [interval]);

    return now;
}

/** Was die Webseite mit diesem Stand zeigt, als ein Satz. */
function StateLine({ banner, now }: { readonly banner: IBanner; readonly now: number }): JSX.Element {
    const state = bannerState(banner, now);
    const tones: Readonly<Record<typeof state, BadgeTone>> = { sichtbar: "ok", geplant: "info", abgelaufen: "neutral", aus: "neutral" };

    let text = "Die Webseite zeigt keinen Banner.";

    if (state === "sichtbar") text = banner.showUntil ? `Bis ${formatDateTime(banner.showUntil)}.` : "Ohne Ende, bis du ihn ausschaltest.";
    if (state === "geplant" && banner.showFrom) text = `Erscheint am ${formatDateTime(banner.showFrom)}.`;
    if (state === "abgelaufen" && banner.showUntil) text = `Seit ${formatDateTime(banner.showUntil)} nicht mehr zu sehen.`;

    const label = { aus: "Aus", sichtbar: "Gerade sichtbar", geplant: "Geplant", abgelaufen: "Abgelaufen" }[state];

    return (
        <p className={styles.state}>
            <Badge tone={tones[state]}>{label}</Badge>
            <span>{text}</span>
        </p>
    );
}

/** Die Leiste, wie die Webseite sie zeigt. Schmal bricht sie wie dort auf zwei Zeilen um. */
function Preview({ banner, now }: { readonly banner: IBanner; readonly now: number }): JSX.Element {
    const look = KIND_LOOK[banner.kind];
    const left = banner.countdownTo === undefined ? null : Date.parse(banner.countdownTo) - now;

    return (
        <div className={styles.bar} style={{ "--accent": look.color } as CSSProperties}>
            <span className={styles.kind}>
                <Icon name={look.icon} size={14} />
                {BANNER_KIND_LABELS[banner.kind]}
            </span>
            <p className={styles.barText}>
                {banner.title.trim() && <strong>{banner.title.trim()}</strong>}{" "}
                {banner.text.trim() || <span className={styles.placeholder}>Hier steht der Text.</span>}
                {banner.link?.label.trim() && (
                    <span className={styles.barLink}>
                        {banner.link.label.trim()} <Icon name="arrow-right" size={14} />
                    </span>
                )}
            </p>
            {left !== null && left > 0 && <span className={styles.count}>{countdownText(left)}</span>}
            <Icon name="close" size={18} className={styles.barClose} />
        </div>
    );
}

export function BannerPage(): JSX.Element {
    useTitle("Banner");

    const doc = useContentDoc<IBanner>("/api/content/banner");
    const banner = doc.draft;
    const now = useNow(1000);
    const [width, setWidth] = useState<"desktop" | "handy">("desktop");

    /** Beschriftung und Adresse gehören zusammen. Beide leer heißt: kein Link. */
    function setLink(change: { readonly href?: string; readonly label?: string }): void {
        doc.update((current) => {
            const link = { href: current.link?.href ?? "", label: current.link?.label ?? "", ...change };

            return { ...current, link: link.href === "" && link.label === "" ? undefined : link };
        });
    }

    function setTime(key: TimeKey, value: string | undefined): void {
        doc.update((current) => {
            const next: Record<string, unknown> = { ...current };

            if (value === undefined) delete next[key];
            else next[key] = value;

            return next as unknown as IBanner;
        });
    }

    function submit(event: FormEvent): void {
        event.preventDefault();
        if (doc.dirty) void doc.save();
    }

    const order = banner?.showFrom !== undefined && banner.showUntil !== undefined && Date.parse(banner.showUntil) <= Date.parse(banner.showFrom);

    return (
        <>
            <PageHeader title="Banner" meta="Eine Leiste unten auf der Webseite. Besucher können sie für ihre Sitzung wegklicken, nach jeder Änderung erscheint sie wieder.">
                <ResetAction doc={doc} what="Das Banner" />
            </PageHeader>

            {doc.saved === null ? (
                doc.loadError ? (
                    <Failure message={doc.loadError} onRetry={doc.reload} />
                ) : (
                    <Loading label="Banner wird geladen" />
                )
            ) : (
                <div className={styles.layout}>
                    <section className={styles.previewArea} aria-labelledby="banner-vorschau">
                        <div className={styles.previewHead}>
                            <h2 id="banner-vorschau" className={styles.heading}>
                                Vorschau
                            </h2>
                            <Segmented
                                name="banner-breite"
                                legend="Breite"
                                options={[
                                    { value: "desktop", label: "Desktop" },
                                    { value: "handy", label: "Handy" },
                                ]}
                                value={width}
                                onChange={setWidth}
                            />
                        </div>
                        <div className={[styles.stage, width === "handy" && styles.phone, !banner.enabled && styles.off].filter(Boolean).join(" ")}>
                            <Preview banner={banner} now={now} />
                        </div>
                        <StateLine banner={banner} now={now} />
                    </section>

                    <Panel className={styles.formPanel}>
                        <form className={styles.form} onSubmit={submit} noValidate>
                            <label className={styles.switch}>
                                <input type="checkbox" checked={banner.enabled} onChange={(event) => doc.update((current) => ({ ...current, enabled: event.target.checked }))} />
                                <span>Banner auf der Webseite zeigen</span>
                            </label>

                            <Segmented name="banner-art" legend="Art" options={KIND_OPTIONS} value={banner.kind} onChange={(kind) => doc.update((current) => ({ ...current, kind }))} />

                            <Field id="banner-titel" label="Titel" hint="Optional. Steht fett vor dem Text, etwa „Datenbank-Umzug“." counter={{ value: banner.title.length, max: LIMITS.title }}>
                                <input
                                    id="banner-titel"
                                    type="text"
                                    maxLength={LIMITS.title}
                                    value={banner.title}
                                    onChange={(event) => doc.update((current) => ({ ...current, title: event.target.value }))}
                                    aria-describedby="banner-titel-hint"
                                />
                            </Field>

                            <Field
                                id="banner-text"
                                label="Text"
                                hint={banner.enabled ? "Ein, zwei Sätze. Der Titel steht fett davor." : "Darf leer bleiben, solange das Banner aus ist."}
                                counter={{ value: banner.text.length, max: LIMITS.text }}
                            >
                                <textarea
                                    id="banner-text"
                                    rows={3}
                                    maxLength={LIMITS.text}
                                    value={banner.text}
                                    onChange={(event) => doc.update((current) => ({ ...current, text: event.target.value }))}
                                    aria-describedby="banner-text-hint"
                                />
                            </Field>

                            <div className={styles.row}>
                                <Field id="banner-link-label" label="Link: Beschriftung" hint="Optional, etwa „Mehr dazu“.">
                                    <input
                                        id="banner-link-label"
                                        type="text"
                                        maxLength={LIMITS.linkLabel}
                                        value={banner.link?.label ?? ""}
                                        onChange={(event) => setLink({ label: event.target.value })}
                                        aria-describedby="banner-link-label-hint"
                                    />
                                </Field>
                                <Field id="banner-link-href" label="Link: Adresse" hint="Ein Pfad der Webseite wie /module oder https://…">
                                    <input
                                        id="banner-link-href"
                                        type="text"
                                        inputMode="url"
                                        maxLength={LIMITS.href}
                                        value={banner.link?.href ?? ""}
                                        onChange={(event) => setLink({ href: event.target.value.trim() })}
                                        aria-describedby="banner-link-href-hint"
                                    />
                                </Field>
                            </div>

                            <fieldset className={styles.group}>
                                <legend className={styles.heading}>Zeitraum</legend>
                                <div className={styles.row}>
                                    <TimeField id="banner-ab" label="Sichtbar ab" hint="Leer: sofort." value={banner.showFrom} onChange={(value) => setTime("showFrom", value)} />
                                    <TimeField
                                        id="banner-bis"
                                        label="Sichtbar bis"
                                        hint="Leer: ohne Ende."
                                        error={order ? "Muss nach „Sichtbar ab“ liegen." : undefined}
                                        value={banner.showUntil}
                                        onChange={(value) => setTime("showUntil", value)}
                                    />
                                </div>

                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={banner.countdownTo !== undefined}
                                        onChange={(event) =>
                                            setTime("countdownTo", event.target.checked ? (banner.showFrom ?? banner.showUntil ?? tomorrow()) : undefined)
                                        }
                                    />
                                    <span>Countdown zeigen</span>
                                </label>
                                {banner.countdownTo !== undefined && (
                                    <TimeField
                                        id="banner-countdown"
                                        label="Countdown bis"
                                        hint="Etwa der Beginn der Wartung. Danach verschwindet er."
                                        value={banner.countdownTo}
                                        onChange={(value) => setTime("countdownTo", value)}
                                    />
                                )}
                            </fieldset>
                        </form>
                    </Panel>
                </div>
            )}

            <EditorBar doc={doc} />
            <UnsavedGuard dirty={doc.dirty} />
        </>
    );
}

function TimeField({
    id,
    label,
    hint,
    error,
    value,
    onChange,
}: {
    readonly id: string;
    readonly label: string;
    readonly hint: string;
    readonly error?: string;
    readonly value: string | undefined;
    readonly onChange: (value: string | undefined) => void;
}): JSX.Element {
    return (
        <Field id={id} label={label} hint={hint} error={error}>
            <div className={styles.time}>
                <input
                    id={id}
                    type="datetime-local"
                    value={toLocalInput(value)}
                    onChange={(event) => onChange(fromLocalInput(event.target.value))}
                    aria-describedby={[`${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ")}
                    aria-invalid={error ? true : undefined}
                />
                {value !== undefined && (
                    <button type="button" className={styles.clear} onClick={() => onChange(undefined)}>
                        Leeren
                    </button>
                )}
            </div>
        </Field>
    );
}
