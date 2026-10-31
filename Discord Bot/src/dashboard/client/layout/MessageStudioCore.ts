/**
 * Plan 39: die Rechnung hinter dem Nachrichten-Studio, ohne DOM - so prüft
 * scripts/CheckStudio.ts sie ohne Browser. Die Typen sind wie IBody, IEmbed
 * und IMessageDoc gebaut (layout/BodyEditor.ts, layout/MessageEditor.ts), aber
 * hier selbst beschrieben: deren Dateien ziehen den Browser mit.
 *
 * Alles ändert die Nachricht an Ort und Stelle - die Seiten halten die
 * Referenz und speichern genau dieses Objekt.
 */

export type IStudioBlock =
    | { type: "text"; body: string }
    | { type: "image"; images: string[] }
    | { type: "separator"; big?: boolean; line?: boolean }
    | { type: "section"; body: string; thumbnail: string };

export interface IStudioEmbed {
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

export interface IStudioBody {
    kind: string;
    content: string;
    embed: IStudioEmbed | null;
    doc: { accent?: string; blocks: IStudioBlock[] };
}

export interface IMessagePart {
    /** block:3, field:0, content, author, title, description, image, thumbnail, footer. */
    key: string;
    label: string;
    /** Der Anfang des Inhalts - der Aufbau zeigt ihn statt eines Namens. */
    detail: string;
}

export const MAX_FIELDS = 10;

/** Was der Bot je Teil eines Embeds annimmt - die Beschreibung kürzt er auf 4.000 (MessageService, CustomView). */
export const EMBED_MAX = { author: 256, title: 256, description: 4000, footer: 2048 } as const;

/** Dieselben Kosten wie im Bot (src/builder/MessageDoc.ts): Text mit Bild daneben braucht drei Komponenten. */
const COST: Record<IStudioBlock["type"], number> = { text: 1, image: 1, separator: 1, section: 3 };

/** Komponenten einer Karte - Platz für Knöpfe und Menü bleibt darüber. */
export const BLOCK_BUDGET = 39;

/** Mehr Bausteine nimmt der Bot nicht an (CleanDoc). */
export const MAX_BLOCKS = 25;

export function docCost(doc: { blocks: IStudioBlock[] }): number {
    return doc.blocks.reduce((sum, block) => sum + COST[block.type], 0);
}

/** Passt noch ein Baustein dieser Art? Sonst ließe der Bot ihn still weg. */
export function canAddBlock(doc: { blocks: IStudioBlock[] }, type: IStudioBlock["type"]): boolean {
    return doc.blocks.length < MAX_BLOCKS && docCost(doc) + COST[type] <= BLOCK_BUDGET;
}

/** Der Autor eines Embeds: ohne Namen gibt es keinen. */
export function authorOf(name: string, icon: string | null): IStudioEmbed["author"] {
    return name ? { name, icon } : null;
}

const BLOCK_LABEL: Record<IStudioBlock["type"], string> = { text: "Text", image: "Bilder", separator: "Trenner", section: "Text mit Bild" };

/** Die Teile eines Embeds, die es nur einmal gibt - in der Reihenfolge, in der Discord sie zeigt. */
const SINGLE: { key: "author" | "title" | "description"; label: string; get: (embed: IStudioEmbed) => string | null }[] = [
    { key: "author", label: "Autor", get: (embed) => embed.author?.name ?? null },
    { key: "title", label: "Titel", get: (embed) => embed.title },
    { key: "description", label: "Beschreibung", get: (embed) => embed.description },
];

function short(text: string): string {
    const line = text.replace(/\s+/g, " ").trim();

    return line.length > 32 ? `${line.slice(0, 31)}…` : line;
}

/** Was im Fach „Aufbau“ steht. Eine eigene Art der Seite (etwa die Welcome-Karte) hat keine Teile. */
export function messageParts(body: IStudioBody): IMessagePart[] {
    if (body.kind === "v2") {
        return body.doc.blocks.map((block, index) => ({
            key: `block:${index}`,
            label: BLOCK_LABEL[block.type],
            detail: block.type === "text" || block.type === "section" ? short(block.body) : block.type === "image" ? `${block.images.length} ${block.images.length === 1 ? "Bild" : "Bilder"}` : "",
        }));
    }

    if (body.kind === "text") return [{ key: "content", label: "Nachricht", detail: short(body.content) }];
    if (body.kind !== "embed") return [];

    const parts: IMessagePart[] = body.content.trim() ? [{ key: "content", label: "Text über dem Embed", detail: short(body.content) }] : [];
    const embed = body.embed;

    if (!embed) return parts;

    for (const single of SINGLE) {
        const value = single.get(embed);

        if (value) parts.push({ key: single.key, label: single.label, detail: short(value) });
    }

    embed.fields.forEach((field, index) => parts.push({ key: `field:${index}`, label: "Feld", detail: short(`${field.name}: ${field.value}`) }));

    if (embed.image) parts.push({ key: "image", label: "Bild", detail: "" });
    if (embed.thumbnail) parts.push({ key: "thumbnail", label: "Vorschaubild", detail: "" });
    if (embed.footer?.text) parts.push({ key: "footer", label: "Fußzeile", detail: short(embed.footer.text) });

    return parts;
}

/** Bausteine und Felder sind Listen - nur sie lassen sich verschieben und duplizieren. */
function listOf(body: IStudioBody, key: string): { list: unknown[]; index: number; prefix: string } | null {
    const [kind, raw] = key.split(":");
    const index = Number(raw);

    if (!Number.isInteger(index)) return null;
    if (kind === "block" && body.kind === "v2") return { list: body.doc.blocks, index, prefix: "block" };
    if (kind === "field" && body.embed) return { list: body.embed.fields, index, prefix: "field" };

    return null;
}

/** Vorlagen einer Art, die die Seite nicht anbietet (etwa „Nur Text“ beim Aufstieg mit nur der Karte), fallen weg. */
export function offered<T extends { body: { kind?: string } }>(list: T[], kinds: readonly string[]): T[] {
    return list.filter((entry) => entry.body.kind === undefined || kinds.includes(entry.body.kind));
}

/** Eine Stelle hoch (-1) oder runter (1). Zurück kommt der neue Schlüssel, am Rand null. */
export function movePart(body: IStudioBody, key: string, delta: number): string | null {
    const found = listOf(body, key);

    if (!found) return null;

    const to = found.index + delta;

    if (to < 0 || to >= found.list.length || found.index >= found.list.length) return null;

    const [moved] = found.list.splice(found.index, 1);

    found.list.splice(to, 0, moved);

    return `${found.prefix}:${to}`;
}

/** Geht eine Kopie? Höchstens zehn Felder, Bausteine nur im Rahmen dessen, was der Bot annimmt. */
export function canDuplicate(body: IStudioBody, key: string): boolean {
    const found = listOf(body, key);

    if (!found || found.index >= found.list.length) return false;
    if (found.prefix === "field") return found.list.length < MAX_FIELDS;

    return canAddBlock(body.doc, body.doc.blocks[found.index].type);
}

/** Eine Kopie gleich dahinter. null: geht nicht (siehe canDuplicate). */
export function duplicatePart(body: IStudioBody, key: string): string | null {
    const found = listOf(body, key);

    if (!found || !canDuplicate(body, key)) return null;

    found.list.splice(found.index + 1, 0, structuredClone(found.list[found.index]));

    return `${found.prefix}:${found.index + 1}`;
}

/** Weg damit: Bausteine und Felder aus der Liste, Teile des Embeds leer, der Text leer. */
export function removePart(body: IStudioBody, key: string): void {
    const found = listOf(body, key);

    if (found) {
        found.list.splice(found.index, 1);

        return;
    }

    if (key === "content") body.content = "";
    if (!body.embed) return;
    if (key === "author") body.embed.author = null;
    if (key === "title") body.embed.title = null;
    if (key === "description") body.embed.description = null;
    if (key === "image") body.embed.image = null;
    if (key === "thumbnail") body.embed.thumbnail = null;
    if (key === "footer") body.embed.footer = null;
}

/** Die Zeichen der ganzen Nachricht - Discord erlaubt zusammen höchstens 4.000 (Karte) bzw. 6.000 (Embed). */
export function messageLength(body: IStudioBody): number {
    if (body.kind === "v2") return body.doc.blocks.reduce((sum, block) => sum + (block.type === "text" || block.type === "section" ? block.body.length : 0), 0);

    const embed = body.kind === "embed" ? body.embed : null;

    if (!embed) return body.content.length;

    return (
        body.content.length +
        (embed.author?.name.length ?? 0) +
        (embed.title?.length ?? 0) +
        (embed.description?.length ?? 0) +
        embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0) +
        (embed.footer?.text.length ?? 0)
    );
}

/**
 * Einen früheren Stand zurückholen (Rückgängig, „Zurück“ der Vorlagen). Das
 * Objekt der Seite bleibt dasselbe, auch das Dokument darin - manche Seiten
 * halten es selbst (der Aufstieg als Text).
 */
export function restore(target: IStudioBody, snapshot: IStudioBody): void {
    const copy = structuredClone(snapshot);

    target.kind = copy.kind;
    target.content = copy.content;
    target.embed = copy.embed;

    for (const key of Object.keys(target.doc)) delete (target.doc as Record<string, unknown>)[key];

    Object.assign(target.doc, copy.doc);
}
