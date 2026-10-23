import type { AccessMode, IAccessPreview } from "../../shared/shop.ts";

/**
 * Die Texte rund um Free und Paid Access (Entwurf zugang-free-paid.html,
 * Abschnitte 2 und 3). Rein und ohne React, damit der Server-Check sie prüft.
 */

/** Eine Zeile der Rückfrage: die Zahl vorn in der Spalte, fett der Satz, dahinter die Erklärung. */
export interface IAccessFact {
    readonly count: number | null;
    readonly lead: string;
    readonly detail: string;
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** Die Rückfrage vor Free Access. Nur Zeilen mit einer Zahl über 0, die Webseite immer. */
export function accessFacts(preview: IAccessPreview): IAccessFact[] {
    const facts: IAccessFact[] = [];
    // Gekündigte Abos laufen bei Stripe aus. Für den Zugang zählen nur noch ihre Resttage.
    const days = preview.dayGrants + preview.cancelled;
    const held = days + preview.trials;

    if (preview.subscriptions > 0) {
        facts.push({
            count: preview.subscriptions,
            lead: `${plural(preview.subscriptions, "Abo wird", "Abos werden")} bei Stripe pausiert.`,
            detail: "Es wird nichts mehr abgebucht, bis du wieder auf Paid Access stellst.",
        });
    }

    if (held > 0) {
        // Die erste Zahl steht in der Spalte, die zweite im Satz.
        const daysText = `${plural(days, "Zugang", "Zugänge")} nach Tagen`;
        const trialsText = plural(preview.trials, "Test", "Tests");
        const lead = days === 0 ? trialsText : preview.trials === 0 ? daysText : `${daysText} und ${preview.trials} ${trialsText}`;

        facts.push({ count: days || preview.trials, lead: `${lead} ${plural(held, "wird", "werden")} angehalten.`, detail: "Ihre Resttage bleiben stehen." });
    }

    if (preview.customers > 0) {
        facts.push({
            count: preview.customers,
            lead: `${plural(preview.customers, "Kunde bekommt", "Kunden bekommen")} eine kurze Mail.`,
            detail: "Darin steht, dass der Zugang pausiert ist und warum.",
        });
    }

    facts.push({
        count: null,
        lead: "Die Webseite zeigt keine Preise mehr.",
        detail: "AGB, Widerruf, „Verträge hier kündigen“ und „Mein Zugang“ bleiben unten in der Fußzeile erreichbar.",
    });

    return facts;
}

/** Der grüne Hinweis, solange Free Access gilt. */
export function freeSummary(preview: IAccessPreview): string {
    const held = preview.dayGrants + preview.cancelled + preview.trials;
    if (preview.subscriptions === 0 && held === 0) return "Es gab keine laufenden Zugänge anzuhalten.";

    return `${preview.subscriptions} ${plural(preview.subscriptions, "Abo", "Abos")} pausiert, ${held} ${plural(held, "Zugang", "Zugänge")} angehalten. Zurück auf Paid Access laufen sie weiter.`;
}

/** Gelb, wenn Stripe ein Abo nicht pausiert (Free) oder nicht fortgesetzt (Paid) hat. Der Ablauf-Job versucht es jede Minute. */
export function stripeWarning(preview: IAccessPreview): string | null {
    const count = preview.stripePending;
    if (count === 0) return null;

    return `${count} ${plural(count, "Abo hat", "Abos hat")} Stripe noch nicht ${preview.mode === "paid" ? "fortgesetzt" : "pausiert"}. Das Admin Dashboard versucht es jede Minute weiter.`;
}

/* --- Beta Access (Plan 22) --- */

const MODE_NAMES: Record<AccessMode, string> = { free: "Free Access", paid: "Paid Access", beta: "Beta Access" };

export function switchTitle(to: AccessMode): string {
    return `Auf ${MODE_NAMES[to]} umstellen?`;
}

/** Wer im Beta-Modus noch hineinkommt. Ohne Tester: der Hinweis, dass bis zum ersten Code nur Administrator und Developer drin sind. */
function testerFact(testers: number): IAccessFact {
    if (testers === 0) {
        return {
            count: null,
            lead: "Noch hat niemand einen Beta-Code eingelöst.",
            detail: "Bis dahin kommen nur Administrator und Developer ins Bot-Dashboard. Codes erzeugst du unter Bot → Beta Access.",
        };
    }

    return {
        count: testers,
        lead: `${plural(testers, "Beta-Tester kommt", "Beta-Tester kommen")} weiter ins Bot-Dashboard.`,
        detail: "Alle anderen sehen eine Sperrseite mit einem Feld für den Code.",
    };
}

/** Die Rückfrage vor einem Wechsel auf Free oder Beta. Auf Paid hat die Karte eigene Sätze. */
export function switchFacts(preview: IAccessPreview, to: AccessMode): IAccessFact[] {
    if (to === preview.mode || to === "paid") return [];

    if (preview.mode === "paid") return to === "beta" ? [testerFact(preview.testers), ...accessFacts(preview)] : accessFacts(preview);
    if (to === "beta") return [testerFact(preview.testers)];

    return [{ count: null, lead: "Jeder kommt wieder ins Bot-Dashboard, ohne Code.", detail: "Abos und Zugänge bleiben pausiert, die Webseite zeigt weiter keine Preise." }];
}

/** Der Hinweis oben, solange Free oder Beta gilt. */
export function noticeText(preview: IAccessPreview): string {
    if (preview.mode !== "beta") return freeSummary(preview);

    return `${preview.testers} ${plural(preview.testers, "Beta-Tester kommt", "Beta-Tester kommen")} ins Bot-Dashboard. ${freeSummary(preview)}`;
}
