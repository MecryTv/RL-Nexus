import PDFDocument from "pdfkit";
import { USERDATA_AREAS, type UserdataArea } from "../../shared/userdata.ts";
import { pdfSafe } from "../shop/legal.ts";
import type { IDeletionRecord } from "./deletions.ts";

/**
 * Der Beleg einer Löschung als PDF (W-0051, „Rechte und Protokoll“): was
 * gelöscht wurde, was blieb, die Zeitpunkte. Für die Antwort an die Person.
 */

const MARGIN = 56;
const LABELS = new Map(USERDATA_AREAS.map((area) => [area.id, area.label]));
const when = (iso: string | null): string => (iso === null ? "–" : new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso)));
const DM: Readonly<Record<IDeletionRecord["dmState"], string>> = { offen: "nicht verschickt", zugestellt: "zugestellt", nicht_zustellbar: "nicht zustellbar" };

export function deletionReceipt(record: IDeletionRecord, now = new Date()): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: `Beleg über die Löschung ${record.id}`, Author: "RL Nexus" } });
        const chunks: Buffer[] = [];
        const result = record.result;

        pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);

        const line = (label: string, value: string): void => {
            pdf.font("Helvetica-Bold").fontSize(10).text(pdfSafe(`${label}: `), { continued: true }).font("Helvetica").text(pdfSafe(value), { lineGap: 3 });
        };
        const counts = (title: string, values: Partial<Record<UserdataArea, number>>): void => {
            const entries = Object.entries(values).filter(([, rows]) => (rows ?? 0) > 0);

            pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(12).text(pdfSafe(title)).moveDown(0.2);
            if (entries.length === 0) pdf.font("Helvetica").fontSize(10).text("keine");
            for (const [area, rows] of entries) pdf.font("Helvetica").fontSize(10).text(pdfSafe(`•  ${LABELS.get(area as UserdataArea) ?? area}: ${rows}`), { lineGap: 3 });
        };

        pdf.font("Helvetica-Bold").fontSize(16).text(pdfSafe("Beleg über die Löschung von Nutzerdaten"));
        pdf.font("Helvetica").fontSize(9).fillColor("#555555").text(pdfSafe(`RL Nexus · erstellt am ${when(now.toISOString())}`)).fillColor("#000000").moveDown(1);

        line("Discord-ID", record.userId);
        line("Geplant am", `${when(record.createdAt)} von ${record.plannedName}`);
        line("Grund", record.reason);
        line("Frist", when(record.dueAt));
        line("Nachricht an die Person", DM[record.dmState] + (record.dmError ? ` (${record.dmError})` : ""));
        line("Kopie geholt", when(record.copyAt));
        line("Ausgeführt", when(record.doneAt));
        line("Server mit gelöschten Daten", String(result?.servers ?? 0));

        if (result) {
            counts("Gelöscht", result.deleted);
            counts("Aus Einträgen anderer entfernt", result.anonymized);

            pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(12).text("Geblieben").moveDown(0.2);
            if (result.kept.length === 0) pdf.font("Helvetica").fontSize(10).text("nichts");
            for (const entry of result.kept) pdf.font("Helvetica").fontSize(10).text(pdfSafe(`•  ${entry.label}: ${entry.rows} – ${entry.note}`), { lineGap: 3 });
        }

        pdf.end();
    });
}
