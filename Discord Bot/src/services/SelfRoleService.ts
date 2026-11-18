import {
    ButtonInteraction,
    ChannelType,
    ComponentType,
    GatewayMessageReactionAddDispatchData,
    GatewayMessageUpdateDispatchData,
    Guild,
    GuildMember,
    GuildTextBasedChannel,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    Role,
    Routes,
    StringSelectMenuInteraction,
} from "discord.js";
import BotClient from "../client/BotClient";
import { ILimitHit } from "../builder/LimitReply";
import { ModuleValue } from "../utils/moduleFlags";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { PanelRows, SelfRolePanelView } from "../builder/SelfRoleView";
import {
    CleanEmoji,
    DefaultBody,
    EmojiKey,
    MAX_DESCRIPTION,
    MAX_LABEL,
    MAX_NAME,
    SELF_ROLE_MODULE,
    SELF_ROLE_PREFIX,
} from "../constants/SelfRoles";
import { DefaultMessageDoc } from "../constants/Messages";
import { IMessageInfo, IPanelBody, ISelfRole, ISelfRolePanel, PanelKind, PanelMode } from "../interfaces/services/selfroles/ISelfRoles";
import logger from "../utils/logger";
import { NewRoleProblem } from "../utils/rolegate";
import { BlockedAt } from "../utils/security";

/** limit: welche Grenze von RL Nexus gegriffen hat (W-0137), für den Satz und die Anfrage im Dashboard. */
export class SelfRoleError extends Error {
    constructor(
        message: string,
        readonly limit?: ILimitHit
    ) {
        super(message);
    }
}

/** W-0137: Panels, Rollen je Panel und Reaktionen, Grenzen von RL Nexus je Server. */
export function SelfRoleLimits(guildId: string): { panels: number; roles: number; reactions: number } {
    return {
        panels: ModuleValue(SELF_ROLE_MODULE, "maxPanels", guildId),
        roles: ModuleValue(SELF_ROLE_MODULE, "maxRoles", guildId),
        reactions: ModuleValue(SELF_ROLE_MODULE, "maxReactions", guildId),
    };
}

/** Eine Komponente als JSON, so weit Self Roles hineinschaut. */
export interface IRawComponent {
    type: number;
    custom_id?: string;
    components?: IRawComponent[];
    accessory?: IRawComponent;
}

/** Discord: fünf Reihen an einer klassischen Nachricht, 40 Komponenten (mit allem darin) in Components V2. */
const MAX_ROWS = 5;
const MAX_V2 = 40;
/** Frühestens so lange nach dem letzten Nachziehen wird eine angehängte Reihe wieder angehängt. */
const REATTACH_PAUSE = 5_000;

const SNOWFLAKE = /^\d{17,20}$/;
const CUSTOM_EMOJI = /^<a?:(\w+):(\d+)>$/;
const LINK = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{17,20}|@me)\/(\d{17,20})\/(\d{17,20})\/?$/i;
const NO_ACCESS = "Diesen Kanal kannst du selbst nicht lesen, oder es gibt ihn nicht.";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** selfrole:<panel>:<rolle> oder selfrole:menu:<panel> - von genau diesem Panel. */
function OwnsId(customId: string | undefined, panelId: number): boolean {
    const [prefix, first, second] = (customId ?? "").split(":");

    return prefix === SELF_ROLE_PREFIX && (first === String(panelId) || (first === "menu" && second === String(panelId)));
}

function IsOwnRow(entry: IRawComponent, panelId: number): boolean {
    return entry.type === ComponentType.ActionRow && (entry.components ?? []).some((child) => OwnsId(child.custom_id, panelId));
}

function Count(list: readonly IRawComponent[]): number {
    return list.reduce((sum, entry) => sum + 1 + Count(entry.components ?? []) + (entry.accessory ? 1 : 0), 0);
}

/**
 * Das Emoji, wie es im Pfad der Reaktions-Route stehen muss. Am besten das aus
 * dem Ereignis selbst: der gespeicherte Text hat bei "❤️" ein FE0F, das Discord
 * in der Reaktion nicht unbedingt führt.
 */
export function ReactionParam(emoji: string | { id: string | null; name: string | null }): string {
    if (typeof emoji !== "string") return emoji.id ? `${emoji.name ?? "_"}:${emoji.id}` : encodeURIComponent(emoji.name ?? "");

    const custom = CUSTOM_EMOJI.exec(emoji);

    return custom ? `${custom[1]}:${custom[2]}` : encodeURIComponent(emoji);
}

/** Nur ein Panel mit Reaktionen hat je reagiert - Emojis von Knöpfen gehören nicht dazu. */
function ReactionKeys(panel: ISelfRolePanel | undefined): string[] {
    return panel?.kind === "reactions" ? panel.roles.map((role) => EmojiKey(role.emoji)).filter(Boolean) : [];
}

/**
 * Bilder einer Components-V2-Nachricht kommen von Discord als CDN-Link zurück.
 * Beim Bearbeiten wieder attachment://<datei> daraus machen - sonst zeigte die
 * Karte nach dem Anhängen auf einen Link, der irgendwann abläuft.
 */
function Rebase(node: unknown, files: Map<string, string>): unknown {
    if (Array.isArray(node)) return node.map((entry) => Rebase(entry, files));
    if (!IsRecord(node)) return node;
    if (typeof node.url === "string" && typeof node.attachment_id === "string" && files.has(node.attachment_id)) return { url: `attachment://${files.get(node.attachment_id)}` };

    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, Rebase(value, files)]));
}

/** Ein paar Worte aus der Nachricht, damit man sieht, ob es die richtige ist. */
function Excerpt(message: Message): string {
    const texts = [message.content, ...message.embeds.flatMap((embed) => [embed.title ?? "", embed.description ?? ""])];
    const walk = (node: { type?: number; content?: string; components?: unknown[] }): void => {
        if (node.type === ComponentType.TextDisplay && node.content) texts.push(node.content);
        for (const child of node.components ?? []) walk(child as typeof node);
    };

    for (const component of message.components) walk(component.toJSON() as Parameters<typeof walk>[0]);

    const text = texts.map((entry) => entry.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";

    return text.length > 140 ? `${text.slice(0, 139)}…` : text || "(ohne Text)";
}

/**
 * Self Roles: Panels, aus denen sich Mitglieder ihre Rollen selbst holen -
 * als Knopfreihe, als Auswahlmenü oder über Reaktionen, mit Regeln dazu. Ein
 * Panel schickt eine eigene Nachricht oder hängt sich an eine vorhandene
 * (W-0101). Siehe docs/SelfRoles.md.
 */
export default class SelfRoleService {
    private readonly client: BotClient;
    /** Nachricht → Panel, für alles, was gerade in Discord steht. Reaktionen und das Nachziehen schauen hier nach. */
    private readonly placed = new Map<string, ISelfRolePanel>();
    /** Panel → wann es zuletzt von selbst nachgezogen wurde. */
    private readonly reattached = new Map<number, number>();
    /** Panel → das Nachziehen, das nach der Pause noch aussteht. */
    private readonly pending = new Map<number, ReturnType<typeof setTimeout>>();
    /** guild:user → die Kette seiner Reaktionen. Nacheinander, sonst sähen zwei schnelle Reaktionen denselben alten Stand. */
    private readonly queues = new Map<string, Promise<void>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Lesen und Schreiben
       ---------------------------------------------------------- */
    Panels(guildId: string): Promise<ISelfRolePanel[]> {
        return this.client.selfRolePanels.OfGuild(guildId);
    }

    async Panel(guildId: string, id: number): Promise<ISelfRolePanel> {
        const panel = await this.client.selfRolePanels.Get(id);

        if (!panel || panel.guildId !== guildId) throw new SelfRoleError("Dieses Panel gibt es nicht.");

        return panel;
    }

    /** Was aus dem Dashboard kommt, wird zu einem gültigen Panel. */
    Clean(guild: Guild, input: unknown, previous?: ISelfRolePanel): Omit<ISelfRolePanel, "id" | "guildId" | "messageId" | "createdBy" | "createdAt" | "updatedAt"> {
        const raw = IsRecord(input) ? input : {};
        const name = (typeof raw.name === "string" ? raw.name.trim() : (previous?.name ?? "")).slice(0, MAX_NAME);

        if (!name) throw new SelfRoleError("Gib dem Panel einen Namen. Nur ihr seht ihn.");

        const kind: PanelKind = raw.kind === "select" || raw.kind === "buttons" || raw.kind === "reactions" ? raw.kind : (previous?.kind ?? "buttons");
        const mode: PanelMode = raw.mode === "single" || raw.mode === "multi" ? raw.mode : (previous?.mode ?? "multi");
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const body = this.client.messageService.CleanBody(guild, IsRecord(raw.body) ? raw.body : {}, previous?.body ?? DefaultBody(), DefaultMessageDoc()) as IPanelBody;
        const roles = raw.roles === undefined ? (previous?.roles ?? []) : this.CleanRoles(guild, raw.roles);
        const max = Math.max(0, Math.min(SelfRoleLimits(guild.id).roles, Math.floor(Number(raw.maxRoles ?? previous?.maxRoles ?? 0)) || 0));
        const require = typeof raw.requireRole === "string" && guild.roles.cache.has(raw.requireRole) ? raw.requireRole : raw.requireRole === undefined ? (previous?.requireRole ?? null) : null;
        const attached = typeof raw.attached === "boolean" ? raw.attached : (previous?.attached ?? false);
        const target = raw.targetId === undefined ? (previous?.targetId ?? null) : typeof raw.targetId === "string" && SNOWFLAKE.test(raw.targetId) ? raw.targetId : null;

        if (kind === "reactions") this.CheckReactions(guild, roles);

        return {
            name,
            kind,
            mode,
            // Bei "genau eine" wäre eine Höchstzahl nur verwirrend - die Regel ist schon eine.
            maxRoles: mode === "single" ? 0 : max,
            requireRole: require,
            body,
            roles,
            channelId: raw.channelId === undefined ? (previous?.channelId ?? null) : channel?.isTextBased() ? channel.id : null,
            attached,
            targetId: attached ? target : null,
        };
    }

    /** Die Rollen eines Panels - jede muss es geben und der Bot muss sie vergeben dürfen. */
    CleanRoles(guild: Guild, input: unknown): ISelfRole[] {
        if (!Array.isArray(input)) return [];

        const me = guild.members.me;
        const seen = new Set<string>();
        const roles: ISelfRole[] = [];

        for (const entry of input.slice(0, SelfRoleLimits(guild.id).roles)) {
            if (!IsRecord(entry) || typeof entry.roleId !== "string") continue;

            const role = guild.roles.cache.get(entry.roleId);

            if (!role || seen.has(role.id) || role.id === guild.id) continue;

            this.CheckRole(guild, role, me);
            seen.add(role.id);
            roles.push({
                roleId: role.id,
                label: typeof entry.label === "string" ? entry.label.trim().slice(0, MAX_LABEL) : "",
                description: typeof entry.description === "string" ? entry.description.trim().slice(0, MAX_DESCRIPTION) : "",
                emoji: CleanEmoji(entry.emoji),
                style: entry.style === "primary" || entry.style === "success" || entry.style === "danger" ? entry.style : "secondary",
                locked: typeof entry.locked === "boolean" ? entry.locked : false,
            });
        }

        return roles;
    }

    /** Kann der Bot diese Rolle überhaupt vergeben? */
    private CheckRole(guild: Guild, role: Role, me: GuildMember | null): void {
        if (role.managed) throw new SelfRoleError(`@${role.name} gehört zu einer Integration. Die kann niemand von Hand vergeben.`);
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.comparePositionTo(me.roles.highest) >= 0) {
            throw new SelfRoleError(`@${role.name} muss unter der höchsten Rolle des Bots stehen, und er braucht „Rollen verwalten“.`);
        }
    }

    /** W-0116: Neue Rollen nur, wenn der Speichernde sie selbst vergeben dürfte. */
    private CheckActor(member: GuildMember, roles: ISelfRole[], before: ISelfRole[] = []): void {
        const problem = NewRoleProblem(member, roles.map((role) => role.roleId), before.map((role) => role.roleId));

        if (problem) throw new SelfRoleError(problem);
    }

    /**
     * Bei Reaktionen braucht jede Rolle ihr eigenes Emoji. Eigene Emojis nur von
     * diesem Server: für fremde bräuchte der Bot im Kanal „Externe Emojis verwenden“.
     */
    private CheckReactions(guild: Guild, roles: ISelfRole[]): void {
        const reactions = SelfRoleLimits(guild.id).reactions;

        if (roles.length > reactions) {
            throw new SelfRoleError(`Höchstens ${reactions} verschiedene Reaktionen an einer Nachricht.`, { module: SELF_ROLE_MODULE, key: "maxReactions", asked: roles.length, allowed: reactions });
        }

        const seen = new Set<string>();

        for (const role of roles) {
            if (!role.emoji) throw new SelfRoleError(`Bei Reaktionen braucht jede Rolle ein Emoji. Bei @${guild.roles.cache.get(role.roleId)?.name ?? "gelöschte Rolle"} fehlt es noch.`);

            const key = EmojiKey(role.emoji);
            const custom = CUSTOM_EMOJI.exec(role.emoji);

            if (seen.has(key)) throw new SelfRoleError(`Jedes Emoji nur einmal: ${role.emoji} steht doppelt.`);
            if (custom && guild.emojis.cache.get(custom[2])?.available !== true) {
                throw new SelfRoleError(`Das Emoji :${custom[1]}: ist nicht von diesem Server. Für Reaktionen gehen nur Emojis von hier oder normale.`);
            }

            seen.add(key);
        }
    }

    /** Knöpfe und Menü gehen nur an Nachrichten, die der Bot selbst geschrieben hat - so will es Discord. */
    CheckKind(kind: PanelKind, own: boolean): void {
        if (!own && kind !== "reactions") {
            throw new SelfRoleError("Die Nachricht ist nicht von RL Nexus. Knöpfe und Menüs lassen sich da nicht anhängen, es gehen nur Reaktionen.");
        }
    }

    /**
     * Eine Nachricht, ein Panel: sonst stritten zwei Panels um dieselben Reihen,
     * und die Zuordnung Nachricht → Panel kennt nur eins. Ein gelöstes Panel, das
     * auf die Nachricht eingestellt ist, zählt mit - es lässt sich jederzeit wieder anhängen.
     */
    CheckFree(panels: readonly ISelfRolePanel[], panel: Pick<ISelfRolePanel, "id" | "attached" | "targetId">): void {
        const target = panel.attached ? panel.targetId : null;
        const other = target ? panels.find((entry) => entry.id !== panel.id && (entry.messageId === target || (entry.attached && entry.targetId === target))) : null;

        if (other) throw new SelfRoleError(`Die Nachricht gehört schon zum Panel „${other.name}“.`);
    }

    async Create(guild: Guild, member: GuildMember, input: unknown): Promise<ISelfRolePanel> {
        const count = (await this.Panels(guild.id)).length;
        const max = SelfRoleLimits(guild.id).panels;

        if (count >= max) throw new SelfRoleError(`Mehr als ${max} Panels gehen nicht.`, { module: SELF_ROLE_MODULE, key: "maxPanels", asked: count + 1, allowed: max });

        const clean = this.Clean(guild, input);

        this.CheckActor(member, clean.roles);

        const panel = await this.client.selfRolePanels.Create({ guildId: guild.id, createdBy: member.id, ...clean });

        logger.user(`🎭 Self-Role-Panel "${panel.name}" auf ${guild.id} angelegt (von ${member.id})`);

        return panel;
    }

    /**
     * Speichert und zieht ein stehendes Panel nach. Scheitert nur das Nachziehen,
     * ist trotzdem gespeichert - der Grund kommt als warning zurück.
     */
    async Save(guild: Guild, member: GuildMember, id: number, input: unknown): Promise<{ panel: ISelfRolePanel; warning: string | null }> {
        const previous = await this.Panel(guild.id, id);
        const clean = this.Clean(guild, input, previous);

        this.CheckActor(member, clean.roles, previous.roles);

        // Steht das Panel, würde ein Wechsel der Nachricht das alte zurücklassen.
        if (previous.messageId && (clean.attached !== previous.attached || clean.targetId !== previous.targetId || (previous.attached && clean.channelId !== previous.channelId))) {
            throw new SelfRoleError(
                previous.attached
                    ? "Das Panel hängt gerade an einer Nachricht. Löse es erst, dann kannst du umstellen."
                    : "Das Panel steht schon als eigene Nachricht im Kanal. Sammle es erst ein, dann kannst du es anhängen."
            );
        }

        if (clean.attached && clean.channelId && clean.targetId) {
            this.CheckFree(await this.Panels(guild.id), { id, ...clean });

            const message = await this.Target(guild, clean.channelId, clean.targetId, member);

            this.CheckKind(clean.kind, message.author.id === this.client.user?.id);
        }

        await this.client.selfRolePanels.Save(id, clean);

        const panel = await this.Panel(guild.id, id);
        let warning: string | null = null;

        // Steht die Nachricht schon irgendwo, zieht sie nach.
        if (panel.messageId) {
            await this.Send(guild, panel, previous).catch((error) => {
                warning = error instanceof SelfRoleError ? error.message : "Die Nachricht in Discord zog nicht nach.";

                if (!(error instanceof SelfRoleError)) logger.warn(`🎭 Self Roles: Panel ${id} auf ${guild.id} nicht nachgezogen: ${String(error)}`);
            });
        }

        return { panel, warning };
    }

    async Remove(guild: Guild, id: number): Promise<void> {
        const panel = await this.Panel(guild.id, id);

        await this.Delete(guild, panel).catch(() => undefined);
        await this.client.selfRolePanels.Remove(id);
        await this.Track(guild.id);
    }

    /* ----------------------------------------------------------
       Wer darf
       ---------------------------------------------------------- */
    /**
     * Darf dieses Mitglied den Kanal lesen? Bei einem privaten Thread dazu
     * Mitglied sein oder „Threads verwalten“ haben. Kein Recht (null) heißt nein.
     */
    async Readable(channel: GuildTextBasedChannel, member: GuildMember): Promise<boolean> {
        const perms = channel.permissionsFor(member);

        if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) return false;
        if (channel.type !== ChannelType.PrivateThread || perms.has(PermissionFlagsBits.ManageThreads)) return true;

        return Boolean(await channel.members.fetch({ member: member.id, force: true }).catch(() => null));
    }

    /** Für „Anhängen“: dieselbe Prüfung wie beim Prüfen und Speichern, ohne die Nachricht zu holen. */
    async CheckReader(guild: Guild, member: GuildMember, panel: ISelfRolePanel): Promise<void> {
        if (!panel.attached || !panel.channelId) return;

        const channel = await this.Channel(guild, panel.channelId);

        if (!channel || !(await this.Readable(channel, member))) throw new SelfRoleError(NO_ACCESS);
    }

    private async Channel(guild: Guild, channelId: string): Promise<GuildTextBasedChannel | null> {
        const channel = SNOWFLAKE.test(channelId) ? (guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))) : null;

        return channel?.isTextBased() ? channel : null;
    }

    /* ----------------------------------------------------------
       Die Nachricht
       ---------------------------------------------------------- */
    private NameOf(guild: Guild): (id: string) => string {
        return (id) => guild.roles.cache.get(id)?.name ?? "gelöschte Rolle";
    }

    /**
     * Schickt das Panel oder aktualisiert die schon gesendete Nachricht. Ein
     * angehängtes Panel hängt sich stattdessen an seine Nachricht.
     */
    async Send(guild: Guild, panel: ISelfRolePanel, previous?: ISelfRolePanel): Promise<ISelfRolePanel> {
        try {
            return panel.attached ? await this.Attach(guild, panel, previous) : await this.Post(guild, panel, previous);
        } finally {
            await this.Track(guild.id);
        }
    }

    /** Die eigene Nachricht des Panels. */
    private async Post(guild: Guild, panel: ISelfRolePanel, previous?: ISelfRolePanel): Promise<ISelfRolePanel> {
        if (!panel.channelId) throw new SelfRoleError("Wähle zuerst einen Kanal.");
        if (!panel.roles.length) throw new SelfRoleError("Ohne Rollen gibt es nichts zum Anklicken.");

        const channel = guild.channels.cache.get(panel.channelId);

        if (!channel?.isTextBased()) throw new SelfRoleError("Diesen Kanal gibt es nicht mehr.");

        const view = await SelfRolePanelView(this.client, panel, this.NameOf(guild));

        if (panel.messageId) {
            const old = await channel.messages.fetch(panel.messageId).catch(() => null);

            if (old) {
                // attachments: [] wirft die Bilder der vorigen Fassung weg - sonst
                // haengen sie nach einem Wechsel des Bildes doppelt daran.
                await old.edit({ ...view, attachments: [] });
                await this.React(old, panel, previous);

                return panel;
            }
        }

        const sent = await channel.send(view).catch(() => null);

        if (!sent) throw new SelfRoleError("Die Nachricht ging nicht raus. Darf der Bot in den Kanal schreiben?");

        await this.client.selfRolePanels.Save(panel.id, { messageId: sent.id });
        await this.React(sent, panel, previous);

        return { ...panel, messageId: sent.id };
    }

    /** W-0101: Reihe oder Reaktionen an die vorhandene Nachricht hängen. */
    private async Attach(guild: Guild, panel: ISelfRolePanel, previous?: ISelfRolePanel): Promise<ISelfRolePanel> {
        if (!panel.channelId || !panel.targetId) throw new SelfRoleError("Gib zuerst die Nachricht an, an die das Panel soll.");
        if (!panel.roles.length) throw new SelfRoleError("Ohne Rollen gibt es nichts zum Anklicken.");

        this.CheckFree(await this.Panels(guild.id), panel);

        const message = await this.Target(guild, panel.channelId, panel.targetId);

        this.CheckKind(panel.kind, message.author.id === this.client.user?.id);

        // Vor dem Anhängen vermerken: scheitert unterwegs etwas, hängt vielleicht schon
        // die Hälfte dran - dann räumt „Lösen“ sie wieder ab.
        if (panel.messageId !== message.id) await this.client.selfRolePanels.Save(panel.id, { messageId: message.id });

        await this.Place(message, panel, previous);

        return { ...panel, messageId: message.id };
    }

    /**
     * Setzt Reihe und Reaktionen des Panels an die Nachricht und nimmt eigene
     * alte ab. Ohne Rollen ist das genau das Lösen.
     */
    private async Place(message: Message<true>, panel: ISelfRolePanel, previous?: ISelfRolePanel): Promise<void> {
        if (message.author.id === this.client.user?.id) {
            const existing = message.components.map((entry) => entry.toJSON() as IRawComponent);
            const rows = PanelRows(panel, this.NameOf(message.guild)).map((row) => row.toJSON() as IRawComponent);
            const next = this.MergeRows(existing, rows, panel.id, message.flags.has(MessageFlags.IsComponentsV2));
            const files = new Map(message.attachments.map((file) => [file.id, file.name]));

            // Nur components geht mit: Text, Embeds, Dateien und Flags (auch IsComponentsV2) lässt Discord stehen.
            if (rows.length || next.length !== existing.length) await message.edit({ components: Rebase(next, files) as never });
        }

        await this.React(message, panel, previous);
    }

    /**
     * Welche Reaktionen der Bot setzt und welche eigenen er abnimmt. mine: die
     * Schlüssel (EmojiKey) seiner Reaktionen an der Nachricht. Abgenommen wird
     * nur, was ein Reaktions-Panel gesetzt haben kann - andere bleiben.
     */
    ReactionPlan(mine: readonly string[], panel: ISelfRolePanel, previous?: ISelfRolePanel): { add: string[]; remove: string[] } {
        const wanted = panel.kind === "reactions" ? panel.roles.flatMap((role) => (role.emoji ? [role.emoji] : [])) : [];
        const keys = new Set(wanted.map((emoji) => EmojiKey(emoji)));
        const ours = new Set([...ReactionKeys(previous), ...ReactionKeys(panel)]);

        return {
            add: wanted.filter((emoji) => !mine.includes(EmojiKey(emoji))),
            remove: mine.filter((key) => ours.has(key) && !keys.has(key)),
        };
    }

    /** Setzt die Reaktionen des Panels und nimmt eigene ab, die keine Rolle mehr haben. */
    private async React(message: Message, panel: ISelfRolePanel, previous?: ISelfRolePanel): Promise<void> {
        const me = this.client.user?.id;
        const mine = [...message.reactions.cache.values()].filter((reaction) => reaction.me);
        const plan = this.ReactionPlan(
            mine.map((reaction) => EmojiKey(reaction.emoji)),
            panel,
            previous
        );

        for (const reaction of mine) {
            if (me && plan.remove.includes(EmojiKey(reaction.emoji))) await reaction.users.remove(me).catch(() => undefined);
        }

        for (const emoji of plan.add) {
            await message.react(emoji).catch(() => {
                throw new SelfRoleError(`${emoji} ging nicht an die Nachricht. Braucht der Bot „Reaktionen hinzufügen“, oder hängen dort schon 20 verschiedene (mehr erlaubt Discord nicht)?`);
            });
        }
    }

    /** Löscht die gesendete Nachricht, das Panel bleibt. Ein angehängtes löst sich nur, die Nachricht bleibt. */
    async Delete(guild: Guild, panel: ISelfRolePanel): Promise<void> {
        if (!panel.channelId || !panel.messageId) return;

        // Erst aus der Zuordnung und aus der Datenbank: sonst hielte Edited() das
        // Abnehmen der Reihe für die Bearbeitung eines anderen Moduls und hinge sie
        // wieder an - auch wenn ein paralleles Track() die Zuordnung neu einliest.
        this.placed.delete(panel.messageId);

        try {
            await this.client.selfRolePanels.Save(panel.id, { messageId: null });

            const channel = guild.channels.cache.get(panel.channelId);

            if (channel?.isTextBased()) {
                const message = await channel.messages.fetch({ message: panel.messageId, force: true }).catch(() => null);

                if (panel.attached) {
                    if (message) await this.Place(message, { ...panel, roles: [] }, panel);
                } else {
                    await message?.delete().catch(() => undefined);
                }
            }
        } finally {
            await this.Track(guild.id);
        }
    }

    /**
     * Die Nachricht hinter Kanal und ID - vom selben Server, sonst ein klarer
     * Fehler. Mit member erst das Leserecht, dann die Nachricht: so verrät die
     * Antwort nichts über einen Kanal, den der Fragende nicht sehen darf.
     */
    private async Target(guild: Guild, channelId: string, messageId: string, member?: GuildMember): Promise<Message<true>> {
        const channel = await this.Channel(guild, channelId);

        if (member && (!channel || !(await this.Readable(channel, member)))) throw new SelfRoleError(NO_ACCESS);
        if (!channel) throw new SelfRoleError("Diesen Kanal finde ich auf dem Server nicht.");

        const message = await channel.messages.fetch({ message: messageId, force: true }).catch(() => null);

        if (!message) throw new SelfRoleError("Die Nachricht finde ich nicht. Stimmt der Link, und darf der Bot den Kanal lesen?");

        return message;
    }

    /** Ein Nachrichtenlink (auch aus PTB und Canary) oder eine reine ID. Bei der ID fehlt der Kanal. */
    ParseLink(input: unknown, guildId: string): { channelId: string | null; messageId: string } {
        const text = typeof input === "string" ? input.trim() : "";

        if (SNOWFLAKE.test(text)) return { channelId: null, messageId: text };

        const match = LINK.exec(text);

        if (!match) throw new SelfRoleError("Das ist weder ein Link zu einer Nachricht noch eine ID. Rechtsklick auf die Nachricht → Nachrichtenlink kopieren.");
        if (match[1] !== guildId) throw new SelfRoleError("Die Nachricht liegt auf einem anderen Server. Es geht nur eine von diesem.");

        return { channelId: match[2], messageId: match[3] };
    }

    /**
     * „Prüfen“ im Dashboard: wo die Nachricht steht, von wem sie ist und was
     * darin steht. Nur aus Kanälen, die der Fragende selbst lesen darf - der
     * Auszug soll nichts aus einem Kanal zeigen, der ihm verschlossen ist.
     */
    async Inspect(guild: Guild, member: GuildMember, link: unknown, channelId: unknown): Promise<IMessageInfo> {
        const ref = this.ParseLink(link, guild.id);
        const channel = ref.channelId ?? (typeof channelId === "string" && channelId ? channelId : null);

        if (!channel) throw new SelfRoleError("Bei einer reinen ID wähle den Kanal dazu.");

        const message = await this.Target(guild, channel, ref.messageId, member);

        return {
            channelId: message.channelId,
            channelName: message.channel.name,
            messageId: message.id,
            author: message.member?.displayName ?? message.author.displayName,
            own: message.author.id === this.client.user?.id,
            excerpt: Excerpt(message),
            createdAt: message.createdTimestamp,
        };
    }

    /**
     * Die Komponenten einer Nachricht mit dem Panel: eigene alte Reihen raus,
     * die neuen unten dran, alles andere bleibt. Ohne neue Reihen ist das Lösen.
     */
    MergeRows(existing: readonly IRawComponent[], rows: readonly IRawComponent[], panelId: number, v2: boolean): IRawComponent[] {
        const next = [...existing.filter((entry) => !IsOwnRow(entry, panelId)), ...rows];

        if (!rows.length) return next;
        if (v2 && Count(next) > MAX_V2) throw new SelfRoleError(`An dieser Nachricht ist kein Platz mehr: Discord erlaubt ${MAX_V2} Komponenten, mit dem Panel wären es ${Count(next)}.`);
        if (!v2 && next.length > MAX_ROWS) throw new SelfRoleError(`An dieser Nachricht ist kein Platz mehr: Discord erlaubt fünf Reihen, mit dem Panel wären es ${next.length}.`);

        return next;
    }

    /** Hat jemand eine angehängte Nachricht bearbeitet und dabei unsere Reihe verloren? */
    NeedsReattach(panel: ISelfRolePanel, components: readonly IRawComponent[] | undefined): boolean {
        return panel.attached && panel.kind !== "reactions" && Array.isArray(components) && !components.some((entry) => IsOwnRow(entry, panel.id));
    }

    /* ----------------------------------------------------------
       Welche Nachricht zu welchem Panel gehört
       ---------------------------------------------------------- */
    /** Beim Start: alles, was gerade in Discord steht. */
    async Startup(): Promise<void> {
        const panels = await this.client.selfRolePanels.Placed();

        this.placed.clear();

        for (const panel of panels) if (panel.messageId) this.placed.set(panel.messageId, panel);
    }

    /** Nach jeder Änderung an einem Server neu einlesen. Schlägt das fehl, bleibt der alte Stand und es steht im Log. */
    async Track(guildId: string): Promise<void> {
        try {
            const panels = await this.client.selfRolePanels.OfGuild(guildId);

            for (const [messageId, panel] of this.placed) if (panel.guildId === guildId) this.placed.delete(messageId);
            for (const panel of panels) if (panel.messageId) this.placed.set(panel.messageId, panel);
        } catch (error) {
            logger.warn(`🎭 Self Roles: Zuordnung für ${guildId} nicht neu eingelesen: ${String(error)}`);
        }
    }

    /* ----------------------------------------------------------
       Wenn jemand reagiert
       ---------------------------------------------------------- */
    /** Führt work erst aus, wenn alles vorher unter demselben Schlüssel fertig ist. */
    Queue(key: string, work: () => Promise<void>): Promise<void> {
        const run = (this.queues.get(key) ?? Promise.resolve()).then(work, work);

        this.queues.set(key, run);
        void run.catch(() => undefined).then(() => {
            if (this.queues.get(key) === run) this.queues.delete(key);
        });

        return run;
    }

    /**
     * Eine Reaktion an einem Panel mit Reaktionen, als Rohereignis - so zählen
     * auch Nachrichten, die nicht im Cache liegen. Je Mitglied nacheinander und
     * mit frisch geholten Rollen: sonst hebelten zwei schnelle Reaktionen
     * "genau eine" und die Höchstzahl aus. Antworten geht hier nicht: was
     * scheitert, steht im Log, eine abgelehnte Reaktion nimmt der Bot wieder weg.
     */
    async Reaction(data: GatewayMessageReactionAddDispatchData, added: boolean): Promise<void> {
        const panel = this.placed.get(data.message_id);
        const guild = data.guild_id ? this.client.guilds.cache.get(data.guild_id) : undefined;

        // Super-Reaktionen sind ein bezahltes Extra, keine Auswahl.
        if (!panel || panel.kind !== "reactions" || !guild || data.burst || data.user_id === this.client.user?.id) return;
        // W-0057: Gesperrte holen sich auch so keine Rollen.
        if (BlockedAt(data.user_id, guild.ownerId)) return;

        await this.Queue(`${guild.id}:${data.user_id}`, () => this.ApplyReaction(guild, data, added));
    }

    private async ApplyReaction(guild: Guild, data: GatewayMessageReactionAddDispatchData, added: boolean): Promise<void> {
        // Erst jetzt nachsehen: das Panel kann sich geändert haben, während die Reaktion wartete.
        const panel = this.placed.get(data.message_id);
        const role = panel?.kind === "reactions" ? panel.roles.find((entry) => entry.emoji && EmojiKey(entry.emoji) === EmojiKey(data.emoji)) : undefined;

        if (!panel || !role || !(await this.client.settings.Of(guild.id)).modules.includes(SELF_ROLE_MODULE)) return;

        const member = await guild.members.fetch({ user: data.user_id, force: true }).catch(() => null);

        if (!member || member.user.bot) return;

        const held = new Set(panel.roles.filter((entry) => member.roles.cache.has(entry.roleId)).map((entry) => entry.roleId));
        const step = this.ReactionStep(panel, held, role.roleId, added, !panel.requireRole || member.roles.cache.has(panel.requireRole));

        if (!step) return;

        const reason = `Self Roles: ${panel.name}`;

        try {
            for (const id of step.add) await guild.members.addRole({ user: data.user_id, role: id, reason });
            for (const id of step.remove) await guild.members.removeRole({ user: data.user_id, role: id, reason });
        } catch (error) {
            logger.warn(`🎭 Self Roles: Rolle für ${data.user_id} auf ${guild.id} nicht geändert (Panel ${panel.id}): ${String(error)}`);

            return;
        }

        // Abgelehnt: die Reaktion wieder weg, mit dem Emoji aus dem Ereignis. Bei "genau eine" auch die der ersetzten Rollen.
        const undo = step.undo
            ? [ReactionParam(data.emoji)]
            : added
              ? panel.roles.filter((entry) => entry.emoji && step.remove.includes(entry.roleId)).map((entry) => ReactionParam(entry.emoji!))
              : [];
        const channel = guild.channels.cache.get(data.channel_id);

        if (!undo.length || !channel || !guild.members.me?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) return;

        for (const emoji of undo) {
            await this.client.rest.delete(Routes.channelMessageUserReaction(data.channel_id, data.message_id, emoji, data.user_id)).catch(() => undefined);
        }
    }

    /**
     * Eine Reaktion dazu oder weg: welche Rollen kommen, welche gehen. undo heißt,
     * die Reaktion wieder entfernen - die Rolle gibt es nicht (Höchstzahl, Voraussetzung).
     * Dieselben Regeln wie beim Knopf, siehe Next().
     */
    ReactionStep(panel: ISelfRolePanel, held: Set<string>, roleId: string, added: boolean, allowed: boolean): { add: string[]; remove: string[]; undo: boolean } | null {
        if (!panel.roles.some((entry) => entry.roleId === roleId)) return null;

        const none = { add: [], remove: [], undo: false };

        if (!allowed) return { ...none, undo: added };
        if (added === held.has(roleId)) return none;

        const next = this.Next(panel, held, roleId)!;

        if (added && panel.maxRoles > 0 && next.size > panel.maxRoles) return { ...none, undo: true };

        return { add: [...next].filter((id) => !held.has(id)), remove: [...held].filter((id) => !next.has(id)), undo: false };
    }

    /**
     * Ein anderes Modul hat eine angehängte Nachricht bearbeitet, und unsere
     * Reihe ist weg: wieder dran. In der Pause nach dem letzten Nachziehen nicht
     * sofort, sondern einmal an ihrem Ende - mit frisch geholter Nachricht.
     */
    async Edited(data: GatewayMessageUpdateDispatchData): Promise<void> {
        const known = this.placed.get(data.id);
        const guild = data.guild_id ? this.client.guilds.cache.get(data.guild_id) : undefined;
        const components = data.components as unknown as IRawComponent[] | undefined;

        if (!known || !guild || !this.NeedsReattach(known, components)) return;

        // Die Pause schützt vor einem Hin und Her mit einem Modul, das seine Nachricht ebenfalls nachzieht.
        const wait = (this.reattached.get(known.id) ?? 0) + REATTACH_PAUSE - Date.now();

        if (wait > 0) {
            if (!this.pending.has(known.id)) {
                this.pending.set(
                    known.id,
                    setTimeout(() => {
                        this.pending.delete(known.id);
                        void this.Reattach(guild, known.id, data.id);
                    }, wait)
                );
            }

            return;
        }

        await this.Reattach(guild, known.id, data.id, components);
    }

    /** components: aus dem Ereignis; ohne sie (nach der Pause) wird die Nachricht frisch geholt. */
    private async Reattach(guild: Guild, panelId: number, messageId: string, components?: IRawComponent[]): Promise<void> {
        // Frisch aus der Datenbank: hat gerade das Speichern selbst die Art gewechselt
        // (etwa auf Reaktionen), ist die fehlende Reihe Absicht und kein fremdes Bearbeiten.
        const panel = await this.client.selfRolePanels.Get(panelId).catch(() => null);

        if (!panel?.channelId || panel.messageId !== messageId) return;
        if (!(await this.client.settings.Of(guild.id)).modules.includes(SELF_ROLE_MODULE)) return;

        const current =
            components ?? (await this.Target(guild, panel.channelId, messageId).catch(() => null))?.components.map((entry) => entry.toJSON() as IRawComponent);

        if (!this.NeedsReattach(panel, current)) return;

        this.reattached.set(panel.id, Date.now());

        await this.Attach(guild, panel)
            .then(() => logger.info(`🎭 Self Roles: Reihe von Panel ${panel.id} auf ${guild.id} wieder angehängt`))
            .catch((error) => logger.warn(`🎭 Self Roles: Panel ${panel.id} auf ${guild.id} nicht wieder angehängt: ${String(error)}`));
    }

    /* ----------------------------------------------------------
       Wenn jemand klickt
       ---------------------------------------------------------- */
    async Handle(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split(":");

        if (parts[0] !== SELF_ROLE_PREFIX || !interaction.inCachedGuild()) return;
        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(SELF_ROLE_MODULE)) return;

        // W-0109 (Strix vuln-0010): je Mitglied nacheinander wie bei den Reaktionen,
        // sonst hebeln zwei gleichzeitige Klicks "genau eine" und die Höchstzahl aus.
        // Erst quittieren: in der Schlange kann es länger als drei Sekunden dauern.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.Queue(`${interaction.guildId}:${interaction.user.id}`, () => this.Click(interaction, parts));
    }

    private async Click(interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">, parts: string[]): Promise<void> {
        const menu = parts[1] === "menu";
        const panelId = Number(menu ? parts[2] : parts[1]);
        const panel = await this.client.selfRolePanels.Get(panelId).catch(() => null);

        if (!panel || panel.guildId !== interaction.guildId) {
            await this.Answer(interaction, "Dieses Panel gibt es nicht mehr.");

            return;
        }

        // Frisch geholt: die Rollen nach allen Klicks davor, nicht die aus dem Klick selbst.
        const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);

        if (!member) {
            await this.Answer(interaction, "Ich finde dich auf diesem Server nicht.");

            return;
        }

        const known = new Set(panel.roles.map((role) => role.roleId));
        const held = new Set(panel.roles.filter((role) => member.roles.cache.has(role.roleId)).map((role) => role.roleId));

        if (panel.requireRole && !member.roles.cache.has(panel.requireRole)) {
            await this.Answer(interaction, `Dafür brauchst du <@&${panel.requireRole}>.`);

            return;
        }

        // Das Menü schickt den ganzen Wunschzustand, ein Knopf nur eine Rolle.
        const wanted = menu
            ? new Set((interaction as StringSelectMenuInteraction).values.filter((id) => known.has(id)))
            : this.Next(panel, held, parts[2]);

        if (!wanted) {
            await this.Answer(interaction, "Diese Rolle gehört nicht mehr zu diesem Panel.");

            return;
        }

        await this.Apply(interaction, member, panel, held, wanted);
    }

    /** Ein Knopf: die Rolle an- oder abwählen, je nach Regel des Panels. */
    Next(panel: ISelfRolePanel, held: Set<string>, roleId: string | undefined): Set<string> | null {
        const role = panel.roles.find((entry) => entry.roleId === roleId);

        if (!role) return null;

        const next = new Set(held);

        if (held.has(role.roleId)) {
            // Gesperrte Rollen kommen nur dazu - abwählen geht nicht.
            if (!role.locked) next.delete(role.roleId);

            return next;
        }

        // "Genau eine": die neue ersetzt die anderen aus diesem Panel.
        if (panel.mode === "single") {
            for (const entry of panel.roles) if (!entry.locked) next.delete(entry.roleId);
        }

        next.add(role.roleId);

        return next;
    }

    private async Apply(
        interaction: ButtonInteraction | StringSelectMenuInteraction,
        member: GuildMember,
        panel: ISelfRolePanel,
        held: Set<string>,
        wanted: Set<string>
    ): Promise<void> {
        const locked = new Set(panel.roles.filter((role) => role.locked).map((role) => role.roleId));

        // Was gesperrt ist und schon da ist, bleibt - egal was ankommt.
        for (const id of held) if (locked.has(id)) wanted.add(id);

        const add = [...wanted].filter((id) => !held.has(id));
        const remove = [...held].filter((id) => !wanted.has(id));

        if (!add.length && !remove.length) {
            await this.Answer(interaction, "Daran ändert sich nichts.");

            return;
        }

        if (panel.maxRoles > 0 && wanted.size > panel.maxRoles) {
            await this.Answer(interaction, `Aus diesem Panel sind höchstens ${panel.maxRoles} Rollen erlaubt, du hast schon ${held.size}.`);

            return;
        }

        try {
            if (add.length) await member.roles.add(add, `Self Roles: ${panel.name}`);
            if (remove.length) await member.roles.remove(remove, `Self Roles: ${panel.name}`);
        } catch {
            await this.Answer(interaction, "Das hat nicht geklappt. Meine Rolle steht wohl zu weit unten.");

            return;
        }

        const lines = [
            add.length ? `**Dazu** ${add.map((id) => `<@&${id}>`).join(" ")}` : null,
            remove.length ? `**Weg** ${remove.map((id) => `<@&${id}>`).join(" ")}` : null,
        ].filter((line): line is string => Boolean(line));

        await this.Answer(interaction, lines.join("\n"));
    }

    private async Answer(interaction: ButtonInteraction | StringSelectMenuInteraction, text: string): Promise<void> {
        const message = new ComponentV2Builder({ accentColor: "Blurple" }).text(text).toMessage({ ephemeral: true });
        // Nach deferReply ersetzt die Antwort den Platzhalter - edit kennt kein Ephemeral, das steht schon.
        const sent =
            interaction.deferred && !interaction.replied
                ? interaction.editReply({ components: message.components, flags: MessageFlags.IsComponentsV2 })
                : interaction.replied
                  ? interaction.followUp(message)
                  : interaction.reply(message);

        await sent.catch(() => undefined);
    }
}
