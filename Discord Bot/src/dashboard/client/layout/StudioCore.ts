/**
 * Plan 36: was das Studio rechnet, ohne DOM - Rückgängig und Wiederholen,
 * Einrasten, Klemmen, Größe ändern, Tastenkürzel. So prüft es
 * scripts/CheckStudio.ts ohne Browser, und jeder Builder rechnet gleich.
 */

import { STAGE_GRID, STAGE_SNAP } from "../../../constants/Welcome.js";

export interface IRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Der Rückgängig-Stapel. `remember` merkt den Stand **vor** einer Änderung.
 * Derselbe Schlüssel kurz hintereinander (Tippen im selben Feld) ist ein
 * Schritt. Jede neue Änderung leert das Wiederholen.
 */
export class History<T> {
    private past: T[] = [];
    private future: T[] = [];
    private lastKey = "";
    private lastAt = -Infinity;

    constructor(
        private readonly limit = 50,
        private readonly coalesceMs = 900
    ) {}

    remember(state: T, key = "", now = Date.now()): void {
        if (key && key === this.lastKey && now - this.lastAt < this.coalesceMs) {
            this.lastAt = now;

            return;
        }

        this.lastKey = key;
        this.lastAt = now;
        this.past.push(structuredClone(state));

        if (this.past.length > this.limit) this.past.shift();

        this.future = [];
    }

    undo(current: T): T | null {
        const previous = this.past.pop();

        if (previous === undefined) return null;

        this.future.push(structuredClone(current));
        this.lastKey = "";

        return previous;
    }

    redo(current: T): T | null {
        const next = this.future.pop();

        if (next === undefined) return null;

        this.past.push(structuredClone(current));
        this.lastKey = "";

        return next;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }

    clear(): void {
        this.past = [];
        this.future = [];
        this.lastKey = "";
    }
}

/** Die kleinste Verschiebung, mit der eine der Kanten auf ein Ziel fällt - unter STAGE_SNAP. */
function nearest(edges: number[], targets: number[]): { shift: number; at: number } | null {
    let found: { shift: number; at: number } | null = null;

    for (const edge of edges)
        for (const target of targets) {
            const shift = target - edge;

            if (Math.abs(shift) < STAGE_SNAP && (!found || Math.abs(shift) < Math.abs(found.shift))) found = { shift, at: target };
        }

    return found;
}

/**
 * Verschieben: Kanten und Mitte rasten an der Mitte der Fläche und an Kanten
 * und Mitten der anderen ein; sonst das Raster auf der freien Achse. Danach
 * liegt der ganze Rahmen auf der Fläche.
 */
export function snapMove(
    box: IRect,
    dx: number,
    dy: number,
    others: IRect[],
    size: { width: number; height: number },
    options: { snap: boolean; grid: boolean }
): { dx: number; dy: number; guideX: number | null; guideY: number | null } {
    let guideX: number | null = null;
    let guideY: number | null = null;

    if (options.snap) {
        const xs = [size.width / 2, ...others.flatMap((other) => [other.x, other.x + other.w / 2, other.x + other.w])];
        const ys = [size.height / 2, ...others.flatMap((other) => [other.y, other.y + other.h / 2, other.y + other.h])];
        const x = nearest([box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w], xs);
        const y = nearest([box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h], ys);

        if (x) {
            dx += x.shift;
            guideX = x.at;
        }

        if (y) {
            dy += y.shift;
            guideY = y.at;
        }
    }

    if (options.grid) {
        if (guideX === null) dx = Math.round((box.x + dx) / STAGE_GRID) * STAGE_GRID - box.x;
        if (guideY === null) dy = Math.round((box.y + dy) / STAGE_GRID) * STAGE_GRID - box.y;
    }

    dx = Math.min(size.width - box.w - box.x, Math.max(-box.x, dx));
    dy = Math.min(size.height - box.h - box.y, Math.max(-box.y, dy));

    return { dx: Math.round(dx), dy: Math.round(dy), guideX, guideY };
}

/** Avatar, Ring, Icon: quadratisch. Bild, Form, Balken: frei. Text: nur die Höhe zählt (Schriftgröße). */
export type ResizeMode = "square" | "free" | "font";
export type Corner = "nw" | "ne" | "sw" | "se";

/** Größe über eine Ecke ändern - die gegenüberliegende Ecke bleibt stehen, alles bleibt auf der Fläche. */
export function resizeBox(box: IRect, corner: Corner, dx: number, dy: number, mode: ResizeMode, limits: { min: number; max: number }, size: { width: number; height: number }): IRect {
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    const west = corner === "nw" || corner === "sw";
    const north = corner === "nw" || corner === "ne";
    // So viel Platz hat die Seite, die sich bewegt.
    const roomW = west ? right : size.width - box.x;
    const roomH = north ? bottom : size.height - box.y;
    const clamp = (value: number, room: number) => Math.min(limits.max, room, Math.max(limits.min, value));
    let w = box.w + (west ? -dx : dx);
    let h = box.h + (north ? -dy : dy);

    if (mode === "square") {
        const grow = Math.abs(w - box.w) >= Math.abs(h - box.h) ? w - box.w : h - box.h;

        w = h = Math.min(clamp(box.w + grow, roomW), clamp(box.h + grow, roomH));
    } else {
        w = mode === "font" ? box.w : clamp(w, roomW);
        h = clamp(h, roomH);
    }

    return { x: Math.round(west ? right - w : box.x), y: Math.round(north ? bottom - h : box.y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Strg+Z, Strg+Y, Strg+Umschalt+Z. In Eingabefeldern gehört das Rückgängig
 * dem Browser - dort macht es das Tippen rückgängig, nicht den Studio-Schritt.
 */
/**
 * Review Plan 38: eine Zahl aus einem Eingabefeld. Beim Tippen (final false)
 * zählt ein Wert unter dem Minimum noch nicht - die „1“ auf dem Weg zu „100“
 * soll nicht alles auf 30 stauchen. Beim Verlassen des Felds wird geklemmt.
 */
export function typedNumber(raw: string, min: number, max: number, final: boolean): number | null {
    if (raw.trim() === "") return null;

    const value = Math.round(Number(raw));

    if (!Number.isFinite(value) || (!final && value < min)) return null;

    return Math.min(max, Math.max(min, value));
}

/** Eingabefelder, in denen man tippt - dort hat der Browser ein eigenes Rückgängig. */
const TYPED = new Set(["text", "number", "search", "email", "url", "tel", "password", ""]);

/**
 * Review I1: welches Studio ein Kürzel bekommt. Liegt der Fokus in einem,
 * dieses. Ist er nach einem Umbau auf die Seite gefallen (loose), das
 * sichtbare, das zuletzt benutzt wurde (recent, Plan 39: mehrere Builder auf
 * einer Seite). Sonst keins (-1) - etwa im Suchfeld der Leiste.
 */
export function shortcutOwner(studios: readonly { inside: boolean; visible: boolean; recent?: number }[], loose: boolean): number {
    const inside = studios.findIndex((entry) => entry.inside);

    if (inside >= 0 || !loose) return inside;

    let best = -1;

    studios.forEach((entry, index) => {
        if (entry.visible && (best < 0 || (entry.recent ?? 0) > (studios[best].recent ?? 0))) best = index;
    });

    return best;
}

export function studioShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; target: { tagName?: string; type?: string; isContentEditable?: boolean } | null }): "undo" | "redo" | null {
    if (!event.ctrlKey && !event.metaKey) return null;

    const tag = event.target?.tagName?.toUpperCase();

    // Review I1: nur wo man tippt, gilt das Rückgängig des Browsers - Regler, Farbe, Schalter und Auswahl haben keins.
    if ((tag === "INPUT" && TYPED.has((event.target?.type ?? "text").toLowerCase())) || tag === "TEXTAREA" || event.target?.isContentEditable) return null;

    const key = event.key.toLowerCase();

    if (key === "y" || (key === "z" && event.shiftKey)) return "redo";

    return key === "z" ? "undo" : null;
}
