import assert from "node:assert/strict";
import { BETA_CODE_ALPHABET, newCode, normalizeCode } from "../../shared/beta.ts";
import { parseCodesInput } from "../beta/store.ts";
import { check, section } from "./harness.ts";

/** Beta Access ohne Datenbank: Codes lesen, erzeugen, Eingaben prüfen (Plan 22). */
export async function checkBeta(): Promise<void> {
    section("Beta Access");

    await check("Ein Code wird gelesen wie getippt: Groß, klein, Leerzeichen und Striche egal", () => {
        assert.equal(normalizeCode(" nxb 7kq4-m2xd "), "NXB-7KQ4-M2XD");
        assert.equal(normalizeCode("NXB7KQ4M2XD"), "NXB-7KQ4-M2XD");
        assert.equal(normalizeCode("NXB-7KQ4-M2XD"), "NXB-7KQ4-M2XD");
    });

    await check("Was kein Code sein kann, ist null", () => {
        for (const raw of ["", "hallo", "NXB-7KQ4", "NXB-7KQ4-M2X0", "ABC-7KQ4-M2XD", "NXB-7KQ4-M2XDD", null, 42]) assert.equal(normalizeCode(raw), null, String(raw));
    });

    await check("Neue Codes haben die Form NXB-XXXX-XXXX ohne verwechselbare Zeichen", () => {
        for (let index = 0; index < 50; index++) {
            const code = newCode();

            assert.match(code, /^NXB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
            assert.ok([...code.replaceAll("-", "").slice(3)].every((letter) => BETA_CODE_ALPHABET.includes(letter)), code);
            assert.equal(normalizeCode(code), code);
        }
    });

    await check("Codes erzeugen: Anzahl, Nutzungen und Notiz werden geprüft", () => {
        assert.deepEqual(parseCodesInput({ count: 3, maxUses: 1, note: "  Team Vyrox  " }), { count: 3, maxUses: 1, note: "Team Vyrox" });
        assert.deepEqual(parseCodesInput({ count: 1, maxUses: 5, note: "" }), { count: 1, maxUses: 5, note: null });
        assert.throws(() => parseCodesInput({ count: 0, maxUses: 1 }), /Anzahl/);
        assert.throws(() => parseCodesInput({ count: 51, maxUses: 1 }), /Anzahl/);
        assert.throws(() => parseCodesInput({ count: 1, maxUses: 0 }), /Nutzungen/);
        assert.throws(() => parseCodesInput({ count: 1, maxUses: 1.5 }), /Nutzungen/);
        assert.throws(() => parseCodesInput({ count: 1, maxUses: 1, note: "x".repeat(191) }), /Notiz/);
    });
}
