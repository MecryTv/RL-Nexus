/**
 * Prüft die Dashboard-Routen ohne Discord-Login: startet nur den Fastify-Server,
 * klopft jede Route ab und beendet sich mit Exit-Code 1, sobald etwas nicht stimmt.
 *
 *   npm run check:dashboard
 *
 * Absichtlich ohne Test-Framework - der Bot hat keins, und ein Durchlauf reicht,
 * um Login-Weiche, Pfadschutz und State-Prüfung abzusichern.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import BotClient from "../client/BotClient";
import { SNOWFLAKE } from "../constants/Discord";
import { MAX_IMAGE_BYTES } from "../constants/Gallery";
import { PLACEHOLDER_KEYS } from "../constants/Placeholders";
import { ErrorInfo, WantsPage } from "../utils/errorpage";
import { MODULE_IDS, PERMANENT_MODULES } from "../constants/Modules";
import { AdminStatus, AskAdmin, BackupCall } from "../routes/DashboardApiBackups";
import { DASHBOARD_HOME, DASHBOARD_PATH, DISCORD_EPOCH, OAUTH_SCOPES, SESSION_COOKIE } from "../constants/Dashboard";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import DashboardService, {
    AccessWithoutDatabase,
    BETA_ERRORS,
    BetaGate,
    DisplayGroup,
    EscapeHtml,
    LockPlaceholders,
    MaintenanceOf,
    MaintenanceOpenPath,
    MaintenanceDayClock,
    MaintenancePlaceholders,
    MfaRequired,
    SchemaMissing,
    ShopDecision,
    ShopStatusLines,
    type IShopGrantRow,
    type IShopStatusRow,
} from "../services/DashboardService";
import { CodeFromForm, RedeemAtAdmin } from "../routes/DashboardBeta";
import IDashboardGuild, { DashboardRole } from "../interfaces/services/dashboard/IDashboardGuild";
import { DashboardGroup } from "../interfaces/services/dashboard/IDashboardUser";
import { Open, Seal } from "../utils/seal";

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Der Pfad, unter dem das Dashboard haengt.
 *
 * Der Check startet den Server im eigenen Prozess und nimmt damit denselben
 * Pfad wie er: ohne Schalter die Wurzel (so laeuft es auf
 * dashboard.nexus-emb.de), mit "--dev" das Praefix /dashboard. Beides ist
 * pruefenswert, deshalb steht hier eine Variable und keine feste Zeichenkette.
 *
 *   npm run check:dashboard
 *   npm run check:dashboard -- --dev
 */
const P = DASHBOARD_PATH;
const HOME = DASHBOARD_HOME;
const MANUAL = { redirect: "manual" as const };

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/**
 * Schickt eine originalgetreue Antwort von /users/@me/guilds?with_counts=true durch
 * den produktiven Mapping-Code. Das sind keine Anzeigedaten, sondern die Form, die
 * Discord wirklich liefert - geprüft wird, was DashboardService daraus macht:
 * Rechte-Bits, Erstelldatum aus der Snowflake, Mitgliederzahl und die Filterung.
 */
async function checkMapping(client: BotClient): Promise<void> {
    console.log("\n  — Abbildung der Discord-Antwort —");

    const made = Date.UTC(2021, 2, 15, 12, 0, 0);
    const snowflake = ((BigInt(made) - BigInt(DISCORD_EPOCH)) << 22n).toString();

    // permissions kommt bei Discord immer als Dezimal-String.
    const response = [
        { id: snowflake, name: "Owner Server", icon: "a_abc123", owner: true, permissions: "1071698660929", approximate_member_count: 18420 },
        { id: "934857203948572034", name: "Admin Server", icon: "def456", owner: false, permissions: "8", approximate_member_count: 9310 },
        { id: "712394857203948573", name: "Manage Server", icon: null, owner: false, permissions: "32", approximate_member_count: 120 },
        { id: "645738291047562930", name: "Nur Mitglied", icon: null, owner: false, permissions: "3072", approximate_member_count: 5 },
    ];

    // So sieht die Antwort von /users/@me/guilds/{id}/member aus (Scope guilds.members.read).
    const member = { nick: "Mecry", joined_at: "2022-06-01T10:15:00.000000+00:00", roles: ["1", "2", "3"] };

    const original = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

        if (url.includes("/member")) return json(member);
        if (url.includes("/users/@me/guilds")) return json(response);

        return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const session: IDashboardSession = {
        id: "check-session",
        userId: "1059621019947634739",
        username: "Check",
        avatar: null,
        accessToken: "check-token",
        mfa: true,
        expiresAt: Date.now() + 60_000,
    };

    let payload;
    let detail;
    let fremd;

    try {
        payload = await client.dashboardService.Payload(session);
        detail = await client.dashboardService.Detail(session, snowflake);
        fremd = await client.dashboardService.Detail(session, "645738291047562930");
    } finally {
        globalThis.fetch = original;
    }

    if (!payload) {
        check("Payload wurde gebaut", false, "null");
        return;
    }

    const cards = payload.guilds;
    const owner = cards.find((guild) => guild.name === "Owner Server");

    check("Server ohne Rechte fliegt raus", cards.length === 3 && !cards.some((g) => g.name === "Nur Mitglied"), `${cards.length} Karten: ${cards.map((g) => g.name).join(", ")}`);
    check("Owner wird als Owner erkannt", owner?.role === "Owner", String(owner?.role));
    check("ADMINISTRATOR zählt als Admin", cards.find((g) => g.name === "Admin Server")?.role === "Admin");
    check("MANAGE_GUILD zählt als Admin", cards.find((g) => g.name === "Manage Server")?.role === "Admin");
    check("Alle gelisteten dürfen bearbeiten", cards.every((guild) => guild.canManage));
    check("Mitgliederzahl kommt aus der Antwort", owner?.members === 18420, String(owner?.members));
    check("Erstelldatum stammt aus der Snowflake", owner?.created === new Date(made).toISOString(), String(owner?.created));
    check("Animiertes Icon wird als .gif verlinkt", owner?.icon?.includes("/a_abc123.gif") === true, String(owner?.icon));
    check("Statisches Icon wird als .png verlinkt", cards.find((g) => g.name === "Admin Server")?.icon?.includes("/def456.png") === true);
    check("Server ohne Icon hat kein Bild", cards.find((g) => g.name === "Manage Server")?.icon === null);
    check("Initialen werden gebildet", owner?.tag === "OS", String(owner?.tag));
    check("Ohne Bot ist kein Server aktiv", cards.every((guild) => !guild.active));
    // Ohne Mitgliederliste darf keine Aufteilung in Menschen und Bots entstehen.
    check("Ohne Mitgliederliste bleibt die Bot-Zahl leer", cards.every((guild) => guild.bots === null));
    check("Teams und Module bleiben leer", cards.every((guild) => guild.teams === 0 && guild.modules.length === 0));
    check("Nach Mitgliedern sortiert", cards[0].members >= cards[1].members && cards[1].members >= cards[2].members, cards.map((g) => g.members).join(" > "));

    console.log("\n  — Detailseite (guilds.members.read) —");

    check("Detail liefert den Server", detail?.guild.name === "Owner Server", String(detail?.guild.name));
    check("Nickname kommt aus dem Member-Objekt", detail?.member?.nick === "Mecry", String(detail?.member?.nick));
    check("Beitrittsdatum wird übernommen", detail?.member?.joinedAt?.startsWith("2022-06-01") === true, String(detail?.member?.joinedAt));
    check("Rollen werden gezählt", detail?.member?.roles === 3, String(detail?.member?.roles));
    check("Ohne Bot gibt es keine Serverzahlen", detail?.server === null, JSON.stringify(detail?.server));
    check("Fremder Server bleibt verborgen", fremd === null, JSON.stringify(fremd));
}

/**
 * Eine Seite fragt mehrere Routen auf einmal ab, und jede braucht die Serverliste.
 * Discord antwortet auf den zweiten gleichzeitigen Abruf mit 429 - also teilen sich
 * alle einen Abruf, und nach einem 429 wartet der Bot die genannte Zeit ab.
 */
async function checkRateLimit(client: BotClient): Promise<void> {
    console.log("\n  — Serverliste: ein Abruf für alle, 429 abwarten —");

    const original = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);

        if (!url.includes("/users/@me/guilds")) return new Response("{}", { status: 404 });

        calls++;

        // Der erste Abruf läuft in die Bremse, der zweite klappt.
        if (calls === 1) return new Response(JSON.stringify({ message: "You are being rate limited.", retry_after: 0.05, global: false }), { status: 429 });

        return new Response(JSON.stringify([{ id: "934857203948572034", name: "Admin Server", icon: null, owner: true, permissions: "8" }]), {
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;

    const session: IDashboardSession = {
        id: "check-session-rate",
        userId: "1059621019947634739",
        username: "Check",
        avatar: null,
        accessToken: "check-token",
        mfa: true,
        expiresAt: Date.now() + 60_000,
    };

    try {
        const pages = await Promise.all(Array.from({ length: 5 }, () => client.dashboardService.Payload(session)));

        check("Fünf gleichzeitige Anfragen, alle mit Serverliste", pages.every((page) => page.guilds.length === 1), pages.map((page) => page.guilds.length).join(","));
        check("Discord wurde nur einmal gefragt - plus einmal nach dem 429", calls === 2, `${calls} Abrufe`);
    } catch (error) {
        check("Nach einem kurzen 429 klappt es beim zweiten Versuch", false, String(error));
    } finally {
        globalThis.fetch = original;
    }
}

/**
 * Gruppen kommen jetzt aus der Datenbank - hier laeuft der Check ohne sie. Was
 * ohne Datenbank uebrig bleibt, muss trotzdem stimmen: Developer aus DEV_USER_IDs
 * und sonst Testphase. Die Gruppen mit Datenbank prueft npm run check:db.
 */
/**
 * Die Bezahlschranke (Plan 15): wer ohne Kauf hereinkommt, was abgelaufen
 * heißt, und welche Server ein Guardian ohne eigenen Zugang noch sieht.
 * Ohne Datenbank: Die Regel ist eine reine Funktion, Zugang und Owner werden
 * für den Filter ersetzt.
 */
async function checkPaywall(client: BotClient): Promise<void> {
    console.log("\n  — Bezahlschranke —");

    const now = new Date("2026-10-17T12:00:00Z");
    const HOUR = 3_600_000;
    const decide = (group: DashboardGroup, grants: IShopGrantRow[] = [], extra: { paywall?: boolean; banned?: boolean } = {}) =>
        ShopDecision({ paywall: extra.paywall ?? true, group, banned: extra.banned ?? false, grants, now });
    const grant = (changes: Partial<IShopGrantRow>): IShopGrantRow => ({
        source: "subscription",
        starts_at: new Date(now.getTime() - 30 * 24 * HOUR),
        ends_at: new Date(now.getTime() + 24 * HOUR),
        ended_at: null,
        cancel_at_period_end: 0,
        ...changes,
    });
    const NONE = { allowed: false, reason: "Du hast noch keinen Zugang." };

    check(
        "Administrator, Developer und Partner kommen ohne Kauf herein",
        (["administrator", "developer", "partner"] as const).every((group) => decide(group).allowed)
    );
    check("Premium und Testphase brauchen einen Zugang", JSON.stringify([decide("premium"), decide("testphase")]) === JSON.stringify([NONE, NONE]));
    check("Bezahlschranke aus: alle herein", decide("testphase", [], { paywall: false }).allowed);
    check("Laufendes Abo: herein", decide("testphase", [grant({})]).allowed);
    check("Abo vor 12 Stunden abgelaufen, nicht gekündigt: noch herein", decide("testphase", [grant({ ends_at: new Date(now.getTime() - 12 * HOUR) })]).allowed);
    check(
        "Gekündigtes Abo nach dem Ende: draußen",
        decide("testphase", [grant({ ends_at: new Date(now.getTime() - 12 * HOUR), cancel_at_period_end: 1 })]).reason === "Dein Abo ist beendet."
    );
    check(
        "Abgelaufener Test nennt den Tag",
        decide("testphase", [grant({ source: "trial", ends_at: new Date("2026-10-15T10:00:00Z") })]).reason === "Dein Test ist am 15.10.2026 abgelaufen.",
        decide("testphase", [grant({ source: "trial", ends_at: new Date("2026-10-15T10:00:00Z") })]).reason
    );
    check(
        "Beendetes Geschenk nennt den Tag des Endes",
        decide("testphase", [grant({ source: "gift", ended_at: new Date("2026-10-16T09:00:00Z") })]).reason === "Dein Zugang ist am 16.10.2026 abgelaufen."
    );
    check("Gesperrt schlägt laufenden Zugang", decide("testphase", [grant({})], { banned: true }).reason === "Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.");
    check("Laufender Kauf ist als Zugang aus dem Shop erkennbar, auch bei Schranke aus", decide("testphase", [grant({})], { paywall: false }).viaShop === true && decide("testphase", [], { paywall: false }).viaShop !== true);
    check("Freie Gruppe ohne Kauf ist kein Shop-Zugang", decide("partner").viaShop !== true);
    check(
        "Nur laufende Tests sind als Test erkennbar, mit Abo daneben nicht",
        decide("testphase", [grant({ source: "trial" })]).trial === true &&
            decide("testphase", [grant({ source: "trial" }), grant({})]).trial !== true &&
            decide("testphase", [grant({ source: "trial", ends_at: new Date(now.getTime() - HOUR) }), grant({})]).trial !== true
    );

    // Anzeige der Gruppe: Käufer sehen „Zugang“, Premium ohne Kauf ist Testphase, Guardian bleibt.
    const shop = { allowed: true, reason: "", viaShop: true };
    const none = { allowed: false, reason: "x" };
    const mod = [{ role: "Moderator" as DashboardRole, canManage: false }];
    const trial = { ...shop, trial: true };
    check("Anzeige: Käufer ohne Gruppe → Zugang", DisplayGroup("testphase", shop, [], true) === "zugang");
    check("Anzeige: Premium mit Kauf → Zugang, ohne → Testphase", DisplayGroup("premium", shop, [], true) === "zugang" && DisplayGroup("premium", none, [], true) === "testphase");
    check("Anzeige: ohne Kauf, aber Moderator → Guardian", DisplayGroup("testphase", none, mod, true) === "guardian" && DisplayGroup("premium", none, mod, true) === "guardian");
    check("Anzeige: Co-Admin ohne Verwalten zählt als Guardian", DisplayGroup("testphase", none, [{ role: "Admin", canManage: false }], true) === "guardian");
    check(
        "Anzeige: Administrator, Developer, Partner bleiben",
        (["administrator", "developer", "partner"] as const).every((group) => DisplayGroup(group, shop, mod, true) === group && DisplayGroup(group, shop, mod, false) === group)
    );
    check(
        "Free: ohne Schranke wird jeder ohne feste Gruppe Free",
        DisplayGroup("testphase", none, [], false) === "free" &&
            DisplayGroup("testphase", shop, [], false) === "free" &&
            DisplayGroup("premium", trial, [], false) === "free" &&
            DisplayGroup("testphase", none, mod, false) === "free"
    );
    check("Paid: nur Tests → Testphase, sonst Zugang", DisplayGroup("testphase", trial, mod, true) === "testphase" && DisplayGroup("premium", shop, mod, true) === "zugang");

    check("Gesperrt ist als Sperre erkennbar", decide("testphase", [], { banned: true }).banned === true && decide("testphase").banned !== true);
    check(
        "Zugang, der erst später beginnt, nennt den Beginn",
        decide("testphase", [grant({ source: "one_time", starts_at: new Date("2026-10-20T08:00:00Z"), ends_at: new Date("2026-11-20T08:00:00Z") })]).reason === "Dein Zugang beginnt am 20.10.2026.",
        decide("testphase", [grant({ source: "one_time", starts_at: new Date("2026-10-20T08:00:00Z"), ends_at: new Date("2026-11-20T08:00:00Z") })]).reason
    );

    const site = "https://nexus-emb.de";
    const open = LockPlaceholders({ allowed: false, reason: "Du hast noch keinen Zugang.", banned: false });
    const banned = LockPlaceholders({ allowed: false, reason: "Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.", banned: true });
    check("Sperrseite ohne Zugang: zur Preisseite, mit Hinweis nach dem Kauf", open.GO_PATH === "/preise" && open.GO_TEXT === "Zugang holen" && open.HINT.includes("Gerade gekauft"));
    check("Sperrseite bei Sperre: zum Support, kein Kauf-Hinweis", banned.GO_PATH === "/kontakt" && banned.GO_TEXT === "Support kontaktieren" && banned.HINT === "" && !banned.REASON.includes("Mit einem Zugang"));
    check("Sperrseite: Grund maskiert", LockPlaceholders({ allowed: false, reason: "<b>x</b>", banned: false }).REASON.startsWith("&lt;b&gt;x&lt;/b&gt;"), site);

    const service = client.dashboardService;
    check("Ohne Datenbank: Zugang erlaubt (Schranke aus)", (await service.ShopAccess("1059621019947634739")).allowed);

    // Der Filter: Zugang und Owner ersetzen, die Liste kommt fertig herein.
    const card = (id: string, role: DashboardRole) => ({ id, name: id, role, canManage: role !== "Moderator", canModerate: true, canReview: true }) as unknown as IDashboardGuild;
    const list = [card("A", "Owner"), card("B", "Moderator"), card("C", "Moderator"), card("D", "Moderator"), card("E", "Admin"), card("F", "Admin")];
    const owners: Record<string, string | null> = { A: "person", B: "zahlt", C: "zahlt-nicht", D: null, E: "zahlt", F: "zahlt-nicht" };
    const savedAccess = service.ShopAccess.bind(service);
    const savedOwner = service.OwnerOf.bind(service);

    service.ShopAccess = async (userId: string) => ({ allowed: userId === "zahlt" || userId === "mit-zugang", reason: "x" });
    service.OwnerOf = (guildId: string) => owners[guildId] ?? null;

    try {
        const without = (await service.Paywalled("person", list)).map((guild) => guild.id).join(",");
        const withAccess = (await service.Paywalled("mit-zugang", list)).map((guild) => guild.id).join(",");

        const coAdmin = (await service.Paywalled("person", list)).find((guild) => guild.id === "E");

        check("Ohne Zugang: Moderator- und Admin-Server mit zahlendem Owner", without === "B,E", without);
        check("Co-Admin bei zahlendem Owner: nur Moderation, kein Verwalten", coAdmin?.canManage === false && coAdmin?.canModerate === true);
        check("Mit Zugang: die ganze Liste", withAccess === "A,B,C,D,E,F", withAccess);
        check(
            "Einzelner Server (Bewerbungen, Transcripts): eigener Zugang oder zahlender Owner",
            (await service.GuildAllowed("person", "B")) && !(await service.GuildAllowed("person", "C")) && (await service.GuildAllowed("mit-zugang", "C"))
        );
    } finally {
        service.ShopAccess = savedAccess;
        service.OwnerOf = savedOwner;
    }
}

/** Die Antwort auf den Knopf „Zugang anzeigen“ in der Shop-DM (src/events/shop/ShopButtons.ts). */
function checkShopStatus(): void {
    console.log("\n  — Knopf „Zugang anzeigen“ —");

    const now = new Date("2026-10-17T12:00:00Z");
    const DAY = 86_400_000;
    const later = new Date(now.getTime() + 30 * DAY);
    const unix = Math.floor(later.getTime() / 1000);
    const row = (changes: Partial<IShopStatusRow>): IShopStatusRow => ({
        source: "subscription",
        starts_at: new Date(now.getTime() - DAY),
        ends_at: later,
        ended_at: null,
        cancel_at_period_end: 0,
        title: "Monat",
        ...changes,
    });
    const one = (changes: Partial<IShopStatusRow>): string => ShopStatusLines([row(changes)], now).join("\n");

    check("Laufendes Abo: bis wann und dass es sich verlängert", one({}) === `**Monat** läuft bis <t:${unix}:D> · <t:${unix}:R> und verlängert sich dann.`, one({}));
    check("Gekündigtes Abo: endet", one({ cancel_at_period_end: 1 }) === `**Monat** ist gekündigt und endet <t:${unix}:D> · <t:${unix}:R>.`, one({ cancel_at_period_end: 1 }));
    check("Test", one({ source: "trial", title: null }) === `**Test** endet <t:${unix}:D> · <t:${unix}:R>.`, one({ source: "trial", title: null }));
    check("Unbegrenzter Einmalkauf", one({ source: "one_time", ends_at: null, title: "Für immer" }) === "**Für immer** läuft unbegrenzt.");
    check("Ohne Titel: Zugang", one({ source: "gift", title: null }).startsWith("**Zugang** läuft bis"), one({ source: "gift", title: null }));
    check("Abgelaufen oder noch nicht begonnen: nichts", ShopStatusLines([row({ ends_at: new Date(now.getTime() - 2 * DAY) }), row({ starts_at: later })], now).length === 0);
    check("Markdown im Titel bleibt Text", one({ title: "**x**" }).startsWith("**\\*\\*x\\*\\***"), one({ title: "**x**" }));
}

async function checkGroups(client: BotClient): Promise<void> {
    console.log("\n  — Gruppen ohne Datenbank —");

    const service = client.dashboardService;
    const saved = client.config.DEV_USER_IDs;

    client.config.DEV_USER_IDs = ["2"];

    try {
        check("Developer kommt aus DEV_USER_IDs", (await service.GroupOf("2")) === "developer");
        check("Unbekannte ID landet in der Testphase", (await service.GroupOf("999")) === "testphase");
        check("Ohne Datenbank ist nur der Developer Staff", (await service.IsStaff("2")) && !(await service.IsStaff("999")));
    } finally {
        client.config.DEV_USER_IDs = saved;
    }
}

/**
 * Ein falsch geschriebener Scope fällt sonst nirgends auf: der Bot baut die URL
 * klaglos, und erst Discord antwortet dem Nutzer mit "Invalid scope". Genau so ist
 * "guilds.member.read" statt "guilds.members.read" durchgerutscht.
 */
const DISCORD_SCOPES = new Set([
    "activities.read",
    "activities.write",
    "applications.builds.read",
    "applications.builds.upload",
    "applications.commands",
    "applications.commands.permissions.update",
    "applications.commands.update",
    "applications.entitlements",
    "applications.store.update",
    "bot",
    "connections",
    "dm_channels.read",
    "email",
    "gdm.join",
    "guilds",
    "guilds.join",
    "guilds.members.read",
    "identify",
    "messages.read",
    "relationships.read",
    "role_connections.write",
    "rpc",
    "rpc.activities.write",
    "rpc.notifications.read",
    "rpc.voice.read",
    "rpc.voice.write",
    "voice",
    "webhook.incoming",
]);

function checkScopes(): void {
    const unknown = OAUTH_SCOPES.filter((scope) => !DISCORD_SCOPES.has(scope));

    check(
        "Alle Scopes kennt Discord wirklich",
        unknown.length === 0,
        unknown.length > 0 ? `${unknown.join(", ")} — Discord antwortet darauf mit "Invalid scope"` : ""
    );
}

/**
 * Die Zwei-Faktor-Pflicht am Tor selbst: Exchange() tauscht den Code gegen einen
 * Token und holt das Konto. Genau dort faellt die Entscheidung.
 *
 * Discord wird dafuer nachgestellt - eine echte Anmeldung laesst sich in einem
 * Pruefskript nicht durchspielen, die Bedingung dahinter schon.
 */
async function checkMfa(client: BotClient): Promise<void> {
    console.log("\n  — Zwei-Faktor-Pflicht —");

    const original = globalThis.fetch;

    /** Stellt Discord nach: Token-Tausch und /users/@me mit dem gegebenen Konto. */
    function fakeDiscord(user: Record<string, unknown>): void {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            const json = (body: unknown) =>
                new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

            if (url.includes("/oauth2/token")) return json({ access_token: "token", expires_in: 604800 });
            if (url.includes("/users/@me")) return json(user);

            return new Response("{}", { status: 404 });
        }) as typeof fetch;
    }

    const konto = { id: "1059621019947634739", username: "check", global_name: "Check", avatar: null };

    async function versuch(mfa: unknown): Promise<string> {
        fakeDiscord(mfa === undefined ? konto : { ...konto, mfa_enabled: mfa });

        try {
            const session = await client.dashboardService.Exchange("code");

            return session.mfa === true ? "angemeldet" : "angemeldet ohne Merkmal";
        } catch (error) {
            return error instanceof MfaRequired ? "abgewiesen" : `Fehler: ${String(error)}`;
        }
    }

    try {
        check("Konto mit Zwei-Faktor kommt herein", (await versuch(true)) === "angemeldet");
        check("Konto ohne Zwei-Faktor wird abgewiesen", (await versuch(false)) === "abgewiesen");
        check(
            "Fehlendes Feld gilt als 'nicht bestätigt'",
            (await versuch(undefined)) === "abgewiesen",
            "bei einer Regel, die Zugang gewährt, ist die vorsichtige Auslegung die richtige"
        );
        check("Ein 'true' als Text zählt nicht", (await versuch("true")) === "abgewiesen");
    } finally {
        globalThis.fetch = original;
    }
}

/**
 * Der Kern der Sache: die Sitzung steckt verschlüsselt im Cookie, nicht in einem
 * Speicher im Prozess. Genau das wird hier nachgestellt - ein zweiter, frischer
 * DashboardService ist dasselbe wie ein neu gestarteter Bot.
 */
function checkSessions(client: BotClient): void {
    console.log("\n  — Sitzung im Cookie —");

    const service = client.dashboardService;
    const secret = client.config.SERVER_JWT_SECRET;

    const session: IDashboardSession = {
        id: "sitzung-1",
        userId: "1059621019947634739",
        username: "Check",
        avatar: null,
        accessToken: "geheimer-discord-token",
        mfa: true,
        expiresAt: Date.now() + 60_000,
    };

    const cookie = service.Sign(session);

    check("Cookie enthält den Token nicht im Klartext", !cookie.includes(session.accessToken), cookie.slice(0, 40));
    check("Cookie passt in ein Cookie (< 4096 Byte)", Buffer.byteLength(cookie) < 4096, `${Buffer.byteLength(cookie)} Byte`);

    const wieder = service.Session(cookie);
    check("Eigene Sitzung wird gelesen", wieder?.userId === session.userId && wieder?.accessToken === session.accessToken);

    // Ein frischer Service hat leere Caches - genau wie der Bot nach dem Neustart.
    const nachNeustart = new DashboardService(client).Session(cookie);
    check("Sitzung überlebt einen Neustart", nachNeustart?.userId === session.userId, JSON.stringify(nachNeustart));

    // Ein Byte im Chiffrat kippen: GCM muss das bemerken.
    const raw = Buffer.from(cookie, "base64url");
    raw[raw.length - 1] ^= 0x01;
    check("Verändertes Cookie wird abgewiesen", service.Session(raw.toString("base64url")) === null);

    check("Fremdes Secret öffnet nichts", Open(cookie, `${secret}-anders`) === null);
    check("Müll im Cookie ergibt keine Sitzung", service.Session("nicht-mal-base64!!") === null);
    check("Leeres Cookie ergibt keine Sitzung", service.Session("") === null && service.Session(undefined) === null);

    const abgelaufen = Seal({ ...session, expiresAt: Date.now() - 1000 }, secret);
    check("Abgelaufene Sitzung wird abgewiesen", service.Session(abgelaufen) === null);

    // Zwei-Faktor-Pflicht. Das Merkmal steht in der Sitzung, weil sonst jeder
    // Seitenaufruf Discord danach fragen muesste - hier wird geprueft, dass es
    // auch wirklich verlangt wird und nicht nur mitgeschrieben.
    const ohneMfa = Seal({ ...session, mfa: false }, secret);
    check("Sitzung ohne Zwei-Faktor wird abgewiesen", service.Session(ohneMfa) === null);

    const { mfa: _mfa, ...ohneMerkmal } = session;
    check(
        "Cookie von vor der Pflicht wird abgewiesen",
        service.Session(Seal(ohneMerkmal, secret)) === null,
        "sonst liefe die Regel sieben Tage an allen Angemeldeten vorbei"
    );

    const luecke = Seal({ id: "x", userId: "y" }, secret);
    check("Unvollständige Sitzung wird abgewiesen", service.Session(luecke) === null);

    // Cookies von vor dem "email"-Scope tragen weder handle noch email. Die
    // dürfen weiterlaufen, sonst fliegt beim Ausrollen jeder Angemeldete raus.
    const alt = Seal({ ...session, handle: undefined, email: undefined }, secret);
    check("Sitzung ohne handle und email bleibt gültig", service.Session(alt)?.userId === session.userId);
}

/**
 * Live-Listen im Dashboard (core/ResourceDiff.ts): ein Kanal, der in Discord
 * entsteht, verschwindet oder umbenannt wird, landet richtig in den Daten der
 * Seiten und in offenen Auswahlfeldern - ohne dass Gewähltes still wechselt
 * oder absichtlich Weggelassenes zurückkommt.
 */
async function checkLiveLists(): Promise<void> {
    type Item = { id: string; name: string };
    type Option = { value: string; text: string; selected: boolean };
    type Step = { op: "drop" | "text" | "add"; value: string; text?: string; before?: string | null; after?: string | null };
    type Known = Map<string, { kind: string; name: string }>;

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "core", "ResourceDiff.ts");

    if (!existsSync(file)) return check("ResourceDiff.ts ist da", false, file);

    const diff = (await import(pathToFileURL(file).href)) as {
        learn: (known: Known, bag: Record<string, Item[]>) => void;
        mergeList: (list: Item[], fresh: Item[], known: Known) => void;
        planSelect: (options: Option[], known: Known, fresh: Record<string, Item[]>) => Step[];
        settle: (known: Known, fresh: Record<string, Item[]>) => void;
    };

    // Vorher: allgemein, clips, team; die Bühne "talk" hat die Seite nie bekommen.
    const before = { channels: [{ id: "1", name: "allgemein" }, { id: "2", name: "clips" }, { id: "3", name: "team" }], voice: [{ id: "8", name: "Lobby" }] };
    // Nachher: "clips" heißt "highlights", "team" ist weg, "news" ist neu und steht zwischen den beiden ersten.
    const fresh = {
        channels: [{ id: "1", name: "allgemein" }, { id: "4", name: "news" }, { id: "2", name: "highlights" }],
        voice: [{ id: "8", name: "Lobby" }, { id: "9", name: "talk" }],
    };
    const known: Known = new Map();

    diff.learn(known, before);
    known.set("9", { kind: "voice", name: "talk" });

    const list = structuredClone(before.channels);

    diff.mergeList(list, fresh.channels, known);
    check("Liste: der neue Kanal steht an seiner Stelle", list.map((item) => item.id).join() === "1,4,2", list.map((item) => item.id).join());
    check("Liste: umbenannt heißt er neu", list.find((item) => item.id === "2")?.name === "highlights");

    const voice = structuredClone(before.voice);

    diff.mergeList(voice, fresh.voice, known);
    check("Liste: was die Route wegließ, kommt nicht zurück", voice.length === 1, JSON.stringify(voice));

    // Ein Auswahlfeld mit leerem Eintrag vorn; "team" ist gerade gewählt.
    const options: Option[] = [
        { value: "", text: "— kein Kanal —", selected: false },
        { value: "1", text: "# allgemein", selected: false },
        { value: "2", text: "# clips", selected: false },
        { value: "3", text: "# team", selected: true },
    ];
    const steps = diff.planSelect(options, known, fresh);
    const add = steps.find((step) => step.op === "add");

    check("Feld: neuer Kanal im selben Format", add?.value === "4" && add.text === "# news", JSON.stringify(add));
    check("Feld: und vor dem, der danach kommt", add?.before === "2", JSON.stringify(add));
    check("Feld: umbenannt", steps.some((step) => step.op === "text" && step.value === "2" && step.text === "# highlights"));
    check("Feld: Gewähltes bleibt, mit Hinweis", steps.some((step) => step.op === "text" && step.value === "3" && step.text === "# team (gelöscht)"));
    check("Feld: der leere Eintrag bleibt unberührt", !steps.some((step) => step.value === ""));

    const unselected = diff.planSelect(options.map((option) => ({ ...option, selected: false })), known, fresh);

    check("Feld: Gelöschtes fällt raus, wenn es nicht gewählt ist", unselected.some((step) => step.op === "drop" && step.value === "3"));

    // Ein Rollen-Feld ohne die schon gewählte Rolle: sie darf nicht zurückkommen.
    const roles = { roles: [{ id: "20", name: "Captain" }, { id: "21", name: "Coach" }] };

    diff.learn(known, roles);
    check(
        "Feld: schon Gewähltes kommt nicht doppelt",
        diff.planSelect([{ value: "", text: "+ Rolle hinzufügen", selected: true }, { value: "21", text: "@Coach", selected: false }], known, roles).length === 0
    );
    check("Feld: ohne Kanäle bekommt es auch keinen", diff.planSelect([{ value: "", text: "— keine —", selected: true }], known, fresh).length === 0);
    check(
        "Feld: verschieden gebaute Einträge bekommen nichts Neues",
        !diff.planSelect([{ value: "1", text: "# allgemein", selected: false }, { value: "2", text: "clips (Text)", selected: false }], known, fresh).some((step) => step.op === "add")
    );

    // Drei neue: in Discords Reihenfolge, die beiden letzten hinter dem letzten vorhandenen. "highlights" kennt die Seite schon, es fehlt hier mit Absicht.
    const tail = { channels: [...fresh.channels, { id: "5", name: "a" }, { id: "6", name: "b" }] };
    const order = diff.planSelect([{ value: "1", text: "# allgemein", selected: true }], known, tail).filter((step) => step.op === "add");
    const placed = ["1"];

    for (const step of order) {
        const at = step.before ? placed.indexOf(step.before) : step.after ? placed.indexOf(step.after) + 1 : placed.length;

        placed.splice(at, 0, step.value);
    }

    check("Feld: mehrere neue in der richtigen Reihenfolge", placed.join() === "1,4,5,6", placed.join());

    diff.settle(known, fresh);
    check("Danach: Gelöschtes ist vergessen, Neues bekannt", !known.has("3") && known.has("4") && known.get("2")?.name === "highlights");
}

/** Das Modul Backups reicht an die interne Schnittstelle des Admin Dashboards weiter. */
async function checkBackups(): Promise<void> {
    console.log("\n  — Backups: Weiterleitung an das Admin Dashboard —");

    const shape = (call: ReturnType<typeof BackupCall>): string => (typeof call === "string" ? call : `${call.method} ${call.path} ${call.timeout} ${JSON.stringify(call.body ?? null)}`);
    const plan = { enabled: true, every: "woche", weekday: 6, hour: 3, keep: 5 };

    check("Liste: GET auf die Wurzel, 10 s", shape(BackupCall("GET", {}, {})) === "GET  10000 null", shape(BackupCall("GET", {}, {})));
    check("Ansehen: GET /42", shape(BackupCall("GET", { backup: "42" }, {})) === "GET /42 10000 null", shape(BackupCall("GET", { backup: "42" }, {})));
    check(
        "Sichern: POST mit Notiz",
        shape(BackupCall("POST", {}, { action: "create", note: "vor dem Umbau" })) === 'POST  60000 {"note":"vor dem Umbau"}',
        shape(BackupCall("POST", {}, { action: "create", note: "vor dem Umbau" }))
    );
    check("Einstellung: PUT /plan mit dem Plan selbst", shape(BackupCall("POST", {}, { action: "plan", plan })) === `PUT /plan 10000 ${JSON.stringify(plan)}`, shape(BackupCall("POST", {}, { action: "plan", plan })));
    check("Löschen: DELETE /7", shape(BackupCall("POST", {}, { action: "delete", backup: 7 })) === "DELETE /7 10000 null", shape(BackupCall("POST", {}, { action: "delete", backup: 7 })));
    check(
        "Zurückladen: POST /7/restore, 60 s",
        shape(BackupCall("POST", {}, { action: "restore", backup: 7, areas: ["level"], confirm: "X" })) === 'POST /7/restore 60000 {"areas":["level"],"confirm":"X"}',
        shape(BackupCall("POST", {}, { action: "restore", backup: 7, areas: ["level"], confirm: "X" }))
    );
    check("Unbekannte Aktion ist ein Satz", typeof BackupCall("POST", {}, { action: "x" }) === "string");
    check("Kaputte ID ist ein Satz", typeof BackupCall("GET", { backup: "abc" }, {}) === "string" && typeof BackupCall("POST", {}, { action: "delete", backup: "1; DROP" }) === "string");

    const away = await AskAdmin("http://127.0.0.1:9", "check-".repeat(8), "1059621019947634739", { id: "1059621019947634739", name: "Check" }, "Check Server", { method: "GET", path: "", timeout: 2000 });
    // 502, nicht 503: Für 401, 403 und 503 zeigt das Bot-Dashboard feste Texte (core/Gallery.ts, FAILED) statt der Meldung.
    check(
        "Admin Dashboard nicht erreichbar: 502 mit Satz",
        away.status === 502 && (away.body as { error?: string }).error === "Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal.",
        JSON.stringify(away)
    );
    check("Antwort des Admin Dashboards: 401 und 5xx werden 502, der Rest bleibt", AdminStatus(401) === 502 && AdminStatus(503) === 502 && AdminStatus(409) === 409 && AdminStatus(404) === 404);

    // Ein Admin-Server, der antwortet, aber mit einem Fehler: 5xx-Texte bleiben drinnen, 409 kommt durch.
    const { createServer } = await import("node:http");
    const answers: Record<string, [number, string]> = {
        "/internal/backups/1059621019947634739": [503, "Die Datenbank rlnexus_backups fehlt, steht im README."],
        "/internal/backups/1059621019947634739/plan": [409, "Alle 10 Plätze sind belegt. Lösch erst ein altes Backup."],
    };
    const fakeAdmin = createServer((request, response) => {
        const [status, error] = answers[request.url ?? ""] ?? [404, "?"];
        response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error }));
    });
    await new Promise<void>((resolve) => fakeAdmin.listen(0, "127.0.0.1", resolve));
    const adminUrl = `http://127.0.0.1:${(fakeAdmin.address() as { port: number }).port}`;
    const leak = await AskAdmin(adminUrl, "check-".repeat(8), "1059621019947634739", { id: "1059621019947634739", name: "Check" }, "Check", { method: "GET", path: "", timeout: 2000 });
    const full = await AskAdmin(adminUrl, "check-".repeat(8), "1059621019947634739", { id: "1059621019947634739", name: "Check" }, "Check", { method: "PUT", path: "/plan", body: {}, timeout: 2000 });
    fakeAdmin.close();

    check(
        "Fehler des Admin Dashboards (5xx): eigener Satz statt Interna",
        leak.status === 502 && (leak.body as { error?: string }).error === "Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal.",
        JSON.stringify(leak)
    );
    check("Ablehnung mit Satz (409) kommt durch", full.status === 409 && (full.body as { error?: string }).error === "Alle 10 Plätze sind belegt. Lösch erst ein altes Backup.", JSON.stringify(full));

    check("Backups ist ein festes Modul", PERMANENT_MODULES.has("backups" as never));

    const unauth = await fetch(`${BASE}${P}/api/guild/1059621019947634739/backups`, MANUAL);
    check("Backups ohne Sitzung ist 401", unauth.status === 401, `${unauth.status}`);
}

/**
 * Beta Access (Plan 22): Im Beta-Modus kommt nur herein, wer einen Code
 * eingelöst hat, dazu Administrator und Developer. Eingelöst wird über das
 * Admin Dashboard, hier mit einem nachgestellten Admin-Server.
 */
async function checkBeta(client: BotClient): Promise<void> {
    console.log("\n  — Beta Access —");

    check("Beta aus: die Schranke spielt keine Rolle", BetaGate({ betaMode: false, group: "testphase", member: false }) === null);
    check(
        "Beta an: Administrator und Developer ohne Code",
        BetaGate({ betaMode: true, group: "administrator", member: false }) === null && BetaGate({ betaMode: true, group: "developer", member: false }) === null
    );

    const locked = BetaGate({ betaMode: true, group: "partner", member: false });
    const tester = BetaGate({ betaMode: true, group: "testphase", member: true });

    check("Beta an: ohne Code gesperrt, auch Partner", locked?.allowed === false && locked.beta === true, JSON.stringify(locked));
    check("Beta an: mit Code herein, egal ob Free oder Paid", tester?.allowed === true && tester.betaMember === true, JSON.stringify(tester));
    check(
        "Anzeige: Tester sind „Beta“, feste Gruppen bleiben",
        DisplayGroup("testphase", { allowed: true, reason: "", betaMember: true }, [], false) === "beta" &&
            DisplayGroup("premium", { allowed: true, reason: "", betaMember: true, viaShop: true }, [], true) === "beta" &&
            DisplayGroup("administrator", { allowed: true, reason: "", betaMember: true }, [], false) === "administrator"
    );

    const page = LockPlaceholders({ allowed: false, reason: "x", beta: true });

    check(
        "Sperrseite im Beta-Modus: Feld für den Code, kein Kauf",
        page.HINT.includes(`action="${P}/beta"`) && page.HINT.includes('enctype="text/plain"') && page.HINT.includes('name="code"') && page.GO_PATH === "/kontakt" && page.GO_CLASS === "erract" && !page.HINT.includes('role="alert"'),
        page.HINT
    );
    check("Sperrseite im Beta-Modus: der Fehler steht über dem Feld", LockPlaceholders({ allowed: false, reason: "x", beta: true }, BETA_ERRORS.falsch).HINT.includes(`role="alert">${BETA_ERRORS.falsch}`));
    check("Sperrseite im Beta-Modus: der Fehler wird maskiert", LockPlaceholders({ allowed: false, reason: "x", beta: true }, "<b>").HINT.includes("&lt;b&gt;"));

    // Antwortet die Datenbank nicht, bleibt die Beta im Zweifel zu (Entscheidung vom 24.10.2026).
    // Free und Paid bleiben offen wie bisher, Administrator und Developer kommen immer herein.
    const betaWasOn = AccessWithoutDatabase(true, "testphase");
    const unknown = AccessWithoutDatabase(null, null);

    check("Datenbank weg, Beta war an: gesperrt, ohne Code-Feld", betaWasOn.allowed === false && betaWasOn.unchecked === true && betaWasOn.beta !== true, JSON.stringify(betaWasOn));
    check("Datenbank weg, Modus noch nie gelesen: gesperrt", unknown.allowed === false && unknown.unchecked === true, JSON.stringify(unknown));
    check("Datenbank weg bei Free oder Paid: offen wie bisher", AccessWithoutDatabase(false, "testphase").allowed && AccessWithoutDatabase(false, null).allowed);
    check(
        "Datenbank weg: Administrator und Developer kommen herein",
        AccessWithoutDatabase(true, "administrator").allowed && AccessWithoutDatabase(null, "developer").allowed && !AccessWithoutDatabase(true, "partner").allowed
    );

    const unchecked = LockPlaceholders(betaWasOn);

    check(
        "Sperrseite ohne Datenbank: kein Code-Feld, kein Kauf",
        !unchecked.HINT.includes("<form") && unchecked.GO_PATH === "/kontakt" && unchecked.REASON === EscapeHtml(betaWasOn.reason),
        JSON.stringify(unchecked)
    );
    check(
        "Beta aus, wenn Spalte oder Tabelle fehlt (älteres Admin Dashboard), sonst ist es ein Aussetzer",
        SchemaMissing({ errno: 1054 }) && SchemaMissing({ errno: 1146 }) && !SchemaMissing({ errno: 45028 }) && !SchemaMissing(new Error("ECONNREFUSED")) && !SchemaMissing(null)
    );

    check(
        "Code aus dem Formular (text/plain)",
        CodeFromForm("code=NXB-7KQ4-M2XD\r\n") === "NXB-7KQ4-M2XD" && CodeFromForm("code= nxb 7kq4 \r\n") === "nxb 7kq4" && CodeFromForm({ code: "x" }) === "" && CodeFromForm("") === ""
    );

    // Ein Admin-Server, der das Token prüft und je nach Code antwortet.
    const { createServer } = await import("node:http");
    const fakeAdmin = createServer((request, response) => {
        let raw = "";
        request.on("data", (chunk) => (raw += chunk));
        request.on("end", () => {
            const token = String(request.headers.authorization ?? "").replace("Bearer ", "");
            const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString() || "{}") as { sub?: string; scope?: string[] };
            const code = (JSON.parse(raw || "{}") as { code?: string }).code;
            const [status, answer] =
                request.url !== "/internal/beta/redeem" || claims.sub !== "dashboard:1059621019947634739" || !claims.scope?.includes("beta")
                    ? [401, { error: "Nur für den Bot." }]
                    : code === "NXB-2222-2222"
                      ? [200, { ok: true }]
                      : code === "NXB-5555-5555"
                        ? [503, { error: "Datenbank weg" }]
                        : [400, { error: "Diesen Code gibt es nicht, oder er ist schon aufgebraucht." }];
            response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
        });
    });
    await new Promise<void>((resolve) => fakeAdmin.listen(0, "127.0.0.1", resolve));
    const adminUrl = `http://127.0.0.1:${(fakeAdmin.address() as { port: number }).port}`;
    const user = { id: "1059621019947634739", name: "Check" };
    const results = [
        await RedeemAtAdmin(adminUrl, "check-".repeat(8), user, "NXB-2222-2222"),
        await RedeemAtAdmin(adminUrl, "check-".repeat(8), user, "NXB-3333-3333"),
        await RedeemAtAdmin(adminUrl, "check-".repeat(8), user, "NXB-5555-5555"),
        await RedeemAtAdmin("http://127.0.0.1:9", "check-".repeat(8), user, "NXB-2222-2222"),
    ];
    fakeAdmin.close();

    check("Einlösen: gültig ok, falsch abgelehnt, Admin-Server kaputt oder weg heißt „weg“", results.join(",") === "ok,falsch,weg,weg", results.join(","));

    // Im Beta-Modus gesperrt: keine Server, auch nicht als Guardian bei einem Owner mit Zugang.
    const service = client.dashboardService;
    const savedAccess = service.ShopAccess.bind(service);
    const savedOwner = service.OwnerOf.bind(service);
    const card = (id: string, role: DashboardRole) => ({ id, name: id, role, canManage: role !== "Moderator", canModerate: true, canReview: true }) as unknown as IDashboardGuild;

    service.ShopAccess = async (userId: string) => (userId === "tester" ? { allowed: true, reason: "", betaMember: true } : { allowed: false, reason: "x", beta: true });
    service.OwnerOf = () => "tester";

    try {
        check("Beta gesperrt: keine Server, auch nicht als Guardian", (await service.Paywalled("person", [card("B", "Moderator")])).length === 0);
        check("Beta gesperrt: auch Bewerbungen und Transcripts nicht", !(await service.GuildAllowed("person", "B")));

        // Ohne Datenbank im Zweifel zu: auch dann kein Guardian, sonst käme man über den Owner herein.
        service.ShopAccess = async (userId: string) => (userId === "tester" ? { allowed: true, reason: "", betaMember: true } : { allowed: false, reason: "x", unchecked: true });
        check(
            "Datenbank weg in der Beta: auch kein Guardian über einen Owner mit Zugang",
            (await service.Paywalled("person", [card("B", "Moderator"), card("C", "Admin")])).length === 0 && !(await service.GuildAllowed("person", "B"))
        );
    } finally {
        service.ShopAccess = savedAccess;
        service.OwnerOf = savedOwner;
    }

    // Zusammen mit der Datenbank (nachgestellt): Modus aus shop_settings, Tester aus beta_members.
    const db = client.databaseService as unknown as { One: (sql: string, values?: unknown[]) => Promise<unknown> };
    const savedOne = db.One;
    const savedGroupOf = service.GroupOf.bind(service);
    const readyOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client.databaseService), "Ready");
    const configuredOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client.databaseService), "IsConfigured");
    const internals = service as unknown as { betaMode: unknown; paywall: unknown; lastBeta: unknown };
    let membersDown = false;

    Object.defineProperty(client.databaseService, "Ready", { configurable: true, get: () => true });
    Object.defineProperty(client.databaseService, "IsConfigured", { configurable: true, get: () => true });
    service.GroupOf = async (userId: string) => (userId === "1059621019947634744" ? "developer" : "testphase");
    db.One = async (sql: string, values: unknown[] = []) => {
        if (sql.includes("access_mode")) return { access_mode: "beta" };
        if (sql.includes("paywall")) return { paywall: 0 };
        if (sql.includes("beta_members")) {
            if (membersDown) throw new Error("Datenbank weg");
            return values[0] === "1059621019947634741" ? { user_id: values[0] } : null;
        }
        return null;
    };
    internals.betaMode = null;
    internals.paywall = null;

    try {
        const member = await service.ShopAccess("1059621019947634741");
        const stranger = await service.ShopAccess("1059621019947634742");

        membersDown = true;
        const blip = await service.ShopAccess("1059621019947634743");
        const developer = await service.ShopAccess("1059621019947634744");

        check("Beta mit Datenbank: Tester herein und als Beta erkennbar", member.allowed && member.betaMember === true, JSON.stringify(member));
        check("Beta mit Datenbank: ohne Code gesperrt", !stranger.allowed && stranger.beta === true, JSON.stringify(stranger));
        // Bis zum 24.10. ließ ein Aussetzer jeden herein. Jetzt bleibt die Beta im Zweifel zu.
        check("Beta mit Datenbank: Aussetzer beim Nachschlagen sperrt im Zweifel", blip.allowed === false && blip.unchecked === true, JSON.stringify(blip));
        check("Beta mit Datenbank: beim Aussetzer kommen Developer trotzdem herein", developer.allowed === true, JSON.stringify(developer));

        // Paid gelesen, danach fällt die Datenbank ganz aus: offen wie bisher.
        db.One = async (sql: string) => {
            if (sql.includes("access_mode")) return { access_mode: "paid" };
            if (sql.includes("paywall")) return { paywall: 1 };
            throw new Error("Datenbank weg");
        };
        internals.betaMode = null;
        internals.paywall = null;
        await service.ShopAccess("1059621019947634745");
        db.One = async () => {
            throw new Error("Datenbank weg");
        };
        internals.betaMode = null;
        internals.paywall = null;
        const paidDown = await service.ShopAccess("1059621019947634746");

        check("Paid gelesen, dann Datenbank weg: offen wie bisher", paidDown.allowed === true, JSON.stringify(paidDown));
    } finally {
        db.One = savedOne;
        service.GroupOf = savedGroupOf;
        delete (client.databaseService as unknown as Record<string, unknown>).Ready;
        delete (client.databaseService as unknown as Record<string, unknown>).IsConfigured;
        if (readyOf) Object.defineProperty(Object.getPrototypeOf(client.databaseService), "Ready", readyOf);
        if (configuredOf) Object.defineProperty(Object.getPrototypeOf(client.databaseService), "IsConfigured", configuredOf);
        internals.betaMode = null;
        internals.paywall = null;
        internals.lastBeta = null;
        for (const id of ["1059621019947634741", "1059621019947634742", "1059621019947634743", "1059621019947634744", "1059621019947634745", "1059621019947634746"]) service.ForgetAccess(id);
    }

    const foreign = await fetch(`${BASE}${P}/beta`, { method: "POST", headers: { "Content-Type": "text/plain", "Sec-Fetch-Site": "cross-site" }, body: "code=NXB-2222-2222", ...MANUAL });
    check("Einlösen von einer fremden Seite: abgelehnt", foreign.status === 403, `${foreign.status}`);

    const anonymous = await fetch(`${BASE}${P}/beta`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "code=NXB-2222-2222", ...MANUAL });
    check("Einlösen ohne Sitzung: zur Anmeldung", anonymous.status === 302 && String(anonymous.headers.get("location")).endsWith("/login"), `${anonymous.status} ${anonymous.headers.get("location")}`);
}

/**
 * Wartung des Bot-Dashboards (Plan 23): Der Bot liest site_maintenance und
 * stellt sich vor jede Anfrage. Administrator und Developer kommen durch.
 */
async function checkMaintenance(client: BotClient): Promise<void> {
    console.log("\n  — Wartung —");

    const now = new Date("2026-10-24T15:00:00Z");
    const row = { active: 1, reason: "Wir spielen ein Update ein.", started_at: new Date("2026-10-24T14:00:00Z"), ends_at: new Date("2026-10-24T16:00:00Z"), auto_end: 1 };

    check(
        "Wartung läuft: an, und nicht mit Haken über die Endzeit hinaus",
        MaintenanceOf(row, now)?.endsAt === "2026-10-24T16:00:00.000Z" &&
            MaintenanceOf({ ...row, active: 0 }, now) === null &&
            MaintenanceOf(row, new Date("2026-10-24T16:00:00Z")) === null &&
            MaintenanceOf({ ...row, auto_end: 0 }, new Date("2026-10-24T17:00:00Z")) !== null &&
            MaintenanceOf(null, now) === null
    );

    const open = [`${P}/assets/style.css`, "/images/gallery/1.webp", "/dcapi/health", `${P}/login`, `${P}/callback`, `${P}/logout`, `${P}/impressum`, `${P}/privacy`];
    const closed = [`${P}/`, `${P}/guild/1059621019947634739/backups`, `${P}/api/me`, `${P}/settings`];

    check(
        "Wartung: Assets, Bilder, /dcapi, Anmeldung und Rechtstexte bleiben offen",
        open.every(MaintenanceOpenPath) && !closed.some(MaintenanceOpenPath),
        [...open.filter((path) => !MaintenanceOpenPath(path)), ...closed.filter(MaintenanceOpenPath)].join(", ")
    );

    const placeholders = MaintenancePlaceholders(MaintenanceOf({ ...row, reason: "<b>Update</b>" }, now)!, now);

    check(
        "Wartungsseite: Grund maskiert, Zeitleiste mit Berliner Zeit",
        placeholders.REASON === "&lt;b&gt;Update&lt;/b&gt;" && placeholders.TIMELINE.includes("16:00") && placeholders.TIMELINE.includes("18:00") && placeholders.ETA === "",
        JSON.stringify(placeholders)
    );

    // Über Nacht: „Seit 18:05“ allein hieße heute 18:05.
    const overnight = MaintenancePlaceholders(MaintenanceOf({ ...row, started_at: new Date("2026-10-23T16:05:00Z"), ends_at: new Date("2026-10-25T08:00:00Z") }, now)!, now);

    check(
        "Wartungsseite: an einem anderen Tag mit Tag vor der Uhrzeit",
        overnight.TIMELINE.includes("Seit <b>gestern 18:05</b>") &&
            overnight.TIMELINE.includes("Zurück gegen <b>morgen 9:00</b>") &&
            MaintenanceDayClock("2026-10-31T08:00:00Z", now) === "31.10. 9:00" &&
            MaintenanceDayClock("2026-10-24T16:00:00Z", now) === "18:00",
        overnight.TIMELINE
    );

    // SendPage setzt die Platzhalter mit replaceAll ein: Ein „$&“ im Grund würde dort sonst zum Platzhalter selbst.
    const dollar = MaintenancePlaceholders(MaintenanceOf({ ...row, reason: "Rabatt $& weg, $1 auch" }, now)!, now);

    check("Wartungsseite: Ein $ im Grund bleibt ein $", !dollar.REASON.includes("$") && dollar.REASON.includes("&#36;&amp;"), dollar.REASON);

    const noEnd = MaintenancePlaceholders(MaintenanceOf({ ...row, reason: null, ends_at: null, auto_end: 0 }, now)!, now);

    check("Wartungsseite ohne Endzeit und Grund: fester Satz, keine Zeitleiste", noEnd.REASON === "Wir arbeiten gerade am System." && noEnd.TIMELINE === "" && noEnd.ETA.includes("Wie lange es dauert, steht noch nicht fest."), JSON.stringify(noEnd));

    // Über den laufenden Server, mit nachgestellter Wartung und Gruppe.
    const service = client.dashboardService;
    const savedMaintenance = service.Maintenance.bind(service);
    const savedGroupOf = service.GroupOf.bind(service);
    const developer = service.Sign({ id: "wartung-dev", userId: "1059621019947634750", username: "Dev", avatar: null, accessToken: "egal", mfa: true, expiresAt: Date.now() + 60_000 });
    const devCookie = { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(developer)}` };

    service.Maintenance = async () => MaintenanceOf(row, now);
    service.GroupOf = async (userId: string) => (userId === "1059621019947634750" ? "developer" : "testphase");

    try {
        const page = await fetch(`${BASE}${P}/`, { ...MANUAL, headers: { Accept: "text/html" } });
        const pageText = await page.text();
        const api = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json" } });
        const asset = await fetch(`${BASE}${P}/assets/style.css`, MANUAL);
        const login = await fetch(`${BASE}${P}/login`, MANUAL);
        const staff = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json", ...devCookie } });

        check("Wartung: Seiten zeigen die Wartungsseite mit 503", page.status === 503 && page.headers.get("retry-after") === "300" && pageText.includes("Wir sind gleich wieder da"), `${page.status}`);
        check("Wartung: API antwortet 503 mit Satz", api.status === 503 && (await api.json()).error === "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal.", `${api.status}`);
        check("Wartung: Assets und Anmeldung bleiben erreichbar", asset.status === 200 && login.status !== 503, `${asset.status} ${login.status}`);
        check("Wartung: Developer kommen durch", staff.status !== 503, `${staff.status}`);
        check("Wartungsseite: Link zur Anmeldung fürs Team", pageText.includes(`href="${P}/login"`));

        const expired = service.Sign({ id: "wartung-alt", userId: "1059621019947634750", username: "Dev", avatar: null, accessToken: "egal", mfa: true, expiresAt: Date.now() - 1_000 });
        const late = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json", Cookie: `${SESSION_COOKIE}=${encodeURIComponent(expired)}` } });

        service.GroupOf = async () => {
            throw new Error("Discord antwortet nicht");
        };

        const unknown = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json", ...devCookie } });

        service.GroupOf = async (userId: string) => (userId === "1059621019947634750" ? "developer" : "testphase");
        check("Wartung: abgelaufene Sitzung oder nicht prüfbare Gruppe zählt wie ein Nutzer", late.status === 503 && unknown.status === 503, `${late.status} ${unknown.status}`);

        // /api/me trägt die Wartung nur für Administrator und Developer: Für sie zeigt jede Seite den Hinweisstreifen.
        const originalFetch = globalThis.fetch;

        globalThis.fetch = (async (input: RequestInfo | URL) =>
            String(input).includes("/users/@me/guilds") ? new Response("[]", { headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 404 })) as typeof fetch;

        try {
            const session = (userId: string): IDashboardSession => ({ id: `wartung-${userId}`, userId, username: "Check", avatar: null, accessToken: "egal", mfa: true, expiresAt: Date.now() + 60_000 });
            const forDeveloper = await service.Payload(session("1059621019947634750"));
            const forUser = await service.Payload(session("1059621019947634751"));

            check(
                "/api/me: Wartung nur für Administrator und Developer",
                forDeveloper.maintenance?.reason === "Wir spielen ein Update ein." && forUser.maintenance === null,
                JSON.stringify([forDeveloper.maintenance, forUser.maintenance])
            );

            // Den Text für den Hinweisstreifen rechnet der Server: endet die Wartung morgen, steht das da.
            service.Maintenance = async () => MaintenanceOf({ ...row, started_at: new Date(), ends_at: new Date(Date.now() + 86_400_000) }, new Date());

            const tomorrow = (await service.Payload(session("1059621019947634750"))).maintenance;

            service.Maintenance = async () => MaintenanceOf(row, now);
            check("/api/me: Ende für den Hinweisstreifen mit Tag", tomorrow?.until?.startsWith("morgen ") === true, JSON.stringify(tomorrow));
        } finally {
            globalThis.fetch = originalFetch;
        }

        const app = await readFile(path.join(process.cwd(), "src", "dashboard", "client", "app.ts"), "utf8");

        check("Dashboard: jede Seite zeigt Admin und Dev den Hinweisstreifen (showMaintenance in app.ts)", /showMaintenance\(data\.maintenance/.test(app));

        const topbar = await readFile(path.join(process.cwd(), "src", "dashboard", "client", "layout", "Topbar.ts"), "utf8");

        check("Hinweisstreifen: Ende mit Tag aus /api/me (note.until), nicht nur die Uhrzeit", /note\.until/.test(topbar) && !/CLOCK\.format/.test(topbar));
    } finally {
        service.Maintenance = savedMaintenance;
        service.GroupOf = savedGroupOf;
    }

    // Die Hauptseite zeigt die Wartung selbst. Bliebe die alte Datei-Regel im
    // Container, sperrte sie bei jeder Wartung auch Rechtstexte und Vorschau.
    const websiteConf = await readFile(path.join(process.cwd(), "nginx", "container", "website.conf"), "utf8");

    check(
        "nginx der Hauptseite: /api/wartung geht ans Admin Dashboard, keine alte Datei-Regel mehr",
        /location = \/api\/wartung \{[^}]*proxy_pass \$rlnexus_admin\/public\/maintenance;/.test(websiteConf) && !websiteConf.includes("/srv/flags/wartung-webseite") && !websiteConf.includes("@rlnexus_wartung")
    );

    // Fehlt die Tabelle (Bot neuer als das Admin Dashboard), ist keine Wartung.
    const db = client.databaseService as unknown as { One: (sql: string) => Promise<unknown> };
    const savedOne = db.One;
    const readyOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client.databaseService), "Ready");
    const configuredOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client.databaseService), "IsConfigured");

    Object.defineProperty(client.databaseService, "Ready", { configurable: true, get: () => true });
    Object.defineProperty(client.databaseService, "IsConfigured", { configurable: true, get: () => true });
    db.One = async () => {
        throw Object.assign(new Error("Table 'site_maintenance' doesn't exist"), { errno: 1146 });
    };

    const cache = service as unknown as { maintenanceRow: { at: number; row: unknown } | null };

    try {
        cache.maintenanceRow = null;
        check("Wartung: ohne Tabelle keine Wartung", (await service.Maintenance()) === null);

        // Antwortet die Datenbank nicht, fragt nicht jede Anfrage von vorn: Jede wartete sonst auf ihr Zeitlimit.
        let queries = 0;

        db.One = async () => {
            queries++;
            throw Object.assign(new Error("Lost connection to server during query"), { errno: 2013 });
        };
        cache.maintenanceRow = { at: 0, row };

        const first = await service.Maintenance(now);
        const second = await service.Maintenance(now);

        check("Wartung: Datenbank weg, letzter Stand gilt und höchstens eine Abfrage alle 5 Sekunden", first !== null && second !== null && queries === 1, `${queries} Abfragen`);
    } finally {
        cache.maintenanceRow = null;
        db.One = savedOne;
        delete (client.databaseService as unknown as Record<string, unknown>).Ready;
        delete (client.databaseService as unknown as Record<string, unknown>).IsConfigured;
        if (readyOf) Object.defineProperty(Object.getPrototypeOf(client.databaseService), "Ready", readyOf);
        if (configuredOf) Object.defineProperty(Object.getPrototypeOf(client.databaseService), "IsConfigured", configuredOf);
    }
}

/** Serverfehler tragen die Fehler-ID des Guardian (Plan 24). */
async function checkErrorIds(client: BotClient): Promise<void> {
    console.log("\n  — Fehler-ID bei Serverfehlern —");

    const service = client.dashboardService;
    const saved = { payload: service.Payload.bind(service), maintenanceFor: service.MaintenanceFor.bind(service) };
    const session = service.Sign({ id: "fehler-id", userId: "1059621019947634751", username: "Check", avatar: null, accessToken: "egal", mfa: true, expiresAt: Date.now() + 60_000 });
    const cookie = { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` };
    const ID = /^NEXUS-\d{10}-[A-HJ-NP-Z2-9]{6}$/;

    service.Payload = async () => {
        throw new Error("check:dashboard Probe");
    };

    try {
        const api = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json", ...cookie } });
        const body = (await api.json()) as { error?: string; errorId?: string };

        check("Eine Route wirft: 500 mit Fehler-ID", api.status === 500 && ID.test(body.errorId ?? ""), `${api.status} ${JSON.stringify(body)}`);
    } finally {
        service.Payload = saved.payload;
    }

    // Ein Fehler vor der Route (hier im Haken der Wartung) landet auf der Fehlerseite.
    service.MaintenanceFor = async () => {
        throw new Error("check:dashboard Probe im Haken");
    };

    try {
        const page = await fetch(`${BASE}${P}/`, { ...MANUAL, headers: { Accept: "text/html" } });
        const html = await page.text();
        const json = await fetch(`${BASE}${P}/api/me`, { ...MANUAL, headers: { Accept: "application/json" } });
        const body = (await json.json()) as { errorId?: string };

        check("Fehlerseite: zeigt die Fehler-ID und dass das Team Bescheid weiß", page.status === 500 && /Fehler-ID <code>NEXUS-\d{10}-[A-HJ-NP-Z2-9]{6}<\/code>/.test(html) && html.includes("Das Team weiß schon Bescheid."), `${page.status}`);
        check("Auch als JSON mit Fehler-ID", json.status === 500 && ID.test(body.errorId ?? ""), JSON.stringify(body));
    } finally {
        service.MaintenanceFor = saved.maintenanceFor;
    }

    const missing = await fetch(`${BASE}${P}/gibt-es-nicht`, { ...MANUAL, headers: { Accept: "text/html" } });

    check("Ein 404 hat keine Fehler-ID", missing.status === 404 && !(await missing.text()).includes("Fehler-ID"));
}

/** Fehler aus dem Browser: Route mit Schalter und Grenzen (Plan 24). */
async function checkClientErrors(client: BotClient): Promise<void> {
    console.log("\n  — Fehler aus dem Browser —");

    const service = client.dashboardService;
    const session = service.Sign({ id: "browser-fehler", userId: "1059621019947634752", username: "Check", avatar: null, accessToken: "egal", mfa: true, expiresAt: Date.now() + 60_000 });
    const headers = { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", Cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` };
    const report = (body: Record<string, unknown>, extra: Record<string, string> = {}) =>
        fetch(`${BASE}${P}/api/report/error`, { ...MANUAL, method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
    const sample = (message: string) => ({ kind: "error", message, stack: `Error: ${message}\n    at a (https://x/assets/app.js:1:10)`, page: "/guild/1/levels", steps: ["14:02:10 Seite /guild/1/levels"], browser: "Firefox 140", screen: "1920×1080" });
    const before = process.env.ERROR_REPORTS_BROWSER;

    delete process.env.ERROR_REPORTS_BROWSER;

    try {
        check("Schalter aus: die Route gibt es nicht", (await report(sample("aus"))).status === 404);

        process.env.ERROR_REPORTS_BROWSER = "true";

        const first = await report(sample("check:dashboard Browser"));
        const id = ((await first.json()) as { errorId?: string }).errorId;
        const again = (await (await report(sample("check:dashboard Browser"))).json()) as { errorId?: string };

        check("Ein Bericht bekommt eine Fehler-ID", first.status === 200 && /^NEXUS-\d{10}-[A-HJ-NP-Z2-9]{6}$/.test(id ?? ""), `${first.status} ${id}`);
        check("Derselbe Fehler in derselben Minute: dieselbe ID, kein zweiter Bericht", id !== undefined && again.errorId === id, JSON.stringify(again));
        check("Ohne Sitzung: 401", (await report(sample("ohne"), { Cookie: "" })).status === 401);
        check("Von einer fremden Seite: 403", (await report(sample("fremd"), { "Sec-Fetch-Site": "cross-site" })).status === 403);
        check("Über 16 KB: 413", (await report({ ...sample("groß"), stack: "x".repeat(20_000) })).status === 413);
        check("Kaputte Eingabe: 400", (await report({ kind: "unsinn" })).status === 400);

        const statuses: number[] = [];

        for (let index = 0; index < 10; index++) statuses.push((await report(sample(`check:dashboard viele ${"abcdefghij"[index]}`))).status);

        check("Mehr als 10 in einer Minute: 429", statuses.includes(429) && statuses.filter((status) => status === 200).length <= 9, statuses.join(","));
    } finally {
        if (before === undefined) delete process.env.ERROR_REPORTS_BROWSER;
        else process.env.ERROR_REPORTS_BROWSER = before;
    }
}

/** Die Karten des Dashboards liegen beim Bot, nie unter public/ (Plan 24). Setzt `npm run build:dashboard` voraus. */
async function checkMaps(): Promise<void> {
    console.log("\n  — Karten des Dashboards —");

    const assets = path.join(process.cwd(), "src", "dashboard", "public", "assets");
    const maps = path.join(process.cwd(), "src", "dashboard", "maps");
    const exposed = (await readdir(assets, { recursive: true })).filter((file) => String(file).endsWith(".map"));
    const app = existsSync(path.join(maps, "app.js.map")) ? (JSON.parse(await readFile(path.join(maps, "app.js.map"), "utf8")) as { sourcesContent?: unknown[] }) : null;

    check("Keine Karte unter public/", exposed.length === 0, exposed.join(", "));
    check("Die Karte zu app.js liegt beim Bot, mit Quellen", (app?.sourcesContent?.length ?? 0) > 0);
    check("Die Karten stehen nicht in git", (await readFile(path.join(process.cwd(), ".gitignore"), "utf8")).split(/\r?\n/).includes("src/dashboard/maps/"));
}

/** Die letzten Schritte und was gemeldet wird, ohne DOM (Plan 24, core/Trail.ts). */
async function checkTrail(): Promise<void> {
    console.log("\n  — Letzte Schritte im Dashboard —");

    const trail = await import("../dashboard/client/core/Trail.js");

    check("Pfad ohne Abfrage und Anker", trail.pathOnly("https://dashboard.nexus-emb.de/guild/1/levels?tab=2&code=geheim#oben") === "/guild/1/levels" && trail.pathOnly("/api/guild/1?x=1") === "/api/guild/1");
    check("Beschriftung: eine Zeile, höchstens 40 Zeichen", trail.labelOf("  Speichern\n  ") === "Speichern" && trail.labelOf("x".repeat(60)).length === 40 && trail.labelOf("x".repeat(60)).endsWith("…"));

    for (let index = 0; index < 14; index++) trail.remember(`Schritt ${index}`, new Date("2026-10-24T12:02:10Z"));

    const steps = trail.steps();

    check("Höchstens die letzten 10 Schritte, mit Uhrzeit", steps.length === 10 && steps[0].endsWith("Schritt 4") && steps[9].endsWith("Schritt 13") && /^\d{2}:\d{2}:\d{2} /.test(steps[0]), steps.join(" | "));

    const named = (name: string, message: string) => Object.assign(new Error(message), { name });

    check(
        "Nicht gemeldet: Abbruch, Offline, fehlendes Code-Stück nach einem Deploy",
        !trail.shouldReport(named("AbortError", "The operation was aborted.")) &&
            !trail.shouldReport(new TypeError("Failed to fetch")) &&
            !trail.shouldReport(new TypeError("NetworkError when attempting to fetch resource.")) &&
            !trail.shouldReport(new TypeError("Failed to fetch dynamically imported module: https://x/assets/chunks/Guild-OLD.js")) &&
            !trail.shouldReport(new TypeError("Importing a module script failed."))
    );
    check("Nicht gemeldet: Rauschen des Browsers (fremde Skripte, ResizeObserver)", !trail.shouldReport("Script error.") && !trail.shouldReport(new Error("ResizeObserver loop completed with undelivered notifications.")));
    check("Gemeldet: ein echter Fehler im Code", trail.shouldReport(new TypeError("Cannot read properties of undefined (reading 'id')")) && trail.shouldReport("String statt Error"));
    check("Schon gemeldet (500 mit Fehler-ID): nicht noch einmal", !trail.shouldReport(Object.assign(new Error("Internal Server Error"), { errorId: "NEXUS-1792841102-M2XD7K" })));
    check(
        "Browser kurz benannt",
        trail.browserOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0") === "Firefox 140 · Windows" &&
            trail.browserOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36") === "Chrome 141 · macOS" &&
            trail.browserOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0") === "Edge 141 · Windows"
    );

    const source = await readFile(path.join(process.cwd(), "src", "dashboard", "client", "core", "Trail.ts"), "utf8");

    check("Nie Eingaben: die Spur liest keine Werte aus Feldern", !/\.value\b/.test(source));

    // Verdrahtet: Spur ab dem Start, Melden nach /api/me, Bereiche und Fehlerseite zeigen die ID.
    const client = (file: string) => readFile(path.join(process.cwd(), "src", "dashboard", "client", file), "utf8");
    const [app, guild, failure] = await Promise.all([client("app.ts"), client("pages/Guild.ts"), client("layout/Failure.ts")]);

    check("app.ts: Spur beim Start, Melden mit dem Schalter aus /api/me", app.includes("installTrail()") && /installErrorReports\(data\.errorReports === true\)/.test(app) && /errorId: lastServerErrorId\(\)/.test(app));
    check("Guild.ts: ein Bereich, der nicht lädt, meldet sich und zeigt die ID", /reportClientError\(\{ kind: "section"/.test(guild) && guild.includes("errorNote("));
    check("Failure.ts: die Fehlerseite zeigt eine Fehler-ID, wenn es eine gibt", failure.includes("errorNote(failure.errorId"));
}

async function main(): Promise<void> {
    const client = new BotClient();

    client.server.Port = PORT;
    await client.server.Start();

    const service = client.dashboardService;

    console.log(`\nRedirect URI: ${service.RedirectURI}`);
    console.log(`Invite URL:   ${service.InviteURL()}\n`);

    checkScopes();
    await checkGroups(client);
    await checkPaywall(client);
    await checkBeta(client);
    await checkMaintenance(client);
    await checkErrorIds(client);
    await checkClientErrors(client);
    await checkMaps();
    await checkTrail();
    checkShopStatus();
    checkSessions(client);

    // RL Tracker, Administration und die Epic-Verknuepfung gibt es nicht mehr.
    for (const gone of ["/admins", "/api/admin", "/user/1059621019947634739/tracking", "/api/tracking/1059621019947634739", "/link/epic"]) {
        const response = await fetch(`${BASE}${P}${gone}`, MANUAL);

        check(`${P}${gone} gibt es nicht mehr`, response.status === 404, `${response.status}`);
    }

    const settings = await fetch(`${BASE}${P}/user/1059621019947634739/settings`, MANUAL);
    check("Einstellungen leiten ohne Sitzung zum Login", settings.status === 302, `${settings.status}`);

    const docu = await fetch(`${BASE}${P}/docu`, MANUAL);
    check(
        "Dokumentation ist ohne Sitzung lesbar",
        docu.status === 200 && (docu.headers.get("content-type") ?? "").startsWith("text/html"),
        `${docu.status}`
    );

    const wtsi = await fetch(`${BASE}${P}/wtsi`, MANUAL);
    check(
        "Alter WTSI-Pfad leitet auf die Dokumentation",
        wtsi.status === 301 && wtsi.headers.get("location") === `${P}/docu#wtsi`,
        `${wtsi.status} ${wtsi.headers.get("location")}`
    );

    const notes = await fetch(`${BASE}${P}/api/notifications`, MANUAL);
    check("Postfach ohne Sitzung ist 401", notes.status === 401, `${notes.status}`);

    const logo = await fetch(`${BASE}${P}/assets/images/RL%20Nexus%20N%20Logo.png`);
    check("Logo wird ausgeliefert", logo.status === 200, `${logo.status}`);

    const escape = await fetch(`${BASE}${P}/assets/images/..%2F..%2F..%2F..%2F.env`);
    check("Pfad aus images heraus ist 403", escape.status === 403, `${escape.status}`);

    const root = await fetch(`${BASE}${HOME}`, MANUAL);
    check(`${HOME} leitet ohne Sitzung zum Login`, root.status === 302, `${root.status}`);
    check(`  Ziel ist ${P}/login`, root.headers.get("location") === `${P}/login`);

    const login = await fetch(`${BASE}${P}/login`, MANUAL);
    const target = new URL(login.headers.get("location") ?? "https://invalid.example");
    const cookie = login.headers.get("set-cookie") ?? "";

    check(`${P}/login leitet zu Discord`, target.host === "discord.com", target.href);
    check("  redirect_uri passt zur RedirectURI", target.searchParams.get("redirect_uri") === service.RedirectURI);
    check(`  scope ist ${OAUTH_SCOPES.join(" + ")}`, target.searchParams.get("scope") === OAUTH_SCOPES.join(" "), String(target.searchParams.get("scope")));
    check("  state ist gesetzt", (target.searchParams.get("state") ?? "").length > 20);
    check("  state-Cookie ist HttpOnly und SameSite=Lax", cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"), cookie);

    const evil = await fetch(`${BASE}${P}/login?return=//evil.example`, MANUAL);
    const evilCookie = evil.headers.get("set-cookie") ?? "";
    check("Fremder return-Pfad wird verworfen", !evilCookie.includes("evil"), evilCookie);

    const me = await fetch(`${BASE}${P}/api/me`);
    check(`${P}/api/me ohne Sitzung ist 401`, me.status === 401, `${me.status}`);

    const css = await fetch(`${BASE}${P}/assets/style.css`);
    check("style.css wird ausgeliefert", css.status === 200 && (css.headers.get("content-type") ?? "").startsWith("text/css"), `${css.status}`);

    // Die Hausfarbe steht in style.css selbst, eine zweite Farbdatei gibt es
    // nicht mehr. Fehlt sie dort, sind Knoepfe, Marken und Fokusringe farblos.
    check("style.css traegt die Hausfarbe #ff1e2d", (await css.text()).includes("--brand:#ff1e2d"));

    const js = await fetch(`${BASE}${P}/assets/app.js`);
    check("app.js wird ausgeliefert (Frontend gebaut?)", js.status === 200, `${js.status} - npm run build:dashboard`);

    // Ladezeit: gepackt, mit Stand (ETag), und was sich nie aendert, darf der
    // Browser ein Jahr behalten. Ohne das lud jede Seite alles bei jedem Aufruf neu.
    const packed = await fetch(`${BASE}${P}/assets/app.js`, { headers: { "Accept-Encoding": "br, gzip" } });
    const etag = packed.headers.get("etag") ?? "";
    const again = await fetch(`${BASE}${P}/assets/app.js`, { headers: { "If-None-Match": etag } });

    check("app.js kommt gepackt (Brotli)", packed.headers.get("content-encoding") === "br", String(packed.headers.get("content-encoding")));
    check("Gleicher Stand: 304 ohne Inhalt", etag !== "" && again.status === 304, `${again.status}`);

    const chunkNames = existsSync(path.join(process.cwd(), "src", "dashboard", "public", "assets", "chunks"))
        ? await readdir(path.join(process.cwd(), "src", "dashboard", "public", "assets", "chunks"))
        : [];
    const piece = chunkNames[0] ? await fetch(`${BASE}${P}/assets/chunks/${chunkNames[0]}`) : null;

    check("Stücke mit Prüfsumme: ein Jahr Cache", (piece?.headers.get("cache-control") ?? "").includes("immutable"), String(piece?.headers.get("cache-control")));

    const versioned = await fetch(`${BASE}${P}/assets/style.css?v=abc123def0`);
    const unversioned = await fetch(`${BASE}${P}/assets/style.css`);

    check("style.css mit ?v=: ein Jahr Cache", (versioned.headers.get("cache-control") ?? "").includes("immutable"));
    check("style.css ohne ?v=: der Browser fragt nach", unversioned.headers.get("cache-control") === "no-cache");

    const docuPage = await (await fetch(`${BASE}${P}/docu`)).text();

    check(
        "Seiten hängen die Prüfsumme an app.js und style.css",
        /assets\/app\.js\?v=[0-9a-f]{10}"/.test(docuPage) && /assets\/style\.css\?v=[0-9a-f]{10}"/.test(docuPage)
    );
    check("Kein 1,4-MB-Logo mehr in den Seiten", !docuPage.includes("RL Nexus N Logo.png"));

    // ------------------------------------------------------------------
    // Der Modulbaum des Frontends.
    //
    // Seit das Dashboard aus vielen kleinen Dateien besteht, laedt der Browser
    // sie selbst nach. Ein Import ohne .js-Endung oder ein Tippfehler im Pfad
    // faellt beim Bauen nicht auf - TypeScript laesst den Pfad stehen, wie er
    // dasteht. Bemerkt wuerde es erst an einer weissen Seite. Also hier.
    // ------------------------------------------------------------------
    const ASSETS = path.join(process.cwd(), "src", "dashboard", "public", "assets");
    // Gebündelt und verkleinert: from"./x.js", import"./x.js" und import("./x.js").
    const IMPORT = /(?:from\s*|import\s*\(\s*|import\s*)"([^"]+\.js)"/g;

    const gesehen = new Set<string>();
    const kaputt: string[] = [];
    const offen = ["app.js"];

    while (offen.length > 0) {
        const rel = offen.pop() as string;

        if (gesehen.has(rel)) continue;

        gesehen.add(rel);

        const file = path.join(ASSETS, rel);

        if (!existsSync(file)) {
            kaputt.push(rel);
            continue;
        }

        const code = await readFile(file, "utf8");

        for (const found of code.matchAll(IMPORT)) {
            const spec = found[1] as string;

            if (!spec.startsWith(".")) {
                kaputt.push(`${rel} → ${spec}`);
                continue;
            }

            offen.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
        }
    }

    // Einstieg, geteilte Stücke und je Seite eins - alle muessen erreichbar sein.
    const pages = ["Servers", "Guild", "Settings", "Docu"];
    const reached = [...gesehen].join(" ");

    check(
        `Frontend-Bündel lädt vollständig (${gesehen.size} Dateien)`,
        kaputt.length === 0 && pages.every((name) => reached.includes(`chunks/${name}-`)),
        kaputt.join(", ") || pages.filter((name) => !reached.includes(`chunks/${name}-`)).join(", ")
    );

    // Die Seitenleiste der Serverseite: jedes Modul zeigt ein Symbol aus dem
    // Sprite in guild.html, und seine ID wird dort Anker und Selektor
    // (#tickets). Ein fehlendes Symbol bliebe stumm leer, eine doppelte oder
    // mit einer Ziffer beginnende ID bricht die Reiter - beides fiele sonst
    // erst im Browser auf.
    // Geladen wird die gebaute Datei selbst, nicht ihr Text: nur so ist zu sehen,
    // was ein Modul ist und was ein Teil davon. Teile haben keinen Schalter und
    // stehen nie in guild_settings.modules - der Bot kennt sie deshalb nicht.
    type ModuleEntry = {
        id: string;
        icon: string;
        category?: string;
        always?: true;
        parts?: { id: string; icon: string }[];
    };
    type CategoryEntry = { id: string; name: string };

    const { pathToFileURL } = await import("node:url");
    // Die Quelle, nicht das Bündel - dort stehen die Module nicht mehr als eigene Datei.
    const moduleFile = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Modules.ts");
    const guildPage = await readFile(path.join(ASSETS, "..", "guild.html"), "utf8");
    const loaded = existsSync(moduleFile)
        ? ((await import(pathToFileURL(moduleFile).href)) as {
              MODULES?: ModuleEntry[];
              CATEGORIES?: CategoryEntry[];
          })
        : {};

    const modules = loaded.MODULES ?? [];
    const categories = loaded.CATEGORIES ?? [];
    const anchors = [...modules, ...modules.flatMap((module) => module.parts ?? [])];
    const symbols = anchors.map((entry) => entry.icon.replace("#", ""));
    const missing = symbols.filter((symbol) => !guildPage.includes(`id="${symbol}"`));
    const ids = anchors.map((entry) => entry.id);

    check(
        `Modul-Symbole stehen im Sprite von guild.html (${symbols.length})`,
        symbols.length > 0 && missing.length === 0,
        missing.join(", ")
    );
    // Eine Modul-ID darf in guild.html gar nicht vorkommen (das Modul ist noch
    // nicht gebaut, card() setzt spaeter eine Platzkarte) oder genau einmal -
    // und dann nur als die Karte dieses Moduls. Zaehlen statt "kommt sie vor":
    // ein zweites, falsches Element mit derselben ID kaeme an einer reinen
    // Praesenzpruefung vorbei, sobald die echte Karte schon existiert - includes()
    // ist dann fuer beide Seiten schon true, und das Falsche faellt nie auf.
    const misplaced = ids.filter((id) => {
        if (!/^[a-z][a-z0-9-]*$/.test(id)) return true;

        const count = guildPage.split(`id="${id}"`).length - 1;

        if (count === 0) return false;

        return count !== 1 || !guildPage.includes(`<section class="setcard" id="${id}"`);
    });

    check(
        `Modul-Anker sind eindeutig und brauchbar (${ids.length})`,
        ids.length > 0 && new Set(ids).size === ids.length && misplaced.length === 0,
        misplaced.join(", ")
    );

    // Jedes Modul steht unter einer Ueberschrift der Leiste. Ohne Kategorie
    // fiele es aus der Leiste heraus, ohne dass jemand es merkt.
    const known = new Set(categories.map((entry) => entry.id));
    const homeless = modules.filter((entry) => !entry.category || !known.has(entry.category));

    check(
        `Jedes Modul haengt an einer Kategorie (${modules.length})`,
        categories.length > 0 && homeless.length === 0,
        homeless.map((entry) => entry.id).join(", ")
    );

    const empty = categories.filter((entry) => !modules.some((module) => module.category === entry.id));

    check(
        `Jede Kategorie traegt mindestens ein Modul (${categories.length})`,
        empty.length === 0,
        empty.map((entry) => entry.id).join(", ")
    );

    // Die Galerie gehoert fest dazu. Faellt die Markierung weg, stuende im
    // Dashboard ein Schalter, den der Bot nicht annimmt.
    check(
        "Galerie ist als festes Modul markiert",
        modules.find((entry) => entry.id === "gallery")?.always === true
    );
    check(
        "Backups ist als festes Modul markiert, mit Meine Backups",
        modules.find((entry) => entry.id === "backups")?.always === true && modules.find((entry) => entry.id === "backups")?.parts?.[0]?.id === "meine-backups"
    );

    // Das Dashboard weist zu grosse Bilder ab, bevor sie durchs Netz gehen.
    // Es kann MAX_IMAGE_BYTES nicht importieren und traegt die Zahl selbst -
    // laufen beide auseinander, nennt die Kachel eine falsche Grenze.
    const CLIENT = path.join(process.cwd(), "src", "dashboard", "client");
    const galleryCore = await readFile(path.join(CLIENT, "core", "Gallery.ts"), "utf8");
    const clientLimit = Number(/MAX_UPLOAD_BYTES = (\d+)/.exec(galleryCore)?.[1]);

    check(
        "Upload-Grenze im Dashboard und im Bot stimmen ueberein",
        clientLimit === MAX_IMAGE_BYTES,
        `Dashboard: ${clientLimit} | Bot: ${MAX_IMAGE_BYTES}`
    );

    // Ein Abschnitt laedt seinen Code erst beim ersten Oeffnen. Nach einem neuen
    // Bau sind die alten Stuecke weg: Wer die Seite offen hatte, sah nur die
    // leere Karte, ohne Ladeanzeige und ohne Fehler (Backups, 23.10.). whenShown
    // meldet das nur, wenn jeder Start sein import() zurueckgibt.
    const guildCode = await readFile(path.join(CLIENT, "pages", "Guild.ts"), "utf8");
    const swallowed = [...guildCode.matchAll(/whenShown\(\[([^\]]*)\], \(\) => void /g)].map((match) => match[1]);

    check(
        "Abschnitte melden, wenn ihr Code nicht laedt (kein void import in whenShown)",
        swallowed.length === 0 && /\.catch\(/.test(/function whenShown[\s\S]*?\n}\n/.exec(guildCode)?.[0] ?? ""),
        swallowed.join(" | ")
    );

    // Beitritte nach oben, Abgaenge nach unten: die Saeule ist ein Grid. Ohne
    // eigene Spaltenbreite schrumpft die Spalte auf die Breite der Balken, und
    // die haengt wieder an der Spalte - beides wird 0, der Graph bleibt leer,
    // waehrend die Kacheln die Zahlen zeigen (Uebersicht, 23.10.).
    const styles = await readFile(path.join(process.cwd(), "src", "dashboard", "public", "assets", "style.css"), "utf8");
    const splitRule = /\.col--split\{([^}]*)\}/.exec(styles)?.[1] ?? "";

    check("Geteilte Saeulen (Beitritte und Abgaenge) haben eine Spaltenbreite", /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(splitRule), splitRule);

    // Die Platzhalter der Ticket-Nachrichten kennt der Bot; das Dashboard fuehrt
    // dieselbe Liste mit Beschriftung und Beispiel. Fehlt dort einer, bietet der
    // Editor ihn nie an - steht dort einer zu viel, ersetzt ihn niemand.
    const placeholderFile = path.join(CLIENT, "constants", "Placeholders.ts");
    const placeholders = existsSync(placeholderFile)
        ? ((await import(pathToFileURL(placeholderFile).href)) as { PLACEHOLDERS?: { key: string }[] })
        : {};
    const clientKeys = (placeholders.PLACEHOLDERS ?? []).map((entry) => entry.key);

    check(
        `Platzhalter im Dashboard und im Bot stimmen ueberein (${PLACEHOLDER_KEYS.length})`,
        clientKeys.length === PLACEHOLDER_KEYS.length && PLACEHOLDER_KEYS.every((key) => clientKeys.includes(key)),
        `Dashboard: ${clientKeys.join(", ")} | Bot: ${PLACEHOLDER_KEYS.join(", ")}`
    );

    /* ----------------------------------------------------------
       Die Fehlerseite
       ---------------------------------------------------------- */
    // Sie ist die letzte Station, wenn nichts anderes mehr greift: ohne
    // Skript, mit echten Links, und nur fuer den Browser - Skripte bekommen
    // weiter JSON.
    const errorPage = await readFile(path.join(ASSETS, "..", "error.html"), "utf8");
    const slots = ["__ERR_CODE__", "__ERR_TITLE__", "__ERR_TEXT__", "__ERR_HINT__", "__ERR_ACTION__", "__ERR_HREF__"];

    check("Die Fehlerseite hat alle Platzhalter", slots.every((slot) => errorPage.includes(slot)), slots.filter((slot) => !errorPage.includes(slot)).join(", "));
    check("Sie braucht kein Skript", !errorPage.includes("<script"), "sie laedt app.js");
    check("Und hat zwei echte Links", (errorPage.match(/<a class="erract/g) ?? []).length === 2);

    const codes: [number, string][] = [
        [404, "gibt es nicht"],
        [403, "Rechte"],
        [401, "angemeldet"],
        [429, "Moment"],
        [500, "schiefgegangen"],
        [503, "nicht bei sich"],
    ];

    for (const [code, word] of codes) {
        const info = ErrorInfo(code);

        check(`${code} sagt, was los ist`, info.code === code && info.title.includes(word), `${info.code}: ${info.title}`);
    }

    check("Ein unbekannter Code zaehlt als Fehler beim Bot", ErrorInfo(418).code === 418 && ErrorInfo(0).code === 500);
    check("Bei 401 fuehrt der Knopf zur Anmeldung", ErrorInfo(401).action.href.endsWith("/login"));
    check("Sonst zur Uebersicht", ErrorInfo(404).action.href === `${P}/`, ErrorInfo(404).action.href);

    const asks = (url: string, accept: string, method = "GET") =>
        WantsPage({ method, url, headers: { accept } } as unknown as Parameters<typeof WantsPage>[0]);

    check("Ein Browser bekommt die Seite", asks("/dashboard/gibtsnicht", "text/html,application/xhtml+xml"));
    check("Die API bekommt JSON", !asks("/dashboard/api/guild/1/lft", "text/html"));
    check("Ein Bild ebenfalls", !asks("/dashboard/assets/app.js", "text/html"));
    check("Ein Skript-Aufruf ebenfalls", !asks("/dashboard/gibtsnicht", "application/json"));
    check("Und ein POST ebenfalls", !asks("/dashboard/gibtsnicht", "text/html", "POST"));

    const nowhere = await fetch(`${BASE}${P}/gibtsnicht`, { headers: { Accept: "text/html" } });
    const nowhereBody = await nowhere.text();

    check("Eine unbekannte Adresse antwortet mit 404", nowhere.status === 404, String(nowhere.status));
    check("Und schickt die Seite, nicht JSON", nowhereBody.includes("errpage") && nowhereBody.includes("404"), nowhereBody.slice(0, 80));

    const nowhereApi = await fetch(`${BASE}${P}/api/gibtsnicht`, { headers: { Accept: "application/json" } });

    check("Die API bleibt bei JSON", nowhereApi.status === 404 && String(nowhereApi.headers.get("content-type")).includes("json"));

    const up = await fetch(`${BASE}${P}/assets/..%2Findex.html`);
    check("Pfad aus assets heraus ist 403", up.status === 403, `${up.status}`);

    const env = await fetch(`${BASE}${P}/assets/..%2F..%2F..%2F..%2F.env`);
    check("Zugriff auf .env ist 403", env.status === 403, `${env.status}`);

    const forged = await fetch(`${BASE}${P}/callback?code=x&state=gefaelscht`, MANUAL);
    check("Callback mit falschem state ist 400", forged.status === 400, `${forged.status}`);

    const denied = await fetch(`${BASE}${P}/callback?error=access_denied`, MANUAL);
    check("Abgebrochener Login zeigt eine Seite", denied.status === 403 && (denied.headers.get("content-type") ?? "").startsWith("text/html"), `${denied.status}`);

    const nonsense = await fetch(`${BASE}${P}/guild/keine-id`, MANUAL);
    check("Guild-Seite mit kaputter ID ist 404", nonsense.status === 404, `${nonsense.status}`);

    const id = "123456789012345678";
    check("  Testdaten sind eine gültige Snowflake", SNOWFLAKE.test(id));

    const guild = await fetch(`${BASE}${P}/guild/${id}/tickets`, MANUAL);
    const back = guild.headers.get("location") ?? "";
    check("Guild-Seite ohne Sitzung leitet zum Login", guild.status === 302, `${guild.status}`);
    check("  merkt sich den Rückweg samt Abschnitt", back.includes(encodeURIComponent(`${P}/guild/${id}/tickets`)), back);

    // Der Abschnitt steht im Pfad. Was kein Abschnitt sein kann, ist auch keine
    // eigene Seite - sonst wäre jeder Tippfehler eine.
    const wrong = await fetch(`${BASE}${P}/guild/${id}/NichtKlein`, MANUAL);
    check("Guild-Seite mit unmöglichem Abschnitt ist 404", wrong.status === 404, `${wrong.status}`);

    // Alte Lesezeichen und Links in Discord-Nachrichten sollen weiter ankommen.
    const legacy = await fetch(`${BASE}${P}/g/${id}`, MANUAL);
    check(
        "Alter Link /g/<id> leitet auf die neue Adresse",
        legacy.status === 302 && (legacy.headers.get("location") ?? "").endsWith(`${P}/guild/${id}/uebersicht`),
        `${legacy.status} → ${legacy.headers.get("location")}`
    );

    // Beweis über HTTP: mit gültigem Cookie kommt die Seite, ohne kommt der Login.
    const sitzungsCookie = service.Sign({
        id: "http-sitzung",
        userId: "1059621019947634739",
        username: "Check",
        avatar: null,
        accessToken: "egal",
        mfa: true,
        expiresAt: Date.now() + 60_000,
    });

    const mitCookie = await fetch(`${BASE}${HOME}`, {
        ...MANUAL,
        headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(sitzungsCookie)}` },
    });

    check(
        "Mit Sitzungs-Cookie kommt die Seite statt des Logins",
        mitCookie.status === 200 && (mitCookie.headers.get("content-type") ?? "").startsWith("text/html"),
        `${mitCookie.status}`
    );

    // Bezahlschranke: Ohne Zugang und ohne sichtbaren Server kommt die Sperrseite mit Grund.
    {
        const service = client.dashboardService;
        const savedLocked = service.Locked.bind(service);
        const cookieHeader = { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(sitzungsCookie)}` };

        service.Locked = async () => ({ allowed: false, reason: "Dein Test ist am 15.10.2026 abgelaufen. <b>x</b>" });

        try {
            for (const [label, url] of [["Startseite", `${BASE}${HOME}`], ["Serverseite", `${BASE}${P}/guild/${id}/uebersicht`]] as const) {
                const page = await fetch(url, { ...MANUAL, headers: cookieHeader });
                const html = await page.text();

                check(`${label} ohne Zugang: Sperrseite`, page.status === 200 && html.includes("Kein Zugang zum Dashboard"), `${page.status}`);
                check(`${label} ohne Zugang: Grund, Preise und Abmelden`, html.includes("Dein Test ist am 15.10.2026 abgelaufen.") && html.includes("/preise\"") && html.includes("/logout") && !/__[A-Z_]+__/.test(html));
                check(`${label} ohne Zugang: Grund maskiert`, html.includes("&lt;b&gt;x&lt;/b&gt;") && !html.includes("<b>x</b>"));
            }
        } finally {
            service.Locked = savedLocked;
        }

        const again = await (await fetch(`${BASE}${HOME}`, { ...MANUAL, headers: cookieHeader })).text();
        check("Mit Zugang wieder die normale Seite", !again.includes("Kein Zugang zum Dashboard"));
    }

    // Module schalten. Geprüft wird, was vor Discord und Datenbank abgewiesen
    // wird - weiter kommt eine Test-Sitzung ohne echten Token ohnehin nicht.
    const modulesApi = `${BASE}${P}/api/guild/${id}/modules`;
    const mitSitzung = { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(sitzungsCookie)}` };

    const ohneSitzung = await fetch(modulesApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "tickets", on: true }),
    });
    check("Modul-Schalter ohne Sitzung ist 401", ohneSitzung.status === 401, `${ohneSitzung.status}`);

    const alsText = await fetch(modulesApi, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: "tickets",
    });
    check("Modul-Schalter nimmt nur JSON (CSRF)", alsText.status === 415, `${alsText.status}`);

    const erfunden = await fetch(modulesApi, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "application/json" },
        body: JSON.stringify({ module: "gibt-es-nicht", on: true }),
    });
    check("Modul-Schalter weist unbekannte Module ab", erfunden.status === 400, `${erfunden.status}`);

    // Die Galerie gehoert fest dazu. Der Schalter muss vor Datenbank und Discord
    // abweisen, sonst haengt die Antwort an Dingen, die der Check nicht hat.
    const festesAus = await fetch(modulesApi, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "application/json" },
        body: JSON.stringify({ module: "gallery", on: false }),
    });
    check("Festes Modul laesst sich nicht ausschalten", festesAus.status === 400, `${festesAus.status}`);

    // Der Bilder-Parser aus Server.ts haengt am ganzen Server, nicht nur an der
    // kuenftigen Galerie-Route. Ohne eigenes bodyLimit auf dieser Route muss ein
    // Bild-Body wieder beim Fastify-Standard (1 MiB) kappen, nicht bei den 8 MiB,
    // die eigentlich nur fuer Uploads gedacht sind.
    const zuGrossesBild = await fetch(modulesApi, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "image/png" },
        body: Buffer.alloc(1024 * 1024 + 1),
    });
    check("Modul-Schalter kappt Bild-Body ueber 1 MiB (413, kein eigenes bodyLimit)", zuGrossesBild.status === 413, `${zuGrossesBild.status}`);

    // Das Dashboard zeigt die Namen, der Bot entscheidet, was gespeichert wird.
    // Fehlt ein Modul im Bot, ließe es sich anklicken, aber nie einschalten.
    // Verglichen werden nur die Module: Teile eines Moduls haben keinen Schalter.
    const switchable = modules.map((entry) => entry.id);

    check(
        "Modul-Liste im Dashboard und im Bot stimmen überein",
        switchable.length === MODULE_IDS.length && MODULE_IDS.every((known) => switchable.includes(known)),
        `Dashboard: ${switchable.join(", ")} | Bot: ${MODULE_IDS.join(", ")}`
    );

    const ticketsApi = await fetch(`${BASE}${P}/api/guild/${id}/tickets`, MANUAL);
    check("Tickets ohne Sitzung ist 401", ticketsApi.status === 401, `${ticketsApi.status}`);

    const ticketsAlsText = await fetch(`${BASE}${P}/api/guild/${id}/tickets`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "save" }),
    });
    check("Tickets-Schreiben nimmt nur JSON (CSRF)", ticketsAlsText.status === 415, `${ticketsAlsText.status}`);

    // Transcripts: die Seite schickt ohne Sitzung zum Login und wieder zurück,
    // ihre Anhänge und die Liste sagen 401 - nichts davon ist öffentlich.
    const transcriptPage = await fetch(`${BASE}${P}/transcript/1`, MANUAL);
    const transcriptBack = transcriptPage.headers.get("location") ?? "";
    check("Transcript ohne Sitzung leitet zum Login", transcriptPage.status === 302, `${transcriptPage.status}`);
    check("  und kommt danach zum Transcript zurück", transcriptBack.includes(encodeURIComponent(`${P}/transcript/1`)), transcriptBack);

    const transcriptFile = await fetch(`${BASE}${P}/transcript/1/0.png`, MANUAL);
    check("Transcript-Anhang ohne Sitzung ist 401", transcriptFile.status === 401, `${transcriptFile.status}`);

    const transcriptOdd = await fetch(`${BASE}${P}/transcript/1/geheim.env`, MANUAL);
    check("Nur Anhang-Namen, die der Bot vergibt", transcriptOdd.status === 404, `${transcriptOdd.status}`);

    const transcriptsApi = await fetch(`${BASE}${P}/api/guild/${id}/transcripts`, MANUAL);
    check("Transcript-Liste ohne Sitzung ist 401", transcriptsApi.status === 401, `${transcriptsApi.status}`);

    const transcriptsAlsText = await fetch(`${BASE}${P}/api/guild/${id}/transcripts`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "delete", id: 1 }),
    });
    check("Transcript-Löschen nimmt nur JSON (CSRF)", transcriptsAlsText.status === 415, `${transcriptsAlsText.status}`);

    // Live Tickets: nichts ohne Sitzung, auch nicht der Stream; schreiben nur als JSON bzw. roh.
    for (const [was, pfad] of [
        ["Live-Liste", "live"],
        ["Live-Stream", "live/stream"],
        ["Live-Verlauf", "live/1"],
    ]) {
        const antwort = await fetch(`${BASE}${P}/api/guild/${id}/${pfad}`, MANUAL);
        check(`${was} ohne Sitzung ist 401`, antwort.status === 401, `${antwort.status}`);
    }

    const liveAlsText = await fetch(`${BASE}${P}/api/guild/${id}/live/1`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "send", content: "hallo" }),
    });
    check("Live-Schreiben nimmt nur JSON (CSRF)", liveAlsText.status === 415, `${liveAlsText.status}`);

    const liveDateiAlsText = await fetch(`${BASE}${P}/api/guild/${id}/live/1/file?name=a.txt`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: "hallo",
    });
    check("Live-Datei nimmt nur rohe Daten", liveDateiAlsText.status === 415, `${liveDateiAlsText.status}`);

    const activityApi = await fetch(`${BASE}${P}/api/guild/${id}/activity`, MANUAL);
    check("Aktivität ohne Sitzung ist 401", activityApi.status === 401, `${activityApi.status}`);

    const galerieApi = await fetch(`${BASE}${P}/api/guild/${id}/gallery`, MANUAL);
    check("Galerie ohne Sitzung ist 401", galerieApi.status === 401, `${galerieApi.status}`);

    const galerieSchreiben = `${BASE}${P}/api/guild/${id}/gallery/image/delete`;

    const galerieOhneSitzung = await fetch(galerieSchreiben, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: `${id}/test/bild.webp` }),
    });
    check("Galerie-Schreiben ohne Sitzung ist 401", galerieOhneSitzung.status === 401, `${galerieOhneSitzung.status}`);

    const galerieErfunden = await fetch(`${BASE}${P}/api/guild/${id}/gallery/gibt-es-nicht`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "application/json" },
        body: "{}",
    });
    check("Galerie weist unbekannte Aktionen ab", galerieErfunden.status === 400, `${galerieErfunden.status}`);

    const galerieAlsText = await fetch(`${BASE}${P}/api/guild/${id}/gallery/category`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "text/plain" },
        body: JSON.stringify({ category: "csrf" }),
    });
    check("Galerie-Schreiben nimmt nur JSON (CSRF)", galerieAlsText.status === 415, `${galerieAlsText.status}`);

    const uploadAlsJson = await fetch(`${BASE}${P}/api/guild/${id}/gallery/image?category=test&name=x`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "application/json" },
        body: "{}",
    });
    check("Galerie-Upload nimmt nur Bilder", uploadAlsJson.status === 415, `${uploadAlsJson.status}`);

    // Gegenstueck zum 413 auf der Modul-Route: hier muss ein Bild ueber 1 MiB
    // durchkommen. Welcher Status danach folgt, haengt an der Test-Sitzung -
    // nur 413 waere falsch, dann fehlt der Route ihr bodyLimit.
    const grossesBild = await fetch(`${BASE}${P}/api/guild/${id}/gallery/image?category=test&name=gross`, {
        method: "POST",
        headers: { ...mitSitzung, "Content-Type": "image/png" },
        body: new Uint8Array(1024 * 1024 + 1),
    });
    check("Galerie nimmt Bilder ueber 1 MiB an", grossesBild.status !== 413, `${grossesBild.status}`);

    const listenOhneSitzung = await fetch(`${BASE}${P}/api/guild/${id}/resources`, MANUAL);
    check("Kanal- und Rollenlisten ohne Sitzung ist 401", listenOhneSitzung.status === 401, `${listenOhneSitzung.status}`);

    const health = await fetch(`${BASE}/dcapi/health`);
    check("Bestehende API bleibt tokenpflichtig", health.status === 401, `${health.status}`);

    await checkMapping(client);
    await checkRateLimit(client);
    await checkMfa(client);
    await checkLiveLists();
    await checkBackups();

    await client.server.Stop();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

void main();
