import { type JSX, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { siteConfig } from "../../services/SiteConfig";
import { navigationFor } from "../../services/navigation.ts";
import { useScrolled } from "../../hooks/useScrolled";
import { useShopMode } from "../../hooks/useShopMode.ts";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./Header.module.scss";

/**
 * Der Kopf der Seite.
 *
 * Oben durchsichtig, beim Scrollen fest und abgesetzt - das Bild im Hero soll
 * ungestört anfangen dürfen, aber sobald man darunter ist, braucht die
 * Navigation einen eigenen Grund.
 *
 * Ab Tablet-Breite steht die Navigation offen, darunter liegt sie hinter einer
 * Schaltfläche. Das mobile Menü ist kein Overlay über der Seite, sondern eine
 * Schublade unter der Kopfzeile: so bleibt sichtbar, wo man ist.
 */
export function Header(): JSX.Element {
    const scrolled = useScrolled(20);
    const navigation = navigationFor(useShopMode());
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();

    // Seitenwechsel schließt das Menü. Sonst bliebe es über der neuen Seite
    // offen stehen, weil die Kopfzeile beim Navigieren nicht neu entsteht.
    //
    // Beim Rendern angepasst und nicht in einem Effekt: React verwirft den
    // begonnenen Durchlauf sofort und rechnet mit dem neuen Wert weiter, statt
    // das offene Menü erst zu zeigen und im nächsten Durchlauf wieder
    // einzuklappen. Der Vergleichswert liegt im Zustand, weil auch Zurück- und
    // Vorwärts-Schritte des Browsers hier ankommen sollen.
    const [lastPath, setLastPath] = useState(pathname);

    if (pathname !== lastPath) {
        setLastPath(pathname);
        setOpen(false);
    }

    // Solange das Menü offen ist, darf die Seite dahinter nicht scrollen.
    useEffect(() => {
        if (!open) return;

        const previous = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    // Escape schließt - erwartbar für alles, was sich über den Inhalt legt.
    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") setOpen(false);
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const navClass = ({ isActive }: { isActive: boolean }): string =>
        [styles.link, isActive && styles.active].filter(Boolean).join(" ");

    return (
        <header className={[styles.header, scrolled && styles.solid, open && styles.open].filter(Boolean).join(" ")}>
            <div className={[styles.inner, "u-shell"].join(" ")}>
                <NavLink className={styles.brand} to="/" aria-label={`${siteConfig.name}, zur Startseite`}>
                    <img className={styles.mark} src={siteConfig.markURL} alt="" width={40} height={40} loading="eager" />
                    <span className={styles.wordmark}>
                        <span className={styles.name}>
                            RL <em>Nexus</em>
                        </span>
                        <span className={styles.claim}>{siteConfig.claim}</span>
                    </span>
                </NavLink>

                <nav className={styles.nav} aria-label="Hauptnavigation">
                    {navigation.map((item) => (
                        <NavLink key={item.to} className={navClass} to={item.to} end={item.to === "/"}>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className={styles.actions}>
                    <a
                        className={styles.iconLink}
                        href={siteConfig.supportURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Support-Server auf Discord öffnen"
                        title="Support-Server"
                    >
                        <Icon name="discord" size={20} />
                    </a>
                    <Button href={siteConfig.dashboardURL} trailingIcon="arrow-up-right">
                        Dashboard
                    </Button>
                </div>

                <button
                    className={styles.toggle}
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    aria-controls="mobile-nav"
                    aria-label={open ? "Menü schließen" : "Menü öffnen"}
                >
                    <Icon name={open ? "close" : "menu"} size={22} />
                </button>
            </div>

            {/* Immer im Baum, damit `aria-controls` etwas findet - versteckt
                über `hidden`, das der Bildschirmleser ebenfalls beachtet. */}
            <div className={styles.drawer} id="mobile-nav" hidden={!open}>
                <nav className={styles.drawerNav} aria-label="Navigation">
                    {navigation.map((item) => (
                        <NavLink key={item.to} className={navClass} to={item.to} end={item.to === "/"}>
                            {item.label}
                            <Icon name="arrow-right" size={18} />
                        </NavLink>
                    ))}
                </nav>

                <div className={styles.drawerActions}>
                    <Button href={siteConfig.dashboardURL} size="lg" trailingIcon="arrow-up-right">
                        Dashboard öffnen
                    </Button>
                    <Button href={siteConfig.supportURL} size="lg" variant="outline" icon="discord">
                        Support-Server
                    </Button>
                </div>
            </div>
        </header>
    );
}
