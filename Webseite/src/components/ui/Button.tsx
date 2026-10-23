import type { JSX, MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "md" | "lg";

export interface IButtonProps {
    readonly children: ReactNode;
    readonly variant?: ButtonVariant;
    readonly size?: ButtonSize;
    /** Ziel innerhalb der Seite. Schließt `href` aus. */
    readonly to?: string;
    /** Ziel außerhalb der Seite. Öffnet einen neuen Tab. Schließt `to` aus. */
    readonly href?: string;
    readonly onClick?: MouseEventHandler<HTMLElement>;
    readonly type?: "button" | "submit";
    readonly disabled?: boolean;
    /** Symbolname, links vom Text. */
    readonly icon?: string;
    /** Symbolname, rechts vom Text - meist ein Pfeil. */
    readonly trailingIcon?: string;
    readonly className?: string;
}

/**
 * Die Schaltfläche - je nach übergebenem Ziel ein Link nach innen, ein Link
 * nach außen oder ein echter Knopf.
 *
 * Drei Elemente statt drei Komponenten, weil sie sich nur im Element und in
 * zwei Attributen unterscheiden. Was sie ausmacht - Form, Farbe, Verhalten -
 * ist dasselbe, und das sollte auch an einer Stelle stehen.
 */
export function Button({
    children,
    variant = "primary",
    size = "md",
    to,
    href,
    onClick,
    type = "button",
    disabled = false,
    icon,
    trailingIcon,
    className,
}: IButtonProps): JSX.Element {
    const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(" ");

    const content = (
        <>
            {icon !== undefined && <Icon name={icon} size={18} className={styles.icon} />}
            <span className={styles.label}>{children}</span>
            {trailingIcon !== undefined && <Icon name={trailingIcon} size={18} className={styles.trailing} />}
        </>
    );

    if (href !== undefined) {
        // `noreferrer` gehört zu `noopener` dazu: sonst erfährt das Ziel, von
        // welcher Seite aus geklickt wurde.
        return (
            <a className={classes} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
                {content}
            </a>
        );
    }

    if (to !== undefined) {
        return (
            <Link className={classes} to={to} onClick={onClick}>
                {content}
            </Link>
        );
    }

    return (
        <button className={classes} type={type} onClick={onClick} disabled={disabled}>
            {content}
        </button>
    );
}
