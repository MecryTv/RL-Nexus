import type { JSX } from "react";
import { Link } from "react-router-dom";
import { siteConfig } from "../../services/SiteConfig";
import { navigationFor } from "../../services/navigation.ts";
import { useShopMode } from "../../hooks/useShopMode.ts";
import { moduleRegistry } from "../../services/registry";
import { Icon } from "../ui/Icon";
import logo from "../../assets/brand/logo.webp";
import styles from "./Footer.module.scss";

/**
 * Der Fuß der Seite.
 *
 * Enthält die Verweise, die man am Ende sucht: die hervorgehobenen Module, die
 * Ziele außerhalb und das Rechtliche. Das Jahr kommt aus der Uhr, damit im
 * Januar nicht wieder eine Zahl von Hand geändert werden muss.
 */
export function Footer(): JSX.Element {
    const year = new Date().getFullYear();
    const mode = useShopMode();

    return (
        <footer className={styles.footer}>
            <div className={[styles.inner, "u-shell"].join(" ")}>
                <div className={styles.brand}>
                    <img className={styles.logo} src={logo} alt="RL Nexus" width={72} height={72} loading="lazy" />
                    <p className={styles.description}>{siteConfig.description}</p>
                    <ul className={styles.socials}>
                        {siteConfig.externals.map((link) => (
                            <li key={link.href}>
                                <a
                                    className={styles.social}
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={link.label}
                                    title={link.label}
                                >
                                    <Icon name={link.icon} size={19} />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                <nav className={styles.columns} aria-label="Fußzeile">
                    <div className={styles.column}>
                        <h2 className={styles.columnTitle}>Seite</h2>
                        <ul>
                            {navigationFor(mode).map((item) => (
                                <li key={item.to}>
                                    <Link className={styles.link} to={item.to}>
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className={styles.column}>
                        <h2 className={styles.columnTitle}>Module</h2>
                        <ul>
                            {moduleRegistry.featured.slice(0, 6).map((module) => (
                                <li key={module.id}>
                                    <Link className={styles.link} to={module.href}>
                                        {module.name}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link className={[styles.link, styles.more].join(" ")} to="/module">
                                    Alle {moduleRegistry.total} Module
                                    <Icon name="arrow-right" size={15} />
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div className={styles.column}>
                        <h2 className={styles.columnTitle}>Rechtliches</h2>
                        <ul>
                            {siteConfig.legal.map((item) => (
                                <li key={item.to}>
                                    <Link className={styles.link} to={item.to}>
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <a className={styles.link} href={`mailto:${siteConfig.contactMail}`}>
                                    {siteConfig.contactMail}
                                </a>
                            </li>
                        </ul>
                    </div>
                </nav>
            </div>

            <div className={[styles.bottom, "u-shell"].join(" ")}>
                <p>
                    © {year} {siteConfig.name}. Kein Produkt von Psyonix oder Epic Games.
                </p>
                <p className={styles.build}>
                    Gebaut für Rocket-League-Organisationen ·{" "}
                    <Link to="/team">Wer dahintersteckt</Link>
                </p>
            </div>
        </footer>
    );
}
