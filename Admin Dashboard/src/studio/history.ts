/**
 * W-0062 Teil 2: der Rückgängig-Stapel der Studios. Kopie aus dem Bot
 * (`Discord Bot/src/dashboard/client/layout/StudioCore.ts`), mit normalen
 * Feldern statt Parameter-Properties (erasableSyntaxOnly).
 *
 * `remember` merkt den Stand **vor** einer Änderung. Derselbe Schlüssel kurz
 * hintereinander (Tippen im selben Feld) ist ein Schritt. Jede neue Änderung
 * leert das Wiederholen.
 */
export class History<T> {
    private past: T[] = [];
    private future: T[] = [];
    private lastKey = "";
    private lastAt = -Infinity;
    private readonly limit: number;
    private readonly coalesceMs: number;

    constructor(limit = 50, coalesceMs = 900) {
        this.limit = limit;
        this.coalesceMs = coalesceMs;
    }

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
