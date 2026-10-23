import type { JSX, SVGProps } from "react";

/**
 * Die Symbole des Admin Dashboards im Raster der Webseite
 * (`src/components/ui/Icon.tsx` dort): 24×24, Strichstärke 1,6, currentColor.
 * Die meisten stammen von dort, der Rest ist im selben Raster gezeichnet. Wie
 * auf der Webseite kein Icon-Paket: es sind wenige Symbole.
 */
const STROKE: Readonly<Record<string, JSX.Element>> = {
    dashboard: <path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v4.5h-7zM13.5 11h7v9.5h-7zM3.5 13h7v7.5h-7z" />,
    server: (
        <>
            <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
            <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
            <path d="M7.5 7.2h.01M7.5 16.8h.01" />
        </>
    ),
    refresh: (
        <>
            <path d="M20.5 11.5a8.5 8.5 0 0 0-14.8-4.7L3.5 9" />
            <path d="M3.5 12.5a8.5 8.5 0 0 0 14.8 4.7l2.2-2.2" />
            <path d="M3.5 4.5V9h4.5M20.5 19.5V15H16" />
        </>
    ),
    // Griff zum Ziehen: zwei Reihen Punkte. Mit runden Enden wird aus der Nullstrecke ein Punkt.
    grip: <path strokeWidth={2.6} d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
    // Preisschild: Produkte im Shop.
    tag: (
        <>
            <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" />
            <path d="M8 8h.01" strokeWidth={2.6} />
        </>
    ),
    // Drei Regler: Einstellungen des Shops.
    sliders: (
        <>
            <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
            <circle cx="15" cy="6.5" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="17.5" r="2" />
        </>
    ),
    "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
    "chevron-down": <path d="m6 9.5 6 6 6-6" />,
    check: <path d="m4.5 12.5 5 5 10-11" />,
    menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
    close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
    logout: (
        <>
            <path d="M10 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
            <path d="M14 7.5 18.5 12 14 16.5" />
            <path d="M18.5 12H9" />
        </>
    ),
    copy: (
        <>
            <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
            <path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
        </>
    ),
    alert: (
        <>
            <path d="M12 3.5 2.5 20h19z" />
            <path d="M12 10v4.5M12 17.2h.01" />
        </>
    ),
    users: (
        <>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0" />
            <path d="M16 5a3.5 3.5 0 0 1 0 6.6M17.5 14.6a6.5 6.5 0 0 1 4 6" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
            <path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0" />
        </>
    ),
    mail: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3.8 6.5 8.2 6.4 8.2-6.4" />
        </>
    ),
    trash: (
        <>
            <path d="M4 6.5h16M9.5 6.5V4h5v2.5" />
            <path d="M6 6.5 6.9 20a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 6.5" />
            <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
        </>
    ),
    pencil: (
        <>
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
            <path d="m13.5 6.5 4 4" />
        </>
    ),
    send: (
        <>
            <path d="M21 3 10 14" />
            <path d="m21 3-7 18-4-7-7-4z" />
        </>
    ),
    "arrow-left": <path d="M20 12H5M11 6l-6 6 6 6" />,
    "chevron-left": <path d="m14.5 6-6 6 6 6" />,
    "chevron-right": <path d="m9.5 6 6 6-6 6" />,
    "chevron-up": <path d="m6 14.5 6-6 6 6" />,
    "file-text": (
        <>
            <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
            <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
        </>
    ),
    database: (
        <>
            <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
            <path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
            <path d="M4.5 11.5v7c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-7" />
        </>
    ),
    search: (
        <>
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="M15 15l5 5" />
        </>
    ),
    /* Beide Richtungen: die Spalte ist sortierbar, aber gerade nicht sortiert. */
    "chevron-up-down": (
        <>
            <path d="M8 10l4-4 4 4" />
            <path d="M8 14l4 4 4-4" />
        </>
    ),
    cpu: (
        <>
            <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
            <path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" />
        </>
    ),
    pulse: <path d="M2.5 12.5h4L9 5.5l4 13.5 2.5-7h4.5" />,
    sparkle: (
        <>
            <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" />
            <path d="M18.5 3.5v3M20 5h-3" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5.3l3.2 2" />
        </>
    ),
    trophy: (
        <>
            <path d="M8 3.5h8V9a4 4 0 0 1-8 0z" />
            <path d="M8 5H5v1.5A3.5 3.5 0 0 0 8.5 10M16 5h3v1.5A3.5 3.5 0 0 1 15.5 10" />
            <path d="M12 13v3.5M8.5 20.5h7l-.7-4h-5.6z" />
        </>
    ),
    wrench: <path d="M14.8 5.2a4.2 4.2 0 0 0-5.6 5.5L3.9 16a2.1 2.1 0 0 0 3 3l5.3-5.3a4.2 4.2 0 0 0 5.5-5.6l-2.6 2.6-2.6-.4-.4-2.6z" />,
    history: (
        <>
            <path d="M4.2 13.5A8 8 0 1 0 6.3 6.3L4 8.5" />
            <path d="M4 4v4.5h4.5M12 8v4.3l3 1.9" />
        </>
    ),
    download: <path d="M12 3.5v12M7 10.5l5 5 5-5M4.5 20.5h15" />,
    power: (
        <>
            <path d="M12 3.5v8" />
            <path d="M7.1 6.6a7.5 7.5 0 1 0 9.8 0" />
        </>
    ),
    "shield-check": (
        <>
            <path d="M12 2.5 4.5 5.4V11c0 4.9 3.2 8.9 7.5 10.5 4.3-1.6 7.5-5.6 7.5-10.5V5.4z" />
            <path d="m8.8 11.8 2.3 2.3 4.1-4.4" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    megaphone: (
        <>
            <path d="M11.5 5 5.5 9H2.8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.7l6 4z" />
            <path d="M15.8 9a4.4 4.4 0 0 1 0 6M18.8 6a8.4 8.4 0 0 1 0 12" />
        </>
    ),
    puzzle: (
        <path d="M10 3.5a2 2 0 0 1 4 0V5h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 0 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v1.5a2 2 0 0 1-4 0V19H6.5a1 1 0 0 1-1-1v-4H4a2 2 0 0 1 0-4h1.5V6a1 1 0 0 1 1-1H10z" />
    ),
    save: (
        <>
            <path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" />
            <path d="M7.5 3.5v5h8v-5M7.5 20.5v-6h9v6" />
        </>
    ),
    /* --- Postfach --- */
    paperclip: <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />,
    reply: <path d="M9.5 6.5 4 12l5.5 5.5M4.5 12h9a6.5 6.5 0 0 1 6.5 6.5v1" />,
    "reply-all": <path d="M12 6.5 6.5 12l5.5 5.5M7 6.5 1.5 12 7 17.5M7 12h7.5a6.5 6.5 0 0 1 6.5 6.5v1" />,
    forward: <path d="M14.5 6.5 20 12l-5.5 5.5M19.5 12h-9A6.5 6.5 0 0 0 4 18.5v1" />,
    archive: (
        <>
            <rect x="3" y="4" width="18" height="4.5" rx="1" />
            <path d="M4.5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4" />
        </>
    ),
    inbox: <path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5M5.5 5h13l2 8.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-4.5z" />,
    folder: <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />,
    ban: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="m6 6 12 12" />
        </>
    ),
    "mail-open": <path d="M3.5 10 12 4.5l8.5 5.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19zM3.5 10l8.5 6 8.5-6" />,
    image: (
        <>
            <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5" />
        </>
    ),
    list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
    "list-ordered": <path d="M10 6.5h10M10 12h10M10 17.5h10M4 5.5l1.5-1v4M4 10.5h2.5L4 13.5h2.5M4 16h2.5v3H4M4.5 17.5h2" />,
    quote: <path d="M5 17.5v-4a5 5 0 0 1 4-5M5 13.5h4v4H5zM14 17.5v-4a5 5 0 0 1 4-5M14 13.5h4v4h-4z" />,
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3M14 10a4 4 0 0 0-5.7 0l-3.6 3.6a4 4 0 0 0 5.7 5.7l1.6-1.6" />,
    "button-shape": (
        <>
            <rect x="3" y="7.5" width="18" height="9" rx="1" />
            <path d="M8 12h8" />
        </>
    ),
    minus: <path d="M4 12h16" />,
    undo: <path d="M9 7.5 4.5 12 9 16.5M5 12h9.5a5 5 0 0 1 0 10H12" />,
    redo: <path d="M15 7.5 19.5 12 15 16.5M19 12H9.5a5 5 0 0 0 0 10H12" />,
    eye: (
        <>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="2.8" />
        </>
    ),
};

/** Markenzeichen als gefüllte Fläche, so wie der Herausgeber sie liefert. */
const FILLED: Readonly<Record<string, JSX.Element>> = {
    discord: (
        <path d="M20.3 4.9A19.8 19.8 0 0 0 15.4 3.4a13.9 13.9 0 0 0-.6 1.3 18.3 18.3 0 0 0-5.5 0 13.6 13.6 0 0 0-.7-1.3A19.7 19.7 0 0 0 3.7 4.9C.6 9.5-.3 14 .2 18.4a19.9 19.9 0 0 0 6 3 14.6 14.6 0 0 0 1.3-2.1 12.9 12.9 0 0 1-2-1c.2-.1.3-.2.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4a12.9 12.9 0 0 1-2 1 14.4 14.4 0 0 0 1.3 2.1 19.8 19.8 0 0 0 6-3c.6-5.1-1-9.6-3.6-13.5zM8 15.7c-1.2 0-2.1-1.1-2.1-2.4S6.8 10.9 8 10.9s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    ),
};

export interface IIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
    /** Schlüssel aus der Sammlung. Unbekannte Namen zeichnen nichts. */
    readonly name: string;
    /** Kantenlänge in Pixeln. */
    readonly size?: number;
}

/**
 * Ein Symbol. Standardmäßig aria-hidden: fast überall steht Text daneben. Wo
 * ein Symbol allein steht, gehört der Name an die Schaltfläche, nicht hierher.
 */
export function Icon({ name, size = 20, ...rest }: IIconProps): JSX.Element | null {
    const filled = FILLED[name];
    const stroke = STROKE[name];

    if (filled === undefined && stroke === undefined) return null;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill={filled !== undefined ? "currentColor" : "none"}
            stroke={filled !== undefined ? "none" : "currentColor"}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...rest}
        >
            {filled ?? stroke}
        </svg>
    );
}
