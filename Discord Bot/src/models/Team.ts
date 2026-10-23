import Model from "../structures/Model";
import { OrNull, TABLES, TableName, TeamRole, Unpack } from "../constants/Database";
import { ITeam, ITeamChannels, ITeamCreated, ITeamLink, ITeamPlayer } from "../interfaces/services/teams/ITeams";
import { EmptyChannels, EmptyCreated } from "../constants/Teams";

export interface ITeamRow {
    id: number;
    guild_id: string;
    group_id: number | null;
    name: string;
    tag: string | null;
    description: string | null;
    color: string | null;
    logo: string | null;
    role_id: string | null;
    channel_id: string | null;
    channels: ITeamChannels | string | null;
    links: ITeamLink[] | string | null;
    created: ITeamCreated | string | null;
    players: ITeamPlayer[] | string | null;
    position: number;
    message_id: string | null;
    active: number;
    created_at: Date;
    updated_at: Date;
}

export interface ITeamMemberRow {
    team_id: number;
    user_id: string;
    role: TeamRole;
    joined_at: Date;
}

/** Die Zeile als das, womit das Modul arbeitet. */
function ToTeam(row: ITeamRow): ITeam {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        groupId: row.group_id === null ? null : Number(row.group_id),
        name: row.name,
        tag: row.tag ?? "",
        description: row.description ?? "",
        color: row.color,
        logo: row.logo,
        roleId: row.role_id,
        // Vor 024 stand hier ein einzelner Kanal - der wandert beim Lesen in die
        // Liste, damit aus alten Zeilen nichts verschwindet.
        channels: {
            ...EmptyChannels(),
            ...(row.channel_id ? { textIds: [row.channel_id] } : {}),
            ...Unpack<Partial<ITeamChannels>>(row.channels ?? "{}", {}),
        },
        links: Unpack<ITeamLink[]>(row.links ?? "[]", []),
        created: { ...EmptyCreated(), ...Unpack<Partial<ITeamCreated>>(row.created ?? "{}", {}) },
        // "Analyst" gibt es nicht mehr. Wer so im Kader steht, spielt nicht -
        // als Coach bleibt er dabei, statt beim naechsten Speichern als Stamm
        // in die Team-MMR zu rutschen.
        players: Unpack<ITeamPlayer[]>(row.players ?? "[]", []).map((player) =>
            (player.role as string) === "analyst" ? { ...player, role: "coach" } : player
        ),
        position: Number(row.position ?? 0),
        messageId: row.message_id,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
    };
}

export type TeamPatch = Partial<Pick<ITeam, "groupId" | "name" | "tag" | "description" | "color" | "logo" | "roleId" | "channels" | "created" | "links" | "players" | "position">>;

/**
 * Teams und ihre Mitglieder. Die Mitglieder stehen in einer eigenen Tabelle,
 * werden aber nie ohne ihr Team gebraucht - deshalb liegen beide hier zusammen
 * statt in zwei Models.
 *
 * Der Kader der Team-Uebersicht liegt dagegen als JSON in players: dort haengen
 * Peaks und der Prime-Stand daran, und das waere in einer Zeile je Spieler nur
 * mehr Arbeit. Wer ein Discord-Konto hat, steht zusaetzlich in team_members -
 * darueber laeuft "in welchem Team bin ich?" samt Partien.
 */
export default class Team extends Model<ITeamRow> {
    readonly Table: TableName = TABLES.teams;
    readonly Key = ["id"] as const;

    async OfGuild(guildId: string, onlyActive = true): Promise<ITeamRow[]> {
        const match: Record<string, unknown> = { guild_id: guildId };

        if (onlyActive) match.active = 1;

        return this.Where(match, "`name` ASC");
    }

    async ByName(guildId: string, name: string): Promise<ITeamRow | null> {
        const rows = await this.Where({ guild_id: guildId, name });

        return rows[0] ?? null;
    }

    async Create(guildId: string, name: string, tag?: string, roleId?: string): Promise<number> {
        const result = await this.Insert({
            guild_id: guildId,
            name,
            tag: OrNull(tag),
            role_id: OrNull(roleId),
            active: 1,
        });

        return result.insertId;
    }

    /** Auflösen heißt hier: stillgelegt, nicht gelöscht - die Partien bleiben zuordenbar. */
    async Archive(teamId: number): Promise<void> {
        await this.Update([teamId], { active: 0 });
    }

    /* ----------------------------------------------------------
       Mitglieder
       ---------------------------------------------------------- */
    async Members(teamId: number): Promise<ITeamMemberRow[]> {
        return this.db.Cached(TABLES.members, `team:${teamId}`, () =>
            this.db.Query<ITeamMemberRow>(
                `SELECT * FROM \`${TABLES.members}\` WHERE team_id = ? ORDER BY FIELD(role, 'captain', 'player', 'substitute', 'coach'), joined_at ASC`,
                [teamId]
            )
        );
    }

    /** Die Teams eines Spielers auf einem Server - für "in welchem Team bin ich?". */
    async TeamsOf(guildId: string, userId: string): Promise<ITeamRow[]> {
        return this.db.Cached(TABLES.members, `user:${guildId}:${userId}`, () =>
            this.db.Query<ITeamRow>(
                `SELECT t.* FROM \`${TABLES.teams}\` t
                 JOIN \`${TABLES.members}\` m ON m.team_id = t.id
                 WHERE t.guild_id = ? AND m.user_id = ? AND t.active = 1
                 ORDER BY t.name ASC`,
                [guildId, userId]
            )
        );
    }

    async AddMember(teamId: number, userId: string, role: TeamRole = "player"): Promise<void> {
        await this.db.Write(
            `INSERT INTO \`${TABLES.members}\` (team_id, user_id, role) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE role = VALUES(role)`,
            [teamId, userId, role]
        );

        this.db.Bump(TABLES.members);
    }

    async RemoveMember(teamId: number, userId: string): Promise<boolean> {
        const result = await this.db.Write(`DELETE FROM \`${TABLES.members}\` WHERE team_id = ? AND user_id = ?`, [
            teamId,
            userId,
        ]);

        this.db.Bump(TABLES.members);

        return result.affectedRows > 0;
    }

    /**
     * Wie viele aktive Teams je Server. Eine Abfrage für die ganze Serverliste
     * des Dashboards statt einer pro Karte.
     */
    async CountsOf(guildIds: string[]): Promise<Map<string, number>> {
        const counts = new Map<string, number>();

        if (guildIds.length === 0) return counts;

        const marks = guildIds.map(() => "?").join(", ");

        const rows = await this.db.Cached(this.Table, `counts:${guildIds.join(",")}`, () =>
            this.db.Query<{ guild_id: string; total: number }>(
                `SELECT guild_id, COUNT(*) AS total FROM \`${this.Table}\`
                 WHERE active = 1 AND guild_id IN (${marks}) GROUP BY guild_id`,
                guildIds
            )
        );

        for (const row of rows) counts.set(row.guild_id, Number(row.total));

        return counts;
    }

    /* ----------------------------------------------------------
       Team-Uebersicht: dasselbe Team, nur mit allem daran
       ---------------------------------------------------------- */
    async Full(id: number): Promise<ITeam | null> {
        const row = await this.Find(id);

        return row ? ToTeam(row) : null;
    }

    /** Alle Teams eines Servers in der Reihenfolge der Uebersicht. */
    async AllOfGuild(guildId: string): Promise<ITeam[]> {
        return (await this.Where({ guild_id: guildId, active: 1 }, "`position` ASC, `id` ASC")).map(ToTeam);
    }

    async CreateFull(guildId: string, patch: TeamPatch): Promise<ITeam> {
        const result = await this.Insert({
            guild_id: guildId,
            group_id: patch.groupId ?? null,
            name: patch.name ?? "",
            tag: OrNull(patch.tag),
            description: patch.description ?? "",
            color: patch.color ?? null,
            logo: patch.logo ?? null,
            role_id: patch.roleId ?? null,
            channel_id: null,
            channels: JSON.stringify(patch.channels ?? EmptyChannels()),
            links: JSON.stringify(patch.links ?? []),
            players: JSON.stringify(patch.players ?? []),
            position: patch.position ?? 0,
            active: 1,
        });

        return (await this.Full(Number(result.insertId)))!;
    }

    async Save(id: number, patch: TeamPatch): Promise<void> {
        const row: Partial<ITeamRow> = {};

        if (patch.groupId !== undefined) row.group_id = patch.groupId;
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.tag !== undefined) row.tag = patch.tag;
        if (patch.description !== undefined) row.description = patch.description;
        if (patch.color !== undefined) row.color = patch.color;
        if (patch.logo !== undefined) row.logo = patch.logo;
        if (patch.roleId !== undefined) row.role_id = patch.roleId;
        if (patch.channels !== undefined) row.channels = JSON.stringify(patch.channels);
        if (patch.created !== undefined) row.created = JSON.stringify(patch.created);
        if (patch.links !== undefined) row.links = JSON.stringify(patch.links);
        if (patch.players !== undefined) row.players = JSON.stringify(patch.players);
        if (patch.position !== undefined) row.position = patch.position;

        if (Object.keys(row).length > 0) await this.Update([id], row);
    }

    /** Nur den Prime-Stand nachziehen. */
    async SavePlayers(id: number, players: ITeamPlayer[]): Promise<void> {
        await this.Update([id], { players: JSON.stringify(players) });
    }

    async SetMessage(id: number, messageId: string | null): Promise<void> {
        await this.Update([id], { message_id: messageId });
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }

    /** Teams einer geloeschten Gruppe stehen danach ohne Gruppe da. */
    async ClearGroup(groupId: number): Promise<void> {
        await this.db.Write(`UPDATE \`${this.Table}\` SET group_id = NULL WHERE group_id = ?`, [groupId]);

        this.db.Bump(this.Table);
    }

    /**
     * Haelt team_members am Kader ausgerichtet: wer ein Discord-Konto im Kader
     * hat, steht dort, wer rausfliegt, verschwindet. Sonst zeigte TeamsOf() auf
     * Leute, die laengst nicht mehr im Team sind.
     */
    async SyncMembers(id: number, players: ITeamPlayer[]): Promise<void> {
        const map: Record<string, TeamRole> = { captain: "captain", cocaptain: "captain", player: "player", sub: "substitute", trial: "substitute", coach: "coach", manager: "coach" };
        const wanted = players.filter((player) => player.discordId);

        await this.db.Write(`DELETE FROM \`${TABLES.members}\` WHERE team_id = ?`, [id]);

        for (const player of wanted) {
            await this.db.Write(
                `INSERT INTO \`${TABLES.members}\` (team_id, user_id, role) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE role = VALUES(role)`,
                [id, player.discordId, map[player.role] ?? "player"]
            );
        }

        this.db.Bump(TABLES.members);
    }
}
