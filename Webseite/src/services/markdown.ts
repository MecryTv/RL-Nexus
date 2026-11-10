import { isSafeLink } from "./Content.ts";

/**
 * Eine kleine Markdown-Teilmenge für Text-Bausteine der News (W-0062): Absätze,
 * Zeilenumbrüche, **fett**, *kursiv*, [Text](https://…) und Listen mit „-“ oder
 * „1.“. Daraus werden React-Elemente (components/news/Markdown.tsx), nie HTML.
 * Alles, was nicht dazugehört, bleibt Text. Links nur über isSafeLink.
 */

export type IMdInline =
    | { readonly kind: "text" | "strong" | "em"; readonly text: string }
    | { readonly kind: "link"; readonly text: string; readonly href: string }
    | { readonly kind: "br" };

export type IMdBlock = { readonly kind: "p"; readonly inline: readonly IMdInline[] } | { readonly kind: "ul" | "ol"; readonly items: readonly (readonly IMdInline[])[] };

const TOKEN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

function inlineOf(line: string): IMdInline[] {
    const parts: IMdInline[] = [];
    let last = 0;

    for (const match of line.matchAll(TOKEN)) {
        const index = match.index ?? 0;

        if (index > last) parts.push({ kind: "text", text: line.slice(last, index) });

        if (match[1] !== undefined) parts.push({ kind: "strong", text: match[1] });
        else if (match[2] !== undefined) parts.push({ kind: "em", text: match[2] });
        else if (isSafeLink(match[4])) parts.push({ kind: "link", text: match[3] ?? "", href: match[4] ?? "" });
        else parts.push({ kind: "text", text: match[0] });

        last = index + match[0].length;
    }

    if (last < line.length) parts.push({ kind: "text", text: line.slice(last) });

    // Nebeneinanderliegende Textstücke zusammenlegen (ein abgelehnter Link wird sonst ein eigenes Stück).
    return parts.reduce<IMdInline[]>((merged, part) => {
        const previous = merged[merged.length - 1];

        if (part.kind === "text" && previous?.kind === "text") merged[merged.length - 1] = { kind: "text", text: previous.text + part.text };
        else merged.push(part);

        return merged;
    }, []);
}

export function parseMarkdown(md: string): IMdBlock[] {
    const blocks: IMdBlock[] = [];
    let paragraph: string[] = [];
    let list: { kind: "ul" | "ol"; items: IMdInline[][] } | null = null;

    const flush = (): void => {
        if (paragraph.length > 0) {
            blocks.push({ kind: "p", inline: paragraph.flatMap((line, index) => (index === 0 ? inlineOf(line) : [{ kind: "br" } as const, ...inlineOf(line)])) });
            paragraph = [];
        }

        if (list) {
            blocks.push(list);
            list = null;
        }
    };

    for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trimEnd();
        const bullet = BULLET.exec(line);
        const number = NUMBER.exec(line);

        if (!line.trim()) {
            flush();
            continue;
        }

        if (bullet || number) {
            const kind = bullet ? "ul" : "ol";

            if (paragraph.length > 0 || (list && list.kind !== kind)) flush();

            list ??= { kind, items: [] };
            list.items.push(inlineOf((bullet ?? number)![1]!));
            continue;
        }

        if (list) flush();

        paragraph.push(line.trim());
    }

    flush();

    return blocks;
}
