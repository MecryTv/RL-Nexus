import { type JSX, useEffect, useId, useRef, useState } from "react";
import type { IUserRef } from "../../shared/api";
import type { Group } from "../../shared/limits";
import { api, ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { useToast } from "../toast/context";
import { groupHint } from "./labels.ts";
import styles from "./partners.module.scss";

const SNOWFLAKE = /^\d{17,20}$/;

/** Antwort von GET /api/partners/contact/:userId. */
export interface IContactInfo {
    readonly user: IUserRef | null;
    readonly group: Group | null;
    readonly member: boolean;
    readonly servers: readonly { readonly id: string; readonly name: string; readonly icon: string | null }[];
    readonly assignable: { readonly canAssign: boolean; readonly reason: string | null };
    readonly invite: string | null;
}

export interface IContactFieldProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onInfo?: (info: IContactInfo | null) => void;
    readonly label?: string;
}

/**
 * W-0062 Teil 2: Ansprechpartner per Discord-ID, wie auf der Seite Gruppen.
 * Darunter, wer das ist, und der Kasten „Rolle auf RL Nexus“: ob die Person
 * auf dem Server ist und ob der Bot @Partner vergeben darf. Gespeichert wird
 * auch, wenn etwas fehlt.
 */
export function ContactField({ value, onChange, onInfo, label = "Ansprechpartner auf Discord" }: IContactFieldProps): JSX.Element {
    const id = useId();
    const notify = useToast();
    const [state, setState] = useState<{ readonly id: string; readonly info: IContactInfo | null; readonly error: string | null } | null>(null);
    const [round, setRound] = useState(0);
    const valid = SNOWFLAKE.test(value);
    // Die Seite gibt bei jedem Rendern eine neue Funktion; die Prüfung soll deshalb nicht neu starten.
    const report = useRef(onInfo);

    useEffect(() => {
        report.current = onInfo;
    });

    useEffect(() => {
        if (!valid) {
            report.current?.(null);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api<IContactInfo>(`/api/partners/contact/${value}`, { signal: controller.signal })
                .then((info) => {
                    setState({ id: value, info, error: null });
                    report.current?.(info);
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return;

                    setState({ id: value, info: null, error: error instanceof ApiError ? error.message : "Die Prüfung ging nicht." });
                    report.current?.(null);
                });
        }, 350);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [value, valid, round]);

    const current = state?.id === value ? state : null;
    const info = current?.info ?? null;
    const name = info?.user?.name ?? value;
    const hint = info ? groupHint(`@${name}`, info.group) : null;

    const copyInvite = (): void => {
        if (!info?.invite) return;

        void navigator.clipboard?.writeText(info.invite).then(
            () => notify("Einladung kopiert."),
            () => notify("Kopieren ging nicht.", "danger")
        );
    };

    return (
        <div className={styles.contact}>
            <Field id={`${id}-contact`} label={label} hint="Freiwillig. Die Discord-ID findest du mit Rechtsklick auf das Profil." error={value && !valid ? "Eine Discord-ID besteht aus 17 bis 20 Ziffern." : current?.error ?? undefined}>
                <input id={`${id}-contact`} inputMode="numeric" autoComplete="off" value={value} maxLength={20} onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))} />
            </Field>

            {!value && <p className={styles.muted}>Niemand gewählt: nur auf der Webseite, keine Rolle, kein Zugang.</p>}

            {valid && !current && <p className={styles.muted}>Wird geprüft …</p>}

            {info && (
                <>
                    <div className={styles.person}>
                        {info.user?.avatar ? <img src={info.user.avatar} alt="" width={36} height={36} /> : <span className={styles.personMark} aria-hidden="true" />}
                        <div>
                            <b>{info.user?.name ?? "Unbekanntes Konto"}</b>
                            <small>
                                {info.servers.length === 0 ? "Kein Server mit RL Nexus" : info.servers.length === 1 ? "1 Server mit RL Nexus" : `${info.servers.length} Server mit RL Nexus`}
                            </small>
                        </div>
                    </div>
                    {hint && <p className={styles.muted}>{hint}</p>}

                    <div className={styles.roleBox} role="status">
                        <b className={styles.roleName}>@Partner</b>
                        <p className={info.member ? styles.good : styles.waiting}>
                            {info.member ? `✓ @${name} ist auf dem RL-Nexus-Server` : `@${name} ist noch nicht auf dem RL-Nexus-Server. Die Rolle kommt automatisch, sobald er beitritt.`}
                        </p>
                        <p className={info.assignable.canAssign ? styles.good : styles.bad}>
                            {info.assignable.canAssign ? "✓ Der Bot darf die Rolle vergeben" : `Der Bot darf die Rolle nicht vergeben: ${info.assignable.reason ?? "Grund unbekannt"}. Gespeichert wird trotzdem.`}
                        </p>
                        <div className={styles.roleActions}>
                            {!info.member && info.invite && (
                                <Button size="sm" variant="ghost" onClick={copyInvite}>
                                    Einladung kopieren
                                </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setRound((count) => count + 1)}>
                                Erneut prüfen
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
