import type { CSSProperties, JSX } from "react";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { moduleRegistry } from "../services/registry";
import { type ITeamContent, isTeam, useContent } from "../services/Content";
import { OPEN_ROLES, TEAM_MEMBERS } from "../data/team.data";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { SectionHeading } from "../components/ui/SectionHeading";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { PageLoader } from "../components/ui/PageLoader";
import { CallToAction } from "../components/sections/CallToAction";
import styles from "./TeamPage.module.scss";

/** Was gilt, wenn das Admin Dashboard nichts gespeichert hat oder die Datei nicht ankommt. */
const BUILT_IN: ITeamContent = { members: TEAM_MEMBERS, openRoles: OPEN_ROLES };

/** Woran sich das Projekt beim Bauen hält. */
const PRINCIPLES: readonly { title: string; text: string; icon: string }[] = [
    {
        title: "Aus statt still",
        text: "Ein abgeschaltetes Modul hört nicht mit, speichert nichts und legt nichts an. Es gibt keinen Hintergrunddienst, der trotzdem mitschreibt.",
        icon: "lock",
    },
    {
        title: "Nichts erfinden",
        text: "Ränge kommen aus verknüpften Konten, nicht aus Selbstauskunft. Wo keine Daten vorliegen, steht das da, statt einer Zahl, die niemand geprüft hat.",
        icon: "shield-check",
    },
    {
        title: "Aus dem Ärger heraus",
        text: "Jedes Modul entstand, weil etwas anderes an dieser Stelle nicht funktioniert hat. Was als Nächstes gebaut wird, entscheidet, was im Support-Server tatsächlich gefragt wird.",
        icon: "puzzle",
    },
    {
        title: "Ein Produkt",
        text: "Rang-Karte, Level-Karte, Dashboard und diese Seite tragen dieselben Farben und dieselben Formen. Auf deinem Server soll nicht auffallen, dass das mehrere Bausteine sind.",
        icon: "sparkle",
    },
];

/**
 * Wer hinter RL Nexus steckt.
 *
 * Bewusst nicht die übliche Wand aus Porträts mit Fantasie-Titeln. Es steht da,
 * wer tatsächlich am Projekt arbeitet, woran, und was gerade gesucht wird. Bei
 * einem Bot, dem man seinen Server anvertraut, ist genau das die Frage, die
 * jemand hier beantwortet haben will.
 */
export function TeamPage(): JSX.Element {
    usePageMeta(
        "Das Team",
        "Wer hinter RL Nexus steckt, wie das Projekt entstanden ist und wonach es gebaut wird."
    );

    // Personen und offene Stellen pflegt das Admin Dashboard. Bis sie da sind,
    // steht an ihrer Stelle der Ladebalken, Kopf und Grundsätze sofort.
    const team = useContent("team.json", isTeam, BUILT_IN);

    return (
        <>
            <PageHeader
                eyebrow="Das Team"
                title={
                    <>
                        Entstanden aus einer <em>Beschwerde</em>.
                    </>
                }
                lead="Am Anfang stand kein Geschäftsplan, sondern Ärger über ein bestehendes System. Aus der Frage, wie man es besser machen könnte, wurde ein Konzept, und aus dem Konzept ein Bot."
            >
                <div className={styles.headerActions}>
                    <Button to="/kontakt" trailingIcon="arrow-right">
                        Kontakt aufnehmen
                    </Button>
                    <Button href={siteConfig.supportURL} variant="outline" icon="discord">
                        Support-Server
                    </Button>
                </div>
            </PageHeader>

            {team === undefined && <PageLoader />}

            {/* --- Die Personen -------------------------------------------- */}
            {team !== undefined && (
                <Section flush>
                    <div className="u-shell">
                        <ul className={styles.members}>
                            {team.members.map((member) => (
                                <li key={member.handle}>
                                    <Panel
                                        className={styles.member}
                                        accent={member.accent}
                                        style={{ ["--accent" as string]: member.accent } as CSSProperties}
                                    >
                                        <div className={styles.memberHead}>
                                            <span className={styles.avatar}>
                                                <img src={siteConfig.markURL} alt="" width={44} height={44} loading="lazy" />
                                            </span>
                                            <div className={styles.identity}>
                                                <h2 className={styles.name}>{member.name}</h2>
                                                <p className={styles.handle}>{member.handle}</p>
                                            </div>
                                            <span className={styles.role}>{member.role}</span>
                                        </div>

                                        <p className={styles.memberText}>{member.text}</p>

                                        <ul className={styles.focus}>
                                            {member.focus.map((entry) => (
                                                <li key={entry}>{entry}</li>
                                            ))}
                                        </ul>

                                        {member.links !== undefined && (
                                            <div className={styles.memberLinks}>
                                                {member.links.map((link) => (
                                                    <a
                                                        key={link.href}
                                                        className={styles.memberLink}
                                                        href={link.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Icon name={link.icon} size={16} />
                                                        {link.label}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </Panel>
                                </li>
                            ))}

                            {/* Die offene Karte: ehrlicher als drei erfundene Profile. */}
                            <li>
                                <Panel
                                    className={[styles.member, styles.open].join(" ")}
                                    accent="var(--c-line-strong)"
                                    style={{ ["--accent" as string]: "var(--c-blue)" } as CSSProperties}
                                >
                                    <div className={styles.memberHead}>
                                        <span className={[styles.avatar, styles.avatarEmpty].join(" ")}>
                                            <Icon name="users" size={22} />
                                        </span>
                                        <div className={styles.identity}>
                                            <h2 className={styles.name}>Noch frei</h2>
                                            <p className={styles.handle}>Du?</p>
                                        </div>
                                    </div>

                                    <p className={styles.memberText}>
                                        RL Nexus ist ein kleines Projekt und sucht Leute, die es größer machen. Kein
                                        Bewerbungsverfahren. Schreib im Support-Server, woran du arbeiten würdest.
                                    </p>

                                    <Button
                                        to="/kontakt"
                                        variant="outline"
                                        trailingIcon="arrow-right"
                                        className={styles.openAction}
                                    >
                                        Melde dich
                                    </Button>
                                </Panel>
                            </li>
                        </ul>
                    </div>
                </Section>
            )}

            {/* --- Offene Bereiche ----------------------------------------- */}
            {team !== undefined && team.openRoles.length > 0 && (
                <Section>
                    <div className="u-shell">
                        <SectionHeading
                            eyebrow="Gesucht"
                            title="Wo Hilfe am meisten bringen würde"
                            lead="Zwei Bereiche, in denen gerade niemand ist. Beide brauchen keine Ausbildung, sondern jemanden, der sie regelmäßig macht."
                            accent="var(--c-blue)"
                        />
                        <ul className={styles.roles}>
                            {team.openRoles.map((role) => (
                                <li key={role.title}>
                                    <Panel className={styles.roleCard} accent="var(--c-blue)">
                                        <span className={styles.roleIcon}>
                                            <Icon name={role.icon} size={21} />
                                        </span>
                                        <h3>{role.title}</h3>
                                        <p>{role.text}</p>
                                    </Panel>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>
            )}

            {/* --- Grundsätze ---------------------------------------------- */}
            <Section>
                <div className="u-shell">
                    <SectionHeading
                        eyebrow="Grundsätze"
                        title="Wonach entschieden wird"
                        lead={`Vier Regeln, an denen sich jedes der ${moduleRegistry.total} Module messen lassen muss, auch die, die noch nicht gebaut sind.`}
                    />
                    <ul className={styles.principles}>
                        {PRINCIPLES.map((principle) => (
                            <li key={principle.title}>
                                <Panel className={styles.principle} accent="var(--c-red)">
                                    <span className={styles.principleIcon}>
                                        <Icon name={principle.icon} size={21} />
                                    </span>
                                    <h3>{principle.title}</h3>
                                    <p>{principle.text}</p>
                                </Panel>
                            </li>
                        ))}
                    </ul>
                </div>
            </Section>

            <CallToAction
                title="Ärgert dich auch etwas?"
                text="Genau so hat dieses Projekt angefangen. Was als Nächstes gebaut wird, entscheidet, was Orgs tatsächlich fehlt. Der kürzeste Weg auf die Liste führt über das Kontaktformular."
            />
        </>
    );
}
