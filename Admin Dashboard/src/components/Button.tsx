import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

interface IShared {
    readonly children: ReactNode;
    readonly variant?: ButtonVariant;
    readonly size?: "sm" | "md";
    /** Symbol vor dem Text, Name aus Icon.tsx. */
    readonly icon?: string;
}

export interface IButtonProps extends IShared, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    /** Zeigt, dass gearbeitet wird, und verhindert den zweiten Klick. */
    readonly busy?: boolean;
}

function classes(variant: ButtonVariant, size: "sm" | "md", extra?: string): string {
    return [styles.button, styles[variant], styles[size], extra].filter(Boolean).join(" ");
}

export function Button({
    children,
    variant = "outline",
    size = "md",
    icon,
    busy = false,
    className,
    type = "button",
    disabled,
    ...rest
}: IButtonProps): JSX.Element {
    return (
        <button
            type={type}
            className={classes(variant, size, className)}
            disabled={disabled === true || busy}
            aria-busy={busy || undefined}
            {...rest}
        >
            {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon !== undefined && <Icon name={icon} size={16} />}
            <span className={styles.label}>{children}</span>
        </button>
    );
}

export interface ILinkButtonProps extends IShared {
    readonly href: string;
}

/** Sieht aus wie ein Knopf, ist aber ein echter Link, etwa zur Discord-Anmeldung. */
export function LinkButton({ children, variant = "outline", size = "md", icon, href }: ILinkButtonProps): JSX.Element {
    return (
        <a href={href} className={classes(variant, size)}>
            {icon !== undefined && <Icon name={icon} size={16} />}
            <span className={styles.label}>{children}</span>
        </a>
    );
}
