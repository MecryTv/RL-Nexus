import { type JSX, useId, useState } from "react";
import type { IEntry, IEntryInput, IRoleState } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { useToast } from "../toast/context";
import { ContactField, type IContactInfo } from "./ContactField";
import { ROLE_LABELS } from "./labels.ts";
import styles from "./studio.module.scss";

const at = (iso: string): string => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));

export interface IAccountTabProps {
    readonly value: IEntryInput;
    readonly set: (next: IEntryInput, key?: string) => void;
    readonly entry: IEntry;
    readonly dirty: boolean;
    readonly saving: boolean;
    readonly problem: string | null;
    readonly onSave: () => void;
    readonly onChanged: () => void;
}

/**
 * W-0062 Teil 2: „Konto, Zugang und Rolle“ (S4) im gewohnten Design. Der
 * Ansprechpartner und der Zugang gehören zum Entwurf und werden mit
 * „Speichern“ gespeichert; „Erneut prüfen“ und „Partner-Gruppe entfernen“
 * wirken sofort.
 */
export function AccountTab({ value, set, entry, dirty, saving, problem, onSave, onChanged }: IAccountTabProps): JSX.Element {
    const id = useId();
    const notify = useToast();
    const [info, setInfo] = useState<IContactInfo | null>(null);
    const [checking, setChecking] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [role, setRole] = useState<IRoleState | null>(entry.role);

    const recheck = async (): Promise<void> => {
        setChecking(true);

        try {
            const next = await api<IRoleState>(`/api/partners/${entry.id}/role`, { method: "POST" });

            setRole(next);
            notify(next.state === "given" ? "@Partner ist vergeben." : `@Partner: ${ROLE_LABELS[next.state]}${next.note ? ` – ${next.note}` : ""}`, next.state === "missing" ? "danger" : "ok");
            onChanged();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Die Prüfung ging nicht.", "danger");
        } finally {
            setChecking(false);
        }
    };

    const removeGroup = async (): Promise<void> => {
        if (!entry.contactId) return;

        setChecking(true);

        try {
            await api(`/api/groups/${entry.contactId}`, { method: "DELETE" });
            notify("Gruppe Partner und @Partner sind weg. Der Eintrag auf der Webseite bleibt.");
            onChanged();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Entfernen ging nicht.", "danger");
        } finally {
            setChecking(false);
            setRemoving(false);
        }
    };

    const changed = value.contactId !== entry.contactId;

    return (
        <div className={styles.account}>
            <Panel className={styles.accountPanel}>
                <h2 className={styles.panelTitle}>Ansprechpartner</h2>
                <ContactField
                    value={value.contactId ?? ""}
                    onInfo={setInfo}
                    onChange={(contactId) =>
                        set(
                            {
                                ...value,
                                contactId: contactId || null,
                                access: contactId ? (value.access ?? "free") : null,
                                // Der Server gehört zum Ansprechpartner: Mit einem anderen fällt er weg.
                                guildId: contactId === entry.contactId ? value.guildId : null,
                            },
                            "contact"
                        )
                    }
                />
                {value.contactId && (
                    <Segmented
                        name={`${id}-zugang`}
                        legend="Zugang zum Bot-Dashboard"
                        options={[
                            { value: "free", label: "Free Access", title: "Ohne Kauf, solange Partner." },
                            { value: "paid", label: "Paid Access", title: "Braucht ein Abo wie alle." },
                        ]}
                        value={value.access ?? "free"}
                        onChange={(access) => set({ ...value, access })}
                    />
                )}
                <div className={styles.accountSave}>
                    {problem && dirty && <span className={styles.problem}>{problem}</span>}
                    <Button variant="primary" busy={saving} disabled={!dirty || problem !== null} onClick={onSave}>
                        Speichern
                    </Button>
                </div>
            </Panel>

            {entry.contactId && (
                <Panel className={styles.accountPanel}>
                    <h2 className={styles.panelTitle}>Rolle auf RL Nexus</h2>
                    <p>
                        <b className={styles.roleName}>@Partner</b> · {role ? ROLE_LABELS[role.state] : "ohne Konto"}
                        {role?.state === "given" && role.since ? ` am ${at(role.since)}` : ""}
                    </p>
                    {role?.note && <p className={styles.muted}>{role.note}</p>}
                    {changed && <p className={styles.muted}>Der neue Ansprechpartner gilt erst nach dem Speichern.</p>}
                    {info && !changed && <p className={styles.muted}>{info.member ? "Ist auf dem RL-Nexus-Server." : "Ist noch nicht auf dem RL-Nexus-Server; die Rolle kommt beim Beitritt."}</p>}
                    <div className={styles.roleActions}>
                        <Button variant="outline" busy={checking} onClick={() => void recheck()}>
                            Erneut prüfen
                        </Button>
                        <Button variant="danger" disabled={checking} onClick={() => setRemoving(true)}>
                            Partner-Gruppe entfernen
                        </Button>
                    </div>
                    <p className={styles.muted}>„Partner-Gruppe entfernen“ nimmt Zugang und Rolle. Der Eintrag auf der Webseite bleibt, bis du ihn versteckst oder löschst.</p>
                </Panel>
            )}

            <ConfirmDialog open={removing} title="Partner-Gruppe entfernen?" confirmLabel="Entfernen" tone="danger" busy={checking} onConfirm={() => void removeGroup()} onCancel={() => setRemoving(false)}>
                <p>Der Ansprechpartner verliert die Gruppe Partner, den Zugang zum Bot-Dashboard und @Partner. Administrator oder Premium hat er dann nicht automatisch.</p>
            </ConfirmDialog>
        </div>
    );
}

/** W-0062 Teil 2: Protokoll eines Eintrags (wer hat wann was geändert, Rolle vergeben und genommen). */
export function ProtocolTab({ entry }: { readonly entry: IEntry }): JSX.Element {
    const log = useApi<{ readonly events: readonly { readonly id: number; readonly label: string; readonly by: string; readonly detail: string | null; readonly at: string }[] }>(`/api/partners/${entry.id}/protokoll`);

    if (!log.data) return <p className={styles.muted}>{log.error ? log.error.message : "Wird geladen …"}</p>;
    if (log.data.events.length === 0) return <p className={styles.muted}>Noch nichts passiert.</p>;

    return (
        <ol className={styles.protocol}>
            {log.data.events.map((event) => (
                <li key={event.id}>
                    <time dateTime={event.at}>{at(event.at)}</time>
                    <b>{event.label}</b>
                    <span>
                        {event.by}
                        {event.detail ? ` · ${event.detail}` : ""}
                    </span>
                </li>
            ))}
        </ol>
    );
}
