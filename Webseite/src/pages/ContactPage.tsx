import type { JSX } from "react";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ContactForm } from "../components/sections/ContactForm";
import styles from "./ContactPage.module.scss";

/** Ein Weg neben dem Formular. */
interface IChannel {
    readonly title: string;
    readonly text: string;
    /** Die Adresse selbst, sichtbar und markierbar - nicht nur hinter einer Schaltfläche. */
    readonly address?: string;
    readonly action: string;
    readonly href: string;
    readonly icon: string;
    readonly accent: string;
}

const CHANNELS: readonly IChannel[] = [
    {
        title: "Support-Server",
        text: "Der schnellste Weg, wenn es eilig ist. Fragen zur Einrichtung, kurze Rückfragen, und du siehst, woran gerade gearbeitet wird.",
        action: "Discord beitreten",
        href: siteConfig.supportURL,
        icon: "discord",
        accent: "var(--c-red)",
    },
    {
        title: "E-Mail",
        text: "Für alles, was nicht in einen öffentlichen Kanal gehört: Datenschutz, Missbrauch, rechtliche Anfragen.",
        address: siteConfig.contactMail,
        action: "E-Mail schreiben",
        href: `mailto:${siteConfig.contactMail}`,
        icon: "mail",
        accent: "var(--c-mod-community)",
    },
];

/**
 * Kontakt und Fehlermeldungen.
 *
 * Das Formular steht oben, weil es der Weg ist, der zu allem passt. Die zwei
 * direkten Kanäle daneben sind für die Fälle, in denen ein Formular zu langsam
 * oder zu förmlich ist.
 */
export function ContactPage(): JSX.Element {
    usePageMeta(
        "Kontakt & Support",
        `Kontaktformular, Fehlermeldungen und Support für RL Nexus. Per E-Mail an ${siteConfig.contactMail}.`
    );

    return (
        <>
            <PageHeader
                eyebrow="Kontakt"
                title={
                    <>
                        Fragen? <em>Frag.</em>
                    </>
                }
                lead="Ein Formular für alles: Fragen, Fehlermeldungen, Modulwünsche, Partnerschaften. Am anderen Ende sitzt die Person, die den Bot gebaut hat. Kein Ticketsystem, das deine Frage weiterreicht."
            />

            <Section flush>
                <div className={["u-shell", styles.layout].join(" ")}>
                    <div className={styles.formColumn}>
                        <ContactForm />
                    </div>

                    <aside className={styles.side}>
                        {CHANNELS.map((channel) => (
                            <Panel key={channel.title} className={styles.channel} accent={channel.accent}>
                                <span className={styles.icon}>
                                    <Icon name={channel.icon} size={22} />
                                </span>
                                <h2 className={styles.channelTitle}>{channel.title}</h2>
                                <p className={styles.channelText}>{channel.text}</p>
                                {channel.address !== undefined && (
                                    <a className={styles.address} href={channel.href}>
                                        {channel.address}
                                    </a>
                                )}
                                <Button
                                    href={channel.href}
                                    variant="outline"
                                    trailingIcon="arrow-up-right"
                                    className={styles.channelAction}
                                >
                                    {channel.action}
                                </Button>
                            </Panel>
                        ))}

                        <Panel className={styles.hint} accent="var(--c-line-strong)">
                            <h2 className={styles.hintTitle}>
                                <Icon name="clock" size={15} />
                                Antwortzeit
                            </h2>
                            <p>
                                RL Nexus ist ein kleines Projekt. Im Support-Server meist am selben Tag, per Formular
                                oder E-Mail innerhalb weniger Tage. Bei Fehlermeldungen kommt zuerst eine Rückfrage,
                                bevor sich etwas tut.
                            </p>
                        </Panel>
                    </aside>
                </div>
            </Section>

            {/* --- Wer antwortet ------------------------------------------- */}
            <Section>
                <div className="u-shell">
                    <Panel className={styles.about} accent="var(--c-red)">
                        <div className={styles.aboutText}>
                            <p className={styles.aboutEyebrow}>
                                <span className={styles.rule} aria-hidden="true" />
                                Wer antwortet
                            </p>
                            <h2>Dieselben Leute, die den Bot bauen</h2>
                            <p>
                                Es gibt keine Support-Abteilung. Wer hier schreibt, landet bei den Leuten, die die
                                Module entwickeln. Was bedeutet, dass ein guter Fehlerbericht schneller behoben wird
                                als anderswo, und eine schlechte Frage länger dauert.
                            </p>
                        </div>
                        <div className={styles.aboutActions}>
                            <Button to="/team" variant="outline" icon="users">
                                Das Team ansehen
                            </Button>
                        </div>
                    </Panel>
                </div>
            </Section>
        </>
    );
}
