import { Fragment, useCallback, useEffect, useState, type JSX } from "react";
import { Link, Outlet, useLocation, useNavigation } from "react-router-dom";
import { unreadOf, useMailOverview } from "../api/mail";
import { useHalted, useSuspects } from "../api/userdata";
import logo from "../assets/logo.webp";
import { areaOf, navEntries, pageOf, visibleAreas, type INavArea } from "../nav/areas.ts";
import { ShiftTap } from "../nav/search.ts";
import { useMe, useSession } from "../session/context";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { NavSearch } from "./NavSearch";
import styles from "./Shell.module.scss";

/** Tippt jemand gerade, oder ist ein Fenster offen? Dann öffnet keine Taste die Suche. */
function busy(): boolean {
    const focus = document.activeElement;
    const typing = focus instanceof HTMLElement && (focus.matches("input, textarea, select") || focus.isContentEditable);

    return typing || document.querySelector("dialog[open], [role=dialog]") !== null;
}

/** Rechte Umschalttaste kurz, `/` oder Strg K (⌘ K) öffnen die Suche. */
function useSearchKeys(open: () => void): void {
    useEffect(() => {
        const tap = new ShiftTap();

        const onDown = (event: KeyboardEvent): void => {
            tap.down(event.code, performance.now(), busy(), event.repeat);

            if (event.repeat || busy()) return;

            const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
            const k = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);

            if (slash || k) {
                event.preventDefault();
                open();
            }
        };

        const onUp = (event: KeyboardEvent): void => {
            if (tap.up(event.code, performance.now())) open();
        };

        document.addEventListener("keydown", onDown);
        document.addEventListener("keyup", onUp);

        return () => {
            document.removeEventListener("keydown", onDown);
            document.removeEventListener("keyup", onUp);
        };
    }, [open]);
}

/**
 * Die Hülle wie im Bot-Dashboard (W-0053): links die Bereiche, daneben die
 * Seiten des gewählten Bereichs, oben rechts wer angemeldet ist. Bereiche und
 * Seiten stehen in nav/areas.ts.
 */
export function Shell(): JSX.Element {
    const me = useMe();
    const { signOut } = useSession();
    const location = useLocation();
    const unread = unreadOf(useMailOverview().data) ?? 0;
    const halted = useHalted();
    const suspects = useSuspects();
    const loading = useNavigation().state === "loading";
    const areas = visibleAreas(me.role);
    const open = pageOf(location.pathname)?.page.to ?? null;

    // Ein Klick auf einen Bereich zeigt nur dessen Seiten. Nach jedem
    // Seitenwechsel ist wieder der Bereich der offenen Seite gewählt; eine
    // Seite ohne Bereich (Nicht gefunden) lässt die Wahl stehen.
    const [chosen, setChosen] = useState<INavArea["id"] | null>(() => areaOf(location.pathname)?.id ?? null);
    const [path, setPath] = useState(location.pathname);

    if (path !== location.pathname) {
        setPath(location.pathname);

        const here = areaOf(location.pathname)?.id;

        if (here) setChosen(here);
    }

    const area = areas.find((entry) => entry.id === chosen) ?? areas[0];
    const entries = navEntries(me.role);

    const [searching, setSearching] = useState(false);
    const openSearch = useCallback(() => setSearching(true), []);

    useSearchKeys(openSearch);

    return (
        <div className={styles.shell}>
            <a href="#inhalt" className={styles.skip}>
                Zum Inhalt springen
            </a>

            <aside className={styles.side} aria-label="Navigation">
                {/* Umschaltknöpfe, keine Links: deshalb eine Gruppe und kein <nav>. Die Links stehen in der Spalte daneben. */}
                <div className={styles.rail} role="group" aria-label="Bereiche">
                    <span className={styles.logo}>
                        <img src={logo} alt="" width={30} height={30} />
                        <span className="u-sr">RL Nexus Admin</span>
                    </span>

                    {areas.map((entry) => (
                        <Fragment key={entry.id}>
                            {entry.id === "dev" && <span className={styles.divider} aria-hidden="true" />}
                            <button type="button" className={styles.area} aria-pressed={entry.id === area.id} title={entry.label} onClick={() => setChosen(entry.id)}>
                                <Icon name={entry.icon} size={18} />
                                <span className={styles.areaName} aria-hidden="true">
                                    {entry.short}
                                </span>
                                <span className="u-sr">{entry.label}</span>
                                {entry.id === "start" && unread > 0 && (
                                    <span className={styles.badge}>
                                        {unread}
                                        <span className="u-sr"> neu</span>
                                    </span>
                                )}
                                {entry.id === "datenschutz" && halted > 0 && (
                                    <span className={[styles.badge, styles.halted].join(" ")}>
                                        {halted}
                                        <span className="u-sr"> angehalten</span>
                                    </span>
                                )}
                                {entry.id === "sicherheit" && suspects > 0 && (
                                    <span className={[styles.badge, styles.halted].join(" ")}>
                                        {suspects}
                                        <span className="u-sr"> offener Verdacht</span>
                                    </span>
                                )}
                            </button>
                        </Fragment>
                    ))}
                </div>

                <div className={styles.column}>
                    <button type="button" className={styles.find} onClick={openSearch}>
                        <Icon name="search" size={16} />
                        Suchen …<kbd className={styles.kbd}>⇧ rechts</kbd>
                    </button>
                    <p className={styles.columnHead} id="leiste-bereich">
                        {area.label}
                    </p>
                    <nav aria-labelledby="leiste-bereich">
                        <ul className={styles.pages}>
                            {area.pages.map((page) => (
                                <li key={page.to}>
                                    <Link to={page.to} className={styles.page} aria-current={page.to === open ? "page" : undefined}>
                                        <Icon name={page.icon} size={18} />
                                        <span className={styles.pageName}>{page.label}</span>
                                        {page.unread && unread > 0 && (
                                            <span className={styles.count}>
                                                {unread}
                                                <span className="u-sr"> neu</span>
                                            </span>
                                        )}
                                        {page.halted && halted > 0 && (
                                            <span className={[styles.count, styles.halted].join(" ")}>
                                                {halted}
                                                <span className="u-sr"> angehalten</span>
                                            </span>
                                        )}
                                        {page.suspects && suspects > 0 && (
                                            <span className={[styles.count, styles.halted].join(" ")}>
                                                {suspects}
                                                <span className="u-sr"> offen</span>
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            </aside>

            <div className={styles.main}>
                {/*
                    Der Balken, solange der Router das Bündel der nächsten Seite
                    holt. Die alte Seite bleibt dabei stehen, sonst sähe man
                    einen leeren Rahmen. aria-hidden, weil der Wechsel ohnehin
                    angesagt wird, sobald die neue Seite steht.
                */}
                {loading && <div className={styles.progress} aria-hidden="true" />}

                <header className={styles.topbar}>
                    <div className={styles.user}>
                        {me.avatar ? (
                            <img src={me.avatar} alt="" width={32} height={32} className={styles.avatar} />
                        ) : (
                            <span className={styles.avatar} aria-hidden="true">
                                {me.name.slice(0, 1).toUpperCase()}
                            </span>
                        )}
                        <span className={styles.name}>{me.name}</span>
                        <Badge tone={me.role === "developer" ? "pro" : "info"}>{me.role === "developer" ? "Developer" : "Admin"}</Badge>
                    </div>

                    <Button variant="ghost" size="sm" icon="logout" onClick={() => void signOut()}>
                        Abmelden
                    </Button>
                </header>

                <main id="inhalt" className={styles.content} tabIndex={-1}>
                    <Outlet />
                </main>
            </div>

            {searching && <NavSearch entries={entries} initial={entries.filter((entry) => entry.area === area.label)} onClose={() => setSearching(false)} />}
        </div>
    );
}
