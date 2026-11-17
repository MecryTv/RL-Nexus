import type { JSX, RefObject } from "react";
import { MODULE_STATUS_LABELS, PERMANENT_BOT_MODULES, type IBotModuleOverride, type IBotModuleView, type ModuleStatus } from "../../shared/botModules";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import styles from "./botModules.module.scss";
import { CATEGORIES, categoryOf, color, ownCount, overrideSummary, visibleModules, type Filter } from "./moduleDraft";

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
    { id: "all", label: "Alle" },
    { id: "off", label: "Aus" },
    { id: "beta", label: "Beta" },
    { id: "own", label: "Eigene" },
];

/**
 * W-0133, Entwurf A2: Suche, Kategorie-Raster 3×2 mit Anzahl und Punkten (rot
 * aus, gelb Beta, blau eigene Werte), Filter und nur die Module der gewählten
 * Kategorie. Mit Suche oder Filter zeigt die Liste alle Kategorien.
 */
function isPermanent(module: string): boolean {
    return (PERMANENT_BOT_MODULES as readonly string[]).includes(module);
}

export function ModuleList({
    modules,
    selected,
    serverOverrides,
    category,
    filter,
    search,
    searchRef,
    changed,
    onChoose,
    onCategory,
    onFilter,
    onSearch,
}: {
    readonly modules: readonly IBotModuleView[];
    readonly selected: IBotModuleView;
    /** Mit gewähltem Server: dessen eigene Werte je Modul, sonst null. */
    readonly serverOverrides: ReadonlyMap<string, IBotModuleOverride> | null;
    readonly category: string | null;
    readonly filter: Filter;
    readonly search: string;
    readonly searchRef: RefObject<HTMLInputElement | null>;
    readonly changed: (module: string) => boolean;
    readonly onChoose: (module: string) => void;
    readonly onCategory: (category: string | null) => void;
    readonly onFilter: (filter: Filter) => void;
    readonly onSearch: (search: string) => void;
}): JSX.Element {
    const status = (entry: IBotModuleView): ModuleStatus => serverOverrides?.get(entry.module)?.status ?? entry.status;
    const own = (entry: IBotModuleView): boolean => (serverOverrides ? serverOverrides.has(entry.module) : entry.overrides > 0);
    const passes = (entry: IBotModuleView, which: Filter): boolean => (which === "all" ? true : which === "own" ? own(entry) : status(entry) === which);
    const wide = search.trim() !== "" || filter !== "all";
    const shown = visibleModules(modules, { serverOverrides, category, filter, search });
    const categories = CATEGORIES.filter((entry) => entry.id !== null || modules.some((item) => categoryOf(item) === null));

    return (
        <Panel className={styles.list}>
            <label className={styles.search}>
                <Icon name="search" size={16} aria-hidden="true" />
                <span className={styles.sr}>Modul suchen</span>
                <input ref={searchRef} type="search" placeholder="Modul suchen" value={search} onChange={(event) => onSearch(event.target.value)} />
                <kbd aria-hidden="true">/</kbd>
            </label>

            <div className={styles.cats} role="group" aria-label="Kategorie">
                {categories.map((entry) => {
                    const items = modules.filter((item) => categoryOf(item) === entry.id);
                    const off = items.some((item) => status(item) === "off");
                    const beta = items.some((item) => status(item) === "beta");
                    const mine = items.some(own);

                    return (
                        <button
                            key={entry.label}
                            type="button"
                            className={styles.catTile}
                            aria-pressed={!wide && category === entry.id}
                            style={{ ["--c" as string]: color(entry.id) }}
                            onClick={() => onCategory(entry.id)}
                        >
                            <b>{entry.label}</b>
                            <small>
                                {items.length}
                                {off && <i className={styles.dotOff} title="Ein Modul ist aus" />}
                                {beta && <i className={styles.dotBeta} title="Ein Modul ist nur auf Beta-Servern" />}
                                {mine && <i className={styles.dotOwn} title="Eigene Werte" />}
                            </small>
                        </button>
                    );
                })}
            </div>

            <div className={styles.filters} role="group" aria-label="Zeigen">
                <span>Zeigen:</span>
                {FILTERS.map((entry) => (
                    <button key={entry.id} type="button" className={styles.chip} aria-pressed={filter === entry.id} onClick={() => onFilter(entry.id)}>
                        {entry.label} {modules.filter((item) => passes(item, entry.id)).length}
                    </button>
                ))}
            </div>

            {shown.map((entry) => {
                const override = serverOverrides?.get(entry.module);
                const count = override ? ownCount(override) : 0;

                return (
                    <button
                        key={entry.module}
                        type="button"
                        className={styles.row}
                        aria-current={entry.module === selected.module ? "true" : undefined}
                        onClick={() => onChoose(entry.module)}
                        style={{ ["--mod" as string]: color(categoryOf(entry)) }}
                    >
                        <span className={styles.rowIcon} aria-hidden="true">
                            <Icon name="puzzle" size={15} />
                        </span>
                        <b>{entry.name}</b>
                        <small>
                            {serverOverrides ? (
                                override ? (
                                    <em>{overrideSummary(entry, override).split(" · ")[0]}</em>
                                ) : (
                                    "wie alle"
                                )
                            ) : (
                                <>
                                    {isPermanent(entry.module) ? "immer an" : entry.module === "rl-tracking" ? "alle Server" : `${entry.servers} Server`}
                                    {entry.overrides > 0 && <em>{entry.overrides === 1 ? "1 eigener" : `${entry.overrides} eigene`}</em>}
                                </>
                            )}
                            {(override?.notice ?? entry.notice) && <strong>Hinweis</strong>}
                        </small>
                        {changed(entry.module) ? (
                            <span className={`${styles.badge} ${styles.changed}`}>Geändert</span>
                        ) : count > 0 ? (
                            <span className={`${styles.badge} ${styles.own}`}>{count === 1 ? "1 eigener" : `${count} eigene`}</span>
                        ) : (
                            <span className={`${styles.badge} ${styles[status(entry)]}`}>{status(entry) === "beta" ? "Beta" : MODULE_STATUS_LABELS[status(entry)]}</span>
                        )}
                    </button>
                );
            })}
            {shown.length === 0 && <p className={styles.empty}>Kein Modul passt zu Suche und Filter.</p>}

            <p className={styles.keys} aria-hidden="true">
                <kbd>←</kbd>
                <kbd>→</kbd> Kategorie · <kbd>↑</kbd>
                <kbd>↓</kbd> Modul · <kbd>/</kbd> Suche
            </p>
        </Panel>
    );
}
