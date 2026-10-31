/**
 * Plan 36: Level-Karte und Aufstiegs-Bild im Studio (Variante A aus
 * builder-varianten.html). Ersetzt den Designer aus Plan 35.
 *
 * Fächer: Vorlagen (vom Bot klein gezeichnet), Elemente, Hintergrund,
 * Ebenen. Bühne: das Bild des Bots, darüber je Baustein ein Griff; am
 * gewählten vier Eckgriffe, das Schild und die schwebende Leiste. Inspektor:
 * Werte des gewählten Bausteins, ohne Auswahl das Ganze (beim Aufstieg auch
 * die Zeile über dem Bild). Gerechnet wird mit StudioCore, die Hülle ist
 * Studio.ts.
 *
 * Plan 38: Die Art "board" ist das Ranglisten-Bild mit vier Bereichen (Kopf,
 * Podium, Zeile, Fuß). Bausteine, Griffe, Grenzen und Inspektor gehören dann
 * zum gewählten Bereich; die Bühne verschiebt sie um dessen Lage im Bild.
 */

import { BASE } from "../core/Base.js";
import { icon } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { button, confirmButton, el, toggle } from "../core/Ui.js";
import { pickImage } from "./ImagePicker.js";
import { iconButton, pathIcon, studio } from "./Studio.js";
import { Corner, History, IRect, ResizeMode, resizeBox, snapMove, typedNumber } from "./StudioCore.js";
import { BOARD_AREA_LABEL, BOARD_AREA_TYPES, BOARD_WIDTH, DESIGN_FONTS, DESIGN_SIZE, ELEMENT_LABEL, MAX_ELEMENTS } from "../../../constants/LevelDesign.js";
import { BoardArea, DesignKind, IBoardDesign, IBoardFill, ICardDesign, IDesignBox, IDesignElement } from "../../../interfaces/services/levels/ILevelDesign.js";

/** Plan 38: Karte, Aufstieg oder Ranglisten-Bild. */
type IStudioDesign = ICardDesign | IBoardDesign;

export interface ILevelStudioOptions {
    kind: DesignKind | "board";
    /** Das gespeicherte Design - null: keins, es gilt die Vorgabe. */
    design: IStudioDesign | null;
    /** Die Vorgabe ohne eigenes Design: „klassisch“, „banner“ bzw. „podium“. */
    fallback: string;
    templates: Record<string, IStudioDesign>;
    placeholders: readonly string[];
    /** Plan 38, Rangliste: Platzhalter in Kopf und Fuß (frame) und an einem Platz (entry). */
    areaPlaceholders?: { frame: readonly string[]; entry: readonly string[] };
    guildId: string;
    /** Nur Aufstieg: die Zeile über dem Bild und ob der Aufstieg überhaupt als Bild kommt. */
    upLine?: string;
    upMode?: "image" | "text";
    /** Reiter neben dem Titel. */
    head?: HTMLElement;
    call: <T>(body: Record<string, unknown>) => Promise<T | null>;
}

interface IState {
    design: IStudioDesign;
    upLine: string;
}

interface IPreview {
    image: string;
    boxes: IDesignBox[];
    design: ICardDesign;
    values: Record<string, string>;
}

/** Plan 38: ein Bereich im Ranglisten-Bild - beim Podium Platz 1, bei der Zeile die erste. */
interface IAreaBox extends IRect {
    boxes: IDesignBox[];
    repeats: IRect[];
}

interface IBoardPreview {
    image: string;
    width: number;
    height: number;
    areas: Record<BoardArea, IAreaBox | null>;
    design: IBoardDesign;
}

type Selection = string | "bg" | null;

const PREVIEW_DELAY = 300;
const TEMPLATE_LABEL: Record<string, string> = { klassisch: "Klassisch", mittig: "Mittig", panel: "Panel", hud: "HUD", banner: "Banner", leer: "Leer", podium: "Podium", liste: "Liste", kompakt: "Kompakt", arena: "Arena" };
const AREA_NOTE: Record<BoardArea, string> = { head: "Titel, Server, Zeitraum", podium: "Platz 1–3, ein Muster", row: "alle weiteren Plätze, ein Muster", foot: "Seite, Mitglieder, Zeitraum" };
const AREA_ICON: Record<BoardArea, string> = { head: "M3 3h18v6H3zM3 13h18M3 17h12", podium: "M3 21V13h6v8M9 21V8h6v13M15 21v-6h6v6", row: "M3 5h18v5H3zM3 14h18v5H3z", foot: "M3 7h18M3 11h18M3 15h18v6H3z" };
const BACKGROUND_LABEL = { image: "Bild", color: "Farbe", gradient: "Verlauf" } as const;
const KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** Die Platzhalter der Zeile über dem Aufstiegs-Bild - dieselben wie in der Text-Nachricht. */
const LINE_PLACEHOLDERS = ["user", "user.name", "level", "level.old", "xp", "xp.next", "rank", "guild", "channel"];

const ICONS: Record<IDesignElement["type"], string> = {
    text: "M4 7V4h16v3M9 20h6M12 4v16",
    image: "M3 3h18v18H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-5-5L5 21",
    shape: "M7 3h10l4 4v10l-4 4H7l-4-4V7z",
    bar: "M2 9h20v6H2zM5 12h8",
    avatar: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    ring: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3a9 9 0 0 1 9 9",
    icon: "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM8 15V9l8 6V9",
};
const TOOL_PATHS = {
    copy: "M8 8h13v13H8zM4 16V5a1 1 0 0 1 1-1h11",
    front: "m6 15 6-6 6 6",
    back: "m6 9 6 6 6-6",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    hidden: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    braces: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
} as const;

/** Was ein neuer Baustein mitbringt - oben links, gewählt. */
function Fresh(type: IDesignElement["type"], id: string, source: string | null): IDesignElement {
    const base = { id, name: ELEMENT_LABEL[type], hidden: false, x: 40, y: 40, opacity: 1 };

    switch (type) {
        case "text":
            return { type, ...base, text: "Neuer Text", font: "Oxanium", size: 32, weight: 700, color: "#ffffff", align: "left", maxWidth: 400 };
        case "image":
            return { type, ...base, source: source ?? "", w: 160, h: 160, radius: 0 };
        case "shape":
            return { type, ...base, shape: "rect", w: 200, h: 80, fill: "#a78bfa", stroke: null, strokeWidth: 0, cut: 0 };
        case "avatar":
            return { type, ...base, size: 120, shape: "circle", ring: 4, ringColor: "#a78bfa" };
        case "bar":
            return { type, ...base, w: 400, h: 20, style: "solid", segments: 20, corner: "round", from: "#7c3aed", to: "#a78bfa", track: "#2b2838" };
        case "ring":
            return { type, ...base, size: 160, thickness: 12, color: "#a78bfa", track: "#2b2838", inner: "#0a0816", label: "LEVEL", value: "{level}", font: "Oxanium", textColor: "#ffffff" };
        default:
            return { type: "icon", ...base, size: 80, shape: "circle" };
    }
}

/** Wie ein Baustein über die Ecken größer wird - und wie weit (wie services/levels/Design.ts). */
function ResizeRule(element: IDesignElement, width: number, height: number): { mode: ResizeMode; min: number; max: number } {
    const square = Math.min(300, width, height);

    switch (element.type) {
        case "avatar":
        case "icon":
            return { mode: "square", min: 24, max: square };
        case "ring":
            return { mode: "square", min: 40, max: square };
        case "text":
            return { mode: "font", min: Math.round(10 * 1.05), max: Math.round(120 * 1.05) };
        case "image":
            return { mode: "free", min: 8, max: width };
        default:
            return { mode: "free", min: 4, max: width };
    }
}

export function levelStudio(host: HTMLElement, options: ILevelStudioOptions): { dirty(): boolean } {
    const isBoard = options.kind === "board";
    // Die Rangliste ist 1000 breit; ihre Höhe kommt mit jeder Vorschau.
    let W = isBoard ? BOARD_WIDTH : DESIGN_SIZE[options.kind as DesignKind].width;
    let H = isBoard ? 1100 : DESIGN_SIZE[options.kind as DesignKind].height;
    const up = options.kind === "up";
    const history = new History<IState>();
    const fallback = (): IStudioDesign => structuredClone(options.templates[options.fallback]);

    let state: IState = { design: structuredClone(options.design ?? options.templates[options.fallback]), upLine: options.upLine ?? "{user}" };
    let saved = JSON.stringify(state);
    let own = options.design !== null;
    let selected: Selection = null;
    let boxes: IDesignBox[] = [];
    let pending: IDesignBox[] | null = null;
    let dragging = false;
    let image: string | null = null;
    let values: Record<string, string> = {};
    let thumbs: Record<string, string> | null = null;
    let thumbsLoading = false;
    let request = 0;
    let timer: number | null = null;
    // Plan 38: der gewählte Bereich der Rangliste und wo die Bereiche im Bild liegen.
    let area: BoardArea = "row";
    let areas: Record<BoardArea, IAreaBox | null> = { head: null, podium: null, row: null, foot: null };

    const dirty = (): boolean => JSON.stringify(state) !== saved;
    const asBoard = (): IBoardDesign => state.design as IBoardDesign;
    /** Die Bausteine, die gerade bearbeitet werden - bei der Rangliste die des gewählten Bereichs. */
    const els = (): IDesignElement[] => (isBoard ? asBoard()[area].elements : (state.design as ICardDesign).elements);
    /** Wo der Bereich im Bild liegt - Griffe, Schild und Hilfslinien werden darum verschoben. */
    const frame = (): IRect => (isBoard ? (areas[area] ?? { x: 0, y: 0, w: W, h: H }) : { x: 0, y: 0, w: W, h: H });

    /** So weit dürfen Bausteine - die Fläche bzw. das Muster des Bereichs (wie services/levels/Design.ts). */
    function space(): { width: number; height: number } {
        if (!isBoard) return { width: W, height: H };

        const design = asBoard();

        if (area === "podium") return { width: design.podium.w, height: design.podium.slotH };
        if (area === "row") return { width: design.row.w, height: design.row.h };

        return { width: BOARD_WIDTH, height: design[area].h };
    }

    /** Platzhalter des Bereichs. */
    function placeholderKeys(): readonly string[] {
        if (!isBoard || !options.areaPlaceholders) return options.placeholders;

        return area === "podium" || area === "row" ? options.areaPlaceholders.entry : options.areaPlaceholders.frame;
    }

    /* ------------------------------------------------------------
       Hülle
       ------------------------------------------------------------ */
    const discordToggle = up ? button("sto-bt", "So in Discord") : null;
    const reset = confirmButton("sto-bt", "#i-refresh", "Auf Vorgabe zurück", "Wirklich zurück?", async () => {
        const answer = await options.call<{ design: IStudioDesign | null; upLine?: string; effective?: IStudioDesign; templates?: Record<string, IStudioDesign> }>({ action: "design.save", kind: options.kind, design: null, ...(up ? { upLine: state.upLine } : {}) });

        if (!answer) return;

        history.remember(state);
        resetTemplates(answer.templates);
        state = { design: answer.effective ?? fallback(), upLine: answer.upLine ?? state.upLine };
        saved = JSON.stringify(state);
        own = false;
        selected = null;
        repaint();
        changed();
        toast("info", "Zurückgesetzt", up ? "Beim Aufstieg kommt wieder das Banner." : isBoard ? "Die Rangliste zeigt wieder die Vorlage Podium." : "/level rang zeigt wieder die Vorlage Klassisch.");
    });

    const s = studio(host, {
        title: up ? "Aufstieg" : isBoard ? "Rangliste" : "Level-Karte",
        head: options.head,
        panels: [
            { id: "templates", label: "Vorlagen", icon: "#i-layout", render: paintTemplates },
            ...(isBoard ? [{ id: "areas", label: "Bereiche", icon: "#i-grid", render: paintAreas }] : []),
            { id: "add", label: "Elemente", icon: "#i-plus", render: paintAdders },
            { id: "background", label: "Hintergrund", icon: "#i-image" },
            { id: "layers", label: "Ebenen", icon: "#i-list", render: paintLayers },
        ],
        stageTools: true,
        pill: isBoard ? "Vorschau: Lifetime, Seite 1" : "Vorschau mit deinen Daten",
        onUndo: () => travel(history.undo(state)),
        onRedo: () => travel(history.redo(state)),
        onPanel: (id) => {
            if (id === "background") select("bg");
        },
        test: async () => {
            if (dirty()) {
                toast("info", "Erst speichern", "Der Test schickt dir das gespeicherte Bild.");

                return;
            }

            if (await options.call({ action: "design.test", kind: options.kind })) toast("info", "Gesendet", "Schau in deine Direktnachrichten.");
        },
        save,
        extra: [...(discordToggle ? [discordToggle] : []), reset],
    });

    /* ------------------------------------------------------------
       Bühne
       ------------------------------------------------------------ */
    const picture = el("img", "");
    const gridlines = el("div", "sto-gridlines");
    const handles = el("div", "sto-handles");
    const zones = el("div", "sto-zones");
    const guideX = el("div", "sto-guide sto-guide--x");
    const guideY = el("div", "sto-guide sto-guide--y");
    const tag = el("div", "sto-tag");
    const floatBar = el("div", "sto-float");
    const board = el("div", "sto-board", picture, gridlines, zones, handles, guideX, guideY, tag, floatBar);
    const discord = el("div", "sto-discord");

    picture.alt = up ? "Vorschau des Aufstiegs-Bilds" : "Vorschau der Level-Karte";
    gridlines.hidden = true;
    guideX.hidden = guideY.hidden = tag.hidden = floatBar.hidden = true;
    discord.hidden = true;
    discordToggle?.setAttribute("aria-pressed", "false");
    s.canvas.append(board, discord);

    const applyTools = (): void => {
        const zoom = s.zoom();

        gridlines.hidden = !s.grid();
        board.style.aspectRatio = `${W}/${H}`;
        gridlines.style.backgroundSize = `${(10 / W) * 100}% ${(10 / H) * 100}%`;
        board.style.width = zoom === "fit" ? "100%" : `${W * zoom}px`;
        // Die hohe Rangliste passt beim Einpassen auch in der Höhe ins Fenster.
        board.style.maxWidth = zoom === "fit" ? (isBoard ? `min(${W * 1.5}px, ${((W / H) * 76).toFixed(2)}vh)` : `${W * 1.5}px`) : "none";
    };

    s.onTools(applyTools);
    applyTools();

    // Klick daneben: nichts mehr gewählt - der Inspektor zeigt das Ganze. Plan 38: ein Klick in einen anderen Bereich wählt ihn.
    board.addEventListener("pointerdown", (event) => {
        const target = event.target as HTMLElement;

        if (!(target === board || target === picture || target === handles || zones.contains(target))) return;

        if (isBoard) {
            const rect = board.getBoundingClientRect();
            const hit = areaAt(((event.clientX - rect.left) / rect.width) * W, ((event.clientY - rect.top) / rect.height) * H);

            if (hit && hit !== area) return setArea(hit);
        }

        select(null);
    });

    /** Plan 38: welcher Bereich an dieser Stelle des Bilds liegt - auch jede Wiederholung von Podium und Zeile. */
    function areaAt(x: number, y: number): BoardArea | null {
        const inside = (rect: IRect): boolean => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

        for (const key of ["podium", "row", "head", "foot"] as const) {
            const box = areas[key];

            if (box && (inside(box) || box.repeats.some(inside))) return key;
        }

        return null;
    }

    /** Plan 38: einen anderen Bereich bearbeiten - Auswahl weg, Griffe des Bereichs aus der letzten Vorschau. */
    function setArea(next: BoardArea): void {
        area = next;
        selected = null;
        boxes = areas[next]?.boxes ?? [];
        pending = null;
        repaint();

        if (s.panel() === "areas") s.refreshPanel();
    }

    /** Plan 38: der gewählte Bereich mit Schild, seine Wiederholungen gestrichelt. */
    function paintZones(): void {
        const box = isBoard ? areas[area] : null;

        if (!box) return void zones.replaceChildren();

        const zone = (rect: IRect, on: boolean): HTMLElement => {
            const node = el("div", `sto-zone${on ? " is-on" : ""}`);

            node.style.left = `${(rect.x / W) * 100}%`;
            node.style.top = `${(rect.y / H) * 100}%`;
            node.style.width = `${(rect.w / W) * 100}%`;
            node.style.height = `${(rect.h / H) * 100}%`;

            return node;
        };
        const current = zone(box, true);
        const label = area === "row" ? "Zeile · gilt für alle weiteren Plätze" : area === "podium" ? "Podium · gilt für Platz 1–3" : BOARD_AREA_LABEL[area];

        current.append(el("span", "sto-zone__label", label));
        zones.replaceChildren(current, ...box.repeats.map((rect) => zone(rect, false)));
    }

    discordToggle?.addEventListener("click", () => {
        discord.hidden = !discord.hidden;
        discordToggle.setAttribute("aria-pressed", String(!discord.hidden));
        paintDiscord();
    });

    function find(id: Selection): IDesignElement | null {
        return id && id !== "bg" ? (els().find((element) => element.id === id) ?? null) : null;
    }

    function boxOf(id: string): IDesignBox | null {
        return boxes.find((box) => box.id === id) ?? null;
    }

    /** box in den Koordinaten des Bereichs - bei Karte und Aufstieg ist das das ganze Bild. */
    function place(node: HTMLElement, box: IRect): void {
        const origin = frame();

        node.style.left = `${((origin.x + box.x) / W) * 100}%`;
        node.style.top = `${((origin.y + box.y) / H) * 100}%`;
        node.style.width = `${(box.w / W) * 100}%`;
        node.style.height = `${(box.h / H) * 100}%`;
    }

    function paintHandles(): void {
        const focused = handles.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : null;

        handles.replaceChildren(
            ...boxes.map((box) => {
                const element = find(box.id);
                const handle = el("div", `sto-handle${box.id === selected ? " is-on" : ""}`);

                handle.tabIndex = 0;
                handle.dataset.id = box.id;
                handle.setAttribute("role", "button");
                handle.setAttribute("aria-label", `${element?.name ?? "Baustein"}: verschieben mit Maus oder Pfeiltasten`);
                place(handle, box);

                if (box.id === selected) addCorners(handle, box.id);

                handle.addEventListener("pointerdown", (event) => {
                    if (!(event.target as HTMLElement).classList.contains("sto-corner")) grab(box.id, handle, event);
                });
                handle.addEventListener("keydown", (event) => nudge(box.id, handle, event));
                handle.addEventListener("dblclick", () => {
                    if (element?.type !== "text") return;

                    select(box.id);

                    const field = s.inspector.querySelector<HTMLInputElement>("input[data-text]");

                    field?.focus();
                    field?.setSelectionRange(field.value.length, field.value.length);
                });
                handle.addEventListener("focus", () => {
                    if (selected !== box.id && !dragging) select(box.id, false);
                });

                return handle;
            })
        );

        paintSelection();

        // Der Fokus bleibt beim selben Baustein, auch wenn die Griffe neu entstehen (Review I4).
        if (focused) handles.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }

    function addCorners(handle: HTMLElement, id: string): void {
        for (const corner of ["nw", "ne", "sw", "se"] as const) {
            const grip = el("span", "sto-corner");

            grip.dataset.corner = corner;
            grip.setAttribute("aria-hidden", "true");
            grip.addEventListener("pointerdown", (event) => resize(id, corner, handle, event));
            handle.append(grip);
        }
    }

    /** Auswahl umsetzen, ohne die Griffe neu zu bauen - sonst verliert ein gerade gepackter Griff Zeiger und Fokus. */
    function markSelection(): void {
        for (const handle of handles.querySelectorAll<HTMLElement>(".sto-handle")) {
            const on = handle.dataset.id === selected;

            handle.classList.toggle("is-on", on);

            for (const grip of handle.querySelectorAll(".sto-corner")) grip.remove();

            if (on && handle.dataset.id) addCorners(handle, handle.dataset.id);
        }

        paintSelection();
    }

    /** Schild darüber, Leiste darunter - am gewählten Baustein. */
    function paintSelection(box: IRect | null = selected && selected !== "bg" ? boxOf(selected) : null): void {
        const element = find(selected);

        tag.hidden = floatBar.hidden = !box || !element;

        if (!box || !element) return;

        // In der rechten Hälfte hängen Schild und Leiste an der rechten Kante - sonst ragen sie aus der Bühne.
        const origin = frame();
        const x = origin.x + box.x;
        const y = origin.y + box.y;
        const right = x + box.w / 2 > W / 2;

        tag.textContent = `${element.name} · x ${element.x} · y ${element.y}`;

        for (const node of [tag, floatBar]) {
            node.style.left = right ? "auto" : `${(x / W) * 100}%`;
            node.style.right = right ? `${(1 - (x + box.w) / W) * 100}%` : "auto";
        }

        tag.style.top = `${(y / H) * 100}%`;
        floatBar.style.top = `${((y + box.h) / H) * 100}%`;
    }

    const floatTool = (path: string, label: string, run: () => void): HTMLButtonElement => {
        const tool = iconButton(pathIcon(path), label);

        tool.addEventListener("click", run);

        return tool;
    };

    function paintFloat(): void {
        const element = find(selected);

        if (!element) return;

        const index = els().indexOf(element);

        floatBar.replaceChildren(
            floatTool(TOOL_PATHS.copy, "Duplizieren", () => duplicate(index)),
            floatTool(TOOL_PATHS.front, "Nach vorn", () => move(index, index + 1)),
            floatTool(TOOL_PATHS.back, "Nach hinten", () => move(index, index - 1)),
            floatTool(element.hidden ? TOOL_PATHS.hidden : TOOL_PATHS.eye, element.hidden ? "Einblenden" : "Ausblenden", () => toggleHidden(element)),
            floatTool(TOOL_PATHS.trash, "Löschen", () => remove(index))
        );
    }

    function guides(gx: number | null, gy: number | null): void {
        guideX.hidden = gx === null;
        guideY.hidden = gy === null;

        if (gx !== null) guideX.style.left = `${((frame().x + gx) / W) * 100}%`;
        if (gy !== null) guideY.style.top = `${((frame().y + gy) / H) * 100}%`;
    }

    /** Ziehen: kommt währenddessen eine Vorschau, gelten ihre Rahmen erst nach dem Loslassen. */
    function grab(id: string, handle: HTMLElement, event: PointerEvent): void {
        const element = find(id);
        const box = boxOf(id);

        if (!element || !box || event.button !== 0) return;

        event.preventDefault();
        select(id, false);
        handle.focus({ preventScroll: true });
        handle.setPointerCapture(event.pointerId);

        const rect = board.getBoundingClientRect();
        const scale = W / rect.width;
        const origin = { x: event.clientX, y: event.clientY, ex: element.x, ey: element.y };
        const others = boxes.filter((other) => other.id !== id);
        let moved = false;
        let shift = { dx: 0, dy: 0 };

        if (image) {
            handle.style.backgroundImage = `url("${image}")`;
            handle.style.backgroundSize = `${rect.width}px ${rect.height}px`;
            handle.style.backgroundPosition = `${-((frame().x + box.x) / scale)}px ${-((frame().y + box.y) / scale)}px`;
        }

        dragging = true;
        handle.classList.add("is-drag");

        const moveTo = (next: PointerEvent): void => {
            if (!moved) {
                history.remember(state);
                moved = true;
            }

            const snapped = snapMove(box, (next.clientX - origin.x) * scale, (next.clientY - origin.y) * scale, others, space(), { snap: s.snap(), grid: s.grid() });

            shift = snapped;
            element.x = origin.ex + snapped.dx;
            element.y = origin.ey + snapped.dy;
            place(handle, { ...box, x: box.x + snapped.dx, y: box.y + snapped.dy });
            paintSelection({ ...box, x: box.x + snapped.dx, y: box.y + snapped.dy });
            guides(snapped.guideX, snapped.guideY);
        };
        const stop = (): void => {
            handle.removeEventListener("pointermove", moveTo);
            handle.removeEventListener("pointerup", stop);
            handle.removeEventListener("pointercancel", stop);
            handle.removeEventListener("lostpointercapture", stop);
            handle.classList.remove("is-drag");
            handle.style.backgroundImage = "";
            dragging = false;
            guides(null, null);

            if (moved) {
                box.x += shift.dx;
                box.y += shift.dy;
                // Eine Vorschau aus der Zeit davor zeigt den alten Platz - die neue kommt gleich.
                pending = null;
                paintInspector();
                changed();
            } else if (pending) {
                boxes = pending;
                pending = null;
                paintHandles();
            }
        };

        handle.addEventListener("pointermove", moveTo);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
        handle.addEventListener("lostpointercapture", stop);
    }

    /** Größe über eine Ecke: quadratisch, frei oder als Schriftgröße (StudioCore.resizeBox). */
    function resize(id: string, corner: Corner, handle: HTMLElement, event: PointerEvent): void {
        const element = find(id);
        const box = boxOf(id);

        if (!element || !box || event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        const grip = event.target as HTMLElement;
        const rule = ResizeRule(element, space().width, space().height);
        const scale = W / board.getBoundingClientRect().width;
        const origin = { x: event.clientX, y: event.clientY };
        let moved = false;
        let last: IRect = box;

        grip.setPointerCapture(event.pointerId);
        dragging = true;

        const moveTo = (next: PointerEvent): void => {
            if (!moved) {
                history.remember(state);
                moved = true;
            }

            last = resizeBox(box, corner, (next.clientX - origin.x) * scale, (next.clientY - origin.y) * scale, rule.mode, rule, space());

            if (element.type === "avatar" || element.type === "icon" || element.type === "ring") element.size = last.w;
            else if (element.type === "text") element.size = Math.min(120, Math.max(10, Math.round(last.h / 1.05)));
            else if (element.type === "bar") {
                element.w = last.w;
                element.h = Math.min(60, last.h);
            } else {
                element.w = last.w;
                element.h = last.h;
            }

            if (element.type !== "text") element.x = last.x;

            element.y = last.y;
            place(handle, last);
            paintSelection(last);
        };
        const stop = (): void => {
            grip.removeEventListener("pointermove", moveTo);
            grip.removeEventListener("pointerup", stop);
            grip.removeEventListener("pointercancel", stop);
            grip.removeEventListener("lostpointercapture", stop);
            dragging = false;

            if (!moved) return;

            Object.assign(box, last);
            pending = null;
            paintInspector();
            changed();
        };

        grip.addEventListener("pointermove", moveTo);
        grip.addEventListener("pointerup", stop);
        grip.addEventListener("pointercancel", stop);
        grip.addEventListener("lostpointercapture", stop);
    }

    function nudge(id: string, handle: HTMLElement, event: KeyboardEvent): void {
        const step = KEYS[event.key];
        const element = find(id);
        const box = boxOf(id);

        if (!step || !element || !box) return;

        event.preventDefault();

        const by = event.shiftKey ? 10 : 1;
        const dx = Math.min(space().width - box.w - box.x, Math.max(-box.x, step[0] * by));
        const dy = Math.min(space().height - box.h - box.y, Math.max(-box.y, step[1] * by));

        if (!dx && !dy) return;

        history.remember(state, `nudge:${id}`);
        element.x += dx;
        element.y += dy;
        box.x += dx;
        box.y += dy;
        place(handle, box);
        paintSelection();
        paintInspector();
        changed();
    }

    /* ------------------------------------------------------------
       Ändern, Rückgängig, Vorschau
       ------------------------------------------------------------ */
    function travel(next: IState | null): void {
        if (!next) return;

        state = next;

        if (selected && selected !== "bg" && !find(selected)) selected = null;

        repaint();
        changed();
    }

    function changed(): void {
        s.setDirty(dirty());
        s.setHistory(history.canUndo, history.canRedo);

        if (timer !== null) window.clearTimeout(timer);

        timer = window.setTimeout(() => {
            timer = null;
            void refresh();
        }, PREVIEW_DELAY);
    }

    async function refresh(): Promise<void> {
        const mine = ++request;
        const sent = JSON.stringify(state.design);
        const answer = await options.call<IPreview | IBoardPreview>({ action: "design.preview", kind: options.kind, design: state.design });

        // Eine Antwort zu einem Stand, den es nicht mehr gibt (inzwischen getippt, Rückgängig), zählt nicht -
        // sonst holte das „Übernehmen“ unten den alten Stand zurück. Die nächste Vorschau ist schon bestellt.
        if (!answer || mine !== request || JSON.stringify(state.design) !== sent) return;

        image = answer.image;
        picture.src = answer.image;

        // Plan 38: die Rangliste wächst mit ihren Bereichen - Größe und Lage der Bereiche kommen mit.
        if ("areas" in answer) {
            W = answer.width;
            H = answer.height;
            areas = answer.areas;
            applyTools();
            paintZones();
        } else values = answer.values;

        // Was der Bot zurechtgerückt hat, übernimmt der Builder - ohne eigenen Rückgängig-Schritt (Review M8).
        if (!dragging && JSON.stringify(answer.design) !== JSON.stringify(state.design)) {
            state.design = answer.design;
            paintInspector();
            s.setDirty(dirty());
        }

        const next = "areas" in answer ? (answer.areas[area]?.boxes ?? []) : answer.boxes;

        if (dragging) pending = next;
        else {
            boxes = next;
            paintHandles();
        }

        paintDiscord();
    }

    async function save(): Promise<boolean> {
        const answer = await options.call<{ design: IStudioDesign | null; upLine?: string; effective?: IStudioDesign; templates?: Record<string, IStudioDesign> }>({ action: "design.save", kind: options.kind, design: state.design, ...(up ? { upLine: state.upLine } : {}) });

        if (!answer) return false;

        resetTemplates(answer.templates);

        state = { design: answer.design ?? fallback(), upLine: answer.upLine ?? state.upLine };
        saved = JSON.stringify(state);
        own = Boolean(answer.design);
        repaint();
        changed();
        toast("info", "Gespeichert", up ? "Gilt ab dem nächsten Aufstieg." : isBoard ? "Gilt ab der nächsten /level rangliste." : "Gilt ab dem nächsten /level rang.");

        return true;
    }

    function select(id: Selection, focusLayer = false): void {
        selected = id;

        if (id !== "bg" && s.panel() === "background") s.openPanel(null);

        markSelection();
        paintFloat();
        paintInspector();

        if (s.panel() === "layers") s.refreshPanel();
        if (focusLayer) s.root.querySelector<HTMLElement>(`[data-layer="${CSS.escape(String(id))}"]`)?.focus();
    }

    /** Review I1: nach einem Umbau den Fokus auf den Griff - so gehen Pfeiltasten gleich weiter. */
    function focusHandle(id: string): void {
        handles.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }

    function repaint(): void {
        paintZones();
        paintHandles();
        paintFloat();
        paintInspector();

        if (s.panel() && s.panel() !== "background") s.refreshPanel();

        reset.disabled = !own;
    }

    /* ------------------------------------------------------------
       Bausteine: neu, verschieben, duplizieren, löschen
       ------------------------------------------------------------ */
    function freeId(): string {
        let n = els().length + 1;

        while (els().some((element) => element.id === `e${n}`)) n++;

        return `e${n}`;
    }

    function move(index: number, to: number): void {
        if (to < 0 || to >= els().length) return;

        history.remember(state);

        const [element] = els().splice(index, 1);

        els().splice(to, 0, element);
        repaint();
        changed();
    }

    function duplicate(index: number): void {
        if (els().length >= MAX_ELEMENTS) {
            toast("info", "Voll", `Höchstens ${MAX_ELEMENTS} Bausteine.`);

            return;
        }

        history.remember(state);

        const element = els()[index];
        const copy = { ...structuredClone(element), id: freeId(), name: `${element.name} (Kopie)`.slice(0, 40), x: Math.min(element.x + 10, space().width - 4), y: Math.min(element.y + 10, space().height - 4) };

        els().splice(index + 1, 0, copy);
        selected = copy.id;
        repaint();
        changed();
        focusHandle(copy.id);
    }

    function remove(index: number): void {
        history.remember(state);
        els().splice(index, 1);
        selected = null;
        repaint();
        changed();
    }

    function toggleHidden(element: IDesignElement): void {
        history.remember(state);
        element.hidden = !element.hidden;
        repaint();
        changed();
    }

    /* ------------------------------------------------------------
       Fächer
       ------------------------------------------------------------ */
    function paintTemplates(host: HTMLElement): void {
        const list = el("div", "sto-tpls");

        host.replaceChildren(el("p", "sto-h", "Vorlagen"), list);

        const draw = (): void =>
            list.replaceChildren(
                ...Object.keys(options.templates).map((name) => {
                    const pick = button(`sto-tpl${name === "leer" ? " sto-tpl--empty" : ""}${isBoard ? " sto-tpl--board" : ""}`);
                    const thumb = thumbs?.[name];

                    if (thumb && name !== "leer") {
                        const img = el("img", "");

                        img.src = thumb;
                        img.alt = "";
                        pick.append(img);
                    }

                    pick.append(el("span", "", TEMPLATE_LABEL[name] ?? name));
                    pick.setAttribute("aria-pressed", String(state.design.template === name));
                    pick.setAttribute("aria-label", `Vorlage ${TEMPLATE_LABEL[name] ?? name}`);
                    pick.addEventListener("click", () => {
                        history.remember(state);
                        state.design = structuredClone(options.templates[name]);
                        selected = null;
                        repaint();
                        changed();
                    });

                    return pick;
                })
            );

        draw();

        if (!thumbs && !thumbsLoading) {
            thumbsLoading = true;
            void options.call<{ thumbs: Record<string, string> }>({ action: "design.thumbs", kind: options.kind }).then((answer) => {
                if (!answer) return;

                thumbs = answer.thumbs;

                if (s.panel() === "templates") s.refreshPanel();
            });
        }
    }

    /** Plan 38: nach Speichern oder Zurücksetzen der Rangliste kommen die Vorlagen im neuen Stil - die Bilder dazu frisch. */
    function resetTemplates(templates: Record<string, IStudioDesign> | undefined): void {
        if (!templates) return;

        options.templates = templates;
        thumbs = null;
        thumbsLoading = false;

        if (s.panel() === "templates") s.refreshPanel();
    }

    /** Plan 38: die vier Bereiche der Rangliste. */
    function paintAreas(host: HTMLElement): void {
        const list = el("div", "sto-areas");

        for (const key of ["head", "podium", "row", "foot"] as const) {
            const pick = button("sto-layer", pathIcon(AREA_ICON[key]), el("span", "sto-ln", el("span", "", BOARD_AREA_LABEL[key]), el("small", "", AREA_NOTE[key])));

            pick.setAttribute("aria-pressed", String(area === key));
            pick.addEventListener("click", () => setArea(key));
            list.append(el("div", `sto-lrow${area === key ? " is-on" : ""}`, pick));
        }

        host.replaceChildren(
            el("p", "sto-h", "Bereiche"),
            list,
            el("p", "sto-note", "Podium und Zeile sind Muster: Was du am ersten Platz änderst, zeichnet der Bot für jeden Platz. Ein Klick ins Bild wählt den Bereich dort.")
        );
    }

    function paintAdders(host: HTMLElement): void {
        const room = els().length < MAX_ELEMENTS;
        const allowed = isBoard ? BOARD_AREA_TYPES[area] : null;
        const add = (type: IDesignElement["type"], label: string): HTMLButtonElement => {
            const action = button("sto-add", pathIcon(ICONS[type]), label);

            action.disabled = !room;
            action.addEventListener("click", async () => {
                const source = type === "image" ? await pickImage(options.guildId, [], ["gallery", "upload"]) : null;

                if (type === "image" && !source) return;

                history.remember(state);

                const element = Fresh(type, freeId(), source);

                els().push(element);
                selected = element.id;
                repaint();
                changed();
                focusHandle(element.id);
            });

            return action;
        };

        host.replaceChildren(
            el("p", "sto-h", isBoard ? `Elemente · ${BOARD_AREA_LABEL[area]}` : "Elemente"),
            el(
                "div",
                "sto-adds",
                ...(
                    [
                        ["text", "Text"],
                        ["image", "Bild aus der Galerie"],
                        ["shape", "Form"],
                        ["bar", "Fortschrittsbalken"],
                        ["avatar", "Avatar"],
                        ["ring", "Level-Ring"],
                        ["icon", "Server-Icon"],
                    ] as const
                )
                    .filter(([type]) => !allowed || allowed.includes(type))
                    .map(([type, label]) => add(type, label))
            ),
            ...(isBoard && (area === "head" || area === "foot") ? [el("p", "sto-note", "Avatar, Balken und Level-Ring gibt es im Podium und in der Zeile – dort gehören sie zu einem Platz.")] : []),
            ...(room ? [] : [el("p", "sto-full", `Höchstens ${MAX_ELEMENTS} Bausteine – lösch einen, um Platz zu machen.`)])
        );
    }

    function paintLayers(host: HTMLElement): void {
        const rows = els()
            .map((element, index) => ({ element, index }))
            .reverse()
            .map(({ element, index }) => {
                const pick = button("sto-layer", pathIcon(ICONS[element.type]), el("span", "sto-ln", el("span", "", element.name), el("small", "", ELEMENT_LABEL[element.type])));

                pick.dataset.layer = element.id;
                pick.setAttribute("aria-pressed", String(selected === element.id));
                pick.classList.toggle("is-hidden", element.hidden);
                pick.addEventListener("click", () => select(element.id, true));

                const tool = (path: string, label: string, run: () => void, disabled = false, className = "sto-ib"): HTMLButtonElement => {
                    const action = iconButton(pathIcon(path), label, className);

                    action.disabled = disabled;
                    action.addEventListener("click", run);

                    return action;
                };

                return el(
                    "div",
                    `sto-lrow${selected === element.id ? " is-on" : ""}`,
                    pick,
                    tool(TOOL_PATHS.front, "Nach vorn", () => move(index, index + 1), index === els().length - 1, "sto-ib sto-move"),
                    tool(TOOL_PATHS.back, "Nach hinten", () => move(index, index - 1), index === 0, "sto-ib sto-move"),
                    // Review I4: auch ausgeblendete Bausteine (ohne Griff auf der Bühne) lassen sich hier kopieren und löschen.
                    tool(TOOL_PATHS.copy, "Duplizieren", () => duplicate(index), els().length >= MAX_ELEMENTS, "sto-ib sto-move"),
                    tool(TOOL_PATHS.trash, "Löschen", () => remove(index), false, "sto-ib sto-move"),
                    tool(element.hidden ? TOOL_PATHS.hidden : TOOL_PATHS.eye, element.hidden ? "Einblenden" : "Ausblenden", () => toggleHidden(element))
                );
            });
        const background = button("sto-layer", icon("#i-image"), el("span", "sto-ln", el("span", "", "Hintergrund"), el("small", "", BACKGROUND_LABEL[state.design.background.mode])));

        background.dataset.layer = "bg";
        background.setAttribute("aria-pressed", String(selected === "bg"));
        background.addEventListener("click", () => select("bg", true));
        host.replaceChildren(el("p", "sto-h", isBoard ? `Ebenen · ${BOARD_AREA_LABEL[area]}` : "Ebenen"), el("p", "sto-note", "Oben liegt vorne."), el("div", "sto-layers", ...rows, el("div", `sto-lrow sto-lrow--bg${selected === "bg" ? " is-on" : ""}`, background)));
    }

    /* ------------------------------------------------------------
       Inspektor
       ------------------------------------------------------------ */
    const group = (title: string, ...children: Node[]): HTMLElement => el("section", "sto-group", el("h3", "sto-h", title), ...children);
    const field = (label: string, control: HTMLElement): HTMLElement => el("label", "sto-field", label, control);
    const two = (...nodes: HTMLElement[]): HTMLElement => el("div", "sto-two", ...nodes);

    function number(key: string, value: number, min: number, max: number, apply: (value: number) => void): HTMLInputElement {
        const input = el("input", "");

        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.value = String(value);

        let last = value;
        const take = (final: boolean): void => {
            const next = typedNumber(input.value, min, max, final);

            if (final) input.value = String(next ?? last);
            if (next === null || next === last) return;

            last = next;
            history.remember(state, key);
            apply(next);
            changed();
        };

        // Review Plan 38: beim Tippen nur gültige Werte, geklemmt erst beim Verlassen des Felds.
        input.addEventListener("input", () => take(false));
        input.addEventListener("change", () => take(true));

        return input;
    }

    function text(key: string, value: string, max: number, apply: (value: string) => void): HTMLInputElement {
        const input = el("input", "");

        input.maxLength = max;
        input.value = value;
        input.addEventListener("input", () => {
            history.remember(state, key);
            apply(input.value);
            changed();
        });

        return input;
    }

    function color(key: string, value: string, apply: (value: string) => void): HTMLInputElement {
        const input = el("input", "");

        input.type = "color";
        input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
        input.addEventListener("input", () => {
            history.remember(state, key);
            apply(input.value);
            changed();
        });

        return input;
    }

    /** Farbe oder „keine“ - für Füllung, Rand und Innenfläche. */
    function optionalColor(key: string, value: string | null, apply: (value: string | null) => void): HTMLElement {
        const input = color(key, value ?? "#ffffff", apply);
        const none = toggle(value === null, "Keine Farbe", (on) => {
            history.remember(state);
            input.disabled = on;
            apply(on ? null : input.value);
            changed();
        });

        input.disabled = value === null;

        return el("div", "sto-row", input, el("label", "sto-check", none, "keine"));
    }

    /** Plan 38: Farben mit Bedeutung - „Akzent“ überall, „Medaille“ und „Trend“ an einem Platz. */
    function keywords(): [string, string][] {
        if (!isBoard) return [];

        return area === "podium" || area === "row" ? [["accent", "Akzent"], ["medal", "Medaille"], ["trend", "Trend"]] : [["accent", "Akzent"]];
    }

    /** Eine Farbe - in der Rangliste mit Auswahl „Eigene Farbe“ oder einer Bedeutung. */
    function paint(key: string, value: string, apply: (value: string) => void): HTMLElement {
        const words = keywords();

        if (!words.length) return color(key, value, apply);

        const input = color(key, value, apply);
        const custom = value.startsWith("#");

        input.disabled = !custom;

        return el("div", "sto-row", choice(`${key}:mode`, [["#", "Eigene Farbe"], ...words], custom ? "#" : value, (mode) => apply(mode === "#" ? input.value : mode)), input);
    }

    /** Wie paint, dazu „keine“. */
    function paintOptional(key: string, value: string | null, apply: (value: string | null) => void): HTMLElement {
        const words = keywords();

        if (!words.length) return optionalColor(key, value, apply);

        const input = color(key, value?.startsWith("#") ? value : "#ffffff", apply);

        input.disabled = !value?.startsWith("#");

        return el("div", "sto-row", choice(`${key}:mode`, [["none", "Keine"], ["#", "Eigene Farbe"], ...words], value === null ? "none" : value.startsWith("#") ? "#" : value, (mode) => apply(mode === "none" ? null : mode === "#" ? input.value : mode)), input);
    }

    function choice<T extends string | number>(key: string, entries: [T, string][], value: T, apply: (value: T) => void): HTMLSelectElement {
        const picker = el("select", "");

        picker.append(...entries.map(([entry, label]) => new Option(label, String(entry))));
        picker.value = String(value);
        picker.addEventListener("change", () => {
            const found = entries.find(([entry]) => String(entry) === picker.value);

            if (!found) return;

            history.remember(state, key);
            apply(found[0]);
            changed();
            paintInspector();
            if (s.panel() === "layers") s.refreshPanel();
        });

        return picker;
    }

    function segment<T extends string>(entries: [T, string][], value: T, apply: (value: T) => void, label: string): HTMLElement {
        const box = el("div", "sto-seg");

        box.setAttribute("aria-label", label);

        for (const [entry, text] of entries) {
            const option = button("", text);

            option.setAttribute("aria-pressed", String(entry === value));
            option.addEventListener("click", () => {
                history.remember(state);
                apply(entry);
                changed();
                paintInspector();
            });
            box.append(option);
        }

        return box;
    }

    /** „{ } Platzhalter einfügen“: ein kleines Menü, ein Klick setzt den Platzhalter an die Schreibmarke. */
    function placeholderMenu(input: HTMLInputElement, keys: readonly string[], apply: (value: string) => void): HTMLElement {
        const open = button("sto-chipbtn", pathIcon(TOOL_PATHS.braces), "Platzhalter einfügen");
        const menu = el("div", "sto-menu");
        const wrap = el("div", "sto-ins", open, menu);
        const close = (): void => {
            menu.hidden = true;
            open.setAttribute("aria-expanded", "false");
        };

        menu.hidden = true;
        open.setAttribute("aria-expanded", "false");
        open.addEventListener("click", () => {
            menu.hidden = !menu.hidden;
            open.setAttribute("aria-expanded", String(!menu.hidden));
            if (!menu.hidden) menu.querySelector<HTMLButtonElement>("button")?.focus();
        });
        // Review I3: Safari und Firefox auf dem Mac fokussieren Knöpfe beim Klick nicht - sonst schlösse focusout das Menü, bevor der Klick ankommt.
        menu.addEventListener("mousedown", (event) => event.preventDefault());
        menu.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                close();
                open.focus();
            }
        });
        wrap.addEventListener("focusout", (event) => {
            if (!wrap.contains(event.relatedTarget as Node | null)) close();
        });

        for (const key of keys) {
            const insert = button("", `{${key}}`);

            insert.addEventListener("click", () => {
                const at = input.selectionStart ?? input.value.length;
                const next = `${input.value.slice(0, at)}{${key}}${input.value.slice(input.selectionEnd ?? at)}`.slice(0, input.maxLength > 0 ? input.maxLength : undefined);

                history.remember(state);
                input.value = next;
                apply(next);
                changed();
                close();
                input.focus();
            });
            menu.append(insert);
        }

        return wrap;
    }

    function galleryButton(label: string, apply: (source: string) => void): HTMLButtonElement {
        const pick = button("sto-bt", icon("#i-image"), label);

        pick.addEventListener("click", async () => {
            const source = await pickImage(options.guildId, [], ["gallery", "upload"]);

            if (!source) return;

            history.remember(state);
            apply(source);
            changed();
            paintInspector();
        });

        return pick;
    }

    function backgroundGroup(): HTMLElement {
        const bg = state.design.background;

        return group(
            "Hintergrund",
            field("Art", choice("bg-mode", [["gradient", "Verlauf"], ["color", "Farbe"], ["image", "Bild aus der Galerie"]], bg.mode, (value) => (bg.mode = value))),
            ...(bg.mode === "image"
                ? [
                      el("div", "sto-row", galleryButton(bg.image ? "Anderes Bild" : "Bild wählen", (source) => (bg.image = source)), el("span", "sto-src", bg.image ? bg.image.split("/").pop()! : "noch keins")),
                      field(`Abdunkeln: ${bg.dim} %`, range("bg-dim", bg.dim, 0, 90, (value) => (bg.dim = value))),
                  ]
                : []),
            two(field(bg.mode === "gradient" ? "Farbe oben links" : "Farbe", color("bg-color", bg.color, (value) => (bg.color = value))), ...(bg.mode === "gradient" ? [field("Farbe unten rechts", color("bg-to", bg.to, (value) => (bg.to = value)))] : [])),
            el("p", "sto-note", "Die Form ist der Umriss des ganzen Bilds – außerhalb bleibt es durchsichtig."),
            segment([["rect", "Eckig"], ["bevel", "Abgeschrägt"], ["round", "Abgerundet"]], bg.shape, (value) => (bg.shape = value), "Form des Bilds"),
            ...(bg.shape === "rect" ? [] : [field("Ecken", number("bg-cut", bg.cut, 0, 60, (value) => (bg.cut = value)))]),
            field("Rand", optionalColor("bg-border", bg.border, (value) => (bg.border = value))),
            field("Randstärke", number("bg-border-width", bg.borderWidth, 0, 8, (value) => (bg.borderWidth = value)))
        );
    }

    /** Plan 38: die Maße des gewählten Bereichs. */
    function areaGroup(): HTMLElement {
        const design = asBoard();
        const surface = (fill: IBoardFill, prefix: string): HTMLElement[] => [
            field("Fläche", paintOptional(`${prefix}-fill`, fill.fill, (value) => (fill.fill = value))),
            field(`Deckkraft der Fläche: ${fill.fillOpacity} %`, range(`${prefix}-opacity`, fill.fillOpacity, 0, 100, (value) => (fill.fillOpacity = value))),
            segment([["rect", "Eckig"], ["bevel", "Abgeschrägt"], ["round", "Abgerundet"]], fill.shape, (value) => (fill.shape = value), "Form der Fläche"),
            ...(fill.shape === "rect" ? [] : [field("Ecken", number(`${prefix}-cut`, fill.cut, 0, 40, (value) => (fill.cut = value)))]),
        ];
        const check = (label: string, on: boolean, apply: (on: boolean) => void): HTMLElement =>
            el(
                "label",
                "sto-check",
                toggle(on, label, (next) => {
                    history.remember(state);
                    apply(next);
                    changed();
                    paintInspector();
                }),
                label
            );

        if (area === "head" || area === "foot") {
            const part = design[area];

            return group(BOARD_AREA_LABEL[area], field("Höhe", number(`${area}-h`, part.h, area === "head" ? 40 : 0, area === "head" ? 400 : 300, (value) => (part.h = value))));
        }

        if (area === "podium") {
            const podium = design.podium;

            return group(
                "Podium · Platz 1–3",
                check("Podium zeigen", podium.on, (on) => (podium.on = on)),
                el("p", "sto-note", "Aus: Seite 1 zeigt nur Zeilen. Das Muster gilt für alle drei Plätze, die Farbe „Medaille“ macht den Unterschied."),
                two(field("Höhe des Bereichs", number("podium-h", podium.h, 120, 600, (value) => (podium.h = value))), field("Abstand", number("podium-gap", podium.gap, 0, 60, (value) => (podium.gap = value)))),
                two(field("Breite eines Platzes", number("podium-w", podium.w, 120, Math.floor((BOARD_WIDTH - 2 * podium.gap) / 3), (value) => (podium.w = value))), field("Höhe eines Platzes", number("podium-slot", podium.slotH, 60, podium.h, (value) => (podium.slotH = value)))),
                field("Tiefer gesetzt: Platz 1, 2, 3", el("div", "sto-three", ...([0, 1, 2] as const).map((index) => number(`podium-offset-${index}`, podium.offsets[index], 0, 200, (value) => (podium.offsets[index] = value))))),
                ...surface(podium, "podium")
            );
        }

        const row = design.row;
        const widest = row.columns === 2 ? Math.floor((BOARD_WIDTH - row.x - row.gap) / 2) : BOARD_WIDTH - row.x;

        return group(
            "Zeile · alle weiteren Plätze",
            two(field("Höhe", number("row-h", row.h, 30, 200, (value) => (row.h = value))), field("Abstand", number("row-gap", row.gap, 0, 40, (value) => (row.gap = value)))),
            two(field("Linker Rand", number("row-x", row.x, 0, 200, (value) => (row.x = value))), field("Breite", number("row-w", row.w, Math.min(200, widest), widest, (value) => (row.w = value)))),
            segment([["1", "Eine Spalte"], ["2", "Zwei Spalten"]], String(row.columns) as "1" | "2", (value) => (row.columns = value === "2" ? 2 : 1), "Spalten"),
            ...surface(row, "row"),
            field("Eigene Zeile hervorheben", optionalColor("row-highlight", row.highlight, (value) => (row.highlight = value)))
        );
    }

    /** Plan 38: was für das ganze Ranglisten-Bild gilt. */
    function wholeGroup(): HTMLElement {
        const design = asBoard();
        const title = text("board-title", design.title, 80, (value) => (design.title = value));

        title.setAttribute("aria-label", "Titel");

        return group(
            "Ganzes Bild",
            field("Titel – steht überall, wo {title} steht", title),
            placeholderMenu(title, ["guild", "period", "range"], (value) => (design.title = value)),
            el("p", "sto-note", "Bei den Posts der Aktivsten steht dort „Aktivste der Woche“ bzw. „des Monats“, bei {period} der Zeitraum."),
            two(field("Akzent", color("board-accent", design.accent, (value) => (design.accent = value))), field("Plätze je Seite", segment([["10", "10"], ["20", "20"]], String(design.perPage) as "10" | "20", (value) => (design.perPage = value === "20" ? 20 : 10), "Plätze je Seite"))),
            field("Medaillen: Platz 1, 2, 3", el("div", "sto-three", ...([0, 1, 2] as const).map((index) => color(`board-medal-${index}`, design.medals[index], (value) => (design.medals[index] = value))))),
            el(
                "label",
                "sto-check",
                toggle(design.glow, "Schein in der Akzentfarbe", (on) => {
                    history.remember(state);
                    design.glow = on;
                    changed();
                }),
                "Schein in der Akzentfarbe"
            ),
            el("p", "sto-note", "Discord blättert mit denselben Plätzen je Seite.")
        );
    }

    function range(key: string, value: number, min: number, max: number, apply: (value: number) => void): HTMLInputElement {
        const input = el("input", "");

        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = "5";
        input.value = String(value);
        input.addEventListener("input", () => {
            history.remember(state, key);
            apply(Number(input.value));
            changed();

            const label = input.closest("label")?.firstChild;

            if (label) label.textContent = label.textContent!.replace(/\d+ %/, `${input.value} %`);
        });

        return input;
    }

    function paintInspector(): void {
        const element = find(selected);

        if (!element) {
            const parts: HTMLElement[] = [];

            if (up && selected !== "bg") {
                const line = text("upLine", state.upLine, 200, (value) => (state.upLine = value));

                line.setAttribute("aria-label", "Zeile über dem Bild");
                parts.push(
                    group(
                        "Zeile über dem Bild",
                        field("Text", line),
                        placeholderMenu(line, LINE_PLACEHOLDERS, (value) => (state.upLine = value)),
                        el("p", "sto-note", "Gepingt wird nur die Person, die aufsteigt."),
                        ...(options.upMode === "text" ? [el("p", "sto-note", "Unter Belohnungen steht der Aufstieg gerade auf „Als Text“ – das Bild kommt erst bei „Als Bild“.")] : [])
                    )
                );
            }

            if (isBoard && selected !== "bg") parts.push(areaGroup(), wholeGroup());

            parts.push(backgroundGroup());

            if (!els().length) parts.push(el("p", "sto-note", isBoard ? `${BOARD_AREA_LABEL[area]} ist noch leer. Füg links Elemente hinzu oder nimm eine Vorlage.` : "Noch leer. Nimm links eine Vorlage oder füg Elemente hinzu."));

            s.inspector.replaceChildren(...parts);

            return;
        }

        const key = (name: string): string => `${element.id}:${name}`;
        const fonts = DESIGN_FONTS.map((font): [typeof font, string] => [font, font]);
        const sizes: HTMLElement[] = [];
        const groups: HTMLElement[] = [];

        switch (element.type) {
            case "text": {
                const input = text(key("text"), element.text, 200, (value) => (element.text = value));

                input.dataset.text = "true";
                sizes.push(field("Höchstens so breit", number(key("maxWidth"), element.maxWidth, 20, space().width, (value) => (element.maxWidth = value))));
                groups.push(
                    group(
                        "Text",
                        field("Inhalt", input),
                        placeholderMenu(input, placeholderKeys(), (value) => (element.text = value)),
                        two(field("Schrift", choice(key("font"), fonts, element.font, (value) => (element.font = value))), field("Größe", number(key("size"), element.size, 10, 120, (value) => (element.size = value)))),
                        // Plan 38: mit der Auswahl „Eigene Farbe / Akzent / …“ braucht die Farbe in der Rangliste eine eigene Zeile.
                        ...(isBoard
                            ? [field("Stärke", choice(key("weight"), [[400, "Normal"], [600, "Halbfett"], [700, "Fett"], [800, "Extrafett"]], element.weight, (value) => (element.weight = value))), field("Farbe", paint(key("color"), element.color, (value) => (element.color = value)))]
                            : [two(field("Stärke", choice(key("weight"), [[400, "Normal"], [600, "Halbfett"], [700, "Fett"], [800, "Extrafett"]], element.weight, (value) => (element.weight = value))), field("Farbe", paint(key("color"), element.color, (value) => (element.color = value))))]),
                        segment([["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]], element.align, (value) => (element.align = value), "Ausrichtung")
                    )
                );
                break;
            }
            case "image":
                sizes.push(two(field("Breite", number(key("w"), element.w, 8, space().width, (value) => (element.w = value))), field("Höhe", number(key("h"), element.h, 8, space().height, (value) => (element.h = value)))));
                groups.push(group("Bild", el("div", "sto-row", galleryButton("Anderes Bild", (source) => (element.source = source)), el("span", "sto-src", element.source.split("/").pop() ?? "")), field("Ecken runden", number(key("radius"), element.radius, 0, 150, (value) => (element.radius = value)))));
                break;
            case "shape":
                sizes.push(two(field("Breite", number(key("w"), element.w, 0, space().width, (value) => (element.w = value))), field("Höhe", number(key("h"), element.h, 0, space().height, (value) => (element.h = value)))));
                groups.push(
                    group(
                        "Form",
                        field("Art", choice(key("shape"), [["rect", "Rechteck"], ["bevel", "Abgeschrägt"], ["slant", "Schräge Kante"], ["circle", "Kreis"], ["line", "Linie"]], element.shape, (value) => (element.shape = value))),
                        field("Füllung", paintOptional(key("fill"), element.fill, (value) => (element.fill = value))),
                        field("Rand", paintOptional(key("stroke"), element.stroke, (value) => (element.stroke = value))),
                        two(field("Randstärke", number(key("strokeWidth"), element.strokeWidth, 0, 12, (value) => (element.strokeWidth = value))), field("Abschrägung", number(key("cut"), element.cut, 0, 150, (value) => (element.cut = value))))
                    )
                );
                break;
            case "avatar":
                sizes.push(field("Größe", number(key("size"), element.size, 24, Math.min(300, space().width, space().height), (value) => (element.size = value))));
                groups.push(group("Avatar", segment([["circle", "Rund"], ["bevel", "Abgeschrägt"]], element.shape, (value) => (element.shape = value), "Form"), ...(isBoard
                            ? [field("Ring", number(key("ring"), element.ring, 0, 12, (value) => (element.ring = value))), field("Ringfarbe", paint(key("ringColor"), element.ringColor, (value) => (element.ringColor = value)))]
                            : [two(field("Ring", number(key("ring"), element.ring, 0, 12, (value) => (element.ring = value))), field("Ringfarbe", paint(key("ringColor"), element.ringColor, (value) => (element.ringColor = value))))])));
                break;
            case "bar":
                sizes.push(two(field("Breite", number(key("w"), element.w, 20, space().width, (value) => (element.w = value))), field("Höhe", number(key("h"), element.h, 4, 60, (value) => (element.h = value)))));
                groups.push(
                    group(
                        "Balken",
                        segment([["solid", "Durchgehend"], ["segments", "In Feldern"]], element.style, (value) => (element.style = value), "Art"),
                        ...(element.style === "segments" ? [field("Felder", number(key("segments"), element.segments, 2, 40, (value) => (element.segments = value)))] : []),
                        segment([["round", "Rund"], ["bevel", "Abgeschrägt"]], element.corner, (value) => (element.corner = value), "Ecken"),
                        ...(isBoard
                            ? [field("Farbe von", paint(key("from"), element.from, (value) => (element.from = value))), field("Farbe bis", paint(key("to"), element.to, (value) => (element.to = value)))]
                            : [two(field("Farbe von", paint(key("from"), element.from, (value) => (element.from = value))), field("Farbe bis", paint(key("to"), element.to, (value) => (element.to = value))))]),
                        field("Spur", color(key("track"), element.track, (value) => (element.track = value)))
                    )
                );
                break;
            case "ring": {
                const value = text(key("value"), element.value, 40, (next) => (element.value = next));

                sizes.push(two(field("Größe", number(key("size"), element.size, 40, Math.min(300, space().width, space().height), (next) => (element.size = next))), field("Stärke", number(key("thickness"), element.thickness, 2, 75, (next) => (element.thickness = next)))));
                groups.push(
                    group(
                        "Level-Ring",
                        field("Farbe", paint(key("color"), element.color, (next) => (element.color = next))),
                        field("Spur", color(key("track"), element.track, (next) => (element.track = next))),
                        field("Innen", optionalColor(key("inner"), element.inner, (next) => (element.inner = next))),
                        field("Kleine Zeile", text(key("label"), element.label, 40, (next) => (element.label = next))),
                        field("Wert", value),
                        placeholderMenu(value, placeholderKeys(), (next) => (element.value = next)),
                        two(field("Schrift", choice(key("font"), fonts, element.font, (next) => (element.font = next))), field("Textfarbe", color(key("textColor"), element.textColor, (next) => (element.textColor = next))))
                    )
                );
                break;
            }
            case "icon":
                sizes.push(field("Größe", number(key("size"), element.size, 24, Math.min(300, space().width, space().height), (value) => (element.size = value))));
                groups.push(group("Server-Icon", segment([["circle", "Rund"], ["bevel", "Abgeschrägt"], ["square", "Eckig"]], element.shape, (value) => (element.shape = value), "Form")));
                break;
        }

        const name = text(key("name"), element.name, 40, (value) => {
            element.name = value.trim() || ELEMENT_LABEL[element.type];
            if (s.panel() === "layers") s.refreshPanel();
        });

        s.inspector.replaceChildren(
            group(
                `${element.name} · ${ELEMENT_LABEL[element.type]}`,
                field("Name der Ebene", name),
                two(field("X", number(key("x"), element.x, 0, space().width, (value) => (element.x = value))), field("Y", number(key("y"), element.y, 0, space().height, (value) => (element.y = value)))),
                ...sizes,
                field(`Deckkraft: ${Math.round(element.opacity * 100)} %`, range(key("opacity"), Math.round(element.opacity * 100), 0, 100, (value) => (element.opacity = value / 100)))
            ),
            ...groups
        );
    }

    /* ------------------------------------------------------------
       So in Discord
       ------------------------------------------------------------ */
    function paintDiscord(): void {
        if (discord.hidden || !image) return;

        const name = values["user.name"] ?? "du";
        const fill = (part: string): string =>
            part
                .replaceAll("{user.name}", name)
                .replaceAll("{level.old}", values["level.old"] ?? "")
                .replaceAll("{level}", values.level ?? "")
                .replaceAll("{xp.next}", values["xp.need"] ?? "")
                .replaceAll("{xp}", values.xp ?? "")
                .replaceAll("{rank}", values.rank ?? "")
                .replaceAll("{guild}", values.guild ?? "")
                .replaceAll("{channel}", "#allgemein");
        const line = el("div", "");

        state.upLine.split("{user}").forEach((part, index) => {
            if (index > 0) line.append(el("span", "men", `@${name}`));
            line.append(fill(part));
        });

        const shot = el("img", "");

        shot.src = image;
        shot.alt = "";
        const logo = el("img", "av");

        logo.src = `${BASE}/assets/images/rl-nexus-n-96.png`;
        logo.alt = "";
        discord.replaceChildren(logo, el("div", "", el("span", "nm", "RL Nexus"), el("span", "app", "APP"), line, shot));
    }

    /* ------------------------------------------------------------
       Los
       ------------------------------------------------------------ */
    s.openPanel(own ? (isBoard ? "areas" : "layers") : "templates");
    applyTools();
    repaint();
    changed();

    return { dirty };
}
