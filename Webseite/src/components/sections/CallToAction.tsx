import type { JSX } from "react";
import { siteConfig } from "../../services/SiteConfig";
import { Section } from "../layout/Section";
import { Button } from "../ui/Button";
/* Das N allein, 256 Pixel: das runde Logo mit Schriftzug hat schwarze Ecken,
   und der rote Schein folgte hier dem Quadrat statt der Form. */
import logo from "../../assets/brand/logo-n-256.webp";
import styles from "./CallToAction.module.scss";

export interface ICallToActionProps {
    readonly title?: string;
    readonly text?: string;
}

/**
 * Das Band am Ende jeder Seite.
 *
 * Steht auf mehreren Seiten, deshalb sind Überschrift und Text austauschbar -
 * dreimal derselbe Satz liest sich wie eine Wiederholung und nicht wie eine
 * Aufforderung.
 */
export function CallToAction({
    title = "Bereit, wenn deine Org es ist",
    text = "Einladen, Module anhaken, loslegen. Kostenlos, ohne Hosting und ohne dass du dafür eine Konfigurationsdatei anfassen musst.",
}: ICallToActionProps): JSX.Element {
    return (
        <Section className={styles.section}>
            <div className={["u-shell", styles.inner].join(" ")}>
                <img className={styles.logo} src={logo} alt="" width={104} height={104} loading="lazy" />
                <h2 className={styles.title}>{title}</h2>
                <p className={styles.text}>{text}</p>
                <div className={styles.actions}>
                    <Button href={siteConfig.dashboardURL} size="lg" trailingIcon="arrow-up-right">
                        Bot einladen
                    </Button>
                    <Button href={siteConfig.supportURL} size="lg" variant="outline" icon="discord">
                        Support-Server
                    </Button>
                </div>
            </div>
        </Section>
    );
}
