import { randomBytes } from "node:crypto";
import { escapeMarkdown } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import IDashboardGuild, { DashboardRole } from "../interfaces/services/dashboard/IDashboardGuild";
import IDashboardService, { IDashboardPayload } from "../interfaces/services/dashboard/IDashboardService";
import IDashboardGuildDetail, {
    IDashboardMemberFacts,
    IDashboardServerFacts,
} from "../interfaces/services/dashboard/IDashboardGuildDetail";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import IDashboardUser, { DashboardGroup } from "../interfaces/services/dashboard/IDashboardUser";
import {
    ADMINISTRATOR,
    AvatarURL,
    CreatedAt,
    CrestColors,
    DASHBOARD_PATH,
    DISCORD_API,
    GUILD_CACHE_TTL,
    IconURL,
    Initials,
    INVITE_PERMISSIONS,
    MANAGE_GUILD,
    MAX_SESSIONS,
    OAUTH_SCOPES,
} from "../constants/Dashboard";
import { Open, Seal } from "../utils/seal";
import logger from "../utils/logger";
import { ModuleId } from "../constants/Modules";
import IDashboardActivity from "../interfaces/services/dashboard/IDashboardActivity";

/** Länger als das wartet eine Seite nicht auf Discord - dann lieber der Fehler. */
const MAX_RETRY_WAIT = 5_000;

interface IRawGuild {
    id: string;
    name: string;
    icon: string | null;
    owner?: boolean;
    permissions: string;
    approximate_member_count?: number;
}

interface IRawMember {
    nick?: string | null;
    joined_at?: string | null;
    roles?: string[];
}

// Was das Dashboard über die Discord-Antwort hinaus braucht. Kommt in zwei
// Abfragen für die ganze Liste, nicht in einer je Karte.
interface IGuildFacts {
    teams: Map<string, number>;
    modules: Map<string, string[]>;
}

interface IRawUser {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
    // Kommt nur mit dem Scope "email" und nur, wenn eine Adresse hinterlegt ist.
    email?: string | null;
    // Ob am Discord-Konto die Zwei-Faktor-Anmeldung eingeschaltet ist. Kommt mit
    // "identify" bei /users/@me mit - nachgemessen, nicht angenommen.
    mfa_enabled?: boolean;
}

/**
 * Das Discord-Konto hat keine Zwei-Faktor-Anmeldung.
 *
 * Kein Fehler im Sinne von "etwas ist kaputt", sondern eine Absage: die Anmeldung
 * war technisch erfolgreich, das Konto erfüllt nur die Bedingung nicht. Deshalb
 * ein eigener Typ - die Route soll das von einem Ausfall unterscheiden können und
 * eine Anleitung zeigen statt einer Fehlermeldung.
 */
export class MfaRequired extends Error {
    constructor() {
        super("Das Discord-Konto hat keine Zwei-Faktor-Anmeldung.");
        this.name = "MfaRequired";
    }
}

// Discord hat den Zugriff verweigert - der Token ist zurückgezogen oder abgelaufen.
// Wird oben in ein 401 übersetzt, damit der Browser sauber neu anmeldet.
export class SessionExpired extends Error {
    constructor() {
        super("Discord hat den Zugriffstoken abgelehnt.");
        this.name = "SessionExpired";
    }
}

/* --- Bezahlschranke (Shop, Admin Dashboard) ------------------------------
 * Ist sie an (shop_settings.paywall), kommt ins Dashboard nur, wer einen
 * laufenden Zugang aus dem Shop hat oder in einer der freien Gruppen ist. Die
 * Tabellen gehören dem Admin Dashboard; fehlen sie, ist die Schranke aus.
 */

/** Eine Zeile aus shop_grants, so weit die Regel sie braucht. */
export interface IShopGrantRow {
    readonly source: "trial" | "one_time" | "subscription" | "gift";
    readonly starts_at: Date;
    readonly ends_at: Date | null;
    readonly ended_at: Date | null;
    readonly cancel_at_period_end: number;
}

/** Darf jemand ins Dashboard? Wenn nicht, der Satz für die Sperrseite. */
export interface IShopAccess {
    readonly allowed: boolean;
    readonly reason: string;
    /** Gesperrt: Die Sperrseite bietet dann keinen Kauf an, sondern den Support. */
    readonly banned?: boolean;
    /** Ein Kauf, Test oder Geschenk aus dem Shop läuft. Für die Anzeige „Zugang“, auch bei ausgeschalteter Schranke. */
    readonly viaShop?: boolean;
    /** Was läuft, sind nur Tests. Für die Anzeige „Testphase“. */
    readonly trial?: boolean;
    /** Beta-Modus und kein eingelöster Code: Die Sperrseite fragt nach dem Code. */
    readonly beta?: boolean;
    /** Beta-Modus mit eingelöstem Code. Für die Anzeige „Beta“. */
    readonly betaMember?: boolean;
    /** Die Datenbank antwortet nicht, und im Zweifel bleibt das Dashboard zu (AccessWithoutDatabase). */
    readonly unchecked?: boolean;
}

/** Im Beta-Modus ohne Code herein (Plan 22). Partner braucht einen Code. */
const BETA_FREE: readonly DashboardGroup[] = ["administrator", "developer"];

/** Was die Sperrseite nach einem gescheiterten Einlösen sagt, per ?beta=… (routes/DashboardBeta.ts). */
export const BETA_ERRORS = {
    falsch: "Diesen Code gibt es nicht, oder er ist schon aufgebraucht.",
    weg: "Das Einlösen klappt gerade nicht. Versuch es gleich noch einmal.",
    leer: "Tipp zuerst deinen Beta-Code ein.",
} as const;

export type BetaError = keyof typeof BETA_ERRORS;

/** Der Satz zu ?beta=… in der Adresse, sonst null. */
export function BetaErrorText(query: unknown): string | null {
    const key = typeof query === "object" && query !== null ? (query as { beta?: unknown }).beta : undefined;

    return typeof key === "string" && Object.hasOwn(BETA_ERRORS, key) ? BETA_ERRORS[key as BetaError] : null;
}

/**
 * Beta Access (Plan 22): Im Beta-Modus gilt weder Free noch Paid. Herein kommt
 * nur, wer einen Code eingelöst hat, dazu Administrator und Developer. null:
 * Die Schranke spielt keine Rolle, es gilt die Bezahlschranke wie sonst.
 */
export function BetaGate(input: { readonly betaMode: boolean; readonly group: DashboardGroup; readonly member: boolean }): IShopAccess | null {
    if (!input.betaMode || BETA_FREE.includes(input.group)) return null;

    return input.member ? { allowed: true, reason: "", betaMember: true } : { allowed: false, reason: "RL Nexus ist gerade in der geschlossenen Beta.", beta: true };
}

/** Ohne Kauf frei (Partner seit der Entscheidung vom 17.10.2026, Premium nicht). */
const FREE_GROUPS: readonly DashboardGroup[] = ["administrator", "developer", "partner"];
const DAY_MS = 86_400_000;
const BERLIN_DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const ALLOWED: IShopAccess = { allowed: true, reason: "" };
const VIA_SHOP: IShopAccess = { allowed: true, reason: "", viaShop: true };
const UNCHECKED: IShopAccess = { allowed: false, reason: "Gerade lässt sich nicht prüfen, ob du Zugang hast. Versuch es in einer Minute noch einmal.", unchecked: true };

/** Fehlt nur Spalte oder Tabelle (älteres Admin Dashboard ohne access_mode), gibt es kein Beta. Alles andere ist ein Aussetzer der Datenbank. */
export function SchemaMissing(error: unknown): boolean {
    const errno = (error as { errno?: unknown } | null)?.errno;

    // ER_BAD_FIELD_ERROR und ER_NO_SUCH_TABLE.
    return errno === 1054 || errno === 1146;
}

/**
 * Zugang, wenn die Datenbank nicht antwortet (Entscheidung vom 24.10.2026). Bei
 * Free und Paid wie bisher lieber offen als alle ausgesperrt. Die Beta aber ist
 * eine Schranke: War sie zuletzt an, oder hat der Bot den Modus noch nie lesen
 * können, bleibt das Dashboard im Zweifel zu. Administrator und Developer kommen
 * immer herein.
 */
export function AccessWithoutDatabase(lastBeta: boolean | null, group: DashboardGroup | null): IShopAccess {
    if (lastBeta === false || (group !== null && BETA_FREE.includes(group))) return ALLOWED;

    return UNCHECKED;
}

/**
 * Läuft ein Zugang? Dieselbe Regel wie activeGrant im Admin-Server: Ein nicht
 * gekündigtes Abo gilt einen Tag über das Periodenende, weil Stripe die neue
 * Periode erst danach meldet.
 */
function Running(grant: IShopGrantRow, now: Date): boolean {
    const grace = grant.source === "subscription" && grant.cancel_at_period_end === 0 ? DAY_MS : 0;

    return grant.ended_at === null && grant.starts_at <= now && (grant.ends_at === null || grant.ends_at.getTime() + grace > now.getTime());
}

/** Eine Zeile aus shop_grants mit dem Titel des Produkts (fehlt bei Test und gelöschtem Produkt). */
export interface IShopStatusRow extends IShopGrantRow {
    readonly title: string | null;
}

/**
 * Die Antwort auf „Zugang anzeigen“ in der Shop-DM: eine Zeile je laufendem
 * Zugang, mit Discord-Zeitstempeln. Leer, wenn nichts läuft. „Läuft“ wie in
 * der Bezahlschranke (Running).
 */
export function ShopStatusLines(rows: readonly IShopStatusRow[], now: Date): string[] {
    return rows
        .filter((row) => Running(row, now))
        .map((row) => {
            const name = `**${row.source === "trial" ? "Test" : escapeMarkdown(row.title ?? "Zugang")}**`;
            if (row.ends_at === null) return `${name} läuft unbegrenzt.`;

            const unix = Math.floor(row.ends_at.getTime() / 1000);
            const when = `<t:${unix}:D> · <t:${unix}:R>`;

            if (row.source === "trial") return `${name} endet ${when}.`;
            if (row.source === "subscription" && row.cancel_at_period_end === 0) return `${name} läuft bis ${when} und verlängert sich dann.`;
            if (row.source === "subscription") return `${name} ist gekündigt und endet ${when}.`;

            return `${name} läuft bis ${when}.`;
        });
}

/** Für den Grund auf der Sperrseite: Er landet im HTML. */
export function EscapeHtml(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/**
 * Die Platzhalter der Sperrseite (zugang.html). Gesperrte bekommen den Weg zum
 * Support statt „Zugang holen“, denn kaufen können sie nicht. Der Grund wird maskiert.
 */
export function LockPlaceholders(access: IShopAccess, betaError: string | null = null): Record<"REASON" | "HINT" | "GO_PATH" | "GO_TEXT" | "GO_CLASS", string> {
    const reason = EscapeHtml(access.reason);

    // Die Datenbank antwortet nicht: weder Code-Feld noch Kauf, beides ginge gerade nicht.
    if (access.unchecked) {
        return { REASON: reason, HINT: '<p class="hintline">Deine Einstellungen sind davon nicht betroffen.</p>', GO_PATH: "/kontakt", GO_TEXT: "Support kontaktieren", GO_CLASS: "erract erract--go" };
    }

    // Beta: ein Feld für den Code statt „Zugang holen“. text/plain, weil der Server sonst nur JSON liest - und die Seite kommt ohne Skript aus.
    if (access.beta) {
        const error = betaError ? `<p class="betaform__error" role="alert">${EscapeHtml(betaError)}</p>` : "";

        return {
            REASON: `${reason} Mit deinem Beta-Code bist du sofort drin.`,
            HINT:
                `<form class="betaform" method="post" action="${DASHBOARD_PATH}/beta" enctype="text/plain">${error}` +
                `<label class="betaform__label" for="betacode">Beta-Code</label>` +
                `<div class="betaform__row"><input id="betacode" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="NXB-XXXX-XXXX" maxlength="20" required>` +
                `<button class="erract erract--go" type="submit">Einlösen</button></div></form>`,
            GO_PATH: "/kontakt",
            GO_TEXT: "Code anfragen",
            // Die Hauptaktion ist hier „Einlösen“, der Weg zum Support nur daneben.
            GO_CLASS: "erract",
        };
    }

    if (access.banned) return { REASON: reason, HINT: "", GO_PATH: "/kontakt", GO_TEXT: "Support kontaktieren", GO_CLASS: "erract erract--go" };

    return {
        REASON: `${reason} Mit einem Zugang geht es sofort weiter, deine Einstellungen bleiben erhalten.`,
        HINT: '<p class="hintline">Gerade gekauft? Lad die Seite in ein paar Sekunden neu.</p>',
        GO_PATH: "/preise",
        GO_TEXT: "Zugang holen",
        GO_CLASS: "erract erract--go",
    };
}

/**
 * Welche Gruppe das Dashboard anzeigt. Die freien Gruppen bleiben. Bei Free
 * Access (Schranke aus) ist jeder andere „Free“. Bei Paid Access ist, wer über
 * den Shop Zugang hat, „Zugang“, bei nur Tests „Testphase“. Ohne Kauf zählt
 * Premium nicht mehr (Entscheidung vom 17.10.2026); wer dann irgendwo moderiert,
 * auch als Co-Admin eines zahlenden Owners, ist Guardian, sonst Testphase (und
 * sieht die Sperrseite). Nur Anzeige, die Rechte regelt GuildsOf.
 */
export function DisplayGroup(group: DashboardGroup, access: IShopAccess, guilds: readonly Pick<IDashboardGuild, "role" | "canManage">[], paywall: boolean): DashboardGroup {
    if (FREE_GROUPS.includes(group)) return group;
    if (access.betaMember) return "beta";
    if (!paywall) return "free";
    if (access.viaShop) return access.trial ? "testphase" : "zugang";

    return guilds.some((guild) => guild.role === "Moderator" || (guild.role === "Admin" && !guild.canManage)) ? "guardian" : "testphase";
}

/** Die Regel, ohne Datenbank. */
export function ShopDecision(input: {
    readonly paywall: boolean;
    readonly group: DashboardGroup;
    readonly banned: boolean;
    readonly grants: readonly IShopGrantRow[];
    readonly now: Date;
}): IShopAccess {
    const runningGrants = input.grants.filter((grant) => Running(grant, input.now));
    const running = runningGrants.length > 0;
    const shop = runningGrants.every((grant) => grant.source === "trial") ? { ...VIA_SHOP, trial: true } : VIA_SHOP;

    if (!input.paywall || FREE_GROUPS.includes(input.group)) return running ? shop : ALLOWED;
    if (input.banned) return { allowed: false, reason: "Dein Konto ist für Käufe gesperrt. Wende dich bitte an den Support.", banned: true };
    if (running) return shop;

    // Ein Zugang, der erst später beginnt (etwa ein Einmalkauf hinter einem beendeten): den Beginn nennen.
    const upcoming = input.grants
        .filter((grant) => grant.ended_at === null && grant.starts_at > input.now)
        .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())[0];
    if (upcoming) return { allowed: false, reason: `Dein Zugang beginnt am ${BERLIN_DAY.format(upcoming.starts_at)}.` };

    // Der Grund kommt vom Zugang, der zuletzt geendet hat.
    const endOf = (grant: IShopGrantRow): number => (grant.ended_at ?? grant.ends_at)?.getTime() ?? 0;
    const last = [...input.grants].sort((a, b) => endOf(b) - endOf(a))[0];
    if (!last) return { allowed: false, reason: "Du hast noch keinen Zugang." };

    const end = last.ended_at ?? last.ends_at;
    const day = end ? BERLIN_DAY.format(end) : null;

    if (last.source === "trial") return { allowed: false, reason: day ? `Dein Test ist am ${day} abgelaufen.` : "Dein Test ist abgelaufen." };
    if (last.source === "subscription") return { allowed: false, reason: "Dein Abo ist beendet." };

    return { allowed: false, reason: day ? `Dein Zugang ist am ${day} abgelaufen.` : "Dein Zugang ist abgelaufen." };
}

export default class DashboardService implements IDashboardService {
    client: BotClient;

    // Die Sitzung steckt verschlüsselt im Cookie selbst, nicht in einem Speicher hier.
    // Deshalb übersteht ein Login jeden Neustart des Bots - siehe docs/Dashboard.md.
    // Die beiden Caches darunter sind reine Abkürzungen für Discord-Abfragen und
    // dürfen jederzeit leer sein.
    private guilds = new LRUCache<string, IDashboardGuild[]>({ max: MAX_SESSIONS, ttl: GUILD_CACHE_TTL });
    // Eine Seite fragt mehrere Routen auf einmal. Alle warten auf denselben Abruf der
    // Serverliste - jede für sich hätte Discord ab der zweiten mit 429 beantwortet.
    private guildsLoading = new Map<string, Promise<IDashboardGuild[]>>();

    // Läuft höchstens einmal gleichzeitig - sonst stößt jeder Seitenaufruf eine
    // weitere Mitglieder-Abfrage an.
    private warming: Promise<void> | null = null;
    private members = new LRUCache<string, IDashboardMemberFacts>({ max: MAX_SESSIONS, ttl: GUILD_CACHE_TTL });

    // Bezahlschranke: Zugang erlaubt eine Minute gemerkt, verweigert nur zehn
    // Sekunden - wer gerade gekauft hat, soll nicht eine Minute vor der Sperrseite stehen.
    private shopAccess = new LRUCache<string, IShopAccess>({ max: 5000, ttl: 60_000 });
    // Eine Serverseite fragt mehrere APIs auf einmal. Bei leerem Cache warten alle auf dieselbe Abfrage.
    private shopLoading = new Map<string, Promise<IShopAccess>>();
    private paywall: { readonly at: number; readonly on: boolean } | null = null;
    private betaMode: { readonly at: number; readonly on: boolean } | null = null;
    /** Der zuletzt gelesene Beta-Modus, ohne Ablauf. null: noch nie gelesen. Gilt, wenn die Datenbank nicht antwortet. */
    private lastBeta: boolean | null = null;
    private shopWarnedAt = 0;

    constructor(client: BotClient) {
        this.client = client;
    }

    get ClientId(): string {
        const { developerMode, config } = this.client;

        return developerMode ? config.DEV_CLIENT_ID : config.CLIENT_ID;
    }

    private get ClientSecret(): string {
        const { developerMode, config } = this.client;

        return developerMode ? config.DEV_CLIENT_SECRET : config.CLIENT_SECRET;
    }

    // Muss Zeichen für Zeichen mit dem Redirect im Developer Portal übereinstimmen.
    get RedirectURI(): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/callback`;
    }

    get Secure(): boolean {
        return this.RedirectURI.startsWith("https:");
    }

    get IsConfigured(): boolean {
        return Boolean(this.ClientId && this.ClientSecret);
    }

    AuthorizeURL(state: string): string {
        const query = new URLSearchParams({
            client_id: this.ClientId,
            redirect_uri: this.RedirectURI,
            response_type: "code",
            scope: OAUTH_SCOPES.join(" "),
            state,
        });

        return `https://discord.com/oauth2/authorize?${query}`;
    }

    InviteURL(guildId?: string): string {
        const query = new URLSearchParams({
            client_id: this.ClientId,
            permissions: INVITE_PERMISSIONS,
            scope: "bot applications.commands",
        });

        if (guildId) {
            query.set("guild_id", guildId);
            query.set("disable_guild_select", "true");
        }

        return `https://discord.com/oauth2/authorize?${query}`;
    }

    /**
     * Die Gruppe eines Nutzers. Administrator, Partner und Premium stehen in der
     * Datenbank (dashboard_groups, von Hand eingetragen). Developer kommt aus
     * DEV_USER_IDs.
     *
     * Ohne Datenbank bleibt nur Developer übrig, alle anderen sind Testphase.
     */
    async GroupOf(userId: string): Promise<DashboardGroup> {
        const stored = this.client.databaseService.Ready ? await this.client.groups.Of(userId) : null;

        // Administrator steht über Developer - wer beides hat, ist Administrator.
        if (stored === "administrator") return "administrator";
        if (this.client.config.DEV_USER_IDs.includes(userId)) return "developer";

        return stored ?? "testphase";
    }

    async IsStaff(userId: string): Promise<boolean> {
        const group = await this.GroupOf(userId);

        return group === "administrator" || group === "developer";
    }

    // Ohne das Members-Intent bleibt der Mitglieder-Cache leer und es gibt keine
    // Bot-Zahl. Mit Intent holt discord.js die Liste einmal und hält sie danach
    // über die Gateway-Ereignisse selbst aktuell.
    Warm(): void {
        if (!this.client.config.GUILD_MEMBER_INTENT || this.warming) return;

        this.warming = this.FetchMembers().finally(() => {
            this.warming = null;
        });
    }

    private async FetchMembers(): Promise<void> {
        for (const guild of this.client.guilds.cache.values()) {
            if (guild.members.cache.size >= guild.memberCount) continue;

            try {
                await guild.members.fetch();
            } catch (error) {
                // Ein Server, dessen Liste nicht kommt, kostet nur seine Bot-Zahl.
                logger.warn(`Mitgliederliste von ${guild.name} nicht abrufbar: ${String(error)}`);
            }
        }
    }

    async Exchange(code: string): Promise<IDashboardSession> {
        const response = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: this.ClientId,
                client_secret: this.ClientSecret,
                grant_type: "authorization_code",
                code,
                redirect_uri: this.RedirectURI,
            }),
        });

        if (!response.ok) {
            throw new Error(
                `Discord hat den Code abgelehnt (${response.status}). Pruefe Client Secret und Redirect URI.`
            );
        }

        const token = (await response.json()) as { access_token: string; expires_in: number };
        const user = await this.Fetch<IRawUser>("/users/@me", token.access_token);

        // Ohne Zwei-Faktor bei Discord kommt hier niemand herein. Die Anmeldung
        // haengt vollstaendig an diesem einen Konto - ist es schwach gesichert,
        // ist es das Dashboard auch.
        //
        // Geprueft wird auf genau true: fehlt das Feld, gilt das als "nicht
        // bestaetigt" und nicht als "wird schon passen". Bei einer Regel, die
        // Zugang gewaehrt, ist die vorsichtige Auslegung die richtige.
        if (user.mfa_enabled !== true) {
            logger.warn(`🔒 Anmeldung ohne Zwei-Faktor abgewiesen: ${user.username} (${user.id})`);

            throw new MfaRequired();
        }

        const session: IDashboardSession = {
            id: randomBytes(32).toString("base64url"),
            userId: user.id,
            username: user.global_name?.trim() || user.username,
            handle: user.username,
            email: user.email ?? null,
            avatar: user.avatar,
            accessToken: token.access_token,
            mfa: true,
            expiresAt: Date.now() + token.expires_in * 1000,
        };

        logger.user(`🔐 Dashboard-Login: ${session.username} (${session.userId})`);

        await this.SaveConnections(session).catch(() => undefined);

        return session;
    }

    /**
     * Twitch- und YouTube-Verknüpfungen des Nutzers merken (Scope "connections").
     * Damit erkennt der Notifier, welcher Discord-Account zu einem Streamer
     * gehört. Nur bestätigte Verknüpfungen, und nur diese beiden Dienste -
     * alles andere geht den Bot nichts an.
     */
    private async SaveConnections(session: IDashboardSession): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const raw = await this.Fetch<{ type: string; id: string; name: string; verified?: boolean }[]>("/users/@me/connections", session.accessToken);
        const wanted = raw
            .filter((entry) => entry.verified !== false && (entry.type === "twitch" || entry.type === "youtube"))
            .map((entry) => ({ platform: entry.type as "twitch" | "youtube", accountId: entry.id, name: entry.name }));

        await this.client.userConnections.Replace(session.userId, wanted);
    }

    Sign(session: IDashboardSession): string {
        return Seal(session, this.client.config.SERVER_JWT_SECRET);
    }

    // Das Cookie trägt die ganze Sitzung, mit SERVER_JWT_SECRET verschlüsselt.
    // Der Browser sieht nur einen undurchsichtigen Block, und der Bot braucht
    // keinen Speicher, der einen Neustart überleben müsste.
    Session(cookie: string | undefined): IDashboardSession | null {
        const session = Open<IDashboardSession>(cookie ?? "", this.client.config.SERVER_JWT_SECRET);

        // Der Inhalt ist echt (GCM prüft das), aber er kann aus einer älteren
        // Version stammen. Deshalb wird die Form trotzdem geprüft.
        if (!session || typeof session !== "object") return null;
        if (typeof session.id !== "string" || !session.id) return null;
        if (typeof session.userId !== "string" || !session.userId) return null;
        if (typeof session.accessToken !== "string" || !session.accessToken) return null;
        if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) return null;

        // Cookies von vor der Zwei-Faktor-Pflicht tragen das Merkmal nicht. Sie
        // gelten damit nicht mehr - sonst liefe die Regel sieben Tage lang an
        // allen vorbei, die gerade angemeldet sind. Kostet einmal ein neues
        // Anmelden, und genau dabei wird geprueft.
        if (session.mfa !== true) return null;

        return session;
    }

    // Räumt die Caches. Die Sitzung selbst lebt im Cookie - die beendet erst der
    // Aufrufer, indem er es löscht (siehe DashboardLogout).
    Destroy(session: IDashboardSession): void {
        this.guilds.delete(session.id);

        // Erst einsammeln, dann löschen - während der Iteration zu mutieren
        // überspringt sonst Einträge.
        for (const key of [...this.members.keys()]) {
            if (key.startsWith(`${session.id}:`)) this.members.delete(key);
        }
    }

    async Payload(session: IDashboardSession): Promise<IDashboardPayload> {
        const guilds = await this.GuildsOf(session);
        const user = await this.User(session);

        // Free, Zugang aus dem Shop, Guardian oder Testphase (siehe DisplayGroup).
        user.group = DisplayGroup(user.group, await this.ShopAccess(session.userId), guilds, await this.Paywall());

        return { user, guilds, inviteURL: this.InviteURL() };
    }

    /** Zugang laut Shop, mit Cache. Wirft nie: Kann der Bot die Tabellen nicht lesen, bleibt die Schranke offen. */
    async ShopAccess(userId: string): Promise<IShopAccess> {
        const cached = this.shopAccess.get(userId);
        if (cached) return cached;

        const running = this.shopLoading.get(userId);
        if (running) return running;

        const job = this.LoadShopAccess(userId).finally(() => this.shopLoading.delete(userId));
        this.shopLoading.set(userId, job);

        return job;
    }

    private async LoadShopAccess(userId: string): Promise<IShopAccess> {
        let access: IShopAccess;

        try {
            const paywall = await this.Paywall();
            const group = await this.GroupOf(userId);
            // Beta-Modus vor allem anderen: Dann zählt nur der Code (BetaGate).
            const betaMode = await this.BetaMode();
            const gate = betaMode && !BETA_FREE.includes(group) ? BetaGate({ betaMode, group, member: await this.BetaMember(userId) }) : null;

            if (gate) {
                access = gate;
            } else if (FREE_GROUPS.includes(group) || !this.client.databaseService.Ready) {
                // Freie Gruppen brauchen nichts aus dem Shop. Ohne Datenbank: offen.
                access = ALLOWED;
            } else {
                const db = this.client.databaseService;
                const customer = await db.One<{ banned_at: Date | null }>("SELECT banned_at FROM shop_customers WHERE user_id = ?", [userId]);
                const grants = await db.Query<IShopGrantRow>("SELECT source, starts_at, ends_at, ended_at, cancel_at_period_end FROM shop_grants WHERE user_id = ?", [userId]);

                access = ShopDecision({ paywall, group, banned: customer?.banned_at != null, grants, now: new Date() });
            }
        } catch (error) {
            // Bei Free und Paid offen, in der Beta im Zweifel zu (AccessWithoutDatabase). Nicht
            // merken: Der nächste Aufruf versucht es wieder. Developer stehen in der .env, nicht in der Datenbank.
            const group = await this.GroupOf(userId).catch((): DashboardGroup | null => (this.client.config.DEV_USER_IDs.includes(userId) ? "developer" : null));
            const fallback = AccessWithoutDatabase(this.lastBeta, group);

            if (Date.now() - this.shopWarnedAt > 60_000) {
                this.shopWarnedAt = Date.now();
                logger.warn(`Zugang aus dem Shop nicht lesbar, das Dashboard bleibt ${fallback.allowed ? "offen" : "im Zweifel zu (Beta)"}: ${String(error)}`);
            }

            return fallback;
        }

        this.shopAccess.set(userId, access, { ttl: access.allowed ? 60_000 : 10_000 });

        return access;
    }

    /** Nach dem Einlösen eines Codes: gleich neu fragen, nicht erst nach zehn Sekunden. */
    ForgetAccess(userId: string): void {
        this.shopAccess.delete(userId);
    }

    /**
     * Beta-Modus (shop_settings.access_mode = 'beta'), eine Minute gemerkt. Ohne
     * eingerichtete Datenbank, Tabelle oder Spalte: aus. Ist die Datenbank
     * eingerichtet, antwortet aber nicht, wirft es: LoadShopAccess entscheidet
     * dann mit dem zuletzt gelesenen Stand.
     */
    private async BetaMode(): Promise<boolean> {
        if (this.betaMode && Date.now() - this.betaMode.at < 60_000) return this.betaMode.on;

        const db = this.client.databaseService;
        let on = false;

        if (db.IsConfigured) {
            if (!db.Ready) throw new Error("Datenbank nicht verbunden");

            try {
                const row = await db.One<{ access_mode: string }>("SELECT access_mode FROM shop_settings WHERE id = 1");
                on = row?.access_mode === "beta";
            } catch (error) {
                // Älterer Stand des Admin Dashboards ohne access_mode: kein Beta.
                if (!SchemaMissing(error)) throw error;
            }
        }

        this.betaMode = { at: Date.now(), on };
        this.lastBeta = on;

        return on;
    }

    /**
     * Hat die Person einen Beta-Code eingelöst? Ein Datenbankfehler geht nach
     * oben: LoadShopAccess sperrt dann im Zweifel, ohne es zu merken - der
     * nächste Aufruf fragt wieder (Entscheidung vom 24.10.2026).
     */
    private async BetaMember(userId: string): Promise<boolean> {
        return (await this.client.databaseService.One<{ user_id: string }>("SELECT user_id FROM beta_members WHERE user_id = ?", [userId])) != null;
    }

    /** shop_settings.paywall, eine Minute gemerkt. Ohne Datenbank oder Tabelle: aus. */
    private async Paywall(): Promise<boolean> {
        if (this.paywall && Date.now() - this.paywall.at < 60_000) return this.paywall.on;

        let on = false;

        if (this.client.databaseService.Ready) {
            try {
                const row = await this.client.databaseService.One<{ paywall: number }>("SELECT paywall FROM shop_settings WHERE id = 1");
                on = row?.paywall === 1;
            } catch {
                // Tabelle fehlt (kein Admin Dashboard): Schranke aus.
                on = false;
            }
        }

        this.paywall = { at: Date.now(), on };

        return on;
    }

    /** Der Owner eines Servers, auf dem der Bot sitzt. In den Checks ersetzbar. */
    OwnerOf(guildId: string): string | null {
        return this.client.guilds.cache.get(guildId)?.ownerId ?? null;
    }

    /**
     * Die Serverliste hinter der Bezahlschranke. Mit Zugang die ganze Liste. Ohne
     * nur Server, auf denen die Person Moderator ist und deren Owner Zugang hat:
     * Dort sieht sie als Guardian wie heute Tickets, Transcripts und Moderation.
     */
    async Paywalled(userId: string, list: IDashboardGuild[]): Promise<IDashboardGuild[]> {
        const access = await this.ShopAccess(userId);

        if (access.allowed) return list;
        // Beta-Modus ohne Code: auch kein Guardian. Herein kommt nur, wer einen Code hat.
        // Dasselbe, wenn sich das gerade nicht prüfen lässt.
        if (access.beta || access.unchecked) return [];

        const kept: IDashboardGuild[] = [];

        for (const guild of list) {
            // Moderatoren und Co-Admins (Discord-Recht „Server verwalten“). Der eigene Server ohne eigenen Kauf bleibt weg.
            if (guild.role !== "Moderator" && guild.role !== "Admin") continue;

            const owner = this.OwnerOf(guild.id);
            if (owner === null || !(await this.ShopAccess(owner)).allowed) continue;

            // Co-Admins sehen den Server wie ein Guardian: Moderation, Tickets, Transcripts, aber kein Verwalten der Module.
            kept.push(guild.role === "Admin" ? { ...guild, canManage: false, canModerate: true, canReview: true } : guild);
        }

        return kept;
    }

    /** Für Routen, die nicht über GuildsOf gehen (Bewerbungen, Transcripts): eigener Zugang oder zahlender Owner. */
    /** Für den Knopf „Zugang anzeigen“ (ShopButtons): die Zeilen aus ShopStatusLines. null ohne Datenbank. */
    async ShopStatus(userId: string): Promise<string[] | null> {
        const db = this.client.databaseService;
        if (!db.Ready) return null;

        const rows = await db.Query<IShopStatusRow>(
            "SELECT g.source, g.starts_at, g.ends_at, g.ended_at, g.cancel_at_period_end, p.title FROM shop_grants g LEFT JOIN shop_products p ON p.id = g.product_id WHERE g.user_id = ?",
            [userId]
        );

        return ShopStatusLines(rows, new Date());
    }

    async GuildAllowed(userId: string, guildId: string): Promise<boolean> {
        const access = await this.ShopAccess(userId);

        if (access.allowed) return true;
        if (access.beta || access.unchecked) return false;

        const owner = this.OwnerOf(guildId);

        return owner !== null && (await this.ShopAccess(owner)).allowed;
    }

    /** Für Start- und Serverseite: der Grund für die Sperrseite, oder null, wenn die Person herein darf. */
    async Locked(session: IDashboardSession): Promise<IShopAccess | null> {
        try {
            const access = await this.ShopAccess(session.userId);
            if (access.allowed) return null;

            return (await this.GuildsOf(session)).length === 0 ? access : null;
        } catch {
            // Etwa ein abgelaufener Discord-Token: Das klärt die Seite selbst über /api/me.
            return null;
        }
    }

    // Wirft SessionExpired weiter nach oben. Seit die Sitzung im Cookie steckt,
    // kann der Service sie nicht mehr selbst für ungültig erklären - nur die Route
    // kann das Cookie löschen. Ein null als Rückgabe wäre hier mehrdeutig.
    private async GuildsOf(session: IDashboardSession): Promise<IDashboardGuild[]> {
        try {
            // Der Filter sitzt hier, damit er für jede Dashboard-API gilt, die über diese Liste prüft.
            return await this.Paywalled(session.userId, await this.Guilds(session));
        } catch (error) {
            if (error instanceof SessionExpired) this.Destroy(session);

            throw error;
        }
    }

    // Detailseite: alles echt. Der Bot-Cache liefert die Serverzahlen ohne einen
    // einzigen API-Aufruf, guilds.members.read den Nutzer auf genau diesem Server.
    async Detail(session: IDashboardSession, guildId: string): Promise<IDashboardGuildDetail | null> {
        const guilds = await this.GuildsOf(session);
        const guild = guilds.find((entry) => entry.id === guildId);

        // Nicht gefunden heißt: der Nutzer darf diesen Server hier nicht sehen.
        if (!guild) return null;

        const known = this.client.guilds.cache.get(guildId);

        const server: IDashboardServerFacts | null = known
            ? {
                  channels: known.channels.cache.size,
                  roles: known.roles.cache.size,
                  boosts: known.premiumSubscriptionCount ?? 0,
                  boostTier: Number(known.premiumTier) || 0,
                  isOwner: known.ownerId === session.userId,
              }
            : null;

        return {
            guild,
            server,
            member: await this.Member(session, guildId),
            modules: await this.ModulesOn(guildId),
        };
    }

    /**
     * Schaltet ein Modul an oder aus. null heißt: der Nutzer darf diesen Server
     * nicht verwalten - Staff-Zugriff allein reicht dafür nicht, wie überall im
     * Dashboard. Wirft SessionExpired.
     */
    async SetModule(
        session: IDashboardSession,
        guildId: string,
        moduleId: ModuleId,
        on: boolean
    ): Promise<string[] | null> {
        const guild = (await this.GuildsOf(session)).find((entry) => entry.id === guildId);

        if (!guild?.canManage) return null;

        // ponytail: Toggle() liest und schreibt die ganze Liste. Zwei Admins, die
        // im selben Augenblick schalten, können sich überschreiben - wird das je
        // ein Thema, gehört es in eine Transaktion mit SELECT ... FOR UPDATE.
        const modules = await this.client.settings.Toggle(guildId, moduleId, on);

        // Die Serverliste dieser Sitzung zeigt den neuen Stand sofort, nicht erst
        // nach Ablauf ihres Caches.
        guild.modules = modules;

        return modules;
    }

    /**
     * Darf diese Sitzung den Server verwalten? Dieselbe Frage, die SetModule
     * stellt - die Galerie-Routen stellen sie auch, und sie soll an genau einer
     * Stelle beantwortet werden. Wirft SessionExpired.
     */
    async CanManage(session: IDashboardSession, guildId: string): Promise<boolean> {
        const guild = (await this.GuildsOf(session)).find((entry) => entry.id === guildId);

        return Boolean(guild?.canManage);
    }

    /**
     * Darf diese Sitzung Live Tickets und Transcriptions dieses Servers nutzen?
     * Wer verwaltet, Moderatoren und wer eine Support-Rolle des Ticket-Systems hat. Welche
     * Tickets davon, entscheidet danach jedes Ticket selbst. Wirft SessionExpired.
     */
    async CanSupport(session: IDashboardSession, guildId: string): Promise<boolean> {
        const guild = (await this.GuildsOf(session)).find((entry) => entry.id === guildId);

        return Boolean(guild?.canSupport);
    }

    /** Moderation: wer verwaltet und wer auf der Moderatoren-Liste steht. Wirft SessionExpired. */
    async CanModerate(session: IDashboardSession, guildId: string): Promise<boolean> {
        const guild = (await this.GuildsOf(session)).find((entry) => entry.id === guildId);

        return Boolean(guild?.canModerate);
    }

    // Frisch aus der Datenbank statt aus der zwischengespeicherten Serverliste,
    // sonst stünde nach dem Umschalten bis zu einer Minute der alte Stand da.
    // null heißt: ohne Datenbank lässt sich nichts schalten.
    private async ModulesOn(guildId: string): Promise<string[] | null> {
        if (!this.client.databaseService.Ready) return null;

        try {
            return (await this.client.settings.Of(guildId)).modules;
        } catch (error) {
            logger.warn(`🗄️  Dashboard: Module von ${guildId} nicht ladbar - ${String(error)}`);

            return null;
        }
    }

    /**
     * Die Aktivität eines Servers für die Übersicht. null heißt: der Nutzer darf
     * ihn nicht sehen. "offline" heißt: ohne Datenbank wird nicht gezählt, und
     * es gibt nichts zu zeigen. Wirft SessionExpired.
     */
    async Activity(session: IDashboardSession, guildId: string): Promise<IDashboardActivity | "offline" | null> {
        const guild = (await this.GuildsOf(session)).find((entry) => entry.id === guildId);

        // Moderatoren sehen Tickets, nicht die Zahlen des Servers - darin stehen Namen.
        if (!guild || guild.role === "Moderator") return null;
        if (!this.client.databaseService.Ready) return "offline";

        return this.client.activityService.Overview(guildId);
    }

    private async Member(session: IDashboardSession, guildId: string): Promise<IDashboardMemberFacts | null> {
        const cacheKey = `${session.id}:${guildId}`;
        const cached = this.members.get(cacheKey);

        if (cached) return cached;

        let raw: IRawMember;

        try {
            raw = await this.Fetch<IRawMember>(`/users/@me/guilds/${guildId}/member`, session.accessToken);
        } catch (error) {
            // Fehlt der Scope oder ist der Nutzer nicht mehr Mitglied, bleibt der
            // Block einfach leer - die Seite funktioniert ohne ihn weiter.
            if (error instanceof SessionExpired) throw error;

            return null;
        }

        const facts: IDashboardMemberFacts = {
            nick: raw.nick?.trim() || null,
            joinedAt: raw.joined_at ?? null,
            roles: Array.isArray(raw.roles) ? raw.roles.length : 0,
        };

        this.members.set(cacheKey, facts);

        return facts;
    }

    private async User(session: IDashboardSession): Promise<IDashboardUser> {
        return {
            id: session.userId,
            name: session.username,
            handle: session.handle ?? "",
            email: session.email ?? null,
            avatar: AvatarURL(session.userId, session.avatar),
            group: await this.GroupOf(session.userId),
        };
    }

    private async Guilds(session: IDashboardSession): Promise<IDashboardGuild[]> {
        const cached = this.guilds.get(session.id);
        if (cached) return cached;

        const running = this.guildsLoading.get(session.id);
        if (running) return running;

        const job = this.LoadGuilds(session).finally(() => this.guildsLoading.delete(session.id));

        this.guildsLoading.set(session.id, job);

        return job;
    }

    private async LoadGuilds(session: IDashboardSession): Promise<IDashboardGuild[]> {
        // Nachziehen, was beim Start gefehlt hat - etwa ein Server, auf den der
        // Bot erst danach eingeladen wurde. Bewusst ohne await: die Zahl steht
        // dann beim nächsten Aufbau der Liste da.
        this.Warm();

        const raw = await this.Fetch<IRawGuild[]>("/users/@me/guilds?with_counts=true", session.accessToken);

        // Erst sammeln, welche Server überhaupt in die Liste gehören - danach
        // stehen die IDs fest und Teams und Module kommen in zwei Abfragen für
        // alle auf einmal statt in einer je Karte.
        const picked = new Map<string, { raw: IRawGuild; role: DashboardRole; canManage: boolean; canModerate: boolean; canReview: boolean }>();

        for (const guild of raw) {
            const permissions = this.Permissions(guild.permissions);
            const admin = (permissions & ADMINISTRATOR) !== 0n || (permissions & MANAGE_GUILD) !== 0n;

            if (!guild.owner && !admin) continue;

            picked.set(guild.id, { raw: guild, role: guild.owner ? "Owner" : "Admin", canManage: true, canModerate: true, canReview: true });
        }

        // Moderatoren und Pruefer: kein Verwalten, aber auf einer Liste des Servers.
        for (const { raw: guild, moderate, review } of await this.Supported(session.userId, raw.filter((entry) => !picked.has(entry.id)))) {
            picked.set(guild.id, { raw: guild, role: "Moderator", canManage: false, canModerate: moderate, canReview: review });
        }

        // Entwickler und Seiten-Admins sehen zusätzlich jeden Server, auf dem der Bot
        // sitzt. Bearbeiten dürfen sie dort nur mit eigener Berechtigung (canManage).
        if (await this.IsStaff(session.userId)) {
            for (const guild of this.client.guilds.cache.values()) {
                if (picked.has(guild.id)) continue;

                picked.set(guild.id, {
                    raw: { id: guild.id, name: guild.name, icon: guild.icon, permissions: "0" },
                    role: "Staff",
                    canManage: false,
                    canModerate: false,
                    canReview: false,
                });
            }
        }

        const facts = await this.Facts([...picked.keys()]);

        const list = [...picked.values()]
            .map((entry) => this.Card(entry.raw, entry.role, entry.canManage, entry.canModerate, entry.canReview, facts))
            .sort(
            (a, b) => Number(b.active) - Number(a.active) || b.members - a.members || a.name.localeCompare(b.name)
        );

        this.guilds.set(session.id, list);

        return list;
    }

    // Ohne Datenbank bleibt beides leer - die Karten zeigen dann 0 Teams und
    // keine Module, statt die Seite an einem Fehler scheitern zu lassen.
    private async Facts(guildIds: string[]): Promise<IGuildFacts> {
        const empty: IGuildFacts = { teams: new Map(), modules: new Map() };

        if (guildIds.length === 0 || !this.client.databaseService.Ready) return empty;

        try {
            const [teams, modules] = await Promise.all([
                this.client.teams.CountsOf(guildIds),
                this.client.settings.ModulesOf(guildIds),
            ]);

            return { teams, modules };
        } catch (error) {
            logger.warn(`🗄️  Dashboard: Teams und Module nicht ladbar - ${String(error)}`);

            return empty;
        }
    }

    /**
     * Die Server, auf denen der User Moderator ist: selbst eingetragen, über eine
     * Moderatoren-Rolle oder eine Support-Rolle (die allgemeine oder die eines
     * Themas). Nur wo der Bot sitzt und das Modul an ist; die Rollen kennt der
     * Bot, Discords Liste nennt sie nicht. moderate: auch die Moderation - die
     * gibt es nur über die Moderatoren-Liste, nicht über eine Support-Rolle.
     */
    private async Supported(userId: string, candidates: IRawGuild[]): Promise<{ raw: IRawGuild; moderate: boolean; review: boolean }[]> {
        const present = candidates.filter((guild) => this.client.guilds.cache.has(guild.id));

        if (present.length === 0 || !this.client.databaseService.Ready) return [];

        try {
            const modules = await this.client.settings.ModulesOf(present.map((guild) => guild.id));
            const found: { raw: IRawGuild; moderate: boolean; review: boolean }[] = [];

            for (const raw of present) {
                const on = modules.get(raw.id) ?? [];
                const tickets = on.includes("tickets");
                const apply = on.includes("apply");

                // Moderatoren brauchen etwas, das sie betreuen: Tickets, Moderation - oder Bewerbungen.
                if (!tickets && !apply && !on.includes("moderation")) continue;

                const { moderators } = await this.client.settings.Of(raw.id);
                const config = tickets ? await this.client.ticketSettings.Of(raw.id) : null;
                const roles = [
                    ...moderators.roles,
                    ...(config ? [config.supportRoleId, ...config.options.map((option) => option.supportRoleId)] : []),
                ].filter((role): role is string => Boolean(role));

                const review = apply ? await this.client.applyService.Settings(raw.id) : null;

                if (roles.length === 0 && !moderators.users.includes(userId) && !review?.reviewRoles.length && !review?.reviewUsers.includes(userId)) continue;

                const guild = this.client.guilds.cache.get(raw.id)!;
                const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

                if (!member) continue;

                // Moderator: einzeln eingetragen oder über eine Rolle; dazu die Support-Rollen.
                const listed = moderators.users.includes(userId) || moderators.roles.some((role) => member.roles.cache.has(role));
                // Pruefer: eigene Liste im Apply System.
                const reviews = Boolean(review && (review.reviewUsers.includes(userId) || review.reviewRoles.some((role) => member.roles.cache.has(role))));

                if (listed || reviews || roles.some((role) => member.roles.cache.has(role))) {
                    found.push({ raw, moderate: listed && on.includes("moderation"), review: reviews });
                }
            }

            return found;
        } catch (error) {
            logger.warn(`🗄️  Dashboard: Support-Rollen nicht prüfbar - ${String(error)}`);

            return [];
        }
    }

    private Card(guild: IRawGuild, role: DashboardRole, canManage: boolean, canModerate: boolean, canReview: boolean, facts: IGuildFacts): IDashboardGuild {
        const known = this.client.guilds.cache.get(guild.id);

        // Nur zählen, wenn die Liste vollständig ist. Ein halb gefüllter Cache
        // ergäbe eine Zahl, die zu niedrig ist und trotzdem echt aussieht.
        const complete = known ? known.members.cache.size >= known.memberCount : false;

        return {
            id: guild.id,
            name: guild.name,
            tag: Initials(guild.name),
            icon: IconURL(guild.id, guild.icon),
            // Der Bot kennt seine eigenen Server genauer als die Näherung aus der OAuth-Liste.
            members: known?.memberCount ?? guild.approximate_member_count ?? 0,
            bots: complete ? known!.members.cache.filter((member) => member.user.bot).size : null,
            active: Boolean(known),
            role,
            canManage,
            canSupport: canManage || role === "Moderator",
            canModerate,
            canReview,
            created: CreatedAt(guild.id).toISOString(),
            joined: known ? new Date(known.joinedTimestamp).toISOString() : null,
            teams: facts.teams.get(guild.id) ?? 0,
            modules: facts.modules.get(guild.id) ?? [],
            ...CrestColors(guild.id),
        };
    }

    private Permissions(value: string): bigint {
        try {
            return BigInt(value);
        } catch {
            return 0n;
        }
    }

    private async Fetch<T>(endpoint: string, accessToken: string, retry = true): Promise<T> {
        const response = await fetch(`${DISCORD_API}${endpoint}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 401) throw new SessionExpired();

        // Zu viele Anfragen: Discord sagt, wie lange. Kurz warten und einmal nachfassen.
        if (response.status === 429 && retry) {
            const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
            const seconds = Number(body.retry_after ?? response.headers.get("retry-after") ?? 1);
            const wait = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds * 1000)) : 1000;

            if (wait <= MAX_RETRY_WAIT) {
                await new Promise((resolve) => setTimeout(resolve, wait));

                return this.Fetch<T>(endpoint, accessToken, false);
            }
        }

        if (!response.ok) throw new Error(`Discord ${endpoint} antwortete mit ${response.status}.`);

        return (await response.json()) as T;
    }
}
