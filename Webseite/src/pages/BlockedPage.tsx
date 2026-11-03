import { useEffect, useState, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { usePageMeta } from "../hooks/usePageMeta";
import { loadBlocked, loginUrl, logout } from "../shop/api";
import type { Block, IBlockedView } from "../shop/types";
import styles from "./BlockedPage.module.scss";

/**
 * Nach der Anmeldung mit Discord (W-0057): Sperrseite C4c oder VPN-Seite V-A+.
 * Der Callback schickt hierher, eine Sitzung gibt es dann nicht. Kein Grund,
 * kein Ansprechpartner; auf der VPN-Seite kein Wort von einer Sperre.
 */

const ALL: readonly Block[] = ["others", "own", "dashboard", "website", "shop"];
const SERVICE = { dashboard: "Bot-Dashboard", website: "Webseite", shop: "Shop" } as const;
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Die Schilder wie im Entwurf C4c: Bot auf allen Servern als ein Schild. */
function chips(scope: readonly Block[]): { readonly blocked: string[]; readonly usable: string[] } {
    const on = (block: Block): boolean => scope.includes(block);
    const blocked: string[] = [];
    const usable: string[] = [];

    if (on("others") && on("own")) blocked.push("Bot");
    else if (on("own")) {
        blocked.push("Eigene Server");
        usable.push("Bot auf anderen Servern");
    } else if (on("others")) {
        blocked.push("Bot auf anderen Servern");
        usable.push("Eigene Server");
    } else usable.push("Bot");

    for (const [block, label] of [["dashboard", "Dashboard"], ["website", "Webseite"], ["shop", "Shop"]] as const) (on(block) ? blocked : usable).push(label);

    return { blocked, usable };
}

function Shield({ kind }: { readonly kind: "full" | "part" | "vpn" }): JSX.Element {
    if (kind === "vpn") {
        return (
            <svg className={styles.shield} viewBox="0 0 76 86" aria-hidden="true">
                <path d="M38 3 70 15v26c0 20-13 34-32 42C19 75 6 61 6 41V15Z" fill="rgba(255,197,61,.12)" stroke="#ffc53d" strokeWidth="3" />
                <path d="M24 40a20 20 0 0 1 28 0M29 46a12 12 0 0 1 18 0M34 52a5 5 0 0 1 8 0" fill="none" stroke="#ffc53d" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M22 60 54 28" stroke="#ffc53d" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
        );
    }

    const tone = kind === "full" ? { line: "#ff1e2d", fill: "#1a0b0e", ring: "rgba(255,30,45,.35)" } : { line: "#f0b232", fill: "#1a1408", ring: "rgba(240,178,50,.35)" };

    return (
        <svg className={styles.shield} viewBox="0 0 78 86" aria-hidden="true">
            <path d="M39 4l31 12v24c0 20-13 34-31 42C21 74 8 60 8 40V16z" fill={tone.fill} stroke={tone.line} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M39 14l22 8.5V40c0 14-9 24-22 30-13-6-22-16-22-30V22.5z" fill="none" stroke={tone.ring} strokeWidth="1.2" />
            {kind === "full" ? <path d="M30 33l18 18M48 33L30 51" stroke={tone.line} strokeWidth="3.5" strokeLinecap="round" /> : <path d="M28 42h22" stroke={tone.line} strokeWidth="3.5" strokeLinecap="round" />}
        </svg>
    );
}

function Account({ view }: { readonly view: IBlockedView }): JSX.Element {
    return (
        <span className={styles.account}>
            <span className={styles.avatar}>{view.avatar ? <img src={view.avatar} alt="" /> : (view.name.trim()[0] ?? "?").toUpperCase()}</span>
            <span>
                {view.name}
                <small>über Discord angemeldet</small>
            </span>
        </span>
    );
}

function Ban({ view, onLogout }: { readonly view: IBlockedView; readonly onLogout: () => void }): JSX.Element {
    const full = ALL.every((block) => view.scope.includes(block));
    const { blocked, usable } = chips(view.scope);
    const since = [view.since ? `seit ${DAY.format(new Date(view.since))}` : "", view.changedAt ? `geändert am ${DAY.format(new Date(view.changedAt))}` : ""].filter(Boolean).join(" · ");

    return (
        <div className={styles.ban} data-tone={full ? "full" : "part"}>
            <Shield kind={full ? "full" : "part"} />
            <p className={styles.state}>{full ? "Dauerhaft gesperrt" : "Teilweise gesperrt"}</p>
            <h1 className={styles.title}>{full ? "Zugang gesperrt" : `${SERVICE[view.service]} gesperrt`}</h1>
            <Account view={view} />
            <div className={styles.groups}>
                <div>
                    <span className={styles.label}>Gesperrt</span>
                    <ul className={styles.chips}>
                        {blocked.map((label) => (
                            <li key={label} data-kind="no">
                                {label}
                            </li>
                        ))}
                    </ul>
                </div>
                {usable.length > 0 && (
                    <div>
                        <span className={styles.label}>Weiter nutzbar</span>
                        <ul className={styles.chips}>
                            {usable.map((label) => (
                                <li key={label} data-kind="yes">
                                    {label}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            {since && <p className={styles.since}>{since}</p>}
            <Button variant="outline" onClick={onLogout} className={styles.logout}>
                Abmelden
            </Button>
        </div>
    );
}

function Vpn({ view, onLogout }: { readonly view: IBlockedView; readonly onLogout: () => void }): JSX.Element {
    return (
        <div className={styles.vpn}>
            <div className={styles.headline}>
                <Shield kind="vpn" />
                <div>
                    <h1 className={styles.title}>Anmeldung über VPN nicht möglich</h1>
                    <p>Deine Verbindung läuft über ein VPN oder einen Proxy. So geht die Anmeldung gerade nicht.</p>
                </div>
            </div>
            <dl className={styles.facts}>
                <div>
                    <dt>Erkannt</dt>
                    <dd className={styles.warn}>VPN oder Proxy</dd>
                </div>
                <div>
                    <dt>Geprüft</dt>
                    <dd>{TIME.format(new Date(view.checkedAt))} Uhr</dd>
                </div>
                <div>
                    <dt>Bei</dt>
                    <dd>{SERVICE[view.service]}</dd>
                </div>
            </dl>
            <p className={styles.why}>RL Nexus prüft bei jeder Anmeldung die Verbindung, damit gesperrte Konten nicht über ein neues Konto zurückkommen. Deine Adresse speichern wir dabei nicht, nur ein unkenntliches Kürzel.</p>
            <ol className={styles.steps}>
                <li>VPN oder Proxy ausschalten</li>
                <li>Diese Seite schließen oder auf „Neu anmelden“ drücken</li>
                <li>Mit Discord anmelden wie immer</li>
            </ol>
            <div className={styles.buttons}>
                <Button href={loginUrl(undefined, view.service === "website" ? "zugang" : undefined)}>Neu anmelden</Button>
                <Button variant="outline" onClick={onLogout}>
                    Abmelden
                </Button>
            </div>
            <details className={styles.help}>
                <summary>Ich nutze gar kein VPN</summary>
                <p>Manche Firmen-, Schul- oder Hotelnetze und einige Mobilfunkanbieter sehen von außen wie ein VPN aus. Versuch es über ein anderes Netz, etwa WLAN statt Mobilfunk oder umgekehrt.</p>
            </details>
            <Account view={view} />
        </div>
    );
}

export function BlockedPage(): JSX.Element {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get("s") ?? "";
    const [view, setView] = useState<IBlockedView | null>(null);
    const [error, setError] = useState<string | null>(token ? null : "Dieser Link ist abgelaufen. Melde dich neu an.");

    usePageMeta(view?.kind === "vpn" ? "Anmeldung über VPN nicht möglich" : "Zugang gesperrt");

    useEffect(() => {
        if (!token) return;

        loadBlocked(token)
            .then(setView)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, [token]);

    // Eine Sitzung gibt es nicht; logout räumt nur auf, falls noch ein altes Cookie liegt.
    const onLogout = (): void => {
        void logout()
            .catch(() => undefined)
            .then(() => navigate("/"));
    };

    return (
        <div className={["u-shell", styles.page].join(" ")}>
            {error && (
                <div className={styles.expired}>
                    <h1 className={styles.title}>Link abgelaufen</h1>
                    <p>{error}</p>
                    <Button to="/">Zur Startseite</Button>
                </div>
            )}
            {view?.kind === "ban" && <Ban view={view} onLogout={onLogout} />}
            {view?.kind === "vpn" && <Vpn view={view} onLogout={onLogout} />}
        </div>
    );
}
