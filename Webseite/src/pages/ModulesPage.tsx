import { type JSX, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { moduleRegistry } from "../services/registry";
import { allCategories, categoryOf } from "../services/categories";
import { PageHeader } from "../components/layout/PageHeader";
import { ModuleCard } from "../components/ui/ModuleCard";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { SearchBox } from "../components/ui/SearchBox";
import { CallToAction } from "../components/sections/CallToAction";
import styles from "./ModulesPage.module.scss";

/** Steht fest, bevor die Seite lädt: main.tsx setzt die Kategorien vor dem Import von App. */
const CATEGORIES = allCategories().map((meta) => meta.id);

/** Ob ein Wert aus der Adresszeile eine echte Kategorie ist. */
function toCategory(value: string | null): string | null {
    return CATEGORIES.find((id) => id === value) ?? null;
}

/**
 * Alle Module, filterbar.
 *
 * Die Kategorie steht in der Adresszeile, die Suche nicht. Ein Filter ist
 * etwas, das man teilt und auf das man zurückspringt - ein halb getippter
 * Suchbegriff wäre in der Chronik nur im Weg.
 */
export function ModulesPage(): JSX.Element {
    usePageMeta(
        "Alle Module",
        `Alle ${moduleRegistry.total} Module von RL Nexus im Überblick. Ränge, Teams, Tickets, Logging, Level und mehr.`
    );

    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState("");
    const [onlyAvailable, setOnlyAvailable] = useState(false);

    // Die Liste hängt am Suchfeld. `useDeferredValue` lässt die Eingabe
    // vorlaufen und rechnet die Treffer nach - bei dreiundzwanzig Modulen fällt
    // das nicht ins Gewicht, bei zweihundert schon.
    const deferred = useDeferredValue(search);
    const category = toCategory(params.get("kategorie"));

    const results = useMemo(
        () => moduleRegistry.filter({ search: deferred, category, onlyAvailable }),
        [deferred, category, onlyAvailable]
    );

    const groups = useMemo(() => moduleRegistry.group(results), [results]);
    const counts = useMemo(() => moduleRegistry.countByCategory(), []);

    const selectCategory = (id: string | null): void => {
        // `replace`, damit der Zurück-Knopf nicht durch jeden angetippten
        // Filter zurückführt, sondern auf die vorige Seite.
        setParams(id === null ? {} : { kategorie: id }, { replace: true });
    };

    const reset = (): void => {
        setSearch("");
        setOnlyAvailable(false);
        selectCategory(null);
    };

    const filtered = category !== null || onlyAvailable || search.trim().length > 0;

    // "Die übrigen sind angekündigt" liest sich bei genau einem Modul falsch.
    const planned = moduleRegistry.total - moduleRegistry.availableCount;
    const outlook = planned === 0 ? "" : planned === 1 ? " Eines ist angekündigt." : ` ${planned} sind angekündigt.`;

    return (
        <>
            <PageHeader
                eyebrow="Module"
                title={
                    <>
                        {moduleRegistry.total} Module. <em>Du entscheidest,</em> welche laufen.
                    </>
                }
                lead={`Jedes Modul ist einzeln zuschaltbar und einzeln einstellbar. ${moduleRegistry.availableCount} sind heute nutzbar.${outlook} Abgeschaltet heißt aus, nicht still.`}
            />

            <div className={["u-shell", styles.controls].join(" ")}>
                <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Modul, Funktion oder Command suchen"
                    label="Module durchsuchen"
                />

                <label className={styles.toggle}>
                    <input
                        type="checkbox"
                        checked={onlyAvailable}
                        onChange={(event) => setOnlyAvailable(event.target.checked)}
                    />
                    <span className={styles.switch} aria-hidden="true" />
                    Nur verfügbare
                </label>
            </div>

            <div className={["u-shell", styles.filters].join(" ")}>
                <button
                    className={[styles.filter, category === null && styles.activeFilter].filter(Boolean).join(" ")}
                    type="button"
                    onClick={() => selectCategory(null)}
                    aria-pressed={category === null}
                >
                    Alle
                    <span className={styles.count}>{moduleRegistry.total}</span>
                </button>

                {CATEGORIES.map((id) => {
                    const meta = categoryOf(id);

                    return (
                        <button
                            key={id}
                            className={[styles.filter, category === id && styles.activeFilter].filter(Boolean).join(" ")}
                            style={{ ["--accent" as string]: meta.accent }}
                            type="button"
                            onClick={() => selectCategory(id)}
                            aria-pressed={category === id}
                        >
                            <span className={styles.dot} aria-hidden="true" />
                            {meta.label}
                            <span className={styles.count}>{counts.get(id) ?? 0}</span>
                        </button>
                    );
                })}
            </div>

            {/* Die Trefferzahl gehört in einen Live-Bereich: sonst tippt jemand
                ins Suchfeld und erfährt nie, dass sich die Liste geändert hat. */}
            <p className={["u-shell", styles.resultLine].join(" ")} aria-live="polite">
                {results.length === moduleRegistry.total
                    ? `Alle ${results.length} Module`
                    : `${results.length} von ${moduleRegistry.total} Modulen`}
            </p>

            <div className={["u-shell", styles.body].join(" ")}>
                {results.length === 0 ? (
                    <div className={styles.empty}>
                        <Icon name="search" size={34} />
                        <h2>Kein Modul passt dazu</h2>
                        <p>
                            Vielleicht heißt es hier anders, oder es fehlt noch. Im Support-Server steht, was als
                            Nächstes kommt.
                        </p>
                        <Button variant="outline" onClick={reset} icon="close">
                            Filter zurücksetzen
                        </Button>
                    </div>
                ) : (
                    groups.map((group) => (
                        <section key={group.meta.id} className={styles.group}>
                            <header className={styles.groupHead} style={{ ["--accent" as string]: group.meta.accent }}>
                                <h2 className={styles.groupTitle}>
                                    <span className={styles.dot} aria-hidden="true" />
                                    {group.meta.label}
                                </h2>
                                <p className={styles.groupText}>{group.meta.description}</p>
                            </header>

                            <ul className={styles.grid}>
                                {group.modules.map((module) => (
                                    <li key={module.id}>
                                        <ModuleCard module={module} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}

                {filtered && results.length > 0 && (
                    <div className={styles.resetRow}>
                        <Button variant="ghost" onClick={reset} icon="close">
                            Filter zurücksetzen
                        </Button>
                    </div>
                )}
            </div>

            <CallToAction
                title="Fehlt dir eines?"
                text="Die Liste wächst mit dem, was Orgs tatsächlich brauchen. Sag im Support-Server, was dir fehlt. Das ist der kürzeste Weg auf die Liste."
            />
        </>
    );
}
