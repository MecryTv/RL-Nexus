import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IGuildList } from "../../shared/api";
import {
    CLOSED_TEXT,
    LINK_MODE_LABELS,
    MODULE_STATUS_LABELS,
    NOTICE_MAX,
    PERMANENT_BOT_MODULES,
    type IBotModuleSaved,
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
import { PageTabs } from "../components/PageTabs";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { formatDateTime, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./botModules.module.scss";
import { ModuleHistory } from "./ModuleHistory";
import { ModuleList } from "./ModuleList";
import { ModuleValues } from "./ModuleValues";
import {
    allChanges,
    allDraftOf,
    bodyOf,
    CATEGORIES,
    categoryOf,
    color,
    firstError,
    lowered,
    overrideSummary,
    ownCount,
    serverChanges,
    serverDraftOf,
    visibleModules,
    type Draft,
    type Filter,
} from "./moduleDraft";
import { GuildIcon, ServerScope } from "./ServerScope";

/**
 * W-0131/W-0133, Bot → Module (Entwurf A2): links Suche, Kategorie-Raster und
 * die Module einer Kategorie, rechts Status, Hinweis, Verknüpfungsart und die
 * Grenzen. Oben der Bereich: alle Server oder einer. Adresse:
 * /module?m=<id>&server=<guildId>&cat=<kategorie>.
 */
const STATUS_TEXT: Readonly<Record<ModuleStatus, string>> = {
    on: "Überall, wo Server es eingeschaltet haben.",
    beta: "Nur wo Inhaber oder ein Server-Verwalter Beta-Tester oder Dev-Tester ist.",
    off: "Überall abgeschaltet, Befehle antworten mit dem Hinweis.",
};

const LINK_TEXT: Readonly<Record<LinkMode, { readonly text: string; readonly plus: string; readonly minus: string }>> = {
    login: { text: "/rank link führt zur Anmeldung bei Epic Games.", plus: "Nur der Besitzer kann sein Konto verbinden", minus: "Ein Schritt mehr für Mitglieder" },
    name: { text: "/rank link <Name> wie vor November.", plus: "Schnell, keine Anmeldung", minus: "Fremde Namen samt Rang-Rollen möglich" },
    both: { text: "Name für Karte und /rank me, Rang-Rollen erst nach der Anmeldung.", plus: "Schneller Einstieg per Name, Rollen nur für echte Besitzer", minus: "Zwei Wege zu erklären" },
};

const COMMAND_FORM: Readonly<Record<LinkMode, string>> = { login: "/rank link", name: "/rank link <Name>", both: "/rank link [Name]" };
const NONE_CATEGORY = "sonstige";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isPermanent(module: string): boolean {
    return (PERMANENT_BOT_MODULES as readonly string[]).includes(module);
}

function typing(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function BotModulesPage(): JSX.Element {
    useTitle("Module");
    const notify = useToast();
    const [params, setParams] = useSearchParams();
    const server = params.get("server");
    const tab = params.get("tab") === "verlauf" ? "verlauf" : "module";
    const view = useApi<IBotModulesView>(server ? `/api/bot-modules?server=${server}` : "/api/bot-modules");
    const guilds = useApi<IGuildList>("/api/guilds");
    const [filter, setFilter] = useState<Filter>("all");
    const [search, setSearch] = useState("");
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    // Review W-0133: je gesenktem Wert, wie viele Server gerade darüber liegen (null: nicht zählbar).
    const [above, setAbove] = useState<Record<string, number | null>>({});
    const [leaving, setLeaving] = useState<Record<string, string | null> | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useLive("modules", view.reload);

    // Solange die Antwort zum alten Bereich gehört, nichts davon zeigen.
    const data = view.data && (view.data.server?.id ?? null) === server ? view.data : null;
    const modules = useMemo(() => data?.modules ?? [], [data]);
    const serverOverrides = useMemo(() => (data?.server ? new Map(data.server.overrides.map((entry) => [entry.module, entry])) : null), [data]);
    const guildList = guilds.data?.guilds ?? [];
    const guildOf = (id: string): (typeof guildList)[number] | undefined => guildList.find((entry) => entry.id === id);
    const serverName = server ? (guildOf(server)?.name ?? data?.server?.name ?? server) : null;

    const chosenId = params.get("m");
    const chosen = modules.find((entry) => entry.module === chosenId);
    const catParam = params.get("cat");
    const category = catParam ? (catParam === NONE_CATEGORY ? null : catParam) : chosen ? categoryOf(chosen) : "rocket-league";
    const selected = chosen ?? modules.find((entry) => categoryOf(entry) === category) ?? modules[0] ?? null;
    const key = selected ? `${server ?? "all"}:${selected.module}` : "";
    const savedOverride = selected ? serverOverrides?.get(selected.module) : undefined;
    const draft: Draft | null = selected ? (drafts[key] ?? (server ? serverDraftOf(savedOverride) : allDraftOf(selected))) : null;
    const pending = selected && draft ? (draft.kind === "all" ? allChanges(selected, draft) : serverChanges(selected, savedOverride, draft)) : [];
    const dirty = pending.length > 0;

    const update = (next: Record<string, string | null>): void => {
        setParams((current) => {
            const merged = new URLSearchParams(current);

            for (const [name, value] of Object.entries(next)) {
                if (value === null) merged.delete(name);
                else merged.set(name, value);
            }

            return merged;
        });
    };

    const go = (next: Record<string, string | null>): void => {
        const moves = ("m" in next && next.m !== selected?.module) || ("server" in next && next.server !== server);

        if (dirty && moves) setLeaving(next);
        else update(next);
    };

    const setDraft = (next: Partial<Draft>): void => {
        if (!draft) return;
        setDrafts((current) => ({ ...current, [key]: { ...draft, ...next } as Draft }));
    };

    const discard = (): void => {
        setDrafts((current) => {
            const { [key]: _gone, ...rest } = current;

            return rest;
        });
    };

    const lowerList = selected && draft?.kind === "all" ? lowered(selected, draft) : [];
    const serverOff = draft?.kind === "server" && draft.status === "off" && savedOverride?.status !== "off";
    // Strenger heißt: weniger Server, fremde Namen erlaubt oder eine Grenze sinkt. Dann erst fragen.
    const risky =
        selected && draft
            ? draft.kind === "all"
                ? (draft.status !== selected.status && draft.status !== "on") || (draft.linkMode === "name" && selected.linkMode !== "name") || lowerList.length > 0
                : serverOff || (draft.linkMode === "name" && (savedOverride?.linkMode ?? selected.linkMode) !== "name")
            : false;

    const save = async (): Promise<void> => {
        if (!selected || !draft) return;
        setBusy(true);

        try {
            const answer = await api<IBotModuleSaved>(`/api/bot-modules/${selected.module}`, { method: "PUT", body: bodyOf(selected, draft, server) });
            const where = server ? `Für ${serverName} gespeichert` : "Gespeichert";

            discard();
            setConfirming(false);
            notify(answer.bot ? `${where}, Bot hat es übernommen.` : `${where}, Bot gerade nicht erreichbar. Er übernimmt es in spätestens 5 Minuten.`);
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    const requestSave = (): void => {
        if (!dirty || busy || !selected || !draft) return;

        const error = firstError(selected.module, draft);

        if (error) notify(error, "danger");
        else if (risky) void openConfirm();
        else void save();
    };

    const openConfirm = async (): Promise<void> => {
        if (!selected || draft?.kind !== "all") return setConfirming(true);

        const counts = await Promise.all(
            lowered(selected, draft).map(async (change) => {
                const answer = await api<{ count: number | null }>(`/api/bot-modules/${selected.module}/above?key=${change.key}&value=${draft.values[change.key ?? ""]}`).catch(() => ({ count: null }));

                return [change.key ?? "", answer.count] as const;
            })
        );

        setAbove(Object.fromEntries(counts));
        setConfirming(true);
    };

    // Strg+S speichert, „/“ springt in die Suche, Pfeiltasten wechseln Kategorie und Modul.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (tab === "verlauf") return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                requestSave();

                return;
            }
            if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey || !selected) return;

            if (event.key === "/") {
                event.preventDefault();
                searchRef.current?.focus();
            } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                const ids = CATEGORIES.filter((entry) => entry.id !== null || modules.some((item) => categoryOf(item) === null)).map((entry) => entry.id);
                const next = ids[(ids.indexOf(category) + (event.key === "ArrowLeft" ? ids.length - 1 : 1)) % ids.length];

                event.preventDefault();
                setFilter("all");
                setSearch("");
                update({ cat: next ?? NONE_CATEGORY });
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                const shown = visibleModules(modules, { serverOverrides, category, filter, search });
                const index = shown.findIndex((entry) => entry.module === selected.module);
                const next = shown[index < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, index + (event.key === "ArrowUp" ? -1 : 1)))];

                event.preventDefault();
                if (next) go({ m: next.module });
            }
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    });

    const botSyncedAt = view.data?.botSyncedAt ?? null;
    const header = (
        <>
            <PageHeader title="Module" meta="Jede Änderung steht im Verlauf und wirkt im Bot sofort.">
                <span className={`${styles.sync} ${botSyncedAt ? styles.synced : ""}`} role="status">
                    <i aria-hidden="true" />
                    {botSyncedAt ? `Bot hat den Stand von ${formatDateTime(botSyncedAt)} übernommen` : "Kein bestätigter Bescheid vom Bot seit dem Start"}
                </span>
            </PageHeader>
            <PageTabs
                label="Module"
                tabs={[
                    { to: server ? `/module?server=${server}` : "/module", label: "Module", icon: "puzzle", active: tab === "module" },
                    { to: "/module?tab=verlauf", label: "Verlauf", icon: "history", active: tab === "verlauf" },
                ]}
            />
        </>
    );

    if (tab === "verlauf") {
        return (
            <>
                {header}
                <ModuleHistory modules={view.data?.modules ?? []} guilds={guildList} />
            </>
        );
    }
    if (view.error && !view.data) return <Failure message={view.error.message} onRetry={view.reload} />;
    if (!data || !selected || !draft) return <Loading label="Module werden geladen" />;

    const { betaServers } = data;
    const permanent = isPermanent(selected.module);
    const total = modules.find((entry) => entry.module === "rl-tracking")?.servers ?? 0;
    const reach = selected.module === "rl-tracking" ? total : selected.servers;
    const guild = server ? guildOf(server) : undefined;
    const ownTotal = data.server?.overrides.reduce((sum, entry) => sum + ownCount(entry), 0) ?? 0;
    const effectiveStatus: ModuleStatus = draft.kind === "all" ? draft.status : (draft.status ?? selected.status);
    const noticeText = draft.kind === "all" ? draft.notice.trim() : draft.notice === null ? (selected.notice ?? "") : draft.notice.trim();
    const effectiveLink = draft.linkMode ?? selected.linkMode;
    const others = data.overrides.filter((entry) => entry.module === selected.module);
    const sections = 2 + (selected.linkMode ? 1 : 0);
    const changed = (module: string): boolean => {
        const entry = drafts[`${server ?? "all"}:${module}`];
        const saved = modules.find((item) => item.module === module);

        if (!entry || !saved) return false;

        return (entry.kind === "all" ? allChanges(saved, entry) : serverChanges(saved, serverOverrides?.get(module), entry)).length > 0;
    };

    return (
        <>
            <UnsavedGuard dirty={dirty} />
            {header}

            <ServerScope
                guilds={guildList}
                guildsFailed={!!guilds.error}
                server={server}
                serverName={data.server?.name ?? null}
                own={ownTotal}
                onChange={(next) => go({ server: next })}
            />

            <div className={`${styles.layout} ${chosenId ? styles.showDetail : ""}`}>
                <ModuleList
                    modules={modules}
                    selected={selected}
                    serverOverrides={serverOverrides}
                    category={category}
                    filter={filter}
                    search={search}
                    searchRef={searchRef}
                    changed={changed}
                    onChoose={(module) => go({ m: module })}
                    onCategory={(next) => {
                        setFilter("all");
                        setSearch("");
                        update({ cat: next ?? NONE_CATEGORY });
                    }}
                    onFilter={setFilter}
                    onSearch={setSearch}
                />

                <Panel className={styles.detail}>
                    <Link className={styles.back} to={server ? `/module?server=${server}` : "/module"}>
                        <Icon name="chevron-left" size={16} aria-hidden="true" /> Alle Module
                    </Link>
                    <header className={styles.head} style={{ ["--mod" as string]: color(categoryOf(selected)) }}>
                        <span className={styles.headIcon} aria-hidden="true">
                            <Icon name="puzzle" size={22} />
                        </span>
                        <div>
                            <h2>
                                {selected.name}
                                {draft.kind === "server" && savedOverride ? (
                                    <span className={`${styles.badge} ${styles.own}`}>{ownCount(savedOverride) === 1 ? "1 eigener" : `${ownCount(savedOverride)} eigene`}</span>
                                ) : (
                                    <span className={`${styles.badge} ${styles[effectiveStatus]}`}>{effectiveStatus === "beta" ? "Beta" : MODULE_STATUS_LABELS[effectiveStatus]}</span>
                                )}
                            </h2>
                            {selected.description && <p>{selected.description}</p>}
                            {selected.commands.length > 0 && (
                                <p className={styles.commands}>
                                    {selected.commands.map((command) => (
                                        <code key={command}>{command}</code>
                                    ))}
                                </p>
                            )}
                        </div>
                        <div className={styles.reach}>
                            {server ? (
                                <>
                                    <b>{permanent || selected.module === "rl-tracking" ? "fest" : guild?.modules.includes(selected.module) ? "an" : guild ? "aus" : "–"}</b>
                                    <span>
                                        {permanent || selected.module === "rl-tracking"
                                            ? "gehört auf jedem Server dazu"
                                            : guild
                                              ? `auf ${serverName} ${guild.modules.includes(selected.module) ? "eingeschaltet" : "nicht eingeschaltet"}`
                                              : "Stand des Servers unbekannt"}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <b>{permanent || selected.module === "rl-tracking" ? `alle ${total}` : selected.servers}</b>
                                    <span>{selected.module === "rl-tracking" ? "Server, kein Schalter je Server" : permanent ? "Server, gehört fest zum Bot" : "Server haben es eingeschaltet"}</span>
                                </>
                            )}
                        </div>
                    </header>

                    <section className={styles.section}>
                        <h3>
                            <span>01</span>Status
                        </h3>
                        {permanent ? (
                            <p className={styles.note}>Gehört fest zum Bot und bleibt immer an. Einstellbar ist nur der Hinweis.</p>
                        ) : draft.kind === "all" ? (
                            <>
                                <p className={styles.note}>Gilt für alle Server ohne eigenen Wert. Die Auswahl der Server bleibt gespeichert und kommt beim Einschalten zurück.</p>
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
                                            <small>
                                                {STATUS_TEXT[status]}
                                                {status === "beta" && betaServers !== null && ` Heute ${betaServers} Server.`}
                                            </small>
                                        </button>
                                    ))}
                                </div>
                                {draft.status !== selected.status && (
                                    <p className={styles.impact}>
                                        <Icon name="server" size={15} aria-hidden="true" />
                                        {draft.status === "off"
                                            ? `Betrifft ${reach} Server: Dort ist das Modul dann aus.`
                                            : draft.status === "beta"
                                              ? `Bleibt nur auf Servern, deren Inhaber oder Server-Verwalter Beta-Tester oder Dev-Tester sind${betaServers !== null ? ` (heute ${betaServers})` : ""}.`
                                              : `Wieder an auf ${reach} Servern.`}
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className={styles.note}>Nur für {serverName}. „Wie alle“ übernimmt den Status von „Alle Server“.</p>
                                <div className={styles.states} role="radiogroup" aria-label="Status für diesen Server">
                                    {([null, "on", "off"] as const).map((status) => (
                                        <button
                                            key={status ?? "inherit"}
                                            type="button"
                                            role="radio"
                                            aria-checked={draft.status === status}
                                            className={`${styles.state} ${status ? styles[status] : styles.inherit}`}
                                            onClick={() => setDraft({ status })}
                                        >
                                            <b>{status ? MODULE_STATUS_LABELS[status] : "Wie alle"}</b>
                                            <small>
                                                {status === null
                                                    ? `Für alle gilt: ${MODULE_STATUS_LABELS[selected.status]}.`
                                                    : status === "on"
                                                      ? "An, auch wenn es für alle aus ist oder nur für Beta gilt."
                                                      : "Aus nur hier, Befehle antworten mit dem Hinweis."}
                                            </small>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>

                    <section className={styles.section}>
                        <h3>
                            <span>02</span>Hinweis
                        </h3>
                        {draft.kind === "server" && (
                            <Switch
                                checked={draft.notice !== null}
                                label={draft.notice === null ? `Wie alle${selected.notice ? `: „${selected.notice}“` : ", kein Hinweis"}` : "Eigener Hinweis für diesen Server"}
                                onChange={(checked) => setDraft({ notice: checked ? (selected.notice ?? "") : null })}
                            />
                        )}
                        {(draft.kind === "all" || draft.notice !== null) && (
                            <>
                                <p className={styles.note}>Optional. Steht im Bot-Dashboard beim Modul und ist die Antwort, solange es aus ist.</p>
                                <div className={styles.noticeGrid}>
                                    <div>
                                        <label className={styles.sr} htmlFor="modul-hinweis">
                                            Hinweis
                                        </label>
                                        <textarea
                                            id="modul-hinweis"
                                            className={styles.textarea}
                                            value={draft.notice ?? ""}
                                            maxLength={NOTICE_MAX}
                                            placeholder="Leer lassen, dann steht dort nichts. Zum Beispiel: „Wird gerade überarbeitet, ab 21 Uhr wieder da.“"
                                            onChange={(event) => setDraft({ notice: event.target.value })}
                                        />
                                        <p className={styles.count}>
                                            <span>{noticeText ? "Wird so übernommen" : "Kein Hinweis gesetzt"}</span>
                                            <span>
                                                {noticeText.length} / {NOTICE_MAX}
                                            </span>
                                        </p>
                                    </div>
                                    <div className={styles.previews}>
                                        <div className={styles.preview}>
                                            <p>Bot-Dashboard</p>
                                            {noticeText ? (
                                                <div className={styles.dashBanner}>
                                                    <Icon name="bell" size={16} aria-hidden="true" />
                                                    <span>
                                                        {effectiveStatus === "off" && <b>Vorübergehend abgeschaltet. </b>}
                                                        {noticeText}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className={styles.muted}>Ohne Hinweis steht dort nichts.</span>
                                            )}
                                        </div>
                                        {effectiveStatus !== "on" && (
                                            <div className={styles.preview}>
                                                <p>Antwort in Discord</p>
                                                <div className={styles.discord}>
                                                    <span className={styles.avatar} aria-hidden="true">
                                                        N
                                                    </span>
                                                    <b>RL Nexus</b>
                                                    <span>{noticeText || CLOSED_TEXT}</span>
                                                    <small>Nur du kannst das sehen</small>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </section>

                    {selected.linkMode && (
                        <section className={styles.section}>
                            <h3>
                                <span>03</span>Epic-Konto verbinden
                            </h3>
                            <p className={styles.note}>
                                {draft.kind === "all" ? "Wie Mitglieder ihr Epic-Konto mit Discord verbinden. Gilt nur für RL Tracking." : `Nur für ${serverName}. „Wie alle“ übernimmt die Art von „Alle Server“.`}
                            </p>
                            <div className={styles.choices} role="radiogroup" aria-label="Epic-Konto verbinden">
                                {draft.kind === "server" && (
                                    <button type="button" role="radio" aria-checked={draft.linkMode === null} className={`${styles.choice} ${styles.inherit}`} onClick={() => setDraft({ linkMode: null })}>
                                        <b>Wie alle</b>
                                        <small>Für alle gilt: {LINK_MODE_LABELS[selected.linkMode]}.</small>
                                    </button>
                                )}
                                {(["login", "name", "both"] as const).map((mode) => {
                                    const was = draft.kind === "all" ? selected.linkMode : (savedOverride?.linkMode ?? null);

                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            role="radio"
                                            aria-checked={draft.linkMode === mode}
                                            className={`${styles.choice} ${was === mode && draft.linkMode !== mode ? styles.was : ""}`}
                                            onClick={() => setDraft({ linkMode: mode })}
                                        >
                                            <b>
                                                {LINK_MODE_LABELS[mode]}
                                                {was === mode && draft.linkMode !== mode && <span className={styles.tagOld}>bisher</span>}
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
                                    );
                                })}
                            </div>
                            {effectiveLink && (
                                <p className={styles.impact}>
                                    <Icon name="discord" size={15} aria-hidden="true" />
                                    Befehl: <code>{COMMAND_FORM[effectiveLink]}</code>
                                    {draft.kind === "all" && draft.linkMode !== "name" && selected.linkMode === "name" && " · Rang-Rollen ohne bestätigte Verknüpfung werden entfernt."}
                                </p>
                            )}
                            {selected.links && (
                                <p className={styles.impact}>
                                    <Icon name="link" size={15} aria-hidden="true" />
                                    {formatNumber(selected.links.total)} Epic-Verknüpfungen, davon {formatNumber(selected.links.byName)} nur per Name.
                                </p>
                            )}
                        </section>
                    )}

                    <ModuleValues
                        module={selected}
                        draft={draft}
                        number={String(sections + 1).padStart(2, "0")}
                        serverName={serverName}
                        onValues={(values) => setDraft({ values })}
                        onAskable={(askable) => setDraft({ askable })}
                    />

                    {draft.kind === "all" && others.length > 0 && (
                        <section className={styles.section}>
                            <h3>
                                <span>{String(sections + 2).padStart(2, "0")}</span>Server mit eigenem Wert
                            </h3>
                            <p className={styles.note}>Ein Server-Wert gilt vor dem Wert für alle. Stellst du hier etwas um, behalten diese Server ihren.</p>
                            <ul className={styles.others}>
                                {others.map((entry) => {
                                    const name = guildOf(entry.guildId)?.name ?? entry.guildId;

                                    return (
                                        <li key={entry.guildId}>
                                            <GuildIcon guild={guildOf(entry.guildId)} name={name} />
                                            <div>
                                                <b>{name}</b>
                                                <small>{overrideSummary(selected, entry)}</small>
                                                {entry.note && <small className={styles.why}>Warum: {entry.note}</small>}
                                            </div>
                                            <Button variant="ghost" onClick={() => go({ server: entry.guildId })}>
                                                Öffnen
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {draft.kind === "all" && selected.history.length > 0 && (
                        <section className={styles.section}>
                            <h3>
                                <span>{String(sections + (others.length > 0 ? 3 : 2)).padStart(2, "0")}</span>Letzte Änderungen
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
                        </section>
                    )}

                    {dirty && (
                        <div className={styles.save} role="region" aria-label="Ungespeicherte Änderungen">
                            {draft.kind === "server" && (
                                <label className={styles.whyField}>
                                    <b>Warum eigener Wert?</b>
                                    <input
                                        value={draft.note}
                                        maxLength={300}
                                        placeholder="Zum Beispiel: Anfrage im Support-Ticket #214, Turnier mit 100 Plätzen"
                                        onChange={(event) => setDraft({ note: event.target.value })}
                                    />
                                    <span>Steht im Verlauf und bei „Server mit eigenem Wert“.</span>
                                </label>
                            )}
                            <div className={styles.what}>
                                <b>{pending.length === 1 ? "1 Änderung nicht gespeichert" : `${pending.length} Änderungen nicht gespeichert`}</b>
                                <span>
                                    {pending.map((change, index) => (
                                        <span key={change.label}>
                                            {index > 0 && " · "}
                                            {change.label}: <s>{change.before}</s> → {change.after}
                                        </span>
                                    ))}
                                    {server && ` · für ${serverName}`}
                                </span>
                            </div>
                            <div className={styles.saveActions}>
                                <Button variant="ghost" onClick={discard} disabled={busy}>
                                    Verwerfen
                                </Button>
                                <Button variant="primary" onClick={requestSave} busy={busy}>
                                    {server ? `Für ${serverName} speichern` : "Speichern"}
                                </Button>
                                <kbd aria-hidden="true">Strg+S</kbd>
                            </div>
                        </div>
                    )}
                </Panel>
            </div>

            <ConfirmDialog
                open={confirming}
                title={
                    draft.kind === "server"
                        ? serverOff
                            ? `${selected.name} auf ${serverName} abschalten?`
                            : "Verbinden nur per Name erlauben?"
                        : draft.linkMode === "name" && selected.linkMode !== "name"
                          ? "Verbinden nur per Name erlauben?"
                          : draft.status !== selected.status && draft.status !== "on"
                            ? `${selected.name} ${draft.status === "off" ? "überall abschalten" : "auf Beta-Server begrenzen"}?`
                            : lowerList.length === 1
                              ? "Grenze senken?"
                              : "Grenzen senken?"
                }
                confirmLabel={draft.kind === "all" && draft.status === "off" && selected.status !== "off" ? `Für ${reach} Server abschalten` : "Speichern"}
                tone="danger"
                busy={busy}
                onConfirm={() => void save()}
                onCancel={() => setConfirming(false)}
            >
                {draft.kind === "all" && draft.status !== selected.status && draft.status !== "on" && (
                    <p>
                        Das trifft sofort <b>{reach} Server</b>. Die Einstellungen der Server bleiben gespeichert und gelten beim Einschalten wieder. Hinweis an die Server:{" "}
                        <b>{noticeText || "keiner"}</b>
                        {noticeText ? "" : `, Befehle antworten mit „${CLOSED_TEXT}“`}
                        {/[.!?…“"]$/.test(noticeText) ? "" : "."}
                    </p>
                )}
                {lowerList.length > 0 && (
                    <p>
                        {lowerList
                            .map((change) => {
                                const count = above[change.key ?? ""];

                                return `${change.label}: ${change.before} → ${change.after}${count ? ` (${count === 1 ? "1 Server liegt" : `${count} Server liegen`} gerade darüber)` : count === 0 ? " (kein Server liegt darüber)" : ""}`;
                            })
                            .join(" · ")}
                        . Was es schon gibt, bleibt; nur Neues über der Grenze wird abgelehnt.
                        {others.length > 0 && ` ${others.length === 1 ? "Ein Server behält" : `${others.length} Server behalten`} den eigenen Wert.`}
                    </p>
                )}
                {serverOff && <p>Auf {serverName} antworten die Befehle dann mit dem Hinweis. Alle anderen Server bleiben, wie sie sind.</p>}
                {draft.linkMode === "name" && (draft.kind === "all" ? selected.linkMode : (savedOverride?.linkMode ?? selected.linkMode)) !== "name" && (
                    <p>Dann kann jeder einen fremden Epic-Namen eintragen und bekommt dessen Rang-Rollen.</p>
                )}
            </ConfirmDialog>

            <ConfirmDialog
                open={leaving !== null}
                title="Änderungen verwerfen?"
                confirmLabel="Verwerfen"
                tone="danger"
                onConfirm={() => {
                    discard();
                    if (leaving) update(leaving);
                    setLeaving(null);
                }}
                onCancel={() => setLeaving(null)}
            >
                <p>
                    Bei {selected.name}
                    {server ? ` für ${serverName}` : ""} ist etwas geändert und noch nicht gespeichert.
                </p>
            </ConfirmDialog>
        </>
    );
}
