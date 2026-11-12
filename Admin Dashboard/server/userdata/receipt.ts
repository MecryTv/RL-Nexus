import { createHmac } from "node:crypto";
import path from "node:path";
import PDFDocument from "pdfkit";
import { USERDATA_AREAS, USERDATA_BACKUP_DAYS, USERDATA_PROOF_YEARS, basisText } from "../../shared/userdata.ts";
import type { IDeletionRecord } from "./deletions.ts";

/**
 * Der Beleg einer Löschung als PDF (W-0051, Entwurf B1+): dunkel wie das
 * Dashboard, zwei Seiten. Seite 1 bestätigt mit Zahlen, Bereichen und Ablauf,
 * Seite 2 sagt, was bleibt und warum, welche Rechte die Person hat und wie
 * sich der Beleg prüfen lässt. Geht mit der DM „Erledigt“ an die Person.
 */

const ASSETS = path.join(import.meta.dirname, "..", "assets");
const W = 595.28;
const H = 841.89;
const X = 40;
const INNER = W - 2 * X;

const BG = "#07090c";
const WHITE = "#ffffff";
const TEXT = "#e8ebf0";
const SOFT = "#b9c0cb";
const DIM = "#8f98a5";
const RED = "#ff1e2d";
const GREEN = "#35e07f";
const GOLD = "#ffc53d";

/** Verantwortlicher und Aufsicht wie in der Datenschutzerklärung der Webseite. */
const CONTROLLER = ["Connor Olischer und Joe Jobst · RL Nexus", "Königsberger Straße 8, 25335 Elmshorn", "Garzweg 11, 32602 Vlotho", "support@nexus-emb.de"];
const AUTHORITY = "Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein, Holstenstraße 98, 24103 Kiel";

const BERLIN = { timeZone: "Europe/Berlin" } as const;
const LONG = new Intl.DateTimeFormat("de-DE", { ...BERLIN, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const SHORT = new Intl.DateTimeFormat("de-DE", { ...BERLIN, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const long = (iso: string): string => LONG.format(new Date(iso));
/** „01.11. 20:51“ */
const short = (iso: string): string => SHORT.format(new Date(iso)).replace(",", "");
const number = (value: number): string => value.toLocaleString("de-DE");

/** Nur Zeichen, die die Schriften haben: Emojis und Exoten aus Grund und Namen fallen raus. */
function clean(text: string): string {
    return text
        .replace(/[^ -ɏ‐-‧‰-⁞€]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Ein Satz endet mit Punkt, damit der nächste nicht anklebt. */
function sentence(text: string): string {
    const clear = clean(text);

    return /[.!?…]$/.test(clear) ? clear : `${clear}.`;
}

/** 12 Zeichen HMAC über Nummer, ID, Zeit und Zahlen: Ändert jemand den Beleg, passt der Code nicht mehr. */
export function receiptCode(record: Pick<IDeletionRecord, "id" | "userId" | "doneAt" | "result">, secret: string): string {
    const hex = createHmac("sha256", `receipt:${secret}`)
        .update(JSON.stringify([record.id, record.userId, record.doneAt, record.result]))
        .digest("hex")
        .slice(0, 12)
        .toUpperCase();

    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

type Pdf = PDFKit.PDFDocument;

function background(pdf: Pdf): void {
    pdf.rect(0, 0, W, H).fill(BG);

    const glow = pdf.radialGradient(W, 0, 0, W, 0, 460);
    glow.stop(0, RED, 0.16).stop(1, RED, 0);
    pdf.rect(0, 0, W, H).fill(glow);

    const cool = pdf.radialGradient(0, H, 0, 0, H, 360);
    cool.stop(0, "#00afff", 0.07).stop(1, "#00afff", 0);
    pdf.rect(0, 0, W, H).fill(cool);

    pdf.save().lineWidth(0.5).strokeColor(WHITE).strokeOpacity(0.025);
    for (let x = 24; x < W; x += 24) pdf.moveTo(x, 0).lineTo(x, H);
    for (let y = 24; y < H; y += 24) pdf.moveTo(0, y).lineTo(W, y);
    pdf.stroke().restore();
}

function label(pdf: Pdf, text: string, x: number, y: number, color = DIM, size = 7.5): void {
    pdf.font("Raj").fontSize(size).fillColor(color).text(text.toUpperCase(), x, y, { characterSpacing: 1.3, lineBreak: false });
}

function section(pdf: Pdf, title: string, y: number): number {
    label(pdf, title, X, y);
    const end = X + pdf.widthOfString(title.toUpperCase(), { characterSpacing: 1.3 }) + 10;
    pdf.save().moveTo(end, y + 4).lineTo(W - X, y + 4).lineWidth(0.6).strokeColor(WHITE).strokeOpacity(0.1).stroke().restore();

    return y + 16;
}

function box(pdf: Pdf, x: number, y: number, w: number, h: number): void {
    pdf.save().rect(x, y, w, h).fillOpacity(0.03).fill(WHITE).restore();
    pdf.save().rect(x, y, w, h).lineWidth(0.6).strokeColor(WHITE).strokeOpacity(0.12).stroke().restore();
}

function header(pdf: Pdf, id: number): void {
    pdf.image(path.join(ASSETS, "mail-logo.png"), X, 34, { width: 26 });
    pdf.font("OxX").fontSize(13).fillColor(WHITE).text("RL NEXUS", X + 34, 35, { characterSpacing: 1, lineBreak: false });
    label(pdf, "Löschbestätigung · Art. 17 DSGVO", X + 34, 52, "#ff5a66", 7.5);
    pdf.font("Raj").fontSize(7);
    label(pdf, "Beleg", W - X - pdf.widthOfString("BELEG", { characterSpacing: 1.3 }) + 1.3, 36, DIM, 7);
    pdf.font("OxX").fontSize(12).fillColor(WHITE).text(`Nr. ${id}`, W - X - 120, 46, { width: 120, align: "right", lineBreak: false });

    pdf.save().moveTo(X, 72).lineTo(W - X, 72).lineWidth(0.6).strokeColor(WHITE).strokeOpacity(0.1).stroke().restore();
    const line = pdf.linearGradient(X, 0, W - X, 0);
    line.stop(0, RED, 1).stop(1, RED, 0);
    pdf.rect(X, 74, INNER, 1.6).fill(line);
}

function footer(pdf: Pdf, left: string, code: string, page: number): void {
    pdf.save().moveTo(X, H - 40).lineTo(W - X, H - 40).lineWidth(0.6).strokeColor(WHITE).strokeOpacity(0.1).stroke().restore();
    pdf.font("Ox").fontSize(7).fillColor(DIM).text(left, X, H - 32, { width: 330, lineBreak: false });
    pdf.font("Ox").fontSize(7).fillColor(DIM).text(`Prüfcode ${code} · Seite ${page}/2`, W - X - 200, H - 32, { width: 200, align: "right", lineBreak: false });
}

/** Seite 1: Bestätigung mit Stempel, Beteiligten, Zahlen, Bereichen, Ablauf und Anlass. */
function confirmation(pdf: Pdf, record: IDeletionRecord, code: string, now: Date): void {
    const result = record.result ?? { deleted: {}, anonymized: {}, kept: [], servers: 0 };
    const sum = (values: Partial<Record<string, number>>): number => Object.values(values).reduce<number>((total, rows) => total + (rows ?? 0), 0);
    const done = record.doneAt ?? now.toISOString();

    background(pdf);
    header(pdf, record.id);

    pdf.font("OxX").fontSize(21).fillColor(WHITE).text("Deine Daten bei RL Nexus sind gelöscht", X, 92, { width: 330, lineGap: -2 });
    pdf.font("Ox").fontSize(9.5).fillColor(SOFT).text("Wir haben alle Daten zu diesem Discord-Konto zur angekündigten Frist gelöscht, bis auf das, was wir nach Seite 2 aufbewahren müssen.", X, pdf.y + 6, { width: 330, lineGap: 1.5 });

    // Stempel, leicht gedreht.
    pdf.save().rotate(-7, { origin: [W - X - 62, 116] });
    pdf.rect(W - X - 122, 96, 120, 42).lineWidth(1.8).strokeColor(GREEN).stroke();
    pdf.font("OxX").fontSize(14).fillColor(GREEN).text("GELÖSCHT", W - X - 122, 103, { width: 120, align: "center", characterSpacing: 2, lineBreak: false });
    pdf.font("Raj").fontSize(8).fillColor(GREEN).text(LONG.format(new Date(done)).replace(",", " ·"), W - X - 122, 122, { width: 120, align: "center", characterSpacing: 1, lineBreak: false });
    pdf.restore();

    // Beteiligte
    const parties = 176;
    const half = (INNER - 10) / 2;
    box(pdf, X, parties, half, 72);
    box(pdf, X + half + 10, parties, half, 72);
    label(pdf, "Betroffene Person", X + 10, parties + 9, DIM, 7);
    pdf.font("Ox").fontSize(9).fillColor(TEXT).text(`Discord-ID ${record.userId}`, X + 10, parties + 21, { width: half - 20 });
    pdf.font("Ox").fontSize(8).fillColor(DIM).text("Name gelöscht, nur die ID bleibt als Nachweis", X + 10, parties + 34, { width: half - 20 });
    label(pdf, "Verantwortliche", X + half + 20, parties + 9, DIM, 7);
    pdf.font("Ox").fontSize(9).fillColor(TEXT).text(CONTROLLER.join("\n"), X + half + 20, parties + 21, { width: half - 20, lineGap: 1 });

    // Drei Zahlen
    const tiles = 250;
    const third = (INNER - 20) / 3;
    const numbers: readonly [number, string, string][] = [
        [sum(result.deleted) + sum(result.anonymized), "Einträge gelöscht", RED],
        [result.servers, result.servers === 1 ? "Server betroffen" : "Server betroffen", "#5b6472"],
        [result.kept.reduce((total, entry) => total + entry.rows, 0), "Einträge aufbewahrt", GOLD],
    ];

    numbers.forEach(([value, text, color], index) => {
        const x = X + index * (third + 10);
        box(pdf, x, tiles, third, 50);
        pdf.rect(x, tiles, 2, 50).fill(color);
        pdf.font("OxX").fontSize(19).fillColor(WHITE).text(number(value), x + 12, tiles + 9, { lineBreak: false });
        pdf.font("Ox").fontSize(8.5).fillColor(SOFT).text(text, x + 12, tiles + 33, { lineBreak: false });
    });

    // Bereiche
    let y = section(pdf, "Bereiche", 318);
    const columns = { area: X + 6, rows: X + 300, state: X + 330 };

    label(pdf, "Bereich", columns.area, y, DIM, 7);
    label(pdf, "Einträge", columns.rows - 40, y, DIM, 7);
    label(pdf, "Ergebnis", columns.state, y, DIM, 7);
    y += 12;
    pdf.save().moveTo(X, y).lineTo(W - X, y).lineWidth(0.8).strokeColor(WHITE).strokeOpacity(0.2).stroke().restore();
    y += 6;

    for (const area of USERDATA_AREAS) {
        const kept = result.kept.find((entry) => entry.area === area.id);
        const gone = result.deleted[area.id] ?? 0;
        const removed = result.anonymized[area.id] ?? 0;
        if (!kept && gone + removed === 0) continue;

        const sub = kept ? area.inside.join(", ") : removed > 0 ? (gone > 0 ? `davon ${number(removed)} aus Einträgen anderer entfernt` : "aus Einträgen anderer entfernt") : area.inside.join(", ");

        pdf.font("Ox").fontSize(9).fillColor(TEXT).text(area.label, columns.area, y, { width: 250, lineBreak: false });
        pdf.font("Ox").fontSize(7.5).fillColor(DIM).text(sub, columns.area, y + 12, { width: 250, lineBreak: false });
        pdf.font("OxB").fontSize(9).fillColor(WHITE).text(number(kept ? kept.rows : gone + removed), columns.rows - 60, y, { width: 60, align: "right", lineBreak: false });
        pdf.font("OxB").fontSize(9).fillColor(kept ? GOLD : GREEN).text(kept ? "aufbewahrt, siehe Seite 2" : "gelöscht", columns.state, y, { lineBreak: false });

        y += 26;
        pdf.save().moveTo(X, y - 4).lineTo(W - X, y - 4).lineWidth(0.5).strokeColor(WHITE).strokeOpacity(0.07).stroke().restore();
    }

    // Ablauf
    y = section(pdf, "Ablauf", y + 10);
    const steps: readonly [string, string, boolean][] = [
        ["Geplant", short(record.createdAt), true],
        [record.dmState === "nicht_zustellbar" ? "DM nicht zustellbar" : "DM zugestellt", record.dmState === "zugestellt" ? short(record.createdAt) : "–", record.dmState === "zugestellt"],
        ["Kopie", record.copyAt ? short(record.copyAt) : "nicht abgerufen", record.copyAt !== null],
        ["Gelöscht", short(done), true],
    ];
    const step = INNER / steps.length;
    const dots = y + 8;

    pdf.save().moveTo(X + step / 2, dots).lineTo(W - X - step / 2, dots).lineWidth(1.6).strokeColor(GREEN).strokeOpacity(0.7).stroke().restore();
    steps.forEach(([name, at, ok], index) => {
        const cx = X + step * index + step / 2;

        pdf.circle(cx, dots, 9).fill(BG);
        if (ok) pdf.circle(cx, dots, 6).fill(GREEN);
        else pdf.circle(cx, dots, 5.5).lineWidth(1.4).strokeColor("#5b6472").stroke();
        pdf.font("OxB").fontSize(9).fillColor(WHITE).text(name, cx - step / 2, dots + 14, { width: step, align: "center", lineBreak: false });
        pdf.font("Ox").fontSize(8).fillColor(SOFT).text(at, cx - step / 2, dots + 26, { width: step, align: "center", lineBreak: false });
    });

    // Anlass
    const reason = y + 64;
    box(pdf, X, reason, INNER, 40);
    label(pdf, "Anlass", X + 10, reason + 8, DIM, 7);
    pdf.font("Ox").fontSize(9).fillColor(TEXT).text(`${clean(record.reason)} · bearbeitet von ${clean(record.plannedName)}`, X + 10, reason + 20, { width: INNER - 20, lineBreak: false, ellipsis: true });

    footer(pdf, `Maschinell erstellt, gültig ohne Unterschrift · erstellt ${long(now.toISOString())}`, code, 1);
}

function item(pdf: Pdf, y: number, title: string, text: string, tag: string | null, gold = false): number {
    const icon = gold ? GOLD : SOFT;

    pdf.save().rect(X, y, 16, 16).lineWidth(0.8).strokeColor(icon).strokeOpacity(gold ? 0.7 : 0.3).stroke().restore();
    if (gold) {
        pdf.save().rect(X + 4.5, y + 7.5, 7, 5).fill(GOLD).restore();
        pdf.save().moveTo(X + 6, y + 7.5).bezierCurveTo(X + 6, y + 3, X + 10, y + 3, X + 10, y + 7.5).lineWidth(1).strokeColor(GOLD).stroke().restore();
    } else {
        pdf.circle(X + 8, y + 8, 2).fill(SOFT);
    }

    const x = X + 26;
    const width = INNER - 26;

    pdf.font("OxB").fontSize(9.5).fillColor(WHITE).text(title, x, y + 1, { width });
    pdf.font("Ox").fontSize(8.5).fillColor(SOFT).text(text, x, pdf.y + 2, { width, lineGap: 1.5 });

    let bottom = pdf.y;

    if (tag) {
        pdf.font("Raj").fontSize(7);
        const tagWidth = pdf.widthOfString(tag.toUpperCase(), { characterSpacing: 1.3 }) + 10;
        pdf.save().rect(x, bottom + 4, tagWidth, 11).lineWidth(0.6).strokeColor(WHITE).strokeOpacity(0.2).stroke().restore();
        label(pdf, tag, x + 5, bottom + 6.5, "#c9ced6", 7);
        bottom += 16;
    }

    pdf.save().moveTo(X, bottom + 8).lineTo(W - X, bottom + 8).lineWidth(0.5).strokeColor(WHITE).strokeOpacity(0.07).stroke().restore();

    return bottom + 16;
}

/** Seite 2: was noch da ist und warum, Rechte, Prüfcode. */
function remaining(pdf: Pdf, record: IDeletionRecord, code: string): void {
    const kept = record.result?.kept ?? [];

    pdf.addPage({ size: "A4", margin: 0 });
    background(pdf);
    header(pdf, record.id);

    let y = section(pdf, "Was wir noch haben und warum", 92);

    for (const entry of kept) {
        y = item(pdf, y, `${entry.label} · ${number(entry.rows)} ${entry.rows === 1 ? "Eintrag" : "Einträge"}`, `${sentence(entry.note)} Wir nutzen das nur dafür${entry.years ? " und löschen es, sobald die Frist abläuft" : ""}.`, basisText({ basis: entry.basis ?? null, law: entry.law ?? null, years: entry.years ?? null }), true);
    }

    y = item(pdf, y, "Dieser Nachweis", "Discord-ID, Zeitpunkte und Zahlen dieser Löschung, keine Inhalte. Damit können wir belegen, dass wir gelöscht haben.", `Art. 6 Abs. 1 lit. c, Art. 5 Abs. 2 DSGVO · ${USERDATA_PROOF_YEARS} Jahre`);
    y = item(pdf, y, "Sicherungen", `In Sicherungskopien der Datenbank stehen die Daten noch, bis diese nach ${USERDATA_BACKUP_DAYS} Tagen überschrieben werden; bis dahin spielen wir sie nicht zurück. Aus den Backups einzelner Server haben wir sie herausgenommen: Sie liegen getrennt, lassen sich nicht zurückladen und sind nach ${USERDATA_BACKUP_DAYS} Tagen endgültig gelöscht.`, null);
    y = item(pdf, y, "Nicht bei uns", "Nachrichten, die du auf Discord-Servern geschrieben hast, liegen bei Discord und den Servern. Die löscht RL Nexus nicht.", null);

    y = section(pdf, "Deine Rechte", y + 4);
    const half = (INNER - 10) / 2;
    box(pdf, X, y, half, 58);
    box(pdf, X + half + 10, y, half, 58);
    label(pdf, "Fragen", X + 10, y + 9, DIM, 7);
    pdf.font("Ox").fontSize(8.5).fillColor(TEXT).text(`Schreib an support@nexus-emb.de oder melde dich im Support-Server. Nenn die Beleg-Nr. ${record.id}.`, X + 10, y + 21, { width: half - 20, lineGap: 1.5 });
    label(pdf, "Beschwerde · Art. 77 DSGVO", X + half + 20, y + 9, DIM, 7);
    pdf.font("Ox").fontSize(8.5).fillColor(TEXT).text(AUTHORITY, X + half + 20, y + 21, { width: half - 20, lineGap: 1.5 });

    y += 72;
    pdf.save().rect(X, y, INNER, 44).lineWidth(0.8).dash(3, { space: 3 }).strokeColor(WHITE).strokeOpacity(0.2).stroke().undash().restore();
    label(pdf, "Beleg prüfen", X + 10, y + 9, DIM, 7);
    pdf.font("Ox").fontSize(8.5).fillColor(TEXT).text(`Prüfcode ${code}. Wir können damit bestätigen, dass dieser Beleg von uns stammt und nicht verändert wurde.`, X + 10, y + 21, { width: INNER - 20 });

    footer(pdf, `RL Nexus · ${CONTROLLER[0].split(" · ")[0]} · ${CONTROLLER[3]}`, code, 2);
}

export function deletionReceipt(record: IDeletionRecord, secret: string, now = new Date()): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Löschbestätigung Nr. ${record.id}`, Author: "RL Nexus" } });
        const chunks: Buffer[] = [];
        const code = receiptCode(record, secret);

        pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);

        pdf.registerFont("Ox", path.join(ASSETS, "fonts", "Oxanium-Medium.woff"));
        pdf.registerFont("OxB", path.join(ASSETS, "fonts", "Oxanium-Bold.ttf"));
        pdf.registerFont("OxX", path.join(ASSETS, "fonts", "Oxanium-ExtraBold.ttf"));
        pdf.registerFont("Raj", path.join(ASSETS, "fonts", "Rajdhani-Bold.ttf"));

        confirmation(pdf, record, code, now);
        remaining(pdf, record, code);
        pdf.end();
    });
}
