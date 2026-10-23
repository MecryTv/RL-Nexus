import {
    ActionRowBuilder,
    ContainerBuilder,
    Guild,
    MessageActionRowComponentBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { BadgeOf, ITeamFormats, MAX_MENU_TEAMS, MMR_LABELS, PLAIN_FORMATS, PLAYING_ROLES, RankFormat, RankFormatter, RoleFormatter, ROLE_ORDER, TEAMS_PREFIX, UsedSlots } from "../constants/Teams";
import { RankFromMMR, RankShort, TrackerURL } from "../constants/Prime";
import { IListTeam, TeamListText } from "../constants/TeamList";
import { DefaultTeamSettings } from "../constants/Teams";
import { ITeamGroup, ITeamSettings, ITeamView, PlaylistSlot, TeamRole } from "../interfaces/services/teams/ITeams";
import { AnyPlaceholderValues } from "../constants/Placeholders";

/**
 * Die Übersicht als Nachricht: je Team eine Karte, eine Karte mit Auswahlmenü
 * oder alles in einer. Was darin steht, baut der Server im Dashboard - hier
 * werden nur die Platzhalter gefüllt.
 *
 * Die Custom-ID des Menüs trägt nichts als den Anfang: welches Team gemeint
 * ist, steht im gewählten Wert. Damit übersteht das Menü jeden Neustart.
 */

/** "1350" oder "—", nie eine erfundene Zahl. */
function Number_(value: number | null): string {
    return typeof value === "number" && value > 0 ? String(value) : "—";
}

function When(at: number): string {
    return at > 0 ? `<t:${Math.floor(at / 1000)}:R>` : "unbekannt";
}

/** Wie ein Spieler in einer Zeile steht: wer, was er wert ist, sein Rang. */
function Line(entry: ITeamView["players"][number], tracker: boolean, rank: RankFormat): string {
    const who = entry.player.discordId ? `<@${entry.player.discordId}>` : `**${entry.label}**`;
    const snapshot = entry.player.snapshot;
    const parts = [who, `\`${Number_(entry.value)}\``];

    if (snapshot?.tierName) parts.push(rank(snapshot.tier ?? 0, snapshot.divisionName));

    // Der Tracker-Link geht nur mit Epic-Namen - und nur dort, wo Discord
    // verkuerzte Links anzeigt: in der Karte und im Embed, nicht im reinen Text.
    if (tracker && entry.player.epicName) parts.push(`[Tracker](${TrackerURL(entry.player.epicName)})`);

    return parts.join(" · ");
}

/**
 * Die Aufstellung: nur, wer spielt. Je Zeile die Aufgabe, dann der Spieler.
 * Das ist der Baustein fuer {team.lineup}. Aufgabe und Rang stehen so da, wie
 * „Aufgaben zeigen als“ und „Ränge zeigen als“ es wollen (formats).
 */
export function LineupText(view: ITeamView, tracker = true, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines = view.players
        .filter((entry) => PLAYING_ROLES.includes(entry.player.role))
        .map((entry) => `**${formats.role(entry.player.role)}** » ${Line(entry, tracker, formats.rank)}`);

    return lines.join("\n") || "Noch niemand im Kader.";
}

/** Coach und Manager - alle, die nicht mitspielen. {team.staff} */
export function StaffText(view: ITeamView, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines = view.players
        .filter((entry) => !PLAYING_ROLES.includes(entry.player.role))
        .map((entry) => `**${formats.role(entry.player.role)}** » ${entry.player.discordId ? `<@${entry.player.discordId}>` : `**${entry.label}**`}`);

    return lines.join("\n") || "Niemand eingetragen.";
}

/** Wer im Kader steht, nach Aufgaben gruppiert. */
export function RosterText(view: ITeamView, formats: ITeamFormats = PLAIN_FORMATS): string {
    const lines: string[] = [];

    for (const role of ROLE_ORDER) {
        const members = view.players.filter((entry) => entry.player.role === role);

        if (!members.length) continue;

        lines.push(`**${formats.role(role)}**`);

        for (const entry of members) {
            const who = entry.player.discordId ? `<@${entry.player.discordId}>` : entry.label;
            const snapshot = entry.player.snapshot;
            const rank = snapshot?.tierName ? ` · ${formats.rank(snapshot.tier ?? 0, snapshot.divisionName)}` : "";

            lines.push(`${who} \`${Number_(entry.value)}\`${rank}`);
        }
    }

    return lines.join("\n") || "Noch niemand im Kader.";
}

/**
 * Die Kanäle eines Teams. Steht das Team auf einer ganzen Kategorie, ist der
 * Name das Beste, was geht - Discord kennt keine Erwähnung für Kategorien.
 */
export function ChannelsText(view: ITeamView, what: "first" | "text" | "voice" | "category"): string {
    const channels = view.team.channels;
    const mentions = (ids: string[]): string => ids.map((id) => `<#${id}>`).join(" · ");

    if (what === "category") return channels.categoryId ? `<#${channels.categoryId}>` : "—";
    if (channels.kind === "category") return channels.categoryId ? `<#${channels.categoryId}>` : "—";

    if (what === "voice") return mentions(channels.voiceIds) || "—";
    if (what === "first") return channels.textIds[0] ? `<#${channels.textIds[0]}>` : "—";

    return mentions(channels.textIds) || "—";
}

/** Ligen und Turniere als Links, getrennt mit "·". Ohne Links leer, damit keine halbe Zeile stehen bleibt. */
export function LeaguesText(view: ITeamView): string {
    return view.team.links.map((link) => `[${link.label}](${link.url})`).join(" · ");
}

/** Der Schlüssel eines Spielers in den Platzhaltern: sein Epic-Name, klein, ohne Leer- und Sonderzeichen. */
export function PlayerKey(epicName: string): string {
    return epicName.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}

/** Was es je Spieler gibt - "" ist der Spieler selbst: {epicname}, {epicname.rank} … .rank.icon ist immer das Icon. */
export const PLAYER_FIELDS = ["", "rank", "rank.short", "rank.icon", "mmr", "current", "peak", "tracker"] as const;

/**
 * Die Platzhalter je Spieler, über alle Teams des Servers. Gerechnet wird wie
 * fürs Team: .mmr ist der Wert nach der eingestellten Rechnung (WTSI oder die
 * eigene Formel), .rank der Rang, der zu diesem Wert gehört (RankFromMMR).
 * .current und .peak sind der Schnitt der Playlists, mit denen die Rechnung
 * arbeitet. Wer keinen Epic-Namen hat, bekommt keine; steht derselbe Name in
 * zwei Teams, gilt der erste.
 */
/**
 * Was ein Spieler in den Platzhaltern zeigt - je Feld aus PLAYER_FIELDS ein
 * Wert. Gerechnet wird wie fürs Team: .mmr ist der Wert nach der eingestellten
 * Rechnung, .rank der Rang dazu, .current und .peak der Schnitt der Playlists,
 * mit denen die Rechnung arbeitet.
 */
function PlayerFields(entry: ITeamView["players"][number], settings: ITeamSettings, preview: boolean, formats: ITeamFormats): Record<(typeof PLAYER_FIELDS)[number], string> {
    const slots = UsedSlots(settings.mmr);
    const average = (numbers: (number | null)[]): number | null => {
        const real = numbers.filter((value): value is number => typeof value === "number" && value > 0);

        return real.length ? Math.round(real.reduce((sum, value) => sum + value, 0) / real.length) : null;
    };
    const current = (slot: PlaylistSlot): number | null => entry.player.snapshot?.mmr[slot] ?? null;
    const rank = entry.value !== null ? RankFromMMR(entry.value) : null;

    return {
        // In der Vorschau des Dashboards steht der Name - eine Erwähnung könnte sie nicht auflösen.
        "": entry.player.discordId ? (preview ? `@${entry.label}` : `<@${entry.player.discordId}>`) : `**${entry.label}**`,
        rank: rank ? formats.rank(rank.tier, rank.division) : "—",
        "rank.short": rank ? RankShort(rank.tier, rank.division) : "—",
        "rank.icon": rank ? formats.rankIcon(rank.tier, rank.division) : "—",
        mmr: Number_(entry.value),
        current: Number_(average(slots.map(current))),
        peak: Number_(average(slots.map((slot) => entry.player.peaks[slot] ?? current(slot)))),
        tracker: entry.player.epicName ? `[Tracker](${TrackerURL(entry.player.epicName)})` : "—",
    };
}

export function PlayerValues(views: ITeamView[], settings: ITeamSettings, preview = false, formats: ITeamFormats = PLAIN_FORMATS): Record<string, string> {
    const values: Record<string, string> = {};
    const seen = new Set<string>();

    for (const view of views) {
        for (const entry of view.players) {
            const key = PlayerKey(entry.player.epicName);

            if (!key || seen.has(key)) continue;

            seen.add(key);

            for (const [field, value] of Object.entries(PlayerFields(entry, settings, preview, formats))) values[field ? `${key}.${field}` : key] = value;
        }
    }

    return values;
}

/**
 * Die Platzhalter je Aufgabe für das Team, dessen Karte gerade gebaut wird:
 * {team.captain}, {team.captain.rank} … für jede Aufgabe, auch {team.player}
 * (Stamm) und {team.sub} (Ersatz). Stehen mehrere Spieler in einer Aufgabe,
 * stehen ihre Werte in derselben Reihenfolge hintereinander - so passen
 * {team.player} und {team.player.rank} zueinander. {team.captain.icon} ist das
 * Abzeichen der Aufgabe - das gibt es auch, wenn niemand sie hat.
 */
export function RoleValues(view: ITeamView, settings: ITeamSettings, preview = false, formats: ITeamFormats = PLAIN_FORMATS): Record<string, string> {
    const values: Record<string, string> = {};

    for (const role of ROLE_ORDER) {
        const found = view.players.filter((entry) => entry.player.role === role);
        const members = found.map((entry) => PlayerFields(entry, settings, preview, formats));

        // Die Erwähnungen je Aufgabe gab es schon vorher - ohne Discord-Konto steht der Name, nicht fett.
        values[`team.${role}`] =
            found.map((entry) => (entry.player.discordId ? (preview ? `@${entry.label}` : `<@${entry.player.discordId}>`) : entry.label)).join(", ") || "—";
        values[`team.${role}.icon`] = formats.roleIcon(role);

        for (const field of PLAYER_FIELDS) {
            if (field) values[`team.${role}.${field}`] = members.map((member) => member[field]).join(", ") || "—";
        }
    }

    return values;
}

/** Fürs Dashboard: je Spieler mit Epic-Namen sein Schlüssel, sein Team und was eingesetzt würde. */
export function PlayerList(
    views: ITeamView[],
    settings: ITeamSettings,
    formats: ITeamFormats = PLAIN_FORMATS
): { key: string; name: string; team: string; values: Record<string, string> }[] {
    const values = PlayerValues(views, settings, true, formats);
    const seen = new Set<string>();
    const list: { key: string; name: string; team: string; values: Record<string, string> }[] = [];

    for (const view of views) {
        for (const entry of view.players) {
            const key = PlayerKey(entry.player.epicName);

            if (!key || seen.has(key)) continue;

            seen.add(key);
            list.push({
                key,
                name: entry.player.epicName,
                team: view.team.name,
                values: Object.fromEntries(PLAYER_FIELDS.map((field) => (field ? `${key}.${field}` : key)).map((full) => [full, values[full] ?? ""])),
            });
        }
    }

    return list;
}

/**
 * Die Werte eines Teams für die Platzhalter. everyone: alle Teams des Servers -
 * daraus kommen die Platzhalter je Spieler, damit {epicname.rank} in jeder Karte
 * geht. Die festen Schlüssel gewinnen, falls ein Epic-Name wie einer heißt.
 */
export function TeamValues(view: ITeamView, guild: Guild, settings: ITeamSettings, everyone: ITeamView[] = [view], formats: ITeamFormats = PLAIN_FORMATS): AnyPlaceholderValues {
    return {
        ...PlayerValues(everyone, settings, false, formats),
        ...TeamOwnValues(view, settings, formats),
        guild: guild.name,
        "guild.id": guild.id,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        "mmr.mode": MMR_LABELS[settings.mmr.mode] ?? settings.mmr.mode,
        updated: When(view.fetchedAt),
    };
}

/**
 * Die Platzhalter eines Teams ohne den Server drumherum - für die Karte und
 * für jede Zeile in {teams}. {team.rank} ist der Rang zur Team-MMR, nach
 * „Ränge zeigen als“; {team.rank.icon} immer als Icon.
 */
export function TeamOwnValues(view: ITeamView, settings: ITeamSettings, formats: ITeamFormats = PLAIN_FORMATS, preview = false): Record<string, string> {
    const team = view.mmr !== null ? RankFromMMR(view.mmr) : null;

    return {
        ...RoleValues(view, settings, preview, formats),
        "team.name": view.team.name,
        "team.tag": view.team.tag || "—",
        "team.group": view.group?.name ?? "ohne Gruppe",
        "team.description": view.team.description || "",
        "team.mmr": Number_(view.mmr),
        "team.rank": team ? formats.rank(team.tier, team.division) : "—",
        "team.rank.short": team ? RankShort(team.tier, team.division) : "—",
        "team.rank.icon": team ? formats.rankIcon(team.tier, team.division) : "—",
        "team.roster": RosterText(view, formats),
        "team.lineup": LineupText(view, true, formats),
        "team.staff": StaffText(view, formats),
        "team.players": String(view.players.filter((entry) => PLAYING_ROLES.includes(entry.player.role)).length),
        "team.role": view.team.roleId ? `<@&${view.team.roleId}>` : "—",
        "team.channel": ChannelsText(view, "first"),
        "team.channels": ChannelsText(view, "text"),
        "team.voice": ChannelsText(view, "voice"),
        "team.category": ChannelsText(view, "category"),
        "team.logo": view.team.logo ?? "",
        "team.leagues": LeaguesText(view),
    };
}

/**
 * Die Teams so, wie {teams} sie braucht (constants/TeamList.ts): je Team seine
 * Platzhalter, je Spieler {spieler} und was dahinter geht. preview: für das
 * Dashboard - Namen statt Erwähnungen, die könnte die Vorschau nicht auflösen.
 */
export function ListTeams(views: ITeamView[], settings: ITeamSettings, formats: ITeamFormats = PLAIN_FORMATS, preview = false): IListTeam[] {
    return views.map((view) => {
        const names = new Map(view.players.flatMap((entry) => (entry.player.discordId ? [[entry.player.discordId, entry.label] as const] : [])));
        const shown = (text: string): string => (preview ? text.replace(/<@(\d{17,20})>/g, (match: string, id: string) => `@${names.get(id) ?? id}`) : text);
        // In der Liste steht ein Team ohne Kürzel ohne Kürzel - in der Karte als Strich.
        const own = { ...TeamOwnValues(view, settings, formats, preview), "team.tag": view.team.tag };

        return {
            group: view.team.groupId,
            values: Object.fromEntries(Object.entries(own).map(([key, value]) => [key, shown(value)])),
            members: view.players.map((entry) => {
                const fields = PlayerFields(entry, settings, preview, formats);

                return {
                    role: entry.player.role,
                    values: {
                        spieler: entry.player.discordId ? (preview ? `@${entry.label}` : `<@${entry.player.discordId}>`) : entry.label,
                        "spieler.name": entry.label,
                        "spieler.role": formats.role(entry.player.role),
                        "spieler.role.icon": formats.roleIcon(entry.player.role),
                        "spieler.rank": fields.rank,
                        "spieler.rank.short": fields["rank.short"],
                        "spieler.rank.icon": fields["rank.icon"],
                        "spieler.mmr": fields.mmr,
                        "spieler.current": fields.current,
                        "spieler.peak": fields.peak,
                        "spieler.tracker": fields.tracker,
                    },
                };
            }),
        };
    });
}

/**
 * Alle Teams als Text - das steckt in {teams}. Lang nach den Vorlagen der
 * Teams-Liste; kurz ({teams.short} und mit Auswahlmenü) nur die Kopfzeile.
 */
export function BoardText(views: ITeamView[], groups: ITeamGroup[], short = false, settings: ITeamSettings = DefaultTeamSettings(), formats: ITeamFormats = PLAIN_FORMATS): string {
    if (!short) return TeamListText(ListTeams(views, settings, formats), groups, settings.list);

    const lines: string[] = [];
    const write = (list: ITeamView[]): void => {
        for (const view of list) {
            const tag = view.team.tag ? ` \`${view.team.tag}\`` : "";

            lines.push(`**${view.team.name}**${tag} · MMR ${Number_(view.mmr)}`);
        }
    };

    for (const group of groups) {
        const members = views.filter((view) => view.team.groupId === group.id);

        if (!members.length) continue;

        lines.push(`### ${group.name}`);
        write(members);
    }

    const loose = views.filter((view) => !groups.some((group) => group.id === view.team.groupId));

    if (loose.length) {
        if (lines.length) lines.push("### Ohne Gruppe");

        write(loose);
    }

    return lines.join("\n") || "Noch keine Teams.";
}

/** Eine Karte für ein Team. everyone: alle Teams des Servers, für die Platzhalter je Spieler. */
export async function TeamCardView(client: BotClient, settings: ITeamSettings, view: ITeamView, guild: Guild, everyone: ITeamView[] = [view]): Promise<ICustomView> {
    const body = settings.team;
    const doc = view.team.color ? { ...body.doc, accent: view.team.color } : body.doc;

    return CustomMessageView(
        client,
        { id: view.team.id, kind: body.kind, content: body.content, embed: body.embed, doc, buttons: [] },
        TeamValues(view, guild, settings, everyone, Formats(client, settings))
    );
}

/** „Ränge zeigen als“ und „Aufgaben zeigen als“ mit den Icons des Bots - und den eigenen Abzeichen des Servers. */
export function Formats(client: BotClient, styles: Pick<ITeamSettings, "rankStyle" | "roleStyle" | "badges">): ITeamFormats {
    const tier = (tier: number): string | null => client.rankIconService.Of(tier);
    // Ein eigenes Abzeichen geht vor, sonst das Standard-Abzeichen aus teamicons.
    const role = (role: TeamRole): string | null => BadgeOf(styles.badges[role]) ?? client.rankIconService.OfRole(role);

    return {
        rank: RankFormatter(styles.rankStyle, tier),
        rankIcon: RankFormatter("icon", tier),
        role: RoleFormatter(styles.roleStyle, role),
        roleIcon: RoleFormatter("icon", role),
    };
}

/** Der Kopf: bei "menu" mit Menü, bei "single" mit allen Teams darin. */
export async function BoardView(
    client: BotClient,
    settings: ITeamSettings,
    views: ITeamView[],
    groups: ITeamGroup[],
    guild: Guild
): Promise<ICustomView> {
    const body = settings.board;
    const menu = settings.layout === "menu";
    const stamps = views.map((view) => view.fetchedAt).filter((at) => at > 0);
    const formats = Formats(client, settings);
    const values: AnyPlaceholderValues = {
        ...PlayerValues(views, settings, false, formats),
        guild: guild.name,
        "guild.id": guild.id,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        teams: BoardText(views, groups, menu, settings, formats),
        "teams.short": BoardText(views, groups, true),
        "teams.count": String(views.length),
        "groups.count": String(groups.filter((group) => views.some((view) => view.team.groupId === group.id)).length),
        "mmr.mode": MMR_LABELS[settings.mmr.mode] ?? settings.mmr.mode,
        updated: When(stamps.length ? Math.min(...stamps) : Date.now()),
    };

    const rows = menu ? [TeamMenuRow(views)] : [];
    const view = await CustomMessageView(
        client,
        { id: 0, kind: body.kind, content: body.content, embed: body.embed, doc: body.doc, buttons: [], reserve: rows.length },
        values
    );

    if (!rows.length) return view;

    // In einer Components-V2-Nachricht steht alles im Container - auch das Menü.
    if (view.flags === MessageFlags.IsComponentsV2) {
        const container = view.components[0] as ContainerBuilder;

        for (const row of rows) container.addActionRowComponents(row);

        return view;
    }

    return { ...view, components: [...view.components, ...rows] };
}

/** Das Auswahlmenü mit den Teams. */
export function TeamMenuRow(views: ITeamView[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${TEAMS_PREFIX}:menu`)
        .setPlaceholder("Team ansehen")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            views.slice(0, MAX_MENU_TEAMS).map((view) => {
                const option = new StringSelectMenuOptionBuilder().setLabel(`${view.team.name}`.slice(0, 100)).setValue(String(view.team.id));
                const parts = [view.team.tag, view.group?.name, `MMR ${Number_(view.mmr)}`].filter(Boolean).join(" · ");

                if (parts) option.setDescription(parts.slice(0, 100));

                return option;
            })
        );

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}
