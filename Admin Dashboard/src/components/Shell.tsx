import { useEffect, useRef, useState, type JSX } from "react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router-dom";
import { unreadOf, useMailOverview } from "../api/mail";
import logo from "../assets/logo.webp";
import { useMe, useSession } from "../session/context";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Shell.module.scss";

interface INavItem {
    readonly to: string;
    readonly label: string;
    readonly icon: string;
    /** Nur für die Developer-Rolle. Der Server prüft das ohnehin selbst. */
    readonly developer?: boolean;
    /** Zeigt die Zahl ungelesener Mails und neuer Formulare an diesem Eintrag. */
    readonly unread?: boolean;
}

interface INavGroup {
    readonly label: string | null;
    readonly items: readonly INavItem[];
}

/** Die Seitenleiste. Jeder Plan hängt hier seine Seiten an. */
const NAV: readonly INavGroup[] = [
    {
        label: null,
        items: [
            { to: "/", label: "Übersicht", icon: "dashboard" },
            { to: "/post", label: "Postfach", icon: "mail", unread: true },
        ],
    },
    {
        label: "Bot",
        items: [
            { to: "/server", label: "Server", icon: "server" },
            { to: "/backups", label: "Backups", icon: "archive" },
            { to: "/gruppen", label: "Gruppen", icon: "shield-check" },
            { to: "/beta", label: "Beta Access", icon: "sparkle" },
            { to: "/meldungen", label: "Meldungen", icon: "bell" },
            { to: "/status", label: "Status", icon: "pulse" },
        ],
    },
    {
        label: "Shop",
        items: [
            { to: "/shop/produkte", label: "Produkte", icon: "tag" },
            { to: "/shop/kunden", label: "Kunden", icon: "users" },
            { to: "/shop/einstellungen", label: "Einstellungen", icon: "sliders" },
        ],
    },
    {
        label: "Webseite",
        items: [
            { to: "/webseite/banner", label: "Banner", icon: "megaphone" },
            { to: "/webseite/team", label: "Team", icon: "users" },
            { to: "/webseite/module", label: "Module", icon: "puzzle" },
        ],
    },
    {
        label: "Developer",
        items: [
            { to: "/dev/logs", label: "Logs", icon: "file-text", developer: true },
            { to: "/dev/datenbank", label: "Datenbank", icon: "database", developer: true },
            { to: "/dev/technik", label: "Technik", icon: "cpu", developer: true },
            { to: "/dev/wartung", label: "Wartung", icon: "wrench", developer: true },
            { to: "/dev/protokoll", label: "Protokoll", icon: "history", developer: true },
        ],
    },
];

export function Shell(): JSX.Element {
    const me = useMe();
    const { signOut } = useSession();
    const location = useLocation();
    const unread = unreadOf(useMailOverview().data);
    const loading = useNavigation().state === "loading";

    // Auf dem Handy: offen ist die Navigation nur auf der Seite, auf der sie
    // geöffnet wurde. Jeder Seitenwechsel schließt sie damit von selbst, auch
    // der Zurück-Knopf des Browsers.
    const [openAt, setOpenAt] = useState<string | null>(null);
    const menuOpen = openAt === location.pathname;
    const menuButton = useRef<HTMLButtonElement>(null);
    const closeMenu = (): void => setOpenAt(null);

    useEffect(() => {
        if (!menuOpen) return;

        const button = menuButton.current;

        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") setOpenAt(null);
        };

        window.addEventListener("keydown", onKey);

        // Beim Schließen zurück auf den Knopf, sonst bliebe der Fokus auf einem
        // Link in der zugeschobenen Navigation. Erst im Aufräumen, weil der
        // Knopf im Hauptbereich sitzt: Solange das Menü offen ist, ist der
        // inert und nimmt keinen Fokus an.
        return () => {
            window.removeEventListener("keydown", onKey);
            button?.focus();
        };
    }, [menuOpen]);

    const groups = NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.developer || me.role === "developer"),
    })).filter((group) => group.items.length > 0);

    return (
        <div className={styles.shell}>
            <a href="#inhalt" className={styles.skip}>
                Zum Inhalt springen
            </a>

            <aside id="navigation" className={[styles.sidebar, menuOpen && styles.open].filter(Boolean).join(" ")} aria-label="Navigation">
                <div className={styles.brand}>
                    <img src={logo} alt="" width={30} height={30} />
                    <span className={styles.wordmark}>
                        RL Nexus <em>Admin</em>
                    </span>
                    <button type="button" className={styles.close} onClick={closeMenu}>
                        <Icon name="close" />
                        <span className="u-sr">Navigation schließen</span>
                    </button>
                </div>

                <nav>
                    {groups.map((group) => (
                        <div key={group.label ?? "start"} className={styles.group}>
                            {group.label && <p className={styles.groupLabel}>{group.label}</p>}
                            <ul>
                                {group.items.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            end={item.to === "/"}
                                            title={item.label}
                                            className={({ isActive }) => [styles.item, isActive && styles.active].filter(Boolean).join(" ")}
                                        >
                                            <Icon name={item.icon} size={18} />
                                            <span className={styles.itemLabel}>{item.label}</span>
                                            {item.unread && unread !== null && unread > 0 && (
                                                <span className={styles.count}>
                                                    {unread}
                                                    <span className="u-sr"> neu</span>
                                                </span>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>

            {menuOpen && <div className={styles.backdrop} onClick={closeMenu} aria-hidden="true" />}

            <div className={styles.main} inert={menuOpen}>
                {/*
                    Der Balken, solange der Router das Bündel der nächsten Seite
                    holt. Die alte Seite bleibt dabei stehen, sonst sähe man
                    einen leeren Rahmen. aria-hidden, weil der Wechsel ohnehin
                    angesagt wird, sobald die neue Seite steht.
                */}
                {loading && <div className={styles.progress} aria-hidden="true" />}

                <header className={styles.topbar}>
                    <button
                        ref={menuButton}
                        type="button"
                        className={styles.menu}
                        aria-expanded={menuOpen}
                        aria-controls="navigation"
                        onClick={() => setOpenAt(location.pathname)}
                    >
                        <Icon name="menu" />
                        <span className="u-sr">Navigation öffnen</span>
                    </button>

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
        </div>
    );
}
