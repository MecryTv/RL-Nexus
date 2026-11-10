import { type CSSProperties, type JSX, useState } from "react";
import type { EntryColor } from "../../domain/interfaces/ISiteContent";
import { ENTRY_COLOR, initials } from "./entry";
import styles from "./partners.module.scss";

export interface IEntryLogoProps {
    readonly name: string;
    readonly logo: string | null;
    readonly color: EntryColor;
    readonly size?: "sm" | "md" | "lg" | "xl";
}

/**
 * Logo eines Eintrags, ohne Bild die Anfangsbuchstaben in seiner Farbe. Auch
 * wenn das Bild nicht lädt (gelöscht, Netz weg), stehen die Buchstaben da statt
 * eines kaputten Bildes. Dekorativ: Der Name steht immer daneben.
 */
export function EntryLogo({ name, logo, color, size = "md" }: IEntryLogoProps): JSX.Element {
    const [failed, setFailed] = useState<string | null>(null);
    const showImage = logo !== null && failed !== logo;

    return (
        <span className={[styles.logo, styles[size]].join(" ")} style={{ "--c": ENTRY_COLOR[color] } as CSSProperties} aria-hidden="true">
            {showImage ? <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(logo)} /> : initials(name)}
        </span>
    );
}
