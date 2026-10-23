import { PublicError } from "../errors.ts";
import type { IStripeEvent, IStripeGateway } from "../shop/stripe.ts";

/** Stripe, nachgestellt: merkt sich jeden Aufruf als Zeile und vergibt erfundene IDs. */
export class FakeStripe implements IStripeGateway {
    readonly calls: string[] = [];
    /** true: Jeder Aufruf scheitert, als wäre Stripe weg. */
    fail = false;
    /** true: Nur pauseSubscription scheitert. */
    failPause = false;
    /** true: Nur resumeSubscription scheitert. */
    failResume = false;
    private next = 0;

    async saveProduct({ id, name }: { readonly id: string | null; readonly name: string }): Promise<string> {
        this.guard();
        this.calls.push(`produkt ${id ?? "neu"} ${name}`);

        return id ?? `prod_check${++this.next}`;
    }

    async createPrice({ productId, cents, monthly }: { readonly productId: string; readonly cents: number; readonly monthly: boolean }): Promise<string> {
        this.guard();
        this.calls.push(`preis ${productId} ${cents} ${monthly ? "monatlich" : "einmalig"}`);

        return `price_check${++this.next}`;
    }

    async archivePrice(priceId: string): Promise<void> {
        this.guard();
        this.calls.push(`archiv ${priceId}`);
    }

    async expireCheckout(checkoutId: string): Promise<void> {
        this.guard();
        this.calls.push(`ablaufen ${checkoutId}`);
    }

    async archiveProduct(productId: string): Promise<void> {
        this.guard();
        this.calls.push(`archiv ${productId}`);
    }

    /** Was subscriptionEnd liefert. */
    periodEnd = new Date(Date.now() + 30 * 86_400_000);
    /** Die einzige Signatur, die constructEvent annimmt. */
    static readonly SIGNATURE = "t=1,v1=gueltig";

    async ensureCustomer({ id, email }: { readonly id: string | null; readonly email: string }): Promise<string> {
        this.guard();
        this.calls.push(`kunde ${id ?? "neu"} ${email}`);

        return id ?? `cus_check${++this.next}`;
    }

    async createCheckout({ customerId, priceId, monthly, orderNo }: { readonly customerId: string; readonly priceId: string; readonly monthly: boolean; readonly orderNo: string }): Promise<{ id: string; clientSecret: string }> {
        this.guard();
        this.calls.push(`checkout ${customerId} ${priceId} ${monthly ? "abo" : "einmal"} ${orderNo}`);
        const id = `cs_check${++this.next}`;

        return { id, clientSecret: `${id}_secret` };
    }

    async subscriptionEnd(subscriptionId: string): Promise<Date> {
        this.guard();
        this.calls.push(`abo-ende ${subscriptionId}`);

        return this.periodEnd;
    }

    async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
        this.guard();
        this.calls.push(`kündigen ${subscriptionId} ${atPeriodEnd ? "ende" : "sofort"}`);
    }

    async pauseSubscription(subscriptionId: string): Promise<void> {
        this.guard();
        if (this.failPause) throw new Error("Stripe lehnt das Pausieren ab.");
        this.calls.push(`pausieren ${subscriptionId}`);
    }

    async resumeSubscription(subscriptionId: string, trialEnd: Date): Promise<void> {
        this.guard();
        if (this.failResume) throw new Error("Stripe lehnt das Fortsetzen ab.");
        this.calls.push(`fortsetzen ${subscriptionId} ${Math.floor(trialEnd.getTime() / 1000)}`);
    }

    async refund(target: { readonly paymentIntentId: string } | { readonly subscriptionId: string }, cents: number): Promise<void> {
        this.guard();
        this.calls.push(`erstatten ${"paymentIntentId" in target ? target.paymentIntentId : target.subscriptionId} ${cents}`);
    }

    async portalUrl(customerId: string, _returnUrl: string): Promise<string> {
        this.guard();
        this.calls.push(`portal ${customerId}`);

        return `https://billing.stripe.test/${customerId}`;
    }

    /** Was checkoutStatus meldet. */
    checkoutState: "open" | "complete" | "expired" = "complete";

    async checkoutStatus(checkoutId: string): Promise<"open" | "complete" | "expired"> {
        this.guard();
        this.calls.push(`kasse ${checkoutId}`);

        return this.checkoutState;
    }

    async invoicePdf(invoiceId: string): Promise<Buffer | null> {
        this.calls.push(`rechnung ${invoiceId}`);

        return Buffer.from("%PDF-check");
    }

    constructEvent(payload: Buffer, signature: string): IStripeEvent {
        if (signature !== FakeStripe.SIGNATURE) throw new Error("No signatures found matching the expected signature for payload.");

        return JSON.parse(payload.toString("utf8")) as IStripeEvent;
    }

    private guard(): void {
        if (this.fail) throw new PublicError(503, "Stripe ist gerade nicht erreichbar. Versuch es gleich noch einmal.");
    }
}
