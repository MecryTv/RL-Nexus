import type { JSX } from "react";
import { siteConfig } from "../../services/SiteConfig";
import { moduleRegistry } from "../../services/registry";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { RankCardPreview } from "./RankCardPreview";
import styles from "./Hero.module.scss";

/** Die drei Zahlen unter den Schaltflächen. Aus der Registry, nicht erfunden. */
const stats = [
    { value: `${moduleRegistry.total}`, label: "Module" },
    { value: `${moduleRegistry.commandCount}+`, label: "Commands" },
    { value: "1", label: "Bot statt fünf" },
] as const;

/**
 * Der Kopf der Startseite.
 *
 * Links, was der Bot ist, rechts, was er ausgibt. Die Reihenfolge dreht sich
 * auf schmalen Bildschirmen nicht um: wer auf dem Handy kommt, soll zuerst
 * lesen, worum es geht, und die Karte danach sehen.
 */
export function Hero(): JSX.Element {
    return (
        <section className={styles.hero}>
            <div className={[styles.inner, "u-shell"].join(" ")}>
                <div className={styles.copy}>
                    <p className={styles.eyebrow}>
                        <Icon name="bolt" size={14} />
                        Discord-Bot für Rocket-League-Organisationen
                    </p>

                    <h1 className={styles.title}>
                        Deine Org läuft auf <em>einem</em> Bot.
                    </h1>

                    <p className={styles.lead}>
                        Ränge, Teams, Bewerbungen, Tickets, Logging, Level, Stream-Meldungen. {siteConfig.name}{" "}
                        bringt alles mit, was eine Rocket-League-Organisation in Discord braucht, und du schaltest
                        nur das ein, was du davon willst.
                    </p>

                    <div className={styles.actions}>
                        <Button href={siteConfig.dashboardURL} size="lg" trailingIcon="arrow-up-right">
                            Bot einladen
                        </Button>
                        <Button to="/module" size="lg" variant="outline" trailingIcon="arrow-right">
                            Module ansehen
                        </Button>
                    </div>

                    <dl className={styles.stats}>
                        {stats.map((stat) => (
                            <div key={stat.label} className={styles.stat}>
                                <dt className={styles.statValue}>{stat.value}</dt>
                                <dd className={styles.statLabel}>{stat.label}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className={styles.visual}>
                    <RankCardPreview />
                </div>
            </div>
        </section>
    );
}
