/**
 * Prüft den Teil des Bots an der dauerhaften Sperre (W-0057): Sperrliste,
 * Prüfstelle für Interaktionen, Ansprechpartner und Pass, Anmeldung ins
 * Bot-Dashboard und die Seiten C4c und V-A+. Ohne Discord-Login.
 *
 *   npm run check:security
 *
 * Wie die übrigen Checks ohne Test-Framework. Exit-Code 1, sobald etwas nicht stimmt.
 */
import type { Interaction } from "discord.js";
import type BotClient from "../client/BotClient";
import { BlockedPage, Chips } from "../builder/BlockedPage";
import { IsContact, IssuePass } from "../utils/invitepass";
import { Admitted, BannedFor, BlockOf, LoginCheck, ScopeOf, SetBans } from "../utils/security";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const FULL = "500000000000000005";
const OWNER = "600000000000000006";
const FREE = "700000000000000007";
const since = new Date("2026-11-01T10:00:00Z");

let writes = 0;
const client = {
    config: { ADMIN_INTERNAL_URL: "", SERVER_JWT_SECRET: "check-secret-check-secret-check-secret" },
    databaseService: {
        Ready: true,
        Query: async () => [{ user_id: FULL, scope: "others,own,dashboard,website,shop", created_at: since, changed_at: null }],
        Write: async () => {
            writes++;

            return { affectedRows: 1, insertId: 1 };
        },
    },
} as unknown as BotClient;

const interaction = (userId: string, ownerId: string | null): Interaction => ({ user: { id: userId }, guild: ownerId ? { ownerId } : null }) as unknown as Interaction;

void (async () => {
    console.log("\nSperrliste und Prüfstelle");

    check("Die erste Interaktion nach dem Start wartet auf die Liste", !(await Admitted(client, interaction(FULL, OWNER))));

    SetBans([
        [FULL, { scope: ScopeOf("others,own,dashboard,website,shop"), since, changedAt: null }],
        [OWNER, { scope: ScopeOf("own,dashboard,shop,quatsch"), since, changedAt: new Date("2026-11-15T10:00:00Z") }],
    ]);

    check("Fremde Bausteine fallen beim Lesen weg", JSON.stringify(ScopeOf("shop,quatsch,own")) === JSON.stringify(["own", "shop"]));
    check("Eigener Server ist own, alles andere und DMs others", BlockOf(OWNER, OWNER) === "own" && BlockOf(OWNER, FREE) === "others" && BlockOf(OWNER, null) === "others");
    check(
        "Vollsperre: keine Antwort, auf keinem Server und in DMs",
        !(await Admitted(client, interaction(FULL, OWNER))) && !(await Admitted(client, interaction(FULL, null)))
    );
    check(
        "Nur Besitz: auf dem eigenen Server still, auf fremden und in DMs weiter",
        !(await Admitted(client, interaction(OWNER, OWNER))) && (await Admitted(client, interaction(OWNER, FREE))) && (await Admitted(client, interaction(OWNER, null)))
    );
    check("Ohne Sperre läuft alles", (await Admitted(client, interaction(FREE, FREE))) && !BannedFor(FREE, "own"));

    console.log("\nAnsprechpartner und Freigabe-Pass (W-0064)");

    const guild = { ownerId: OWNER, members: { cache: new Map(), fetch: async () => null } } as never;
    check("Gesperrt für eigene Server: nie Ansprechpartner", (await IsContact(client, guild, OWNER)) === false);
    await IssuePass(client, "800000000000000008", OWNER);
    await IssuePass(client, "800000000000000008", FREE);
    check("Gesperrt für eigene Server: kein Pass, alle anderen schon", writes === 1, `${writes} Pässe`);

    console.log("\nAnmeldung ins Bot-Dashboard (D3)");

    const real = globalThis.fetch;
    let asked = 0;
    let answer: () => Promise<Response> = async () => new Response(JSON.stringify({ result: "in", view: null }));
    globalThis.fetch = (async () => {
        asked++;

        return answer();
    }) as typeof fetch;

    try {
        const person = (userId: string) => ({ userId, name: "Check", avatar: null, ip: "203.0.113.77" });
        const banned = await LoginCheck(client, person(FULL));

        check("Gesperrt fürs Dashboard: Sperrseite aus der eigenen Liste, ohne nachzufragen", banned?.kind === "ban" && asked === 0 && banned.since === since.toISOString());
        check("Ohne Adresse des Admin Dashboards: herein", (await LoginCheck(client, person(FREE))) === null && asked === 0);

        (client.config as { ADMIN_INTERNAL_URL: string }).ADMIN_INTERNAL_URL = "http://admin.check";
        answer = async () => new Response(JSON.stringify({ result: "blocked", view: { kind: "vpn", service: "dashboard", name: "Check", avatar: null, scope: [], since: null, changedAt: null, checkedAt: "2026-11-03T17:42:00Z" } }));
        check("VPN laut Admin Dashboard: VPN-Seite", (await LoginCheck(client, person(FREE)))?.kind === "vpn" && asked === 1);

        answer = async () => {
            throw new Error("weg");
        };
        check("Admin Dashboard antwortet nicht: herein", (await LoginCheck(client, person(FREE))) === null);

        answer = async () => new Response("{}", { status: 500 });
        check("Fehler beim Admin Dashboard: herein", (await LoginCheck(client, person(FREE))) === null);
    } finally {
        globalThis.fetch = real;
    }

    console.log("\nSeiten C4c und V-A+");

    const chips = (scope: string) => JSON.stringify(Chips(ScopeOf(scope)));
    check("Vollsperre: Bot, Dashboard, Webseite, Shop gesperrt, nichts weiter nutzbar", chips("others,own,dashboard,website,shop") === JSON.stringify({ blocked: ["Bot", "Dashboard", "Webseite", "Shop"], usable: [] }));
    check(
        "Nur Besitz: wie im Entwurf",
        chips("own,dashboard,shop") === JSON.stringify({ blocked: ["Eigene Server", "Dashboard", "Shop"], usable: ["Bot auf anderen Servern", "Webseite"] })
    );

    const full = BlockedPage({ kind: "ban", name: "<b>Spammer</b>", avatar: null, scope: ScopeOf("others,own,dashboard,website,shop"), since: since.toISOString(), changedAt: null, checkedAt: since.toISOString() });
    check(
        "Vollsperre: rotes Schild, Zugang gesperrt, Name ohne HTML, Datum",
        full.page === "gesperrt.html" && full.values.TONE === "full" && full.values.TITLE === "Zugang gesperrt" && full.values.NAME === "&lt;b&gt;Spammer&lt;/b&gt;" && full.values.SINCE === "seit 01.11.2026" && !full.values.GROUPS.includes("Weiter nutzbar")
    );

    const part = BlockedPage({ kind: "ban", name: "Spammer", avatar: "https://cdn.discordapp.com/avatars/1/a.png", scope: ScopeOf("own,dashboard,shop"), since: since.toISOString(), changedAt: "2026-11-15T10:00:00Z", checkedAt: since.toISOString() });
    check(
        "Teilsperre: gelb, beide Listen, Datum der Änderung, Profilbild",
        part.values.TONE === "part" && part.values.TITLE === "Dashboard gesperrt" && part.values.GROUPS.includes("Weiter nutzbar") && part.values.SINCE === "seit 01.11.2026 · geändert am 15.11.2026" && part.values.AVATAR.startsWith("<img")
    );

    const vpn = BlockedPage({ kind: "vpn", name: "Kai", avatar: null, scope: [], since: null, changedAt: null, checkedAt: "2026-11-03T17:42:00Z" });
    check("VPN-Seite: Uhrzeit in deutscher Zeit, kein Wort von Sperre", vpn.page === "vpn.html" && vpn.values.TIME === "18:42 Uhr" && !JSON.stringify(vpn.values).includes("perr"));

    console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
    process.exit(failures ? 1 : 0);
})();
