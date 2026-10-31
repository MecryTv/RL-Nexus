/**
 * Der Nachrichten-Editor mit Live-Vorschau.
 *
 * Bearbeitet wird ein Dokument aus Bausteinen - dasselbe Format, das der Bot
 * sendet (src/interfaces/builder/IMessageDoc.ts). Die Vorschau zeichnet es im
 * Dashboard-Stil und nicht als Discord-Nachbau: sie soll zeigen, was drinsteht,
 * ohne so zu tun, als wäre sie Discord.
 */

import { icon } from "../core/Dom.js";
import { fill, IMAGE_PLACEHOLDERS, IPlaceholder, PLACEHOLDERS } from "../constants/Placeholders.js";
import { emojiNode, emojiPicker, IServerEmoji } from "./EmojiPicker.js";
import { galleryUrl, pickImage } from "./ImagePicker.js";
import { BLOCK_BUDGET, docCost } from "./MessageStudioCore.js";

export type IMessageBlock =
    | { type: "text"; body: string }
    | { type: "image"; images: string[] }
    | { type: "separator"; big?: boolean; line?: boolean }
    | { type: "section"; body: string; thumbnail: string };

export interface IMessageDoc {
    accent?: string;
    blocks: IMessageBlock[];
}


const BLOCK_LABELS: Record<IMessageBlock["type"], string> = {
    text: "Text",
    image: "Bilder",
    separator: "Trenner",
    section: "Abschnitt mit Bild",
};

export interface IEditorContext {
    guildId: string;
    /** Werte der Platzhalter für die Vorschau. */
    values: Record<string, string>;
    /** Namen für Erwähnungen in der Vorschau. */
    roles?: Map<string, string>;
    channels?: Map<string, string>;
    /** Server-Emojis - damit <:name:id> in der Vorschau als Bild erscheint. */
    emojis?: IServerEmoji[];
    /** structural: der Editor wird neu gezeichnet (Baustein dazu, weg, verschoben). */
    onChange: (structural?: boolean) => void;
    /** Die Platzhalter dieser Nachricht - ohne Angabe die der Tickets. */
    placeholders?: IPlaceholder[];
    /** Was als Bild-Platzhalter angeboten wird - ohne Angabe die der Tickets. */
    imagePlaceholders?: string[];
    /** Ein zweites Platzhalter-Menü in zwei Stufen, etwa erst das Team, dann seine Spieler. */
    tree?: IPlaceholderTree;
    /** Emojis, die nur in der Vorschau als Bild stehen sollen (Rang-Icons des Bots), nicht in der Emoji-Auswahl. */
    previewEmojis?: IServerEmoji[];
}

/**
 * Ein Menü in zwei Stufen: oben die Zweige (etwa die Teams), nach der Wahl die
 * Platzhalter dieses Zweigs - nach group in Überschriften, etwa je Spieler.
 */
export interface IPlaceholderTree {
    /** Was oben steht, solange kein Zweig gewählt ist: "Spieler-Platzhalter …". */
    label: string;
    /** Der Eintrag zurück zur ersten Stufe: "‹ Anderes Team". */
    back: string;
    branches: { label: string; placeholders: IPlaceholder[] }[];
}


/* ----------------------------------------------------------
   Editor
   ---------------------------------------------------------- */
// Wohin ein Platzhalter eingesetzt wird: das zuletzt benutzte Feld. Auch ein
// einzeiliges Feld zaehlt - im Embed sind Titel und Fusszeile genau das.
type Field = HTMLTextAreaElement | HTMLInputElement;

let lastArea: Field | null = null;

/**
 * Merkt sich ein Feld, sobald jemand hineinklickt. Ohne das wuesste die
 * Platzhalter-Liste nicht, wohin sie schreiben soll, und traefe immer das
 * erste Feld - im Embed also nie die Beschreibung.
 */
export function trackField(field: Field): void {
    field.addEventListener("focus", () => {
        lastArea = field;
    });
}

function area(value: string, onInput: (value: string) => void): HTMLTextAreaElement {
    const field = document.createElement("textarea");

    field.className = "text tkarea";
    field.rows = 4;
    field.value = value;

    trackField(field);
    field.addEventListener("input", () => onInput(field.value));

    return field;
}

/**
 * Setzt "{platzhalter}" ins zuletzt benutzte Textfeld - dorthin, wo der Cursor
 * steht. Mit host zählt nur ein Feld in diesem Editor: sind zwei Nachrichten
 * offen, landet der Platzhalter sonst in der falschen. Hat dort noch niemand
 * getippt, nimmt er das erste Textfeld.
 */
export function insertPlaceholder(value: string, host?: HTMLElement): boolean {
    const area = lastArea && (!host || host.contains(lastArea)) ? lastArea : (host?.querySelector<Field>("textarea.tkarea, input.text") ?? null);

    if (!value || !area) return false;

    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;

    area.value = `${area.value.slice(0, start)}${value}${area.value.slice(end)}`;
    area.dispatchEvent(new Event("input"));
    area.focus();
    area.setSelectionRange(start + value.length, start + value.length);
    lastArea = area;

    return true;
}

/**
 * Knöpfe für Fett, Code und kleine Schrift. Fett und Code legen sich um die
 * Auswahl (ohne Auswahl steht der Cursor dazwischen), -# gilt für ganze Zeilen:
 * jede markierte Zeile bekommt es - oder verliert es, wenn alle es schon haben.
 */
export function formatTools(field: HTMLTextAreaElement): HTMLElement {
    const done = (): void => {
        field.dispatchEvent(new Event("input"));
        field.focus();
    };
    const wrap = (mark: string): void => {
        const start = field.selectionStart;
        const end = field.selectionEnd;

        field.setRangeText(`${mark}${field.value.slice(start, end)}${mark}`, start, end);
        field.setSelectionRange(start + mark.length, end + mark.length);
        done();
    };
    const small = (): void => {
        const start = field.selectionStart;
        // Endet die Auswahl am Anfang einer Zeile, gehört diese Zeile nicht mehr dazu.
        const end = field.selectionEnd > start && field.value[field.selectionEnd - 1] === "\n" ? field.selectionEnd - 1 : field.selectionEnd;
        const from = field.value.slice(0, start).lastIndexOf("\n") + 1;
        const stop = field.value.indexOf("\n", end);
        const to = stop === -1 ? field.value.length : stop;
        const lines = field.value.slice(from, to).split("\n");
        const all = lines.every((line) => line.startsWith("-# "));

        field.setRangeText(lines.map((line) => (all ? line.slice(3) : line.startsWith("-# ") ? line : `-# ${line}`)).join("\n"), from, to, "select");
        done();
    };
    const knob = (content: Node, label: string, run: () => void): HTMLButtonElement => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "fmtbtn";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.append(content);
        // Ohne das nähme der Klick dem Feld den Fokus - und mit ihm die Auswahl.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", run);

        return button;
    };
    const box = document.createElement("div");
    const bold = document.createElement("b");

    bold.textContent = "B";
    box.className = "fmtgroup";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Formatieren");
    box.append(
        knob(bold, "Fett: **Text**", () => wrap("**")),
        knob(icon("#i-code"), "Code: `Text`", () => wrap("`")),
        knob(document.createTextNode("-#"), "Kleine Schrift: -# am Zeilenanfang", small)
    );

    return box;
}

/** Was die Schicht vom Feld übernimmt: alles, was bestimmt, wo der Text steht und umbricht. */
const MIRRORED = [
    "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "font-feature-settings", "font-kerning",
    "line-height", "letter-spacing", "word-spacing", "tab-size", "text-indent", "text-transform", "text-rendering",
    "white-space", "overflow-wrap", "word-break",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
];

/**
 * Hebt {platzhalter} im Textfeld farbig hervor. Über dem Feld liegt eine
 * Schicht mit demselben Text in derselben Schrift - unsichtbar bis auf die
 * Marker, und Klicks gehen durch sie hindurch. Das Feld bleibt ein normales
 * Textfeld; Schrift und Abstände holt sich die Schicht vom Feld selbst.
 */
export function placeholderMarks(field: HTMLTextAreaElement): HTMLElement {
    const box = document.createElement("div");
    const layer = document.createElement("div");

    box.className = "hlfield";
    layer.className = "hlfield__layer";
    layer.setAttribute("aria-hidden", "true");

    const paint = (): void => {
        const parts: Node[] = [];
        let last = 0;

        for (const match of field.value.matchAll(/\{[A-Za-z0-9._-]+\}/g)) {
            const mark = document.createElement("mark");

            mark.textContent = match[0];
            parts.push(document.createTextNode(field.value.slice(last, match.index)), mark);
            last = match.index + match[0].length;
        }

        // Endet der Text mit einem Umbruch, braucht die letzte Zeile etwas, sonst fehlt sie der Schicht.
        parts.push(document.createTextNode(`${field.value.slice(last)} `));
        layer.replaceChildren(...parts);
        layer.scrollTop = field.scrollTop;
    };
    const copy = (): void => {
        const style = getComputedStyle(field);
        const px = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0;

        for (const name of MIRRORED) layer.style.setProperty(name, style.getPropertyValue(name));

        // So groß wie die Textfläche des Feldes, ohne seinen Rollbalken - sonst bräche
        // der Text in der Schicht an einer anderen Stelle um als im Feld.
        layer.style.width = `${field.clientWidth + px("border-left-width") + px("border-right-width")}px`;
        layer.style.height = `${field.clientHeight + px("border-top-width") + px("border-bottom-width")}px`;
        layer.scrollTop = field.scrollTop;
    };

    // Tippen kann einen Rollbalken bringen oder nehmen - dann ändert sich die Breite.
    field.addEventListener("input", () => {
        paint();
        copy();
    });
    field.addEventListener("scroll", () => {
        layer.scrollTop = field.scrollTop;
    });
    // Feuert, sobald das Feld zum ersten Mal steht, und bei jedem Ziehen am Rand.
    new ResizeObserver(copy).observe(field);
    paint();
    box.append(field, layer);

    return box;
}

function chip(label: string, onRemove: () => void): HTMLElement {
    const box = document.createElement("span");

    box.className = "tkchip";

    const text = document.createElement("span");

    text.textContent = label;

    const remove = document.createElement("button");

    remove.type = "button";
    remove.setAttribute("aria-label", `${label} entfernen`);
    remove.append(icon("#i-x"));
    remove.addEventListener("click", onRemove);

    box.append(text, remove);

    return box;
}

function short(source: string): string {
    if (source.startsWith("{")) return source;
    if (source.startsWith("https://")) return source.replace(/^https:\/\//, "").slice(0, 40);

    return source.split("/").slice(1).join("/");
}

function blockCard(doc: IMessageDoc, index: number, context: IEditorContext): HTMLElement {
    const block = doc.blocks[index];
    const card = document.createElement("div");

    card.className = "tkblock";

    const head = document.createElement("div");

    head.className = "tkblock__head";

    const name = document.createElement("b");

    name.textContent = BLOCK_LABELS[block.type];

    const tools = document.createElement("div");

    const move = (delta: number, symbol: string, label: string) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "iconbtn";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.disabled = index + delta < 0 || index + delta >= doc.blocks.length;
        button.append(icon(symbol));
        button.addEventListener("click", () => {
            const [moved] = doc.blocks.splice(index, 1);

            doc.blocks.splice(index + delta, 0, moved);
            context.onChange(true);
        });

        return button;
    };

    const remove = document.createElement("button");

    remove.type = "button";
    remove.className = "iconbtn is-danger";
    remove.title = "Baustein löschen";
    remove.setAttribute("aria-label", "Baustein löschen");
    remove.append(icon("#i-trash"));
    remove.addEventListener("click", () => {
        doc.blocks.splice(index, 1);
        context.onChange(true);
    });

    tools.append(move(-1, "#i-up", "Nach oben"), move(1, "#i-down", "Nach unten"), remove);
    head.append(name, tools);
    card.append(head);

    if (block.type === "text") {
        card.append(area(block.body, (value) => {
            block.body = value;
            context.onChange();
        }));
    }

    if (block.type === "section") {
        card.append(area(block.body, (value) => {
            block.body = value;
            context.onChange();
        }));

        const row = document.createElement("div");

        row.className = "tkchips";

        if (block.thumbnail) {
            row.append(
                chip(short(block.thumbnail), () => {
                    block.thumbnail = "";
                    context.onChange(true);
                })
            );
        }

        const choose = document.createElement("button");

        choose.type = "button";
        choose.className = "btn btn--quiet";
        choose.append(icon("#i-image"), document.createTextNode(block.thumbnail ? "Bild tauschen" : "Bild wählen"));
        choose.addEventListener("click", async () => {
            const source = await pickImage(context.guildId, context.imagePlaceholders ?? IMAGE_PLACEHOLDERS);

            if (!source) return;

            block.thumbnail = source;
            context.onChange(true);
        });

        row.append(choose);
        card.append(row);
    }

    if (block.type === "image") {
        const row = document.createElement("div");

        row.className = "tkchips";

        for (const [position, source] of block.images.entries()) {
            row.append(
                chip(short(source), () => {
                    block.images.splice(position, 1);
                    context.onChange(true);
                })
            );
        }

        const add = document.createElement("button");

        add.type = "button";
        add.className = "btn btn--quiet";
        add.disabled = block.images.length >= 10;
        add.append(icon("#i-plus"), document.createTextNode("Bild hinzufügen"));
        add.addEventListener("click", async () => {
            const source = await pickImage(context.guildId, context.imagePlaceholders ?? IMAGE_PLACEHOLDERS);

            if (!source) return;

            block.images.push(source);
            context.onChange(true);
        });

        row.append(add);
        card.append(row);
    }

    if (block.type === "separator") {
        const row = document.createElement("div");

        row.className = "tkrow";

        const line = toggle("Linie zeigen", block.line !== false, (on) => {
            block.line = on;
            context.onChange();
        });

        const big = toggle("Großer Abstand", block.big === true, (on) => {
            block.big = on;
            context.onChange();
        });

        row.append(line, big);
        card.append(row);
    }

    return card;
}

function toggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
    const box = document.createElement("label");

    box.className = "tktoggle";

    const input = document.createElement("input");

    input.type = "checkbox";
    input.className = "switch";
    input.checked = on;
    input.addEventListener("change", () => onChange(input.checked));

    const text = document.createElement("span");

    text.textContent = label;
    box.append(input, text);

    return box;
}

/** Zeichnet den Editor neu. Der Aufrufer hält das Dokument und ruft nach jeder Änderung. */
/**
 * Die Auswahl "Platzhalter einfügen": oben die festen, darunter je Gruppe eine
 * Überschrift - die Team-Übersicht ordnet so ihre Spieler. Nach der Wahl springt
 * sie zurück, damit derselbe Platzhalter gleich noch einmal geht.
 */
export function placeholderPicker(list: IPlaceholder[], onPick: (value: string) => void): HTMLSelectElement {
    const picker = document.createElement("select");
    const groups = new Map<string, HTMLOptGroupElement>();

    picker.className = "pick";
    picker.setAttribute("aria-label", "Platzhalter einfügen");
    picker.append(new Option("Platzhalter einfügen …", ""));

    for (const entry of list) {
        const option = new Option(`${entry.label} · {${entry.key}}`, `{${entry.key}}`);

        if (!entry.group) {
            picker.append(option);
            continue;
        }

        let group = groups.get(entry.group);

        if (!group) {
            group = document.createElement("optgroup");
            group.label = entry.group;
            groups.set(entry.group, group);
        }

        group.append(option);
    }

    picker.append(...groups.values());
    picker.addEventListener("change", () => {
        const value = picker.value;

        picker.value = "";

        if (value) onPick(value);
    });

    return picker;
}

/**
 * Das Menü in zwei Stufen als eine Auswahl: erst die Zweige, nach der Wahl die
 * Platzhalter dieses Zweigs und ganz oben der Weg zurück. Eingefügt wird wie
 * im ersten Menü; danach bleibt der Zweig offen - der nächste Platzhalter
 * desselben Teams ist meist nur einen Klick entfernt.
 */
export function placeholderTree(tree: IPlaceholderTree, onPick: (value: string) => void): HTMLSelectElement {
    const picker = document.createElement("select");
    let open: number | null = null;

    picker.className = "pick";

    const draw = (): void => {
        const branch = open === null ? null : tree.branches[open];

        picker.setAttribute("aria-label", branch ? `Platzhalter aus ${branch.label}` : tree.label);
        picker.replaceChildren(new Option(branch ? `${branch.label}: einfügen …` : tree.label, ""));

        if (!branch) {
            picker.append(...tree.branches.map((entry, index) => new Option(`${entry.label} ›`, `branch:${index}`)));

            return;
        }

        const groups = new Map<string, HTMLOptGroupElement>();

        picker.append(new Option(tree.back, "back"));

        for (const entry of branch.placeholders) {
            const option = new Option(`${entry.label} · {${entry.key}}`, `{${entry.key}}`);

            // Ohne Überschrift direkt darunter - etwa die Werte einer Aufgabe.
            if (!entry.group) {
                picker.append(option);
                continue;
            }

            let group = groups.get(entry.group);

            if (!group) {
                group = document.createElement("optgroup");
                group.label = entry.group;
                groups.set(entry.group, group);
            }

            group.append(option);
        }

        picker.append(...groups.values());
    };

    picker.addEventListener("change", () => {
        const value = picker.value;

        if (value.startsWith("branch:") || value === "back") {
            open = value === "back" ? null : Number(value.slice(7));
            draw();
            picker.focus();

            return;
        }

        picker.value = "";

        if (value) onPick(value);
    });

    draw();

    return picker;
}

export function renderEditor(host: HTMLElement, doc: IMessageDoc, context: IEditorContext): void {
    const bar = document.createElement("div");

    bar.className = "tktools";

    const color = document.createElement("input");

    color.type = "color";
    color.className = "tkcolor";
    color.value = doc.accent ?? "#ff1e2d";
    color.title = "Die eigene Farbe am Rand der Karte";
    color.disabled = !doc.accent;
    color.setAttribute("aria-label", "Custom Color");
    color.addEventListener("input", () => {
        doc.accent = color.value;
        context.onChange();
    });

    // Ohne Akzent zeigt Discord die Karte ohne farbigen Balken. Das Feld fällt
    // dann ganz weg - der Bot setzt nur, was im Dokument steht.
    const stripe = document.createElement("input");

    stripe.type = "checkbox";
    stripe.className = "switch";
    stripe.checked = Boolean(doc.accent);
    stripe.setAttribute("aria-label", "Custom Color an");
    stripe.addEventListener("change", () => {
        if (stripe.checked) doc.accent = color.value;
        else delete doc.accent;

        color.disabled = !stripe.checked;
        context.onChange();
    });

    const stripeBox = document.createElement("label");

    stripeBox.className = "tkstripe";
    stripeBox.title = "An: die Karte hat am Rand deine Farbe. Aus: Discord zeigt sie ohne Farbe";
    stripeBox.append(stripe, document.createTextNode("Custom Color"));

    bar.append(stripeBox, color, placeholderPicker(context.placeholders ?? PLACEHOLDERS, (value) => insertPlaceholder(value)));

    if (context.tree?.branches.length) bar.append(placeholderTree(context.tree, (value) => insertPlaceholder(value)));

    // Server-Emojis gehoeren in denselben Griff wie die Platzhalter: beide
    // setzen etwas an der Stelle ein, an der zuletzt der Cursor stand.
    if (context.emojis?.length) {
        bar.append(
            emojiPicker({
                value: null,
                emojis: context.emojis,
                label: "Emoji einfügen",
                insert: true,
                onPick: (value) => {
                    if (value) insertPlaceholder(value, host);
                },
            })
        );
    }

    for (const [type, label] of Object.entries(BLOCK_LABELS) as [IMessageBlock["type"], string][]) {
        const add = document.createElement("button");

        add.type = "button";
        add.className = "btn btn--quiet";
        add.append(icon("#i-plus"), document.createTextNode(label));
        add.addEventListener("click", async () => {
            const fresh: IMessageBlock =
                type === "text"
                    ? { type: "text", body: "" }
                    : type === "image"
                      ? { type: "image", images: [] }
                      : type === "separator"
                        ? { type: "separator", line: true }
                        : { type: "section", body: "", thumbnail: "" };

            // Bausteine, die ohne Bild nichts zeigen, fragen gleich danach -
            // sonst steht ein leerer Kasten da, und der Knopf dafuer ist erst
            // zu finden, wenn man ihn sucht. Abbrechen ist erlaubt.
            if (fresh.type === "section" || fresh.type === "image") {
                const source = await pickImage(context.guildId, context.imagePlaceholders ?? IMAGE_PLACEHOLDERS);

                if (source) {
                    if (fresh.type === "section") fresh.thumbnail = source;
                    else fresh.images = [source];
                }
            }

            doc.blocks.push(fresh);
            context.onChange(true);
        });

        bar.append(add);
    }

    const list = document.createElement("div");

    list.className = "tkblocks";

    for (let index = 0; index < doc.blocks.length; index++) list.append(blockCard(doc, index, context));

    if (doc.blocks.length === 0) {
        const empty = document.createElement("p");

        empty.className = "hintline";
        empty.textContent = "Noch kein Baustein – ohne Text bleibt die Nachricht leer.";
        list.append(empty);
    }

    const cost = document.createElement("p");
    const used = docCost(doc);

    cost.className = "hintline";
    cost.textContent = `${used} von ${BLOCK_BUDGET} Bausteinen belegt${used > BLOCK_BUDGET - 6 ? " – für Knöpfe und Menü sollte Platz bleiben." : "."}`;

    host.replaceChildren(bar, list, cost);
}

/* ----------------------------------------------------------
   Vorschau
   ---------------------------------------------------------- */
const INLINE = /(\*\*.+?\*\*|__.+?__|\*.+?\*|~~.+?~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|<a?:\w{2,32}:\d{17,20}>|<@&?\d+>|<#\d+>|<t:\d+(?::[tTdDfFR])?>)/g;

function mention(token: string, context: IEditorContext): HTMLElement {
    const pill = document.createElement("span");

    pill.className = "tkmention";

    if (token.startsWith("<@&")) {
        const id = token.slice(3, -1);

        pill.textContent = `@${context.roles?.get(id) ?? "Rolle"}`;
    } else if (token.startsWith("<@")) {
        const id = token.slice(2, -1);

        pill.textContent = `@${context.values["user.name"] && id === context.values["user.id"] ? context.values["user.name"] : "User"}`;
    } else {
        const id = token.slice(2, -1);

        pill.textContent = `#${context.channels?.get(id) ?? "kanal"}`;
    }

    return pill;
}

function inline(text: string, host: HTMLElement, context: IEditorContext): void {
    for (const part of text.split(INLINE)) {
        if (!part) continue;

        if (/^<a?:\w{2,32}:\d{17,20}>$/.test(part)) {
            host.append(emojiNode(part, [...(context.emojis ?? []), ...(context.previewEmojis ?? [])], "tkemoji"));
            continue;
        }

        if (part.startsWith("<@") || part.startsWith("<#")) {
            host.append(mention(part, context));
            continue;
        }

        if (part.startsWith("<t:")) {
            const seconds = Number(part.slice(3).split(":")[0]);
            const stamp = document.createElement("span");

            stamp.className = "tkmention";
            stamp.textContent = new Date(seconds * 1000).toLocaleString("de-DE");
            host.append(stamp);
            continue;
        }

        const wrap = (tag: string, inner: string) => {
            const element = document.createElement(tag);

            inline(inner, element, context);
            host.append(element);
        };

        if (part.startsWith("**") && part.endsWith("**")) wrap("strong", part.slice(2, -2));
        else if (part.startsWith("__") && part.endsWith("__")) wrap("u", part.slice(2, -2));
        else if (part.startsWith("*") && part.endsWith("*")) wrap("em", part.slice(1, -1));
        else if (part.startsWith("~~") && part.endsWith("~~")) wrap("s", part.slice(2, -2));
        else if (part.startsWith("`") && part.endsWith("`")) {
            const code = document.createElement("code");

            code.textContent = part.slice(1, -1);
            host.append(code);
        } else if (part.startsWith("[")) {
            const label = part.slice(1, part.indexOf("]"));
            const link = document.createElement("span");

            link.className = "tklink";
            link.textContent = label;
            host.append(link);
        } else host.append(document.createTextNode(part));
    }
}

export function markdown(text: string, context: IEditorContext): DocumentFragment {
    const fragment = document.createDocumentFragment();
    let list: HTMLUListElement | null = null;

    // Anfang und Ende kürzt der Bot beim Senden weg, Discord ebenso - also hier auch.
    for (const raw of text.trim().split("\n")) {
        const line = raw.trimEnd();

        if (/^[-*] /.test(line)) {
            list ??= document.createElement("ul");

            const item = document.createElement("li");

            inline(line.slice(2), item, context);
            list.append(item);

            if (!list.parentNode) fragment.append(list);

            continue;
        }

        list = null;

        // Eine leere Zeile ist in Discord ein Absatz. Ohne den Abstand sah es
        // in der Vorschau so aus, als hätte Enter nichts getan.
        if (!line) {
            const gap = document.createElement("div");

            gap.className = "tkprev__gap";
            fragment.append(gap);
            continue;
        }

        const heading = /^(#{1,3}) /.exec(line);
        const element = document.createElement(
            line.startsWith("-# ") ? "small" : heading ? `h${Math.min(Number(heading[1].length) + 1, 4)}` : "p"
        );

        element.className = line.startsWith("-# ") ? "tkprev__small" : "tkprev__line";
        inline(line.replace(/^(#{1,3}|-#) /, ""), element, context);
        fragment.append(element);
    }

    return fragment;
}

function image(source: string, context: IEditorContext, className: string): HTMLElement {
    const filled = source.startsWith("{") ? fill(source, context.values) : source;
    const url = filled.startsWith("https://") ? filled : galleryUrl(context.guildId, filled);

    if (!url) {
        const missing = document.createElement("span");

        missing.className = "tkmissing";
        missing.textContent = source.startsWith("{") ? source : "Bild nicht gefunden";

        return missing;
    }

    const picture = document.createElement("img");

    picture.className = className;
    picture.loading = "lazy";
    picture.alt = "";
    picture.src = url;

    return picture;
}

/** Zeichnet die Vorschau. extra hängt darunter, etwa das Aktions-Menü. */
export function renderPreview(host: HTMLElement, doc: IMessageDoc, context: IEditorContext, extra?: Node): void {
    const card = document.createElement("div");

    card.className = "tkprev";
    // Ohne Custom Color zeigt Discord die Karte ohne farbigen Rand: der Rahmen ist
    // dann rundum gleich (is-plain), und unter der Vorschau steht es in Worten.
    card.classList.toggle("is-plain", !doc.accent);

    if (doc.accent) card.style.setProperty("--accent", doc.accent);

    // Plan 39: data-block - ein Klick im Studio wählt den Baustein.
    for (const [index, block] of doc.blocks.entries()) {
        const before = card.childElementCount;

        if (block.type === "text") {
            const body = document.createElement("div");

            body.append(markdown(fill(block.body, context.values), context));
            card.append(body);
        }

        if (block.type === "separator") {
            const line = document.createElement("div");

            line.className = `tkprev__sep${block.big ? " is-big" : ""}${block.line === false ? " is-blank" : ""}`;
            card.append(line);
        }

        if (block.type === "image") {
            const grid = document.createElement("div");

            grid.className = "tkprev__gallery";

            for (const source of block.images) grid.append(image(source, context, "tkprev__image"));

            card.append(grid);
        }

        if (block.type === "section") {
            const section = document.createElement("div");

            section.className = "tkprev__section";

            const body = document.createElement("div");

            body.append(markdown(fill(block.body, context.values), context));
            section.append(body, image(block.thumbnail, context, "tkprev__thumb"));
            card.append(section);
        }

        if (card.childElementCount > before) (card.lastElementChild as HTMLElement).dataset.block = String(index);
    }

    if (doc.blocks.length === 0) {
        const empty = document.createElement("p");

        empty.className = "hintline";
        empty.textContent = "Leere Nachricht – der Bot schickt dann nur einen kurzen Platzhalter.";
        card.append(empty);
    }

    if (extra) card.append(extra);

    // Steht die Karte in einem Vorschau-Rahmen (.tkprev), zeichnet nur noch sie
    // einen - sonst sähe ein grauer Streifen des Rahmens aus wie eine Farbe.
    host.classList.add("is-host");

    if (doc.accent) {
        host.replaceChildren(card);

        return;
    }

    const note = document.createElement("p");

    note.className = "tkprev__plain";
    note.textContent = "Custom Color ist aus: in Discord hat die Karte keinen farbigen Rand.";
    host.replaceChildren(card, note);
}
