import type { JSX } from "react";
import { siteConfig } from "../../services/SiteConfig";
import { Section } from "../layout/Section";
import { SectionHeading } from "../ui/SectionHeading";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./HowItWorks.module.scss";

/** Ein Schritt der Einrichtung. */
interface IStep {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
    readonly accent: string;
}

const STEPS: readonly IStep[] = [
    {
        title: "Bot einladen",
        text: "Im Dashboard mit Discord anmelden und den Server auswählen. Der Bot kommt mit den Rechten, die er tatsächlich braucht, nicht mit Administrator.",
        icon: "discord",
        accent: "var(--c-mod-community)",
    },
    {
        title: "Module wählen",
        text: "Jedes Modul hat einen Schalter. Was aus ist, läuft nicht, hört nicht mit und legt nichts an. Ein abgeschaltetes Modul ist wirklich aus.",
        icon: "puzzle",
        accent: "var(--c-mod-competition)",
    },
    {
        title: "Einstellen und loslegen",
        text: "Kanäle, Rollen und Texte im Dashboard festlegen. Änderungen greifen sofort, ohne dass jemand den Bot neu startet.",
        icon: "bolt",
        accent: "var(--c-mod-engagement)",
    },
];

/**
 * Die drei Schritte bis zum laufenden Bot.
 *
 * Nummeriert, weil es eine Reihenfolge ist - drei gleichrangige Kacheln würden
 * genau das verschweigen.
 */
export function HowItWorks(): JSX.Element {
    return (
        <Section id="einrichtung" className={styles.section}>
            <div className="u-shell">
                <SectionHeading
                    eyebrow="In drei Schritten"
                    title="In zehn Minuten eingerichtet"
                    lead="Kein Hosting, keine Konfigurationsdatei, kein Terminal. Anmelden, anhaken, fertig."
                    accent="var(--c-blue)"
                    centered
                />

                <ol className={styles.steps}>
                    {STEPS.map((step, index) => (
                        <li key={step.title} className={styles.item}>
                            <Panel className={styles.step} accent={step.accent}>
                                <span className={styles.number} aria-hidden="true">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className={styles.icon}>
                                    <Icon name={step.icon} size={24} />
                                </span>
                                <h3 className={styles.title}>{step.title}</h3>
                                <p className={styles.text}>{step.text}</p>
                            </Panel>
                        </li>
                    ))}
                </ol>

                <div className={styles.action}>
                    <Button href={siteConfig.dashboardURL} size="lg" trailingIcon="arrow-up-right">
                        Zum Dashboard
                    </Button>
                </div>
            </div>
        </Section>
    );
}
