/**
 * Der Inhalts-Editor: Art wählen, Inhalt bauen, Vorschau daneben.
 *
 * Dieselbe Sache für Custom Message (Nachrichten und Stichwörter) und für das
 * Welcome System. Drei Arten kennt er selbst - Karte im Components-V2-Stil,
 * Embed und normale Nachricht. Eine vierte darf die Seite mitbringen: die
 * gezeichnete Begrüßungskarte baut ihr Formular und ihre Vorschau selbst.
 */

import { icon } from "../core/Dom.js";
import { PLACEHOLDERS, fill } from "../constants/Placeholders.js";
import { button, el, row, select, toggle } from "../core/Ui.js";
import { emojiPicker } from "./EmojiPicker.js";
import { galleryUrl, loadGallery, pickImage } from "./ImagePicker.js";
import { toast } from "../core/Toast.js";
import { templateBar } from "./Templates.js";
import { TemplateScope } from "../constants/Templates.js";
import { IEditorContext, IMessageDoc, insertPlaceholder, markdown, placeholderPicker, placeholderTree, renderEditor, renderPreview, trackField } from "./MessageEditor.js";

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
    custom?: { kind: string; form: (refresh: () => void) => HTMLElement; preview: () => Node | null };
    /** Überschrift über dem Editor. */
    title?: string;
    /** Fertige Nachrichten zum Anklicken - siehe constants/Templates.ts. */
    templates?: TemplateScope;
    /** Was unter dem Auswahlfeld steht. */
    hint?: string;
}

export interface IBodyEditor {
    node: HTMLElement;
    /** Zeichnet nur die Vorschau neu. */
    refresh: () => void;
    /** Zeichnet Formular und Vorschau neu - nach einem Wechsel der Art. */
    redraw: () => void;
}

/** Die Felder eines Embeds - Name, Wert, nebeneinander. */
function fieldList(embed: IEmbed, touch: () => void, refresh: () => void): HTMLElement {
    const box = el("div", "cmfields");
    const draw = (): void => {
        box.replaceChildren();

        for (const field of embed.fields) {
            const name = el("input", "text cmfield__name");
            // Ein Feldwert darf in Discord mehrere Zeilen haben - also kein <input>.
            const value = el("textarea", "text tkarea cmfield__value");
            const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

            name.type = "text";
            name.value = field.name;
            name.maxLength = 256;
            name.placeholder = "Name";
            name.setAttribute("aria-label", "Name des Feldes");
            name.addEventListener("input", () => {
                field.name = name.value;
                touch();
                refresh();
            });

            value.rows = 2;
            value.value = field.value;
            value.maxLength = 1024;
            value.placeholder = "Wert";
            value.setAttribute("aria-label", "Wert des Feldes");
            value.addEventListener("input", () => {
                field.value = value.value;
                touch();
                refresh();
            });

            remove.title = "Feld entfernen";
            remove.addEventListener("click", () => {
                embed.fields.splice(embed.fields.indexOf(field), 1);
                touch();
                draw();
                refresh();
            });

            box.append(
                el(
                    "div",
                    "cmfield",
                    name,
                    value,
                    el("label", "snitem__switch", toggle(field.inline, "Nebeneinander", (on) => {
                        field.inline = on;
                        touch();
                        refresh();
                    }), el("span", "", "nebeneinander")),
                    remove
                )
            );
        }

        const add = button("btn btn--quiet", icon("#i-plus"), "Feld hinzufügen");

        add.disabled = embed.fields.length >= 10;
        add.addEventListener("click", () => {
            embed.fields.push({ name: "Feld", value: "Wert", inline: false });
            touch();
            draw();
            refresh();
        });

        box.append(add);
    };

    draw();

    return row("Felder", "Bis zu zehn – gut für Listen", box);
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
        box.append(small);
    }

    if (embed.author?.name) box.append(el("div", "cmembed__author", text(embed.author.name)));
    if (embed.title) box.append(el("div", "cmembed__title", text(embed.title)));
    if (embed.description) box.append(rich(embed.description, "cmembed__text"));

    if (embed.fields.length) {
        const grid = el("div", "cmembed__fields");

        for (const field of embed.fields) {
            grid.append(el("div", `cmembed__field${field.inline ? " is-inline" : ""}`, el("b", "", text(field.name)), rich(field.value, "")));
        }

        box.append(grid);
    }

    const big = imageUrl(embed.image, guildId, values);

    if (big) {
        const image = el("img", "cmembed__image");

        image.src = big;
        image.alt = "";
        box.append(image);
    }

    if (embed.footer?.text || embed.timestamp) {
        box.append(el("div", "cmembed__footer", [embed.footer?.text ? text(embed.footer.text) : null, embed.timestamp ? "heute um 20:00" : null].filter(Boolean).join(" · ")));
    }

    return box;
}

export function bodyEditor(entry: IBody, options: IBodyOptions): IBodyEditor {
    const { context, touch } = options;
    const editorHost = el("div", "");
    const fields = el("div", "cmembed__form");
    const forms = el("div", "sneditor__forms", editorHost, fields);
    const preview = el("div", "tkprev");
    const extra = (): Node | null => options.extras?.() ?? null;

    const paintPreview = (): void => {
        // Nur eine Karte zeichnet ihren eigenen Rahmen (renderPreview) - Embed, Text und eigene Vorschauen stehen im Rahmen hier.
        preview.classList.remove("is-host");

        if (entry.kind === options.custom?.kind) {
            const own = options.custom.preview();

            preview.replaceChildren(...(own ? [own] : [el("span", "tkempty", "Noch keine Vorschau.")]));

            return;
        }

        if (entry.kind === "v2") {
            renderPreview(preview, entry.doc, context(), extra() ?? undefined);

            return;
        }

        const parts: Node[] = [];
        const values = context().values;

        // Der Text wird wie in Discord gelesen: fett, Erwähnungen, Links. Roh
        // stehenzulassen hiesse, dass die Vorschau anders aussieht als das,
        // was rausgeht.
        if (entry.content.trim()) {
            const box = el("div", "cmtext");

            box.append(markdown(fill(entry.content, values), context()));
            parts.push(box);
        }
        if (entry.kind === "embed" && entry.embed) parts.push(embedPreview(entry.embed, values, context().guildId, context()));

        const tail = extra();

        if (tail) parts.push(tail);

        preview.replaceChildren(...(parts.length ? parts : [el("span", "tkempty", "Noch nichts geschrieben.")]));
    };

    /**
     * Die Platzhalter zum Anklicken. Sie schreiben in das Feld, in dem zuletzt
     * der Cursor stand - so landet {user} im Titel, wenn man dort war, und in
     * der Beschreibung, wenn man dort war.
     */
    const placeholders = (): HTMLElement => {
        const picker = placeholderPicker(context().placeholders ?? PLACEHOLDERS, (value) => {
            if (!insertPlaceholder(value, forms)) {
                toast("info", "Kein Feld offen", "Klick erst in das Feld, in das der Platzhalter soll.");
            }
        });

        const tools = el("div", "tktools cmph", picker);
        const tree = context().tree;

        // Das zweite Menü, etwa erst das Team, dann seine Spieler.
        if (tree?.branches.length) {
            tools.append(
                placeholderTree(tree, (value) => {
                    if (!insertPlaceholder(value, forms)) toast("info", "Kein Feld offen", "Klick erst in das Feld, in das der Platzhalter soll.");
                })
            );
        }
        const emojis = context().emojis ?? [];

        // Dieselbe Sache wie im Karten-Editor - ohne den Knopf muesste man
        // <:name:id> von Hand abtippen.
        if (emojis.length) {
            tools.append(
                emojiPicker({
                    value: null,
                    emojis,
                    label: "Emoji einfügen",
                    insert: true,
                    onPick: (value) => {
                        if (value && !insertPlaceholder(value, forms)) {
                            toast("info", "Kein Feld offen", "Klick erst in das Feld, in das das Emoji soll.");
                        }
                    },
                })
            );
        }

        return tools;
    };

    const draw = (): void => {
        editorHost.replaceChildren();
        fields.replaceChildren();
        kind.value = entry.kind;

        if (entry.kind === options.custom?.kind) {
            editorHost.append(options.custom.form(paintPreview));
            paintPreview();

            return;
        }

        if (entry.kind === "v2") {
            // renderEditor zeichnet einmal. Kommt ein Baustein dazu, geht einer
            // weg oder wird einer verschoben (structural), muss die Liste neu -
            // sonst steht sie still, bis jemand die Seite neu laedt. Beim Tippen
            // ist structural falsch, damit das Textfeld den Fokus behaelt.
            const drawDoc = (): void => {
                renderEditor(editorHost, entry.doc, {
                    ...context(),
                    onChange: (structural) => {
                        touch();

                        if (structural) drawDoc();

                        paintPreview();
                    },
                });
            };

            drawDoc();
            paintPreview();

            return;
        }

        // Dieselbe Liste wie im Karten-Editor: ohne sie muesste man Platzhalter
        // aus der Doku abtippen, sobald die Nachricht kein V2 ist.
        editorHost.append(placeholders());

        const content = el("textarea", "text tkarea");

        content.rows = entry.kind === "text" ? 6 : 3;
        content.value = entry.content;
        content.maxLength = 2000;
        content.placeholder = entry.kind === "text" ? "Die Nachricht – Markdown und <@Rollen> gehen" : "Optionaler Text über dem Embed";
        content.setAttribute("aria-label", entry.kind === "text" ? "Die Nachricht" : "Text über dem Embed");
        trackField(content);
        content.addEventListener("input", () => {
            entry.content = content.value;
            touch();
            paintPreview();
        });
        editorHost.append(el("label", "mcfield", el("span", "mcfield__label", entry.kind === "text" ? "Die Nachricht" : "Text über dem Embed"), content));

        if (entry.kind !== "embed") {
            paintPreview();

            return;
        }

        entry.embed ??= options.defaultEmbed();

        const embed = entry.embed;
        const text = (label: string, hint: string, value: string | null, max: number, onChange: (value: string) => void, rows = 0): HTMLElement => {
            // rows 0: einzeilig. Sonst ein Textfeld, in dem Enter eine neue Zeile macht.
            const field = rows ? el("textarea", "text tkarea") : el("input", "text");

            if (rows) (field as HTMLTextAreaElement).rows = rows;
            else (field as HTMLInputElement).type = "text";

            (field as HTMLInputElement).value = value ?? "";
            (field as HTMLInputElement).maxLength = max;
            field.setAttribute("aria-label", label);
            trackField(field as HTMLInputElement);
            field.addEventListener("input", () => {
                onChange((field as HTMLInputElement).value);
                touch();
                paintPreview();
            });

            return row(label, hint, field);
        };

        /**
         * Ein Bild im Embed: aus der Galerie, frisch hochgeladen, als Adresse
         * oder als Platzhalter. Dieselbe Auswahl wie im Karten-Editor - nur so
         * landet ein Galerie-Bild auch wirklich als Bild-ID im Embed.
         */
        const imageRow = (label: string, hint: string, get: () => string | null, set: (value: string | null) => void): HTMLElement => {
            const box = el("div", "cmimg");
            let tried = false;

            const draw = (): void => {
                const value = get();
                const guildId = context().guildId;
                const pick = button("btn btn--quiet", icon("#i-image"), value ? "Bild tauschen" : "Bild wählen");
                const parts: Node[] = [];

                pick.addEventListener("click", async () => {
                    const source = await pickImage(guildId, context().imagePlaceholders);

                    if (!source) return;

                    set(source);
                    touch();
                    draw();
                    paintPreview();
                });

                if (value) {
                    const url = imageUrl(value, guildId);
                    const drop = button("btn btn--quiet btn--icon", icon("#i-x"));

                    if (url) {
                        const thumb = el("img", "cmimg__thumb");

                        thumb.src = url;
                        thumb.alt = "";
                        parts.push(thumb);
                    } else if (!value.startsWith("{") && !tried) {
                        // Die Galerie steckt noch nicht im Speicher - einmal holen, dann steht das Bild da.
                        tried = true;
                        void loadGallery(guildId).then(draw);
                    }

                    drop.title = `${label} entfernen`;
                    drop.setAttribute("aria-label", `${label} entfernen`);
                    drop.addEventListener("click", () => {
                        set(null);
                        touch();
                        draw();
                        paintPreview();
                    });

                    parts.push(el("code", "cmimg__name", value.startsWith("{") ? value : (value.split("/").pop() ?? value)), drop);
                }

                box.replaceChildren(...parts, pick);
            };

            draw();

            return row(label, hint, box);
        };

        const color = el("input", "tkcolor");

        color.type = "color";
        color.value = embed.color ?? "#00afff";
        color.setAttribute("aria-label", "Farbe des Embeds");
        color.addEventListener("input", () => {
            embed.color = color.value;
            touch();
            paintPreview();
        });

        fields.append(
            text("Überschrift", "Steht oben, fett", embed.title, 256, (value) => (embed.title = value || null)),
            text("Text", "Der Inhalt des Embeds", embed.description, 4000, (value) => (embed.description = value || null), 4),
            row("Farbe", "Der Balken links", color),
            imageRow("Bild", "Steht groß unten", () => embed.image, (value) => (embed.image = value)),
            imageRow("Kleines Bild", "Steht rechts oben", () => embed.thumbnail, (value) => (embed.thumbnail = value)),
            text("Autor", "Kleine Zeile ganz oben", embed.author?.name ?? null, 256, (value) => (embed.author = value ? { name: value, icon: embed.author?.icon ?? null } : null)),
            text("Fußzeile", "Kleine Zeile ganz unten", embed.footer?.text ?? null, 2048, (value) => (embed.footer = value ? { text: value, icon: embed.footer?.icon ?? null } : null), 2),
            row(
                "Uhrzeit",
                "Zeigt unten, wann die Nachricht raus ging",
                el("label", "snitem__switch", toggle(embed.timestamp, "Uhrzeit zeigen", (on) => {
                    embed.timestamp = on;
                    touch();
                    paintPreview();
                }), el("span", "", "zeigen"))
            ),
            fieldList(embed, touch, paintPreview)
        );

        paintPreview();
    };

    const bar = options.templates
        ? templateBar<IBody>(options.templates, {
              take: () => structuredClone({ kind: entry.kind, content: entry.content, embed: entry.embed, doc: entry.doc }),
              put: (state) => {
                  Object.assign(entry, structuredClone(state));
                  touch();
                  draw();
              },
              apply: (template) => {
                  const body = template.body;

                  if (body.kind !== undefined) entry.kind = body.kind;
                  if (body.content !== undefined) entry.content = body.content;
                  if (body.embed !== undefined) entry.embed = structuredClone(body.embed);
                  if (body.doc !== undefined) entry.doc = structuredClone(body.doc);

                  touch();
                  draw();
              },
          })
        : null;

    const kind = select(
        Object.entries(options.kinds).map(([value, label]): [string, string] => [value, label]),
        entry.kind,
        (value) => {
            entry.kind = value;
            touch();
            draw();
        },
        "Art der Nachricht"
    );

    // "Karte (Components V2)" passt nicht ins schmale Standardfeld.
    kind.classList.add("sneditor__kind");
    draw();

    return {
        node: el(
            "div",
            "sneditor",
            el(
                "div",
                "sneditor__main",
                el("div", "sneditor__bar", el("h4", "sneditor__title", options.title ?? "Inhalt"), kind),
                ...(options.hint ? [el("p", "hintline", options.hint)] : []),
                ...(bar ? [bar] : []),
                forms
            ),
            el("aside", "sneditor__side", el("div", "tkside__head", el("span", "tkside__live", "Live-Vorschau")), preview)
        ),
        refresh: paintPreview,
        redraw: draw,
    };
}
