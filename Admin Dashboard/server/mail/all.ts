import type { IMailAllPage, IMailAllSummary, IMailPage } from "../../shared/api.ts";

export type IInboxResult = { readonly account: number; readonly page: IMailPage } | { readonly account: number; readonly error: string };

/**
 * Die neuesten Mails mehrerer Posteingänge als eine Liste, neueste zuerst.
 * Jede Liste muss mindestens page × pageSize Mails enthalten, sonst fehlen
 * auf späteren Seiten welche.
 */
export function mergeInboxes(lists: readonly IInboxResult[], page: number, pageSize: number): Pick<IMailAllPage, "messages" | "total" | "errors"> {
    const messages: IMailAllSummary[] = [];
    const errors: { account: number; message: string }[] = [];
    let total = 0;

    for (const entry of lists) {
        if ("error" in entry) {
            errors.push({ account: entry.account, message: entry.error });
            continue;
        }

        total += entry.page.total;
        for (const message of entry.page.messages) messages.push({ ...message, account: entry.account });
    }

    messages.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.uid - a.uid);

    return { messages: messages.slice((page - 1) * pageSize, page * pageSize), total, errors };
}
