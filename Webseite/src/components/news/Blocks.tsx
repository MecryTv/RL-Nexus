import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { IBlock, ISitePartnerCard } from "../../domain/interfaces/ISiteContent";
import { EntryLogo } from "../partners/EntryLogo";
import { ENTRY_COLOR } from "../partners/entry";
import { Button } from "../ui/Button";
import { Markdown } from "./Markdown";
import { VideoEmbed } from "./VideoEmbed";
import { dayParts, time } from "./meta";
import styles from "./news.module.scss";

export interface IBlockProps {
    readonly block: IBlock;
    readonly partners: Readonly<Record<string, ISitePartnerCard>>;
}

/** Ein Baustein eines Beitrags. Fehlt ein verknüpfter Partner (ausgeblendet, gelöscht), bleibt die Stelle leer. */
export function Block({ block, partners }: IBlockProps): JSX.Element | null {
    switch (block.type) {
        case "text":
            return <Markdown md={block.md} className={[styles.prose, block.size === "lead" && styles.lead, block.width === "full" && styles.full].filter(Boolean).join(" ")} />;
        case "heading":
            return <h2 className={styles.heading}>{block.text}</h2>;
        case "image":
            return (
                <figure className={styles.figure}>
                    <img src={block.url} alt={block.alt} loading="lazy" decoding="async" />
                    {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
            );
        case "gallery":
            return (
                <ul className={styles.gallery}>
                    {block.images.map((image, index) => (
                        <li key={image}>
                            <img src={image} alt={`Bild ${index + 1} von ${block.images.length}`} loading="lazy" decoding="async" />
                        </li>
                    ))}
                </ul>
            );
        case "callout":
            return (
                <aside className={styles.callout}>
                    {block.title && <b>{block.title}</b>}
                    <Markdown md={block.text} />
                </aside>
            );
        case "quote":
            return (
                <figure className={styles.quote}>
                    <blockquote>{block.text}</blockquote>
                    {block.by && <figcaption>{block.by}</figcaption>}
                </figure>
            );
        case "partner": {
            const partner = partners[String(block.entryId)];

            return partner ? (
                <div className={styles.linked} style={{ "--c": ENTRY_COLOR[partner.color] } as CSSProperties}>
                    <EntryLogo name={partner.name} logo={partner.logo} color={partner.color} size="md" />
                    <div>
                        <small>{partner.typeLabel}</small>
                        <b>{partner.name}</b>
                    </div>
                    <Link className={styles.linkedMore} to={`/partner/${partner.slug}`}>
                        Ansehen →
                    </Link>
                </div>
            ) : null;
        }
        case "event": {
            const parts = dayParts(block.startsAt);

            return (
                <div className={styles.event}>
                    <span className={styles.dateBox}>
                        <strong>{parts.day}</strong>
                        <small>{parts.month}</small>
                    </span>
                    <div>
                        <b>{block.title}</b>
                        <small>
                            {time(block.startsAt)} Uhr{block.place ? ` · ${block.place}` : ""}
                        </small>
                    </div>
                </div>
            );
        }
        case "video":
            return <VideoEmbed url={block.url} />;
        case "button":
            return (
                <div className={styles.button}>
                    {block.url.startsWith("/") ? (
                        <Button to={block.url} trailingIcon="arrow-right">
                            {block.label}
                        </Button>
                    ) : (
                        <Button href={block.url} trailingIcon="arrow-up-right">
                            {block.label}
                        </Button>
                    )}
                </div>
            );
        case "divider":
            return <hr className={styles.divider} />;
        default:
            return null;
    }
}

/** W-0062: Die Bausteine eines Beitrags untereinander. */
export function Blocks({ blocks, partners }: { readonly blocks: readonly IBlock[]; readonly partners: Readonly<Record<string, ISitePartnerCard>> }): JSX.Element {
    return (
        <div className={styles.blocks}>
            {blocks.map((block, index) => (
                <Block key={index} block={block} partners={partners} />
            ))}
        </div>
    );
}
