import { ICustomEmbed } from "../messages/IMessages";
import { IMessageDoc } from "../../builder/IMessageDoc";

/* ----------------------------------------------------------
   Welcome System - siehe docs/Welcome.md
   ---------------------------------------------------------- */

/** Was der Bot schickt: eine gezeichnete Karte, eine Karte im Components-V2-Stil, ein Embed oder reiner Text. */
export type WelcomeKind = "card" | "v2" | "embed" | "text";

/**
 * Wie die Karte aufgebaut ist:
 * - classic: Avatar links, Text rechts, ein Streifen in der Akzentfarbe am Rand
 * - center: Avatar oben, Text mittig darunter
 * - panel: Text auf einer dunklen Fläche links, rechts bleibt das Bild frei
 * - hud: abgeschrägter Rahmen mit Eckwinkeln, wie die Rang-Karte
 */
export type WelcomeLayout = "classic" | "center" | "panel" | "hud";

/** Die Schrift der Überschrift - alle drei liegen beim Bot. */
export type WelcomeFont = "oxanium" | "orbitron" | "rajdhani";

/** Die gezeichnete Begrüßungskarte - jedes Stück einzeln einstellbar. */
export interface IWelcomeCard {
    /** Bild aus der Galerie, null: Farbverlauf. */
    background: string | null;
    /** Farbe für Streifen, Rahmen, Ring und die kleine Zeile. */
    accent: string;
    /** Aus: die Karte bleibt neutral, ohne Farbakzent. */
    accentOn: boolean;
    /** Wie stark das Hintergrundbild abgedunkelt wird (0-90). */
    dim: number;
    layout: WelcomeLayout;
    /** Die drei Zeilen - mit Platzhaltern. */
    title: string;
    subtitle: string;
    footer: string;
    font: WelcomeFont;
    /** Schriftgröße der Überschrift in Pixeln. */
    titleSize: number;
    /** Farben der drei Zeilen. footerColor null: die Akzentfarbe. */
    titleColor: string;
    subtitleColor: string;
    footerColor: string | null;
    /** Bausteine, die sich abschalten lassen. */
    avatar: boolean;
    /** Kantenlänge des Avatars in Pixeln. */
    avatarSize: number;
    /** Stärke des Rings um den Avatar, 0: keiner. */
    ringWidth: number;
    /** Rund oder mit abgeschrägten Ecken wie im Dashboard. */
    avatarShape: "circle" | "bevel";
    count: boolean;
    icon: boolean;
    date: boolean;
}

/** Eine Nachricht des Moduls - Begrüßung oder Abschied. */
export interface IWelcomeMessage {
    on: boolean;
    channelId: string | null;
    kind: WelcomeKind;
    /** Text über der Karte bzw. dem Embed - bei "text" die ganze Nachricht. */
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
    card: IWelcomeCard;
}

export interface IWelcomeConfig {
    join: IWelcomeMessage;
    leave: IWelcomeMessage;
    /** Rollen für neue Mitglieder. */
    roles: string[];
    /** Rollen für Bots, die jemand einlädt. */
    botRoles: string[];
}
