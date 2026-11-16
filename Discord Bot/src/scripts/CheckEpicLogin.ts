/**
 * Prüft den Epic-Login für /rank link (W-0125) ohne Discord, Datenbank und Epic:
 * das Link-Token, die Adresse zu Epic, den Code-Tausch, das Verknüpfen und den
 * Rückweg samt „ein Epic-Konto, ein Discord-Konto“.
 *
 *   npm run check:epiclogin
 *
 * Ob Epic den Login wirklich annimmt, zeigt nur ein echter Client aus dem
 * Developer Portal (siehe docs/EpicLogin.md).
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { LINK_COOLDOWN, LINK_FIX, Platform } from "../constants/Database";
import PlayerAccount from "../models/PlayerAccount";
import { Seal } from "../utils/seal";
import { DiscordBack, EpicAuthorizeURL, EpicExchange, EpicLinkToken, EpicLinkURL } from "../utils/epicLogin";
import { EpicAdopt } from "../utils/epic";
import { EpicDonePage, EpicFailPage } from "../builder/EpicPage";
import EpicCallback from "../routes/EpicCallback";
import EpicLink, { EPIC_STATE_COOKIE } from "../routes/EpicLink";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const SECRET = "x".repeat(64);
const USER = "90071992547413001";
const OTHER = "90071992547413002";
const ACCOUNT = "9626f441055349ce8cb7d7d5a483eaa2";

interface IRow {
    user_id: string;
    account_id: string;
    display_name: string | null;
    changed_at: Date;
}

function Client(rows: IRow[] = [], extra: Record<string, unknown> = {}): BotClient & { calls: string[]; rows: IRow[] } {
    const calls: string[] = [];
    const On = async (userId: string) => rows.find((row) => row.user_id === userId) ?? null;

    return {
        calls,
        rows,
        developerMode: true,
        config: { SERVER_JWT_SECRET: SECRET, EPIC_CLIENT_ID: "client-id", EPIC_CLIENT_SECRET: "se+cr/et", EPIC_DEPLOYMENT_ID: "", SITE_PUBLIC_URL: "https://nexus-emb.de" },
        server: { BaseURL: "http://localhost:3000" },
        dashboardService: { Secure: false },
        databaseService: { Ready: true },
        primeService: { IsConfigured: false },
        users: { fetch: async (id: string) => ({ id, username: `user-${id.slice(-1)}`, globalName: null, displayAvatarURL: () => "https://cdn.discordapp.com/a.png" }) },
        accounts: {
            On,
            Owner: async (_platform: string, accountId: string) => rows.find((row) => row.account_id === accountId)?.user_id ?? null,
            // Die echte Rechnung aus dem Model, nur ohne Datenbank darunter.
            Cooldown: (userId: string, platform: Platform, windowMs: number, fixMs?: number, now?: number) =>
                PlayerAccount.prototype.Cooldown.call({ On } as unknown as PlayerAccount, userId, platform, windowMs, fixMs, now),
            Link: async (userId: string, _platform: string, accountId: string, name: string, _verified?: boolean, changedAt = new Date()) => {
                calls.push(`link ${userId} ${accountId} ${name}`);
                rows.splice(0, rows.length, ...rows.filter((row) => row.user_id !== userId), { user_id: userId, account_id: accountId, display_name: name, changed_at: changedAt });
            },
            Rename: async (userId: string, _platform: string, name: string) => {
                calls.push(`rename ${userId} ${name}`);
            },
        },
        ranks: { Snapshot: async () => calls.push("snapshot"), SaveProfile: async () => calls.push("profile"), Clear: async () => calls.push("clear") },
        rankRoleService: { Strip: async () => (calls.push("strip"), 0) },
        guilds: { cache: new Map() },
        ...extra,
    } as unknown as BotClient & { calls: string[]; rows: IRow[] };
}

/** Ersetzt fetch für einen Durchlauf: erst die Token-Antwort, dann die Konten-Antwort. */
function FakeEpic(token: { status?: number; body: unknown }, accounts?: { status?: number; body: unknown }): { sent: { url: string; init?: RequestInit }[] } {
    const sent: { url: string; init?: RequestInit }[] = [];

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        sent.push({ url: String(url), init });

        const answer = String(url).includes("/oauth/v2/token") ? token : (accounts ?? { status: 500, body: {} });

        return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }) as typeof fetch;

    return { sent };
}

function TokenOf(url: string): string {
    return new URL(url).searchParams.get("t") ?? "";
}

/* ----------------------------------------------------------
   Link-Token und Adresse
   ---------------------------------------------------------- */
function checkToken(): void {
    console.log("\n  — Link-Token —");

    const client = Client();
    const now = Date.now();
    const url = EpicLinkURL(client, USER, now);
    const sealed = TokenOf(url);

    check(`Adresse zeigt auf ${DASHBOARD_PATH}/link/epic`, url.startsWith(`http://localhost:3000${DASHBOARD_PATH}/link/epic?t=`), url);
    check("Token passt in einen Discord-Knopf (≤ 512 Zeichen)", url.length <= 512, String(url.length));
    check("Token nennt die Discord-ID", EpicLinkToken(client, sealed, 0, now)?.userId === USER);
    check("Nach 10 Minuten abgelaufen", EpicLinkToken(client, sealed, 0, now + 10 * 60_000 + 1) === null);
    check("Mit Nachfrist auf dem Rückweg noch gültig", EpicLinkToken(client, sealed, 10 * 60_000, now + 15 * 60_000)?.userId === USER);
    check("Verändertes Token: nichts", EpicLinkToken(client, `${sealed.slice(0, -2)}AA`, 0, now) === null);
    check("Sitzung mit demselben Secret ist kein Link-Token", EpicLinkToken(client, Seal({ id: "s", userId: USER, accessToken: "a", expiresAt: now + 1e6 }, SECRET), 0, now) === null);
    check("Keine Discord-ID: nichts", EpicLinkToken(client, Seal({ kind: "epic-link", userId: "abc", expiresAt: now + 1e6 }, SECRET), 0, now) === null);
    check("Kein Text: nichts", EpicLinkToken(client, 42, 0, now) === null && EpicLinkToken(client, "", 0, now) === null);

    const authorize = new URL(EpicAuthorizeURL(client, "nonce-1"));

    check("Epic: Client, Code, Scope, state", authorize.searchParams.get("client_id") === "client-id" && authorize.searchParams.get("response_type") === "code" && authorize.searchParams.get("scope") === "basic_profile" && authorize.searchParams.get("state") === "nonce-1");
    check(`Epic: Rückweg ${DASHBOARD_PATH}/link/epic/callback`, authorize.searchParams.get("redirect_uri") === `http://localhost:3000${DASHBOARD_PATH}/link/epic/callback`);
}

/* ----------------------------------------------------------
   Code-Tausch
   ---------------------------------------------------------- */
async function checkExchange(): Promise<void> {
    console.log("\n  — Code-Tausch —");

    const client = Client();
    const ok = FakeEpic({ body: { access_token: "at", account_id: ACCOUNT.toUpperCase() } }, { body: [{ accountId: ACCOUNT, displayName: "Nova Lukas" }] });
    const account = await EpicExchange(client, "code-1");
    const auth = new Headers(ok.sent[0]?.init?.headers).get("authorization") ?? "";
    const body = String(ok.sent[0]?.init?.body ?? "");

    check("Konto-ID aus der Antwort, klein geschrieben", account.accountId === ACCOUNT, account.accountId);
    check("Name aus den Konten von Epic", account.displayName === "Nova Lukas", String(account.displayName));
    check("Basic-Auth ohne URL-Kodierung (+ und / im Secret)", auth === `Basic ${Buffer.from("client-id:se+cr/et").toString("base64")}`, auth);
    check("Code und Rückweg im Body", body.includes("grant_type=authorization_code") && body.includes("code=code-1") && body.includes("redirect_uri="));
    check("Ohne EPIC_DEPLOYMENT_ID keine deployment_id", !body.includes("deployment_id"));

    FakeEpic({ body: { access_token: "at", account_id: ACCOUNT } });
    check("Konten-Abfrage fällt aus: Name null, Verbinden geht", (await EpicExchange(client, "c")).displayName === null);

    const deployed = Client([], { config: { ...Client().config, EPIC_DEPLOYMENT_ID: "dep-1" } });
    const withDeployment = FakeEpic({ body: { access_token: "at", account_id: ACCOUNT } });

    await EpicExchange(deployed, "c");
    check("Mit EPIC_DEPLOYMENT_ID geht sie mit", String(withDeployment.sent[0]?.init?.body).includes("deployment_id=dep-1"));

    FakeEpic({ status: 400, body: { errorCode: "errors.com.epicgames.account.oauth.authorization_code_not_found" } });
    check("Epic lehnt den Code ab: Fehler", await EpicExchange(client, "c").then(() => false, () => true));

    FakeEpic({ body: { access_token: "at", account_id: "not-an-id" } });
    check("Keine gültige Konto-ID: Fehler", await EpicExchange(client, "c").then(() => false, () => true));
}

/* ----------------------------------------------------------
   Verknüpfen
   ---------------------------------------------------------- */
async function checkAdopt(): Promise<void> {
    console.log("\n  — Verknüpfen —");

    const fresh = Client();
    const result = await EpicAdopt(fresh, USER, { accountId: ACCOUNT, displayName: "Nova Lukas" });

    check("Neu: verknüpft mit dem Namen von Epic", fresh.calls.includes(`link ${USER} ${ACCOUNT} Nova Lukas`) && result.name === "Nova Lukas", fresh.calls.join(", "));

    const old = new Date(Date.now() - 1000);
    const same = Client([{ user_id: USER, account_id: ACCOUNT, display_name: "Alter Name", changed_at: old }]);

    await EpicAdopt(same, USER, { accountId: ACCOUNT, displayName: "Nova Lukas" });
    check("Dasselbe Konto: nur umbenannt, Sperrfrist bleibt", same.calls.join(",") === `rename ${USER} Nova Lukas`, same.calls.join(", "));

    const unchanged = Client([{ user_id: USER, account_id: ACCOUNT, display_name: "Nova Lukas", changed_at: old }]);

    await EpicAdopt(unchanged, USER, { accountId: ACCOUNT, displayName: "Nova Lukas" });
    check("Dasselbe Konto, derselbe Name: nichts geschrieben", unchanged.calls.length === 0, unchanged.calls.join(", "));

    const prime = Client([], {
        primeService: { IsConfigured: true, Profile: async (id: string) => (id === ACCOUNT ? { name: "Aus Prime", ranks: [], seasonLevel: 0, seasonWins: 0, stats: {}, club: null } : null) },
    });

    await EpicAdopt(prime, USER, { accountId: ACCOUNT, displayName: null });
    check("Ohne Namen von Epic: Name aus Prime, Ränge gespeichert", prime.calls.includes(`link ${USER} ${ACCOUNT} Aus Prime`) && prime.calls.includes("snapshot"), prime.calls.join(", "));

    const down = Client([], { primeService: { IsConfigured: true, Profile: async () => Promise.reject(new Error("weg")) } });

    await EpicAdopt(down, USER, { accountId: ACCOUNT, displayName: "Nova Lukas" });
    check("Prime fällt aus: trotzdem verbunden, ohne Ränge", down.calls.includes(`link ${USER} ${ACCOUNT} Nova Lukas`) && !down.calls.includes("snapshot"), down.calls.join(", "));
}

/* ----------------------------------------------------------
   Seiten und Rückweg
   ---------------------------------------------------------- */
interface IReply {
    statusCode: number;
    headers: Record<string, unknown>;
    body: string;
    location: string | null;
}

function Reply(): IReply & Record<string, unknown> {
    const reply = {
        statusCode: 200,
        headers: {} as Record<string, unknown>,
        body: "",
        location: null as string | null,
        request: { headers: {} },
        header(key: string, value: unknown) {
            reply.headers[key.toLowerCase()] = value;

            return reply;
        },
        code(status: number) {
            reply.statusCode = status;

            return reply;
        },
        send(body: unknown) {
            reply.body = String(body);

            return reply;
        },
        redirect(url: string, status = 302) {
            reply.location = url;
            reply.statusCode = status;

            return reply;
        },
    };

    return reply;
}

async function Callback(client: BotClient, query: Record<string, string>, cookie: string | null): Promise<IReply> {
    const reply = Reply();
    const request = { query, headers: { cookie: cookie === null ? undefined : `${EPIC_STATE_COOKIE}=${encodeURIComponent(cookie)}` } };

    await new EpicCallback(client).Handle(request as never, reply as never);

    return reply;
}

async function checkPages(): Promise<void> {
    console.log("\n  — Seiten —");

    const hostile = EpicFailPage("<b>x</b>", "<script>alert(1)</script>", "a & b", { name: "<img onerror=1>", avatar: null });

    check("Fehlerseite maskiert Titel, Text und Namen", !hostile.TITLE.includes("<b>") && !hostile.TEXT.includes("<script") && !hostile.DISCORD.includes("<img onerror"));

    const done = EpicDonePage(null, "<Nova>", [{ mode: "3v3", tier: 20, name: "Grand Champion II" }], Date.UTC(2026, 10, 19, 12));

    check("Fertig-Seite maskiert den Epic-Namen", done.TEXT.includes("&lt;Nova&gt;") && !done.TEXT.includes("<Nova>"));

    const client = Client();
    const sealed = TokenOf(EpicLinkURL(client, USER));
    const confirm = Reply();

    await new EpicLink(client).Handle({ query: { t: sealed } } as never, confirm as never);
    check("Bestätigung nennt das Discord-Konto", confirm.statusCode === 200 && confirm.body.includes("user-1") && confirm.body.includes("Weiter zu Epic Games"), confirm.body.slice(0, 200));

    const go = Reply();

    await new EpicLink(client).Handle({ query: { t: sealed, go: "1" }, headers: { "sec-fetch-site": "same-origin" } } as never, go as never);
    check("Weiter: Cookie gesetzt, ab zu Epic", go.statusCode === 302 && String(go.location).startsWith("https://www.epicgames.com/id/authorize?") && String(go.headers["set-cookie"]).startsWith(`${EPIC_STATE_COOKIE}=`));

    const expired = Reply();

    await new EpicLink(client).Handle({ query: { t: "kaputt" } } as never, expired as never);
    check("Kaputter Link: 410", expired.statusCode === 410 && expired.body.includes("Link abgelaufen"));

    const unconfigured = Reply();

    await new EpicLink(Client([], { config: { ...Client().config, EPIC_CLIENT_ID: "" } })).Handle({ query: { t: sealed } } as never, unconfigured as never);
    check("Ohne Client-ID: nicht eingerichtet", unconfigured.statusCode === 503);
}

async function checkCallback(): Promise<void> {
    console.log("\n  — Rückweg von Epic —");

    const okEpic = (): void => void FakeEpic({ body: { access_token: "at", account_id: ACCOUNT } }, { body: [{ accountId: ACCOUNT, displayName: "Nova Lukas" }] });
    const cookieFor = (client: BotClient, nonce = "n1"): string => `${nonce}|${TokenOf(EpicLinkURL(client, USER))}`;

    const fresh = Client();

    okEpic();
    const done = await Callback(fresh, { code: "c", state: "n1" }, cookieFor(fresh));

    check("Neu: verbunden", done.statusCode === 200 && fresh.calls.includes(`link ${USER} ${ACCOUNT} Nova Lukas`), `${done.statusCode} ${fresh.calls.join(", ")}`);
    check("Cookie wird gelöscht", String(done.headers["set-cookie"]).includes("Max-Age=0"));

    const taken = Client([{ user_id: OTHER, account_id: ACCOUNT, display_name: "Nova Lukas", changed_at: new Date(0) }]);

    okEpic();
    const refused = await Callback(taken, { code: "c", state: "n1" }, cookieFor(taken));

    check("Konto gehört schon einem anderen Discord-Konto: 409, nichts geändert", refused.statusCode === 409 && refused.body.includes("Schon verbunden") && taken.calls.length === 0, `${refused.statusCode} ${taken.calls.join(", ")}`);

    const locked = Client([{ user_id: USER, account_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", display_name: "Erstes", changed_at: new Date(Date.now() - 2 * 3_600_000) }], { developerMode: false });

    okEpic();
    const cooldown = await Callback(locked, { code: "c", state: "n1" }, cookieFor(locked));

    check("Anderes Konto nach dem Korrektur-Fenster, in der Sperrfrist: 409", cooldown.statusCode === 409 && cooldown.body.includes("Wechsel noch gesperrt") && locked.calls.length === 0, `${cooldown.statusCode}`);

    const again = Client([{ user_id: USER, account_id: ACCOUNT, display_name: "Alter Name", changed_at: new Date() }], { developerMode: false });

    okEpic();
    const reconfirm = await Callback(again, { code: "c", state: "n1" }, cookieFor(again));

    check("Dasselbe Konto in der Sperrfrist neu bestätigen: geht, nur umbenannt", reconfirm.statusCode === 200 && again.calls.join(",") === `rename ${USER} Nova Lukas`, `${reconfirm.statusCode} ${again.calls.join(", ")}`);

    const mismatch = Client();

    okEpic();
    const wrongState = await Callback(mismatch, { code: "c", state: "fremd" }, cookieFor(mismatch));

    check("state passt nicht zum Cookie: 400, nichts verbunden", wrongState.statusCode === 400 && mismatch.calls.length === 0);

    const noCookie = await Callback(Client(), { code: "c", state: "n1" }, null);

    check("Ohne Cookie: 400", noCookie.statusCode === 400);

    const cancelled = await Callback(Client(), { error: "access_denied", state: "n1" }, cookieFor(Client()));

    check("Bei Epic abgebrochen: 403", cancelled.statusCode === 403 && cancelled.body.includes("abgebrochen"));

    const race = Client();

    (race.accounts as unknown as { Link: unknown }).Link = async () => Promise.reject(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
    okEpic();
    const dup = await Callback(race, { code: "c", state: "n1" }, cookieFor(race));

    check("Gleichzeitig woanders verbunden (eindeutiger Schlüssel): 409", dup.statusCode === 409);

    const broken = Client();

    FakeEpic({ status: 400, body: {} });
    const epicDown = await Callback(broken, { code: "c", state: "n1" }, cookieFor(broken));

    check("Epic lehnt ab: 502, nichts verbunden", epicDown.statusCode === 502 && broken.calls.length === 0);
}

/* ----------------------------------------------------------
   Falsches Konto erwischt: Korrektur-Fenster (LINK_FIX)
   ---------------------------------------------------------- */
async function checkSwap(): Promise<void> {
    console.log("\n  — Falsches Konto wechseln —");

    const OTHER_ACCOUNT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const client = Client();
    const now = Date.now();
    const plain = EpicLinkToken(client, TokenOf(EpicLinkURL(client, USER, now)), 0, now);
    const swap = EpicLinkToken(client, TokenOf(EpicLinkURL(client, USER, now, true)), 0, now);

    check("Normaler Knopf: kein Wechsel", plain?.swap === false);
    check("Wechsel-Knopf trägt das Merkmal", swap?.swap === true);
    check("Epic: prompt=login nur beim Wechsel", new URL(EpicAuthorizeURL(client, "n", true)).searchParams.get("prompt") === "login" && !new URL(EpicAuthorizeURL(client, "n")).searchParams.has("prompt"));

    const goSwap = Reply();

    await new EpicLink(client).Handle({ query: { t: TokenOf(EpicLinkURL(client, USER, Date.now(), true)), go: "1" }, headers: { "sec-fetch-site": "same-origin" } } as never, goSwap as never);
    check("Wechsel-Knopf: Epic fragt neu nach der Anmeldung", String(goSwap.location).includes("prompt=login"), String(goSwap.location));

    // Die Rechnung im Model
    const at = (minutesAgo: number): IRow[] => [{ user_id: USER, account_id: ACCOUNT, display_name: "Falsch", changed_at: new Date(now - minutesAgo * 60_000) }];
    const fresh = await Client(at(10)).accounts.Cooldown(USER, "epic", LINK_COOLDOWN, LINK_FIX, now);
    const later = await Client(at(90)).accounts.Cooldown(USER, "epic", LINK_COOLDOWN, LINK_FIX, now);
    const done = await Client(at(5 * 24 * 60)).accounts.Cooldown(USER, "epic", LINK_COOLDOWN, LINK_FIX, now);

    check("10 Minuten nach dem Verbinden: frei, mit Korrektur-Ende", fresh.open && fresh.fixUntil === now - 10 * 60_000 + LINK_FIX);
    check("90 Minuten danach: gesperrt", !later.open && later.fixUntil === null);
    check("Nach der Sperrfrist: frei, ohne Korrektur", done.open && done.fixUntil === null);
    check("Ohne fixMs bleibt es bei der alten Sperre", !(await Client(at(10)).accounts.Cooldown(USER, "epic", LINK_COOLDOWN, 0, now)).open);

    // Rückweg: 10 Minuten nach dem Verbinden mit dem falschen Konto
    const okEpic = (accountId: string): void => void FakeEpic({ body: { access_token: "at", account_id: accountId } }, { body: [{ accountId, displayName: "Richtig" }] });
    const wrong = Client(at(10), { developerMode: false });
    const firstLink = wrong.rows[0].changed_at.getTime();

    okEpic(OTHER_ACCOUNT);
    const fixed = await Callback(wrong, { code: "c", state: "n1" }, `n1|${TokenOf(EpicLinkURL(wrong, USER, Date.now(), true))}`);

    check("Korrektur im Fenster: 200, neues Konto verbunden", fixed.statusCode === 200 && wrong.rows[0]?.account_id === OTHER_ACCOUNT, `${fixed.statusCode} ${wrong.calls.join(", ")}`);
    check("Korrektur setzt die Sperrfrist nicht neu", wrong.rows[0]?.changed_at.getTime() === firstLink);
    check("Fertig-Seite nach Korrektur: noch Knopf bis Fensterende", fixed.body.includes("Anderes Epic-Konto verbinden") && fixed.body.includes("Korrigieren bis"));

    // 90 Minuten danach: wie bisher gesperrt
    const late = Client(at(90), { developerMode: false });

    okEpic(OTHER_ACCOUNT);
    const refused = await Callback(late, { code: "c", state: "n1" }, `n1|${TokenOf(EpicLinkURL(late, USER, Date.now(), true))}`);

    check("Nach dem Fenster: Wechsel gesperrt (409)", refused.statusCode === 409 && late.rows[0]?.account_id === ACCOUNT);

    // Erstes Verbinden: die Fertig-Seite bietet den Wechsel an
    const first = Client([], { developerMode: false });

    okEpic(ACCOUNT);
    const linked = await Callback(first, { code: "c", state: "n1" }, `n1|${TokenOf(EpicLinkURL(first, USER))}`);

    check("Erstes Verbinden: Knopf „Anderes Epic-Konto verbinden“ mit prompt=login dahinter", linked.statusCode === 200 && linked.body.includes("Anderes Epic-Konto verbinden") && linked.body.includes("&amp;go=1"));

    const swapLink = /href="([^"]*&amp;go=1)"/.exec(linked.body)?.[1]?.replaceAll("&amp;", "&") ?? "";
    const swapToken = EpicLinkToken(first, new URL(swapLink, "http://localhost:3000").searchParams.get("t"));

    check("Der Knopf gehört demselben Discord-Konto und ist ein Wechsel", swapToken?.userId === USER && swapToken.swap === true);
}

/* ----------------------------------------------------------
   „Zurück zu Discord“: App statt Browser, in den Kanal von /rank link
   ---------------------------------------------------------- */
async function checkBack(): Promise<void> {
    console.log("\n  — Zurück zu Discord —");

    const GUILD = "1162553851187040326";
    const CHANNEL = "1566198775415046234";
    const client = Client();
    const withPlace = EpicLinkToken(client, TokenOf(EpicLinkURL(client, USER, Date.now(), false, `${GUILD}/${CHANNEL}`)));
    const dm = EpicLinkToken(client, TokenOf(EpicLinkURL(client, USER, Date.now(), false, `@me/${CHANNEL}`)));
    const junk = EpicLinkToken(client, TokenOf(EpicLinkURL(client, USER, Date.now(), false, "javascript:alert(1)")));

    check("Token trägt Server und Kanal", withPlace?.place === `${GUILD}/${CHANNEL}`);
    check("DM-Kanal geht auch", dm?.place === `@me/${CHANNEL}`);
    check("Unsinn als Ort wird verworfen", junk !== null && junk.place === null);
    check("App-Link und Browser-Link in denselben Kanal", DiscordBack(`${GUILD}/${CHANNEL}`).app === `discord://-/channels/${GUILD}/${CHANNEL}` && DiscordBack(`${GUILD}/${CHANNEL}`).web === `https://discord.com/channels/${GUILD}/${CHANNEL}`);
    check("Ohne Ort: Discord-Start, kein discord.com/app", DiscordBack(null).app === "discord://-/channels/@me" && !DiscordBack(null).web.endsWith("/app"));

    const okEpic = (): void => void FakeEpic({ body: { access_token: "at", account_id: ACCOUNT } }, { body: [{ accountId: ACCOUNT, displayName: "Nova Lukas" }] });
    const fresh = Client();

    okEpic();
    const done = await Callback(fresh, { code: "c", state: "n1" }, `n1|${TokenOf(EpicLinkURL(fresh, USER, Date.now(), false, `${GUILD}/${CHANNEL}`))}`);

    check("Fertig-Seite: „Zurück zu Discord“ öffnet die App im Kanal", done.body.includes(`href="discord://-/channels/${GUILD}/${CHANNEL}"`) && !done.body.includes("discord.com/app"));
    check("Fertig-Seite: Browser-Knopf in denselben Kanal", done.body.includes(`href="https://discord.com/channels/${GUILD}/${CHANNEL}"`));

    const swapLink = /href="([^"]*&amp;go=1)"/.exec(done.body)?.[1]?.replaceAll("&amp;", "&") ?? "";

    check("Wechsel-Knopf behält den Kanal", EpicLinkToken(fresh, new URL(swapLink, "http://localhost:3000").searchParams.get("t"))?.place === `${GUILD}/${CHANNEL}`);

    const cancelled = await Callback(Client(), { error: "access_denied", state: "n1" }, `n1|${TokenOf(EpicLinkURL(Client(), USER, Date.now(), false, `${GUILD}/${CHANNEL}`))}`);

    check("Absage: ebenfalls zurück in den Kanal", cancelled.body.includes(`href="discord://-/channels/${GUILD}/${CHANNEL}"`));
}

/* ----------------------------------------------------------
   Befunde aus dem Review von d4f1395
   ---------------------------------------------------------- */
async function checkReview(): Promise<void> {
    console.log("\n  — Review —");

    // 1: go=1 von außen springt nicht mehr an der Bestätigung vorbei.
    const client = Client();
    const sealed = TokenOf(EpicLinkURL(client, USER));

    for (const site of ["cross-site", "none", "same-site", undefined]) {
        const reply = Reply();

        await new EpicLink(client).Handle({ query: { t: sealed, go: "1" }, headers: site ? { "sec-fetch-site": site } : {} } as never, reply as never);
        check(`go=1 mit Sec-Fetch-Site ${site ?? "(fehlt)"}: Bestätigungsseite statt Epic`, reply.statusCode === 200 && reply.location === null && reply.body.includes("Weiter zu Epic Games"), `${reply.statusCode} ${reply.location}`);
    }

    // 2: Der @Name steht neben dem frei wählbaren Anzeigenamen.
    const joe = Client([], { users: { fetch: async (id: string) => ({ id, username: "mecrytv", globalName: "Joe", displayAvatarURL: () => "https://cdn.discordapp.com/a.png" }) } });
    const confirm = Reply();

    await new EpicLink(joe).Handle({ query: { t: TokenOf(EpicLinkURL(joe, USER)) }, headers: {} } as never, confirm as never);
    check("Bestätigung zeigt Anzeigename und @Name", confirm.body.includes("Joe (@mecrytv)"), confirm.body.slice(0, 300));

    // 3: Link schreibt ohne Upsert - erstes Verbinden ist ein INSERT, das bei uq_account wirft.
    const writes: string[] = [];
    const fake = (row: object | null) =>
        ({
            On: async () => row,
            Insert: async () => void writes.push("insert"),
            Update: async () => void writes.push("update"),
        }) as unknown as PlayerAccount;

    await PlayerAccount.prototype.Link.call(fake(null), USER, "epic", ACCOUNT, "Neu", true);
    await PlayerAccount.prototype.Link.call(fake({ user_id: USER }), USER, "epic", ACCOUNT, "Neu", true);
    check("Link: neu ist INSERT, vorhanden ist UPDATE (kein ON DUPLICATE KEY)", writes.join(",") === "insert,update", writes.join(","));

    // 4 und 5: Wechsel auf ein anderes Konto räumt Ränge und Rang-Rollen ab, dasselbe Konto nicht.
    const OTHER_ACCOUNT = "cccccccccccccccccccccccccccccccc";
    const swapped = Client([{ user_id: USER, account_id: ACCOUNT, display_name: "Alt", changed_at: new Date() }]);

    await EpicAdopt(swapped, USER, { accountId: OTHER_ACCOUNT, displayName: "Neu" });
    check("Anderes Konto: alte Ränge gelöscht, Rang-Rollen ab", swapped.calls.includes("clear") && swapped.calls.includes("strip"), swapped.calls.join(", "));

    const same = Client([{ user_id: USER, account_id: ACCOUNT, display_name: "Alt", changed_at: new Date() }]);

    await EpicAdopt(same, USER, { accountId: ACCOUNT, displayName: "Neu" });
    check("Dasselbe Konto: Ränge und Rollen bleiben", !same.calls.includes("clear") && !same.calls.includes("strip"), same.calls.join(", "));

    const first = Client();

    await EpicAdopt(first, USER, { accountId: ACCOUNT, displayName: "Neu" });
    check("Erstes Verbinden: nichts abzuräumen", !first.calls.includes("clear") && !first.calls.includes("strip"), first.calls.join(", "));
}

async function main(): Promise<void> {
    const original = globalThis.fetch;

    try {
        checkToken();
        await checkExchange();
        await checkAdopt();
        await checkPages();
        await checkCallback();
        await checkSwap();
        await checkBack();
        await checkReview();
    } finally {
        globalThis.fetch = original;
    }

    console.log(failures > 0 ? `\n  ${failures} Prüfung(en) fehlgeschlagen.\n` : "\n  Alles ok.\n");
    process.exit(failures > 0 ? 1 : 0);
}

void main();
