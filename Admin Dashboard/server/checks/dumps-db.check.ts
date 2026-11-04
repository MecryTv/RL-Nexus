import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../app.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, section } from "./harness.ts";

/** W-0067: Wer eine Sicherung herunterlädt, steht im Protokoll. Mit echter Datenbank. */
export async function checkDumpsDb(base: IConfig): Promise<void> {
    section("Sicherung der Datenbank (Protokoll)");

    const dir = await mkdtemp(path.join(tmpdir(), "rlnexus-sicherung-db-"));
    const name = "rlnexus_2026-11-04_033007.sql.gz";
    const app = await buildApp({ ...base, dumpsDir: dir });

    try {
        await writeFile(path.join(dir, name), "inhalt");
        await writeFile(path.join(dir, `${name}.sha256`), `${createHash("sha256").update("inhalt").digest("hex")}  ${name}\n`);

        await check("Download einer Sicherung steht im Protokoll", async () => {
            const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
            assert.equal((await app.inject({ method: "GET", url: `/api/db/dumps/${name}/download`, headers: { cookie } })).statusCode, 200);

            const rows = await query<{ action: string }[]>("SELECT action FROM admin_audit WHERE user_id = ? AND target = ?", [USERS.developer, name]);
            assert.deepEqual(rows.map((row) => row.action), ["db.dump.download"]);
        });
    } finally {
        await query("DELETE FROM admin_audit WHERE user_id = ? AND target = ?", [USERS.developer, name]);
        await app.close();
        await rm(dir, { recursive: true, force: true });
    }
}
