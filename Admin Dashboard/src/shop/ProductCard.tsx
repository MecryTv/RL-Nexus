import type { CSSProperties, JSX, ReactNode } from "react";
import { durationLabel, formatPrice, priceSuffix, type IGuildRole, type IShopProduct } from "../../shared/shop";
import { Panel } from "../components/Panel";
import styles from "./shop.module.scss";

/**
 * Ein Produkt, wie es auf nexus-emb.de/preise steht (Entwurf A der
 * Preisseite). Im Admin Dashboard ist die Karte zugleich die Vorschau: Wird
 * das Produkt bearbeitet, zeigt sie den Entwurf.
 */
export function ProductCard({
    product,
    role,
    editing,
    onOpen,
    grip,
}: {
    readonly product: IShopProduct;
    readonly role: IGuildRole | null;
    readonly editing: boolean;
    readonly onOpen: () => void;
    /** Der Griff zum Sortieren, von der Seite gebaut. */
    readonly grip?: ReactNode;
}): JSX.Element {
    const highlighted = product.badge !== "";

    return (
        <Panel
            as="article"
            accent={editing ? "var(--c-blue)" : highlighted ? "var(--c-red)" : undefined}
            className={[styles.card, !product.visible && styles.hidden].filter(Boolean).join(" ")}
        >
            <div className={styles.cardTop}>
                {grip}
                <div className={styles.tags}>
                    {highlighted && <span className={`${styles.tag} ${styles.tagBadge}`}>{product.badge}</span>}
                    <span className={`${styles.tag} ${product.kind === "subscription" ? styles.tagAbo : styles.tagOnce}`}>
                        {product.kind === "subscription" ? "Abo" : "Einmalig"}
                    </span>
                    {!product.visible && <span className={`${styles.tag} ${styles.tagHidden}`}>Ausgeblendet</span>}
                </div>
            </div>

            <h2 className={styles.cardTitle}>{product.title}</h2>
            <p className={styles.cardMeta}>{product.description || durationLabel(product.kind, product.durationDays)}</p>

            <p className={styles.price}>
                {formatPrice(product.priceCents)}
                <small>{priceSuffix(product.kind)}</small>
            </p>

            {product.bullets.length > 0 && (
                <ul className={styles.bullets}>
                    {product.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                    ))}
                </ul>
            )}

            <footer className={styles.cardFoot}>
                <span className={styles.role} style={{ "--role": role?.color ?? "var(--c-text-faint)" } as CSSProperties}>
                    {role?.name ?? "Rolle fehlt"}
                </span>
                <span className={styles.active}>{product.active} aktiv</span>
            </footer>

            <button type="button" className={styles.open} onClick={onOpen}>
                <span className="u-sr">{product.title} bearbeiten</span>
            </button>
        </Panel>
    );
}
