import { useEffect, useState } from "react";
import type { IMember, IMemberLink } from "../domain/interfaces/IMember";
import type { IModuleDefinition } from "../domain/interfaces/IModule";
import type { IModuleDetail } from "../domain/interfaces/IModuleDetail";

/**
 * Inhalte aus dem Admin Dashboard.
 *
 * Banner, Team, Module und Modultexte lassen sich dort bearbeiten. nginx
 * liefert sie unter `/content/<datei>`: zuerst den gespeicherten Stand, sonst
 * den Standard aus diesem Build. Bei jedem Fehler (zu langsam, kaputt, falsche
 * Form) gelten die eingebauten Daten. Die Seite fällt also nie wegen einer
 * Datei aus.
 *
 * Die Prüfregeln sind grob: Sie fangen ab, woran die Seite zerbräche, und
 * jeden Link, der kein https und kein eigener Pfad ist. Was die Inhalte genau
 * dürfen, prüft der Admin-Server beim Speichern.
 *
 * Nur wegstreichbare Syntax und Wert-Importe nur aus `react`: `npm run check`
 * lädt die Datei direkt in Node.
 */

/** Ein geladener Inhalt samt Revision. Die Revision merkt sich das Banner beim Wegklicken. */
export interface ILoaded<T> {
    readonly data: T;
    readonly revision: number;
}

/** Die Arten des Banners. Farbe und Symbol stehen in Banner.tsx. */
export type BannerKind = "info" | "update" | "event" | "wartung" | "stoerung";

export interface IBanner {
    readonly enabled: boolean;
    readonly kind: BannerKind;
    /** Darf leer sein, dann steht nur der Text da. */
    readonly title: string;
    readonly text: string;
    readonly link?: { readonly href: string; readonly label: string };
    /** ISO. Vorher und nachher zeigt die Seite den Banner nicht. */
    readonly showFrom?: string;
    readonly showUntil?: string;
    /** ISO. Bis dahin läuft ein Countdown. */
    readonly countdownTo?: string;
}

/**
 * So steht der Banner in banner.json. Bis Oktober 2026 hieß die Art `tone`
 * und kannte nur info und warn. Ein alter Stand soll nach dem Umstieg nicht
 * verschwinden, also geht er weiter durch und wird mit `toBanner` neu.
 */
export interface IStoredBanner extends Omit<IBanner, "kind" | "title"> {
    readonly kind?: BannerKind;
    readonly tone?: "info" | "warn";
    readonly title?: string;
}

export type BannerState = "aus" | "sichtbar" | "geplant" | "abgelaufen";

export interface IOpenRole {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
}

export interface ITeamContent {
    readonly members: readonly IMember[];
    readonly openRoles: readonly IOpenRole[];
}

export interface IModulesContent {
    readonly modules: readonly IModuleDefinition[];
}

/** Welche Kategorien und Status es gibt. Kommt von außen, weil die Enums nicht unter Node laufen. */
export interface IModuleValues {
    /** Ohne Liste wird die Kategorie nicht geprüft: Unbekannte bekommen auf der Seite eine neutrale Farbe. */
    readonly categories?: readonly string[];
    readonly statuses: readonly string[];
}

const TIMEOUT = 2000;
const MODULE_ID = /^[a-z][a-z0-9-]*$/;
const SHOWCASES: readonly unknown[] = ["rank-card", "team-roster"];
const BANNER_KINDS: readonly unknown[] = ["info", "update", "event", "wartung", "stoerung"];

/** Eine Farbe der Seite, auch als Mischung aus zweien. Nichts, worin ein `url()` stehen könnte. */
const COLOR = /^(?:var\(--c-[a-z0-9-]+\)|color-mix\(in srgb, var\(--c-[a-z0-9-]+\) \d{1,3}%, var\(--c-[a-z0-9-]+\)\))$/;

type Shape = Record<string, unknown>;

function isShape(value: unknown): value is Shape {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
    return typeof value === "string";
}

function isTextList(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(isText);
}

function isListOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is readonly T[] {
    return Array.isArray(value) && value.every(isItem);
}

/** Nur `https://…` oder ein eigener Pfad mit `/` vorn. Alles andere, vor allem `javascript:`, liefe im `href` als Code. */
export function isSafeLink(href: unknown): href is string {
    if (typeof href !== "string") return false;
    if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");

    return URL.canParse(href) && new URL(href).protocol === "https:";
}

export function isColor(value: unknown): value is string {
    return typeof value === "string" && COLOR.test(value);
}

/** Ein Zeitpunkt, der fehlen darf. */
function isMoment(value: unknown): boolean {
    return value === undefined || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

export function isBanner(data: unknown): data is IStoredBanner {
    if (!isShape(data)) return false;

    const link = data.link;
    const linkOk = link === undefined || (isShape(link) && isSafeLink(link.href) && isText(link.label));
    const kindOk = data.kind === undefined ? data.tone === "info" || data.tone === "warn" : BANNER_KINDS.includes(data.kind);

    return (
        typeof data.enabled === "boolean" &&
        kindOk &&
        (data.title === undefined || isText(data.title)) &&
        isText(data.text) &&
        linkOk &&
        [data.showFrom, data.showUntil, data.countdownTo].every(isMoment)
    );
}

/** Ein gespeicherter Banner in der neuen Form: `warn` von früher wird zur Störung. */
export function toBanner(data: IStoredBanner): IBanner {
    const { tone, ...rest } = data;

    return { ...rest, kind: data.kind ?? (tone === "warn" ? "stoerung" : "info"), title: data.title ?? "" };
}

/** Was der Banner gerade zeigt. Dieselbe Rechnung steht im Admin Dashboard (shared/content.ts). */
export function bannerState(banner: IBanner, now = Date.now()): BannerState {
    if (!banner.enabled) return "aus";
    if (banner.showFrom !== undefined && now < Date.parse(banner.showFrom)) return "geplant";
    if (banner.showUntil !== undefined && now >= Date.parse(banner.showUntil)) return "abgelaufen";

    return "sichtbar";
}

function isMemberLink(value: unknown): value is IMemberLink {
    return isShape(value) && isText(value.label) && isSafeLink(value.href) && isText(value.icon);
}

function isMember(value: unknown): value is IMember {
    return (
        isShape(value) &&
        [value.name, value.handle, value.role, value.text].every(isText) &&
        isTextList(value.focus) &&
        isColor(value.accent) &&
        (value.links === undefined || isListOf(value.links, isMemberLink))
    );
}

function isOpenRole(value: unknown): value is IOpenRole {
    return isShape(value) && [value.title, value.text, value.icon].every(isText);
}

export function isTeam(data: unknown): data is ITeamContent {
    return isShape(data) && isListOf(data.members, isMember) && isListOf(data.openRoles, isOpenRole);
}

/**
 * Die Modulliste. Kategorie und Status müssen bekannt sein, sonst fände
 * `BotModule` keine Farbe und kein Label. Doppelte IDs fallen ebenfalls durch,
 * die ID steckt in der Adresse der Detailseite.
 */
export function isModuleList(data: unknown, values: IModuleValues): data is IModulesContent {
    if (!isShape(data) || !Array.isArray(data.modules)) return false;

    const isModule = (value: unknown): value is IModuleDefinition =>
        isShape(value) &&
        isText(value.id) &&
        MODULE_ID.test(value.id) &&
        [value.name, value.tagline, value.description, value.icon].every(isText) &&
        isText(value.category) &&
        (values.categories === undefined || values.categories.includes(value.category)) &&
        values.statuses.includes(String(value.status)) &&
        isTextList(value.highlights) &&
        (value.commands === undefined || isTextList(value.commands)) &&
        [value.featured, value.builtIn].every((flag) => flag === undefined || typeof flag === "boolean");

    const ids = new Set<unknown>(data.modules.map((module: unknown) => (isShape(module) ? module.id : undefined)));

    return data.modules.every(isModule) && ids.size === data.modules.length;
}

/** Ein Abschnitt der Detailseite: Überschrift, Einleitung, Einträge einer Form. */
function isBlock(value: unknown, isEntry: (entry: unknown) => boolean): boolean {
    return isShape(value) && isText(value.title) && isText(value.lead) && Array.isArray(value.entries) && value.entries.every(isEntry);
}

export function isModuleDetail(data: unknown): data is IModuleDetail {
    if (!isShape(data) || !isTextList(data.intro)) return false;

    const isConcept = (entry: unknown): boolean => isShape(entry) && isText(entry.label) && isText(entry.text) && isColor(entry.color);
    const isFeature = (entry: unknown): boolean => isShape(entry) && isText(entry.title) && isText(entry.text) && isText(entry.icon);
    const isStep = (entry: unknown): boolean => isShape(entry) && isText(entry.title) && isText(entry.text);
    const isPart = (entry: unknown): boolean => isShape(entry) && isText(entry.name) && isText(entry.text);

    return (
        (data.concepts === undefined || isBlock(data.concepts, isConcept)) &&
        (data.automations === undefined || isBlock(data.automations, isFeature)) &&
        (data.setup === undefined || isBlock(data.setup, isStep)) &&
        (data.parts === undefined || (Array.isArray(data.parts) && data.parts.every(isPart))) &&
        (data.showcase === undefined || SHOWCASES.includes(data.showcase))
    );
}

/** Holt einen Inhalt. `null` bei jedem Fehler: dann gelten die eingebauten Daten. */
export async function loadContent<T>(file: string, isValid: (data: unknown) => data is T): Promise<ILoaded<T> | null> {
    try {
        const response = await fetch(`/content/${file}`, { cache: "no-cache", signal: AbortSignal.timeout(TIMEOUT) });
        if (!response.ok) return null;

        // Der Entwicklungsserver von Vite antwortet auf unbekannte Pfade mit
        // index.html. Das scheitert hier am Parsen und landet im catch.
        const body: unknown = await response.json();
        if (!isShape(body) || typeof body.revision !== "number" || !isValid(body.data)) return null;

        return { data: body.data, revision: body.revision };
    } catch {
        return null;
    }
}

/**
 * Ein Inhalt für eine Seite. `undefined` heißt: lädt noch. Danach der
 * geladene Inhalt oder `fallback`. Ohne Datei (`null`) gilt sofort `fallback`.
 */
export function useContent<T>(file: string | null, isValid: (data: unknown) => data is T, fallback: T): T | undefined {
    const [loaded, setLoaded] = useState<{ readonly file: string; readonly data: T } | null>(null);

    useEffect(() => {
        if (file === null) return;

        let active = true;

        void loadContent(file, isValid).then((result) => {
            if (active) setLoaded({ file, data: result === null ? fallback : result.data });
        });

        return () => {
            active = false;
        };
    }, [file, isValid, fallback]);

    if (file === null) return fallback;

    return loaded?.file === file ? loaded.data : undefined;
}

/** commands.json aus dem Admin Dashboard: die Commands je Modul, wie der Bot sie meldet. */
export interface ICommandsContent {
    readonly updatedAt: string;
    readonly modules: Readonly<Record<string, readonly { readonly path: string; readonly description: string }[]>>;
}

/**
 * Die gespeicherte Modulliste aus dem Admin Dashboard, dazu jedes feste Modul
 * (builtIn) aus dem Standard, das darin fehlt. Kommt ein festes Modul neu zum
 * Bot, etwa Backups, steht es so auch dann auf der Seite, wenn die Liste schon
 * vorher gespeichert war. Schaltbare Module kommen nicht zurück: Die kann
 * jemand im Admin Dashboard bewusst entfernt haben.
 */
export function withBuiltIns<T extends { readonly id: string; readonly builtIn?: boolean }>(saved: readonly T[], defaults: readonly T[]): T[] {
    const known = new Set(saved.map((entry) => entry.id));

    return [...saved, ...defaults.filter((entry) => entry.builtIn === true && !known.has(entry.id))];
}

/** Kaputte oder fremde Daten fallen durch, dann gelten die Commands aus modules.json. */
export function isCommandsContent(data: unknown): data is ICommandsContent {
    if (!isShape(data) || !isText(data.updatedAt) || !isShape(data.modules)) return false;

    return Object.entries(data.modules).every(
        ([id, list]) => MODULE_ID.test(id) && Array.isArray(list) && list.every((entry: unknown) => isShape(entry) && isText(entry.path) && typeof entry.description === "string")
    );
}

const CSS_COLOR = /^(#[0-9a-f]{6}|var\(--c-[a-z0-9-]+\))$/;

/** categories.json: höchstens 12 Kategorien, jede mit ID, Name und Farbe (Hex oder eine Farbe der Webseite). */
export function isCategories(data: unknown): data is { readonly categories: readonly import("./categories").ICategoryContent[] } {
    if (!isShape(data) || !Array.isArray(data.categories) || data.categories.length > 12) return false;

    const ids = new Set<unknown>();

    return data.categories.every((entry: unknown) => {
        if (!isShape(entry) || !isText(entry.id) || !MODULE_ID.test(entry.id) || ids.has(entry.id)) return false;
        ids.add(entry.id);

        return isText(entry.label) && entry.label.trim().length >= 2 && entry.label.length <= 30 && typeof entry.color === "string" && CSS_COLOR.test(entry.color) && (entry.description === undefined || typeof entry.description === "string");
    });
}

/** Was das Admin Dashboard der Seite /vorschau schickt: der Entwurf eines Moduls samt allem, was die Ansicht braucht. */
export interface IPreviewMessage {
    readonly type: "rlnexus:vorschau";
    readonly view: "kachel" | "detail";
    readonly module: IModuleDefinition;
    readonly detail: IModuleDetail | null;
    readonly categories: readonly import("./categories").ICategoryContent[];
    readonly commands: readonly { readonly path: string; readonly description: string }[];
}

/** Dieselben Prüfungen wie für geladene Inhalte. Alles andere ignoriert die Vorschau. */
export function isPreviewMessage(data: unknown, statuses: readonly string[]): data is IPreviewMessage {
    if (!isShape(data) || data.type !== "rlnexus:vorschau" || (data.view !== "kachel" && data.view !== "detail")) return false;

    return (
        isModuleList({ modules: [data.module] }, { statuses }) &&
        (data.detail === null || isModuleDetail(data.detail)) &&
        isCategories({ categories: data.categories }) &&
        Array.isArray(data.commands) &&
        data.commands.every((entry: unknown) => isShape(entry) && isText(entry.path) && typeof entry.description === "string")
    );
}

/* --- Partner, News und Changelog (W-0062) --------------------------------
 * Dateien, die das Admin Dashboard selbst baut (Teil 1). Fällt eine durch,
 * zeigt die Seite einen leeren Zustand statt eines Fehlers.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA = /^\/content\/media\/[a-z0-9.-]+\.(?:webp|png)$/;
const ENTRY_COLORS: readonly unknown[] = ["red", "blue", "purple", "gold", "green", "orange", "cyan", "silver"];
const SECTION_TYPES: readonly unknown[] = ["stats", "about", "teams", "achievements", "discord", "facts", "modules", "news", "together", "offer", "intro", "help", "tournaments", "links", "gallery", "video", "quote", "text"];
const LINK_KEYS = ["website", "discord", "x", "twitch", "youtube", "tiktok"] as const;
const VIDEO_HOSTS: readonly string[] = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "twitch.tv", "www.twitch.tv", "clips.twitch.tv"];

const isOptional = (value: unknown, is: (value: unknown) => boolean): boolean => value === undefined || is(value);
const isNullable = (value: unknown, is: (value: unknown) => boolean): boolean => value === null || is(value);
const isMedia = (value: unknown): boolean => typeof value === "string" && MEDIA.test(value);
const isDate = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));
const isCount = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isRef = (value: unknown): boolean => isShape(value) && isText(value.slug) && SLUG.test(value.slug) && isText(value.title) && isDate(value.date);

/** Nur https zu YouTube oder Twitch. */
export function isVideoLink(value: unknown): value is string {
    return isSafeLink(value) && value.startsWith("https://") && VIDEO_HOSTS.includes(new URL(value).hostname);
}

function isLinks(value: unknown): boolean {
    return isShape(value) && Object.keys(value).every((key) => (LINK_KEYS as readonly string[]).includes(key)) && LINK_KEYS.every((key) => isOptional(value[key], isSafeLink));
}

function isSection(value: unknown): boolean {
    if (!isShape(value) || !SECTION_TYPES.includes(value.type) || typeof value.visible !== "boolean") return false;

    const isItem = (item: unknown): boolean =>
        isShape(item) && isText(item.label) && isOptional(item.value, isText) && isOptional(item.text, isText) && isOptional(item.date, isDate);

    return (
        [value.title, value.text, value.code].every((field) => isOptional(field, isText)) &&
        isOptional(value.items, (items) => Array.isArray(items) && items.every(isItem)) &&
        isOptional(value.images, (images) => Array.isArray(images) && images.every(isMedia)) &&
        isOptional(value.url, value.type === "video" ? isVideoLink : isSafeLink) &&
        isOptional(value.until, (until) => isNullable(until, isDate))
    );
}

function isEntry(value: unknown): boolean {
    return (
        isShape(value) &&
        isText(value.slug) &&
        SLUG.test(value.slug) &&
        (value.kind === "partner" || value.kind === "sponsor" || value.kind === "supporter") &&
        [value.name, value.typeLabel, value.subtitle, value.shortText].every(isText) &&
        (value.tier === null || value.tier === "main" || value.tier === "sponsor") &&
        isNullable(value.stripText, isText) &&
        ENTRY_COLORS.includes(value.color) &&
        isNullable(value.logo, isMedia) &&
        isNullable(value.banner, isMedia) &&
        isNullable(value.since, isDate) &&
        isLinks(value.links) &&
        Array.isArray(value.sections) &&
        value.sections.every(isSection) &&
        Array.isArray(value.tournaments) &&
        value.tournaments.every(isRef) &&
        Array.isArray(value.news) &&
        value.news.every(isRef) &&
        typeof value.onHome === "boolean"
    );
}

export function isSitePartners(data: unknown): data is import("../domain/interfaces/ISiteContent").ISitePartners {
    if (!isShape(data) || !Array.isArray(data.entries) || !data.entries.every(isEntry)) return false;

    return new Set(data.entries.map((entry: unknown) => (entry as Shape).slug)).size === data.entries.length;
}

export function isSiteLive(data: unknown): data is import("../domain/interfaces/ISiteContent").ISiteLive {
    const isTeam = (team: unknown): boolean =>
        isShape(team) && isText(team.name) && isNullable(team.group, isText) && isNullable(team.mmr, isCount) && isNullable(team.rank, isText) && isCount(team.players);
    const isServer = (server: unknown): boolean =>
        isShape(server) && isCount(server.members) && isCount(server.online) && isTextList(server.modules) && Array.isArray(server.teams) && server.teams.every(isTeam);

    return isShape(data) && isDate(data.at) && isShape(data.servers) && Object.entries(data.servers).every(([slug, server]) => SLUG.test(slug) && isServer(server));
}

function isEvent(value: unknown): boolean {
    return isShape(value) && isDate(value.startsAt) && isNullable(value.endsAt, isDate) && isNullable(value.place, isText);
}

function isNewsItem(value: unknown): boolean {
    return (
        isShape(value) &&
        isText(value.slug) &&
        SLUG.test(value.slug) &&
        (value.kind === "beitrag" || value.kind === "kurz" || value.kind === "termin") &&
        ["update", "partner", "turnier", "ankuendigung", "wartung"].includes(String(value.category)) &&
        [value.title, value.summary].every(isText) &&
        isNullable(value.cover, isMedia) &&
        isDate(value.publishedAt) &&
        (value.pinned === "none" || value.pinned === "big" || value.pinned === "small") &&
        isNullable(value.event, isEvent) &&
        isNullable(value.entry, (entry) => isShape(entry) && isText(entry.slug) && SLUG.test(entry.slug) && isText(entry.name))
    );
}

function isNewsBlock(value: unknown): boolean {
    if (!isShape(value)) return false;

    switch (value.type) {
        case "text":
            return isText(value.md) && (value.size === "normal" || value.size === "lead") && (value.width === "text" || value.width === "full");
        case "heading":
            return isText(value.text);
        case "image":
            return isMedia(value.url) && isText(value.alt) && isNullable(value.caption, isText);
        case "gallery":
            return Array.isArray(value.images) && value.images.length > 0 && value.images.every(isMedia);
        case "callout":
            return isNullable(value.title, isText) && isText(value.text);
        case "quote":
            return isText(value.text) && isNullable(value.by, isText);
        case "partner":
            return typeof value.entryId === "number" && Number.isSafeInteger(value.entryId);
        case "event":
            return isText(value.title) && isDate(value.startsAt) && isNullable(value.place, isText);
        case "video":
            return isVideoLink(value.url);
        case "button":
            return isText(value.label) && isSafeLink(value.url);
        case "divider":
            return true;
        default:
            return false;
    }
}

export function isSiteNews(data: unknown): data is import("../domain/interfaces/ISiteContent").ISiteNews {
    return isShape(data) && Array.isArray(data.posts) && data.posts.every(isNewsItem);
}

export function isSiteNewsPost(data: unknown): data is import("../domain/interfaces/ISiteContent").ISiteNewsPost {
    const isCard = (card: unknown): boolean =>
        isShape(card) && isText(card.slug) && SLUG.test(card.slug) && isText(card.name) && isText(card.typeLabel) && ENTRY_COLORS.includes(card.color) && isNullable(card.logo, isMedia);

    return (
        isNewsItem(data) &&
        isShape(data) &&
        Array.isArray(data.blocks) &&
        data.blocks.every(isNewsBlock) &&
        isText(data.author) &&
        isDate(data.updatedAt) &&
        isShape(data.partners) &&
        Object.values(data.partners).every(isCard)
    );
}

export function isSiteChangelog(data: unknown): data is import("../domain/interfaces/ISiteContent").ISiteChangelog {
    const isItem = (item: unknown): boolean => isShape(item) && (item.kind === "neu" || item.kind === "verbessert" || item.kind === "behoben") && isText(item.area) && isText(item.text);
    const isDiscord = (url: unknown): boolean => isSafeLink(url) && url.startsWith("https://discord.com/channels/");
    const isVersion = (version: unknown): boolean =>
        isShape(version) &&
        isText(version.version) &&
        /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version.version) &&
        isDate(version.releasedOn) &&
        isText(version.title) &&
        Array.isArray(version.items) &&
        version.items.every(isItem) &&
        isMedia(version.image) &&
        isDate(version.postedAt) &&
        isNullable(version.postedBy, isText) &&
        isNullable(version.updatedAt, isDate) &&
        isNullable(version.discordUrl, isDiscord);

    return isShape(data) && Array.isArray(data.versions) && data.versions.every(isVersion);
}
