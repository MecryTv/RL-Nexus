import { open, stat } from "node:fs/promises";
import path from "node:path";
import { parseAccessLine } from "./parse.ts";

/**
 * W-0138: das eigene Protokoll (ACCESS_LOG_DIR/access.log) fortlaufend lesen.
 *
 * Gelesen werden nur ganze Zeilen ab der gemerkten Stelle. Wechselt die Datei
 * (logrotate benennt sie in access.log.1 um, delaycompress lässt sie
 * ungepackt), kommt erst der Rest der alten Datei, dann die neue von vorn. Ist
 * die Datei kürzer als die Stelle, wurde sie gekürzt: von vorn.
 */

export interface IReaderState {
    /** Kennung der Datei; null, solange noch nie gelesen wurde. */
    inode: string | null;
    offset: number;
    /** Zeit der ersten je gelesenen Zeile - bis dahin liest das Nachlesen (Task 4). */
    firstLineAt: Date | null;
}

type Sink = (lines: string[]) => Promise<void>;

// ponytail: 4 MB je Happen; eine einzelne Zeile darüber ist kein Protokoll und wird übersprungen.
const CHUNK = 4 * 1024 * 1024;
const NEWLINE = 10;

async function fileId(file: string): Promise<{ inode: string; size: number } | null> {
    try {
        // bigint: unter Windows sind Datei-Kennungen 64 Bit breit.
        const info = await stat(file, { bigint: true });

        return { inode: String(info.ino), size: Number(info.size) };
    } catch {
        return null;
    }
}

/** Liest ganze Zeilen ab `from` und gibt die Stelle hinter der letzten zurück. */
async function readLines(file: string, from: number, sink: Sink, seen: (lines: string[]) => void): Promise<number> {
    const handle = await open(file, "r");
    const buffer = Buffer.alloc(CHUNK);
    let position = from;

    try {
        for (;;) {
            const { bytesRead } = await handle.read(buffer, 0, CHUNK, position);

            if (bytesRead === 0) break;

            const end = buffer.lastIndexOf(NEWLINE, bytesRead - 1);

            if (end < 0) {
                if (bytesRead < CHUNK) break;

                position += bytesRead;
                continue;
            }

            const lines = buffer
                .toString("utf8", 0, end)
                .split("\n")
                .map((entry) => entry.replace(/\r$/, ""))
                .filter((entry) => entry !== "");

            position += end + 1;

            if (lines.length > 0) {
                seen(lines);
                await sink(lines);
            }

            if (bytesRead < CHUNK) break;
        }
    } finally {
        await handle.close();
    }

    return position;
}

/**
 * Ein Durchgang. Ohne Ordner oder Datei bleibt der Stand, wie er war.
 *
 * ponytail: Der Stand wird erst nach dem Durchgang gesichert. Bricht die
 * Datenbank mitten in einem großen Durchgang weg, zählen bereits geschriebene
 * Happen beim nächsten Mal doppelt. Im Takt von einer Minute sind das wenige
 * Zeilen; wird es je wichtig, den Stand je Happen sichern.
 */
export async function readOnce(dir: string, state: IReaderState, sink: Sink): Promise<IReaderState> {
    const file = path.join(dir, "access.log");
    const current = await fileId(file);

    if (!current) return state;

    let firstLineAt = state.firstLineAt;
    let offset = state.offset;
    const seen = (lines: string[]): void => {
        if (firstLineAt) return;

        for (const entry of lines) {
            const parsed = parseAccessLine(entry);

            if (parsed) {
                firstLineAt = parsed.at;
                return;
            }
        }
    };

    if (state.inode !== null && state.inode !== current.inode) {
        const old = path.join(dir, "access.log.1");
        const previous = await fileId(old);

        if (previous?.inode === state.inode && previous.size > state.offset) await readLines(old, state.offset, sink, seen);

        offset = 0;
    } else if (current.size < offset) {
        offset = 0;
    }

    offset = await readLines(file, offset, sink, seen);

    return { inode: current.inode, offset, firstLineAt };
}
