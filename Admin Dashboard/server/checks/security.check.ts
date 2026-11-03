import assert from "node:assert/strict";
import { BLOCKS, blocks, dmLists, presetOf, scopeOf } from "../../shared/security.ts";
import { check, section } from "./harness.ts";

/** W-0057: dauerhafte Sperre. Nur die Regeln, ohne Datenbank und Discord. */
export async function checkSecurity(): Promise<void> {
    section("Dauerhafte Sperre (W-0057)");

    await check("Voll setzt alle fünf Bausteine, Nur Besitz eigene Server, Bot-Dashboard und Shop", () => {
        assert.deepEqual(scopeOf("voll"), [...BLOCKS]);
        assert.deepEqual(scopeOf("besitz"), ["own", "dashboard", "shop"]);
        assert.equal(presetOf(["shop", "own", "dashboard"]), "besitz");
        assert.equal(presetOf([...BLOCKS]), "voll");
        assert.equal(presetOf(["website"]), "eigene");
    });

    await check("Eine Teilsperre sperrt nicht mehr, als ihre Bausteine sagen", () => {
        const besitz = scopeOf("besitz");

        assert.equal(blocks(besitz, "others"), false);
        assert.equal(blocks(besitz, "website"), false);
        assert.equal(blocks(besitz, "own"), true);
        assert.equal(blocks(besitz, "shop"), true);
    });

    await check("DM-Listen (S-B): Vollsperre ohne „Weiter nutzbar“, Webdienste in einer Zeile", () => {
        assert.deepEqual(dmLists(scopeOf("voll")), { blocked: ["Bot auf allen Servern", "Eigene Server", "Bot-Dashboard, Webseite und Shop"], usable: [] });
        assert.deepEqual(dmLists(scopeOf("besitz")), { blocked: ["Eigene Server", "Bot-Dashboard und Shop"], usable: ["Bot auf anderen Servern, Webseite"] });
    });
}
