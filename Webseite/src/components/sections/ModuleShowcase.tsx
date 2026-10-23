import type { JSX } from "react";
import { Link } from "react-router-dom";
import { moduleRegistry } from "../../services/registry";
import { allCategories } from "../../services/categories";
import { Section } from "../layout/Section";
import { SectionHeading } from "../ui/SectionHeading";
import { ModuleCard } from "../ui/ModuleCard";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./ModuleShowcase.module.scss";

/**
 * Die hervorgehobenen Module der Startseite.
 *
 * Nicht alle - eine Wand aus dreiundzwanzig gleich aussehenden Kacheln liest
 * niemand. Die Auswahl steht als `featured` in den Moduldaten, darunter eine
 * Zeile mit allen Kategorien als Weg in die vollständige Liste.
 */
export function ModuleShowcase(): JSX.Element {
    const featured = moduleRegistry.featured;
    const counts = moduleRegistry.countByCategory();

    return (
        <Section id="module">
            <div className="u-shell">
                <div className={styles.head}>
                    <SectionHeading
                        eyebrow="Module"
                        title={
                            <>
                                Nimm, was du brauchst.
                                <br />
                                Lass weg, was du nicht brauchst.
                            </>
                        }
                        lead={`Jedes Modul lässt sich einzeln zuschalten und einstellen. ${moduleRegistry.availableCount} von ${moduleRegistry.total} sind heute schon nutzbar, der Rest kommt.`}
                    />
                    <Button to="/module" variant="outline" trailingIcon="arrow-right" className={styles.headAction}>
                        Alle {moduleRegistry.total} Module
                    </Button>
                </div>

                <ul className={styles.grid}>
                    {featured.map((module) => (
                        <li key={module.id}>
                            <ModuleCard module={module} detailed />
                        </li>
                    ))}
                </ul>

                <ul className={styles.categories}>
                    {allCategories().map((meta) => {
                        const id = meta.id;

                        return (
                            <li key={id}>
                                <Link
                                    className={styles.category}
                                    to={`/module?kategorie=${id}`}
                                    style={{ ["--accent" as string]: meta.accent }}
                                >
                                    <span className={styles.categoryDot} aria-hidden="true" />
                                    {meta.label}
                                    <span className={styles.count}>{counts.get(id) ?? 0}</span>
                                    <Icon name="arrow-right" size={14} />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </Section>
    );
}
