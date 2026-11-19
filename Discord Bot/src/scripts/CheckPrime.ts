/**
 * Prüft die Anbindung an Prime (prime.rocketplanet.gg): Umrechnung, Transport,
 * Auflösung und Ränge. Beendet sich mit Exit-Code 1, sobald etwas nicht stimmt.
 *
 *   npm run check:prime -- MecryTv
 *
 * Ohne Namen wird nur gerechnet und geprüft, was ohne Netz geht. Mit Namen geht
 * eine echte Anfrage raus - dafür muss PRIME_API_TOKEN in der .env stehen.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { readdirSync, readFileSync } from "node:fs";
import BotClient from "../client/BotClient";
import { DivisionName, TierName, ToMMR, ToPlatform, ToPlayerID, TrackerURL, TRACKED_PLAYLISTS } from "../constants/Prime";
import PrimeService, { HttpError, PrimeError } from "../services/PrimeService";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import { PRIME_ACCESS_TEXT, PRIME_CACHE_TTL } from "../constants/Prime";
import { Collection } from "discord.js";
import Rank from "../commands/user/Rank";
import RankButtons from "../events/rank/RankButtons";
import logger from "../utils/logger";
import { IPrimeAccessCard, PRIME_ACCESS_URL, PrimeAccessAlt } from "../builder/PrimeAccessCard";
import { ParseAccessExpiry, PrimeAccessWatch, SendPrimeAccess } from "../services/PrimeAccessService";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/**
 * Die Adresse hinter dem Knopf unter der Karte.
 *
 * Ein Epic-Name darf Leerzeichen und Sonderzeichen enthalten. Unkodiert waere
 * die Adresse entweder kaputt oder - beim Doppelkreuz - stillschweigend
 * abgeschnitten, und der Knopf fuehrte auf ein leeres Profil.
 */
function checkTracker(): void {
    console.log("\n  — Tracker-Adresse —");

    check(
        "Einfacher Name",
        TrackerURL("MecryTv") === "https://rocketleague.tracker.network/rocket-league/profile/epic/MecryTv/overview",
        TrackerURL("MecryTv")
    );
    check("Leerzeichen werden kodiert", TrackerURL("Some Name").includes("Some%20Name"), TrackerURL("Some Name"));
    check("Ein Doppelkreuz auch", TrackerURL("A#1").includes("A%231"), TrackerURL("A#1"));
    check("  und schneidet die Adresse nicht ab", !TrackerURL("A#1").includes("#"), TrackerURL("A#1"));
    check("Umlaute werden kodiert", !/[äöü]/.test(TrackerURL("Grün")), TrackerURL("Grün"));
}

/**
 * Die Verknuepfung haengt an der Discord-ID, nicht an einer Guild.
 *
 * Genau darauf beruht, dass /rank auf jedem Server funktioniert, auf dem der Bot
 * ist. Es steht nirgends im Code, sondern im Schema - und ein spaeter
 * hinzugefuegtes guild_id waere ein stiller Rueckschritt, den niemand bemerkt,
 * bis sich jemand auf dem zweiten Server neu verknuepfen muss.
 */
function checkGuildFree(): void {
    console.log("\n  — Guild-unabhaengig —");

    const root = path.join(process.cwd(), "src", "database", "migrations");
    const sql = readdirSync(root)
        .filter((file) => file.endsWith(".sql"))
        .map((file) => readFileSync(path.join(root, file), "utf8"))
        .join("\n");

    for (const table of ["player_accounts", "player_ranks", "player_profiles"]) {
        // Von CREATE TABLE bis zur schliessenden Klammer der Definition.
        const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
        const body = start < 0 ? "" : sql.slice(start, sql.indexOf(") ENGINE", start));

        check(`${table} gibt es`, start >= 0);
        check(`  ohne guild_id`, start >= 0 && !/guild_id/.test(body), "sonst haengt die Verknuepfung am Server");
    }

    // Und keine spaetere Migration schiebt eine Spalte nach.
    const added = /ALTER TABLE\s+(player_accounts|player_ranks|player_profiles)[\s\S]{0,200}?guild_id/.test(sql);

    check("Auch spaeter kommt keine dazu", !added);
}

/**
 * Der Zwischenspeicher und was passiert, wenn Prime nicht antwortet.
 *
 * Beides ohne Netz: eine Unterklasse stellt Prime nach und zaehlt mit, wie oft
 * wirklich geladen wurde. Genau darum geht es - dass eben nicht bei jedem Aufruf
 * geladen wird, und dass ein Ausfall den letzten Stand nicht wegwirft.
 */
async function checkCache(client: BotClient): Promise<void> {
    console.log("\n  — Zwischenspeicher —");

    const profile = (name: string): IPrimeProfile =>
        ({
            name,
            platform: "Epic Games",
            accountId: "abc",
            playerId: "Epic|abc|0",
            linked: [],
            seasonLevel: 5,
            seasonWins: 7,
            ranks: [],
            stats: [],
            club: null,
            fetchedAt: new Date().toISOString(),
        }) as IPrimeProfile;

    class FakePrime extends PrimeService {
        public loads = 0;
        public down = false;

        protected override async Load(name: string): Promise<IPrimeProfile | null> {
            this.loads += 1;

            if (this.down) throw new PrimeError("Prime antwortet nicht", "Network");

            return profile(name);
        }

        // Ohne Token wuerde Profile() gar nicht erst laden.
        public override get IsConfigured(): boolean {
            return true;
        }
    }

    const prime = new FakePrime(client);

    const first = await prime.Profile("Spieler");
    const second = await prime.Profile("Spieler");
    const otherCase = await prime.Profile("SPIELER");

    check("Der erste Aufruf laedt", prime.loads === 1, `${prime.loads} Ladevorgaenge`);
    check("Der zweite kommt aus dem Speicher", prime.loads === 1, `${prime.loads} Ladevorgaenge`);
    check("  Gross- und Kleinschreibung egal", prime.loads === 1 && otherCase?.name === first?.name);
    check("Der Stand ist nicht als alt markiert", second?.stale === undefined);

    // Jetzt faellt Prime aus. Der Eintrag ist noch da, gilt aber als nicht
    // mehr frisch - also wird geladen, und das schlaegt fehl.
    prime.Forget();
    prime.down = true;

    let threw = false;

    try {
        await prime.Profile("Unbekannt");
    } catch {
        threw = true;
    }

    check("Ohne alten Stand meldet ein Ausfall einen Fehler", threw);

    // Und mit altem Stand: der kommt zurueck, markiert.
    prime.down = false;
    prime.Forget();
    await prime.Profile("Spieler");

    const loadsBefore = prime.loads;

    prime.down = true;

    // Den Eintrag kuenstlich altern lassen, damit er neu geholt werden muss.
    const entry = (prime as unknown as { cache: Map<string, { at: number }> }).cache.get("spieler");

    if (entry) entry.at = Date.now() - PRIME_CACHE_TTL - 1000;

    const rescued = await prime.Profile("Spieler");

    check("Bei Ausfall wird es noch einmal versucht", prime.loads === loadsBefore + 1);
    check("  und der alte Stand kommt zurueck", rescued?.name === "Spieler", String(rescued?.name));
    check("  als alt markiert", rescued?.stale === true, String(rescued?.stale));

    // W-0129: Der Knopf unter der Rang-Karte fragt über die Konto-ID. Nach einer
    // Suche über den Namen muss die ohne neue Anfrage kommen - und Vergessen
    // muss beide Einträge treffen.
    prime.down = false;
    prime.Forget();
    await prime.Profile("Spieler");

    const loadsByName = prime.loads;
    const byAccount = await prime.Profile("abc");

    check("Nach der Suche kommt die Konto-ID aus dem Speicher", prime.loads === loadsByName && byAccount?.name === "Spieler", `${prime.loads - loadsByName} neue Ladevorgaenge`);

    prime.Forget("Spieler");
    await prime.Profile("abc");

    check("  Vergessen über den Namen trifft auch die Konto-ID", prime.loads === loadsByName + 1, `${prime.loads - loadsByName} Ladevorgaenge`);

    prime.Close();
}

/**
 * W-0145: Am 18.11.2026 lief der Prime-Zugang ab, und /rank sagte allen
 * „Rocket League antwortet gerade nicht“. Ein abgelaufener oder falscher
 * Schlüssel ist aber kein Ausfall: Prime antwortet, nur eben mit 401 (gemessen
 * mit einem falschen Schlüssel) oder 403. Das bekommt die Art "Access" und eine
 * ehrliche Meldung.
 */
async function checkAccess(client: BotClient): Promise<void> {
    console.log("\n  — Zugang abgelaufen oder ungültig —");

    const UNAUTHORIZED = '{"Error":{"Message":"The Prime API token is not valid.","Type":"Unauthorized"}}';

    const refused = HttpError(401, UNAUTHORIZED);

    check("401 ist ein Zugangsfehler", refused.type === "Access" && refused.status === 401, `${refused.type} ${refused.status}`);
    check("  mit dem Grund von Prime", refused.message.includes("The Prime API token is not valid."), refused.message);
    // Live-Log 19.11.2026: Mit dem abgelaufenen Zugang kam 403, den Rumpf kennen wir nicht. Also
    // zählt jeder 403 - außer einer HTML-Seite: Prime liegt hinter Cloudflare, und Firewall oder
    // Bot-Schutz antworten ebenfalls mit 403 (Review).
    const forbidden = HttpError(403, '{"Error":{"Message":"Access expired","Type":"Forbidden"}}');
    const firewall = HttpError(403, "<!DOCTYPE html><title>Attention Required! | Cloudflare</title>");

    check("403 ohne Rumpf ist ein Zugangsfehler (so lief der Zugang ab)", HttpError(403, "").type === "Access", HttpError(403, "").type);
    check("403 mit Grund von Prime auch", forbidden.type === "Access", forbidden.type);
    check("403 von Cloudflare (HTML) bleibt ein HTTP-Fehler", firewall.type === "HTTP", firewall.type);
    check("  auch mit Leerraum davor", HttpError(403, "\n  <html><body>blocked</body></html>").type === "HTTP");
    check("  und an Content-Type text/html erkannt", HttpError(403, "blocked", "text/html; charset=UTF-8").type === "HTTP");
    check("403 CrossSiteRequest (Kontoseiten) ist kein Zugangsfehler", HttpError(403, '{"Error":{"Message":"Website account endpoints only accept same-origin requests.","Type":"CrossSiteRequest"}}').type === "HTTP");
    check("502 bleibt ein HTTP-Fehler", HttpError(502, "<html>").type === "HTTP", HttpError(502, "<html>").type);

    // Den Rumpf führt der Fehler mit, gekürzt und ohne Schlüssel - damit man beim nächsten Mal sieht, was Prime sagt.
    const page = HttpError(403, `<html>${"x".repeat(500)} geheimer-schluessel</html>`, "text/html", "geheimer-schluessel");

    check("Der Rumpf steht gekürzt im Fehler", page.body.startsWith("<html>") && page.body.length <= 200, `${page.body.length} Zeichen`);
    check("  ohne den Schlüssel", !HttpError(403, "Bearer geheimer-schluessel abgelehnt", "", "geheimer-schluessel").body.includes("geheimer-schluessel"));

    class LockedPrime extends PrimeService {
        public locked = false;

        protected override async Load(name: string): Promise<IPrimeProfile | null> {
            if (this.locked) throw HttpError(401, UNAUTHORIZED);

            return { name, accountId: "abc", ranks: [], stats: [], club: null, fetchedAt: new Date().toISOString() } as unknown as IPrimeProfile;
        }

        public override get IsConfigured(): boolean {
            return true;
        }
    }

    const prime = new LockedPrime(client);
    const noted: string[] = [];
    const note = prime.access.Note.bind(prime.access);

    // W-0145: Jede Abfrage geht an die Überwachung des Zugangs, die Ablehnung mit ihrer Art.
    prime.access.Note = (result, now) => {
        noted.push(typeof result === "string" ? result : result.type);
        note(result, now);
    };

    prime.locked = true;

    const thrown = await prime.Profile("Neu").then(
        () => null,
        (error: unknown) => error
    );

    check("Ohne alten Stand kommt der Zugangsfehler durch", thrown instanceof PrimeError && thrown.type === "Access", String(thrown));
    check("  und landet bei der Überwachung des Zugangs", noted.join() === "Access", noted.join());

    prime.locked = false;
    await prime.Profile("Spieler");

    const entry = (prime as unknown as { cache: Map<string, { at: number }> }).cache.get("spieler");

    if (entry) entry.at = Date.now() - PRIME_CACHE_TTL - 1000;

    prime.locked = true;

    const kept = await prime.Profile("Spieler");

    check("Mit altem Stand kommt der zurück", kept?.name === "Spieler", String(kept?.name));
    check("  markiert als gesperrt, nicht als Ausfall", kept?.stale === "access", String(kept?.stale));

    prime.Close();

    // Was Nutzer lesen: /rank search und der Knopf unter der Karte.
    const replies: { content?: string | null }[] = [];
    const fakeClient = {
        primeService: { IsConfigured: true, Profile: async () => Promise.reject(HttpError(401, UNAUTHORIZED)) },
        databaseService: { Ready: false },
        cooldowns: new Collection(),
        guardian: { ReportError: async (error: Error) => void replies.push({ content: `Fehler: ${error.message}` }) },
    } as unknown as BotClient;

    await new Rank(fakeClient).Execute({
        options: { getString: () => "Nova", getSubcommand: () => "search" },
        user: { id: "1" },
        guildId: null,
        deferReply: async () => undefined,
        editReply: async (message: { content?: string }) => void replies.push(message),
    } as never);

    check("/rank search sagt, dass die Abfrage nicht freigeschaltet ist", replies.at(-1)?.content === PRIME_ACCESS_TEXT, String(replies.at(-1)?.content));

    await new RankButtons(fakeClient).Execute({
        isButton: () => true,
        customId: "rk:extra:abc:1",
        user: { id: "1" },
        guildId: null,
        deferUpdate: async () => undefined,
        followUp: async (message: { content?: string }) => void replies.push(message),
    } as never);

    check("Der Knopf unter der Karte auch", replies.at(-1)?.content === PRIME_ACCESS_TEXT, String(replies.at(-1)?.content));

    // Im Log: eine klare Fehlerzeile, aber nicht bei jedem /rank - sonst läuft es voll.
    const errors: string[] = [];
    const warnings: string[] = [];
    const real = { error: logger.error, warn: logger.warn };

    logger.error = (message: string) => void errors.push(message);
    logger.warn = (message: string) => void warnings.push(message);

    try {
        const noisy = new LockedPrime(client);

        await noisy.Profile("Erster");
        noisy.locked = true;

        for (const name of ["Neu1", "Neu2", "Erster"]) {
            const entry = (noisy as unknown as { cache: Map<string, { at: number }> }).cache.get(name.toLowerCase());

            if (entry) entry.at = Date.now() - PRIME_CACHE_TTL - 1000;

            await noisy.Profile(name).catch(() => null);
        }

        await new Rank(fakeClient).Execute({
            options: { getString: () => "Nova", getSubcommand: () => "search" },
            user: { id: "1" },
            guildId: null,
            deferReply: async () => undefined,
            editReply: async () => undefined,
        } as never);

        check("Gesperrter Zugang: genau eine Fehlerzeile", errors.length === 1, `${errors.length}: ${errors.join(" | ")}`);
        check("  sie sagt, was zu tun ist", /PRIME_API_TOKEN/.test(errors[0] ?? "") && (errors[0] ?? "").includes("The Prime API token is not valid."), errors[0]);
        check("  keine Warnung je Anfrage dazu", warnings.length === 0, warnings.join(" | "));

        (noisy as unknown as { alarmAt: number }).alarmAt = 0;
        await noisy.Profile("Neu3").catch(() => null);

        check("  nach einer Stunde kommt sie wieder", errors.length === 2, `${errors.length}`);

        noisy.Close();

        // Ohne Grund von Prime (so lief der Zugang am 18.11. ab) nennt die Zeile den Rumpf.
        class Bare extends PrimeService {
            protected override async Load(): Promise<IPrimeProfile | null> {
                throw HttpError(403, "");
            }

            public override get IsConfigured(): boolean {
                return true;
            }
        }

        const bare = new Bare(client);

        await bare.Profile("Neu4").catch(() => null);
        check("Ohne Grund steht der Rumpf in der Fehlerzeile", (errors.at(-1) ?? "").includes("403") && (errors.at(-1) ?? "").includes("Rumpf leer"), errors.at(-1));
        bare.Close();
    } finally {
        logger.error = real.error;
        logger.warn = real.warn;
    }
}

/**
 * W-0145: Die DM an die Developer. Nie echt gesendet: ein nachgestellter
 * Client sammelt, was rausginge. Ein Developer mit geschlossenen DMs und einer,
 * den Discord nicht kennt, dürfen den Versand an die anderen nicht aufhalten.
 */
async function checkAccessMessage(): Promise<void> {
    console.log("\n  — DM an die Developer —");

    const now = Date.UTC(2026, 10, 19, 18, 52);
    const sent: { to: string; message: Record<string, unknown> }[] = [];
    const warnings: string[] = [];
    const client = {
        config: { DEV_USER_IDs: ["1", "2", "3"], PRIME_API_TOKEN: "geheimer-pruef-schluessel" },
        users: {
            fetch: async (id: string) => {
                if (id === "3") throw new Error("Unknown User");

                return {
                    tag: `dev${id}`,
                    send: async (message: Record<string, unknown>) => {
                        if (id === "2") throw new Error("Cannot send messages to this user");
                        sent.push({ to: id, message });
                    },
                };
            },
        },
    } as unknown as BotClient;
    const locked: IPrimeAccessCard = { state: "locked", now, account: "Nexus EMB", at: now - 20 * 3_600_000, answer: "401 · Access expired", lastOk: null, hours: Array(24).fill("down"), refused: 3 };

    const real = logger.warn;
    logger.warn = (message: string) => void warnings.push(message);

    let count = -1;

    try {
        count = await SendPrimeAccess(client, locked);
    } finally {
        logger.warn = real;
    }

    const json = JSON.stringify(sent[0]?.message ?? {});
    const files = (sent[0]?.message.files ?? []) as { name?: string }[];

    check("Rot geht an den, der DMs offen hat", count === 1 && sent.length === 1 && sent[0]?.to === "1", `${count} gesendet`);
    check("  geschlossene DMs und Unbekannte landen nur im Log", warnings.length === 2, warnings.join(" | "));
    check("  als Bild mit Alt-Text", files[0]?.name === "prime-zugang.png" && json.includes("attachment://prime-zugang.png") && json.includes(JSON.stringify(PrimeAccessAlt(locked)).slice(1, 60)), json.slice(0, 200));
    check("  mit Zeitstempel, der live zählt", json.includes(`<t:${Math.floor(locked.at / 1000)}:R>`), json.slice(0, 300));
    check("  sagt, wohin der neue Schlüssel gehört", json.includes("`PRIME_API_TOKEN`"));
    check("  Knopf zur Prime-Kontoseite", json.includes(PRIME_ACCESS_URL) && json.includes("Prime-Konto öffnen"));
    check("  der Schlüssel selbst steht nirgends", !json.includes("geheimer-pruef-schluessel"));

    sent.length = 0;
    await SendPrimeAccess(client, { ...locked, state: "back", until: now, answer: "Zugang wieder aktiv", lastOk: now });

    const back = JSON.stringify(sent[0]?.message ?? {});

    check("Grün: „Wieder da“ mit Zeitstempel, ohne Schritt zum Schlüssel", back.includes(`Wieder da seit <t:${Math.floor(now / 1000)}:R>`) && !back.includes("PRIME_API_TOKEN`"), back.slice(0, 300));
}

/**
 * W-0145: Wann die DM rausgeht. Je Zustand einmal, Rot höchstens alle 24
 * Stunden als Erinnerung, Gelb 7 Tage und 1 Tag vor PRIME_ACCESS_EXPIRES. Der
 * gemeldete Zustand steht in bot_state, ein Neustart schickt nichts doppelt.
 * Datenbank und Discord sind nachgestellt.
 */
async function checkAccessWatch(): Promise<void> {
    console.log("\n  — Wann die DM rausgeht —");

    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const t0 = Date.UTC(2026, 10, 18, 22, 5);
    const state = new Map<string, string>();
    const writes: string[] = [];
    const dms: string[] = [];
    let probes = 0;
    const refused = HttpError(401, '{"Error":{"Message":"The Prime API token is not valid.","Type":"Unauthorized"}}');

    const fake = (expires = "", db = { ready: true }, discord = { ready: true }) =>
        ({
            config: { DEV_USER_IDs: ["1"], PRIME_ACCESS_EXPIRES: expires },
            isReady: () => discord.ready,
            users: { fetch: async () => ({ tag: "dev", send: async (message: { components: { toJSON(): unknown }[] }) => void dms.push(JSON.stringify(message.components[0]?.toJSON())) }) },
            databaseService: {
                get Ready() {
                    return db.ready;
                },
                Query: async (sql: string, values: string[] = []) => {
                    if (sql.startsWith("SELECT")) return state.has(values[0]!) ? [{ value: state.get(values[0]!) }] : [];

                    state.set(values[0]!, values[1]!);
                    writes.push(values[1]!);

                    return [];
                },
            },
            primeService: { IsConfigured: true, Probe: async () => void probes++ },
        }) as unknown as BotClient;

    const run = async (watch: PrimeAccessWatch, result: "ok" | "other" | PrimeError, at: number) => {
        watch.Note(result, at);
        await watch.Idle();
    };

    let watch = new PrimeAccessWatch(fake());

    await run(watch, refused, t0);
    check("Erste Ablehnung: rote DM", dms.length === 1 && dms[0]!.includes("Prime-Zugang abgelaufen"), `${dms.length} DMs`);
    check("  sie nennt, was Prime sagt", dms[0]?.includes("401 · The Prime API token is not valid.") === true);

    await run(watch, refused, t0 + HOUR);
    await run(watch, refused, t0 + 23 * HOUR);
    check("Weitere Ablehnungen am selben Tag: keine DM", dms.length === 1, `${dms.length} DMs`);

    await run(watch, refused, t0 + DAY + 60_000);
    check("Nach 24 Stunden noch gesperrt: eine Erinnerung", dms.length === 2, `${dms.length} DMs`);

    watch = new PrimeAccessWatch(fake());
    await run(watch, refused, t0 + DAY + 2 * HOUR);
    check("Neustart, immer noch gesperrt: keine neue DM", dms.length === 2, `${dms.length} DMs`);

    await run(watch, "other", t0 + DAY + 3 * HOUR);
    check("Ein Ausfall ohne Ablehnung ändert nichts", dms.length === 2, `${dms.length} DMs`);

    await run(watch, "ok", t0 + DAY + 4 * HOUR);
    check("Erste erfolgreiche Abfrage: grüne DM", dms.length === 3 && dms[2]!.includes("Prime-Zugang wieder da"), `${dms.length} DMs`);
    check("  mit der Dauer der Sperre und den abgelehnten Anfragen", dms[2]?.includes("1 Tag 4 Std.") === true && dms[2]?.includes("5 Anfragen") === true, dms[2]?.slice(0, 400));

    await run(watch, "ok", t0 + DAY + 5 * HOUR);
    watch = new PrimeAccessWatch(fake());
    await run(watch, "ok", t0 + DAY + 6 * HOUR);
    check("Danach und nach einem Neustart: keine weitere DM", dms.length === 3, `${dms.length} DMs`);

    // Gelb: nur mit PRIME_ACCESS_EXPIRES, 7 Tage und 1 Tag vorher, je einmal.
    const expires = t0 + 10 * DAY;
    const iso = `${new Date(expires).toISOString().slice(0, 16)}Z`;

    check("PRIME_ACCESS_EXPIRES: ISO mit Uhrzeit wird gelesen", ParseAccessExpiry(iso) === expires && ParseAccessExpiry("2026-12-18T23:00+01:00") === Date.UTC(2026, 11, 18, 22), String(ParseAccessExpiry(iso)));
    check("  leer heißt: kein Datum", ParseAccessExpiry("") === null);
    check("  Unsinn und ein Datum ohne Uhrzeit sind ungültig", ParseAccessExpiry("morgen") === "invalid" && ParseAccessExpiry("2026-12-18") === "invalid");
    // Review M6: Date.parse rollt unmögliche Daten weiter (30.02. wird 02.03.) - das darf nicht durchgehen.
    check(
        "  unmögliche Daten sind ungültig (30.02., Monat 13, 24:30, 23:60)",
        ["2026-02-30T23:00", "2026-13-01T10:00", "2026-12-18T24:30", "2026-12-18T23:60"].every((value) => ParseAccessExpiry(value) === "invalid"),
        ["2026-02-30T23:00", "2026-13-01T10:00", "2026-12-18T24:30", "2026-12-18T23:60"].map((value) => String(ParseAccessExpiry(value))).join(", ")
    );
    check("  ein Schalttag ist gültig", typeof ParseAccessExpiry("2028-02-29T12:00") === "number");

    dms.length = 0;
    watch = new PrimeAccessWatch(fake(iso));
    await watch.Tick(t0 + 2 * DAY);
    check("Gelb: 8 Tage vorher noch nichts", dms.length === 0, `${dms.length} DMs`);

    await watch.Tick(t0 + 3 * DAY + 60_000);
    check("  7 Tage vorher die erste Warnung", dms.length === 1 && dms[0]!.includes("Prime-Zugang läuft bald ab") && dms[0]!.includes("Erste Warnung"), `${dms.length} DMs`);

    await watch.Tick(t0 + 5 * DAY);
    check("  dazwischen nichts", dms.length === 1, `${dms.length} DMs`);

    await watch.Tick(t0 + 9 * DAY + 60_000);
    check("  1 Tag vorher die zweite", dms.length === 2 && dms[1]!.includes("Zweite Warnung"), `${dms.length} DMs`);

    watch = new PrimeAccessWatch(fake(iso));
    await watch.Tick(t0 + 9 * DAY + 2 * HOUR);
    check("  nach einem Neustart keine doppelte", dms.length === 2, `${dms.length} DMs`);

    dms.length = 0;
    state.clear();
    await new PrimeAccessWatch(fake()).Tick(t0 + 9 * DAY);
    check("Ohne PRIME_ACCESS_EXPIRES keine gelbe DM", dms.length === 0, `${dms.length} DMs`);

    const warnings: string[] = [];
    const real = logger.warn;

    logger.warn = (message: string) => void warnings.push(message);

    try {
        const broken = new PrimeAccessWatch(fake("nächsten Dienstag"));

        await broken.Tick(t0);
        await broken.Tick(t0 + HOUR);
        check("Ungültiges Datum: einmal eine Warnung im Log, keine DM, kein Absturz", warnings.filter((line) => line.includes("PRIME_ACCESS_EXPIRES")).length === 1 && dms.length === 0, warnings.join(" | "));

        warnings.length = 0;

        const past = new PrimeAccessWatch(fake("2020-01-01T00:00"));

        await past.Tick(t0);
        check("Datum in der Vergangenheit: einmal im Log, keine DM", warnings.filter((line) => line.includes("PRIME_ACCESS_EXPIRES") && line.includes("Vergangenheit")).length === 1 && dms.length === 0, warnings.join(" | "));
    } finally {
        logger.warn = real;
    }

    // Die Probe: höchstens eine Abfrage je Stunde, und nur, wenn sonst keine lief.
    probes = 0;
    watch = new PrimeAccessWatch(fake());
    await run(watch, "ok", t0);
    await watch.Tick(t0 + 30 * 60_000);
    check("Probe: lief in der Stunde schon eine Abfrage, fragt sie nicht", probes === 0, `${probes} Proben`);

    await watch.Tick(t0 + HOUR + 60_000);
    await watch.Tick(t0 + HOUR + 11 * 60_000);
    check("  sonst genau eine je Stunde", probes === 1, `${probes} Proben`);

    await watch.Tick(t0 + 2 * HOUR + 2 * 60_000);
    check("  und eine Stunde später die nächste", probes === 2, `${probes} Proben`);

    // Review I1: Flattert der Zugang (abwechselnd abgelehnt und angenommen), darf das keine DM-Flut auslösen.
    const count = (word: string) => dms.filter((dm) => dm.includes(word)).length;

    state.clear();
    dms.length = 0;
    watch = new PrimeAccessWatch(fake());

    for (let index = 0; index < 10; index++) await run(watch, index % 2 === 0 ? refused : "ok", t0 + index * 60_000);

    check("Flattern: 10 Wechsel in 10 Minuten ergeben höchstens 1 Rot und 1 Grün", count("Prime-Zugang abgelaufen") <= 1 && count("Prime-Zugang wieder da") <= 1, `${count("Prime-Zugang abgelaufen")} rot, ${count("Prime-Zugang wieder da")} grün`);

    await run(watch, refused, t0 + DAY + 60_000);
    check("  einen Tag nach dem letzten Rot meldet eine neue Sperre wieder", count("Prime-Zugang abgelaufen") === 2, `${count("Prime-Zugang abgelaufen")} rot`);

    // Review M3: bot_state.value fasst 255 Zeichen. Auch ein langer Grund mit Anführungszeichen
    // und Backslashes darf den Eintrag nicht sprengen - er gehört gar nicht hinein.
    const long = HttpError(401, JSON.stringify({ Error: { Type: "Unauthorized", Message: `"${"\\x".repeat(300)}" Grund-Ende` } }));

    await run(watch, long, t0 + 3 * DAY);
    check("bot_state: jeder Eintrag unter 255 Zeichen", writes.length > 0 && writes.every((value) => value.length <= 255), `${Math.max(...writes.map((value) => value.length))} Zeichen`);
    check("  und der Grund von Prime steht nicht darin", writes.every((value) => !value.includes("Grund-Ende") && !value.includes("not valid")), writes.at(-1));

    // Review M1: Nach einem Neustart verbindet sich die Datenbank parallel zum Login. Kommt die
    // erste Ablehnung vorher, darf das nicht noch einmal Rot schicken.
    state.clear();
    dms.length = 0;
    await run(new PrimeAccessWatch(fake()), refused, t0);

    const db = { ready: false };
    const restarted = new PrimeAccessWatch(fake("", db));

    await run(restarted, refused, t0 + 60_000);
    db.ready = true;
    await run(restarted, refused, t0 + 90_000);
    check("Neustart, Datenbank erst später bereit: keine doppelte rote DM", count("Prime-Zugang abgelaufen") === 1, `${count("Prime-Zugang abgelaufen")} rot`);

    // Kommt sie gar nicht, gilt nach zwei Minuten der Speicher - sonst bliebe jede DM aus.
    state.clear();
    dms.length = 0;

    const without = new PrimeAccessWatch(fake("", { ready: false }));

    await run(without, refused, t0);
    await run(without, refused, t0 + 3 * 60_000);
    check("  ohne Datenbank nach zwei Minuten trotzdem Rot", count("Prime-Zugang abgelaufen") === 1, `${count("Prime-Zugang abgelaufen")} rot`);

    // Review M2: Ist Discord noch nicht verbunden, gilt eine DM nicht als geschickt - beim nächsten Mal erneut.
    state.clear();
    dms.length = 0;

    const discord = { ready: false };
    const offline = new PrimeAccessWatch(fake("", { ready: true }, discord));

    await run(offline, refused, t0);
    discord.ready = true;
    await run(offline, refused, t0 + 5 * 60_000);
    check("Discord erst später verbunden: Rot kommt beim nächsten Mal", count("Prime-Zugang abgelaufen") === 1, `${count("Prime-Zugang abgelaufen")} rot`);

    discord.ready = false;
    await run(offline, "ok", t0 + 10 * 60_000);
    discord.ready = true;
    await run(offline, "ok", t0 + 15 * 60_000);
    check("  Grün ebenso", count("Prime-Zugang wieder da") === 1, `${count("Prime-Zugang wieder da")} grün`);

    const soon = `${new Date(t0 + 6 * DAY).toISOString().slice(0, 16)}Z`;
    const yellow = new PrimeAccessWatch(fake(soon, { ready: true }, discord));

    discord.ready = false;
    await yellow.Tick(t0 + HOUR);
    discord.ready = true;
    await yellow.Tick(t0 + HOUR + 10 * 60_000);
    check("  Gelb ebenso", count("Prime-Zugang läuft bald ab") === 1, `${count("Prime-Zugang läuft bald ab")} gelb`);

    // Kann der Zustand nicht gespeichert werden, geht die DM trotzdem raus und der Fehler ins Log.
    state.clear();
    dms.length = 0;

    const broken = fake();
    const warned: string[] = [];
    const realWarn = logger.warn;

    (broken.databaseService as unknown as { Query: (sql: string) => Promise<unknown[]> }).Query = async (sql: string) => {
        if (sql.startsWith("SELECT")) return [];

        throw new Error("Datenbank weg");
    };
    logger.warn = (message: string) => void warned.push(message);

    try {
        await run(new PrimeAccessWatch(broken), refused, t0);
    } finally {
        logger.warn = realWarn;
    }

    check("Speichern scheitert: Rot geht trotzdem raus, der Fehler steht im Log", count("Prime-Zugang abgelaufen") === 1 && warned.some((line) => line.includes("Datenbank weg")), `${count("Prime-Zugang abgelaufen")} rot | ${warned.join(" | ")}`);
}

/**
 * Die Umrechnung ist der Kern: steht sie falsch, sieht jede Zahl im Dashboard
 * plausibel aus und ist trotzdem daneben. Die Werte stammen aus einer echten
 * Antwort von Prime.
 */
function checkMath(): void {
    console.log("\n  — Umrechnung —");

    check("MMR ist Wert * 20 + 100", ToMMR(62.4867) === 1350, String(ToMMR(62.4867)));
    check("  1v1-Beispiel stimmt", ToMMR(33.9633) === 779, String(ToMMR(33.9633)));
    check("  3v3-Beispiel stimmt", ToMMR(53.9804) === 1180, String(ToMMR(53.9804)));
    check("Es wird gerundet, nicht abgeschnitten", ToMMR(0.024) === 100 && ToMMR(0.026) === 101);
    check("Ein Wert von 0 ergibt 100", ToMMR(0) === 100, String(ToMMR(0)));

    console.log("\n  — Ränge —");

    check("Rang 0 ist Unranked", TierName(0) === "Unranked");
    check("Rang 12 ist Platin III", TierName(12) === "Platin III", TierName(12));
    check("Rang 18 ist Champion III", TierName(18) === "Champion III", TierName(18));
    check("Rang 22 ist Supersonic Legend", TierName(22) === "Supersonic Legend", TierName(22));
    check("Unbekannter Rang fällt auf Unranked", TierName(99) === "Unranked", TierName(99));

    check("Division 0 heißt I", DivisionName(0) === "I");
    check("Division 3 heißt IV", DivisionName(3) === "IV");
    check("Division 4 gibt es nicht", DivisionName(4) === null);

    console.log("\n  — PlayerID —");

    check("Epic wird übersetzt", ToPlayerID("Epic Games", "abc") === "Epic|abc|0", String(ToPlayerID("Epic Games", "abc")));
    check("PlayStation heißt PS4", ToPlayerID("PlayStation", "1") === "PS4|1|0", String(ToPlayerID("PlayStation", "1")));
    check("Xbox heißt XboxOne", ToPlayerID("Xbox", "1") === "XboxOne|1|0", String(ToPlayerID("Xbox", "1")));
    check("Nintendo heißt Switch", ToPlayerID("Nintendo", "1") === "Switch|1|0", String(ToPlayerID("Nintendo", "1")));
    check("Unbekannte Plattform ergibt null", ToPlayerID("Facebook", "1") === null);

    check("Drei Playlists werden verfolgt", TRACKED_PLAYLISTS.length === 3);
    check(
        "  und zwar 1v1, 2v2, 3v3",
        TRACKED_PLAYLISTS.map((entry) => `${entry.key}:${entry.id}`).join(" ") === "1v1:10 2v2:11 3v3:13",
        TRACKED_PLAYLISTS.map((entry) => `${entry.key}:${entry.id}`).join(" ")
    );
}

async function checkLive(client: BotClient, player: string): Promise<void> {
    console.log(`\n  — Echte Abfrage: ${player} —`);

    const service = client.primeService;
    const started = Date.now();

    const profile = await service.Profile(player);

    if (!profile) {
        check("Spieler wurde gefunden", false, "Prime kennt den Namen nicht");
        return;
    }

    check("Spieler wurde gefunden", true, `${Date.now() - started} ms`);
    check("Anzeigename kommt zurück", profile.name.length > 0, profile.name);
    check("Plattform ist bekannt", profile.platform.length > 0, profile.platform);
    check("PlayerID hat drei Teile", profile.playerId.split("|").length === 3, profile.playerId);
    check("Zeitstempel ist gesetzt", !Number.isNaN(Date.parse(profile.fetchedAt)));

    check("Ränge kommen an", profile.ranks.length > 0, `${profile.ranks.length} Playlists`);

    for (const rank of profile.ranks) {
        // Eine MMR unter 100 wäre rechnerisch unmöglich: der interne Wert ist nie negativ.
        check(
            `  ${rank.key}: ${rank.mmr} MMR, ${rank.tierName}${rank.divisionName ? ` Div ${rank.divisionName}` : ""}`,
            rank.mmr >= 100 && rank.tier >= 0 && rank.tier <= 22,
            JSON.stringify(rank)
        );
    }


    // Die Plattformen, die Epic am Konto haengen sieht. Sie sind der Grund,
    // warum ein einziger Login fuer alle fuenf reicht - deshalb hier geprueft.
    console.log("\n  — Verknüpfte Plattformen —");

    if (profile.linked.length === 0) {
        console.log("  --   Dieses Konto hängt an keiner weiteren Plattform.");
    }

    for (const account of profile.linked) {
        check(
            `  ${account.platform}: ${account.name}`,
            ToPlatform(account.platform) !== null,
            `unbekannte Plattform: ${account.platform}`
        );
    }

    // Der Ingame-Club. Kein Club ist der Normalfall und kein Fehler - gemeckert
    // wird nur, wenn einer da ist und dann unvollstaendig ankommt.
    console.log("\n  — Ingame-Club —");

    if (!profile.club) {
        console.log("  --   Dieser Spieler ist in keinem Club.");
    } else {
        const club = profile.club;

        check(`  ${club.name} [${club.tag}]`, club.name.length > 0 && club.tag.length > 0);
        check("  Mitglieder kommen an", club.members.length > 0, `${club.members.length}`);
        check("  Genau ein Owner", club.members.filter((member) => member.owner).length === 1);
        check(
            "  Club-MMR ist plausibel",
            club.averageMMR === null || club.averageMMR >= 100,
            String(club.averageMMR)
        );
    }

    // Zweiter Aufruf: derselbe Name darf nicht erneut über die Leitung gehen.
    const again = Date.now();
    await service.Profile(player);

    check("Zweite Abfrage kommt aus dem Cache", Date.now() - again < 50, `${Date.now() - again} ms`);

    service.Forget(player);
    check("Cache lässt sich leeren", service.Stats().size === 0);

    // Der Weg, den die echte Anmeldung geht: Epic gibt nur die Konto-ID zurück,
    // Prime muss damit dasselbe Profil finden wie mit dem Namen. Bricht das,
    // funktioniert der Epic-Login nicht mehr - ohne dass es sonst auffiele.
    // Steht am Ende, weil es den eben geleerten Cache wieder füllt.
    console.log("\n  — Anmeldung über die Konto-ID —");

    const byId = await service.Profile(profile.accountId);

    check("Konto-ID findet dasselbe Profil", byId?.accountId === profile.accountId, String(byId?.accountId));
    check("  und denselben Namen", byId?.name === profile.name, String(byId?.name));

    service.Forget(profile.accountId);

    // W-0145: Wie Prime einen falschen Schlüssel ablehnt - so sah es aus, als
    // der Zugang am 18.11.2026 ablief.
    console.log("\n  — Falscher Schlüssel —");

    const wrong = new PrimeService({ config: { PRIME_API_TOKEN: "falscher-schluessel" } } as unknown as BotClient);
    const refused = await wrong.Profile(player).then(
        () => null,
        (error: unknown) => error
    );

    check("Prime lehnt ab, der Bot erkennt den Zugangsfehler", refused instanceof PrimeError && refused.type === "Access", refused instanceof PrimeError ? `${refused.type} ${refused.status}: ${refused.message}` : String(refused));

    // Die stündliche Probe: mit dem echten Schlüssel „ok“, mit dem falschen „Access“.
    const notes = (prime: PrimeService): string[] => {
        const seen: string[] = [];
        const note = prime.access.Note.bind(prime.access);

        prime.access.Note = (result, now) => {
            seen.push(typeof result === "string" ? result : result.type);
            note(result, now);
        };

        return seen;
    };
    const good = notes(service);
    const bad = notes(wrong);

    await service.Probe();
    await wrong.Probe();

    check("Probe mit dem echten Schlüssel: angenommen", good.join() === "ok", good.join());
    check("Probe mit dem falschen: abgelehnt", bad.join() === "Access", bad.join());

    wrong.Close();
}

async function main(): Promise<void> {
    const client = new BotClient();
    const player = process.argv[2]?.trim();

    console.log(`\nPrime-Token: ${client.primeService.IsConfigured ? "gesetzt" : "fehlt"}\n`);

    checkMath();
    checkTracker();
    checkGuildFree();

    // Braucht kein Netz: der Zwischenspeicher wird mit einer nachgestellten
    // Prime-Anbindung geprueft.
    await checkCache(client);
    await checkAccess(client);
    await checkAccessMessage();
    await checkAccessWatch();

    if (!player) {
        console.log("\n⏭️  Kein Spielername übergeben - die echte Abfrage bleibt aus.\n   npm run check:prime -- DEIN_EPIC_NAME\n");
    } else if (!client.primeService.IsConfigured) {
        console.log("\n⏭️  PRIME_API_TOKEN fehlt in der .env - die echte Abfrage bleibt aus.\n");
    } else {
        try {
            await checkLive(client, player);
        } catch (error) {
            const prime = error instanceof PrimeError ? error : null;

            check("Echte Abfrage lief durch", false, prime ? `${prime.type}: ${prime.message}` : String(error));
        }
    }

    client.primeService.Close();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
