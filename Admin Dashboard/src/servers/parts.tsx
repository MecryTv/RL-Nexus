import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IPersonRef, IRequestView } from "../../shared/servers.ts";
import { initials, ORIGIN_TEXT, stamp } from "./util.ts";
import styles from "./servers.module.scss";

/** Bausteine für Server-Freigaben und Eingeladene Server (W-0064). */

export function PersonCell({ person }: { readonly person: IPersonRef }): JSX.Element {
    return (
        <div className={styles.person}>
            {person.avatar ? <img src={person.avatar} alt="" /> : <span className={styles.initial}>{initials(person.name)}</span>}
            <span>
                <Link to={`/datenschutz/${person.id}?reiter=eingeladen`}>{person.name}</Link>
                <small>{person.id}</small>
            </span>
        </div>
    );
}

/** Lila Siegel mit Nummer, ein Klick zeigt, wer wann freigegeben hat und warum. */
export function Seal({ request }: { readonly request: IRequestView }): JSX.Element | null {
    const [open, setOpen] = useState(false);

    if (!request.signature) return null;

    return (
        <span className={styles.seal}>
            <button type="button" className={styles.sealButton} aria-expanded={open} onClick={() => setOpen(!open)}>
                ✦ FREIGABE {request.signature}
            </button>
            {open && (
                <div className={styles.popover} role="dialog" aria-label={`Freigabe ${request.signature}`}>
                    <b>✦ Freigabe {request.signature}</b>
                    <dl>
                        {request.decided && (
                            <div>
                                <dt>Freigegeben von</dt>
                                <dd>
                                    {request.decided.name}
                                    {request.decided.role ? ` (${request.decided.role})` : ""} am {stamp(request.decided.at)}
                                </dd>
                            </div>
                        )}
                        <div>
                            <dt>Grund</dt>
                            <dd>{request.reason || "–"}</dd>
                        </div>
                        <div>
                            <dt>Angefragt</dt>
                            <dd>
                                von {request.person.name} am {stamp(request.createdAt)}, {ORIGIN_TEXT[request.origin]}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}
        </span>
    );
}
