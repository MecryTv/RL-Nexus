import path from "path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
    AttachmentBuilder,
    escapeMarkdown,
    Guild,
    GuildMember,
    GuildTextBasedChannel,
    Message,
    MessageFlags,
    MessageType,
    PermissionFlagsBits,
} from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { IsModerator, OptionOf, RELAY_MARK, SupportRoleOf } from "../builder/TicketPanel";
import { Duration, RenderTranscript } from "../builder/TranscriptHtml";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { TicketNumber } from "../constants/Tickets";
import {
    AttachmentKey,
    INLINE_TYPES,
    MAX_DISCORD_UPLOAD,
    MAX_TRANSCRIPT_BYTES,
    MAX_TRANSCRIPT_FILE,
    MAX_TRANSCRIPT_MESSAGES,
    STORED_FILE,
    TRANSCRIPT_INLINE_BYTES,
    TRANSCRIPT_ROOT,
} from "../constants/Transcripts";
import { ITicket, ITicketConfig } from "../interfaces/services/tickets/ITicket";
import { ITranscript, ITranscriptMessage, ITranscriptUser } from "../interfaces/services/tickets/ITranscript";
import { ITranscriptEntry } from "../models/TicketTranscripts";
import { ITicketContext } from "./TicketService";
import logger from "../utils/logger";
import { SendLog } from "../utils/logtarget";

// Anhänge in Texten von Components V2 und Embeds: Discord löst attachment:// dort zur CDN-Adresse auf.
const ATTACHMENT_URL = /https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:ephemeral-)?attachments\/[^"\s\\]+/g;

/** Wer höchstens so viele Leute nachschlägt, blockiert Discord nicht mit Anfragen. */
const MAX_LOOKUPS = 50;

/** Vom User per ModMail weitergeleitet: die Karte beginnt mit der User-Marke (RelayView). */
function RelayedFromUser(message: Message): boolean {
    const [first] = message.components.map((component) => component.toJSON() as { type?: number; components?: { type?: number; content?: string }[] });
    const head = first?.type === 17 ? first.components?.[0] : undefined;

    return head?.type === 10 && (head.content ?? "").startsWith(`-# ${RELAY_MARK.user}`);
}

function Extension(url: string): string {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    const match = /\.([a-z0-9]{1,8})$/i.exec(name);

    return match ? match[1].toLowerCase() : "bin";
}

/** Alle, die geschrieben haben (ohne Bots), höchstens 20. */
function Participants(list: ITranscriptMessage[]): ITranscriptUser[] {
    const participants = new Map<string, ITranscriptUser>();

    for (const message of list) {
        if (!message.author.bot && participants.size < 20) participants.set(message.author.id, message.author);
    }

    return [...participants.values()];
}

/** Was eine Bewerbung für ihr Transcript mitbringt (W-0047). */
export interface IApplyTranscript {
    id: number;
    form: string;
    applicantId: string;
    deciderId: string | null;
    /** „Angenommen“ oder „Abgelehnt“. */
    decision: string;
    note: string | null;
    openedAt: number;
    closedAt: number;
}

/**
 * Transcripts: beim Schließen den Verlauf lesen, die Anhänge sichern, alles
 * gepackt speichern und Karte, Link und Datei verschicken. Angesehen wird im
 * Dashboard (DashboardTranscript); gerendert wird erst dann, siehe TranscriptHtml.
 */
export default class TranscriptService {
    client: BotClient;

    // Ein Transcript je Ticket, auch wenn Schließen und Löschfrist gleichzeitig fragen.
    private running = new Map<number, Promise<void>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /**
     * Legt das Transcript eines geschlossenen Tickets an, wenn der Server es
     * will und es noch keins gibt. Der Kanal darf erst verschwinden, wenn das
     * zurückgegebene Versprechen erfüllt ist - danach gibt es den Verlauf nicht mehr.
     */
    Archive(ticket: ITicket): Promise<void> {
        const running = this.running.get(ticket.id);

        if (running) return running;

        const job = this.Build(ticket).finally(() => this.running.delete(ticket.id));

        this.running.set(ticket.id, job);

        return job;
    }

    private async Build(ticket: ITicket): Promise<void> {
        const config = await this.client.ticketSettings.Of(ticket.guildId);

        if (!config.transcripts.enabled) return;
        if (await this.client.ticketTranscripts.Has(ticket.id)) return;

        const context = await this.client.ticketService.Context(ticket.id);

        // Ohne Kanal gibt es nichts mehr zu lesen - etwa von Hand gelöscht.
        if (!context.channel) return;

        const transcript = await this.Capture(context);

        await this.client.ticketTranscripts.Save(transcript);

        // Wer gerade unter Transcriptions schaut, sieht es sofort.
        void this.client.liveService.Archived(ticket);

        logger.user(
            `📄 Transcript ${TicketNumber(ticket.number, ticket.code)} auf ${ticket.guildId}: ${transcript.messages.length} Nachrichten, ${Object.keys(transcript.media).length} Anhänge gesichert`
        );

        await this.Deliver(context, transcript);
    }

    /* ----------------------------------------------------------
       Einsammeln
       ---------------------------------------------------------- */
    private async Capture(context: ITicketContext): Promise<ITranscript> {
        const { ticket, guild } = context;
        const channel = context.channel!;
        const { messages, truncated } = await this.Read(channel);
        const people = await this.People(guild, messages, ticket);
        const media = await this.SaveMedia(guild.id, ticket.id, messages);

        const list = messages.map((message) => this.Snapshot(message, people, ticket.openerId));
        const known = (id: string | null): ITranscriptUser | null => (id ? (people.get(id) ?? null) : null);

        return {
            version: 1,
            ticketId: ticket.id,
            number: ticket.number,
            code: ticket.code,
            guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }) },
            channel: { id: channel.id, name: channel.name },
            meta: {
                optionId: ticket.optionId,
                option: context.option?.name ?? ticket.optionId,
                contact: ticket.contact,
                openerCode: ticket.openerCode,
                opener: known(ticket.openerId) ?? { id: ticket.openerId, name: ticket.openerId, avatar: null, bot: false, color: null },
                claimer: known(ticket.claimedBy),
                closer: known(ticket.closedBy),
                reason: ticket.closeReason,
                members: ticket.members,
                openedAt: ticket.createdAt.getTime(),
                closedAt: ticket.closedAt?.getTime() ?? Date.now(),
                messages: list.length,
                files: list.reduce((sum, message) => sum + message.files.length, 0),
                participants: Participants(list),
            },
            messages: list,
            mentions: await this.Mentions(guild, messages, people),
            media,
            truncated,
        };
    }

    /**
     * Der eigene Kanal einer Bewerbung als HTML-Datei (W-0047). Eine Online-Ansicht
     * gibt es dafür nicht: Bilder kommen eingebettet mit, bis TRANSCRIPT_INLINE_BYTES,
     * alles andere bleibt ein Discord-Link. file ist null, wenn Discord sie nicht nähme.
     */
    async Application(guild: Guild, channel: GuildTextBasedChannel, apply: IApplyTranscript): Promise<{ transcript: ITranscript; file: Buffer | null }> {
        const { messages, truncated } = await this.Read(channel);
        const ids = [apply.applicantId, ...(apply.deciderId ? [apply.deciderId] : []), ...messages.filter((message) => !message.webhookId).map((message) => message.author.id)];
        const people = await this.Lookup(guild, ids, (member) => member.id !== apply.applicantId, apply.applicantId);
        const list = messages.map((message) => this.Snapshot(message, people, apply.applicantId));
        const inline = await this.Inline(messages);

        const transcript: ITranscript = {
            version: 1,
            ticketId: apply.id,
            number: apply.id,
            code: null,
            guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }) },
            channel: { id: channel.id, name: channel.name },
            meta: {
                optionId: "apply",
                option: apply.form,
                contact: "direct",
                openerCode: null,
                opener: people.get(apply.applicantId) ?? { id: apply.applicantId, name: apply.applicantId, avatar: null, bot: false, color: null },
                claimer: null,
                closer: apply.deciderId ? (people.get(apply.deciderId) ?? null) : null,
                reason: apply.note,
                members: [],
                openedAt: apply.openedAt,
                closedAt: apply.closedAt,
                messages: list.length,
                files: list.reduce((sum, message) => sum + message.files.length, 0),
                participants: Participants(list),
            },
            messages: list,
            mentions: await this.Mentions(guild, messages, people),
            // Eingebettet gilt als gesichert - der Schlüssel ist zugleich der Name für file().
            media: Object.fromEntries([...inline.keys()].map((key) => [key, key])),
            truncated,
        };

        const html = Buffer.from(RenderTranscript(transcript, { file: (stored) => inline.get(stored) ?? null, apply: { decision: apply.decision } }), "utf8");

        return { transcript, file: html.length <= MAX_DISCORD_UPLOAD ? html : null };
    }

    /** Bis zu MAX_TRANSCRIPT_MESSAGES Nachrichten eines Kanals, die älteste zuerst. */
    private async Read(channel: GuildTextBasedChannel): Promise<{ messages: Message[]; truncated: boolean }> {
        const fetched: Message[] = [];
        let before: string | undefined;

        while (fetched.length < MAX_TRANSCRIPT_MESSAGES) {
            const batch = await channel.messages.fetch({ limit: 100, before, cache: false });

            if (batch.size === 0) break;

            fetched.push(...batch.values());
            before = batch.last()?.id;

            if (batch.size < 100) break;
        }

        return { messages: fetched.slice(0, MAX_TRANSCRIPT_MESSAGES).reverse(), truncated: fetched.length >= MAX_TRANSCRIPT_MESSAGES };
    }

    /** Bild-Anhänge als data:-URI, zusammen höchstens TRANSCRIPT_INLINE_BYTES. Schlüssel wie in media. */
    private async Inline(messages: Message[]): Promise<Map<string, string>> {
        const inline = new Map<string, string>();
        let room = TRANSCRIPT_INLINE_BYTES;

        for (const message of messages) {
            for (const attachment of message.attachments.values()) {
                const key = AttachmentKey(attachment.url);
                const type = key ? INLINE_TYPES[`.${Extension(attachment.url)}`] : undefined;

                if (!key || inline.has(key) || !type?.startsWith("image/") || attachment.size > room) continue;

                const data = await this.Fetch(attachment.url, room);

                if (!data) continue;

                room -= data.length;
                inline.set(key, `data:${type};base64,${data.toString("base64")}`);
            }
        }

        return inline;
    }

    /** Eine Nachricht, wie sie im Transcript steht - auch für den Chat in Live Tickets. */
    Snapshot(message: Message, people: Map<string, ITranscriptUser>, openerId?: string): ITranscriptMessage {
        return {
            id: message.id,
            type: message.type,
            author: this.Author(message, people, openerId),
            at: message.createdTimestamp,
            edited: message.editedTimestamp,
            content: message.content,
            reply: message.type === MessageType.Reply ? (message.reference?.messageId ?? null) : null,
            embeds: message.embeds.map((embed) => embed.toJSON()),
            components: message.components.map((component) => component.toJSON()),
            files: message.attachments.map((attachment) => ({
                name: attachment.name,
                size: attachment.size,
                type: attachment.contentType,
                url: attachment.url,
                width: attachment.width,
                height: attachment.height,
                spoiler: attachment.spoiler,
                description: attachment.description,
            })),
            stickers: message.stickers.map((sticker) => ({ name: sticker.name, url: sticker.url })),
            reactions: message.reactions.cache.map((reaction) => ({
                emoji: reaction.emoji.id
                    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
                    : (reaction.emoji.name ?? "?"),
                count: reaction.count,
            })),
        };
    }

    Person(member: GuildMember, team?: boolean): ITranscriptUser {
        return {
            id: member.id,
            name: member.displayName,
            avatar: member.displayAvatarURL({ extension: "webp", size: 128 }),
            bot: member.user.bot,
            color: member.displayHexColor !== "#000000" ? member.displayHexColor : null,
            team: member.user.bot ? undefined : team,
        };
    }

    /** Wer im Ticket zum Team zählt - dieselbe Regel wie für das Aktions-Menü. */
    async TeamOf(ticket: ITicket): Promise<(member: GuildMember) => boolean> {
        const config = await this.client.ticketSettings.Of(ticket.guildId);
        const scope = { config, option: OptionOf(config, ticket) };

        return (member) => this.client.ticketService.IsStaff(member, scope);
    }

    /**
     * Name, Bild und Rollenfarbe aller Beteiligten. Beim Abrufen der Nachrichten
     * liefert Discord keine Mitglieder mit - also einzeln nachschlagen, höchstens
     * MAX_LOOKUPS. Wer den Server verlassen hat, erscheint mit seinem Profil.
     */
    async People(guild: Guild, messages: Message[], ticket: ITicket): Promise<Map<string, ITranscriptUser>> {
        const ids = [ticket.openerId, ...ticket.members];

        if (ticket.claimedBy) ids.push(ticket.claimedBy);
        if (ticket.closedBy) ids.push(ticket.closedBy);

        for (const message of messages) if (!message.webhookId) ids.push(message.author.id);

        return this.Lookup(guild, ids, await this.TeamOf(ticket), ticket.openerId);
    }

    /** Die Personen zu ids, höchstens MAX_LOOKUPS - team sagt, wer zum Team zählt. */
    private async Lookup(guild: Guild, ids: string[], team: (member: GuildMember) => boolean, openerId: string): Promise<Map<string, ITranscriptUser>> {
        const people = new Map<string, ITranscriptUser>();

        for (const id of [...new Set(ids)].slice(0, MAX_LOOKUPS)) {
            const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));

            if (member) {
                people.set(id, this.Person(member, team(member)));
                continue;
            }

            const user = this.client.users.cache.get(id) ?? (await this.client.users.fetch(id).catch(() => null));

            if (user) {
                people.set(id, {
                    id,
                    name: user.displayName,
                    avatar: user.displayAvatarURL({ extension: "webp", size: 128 }),
                    bot: user.bot,
                    color: null,
                    // Nicht mehr auf dem Server: beim Ersteller ist trotzdem klar, auf welcher Seite er steht.
                    ...(id === openerId && !user.bot ? { team: false } : {}),
                });
            }
        }

        return people;
    }

    Author(message: Message, people: Map<string, ITranscriptUser>, openerId?: string): ITranscriptUser {
        // Webhooks tragen Name und Bild je Nachricht selbst. Per ModMail
        // weitergeleitet schreibt aber der Ersteller - dann steht er da, mit Bild.
        if (message.webhookId) {
            const opener = openerId && RelayedFromUser(message) ? people.get(openerId) : undefined;

            if (opener) return opener;

            // Aus Live Tickets: ein Teammitglied, kein Bot.
            const dashboard = message.author.username.endsWith(" · via Dashboard");

            return {
                id: message.author.id,
                name: message.author.username,
                avatar: message.author.displayAvatarURL({ extension: "webp", size: 128 }),
                bot: !dashboard,
                color: null,
                ...(dashboard ? { team: true } : {}),
            };
        }

        return (
            people.get(message.author.id) ?? {
                id: message.author.id,
                name: message.author.displayName,
                avatar: message.author.displayAvatarURL({ extension: "webp", size: 128 }),
                bot: message.author.bot,
                color: null,
            }
        );
    }

    /** Namen zu allen <@id>, <@&id> und <#id> - in Texten, Embeds und Components V2. */
    async Mentions(guild: Guild, messages: Message[], people: Map<string, ITranscriptUser>): Promise<ITranscript["mentions"]> {
        const text = JSON.stringify(
            messages.map((message) => [
                message.content,
                message.embeds.map((embed) => embed.toJSON()),
                message.components.map((component) => component.toJSON()),
            ])
        );

        const users: Record<string, string> = {};
        const roles: ITranscript["mentions"]["roles"] = {};
        const channels: Record<string, string> = {};
        let lookups = 0;

        for (const [, id] of text.matchAll(/<@!?(\d{17,20})>/g)) {
            if (users[id]) continue;

            const known = people.get(id)?.name ?? guild.members.cache.get(id)?.displayName ?? this.client.users.cache.get(id)?.displayName;

            if (known) users[id] = known;
            else if (lookups++ < MAX_LOOKUPS) {
                const user = await this.client.users.fetch(id).catch(() => null);

                if (user) users[id] = user.displayName;
            }
        }

        for (const [, id] of text.matchAll(/<@&(\d{17,20})>/g)) {
            const role = guild.roles.cache.get(id);

            if (role) roles[id] = { name: role.name, color: role.hexColor !== "#000000" ? role.hexColor : null };
        }

        for (const [, id] of text.matchAll(/<#(\d{17,20})>/g)) {
            const channel = guild.channels.cache.get(id) ?? this.client.channels.cache.get(id);

            if (channel && "name" in channel && channel.name) channels[id] = channel.name;
        }

        return { users, roles, channels };
    }

    /**
     * Sichert die Anhänge nach transcripts/<server>/<ticket>/. Discord-Links
     * darauf laufen nach etwa einem Tag ab - ohne Kopie wären die Bilder weg.
     * Nur von Discords CDN, je Datei MAX_TRANSCRIPT_FILE, zusammen MAX_TRANSCRIPT_BYTES.
     */
    private async SaveMedia(guildId: string, ticketId: number, messages: Message[]): Promise<Record<string, string>> {
        const wanted = new Map<string, string>();

        for (const message of messages) {
            for (const attachment of message.attachments.values()) {
                const key = AttachmentKey(attachment.url);

                if (key && !wanted.has(key)) wanted.set(key, attachment.url);
            }

            const raw = JSON.stringify([message.components.map((c) => c.toJSON()), message.embeds.map((e) => e.toJSON())]);

            for (const [url] of raw.matchAll(ATTACHMENT_URL)) {
                const key = AttachmentKey(url);

                if (key && !wanted.has(key)) wanted.set(key, url);
            }
        }

        const media: Record<string, string> = {};

        if (wanted.size === 0) return media;

        const directory = path.join(TRANSCRIPT_ROOT, guildId, String(ticketId));

        await mkdir(directory, { recursive: true });

        let used = 0;
        let index = 0;

        for (const [key, url] of wanted) {
            if (used >= MAX_TRANSCRIPT_BYTES) break;

            const saved = await this.Download(url, directory, index++, Math.min(MAX_TRANSCRIPT_FILE, MAX_TRANSCRIPT_BYTES - used));

            if (!saved) continue;

            media[key] = saved.name;
            used += saved.size;
        }

        return media;
    }

    private async Download(url: string, directory: string, index: number, limit: number): Promise<{ name: string; size: number } | null> {
        const buffer = await this.Fetch(url, limit);

        if (!buffer) return null;

        const name = `${index}.${Extension(url)}`;

        try {
            await writeFile(path.join(directory, name), buffer);
        } catch (error) {
            logger.warn(`📄 Anhang nicht gesichert: ${String(error)}`);

            return null;
        }

        return { name, size: buffer.length };
    }

    private async Fetch(url: string, limit: number): Promise<Buffer | null> {
        try {
            // Keine Umleitungen: die Adresse ist geprüft, ihr Ziel wäre es nicht.
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });

            if (!response.ok) return null;

            if (Number(response.headers.get("content-length") ?? 0) > limit) {
                await response.body?.cancel();

                return null;
            }

            const buffer = Buffer.from(await response.arrayBuffer());

            return buffer.length > limit ? null : buffer;
        } catch (error) {
            logger.warn(`📄 Anhang nicht gesichert: ${String(error)}`);

            return null;
        }
    }

    /* ----------------------------------------------------------
       Verschicken
       ---------------------------------------------------------- */
    /** Die Online-Ansicht - hinter dem Login des Dashboards. */
    Link(ticketId: number): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/transcript/${ticketId}`;
    }

    private async Deliver(context: ITicketContext, transcript: ITranscript): Promise<void> {
        const { config, guild, ticket } = context;
        const { channelId, dm } = config.transcripts;
        // Bei ModMail steht das Gespräch schon in den DMs des Users - und die
        // Team-Seite mit ihren internen Zeilen gehört nicht zu ihm.
        const direct = dm && ticket.contact === "direct";

        if (!channelId && !direct) return;

        const file = await this.File(transcript);

        // Textkanal oder Forum-Beitrag - ein archivierter Beitrag wacht dabei auf.
        if (channelId && !(await SendLog(guild, channelId, this.Card(transcript, file, true)))) {
            logger.warn(`📄 Transcript ${ticket.id} nicht in ${channelId} gepostet`);
        }

        if (direct) {
            const opener = await this.client.users.fetch(ticket.openerId).catch(() => null);

            await opener?.send(this.Card(transcript, file, false)).catch(() => undefined);
        }
    }

    private Card(transcript: ITranscript, file: Buffer | null, mentions: boolean) {
        const { meta } = transcript;
        // Wie die Ticket-ID: sup-5.html, ältere Tickets ticket-5.html.
        const name = `${(transcript.code ?? "ticket").toLowerCase()}-${transcript.number}.html`;
        const who = (user: ITranscriptUser | null, fallback: string): string =>
            user ? (mentions ? `<@${user.id}>` : escapeMarkdown(user.name)) : fallback;

        const builder = new ComponentV2Builder({ accentColor: "#ff1e2d" })
            .title(`📄 | Transcript ${TicketNumber(transcript.number, transcript.code)}`, `${escapeMarkdown(meta.option)} · ${escapeMarkdown(transcript.guild.name)}`)
            .separator()
            .list([
                `**Ersteller:** ${who(meta.opener, "–")}`,
                `**Bearbeiter:** ${who(meta.claimer, "niemand")}`,
                `**Geschlossen von:** ${who(meta.closer, "unbekannt")}${meta.reason ? ` – ${escapeMarkdown(meta.reason)}` : ""}`,
                `**Geöffnet:** <t:${Math.floor(meta.openedAt / 1000)}:f> · **Dauer:** ${Duration(meta.closedAt - meta.openedAt)}`,
                `**Nachrichten:** ${meta.messages} · **Anhänge:** ${meta.files}`,
            ]);

        if (file) builder.file(name);

        builder.buttons({ url: this.Link(transcript.ticketId), label: "Online ansehen", emoji: "📄" });

        if (!mentions) builder.subtext("Online ansehen braucht die Anmeldung im Dashboard. Die Datei öffnet jeder Browser.");

        return {
            components: [builder.build()],
            files: file ? [new AttachmentBuilder(file, { name })] : [],
            flags: MessageFlags.IsComponentsV2 as const,
            allowedMentions: { parse: [] },
        };
    }

    /* ----------------------------------------------------------
       Ansehen
       ---------------------------------------------------------- */
    private Directory(guildId: string, ticketId: number): string {
        return path.join(TRANSCRIPT_ROOT, guildId, String(ticketId));
    }

    /**
     * Welche Transcripts ein Mitglied in der Liste sieht - dieselbe Regel wie
     * CanRead: "Server verwalten" alles; die allgemeine Support-Rolle alles außer
     * Themen mit eigener Rolle, die es nicht hat; sonst nur die Themen seiner Rollen.
     */
    Visible(member: GuildMember, config: ITicketConfig): { include?: string[]; exclude?: string[] } {
        if (member.permissions.has(PermissionFlagsBits.ManageGuild) || IsModerator(member, config)) return {};

        const has = (role: string | null): boolean => role !== null && member.roles.cache.has(role);
        const own = config.options.filter((option) => option.supportRoleId !== null);

        if (has(config.supportRoleId)) return { exclude: own.filter((option) => !has(option.supportRoleId)).map((option) => option.id) };

        return { include: own.filter((option) => has(option.supportRoleId)).map((option) => option.id) };
    }

    /** Löscht ein Transcript samt gesicherter Anhänge - etwa auf Wunsch des Erstellers. */
    async Delete(entry: ITranscriptEntry): Promise<void> {
        await this.client.ticketTranscripts.Delete(entry.ticketId);
        await rm(this.Directory(entry.guildId, entry.ticketId), { recursive: true, force: true });

        logger.user(`📄 Transcript ${TicketNumber(entry.number, entry.code)} auf ${entry.guildId} gelöscht`);
    }

    /** Wo ein gesicherter Anhang liegt - null für jeden Namen, den der Bot nicht selbst vergibt. */
    FilePath(entry: ITranscriptEntry, name: string): string | null {
        return STORED_FILE.test(name) ? path.join(this.Directory(entry.guildId, entry.ticketId), name) : null;
    }

    /**
     * Die HTML-Datei zum Mitnehmen: Bilder eingebettet, solange sie zusammen in
     * TRANSCRIPT_INLINE_BYTES passen, der Rest zeigt auf die Online-Ansicht.
     * limit: für Discord höchstens 10 MB - darüber gibt es nur den Link.
     */
    async File(transcript: ITranscript, limit: number | null = MAX_DISCORD_UPLOAD): Promise<Buffer | null> {
        const directory = this.Directory(transcript.guild.id, transcript.ticketId);
        const inline = new Map<string, string>();
        let room = TRANSCRIPT_INLINE_BYTES;

        for (const stored of Object.values(transcript.media)) {
            const type = INLINE_TYPES[path.extname(stored)];

            if (!type?.startsWith("image/")) continue;

            const data = await readFile(path.join(directory, stored)).catch(() => null);

            if (!data || data.length > room) continue;

            room -= data.length;
            inline.set(stored, `data:${type};base64,${data.toString("base64")}`);
        }

        const online = this.Link(transcript.ticketId);
        const html = Buffer.from(
            RenderTranscript(transcript, { file: (stored) => inline.get(stored) ?? `${online}/${stored}` }),
            "utf8"
        );

        return limit === null || html.length <= limit ? html : null;
    }

    /** Die Online-Ansicht: Anhänge über die eigene Route, oben der Weg zurück - eingebettet ohne. */
    async Page(entry: ITranscriptEntry, embed = false): Promise<string | null> {
        const transcript = await this.client.ticketTranscripts.Read(entry.ticketId);

        if (!transcript) return null;

        const base = `${DASHBOARD_PATH}/transcript/${entry.ticketId}`;

        return RenderTranscript(transcript, {
            file: (stored) => `${base}/${stored}`,
            bar: { back: `${DASHBOARD_PATH}/guild/${entry.guildId}/transcriptions`, download: `${base}?download=1` },
            embed,
        });
    }

    /**
     * Wer ein Transcript öffnen darf: "Server verwalten", die Support-Rolle des
     * Tickets und - nur bei Klassisch - der Ersteller und hinzugefügte User. Bei
     * ModMail ist das Transcript die Team-Seite mit ihren internen Zeilen.
     */
    async CanRead(userId: string, entry: ITranscriptEntry): Promise<boolean> {
        const { meta } = entry;

        if (meta.contact === "direct" && (userId === meta.opener?.id || meta.members?.includes(userId))) return true;

        const guild = this.client.guilds.cache.get(entry.guildId);
        const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

        if (!member) return false;

        // Dieselbe Regel wie im Ticket: "Server verwalten", Moderatoren, die Support-Rolle des Themas.
        const config = await this.client.ticketSettings.Of(entry.guildId);

        return this.client.ticketService.IsStaff(member, { config, option: config.options.find((option) => option.id === meta.optionId) ?? null });
    }
}
