import type { JSX } from "react";
import { moduleRegistry } from "../../services/registry";
import { Section } from "../layout/Section";
import { SectionHeading } from "../ui/SectionHeading";
import { Panel } from "../ui/Panel";
import { Icon } from "../ui/Icon";
import styles from "./WhyNexus.module.scss";

/** Ein Argument. */
interface IReason {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
    /** Nimmt zwei Spalten ein - für das, was am meisten zählt. */
    readonly wide?: boolean;
}

const REASONS: readonly IReason[] = [
    {
        title: "Ein Bot statt fünf",
        text: `Ränge, Tickets, Level, Logging, Stream-Meldungen, normalerweise fünf Bots, fünf Dashboards, fünf Ausfälle. Hier sind es ${moduleRegistry.total} Module in einem Prozess, mit einer Datenbank und einer Anmeldung.`,
        icon: "puzzle",
        wide: true,
    },
    {
        title: "Auf Rocket League zugeschnitten",
        text: "Ränge, MR, Season-Rewards und Kader sind nicht angeflanscht, sondern der Kern. Ein allgemeiner Server-Bot kann das nicht, und ein Tracker-Bot kann den Rest nicht.",
        icon: "crosshair",
    },
    {
        title: "Aus statt still",
        text: "Ein abgeschaltetes Modul hört nicht mit, speichert nichts und legt nichts an. Es gibt keinen Hintergrunddienst, der trotzdem mitschreibt.",
        icon: "lock",
    },
    {
        title: "Alles im Browser",
        text: "Jede Einstellung steht im Dashboard, mit Rechtegruppen. Niemand muss sich Command-Namen merken, und nicht jeder Moderator kommt an jede Schraube.",
        icon: "dashboard",
    },
    {
        title: "Deutsch, und ansprechbar",
        text: "Oberfläche, Antworten und Support auf Deutsch. Wer eine Frage hat, landet nicht in einem Ticketsystem, sondern bei den Leuten, die die Module bauen.",
        icon: "message-square",
    },
];

/**
 * Warum dieser Bot und nicht die fünf, die schon auf dem Server sind.
 *
 * Als Raster mit einer breiten Kachel oben: das stärkste Argument bekommt den
 * meisten Platz, statt dass fünf gleich große Felder alle gleich wichtig tun.
 */
export function WhyNexus(): JSX.Element {
    return (
        <Section id="warum">
            <div className="u-shell">
                <SectionHeading
                    eyebrow="Warum RL Nexus"
                    title="Gebaut für Orgs, nicht für irgendeinen Server"
                    lead="Die meisten Discord-Bots können ein bisschen von allem. Dieser kann das, was eine Rocket-League-Organisation tatsächlich jeden Tag braucht."
                />

                <ul className={styles.grid}>
                    {REASONS.map((reason) => (
                        <li key={reason.title} className={reason.wide === true ? styles.wide : undefined}>
                            <Panel className={styles.card} accent="var(--c-red)">
                                <span className={styles.icon}>
                                    <Icon name={reason.icon} size={22} />
                                </span>
                                <h3 className={styles.title}>{reason.title}</h3>
                                <p className={styles.text}>{reason.text}</p>
                            </Panel>
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
}
