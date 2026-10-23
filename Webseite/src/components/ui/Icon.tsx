import type { JSX, SVGProps } from "react";

/**
 * Die Symbolsammlung.
 *
 * Eingebettet statt als Bibliothek: es sind rund dreißig Symbole, und jedes
 * geladene Icon-Paket bringt mehrere hundert mit, von denen der Rest ungenutzt
 * im Bündel liegt. Alle im selben Raster (24×24), derselben Strichstärke und
 * mit `currentColor` - dadurch nimmt jedes Symbol die Farbe seiner Umgebung an
 * und muss nirgends eingefärbt werden.
 */
const STROKE: Readonly<Record<string, JSX.Element>> = {
    /* --- Module --------------------------------------------------------- */
    wave: (
        <>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="m10 17 5-5-5-5" />
            <path d="M15 12H3" />
        </>
    ),
    clipboard: (
        <>
            <path d="M9 3h6v3H9z" />
            <path d="M15 4.5h3A1.5 1.5 0 0 1 19.5 6v13.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 6 4.5h3" />
            <path d="m8.5 12.5 2 2 4-4" />
        </>
    ),
    tag: (
        <>
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z" />
            <circle cx="7.6" cy="7.6" r="1.4" />
        </>
    ),
    sparkle: (
        <>
            <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" />
            <path d="M18.5 3.5v3M20 5h-3" />
        </>
    ),
    mic: (
        <>
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 11a7 7 0 0 1-14 0" />
            <path d="M12 18v4M8.5 22h7" />
        </>
    ),
    crosshair: (
        <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
    ),
    "shield-users": (
        <>
            <path d="M12 2.5 4.5 5.4V11c0 4.9 3.2 8.9 7.5 10.5 4.3-1.6 7.5-5.6 7.5-10.5V5.4z" />
            <circle cx="12" cy="10" r="2" />
            <path d="M8.5 16.5a3.7 3.7 0 0 1 7 0" />
        </>
    ),
    "user-search": (
        <>
            <circle cx="10" cy="7.5" r="3.5" />
            <path d="M3.5 20a6.5 6.5 0 0 1 8.8-6.1" />
            <circle cx="16.5" cy="16.5" r="3.5" />
            <path d="m19.2 19.2 2.3 2.3" />
        </>
    ),
    calendar: (
        <>
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
            <path d="M8 14h3v3H8z" />
        </>
    ),
    scroll: (
        <>
            <path d="M5.5 4A1.5 1.5 0 0 1 7 2.5h7.5L19.5 7.5V20A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20z" />
            <path d="M14 2.5v5h5" />
            <path d="M9 12.5h6M9 16h4" />
        </>
    ),
    ticket: (
        <>
            <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h14a1.5 1.5 0 0 1 1.5 1.5v1.8a2 2 0 0 0 0 3.4v1.8A1.5 1.5 0 0 1 19 17H5a1.5 1.5 0 0 1-1.5-1.5v-1.8a2 2 0 0 0 0-3.4z" />
            <path d="M14 7v10" strokeDasharray="2 2.4" />
        </>
    ),
    "shield-check": (
        <>
            <path d="M12 2.5 4.5 5.4V11c0 4.9 3.2 8.9 7.5 10.5 4.3-1.6 7.5-5.6 7.5-10.5V5.4z" />
            <path d="m8.8 11.8 2.3 2.3 4.1-4.4" />
        </>
    ),
    "chart-up": (
        <>
            <path d="M3.5 20.5h17" />
            <path d="m6 15.5 4-4.5 3.5 2.8L20 6" />
            <path d="M15.5 6H20v4.5" />
        </>
    ),
    gift: (
        <>
            <path d="M4.5 11h15v8.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
            <rect x="3" y="7" width="18" height="4" rx="1" />
            <path d="M12 7v13.5" />
            <path d="M12 7s-2.6.3-3.7-.8a1.9 1.9 0 0 1 2.7-2.7C12 4.7 12 7 12 7zm0 0s2.6.3 3.7-.8a1.9 1.9 0 0 0-2.7-2.7C12 4.7 12 7 12 7z" />
        </>
    ),
    pulse: (
        <>
            <path d="M2.5 12.5h4L9 5.5l4 13.5 2.5-7h4.5" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
            <path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0" />
        </>
    ),
    image: (
        <>
            <rect x="3.5" y="4" width="17" height="16" rx="2" />
            <circle cx="9" cy="9.5" r="1.6" />
            <path d="m4 16.5 4.5-4.2 3.5 3.2 3-2.8 5 4.3" />
        </>
    ),
    megaphone: (
        <>
            <path d="M11.5 5 5.5 9H2.8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.7l6 4z" />
            <path d="M15.8 9a4.4 4.4 0 0 1 0 6M18.8 6a8.4 8.4 0 0 1 0 12" />
        </>
    ),
    dashboard: (
        <>
            <path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v4.5h-7zM13.5 11h7v9.5h-7zM3.5 13h7v7.5h-7z" />
        </>
    ),
    "bar-chart": (
        <>
            <path d="M3.5 20.5h17" />
            <path d="M7 20.5v-8M12 20.5V4.5M17 20.5v-5.5" />
        </>
    ),
    archive: (
        <>
            <rect x="3" y="3.5" width="18" height="4.5" rx="1" />
            <path d="M5 8v11.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
            <path d="M10 12h4" />
        </>
    ),
    /* Dieselben Striche wie im Sprite des Dashboards (guild.html im Bot). */
    gamepad: (
        <>
            <path d="M6.5 7.5h11a4.5 4.5 0 0 1 4.4 3.6l.8 4.3A2.8 2.8 0 0 1 20 18.8a2.8 2.8 0 0 1-2.3-1.2L16.4 15.8H7.6L6.3 17.6A2.8 2.8 0 0 1 4 18.8a2.8 2.8 0 0 1-2.7-3.4l.8-4.3A4.5 4.5 0 0 1 6.5 7.5z" />
            <path d="M7 10.5v3M5.5 12h3M15.5 11h.01M17.5 13h.01" />
        </>
    ),
    swords: (
        <>
            <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
            <path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" />
        </>
    ),
    gavel: <path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8" />,
    "list-checks": <path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8" />,

    folder: (
        <>
            <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
        </>
    ),
    upload: (
        <>
            <path d="M12 16V4M8 7.5 12 3.5l4 4" />
            <path d="M3.5 15v4a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4" />
        </>
    ),
    link: (
        <>
            <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
            <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
            <circle cx="12" cy="12" r="2.8" />
        </>
    ),
    filter: (
        <>
            <path d="M3.5 5h17l-6.6 7.8v5.9l-3.8 2.3v-8.2z" />
        </>
    ),
    refresh: (
        <>
            <path d="M20.5 11.5a8.5 8.5 0 0 0-14.8-4.7L3.5 9" />
            <path d="M3.5 12.5a8.5 8.5 0 0 0 14.8 4.7l2.2-2.2" />
            <path d="M3.5 4.5V9h4.5M20.5 19.5V15H16" />
        </>
    ),
    trash: (
        <>
            <path d="M4 6.5h16M9.5 6.5V4h5v2.5" />
            <path d="M6 6.5 6.9 20a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 6.5" />
            <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
        </>
    ),
    "message-square": (
        <>
            <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16H9l-5.5 4z" />
        </>
    ),

    /* --- Oberfläche ------------------------------------------------------ */
    "arrow-right": (
        <>
            <path d="M4 12h15M13 6l6 6-6 6" />
        </>
    ),
    "arrow-up-right": (
        <>
            <path d="M7 17 17 7M8.5 7H17v8.5" />
        </>
    ),
    "chevron-down": <path d="m6 9.5 6 6 6-6" />,
    check: <path d="m4.5 12.5 5 5 10-11" />,
    menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
    close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m16.2 16.2 4.3 4.3" />
        </>
    ),
    mail: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3.8 6.5 8.2 6.4 8.2-6.4" />
        </>
    ),
    external: (
        <>
            <path d="M14 3.5h6.5V10M20.5 3.5 10 14" />
            <path d="M19 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10" />
        </>
    ),
    users: (
        <>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0" />
            <path d="M16 5a3.5 3.5 0 0 1 0 6.6M17.5 14.6a6.5 6.5 0 0 1 4 6" />
        </>
    ),
    bolt: <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" />,
    /* Für das Warn-Banner. Dasselbe Dreieck wie im Admin Dashboard. */
    alert: (
        <>
            <path d="M12 3.5 2.5 20h19z" />
            <path d="M12 10v4.5M12 17.2h.01" />
        </>
    ),
    lock: (
        <>
            <rect x="4.5" y="10" width="15" height="10.5" rx="1.5" />
            <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
        </>
    ),
    puzzle: (
        <>
            <path d="M10 3.5a2 2 0 0 1 4 0V5h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 0 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v1.5a2 2 0 0 1-4 0V19H6.5a1 1 0 0 1-1-1v-4H4a2 2 0 0 1 0-4h1.5V6a1 1 0 0 1 1-1H10z" />
        </>
    ),
    server: (
        <>
            <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
            <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
            <path d="M7.5 7.2h.01M7.5 16.8h.01" />
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
    play: <path d="M7 4.8 19 12 7 19.2z" />,
};

/**
 * Symbole aus einer gefüllten Fläche statt aus Strichen - die Markenzeichen.
 * Sie kommen so von ihren Herausgebern und ließen sich nicht ohne Verlust in
 * das Strichraster übertragen.
 */
const FILLED: Readonly<Record<string, JSX.Element>> = {
    discord: (
        <path d="M20.3 4.9A19.8 19.8 0 0 0 15.4 3.4a13.9 13.9 0 0 0-.6 1.3 18.3 18.3 0 0 0-5.5 0 13.6 13.6 0 0 0-.7-1.3A19.7 19.7 0 0 0 3.7 4.9C.6 9.5-.3 14 .2 18.4a19.9 19.9 0 0 0 6 3 14.6 14.6 0 0 0 1.3-2.1 12.9 12.9 0 0 1-2-1c.2-.1.3-.2.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4a12.9 12.9 0 0 1-2 1 14.4 14.4 0 0 0 1.3 2.1 19.8 19.8 0 0 0 6-3c.6-5.1-1-9.6-3.6-13.5zM8 15.7c-1.2 0-2.1-1.1-2.1-2.4S6.8 10.9 8 10.9s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    ),
    github: (
        <path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    ),
    twitch: (
        <path d="M4.3 2 2 6.5V20h5v3h3l3-3h4l5-5V2zm15.4 11.3-3 3h-4l-3 3v-3H6.4V3.7h13.3z M15.5 7v5h1.8V7zm-4.8 0v5h1.8V7z" />
    ),
    youtube: (
        <path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 4.9 12 4.9 12 4.9s-7 0-8.9.5A3 3 0 0 0 1 7.5 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.5 31 31 0 0 0-.5-4.5zM9.8 15.3V8.7l5.7 3.3z" />
    ),
};

/**
 * Alle Namen der Sammlung.
 *
 * Das Exportskript legt daraus die Symbolliste für das Admin Dashboard an. Was
 * dort zur Auswahl steht, zeichnet diese Komponente also auch.
 *
 * Der Export kostet nur Fast Refresh für diese Datei: Ändert sich ein Symbol,
 * lädt der Entwicklungsserver die Seite ganz neu. Die Sammlung dafür in eine
 * eigene Datei zu verschieben, lohnt sich bei der Häufigkeit nicht.
 */
// eslint-disable-next-line react/only-export-components
export const ICON_NAMES: readonly string[] = [...Object.keys(STROKE), ...Object.keys(FILLED)];

export interface IIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
    /** Schlüssel aus der Sammlung. Unbekannte Namen zeichnen nichts. */
    readonly name: string;
    /** Kantenlänge in Pixeln. */
    readonly size?: number;
}

/**
 * Ein Symbol.
 *
 * Standardmäßig `aria-hidden`: fast überall steht daneben schon Text, und ein
 * Bildschirmleser, der jedes Zierstück vorliest, wird unbenutzbar. Wo ein
 * Symbol allein steht, gehört ein `aria-label` an die Schaltfläche - nicht hier
 * hinein.
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
