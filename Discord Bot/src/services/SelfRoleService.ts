import {
    ButtonInteraction,
    Guild,
    GuildMember,
    PermissionFlagsBits,
    Role,
    StringSelectMenuInteraction,
} from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { SelfRolePanelView } from "../builder/SelfRoleView";
import {
    CleanEmoji,
    DefaultBody,
    MAX_DESCRIPTION,
    MAX_LABEL,
    MAX_NAME,
    MAX_PANELS,
    MAX_ROLES,
    SELF_ROLE_MODULE,
    SELF_ROLE_PREFIX,
} from "../constants/SelfRoles";
import { DefaultMessageDoc } from "../constants/Messages";
import { IPanelBody, ISelfRole, ISelfRolePanel, PanelKind, PanelMode } from "../interfaces/services/selfroles/ISelfRoles";
import logger from "../utils/logger";

export class SelfRoleError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Self Roles: Panels, aus denen sich Mitglieder ihre Rollen selbst holen -
 * als Knopfreihe oder als Auswahlmenü, mit Regeln dazu. Siehe docs/SelfRoles.md.
 */
export default class SelfRoleService {
    private readonly client: BotClient;

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

        if (!name) throw new SelfRoleError("Gib dem Panel einen Namen – nur ihr seht ihn.");

        const kind: PanelKind = raw.kind === "select" || raw.kind === "buttons" ? raw.kind : (previous?.kind ?? "buttons");
        const mode: PanelMode = raw.mode === "single" || raw.mode === "multi" ? raw.mode : (previous?.mode ?? "multi");
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const body = this.client.messageService.CleanBody(guild, IsRecord(raw.body) ? raw.body : {}, previous?.body ?? DefaultBody(), DefaultMessageDoc()) as IPanelBody;
        const roles = raw.roles === undefined ? (previous?.roles ?? []) : this.CleanRoles(guild, raw.roles);
        const max = Math.max(0, Math.min(MAX_ROLES, Math.floor(Number(raw.maxRoles ?? previous?.maxRoles ?? 0)) || 0));
        const require = typeof raw.requireRole === "string" && guild.roles.cache.has(raw.requireRole) ? raw.requireRole : raw.requireRole === undefined ? (previous?.requireRole ?? null) : null;

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
        };
    }

    /** Die Rollen eines Panels - jede muss es geben und der Bot muss sie vergeben dürfen. */
    CleanRoles(guild: Guild, input: unknown): ISelfRole[] {
        if (!Array.isArray(input)) return [];

        const me = guild.members.me;
        const seen = new Set<string>();
        const roles: ISelfRole[] = [];

        for (const entry of input.slice(0, MAX_ROLES)) {
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
        if (role.managed) throw new SelfRoleError(`@${role.name} gehört zu einer Integration – die kann niemand von Hand vergeben.`);
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.comparePositionTo(me.roles.highest) >= 0) {
            throw new SelfRoleError(`@${role.name} muss unter der höchsten Rolle des Bots stehen, und er braucht „Rollen verwalten".`);
        }
    }

    async Create(guild: Guild, member: GuildMember, input: unknown): Promise<ISelfRolePanel> {
        if ((await this.Panels(guild.id)).length >= MAX_PANELS) throw new SelfRoleError(`Mehr als ${MAX_PANELS} Panels gehen nicht.`);

        const clean = this.Clean(guild, input);
        const panel = await this.client.selfRolePanels.Create({ guildId: guild.id, createdBy: member.id, ...clean });

        logger.user(`🎭 Self-Role-Panel "${panel.name}" auf ${guild.id} angelegt (von ${member.id})`);

        return panel;
    }

    async Save(guild: Guild, id: number, input: unknown): Promise<ISelfRolePanel> {
        const previous = await this.Panel(guild.id, id);
        const clean = this.Clean(guild, input, previous);

        await this.client.selfRolePanels.Save(id, clean);

        const panel = await this.Panel(guild.id, id);

        // Steht die Nachricht schon irgendwo, zieht sie nach.
        if (panel.messageId) await this.Send(guild, panel).catch(() => undefined);

        return panel;
    }

    async Remove(guild: Guild, id: number): Promise<void> {
        const panel = await this.Panel(guild.id, id);

        await this.Delete(guild, panel).catch(() => undefined);
        await this.client.selfRolePanels.Remove(id);
    }

    /* ----------------------------------------------------------
       Die Nachricht
       ---------------------------------------------------------- */
    private NameOf(guild: Guild): (id: string) => string {
        return (id) => guild.roles.cache.get(id)?.name ?? "gelöschte Rolle";
    }

    /** Schickt das Panel oder aktualisiert die schon gesendete Nachricht. */
    async Send(guild: Guild, panel: ISelfRolePanel): Promise<ISelfRolePanel> {
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

                return panel;
            }
        }

        const sent = await channel.send(view).catch(() => null);

        if (!sent) throw new SelfRoleError("Die Nachricht ging nicht raus – darf der Bot in den Kanal schreiben?");

        await this.client.selfRolePanels.Save(panel.id, { messageId: sent.id });

        return { ...panel, messageId: sent.id };
    }

    /** Löscht die gesendete Nachricht, das Panel bleibt. */
    async Delete(guild: Guild, panel: ISelfRolePanel): Promise<void> {
        if (!panel.channelId || !panel.messageId) return;

        const channel = guild.channels.cache.get(panel.channelId);

        if (channel?.isTextBased()) {
            const message = await channel.messages.fetch(panel.messageId).catch(() => null);

            await message?.delete().catch(() => undefined);
        }

        await this.client.selfRolePanels.Save(panel.id, { messageId: null });
    }

    /* ----------------------------------------------------------
       Wenn jemand klickt
       ---------------------------------------------------------- */
    async Handle(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split(":");

        if (parts[0] !== SELF_ROLE_PREFIX || !interaction.inCachedGuild()) return;
        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(SELF_ROLE_MODULE)) return;

        const menu = parts[1] === "menu";
        const panelId = Number(menu ? parts[2] : parts[1]);
        const panel = await this.client.selfRolePanels.Get(panelId).catch(() => null);

        if (!panel || panel.guildId !== interaction.guildId) {
            await this.Answer(interaction, "Dieses Panel gibt es nicht mehr.");

            return;
        }

        const member = interaction.member;
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

        await this.Apply(interaction, panel, held, wanted);
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
        panel: ISelfRolePanel,
        held: Set<string>,
        wanted: Set<string>
    ): Promise<void> {
        const member = interaction.member as GuildMember;
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
            await this.Answer(interaction, `Aus diesem Panel sind höchstens ${panel.maxRoles} Rollen erlaubt – du hast schon ${held.size}.`);

            return;
        }

        try {
            if (add.length) await member.roles.add(add, `Self Roles: ${panel.name}`);
            if (remove.length) await member.roles.remove(remove, `Self Roles: ${panel.name}`);
        } catch {
            await this.Answer(interaction, "Das hat nicht geklappt – meine Rolle steht wohl zu weit unten.");

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

        await (interaction.replied || interaction.deferred ? interaction.followUp(message) : interaction.reply(message)).catch(() => undefined);
    }
}
