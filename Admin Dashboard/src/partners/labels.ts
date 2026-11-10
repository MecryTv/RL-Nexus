import type { Group } from "../../shared/limits.ts";
import { PARTNER_TYPE_LABELS, SUPPORTER_TYPE_LABELS, TIER_LABELS, type IEntryInput, type IRoleState } from "../../shared/partners.ts";

/** W-0062 Teil 2: Wörter für Liste, Dialoge und Studio. */

/** „Organisation“, „Hauptsponsor“, „Firma“ – wie die Webseite es zeigt. */
export function typeLabel(entry: Pick<IEntryInput, "kind" | "partnerType" | "tier" | "supporterType">): string {
    if (entry.kind === "sponsor") return TIER_LABELS[entry.tier ?? "sponsor"];
    if (entry.kind === "supporter") return entry.supporterType ? SUPPORTER_TYPE_LABELS[entry.supporterType] : "Unterstützer";

    return entry.partnerType ? PARTNER_TYPE_LABELS[entry.partnerType] : "Partner";
}

export const ROLE_LABELS: Readonly<Record<IRoleState["state"], string>> = {
    given: "vergeben",
    pending: "wartet auf Beitritt",
    missing: "fehlt",
    removing: "wird entfernt",
    none: "ohne Konto",
};

/** Was mit einer Person passiert, die Ansprechpartner wird. */
export function groupHint(name: string, group: Group | null): string | null {
    if (group === "administrator") return `${name} ist Administrator und bleibt es. Die Rolle @Partner bekommt er trotzdem.`;
    if (group === "premium") return `${name} ist schon Premium und bleibt es. Die Rolle @Partner bekommt er trotzdem.`;
    if (group === "partner") return `${name} ist schon Partner.`;

    return null;
}

/** Icon eines Discord-Servers als Adresse, für „Von Discord“. */
export const guildIconUrl = (guildId: string, icon: string | null): string | null => (icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=512` : null);
