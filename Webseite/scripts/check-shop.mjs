/**
 * Prüft die Regeln der Preisseite aus `src/shop/logic.ts`.
 *
 *   npm run check
 *
 * Die Seite entscheidet damit, was eine Karte anbietet und was das
 * Freischalten zeigt. Prüfen tut der Admin-Server beim Checkout noch einmal,
 * aber eine Karte, die einen Kauf anbietet, den der Server dann ablehnt, ist
 * für die Person ein Fehler.
 */
import assert from "node:assert/strict";
import {
    ORDER_NO,
    accessRows,
    accessStatus,
    cancelHint,
    cardAction,
    checkoutSummary,
    durationLabel,
    formatDay,
    formatPrice,
    groupBlocks,
    legalDay,
    loginNotice,
    passLine,
    paymentFailed,
    priceSuffix,
    settled,
    stepsOf,
    trialStrip,
    waitingHint,
} from "../src/shop/logic.ts";
import { leavesPricing } from "../src/services/navigation.ts";

let failures = 0;

function check(name, run) {
    try {
        run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
    }
}

const product = (changes = {}) => ({ id: 1, title: "Jahr", description: "", bullets: [], kind: "one_time", durationDays: 365, priceCents: 4499, badge: "", ...changes });
const me = (changes = {}) => ({
    id: "1",
    name: "Mecry",
    avatar: null,
    email: "m***@gmail.com",
    status: "none",
    until: null,
    productId: null,
    canTrial: true,
    cancelAtPeriodEnd: false,
    productTitle: null,
    roleName: null,
    hasBilling: false,
    blocked: {},
    ...changes,
});
const state = (changes = {}) => ({ open: true, trial: { enabled: true, days: 7 }, products: [], me: null, stripeKey: "pk_test_x", termsVersion: "2026-10-12", dev: false, ...changes });
const progress = (changes = {}) => ({
    kind: "purchase",
    orderNo: "RLN-2026-0042",
    paid: "done",
    joined: "done",
    role: "done",
    mail: "done",
    title: "Jahr",
    until: "2027-10-12T10:00:00.000Z",
    email: "m***@gmail.com",
    invite: null,
    ...changes,
});
const UNTIL = "2027-10-12T10:00:00.000Z";

console.log("\n  Shop");

check("Preise und Laufzeiten wie im Admin Dashboard", () => {
    assert.equal(formatPrice(4499), "44,99 €");
    assert.equal(formatPrice(100000), "1.000,00 €");
    assert.equal(priceSuffix("subscription"), "/ Monat");
    assert.equal(priceSuffix("one_time"), "einmalig");
    assert.equal(durationLabel("subscription", null), "monatlich kündbar");
    assert.equal(durationLabel("one_time", null), "unbegrenzt");
    assert.equal(durationLabel("one_time", 365), "365 Tage");
    assert.equal(durationLabel("one_time", 1), "1 Tag");
    // Kurz vor Mitternacht UTC ist in Berlin schon der nächste Tag.
    assert.equal(formatDay("2027-10-11T23:30:00.000Z"), "12.10.2027");
});

check("Was die Karte anbietet", () => {
    const monthly = product({ kind: "subscription", durationDays: null });

    assert.deepEqual(cardAction(product(), null, true), { kind: "login" });
    assert.deepEqual(cardAction(product(), me(), false), { kind: "none", note: "Gerade kein Verkauf." });
    assert.deepEqual(cardAction(product(), me({ status: "banned" }), true), { kind: "none", note: "Dein Konto ist für Käufe gesperrt." });
    assert.deepEqual(cardAction(product(), me({ status: "subscription", until: UNTIL }), true), { kind: "none", note: "Du hast schon ein Abo." });
    assert.deepEqual(cardAction(monthly, me({ status: "subscription", until: UNTIL }), true), { kind: "none", note: "Du hast schon ein Abo." });
    assert.deepEqual(cardAction(product(), me({ status: "one_time", until: null }), true), { kind: "none", note: "Du hast Zugang auf Dauer." });
    assert.deepEqual(cardAction(product(), me({ status: "gift", until: null }), true), { kind: "none", note: "Du hast Zugang auf Dauer." });
    assert.deepEqual(cardAction(product(), me({ status: "one_time", until: UNTIL }), true), { kind: "buy", label: "Verlängern" });
    assert.deepEqual(cardAction(monthly, me({ status: "one_time", until: UNTIL }), true), { kind: "none", note: "Ein Abo geht erst nach dem 12.10.2027." });
    assert.deepEqual(cardAction(product(), me({ status: "trial", until: UNTIL }), true), { kind: "buy", label: "Auswählen" });
    assert.deepEqual(cardAction(monthly, me({ status: "expired" }), true), { kind: "buy", label: "Auswählen" });
});

check("Was die Karte anbietet: Lehnt der Server ab, sagt die Karte seinen Satz", () => {
    // Test und kürzeres Geschenk nebeneinander: Die Seite sieht nur den Test, der Server kennt beide.
    const person = me({ status: "trial", until: UNTIL, blocked: { 1: "Ein Abo geht erst, wenn dein jetziger Zugang abgelaufen ist (am 01.11.2026)." } });

    assert.deepEqual(cardAction(product({ kind: "subscription", durationDays: null }), person, true), {
        kind: "none",
        note: "Ein Abo geht erst, wenn dein jetziger Zugang abgelaufen ist (am 01.11.2026).",
    });
    assert.deepEqual(cardAction(product({ id: 2 }), person, true), { kind: "buy", label: "Auswählen" });
});

check("Die Testleiste", () => {
    assert.equal(trialStrip(state({ trial: { enabled: false, days: 7 } })), "hidden");
    assert.equal(trialStrip(state()), "offer");
    assert.equal(trialStrip(state({ me: me() })), "offer");
    assert.equal(trialStrip(state({ me: me({ status: "trial", until: UNTIL, canTrial: false }) })), "running");
    assert.equal(trialStrip(state({ me: me({ status: "none", canTrial: false }) })), "used");
    assert.equal(trialStrip(state({ me: me({ status: "expired", canTrial: false }) })), "used");
    assert.equal(trialStrip(state({ me: me({ status: "subscription", until: UNTIL, canTrial: false }) })), "hidden");
    assert.equal(trialStrip(state({ me: me({ status: "banned", canTrial: false }) })), "hidden");
});

check("Rückmeldungen der Anmeldung", () => {
    assert.equal(loginNotice(new URLSearchParams("anmeldung=abgebrochen")), "Die Anmeldung wurde abgebrochen.");
    assert.equal(loginNotice(new URLSearchParams("anmeldung=fehler")), "Die Anmeldung hat nicht geklappt. Versuch es bitte noch einmal.");
    assert.equal(
        loginNotice(new URLSearchParams("anmeldung=mail")),
        "Deine Mail bei Discord ist noch nicht bestätigt. Bestätige sie in Discord unter Einstellungen → Mein Account und melde dich dann noch einmal an."
    );
    assert.equal(loginNotice(new URLSearchParams("")), null);
    assert.equal(loginNotice(new URLSearchParams("anmeldung=irgendwas")), null);
});

check("Freischalt-Schritte", () => {
    assert.deepEqual(
        stepsOf(progress()).map((step) => step.label),
        ["Zahlung bestätigt", "Auf den RL-Nexus-Server geholt", "Rolle vergeben", "Bestätigung an m***@gmail.com"]
    );
    assert.equal(stepsOf(progress({ kind: "trial" }))[0].label, "Test gestartet");
    assert.deepEqual(stepsOf(progress()).map((step) => step.hint), [null, null, null, null]);

    const hint = (changes, key) => stepsOf(progress(changes)).find((step) => step.key === key)?.hint;
    assert.equal(hint({ joined: "warn", invite: "https://discord.gg/x" }, "joined"), "Das hat nicht geklappt. Tritt über die Einladung bei, die Rolle trägt der Shop danach nach.");
    assert.equal(hint({ joined: "warn" }, "joined"), "Das hat nicht geklappt. Der Shop versucht es weiter.");
    assert.equal(hint({ role: "warn" }, "role"), "Die Rolle kommt nach, sobald es klappt.");
    assert.equal(hint({ mail: "warn" }, "mail"), "Die Mail ist nicht rausgegangen. Schreib uns, wenn sie fehlt.");

    assert.equal(settled(progress()), true);
    assert.equal(settled(progress({ mail: "warn" })), true);
    assert.equal(settled(progress({ role: "wait" })), false);
});

check("Warten auf die Zahlung", () => {
    assert.equal(
        waitingHint(progress({ paid: "wait" }), 25),
        "Die Zahlung ist noch nicht bestätigt. Bei einer Lastschrift kann das ein paar Tage dauern, du bekommst dann eine Mail."
    );
    assert.equal(waitingHint(progress({ paid: "wait" }), 10), null);
    assert.equal(waitingHint(progress(), 60), null);
});

check("Die Zeile direkt über dem Knopf (§ 312j): Produkt, Preis, Laufzeit, Verlängerung, Kündigung", () => {
    assert.equal(checkoutSummary(product()), "Jahr · 44,99\u00a0€ einmalig · Laufzeit 365 Tage · Verlängerung: keine · Kündigung: nicht nötig, läuft aus");
    assert.equal(
        checkoutSummary(product({ title: "Monat", kind: "subscription", durationDays: null, priceCents: 499 })),
        "Monat · 4,99\u00a0€ / Monat · Laufzeit monatlich kündbar · Verlängerung: monatlich, bis du kündigst · Kündigung: jederzeit zum Ende des bezahlten Monats"
    );
});

check("Zahlung nicht durchgegangen: kein ewiges Warten, kein Lastschrift-Hinweis", () => {
    const failed = progress({ paid: "warn", joined: "wait", role: "wait", mail: "wait" });

    assert.equal(paymentFailed(failed), true);
    assert.equal(paymentFailed(progress()), false);
    assert.equal(stepsOf(failed)[0].hint, "Die Zahlung ist nicht durchgegangen oder wurde abgebrochen. Abgebucht wurde dafür nichts.");
    assert.equal(waitingHint(failed, 60), null);
});

check("Die Pass-Karte und die Bestellnummer", () => {
    assert.equal(passLine(progress()), "Jahr · gültig bis 12.10.2027");
    assert.equal(passLine(progress({ until: null })), "Jahr · unbegrenzt");
    assert.equal(ORDER_NO.test("RLN-2026-0042"), true);
    assert.equal(ORDER_NO.test("RLN-26-1"), false);
});

check("Rechtstexte: Listenpunkte werden zu Listen, der Stand als Datum", () => {
    const blocks = [
        { kind: "li", text: "a" },
        { kind: "li", text: "b" },
        { kind: "p", text: "c" },
        { kind: "li", text: "d" },
    ];
    assert.deepEqual(groupBlocks(blocks), [
        { kind: "list", items: ["a", "b"] },
        { kind: "p", text: "c" },
        { kind: "list", items: ["d"] },
    ]);
    assert.deepEqual(groupBlocks([{ kind: "h2", text: "x" }]), [{ kind: "h2", text: "x" }]);
    assert.equal(legalDay("2026-10-12"), "12. Oktober 2026");
});

check("Mein Zugang: Zeilen je nach Art des Zugangs", () => {
    const monthly = product({ id: 2, title: "Monat", kind: "subscription", durationDays: null, priceCents: 499 });
    const abo = me({ status: "subscription", until: UNTIL, productId: 2, productTitle: "Monat", roleName: "Nexus Plus", hasBilling: true });
    const rows = (person, products = [monthly]) => Object.fromEntries(accessRows(person, products).map((row) => [row.label, row.value]));

    const title = `Monat · ${formatPrice(499)} / Monat`;

    assert.deepEqual(rows(abo), { Produkt: title, "Nächste Zahlung": "12.10.2027", "Discord-Rolle": "Nexus Plus", Kündbar: "jederzeit zum 12.10.2027" });
    assert.deepEqual(rows({ ...abo, cancelAtPeriodEnd: true }), { Produkt: title, "Endet am": "12.10.2027", "Discord-Rolle": "Nexus Plus" });
    assert.deepEqual(rows(me({ status: "one_time", productId: 9, productTitle: "Lifetime" }), []), { Produkt: "Lifetime", "Läuft bis": "unbegrenzt" });
    assert.deepEqual(rows(me({ status: "trial", until: UNTIL, productTitle: "Test" }), []), { Produkt: "Test", "Test bis": "12.10.2027" });
    assert.deepEqual(rows(me()), {});

    // W-0024: Bei Free und Beta ruht das Abo - kein Tag, an dem abgebucht würde.
    const paused = Object.fromEntries(accessRows(abo, [monthly], true).map((row) => [row.label, row.value]));
    assert.deepEqual(paused, { Produkt: title, "Nächste Zahlung": "keine, solange dein Zugang ruht", "Discord-Rolle": "Nexus Plus", Kündbar: "jederzeit" });
});

check("Preise bei Free: weg, außer eine Bestellung kommt gerade von Stripe zurück (W-0024)", () => {
    assert.equal(leavesPricing("free", false), true);
    assert.equal(leavesPricing("beta", false), true);
    assert.equal(leavesPricing("free", true), false, "?bestellung= zeigt noch das Freischalten");
    assert.equal(leavesPricing("paid", false), false);
});

check("Mein Zugang: Kündigungshinweis nur beim laufenden Abo, Status in Worten", () => {
    assert.equal(cancelHint(me({ status: "subscription", until: UNTIL })), "jederzeit zum 12.10.2027");
    assert.equal(cancelHint(me({ status: "subscription", until: UNTIL, cancelAtPeriodEnd: true })), null);
    assert.equal(cancelHint(me({ status: "one_time", until: UNTIL })), null);
    assert.equal(cancelHint(null), null);

    assert.equal(accessStatus(me({ status: "subscription" })), "Abo aktiv");
    assert.equal(accessStatus(me({ status: "subscription", cancelAtPeriodEnd: true })), "Abo gekündigt");
    assert.equal(accessStatus(me({ status: "trial" })), "Test läuft");
    assert.equal(accessStatus(me()), "Kein Zugang");
});

if (failures > 0) {
    console.log(`\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(1);
}

console.log("\n  Alles in Ordnung.\n");
