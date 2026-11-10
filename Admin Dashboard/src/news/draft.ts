import { BLOCK_LABELS, type BlockType, type IBlock, type IPostEvent, type IPostInput, type NewsKind } from "../../shared/news.ts";
import { moveTo } from "../editor/list.ts";
import { berlinToIso, todayBerlin } from "../studio/time.ts";

/**
 * W-0062 Teil 2: Entwürfe im News-Studio, ohne React. Neue Beiträge, Vorlagen,
 * Bausteine einfügen und bewegen, Namen im Aufbau und die Formatleiste.
 */

export type { BlockType };
export type NewsTemplate = "update" | "partner" | "turnier" | "wartung";

/** Morgen um 19 Uhr in Berlin, mit Versatz. */
function tomorrowEvening(now: Date = new Date()): string {
    return berlinToIso(`${todayBerlin(new Date(now.getTime() + 24 * 3600_000))}T19:00`)!;
}

const defaultEvent = (): IPostEvent => ({ startsAt: tomorrowEvening(), endsAt: null, place: null });

/** Ein neuer Baustein. Bild, Galerie, Video und Partner-Karte sind erst gültig, wenn etwas gewählt ist. */
export function newBlock(type: BlockType): IBlock {
    switch (type) {
        case "text":
            return { type, md: "[Text]", size: "normal", width: "text" };
        case "heading":
            return { type, text: "[Überschrift]" };
        case "image":
            return { type, url: "", alt: "", caption: null };
        case "gallery":
            return { type, images: [] };
        case "callout":
            return { type, title: null, text: "[Hinweis]" };
        case "quote":
            return { type, text: "[Zitat]", by: null };
        case "partner":
            return { type, entryId: 0 };
        case "event":
            return { type, title: "[Termin]", startsAt: tomorrowEvening(), place: null };
        case "video":
            return { type, url: "" };
        case "button":
            return { type, label: "Mehr erfahren", url: "https://nexus-emb.de" };
        case "divider":
            return { type };
    }
}

/** Ein neuer Entwurf. Titel und Kurztext sind Pflicht, deshalb Beispieltexte in eckigen Klammern. */
export function newPost(kind: NewsKind): IPostInput {
    return {
        kind,
        category: kind === "termin" ? "turnier" : kind === "kurz" ? "ankuendigung" : "update",
        title: "[Titel]",
        summary: "[Worum es geht, in einem Satz]",
        cover: null,
        blocks: [newBlock("text")],
        entryId: null,
        event: kind === "termin" ? defaultEvent() : null,
        status: "draft",
        publishAt: null,
        pinned: "none",
        announce: false,
    };
}

/** Andere Art: Bausteine bleiben, ein Termin bekommt Beginn und Ende. */
export function switchPostKind(input: IPostInput, kind: NewsKind): IPostInput {
    return { ...input, kind, event: kind === "termin" ? (input.event ?? defaultEvent()) : null };
}

/** Vorlage: Art, Kategorie und Bausteine. Titel, Kurztext, Bild und Verknüpfung bleiben. */
export function templatePost(template: NewsTemplate, current: IPostInput): IPostInput {
    const text = (md: string, size: "normal" | "lead" = "normal"): IBlock => ({ type: "text", md, size, width: "text" });

    switch (template) {
        case "update":
            return { ...switchPostKind(current, "beitrag"), category: "update", blocks: [text("[Was neu ist, in zwei Sätzen]", "lead"), { type: "heading", text: "[Was sich ändert]" }, text("- [Punkt]\n- [Punkt]")] };
        case "partner":
            return {
                ...switchPostKind(current, "beitrag"),
                category: "partner",
                blocks: [text("[Wer dazukommt und warum]", "lead"), { type: "partner", entryId: current.entryId ?? 0 }, { type: "heading", text: "[Was sich ändert]" }, text("[Text]")],
            };
        case "turnier": {
            const next = switchPostKind(current, "termin");

            return {
                ...next,
                category: "turnier",
                blocks: [text("[Worum es geht und wer mitspielen kann]"), { type: "event", title: "[Anmeldeschluss]", startsAt: next.event!.startsAt, place: null }, { type: "button", label: "Zur Anmeldung", url: "https://nexus-emb.de" }],
            };
        }
        case "wartung":
            return { ...switchPostKind(current, "kurz"), category: "wartung", blocks: [{ type: "callout", title: "Wartung", text: "[Wann und wie lange]" }] };
    }
}

/* --- Bausteine bewegen ---------------------------------------------------- */

/** Unter dem gewählten einfügen, ohne Wahl ans Ende. */
export function insertBlock(blocks: readonly IBlock[], after: number | null, type: BlockType): { readonly blocks: IBlock[]; readonly index: number } {
    const index = after === null || after < 0 || after >= blocks.length ? blocks.length : after + 1;

    return { blocks: [...blocks.slice(0, index), newBlock(type), ...blocks.slice(index)], index };
}

/** Aus der kleinen Leiste und den Tasten. Ein Index außerhalb der Liste ändert nichts und wählt nichts. */
export function blockAction(blocks: readonly IBlock[], index: number, action: "hoch" | "runter" | "kopie" | "weg"): { readonly blocks: IBlock[]; readonly selected: number | null } {
    if (!Number.isInteger(index) || index < 0 || index >= blocks.length) return { blocks: [...blocks], selected: null };

    switch (action) {
        case "hoch":
            return index === 0 ? { blocks: [...blocks], selected: 0 } : { blocks: moveTo([...blocks], index, index - 1), selected: index - 1 };
        case "runter":
            return index === blocks.length - 1 ? { blocks: [...blocks], selected: index } : { blocks: moveTo([...blocks], index, index + 1), selected: index + 1 };
        case "kopie":
            return { blocks: [...blocks.slice(0, index + 1), structuredClone(blocks[index]!), ...blocks.slice(index + 1)], selected: index + 1 };
        case "weg": {
            const next = blocks.filter((_, at) => at !== index);

            return { blocks: next, selected: next.length === 0 ? null : Math.min(index, next.length - 1) };
        }
    }
}

/** Ziehen im Fach Aufbau. */
export function moveBlock(blocks: readonly IBlock[], from: number, to: number): IBlock[] {
    return moveTo([...blocks], from, to);
}

const plain = (md: string): string => md.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_]/g, "").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "").replace(/\s+/g, " ").trim();

/** Bis 28 Zeichen an einer Wortgrenze, dann „…“. */
function shorten(text: string): string {
    if (text.length <= 28) return text;

    const cut = text.slice(0, 28);
    const space = cut.lastIndexOf(" ");

    return `${(space > 10 ? cut.slice(0, space) : cut).trimEnd()} …`;
}

/** „Text · Apex Vortex spielt mit drei …“ für das Fach Aufbau. */
export function blockLabel(block: IBlock): string {
    const label = BLOCK_LABELS[block.type];
    const content =
        block.type === "text"
            ? plain(block.md)
            : block.type === "heading" || block.type === "callout" || block.type === "quote"
              ? block.text
              : block.type === "event"
                ? block.title
                : block.type === "button"
                  ? block.label
                  : block.type === "gallery"
                    ? `${block.images.length} Bilder`
                    : block.type === "image"
                      ? block.alt
                      : "";

    return content ? `${label} · ${shorten(content)}` : label;
}

/* --- Formatleiste ----------------------------------------------------------- */

export type TextMark = "fett" | "kursiv" | "link" | "liste" | "nummern";

/**
 * Formatleiste im Inspektor: setzt die Kürzel der Markdown-Teilmenge, die die
 * Webseite kennt, um die Auswahl. Listen gelten für ganze Zeilen.
 */
export function wrapSelection(text: string, start: number, end: number, mark: TextMark): { readonly text: string; readonly start: number; readonly end: number } {
    const from = Math.max(0, Math.min(start, end));
    const to = Math.min(text.length, Math.max(start, end));
    const selected = text.slice(from, to);

    if (mark === "fett" || mark === "kursiv") {
        const sign = mark === "fett" ? "**" : "*";

        return { text: `${text.slice(0, from)}${sign}${selected}${sign}${text.slice(to)}`, start: from + sign.length, end: to + sign.length };
    }

    if (mark === "link") return { text: `${text.slice(0, from)}[${selected}](https://)${text.slice(to)}`, start: from + 1, end: to + 1 };

    const lineStart = text.lastIndexOf("\n", from - 1) + 1;
    const nextBreak = text.indexOf("\n", to);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const marked = lines.map((line, at) => `${mark === "liste" ? "- " : `${at + 1}. `}${line}`).join("\n");

    return { text: `${text.slice(0, lineStart)}${marked}${text.slice(lineEnd)}`, start: lineStart, end: lineStart + marked.length };
}
