import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { LEGAL_DOCS, type ILegalText, type LegalBlock, type LegalDoc } from "../../shared/shop.ts";

/**
 * AGB und Widerrufsbelehrung. Die Texte liegen als Markdown in `shared/legal/`,
 * der Stand steht im Dateinamen (`agb-2026-10-12.md`). Ein neuer Stand ist eine
 * neue Datei: So hängt an jeder Bestätigung der Text, der bei der Bestellung galt.
 *
 * Gelesen wird beim ersten Zugriff. Die Webseite bekommt die Blöcke, die Mail
 * ein PDF daraus. Erlaubt ist nur, was die Texte brauchen: `#` Titel in der
 * ersten Zeile, `##` und `###`, `- ` Listenpunkte, Absätze durch Leerzeilen.
 */

const DEFAULT_DIR = path.join(import.meta.dirname, "..", "..", "shared", "legal");
const FILE = /^(agb|widerruf)-(\d{4}-\d{2}-\d{2})\.md$/;

/** Der Anbieter, für den Fuß von Mails und PDFs. In den Texten selbst steht er ausgeschrieben, je Stand. */
export const PROVIDER_LINE = "Connor Olischer · Königsberger Straße 8 · 25335 Elmshorn";

let dir = DEFAULT_DIR;
let texts: Map<string, ILegalText> | null = null;
const pdfs = new Map<string, Promise<Buffer>>();

/** Nur für Checks: anderer Ordner, alles Gemerkte weg. null: wieder `shared/legal`. */
export function setLegalDir(next: string | null): void {
    dir = next ?? DEFAULT_DIR;
    texts = null;
    pdfs.clear();
}

export function parseLegal(doc: LegalDoc, version: string, markdown: string): ILegalText {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const first = lines[0] ?? "";
    if (!first.startsWith("# ")) throw new Error(`${doc}-${version}.md braucht in der ersten Zeile den Titel mit „# “.`);

    const blocks: LegalBlock[] = [];
    let paragraph: string[] = [];
    const flush = (): void => {
        if (paragraph.length > 0) blocks.push({ kind: "p", text: paragraph.join(" ") });
        paragraph = [];
    };

    for (const raw of lines.slice(1)) {
        const line = raw.trim();
        const heading = /^(#{2,3}) (.+)$/.exec(line);

        if (line === "") {
            flush();
        } else if (heading) {
            flush();
            blocks.push({ kind: heading[1] === "##" ? "h2" : "h3", text: heading[2].trim() });
        } else if (line.startsWith("- ")) {
            flush();
            blocks.push({ kind: "li", text: line.slice(2).trim() });
        } else {
            paragraph.push(line);
        }
    }

    flush();

    return { doc, title: first.slice(2).trim(), version, blocks };
}

function load(): Map<string, ILegalText> {
    if (texts) return texts;

    const loaded = new Map<string, ILegalText>();
    let files: string[] = [];

    try {
        files = readdirSync(dir);
    } catch {
        // Ohne Ordner gibt es keinen Stand, und die Einstellungen lassen sich nicht speichern. Das sagt dann der Satz dort.
    }

    for (const file of files) {
        const match = FILE.exec(file);
        if (match) loaded.set(`${match[1]}:${match[2]}`, parseLegal(match[1] as LegalDoc, match[2], readFileSync(path.join(dir, file), "utf8")));
    }

    texts = loaded;

    return loaded;
}

/** Jeder Stand, für den es beide Texte gibt, aufsteigend. */
export function legalVersions(): readonly string[] {
    const all = load();
    const versions = new Set([...all.values()].map((text) => text.version));

    return [...versions].filter((version) => LEGAL_DOCS.every((doc) => all.has(`${doc}:${version}`))).sort();
}

export function legalText(doc: LegalDoc, version: string): ILegalText | null {
    return load().get(`${doc}:${version}`) ?? null;
}

const LONG_DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** „12. Oktober 2026“ aus „2026-10-12“. */
export function legalDay(version: string): string {
    return LONG_DAY.format(new Date(`${version}T00:00:00Z`));
}

/** Die Standardschriften von PDF können nur WinAnsi. Was darin fehlt, wird ersetzt statt als Kästchen gedruckt. */
function pdfSafe(text: string): string {
    return text
        .replace(/[‐‑−]/g, "-")
        .replace(/[  ]/g, " ")
        .replace(/[^ -~¡-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "?");
}

const MARGIN = 56;

function render(text: ILegalText): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: text.title, Author: "RL Nexus" } });
        const chunks: Buffer[] = [];

        pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);

        pdf.font("Helvetica-Bold").fontSize(16).text(pdfSafe(text.title));
        pdf.font("Helvetica").fontSize(9).fillColor("#555555").text(`Stand: ${legalDay(text.version)}`).fillColor("#000000").moveDown(1);

        for (const block of text.blocks) {
            if (block.kind === "h2") pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(12).text(pdfSafe(block.text)).moveDown(0.3);
            else if (block.kind === "h3") pdf.moveDown(0.4).font("Helvetica-Bold").fontSize(10.5).text(pdfSafe(block.text)).moveDown(0.2);
            else if (block.kind === "li") pdf.font("Helvetica").fontSize(10).text(`•  ${pdfSafe(block.text)}`, { lineGap: 4, paragraphGap: 3 });
            else pdf.font("Helvetica").fontSize(10).text(pdfSafe(block.text), { lineGap: 4, paragraphGap: 7 });
        }

        // Fuß auf jeder Seite. Unterhalb des Rands schriebe pdfkit sonst auf eine neue Seite.
        const range = pdf.bufferedPageRange();

        for (let index = range.start; index < range.start + range.count; index++) {
            pdf.switchToPage(index);
            pdf.page.margins.bottom = 0;
            pdf.font("Helvetica")
                .fontSize(8)
                .fillColor("#777777")
                .text(`${pdfSafe(PROVIDER_LINE)} · Seite ${index + 1} von ${range.count}`, MARGIN, pdf.page.height - 40, {
                    width: pdf.page.width - 2 * MARGIN,
                    align: "center",
                    lineBreak: false,
                });
        }

        pdf.end();
    });
}

/** Das PDF eines Texts, je Stand einmal gebaut. null: Diesen Stand gibt es nicht. */
export function legalPdf(doc: LegalDoc, version: string): Promise<Buffer | null> {
    const text = legalText(doc, version);
    if (!text) return Promise.resolve(null);

    const key = `${doc}:${version}`;
    let pending = pdfs.get(key);

    if (!pending) {
        // Scheitert das Bauen, nicht merken: Sonst scheiterte jede Bestätigung dieses Stands bis zum Neustart.
        pending = render(text).catch((error: unknown) => {
            pdfs.delete(key);
            throw error;
        });
        pdfs.set(key, pending);
    }

    return pending;
}
