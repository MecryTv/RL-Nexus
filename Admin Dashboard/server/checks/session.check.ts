import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { clearCookie, open, parseCookies, seal, setCookie } from "../session.ts";
import { SECRET, check, section } from "./harness.ts";

/** Der Schlüssel des Bots aus RL Nexus Bot/src/utils/seal.ts, nachgebaut. */
function botKey(secret: string): Buffer {
    return createHash("sha256").update(`rlorgs:seal:v1:${secret}`).digest();
}

function sealLikeBot(value: unknown, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", botKey(secret), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function openLikeBot(sealed: string, secret: string): unknown {
    try {
        const raw = Buffer.from(sealed, "base64url");
        const decipher = createDecipheriv("aes-256-gcm", botKey(secret), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));

        return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    } catch {
        return null;
    }
}

export async function checkSession(): Promise<void> {
    section("Sitzungs-Cookie");

    await check("Sitzung lässt sich ver- und entschlüsseln", () => {
        const value = { id: "123456789012345678", name: "Mecry Ä", avatar: null, exp: 1 };
        assert.deepEqual(open(seal(value, SECRET), SECRET), value);
    });

    await check("Ein verändertes Byte macht das Cookie wertlos", () => {
        const bytes = Buffer.from(seal({ id: "1" }, SECRET), "base64url");
        bytes[bytes.length - 1] ^= 1;
        assert.equal(open(bytes.toString("base64url"), SECRET), null);
    });

    await check("Falsches Secret, leerer Wert und Unsinn öffnen nichts", () => {
        assert.equal(open(seal({ id: "1" }, SECRET), "t".repeat(48)), null);
        assert.equal(open("", SECRET), null);
        assert.equal(open("kein-cookie", SECRET), null);
    });

    await check("Cookies von Admin Dashboard und Bot sind nicht austauschbar", () => {
        assert.equal(openLikeBot(seal({ id: "1" }, SECRET), SECRET), null);
        assert.equal(open(sealLikeBot({ id: "1" }, SECRET), SECRET), null);

        // Gegenprobe: der nachgebaute Bot öffnet seine eigenen Cookies.
        assert.deepEqual(openLikeBot(sealLikeBot({ id: "1" }, SECRET), SECRET), { id: "1" });
    });

    await check("Cookies tragen HttpOnly und SameSite=Lax, Secure nur bei https", () => {
        assert.equal(
            setCookie("a", "b", { path: "/", maxAge: 60, secure: true }),
            "a=b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure"
        );
        assert.doesNotMatch(setCookie("a", "b", { path: "/", maxAge: 60, secure: false }), /Secure/);
        assert.match(clearCookie("a", "/", true), /Max-Age=0/);
    });

    await check("Cookies werden aus dem Header gelesen", () => {
        assert.deepEqual(parseCookies("a=1; rlnexus_admin=xyz=; kaputt"), { a: "1", rlnexus_admin: "xyz=" });
        assert.deepEqual(parseCookies(undefined), {});
    });
}
