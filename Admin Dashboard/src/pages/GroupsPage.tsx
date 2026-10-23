import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IGroupEntry, IGroupEvent, IGroupList, IUserRef } from "../../shared/api";
import { GROUPS, GROUP_GRANTS, GROUP_LABELS, NOTE_MAX, SNOWFLAKE, type Group } from "../../shared/limits";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { UserChip } from "../components/UserChip";
import { formatDate, formatDateTime, formatNumber } from "../format";
import { useMe } from "../session/context";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./GroupsPage.module.scss";

const GROUP_TONE: Readonly<Record<Group, BadgeTone>> = { administrator: "pro", partner: "info", premium: "warn" };
const ID_ERROR = "Eine Discord-ID besteht aus 17 bis 20 Ziffern.";
const ID_HINT = "In Discord Rechtsklick auf die Person, dann „Nutzer-ID kopieren“. Dafür muss der Entwicklermodus an sein.";

/** Die Karten in der Rangfolge des Bots (DashboardService.GroupOf): wer weiter oben steht, gewinnt. */
const CARDS = ["administrator", "developer", "partner", "premium"] as const;
type Card = (typeof CARDS)[number];

const CARD_COLORS: Readonly<Record<Card, string>> = {
    administrator: "var(--c-red-bright)",
    developer: "var(--c-mod-moderation)",
    partner: "var(--c-blue)",
    premium: "var(--c-mod-engagement)",
};

const CARD_LABELS: Readonly<Record<Card, string>> = { ...GROUP_LABELS, developer: "Developer" };

const FILTERS = [{ value: "alle", label: "Alle" }, ...CARDS.map((value) => ({ value, label: CARD_LABELS[value] }))] as const;
type Filter = "alle" | Card;

/** Bis hierhin steht eine Karte offen da, darüber klappt sie zu. */
const VISIBLE = 5;

function isGroup(value: string): value is Group {
    return (GROUPS as readonly string[]).includes(value);
}

function nameOf(user: IUserRef): string {
    return user.name ?? user.id;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

interface IPreview {
    readonly id: string;
    readonly user: IUserRef | null;
    readonly message: string | null;
}

/** Name und Avatar zur eingetippten ID, kurz nach dem letzten Tastendruck geholt. */
function useUserPreview(userId: string): { readonly status: "idle" | "loading" | "done"; readonly user: IUserRef | null; readonly message: string | null } {
    const [preview, setPreview] = useState<IPreview | null>(null);
    const valid = SNOWFLAKE.test(userId);

    useEffect(() => {
        if (!valid) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api<IUserRef>(`/api/users/${userId}`, { signal: controller.signal })
                .then((user) => setPreview({ id: userId, user, message: null }))
                .catch((error: unknown) => {
                    if (!controller.signal.aborted) setPreview({ id: userId, user: null, message: messageOf(error) });
                });
        }, 350);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [userId, valid]);

    if (!valid) return { status: "idle", user: null, message: null };
    if (preview?.id !== userId) return { status: "loading", user: null, message: null };

    return { status: "done", user: preview.user, message: preview.message };
}

/** Eine Person auf einer Karte. `entry` fehlt bei Developern: die stehen nur in der .env. */
interface IMember {
    readonly user: IUserRef;
    readonly entry: IGroupEntry | null;
    /** „zählt als Administrator“ und Ähnliches, wenn eine andere Gruppe gewinnt. */
    readonly note: string | null;
}

function matches(member: IMember, needle: string): boolean {
    if (needle === "") return true;

    return [member.user.name ?? "", member.user.id, member.entry?.note ?? ""].some((value) => value.toLowerCase().includes(needle));
}

/** „mecry hat rocketbob Premium gegeben“. Die Gruppe steht im Protokoll vorn im Detail, etwa „partner: Notiz“. */
function eventText(event: IGroupEvent): string {
    const who = nameOf(event.user);

    if (event.kind === "revoke") return `${event.by} hat ${who} die Gruppe entzogen`;

    const group = (event.detail ?? "").split(":")[0];
    const label = isGroup(group) ? GROUP_LABELS[group] : group;

    return `${event.by} hat ${who} ${label} gegeben`;
}

function GroupCard({
    card,
    members,
    total,
    expanded,
    onToggle,
    onEdit,
    onRevoke,
}: {
    readonly card: Card;
    readonly members: readonly IMember[];
    /** Wie viele die Gruppe ohne Suche hat. */
    readonly total: number;
    readonly expanded: boolean;
    readonly onToggle: () => void;
    readonly onEdit: (entry: IGroupEntry) => void;
    readonly onRevoke: (entry: IGroupEntry) => void;
}): JSX.Element {
    const shown = expanded ? members : members.slice(0, VISIBLE);
    const titleId = `gruppe-${card}`;

    return (
        <section className={styles.card} style={{ "--group": CARD_COLORS[card] } as CSSProperties} aria-labelledby={titleId}>
            <header className={styles.cardHead}>
                <h2 id={titleId} className={styles.cardTitle}>
                    <span className={styles.dot} aria-hidden="true" />
                    {CARD_LABELS[card]}
                    {card === "developer" && <span className={styles.source}>aus DEV_USER_IDs</span>}
                </h2>
                <span className={styles.count} aria-label={`${total} ${total === 1 ? "Person" : "Personen"}`}>
                    {formatNumber(total)}
                </span>
            </header>
            <p className={styles.grants}>{GROUP_GRANTS[card]}</p>

            {members.length === 0 ? (
                <p className={styles.none}>{total === 0 ? "Niemand in dieser Gruppe." : "Niemand passt zur Suche."}</p>
            ) : (
                <ul className={styles.members}>
                    {shown.map((member) => (
                        <li key={member.user.id} className={styles.member}>
                            <div className={styles.who}>
                                <UserChip user={member.user} plain />
                                <p className={styles.meta}>
                                    {member.entry
                                        ? `seit ${formatDate(member.entry.grantedAt)} · ${member.entry.grantedBy ? `von ${nameOf(member.entry.grantedBy)}` : "direkt in der Datenbank"}`
                                        : member.user.id}
                                    {member.entry?.note && <span className={styles.note}> · „{member.entry.note}“</span>}
                                </p>
                                {member.note && <p className={styles.wins}>{member.note}</p>}
                            </div>
                            {member.entry && (
                                <div className={styles.actions}>
                                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => member.entry && onEdit(member.entry)} aria-label={`${nameOf(member.user)}: Gruppe ändern`}>
                                        Ändern
                                    </Button>
                                    <Button size="sm" variant="ghost" icon="trash" onClick={() => member.entry && onRevoke(member.entry)} aria-label={`${nameOf(member.user)}: Gruppe entziehen`}>
                                        Entziehen
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {members.length > VISIBLE && (
                <button type="button" className={styles.more} onClick={onToggle} aria-expanded={expanded}>
                    {expanded ? "Weniger zeigen" : `${members.length - VISIBLE} weitere zeigen`}
                    <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} />
                </button>
            )}
        </section>
    );
}

export function GroupsPage(): JSX.Element {
    useTitle("Gruppen");

    const notify = useToast();
    const me = useMe();
    const { data, error, reload } = useApi<IGroupList>("/api/groups");
    const [formOpen, setFormOpen] = useState(false);
    const [userId, setUserId] = useState("");
    const [group, setGroup] = useState<Group>("partner");
    const [note, setNote] = useState("");
    const [idError, setIdError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [replacing, setReplacing] = useState<IGroupEntry | null>(null);
    const [revoking, setRevoking] = useState<IGroupEntry | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("alle");
    const [expanded, setExpanded] = useState<ReadonlySet<Card>>(new Set());
    const idInput = useRef<HTMLInputElement>(null);
    const preview = useUserPreview(userId);

    useLive("groups", reload);

    const existing = data?.entries.find((entry) => entry.user.id === userId) ?? null;
    const needle = search.trim().toLowerCase();

    // Öffnet das Formular und setzt den Fokus, sobald es steht.
    useEffect(() => {
        if (formOpen) idInput.current?.focus();
    }, [formOpen]);

    function openForm(entry: IGroupEntry | null): void {
        setUserId(entry?.user.id ?? "");
        setGroup(entry?.group ?? "partner");
        setNote(entry?.note ?? "");
        setIdError(null);
        setFormOpen(true);

        // Steht das Formular schon, holt das hier den Fokus. Sonst macht es der Effekt oben, sobald es da ist.
        idInput.current?.focus();
        idInput.current?.scrollIntoView({ block: "center" });
    }

    // Rückfragen gehen danach in jedem Fall zu: ein Fehler-Hinweis läge sonst
    // unsichtbar hinter dem abgedunkelten Hintergrund des Dialogs.
    async function save(): Promise<void> {
        setSaving(true);

        try {
            await api(`/api/groups/${userId}`, { method: "PUT", body: { group, note } });
            notify(`${preview.user?.name ?? userId} hat jetzt die Gruppe ${GROUP_LABELS[group]}.`);
            setUserId("");
            setNote("");
            setFormOpen(false);
            reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setSaving(false);
            setReplacing(null);
        }
    }

    async function revoke(entry: IGroupEntry): Promise<void> {
        setSaving(true);

        try {
            await api(`/api/groups/${entry.user.id}`, { method: "DELETE" });
            notify(`${nameOf(entry.user)} hat keine Gruppe mehr.`);
            reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setSaving(false);
            setRevoking(null);
        }
    }

    function submit(event: FormEvent): void {
        event.preventDefault();

        if (!SNOWFLAKE.test(userId)) {
            setIdError(ID_ERROR);
            idInput.current?.focus();
            return;
        }

        if (existing) setReplacing(existing);
        else void save();
    }

    function toggle(card: Card): void {
        setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(card)) next.add(card);
            return next;
        });
    }

    // Wer in welcher Karte steht. Gewinnt eine höhere Gruppe, steht das dabei.
    const developerIds = new Set(data?.developers.map((user) => user.id) ?? []);
    const adminIds = new Set(data?.entries.filter((entry) => entry.group === "administrator").map((entry) => entry.user.id) ?? []);

    const membersOf = (card: Card): IMember[] => {
        if (!data) return [];

        if (card === "developer") {
            return data.developers.map((user) => ({ user, entry: null, note: adminIds.has(user.id) ? "Zählt als Administrator, die Gruppe steht darüber." : null }));
        }

        return data.entries
            .filter((entry) => entry.group === card)
            .map((entry) => ({
                user: entry.user,
                entry,
                note: card !== "administrator" && developerIds.has(entry.user.id) ? "Zählt als Developer, das steht darüber." : null,
            }));
    };

    const people = new Set([...(data?.entries.map((entry) => entry.user.id) ?? []), ...developerIds]).size;
    const cards = CARDS.filter((card) => filter === "alle" || filter === card);

    return (
        <>
            <PageHeader title="Gruppen" meta={data ? `${formatNumber(people)} ${people === 1 ? "Person" : "Personen"} mit Gruppe. Gilt im Bot-Dashboard, Änderungen greifen dort nach spätestens einer Minute.` : undefined}>
                <Button variant="primary" icon="plus" onClick={() => (formOpen ? setFormOpen(false) : openForm(null))} aria-expanded={formOpen} aria-controls="gruppe-formular">
                    {formOpen ? "Formular schließen" : "Gruppe vergeben"}
                </Button>
            </PageHeader>

            {formOpen && (
                <Panel className={styles.formPanel}>
                    <h2 className={styles.heading} id="gruppe-formular">
                        {existing ? "Gruppe ändern" : "Gruppe vergeben"}
                    </h2>

                    <form className={styles.form} onSubmit={submit} noValidate>
                        <div className={styles.idBlock}>
                            <Field id="gruppe-id" label="Discord-ID" hint={ID_HINT} error={idError ?? undefined}>
                                <input
                                    ref={idInput}
                                    id="gruppe-id"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="123456789012345678"
                                    value={userId}
                                    onChange={(event) => {
                                        setUserId(event.target.value.trim());
                                        setIdError(null);
                                    }}
                                    onBlur={() => setIdError(userId && !SNOWFLAKE.test(userId) ? ID_ERROR : null)}
                                    aria-invalid={idError ? true : undefined}
                                    aria-describedby={idError ? "gruppe-id-error" : "gruppe-id-hint"}
                                />
                            </Field>

                            {/* Bleibt immer im Baum: eine Live-Region, die erst erscheint, sagt niemand an. */}
                            <div className={styles.preview} aria-live="polite">
                                {preview.status === "loading" && <p className={styles.searching}>Suche bei Discord</p>}
                                {preview.status === "done" && preview.user && <UserChip user={preview.user} />}
                                {preview.status === "done" && !preview.user && <p className={styles.unknown}>{preview.message}</p>}
                                {existing && (
                                    <p className={styles.current}>
                                        Hat schon die Gruppe <Badge tone={GROUP_TONE[existing.group]}>{GROUP_LABELS[existing.group]}</Badge>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <Field id="gruppe-wahl" label="Gruppe">
                                <select
                                    id="gruppe-wahl"
                                    value={group}
                                    onChange={(event) => {
                                        if (isGroup(event.target.value)) setGroup(event.target.value);
                                    }}
                                >
                                    {GROUPS.map((value) => (
                                        <option key={value} value={value}>
                                            {GROUP_LABELS[value]}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field id="gruppe-notiz" label="Notiz" hint="Optional und nur hier sichtbar, etwa „Frühbucher“." counter={{ value: note.length, max: NOTE_MAX }}>
                                <input id="gruppe-notiz" type="text" maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} aria-describedby="gruppe-notiz-hint" />
                            </Field>
                        </div>

                        <p className={styles.grantHint}>{GROUP_GRANTS[group]}</p>

                        <div className={styles.formActions}>
                            <Button type="submit" variant="primary" icon="users" busy={saving && replacing === null && revoking === null}>
                                {existing ? "Gruppe ändern" : "Gruppe vergeben"}
                            </Button>
                            <Button variant="ghost" onClick={() => setFormOpen(false)}>
                                Abbrechen
                            </Button>
                        </div>
                    </form>
                </Panel>
            )}

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Gruppen werden geladen" />
            ) : (
                <>
                    <div className={styles.toolbar}>
                        <div className={styles.search}>
                            <Field id="gruppe-suche" label="Suchen">
                                <input id="gruppe-suche" type="search" placeholder="Name, ID oder Notiz" value={search} onChange={(event) => setSearch(event.target.value)} />
                            </Field>
                        </div>
                        <Segmented name="gruppe-filter" legend="Gruppe" options={FILTERS} value={filter} onChange={setFilter} />
                    </div>

                    <div className={styles.grid}>
                        {cards.map((card) => {
                            const all = membersOf(card);

                            return (
                                <GroupCard
                                    key={card}
                                    card={card}
                                    members={all.filter((member) => matches(member, needle))}
                                    total={all.length}
                                    expanded={expanded.has(card) || needle !== ""}
                                    onToggle={() => toggle(card)}
                                    onEdit={openForm}
                                    onRevoke={setRevoking}
                                />
                            );
                        })}
                    </div>

                    {filter === "alle" && needle === "" && (
                        <div className={styles.derived}>
                            <p>
                                <strong>Guardian</strong>
                                {GROUP_GRANTS.guardian} Ergibt sich von selbst, vergeben lässt es sich nicht.
                            </p>
                            <p>
                                <strong>Free</strong>
                                Alle ohne Gruppe, solange Free Access gilt. {GROUP_GRANTS.free}
                            </p>
                            <p>
                                <strong>Testphase</strong>
                                Bei Paid Access, wer gerade testet. {GROUP_GRANTS.testphase}
                            </p>
                            <p>
                                <strong>Beta</strong>
                                Im Beta-Modus alle mit eingelöstem Code. {GROUP_GRANTS.beta} Codes und Tester unter <Link to="/beta">Beta Access</Link>.
                            </p>
                        </div>
                    )}

                    <section className={styles.history} aria-labelledby="gruppen-verlauf">
                        <div className={styles.historyHead}>
                            <h2 id="gruppen-verlauf" className={styles.heading}>
                                Verlauf
                            </h2>
                            {me.role === "developer" && (
                                <Link to="/dev/protokoll?aktion=group.grant" className={styles.link}>
                                    Ganzes Protokoll <Icon name="arrow-right" size={14} />
                                </Link>
                            )}
                        </div>

                        {data.history.length === 0 ? (
                            <p className={styles.none}>Noch keine Änderung aus dem Admin Dashboard.</p>
                        ) : (
                            <ol className={styles.events}>
                                {data.history.map((event) => (
                                    <li key={event.id}>
                                        <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                                        <span>
                                            {eventText(event)}
                                            {event.kind === "grant" && event.detail?.includes(":") && <span className={styles.note}> · „{event.detail.slice(event.detail.indexOf(":") + 1).trim()}“</span>}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </>
            )}

            <ConfirmDialog
                open={replacing !== null}
                title="Gruppe ändern?"
                confirmLabel="Ändern"
                busy={saving}
                onConfirm={() => void save()}
                onCancel={() => setReplacing(null)}
            >
                {replacing && (
                    <p>
                        {nameOf(replacing.user)} hat die Gruppe {GROUP_LABELS[replacing.group]}
                        {replacing.note ? ` mit der Notiz „${replacing.note}“` : ""}. Danach gilt {GROUP_LABELS[group]}
                        {note.trim() ? ` mit der Notiz „${note.trim()}“` : " ohne Notiz"}.
                    </p>
                )}
            </ConfirmDialog>

            <ConfirmDialog
                open={revoking !== null}
                title="Gruppe entziehen?"
                confirmLabel="Entziehen"
                tone="danger"
                busy={saving}
                onConfirm={() => {
                    if (revoking) void revoke(revoking);
                }}
                onCancel={() => setRevoking(null)}
            >
                {revoking && (
                    <p>
                        {nameOf(revoking.user)} verliert die Gruppe {GROUP_LABELS[revoking.group]}. Im Bot-Dashboard greift das nach spätestens einer
                        Minute.
                    </p>
                )}
            </ConfirmDialog>
        </>
    );
}
