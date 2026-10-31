/**
 * Was Schalter und Leiste zu einem Modul zeigen. Der Schalter folgt dem Klick
 * sofort (shown), der Eintrag in der Leiste erst dem Stand des Bots (saved):
 * sonst öffnet man die Seite eines Moduls, bevor es gespeichert ist, und sie
 * bekommt „Das Modul ist auf diesem Server aus.“ (W-0033). Ohne DOM, damit
 * npm run check:dashboard es prüfen kann.
 */
export function moduleState(id: string, saved: ReadonlySet<string>, shown: ReadonlySet<string>, always: boolean, pinned = false): { checked: boolean; linked: boolean } {
    // pinned: aus, aber die Seite wird noch gebraucht (Anti Villain mit Festgehaltenen, Plan 31).
    return { checked: always || shown.has(id), linked: always || saved.has(id) || pinned };
}
