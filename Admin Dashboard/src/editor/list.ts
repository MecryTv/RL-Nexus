/** Unveränderliche Listen-Helfer für die Editoren: jede Änderung gibt eine neue Liste zurück. */

export function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
    return list.map((entry, i) => (i === index ? item : entry));
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
    return list.filter((_, i) => i !== index);
}

export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    const [item] = next.splice(from, 1);

    next.splice(to, 0, item);

    return next;
}
