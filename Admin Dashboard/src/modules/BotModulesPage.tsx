import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    CLOSED_TEXT,
    LINK_MODE_LABELS,
    MODULE_STATUS_LABELS,
    NOTICE_MAX,
    PERMANENT_BOT_MODULES,
    type IBotModuleSaved,
    type IBotModuleView,
    type IBotModulesView,
    type LinkMode,
    type ModuleStatus,
} from "../../shared/botModules";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./botModules.module.scss";

/**
 * W-0131, Bot → Module (Entwurf A2): Was für alle Server gilt, je Modul.
 * Links die Liste mit Status, rechts Status, Hinweis und bei RL Tracking die
 * Verknüpfungsart. Speichern gibt dem Bot Bescheid.
 */
type Filter = "all" | ModuleStatus | "notice";

interface IDraft {
    readonly status: ModuleStatus;
    readonly notice: string;
    readonly linkMode: LinkMode | null;
}

const CATEGORIES: readonly { readonly id: string | null; readonly label: string }[] = [
    { id: "competition", label: "Competition" },
    { id: "community", label: "Community" },
    { id: "moderation", label: "Moderation" },
    { id: "engagement", label: "Engagement" },
    { id: "content", label: "Content" },
    { id: "utility", label: "Utility" },
    { id: null, label: "Sonstige" },
];

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
    { id: "all", label: "Alle" },
    { id: "on", label: "An" },
    { id: "beta", label: "Beta" },
    { id: "off", label: "Aus" },
    { id: "notice", label: "Mit Hinweis" },
];

const STATUS_TEXT: Readonly<Record<ModuleStatus, string>> = {
    on: "Überall, wo Server es eingeschaltet haben.",
    beta: "Nur wo Inhaber oder ein Server-Verwalter Beta-Tester ist.",
    off: "Überall abgeschaltet, Befehle antworten mit dem Hinweis.",
};

const LINK_TEXT: Readonly<Record<LinkMode, { readonly text: string; readonly plus: string; readonly minus: string }>> = {
    login: { text: "/rank link führt zur Anmeldung bei Epic Games.", plus: "Nur der Besitzer kann sein Konto verbinden", minus: "Ein Schritt mehr für Mitglieder" },
    name: { text: "/rank link <Name> wie vor November.", plus: "Schnell, keine Anmeldung", minus: "Fremde Namen samt Rang-Rollen möglich" },
    both: { text: "Name für Karte und /rank me, Rang-Rollen erst nach der Anmeldung.", plus: "Schneller Einstieg per Name, Rollen nur für echte Besitzer", minus: "Zwei Wege zu erklären" },
};

const COMMAND_FORM: Readonly<Record<LinkMode, string>> = { login: "/rank link", name: "/rank link <Name>", both: "/rank link [Name]" };

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isPermanent(module: string): boolean {
    return (PERMANENT_BOT_MODULES as readonly string[]).includes(module);
}

function draftOf(module: IBotModuleView): IDraft {
    return { status: module.status, notice: module.notice ?? "", linkMode: module.linkMode };
}

function matches(module: IBotModuleView, filter: Filter, search: string): boolean {
    if (search && !`${module.name} ${module.module}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "notice") return module.notice !== null;

    return filter === "all" || module.status === filter;
}

/** „Status: An → Aus“ je geändertem Feld, für die Speicherleiste. */
function changes(saved: IBotModuleView, draft: IDraft): { readonly label: string; readonly before: string; readonly after: string }[] {
    const list: { label: string; before: string; after: string }[] = [];
    const notice = draft.notice.trim();

    if (draft.status !== saved.status) list.push({ label: "Status", before: MODULE_STATUS_LABELS[saved.status], after: MODULE_STATUS_LABELS[draft.status] });
    if (notice !== (saved.notice ?? "")) list.push({ label: "Hinweis", before: saved.notice ? "gesetzt" : "leer", after: notice ? "neu" : "leer" });
    if (draft.linkMode !== saved.linkMode && saved.linkMode && draft.linkMode) {
        list.push({ label: "Epic-Konto verbinden", before: LINK_MODE_LABELS[saved.linkMode], after: LINK_MODE_LABELS[draft.linkMode] });
    }

    return list;
}

function StatusBadge({ status, changed }: { readonly status: ModuleStatus; readonly changed?: boolean }): JSX.Element {
    if (changed) return <span className={`${styles.badge} ${styles.changed}`}>Geändert</span>;

    return <span className={`${styles.badge} ${styles[status]}`}>{status === "beta" ? "Beta" : MODULE_STATUS_LABELS[status]}</span>;
}

export function BotModulesPage(): JSX.Element {
    useTitle("Module");
    const notify = useToast();
    const view = useApi<IBotModulesView>("/api/bot-modules");
    const [params, setParams] = useSearchParams();
    const [filter, setFilter] = useState<Filter>("all");
    const [search, setSearch] = useState("");
    const [drafts, setDrafts] = useState<Record<string, IDraft>>({});
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [leaving, setLeaving] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useLive("modules", view.reload);

    const modules = useMemo(() => view.data?.modules ?? [], [view.data]);
    const chosenId = params.get("m");
    const selected = modules.find((entry) => entry.module === chosenId) ?? modules[0] ?? null;
    const draft = selected ? (drafts[selected.module] ?? draftOf(selected)) : null;
    const pending = selected && draft ? changes(selected, draft) : [];
    const dirty = pending.length > 0;

    const setDraft = (next: Partial<IDraft>): void => {
        if (!selected || !draft) return;
        setDrafts((current) => ({ ...current, [selected.module]: { ...draft, ...next } }));
    };

    const choose = (id: string): void => {
        if (dirty && id !== selected?.module) {
            setLeaving(id);

            return;
        }
        setParams({ m: id });
    };

    const discard = (): void => {
        if (!selected) return;
        setDrafts((current) => {
            const { [selected.module]: _gone, ...rest } = current;

            return rest;
        });
    };

    // Strenger heißt: weniger Server oder fremde Namen erlaubt. Dann erst fragen.
    const risky = selected && draft ? (draft.status !== selected.status && draft.status !== "on") || (draft.linkMode === "name" && selected.linkMode !== "name") : false;

    const save = async (): Promise<void> => {
        if (!selected || !draft) return;
        setBusy(true);

        try {
            const answer = await api<IBotModuleSaved>(`/api/bot-modules/${selected.module}`, {
                method: "PUT",
                body: { status: draft.status, notice: draft.notice, ...(draft.linkMode ? { linkMode: draft.linkMode } : {}) },
            });

            discard();
            setConfirming(false);
            notify(answer.bot ? "Gespeichert, Bot hat es übernommen." : "Gespeichert, Bot gerade nicht erreichbar. Er übernimmt es in spätestens 5 Minuten.");
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    const requestSave = (): void => {
        if (!dirty || busy) return;
        if (risky) setConfirming(true);
        else void save();
    };

    // Strg+S speichert, „/“ springt in die Suche.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                requestSave();
            } else if (event.key === "/" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    });

    if (view.error && !view.data) return <Failure message={view.error.message} onRetry={view.reload} />;
    if (!view.data || !selected || !draft) return <Loading label="Module werden geladen" />;

    const { botSyncedAt } = view.data;
    const count = (status: ModuleStatus): number => modules.filter((entry) => entry.status === status).length;
    const shown = modules.filter((entry) => matches(entry, filter, search));
    const permanent = isPermanent(selected.module);
    const notice = draft.notice.trim();
    const total = modules.find((entry) => entry.module === "rl-tracking")?.servers ?? 0;
    const color = (category: string | null): string => (category ? `var(--c-mod-${category})` : "var(--c-text-faint)");

    return (
        <>
            <UnsavedGuard dirty={dirty} />
            <PageHeader title="Module" meta="Was für alle Server gilt, je Modul. Jede Änderung steht im Protokoll.">
                <span className={`${styles.sync} ${botSyncedAt ? styles.synced : ""}`} role="status">
                    <i aria-hidden="true" />
                    {botSyncedAt ? `Bot hat den Stand von ${formatDateTime(botSyncedAt)} übernommen` : "Noch kein Bescheid vom Bot seit dem Start"}
                </span>
            </PageHeader>

            <div className={styles.stats}>
                <div className={styles.stat}>
                    <span>Module</span>
                    <b>{modules.length}</b>
                    <small>{modules.length - 1} Server-Module und RL Tracking</small>
                </div>
                <div className={`${styles.stat} ${styles.on}`}>
                    <span>An</span>
                    <b>{count("on")}</b>
                    <small>auf allen Servern</small>
                </div>
                <div className={`${styles.stat} ${styles.beta}`}>
                    <span>Nur Beta</span>
                    <b>{count("beta")}</b>
                    <small>nur auf Beta-Servern</small>
                </div>
                <div className={`${styles.stat} ${styles.off}`}>
                    <span>Aus</span>
                    <b>{count("off")}</b>
                    <small>{modules.filter((entry) => entry.status === "off").map((entry) => entry.name).join(", ") || "keins"}</small>
                </div>
            </div>

            <div className={`${styles.layout} ${chosenId ? styles.showDetail : ""}`}>
                <Panel className={styles.list}>
                    <label className={styles.search}>
                        <Icon name="search" size={16} aria-hidden="true" />
                        <span className={styles.sr}>Modul suchen</span>
                        <input ref={searchRef} type="search" placeholder="Modul suchen" value={search} onChange={(event) => setSearch(event.target.value)} />
                        <kbd aria-hidden="true">/</kbd>
                    </label>
                    <div className={styles.filters} role="group" aria-label="Filter">
                        {FILTERS.map((entry) => (
                            <button key={entry.id} type="button" className={styles.chip} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
                                {entry.label} {entry.id === "all" ? modules.length : entry.id === "notice" ? modules.filter((item) => item.notice).length : count(entry.id)}
                            </button>
                        ))}
                    </div>
                    {CATEGORIES.map((category) => {
                        const items = shown.filter((entry) => entry.category === category.id || (category.id === null && !CATEGORIES.some((known) => known.id && known.id === entry.category)));

                        if (items.length === 0) return null;

                        return (
                            <div key={category.label} className={styles.group}>
                                <p className={styles.cat}>
                                    <span className={styles.dot} style={{ background: color(category.id) }} aria-hidden="true" />
                                    {category.label}
                                    <em>{items.length}</em>
                                </p>
                                {items.map((entry) => {
                                    const changed = !!drafts[entry.module] && changes(entry, drafts[entry.module]).length > 0;

                                    return (
                                        <button
                                            key={entry.module}
                                            type="button"
                                            className={styles.row}
                                            aria-current={entry.module === selected.module ? "true" : undefined}
                                            onClick={() => choose(entry.module)}
                                            style={{ ["--mod" as string]: color(entry.category) }}
                                        >
                                            <span className={styles.rowIcon} aria-hidden="true">
                                                <Icon name="puzzle" size={15} />
                                            </span>
                                            <b>{entry.name}</b>
                                            <small>
                                                {entry.notice && <Icon name="bell" size={12} aria-label="Hinweis gesetzt" />}
                                                {isPermanent(entry.module) ? "immer an" : entry.module === "rl-tracking" ? "alle Server" : `${entry.servers} Server`}
                                            </small>
                                            <StatusBadge status={entry.status} changed={changed} />
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {shown.length === 0 && <p className={styles.empty}>Kein Modul passt zu Suche und Filter.</p>}
                </Panel>

                <Panel className={styles.detail}>
                    <Link className={styles.back} to="/module">
                        <Icon name="chevron-left" size={16} aria-hidden="true" /> Alle Module
                    </Link>
                    <header className={styles.head} style={{ ["--mod" as string]: color(selected.category) }}>
                        <span className={styles.headIcon} aria-hidden="true">
                            <Icon name="puzzle" size={22} />
                        </span>
                        <div>
                            <h2>
                                {selected.name} <StatusBadge status={selected.status} />
                            </h2>
                            {selected.description && <p>{selected.description}</p>}
                        </div>
                        <div className={styles.reach}>
                            <b>{permanent || selected.module === "rl-tracking" ? `alle ${total}` : selected.servers}</b>
                            <span>{selected.module === "rl-tracking" ? "Server, kein Schalter je Server" : permanent ? "Server, gehört fest zum Bot" : "Server haben es eingeschaltet"}</span>
                        </div>
                    </header>

                    <section className={styles.section}>
                        <h3>
                            <span>01</span>Status
                        </h3>
                        {permanent ? (
                            <p className={styles.note}>Gehört fest zum Bot und bleibt immer an. Einstellbar ist nur der Hinweis.</p>
                        ) : (
                            <>
                                <p className={styles.note}>Gilt für alle Server. Die Auswahl der Server bleibt gespeichert und kommt beim Einschalten zurück.</p>
                                <div className={styles.states} role="radiogroup" aria-label="Status">
                                    {(["on", "beta", "off"] as const).map((status) => (
                                        <button
                                            key={status}
                                            type="button"
                                            role="radio"
                                            aria-checked={draft.status === status}
                                            className={`${styles.state} ${styles[status]}`}
                                            onClick={() => setDraft({ status })}
                                        >
                                            <b>{MODULE_STATUS_LABELS[status]}</b>
                                            <small>{STATUS_TEXT[status]}</small>
                                        </button>
                                    ))}
                                </div>
                                {draft.status !== selected.status && (
                                    <p className={styles.impact}>
                                        <Icon name="server" size={15} aria-hidden="true" />
                                        {draft.status === "off"
                                            ? `Betrifft ${selected.module === "rl-tracking" ? total : selected.servers} Server: Dort ist das Modul dann aus.`
                                            : draft.status === "beta"
                                              ? "Bleibt nur auf Servern, deren Inhaber oder Server-Verwalter Beta-Tester sind."
                                              : `Wieder an auf ${selected.module === "rl-tracking" ? total : selected.servers} Servern.`}
                                    </p>
                                )}
                            </>
                        )}
                    </section>

                    <section className={styles.section}>
                        <h3>
                            <span>02</span>Hinweis
                        </h3>
                        <p className={styles.note}>Optional. Steht im Bot-Dashboard beim Modul und ist die Antwort, solange es aus ist.</p>
                        <div className={styles.noticeGrid}>
                            <div>
                                <label className={styles.sr} htmlFor="modul-hinweis">
                                    Hinweis
                                </label>
                                <textarea
                                    id="modul-hinweis"
                                    className={styles.textarea}
                                    value={draft.notice}
                                    maxLength={NOTICE_MAX}
                                    placeholder="Leer lassen, dann steht dort nichts. Zum Beispiel: „Wird gerade überarbeitet, ab 21 Uhr wieder da.“"
                                    onChange={(event) => setDraft({ notice: event.target.value })}
                                />
                                <p className={styles.count}>
                                    <span>{notice ? "Wird so übernommen" : "Kein Hinweis gesetzt"}</span>
                                    <span>
                                        {notice.length} / {NOTICE_MAX}
                                    </span>
                                </p>
                            </div>
                            <div className={styles.previews}>
                                <div className={styles.preview}>
                                    <p>Bot-Dashboard</p>
                                    {notice ? (
                                        <div className={styles.dashBanner}>
                                            <Icon name="bell" size={16} aria-hidden="true" />
                                            <span>
                                                {draft.status === "off" && <b>Vorübergehend abgeschaltet. </b>}
                                                {notice}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className={styles.muted}>Ohne Hinweis steht dort nichts.</span>
                                    )}
                                </div>
                                {draft.status !== "on" && (
                                    <div className={styles.preview}>
                                        <p>Antwort in Discord</p>
                                        <div className={styles.discord}>
                                            <span className={styles.avatar} aria-hidden="true">
                                                N
                                            </span>
                                            <b>RL Nexus</b>
                                            <span>{notice || CLOSED_TEXT}</span>
                                            <small>Nur du kannst das sehen</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {selected.linkMode && draft.linkMode && (
                        <section className={styles.section}>
                            <h3>
                                <span>03</span>Epic-Konto verbinden
                            </h3>
                            <p className={styles.note}>Wie Mitglieder ihr Epic-Konto mit Discord verbinden. Gilt nur für RL Tracking.</p>
                            <div className={styles.choices} role="radiogroup" aria-label="Epic-Konto verbinden">
                                {(["login", "name", "both"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="radio"
                                        aria-checked={draft.linkMode === mode}
                                        className={`${styles.choice} ${selected.linkMode === mode && draft.linkMode !== mode ? styles.was : ""}`}
                                        onClick={() => setDraft({ linkMode: mode })}
                                    >
                                        <b>
                                            {LINK_MODE_LABELS[mode]}
                                            {selected.linkMode === mode && draft.linkMode !== mode && <span className={styles.tagOld}>bisher</span>}
                                            {mode === "both" && <span className={styles.tagGood}>empfohlen</span>}
                                        </b>
                                        <small>{LINK_TEXT[mode].text}</small>
                                        <span className={styles.plus}>
                                            <Icon name="check" size={13} aria-hidden="true" />
                                            {LINK_TEXT[mode].plus}
                                        </span>
                                        <span className={mode === "name" ? styles.warn : styles.minus}>
                                            <Icon name={mode === "name" ? "alert" : "minus"} size={13} aria-hidden="true" />
                                            {LINK_TEXT[mode].minus}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <p className={styles.impact}>
                                <Icon name="discord" size={15} aria-hidden="true" />
                                Befehl: <code>{COMMAND_FORM[draft.linkMode]}</code>
                                {draft.linkMode !== "name" && selected.linkMode === "name" && " · Rang-Rollen ohne bestätigte Verknüpfung werden entfernt."}
                            </p>
                        </section>
                    )}

                    {selected.history.length > 0 && (
                        <section className={styles.section}>
                            <h3>
                                <span>{selected.linkMode ? "04" : "03"}</span>Verlauf
                            </h3>
                            <ol className={styles.history}>
                                {selected.history.map((entry) => (
                                    <li key={`${entry.at}-${entry.detail}`}>
                                        <b>{entry.detail}</b>
                                        <small>
                                            {entry.by} · {formatDateTime(entry.at)}
                                        </small>
                                    </li>
                                ))}
                            </ol>
                            <Link className={styles.allLog} to="/dev/protokoll">
                                Ganzes Protokoll
                            </Link>
                        </section>
                    )}

                    {dirty && (
                        <div className={styles.save} role="region" aria-label="Ungespeicherte Änderungen">
                            <div className={styles.what}>
                                <b>{pending.length === 1 ? "1 Änderung nicht gespeichert" : `${pending.length} Änderungen nicht gespeichert`}</b>
                                <span>
                                    {pending.map((change, index) => (
                                        <span key={change.label}>
                                            {index > 0 && " · "}
                                            {change.label}: <s>{change.before}</s> → {change.after}
                                        </span>
                                    ))}
                                </span>
                            </div>
                            <div className={styles.saveActions}>
                                <Button variant="ghost" onClick={discard} disabled={busy}>
                                    Verwerfen
                                </Button>
                                <Button variant="primary" onClick={requestSave} busy={busy}>
                                    Speichern
                                </Button>
                                <kbd aria-hidden="true">Strg+S</kbd>
                            </div>
                        </div>
                    )}
                </Panel>
            </div>

            <ConfirmDialog
                open={confirming}
                title={draft.linkMode === "name" && selected.linkMode !== "name" ? "Verbinden nur per Name erlauben?" : `${selected.name} ${draft.status === "off" ? "überall abschalten" : "auf Beta-Server begrenzen"}?`}
                confirmLabel={draft.status === "off" ? `Für ${selected.module === "rl-tracking" ? total : selected.servers} Server abschalten` : "Speichern"}
                tone="danger"
                busy={busy}
                onConfirm={() => void save()}
                onCancel={() => setConfirming(false)}
            >
                {draft.status !== selected.status && draft.status !== "on" && (
                    <p>
                        Das trifft sofort <b>{selected.module === "rl-tracking" ? total : selected.servers} Server</b>. Die Einstellungen der Server bleiben gespeichert und gelten beim
                        Einschalten wieder. Hinweis an die Server: <b>{notice || "keiner"}</b>
                        {notice ? "" : `, Befehle antworten mit „${CLOSED_TEXT}“`}.
                    </p>
                )}
                {draft.linkMode === "name" && selected.linkMode !== "name" && <p>Dann kann jeder einen fremden Epic-Namen eintragen und bekommt dessen Rang-Rollen.</p>}
            </ConfirmDialog>

            <ConfirmDialog
                open={leaving !== null}
                title="Änderungen verwerfen?"
                confirmLabel="Verwerfen"
                tone="danger"
                onConfirm={() => {
                    discard();
                    if (leaving) setParams({ m: leaving });
                    setLeaving(null);
                }}
                onCancel={() => setLeaving(null)}
            >
                <p>Bei {selected.name} ist etwas geändert und noch nicht gespeichert.</p>
            </ConfirmDialog>
        </>
    );
}
