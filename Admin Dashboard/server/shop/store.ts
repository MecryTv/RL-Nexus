import type { AccessMode, IShopProduct, IShopProductInput, IShopSettings, IShopSettingsInput, ProductKind } from "../../shared/shop.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import type { IStripeIds } from "./stripe.ts";

/**
 * Lesen und Schreiben der Shop-Tabellen. Prüfen tut hier nichts mehr, das
 * ist vorher in rules.ts passiert.
 */

/**
 * „Dieser Zugang läuft gerade“ als SQL-Bedingung, wie isActive in grants.ts:
 * Abos einen Tag Kulanz nach dem Periodenende, gekündigte nicht. Derselbe
 * Satz steht im Bot.
 */
export function activeGrant(alias: string): string {
    const grace = `IF(${alias}.source = 'subscription' AND ${alias}.cancel_at_period_end = 0, 1, 0)`;

    // Eingefroren (Free Access) läuft, wie in isActive.
    return `${alias}.ended_at IS NULL AND ${alias}.starts_at <= NOW() AND (${alias}.frozen_at IS NOT NULL OR ${alias}.ends_at IS NULL OR ${alias}.ends_at > NOW() - INTERVAL ${grace} DAY)`;
}

interface ISettingsRow {
    readonly shop_open: number;
    readonly paywall: number;
    readonly trial_enabled: number;
    readonly trial_days: number;
    readonly trial_role_id: string | null;
    readonly promo_codes: number;
    readonly terms_version: string;
    readonly updated_at: Date;
}

export async function readSettings(): Promise<IShopSettings & { readonly updatedAt: Date; readonly modeChangedAt: Date | null }> {
    const [row] = await query<(ISettingsRow & { access_mode: AccessMode; mode_changed_at: Date | null })[]>(
        "SELECT access_mode, mode_changed_at, shop_open, paywall, trial_enabled, trial_days, trial_role_id, promo_codes, terms_version, updated_at FROM shop_settings WHERE id = 1"
    );

    if (!row) throw new PublicError(503, "Die Shop-Einstellungen fehlen. Starte den Admin-Server neu, er legt sie an.");

    return {
        mode: row.access_mode,
        modeChangedAt: row.mode_changed_at,
        shopOpen: row.shop_open === 1,
        paywall: row.paywall === 1,
        trialEnabled: row.trial_enabled === 1,
        trialDays: row.trial_days,
        trialRoleId: row.trial_role_id,
        promoCodes: row.promo_codes === 1,
        termsVersion: row.terms_version,
        updatedAt: row.updated_at,
    };
}

/** Speichert Test, Rabattcodes und Rechtstexte. Shop und Bezahlschranke folgen nur dem Modus (setAccessMode). */
export async function writeSettings(settings: IShopSettingsInput, actorId: string): Promise<void> {
    await query(
        `UPDATE shop_settings SET trial_enabled = ?, trial_days = ?, trial_role_id = ?,
                promo_codes = ?, terms_version = ?, updated_by = ? WHERE id = 1`,
        [
            settings.trialEnabled,
            settings.trialDays,
            settings.trialRoleId,
            settings.promoCodes,
            settings.termsVersion,
            actorId,
        ]
    );
}

/** Setzt Free oder Paid Access samt Shop und Bezahlschranke. Einfrieren und Stripe macht access.ts drumherum. */
export async function setAccessMode(mode: AccessMode, actorId: string, now: Date): Promise<void> {
    const on = mode === "paid" ? 1 : 0;

    await query("UPDATE shop_settings SET access_mode = ?, shop_open = ?, paywall = ?, mode_changed_at = ?, updated_by = ? WHERE id = 1", [mode, on, on, now, actorId]);
}

interface IProductRow {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly bullets: string;
    readonly kind: ProductKind;
    readonly duration_days: number | null;
    readonly price_cents: number;
    readonly badge: string;
    readonly role_id: string;
    readonly visible: number;
    readonly sort: number;
    readonly stripe_product_id: string | null;
    readonly stripe_price_id: string | null;
    readonly active: number;
}

/** Wie IShopProduct, dazu die Produkt-ID bei Stripe. Die geht nicht an die Oberfläche. */
export interface IProductRecord extends IShopProduct {
    readonly stripeProductId: string | null;
}

const PRODUCT_SELECT = `SELECT p.id, p.title, p.description, p.bullets, p.kind, p.duration_days, p.price_cents, p.badge, p.role_id,
           p.visible, p.sort, p.stripe_product_id, p.stripe_price_id,
           (SELECT COUNT(*) FROM shop_grants g WHERE g.product_id = p.id AND ${activeGrant("g")}) AS active
      FROM shop_products p`;

function productOf(row: IProductRow): IProductRecord {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        bullets: row.bullets === "" ? [] : row.bullets.split("\n"),
        kind: row.kind,
        durationDays: row.duration_days,
        priceCents: row.price_cents,
        badge: row.badge,
        roleId: row.role_id,
        visible: row.visible === 1,
        sort: row.sort,
        stripePriceId: row.stripe_price_id,
        stripeProductId: row.stripe_product_id,
        active: row.active,
    };
}

export async function listProducts(): Promise<IProductRecord[]> {
    return (await query<IProductRow[]>(`${PRODUCT_SELECT} ORDER BY p.sort, p.id`)).map(productOf);
}

export async function findProduct(id: number): Promise<IProductRecord | null> {
    const [row] = await query<IProductRow[]>(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);

    return row ? productOf(row) : null;
}

function columns(input: IShopProductInput, ids: IStripeIds): unknown[] {
    return [
        input.title,
        input.description,
        input.bullets.join("\n"),
        input.kind,
        input.durationDays,
        input.priceCents,
        input.badge,
        input.roleId,
        input.visible,
        ids.productId,
        ids.priceId,
    ];
}

/** Neue Produkte kommen ans Ende. */
export async function insertProduct(input: IShopProductInput, ids: IStripeIds): Promise<number> {
    const result = await query<{ insertId: number }>(
        `INSERT INTO shop_products (title, description, bullets, kind, duration_days, price_cents, badge, role_id, visible,
                                    stripe_product_id, stripe_price_id, sort)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort) + 1, 0) FROM shop_products`,
        columns(input, ids)
    );

    return result.insertId;
}

export async function updateProduct(id: number, input: IShopProductInput, ids: IStripeIds): Promise<void> {
    await query(
        `UPDATE shop_products SET title = ?, description = ?, bullets = ?, kind = ?, duration_days = ?, price_cents = ?, badge = ?,
                role_id = ?, visible = ?, stripe_product_id = ?, stripe_price_id = ? WHERE id = ?`,
        [...columns(input, ids), id]
    );
}

/** Gibt es Bestellungen oder Zugänge dazu, bleibt das Produkt: es steht in Rechnungen und im Verlauf. */
export async function productInUse(id: number): Promise<boolean> {
    const [row] = await query<{ used: number }[]>(
        "SELECT (SELECT COUNT(*) FROM shop_orders WHERE product_id = ?) + (SELECT COUNT(*) FROM shop_grants WHERE product_id = ?) AS used",
        [id, id]
    );

    return (row?.used ?? 0) > 0;
}

export async function deleteProduct(id: number): Promise<void> {
    await query("DELETE FROM shop_products WHERE id = ?", [id]);
}

/** Setzt die Reihenfolge. false: Die Liste enthält nicht genau die Produkte, die es gibt. */
export async function reorderProducts(ids: readonly number[]): Promise<boolean> {
    const existing = (await query<{ id: number }[]>("SELECT id FROM shop_products")).map((row) => row.id).sort((a, b) => a - b);
    const given = [...ids].sort((a, b) => a - b);

    if (existing.length !== given.length || existing.some((id, index) => id !== given[index])) return false;

    for (const [sort, id] of ids.entries()) await query("UPDATE shop_products SET sort = ? WHERE id = ?", [sort, id]);

    return true;
}

/** Sichtbare Produkte, auf Wunsch ohne eines (das gerade ausgeblendet oder gelöscht wird). */
export async function visibleCount(exceptId?: number): Promise<number> {
    const [row] = await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM shop_products WHERE visible = 1 AND id <> ?", [exceptId ?? 0]);

    return row?.n ?? 0;
}
