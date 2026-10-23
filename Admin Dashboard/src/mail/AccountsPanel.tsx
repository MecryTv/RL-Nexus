import { useState, type FormEvent, type JSX } from "react";
import type { IMailAccount, IMailAccountList, IMailServerInfo } from "../../shared/api";
import { MAIL_LIMITS } from "../../shared/limits";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { useToast } from "../toast/context";
import styles from "./mail.module.scss";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** So schickt das Formular die Server: leer heißt „nimm den Vorschlag“. */
interface IServers {
    readonly imapHost: string;
    readonly imapPort: string;
    readonly smtpHost: string;
    readonly smtpPort: string;
}

const NO_SERVERS: IServers = { imapHost: "", imapPort: "", smtpHost: "", smtpPort: "" };

function serversOf(imap: IMailServerInfo, smtp: IMailServerInfo): IServers {
    return { imapHost: imap.host, imapPort: String(imap.port), smtpHost: smtp.host, smtpPort: String(smtp.port) };
}

/**
 * IMAP und SMTP mit Port, zugeklappt. Bei Mailcow stimmt der Vorschlag fast
 * immer, deshalb steht er in der Zusammenfassung und als Platzhalter.
 */
function ServerFields({
    id,
    value,
    suggested,
    onChange,
}: {
    readonly id: string;
    readonly value: IServers;
    readonly suggested: IServers;
    readonly onChange: (next: IServers) => void;
}): JSX.Element {
    const shown = (key: keyof IServers): string => value[key] || suggested[key];

    return (
        <details className={styles.servers}>
            <summary>
                Server: {shown("imapHost") || "mail.<Domain>"} · IMAP {shown("imapPort")} · SMTP {shown("smtpPort")}
            </summary>
            {(["imap", "smtp"] as const).map((kind) => (
                <div key={kind} className={styles.serverRow}>
                    <Field id={`${id}-${kind}-host`} label={`${kind.toUpperCase()}-Server`}>
                        <input
                            id={`${id}-${kind}-host`}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={suggested[`${kind}Host`] || "mail.nexus-emb.de"}
                            value={value[`${kind}Host`]}
                            onChange={(event) => onChange({ ...value, [`${kind}Host`]: event.target.value })}
                        />
                    </Field>
                    <Field id={`${id}-${kind}-port`} label="Port">
                        <input
                            id={`${id}-${kind}-port`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={65535}
                            placeholder={suggested[`${kind}Port`]}
                            value={value[`${kind}Port`]}
                            onChange={(event) => onChange({ ...value, [`${kind}Port`]: event.target.value })}
                        />
                    </Field>
                </div>
            ))}
            <p className={styles.hint}>IMAP 993 und SMTP 465 laufen verschlüsselt (SSL/TLS), SMTP 587 per STARTTLS.</p>
        </details>
    );
}

/** Ein Postfach umbenennen, sein Passwort ersetzen oder die Server ändern. */
function AccountEditor({ account, onDone }: { readonly account: IMailAccount; readonly onDone: () => void }): JSX.Element {
    const notify = useToast();
    const current = serversOf(account.imap, account.smtp);
    const [label, setLabel] = useState(account.label);
    const [password, setPassword] = useState("");
    const [servers, setServers] = useState(current);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        setError(null);

        try {
            await api(`/api/mail/accounts/${account.id}`, { method: "PATCH", body: { label, password, ...servers } });
            const moved = (Object.keys(current) as (keyof IServers)[]).some((key) => (servers[key] || current[key]) !== current[key]);
            notify(password || moved ? "Gespeichert, die Anmeldung hat geklappt" : "Gespeichert");
            onDone();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className={styles.form} onSubmit={(event) => void save(event)}>
            <Field id={`label-${account.id}`} label="Name im Kopf der Mail" counter={{ value: label.length, max: MAIL_LIMITS.label }}>
                <input id={`label-${account.id}`} type="text" value={label} maxLength={MAIL_LIMITS.label} onChange={(event) => setLabel(event.target.value)} />
            </Field>
            <Field id={`pw-${account.id}`} label="Neues Passwort" hint="Leer lassen, um das bisherige zu behalten.">
                <input id={`pw-${account.id}`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <ServerFields id={`server-${account.id}`} value={servers} suggested={current} onChange={setServers} />
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <div className={styles.actions}>
                <Button type="submit" variant="primary" size="sm" busy={busy}>
                    Speichern
                </Button>
                <Button size="sm" variant="ghost" onClick={onDone}>
                    Abbrechen
                </Button>
            </div>
        </form>
    );
}

/**
 * Postfächer eintragen, nur für Developer: Adresse, Passwort, notfalls Server.
 *
 * Vor dem Speichern meldet sich der Server einmal bei IMAP und SMTP an und
 * sagt, woran es hakt. Erst dann landet das Postfach in der Datenbank.
 */
export function AccountsPanel({ open, onClose, onChanged }: { readonly open: boolean; readonly onClose: () => void; readonly onChanged: () => void }): JSX.Element {
    const notify = useToast();
    const list = useApi<IMailAccountList>("/api/mail/accounts");
    const [address, setAddress] = useState("");
    const [label, setLabel] = useState("");
    const [password, setPassword] = useState("");
    const [servers, setServers] = useState(NO_SERVERS);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const [removing, setRemoving] = useState<IMailAccount | null>(null);

    function changed(): void {
        list.reload();
        onChanged();
    }

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        setError(null);

        try {
            await api("/api/mail/accounts", { method: "POST", body: { address, label, password, ...servers } });
            notify(`${address} ist eingetragen`);
            setAddress("");
            setLabel("");
            setPassword("");
            setServers(NO_SERVERS);
            changed();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    }

    async function move(accounts: readonly IMailAccount[], index: number, step: -1 | 1): Promise<void> {
        const order = accounts.map((entry) => entry.id);
        [order[index], order[index + step]] = [order[index + step], order[index]];

        try {
            await api("/api/mail/accounts/order", { method: "PUT", body: { ids: order } });
            changed();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        }
    }

    async function remove(account: IMailAccount): Promise<void> {
        try {
            await api(`/api/mail/accounts/${account.id}`, { method: "DELETE" });
            notify(`${account.address} ist entfernt`);
            changed();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setRemoving(null);
        }
    }

    const accounts = list.data?.accounts ?? [];
    // Vorschlag wie auf dem Server: aus der Umgebung, sonst mail.<Domain der Adresse>.
    const domain = address.includes("@") ? address.split("@")[1].trim().toLowerCase() : "";
    const defaults = list.data?.defaults;
    const suggested: IServers = {
        imapHost: defaults?.imap.host ?? (domain ? `mail.${domain}` : ""),
        imapPort: String(defaults?.imap.port ?? 993),
        smtpHost: defaults?.smtp.host ?? (domain ? `mail.${domain}` : ""),
        smtpPort: String(defaults?.smtp.port ?? 465),
    };

    return (
        <SidePanel open={open} title="Postfächer verwalten" onClose={onClose}>
            {list.error && !list.data ? (
                <Failure message={list.error.message} onRetry={list.reload} />
            ) : !list.data ? (
                <Loading label="Postfächer werden geladen" />
            ) : (
                <div className={styles.form}>
                    {accounts.length > 0 && (
                        <ul className={styles.accounts}>
                            {accounts.map((account, index) => (
                                <li key={account.id} className={styles.account}>
                                    <div className={styles.accountHead}>
                                        <div>
                                            <strong>{account.label}</strong>
                                            <div className={styles.hint}>
                                                {account.address} · {account.imap.host}
                                            </div>
                                        </div>
                                        <div className={styles.accountTools}>
                                            <Button size="sm" variant="ghost" icon="chevron-up" disabled={index === 0} onClick={() => void move(accounts, index, -1)} aria-label={`${account.label} nach oben`}>
                                                <span className="u-sr">Nach oben</span>
                                            </Button>
                                            <Button size="sm" variant="ghost" icon="chevron-down" disabled={index === accounts.length - 1} onClick={() => void move(accounts, index, 1)} aria-label={`${account.label} nach unten`}>
                                                <span className="u-sr">Nach unten</span>
                                            </Button>
                                        </div>
                                    </div>
                                    {editing === account.id ? (
                                        <AccountEditor
                                            account={account}
                                            onDone={() => {
                                                setEditing(null);
                                                changed();
                                            }}
                                        />
                                    ) : (
                                        <div className={styles.actions}>
                                            <Button size="sm" icon="pencil" onClick={() => setEditing(account.id)}>
                                                Ändern
                                            </Button>
                                            <Button size="sm" variant="danger" icon="trash" onClick={() => setRemoving(account)}>
                                                Entfernen
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <form className={styles.form} onSubmit={(event) => void add(event)}>
                        <h3 className={styles.blockTitle}>Postfach hinzufügen</h3>
                        <p className={styles.hint}>
                            Adresse und Passwort des Postfachs reichen meist. Sicherer ist ein App-Passwort aus Mailcow mit IMAP und SMTP. Gespeichert wird es verschlüsselt und kommt nie wieder in den Browser.
                        </p>
                        <Field id="postfach-adresse" label="Adresse">
                            <input id="postfach-adresse" type="email" autoComplete="off" placeholder="support@nexus-emb.de" value={address} onChange={(event) => setAddress(event.target.value)} required />
                        </Field>
                        <Field id="postfach-name" label="Name im Kopf der Mail" hint="Etwa „Support“ oder „Partner“." counter={{ value: label.length, max: MAIL_LIMITS.label }}>
                            <input id="postfach-name" type="text" maxLength={MAIL_LIMITS.label} value={label} onChange={(event) => setLabel(event.target.value)} required />
                        </Field>
                        <Field id="postfach-passwort" label="Passwort">
                            <input id="postfach-passwort" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                        </Field>
                        <ServerFields id="postfach" value={servers} suggested={suggested} onChange={setServers} />
                        {error && (
                            <p className={styles.error} role="alert">
                                {error}
                            </p>
                        )}
                        <div>
                            <Button type="submit" variant="primary" icon="plus" busy={busy}>
                                Anmelden und hinzufügen
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <ConfirmDialog
                open={removing !== null}
                title="Postfach entfernen?"
                confirmLabel="Entfernen"
                tone="danger"
                onConfirm={() => removing && void remove(removing)}
                onCancel={() => setRemoving(null)}
            >
                <p>{removing?.address} verschwindet aus dem Admin Dashboard. In Mailcow bleiben Postfach und Mails, wie sie sind.</p>
            </ConfirmDialog>
        </SidePanel>
    );
}
