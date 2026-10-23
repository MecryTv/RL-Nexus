import type { JSX } from "react";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { durationLabel, formatPrice, priceSuffix, type CardAction } from "./logic.ts";
import type { IShopPublicProduct } from "./types.ts";
import styles from "../pages/PricingPage.module.scss";

export interface IProductCardProps {
    readonly product: IShopPublicProduct;
    readonly action: CardAction;
    /** Eine Karte mit Hervorhebung („Beliebt“) bekommt den leuchtenden Rahmen. */
    readonly highlighted: boolean;
    readonly onLogin: (product: IShopPublicProduct) => void;
    readonly onSelect?: (product: IShopPublicProduct) => void;
}

/** Eine Karte nach Entwurf A: Art, Titel, Laufzeit, Preis, Stichpunkte, unten der Knopf oder ein Satz. */
export function ProductCard({ product, action, highlighted, onLogin, onSelect }: IProductCardProps): JSX.Element {
    const variant = highlighted ? "primary" : "outline";

    return (
        <article className={[styles.card, highlighted && styles.highlighted].filter(Boolean).join(" ")} aria-labelledby={`produkt-${product.id}`}>
            <div className={styles.tags}>
                {product.badge !== "" && <span className={[styles.tag, styles.tagRed].join(" ")}>{product.badge}</span>}
                <span className={[styles.tag, product.kind === "subscription" ? styles.tagBlue : styles.tagGold].join(" ")}>
                    {product.kind === "subscription" ? "Abo" : "Einmalig"}
                </span>
            </div>

            <h2 className={styles.cardTitle} id={`produkt-${product.id}`}>
                {product.title}
            </h2>
            {/* Die Laufzeit steht immer da, die Beschreibung aus dem Admin Dashboard nur, wenn es eine gibt. */}
            <p className={styles.cardMeta}>{durationLabel(product.kind, product.durationDays)}</p>
            {product.description !== "" && <p className={styles.cardText}>{product.description}</p>}

            <p className={styles.price}>
                {formatPrice(product.priceCents)}
                <small>{priceSuffix(product.kind)}</small>
            </p>

            {product.bullets.length > 0 && (
                <ul className={styles.features}>
                    {product.bullets.map((bullet) => (
                        <li key={bullet}>
                            <Icon name="check" size={16} className={styles.featureIcon} />
                            {bullet}
                        </li>
                    ))}
                </ul>
            )}

            <div className={styles.cardAction}>
                {action.kind === "none" ? (
                    <p className={styles.cardNote}>{action.note}</p>
                ) : (
                    <Button variant={variant} className={styles.wide} onClick={() => (action.kind === "login" ? onLogin(product) : onSelect?.(product))}>
                        {action.kind === "login" ? "Auswählen" : action.label}
                    </Button>
                )}
            </div>
        </article>
    );
}
