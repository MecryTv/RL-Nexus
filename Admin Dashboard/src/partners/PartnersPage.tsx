import { type DragEvent, type JSX, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { IUserRef } from "../../shared/api";
import type { IPost } from "../../shared/news";
import type { EntryKind, IEntry } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { moveTo } from "../editor/list";
import { useToast } from "../toast/context";
import { CreateEntryDialog } from "./CreateEntryDialog";
import { CreateSupporterDialog } from "./CreateSupporterDialog";
import { ROLE_LABELS, typeLabel } from "./labels.ts";
import styles from "./partners.module.scss";

type Tab = EntryKind | "versteckt";

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: "partner", label: "Partner" },
    { id: "sponsor", label: "Sponsoren" },
    { id: "supporter", label: "Unterstützer" },
    { id: "versteckt", label: "Versteckt" },
];

const initials = (name: string): string =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]!.toUpperCase())
        .join("");

/** Namen der Ansprechpartner, einmal je ID geholt. */
function useNames(ids: readonly string[]): ReadonlyMap<string, string> {
    const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
    const asked = useRef(new Set<string>());
    const key = [...new Set(ids)].sort().join(",");

    useEffect(() => {
        const missing = key ? key.split(",").filter((id) => !asked.current.has(id)) : [];

        if (missing.length === 0) return;

        for (const id of missing) asked.current.add(id);

        void Promise.all(missing.map((id) => api<IUserRef>(`/api/users/${id}`).then((user) => [id, user.name ?? id] as const, () => [id, id] as const))).then((found) =>
            setNames((current) => new Map([...current, ...found]))
        );
    }, [key]);

    return names;
}

/** „Endet am …“ für Unterstützer mit Ende. */
const endLabel = (entry: IEntry): string | null => (entry.endsOn ? `Endet am ${entry.endsOn.split("-").reverse().join(".")}` : null);

/**
 * W-0062 Teil 2: Webseite › Partner/Sponsorings (L3). Was auf nexus-emb.de/partner
 * steht, wer Zugang hat und wer @Partner trägt. Ziehen sortiert je Art.
 */
export function PartnersPage(): JSX.Element {
    const list = useApi<{ readonly entries: readonly IEntry[]; readonly missingRoles: number }>("/api/partners");
    const news = useApi<{ readonly posts: readonly IPost[] }>("/api/news");
    const site = useApi<{ readonly url: string; readonly origin: string }>("/api/content/vorschau");
    const notify = useToast();
    const [tab, setTab] = useState<Tab>("partner");
    const [query, setQuery] = useState("");
    const [missingOnly, setMissingOnly] = useState(false);
    const [creating, setCreating] = useState(false);
    const [supporting, setSupporting] = useState(false);
    const [dragOrder, setDragOrder] = useState<readonly IEntry[] | null>(null);
    const [dragged, setDragged] = useState<number | null>(null);

    useLive("partners", list.reload);

    const entries = useMemo(() => list.data?.entries ?? [], [list.data]);
    const names = useNames(entries.flatMap((entry) => (entry.contactId ? [entry.contactId] : [])));
    const counts = {
        partner: entries.filter((entry) => entry.kind === "partner").length,
        sponsor: entries.filter((entry) => entry.kind === "sponsor").length,
        supporter: entries.filter((entry) => entry.kind === "supporter").length,
        versteckt: entries.filter((entry) => !entry.visible).length,
        free: entries.filter((entry) => entry.access === "free").length,
        paid: entries.filter((entry) => entry.access === "paid").length,
        given: entries.filter((entry) => entry.role?.state === "given").length,
        missing: entries.filter((entry) => entry.role?.state === "missing").length,
    };

    const inTab = (entry: IEntry): boolean => (tab === "versteckt" ? !entry.visible : entry.kind === tab);
    const needle = query.trim().toLowerCase();
    const sorted = (dragOrder ?? entries.filter(inTab)).filter((entry) => inTab(entry));
    const shown = sorted.filter((entry) => (!missingOnly || entry.role?.state === "missing") && (!needle || entry.name.toLowerCase().includes(needle)));
    // Ziehen geht nur, wenn die ganze Art zu sehen ist.
    const sortable = tab !== "versteckt" && !missingOnly && !needle;

    const saveOrder = async (order: readonly IEntry[]): Promise<void> => {
        try {
            await api("/api/partners/order", { method: "PUT", body: { kind: tab, ids: order.map((entry) => entry.id) } });
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Die Reihenfolge ließ sich nicht speichern.", "danger");
        } finally {
            setDragOrder(null);
            list.reload();
        }
    };

    const moveKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        const to = index + step;

        if (step === 0 || to < 0 || to >= sorted.length) return;

        event.preventDefault();
        void saveOrder(moveTo([...sorted], index, to));
    };

    if (list.error && !list.data) return <Failure message={list.error.message} onRetry={list.reload} />;

    return (
        <>
            <PageHeader title="Partner/Sponsorings">
                <div className={styles.headActions}>
                    {site.data && (
                        <a className={styles.textLink} href={`${site.data.origin}/partner`} target="_blank" rel="noopener noreferrer">
                            Seite ansehen ↗
                        </a>
                    )}
                    <Button variant="outline" icon="plus" onClick={() => setSupporting(true)}>
                        Unterstützer hinzufügen
                    </Button>
                    <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                        Anlegen
                    </Button>
                </div>
            </PageHeader>

            {!list.data ? (
                <Loading label="Partner werden geladen" />
            ) : (
                <>
                    <dl className={styles.stats}>
                        <div>
                            <dt>Partner</dt>
                            <dd>{counts.partner}</dd>
                        </div>
                        <div>
                            <dt>Sponsoren</dt>
                            <dd>{counts.sponsor}</dd>
                        </div>
                        <div>
                            <dt>Unterstützer</dt>
                            <dd>{counts.supporter}</dd>
                        </div>
                        <div>
                            <dt>Free / Paid</dt>
                            <dd>
                                {counts.free} / {counts.paid}
                            </dd>
                        </div>
                        <div>
                            <dt>Rolle vergeben</dt>
                            <dd>{counts.given}</dd>
                        </div>
                        <div>
                            <dt>Rolle fehlt</dt>
                            <dd>
                                <button type="button" className={styles.missing} aria-pressed={missingOnly} disabled={counts.missing === 0 && !missingOnly} onClick={() => setMissingOnly((on) => !on)}>
                                    {counts.missing}
                                </button>
                            </dd>
                        </div>
                    </dl>

                    <div className={styles.toolbar}>
                        <div className={styles.tabs} role="tablist" aria-label="Art">
                            {TABS.map((item) => (
                                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={styles.tab} onClick={() => setTab(item.id)}>
                                    {item.label} <span>{counts[item.id]}</span>
                                </button>
                            ))}
                        </div>
                        <label className={styles.search}>
                            <Icon name="search" size={16} />
                            <span className="u-sr">Suchen</span>
                            <input type="search" placeholder="Suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
                        </label>
                    </div>

                    {shown.length === 0 ? (
                        <p className={styles.empty}>{entries.length === 0 ? "Noch niemand eingetragen. Leg den ersten Partner, Sponsor oder Unterstützer an." : "Hier ist niemand."}</p>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th aria-label="Reihenfolge" />
                                    <th>Name</th>
                                    <th>Art</th>
                                    <th>Ansprechpartner</th>
                                    <th>Zugang</th>
                                    <th>Rolle @Partner</th>
                                    <th>Seite</th>
                                    <th aria-label="Auf der Startseite">★</th>
                                    <th aria-label="Bearbeiten" />
                                </tr>
                            </thead>
                            <tbody
                                onDragOver={(event) => {
                                    if (dragged !== null) event.preventDefault();
                                }}
                            >
                                {shown.map((entry, index) => (
                                    <tr
                                        key={entry.id}
                                        className={dragged === index ? styles.dragging : undefined}
                                        onDragEnter={() => {
                                            if (dragged === null || dragged === index) return;
                                            setDragOrder(moveTo([...sorted], dragged, index));
                                            setDragged(index);
                                        }}
                                    >
                                        <td>
                                            {sortable && (
                                                <button
                                                    type="button"
                                                    className={styles.grip}
                                                    draggable
                                                    onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                                                        event.dataTransfer.effectAllowed = "move";
                                                        setDragOrder(sorted);
                                                        setDragged(index);
                                                    }}
                                                    onDragEnd={() => {
                                                        if (dragOrder) void saveOrder(dragOrder);
                                                        setDragged(null);
                                                    }}
                                                    onKeyDown={moveKey(index)}
                                                >
                                                    <Icon name="grip" size={16} />
                                                    <span className="u-sr">{entry.name} verschieben, Pfeiltasten hoch und runter</span>
                                                </button>
                                            )}
                                        </td>
                                        <td>
                                            <span className={styles.name}>
                                                <span className={styles.logo} data-color={entry.color} aria-hidden="true">
                                                    {entry.logo ? <img src={entry.logo} alt="" /> : initials(entry.name)}
                                                </span>
                                                {entry.name}
                                            </span>
                                        </td>
                                        <td>{typeLabel(entry)}</td>
                                        <td>{entry.contactId ? `@${names.get(entry.contactId) ?? entry.contactId}` : <span className={styles.muted}>ohne Konto</span>}</td>
                                        <td>{entry.access ? (entry.access === "free" ? "Free" : "Paid") : "–"}</td>
                                        <td>
                                            {entry.kind === "supporter" || !entry.role ? (
                                                "–"
                                            ) : (
                                                <span title={entry.role.note ?? undefined}>
                                                    <Badge tone={entry.role.state === "given" ? "ok" : entry.role.state === "missing" ? "warn" : "neutral"}>
                                                        {ROLE_LABELS[entry.role.state]}
                                                        {entry.role.state === "missing" && entry.role.note ? `: ${entry.role.note}` : ""}
                                                    </Badge>
                                                </span>
                                            )}
                                        </td>
                                        <td>{entry.visible ? (endLabel(entry) ?? "Sichtbar") : <span className={styles.muted}>Versteckt</span>}</td>
                                        <td>{entry.onHome ? "★" : "☆"}</td>
                                        <td>
                                            <Link className={styles.rowLink} to={`/webseite/partner/${entry.id}`}>
                                                Gestalten
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}

            <CreateEntryDialog open={creating} onClose={() => setCreating(false)} entries={entries} />
            <CreateSupporterDialog
                open={supporting}
                onClose={() => {
                    setSupporting(false);
                    list.reload();
                }}
                posts={news.data?.posts ?? []}
            />
        </>
    );
}
