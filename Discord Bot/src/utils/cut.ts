/**
 * Kürzen, ohne ein Zeichen zu zerschneiden. text.slice() zählt UTF-16-Einheiten:
 * ein Emoji sind zwei oder mehr, und ein halbes ist ein kaputtes Zeichen, an dem
 * Discord Menüs und Bildbeschreibungen ablehnen kann.
 */

const GRAPHEMES = new Intl.Segmenter("de", { granularity: "grapheme" });

/** Der Text in ganzen Zeichen - 📢, 🇩🇪 und 👨‍👩‍👧 sind je eins. */
export function Chars(text: string): string[] {
    return Array.from(GRAPHEMES.segment(text), (part) => part.segment);
}

/**
 * Kürzt mit „…“ auf höchstens max Zeichen, gezählt wie Discord (UTF-16).
 * Ein Emoji an der Schnittstelle bleibt ganz oder fällt ganz weg.
 */
export function Cut(text: string, max: number): string {
    if (text.length <= max) return text;

    let cut = "";

    // Das „…“ braucht selbst eine Einheit.
    for (const char of Chars(text)) {
        if (cut.length + char.length >= max) break;

        cut += char;
    }

    return `${cut}…`;
}
