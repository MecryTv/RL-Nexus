/**
 * Plan 39: der Nachrichten-Builder im Studio (Spec 2026-10-31-studio-design.md
 * Teil 3, Entwurf studio-nachrichten.html). bodyEditor() gibt dieses Studio
 * zurück - Schnittstelle und Optionen bleiben, die Seiten ändern sich nicht.
 *
 * Oben die Art, links Vorlagen, Bausteine, Aufbau und Stil, in der Mitte die
 * Nachricht wie in Discord (ein Klick wählt einen Teil), rechts der Inspektor.
 * Alles ändert die Nachricht der Seite an Ort und Stelle; Rückgängig holt
 * frühere Stände über restore() in dasselbe Objekt zurück.
 */

import { BASE } from "../core/Base.js";
import { icon } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { button, el, toggle } from "../core/Ui.js";
import { PLACEHOLDERS, fill } from "../constants/Placeholders.js";
import type { IBody, IBodyEditor, IBodyOptions, ICustomStage, IEmbed } from "./BodyEditor.js";
import { embedPreview, imageUrl } from "./BodyEditor.js";
import { emojiPicker } from "./EmojiPicker.js";
import { pickImage } from "./ImagePicker.js";
import { IMessageBlock, insertPlaceholder, markdown, placeholderMarks, placeholderPicker, placeholderTree, renderPreview, trackField } from "./MessageEditor.js";
import { authorOf, BLOCK_BUDGET, canAddBlock, canDuplicate, docCost, duplicatePart, EMBED_MAX, MAX_FIELDS, messageLength, messageParts, movePart, removePart, restore } from "./MessageStudioCore.js";
import { iconButton, pathIcon, studio } from "./Studio.js";
import { History } from "./StudioCore.js";
import { templateBar } from "./Templates.js";

/** Wie viele Zeichen Discord je Art erlaubt. */
const LIMIT: Record<string, number> = { v2: 4000, embed: 6000, text: 2000 };

const PATHS = {
    up: "m6 15 6-6 6 6",
    down: "m6 9 6 6 6-6",
    copy: "M8 8h13v13H8zM4 16V5a1 1 0 0 1 1-1h11",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
} as const;

const NUMBER = new Intl.NumberFormat("de-DE");

/** Was ein neuer Baustein der Karte mitbringt. */
function freshBlock(type: IMessageBlock["type"]): IMessageBlock {
    if (type === "text") return { type, body: "Neuer Text" };
    if (type === "image") return { type, images: [] };
    if (type === "separator") return { type, line: true };

    return { type: "section", body: "Text neben dem Bild", thumbnail: "" };
}

export function messageStudio(entry: IBody, options: IBodyOptions): IBodyEditor {
    const host = el("div", "stm-host");
    /** Plan 42: die Bühne der eigenen Art - erst gebaut, wenn jemand auf diese Art wechselt. */
    let own: ICustomStage | null = null;
    const history = new History<IBody & { own?: unknown }>();
    // Der Zustand der eigenen Bühne (etwa die Welcome-Karte) gehört mit in jeden Schritt.
    const snapshot = (): IBody & { own?: unknown } => structuredClone({ kind: entry.kind, content: entry.content, embed: entry.embed, doc: entry.doc, ...(own ? { own: own.take() } : {}) });
    /** block:2, field:0, title … - oder null: das Ganze. */
    let selected: string | null = null;

    const context = () => options.context();
    const isCustom = (): boolean => entry.kind === options.custom?.kind;
    const staged = (): boolean => isCustom() && Boolean(options.custom?.stage);

    function ownStage(): ICustomStage {
        own ??= options.custom!.stage!({
            remember: (key = "") => {
                history.remember(snapshot(), key);
                s.setHistory(history.canUndo, history.canRedo);
                options.touch();
            },
            repaint: () => paintInspector(),
        });

        return own;
    }

    /* ------------------------------------------------------------
       Hülle
       ------------------------------------------------------------ */
    const kinds = el("div", "sto-seg stm-kinds");

    kinds.setAttribute("aria-label", "Art der Nachricht");

    for (const [value, label] of Object.entries(options.kinds)) {
        const option = button("", label);

        option.dataset.kind = value;
        option.addEventListener("click", () => {
            if (entry.kind === value) return;

            history.remember(snapshot());
            entry.kind = value;

            if (value === "embed") entry.embed ??= options.defaultEmbed();

            selected = null;
            structural();
        });
        kinds.append(option);
    }

    const messagePanels = [
        ...(options.templates ? [{ id: "templates", label: "Vorlagen", icon: "#i-layout", render: paintTemplates }] : []),
        { id: "blocks", label: "Bausteine", icon: "#i-plus", render: paintBlocks },
        { id: "structure", label: "Aufbau", icon: "#i-list", render: paintStructure },
        { id: "style", label: "Stil", icon: "#i-contrast", render: paintStyle },
    ];
    // Welche Fächer links stehen: die der Nachricht oder die der eigenen Bühne.
    let railFor: "message" | "own" = "message";

    const s = studio(host, {
        title: options.title ?? "Inhalt",
        head: kinds,
        panels: messagePanels,
        pill: "Vorschau mit deinen Daten",
        onUndo: () => travel(history.undo(snapshot())),
        onRedo: () => travel(history.redo(snapshot())),
        ...(options.test ? { test: options.test } : {}),
        ...(options.pageSave ? { mirror: options.pageSave } : {}),
    });

    /* ------------------------------------------------------------
       Mitte: die Nachricht wie in Discord
       ------------------------------------------------------------ */
    const body = el("div", "stm-body");
    const avatar = el("img", "stm-av");
    const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    avatar.src = `${BASE}/assets/images/rl-nexus-n-96.png`;
    avatar.alt = "";
    s.canvas.classList.add("stm-canvas");
    const chat = el("div", "stm-chat", el("div", "stm-msg", avatar, el("div", "stm-main", el("div", "stm-head", el("span", "stm-name", "RL Nexus"), el("span", "stm-app", "APP"), el("span", "stm-time", `Heute um ${time}`)), body)));

    s.canvas.append(chat);

    // Ein Klick auf einen Teil wählt ihn - bei der eigenen Art der Seite gibt es keine Teile.
    body.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-block], [data-part]");

        if (!target || !body.contains(target) || isCustom() || entry.kind === "text") return;
        if ((event.target as HTMLElement).closest(".stm-float")) return;

        select(target.dataset.block !== undefined ? `block:${target.dataset.block}` : target.dataset.part!);
    });

    function paintView(): void {
        const extra = options.extras?.() ?? null;

        body.classList.remove("is-host");

        // Plan 42: die eigene Bühne steht statt des Chats in der Mitte.
        chat.hidden = staged();

        if (own) own.canvas.hidden = !staged();

        if (staged()) {
            const stage = ownStage();

            if (!stage.canvas.isConnected) s.canvas.append(stage.canvas);

            return;
        }

        if (isCustom()) {
            const own = options.custom!.preview?.() ?? null;

            body.replaceChildren(own ?? el("p", "stm-empty", "Noch keine Vorschau."));

            return;
        }

        if (entry.kind === "v2") {
            renderPreview(body, entry.doc, context(), extra ?? undefined);
        } else {
            const parts: Node[] = [];
            const values = context().values;

            if (entry.content.trim()) {
                const text = el("div", "cmtext");

                text.dataset.part = "content";
                text.append(markdown(fill(entry.content, values), context()));
                parts.push(text);
            }

            if (entry.kind === "embed" && entry.embed) parts.push(embedPreview(entry.embed, values, context().guildId, context()));
            if (extra) parts.push(extra);

            body.replaceChildren(...(parts.length ? parts : [el("p", "stm-empty", entry.kind === "text" ? "Noch nichts geschrieben – schreib rechts." : "Noch leer. Füg links unter Bausteine etwas hinzu.")]));
        }

        const above = options.above?.() ?? null;

        if (above) body.prepend(above);

        for (const part of body.querySelectorAll<HTMLElement>("[data-block], [data-part]")) {
            const key = part.dataset.block !== undefined ? `block:${part.dataset.block}` : part.dataset.part!;

            part.classList.add("stm-pick");
            part.classList.toggle("is-on", key === selected && entry.kind !== "text");
        }

        paintFloat();
    }

    /** Am gewählten Teil: hoch, runter, duplizieren, löschen - was davon geht. */
    function paintFloat(): void {
        const target = selected ? body.querySelector<HTMLElement>(".stm-pick.is-on") : null;

        if (!target || !selected) return;

        // Ein <img> nimmt keine Kinder - die Leiste hängt dann am Embed drumherum.
        const anchor = target instanceof HTMLImageElement ? target.parentElement! : target;
        const listed = selected.startsWith("block:") || selected.startsWith("field:");
        const bar = el("div", "stm-float");
        const tool = (path: string, label: string, run: () => void, disabled = false): HTMLButtonElement => {
            const action = iconButton(pathIcon(path), label);

            action.disabled = disabled;
            action.addEventListener("click", (event) => {
                event.stopPropagation();
                run();
            });

            return action;
        };
        const key = selected;

        if (listed) {
            bar.append(
                tool(PATHS.up, "Nach oben", () => change(() => (selected = movePart(entry, key, -1) ?? selected))),
                tool(PATHS.down, "Nach unten", () => change(() => (selected = movePart(entry, key, 1) ?? selected))),
                tool(PATHS.copy, "Duplizieren", () => change(() => (selected = duplicatePart(entry, key) ?? selected)), !canDuplicate(entry, key))
            );
        }

        bar.append(
            tool(PATHS.trash, "Löschen", () =>
                change(() => {
                    removePart(entry, key);
                    selected = null;
                })
            )
        );
        anchor.append(bar, el("span", "stm-tag", messageParts(entry).find((part) => part.key === key)?.label ?? "Teil"));
    }

    /* ------------------------------------------------------------
       Ändern, Rückgängig
       ------------------------------------------------------------ */
    function dirty(): void {
        options.touch();
        s.setHistory(history.canUndo, history.canRedo);

    }

    /** Getippt: nur die Mitte neu, der Inspektor behält Fokus und Schreibmarke. */
    function typed(key: string, apply: () => void): void {
        history.remember(snapshot(), key);
        apply();
        paintView();

        if (s.panel() === "structure") s.refreshPanel();

        counter?.();
        dirty();
    }

    /** Etwas am Aufbau: alles neu. */
    function change(apply: () => void): void {
        history.remember(snapshot());
        apply();
        structural();
    }

    function structural(): void {
        paintKinds();
        paintView();
        paintInspector();

        // Die Vorlagen hängen nicht am Stand; neu gebaut verlöre ihre Leiste das „Zurück“.
        if (s.panel() && s.panel() !== "templates") s.refreshPanel();

        dirty();
    }

    function travel(next: (IBody & { own?: unknown }) | null): void {
        if (!next) return;

        restore(entry, next);

        // Plan 42: auch die eigene Bühne zurück (etwa die Welcome-Karte).
        if (own && next.own !== undefined) own.put(next.own);

        if (selected && !messageParts(entry).some((part) => part.key === selected)) selected = null;

        structural();
    }

    function select(key: string | null): void {
        selected = key;
        paintView();
        paintInspector();

        if (s.panel() === "structure") s.refreshPanel();

        s.inspector.querySelector<HTMLElement>("textarea, input[type=text]")?.focus();
    }

    function paintKinds(): void {
        for (const option of kinds.querySelectorAll<HTMLButtonElement>("button")) option.setAttribute("aria-pressed", String(option.dataset.kind === entry.kind));

        // Plan 42: mit der Art wechseln auch die Fächer links.
        const want = staged() ? "own" : "message";

        if (want !== railFor) {
            railFor = want;
            s.setPanels(want === "own" ? ownStage().panels : messagePanels);
        }
    }

    /* ------------------------------------------------------------
       Inspektor
       ------------------------------------------------------------ */
    const group = (title: string, ...children: Node[]): HTMLElement => el("section", "sto-group", el("h3", "sto-h", title), ...children);
    const label = (text: string, control: HTMLElement): HTMLElement => el("label", "sto-field", text, control);
    let counter: (() => void) | null = null;

    /** Einzeilig, für Titel, Autor, Feldname. */
    function line(key: string, value: string, max: number, apply: (value: string) => void, aria: string): HTMLInputElement {
        const input = el("input", "text");

        input.type = "text";
        input.value = value;
        input.maxLength = max;
        input.setAttribute("aria-label", aria);
        trackField(input);
        input.addEventListener("input", () => typed(key, () => apply(input.value)));

        return input;
    }

    /** Formatleiste: fett, kursiv, unterstrichen, durchgestrichen, Überschrift, Liste, Link, kleine Schrift. */
    function formatBar(field: HTMLTextAreaElement): HTMLElement {
        const wrap = (mark: string): void => {
            const { selectionStart: start, selectionEnd: end } = field;

            field.setRangeText(`${mark}${field.value.slice(start, end)}${mark}`, start, end);
            field.setSelectionRange(start + mark.length, end + mark.length);
            field.dispatchEvent(new Event("input"));
            field.focus();
        };
        const prefix = (mark: string): void => {
            const start = field.value.lastIndexOf("\n", field.selectionStart - 1) + 1;

            field.setRangeText(field.value.startsWith(mark, start) ? "" : mark, start, field.value.startsWith(mark, start) ? start + mark.length : start, "end");
            field.dispatchEvent(new Event("input"));
            field.focus();
        };
        const link = (): void => {
            const { selectionStart: start, selectionEnd: end } = field;
            const text = field.value.slice(start, end) || "Text";

            field.setRangeText(`[${text}](https://)`, start, end, "end");
            field.dispatchEvent(new Event("input"));
            field.focus();
        };
        const knob = (content: string, aria: string, run: () => void, style = ""): HTMLButtonElement => {
            const action = button("stm-fmt__b", content);

            action.title = aria;
            action.setAttribute("aria-label", aria);
            if (style) action.setAttribute("style", style);
            // Sonst nähme der Klick dem Feld Fokus und Auswahl.
            action.addEventListener("mousedown", (event) => event.preventDefault());
            action.addEventListener("click", run);

            return action;
        };
        const box = el(
            "div",
            "stm-fmt",
            knob("B", "Fett: **Text**", () => wrap("**"), "font-weight:800"),
            knob("I", "Kursiv: *Text*", () => wrap("*"), "font-style:italic"),
            knob("U", "Unterstrichen: __Text__", () => wrap("__"), "text-decoration:underline"),
            knob("S", "Durchgestrichen: ~~Text~~", () => wrap("~~"), "text-decoration:line-through"),
            knob("H", "Überschrift: ## am Zeilenanfang", () => prefix("## ")),
            knob("•", "Liste: - am Zeilenanfang", () => prefix("- ")),
            knob("🔗", "Link: [Text](https://…)", link),
            knob("-#", "Kleine Schrift: -# am Zeilenanfang", () => prefix("-# "))
        );
        const emojis = context().emojis ?? [];

        if (emojis.length) box.append(emojiPicker({ value: null, emojis, label: "Emoji einfügen", insert: true, onPick: (value) => void (value && insertPlaceholder(value, s.inspector)) }));

        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "Formatieren");

        return box;
    }

    /** Platzhalter einfügen - dorthin, wo zuletzt die Schreibmarke im Inspektor stand. */
    function placeholderTools(): HTMLElement {
        const pick = (value: string): void => {
            if (!insertPlaceholder(value, s.inspector)) toast("info", "Kein Feld offen", "Klick erst in das Feld, in das der Platzhalter soll.");
        };
        const tools = el("div", "stm-ph", placeholderPicker(context().placeholders ?? PLACEHOLDERS, pick));
        const tree = context().tree;

        if (tree?.branches.length) tools.append(placeholderTree(tree, pick));

        return tools;
    }

    /** Mehrzeilig, mit Formatleiste, hervorgehobenen Platzhaltern und Zeichenzähler. */
    function area(key: string, value: string, max: number, apply: (value: string) => void, aria: string, rich = true): HTMLElement {
        const field = el("textarea", "text tkarea");

        field.rows = 5;
        field.value = value;
        field.maxLength = max;
        field.setAttribute("aria-label", aria);
        trackField(field);
        field.addEventListener("input", () => typed(key, () => apply(field.value)));

        return el("div", "stm-area", ...(rich ? [formatBar(field)] : []), placeholderMarks(field), placeholderTools());
    }

    /** Die Länge der ganzen Nachricht. */
    function lengthGroup(): HTMLElement {
        const limit = LIMIT[entry.kind] ?? 4000;
        const bar = el("i", "");
        const text = el("span", "stm-count");
        const update = (): void => {
            const used = messageLength(entry);

            bar.style.width = `${Math.min(100, (used / limit) * 100)}%`;
            text.textContent = `${NUMBER.format(used)} von ${NUMBER.format(limit)} Zeichen`;
            text.classList.toggle("is-over", used > limit);
        };

        counter = update;
        update();

        const blocks = entry.kind === "v2" ? [el("span", "stm-count", `${docCost(entry.doc)} von ${BLOCK_BUDGET} Bausteinen belegt${docCost(entry.doc) > BLOCK_BUDGET - 6 ? " – für Knöpfe und Menü sollte Platz bleiben." : "."}`)] : [];

        return group("Länge der ganzen Nachricht", el("div", "stm-meter", bar), text, ...blocks);
    }

    /** Ein Bild aus der Galerie (oder ein Platzhalter) - wählen, tauschen, entfernen. */
    function imagePick(current: string | null, apply: (value: string | null) => void, aria: string): HTMLElement {
        const pick = button("sto-bt", icon("#i-image"), current ? "Bild tauschen" : "Bild wählen");
        const parts: HTMLElement[] = [];
        const url = current ? imageUrl(current, context().guildId, context().values) : null;

        if (url) {
            const thumb = el("img", "stm-thumb");

            thumb.src = url;
            thumb.alt = "";
            parts.push(thumb);
        }

        pick.addEventListener("click", async () => {
            const source = await pickImage(context().guildId, context().imagePlaceholders);

            if (source) change(() => apply(source));
        });
        parts.push(pick);

        if (current) {
            const drop = iconButton(pathIcon(PATHS.trash), `${aria} entfernen`);

            drop.addEventListener("click", () => change(() => apply(null)));
            parts.push(el("code", "stm-src", current.startsWith("{") ? current : (current.split("/").pop() ?? current)), drop);
        }

        return el("div", "sto-row stm-img", ...parts);
    }

    function blockInspector(index: number): HTMLElement[] {
        const block = entry.doc.blocks[index];
        const key = `block:${index}`;

        if (!block) return [];

        if (block.type === "text") return [group("Text", area(key, block.body, 4000, (value) => (block.body = value), "Text"))];

        if (block.type === "section") {
            return [group("Text mit Bild daneben", area(key, block.body, 4000, (value) => (block.body = value), "Text"), label("Bild daneben", imagePick(block.thumbnail || null, (value) => (block.thumbnail = value ?? ""), "Bild")))];
        }

        if (block.type === "image") {
            const list = el("div", "stm-images");

            block.images.forEach((source, position) => list.append(imagePick(source, (value) => (value ? (block.images[position] = value) : block.images.splice(position, 1)), `Bild ${position + 1}`)));

            const add = button("sto-bt", icon("#i-plus"), "Bild hinzufügen");

            add.disabled = block.images.length >= 10;
            add.addEventListener("click", async () => {
                const source = await pickImage(context().guildId, context().imagePlaceholders);

                if (source) change(() => block.images.push(source));
            });

            return [group("Bilder", list, add, el("p", "sto-note", "Bis zu zehn – Discord zeigt sie als Galerie."))];
        }

        return [
            group(
                "Trenner",
                el("label", "sto-check", toggle(block.line !== false, "Linie zeigen", (on) => change(() => (block.line = on))), "Linie zeigen"),
                el("label", "sto-check", toggle(block.big === true, "Großer Abstand", (on) => change(() => (block.big = on))), "Großer Abstand")
            ),
        ];
    }

    function embedInspector(key: string, embed: IEmbed): HTMLElement[] {
        if (key === "author") return [group("Autor", label("Name", line(key, embed.author?.name ?? "", EMBED_MAX.author, (value) => (embed.author = authorOf(value, embed.author?.icon ?? null)), "Autor")))];
        if (key === "title") return [group("Titel", label("Titel", line(key, embed.title ?? "", 256, (value) => (embed.title = value || null), "Titel")), placeholderTools())];
        if (key === "description") return [group("Beschreibung", area(key, embed.description ?? "", EMBED_MAX.description, (value) => (embed.description = value || null), "Beschreibung"))];
        if (key === "footer") return [group("Fußzeile", area(key, embed.footer?.text ?? "", 2048, (value) => (embed.footer = value ? { text: value, icon: embed.footer?.icon ?? null } : null), "Fußzeile", false))];
        if (key === "image") return [group("Bild", imagePick(embed.image, (value) => (embed.image = value), "Bild"), el("p", "sto-note", "Steht groß unten im Embed."))];
        if (key === "thumbnail") return [group("Vorschaubild", imagePick(embed.thumbnail, (value) => (embed.thumbnail = value), "Vorschaubild"), el("p", "sto-note", "Steht klein rechts oben."))];

        const index = Number(key.split(":")[1]);
        const field = embed.fields[index];

        if (!field) return [];

        const layout = el("div", "sto-seg");

        for (const [inline, text] of [[true, "Nebeneinander"], [false, "Eigene Zeile"]] as const) {
            const option = button("", text);

            option.setAttribute("aria-pressed", String(field.inline === inline));
            option.addEventListener("click", () => change(() => (field.inline = inline)));
            layout.append(option);
        }

        return [group(`Feld ${index + 1}`, label("Name", line(`${key}:name`, field.name, 256, (value) => (field.name = value), "Name des Feldes")), label("Wert", area(`${key}:value`, field.value, 1024, (value) => (field.value = value), "Wert des Feldes")), layout)];
    }

    function wholeInspector(): HTMLElement[] {
        const parts: HTMLElement[] = [];

        if (entry.kind === "text") parts.push(group("Die Nachricht", area("content", entry.content, 2000, (value) => (entry.content = value), "Die Nachricht")));
        if (entry.kind === "v2") parts.push(group("Karte", ...styleControls(), el("p", "sto-note", "Klick in der Mitte auf einen Teil, um ihn zu bearbeiten.")));
        if (entry.kind === "embed") parts.push(group("Embed", ...styleControls(), el("p", "sto-note", "Klick in der Mitte auf einen Teil, um ihn zu bearbeiten. Neue Teile gibt es links unter Bausteine.")));

        parts.push(lengthGroup());

        return parts;
    }

    function paintInspector(): void {
        counter = null;

        if (staged()) {
            s.inspector.replaceChildren(...ownStage().inspector(), ...hints());

            return;
        }

        if (isCustom()) {
            s.inspector.replaceChildren(group(options.kinds[entry.kind] ?? "Eigene Art", options.custom!.form?.(paintView) ?? el("p", "sto-note", "Diese Art hat keine Einstellungen.")), ...hints());

            return;
        }

        let parts: HTMLElement[] = [];

        if (selected?.startsWith("block:") && entry.kind === "v2") parts = blockInspector(Number(selected.split(":")[1]));
        else if (selected === "content") parts = [group(entry.kind === "embed" ? "Text über dem Embed" : "Die Nachricht", area("content", entry.content, 2000, (value) => (entry.content = value), "Text"))];
        else if (selected && entry.embed && entry.kind === "embed") parts = embedInspector(selected, entry.embed);

        if (!parts.length) {
            selected = null;
            parts = wholeInspector();
        } else parts.push(lengthGroup());

        s.inspector.replaceChildren(...parts, ...hints());
    }

    /** Was die Seite dazuschreibt, und wo gespeichert wird, wenn die Leiste es nicht kann. */
    function hints(): HTMLElement[] {
        return [
            ...(options.hint ? [el("p", "sto-note", options.hint)] : []),
            ...(options.pageSave ? [] : [el("p", "sto-note", "Gespeichert wird mit „Speichern“ unten auf der Seite.")]),
        ];
    }

    /* ------------------------------------------------------------
       Fächer
       ------------------------------------------------------------ */
    function paintTemplates(fly: HTMLElement): void {
        fly.replaceChildren(
            el("p", "sto-h", "Vorlagen"),
            templateBar<IBody>(options.templates!, {
                take: () => snapshot(),
                put: (state) => change(() => restore(entry, state)),
                apply: (template) =>
                    change(() => {
                        const preset = template.body;

                        if (preset.kind !== undefined) entry.kind = preset.kind;
                        if (preset.content !== undefined) entry.content = preset.content;
                        if (preset.embed !== undefined) entry.embed = structuredClone(preset.embed);
                        if (preset.doc !== undefined) restore(entry, { ...snapshot(), doc: structuredClone(preset.doc) });

                        selected = null;
                    }),
            }, Object.keys(options.kinds)),
            el("p", "sto-note", "Eine Vorlage ersetzt die Nachricht. „Zurück“ oder Strg+Z holt den Stand davor.")
        );
    }

    function paintBlocks(fly: HTMLElement): void {
        const add = (text: string, run: () => Promise<string | null> | string | null, disabled = false): HTMLButtonElement => {
            const action = button("sto-add", icon("#i-plus"), text);

            action.disabled = disabled;
            action.addEventListener("click", async () => {
                history.remember(snapshot());

                const key = await run();

                selected = key;
                structural();
            });

            return action;
        };
        const list = el("div", "sto-adds");

        if (entry.kind === "v2") {
            for (const [type, text] of [["text", "Text"], ["image", "Bilder"], ["section", "Text mit Bild daneben"], ["separator", "Trenner"]] as const) {
                list.append(
                    add(text, async () => {
                        const block = freshBlock(type);

                        // Bausteine, die ohne Bild nichts zeigen, fragen gleich danach.
                        if (block.type === "image" || block.type === "section") {
                            const source = await pickImage(context().guildId, context().imagePlaceholders);

                            if (source && block.type === "image") block.images.push(source);
                            if (source && block.type === "section") block.thumbnail = source;
                        }

                        entry.doc.blocks.push(block);

                        return `block:${entry.doc.blocks.length - 1}`;
                    }, !canAddBlock(entry.doc, type))
                );
            }
        } else if (entry.kind === "embed") {
            const embed = (entry.embed ??= options.defaultEmbed());
            const picture = (apply: (source: string) => void, key: string) => async (): Promise<string | null> => {
                const source = await pickImage(context().guildId, context().imagePlaceholders);

                if (!source) return null;

                apply(source);

                return key;
            };

            list.append(
                add("Text darüber", () => ((entry.content = "Text über dem Embed"), "content"), Boolean(entry.content.trim())),
                add("Autor", () => ((embed.author = { name: "Autor", icon: null }), "author"), Boolean(embed.author)),
                add("Titel", () => ((embed.title = "Titel"), "title"), Boolean(embed.title)),
                add("Beschreibung", () => ((embed.description = "Beschreibung"), "description"), Boolean(embed.description)),
                add("Feld", () => (embed.fields.push({ name: "Name", value: "Wert", inline: true }), `field:${embed.fields.length - 1}`), embed.fields.length >= MAX_FIELDS),
                add("Bild", picture((source) => (embed.image = source), "image"), Boolean(embed.image)),
                add("Vorschaubild", picture((source) => (embed.thumbnail = source), "thumbnail"), Boolean(embed.thumbnail)),
                add("Fußzeile", () => ((embed.footer = { text: "Fußzeile", icon: null }), "footer"), Boolean(embed.footer?.text))
            );
        }

        fly.replaceChildren(
            el("p", "sto-h", "Bausteine"),
            ...(list.childElementCount ? [list] : [el("p", "sto-note", isCustom() ? "Diese Art gestaltest du rechts." : "Eine normale Nachricht ist nur Text – schreib ihn rechts.")])
        );
    }

    function paintStructure(fly: HTMLElement): void {
        const rows = messageParts(entry).map((part) => {
            const pick = button("sto-layer", el("span", "sto-ln", el("span", "", part.label), el("small", "", part.detail)));
            const listed = part.key.startsWith("block:") || part.key.startsWith("field:");
            const tool = (path: string, aria: string, run: () => void, disabled = false): HTMLButtonElement => {
                const action = iconButton(pathIcon(path), aria, "sto-ib sto-move");

                action.disabled = disabled;
                action.addEventListener("click", run);

                return action;
            };

            pick.setAttribute("aria-pressed", String(selected === part.key));
            pick.addEventListener("click", () => select(part.key));

            return el(
                "div",
                `sto-lrow${selected === part.key ? " is-on" : ""}`,
                pick,
                ...(listed
                    ? [
                          tool(PATHS.up, "Nach oben", () => change(() => (selected = movePart(entry, part.key, -1) ?? selected))),
                          tool(PATHS.down, "Nach unten", () => change(() => (selected = movePart(entry, part.key, 1) ?? selected))),
                          tool(PATHS.copy, "Duplizieren", () => change(() => (selected = duplicatePart(entry, part.key) ?? selected)), !canDuplicate(entry, part.key)),
                      ]
                    : []),
                tool(PATHS.trash, "Löschen", () =>
                    change(() => {
                        removePart(entry, part.key);
                        selected = null;
                    })
                )
            );
        });

        fly.replaceChildren(el("p", "sto-h", "Aufbau"), ...(rows.length ? [el("div", "sto-layers", ...rows)] : [el("p", "sto-note", isCustom() ? "Diese Art hat keine Teile." : "Noch leer.")]));
    }

    /** Karte: Akzent an/aus und Farbe; Embed: Farbe und Zeitstempel. */
    function styleControls(): HTMLElement[] {
        if (entry.kind === "v2") {
            const color = el("input", "");

            color.type = "color";
            color.value = entry.doc.accent ?? "#8a4dff";
            color.disabled = !entry.doc.accent;
            color.setAttribute("aria-label", "Akzentfarbe");
            color.addEventListener("input", () => typed("accent", () => (entry.doc.accent = color.value)));

            return [
                el("label", "sto-check", toggle(Boolean(entry.doc.accent), "Farbiger Rand", (on) => change(() => (on ? (entry.doc.accent = color.value) : delete entry.doc.accent))), "Farbiger Rand"),
                label("Akzent", color),
            ];
        }

        if (entry.kind === "embed" && entry.embed) {
            const embed = entry.embed;
            const color = el("input", "");

            color.type = "color";
            color.value = embed.color ?? "#00afff";
            color.setAttribute("aria-label", "Farbe des Embeds");
            color.addEventListener("input", () => typed("color", () => (embed.color = color.value)));

            return [label("Farbe", color), el("label", "sto-check", toggle(embed.timestamp, "Zeitstempel", (on) => change(() => (embed.timestamp = on))), "Zeitstempel unten")];
        }

        return [el("p", "sto-note", "Eine normale Nachricht hat keinen eigenen Stil.")];
    }

    function paintStyle(fly: HTMLElement): void {
        fly.replaceChildren(el("p", "sto-h", "Stil"), ...styleControls());
    }

    /* ------------------------------------------------------------
       Los
       ------------------------------------------------------------ */
    paintKinds();
    paintView();
    paintInspector();
    s.openPanel(null);

    return {
        node: host,
        refresh: () => {
            paintView();
            counter?.();
        },
        redraw: () => {
            if (selected && !messageParts(entry).some((part) => part.key === selected)) selected = null;

            paintKinds();
            paintView();
            paintInspector();

            if (s.panel()) s.refreshPanel();
        },
    };
}
