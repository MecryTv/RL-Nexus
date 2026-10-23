import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { ClipKind, ClipRoundStatus, IClipEntry, IClipRound, IClipWinner } from "../interfaces/services/clips/IClips";

/* ----------------------------------------------------------
   Runden
   ---------------------------------------------------------- */
export interface IClipRoundRow {
    id: number;
    guild_id: string;
    status: ClipRoundStatus;
    opened_at: number | string;
    closes_at: number | string;
    ends_at: number | string;
    closed_at: number | string | null;
    ended_at: number | string | null;
    prizes: string[] | string | null;
    winners: IClipWinner[] | string | null;
}

function ToRound(row: IClipRoundRow): IClipRound {
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        status: row.status,
        openedAt: Number(row.opened_at),
        closesAt: Number(row.closes_at),
        endsAt: Number(row.ends_at),
        closedAt: row.closed_at === null ? null : Number(row.closed_at),
        endedAt: row.ended_at === null ? null : Number(row.ended_at),
        prizes: Unpack<string[]>(row.prizes ?? "[]", []),
        winners: Unpack<IClipWinner[]>(row.winners ?? "[]", []),
    };
}

/** Die Wochen eines Servers: offen, in der Abstimmung oder fertig. */
export class ClipRounds extends Model<IClipRoundRow> {
    readonly Table: TableName = TABLES.clipRounds;
    readonly Key = ["id"] as const;

    async Get(id: number): Promise<IClipRound | null> {
        const row = await this.Find(id);

        return row ? ToRound(row) : null;
    }

    /** Die laufende Runde - offen oder in der Abstimmung. Es gibt höchstens eine. */
    async Active(guildId: string): Promise<IClipRound | null> {
        const rows = await this.db.Query<IClipRoundRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status <> 'done' ORDER BY opened_at DESC LIMIT 1`,
            [guildId]
        );

        return rows[0] ? ToRound(rows[0]) : null;
    }

    /** Die zuletzt geöffnete Runde, egal in welchem Stand. */
    async Latest(guildId: string): Promise<IClipRound | null> {
        const rows = await this.db.Query<IClipRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE guild_id = ? ORDER BY opened_at DESC LIMIT 1`, [guildId]);

        return rows[0] ? ToRound(rows[0]) : null;
    }

    /** Fertige Runden, neueste zuerst. */
    async Done(guildId: string, limit = 1000): Promise<IClipRound[]> {
        const rows = await this.db.Query<IClipRoundRow>(
            `SELECT * FROM \`${this.Table}\` WHERE guild_id = ? AND status = 'done' ORDER BY opened_at DESC LIMIT ?`,
            [guildId, limit]
        );

        return rows.map(ToRound);
    }

    /** Alle laufenden Runden aller Server - für den Lauf im Minutentakt. */
    async Running(): Promise<IClipRound[]> {
        return (await this.db.Query<IClipRoundRow>(`SELECT * FROM \`${this.Table}\` WHERE status <> 'done'`)).map(ToRound);
    }

    async Open(guildId: string, closesAt: number, endsAt: number, prizes: string[]): Promise<IClipRound> {
        const result = await this.Insert({
            guild_id: guildId,
            status: "open",
            opened_at: Date.now(),
            closes_at: closesAt,
            ends_at: endsAt,
            prizes: JSON.stringify(prizes),
            winners: JSON.stringify([]),
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    async Patch(id: number, patch: Partial<Pick<IClipRound, "status" | "closesAt" | "endsAt" | "closedAt" | "endedAt" | "winners">>): Promise<void> {
        const row: Partial<IClipRoundRow> = {};

        if (patch.status !== undefined) row.status = patch.status;
        if (patch.closesAt !== undefined) row.closes_at = patch.closesAt;
        if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
        if (patch.closedAt !== undefined) row.closed_at = patch.closedAt;
        if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
        if (patch.winners !== undefined) row.winners = JSON.stringify(patch.winners);

        await this.Update([id], row);
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}

/* ----------------------------------------------------------
   Eingereichte Clips
   ---------------------------------------------------------- */
export interface IClipEntryRow {
    id: number;
    round_id: number;
    guild_id: string;
    user_id: string;
    user_name: string;
    channel_id: string;
    message_id: string;
    url: string;
    kind: ClipKind;
    created_at: number | string;
    votes: number | null;
    ranking: number | null;
    file: string | null;
    size: number | string | null;
}

function ToEntry(row: IClipEntryRow): IClipEntry {
    return {
        id: Number(row.id),
        roundId: Number(row.round_id),
        guildId: row.guild_id,
        userId: row.user_id,
        userName: row.user_name,
        channelId: row.channel_id,
        messageId: row.message_id,
        url: row.url,
        kind: row.kind,
        createdAt: Number(row.created_at),
        votes: row.votes === null ? null : Number(row.votes),
        rank: row.ranking === null ? null : Number(row.ranking),
        file: row.file,
        size: row.size === null ? null : Number(row.size),
    };
}

export class ClipEntries extends Model<IClipEntryRow> {
    readonly Table: TableName = TABLES.clipEntries;
    readonly Key = ["id"] as const;

    async Get(id: number): Promise<IClipEntry | null> {
        const row = await this.Find(id);

        return row ? ToEntry(row) : null;
    }

    async ByMessage(messageId: string): Promise<IClipEntry | null> {
        const rows = await this.Where({ message_id: messageId });

        return rows[0] ? ToEntry(rows[0]) : null;
    }

    /** Die Clips einer Runde in der Reihenfolge, in der sie kamen. */
    async OfRound(roundId: number): Promise<IClipEntry[]> {
        return (await this.Where({ round_id: roundId }, "`created_at` ASC, `id` ASC")).map(ToEntry);
    }

    async CountOf(roundId: number, userId: string): Promise<number> {
        return this.Count({ round_id: roundId, user_id: userId });
    }

    /** Wie viele Clips je Runde - für die Liste im Archiv. */
    async CountsByRound(guildId: string): Promise<Map<number, number>> {
        const rows = await this.db.Query<{ round_id: number; total: number }>(
            `SELECT round_id, COUNT(*) AS total FROM \`${this.Table}\` WHERE guild_id = ? GROUP BY round_id`,
            [guildId]
        );

        return new Map(rows.map((row) => [Number(row.round_id), Number(row.total)]));
    }

    async Add(entry: Pick<IClipEntry, "roundId" | "guildId" | "userId" | "userName" | "channelId" | "messageId" | "url" | "kind">): Promise<IClipEntry> {
        const result = await this.Insert({
            round_id: entry.roundId,
            guild_id: entry.guildId,
            user_id: entry.userId,
            user_name: entry.userName.slice(0, 100),
            channel_id: entry.channelId,
            message_id: entry.messageId,
            url: entry.url.slice(0, 1000),
            kind: entry.kind,
            created_at: Date.now(),
            votes: null,
            ranking: null,
            file: null,
            size: null,
        });

        return (await this.Get(Number(result.insertId)))!;
    }

    /** Die Kopie liegt im Ordner der Runde. */
    async SetFile(id: number, file: string, size: number): Promise<void> {
        await this.Update([id], { file, size });
    }

    /** Das Ergebnis am Ende: Stimmen und Platz in der Wertung. */
    async SetResult(id: number, votes: number, rank: number): Promise<void> {
        await this.Update([id], { votes, ranking: rank });
    }

    async Remove(id: number): Promise<void> {
        await this.Delete(id);
    }
}

/* ----------------------------------------------------------
   Stimmen
   ---------------------------------------------------------- */
export interface IClipVoteRow {
    round_id: number;
    user_id: string;
    entry_id: number;
    voted_at: number | string;
}

/**
 * Eine Stimme je Person und Runde - wer auf einen anderen Clip reagiert,
 * überschreibt sie. Abgestimmt wird per Reaktion; die Tabelle merkt sich, wo
 * jemand zuletzt reagiert hat, damit der Bot die ältere Reaktion wegnehmen kann.
 */
export class ClipVotes extends Model<IClipVoteRow> {
    readonly Table: TableName = TABLES.clipVotes;
    readonly Key = ["round_id", "user_id"] as const;

    /** Für welchen Clip jemand gestimmt hat. null: noch gar nicht. */
    async Of(roundId: number, userId: string): Promise<number | null> {
        const row = await this.Find(roundId, userId);

        return row ? Number(row.entry_id) : null;
    }

    async Set(roundId: number, userId: string, entryId: number): Promise<void> {
        await this.Upsert({ round_id: roundId, user_id: userId, entry_id: entryId, voted_at: Date.now() }, ["entry_id", "voted_at"]);
    }

    async Remove(roundId: number, userId: string): Promise<void> {
        await this.Delete(roundId, userId);
    }

    /** Wer für welchen Clip gestimmt hat - für die Zählung am Ende. */
    async OfRound(roundId: number): Promise<Map<string, number>> {
        const rows = await this.Where({ round_id: roundId });

        return new Map(rows.map((row) => [row.user_id, Number(row.entry_id)]));
    }

    /** Stimmen je Clip einer Runde. */
    async Counts(roundId: number): Promise<Map<number, number>> {
        const rows = await this.db.Query<{ entry_id: number; total: number }>(
            `SELECT entry_id, COUNT(*) AS total FROM \`${this.Table}\` WHERE round_id = ? GROUP BY entry_id`,
            [roundId]
        );

        return new Map(rows.map((row) => [Number(row.entry_id), Number(row.total)]));
    }

    async Total(roundId: number): Promise<number> {
        return this.Count({ round_id: roundId });
    }
}
