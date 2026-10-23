import { IPanelBody, ISelfRole, ISelfRolePanel } from "../interfaces/services/selfroles/ISelfRoles";
import { DefaultMessageDoc } from "./Messages";

/**
 * Self Roles: Grenzen und Vorgaben. Siehe docs/SelfRoles.md.
 */
export const SELF_ROLE_MODULE = "reaction-roles";

/** Der Anfang jeder Custom-ID: selfrole:<panel>:<rolle> bzw. selfrole:menu:<panel>. */
export const SELF_ROLE_PREFIX = "selfrole";

export const MAX_PANELS = 25;
/** Discord: fünf Knöpfe je Reihe, fünf Reihen - und 25 Einträge je Menü. */
export const MAX_ROLES = 25;
export const MAX_NAME = 80;
export const MAX_LABEL = 80;
export const MAX_DESCRIPTION = 100;

export const KIND_LABELS: Record<string, string> = {
    buttons: "Knöpfe",
    select: "Auswahlmenü",
};

export const MODE_LABELS: Record<string, string> = {
    multi: "Mehrere möglich",
    single: "Genau eine",
};

export const TONE_LABELS: Record<string, string> = {
    primary: "Blau",
    secondary: "Grau",
    success: "Grün",
    danger: "Rot",
};

export function DefaultBody(): IPanelBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            ...DefaultMessageDoc(),
            blocks: [{ type: "text", body: "## Hol dir deine Rollen\nKlick an, was auf dich passt – und wieder ab, wenn nicht mehr." }],
        },
    };
}

export function DefaultRole(roleId: string, name: string): ISelfRole {
    return { roleId, label: name.slice(0, MAX_LABEL), description: "", emoji: null, style: "secondary", locked: false };
}

export function DefaultPanel(): Pick<ISelfRolePanel, "kind" | "mode" | "maxRoles" | "requireRole" | "body" | "roles"> {
    return { kind: "buttons", mode: "multi", maxRoles: 0, requireRole: null, body: DefaultBody(), roles: [] };
}

/**
 * Ein Emoji, wie Discord es annimmt: entweder ein Unicode-Zeichen oder
 * <:name:id> / <a:name:id> für ein eigenes. Alles andere wirft der Builder
 * zurück, deshalb hier die Grenze.
 */
export function CleanEmoji(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const emoji = value.trim();

    if (!emoji) return null;
    if (/^<a?:[a-z0-9_]{2,32}:\d{17,20}>$/i.test(emoji)) return emoji;

    // Kein Buchstabe, keine Ziffer, höchstens ein paar Zeichen: dann ist es ein Emoji.
    return emoji.length <= 8 && !/[a-z0-9<>:@#]/i.test(emoji) ? emoji : null;
}
