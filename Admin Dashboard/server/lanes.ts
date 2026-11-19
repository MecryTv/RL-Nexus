/**
 * W-0141: `work` für alle Einträge, höchstens `lanes` gleichzeitig. Die
 * Ergebnisse stehen in der Reihenfolge der Einträge. Nach dem ersten Fehler
 * fängt keine Spur etwas Neues an, der Fehler kommt beim Aufrufer an.
 */
export async function inLanes<T, R>(items: readonly T[], lanes: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    let failed = false;

    const lane = async (): Promise<void> => {
        while (!failed && next < items.length) {
            const index = next++;

            try {
                results[index] = await work(items[index], index);
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane));

    return results;
}
