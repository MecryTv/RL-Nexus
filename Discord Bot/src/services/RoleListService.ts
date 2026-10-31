import { createHash } from "crypto";
import { AttachmentBuilder, GatewayIntentBits, Guild, GuildBasedChannel, Message } from "discord.js";
import BotClient from "../client/BotClient";
import { RoleListText } from "../builder/RoleListView";
import { IRoleListCardData, RenderRoleListCard } from "../builder/RoleListCard";
import logger from "../utils/logger";
import { FetchState } from "../utils/guildpanels";
import {
    IMAGE_CHOICES,
    IMAGE_COLORS,
    IMAGE_RANGES,
    IMAGE_SWITCHES,
    DefaultListSettings,
    IRoleEntry,
    LIST_TEMPLATES,
    ListTemplateKey,
    MAX_IMAGE_PEOPLE,
    MAX_LISTS,
    MAX_PRESETS,
    REFRESH_DELAY_MS,
    ROLE_LISTS_MODULE,
    RoleListDesign,
    TITLE_KEEP_DAYS,
    IRoleListImage,
    IRoleListSettings,
    MAX_BUTTON,
    MAX_HEADING,
    MAX_LABEL,
    MAX_LEAD,
    MAX_NAME,
    MAX_ROLES,
    MAX_SUB,
    MAX_TITLE,
    MAX_TITLES,
    RoleIcon,
} from "../constants/RoleLists";
import { IRoleList, IRoleListGroup, IRoleListMember, IRoleListRole } from "../interfaces/services/rolelists/IRoleLists";

/**
 * Rollen-Listen (Plan 29): Listen, die zeigen, wer welche Rolle hat. Der
 * Service säubert, was aus dem Dashboard kommt, gruppiert die Mitglieder,
 * sendet die Liste und zieht sie gebündelt nach. Siehe docs/RoleLists.md.
 */

export class RoleListError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Text(value: unknown, max: number, fallback = ""): string {
    return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function Choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
    return choices.includes(value as T) ? (value as T) : fallback;
}

const SNOWFLAKE = /^\d{17,20}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

/** Eine Galerie-ID (server/album/datei) - nie eine Adresse. */
export function IsGalleryId(value: unknown): value is string {
    return typeof value === "string" && value.length <= 300 && value.includes("/") && !value.includes("..") && !/[:\\]/.test(value);
}

/** Das Bild aus dem Dashboard: jede Zahl in ihren Bereich, jede Farbe #rrggbb, Unbekanntes bleibt beim vorigen Wert. */
export function CleanImage(input: unknown, previous: IRoleListImage): IRoleListImage {
    const raw = IsRecord(input) ? input : {};
    const image: IRoleListImage = { ...previous };
    const target = image as unknown as Record<string, unknown>;

    for (const [key, choices] of Object.entries(IMAGE_CHOICES)) {
        if (raw[key] !== undefined) target[key] = Choice(raw[key], choices as readonly string[], target[key] as string);
    }

    for (const [key, [min, max]] of Object.entries(IMAGE_RANGES)) {
        const number = Number(raw[key]);

        if (raw[key] !== undefined && Number.isFinite(number)) target[key] = Math.min(max, Math.max(min, Math.round(number)));
    }

    for (const key of IMAGE_COLORS) {
        if (typeof raw[key] === "string" && COLOR.test(raw[key] as string)) target[key] = (raw[key] as string).toLowerCase();
    }

    for (const key of IMAGE_SWITCHES) {
        if (typeof raw[key] === "boolean") target[key] = raw[key];
    }

    if (raw.sub !== undefined) image.sub = Text(raw.sub, MAX_SUB);
    if (raw.footer !== undefined) image.footer = Text(raw.footer, MAX_SUB);
    if (typeof raw.preset === "string" && /^[\w-]{1,32}$/.test(raw.preset)) image.preset = raw.preset;
    if (raw.image !== undefined) image.image = IsGalleryId(raw.image) ? raw.image : null;

    return image;
}

/** Name einer eigenen Bild-Vorlage. */
export function CleanPresetName(input: unknown): string {
    const name = Text(input, MAX_NAME);

    if (!name) throw new RoleListError("Gib der Vorlage einen Namen.");

    return name;
}

/**
 * Wer in welcher Gruppe steht - in der Reihenfolge der Einträge. Einträge,
 * deren Rolle es nicht mehr gibt, fallen weg. „Jeder nur einmal“: wer schon
 * in einer Gruppe darüber steht, fehlt weiter unten.
 */
export function GroupMembers(settings: IRoleListSettings, roles: Map<string, IRoleListRole>, members: IRoleListMember[]): IRoleListGroup[] {
    const seen = new Set<string>();
    const groups: IRoleListGroup[] = [];

    for (const entry of settings.roles) {
        const role = roles.get(entry.roleId);

        if (!role) continue;

        const inside = members
            .filter((member) => member.roleIds.includes(role.id) && !(settings.once && seen.has(member.id)))
            .sort((a, b) => (settings.sort === "joined" ? a.joinedAt - b.joinedAt : a.name.localeCompare(b.name, "de")));

        for (const member of inside) seen.add(member.id);

        if (settings.hideEmpty && !inside.length) continue;

        groups.push({ entry, role, members: inside });
    }

    return groups;
}

export interface IRoleListPreset {
    id: string;
    name: string;
    image: IRoleListImage;
}

type RefreshResult = "edited" | "sent" | "same" | "skipped";

const DAY = 86_400_000;
const IMAGE_CACHE_MS = 10 * 60_000;
/** So viele Bilder hält der Speicher höchstens - 120 Profilbilder einer Liste und etwas Luft. */
const MAX_CACHED_IMAGES = 300;

/** Fehlende Rechte als Satz fürs Dashboard statt als Fehler 500. */
function Denied(error: unknown, channel: string): unknown {
    const code = (error as { code?: unknown } | null)?.code;

    return code === 50001 || code === 50013
        ? new RoleListError(`Der Bot darf in #${channel} nicht alles, was die Liste braucht. Gib ihm dort „Nachrichten senden“, „Dateien anhängen“ und „Nachrichtenverlauf lesen“.`)
        : error;
}
const MAX_DOWNLOAD = 2 * 1024 * 1024;

/** Twemoji-Datei eines Emojis: Codepunkte in hex, ohne Varianten-Auswahl (fe0f). */
export function TwemojiUrl(emoji: string): string {
    const all = Array.from(emoji).map((char) => char.codePointAt(0)!.toString(16));
    // Wie Twemoji selbst: fe0f fällt nur weg, wenn keine ZWJ-Sequenz (200d) darin steckt.
    const points = all.includes("200d") ? all : all.filter((point) => point !== "fe0f");

    return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${points.join("-")}.png`;
}

/** Ein Bild aus dem Netz - kurz gewartet, gedeckelt, ohne Fehler nach außen. */
async function Download(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());

        return buffer.length <= MAX_DOWNLOAD ? buffer : null;
    } catch {
        return null;
    }
}

export default class RoleListService {
    private readonly client: BotClient;
    /** Wartende Nachzieher je Liste. */
    private readonly timers = new Map<number, NodeJS.Timeout>();
    /** Welche Listen eines Servers gesendet sind und auf welche Rollen sie hören. */
    private readonly watched = new Map<string, Map<number, Set<string>>>();
    private readonly images = new Map<string, { buffer: Buffer | null; at: number }>();
    /** Lädt ein Bild aus dem Netz - für die Prüfungen austauschbar. */
    fetchImage: (url: string) => Promise<Buffer | null> = Download;
    /** Bündelung: so lange wartet ein Nachzieher auf weitere Änderungen. */
    refreshDelay = REFRESH_DELAY_MS;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Säubern
       ---------------------------------------------------------- */
    /** Ein Symbol nur, wenn es auf diesem Server gilt: eigene Emojis, Galerie-Bilder, das Rollen-Icon. */
    private CleanIcon(guild: Guild, input: unknown): RoleIcon {
        if (!IsRecord(input)) return null;

        switch (input.kind) {
            case "emoji": {
                const value = Text(input.value, 16);

                return value && !/[\s<>:]/.test(value) ? { kind: "emoji", value } : null;
            }
            case "server":
                return typeof input.id === "string" && guild.emojis.cache.has(input.id) ? { kind: "server", id: input.id } : null;
            case "gallery":
                return IsGalleryId(input.id) ? { kind: "gallery", id: input.id } : null;
            case "role":
                return { kind: "role" };
            default:
                return null;
        }
    }

    private CleanRoles(guild: Guild, input: unknown): IRoleEntry[] {
        const seen = new Set<string>();
        const roles: IRoleEntry[] = [];

        for (const entry of Array.isArray(input) ? input : []) {
            if (!IsRecord(entry) || typeof entry.roleId !== "string" || entry.roleId === guild.id || seen.has(entry.roleId)) continue;

            const role = guild.roles.cache.get(entry.roleId);

            if (!role) continue;

            seen.add(role.id);
            roles.push({ roleId: role.id, label: Text(entry.label, MAX_LABEL) || role.name.slice(0, MAX_LABEL), icon: this.CleanIcon(guild, entry.icon) });

            if (roles.length >= MAX_ROLES) break;
        }

        return roles;
    }

    private CleanTitles(input: unknown, previous: IRoleListSettings["titles"]): IRoleListSettings["titles"] {
        const titles: IRoleListSettings["titles"] = {};

        for (const [id, value] of Object.entries(IsRecord(input) ? input : {})) {
            if (!SNOWFLAKE.test(id)) continue;

            const title = Text(IsRecord(value) ? value.title : value, MAX_TITLE);

            if (title) titles[id] = { title, seen: previous[id]?.seen ?? Date.now() };
            if (Object.keys(titles).length >= MAX_TITLES) break;
        }

        return titles;
    }

    /** Die Einstellungen einer Liste aus dem Dashboard. Fehlt ein Feld, gilt der vorige Wert. */
    CleanSettings(guild: Guild, input: unknown, previous: IRoleListSettings): IRoleListSettings {
        const raw = IsRecord(input) ? input : {};
        const button = IsRecord(raw.button) ? raw.button : null;
        const flag = (key: "once" | "hideEmpty" | "counts" | "stamp"): boolean => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : previous[key]);
        const channel = button && typeof button.channelId === "string" ? guild.channels.cache.get(button.channelId) : null;
        const url = button ? Text(button.url, 512) : "";

        return {
            roles: raw.roles === undefined ? previous.roles : this.CleanRoles(guild, raw.roles),
            titles: raw.titles === undefined ? previous.titles : this.CleanTitles(raw.titles, previous.titles),
            once: flag("once"),
            hideEmpty: flag("hideEmpty"),
            counts: flag("counts"),
            as: raw.as === undefined ? previous.as : Choice(raw.as, ["mention", "name"] as const, previous.as),
            sort: raw.sort === undefined ? previous.sort : Choice(raw.sort, ["abc", "joined"] as const, previous.sort),
            heading: raw.heading === undefined ? previous.heading : Text(raw.heading, MAX_HEADING),
            lead: raw.lead === undefined ? previous.lead : Text(raw.lead, MAX_LEAD),
            thumb: raw.thumb === undefined ? previous.thumb : Choice(raw.thumb, ["icon", "none"] as const, previous.thumb),
            button: button
                ? {
                      on: button.on === true,
                      label: Text(button.label, MAX_BUTTON),
                      to: Choice(button.to, ["channel", "url"] as const, "channel"),
                      channelId: channel?.isTextBased() ? channel.id : null,
                      url: /^https:\/\/\S+$/i.test(url) && URL.canParse(url) ? url : null,
                  }
                : previous.button,
            stamp: flag("stamp"),
            image: raw.image === undefined ? previous.image : CleanImage(raw.image, previous.image),
        };
    }

    /* ----------------------------------------------------------
       Listen
       ---------------------------------------------------------- */
    Lists(guildId: string): Promise<IRoleList[]> {
        return this.client.roleLists.OfGuild(guildId);
    }

    async Get(guildId: string, id: number): Promise<IRoleList> {
        const list = await this.client.roleLists.Get(id);

        if (!list || list.guildId !== guildId) throw new RoleListError("Diese Liste gibt es nicht.");

        return list;
    }

    /** Eine neue Liste - aus einer Vorlage, die Rollen des Servers über den Namen sucht. */
    async Create(guild: Guild, input: { name: unknown; template: unknown }): Promise<IRoleList> {
        const count = await this.client.roleLists.CountOf(guild.id);

        if (count >= MAX_LISTS) throw new RoleListError(`Höchstens ${MAX_LISTS} Listen – lösch eine, bevor du eine neue anlegst.`);

        const key: ListTemplateKey = Object.keys(LIST_TEMPLATES).includes(String(input.template)) ? (input.template as ListTemplateKey) : "empty";
        const template = LIST_TEMPLATES[key];
        const roles = [...guild.roles.cache.values()].filter((role) => role.id !== guild.id && !role.managed).sort((a, b) => b.position - a.position);
        const used = new Set<string>();
        const entries: IRoleEntry[] = [];

        for (const rule of template.match) {
            // Staff: je Regel die oberste passende Rolle. Teams: alle passenden.
            for (const role of roles.filter((candidate) => rule.pattern.test(candidate.name) && !used.has(candidate.id))) {
                used.add(role.id);
                entries.push({ roleId: role.id, label: (rule.label ?? role.name).slice(0, MAX_LABEL), icon: { kind: "emoji", value: rule.emoji } });

                if (rule.label !== null || entries.length >= MAX_ROLES) break;
            }
        }

        const settings: IRoleListSettings = {
            ...DefaultListSettings(),
            roles: entries.slice(0, MAX_ROLES),
            heading: template.heading,
            lead: template.lead,
            button: { on: false, label: template.button, to: "channel", channelId: null, url: null },
        };

        const list = await this.client.roleLists.Create({
            guildId: guild.id,
            name: Text(input.name, MAX_NAME) || (key === "empty" ? "Neue Liste" : template.label),
            position: count,
            channelId: null,
            design: "sections",
            settings,
        });

        logger.user(`📋 Rollen-Liste #${list.id} auf ${guild.id} angelegt (${key})`);

        return list;
    }

    /** Speichern - eine gesendete Liste zieht danach gebündelt nach. */
    async Save(guild: Guild, id: number, input: { name?: unknown; channelId?: unknown; design?: unknown; settings?: unknown }): Promise<IRoleList> {
        const list = await this.Get(guild.id, id);
        const channel = typeof input.channelId === "string" ? guild.channels.cache.get(input.channelId) : null;
        const channelId = input.channelId === undefined ? undefined : channel?.isTextBased() && !channel.isThread() ? channel.id : null;
        const settings = input.settings === undefined ? list.settings : this.CleanSettings(guild, input.settings, list.settings);
        const now = Date.now();
        const keep = now - TITLE_KEEP_DAYS * DAY;
        // Wer eine Rolle der Liste hat, ist jetzt „gesehen“. Weg fällt nur ein Titel, dessen Person seit 30 Tagen keine mehr hat.
        const holders = new Set(this.Members(guild, settings.roles.map((entry) => entry.roleId)).map((member) => member.id));

        settings.titles = Object.fromEntries(
            Object.entries(settings.titles)
                .filter(([memberId, entry]) => holders.has(memberId) || entry.seen >= keep)
                .map(([memberId, entry]) => [memberId, holders.has(memberId) ? { ...entry, seen: now } : entry])
        );

        // Neuer Kanal für eine gesendete Liste: die alte Nachricht geht mit, das Nachziehen schickt sie im neuen Kanal.
        if (list.messageId && channelId !== undefined && channelId !== list.channelId) {
            const old = await this.Message(guild, list.channelId, list.messageId);

            if (typeof old === "object") await old.delete().catch(() => undefined);
        }

        await this.client.roleLists.Save(id, {
            name: input.name === undefined ? undefined : Text(input.name, MAX_NAME) || list.name,
            channelId,
            design: input.design === undefined ? undefined : Choice(input.design, ["compact", "sections", "board"] as const, list.design),
            settings,
        });

        this.watched.delete(guild.id);

        const saved = await this.Get(guild.id, id);

        if (saved.messageId) this.Schedule(guild.id, id);

        return saved;
    }

    async Reorder(guildId: string, ids: unknown): Promise<IRoleList[]> {
        const lists = await this.Lists(guildId);
        const order = Array.isArray(ids) ? ids.map(Number) : [];

        for (const list of lists) {
            const position = order.indexOf(list.id);

            if (position >= 0 && position !== list.position) await this.client.roleLists.Save(list.id, { position });
        }

        return this.Lists(guildId);
    }

    /** Löschen - die Nachricht im Kanal mit. */
    async Remove(guild: Guild, id: number): Promise<void> {
        const list = await this.Get(guild.id, id);

        clearTimeout(this.timers.get(id));
        this.timers.delete(id);

        if (list.messageId) {
            const message = await this.Message(guild, list.channelId, list.messageId);

            if (typeof message === "object") await message.delete().catch(() => undefined);
        }

        await this.client.roleLists.Remove(id);
        this.watched.delete(guild.id);
    }

    /** Sofort senden - auch eine Liste, die noch nie im Kanal stand. */
    async Send(guild: Guild, id: number): Promise<IRoleList> {
        const list = await this.Get(guild.id, id);

        if (!list.channelId || !guild.channels.cache.get(list.channelId)?.isTextBased()) throw new RoleListError("Wähl zuerst einen Kanal für die Liste.");

        await this.Refresh(guild, list, true);

        return this.Get(guild.id, id);
    }

    /* ----------------------------------------------------------
       Nachziehen
       ---------------------------------------------------------- */
    /** Gebündelt nachziehen: weitere Änderungen in der Wartezeit kommen mit. */
    Schedule(guildId: string, id: number): void {
        if (this.timers.has(id)) return;

        const timer = setTimeout(() => {
            this.timers.delete(id);

            const guild = this.client.guilds.cache.get(guildId);

            if (!guild) return;

            void this.client.roleLists
                .Get(id)
                .then((list) => (list && list.guildId === guildId ? this.Refresh(guild, list) : "skipped"))
                .catch((error) => logger.warn(`📋 Rollen-Liste #${id} nicht nachgezogen: ${String(error)}`));
        }, this.refreshDelay);

        timer.unref?.();
        this.timers.set(id, timer);
    }

    /** Eine Rolle hat sich geändert oder jemand mit ihr: die gesendeten Listen mit dieser Rolle nachziehen. */
    async Touch(guildId: string, roleIds: string[]): Promise<void> {
        if (!roleIds.length) return;

        // Ohne Datenbank still: sonst stünde bei jedem Mitglieder-Update eine Warnung im Log.
        const settings = await this.client.settings.Of(guildId).catch(() => null);

        if (!settings?.modules.includes(ROLE_LISTS_MODULE)) return;

        let watched = this.watched.get(guildId);

        if (!watched) {
            watched = new Map((await this.Lists(guildId)).filter((list) => list.messageId).map((list) => [list.id, new Set(list.settings.roles.map((entry) => entry.roleId))]));
            this.watched.set(guildId, watched);
        }

        for (const [id, roles] of watched) {
            if (roleIds.some((roleId) => roles.has(roleId))) this.Schedule(guildId, id);
        }
    }

    /** Nach dem Zurückladen eines Backups: welche Listen auf welche Rollen hören, neu lesen. */
    Forget(guildId: string): void {
        this.watched.delete(guildId);
    }

    /** Globaler Name oder Profilbild geändert: auf jedem Server, auf dem die Person ist, ihre Listen nachziehen. */
    async UserChanged(userId: string): Promise<void> {
        for (const guild of this.client.guilds.cache.values()) {
            const member = guild.members.cache.get(userId);

            if (member) await this.Touch(guild.id, [...member.roles.cache.keys()]);
        }
    }

    /** Nach dem Start: Rollenwechsel während der Pause kamen nicht als Ereignis an. */
    async Startup(): Promise<void> {
        // Ohne Intent ist der Cache nach dem Start nur ein Ausschnitt - nachziehen hieße die Listen kürzen.
        if (!this.HasMemberIntent()) return;

        for (const list of await this.client.roleLists.WithMessage()) {
            const guild = this.client.guilds.cache.get(list.guildId);

            if (!guild) continue;
            if (!(await this.client.settings.Of(guild.id)).modules.includes(ROLE_LISTS_MODULE)) continue;

            await this.Refresh(guild, list).catch((error) => logger.warn(`📋 Rollen-Liste #${list.id} nach dem Start nicht nachgezogen: ${String(error)}`));
        }
    }

    /** Die gesendete Nachricht - oder ob sie weg ist (10008) oder sich gerade nicht lesen lässt. */
    private async Message(guild: Guild, channelId: string | null, messageId: string): Promise<Message | "missing" | "unknown"> {
        const channel = channelId ? guild.channels.cache.get(channelId) : null;

        if (!channel?.isTextBased()) return "missing";

        try {
            return await channel.messages.fetch(messageId);
        } catch (error) {
            return FetchState(error);
        }
    }

    /**
     * Nach dem Start kennt der Cache kaum jemanden: ohne Presence-Intent schickt
     * Discord beim Verbinden nur den Bot und wer im Voice ist. Erst alle holen,
     * sonst schrumpft die Liste auf den Ausschnitt (wie DashboardService.FetchMembers).
     * false: die Liste wäre unvollständig.
     */
    private async EnsureMembers(guild: Guild): Promise<boolean> {
        if (guild.members.cache.size >= guild.memberCount) return true;
        if (!this.HasMemberIntent()) return false;

        return guild.members.fetch().then(
            () => true,
            () => false
        );
    }

    /**
     * Wer gezeigt wird, ist „gesehen“ - sein Titel bleibt. Frisch gelesen: ein
     * Speichern im Dashboard, während die Liste zeichnete, geht nicht verloren.
     */
    private async MarkSeen(list: IRoleList, groups: IRoleListGroup[]): Promise<void> {
        const now = Date.now();
        const shown = new Set(groups.flatMap((group) => group.members.map((member) => member.id)));

        // Höchstens einmal am Tag je Person - sonst schriebe jedes Nachziehen in die Datenbank.
        if (!Object.entries(list.settings.titles).some(([id, entry]) => shown.has(id) && now - entry.seen > DAY)) return;

        const fresh = await this.client.roleLists.Get(list.id);

        if (!fresh) return;

        for (const [id, entry] of Object.entries(fresh.settings.titles)) {
            if (shown.has(id)) entry.seen = now;
        }

        await this.client.roleLists.Save(list.id, { settings: fresh.settings });
    }

    /**
     * Die Liste in ihren Kanal bringen. Ungesendet passiert nur mit force etwas.
     * Gleicher Fingerabdruck ohne force: nichts zu tun. Text und Bild lassen
     * sich nicht ineinander bearbeiten - dann löschen und neu senden.
     */
    async Refresh(guild: Guild, list: IRoleList, force = false): Promise<RefreshResult> {
        if (!list.messageId && !force) return "skipped";

        const channel = list.channelId ? guild.channels.cache.get(list.channelId) : null;

        if (!channel?.isTextBased()) return "skipped";

        // Mit Intent und halbem Cache: lieber später als eine gekürzte Liste.
        if (!(await this.EnsureMembers(guild)) && this.HasMemberIntent() && !force) return "skipped";

        const old = list.messageId ? await this.Message(guild, list.channelId, list.messageId) : "missing";

        // Nicht lesbar heißt nicht weg: neu senden wäre eine zweite Liste neben der ersten.
        if (old === "unknown") {
            if (force) throw new RoleListError("Der Bot kann die Liste im Kanal gerade nicht lesen. Prüf, ob er dort „Nachrichtenverlauf lesen“ darf, und versuch es gleich noch einmal.");

            return "skipped";
        }

        const groups = this.Groups(guild, list.settings);
        const fingerprint = this.Fingerprint(list, groups);

        if (!force && old !== "missing" && fingerprint === list.fingerprint) {
            await this.MarkSeen(list, groups);

            return "same";
        }

        const kind = list.design === "board" ? "image" : "text";
        const payload = kind === "image" ? await this.ImagePayload(guild, list, groups) : RoleListText(list.settings, list.design as "compact" | "sections", groups, this.TextContext(guild, list));
        let messageId: string;
        let result: RefreshResult;

        try {
            if (old !== "missing" && list.messageKind === kind) {
                await old.edit(kind === "image" ? { ...payload, attachments: [] } : { content: null, ...payload });
                messageId = old.id;
                result = "edited";
            } else {
                if (old !== "missing") await old.delete().catch(() => undefined);

                const sent = await channel.send(payload);

                messageId = sent.id;
                result = "sent";
            }
        } catch (error) {
            throw Denied(error, channel.name);
        }

        await this.MarkSeen(list, groups);
        await this.client.roleLists.SetMessage(list.id, messageId, kind, fingerprint);
        this.watched.delete(guild.id);

        return result;
    }

    /* ----------------------------------------------------------
       Daten zum Zeichnen
       ---------------------------------------------------------- */
    HasMemberIntent(): boolean {
        return this.client.options.intents.has(GatewayIntentBits.GuildMembers);
    }

    Roles(guild: Guild, settings: IRoleListSettings): Map<string, IRoleListRole> {
        const roles = new Map<string, IRoleListRole>();

        for (const entry of settings.roles) {
            const role = guild.roles.cache.get(entry.roleId);

            if (role) roles.set(role.id, { id: role.id, name: role.name, color: role.hexColor === "#000000" ? "#9aa3ad" : role.hexColor, iconUrl: role.iconURL?.({ extension: "png", size: 64 }) ?? null });
        }

        return roles;
    }

    /** Die Mitglieder der Rollen aus dem Cache - ohne Mitglieder-Intent unvollständig. */
    Members(guild: Guild, roleIds: string[]): IRoleListMember[] {
        const members = new Map<string, IRoleListMember>();

        for (const roleId of roleIds) {
            for (const member of guild.roles.cache.get(roleId)?.members.values() ?? []) {
                if (members.has(member.id)) continue;

                members.set(member.id, {
                    id: member.id,
                    name: member.displayName,
                    username: member.user.username,
                    joinedAt: member.joinedTimestamp ?? 0,
                    avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
                    roleIds: [...member.roles.cache.keys()],
                });
            }
        }

        return [...members.values()];
    }

    Groups(guild: Guild, settings: IRoleListSettings): IRoleListGroup[] {
        return GroupMembers(settings, this.Roles(guild, settings), this.Members(guild, settings.roles.map((entry) => entry.roleId)));
    }

    /** Was sich sichtbar ändern kann - gleich heißt: die Nachricht bleibt, wie sie ist. */
    Fingerprint(list: Pick<IRoleList, "name" | "design" | "settings">, groups: IRoleListGroup[]): string {
        const titles = Object.fromEntries(Object.entries(list.settings.titles).map(([id, entry]) => [id, entry.title]));
        const data = {
            // Ohne Überschrift steht der Name oben.
            name: list.name,
            design: list.design,
            settings: { ...list.settings, titles },
            groups: groups.map((group) => ({ role: group.role, entry: group.entry, members: group.members.map((member) => [member.id, member.name, member.username, member.avatarUrl]) })),
        };

        return createHash("sha1").update(JSON.stringify(data)).digest("hex");
    }

    ButtonUrl(guild: Guild, settings: IRoleListSettings): string | null {
        if (!settings.button.on) return null;
        if (settings.button.to === "url") return settings.button.url;

        return settings.button.channelId ? `https://discord.com/channels/${guild.id}/${settings.button.channelId}` : null;
    }

    TextContext(guild: Guild, list: Pick<IRoleList, "name" | "settings">) {
        return {
            listName: list.name,
            guildName: guild.name,
            iconUrl: guild.iconURL({ size: 256 }),
            now: Date.now(),
            buttonUrl: this.ButtonUrl(guild, list.settings),
            emojiName: (id: string) => guild.emojis.cache.get(id)?.name ?? null,
            emojiAnimated: (id: string) => Boolean(guild.emojis.cache.get(id)?.animated),
        };
    }

    /** Ein Bild aus dem Netz, kurz gemerkt. */
    private async Picture(url: string | null): Promise<Buffer | null> {
        if (!url) return null;

        const known = this.images.get(url);

        if (known && Date.now() - known.at < IMAGE_CACHE_MS) return known.buffer;

        const buffer = await this.fetchImage(url);

        // Vorne steht das Älteste: Abgelaufenes und alles über der Grenze fliegt raus.
        for (const [key, entry] of this.images) {
            if (this.images.size < MAX_CACHED_IMAGES && Date.now() - entry.at < IMAGE_CACHE_MS) break;

            this.images.delete(key);
        }

        this.images.delete(url);
        this.images.set(url, { buffer, at: Date.now() });

        return buffer;
    }

    private async Icon(guild: Guild, group: IRoleListGroup): Promise<Buffer | null> {
        const icon = group.entry.icon;

        if (!icon) return null;

        switch (icon.kind) {
            case "emoji":
                return this.Picture(TwemojiUrl(icon.value));
            case "server":
                return this.Picture(guild.emojis.cache.get(icon.id)?.imageURL({ extension: "png", size: 64 }) ?? null);
            case "gallery":
                return this.client.galleryService.ReadImage(icon.id, guild.id).catch(() => null);
            case "role":
                return this.Picture(group.role.iconUrl);
        }
    }

    async CardData(guild: Guild, list: Pick<IRoleList, "name" | "settings" | "channelId">, groups: IRoleListGroup[]): Promise<IRoleListCardData> {
        const image = list.settings.image;
        const avatars = new Map<string, Buffer>();
        const icons = new Map<string, Buffer>();
        // Nur wer im Bild steht (höchstens 120, in der Reihenfolge des Bildes) - der Rest käme umsonst aus dem Netz.
        const people = groups
            .flatMap((group) => group.members)
            .slice(0, MAX_IMAGE_PEOPLE)
            .filter((member, index, all) => all.findIndex((other) => other.id === member.id) === index);

        // Höchstens 8 Profilbilder gleichzeitig.
        for (let start = 0; start < people.length; start += 8) {
            await Promise.all(
                people.slice(start, start + 8).map(async (member) => {
                    const buffer = await this.Picture(member.avatarUrl);

                    if (buffer) avatars.set(member.id, buffer);
                })
            );
        }

        for (const group of groups) {
            const buffer = await this.Icon(guild, group);

            if (buffer) icons.set(group.role.id, buffer);
        }

        const channel = list.channelId ? guild.channels.cache.get(list.channelId) : null;

        return {
            image,
            heading: list.settings.heading || list.name,
            guildName: guild.name,
            channelName: (channel as GuildBasedChannel | undefined)?.name ?? "",
            groups,
            titles: Object.fromEntries(Object.entries(list.settings.titles).map(([id, entry]) => [id, entry.title])),
            now: Date.now(),
            pictures: {
                logo: await this.Picture(guild.iconURL({ extension: "png", size: 128 })),
                background: image.bg === "image" && image.image ? await this.client.galleryService.ReadImage(image.image, guild.id).catch(() => null) : null,
                avatars,
                icons,
            },
        };
    }

    private async ImagePayload(guild: Guild, list: IRoleList, groups: IRoleListGroup[]) {
        const buffer = await RenderRoleListCard(await this.CardData(guild, list, groups));

        return { files: [new AttachmentBuilder(buffer, { name: "rollen-liste.webp" })], allowedMentions: { parse: [] as [] } };
    }

    /* ----------------------------------------------------------
       Eigene Bild-Vorlagen
       ---------------------------------------------------------- */
    async Presets(guildId: string): Promise<IRoleListPreset[]> {
        const stored = await this.client.moduleSettings.Of<{ presets: IRoleListPreset[] }>(guildId, ROLE_LISTS_MODULE, { presets: [] });

        return Array.isArray(stored.presets) ? stored.presets : [];
    }

    async SavePreset(guildId: string, name: unknown, image: unknown): Promise<IRoleListPreset[]> {
        const presets = await this.Presets(guildId);

        if (presets.length >= MAX_PRESETS) throw new RoleListError(`Höchstens ${MAX_PRESETS} eigene Vorlagen – lösch eine, bevor du eine neue speicherst.`);

        const preset: IRoleListPreset = { id: `own-${Date.now().toString(36)}${presets.length}`, name: CleanPresetName(name), image: CleanImage(image, DefaultListSettings().image) };

        preset.image.preset = preset.id;
        presets.push(preset);
        await this.client.moduleSettings.Save(guildId, ROLE_LISTS_MODULE, { presets });

        return presets;
    }

    async RemovePreset(guildId: string, id: unknown): Promise<IRoleListPreset[]> {
        const presets = (await this.Presets(guildId)).filter((preset) => preset.id !== id);

        await this.client.moduleSettings.Save(guildId, ROLE_LISTS_MODULE, { presets });

        return presets;
    }
}
