import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { BotModule } from "../../domain/models/BotModule";
import { Panel } from "./Panel";
import { Badge } from "./Badge";
import { Icon } from "./Icon";
import styles from "./ModuleCard.module.scss";

export interface IModuleCardProps {
    readonly module: BotModule;
    /** Größere Kachel mit zusätzlichen Stichpunkten - für die Startseite. */
    readonly detailed?: boolean;
}

/**
 * Ein Modul als Kachel.
 *
 * Der Link liegt über der ganzen Kachel und nicht nur auf der Überschrift: eine
 * Fläche dieser Größe, von der nur ein Wort anklickbar ist, trifft niemand auf
 * Anhieb. Umgesetzt über ein aufgespanntes `::after` statt über einen Link um
 * alles herum - so bleibt der Vorlesetext die Überschrift und nicht der ganze
 * Kachelinhalt am Stück.
 */
export function ModuleCard({ module, detailed = false }: IModuleCardProps): JSX.Element {
    return (
        <Panel
            as="article"
            className={[styles.card, detailed && styles.detailed].filter(Boolean).join(" ")}
            accent={module.accent}
            interactive
        >
            <div className={styles.top}>
                <span className={styles.iconBox}>
                    <Icon name={module.icon} size={detailed ? 26 : 23} />
                </span>
                <Badge status={module.status}>{module.statusLabel}</Badge>
            </div>

            <h3 className={styles.name}>
                <Link className={styles.link} to={module.href}>
                    {module.name}
                </Link>
            </h3>

            <p className={styles.tagline}>{module.tagline}</p>

            {detailed && (
                <ul className={styles.highlights}>
                    {module.highlights.slice(0, 3).map((highlight) => (
                        <li key={highlight}>
                            <Icon name="check" size={14} />
                            {highlight}
                        </li>
                    ))}
                </ul>
            )}

            <footer className={styles.foot}>
                <span className={styles.category}>{module.meta.label}</span>
                <Icon className={styles.arrow} name="arrow-right" size={17} />
            </footer>
        </Panel>
    );
}
