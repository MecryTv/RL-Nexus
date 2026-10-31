/**
 * Die Bühne der Welcome Card: Avatar, Server-Icon und die drei Zeilen frei
 * setzen, mit der Maus, den Pfeiltasten oder als Zahl.
 *
 * Unten liegt das nackte Bild des Bots, also Hintergrund und Verzierung des
 * Layouts. Die fünf Teile zeichnet die Bühne selbst auf einen Kanvas, nach
 * denselben Formeln wie builder/WelcomeCard.ts: gleiche Grundlinie, lange Namen
 * werden gleich kleiner und gleich gekürzt, Teiler und Marke sitzen gleich.
 * Gegriffen wird über durchsichtige Griffe darüber, die auch Fokus und
 * Pfeiltasten tragen. Klemmen und Messen kommen aus constants/Welcome.ts,
 * also aus denselben Regeln, mit denen der Bot speichert und zeichnet.
 *
 * Seit Plan 42 steht die Bühne im Nachrichten-Studio: sie gibt ihre Teile
 * einzeln heraus (Bühne, Teile-Liste, Felder, Werkzeuge), und Rückgängig führt
 * das Studio - vor jeder Änderung ruft sie onBefore().
 */

import { button, el, toggle } from "../core/Ui.js";
import { CARD_BASELINE, CARD_HEIGHT, CARD_WIDTH, CleanPositions, Ellipsis, FitTitle, LineWidth, MAX_RING, POSITION_LIMITS, SnapPosition, TitleFont, WELCOME_PARTS } from "../../../constants/Welcome.js";
import { IWelcomePosition, IWelcomePositions, WelcomeFont, WelcomePart } from "../../../interfaces/services/welcome/IWelcome.js";

type Places = Required<IWelcomePositions>;

/** Was die Bühne von der Karte braucht. Die Felder heißen wie in der Karte selbst. */
export interface IStageCard {
    layout: string;
    font: string;
    titleColor: string;
    subtitleColor: string;
    footerColor: string | null;
    accent: string;
    accentOn: boolean;
    avatarShape: "circle" | "bevel";
    ringWidth: number;
    avatar: boolean;
    icon: boolean;
    positions: IWelcomePositions | null;
}

/**
 * Was die Bühne zeigt. Je Nachricht baut der Editor eine eigene Bühne, so
 * springt Rückgängig nie von der Begrüßung in den Abschied.
 */
export interface IStageView {
    /** Das nackte Bild des Bots, null solange es noch lädt. */
    image: string | null;
    /** Die fertigen Zeilen und die Bilder dessen, der gerade zuschaut. */
    parts: { title: string; subtitle: string; footer: string; avatar: string | null; icon: string | null };
    /** Die Plätze des Layouts. Ohne eigene Anordnung stehen die Teile dort. */
    layout: Places;
    card: IStageCard;
}

/** Ein Stand, wie ihn Rückgängig zurückholt: Plätze und Layout gehören zusammen. */
export interface IStageState {
    positions: Places | null;
    layout: string;
}

export interface ICardStage {
    /** Die Karte mit Griffen und dem Hinweis zu den Pfeiltasten - für die Mitte des Studios. */
    stage: HTMLElement;
    /** Raster, Einrasten und „Alles auf Layout zurück“. */
    tools: HTMLElement;
    /** Die fünf Teile zum Anklicken. */
    layers: HTMLElement;
    /** X, Y, Größe und Ausrichtung des gewählten Teils. */
    fields: HTMLElement;
    selected(): WelcomePart;
    show(view: IStageView): void;
}

interface IBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const W = CARD_WIDTH;
const H = CARD_HEIGHT;
/** Doppelt so fein wie die Karte, wie der Bot beim Senden. */
const SCALE = 2;
/** Für Linien und Schein, wenn der Akzent aus ist, wie beim Bot. */
const NEUTRAL = "#c9d1dc";
const HEX = /^#[0-9a-f]{6}$/i;
const IMAGES: readonly WelcomePart[] = ["avatar", "icon"];

const NAMES: Record<WelcomePart, string> = {
    avatar: "Avatar",
    icon: "Server-Icon",
    title: "Überschrift",
    subtitle: "Unterzeile",
    footer: "Kleine Zeile",
};

const KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Alle Schriften, die der Kanvas braucht. Erst wenn sie da sind, stimmen die Breiten. */
const FONTS = ["800 48px Oxanium", "700 48px Orbitron", "700 48px Rajdhani", "600 24px Rajdhani"];

/* ----------------------------------------------------------
   Zeichnen wie der Bot
   ---------------------------------------------------------- */

function Alpha(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function Bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

function copy(places: Places): Places {
    return structuredClone(places);
}

/**
 * Die fünf Teile auf den Kanvas, in der Reihenfolge des Bots: Avatar, Zeilen,
 * Icon. Zurück kommt je Teil der Kasten, den der Griff darüber braucht.
 * Ausgeschaltete Teile stehen blass da, damit man sie trotzdem greifen kann.
 */
function drawParts(ctx: CanvasRenderingContext2D, view: IStageView, places: Places, avatar: HTMLImageElement | null, icon: HTMLImageElement | null): Record<WelcomePart, IBox> {
    const { card, parts } = view;
    const accentOn = card.accentOn !== false && HEX.test(card.accent);
    const tone = accentOn ? card.accent : NEUTRAL;
    const footerColor = card.footerColor && HEX.test(card.footerColor) ? card.footerColor : accentOn ? card.accent : card.subtitleColor;
    const boxes = {} as Record<WelcomePart, IBox>;

    for (const part of IMAGES) {
        const { x, y, size } = places[part];

        boxes[part] = { x, y, width: size, height: size };
    }

    // Avatar: Schein, Bild im Kreis oder Achteck, Ring.
    {
        const { x, y, size } = places.avatar;
        const shape = (): void => {
            if (card.avatarShape === "circle") {
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
            } else {
                Bevel(ctx, x, y, size, size, Math.round(size * 0.13));
            }
        };

        ctx.save();
        ctx.globalAlpha = card.avatar ? 1 : 0.35;
        ctx.save();
        ctx.shadowColor = Alpha(tone, accentOn ? 0.55 : 0.28);
        ctx.shadowBlur = 30;
        shape();
        ctx.fillStyle = "#0b0f15";
        ctx.fill();
        ctx.restore();
        ctx.save();
        shape();
        ctx.clip();
        ctx.fillStyle = "#151a22";
        ctx.fillRect(x, y, size, size);

        if (avatar) ctx.drawImage(avatar, x, y, size, size);

        ctx.restore();

        const ring = Math.min(MAX_RING, Math.max(0, card.ringWidth));

        if (ring > 0) {
            ctx.lineWidth = ring;
            ctx.strokeStyle = accentOn ? card.accent : "rgba(242,244,247,0.9)";
            shape();
            ctx.stroke();
        }

        ctx.restore();
    }

    ctx.textBaseline = "alphabetic";

    const shift = (place: IWelcomePosition, width: number): number => (place.align === "center" ? place.x - width / 2 : place.align === "right" ? place.x - width : place.x);
    const line = (place: IWelcomePosition, width: number): IBox => ({ x: shift(place, Math.max(width, 40)), y: place.y, width: Math.max(width, 40), height: place.size });

    // Überschrift: erst kleiner, dann gekürzt, mit Schatten.
    {
        const place = places.title;
        const fitted = FitTitle(ctx, parts.title, card.font as WelcomeFont, place.size, LineWidth(place.x, place.align, place.width));

        ctx.save();
        ctx.font = TitleFont(card.font as WelcomeFont, fitted.size);
        boxes.title = line(place, parts.title ? ctx.measureText(fitted.text).width : 0);

        if (parts.title) {
            ctx.textAlign = place.align;
            ctx.fillStyle = card.titleColor;
            ctx.shadowColor = "rgba(0,0,0,0.55)";
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 2;
            ctx.fillText(fitted.text, place.x, place.y + Math.round(fitted.size * CARD_BASELINE));
        }

        ctx.restore();
    }

    {
        const place = places.subtitle;

        ctx.save();
        ctx.font = `600 ${place.size}px Rajdhani`;

        const text = Ellipsis(ctx, parts.subtitle, LineWidth(place.x, place.align, place.width));

        boxes.subtitle = line(place, parts.subtitle ? ctx.measureText(text).width : 0);

        if (parts.subtitle) {
            ctx.textAlign = place.align;
            ctx.fillStyle = card.subtitleColor;
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 10;
            ctx.fillText(text, place.x, place.y + Math.round(place.size * CARD_BASELINE));
        }

        ctx.restore();
    }

    // Kleine Zeile: mit Teiler darüber, im HUD-Layout als Marke.
    {
        const place = places.footer;
        const baseline = place.y + Math.round(place.size * CARD_BASELINE);
        const max = LineWidth(place.x, place.align, place.width);

        ctx.save();
        ctx.font = `600 ${place.size}px Rajdhani`;

        if (card.layout === "hud") {
            const pad = Math.round(place.size * 0.76);
            const text = Ellipsis(ctx, parts.footer, max - 2 * pad);
            const width = ctx.measureText(text).width + 2 * pad;
            const left = shift(place, width);
            const top = baseline - Math.round(place.size * 1.14);

            boxes.footer = { x: left, y: top, width, height: Math.round(place.size * 1.62) };

            if (parts.footer) {
                Bevel(ctx, left, top, width, boxes.footer.height, Math.round(place.size * 0.43));
                ctx.fillStyle = Alpha(footerColor, 0.12);
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = Alpha(footerColor, 0.7);
                ctx.stroke();
                ctx.fillStyle = footerColor;
                ctx.textAlign = "left";
                ctx.fillText(text, left + pad, baseline);
            }
        } else {
            const text = Ellipsis(ctx, parts.footer, max);

            boxes.footer = line(place, parts.footer ? ctx.measureText(text).width : 0);

            if (parts.footer) {
                ctx.fillStyle = accentOn ? card.accent : "rgba(255,255,255,0.28)";
                ctx.fillRect(shift(place, 56), baseline - Math.round(place.size * 1.667), 56, 3);
                ctx.textAlign = place.align;
                ctx.fillStyle = footerColor;
                ctx.fillText(text, place.x, baseline);
            }
        }

        ctx.restore();
    }

    // Icon: abgerundet mit feinem Rand. Ohne Bild ein gestrichelter Platz, damit es greifbar bleibt.
    {
        const { x, y, size } = places.icon;

        ctx.save();
        ctx.globalAlpha = card.icon ? 1 : 0.35;

        if (icon) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, 12);
            ctx.clip();
            ctx.drawImage(icon, x, y, size, size);
            ctx.restore();
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
        } else {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
        }

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, 12);
        ctx.stroke();
        ctx.restore();
    }

    return boxes;
}

/* ----------------------------------------------------------
   Die Bühne
   ---------------------------------------------------------- */

function percent(value: number, of: number): string {
    return `${(value / of) * 100}%`;
}

/**
 * Ein Zahlenfeld. Übernommen wird erst beim Bestätigen: Wer "120" tippt, soll
 * nicht schon bei der "1" geklemmt werden. Solange getippt wird (typing), lässt
 * die Bühne das Feld in Ruhe, danach steht dort wieder der geklemmte Wert.
 */
function numberField(label: string, onCommit: (value: number) => void): { node: HTMLElement; input: HTMLInputElement; typing: () => boolean } {
    const input = el("input", "text gwnum");
    let typing = false;

    input.type = "number";
    input.step = "1";
    input.addEventListener("input", () => (typing = true));
    input.addEventListener("change", () => {
        typing = false;

        if (input.value.trim() !== "" && Number.isFinite(Number(input.value))) onCommit(Number(input.value));
    });

    return { node: el("label", "cs__field", label, input), input, typing: () => typing };
}

export function cardStage(options: {
    onChange(state: IStageState): void;
    /** Gleich ändert sich etwas - das Studio merkt sich den Stand davor. Gleicher Schlüssel kurz hintereinander ist ein Schritt. */
    onBefore?(key?: string): void;
    /** Ein anderes Teil ist gewählt. */
    onSelect?(part: WelcomePart): void;
}): ICardStage {
    let view: IStageView | null = null;
    let places: Places | null = null;
    let own = false;
    let selected: WelcomePart = "avatar";
    let boxes: Record<WelcomePart, IBox> | null = null;
    let fontsReady = false;
    let frame = false;
    let background: HTMLImageElement | null = null;
    const pictures = new Map<string, HTMLImageElement>();

    const canvas = el("canvas", "cs__canvas");
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    canvas.setAttribute("aria-hidden", "true");

    const grid = el("div", "cs__grid");
    const guideX = el("div", "cs__guide cs__guide--x");
    const guideY = el("div", "cs__guide cs__guide--y");
    const chip = el("div", "cs__chip");
    const stage = el("div", "cs__stage", canvas, grid);
    const handles = {} as Record<WelcomePart, HTMLElement>;
    const layers = {} as Record<WelcomePart, { node: HTMLButtonElement; where: HTMLElement }>;

    grid.hidden = true;
    guideX.hidden = guideY.hidden = chip.hidden = true;

    const snapBox = toggle(true, "Einrasten", () => undefined);
    const gridBox = toggle(false, "Raster 10 px", (on) => (grid.hidden = !on));
    const resetAll = button("btn btn--quiet", "Alles auf Layout zurück");

    const which = el("span", "cs__lab");
    // Ein Feld gehört zu dem Teil, das beim Hineinklicken gewählt war. Klickt man
    // danach ein anderes an, landet der getippte Wert trotzdem beim richtigen.
    const fieldX = numberField("X", (value) => change({ x: value }, editing));
    const fieldY = numberField("Y", (value) => change({ y: value }, editing));
    const fieldSize = numberField("Größe", (value) => change({ size: value }, editing));
    let editing: WelcomePart = "avatar";

    // Beim Tippen, nicht beim Fokus: Ohne Fokus im Fenster feuert focus erst später, input nie.
    for (const field of [fieldX, fieldY, fieldSize]) field.input.addEventListener("input", () => (editing = selected));
    const alignButtons = (["left", "center", "right"] as const).map((align) => {
        const pick = button("", align === "left" ? "Links" : align === "center" ? "Mitte" : "Rechts");

        pick.dataset.align = align;
        pick.addEventListener("click", () => change({ align }));

        return pick;
    });
    const alignBox = el("div", "cs__align", el("span", "cs__lab", "Ausrichtung"), el("div", "seg", ...alignButtons));
    const centerButton = button("btn btn--quiet", "Waagrecht mittig");
    const resetPart = button("btn btn--quiet", "Auf Layout zurück");

    alignBox.querySelector(".seg")?.setAttribute("aria-label", "Ausrichtung");
    fieldX.input.min = fieldY.input.min = "0";
    fieldX.input.max = String(W);
    fieldY.input.max = String(H);

    const list = el("div", "cs__layers");

    for (const part of WELCOME_PARTS) {
        const where = el("small", "");
        const layer = button("cs__layer", el("span", "", NAMES[part]), where);
        const handle = el("div", `cs__part cs__part--${part}`);

        layer.addEventListener("click", () => {
            pick(part);
            handle.focus();
        });
        layers[part] = { node: layer, where };
        list.append(layer);

        handle.tabIndex = 0;
        handle.setAttribute("role", "button");
        handle.addEventListener("focus", () => pick(part));
        handle.addEventListener("pointerdown", (event) => grab(part, event));
        handle.addEventListener("keydown", (event) => nudge(part, event));
        handles[part] = handle;
        stage.append(handle);
    }

    stage.append(guideX, guideY, chip);

    const tools = el("div", "cs__bar", el("label", "cs__check", gridBox, "Raster 10 px"), el("label", "cs__check", snapBox, "Einrasten"), el("span", "cs__grow"), resetAll);
    const center = el(
        "div",
        "cs cs__center",
        tools,
        stage,
        el("p", "cs__hint", el("kbd", "", "←"), " ", el("kbd", "", "→"), " ", el("kbd", "", "↑"), " ", el("kbd", "", "↓"), " 1 px · mit ", el("kbd", "", "Umschalt"), " 10 px · Karte 1000 × 340 px, wie sie der Bot zeichnet"),
    );
    const fields = el("div", "cs__inspect", which, el("div", "cs__two", fieldX.node, fieldY.node), fieldSize.node, alignBox, centerButton, resetPart);

    void Promise.all(FONTS.map((font) => document.fonts.load(font)))
        .catch(() => undefined)
        .finally(() => {
            fontsReady = true;
            schedule();
        });

    function picture(source: string | null): HTMLImageElement | null {
        if (!source) return null;

        let image = pictures.get(source);

        if (!image) {
            image = new Image();
            image.decoding = "async";
            image.addEventListener("load", schedule);
            image.src = source;
            pictures.set(source, image);
        }

        return image.complete && image.naturalWidth > 0 ? image : null;
    }

    /**
     * Mehrere Änderungen in einem Zug zeichnen einmal. Eine Microtask statt
     * requestAnimationFrame: die läuft auch in einem Tab im Hintergrund, und
     * pointermove kommt ohnehin nur einmal je Bild.
     */
    function schedule(): void {
        if (frame) return;

        frame = true;
        queueMicrotask(() => {
            frame = false;
            paint();
        });
    }

    function remember(key?: string): void {
        if (!view) return;

        options.onBefore?.(key);
        schedule();
    }

    /** Neue Werte für das gewählte Teil, geklemmt nach den Regeln des Bots. */
    function place(part: WelcomePart, next: IWelcomePosition): void {
        if (!places) return;

        places[part] = CleanPositions({ [part]: next })?.[part] ?? places[part];
    }

    function commit(): void {
        if (!places || !view) return;

        own = true;
        schedule();
        options.onChange({ positions: copy(places), layout: view.card.layout });
    }

    function change(patch: Partial<IWelcomePosition>, part: WelcomePart = selected): void {
        if (!places) return;

        remember();
        place(part, { ...places[part], ...patch });
        commit();
    }

    function pick(part: WelcomePart): void {
        const changed = part !== selected;

        selected = part;
        schedule();

        if (changed) options.onSelect?.(part);
    }

    function label(part: WelcomePart): void {
        if (!places) return;

        const { x, y } = places[part];

        chip.textContent = `x ${x} · y ${y}`;
        chip.style.left = percent(Math.min(x, W - 130), W);
        chip.style.top = percent(Math.max(0, y - 30), H);
        chip.hidden = false;
    }

    function guides(next: { x: number | null; y: number | null } | null): void {
        guideX.hidden = next?.x == null;
        guideY.hidden = next?.y == null;

        if (next?.x != null) guideX.style.left = percent(next.x, W);
        if (next?.y != null) guideY.style.top = percent(next.y, H);
    }

    let dragging = false;

    function grab(part: WelcomePart, event: PointerEvent): void {
        // Ein zweiter Finger zieht nicht mit, er brächte das erste Ziehen durcheinander.
        if (!places || event.button !== 0 || dragging) return;

        event.preventDefault();
        pick(part);
        handles[part].focus();

        const handle = handles[part];
        const start = { px: event.clientX, py: event.clientY, x: places[part].x, y: places[part].y };
        let moved = false;

        dragging = true;

        const move = (next: PointerEvent): void => {
            if (!places || !boxes || next.pointerId !== event.pointerId) return;
            // Ein Klick oder Tippen zittert ein, zwei Pixel. Erst ab 3 px wird gezogen,
            // sonst rückte schon das Auswählen das Teil und machte die Anordnung eigen.
            if (!moved && Math.hypot(next.clientX - start.px, next.clientY - start.py) < 3) return;

            if (!moved) {
                remember();
                moved = true;
            }

            const k = W / stage.clientWidth;
            const raw = { ...places[part], x: start.x + (next.clientX - start.px) * k, y: start.y + (next.clientY - start.py) * k };
            const snapped = SnapPosition(part, raw, places, { width: boxes[part].width, height: places[part].size }, { snap: snapBox.checked, grid: gridBox.checked });

            place(part, snapped.position);
            guides(snapped.guides);
            label(part);
            commit();
        };

        handle.setPointerCapture(event.pointerId);
        handle.classList.add("is-drag");
        handle.addEventListener("pointermove", move);
        // Loslassen, Abbruch oder ein verlorenes Fenster: immer räumt dasselbe auf.
        handle.addEventListener(
            "lostpointercapture",
            () => {
                dragging = false;
                handle.classList.remove("is-drag");
                handle.removeEventListener("pointermove", move);
                guides(null);
                chip.hidden = true;
            },
            { once: true },
        );
    }

    let chipTimer = 0;

    function nudge(part: WelcomePart, event: KeyboardEvent): void {
        const direction = KEYS[event.key];

        // Alt+← ist "Zurück" im Browser, Strg/Cmd gehören zu Kürzeln - die bleiben dem Browser.
        if (!direction || !places || event.altKey || event.ctrlKey || event.metaKey) return;

        event.preventDefault();

        const step = event.shiftKey ? 10 : 1;

        selected = part;
        // Review Plan 42: Pfeiltasten hintereinander sind ein Schritt für Rückgängig, wie in der Level-Karte.
        remember(`nudge:${part}`);
        place(part, { ...places[part], x: places[part].x + direction[0] * step, y: places[part].y + direction[1] * step });
        label(part);
        commit();
        window.clearTimeout(chipTimer);
        chipTimer = window.setTimeout(() => (chip.hidden = true), 900);
    }

    function paint(): void {
        if (!view || !places || !fontsReady) return;

        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        ctx.clearRect(0, 0, W, H);

        if (background?.complete && background.naturalWidth > 0) {
            ctx.drawImage(background, 0, 0, W, H);
        } else {
            ctx.fillStyle = "#0b0f15";
            ctx.fillRect(0, 0, W, H);
        }

        boxes = drawParts(ctx, view, places, picture(view.parts.avatar), picture(view.parts.icon));

        for (const part of WELCOME_PARTS) {
            const box = boxes[part];
            const handle = handles[part];
            const { x, y } = places[part];

            handle.style.left = percent(box.x, W);
            handle.style.top = percent(box.y, H);
            handle.style.width = percent(box.width, W);
            handle.style.height = percent(box.height, H);
            handle.classList.toggle("is-on", part === selected);
            handle.setAttribute("aria-label", `${NAMES[part]}, x ${x}, y ${y}`);
            layers[part].node.setAttribute("aria-pressed", String(part === selected));
            layers[part].where.textContent = `${x} · ${y}`;
        }

        const current = places[selected];
        const image = IMAGES.includes(selected);
        const [low, high] = POSITION_LIMITS[selected];

        which.textContent = NAMES[selected];

        for (const [field, value] of [
            [fieldX, current.x],
            [fieldY, current.y],
            [fieldSize, current.size],
        ] as const) {
            // Wer gerade tippt, bekommt seine Ziffern nicht unter den Fingern ersetzt.
            if (!field.typing()) field.input.value = String(value);
        }

        fieldSize.input.min = String(low);
        fieldSize.input.max = String(high);
        alignBox.hidden = image;

        for (const pickAlign of alignButtons) pickAlign.setAttribute("aria-pressed", String(pickAlign.dataset.align === current.align));

        resetAll.disabled = resetPart.disabled = !own;
    }

    centerButton.addEventListener("click", () => {
        if (!places) return;

        const current = places[selected];

        change(IMAGES.includes(selected) ? { x: Math.round(W / 2 - current.size / 2) } : { x: W / 2, align: "center" });
    });

    resetPart.addEventListener("click", () => {
        if (view) change({ ...view.layout[selected] });
    });

    resetAll.addEventListener("click", () => {
        if (!view) return;

        remember();
        own = false;
        places = copy(view.layout);
        schedule();
        options.onChange({ positions: null, layout: view.card.layout });
    });

    return {
        stage: center,
        tools,
        layers: list,
        fields,
        selected: () => selected,
        show(next: IStageView): void {
            view = next;
            own = next.card.positions !== null;
            places = copy({ ...next.layout, ...(CleanPositions(next.card.positions) ?? {}) });

            if (next.image && background?.src !== next.image) {
                background = new Image();
                background.addEventListener("load", schedule);
                background.src = next.image;
            }

            schedule();
        },
    };
}
