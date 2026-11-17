import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { query } from "../db.ts";
import { classify, parseAccessLine, type IHit } from "./parse.ts";
import { addHits, readerState } from "./store.ts";

/**
 * W-0138: einmal die ersten 14 Tage aus dem bisherigen Protokoll nachlesen
 * (Nutzer, 17.11.2026). Gezählt werden nur die drei Seiten und nur Zeilen vor
 * der ersten Zeile des eigenen Protokolls - danach zählt der laufende Leser.
 * Der Lauf belegt vorher die Zeile `import`; ein zweiter Lauf, auch ein
 * gleichzeitiger, findet sie und tut nichts.
 */

const BATCH = 5000;
const FILES = ["access.log", "access.log.1", ...Array.from({ length: 13 }, (_, index) => `access.log.${index + 2}.gz`)];

export type ImportResult = { lines: number; hits: number } | "already" | "no-live-yet";

async function exists(file: string): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

/**
 * `names` nur für check:db, damit die Prüfung den echten Stand nicht anfasst.
 *
 * ponytail: Bricht der Lauf ab, wird die Belegung zurückgenommen, die schon
 * geschriebenen Summen aber nicht - ein zweiter Lauf zählte sie doppelt. Bei
 * einem einmaligen Befehl beim Ausrollen: vorher die Tabellen prüfen.
 */
export async function importHistory(dir: string, now: Date, names = { live: "live", import: "import" }): Promise<ImportResult> {
    const live = await readerState(names.live);
    const until = live.firstLineAt;

    if (!until) return "no-live-yet";

    const claim = await query<{ affectedRows: number }>("INSERT IGNORE INTO activity_reader (name, imported_at) VALUES (?, ?)", [names.import, now.toISOString().slice(0, 19).replace("T", " ")]);

    if (Number(claim.affectedRows) === 0) return "already";

    let lines = 0;
    let hits = 0;
    let batch: IHit[] = [];
    const flush = async (): Promise<void> => {
        if (batch.length === 0) return;

        await addHits(batch, () => false);
        hits += batch.length;
        batch = [];
    };

    try {
        for (const name of FILES) {
            const file = path.join(dir, name);

            if (!(await exists(file))) continue;

            const input = createReadStream(file);
            let stream: NodeJS.ReadableStream = input;

            if (name.endsWith(".gz")) {
                const gunzip = createGunzip();

                // pipe() reicht Lesefehler der Datei nicht weiter; ohne das stürzte
                // der Lauf ab und die Belegung blieb stehen (Review W-0138).
                input.on("error", (error) => gunzip.destroy(error));
                stream = input.pipe(gunzip);
            }

            for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
                const parsed = parseAccessLine(line);

                if (!parsed || parsed.at >= until) continue;

                lines++;

                const hit = classify(parsed);

                if (!hit) continue;

                batch.push(hit);

                if (batch.length >= BATCH) await flush();
            }
        }

        await flush();
    } catch (error) {
        await query("DELETE FROM activity_reader WHERE name = ?", [names.import]);
        throw error;
    }

    return { lines, hits };
}
