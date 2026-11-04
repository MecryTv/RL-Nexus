import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { dumpState, KEEP_DAYS, parseDumpName, type IDumpFile, type IDumpProbe, type IDumpRun, type IDumpsOverview, type IDumpSummary } from "../shared/dumps.ts";
import { InvalidInput, PublicError } from "./errors.ts";

/**
 * W-0067: die nächtlichen Sicherungen der Datenbank lesen. Auf dem Server ist
 * der Ordner nur lesend eingehängt (DB_DUMPS_DIR). Wirft nie wegen einer
 * kaputten oder halb geschriebenen Datei: Dann ist der Zustand „unbekannt“.
 */

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

function iso(value: unknown): string | null {
    const raw = text(value);
    const time = raw === null ? Number.NaN : Date.parse(raw);

    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function tablesOf(value: unknown): Record<string, number> | null {
    const raw = record(value);
    if (!raw) return null;

    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => number(entry[1]) !== null));
}

function runOf(value: unknown): IDumpRun | null {
    const raw = record(value);
    const at = iso(raw?.at);
    if (!raw || !at) return null;

    return {
        at,
        kind: raw.kind === "vor-deploy" ? "vor-deploy" : "nacht",
        ok: raw.ok === true,
        file: text(raw.file),
        bytes: number(raw.bytes),
        seconds: number(raw.seconds),
        tables: tablesOf(raw.tables),
        error: text(raw.error),
    };
}

function probeOf(value: unknown): IDumpProbe | null {
    const raw = record(value);
    const at = iso(raw?.at);
    if (!raw || !at) return null;

    const tables = Object.entries(record(raw.tables) ?? {}).filter((entry): entry is [string, [number, number]] => Array.isArray(entry[1]) && entry[1].length === 2 && entry[1].every((part) => number(part) !== null));

    return { at, ok: raw.ok === true, file: text(raw.file), seconds: number(raw.seconds), tables: Object.fromEntries(tables), rows: number(raw.rows), error: text(raw.error) };
}

/** status.json, oder null, wenn sie fehlt oder nicht passt. */
async function readStatus(dir: string): Promise<{ next: string | null; writtenAt: string | null; runs: IDumpRun[]; probe: IDumpProbe | null } | null> {
    try {
        const raw = record(JSON.parse(await readFile(path.join(dir, "status.json"), "utf8")));
        if (!raw || raw.version !== 1 || !Array.isArray(raw.runs)) return null;

        const runs = raw.runs.map(runOf).filter((run): run is IDumpRun => run !== null).sort((a, b) => b.at.localeCompare(a.at));

        return { next: iso(raw.next), writtenAt: iso(raw.writtenAt), runs, probe: probeOf(raw.probe) };
    } catch {
        return null;
    }
}

function plusDays(date: Date, days: number): Date {
    const later = new Date(date);
    later.setDate(later.getDate() + days);

    return later;
}

export async function readDumps(dir: string | null, now = new Date()): Promise<IDumpsOverview> {
    const empty = { configured: dir !== null, next: null, writtenAt: null, runs: [], probe: null, files: [], totalBytes: 0, free: null };
    if (dir === null) return { ...empty, state: "off" };

    let names: string[];
    try {
        names = await readdir(dir);
    } catch {
        return { ...empty, state: "never" };
    }

    const found = await Promise.all(
        names.map(async (name): Promise<IDumpFile | null> => {
            const parsed = parseDumpName(name);
            const info = parsed ? await stat(path.join(dir, name)).catch(() => null) : null;
            if (!parsed || !info?.isFile()) return null;

            return { name, kind: parsed.kind, at: parsed.at.toISOString(), bytes: info.size, checksum: names.includes(`${name}.sha256`), deleteAt: plusDays(parsed.at, KEEP_DAYS).toISOString() };
        })
    );
    const files = found.filter((file): file is IDumpFile => file !== null).sort((a, b) => b.at.localeCompare(a.at));
    const status = await readStatus(dir);
    const free = await statfs(dir)
        .then((info) => ({ bytes: info.bavail * info.bsize, total: info.blocks * info.bsize }))
        .catch(() => null);
    const state = status ? dumpState(status.runs, status.probe, now) : files.length > 0 ? "unknown" : "never";

    return {
        state,
        configured: true,
        next: status?.next ?? null,
        writtenAt: status?.writtenAt ?? null,
        runs: status?.runs ?? [],
        probe: status?.probe ?? null,
        files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        free,
    };
}

function sha256(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        createReadStream(file)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}

/**
 * Eine Sicherung zum Herunterladen. Der Name muss dem Muster folgen (kein
 * Pfad, nichts außerhalb des Ordners), die Prüfsumme muss stimmen.
 */
export async function openDump(dir: string, name: string): Promise<{ readonly path: string; readonly bytes: number }> {
    if (!parseDumpName(name)) throw new InvalidInput("Diese Sicherung gibt es nicht.");

    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new PublicError(404, "Diese Sicherung gibt es nicht mehr.");

    const expected = (await readFile(`${file}.sha256`, "utf8").catch(() => "")).trim().split(/\s+/)[0] ?? "";
    if (!/^[0-9a-f]{64}$/.test(expected) || (await sha256(file)) !== expected) throw new PublicError(409, "Die Prüfsumme stimmt nicht, die Datei ist beschädigt.");

    return { path: file, bytes: info.size };
}

export function dumpSummary(overview: IDumpsOverview): IDumpSummary | null {
    if (overview.state === "off") return null;

    return { state: overview.state, lastOkAt: overview.runs.find((run) => run.ok)?.at ?? null };
}
