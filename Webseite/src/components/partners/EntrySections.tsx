import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ISection, ISiteEntry, ISiteServer, SectionType } from "../../domain/interfaces/ISiteContent";
import { categoryOf } from "../../services/categories";
import { moduleRegistry } from "../../services/registry";
import { VideoEmbed } from "../news/VideoEmbed";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { EntryLogo } from "./EntryLogo";
import { OfferCode } from "./SponsorBlock";
import { monthYear, paragraphs, shortDate } from "./entry";
import styles from "./EntrySections.module.scss";

/** Was in die rechte Spalte gehört. Alles andere steht links, in der gespeicherten Reihenfolge. */
export const ASIDE_TYPES: ReadonlySet<SectionType> = new Set(["discord", "facts", "modules", "news", "offer"]);

export interface IEntrySectionProps {
    readonly entry: ISiteEntry;
    readonly section: ISection;
    readonly live: ISiteServer | null;
    /** Für die Vorschau im Admin Dashboard (Teil 2): Index in `entry.sections`. */
    readonly index: number;
}

const since = (entry: ISiteEntry): string => `${entry.kind === "sponsor" ? "Sponsor" : "Partner"} seit`;

function Text({ text }: { readonly text: string | undefined }): JSX.Element {
    return (
        <div className={styles.text}>
            {paragraphs(text).map((part) => (
                <p key={part}>{part}</p>
            ))}
        </div>
    );
}

/** Ein Abschnitt der linken Spalte. Ohne Inhalt bleibt er weg, statt eine leere Überschrift zu zeigen. */
function MainSection({ entry, section, live }: IEntrySectionProps): JSX.Element | null {
    const items = section.items ?? [];

    switch (section.type) {
        case "about":
            return section.text ? (
                <section>
                    <h2>{section.title ?? (entry.kind === "sponsor" ? `Über ${entry.name}` : "Über uns")}</h2>
                    <Text text={section.text} />
                </section>
            ) : null;
        case "text":
            return section.text ? (
                <section>
                    {section.title && <h2>{section.title}</h2>}
                    <Text text={section.text} />
                </section>
            ) : null;
        case "teams":
            return live && live.teams.length > 0 ? (
                <section>
                    <h2>{section.title ?? "Teams"}</h2>
                    <ul className={styles.teams}>
                        {live.teams.map((team) => (
                            <li key={team.name}>
                                <Panel className={styles.team} cut="sm">
                                    <span className={styles.rank}>{team.rank ?? "–"}</span>
                                    <div>
                                        <b>{team.name}</b>
                                        <small>{team.players === 1 ? "1 Spieler" : `${team.players} Spieler`}</small>
                                    </div>
                                    {team.group && <span className={styles.group}>{team.group}</span>}
                                    {team.mmr !== null && (
                                        <span className={styles.mmr}>
                                            {team.mmr.toLocaleString("de-DE")}
                                            <small>MMR</small>
                                        </span>
                                    )}
                                </Panel>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null;
        case "achievements":
            return items.length > 0 ? (
                <section>
                    <h2>{section.title ?? "Erfolge"}</h2>
                    <ol className={styles.timeline}>
                        {items.map((item) => (
                            <li key={`${item.label}-${item.date ?? ""}`}>
                                <b>{item.label}</b>
                                {(item.date || item.value) && <span>{item.date ? monthYear(item.date) : item.value}</span>}
                                {item.text && <p>{item.text}</p>}
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null;
        case "together":
            return items.length > 0 ? (
                <section>
                    <h2>{section.title ?? "Was wir zusammen machen"}</h2>
                    <ul className={styles.together}>
                        {items.map((item, at) => (
                            <li key={item.label}>
                                <Panel className={styles.tile} cut="sm">
                                    <span className={styles.number}>{String(at + 1).padStart(2, "0")}</span>
                                    <b>{item.label}</b>
                                    {item.text && <p>{item.text}</p>}
                                </Panel>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null;
        case "gallery":
            return section.images && section.images.length > 0 ? (
                <section>
                    {section.title && <h2>{section.title}</h2>}
                    <ul className={styles.gallery}>
                        {section.images.map((image, at) => (
                            <li key={image}>
                                <img src={image} alt={`${entry.name}, Bild ${at + 1}`} loading="lazy" decoding="async" />
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null;
        case "video":
            return section.url ? (
                <section>
                    {section.title && <h2>{section.title}</h2>}
                    <VideoEmbed url={section.url} title={section.title} />
                </section>
            ) : null;
        case "quote":
            return section.text ? (
                <figure className={styles.quote}>
                    <blockquote>{section.text}</blockquote>
                    {section.title && <figcaption>{section.title}</figcaption>}
                </figure>
            ) : null;
        default:
            return null;
    }
}

/** Ein Kasten der rechten Spalte. */
function AsideSection({ entry, section, live }: IEntrySectionProps): JSX.Element | null {
    const items = section.items ?? [];

    switch (section.type) {
        case "discord":
            return entry.links.discord || live ? (
                <div className={[styles.box, styles.join].join(" ")}>
                    <h3>{section.title ?? "Discord"}</h3>
                    <div className={styles.joinRow}>
                        <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="sm" />
                        <div>
                            <b>{entry.name}</b>
                            {live && (
                                <small>
                                    <span className={styles.online}>● {live.online.toLocaleString("de-DE")} online</span> · {live.members.toLocaleString("de-DE")} Mitglieder
                                </small>
                            )}
                        </div>
                    </div>
                    {section.text && <p>{section.text}</p>}
                    {entry.links.discord && (
                        <a className={styles.joinButton} href={entry.links.discord} target="_blank" rel="noopener noreferrer">
                            <Icon name="discord" size={16} />
                            Beitreten
                        </a>
                    )}
                </div>
            ) : null;
        case "facts": {
            const rows = items.length > 0 ? items.map((item) => ({ label: item.label, value: item.value ?? item.text ?? "" })) : [
                { label: "Art", value: entry.typeLabel },
                ...(entry.since ? [{ label: since(entry), value: monthYear(entry.since) ?? "" }] : []),
            ];

            return (
                <Panel className={styles.box} cut="sm">
                    <h3>{section.title ?? "Steckbrief"}</h3>
                    <dl className={styles.facts}>
                        {rows.map((row) => (
                            <div key={row.label}>
                                <dt>{row.label}</dt>
                                <dd>{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                </Panel>
            );
        }
        case "modules": {
            const modules = (live?.modules ?? []).flatMap((id) => {
                const module = moduleRegistry.find(id);

                return module ? [module] : [];
            });

            return modules.length > 0 ? (
                <Panel className={styles.box} cut="sm">
                    <h3>{section.title ?? "Nutzt RL Nexus für"}</h3>
                    <div className={styles.modules}>
                        {modules.map((module) => (
                            <Link key={module.id} to={`/module/${module.id}`} style={{ "--c": categoryOf(module.category).accent } as CSSProperties}>
                                {module.name}
                            </Link>
                        ))}
                    </div>
                </Panel>
            ) : null;
        }
        case "news":
            return entry.news.length > 0 ? (
                <Panel className={styles.box} cut="sm">
                    <h3>{section.title ?? (entry.kind === "sponsor" ? "News zum Sponsoring" : `News mit ${entry.name}`)}</h3>
                    <ul className={styles.news}>
                        {entry.news.map((post) => (
                            <li key={post.slug}>
                                <Link to={`/news/${post.slug}`}>{post.title}</Link>
                                <small>{shortDate(post.date)}</small>
                            </li>
                        ))}
                    </ul>
                </Panel>
            ) : null;
        case "offer":
            return section.code || section.text ? (
                <div className={[styles.box, styles.offer].join(" ")}>
                    <h3>{section.title ?? "Angebot für die Community"}</h3>
                    {section.text && <p>{section.text}</p>}
                    {section.code && <OfferCode code={section.code} note="Code" />}
                    {section.until && <p className={styles.until}>Gültig bis {shortDate(section.until)}</p>}
                </div>
            ) : null;
        default:
            return null;
    }
}

/**
 * W-0062: Die Abschnitte eines Eintrags für eine Spalte, in der Reihenfolge aus
 * dem Admin Dashboard. Kennzahlen stehen nicht hier, sondern unter dem Kopf.
 */
export function EntrySections({ entry, live, place }: { readonly entry: ISiteEntry; readonly live: ISiteServer | null; readonly place: "main" | "aside" }): JSX.Element {
    const Part = place === "main" ? MainSection : AsideSection;

    return (
        <>
            {entry.sections.map((section, index) =>
                section.type !== "stats" && ASIDE_TYPES.has(section.type) === (place === "aside") ? (
                    <Part key={`${section.type}-${index}`} entry={entry} section={section} live={live} index={index} />
                ) : null
            )}
        </>
    );
}
