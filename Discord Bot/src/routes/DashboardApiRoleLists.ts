import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import {
    DESIGN_LABELS,
    IMAGE_PRESETS,
    ImagePreset,
    LIST_TEMPLATES,
    MAX_BUTTON,
    MAX_HEADING,
    MAX_IMAGE_PEOPLE,
    MAX_LABEL,
    MAX_LEAD,
    MAX_LISTS,
    MAX_NAME,
    MAX_PRESETS,
    MAX_ROLES,
    MAX_SUB,
    MAX_TITLE,
    MOTIFS,
    ROLE_LISTS_MODULE,
    RoleListDesign,
} from "../constants/RoleLists";
import { RoleListText, TotalMembers } from "../builder/RoleListView";
import { RenderRoleListCard } from "../builder/RoleListCard";
import { RoleListError } from "../services/RoleListService";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    ids?: unknown;
    name?: unknown;
    template?: unknown;
    list?: { name?: unknown; channelId?: unknown; design?: unknown; settings?: unknown };
    image?: unknown;
}

/** Wie viele Mitglieder je Rolle das Dashboard für die Titel bekommt. */
const MEMBERS_PER_ROLE = 200;

/** Ein Teil der Text-Vorschau: so baut das Dashboard die Karte nach. */
interface IPreviewPart {
    type: "text" | "separator" | "section" | "buttons";
    content?: string;
    thumbnail?: string;
    buttons?: { label: string; url: string }[];
}

/** Die Karte (Components V2) als flache Teile - Text, Trenner, Abschnitt mit Bild, Knöpfe. */
function PreviewParts(json: unknown): IPreviewPart[] {
    const parts: IPreviewPart[] = [];

    for (const component of (json as { components?: Record<string, unknown>[] }).components ?? []) {
        switch (component.type) {
            case 10:
                parts.push({ type: "text", content: String(component.content ?? "") });
                break;
            case 14:
                parts.push({ type: "separator" });
                break;
            case 9: {
                const texts = (component.components as { content?: string }[] | undefined) ?? [];
                const accessory = component.accessory as { media?: { url?: string } } | undefined;

                parts.push({ type: "section", content: texts.map((text) => text.content ?? "").join("\n"), thumbnail: accessory?.media?.url });
                break;
            }
            case 1:
                parts.push({ type: "buttons", buttons: ((component.components as { label?: string; url?: string }[] | undefined) ?? []).map((button) => ({ label: button.label ?? "", url: button.url ?? "" })) });
                break;
        }
    }

    return parts;
}

/**
 * Rollen-Listen im Dashboard (Plan 29): Listen lesen, anlegen, speichern,
 * löschen, senden, die Vorschau mit dem ungespeicherten Entwurf und die
 * eigenen Bild-Vorlagen. Siehe docs/RoleLists.md.
 */
export default class DashboardApiRoleLists extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/role-lists`,
            description: "Rollen-Listen: Listen, Vorschau und eigene Bild-Vorlagen",
            prefixed: false,
            requiresAuth: false,
            // Die Bild-Vorschau zeichnet beim Schieben der Regler oft - großzügiger als sonst.
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, ROLE_LISTS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, request.query));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof RoleListError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess, query?: unknown) {
        const { guild } = access;
        const service = this.client.roleListService;
        const lists = await service.Lists(guild.id);

        // Die Leiste braucht nur die Namen - nicht Mitglieder, Rollen und Kanäle.
        if ((query as { nur?: unknown } | undefined)?.nur === "namen") return { lists: lists.map((list) => ({ id: list.id, name: list.name })) };
        const used = new Set(lists.flatMap((list) => list.settings.roles.map((entry) => entry.roleId)));
        const members: Record<string, { id: string; name: string }[]> = {};

        for (const roleId of used) {
            members[roleId] = service
                .Members(guild, [roleId])
                .sort((a, b) => a.name.localeCompare(b.name, "de"))
                .slice(0, MEMBERS_PER_ROLE)
                .map((member) => ({ id: member.id, name: member.name }));
        }

        const roleIcons: Record<string, string> = {};
        const memberCounts: Record<string, number> = {};

        for (const role of guild.roles.cache.values()) {
            const icon = role.iconURL?.({ extension: "png", size: 64 });

            if (icon) roleIcons[role.id] = icon;
        }

        // Ein Durchgang über die Mitglieder statt role.members je Rolle (das filtert jedes Mal alle).
        for (const member of guild.members.cache.values()) {
            for (const roleId of member.roles.cache.keys()) memberCounts[roleId] = (memberCounts[roleId] ?? 0) + 1;
        }

        return {
            lists: lists.map((list) => ({ ...list, members: TotalMembers(service.Groups(guild, list.settings)) })),
            presets: await service.Presets(guild.id),
            imagePresets: Object.fromEntries(Object.entries(IMAGE_PRESETS).map(([key, preset]) => [key, { label: preset.label, image: ImagePreset(key) }])),
            motifs: MOTIFS,
            templates: Object.fromEntries(Object.entries(LIST_TEMPLATES).map(([key, template]) => [key, template.label])),
            designs: DESIGN_LABELS,
            limits: {
                lists: MAX_LISTS,
                roles: MAX_ROLES,
                presets: MAX_PRESETS,
                title: MAX_TITLE,
                label: MAX_LABEL,
                name: MAX_NAME,
                heading: MAX_HEADING,
                sub: MAX_SUB,
                lead: MAX_LEAD,
                button: MAX_BUTTON,
                people: MAX_IMAGE_PEOPLE,
            },
            intent: service.HasMemberIntent(),
            members,
            guild: { name: guild.name, icon: guild.iconURL({ size: 128 }), ...GuildResources(guild), roleIcons, memberCounts },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, actor } = access;
        const service = this.client.roleListService;
        const id = Number(body.id ?? 0);

        switch (body.action) {
            case "create": {
                const list = await service.Create(guild, { name: body.name, template: body.template });

                logger.user(`📋 Rollen-Liste #${list.id} auf ${guild.id} angelegt (von ${actor.id})`);

                return { ok: true, list };
            }

            case "save":
                return { ok: true, list: await service.Save(guild, id, body.list ?? {}) };

            case "remove":
                await service.Remove(guild, id);
                logger.user(`📋 Rollen-Liste #${id} auf ${guild.id} gelöscht (von ${actor.id})`);

                return { ok: true };

            case "send":
                return { ok: true, list: await service.Send(guild, id) };

            case "reorder":
                return { ok: true, lists: await service.Reorder(guild.id, body.ids) };

            case "preview": {
                // Der ungespeicherte Entwurf - gezeichnet oder als Karte, gespeichert wird nichts.
                const saved = await service.Get(guild.id, id);
                const draft = body.list ?? {};
                const settings = draft.settings === undefined ? saved.settings : service.CleanSettings(guild, draft.settings, saved.settings);
                const design: RoleListDesign = ["compact", "sections", "board"].includes(String(draft.design)) ? (draft.design as RoleListDesign) : saved.design;
                const name = typeof draft.name === "string" && draft.name.trim() ? draft.name.trim().slice(0, MAX_NAME) : saved.name;
                const groups = service.Groups(guild, settings);

                if (design === "board") {
                    // Der Kanal aus dem Entwurf steht in der Fußzeile, sonst der gespeicherte.
                    const channelId = typeof draft.channelId === "string" && guild.channels.cache.has(draft.channelId) ? draft.channelId : draft.channelId === null ? null : saved.channelId;
                    const image = await RenderRoleListCard(await service.CardData(guild, { name, settings, channelId }, groups));

                    return { ok: true, image: `data:image/webp;base64,${image.toString("base64")}` };
                }

                const view = RoleListText(settings, design, groups, service.TextContext(guild, { name, settings }));
                const container = view.components[0]!.toJSON() as { accent_color?: number };

                return {
                    ok: true,
                    message: {
                        accent: container.accent_color ?? null,
                        parts: PreviewParts(container),
                        names: Object.fromEntries(groups.flatMap((group) => group.members.map((entry) => [entry.id, entry.name]))),
                        emojis: Object.fromEntries([...guild.emojis.cache.values()].map((emoji) => [emoji.id, emoji.imageURL({ size: 64 })])),
                    },
                };
            }

            case "preset.save":
                return { ok: true, presets: await service.SavePreset(guild.id, body.name, body.image) };

            case "preset.remove":
                return { ok: true, presets: await service.RemovePreset(guild.id, body.id) };

            default:
                return { ok: false, error: "Unbekannte Aktion." };
        }
    }
}
