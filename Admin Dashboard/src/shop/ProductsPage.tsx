import { useState, type DragEvent, type JSX, type KeyboardEvent } from "react";
import type { IGuildRole, IShopProduct, IShopProductList } from "../../shared/shop";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { moveTo } from "../editor/list";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { EMPTY_DRAFT, draftOf, inputOf, previewOf, type IProductDraft } from "./draft";
import { ProductCard } from "./ProductCard";
import { ProductForm } from "./ProductForm";
import styles from "./shop.module.scss";

interface IEditing {
    /** null: neues Produkt. */
    readonly id: number | null;
    readonly draft: IProductDraft;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Shop → Produkte (Entwurf B): die Karten wie auf der Webseite, Klick öffnet
 * rechts das Formular. Die Karte im Raster zeigt beim Tippen den Entwurf.
 * Gespeichert wird einzeln, jedes Speichern geht zu Stripe.
 */
export function ProductsPage(): JSX.Element {
    useTitle("Produkte");
    const notify = useToast();
    const list = useApi<IShopProductList>("/api/shop/products");
    const roleList = useApi<{ roles: IGuildRole[] }>("/api/shop/roles");
    useLive("shop", list.reload);

    const [editing, setEditing] = useState<IEditing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** Während des Ziehens die Reihenfolge auf dem Bildschirm, danach wieder die vom Server. */
    const [dragOrder, setDragOrder] = useState<readonly IShopProduct[] | null>(null);
    const [dragged, setDragged] = useState<number | null>(null);

    const roles = roleList.data?.roles ?? [];
    const roleOf = (roleId: string): IGuildRole | null => roles.find((role) => role.id === roleId) ?? null;
    const products = dragOrder ?? list.data?.products ?? [];
    const current = editing === null || editing.id === null ? null : (list.data?.products.find((product) => product.id === editing.id) ?? null);

    // Die Karten, die gerade bearbeitet werden, zeigen den Entwurf. Ein neues Produkt hängt hinten dran.
    const cards = products.map((product) => (editing !== null && product.id === editing.id ? previewOf(editing.draft, product) : product));
    const shown = editing !== null && editing.id === null ? [...cards, previewOf(editing.draft, null)] : cards;

    const open = (product: IShopProduct | null): void => {
        setError(null);
        // Ein neues Produkt startet ohne Rolle: Die muss jemand bewusst wählen.
        setEditing(product ? { id: product.id, draft: draftOf(product) } : { id: null, draft: EMPTY_DRAFT });
    };

    const save = async (): Promise<void> => {
        if (!editing) return;

        const parsed = inputOf(editing.draft);
        if ("error" in parsed) {
            setError(parsed.error);
            return;
        }

        setBusy(true);
        setError(null);

        try {
            if (editing.id === null) {
                await api("/api/shop/products", { method: "POST", body: parsed.input });
                notify(`„${parsed.input.title}“ ist angelegt, auch bei Stripe.`);
            } else {
                await api(`/api/shop/products/${editing.id}`, { method: "PUT", body: parsed.input });
                notify(`„${parsed.input.title}“ ist gespeichert.`);
            }

            setEditing(null);
            list.reload();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (): Promise<void> => {
        if (!editing || editing.id === null) return;

        setBusy(true);

        try {
            await api(`/api/shop/products/${editing.id}`, { method: "DELETE" });
            notify("Das Produkt ist gelöscht.");
            setEditing(null);
            list.reload();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    };

    const saveOrder = async (order: readonly IShopProduct[]): Promise<void> => {
        try {
            await api("/api/shop/products/order", { method: "PUT", body: { ids: order.map((product) => product.id) } });
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setDragOrder(null);
            list.reload();
        }
    };

    const moveKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
        const to = index + step;
        if (step === 0 || to < 0 || to >= products.length) return;

        event.preventDefault();
        void saveOrder(moveTo(products, index, to));
    };

    const grip = (product: IShopProduct, index: number): JSX.Element => (
        <button
            type="button"
            className={styles.grip}
            draggable
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                event.dataTransfer.effectAllowed = "move";
                setDragOrder(products);
                setDragged(index);
            }}
            onDragEnd={() => {
                if (dragOrder) void saveOrder(dragOrder);
                setDragged(null);
            }}
            onKeyDown={moveKey(index)}
        >
            <Icon name="grip" size={16} />
            <span className="u-sr">{product.title} verschieben, Pfeiltasten links und rechts</span>
        </button>
    );

    const visible = list.data?.products.filter((product) => product.visible).length ?? 0;
    const hidden = (list.data?.products.length ?? 0) - visible;

    return (
        <>
            <PageHeader title="Produkte" meta={list.data ? `${visible} sichtbar${hidden > 0 ? `, ${hidden} ausgeblendet` : ""}. Reihenfolge wie auf der Webseite.` : undefined}>
                <Button variant="primary" icon="plus" onClick={() => open(null)} disabled={!list.data?.stripeReady}>
                    Neues Produkt
                </Button>
            </PageHeader>

            {list.error && !list.data && <Failure message={list.error.message} onRetry={list.reload} />}
            {list.loading && <Loading label="Produkte werden geladen" />}

            {list.data && !list.data.stripeReady && (
                <Panel accent="var(--c-mod-engagement)" className={styles.notice}>
                    <p>
                        <b>Stripe ist nicht eingerichtet.</b> Ohne die Stripe-Schlüssel in der .env lassen sich keine Produkte speichern. Was wohin gehört, steht im
                        README unter „Shop“.
                    </p>
                </Panel>
            )}

            {list.data && list.data.mode !== "paid" && (
                <Panel accent={list.data.mode === "beta" ? "var(--c-purple)" : "var(--c-win)"} className={styles.notice}>
                    <p>
                        <b>{list.data.mode === "beta" ? "Beta Access gilt." : "Free Access gilt."}</b> Produkte gelten erst wieder bei Paid Access. Ändern geht
                        trotzdem, etwa um den Wechsel vorzubereiten.
                    </p>
                </Panel>
            )}

            {list.data && (
                <div
                    className={`${styles.grid} ${list.data.mode !== "paid" ? styles.greyed : ""}`}
                    onDragOver={(event) => {
                        if (dragged !== null) event.preventDefault();
                    }}
                >
                    {shown.map((product, index) => (
                        <div
                            key={product.id}
                            className={dragged === index ? styles.dragging : undefined}
                            onDragEnter={() => {
                                if (dragged === null || dragged === index || product.id === 0) return;
                                setDragOrder(moveTo(products, dragged, index));
                                setDragged(index);
                            }}
                        >
                            <ProductCard
                                product={product}
                                role={roleOf(product.roleId)}
                                editing={editing !== null && editing.id === (product.id === 0 ? null : product.id)}
                                onOpen={() => {
                                    // Die Vorschau des neuen Produkts ist schon offen. Ein Klick darauf soll den Entwurf nicht leeren.
                                    if (product.id !== 0) open(list.data?.products.find((entry) => entry.id === product.id) ?? null);
                                }}
                                grip={product.id === 0 ? undefined : grip(product, index)}
                            />
                        </div>
                    ))}
                    {list.data.stripeReady && editing?.id !== null && (
                        <button type="button" className={styles.add} onClick={() => open(null)}>
                            <Icon name="plus" />
                            Neues Produkt
                        </button>
                    )}
                </div>
            )}

            <SidePanel
                open={editing !== null}
                title={editing?.id === null ? "Neues Produkt" : (current?.title ?? "Produkt")}
                onClose={() => setEditing(null)}
                footer={
                    <div className={styles.panelFoot}>
                        <Button variant="primary" icon="save" busy={busy} onClick={() => void save()}>
                            Speichern
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                            Abbrechen
                        </Button>
                        {editing !== null && editing.id !== null && (
                            <Button variant="danger" icon="trash" className={styles.pushRight} onClick={() => setConfirmDelete(true)}>
                                Löschen
                            </Button>
                        )}
                    </div>
                }
            >
                {editing && (
                    <ProductForm
                        draft={editing.draft}
                        roles={roles}
                        rolesError={roleList.error?.message ?? null}
                        hasSubscribers={current !== null && current.kind === "subscription" && current.active > 0}
                        error={error}
                        onChange={(draft) => setEditing({ ...editing, draft })}
                    />
                )}
            </SidePanel>

            <ConfirmDialog
                open={confirmDelete}
                title="Produkt löschen?"
                confirmLabel="Löschen"
                tone="danger"
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            >
                Das geht nur, solange niemand es gekauft hat. Sonst blende es aus. Bei Stripe wird es archiviert.
            </ConfirmDialog>
        </>
    );
}
