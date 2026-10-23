import type { CSSProperties, JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import type { BotModule } from "../domain/models/BotModule";
import type { IModuleDetail } from "../domain/interfaces/IModuleDetail";
import { moduleRegistry } from "../services/registry";
import { isModuleDetail, useContent } from "../services/Content";
import { ModuleStatus } from "../domain/enums/ModuleCategory";
import { siteConfig } from "../services/SiteConfig";
import { EXAMPLE_TEAMS } from "../data/teams.data";
import { MODULE_DETAILS } from "../data/moduleDetails.data";
import { COMMAND_ACCESS } from "../data/commands.data";
import { Section } from "../components/layout/Section";
import { SectionHeading } from "../components/ui/SectionHeading";
import { Panel } from "../components/ui/Panel";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CommandList } from "../components/ui/CommandList";
import { ModuleCard } from "../components/ui/ModuleCard";
import { TeamRoster } from "../components/ui/TeamRoster";
import { RankCardPreview } from "../components/sections/RankCardPreview";
import { CallToAction } from "../components/sections/CallToAction";
import { PageLoader } from "../components/ui/PageLoader";
import { NotFoundPage } from "./NotFoundPage";
import styles from "./ModuleDetailPage.module.scss";

/**
 * Ein Modul im Detail.
 *
 * Aufgebaut wie die Team-Seite, weil dieselben Fragen zu beantworten sind: Was
 * löst das? Mit welchen Commands? Welche Begriffe muss ich auseinanderhalten?
 * Was passiert von selbst? Wie richte ich es ein?
 *
 * Alle Abschnitte hängen an `MODULE_DETAILS` und fallen weg, wenn dort für ein
 * Modul nichts steht - es zeigt dann Beschreibung und Stichpunkte und hört
 * danach auf, statt leere Überschriften zu stapeln.
 */
export function ModuleDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const module = moduleRegistry.find(id);

    // Die Haken müssen vor dem frühen Ausstieg stehen: React verlangt, dass in
    // jedem Durchlauf dieselben Haken in derselben Reihenfolge laufen.
    usePageMeta(module?.name ?? "Modul nicht gefunden", module?.tagline);

    /* Der Text kommt aus dem Admin Dashboard, sonst aus `MODULE_DETAILS`.
       Nachgeschlagen wird hier und nicht im Modell: so landen die eingebauten
       Texte im nachgeladenen Bündel dieser Seite statt im Hauptbündel, das
       die Startseite mitbringt. Rund 20 kB, die dort niemand braucht. */
    const detail = useContent(
        module === null ? null : `details/${module.id}.json`,
        isModuleDetail,
        module === null ? null : (MODULE_DETAILS[module.id] ?? null)
    );

    if (module === null) return <NotFoundPage />;
    if (detail === undefined) return <PageLoader />;

    return <ModuleDetailView module={module} detail={detail} />;
}

/** Der Inhalt der Detailseite. Die Vorschau im Admin Dashboard zeigt denselben, mit dem Entwurf. */
export function ModuleDetailView({ module, detail }: { readonly module: BotModule; readonly detail: IModuleDetail | null }): JSX.Element {
    const access = COMMAND_ACCESS[module.id];
    const related = moduleRegistry.related(module);
    const planned = module.status === ModuleStatus.Planned;

    return (
        <div className={styles.page} style={{ ["--accent" as string]: module.accent } as CSSProperties}>
            {/* --- Kopf ---------------------------------------------------- */}
            <article className={styles.top}>
                <div className="u-shell">
                    <nav className={styles.crumbs} aria-label="Brotkrumen">
                        <Link to="/module">
                            <Icon name="arrow-right" size={14} className={styles.back} />
                            Alle Module
                        </Link>
                        <span aria-hidden="true">/</span>
                        <span>{module.meta.label}</span>
                    </nav>

                    <header className={styles.head}>
                        <span className={styles.icon}>
                            <Icon name={module.icon} size={34} />
                        </span>

                        <div className={styles.headText}>
                            <div className={styles.badges}>
                                <Badge status={module.status}>{module.statusLabel}</Badge>
                                <Badge accent={module.accent}>{module.meta.label}</Badge>
                            </div>
                            <h1 className={styles.title}>{module.name}</h1>
                            <p className={styles.tagline}>{module.tagline}</p>
                        </div>
                    </header>

                    <div className={styles.body}>
                        <div className={styles.main}>
                            {/* Der ausführliche Text, sonst der kurze aus der Kachel. */}
                            {(detail?.intro ?? [module.description]).map((paragraph) => (
                                <p key={paragraph.slice(0, 48)} className={styles.paragraph}>
                                    {paragraph}
                                </p>
                            ))}

                            <section className={styles.block}>
                                <h2 className={styles.blockTitle}>Was das Modul kann</h2>
                                <ul className={styles.highlights}>
                                    {module.highlights.map((highlight) => (
                                        <li key={highlight}>
                                            <Icon name="check" size={16} />
                                            {highlight}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {module.commands.length > 0 && (
                                <section className={styles.block}>
                                    <div className={styles.blockHead}>
                                        <h2 className={styles.blockTitle}>Commands</h2>
                                        {access !== undefined && <Badge accent={module.accent}>{access.label}</Badge>}
                                    </div>
                                    <CommandList commands={module.commands} />
                                    <Link className={styles.more} to="/commands">
                                        Alle {moduleRegistry.commandCount} Commands
                                        <Icon name="arrow-right" size={14} />
                                    </Link>
                                </section>
                            )}
                        </div>

                        {/* Die Schaltfläche zuerst: die Spalte bleibt beim Scrollen
                            stehen, und was unten in ihr steht, rutscht sonst aus
                            dem Bild. */}
                        <aside className={styles.side}>
                            <Panel className={styles.card} accent={planned ? "var(--c-line-strong)" : "var(--c-red)"}>
                                <h2 className={styles.cardTitle}>
                                    <Icon name={planned ? "clock" : "dashboard"} size={16} />
                                    {planned ? "Noch nicht verfügbar" : module.builtIn ? "Schon dabei" : "Einschalten"}
                                </h2>
                                <p className={styles.cardText}>
                                    {planned
                                        ? "Dieses Modul ist angekündigt, aber noch nicht ausgeliefert. Im Support-Server steht, woran gerade gearbeitet wird."
                                        : module.builtIn
                                          ? "Gehört fest zum Bot und läuft auf jedem Server, auf dem er ist. Einschalten musst du nichts."
                                          : "Im Dashboard mit Discord anmelden, Server auswählen, Modul anhaken. Die Einstellungen greifen sofort."}
                                </p>
                                <Button
                                    href={planned ? siteConfig.supportURL : siteConfig.dashboardURL}
                                    variant={planned ? "outline" : "primary"}
                                    icon={planned ? "discord" : undefined}
                                    trailingIcon={planned ? undefined : "arrow-up-right"}
                                    className={styles.cardAction}
                                >
                                    {planned ? "Support-Server" : "Zum Dashboard"}
                                </Button>
                            </Panel>

                            {/* Ohne diesen Hinweis bleibt offen, wie man ein Modul
                                ohne Command überhaupt benutzt. */}
                            {module.commands.length === 0 && !planned && (
                                <Panel className={styles.card} accent={module.accent}>
                                    <h2 className={styles.cardTitle}>
                                        <Icon name="bolt" size={16} />
                                        Kein Command nötig
                                    </h2>
                                    <p className={styles.cardText}>
                                        Eingestellt wird das Modul im Dashboard. In Discord läuft es danach von selbst
                                        oder über Knöpfe und Menüs.
                                    </p>
                                </Panel>
                            )}

                            {detail?.parts !== undefined && (
                                <Panel className={styles.card} accent={module.accent}>
                                    <h2 className={styles.cardTitle}>
                                        <Icon name="puzzle" size={16} />
                                        Kommt mit
                                    </h2>
                                    <ul className={styles.parts}>
                                        {detail.parts.map((part) => (
                                            <li key={part.name}>
                                                <strong>{part.name}</strong>
                                                {part.text}
                                            </li>
                                        ))}
                                    </ul>
                                </Panel>
                            )}
                        </aside>
                    </div>
                </div>
            </article>

            {/* --- Beispiel zum Ansehen ------------------------------------ */}
            {detail?.showcase === "rank-card" && (
                <Section>
                    <div className={["u-shell", styles.showcase].join(" ")}>
                        <SectionHeading
                            eyebrow="Beispiel"
                            title="Das gibt der Bot aus"
                            lead="Keine Illustration. So sieht die Karte in deinem Server aus, wenn jemand seinen Rang abfragt."
                            accent={module.accent}
                        />
                        <div className={styles.showcaseBody}>
                            <RankCardPreview />
                        </div>
                    </div>
                </Section>
            )}

            {detail?.showcase === "team-roster" && (
                <Section>
                    <div className="u-shell">
                        <SectionHeading
                            eyebrow="Beispiel"
                            title="Drei Kader, drei Besetzungen"
                            lead="Captain, Co-Captain, Stamm und Ersatz spielen und zählen in den Schnitt. Trial, Coach und Manager stehen im Kader, rechnen aber nicht mit. Deshalb absichtlich verschieden besetzt: mit Co-Captain, Ersatz und Coach, mit Trial und Manager, und ganz ohne."
                            accent={module.accent}
                        />
                        <ul className={styles.teams}>
                            {EXAMPLE_TEAMS.map((team) => (
                                <li key={team.id}>
                                    <TeamRoster team={team} />
                                </li>
                            ))}
                        </ul>
                        <p className={styles.disclaimer}>
                            <Icon name="lock" size={14} />
                            Beispielkader mit erfundenen Spielern. Auf dieser Seite stehen keine echten Konten.
                        </p>
                    </div>
                </Section>
            )}

            {/* --- Begriffe ------------------------------------------------ */}
            {detail?.concepts !== undefined && (
                <Section>
                    <div className="u-shell">
                        <SectionHeading
                            eyebrow="Begriffe"
                            title={detail.concepts.title}
                            lead={detail.concepts.lead}
                            accent="var(--c-blue)"
                        />
                        <ul className={styles.concepts}>
                            {detail.concepts.entries.map((entry) => (
                                <li
                                    key={entry.label}
                                    className={styles.concept}
                                    style={{ ["--dot" as string]: entry.color }}
                                >
                                    <span className={styles.conceptDot} aria-hidden="true" />
                                    <span className={styles.conceptLabel}>{entry.label}</span>
                                    <span className={styles.conceptText}>{entry.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>
            )}

            {/* --- Automatiken --------------------------------------------- */}
            {detail?.automations !== undefined && (
                <Section>
                    <div className="u-shell">
                        <SectionHeading
                            eyebrow="Automatisch"
                            title={detail.automations.title}
                            lead={detail.automations.lead}
                        />
                        <ul className={styles.automations}>
                            {detail.automations.entries.map((entry) => (
                                <li key={entry.title}>
                                    <Panel className={styles.automation} accent="var(--c-red)">
                                        <span className={styles.automationIcon}>
                                            <Icon name={entry.icon} size={21} />
                                        </span>
                                        <h3>{entry.title}</h3>
                                        <p>{entry.text}</p>
                                    </Panel>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>
            )}

            {/* --- Einrichtung --------------------------------------------- */}
            {detail?.setup !== undefined && (
                <Section>
                    <div className="u-shell">
                        <SectionHeading
                            eyebrow="Einrichtung"
                            title={detail.setup.title}
                            lead={detail.setup.lead}
                            accent="var(--c-mod-engagement)"
                        />
                        <ol className={styles.steps}>
                            {detail.setup.entries.map((step, index) => (
                                <li key={step.title}>
                                    <Panel className={styles.step} accent={module.accent}>
                                        <span className={styles.number} aria-hidden="true">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <h3>{step.title}</h3>
                                        <p>{step.text}</p>
                                    </Panel>
                                </li>
                            ))}
                        </ol>
                    </div>
                </Section>
            )}

            {/* --- Verwandtes ---------------------------------------------- */}
            {related.length > 0 && (
                <Section>
                    <div className={["u-shell", styles.related].join(" ")}>
                        <h2 className={styles.relatedTitle}>Passt dazu</h2>
                        <ul className={styles.relatedGrid}>
                            {related.map((other) => (
                                <li key={other.id}>
                                    <ModuleCard module={other} />
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>
            )}

            <CallToAction />
        </div>
    );
}
