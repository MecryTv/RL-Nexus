import type { FastifyInstance } from "fastify";
import { ACCESS_MODES, formatPrice, type IAccessPreview, type IGuildRole, type IShopProduct, type IShopProductList, type IShopSettingsInput, type IShopSettingsView } from "../../shared/shop.ts";
import { accessPreview, switchAccess } from "../shop/access.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady, query } from "../db.ts";
import { fetchRoles } from "../discord.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { paidProblem, parseProductInput, parseSettingsInput } from "../shop/rules.ts";
import {
    deleteProduct,
    findProduct,
    insertProduct,
    listProducts,
    productInUse,
    readSettings,
    reorderProducts,
    updateProduct,
    visibleCount,
    writeSettings,
    type IProductRecord,
} from "../shop/store.ts";
import { retireAfterSave, stripeGateway, stripeReady, syncToStripe } from "../shop/stripe.ts";
import { body, id, oneOf } from "../validate.ts";

/**
 * Shop → Produkte und Shop → Einstellungen. Admins und Developer dürfen alles.
 *
 * Beim Speichern eines Produkts geht erst Stripe, dann die Datenbank. Ist die
 * Datenbank nicht da, wird Stripe gar nicht erst gefragt, sonst entstünde
 * dort ein Produkt, das hier niemand kennt.
 */

/** Ohne die Produkt-ID bei Stripe: Die braucht die Oberfläche nicht. */
function publicProduct({ stripeProductId: _hidden, ...product }: IProductRecord): IShopProduct {
    return product;
}

function requireDatabase(): void {
    if (!databaseReady()) throw new DatabaseUnavailable();
}

/** Discords Recht „Administrator“. Wer es hat, darf auf dem Server alles. */
const ADMINISTRATOR = 1n << 3n;

/**
 * Rollen, die man nicht verkaufen oder im Test verschenken darf: @everyone
 * (ID des Servers) und die beiden Rollen, mit denen man ins Admin Dashboard
 * kommt. Rollen mit Administrator-Recht blendet die Auswahl zusätzlich aus.
 */
function blockedRoles(config: IConfig): ReadonlySet<string> {
    return new Set([config.guildId, config.adminRoleId, config.developerRoleId]);
}

function assertSellable(config: IConfig, roleId: string | null, label: string): void {
    if (roleId !== null && blockedRoles(config).has(roleId)) {
        throw new InvalidInput(`${label} gibt Rechte im Admin Dashboard oder ist @everyone und lässt sich nicht verkaufen. Wähl eine eigene Shop-Rolle.`);
    }
}

const HIDE_HINT = " Stell erst auf Free Access oder mach ein anderes Produkt sichtbar.";

function settingsSummary(settings: IShopSettingsInput): string {
    const on = (value: boolean): string => (value ? "an" : "aus");

    return `Test ${on(settings.trialEnabled)} (${settings.trialDays} Tage), Rabattcodes ${on(settings.promoCodes)}`;
}

/** Bei Paid Access darf das letzte sichtbare Produkt nicht verschwinden. */
async function guardLastProduct(config: IConfig, productId: number): Promise<void> {
    if ((await readSettings()).mode !== "paid") return;

    const problem = paidProblem(await visibleCount(productId), stripeReady(config));
    if (problem) throw new InvalidInput(problem + HIDE_HINT);
}

export async function shopRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/shop/settings", async (): Promise<IShopSettingsView> => {
        const { updatedAt, modeChangedAt: _changed, ...settings } = await readSettings();
        const [webhook] = await query<{ value: string; updated_at: Date }[]>("SELECT value, updated_at FROM admin_state WHERE name = 'shop_last_webhook'");

        return {
            settings,
            guildId: config.guildId,
            developerMode: config.developerMode,
            stripe: {
                mode: config.stripe?.mode ?? null,
                lastWebhook: webhook ? { at: webhook.updated_at.toISOString(), type: webhook.value } : null,
            },
            mailFrom: config.shopMailFrom,
            updatedAt: updatedAt.toISOString(),
        };
    });

    /** Free oder Paid Access, mit den Zahlen für die Rückfrage. */
    app.get("/api/shop/access", async (): Promise<IAccessPreview> => {
        requireDatabase();

        return accessPreview();
    });

    app.put("/api/shop/access", async (request): Promise<IAccessPreview> => {
        const actor = accessOf(request);
        const mode = oneOf(body(request.body).mode, ACCESS_MODES, "Der Zugang");

        requireDatabase();

        // Auch nach einem halben Umstellen kommt es ins Protokoll, eine abgewiesene zweite Umstellung nicht (W-0024).
        return switchAccess(config, mode, actor, new Date(), (after) => audit(actor, "shop.access", null, { free: "Free Access", paid: "Paid Access", beta: "Beta Access" }[after]));
    });

    app.put("/api/shop/settings", async (request, reply) => {
        const actor = accessOf(request);
        const settings = parseSettingsInput(request.body);
        assertSellable(config, settings.trialRoleId, "Die Test-Rolle");

        requireDatabase();

        await writeSettings(settings, actor.id);
        await audit(actor, "shop.settings", null, settingsSummary(settings));
        publish("shop");

        return reply.code(204).send();
    });

    app.get("/api/shop/products", async (): Promise<IShopProductList> => ({
        products: (await listProducts()).map(publicProduct),
        stripeReady: stripeReady(config),
        mode: (await readSettings()).mode,
    }));

    app.post("/api/shop/products", async (request): Promise<{ product: IShopProduct }> => {
        const actor = accessOf(request);
        const input = parseProductInput(request.body);
        assertSellable(config, input.roleId, "Die Discord-Rolle");

        requireDatabase();

        const gateway = stripeGateway(config);
        const ids = await syncToStripe(gateway, input, null);

        let productId: number;
        try {
            productId = await insertProduct(input, ids);
        } catch (error) {
            // Stripe hat das Produkt schon. Wieder weg damit, sonst liegt es dort verwaist.
            await gateway.archiveProduct(ids.productId).catch(() => undefined);
            throw error;
        }

        await audit(actor, "shop.product.create", String(productId), `${input.title}, ${formatPrice(input.priceCents)}`);
        publish("shop");

        const created = await findProduct(productId);
        if (!created) throw new PublicError(500, "Das Produkt wurde angelegt, lässt sich aber nicht lesen. Lade die Seite neu.");

        return { product: publicProduct(created) };
    });

    // Vor /:id eingetragen. Fastify nimmt ohnehin den festen Pfad zuerst.
    app.put("/api/shop/products/order", async (request, reply) => {
        const actor = accessOf(request);
        const raw = body(request.body).ids;

        if (!Array.isArray(raw) || raw.length === 0 || raw.some((entry) => !Number.isSafeInteger(entry) || (entry as number) < 1) || new Set(raw).size !== raw.length) {
            throw new InvalidInput("Die Reihenfolge braucht jede Produkt-ID genau einmal.");
        }

        requireDatabase();

        if (!(await reorderProducts(raw as number[]))) {
            throw new PublicError(409, "Inzwischen gibt es andere Produkte. Lade die Seite neu und sortiere dann.");
        }

        await audit(actor, "shop.product.sort", null, (raw as number[]).join(", "));
        publish("shop");

        return reply.code(204).send();
    });

    app.put("/api/shop/products/:id", async (request): Promise<{ product: IShopProduct }> => {
        const actor = accessOf(request);
        const productId = id((request.params as { id?: string }).id);
        const input = parseProductInput(request.body);
        assertSellable(config, input.roleId, "Die Discord-Rolle");

        requireDatabase();

        const current = await findProduct(productId);
        if (!current) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        if (!input.visible && current.visible) await guardLastProduct(config, productId);

        const gateway = stripeGateway(config);
        const ids = await syncToStripe(gateway, input, current);
        await updateProduct(productId, input, ids);

        // Erst jetzt, da die Datenbank auf den neuen Preis zeigt.
        const retired = ids.retiredPriceId;
        if (retired) await retireAfterSave(() => gateway.archivePrice(retired), `Der alte Preis ${retired}`);

        const priceChanged = current.priceCents !== input.priceCents || current.kind !== input.kind;
        await audit(actor, "shop.product.update", String(productId), priceChanged ? `${input.title}, neuer Preis ${formatPrice(input.priceCents)}` : input.title);
        publish("shop");

        const updated = await findProduct(productId);
        if (!updated) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        return { product: publicProduct(updated) };
    });

    app.delete("/api/shop/products/:id", async (request, reply) => {
        const actor = accessOf(request);
        const productId = id((request.params as { id?: string }).id);

        requireDatabase();

        const current = await findProduct(productId);
        if (!current) throw new PublicError(404, "Dieses Produkt gibt es nicht mehr.");

        if (await productInUse(productId)) {
            throw new PublicError(409, "Zu diesem Produkt gibt es schon Bestellungen oder Zugänge. Blende es stattdessen aus.");
        }

        if (current.visible) await guardLastProduct(config, productId);

        // Erst die Zeile, dann Stripe: Scheitert Stripe, bleibt dort nur ein
        // aktives Produkt liegen, das hier niemand mehr anbietet.
        await deleteProduct(productId);

        const stripeProductId = current.stripeProductId;
        if (stripeProductId) await retireAfterSave(() => stripeGateway(config).archiveProduct(stripeProductId), `Das Produkt ${stripeProductId}`);

        await audit(actor, "shop.product.delete", String(productId), current.title);
        publish("shop");

        return reply.code(204).send();
    });

    app.get("/api/shop/roles", async (): Promise<{ roles: IGuildRole[] }> => {
        const blocked = blockedRoles(config);
        const roles = (await fetchRoles(config))
            // Rollen von Bots und Integrationen kann niemand vergeben. Administrator-Rollen
            // und die Rollen des Admin Dashboards gehören nicht in einen Shop.
            .filter((role) => !blocked.has(role.id) && !role.managed && (BigInt(role.permissions || "0") & ADMINISTRATOR) === 0n)
            .sort((a, b) => b.position - a.position)
            .map((role) => ({ id: role.id, name: role.name, color: role.color === 0 ? null : `#${role.color.toString(16).padStart(6, "0")}` }));

        return { roles };
    });
}
