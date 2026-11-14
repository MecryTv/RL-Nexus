import { IMessageDoc } from "../../builder/IMessageDoc";
import { ICustomEmbed, MessageKind } from "../messages/IMessages";

/**
 * Self Roles: ein Panel ist eine Nachricht mit Knöpfen, einem Auswahlmenü oder
 * Reaktionen, aus der sich Mitglieder ihre Rollen selbst holen. Siehe docs/SelfRoles.md.
 */

/** reactions: jede Rolle hat ein Emoji, eine Reaktion holt sie, Wegnehmen gibt sie zurück. */
export type PanelKind = "buttons" | "select" | "reactions";

/** multi: jede Rolle einzeln. single: genau eine aus diesem Panel. */
export type PanelMode = "multi" | "single";

/** Die Farbe eines Knopfes - dieselben Töne wie im ComponentV2Builder. */
export type ButtonTone = "primary" | "secondary" | "success" | "danger";

export interface ISelfRole {
    roleId: string;
    /** Was auf dem Knopf oder im Menü steht. Leer = der Name der Rolle. */
    label: string;
    /** Nur im Auswahlmenü: die kleine Zeile darunter. */
    description: string;
    /** Ein Emoji (Unicode) oder <:name:id> für ein eigenes. */
    emoji: string | null;
    /** Nur bei Knöpfen. */
    style: ButtonTone;
    /** Kommt nur dazu und lässt sich nicht wieder abwählen. */
    locked: boolean;
}

/** Der Kopf der Nachricht - dieselben vier Arten wie bei Custom Message. */
export interface IPanelBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

export interface ISelfRolePanel {
    id: number;
    guildId: string;
    name: string;
    kind: PanelKind;
    mode: PanelMode;
    /** 0 heißt: ohne Grenze. */
    maxRoles: number;
    requireRole: string | null;
    body: IPanelBody;
    roles: ISelfRole[];
    channelId: string | null;
    /** Wo das Panel gerade steht. Bei angehängten Panels gleich targetId, solange es dran hängt. */
    messageId: string | null;
    /** W-0101: das Panel hängt an einer Nachricht, die es schon gibt, statt eine eigene zu schicken. */
    attached: boolean;
    /** Die vorhandene Nachricht (im Kanal channelId). Bleibt auch nach dem Lösen stehen. */
    targetId: string | null;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

/** Was „Prüfen“ über eine vorhandene Nachricht meldet. */
export interface IMessageInfo {
    channelId: string;
    channelName: string;
    messageId: string;
    author: string;
    /** Von RL Nexus selbst - nur dann gehen auch Knöpfe und Menü. */
    own: boolean;
    excerpt: string;
    createdAt: number;
}
