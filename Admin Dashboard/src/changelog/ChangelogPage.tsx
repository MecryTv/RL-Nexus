import { useEffect, useRef, useState, type JSX } from "react";
import {
    AREA_LABELS,
    CHANGE_AREAS,
    CHANGE_KINDS,
    KIND_LABELS,
    checkVersionInput,
    filterVersions,
    postableItems,
    type ChangeArea,
    type ChangeKind,
    type IChangeItem,
    type IChangelogVersion,
    type IChangelogView,
} from "../../shared/changelog.ts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { dataUrl } from "../dataUrl";
import { ChannelDialog } from "../status/ChannelDialog";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { draftOf, type IDraft } from "./draft.ts";
import { VersionEditor } from "./VersionEditor";
import styles from "./changelog.module.scss";

/**
 * Dev → Changelog (W-0061, Entwurf E2: Zeitleiste aus A, Suche und Liste aus
 * C). Versionen schreiben, filtern, durchsuchen und als Bild in den Kanal des
 * Teams posten. Spec: docs/superpowers/specs/2026-11-09-changelog-design.md.
 */

type View = "zeitleiste" | "liste";
type Dialog =
    | { readonly kind: "edit"; readonly version: IChangelogVersion | null; readonly works: boolean }
    | { readonly kind: "post" | "unpost" | "delete"; readonly version: IChangelogVersion }
    | { readonly kind: "channel" };

const VIEW_KEY = "rlnexus.changelog.view";
const KIND_CLASS: Readonly<Record<ChangeKind, string>> = { neu: styles.kNeu!, verbessert: styles.kBesser!, behoben: styles.kFix!, intern: styles.kIntern! };
const AREA_CLASS: Readonly<Record<ChangeArea, string>> = { bot: styles.aBot!, dashboard: styles.aDash!, admin: styles.aAdmin!, webseite: styles.aWeb! };
const DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const day = (iso: string): string => DAY.format(new Date(`${iso}T00:00:00Z`));
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function storedView(): View {
    try {
        return window.localStorage.getItem(VIEW_KEY) === "liste" ? "liste" : "zeitleiste";
    } catch {
        return "zeitleiste";
    }
}

/** Das Suchwort markiert, ohne Groß- und Kleinschreibung. */
function Marked({ text, query }: { readonly text: string; readonly query: string }): JSX.Element {
    const needle = query.trim().toLowerCase();
    if (!needle) return <>{text}</>;

    const lower = text.toLowerCase();
    const parts: (string | JSX.Element)[] = [];
    let at = 0;

    for (let found = lower.indexOf(needle); found !== -1; found = lower.indexOf(needle, at)) {
        parts.push(text.slice(at, found), <mark key={found}>{text.slice(found, found + needle.length)}</mark>);
        at = found + needle.length;
    }

    parts.push(text.slice(at));

    return <>{parts}</>;
}

const Kind = ({ kind, count }: { readonly kind: ChangeKind; readonly count?: number }): JSX.Element => (
    <span className={`${styles.kind} ${KIND_CLASS[kind]}`}>
        {KIND_LABELS[kind]}
        {count !== undefined && ` · ${count}`}
    </span>
);

const Area = ({ area }: { readonly area: ChangeArea }): JSX.Element => <span className={`${styles.area} ${AREA_CLASS[area]}`}>{AREA_LABELS[area]}</span>;

function Stand({ version }: { readonly version: IChangelogVersion }): JSX.Element {
    if (!version.posted) return <span className={styles.draft}>● Entwurf, noch nicht gepostet</span>;
    if (version.posted.stale) return <span className={styles.draft}>● seit dem Posten geändert</span>;

    return <span className={styles.posted}>✓ gepostet</span>;
}

export function ChangelogPage(): JSX.Element {
    useTitle("Changelog");

    const state = useApi<IChangelogView>("/api/changelog");
    const notify = useToast();
    const search = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [kinds, setKinds] = useState<readonly ChangeKind[]>([]);
    const [areas, setAreas] = useState<readonly ChangeArea[]>([]);
    const [task, setTask] = useState<string | null>(null);
    const [view, setView] = useState<View>(storedView);
    // Die neueste ist offen; hier stehen die, deren Stand umgeschaltet wurde.
    const [toggled, setToggled] = useState<readonly number[]>([]);
    const [dialog, setDialogState] = useState<Dialog | null>(null);
    // Die Fenster stehen nur im DOM, solange sie offen sind. Danach geht der Fokus zurück an den Knopf, der sie geöffnet hat.
    const opener = useRef<HTMLElement | null>(null);
    const setDialog = (next: Dialog | null): void => {
        if (next && !dialog) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!next) requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus());

        setDialogState(next);
    };
    const [busy, setBusy] = useState(false);

    // `/` springt ins Suchfeld. Läuft vor der Navigationssuche der Shell, die sonst auf `/` aufgeht.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
            if (document.querySelector("dialog[open]")) return;

            event.preventDefault();
            event.stopPropagation();
            search.current?.focus();
        };

        window.addEventListener("keydown", onKey, true);

        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const versions = state.data?.versions ?? [];
    const channel = state.data?.channel ?? null;
    const channelName = channel ? `#${channel.name ?? channel.id}` : null;
    const hits = filterVersions(versions, { query, kinds, areas, task });
    const searching = query.trim() !== "";
    const filtered = searching || kinds.length > 0 || areas.length > 0 || task !== null;
    const reset = (): void => {
        setQuery("");
        setKinds([]);
        setAreas([]);
        setTask(null);
    };
    const choose = (next: View): void => {
        setView(next);
        try {
            window.localStorage.setItem(VIEW_KEY, next);
        } catch {
            // Ohne Speicher gilt die Wahl bis zum Neuladen.
        }
    };
    const toggle = <T,>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

    async function run(action: () => Promise<unknown>, done: string): Promise<void> {
        setBusy(true);

        try {
            await action();
            notify(done, "ok");
            setDialog(null);
            state.reload();
        } catch (error) {
            notify(message(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    const taskLink = (id: string | null): JSX.Element | null =>
        id ? (
            <button type="button" className={styles.task} onClick={() => setTask(id)} title={`Nur Zeilen von ${id} zeigen`}>
                <Marked text={id} query={query} />
            </button>
        ) : null;

    function actions(version: IChangelogVersion): JSX.Element {
        const postable = postableItems(version.items).length > 0;
        const open = (kind: "post" | "unpost" | "delete"): void => setDialog({ kind, version });

        return (
            <div className={styles.actions}>
                <Button size="sm" icon="pencil" onClick={() => setDialog({ kind: "edit", version, works: false })}>
                    Bearbeiten
                </Button>
                {!postable ? (
                    <span className={styles.dim}>Nur interne Änderungen, im Post stünde nichts.</span>
                ) : !version.posted ? (
                    <Button size="sm" variant="primary" icon="send" onClick={() => (channel ? open("post") : setDialog({ kind: "channel" }))}>
                        {channelName ? `In ${channelName} posten` : "Kanal wählen und posten"}
                    </Button>
                ) : (
                    version.posted.stale && (
                        <Button size="sm" variant="primary" icon="refresh" onClick={() => open("post")}>
                            Post aktualisieren
                        </Button>
                    )
                )}
                {version.posted && (
                    <Button size="sm" variant="ghost" icon="close" onClick={() => open("unpost")}>
                        Post löschen
                    </Button>
                )}
                <Button size="sm" variant="ghost" icon="trash" onClick={() => open("delete")}>
                    Version löschen
                </Button>
            </div>
        );
    }

    function timeline(): JSX.Element {
        return (
            <ol className={styles.timeline}>
                {hits.map(({ version, items }, index) => {
                    const open = toggled.includes(version.id) !== (index === 0);
                    const present = CHANGE_KINDS.filter((kind) => items.some((item) => item.kind === kind));

                    return (
                        <li key={version.id} className={styles.release} data-open={open || undefined}>
                            <article className={styles.card} aria-labelledby={`cl-${version.id}`}>
                                <header className={styles.relHead}>
                                    <span className={styles.ver}>{version.version}</span>
                                    <h2 id={`cl-${version.id}`} className={styles.relTitle}>
                                        {version.title}
                                    </h2>
                                    <span className={styles.date}>{day(version.releasedOn)}</span>
                                    <Stand version={version} />
                                    <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setToggled(toggle(toggled, version.id))}>
                                        {open ? "Zuklappen" : "Aufklappen"}
                                        <Icon name={open ? "chevron-up" : "chevron-down"} />
                                    </button>
                                </header>
                                {open ? (
                                    <>
                                        <div className={styles.groups}>
                                            {present.map((kind) => {
                                                const rows = items.filter((item) => item.kind === kind);

                                                return (
                                                    <section key={kind} aria-label={KIND_LABELS[kind]}>
                                                        <Kind kind={kind} count={rows.length} />
                                                        <ul className={styles.items}>
                                                            {rows.map((item, at) => (
                                                                <li key={at} className={styles.item}>
                                                                    {item.text}
                                                                    <span className={styles.meta}>
                                                                        <Area area={item.area} />
                                                                        {item.task && " · "}
                                                                        {taskLink(item.task)}
                                                                    </span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </section>
                                                );
                                            })}
                                        </div>
                                        {actions(version)}
                                    </>
                                ) : (
                                    <p className={styles.counts}>
                                        {present.map((kind) => (
                                            <Kind key={kind} kind={kind} count={items.filter((item) => item.kind === kind).length} />
                                        ))}
                                    </p>
                                )}
                            </article>
                        </li>
                    );
                })}
            </ol>
        );
    }

    function list(): JSX.Element {
        const rows = (items: readonly IChangeItem[]) =>
            items.map((item, at) => (
                <tr key={at}>
                    <td>
                        <Kind kind={item.kind} />
                    </td>
                    <td className={styles.text}>
                        <Marked text={item.text} query={query} />
                    </td>
                    <td>
                        <Area area={item.area} />
                    </td>
                    <td>
                        {taskLink(item.task)}
                    </td>
                </tr>
            ));

        return (
            <div className={styles.card}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">Art</th>
                            <th scope="col">Änderung</th>
                            <th scope="col">Bereich</th>
                            <th scope="col">Aufgabe</th>
                        </tr>
                    </thead>
                    {hits.map(({ version, items }) => (
                        <tbody key={version.id}>
                            <tr className={styles.vrow}>
                                <th scope="rowgroup" colSpan={4}>
                                    <span className={styles.ver}>
                                        <Marked text={version.version} query={query} />
                                    </span>{" "}
                                    <Marked text={version.title} query={query} /> <span className={styles.date}>· {day(version.releasedOn)}</span> <Stand version={version} />
                                </th>
                            </tr>
                            {rows(items)}
                        </tbody>
                    ))}
                </table>
            </div>
        );
    }

    const latest = versions[0];
    const hitCount = hits.reduce((sum, hit) => sum + hit.items.length, 0);

    return (
        <section>
            <PageHeader title="Changelog" meta={latest ? `${plural(versions.length, "Version", "Versionen")} · zuletzt ${day(latest.releasedOn)}` : undefined}>
                {state.data && (
                    <span className={styles.channel}>
                        {channelName ? `Postet in ${channelName}` : "Noch kein Kanal"}
                        <Button size="sm" variant="ghost" icon="discord" onClick={() => setDialog({ kind: "channel" })}>
                            Kanal wählen
                        </Button>
                    </span>
                )}
                <Button icon="list" onClick={() => setDialog({ kind: "edit", version: null, works: true })}>
                    Aus works einfügen
                </Button>
                <Button variant="primary" icon="plus" onClick={() => setDialog({ kind: "edit", version: null, works: false })}>
                    Neue Version
                </Button>
            </PageHeader>

            <div className={styles.bar}>
                <label className={styles.search}>
                    <Icon name="search" />
                    <span className="u-sr">Suchen</span>
                    <input ref={search} type="search" placeholder="Änderung, Version oder Aufgabe suchen …" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <kbd aria-hidden="true">/</kbd>
                </label>
                <Segmented
                    name="cl-ansicht"
                    legend="Ansicht"
                    value={view}
                    onChange={choose}
                    options={[
                        { value: "zeitleiste", label: "Zeitleiste" },
                        { value: "liste", label: "Liste" },
                    ]}
                />
            </div>

            <div className={styles.chips} role="group" aria-label="Filter">
                <button type="button" className={styles.chip} aria-pressed={kinds.length === 0} onClick={() => setKinds([])}>
                    Alle Arten
                </button>
                {CHANGE_KINDS.map((kind) => (
                    <button key={kind} type="button" className={styles.chip} aria-pressed={kinds.includes(kind)} onClick={() => setKinds(toggle(kinds, kind))}>
                        {KIND_LABELS[kind]}
                    </button>
                ))}
                <span className={styles.chipGap} aria-hidden="true" />
                {CHANGE_AREAS.map((area) => (
                    <button key={area} type="button" className={styles.chip} aria-pressed={areas.includes(area)} onClick={() => setAreas(toggle(areas, area))}>
                        {AREA_LABELS[area]}
                    </button>
                ))}
                {task && (
                    <button type="button" className={`${styles.chip} ${styles.chipTask}`} onClick={() => setTask(null)}>
                        Aufgabe {task} <span aria-hidden="true">✕</span>
                        <span className="u-sr">, Filter entfernen</span>
                    </button>
                )}
            </div>

            {state.error && !state.data ? (
                <Failure message={state.error.message} onRetry={state.reload} />
            ) : !state.data ? (
                <Loading label="Changelog wird geladen" />
            ) : versions.length === 0 ? (
                <div className={styles.empty}>
                    <p>Noch keine Version. Leg die erste an oder füg die Ausgabe von works changelog ein.</p>
                </div>
            ) : hits.length === 0 ? (
                <div className={styles.empty}>
                    <p>{searching ? `Nichts passt zu „${query.trim()}“.` : "Nichts passt zu den Filtern."}</p>
                    <Button size="sm" onClick={reset}>
                        Filter zurücksetzen
                    </Button>
                </div>
            ) : (
                <>
                    {filtered && (
                        <p className={styles.hits} role="status">
                            {plural(hitCount, "Treffer", "Treffer")} in {plural(hits.length, "Version", "Versionen")}
                        </p>
                    )}
                    {searching || view === "liste" ? list() : timeline()}
                </>
            )}

            {dialog?.kind === "edit" && <EditDialog version={dialog.version} works={dialog.works} onClose={() => setDialog(null)} onSaved={state.reload} />}

            {dialog?.kind === "post" && (
                <PostDialog version={dialog.version} channelName={channelName} busy={busy} onCancel={() => setDialog(null)} onConfirm={(version) => void run(() => api(`/api/changelog/${version.id}/post`, { method: "POST" }), version.posted ? "Post aktualisiert." : `Gepostet in ${channelName ?? "Discord"}.`)} />
            )}

            {dialog?.kind === "unpost" && (
                <ConfirmDialog open title="Post löschen?" confirmLabel="Post löschen" tone="danger" busy={busy} onCancel={() => setDialog(null)} onConfirm={() => void run(() => api(`/api/changelog/${dialog.version.id}/post`, { method: "DELETE" }), "Post gelöscht. Die Version ist wieder ein Entwurf.")}>
                    <p>
                        Die Nachricht zu {dialog.version.version} wird in Discord gelöscht. Die Version bleibt hier als Entwurf und lässt sich neu posten.
                    </p>
                </ConfirmDialog>
            )}

            {dialog?.kind === "delete" && (
                <ConfirmDialog open title="Version löschen?" confirmLabel="Version löschen" tone="danger" busy={busy} onCancel={() => setDialog(null)} onConfirm={() => void run(() => api(`/api/changelog/${dialog.version.id}`, { method: "DELETE" }), `Version ${dialog.version.version} gelöscht.`)}>
                    <p>
                        <strong>
                            {dialog.version.version} · {dialog.version.title}
                        </strong>{" "}
                        mit {plural(dialog.version.items.length, "Änderung", "Änderungen")} wird gelöscht{dialog.version.posted ? ", dazu der Post in Discord" : ""}. Das lässt sich nicht zurücknehmen.
                    </p>
                </ConfirmDialog>
            )}

            {dialog?.kind === "channel" && (
                <ChannelDialog
                    current={channel?.id ?? null}
                    optionsPath="/api/changelog/channels"
                    title="Kanal für den Changelog"
                    intro="Textkanäle auf dem Server des Teams. Der Bot braucht dort „Nachrichten senden“ und „Dateien anhängen“. Bisherige Posts bleiben, wo sie sind."
                    save={async (channelId) => {
                        const chosen = await api<IChangelogView["channel"]>("/api/changelog/channel", { method: "PUT", body: { channelId } });

                        return { text: `Der Changelog postet jetzt in #${chosen?.name ?? channelId}.`, ok: true };
                    }}
                    onClose={() => setDialog(null)}
                    onChanged={state.reload}
                />
            )}
        </section>
    );
}

/** Neue Version oder bearbeiten. Steht nur im DOM, solange es offen ist; so beginnt jedes Öffnen frisch. */
function EditDialog({ version, works, onClose, onSaved }: { readonly version: IChangelogVersion | null; readonly works: boolean; readonly onClose: () => void; readonly onSaved: () => void }): JSX.Element {
    const notify = useToast();
    const [draft, setDraft] = useState<IDraft>(() => draftOf(version));
    const [touched, setTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const checked = checkVersionInput(draft);
    const problem = "problem" in checked ? checked.problem : null;

    async function save(): Promise<void> {
        if (!("input" in checked)) return setTouched(true);

        setBusy(true);

        try {
            await api(version ? `/api/changelog/${version.id}` : "/api/changelog", { method: version ? "PUT" : "POST", body: checked.input });
            notify(`Version ${checked.input.version} gespeichert.`, "ok");
            onSaved();
            onClose();
        } catch (error) {
            notify(message(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ConfirmDialog open wide title={version ? `Version ${version.version} bearbeiten` : "Neue Version"} confirmLabel="Speichern" busy={busy} confirmDisabled={touched && problem !== null} onCancel={onClose} onConfirm={() => void save()}>
            <VersionEditor
                value={draft}
                works={works}
                problem={touched ? problem : null}
                onChange={(next) => {
                    setDraft(next);
                    setTouched(true);
                }}
            />
        </ConfirmDialog>
    );
}

/** Vorschau genau des Bilds, das gepostet wird; erst „Posten“ schickt. */
function PostDialog({ version, channelName, busy, onCancel, onConfirm }: { readonly version: IChangelogVersion; readonly channelName: string | null; readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: (version: IChangelogVersion) => void }): JSX.Element {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        fetch(`/api/changelog/${version.id}/bild`, { credentials: "same-origin", signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Die Vorschau ließ sich nicht laden.");

                return response.blob();
            })
            // Als data:-URL: Die CSP lässt blob: in img-src nicht zu.
            .then((blob) => dataUrl(blob))
            .then(setUrl)
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) setError(message(reason));
            });

        return () => controller.abort();
    }, [version.id]);

    return (
        <ConfirmDialog open wide title={version.posted ? `Post zu ${version.version} aktualisieren` : `${version.version} posten`} confirmLabel={version.posted ? "Aktualisieren" : "Posten"} busy={busy} confirmDisabled={url === null} onCancel={onCancel} onConfirm={() => onConfirm(version)}>
            <p>{version.posted ? "Der Bot ändert seine Nachricht und zeichnet das Bild neu, so:" : `Geht so in ${channelName ?? "den gewählten Kanal"}, darunter ein Knopf „Alle Änderungen“ zu dieser Seite:`}</p>
            {error ? <Failure message={error} /> : url ? <img className={styles.preview} src={url} alt={`Vorschau des Posts zu ${version.version}`} /> : <Loading label="Vorschau wird gezeichnet" />}
        </ConfirmDialog>
    );
}
