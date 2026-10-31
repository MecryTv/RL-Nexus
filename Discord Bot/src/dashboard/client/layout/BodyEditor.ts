/**
 * Der Inhalts-Editor: Art wählen, Inhalt bauen, Vorschau daneben.
 *
 * Dieselbe Sache für alle Nachrichten der Module. Drei Arten kennt er selbst -
 * Karte im Components-V2-Stil, Embed und normale Nachricht. Eine vierte darf
 * die Seite mitbringen: die gezeichnete Begrüßungskarte baut ihr Formular und
 * ihre Vorschau selbst. Seit Plan 39 ist er das Studio (MessageStudio.ts).
 */

import { fill } from "../constants/Placeholders.js";
import { el } from "../core/Ui.js";
import { galleryUrl } from "./ImagePicker.js";
import { TemplateScope } from "../constants/Templates.js";
import { IEditorContext, IMessageDoc, markdown } from "./MessageEditor.js";
import { messageStudio } from "./MessageStudio.js";
import type { IStudioPanel } from "./Studio.js";

/** Plan 42: was das Studio der eigenen Art einer Seite mitgibt. */
export interface ICustomStageTools {
    /** Vor jeder Änderung - gleicher Schlüssel kurz hintereinander ist ein Schritt für Rückgängig. */
    remember(key?: string): void;
    /** Den Inspektor neu bauen, etwa wenn ein anderes Teil gewählt ist. */
    repaint(): void;
}

/** Plan 42: eine eigene Bühne statt Formular und Vorschau - Fächer, Mitte und Inspektor baut die Seite. */
export interface ICustomStage {
    panels: IStudioPanel[];
    canvas: HTMLElement;
    inspector: () => HTMLElement[];
    /** Der Zustand der Seite für Rückgängig, etwa die Welcome-Karte. */
    take: () => unknown;
    put: (state: unknown) => void;
}

export interface IEmbed {
    title: string | null;
    description: string | null;
    color: string | null;
    url: string | null;
    image: string | null;
    thumbnail: string | null;
    author: { name: string; icon: string | null } | null;
    footer: { text: string; icon: string | null } | null;
    timestamp: boolean;
    fields: { name: string; value: string; inline: boolean }[];
}

/** Was jede Nachricht gemeinsam hat. */
export interface IBody {
    kind: string;
    content: string;
    embed: IEmbed | null;
    doc: IMessageDoc;
}

export interface IBodyOptions {
    /** Die Arten zur Auswahl: Wert und Beschriftung. */
    kinds: Record<string, string>;
    /** Der Editor-Zusammenhang (Platzhalter, Rollen, Kanäle, Emojis). */
    context: () => IEditorContext;
    /** Eine leere Vorlage für ein neues Embed. */
    defaultEmbed: () => IEmbed;
    /** Etwas hat sich geändert. */
    touch: () => void;
    /** Was unter der Vorschau noch steht - etwa die Knöpfe. */
    extras?: () => Node | null;
    /** Eine eigene Art mit eigenem Formular und eigener Vorschau. */
    custom?: {
        kind: string;
        form?: (refresh: () => void) => HTMLElement;
        preview?: () => Node | null;
        /** Plan 42: statt Formular und Vorschau eine eigene Bühne, gebaut beim ersten Wechsel auf diese Art. */
        stage?: (tools: ICustomStageTools) => ICustomStage;
    };
    /** Überschrift über dem Editor. */
    title?: string;
    /** Fertige Nachrichten zum Anklicken - siehe constants/Templates.ts. */
    templates?: TemplateScope;
    /** Was unter dem Auswahlfeld steht. */
    hint?: string;
    /** Plan 40: der Speichern-Knopf der Seite - „Speichern“ in der Studio-Leiste spiegelt und klickt ihn (Spec Teil 5). */
    pageSave?: () => HTMLButtonElement | null;
    /** Plan 40: steht in der Mitte über der Nachricht - etwa der Ping einer Stream-Meldung. */
    above?: () => Node | null;
    /** Plan 39: „Test senden“ in der Studio-Leiste. */
    test?: () => Promise<void>;
}

export interface IBodyEditor {
    node: HTMLElement;
    /** Zeichnet nur die Vorschau neu. */
    refresh: () => void;
    /** Zeichnet Formular und Vorschau neu - nach einem Wechsel der Art. */
    redraw: () => void;
}

/**
 * Woher ein Bild kommt: eine https-Adresse, ein Platzhalter oder ein Bild aus
 * der Galerie. Zurueck kommt die Adresse zum Anzeigen - null, wenn es (noch)
 * keine gibt.
 */
export function imageUrl(source: string | null, guildId: string, values: Record<string, string> = {}): string | null {
    if (!source) return null;

    const filled = fill(source, values);

    if (filled.startsWith("https://")) return filled;
    if (filled.startsWith("{")) return null;

    return galleryUrl(guildId, filled);
}

/** Das Embed, wie Discord es zeigt. */
export function embedPreview(embed: IEmbed, values: Record<string, string> = {}, guildId = "", context?: IEditorContext): HTMLElement {
    const box = el("div", "cmembed");
    const text = (value: string): string => fill(value, values);
    // Mit Zusammenhang wird Markdown gezeichnet wie in der Karten-Vorschau,
    // ohne bleibt es beim reinen Text - dann steht eben **fett** da.
    const rich = (value: string, className: string): HTMLElement => {
        const host = el("div", className);

        if (context) host.append(markdown(text(value), context));
        else host.textContent = text(value);

        return host;
    };
    const thumbnail = imageUrl(embed.thumbnail, guildId, values);

    box.style.setProperty("--embed", embed.color ?? "#00afff");

    if (thumbnail) {
        const small = el("img", "cmembed__thumb");

        small.src = thumbnail;
        small.alt = "";
        small.dataset.part = "thumbnail";
        box.append(small);
    }

    // Plan 39: data-part - ein Klick im Studio wählt den Teil.
    const part = <T extends HTMLElement>(node: T, key: string): T => ((node.dataset.part = key), node);

    if (embed.author?.name) box.append(part(el("div", "cmembed__author", text(embed.author.name)), "author"));
    if (embed.title) box.append(part(el("div", "cmembed__title", text(embed.title)), "title"));
    if (embed.description) box.append(part(rich(embed.description, "cmembed__text"), "description"));

    if (embed.fields.length) {
        const grid = el("div", "cmembed__fields");

        embed.fields.forEach((field, index) => grid.append(part(el("div", `cmembed__field${field.inline ? " is-inline" : ""}`, el("b", "", text(field.name)), rich(field.value, "")), `field:${index}`)));

        box.append(grid);
    }

    const big = imageUrl(embed.image, guildId, values);

    if (big) {
        const image = el("img", "cmembed__image");

        image.src = big;
        image.alt = "";
        image.dataset.part = "image";
        box.append(image);
    }

    if (embed.footer?.text || embed.timestamp) {
        box.append(part(el("div", "cmembed__footer", [embed.footer?.text ? text(embed.footer.text) : null, embed.timestamp ? "heute um 20:00" : null].filter(Boolean).join(" · ")), "footer"));
    }

    return box;
}

/**
 * Plan 39: der Inhalts-Editor ist das Nachrichten-Studio (layout/MessageStudio.ts).
 * Schnittstelle und Optionen bleiben - die Seiten bauen ihn wie bisher.
 */
export function bodyEditor(entry: IBody, options: IBodyOptions): IBodyEditor {
    return messageStudio(entry, options);
}
