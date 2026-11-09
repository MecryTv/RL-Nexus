import assert from "node:assert/strict";
import type { IChangelogVersion, IChangelogView, IVersionInput } from "../../shared/changelog.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import type { IHttp } from "./backups-db.check.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, section } from "./harness.ts";

/** Prüf-Versionen beginnen mit 9., damit das Aufräumen nur sie trifft. */
const INPUT: IVersionInput = {
    version: "9.1.0",
    releasedOn: "2026-11-09",
    title: "check:db Changelog",
    items: [
        { kind: "neu", area: "bot", text: "Erste Zeile", task: "W-0014" },
        { kind: "intern", area: "admin", text: "Nur für uns", task: null },
    ],
};

export async function tidyChangelog(): Promise<void> {
    await query("DELETE FROM changelog_versions WHERE version LIKE '9.%'");
    await query("DELETE FROM admin_audit WHERE action LIKE 'changelog.%' AND detail LIKE '9.%'");
}

const audited = async (action: string, like: string): Promise<number> => Number((await query<{ n: number }[]>("SELECT COUNT(*) AS n FROM admin_audit WHERE action = ? AND detail LIKE ?", [action, like]))[0]?.n ?? 0);

/** W-0061: Changelog mit Datenbank und Routen. */
export async function checkChangelogDb(config: IConfig, http: IHttp): Promise<void> {
    section("Changelog (Datenbank)");

    const { get, write, raw } = http;
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const dev = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) => raw(method, url, { cookie, origin: config.publicUrl }, payload);

    try {
        await tidyChangelog();

        let id = 0;

        await check("Nur Developer: Admin bekommt 403 beim Lesen und Schreiben", async () => {
            assert.equal((await get("/api/changelog")).statusCode, 403);
            assert.equal((await write("POST", "/api/changelog", INPUT)).statusCode, 403);
        });

        await check("Anlegen: Zeilen in Reihenfolge, noch nicht gepostet, im Protokoll", async () => {
            const created = await dev("POST", "/api/changelog", INPUT);
            assert.equal(created.statusCode, 200, created.body);

            const version = created.json() as IChangelogVersion;
            id = version.id;

            assert.deepEqual([version.version, version.title, version.releasedOn, version.posted, version.createdName], ["9.1.0", "check:db Changelog", "2026-11-09", null, "nutzer2"]);
            assert.deepEqual(version.items, INPUT.items);
            assert.equal(await audited("changelog.create", "9.1.0%"), 1);

            const view = (await dev("GET", "/api/changelog")).json() as IChangelogView;
            assert.ok(view.versions.some((entry) => entry.id === id));
        });

        await check("Ändern: Zeilen ersetzt, Titel neu, im Protokoll", async () => {
            const before = ((await dev("GET", "/api/changelog")).json() as IChangelogView).versions.find((entry) => entry.id === id)!;
            await new Promise((resolve) => setTimeout(resolve, 5));

            const changed = await dev("PUT", `/api/changelog/${id}`, { ...INPUT, title: "check:db Neu", items: [{ kind: "behoben", area: "webseite", text: "Andere Zeile", task: null }] });
            assert.equal(changed.statusCode, 200, changed.body);

            const version = changed.json() as IChangelogVersion;
            assert.equal(version.title, "check:db Neu");
            assert.deepEqual(version.items, [{ kind: "behoben", area: "webseite", text: "Andere Zeile", task: null }]);
            assert.ok(version.updatedAt > before.updatedAt, `${version.updatedAt} nach ${before.updatedAt}`);
            assert.equal(await audited("changelog.update", "9.1.0%"), 1);
        });

        await check("Doppelte Version: 409 mit Satz, auch beim Umbenennen", async () => {
            const twice = await dev("POST", "/api/changelog", INPUT);
            assert.deepEqual([twice.statusCode, twice.json().error], [409, "Die Version 9.1.0 gibt es schon."]);

            const other = (await dev("POST", "/api/changelog", { ...INPUT, version: "9.2.0" })).json() as IChangelogVersion;
            const renamed = await dev("PUT", `/api/changelog/${other.id}`, { ...INPUT, version: "9.1.0" });
            assert.deepEqual([renamed.statusCode, renamed.json().error], [409, "Die Version 9.1.0 gibt es schon."]);
        });

        await check("Ungültige Eingabe: 400 mit dem Satz aus den Regeln; unbekannte Version 404", async () => {
            const bad = await dev("POST", "/api/changelog", { ...INPUT, version: "9.1" });
            assert.deepEqual([bad.statusCode, bad.json().error], [400, "Die Version braucht die Form 1.4.0."]);

            const missing = await dev("PUT", "/api/changelog/999999999", { ...INPUT, version: "9.9.9" });
            assert.deepEqual([missing.statusCode, missing.json().error], [404, "Diese Version gibt es nicht mehr."]);
        });
    } finally {
        await tidyChangelog();
    }
}
