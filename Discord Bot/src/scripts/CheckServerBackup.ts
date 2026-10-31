/**
 * Prüft die Backups für den Discord-Server ohne Discord (Plan 32): Zuordnung
 * alter zu neuer IDs, den Server lesen, Unterschiede, die Schritte je Modus,
 * das Abarbeiten, Karten und den Befehl.
 *
 *   npm run check:serverbackup
 *
 * Ob ein Server wirklich so zurückkommt, wie er war, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { IBackupMeta, IDebrisRow, IProtect, IRestoreJob, IRestoreOp, IServerSnapshot, ISnapChannel, ISnapOverwrite, ISnapRole, ISnapSettings, RestoreMode } from "../interfaces/services/serverbackup/IServerBackup";
import { DiffSnapshots } from "../services/serverbackup/Diff";
import { PlanRestore } from "../services/serverbackup/Plan";
import { IRunDeps, RunOps } from "../services/serverbackup/Runner";
import { IBackupCall } from "../routes/DashboardApiBackups";
import ServerBackupService from "../services/ServerBackupService";
import BotClient from "../client/BotClient";
import { AfterServerRestore, PanelsOf } from "../utils/guildpanels";
import { AutoFailedCard, AutomaticReply, BackupReply, CompareReply, CreatedReply, DoneCard, ListReply, LoadConfirm, RunningCard, SafetyNotice, Strip } from "../builder/ServerBackupView";
import { SERVER_PART_IDS } from "../constants/ServerBackup";
import { FilterIdMap, MapSnapshot, ResolveChains } from "../services/serverbackup/IdMap";
import { ReadSnapshot } from "../services/serverbackup/Snapshot";
import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, Guild, PermissionFlagsBits } from "discord.js";
import Backup from "../commands/admin/Backup";
import fastify from "fastify";
import RouteManager from "../handler/RouteManager";
import DashboardApiBackups from "../routes/DashboardApiBackups";
import { DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const GUILD = "90071992547409961";

/** Ein kleiner Stand, in dem die ID id an jeder Stelle steht, an der eine ID stehen kann. */
function SnapshotWith(id: string): IServerSnapshot {
    return {
        version: 1,
        guildId: GUILD,
        takenAt: new Date(0).toISOString(),
        settings: {
            name: "Server",
            icon: null,
            banner: null,
            description: null,
            verificationLevel: 1,
            defaultNotifications: 1,
            explicitContentFilter: 0,
            afkChannelId: id,
            afkTimeout: 300,
            systemChannelId: id,
            systemChannelFlags: 0,
            rulesChannelId: id,
            publicUpdatesChannelId: id,
            preferredLocale: "de",
        },
        roles: [{ id, name: "Rolle", color: 0, icon: null, unicodeEmoji: null, hoist: false, mentionable: false, permissions: "0", position: 1, everyone: false }],
        channels: [{ id, type: 0, name: "kanal", parentId: id, position: 0, topic: null, nsfw: false, rateLimit: 0, bitrate: null, userLimit: null, forum: null, overwrites: [{ id, type: 0, allow: "0", deny: "1024" }] }],
        members: [{ id: "90071992547409999", roles: [id] }],
        emojis: [{ id, name: "emoji", animated: false, roles: [id], image: null }],
        stickers: [],
        bans: [],
        skipped: [],
        counts: { roles: 1, channels: 1, members: 1, emojis: 1, stickers: 0, bans: 0 },
    };
}

/* ----------------------------------------------------------
   Task 1: Zuordnung alter zu neuer IDs
   ---------------------------------------------------------- */
function checkIdMap(): void {
    console.log("\n  — Zuordnung —");

    const OLD = "90071992547400111";
    const NEW = "90071992547400999";

    check("Ketten: A→B, B→C ergibt A→C", ResolveChains([["1", "2"], ["2", "3"]]).get("1") === "3");
    check("Zyklus bricht ab", ResolveChains([["1", "2"], ["2", "1"]]).size === 2);

    const mapped = JSON.stringify(MapSnapshot(SnapshotWith(OLD), new Map([[OLD, NEW]])));

    check("Stand umgeschrieben: Rolle, Kanal, Kategorie, Rechte, Mitglied, Emoji-Rolle, Kanäle der Einstellungen", !mapped.includes(OLD) && mapped.split(NEW).length - 1 === 11, mapped.slice(0, 200));

    const longer = `${OLD}0`;
    const untouched = JSON.stringify(MapSnapshot(SnapshotWith(longer), new Map([[OLD, NEW]])));

    check("Nur ganze IDs: eine längere Zahl bleibt", !untouched.includes(NEW));
}

/* ----------------------------------------------------------
   Nachgebauter Server - genug für Lesen und Abarbeiten
   ---------------------------------------------------------- */
const BOT = "90071992547409971";
const USER = "90071992547409973";
const R1 = "90071992547409981";
const BOOSTER = "90071992547409983";
const HIGH = "90071992547409984";
const CATEGORY = "90071992547409990";
const TEXT = "90071992547409991";
const THREAD = "90071992547409992";
const FORUM = "90071992547409993";
const TICKET = "90071992547409994";
const TICKET_CATEGORY = "90071992547409995";
const ODD = "90071992547409996";
const EMOJI_A = "90071992547409901";
const EMOJI_B = "90071992547409902";
const EMOJI_C = "90071992547409903";

interface IFakeOptions {
    emojiBytes?: number;
}

/** Ein Server aus einfachen Objekten, wie discord.js sie liefert. */
function FakeServer(options: IFakeOptions = {}) {
    const bits = (value: bigint) => ({ bitfield: value });
    const role = (id: string, name: string, position: number, managed = false) => ({ id, name, color: 0xff0000, icon: null, iconURL: () => null, unicodeEmoji: null, hoist: false, mentionable: true, permissions: bits(8n), position, managed });
    const roles = new Map([
        [GUILD, { ...role(GUILD, "@everyone", 0), permissions: bits(1024n) }],
        [R1, role(R1, "Stammspieler", 2)],
        [BOOSTER, role(BOOSTER, "Booster", 1, true)],
        [HIGH, role(HIGH, "Admin", 20)],
    ]);
    const overwrite = (id: string, type: 0 | 1) => ({ id, type, allow: bits(1024n), deny: bits(2048n) });
    const channel = (id: string, type: number, name: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({
        id,
        type,
        name,
        parentId,
        rawPosition: 1,
        topic: null,
        nsfw: false,
        rateLimitPerUser: 0,
        bitrate: type === 2 ? 64000 : undefined,
        userLimit: type === 2 ? 0 : undefined,
        permissionOverwrites: { cache: new Map<string, unknown>() },
        isThread: () => type === 11,
        ...extra,
    });
    const channels = new Map<string, ReturnType<typeof channel>>([
        [CATEGORY, channel(CATEGORY, 4, "INFO", null)],
        [TEXT, channel(TEXT, 0, "allgemein", CATEGORY, { permissionOverwrites: { cache: new Map([[R1, overwrite(R1, 0)], [USER, overwrite(USER, 1)]]) } })],
        [THREAD, channel(THREAD, 11, "faden", TEXT)],
        [FORUM, channel(FORUM, 15, "fragen", CATEGORY, { availableTags: [{ name: "Hilfe", emoji: null, moderated: false }, { name: "Gelöst", emoji: { id: null, name: "✅" }, moderated: true }], defaultReactionEmoji: { id: null, name: "👍" }, defaultForumLayout: 1 })],
        [TICKET_CATEGORY, channel(TICKET_CATEGORY, 4, "TICKETS", null)],
        [TICKET, channel(TICKET, 0, "ticket-0001", TICKET_CATEGORY)],
        [ODD, channel(ODD, 14, "verzeichnis", null)],
    ]);
    const memberRoles = (ids: string[]) => ({ cache: new Map(ids.map((id) => [id, roles.get(id)!])) });
    const members = new Map([
        [USER, { id: USER, user: { id: USER, bot: false }, roles: memberRoles([GUILD, R1, BOOSTER]) }],
        [BOT, { id: BOT, user: { id: BOT, bot: true }, roles: memberRoles([GUILD]) }],
    ]);
    const emoji = (id: string, name: string) => ({ id, name, animated: false, roles: { cache: new Map([[R1, roles.get(R1)]]) }, imageURL: () => `https://cdn/emoji/${id}.png` });
    const guild = {
        id: GUILD,
        name: "RL Nexus Esports",
        description: null,
        verificationLevel: 1,
        defaultMessageNotifications: 1,
        explicitContentFilter: 0,
        afkChannelId: null,
        afkTimeout: 300,
        systemChannelId: TEXT,
        systemChannelFlags: bits(0n),
        rulesChannelId: null,
        publicUpdatesChannelId: null,
        preferredLocale: "de",
        iconURL: () => "https://cdn/icon.png",
        bannerURL: () => null,
        roles: { cache: roles, everyone: roles.get(GUILD) },
        channels: { cache: channels },
        members: { cache: members, me: { id: BOT, roles: { highest: { position: 10 } } }, fetch: async () => members },
        emojis: { cache: new Map([[EMOJI_A, emoji(EMOJI_A, "gg")], [EMOJI_B, emoji(EMOJI_B, "rl")], [EMOJI_C, emoji(EMOJI_C, "nexus")]]) },
        stickers: { cache: new Map([["90071992547409911", { id: "90071992547409911", name: "jubel", description: null, tags: "tada", url: "https://cdn/sticker.png" }]]) },
        bans: {
            fetch: async () =>
                new Map([
                    ["90071992547409921", { user: { id: "90071992547409921" }, reason: "Spam" }],
                    ["90071992547409922", { user: { id: "90071992547409922" }, reason: null }],
                ]),
        },
    };
    const fetchImage = async () => Buffer.alloc(options.emojiBytes ?? 1000, 1);

    return { guild: guild as unknown as Guild, fetchImage };
}

/* ----------------------------------------------------------
   Task 2: Den Server lesen
   ---------------------------------------------------------- */
async function checkSnapshot(): Promise<void> {
    console.log("\n  — Server lesen —");

    const { guild, fetchImage } = FakeServer();
    const skip = new Set([TICKET]);
    const snap = await ReadSnapshot(guild, { skipChannels: skip, withImages: true, withMembers: true, fetchImage });

    check("Verwaltete Rollen nicht drin", !snap.roles.some((role) => role.name === "Booster"));
    check("@everyone nur mit Rechten", snap.roles.filter((role) => role.everyone).length === 1 && snap.roles.find((role) => role.everyone)!.permissions === "1024");
    check("Threads nicht drin", !snap.channels.some((channel) => channel.id === THREAD));
    check("Ticket-Kanal nicht drin, seine Kategorie schon", !snap.channels.some((channel) => channel.id === TICKET) && snap.channels.some((channel) => channel.id === TICKET_CATEGORY));
    check("Rechte je Kanal mit Rollen und Mitgliedern", snap.channels.find((channel) => channel.id === TEXT)?.overwrites.length === 2);
    check("Forum mit Tags, Reaktion und Ansicht", snap.channels.find((channel) => channel.id === FORUM)?.forum?.tags.length === 2 && snap.channels.find((channel) => channel.id === FORUM)?.forum?.defaultReaction === "👍");
    check("Mitglieder nur mit nicht verwalteten Rollen, ohne @everyone", snap.members?.find((member) => member.id === USER)?.roles.join() === R1, JSON.stringify(snap.members));
    check("Bans mit Grund", snap.bans.length === 2 && snap.bans.some((ban) => ban.reason === "Spam"));
    check("Einstellungen mit Systemkanal und Bild", snap.settings.systemChannelId === TEXT && snap.settings.icon !== null);
    check("Unbekannte Kanal-Art übersprungen und genannt", !snap.channels.some((channel) => channel.id === ODD) && snap.skipped.some((line) => line.includes("verzeichnis")), JSON.stringify(snap.skipped));
    check("Zähler stimmen", snap.counts.roles === snap.roles.length && snap.counts.channels === snap.channels.length && snap.counts.bans === 2 && snap.counts.members === snap.members!.length);

    const noIntent = await ReadSnapshot(guild, { skipChannels: skip, withImages: true, withMembers: false, fetchImage });
    check("Ohne Members Intent: Mitglieder null, genannt", noIntent.members === null && noIntent.counts.members === null && noIntent.skipped.some((line) => line.includes("Mitglieder")));

    const big = FakeServer({ emojiBytes: 3 * 1024 * 1024 });
    const heavy = await ReadSnapshot(big.guild, { skipChannels: skip, withImages: true, withMembers: true, fetchImage: big.fetchImage });
    check("Bilder über 8 MB fehlen und werden genannt", heavy.emojis.some((entry) => entry.image === null) && heavy.emojis.some((entry) => entry.image !== null) && heavy.skipped.some((line) => line.includes("Emoji")), JSON.stringify(heavy.skipped));

    const light = await ReadSnapshot(guild, { skipChannels: skip, withImages: false, withMembers: true, fetchImage });
    check("Ohne Bilder: keine Bilder, nichts übersprungen deswegen", light.emojis.every((entry) => entry.image === null) && !light.skipped.some((line) => line.includes("Emoji")));
}

/* ----------------------------------------------------------
   Task 4: Unterschiede und Schritte je Modus
   ---------------------------------------------------------- */
const MOD_ROLE = "90071992547408001";
const QROLE = "90071992547408002";
const EXTRA = "90071992547408003";
const BOTROLE = "90071992547408004";
const MANAGED = "90071992547408005";
const SKIPPED_ROLE = "90071992547408006";
const DEBRIS_ROLE = "90071992547408007";
const RULES = "90071992547408101";
const QCH = "90071992547408102";
const BAIT = "90071992547408103";
const EVENT = "90071992547408104";
const TEXT2 = "90071992547408105";
const ANN = "90071992547408106";
const OTHER_INFO = "90071992547408107";
const HELD = "90071992547408201";
const NEWCOMER = "90071992547408202";
const GONE = "90071992547408203";
const BANNED_A = "90071992547408301";
const BANNED_B = "90071992547408302";

const snapRole = (id: string, name: string, position: number, extra: Partial<ISnapRole> = {}): ISnapRole => ({ id, name, color: 0, icon: null, unicodeEmoji: null, hoist: false, mentionable: false, permissions: "0", position, everyone: id === GUILD, ...extra });
const snapChannel = (id: string, name: string, type: number, parentId: string | null, overwrites: ISnapOverwrite[] = [], extra: Partial<ISnapChannel> = {}): ISnapChannel => ({ id, type, name, parentId, position: 0, topic: null, nsfw: false, rateLimit: 0, bitrate: null, userLimit: null, forum: null, overwrites, ...extra });
const deny = (id: string, type: 0 | 1 = 0): ISnapOverwrite => ({ id, type, allow: "0", deny: "1024" });

function Snap(input: Partial<IServerSnapshot>): IServerSnapshot {
    return { ...SnapshotWith("90071992547400000"), roles: [], channels: [], members: [], emojis: [], stickers: [], bans: [], skipped: [], ...input };
}

/** Das Backup von gestern 00:00. */
function Before(): IServerSnapshot {
    return Snap({
        roles: [snapRole(GUILD, "@everyone", 0), snapRole(R1, "Stammspieler", 2), snapRole(QROLE, "Quarantäne", 3), snapRole(MOD_ROLE, "Moderator", 5), snapRole(HIGH, "Admin", 20, { color: 1 })],
        channels: [
            snapChannel(CATEGORY, "INFO", 4, null),
            snapChannel(TEXT, "allgemein", 0, CATEGORY, [deny(R1)]),
            snapChannel(RULES, "regeln", 0, CATEGORY),
            snapChannel(TEXT2, "clips", 0, CATEGORY, [deny(SKIPPED_ROLE)]),
            snapChannel(QCH, "quarantäne", 0, null),
            snapChannel(BAIT, "nicht-schreiben", 0, null),
        ],
        members: [
            { id: USER, roles: [R1, MOD_ROLE] },
            { id: HELD, roles: [R1] },
            { id: GONE, roles: [R1] },
        ],
        bans: [{ id: BANNED_A, reason: "Spam" }],
    });
}

/** Der Server jetzt: Moderator und #regeln weg, Admin geändert, Event dazu, Quarantäne eingerichtet. */
function Now(): IServerSnapshot {
    return Snap({
        roles: [snapRole(GUILD, "@everyone", 0), snapRole(R1, "Stammspieler", 2), snapRole(QROLE, "Quarantäne", 3), snapRole(EXTRA, "Event", 4), snapRole(BOTROLE, "RL Nexus", 10), snapRole(MANAGED, "Booster", 1), snapRole(HIGH, "Admin", 20, { color: 2 })],
        channels: [
            snapChannel(CATEGORY, "INFO", 4, null),
            snapChannel(TEXT, "allgemein", 0, CATEGORY, [deny(QROLE)]),
            snapChannel(TEXT2, "clips", 0, CATEGORY),
            snapChannel(EVENT, "event-november", 0, CATEGORY),
            snapChannel(QCH, "quarantäne", 0, null),
            snapChannel(BAIT, "nicht-schreiben", 0, null),
            snapChannel(TICKET, "ticket-0001", 0, null),
        ],
        members: [
            { id: USER, roles: [R1] },
            { id: HELD, roles: [QROLE] },
            { id: NEWCOMER, roles: [EXTRA] },
        ],
        bans: [{ id: BANNED_A, reason: "Spam" }, { id: BANNED_B, reason: "Raid" }],
    });
}

const protect: IProtect = { botTop: 10, botRoleId: BOTROLE, everyoneId: GUILD, roles: new Set([QROLE, MANAGED]), channels: new Set([QCH, BAIT, TICKET]), members: new Set([HELD]) };
const ALL_PARTS = SERVER_PART_IDS;

const isCreate = (name: string) => (op: IRestoreOp) => (op.kind === "channel.create" && op.channel.name === name) || (op.kind === "role.create" && op.role.name === name);
const isDelete = (op: IRestoreOp) => op.kind.endsWith(".delete");
const touchesMember = (id: string) => (op: IRestoreOp) => (op.kind === "member.add" || op.kind === "member.remove") && op.userId === id;
const touchesRole = (id: string) => (op: IRestoreOp) => (op.kind === "role.edit" || op.kind === "role.delete") && op.id === id;
const touchesChannel = (id: string) => (op: IRestoreOp) => ((op.kind === "channel.edit" || op.kind === "channel.delete") && op.id === id) || (op.kind === "overwrites" && op.channelId === id) || (op.kind === "channel.create" && op.channel.id === id);

function checkPlan(): void {
    console.log("\n  — Unterschiede und Schritte —");

    const plan = (mode: RestoreMode, extra: Partial<Parameters<typeof PlanRestore>[0]> = {}) => PlanRestore({ backup: Before(), live: Now(), mode, parts: [...ALL_PARTS], protect, debris: [], ...extra });
    const repair = plan("repair");
    const exact = plan("exact");
    const anyOp = (test: (op: IRestoreOp) => boolean) => [repair, exact].some((entry) => entry.ops.some(test));

    check("Reparieren: legt Fehlendes an, setzt Rechte zurück, löscht nichts", repair.ops.some(isCreate("regeln")) && repair.ops.some(isCreate("Moderator")) && repair.ops.some((op) => op.kind === "overwrites" && op.channelId === TEXT) && !repair.ops.some(isDelete), JSON.stringify(repair.ops.map((op) => op.kind)));
    check("Reparieren: nimmt keinem Mitglied eine Rolle, gibt fehlende zurück", !repair.ops.some((op) => op.kind === "member.remove") && repair.ops.some((op) => op.kind === "member.add" && op.userId === USER && op.roles.includes(MOD_ROLE)));
    check("Kein Modus hebt einen Bann auf", [repair, exact].every((entry) => !entry.ops.some((op) => op.kind === "ban" && op.userId === BANNED_B) && !JSON.stringify(entry.ops).includes("unban")));
    check("Genau: löscht, was es damals nicht gab", exact.ops.some((op) => op.kind === "channel.delete" && op.id === EVENT) && exact.ops.some((op) => op.kind === "role.delete" && op.id === EXTRA));
    check("Genau: nie Rolle über dem Bot, verwaltet, @everyone, Bot-Rolle", !exact.ops.some((op) => op.kind === "role.delete" && [HIGH, MANAGED, GUILD, BOTROLE].includes(op.id)));
    check("Genau: nennt vorher, was verschwindet", exact.deletes.includes("#event-november") && exact.deletes.includes("@Event"), JSON.stringify(exact.deletes));
    check("Genau: wer nach dem Backup kam, bleibt unberührt", !exact.ops.some(touchesMember(NEWCOMER)));
    check("Anti Villain: Festgehaltene, Quarantäne-Rolle und -Kanal, Köder bleiben", !anyOp(touchesMember(HELD)) && !anyOp(touchesRole(QROLE)) && !anyOp(touchesChannel(QCH)) && !anyOp(touchesChannel(BAIT)));
    const textOverwrites = repair.ops.find((op): op is Extract<IRestoreOp, { kind: "overwrites" }> => op.kind === "overwrites" && op.channelId === TEXT);
    check("Anti Villain: Sperre der Quarantäne-Rolle bleibt in den Rechten", textOverwrites?.overwrites.some((entry) => entry.id === QROLE) === true && textOverwrites.overwrites.some((entry) => entry.id === R1), JSON.stringify(textOverwrites));
    check("Bot-eigene Kanäle: weder angelegt noch gelöscht", !anyOp(touchesChannel(TICKET)));
    check("Rolle über dem Bot: Geht nicht mit Namen", repair.impossible.some((line) => line.includes("Admin")) && !repair.ops.some(touchesRole(HIGH)), JSON.stringify(repair.impossible));
    check("Verweis auf nicht angelegte Rolle: übersprungen", !JSON.stringify(repair.ops).includes(SKIPPED_ROLE));
    check("Wer nicht mehr da ist: übersprungen und genannt", !repair.ops.some(touchesMember(GONE)) && repair.lines.some((line) => line.sign === "=" && line.part === "members"));

    const target = Snap({ roles: [snapRole(GUILD, "@everyone", 0)], channels: [snapChannel(OTHER_INFO, "INFO", 4, null)], members: [], settings: { ...Before().settings, name: "Zweiter Server" } });
    const other = PlanRestore({ backup: Before(), live: target, mode: "other", parts: [...ALL_PARTS], protect: { ...protect, roles: new Set(), channels: new Set(), members: new Set() }, debris: [] });
    check("Anderer Server: gleichnamige Kategorie angeglichen, nicht doppelt", !other.ops.some(isCreate("INFO")) && other.ops.some(isCreate("regeln")));
    check("Anderer Server: ohne Mitglieder, Bans, Namen, löscht nichts", !other.ops.some((op) => op.kind.startsWith("member") || op.kind === "ban" || isDelete(op)) && (other.ops.find((op) => op.kind === "settings") as { settings: ISnapSettings } | undefined)?.settings.name === "Zweiter Server");

    const debris: IDebrisRow[] = [
        { kind: "channel", objectId: ANN, name: "ankündigungen", data: { type: 0, parentId: CATEGORY, position: 0 }, members: [], at: 0 },
        { kind: "role", objectId: DEBRIS_ROLE, name: "Vyrox Main", data: { color: 3, permissions: "0", position: 6 }, members: [USER], at: 0 },
    ];
    const withDebris = plan("repair", { debris });
    check("Trümmer aus dem Vorfall: Kanal kommt zurück, Rolle mit Mitgliedern", withDebris.ops.some(isCreate("ankündigungen")) && withDebris.ops.some(isCreate("Vyrox Main")) && withDebris.ops.some((op) => op.kind === "member.add" && op.roles.includes(DEBRIS_ROLE)) && withDebris.lines.some((line) => line.part === "debris"));

    const many = Snap({ ...Before(), channels: [...Before().channels, ...Array.from({ length: 15 }, (_, index) => snapChannel(`900719925474090${String(index).padStart(2, "0")}`, `kanal-${index}`, 0, CATEGORY))] });
    const long = PlanRestore({ backup: many, live: Now(), mode: "repair", parts: [...ALL_PARTS], protect, debris: [] }).lines.find((line) => line.sign === "+" && line.part === "channels");
    check("Unterschiede: höchstens 10 Namen, Rest als Zahl", (long?.names.length ?? 0) <= 10 && long?.more === 6, JSON.stringify(long));

    const diff = DiffSnapshots(Before(), Now());
    check("Seitdem geändert: fehlt jetzt und neu seitdem", diff.some((line) => line.sign === "−" && line.names.includes("#regeln")) && diff.some((line) => line.sign === "+" && line.names.includes("#event-november")), JSON.stringify(diff));
    check("Nur gewählte Teile: ohne Kanäle keine Kanal-Schritte", !plan("repair", { parts: ["roles"] }).ops.some((op) => op.kind.startsWith("channel") || op.kind === "overwrites"));
}

/* ----------------------------------------------------------
   Task 5: Schritte abarbeiten
   ---------------------------------------------------------- */
/** Ein Server, der mitschreibt, was angelegt und geändert wird. fail: Schritte, die mit diesem Fehler scheitern. */
function LiveServer(fail: Record<string, string> = {}, id = GUILD) {
    let next = 1;
    const calls: string[] = [];
    const roles = new Map<string, { id: string; name: string; position: number; managed?: boolean }>([
        [GUILD, { id: GUILD, name: "@everyone", position: 0 }],
        [R1, { id: R1, name: "Stammspieler", position: 2 }],
        [BOTROLE, { id: BOTROLE, name: "RL Nexus", position: 10, managed: true }],
        [HIGH, { id: HIGH, name: "Admin", position: 20 }],
    ]);
    const channels = new Map<string, { id: string; name: string; type: number; parentId: string | null; overwrites: unknown[]; permissionOverwrites: { set: (list: unknown[]) => Promise<void> } }>();
    /** Was mit der Karte im Meldekanal passierte: send, edit. */
    const cards: string[] = [];
    const message = { id: "90071992547409000", edit: async () => void cards.push("edit") };
    /** Was beim Anlegen von Kanälen ankam. */
    const made: { name: string; bitrate?: number; permissionOverwrites?: { id: string }[] }[] = [];
    /** Was beim Ändern von Kanälen ankam (Review M3). */
    const edits: Record<string, unknown>[] = [];
    const newId = () => `9007199254747${String(next++).padStart(4, "0")}`;
    const guard = (key: string) => {
        if (fail[key]) throw new Error(fail[key]);
    };
    const addChannel = (id: string, name: string, parentId: string | null, type = 0) => {
        const channel = {
            id,
            name,
            type,
            parentId,
            isThread: () => false,
            send: async () => (cards.push("send"), message),
            messages: { fetch: async () => message },
            overwrites: [] as unknown[],
            permissionOverwrites: {
                set: async (list: unknown[]) => {
                    guard(`overwrites:${name}`);
                    channel.overwrites = list;
                    calls.push(`overwrites:${name}`);
                },
            },
        };
        channels.set(id, channel);
        return channel;
    };

    addChannel(CATEGORY, "INFO", null, 4);
    addChannel(TEXT, "allgemein", CATEGORY);

    const members = new Map([[USER, { id: USER, roles: new Set([R1]) }]]);
    const emojis = new Map<string, { id: string }>();
    const guild = {
        id,
        name: "Server",
        maximumBitrate: 96_000,
        roles: {
            cache: roles,
            create: async (data: { name: string }) => {
                guard(`role.create:${data.name}`);
                const role = { id: newId(), name: data.name, position: 1 };
                roles.set(role.id, role);
                calls.push(`role.create:${data.name}`);
                return role;
            },
            edit: async (id: string, data: { name: string }) => {
                if (!roles.has(id)) throw new Error("Unknown Role");
                calls.push(`role.edit:${data.name}`);
            },
            delete: async (id: string) => void (roles.delete(id), calls.push(`role.delete:${id}`)),
            setPositions: async () => void calls.push("order:roles"),
        },
        channels: {
            cache: channels,
            create: async (data: { name: string; parent?: string | null; type?: number; bitrate?: number; permissionOverwrites?: { id: string }[] }) => {
                guard(`channel.create:${data.name}`);
                // Ein Recht, das der Bot nicht vergeben darf, kippt das Anlegen - nur @everyone zu sperren geht immer.
                if (data.permissionOverwrites?.some((entry) => entry.id !== id)) guard(`channel.create.rights:${data.name}`);
                made.push(data);
                const channel = addChannel(newId(), data.name, data.parent ?? null, data.type ?? 0);
                channel.overwrites = data.permissionOverwrites ?? [];
                calls.push(`channel.create:${data.name}`);
                return channel;
            },
            edit: async (id: string, data: Record<string, unknown> = {}) => {
                if (!channels.has(id)) throw new Error("Unknown Channel");
                edits.push({ id, ...data });
                calls.push(`channel.edit:${id}`);
            },
            delete: async (id: string) => void (channels.delete(id), calls.push(`channel.delete:${id}`)),
            setPositions: async () => void calls.push("order:channels"),
        },
        emojis: {
            cache: emojis,
            create: async (data: { name: string }) => {
                guard(`emoji.create:${data.name}`);
                const emoji = { id: newId() };
                emojis.set(emoji.id, emoji);
                calls.push(`emoji.create:${data.name}`);
                return emoji;
            },
            edit: async () => undefined,
            delete: async () => undefined,
        },
        stickers: { cache: new Map(), create: async () => ({ id: newId() }), delete: async () => undefined },
        members: {
            // Der Bot darf alles außer das Audit-Log ansehen.
            me: { roles: { highest: roles.get(BOTROLE), botRole: roles.get(BOTROLE) }, permissions: { has: (flag: bigint) => flag !== PermissionFlagsBits.ViewAuditLog } },
            fetch: async (id: string) => {
                const member = members.get(id);
                if (!member) throw new Error("Unknown Member");
                return { id, roles: { add: async (ids: string[]) => void (ids.forEach((role) => member.roles.add(role)), calls.push(`member.add:${id}`)), remove: async () => undefined } };
            },
        },
        bans: { create: async (id: string) => void calls.push(`ban:${id}`) },
        edit: async () => void calls.push("settings"),
        fetchAuditLogs: async () => {
            guard("audit");
            return { entries: new Map([["1", { targetId: "90071992547408401", executor: { username: "Vyrox" }, createdTimestamp: AT }]]) };
        },
    };

    const overwrites = (id: string) => ((channels.get(id)?.overwrites ?? []) as { id: string }[]).map((entry) => entry.id);

    return { guild: guild as unknown as Guild, calls, cards, made, edits, channels, roles, members, overwrites, created: (kind: string, name: string) => calls.filter((call) => call === `${kind}.create:${name}`).length };
}

function Job(ops: IRestoreOp[], done = 0): IRestoreJob {
    return { id: 1, guildId: GUILD, targetGuildId: GUILD, backupId: 7, safetyId: 8, mode: "repair", parts: [...SERVER_PART_IDS], areas: [], status: "running", phase: "server", ops, done, failed: [], report: null, actorId: USER, actorName: "Sarah", channelId: null, messageId: null, startedAt: 0, updatedAt: 0 };
}

/** Abhängigkeiten des Runners, mit Zuordnung im Speicher. stopAt: nach so vielen Schritten „abgebrochen“. */
function Deps(map = new Map<string, string>(), stopAt = Infinity) {
    const saved: Partial<IRestoreJob>[] = [];
    let done = 0;

    const deps: IRunDeps = {
        idMap: (id) => map.get(id),
        remember: async (_kind, oldId, newId) => void map.set(oldId, newId),
        save: async (patch) => {
            saved.push(patch);
            if (patch.done !== undefined) done = patch.done;
        },
        progress: () => undefined,
        cancelled: () => done >= stopAt,
        image: async () => null,
    };

    return { map, saved, deps };
}


async function checkRunner(): Promise<void> {
    console.log("\n  — Schritte abarbeiten —");

    const ROLE_B = "90071992547406001";
    const CAT_B = "90071992547406002";
    const CHAN_B = "90071992547406003";
    const ops: IRestoreOp[] = [
        { kind: "role.create", role: snapRole(ROLE_B, "Moderator", 5) },
        { kind: "channel.create", channel: snapChannel(CAT_B, "TURNIERE", 4, null) },
        { kind: "channel.create", channel: snapChannel(CHAN_B, "regeln", 0, CAT_B) },
        { kind: "overwrites", channelId: CHAN_B, overwrites: [deny(ROLE_B)] },
        { kind: "member.add", userId: USER, roles: [ROLE_B] },
        { kind: "ban", userId: "90071992547408301", reason: "Spam" },
    ];

    const one = LiveServer();
    const first = Deps();
    const result = await RunOps(one.guild, Job(ops), first.deps);
    const newChannel = first.map.get(CHAN_B)!;

    check("Schritte in Reihenfolge, Zuordnung nach jeder Anlage", one.calls.slice(0, 3).join() === "role.create:Moderator,channel.create:TURNIERE,channel.create:regeln" && first.map.has(ROLE_B) && first.map.has(CAT_B), one.calls.join());
    check("Kanal landet in der neuen Kategorie", one.channels.get(newChannel)?.parentId === first.map.get(CAT_B));
    check("Rechte und Mitglied mit der neuen Rollen-ID", one.overwrites(newChannel).includes(first.map.get(ROLE_B)!) && one.members.get(USER)!.roles.has(first.map.get(ROLE_B)!));
    check("Fortschritt nach jedem Schritt gespeichert", first.saved.filter((patch) => patch.done !== undefined).length === ops.length && result === "finished");

    const broken = LiveServer({ "role.create:Moderator": "Missing Permissions" });
    const brokenDeps = Deps();
    const brokenJob = Job(ops);
    const brokenResult = await RunOps(broken.guild, brokenJob, brokenDeps.deps);
    const last = brokenDeps.saved.at(-1)!;
    check("Recht fehlt mitten drin: Schritt in Geht nicht, Rest läuft weiter", brokenResult === "finished" && (last.failed ?? []).length >= 1 && last.done === ops.length && broken.calls.includes("ban:90071992547408301"), JSON.stringify(last.failed));
    check("Verweis auf nicht angelegte Rolle: Rechte ohne sie, Mitglied übersprungen", broken.calls.includes("overwrites:regeln") && broken.overwrites(brokenDeps.map.get(CHAN_B)!).length === 0 && !broken.calls.includes(`member.add:${USER}`));

    const full = LiveServer({ "emoji.create:gg": "Maximum number of emojis reached (50)" });
    const fullDeps = Deps();
    await RunOps(full.guild, Job([{ kind: "emoji.create", emoji: { id: "90071992547406010", name: "gg", animated: false, roles: [], image: "AAAA" } }, { kind: "ban", userId: "90071992547408302", reason: null }]), fullDeps.deps);
    check("Emoji-Platz voll: einzeln gescheitert, Rest läuft", (fullDeps.saved.at(-1)?.failed ?? []).some((entry) => entry.reason.includes("Emoji")) && full.calls.includes("ban:90071992547408302"), JSON.stringify(fullDeps.saved.at(-1)));

    // Review M3: Leeres Thema und Slowmode 0 im Backup setzen zurück, was der Kanal jetzt hat.
    const reset = LiveServer();
    Object.assign(reset.channels.get(TEXT)!, { topic: "Altes Thema", rateLimitPerUser: 30 });
    await RunOps(reset.guild, Job([{ kind: "channel.edit", id: TEXT, channel: snapChannel(TEXT, "allgemein", 0, CATEGORY) }]), Deps().deps);
    const sent = reset.edits.at(-1);
    check("Kanal ändern: leeres Thema und Slowmode 0 aus dem Backup setzen zurück", sent?.topic === "" && sent?.rateLimitPerUser === 0, JSON.stringify(sent));

    // Review M12: Mitglied, dessen Rollen es nicht gibt, steht in „Geht nicht“ statt still wegzufallen.
    const lost = LiveServer();
    const lostDeps = Deps();
    await RunOps(lost.guild, Job([{ kind: "member.add", userId: USER, roles: ["90071992547406099"] }]), lostDeps.deps);
    check("Mitglied ohne vorhandene Rollen: Zeile in Geht nicht", (lostDeps.saved.at(-1)?.failed ?? []).length === 1, JSON.stringify(lostDeps.saved.at(-1)));

    // Review M14: Fallen alle Rollen eines Emojis weg, wird es nicht für alle freigegeben.
    const locked = LiveServer();
    const lockedDeps = Deps();
    await RunOps(locked.guild, Job([{ kind: "emoji.create", emoji: { id: "90071992547406011", name: "vip", animated: false, roles: ["90071992547406098"], image: "AAAA" } }]), lockedDeps.deps);
    check("Emoji nur für Rollen, die es nicht gibt: nicht für alle angelegt, Zeile in Geht nicht", !locked.calls.includes("emoji.create:vip") && (lockedDeps.saved.at(-1)?.failed ?? []).some((entry) => entry.reason.includes("Rolle")), JSON.stringify(lockedDeps.saved.at(-1)));

    const racing = LiveServer();
    const racingDeps = Deps();
    const racingOps: IRestoreOp[] = [ops[2]!, ops[3]!];
    racingDeps.deps.progress = () => {
        // Jemand löscht den gerade angelegten Kanal wieder.
        const id = racingDeps.map.get(CHAN_B);
        if (id) racing.channels.delete(id);
    };
    await RunOps(racing.guild, Job(racingOps), racingDeps.deps);
    check("Gerade angelegter Kanal wird gelöscht: nächster Schritt scheitert einzeln, nichts doppelt", racing.created("channel", "regeln") === 1 && (racingDeps.saved.at(-1)?.failed ?? []).length === 1);

    const twice = LiveServer();
    const shared = new Map<string, string>();
    const before = Deps(shared, 3);
    const stopped = await RunOps(twice.guild, Job(ops), before.deps);
    const after = Deps(shared);
    const resumed = await RunOps(twice.guild, Job(ops, 3), after.deps);
    check("Neustart nach 3 von 6: macht bei 4 weiter, nichts doppelt", stopped === "cancelled" && resumed === "finished" && twice.created("role", "Moderator") === 1 && twice.created("channel", "regeln") === 1 && twice.calls.includes(`member.add:${USER}`));

    const crash = LiveServer();
    const crashMap = new Map<string, string>();
    await RunOps(crash.guild, Job([ops[0]!]), Deps(crashMap).deps);
    await RunOps(crash.guild, Job([ops[0]!]), Deps(crashMap).deps);
    check("Absturz zwischen Anlegen und Speichern: kein zweites Mal angelegt", crash.created("role", "Moderator") === 1);

    const cancel = LiveServer();
    const cancelDeps = Deps(new Map(), 2);
    const cancelled = await RunOps(cancel.guild, Job(ops), cancelDeps.deps);
    check("Abbrechen: bleibt, was gemacht ist", cancelled === "cancelled" && cancelDeps.saved.at(-1)?.status === "cancelled" && cancelDeps.saved.filter((patch) => patch.done !== undefined).at(-1)?.done === 2);
}

/** Der Dienst mit Aufträgen und Zuordnung im Speicher. */
function ServiceWith(server: ReturnType<typeof LiveServer>, jobs: IRestoreJob[], rows: [string, string][] = []) {
    const store = new Map(jobs.map((job) => [job.id, { ...job }]));
    const settings = new Map<string, object>();
    let next = 100;
    const client = {
        config: { GUILD_MEMBER_INTENT: true },
        server: { BaseURL: "https://bot.example" },
        guilds: { cache: new Map([[GUILD, server.guild]]) },
        moduleSettings: {
            Of: async (guildId: string, module: string, fallback: object) => settings.get(`${guildId}:${module}`) ?? fallback,
            Save: async (guildId: string, module: string, config: object) => void settings.set(`${guildId}:${module}`, config),
        },
        antiVillainService: {
            Settings: async () => ({ logChannelId: TEXT, quarantine: { roleId: QROLE, channelId: QCH }, bait: { roleId: null, channelId: BAIT } }),
            quarantine: { locked: [] as string[], OnChannelCreate: async function (this: { locked: string[] }, channel: { id: string }) { this.locked.push(channel.id); } },
        },
        avCases: { Open: async () => [{ userId: HELD }] },
        avDebris: { Between: async (_guildId: string, from: number, to: number) => DEBRIS.filter((row) => row.at >= from && row.at <= to) },
        tickets: { OpenOfGuild: async () => [] },
        dashboardService: { GuildAllowed: async (userId: string) => userId !== STRANGER, ShopAccess: async () => ({ allowed: false, reason: NO_ACCESS }) },
        tempVoices: { OfGuild: async () => [] },
        applySubmissions: { ChannelsOf: async () => [] },
        serverRestores: {
            Running: async (guildId?: string) => [...store.values()].filter((job) => job.status === "running" && (!guildId || job.guildId === guildId || job.targetGuildId === guildId)),
            Get: async (id: number) => store.get(id) ?? null,
            Create: async (job: Omit<IRestoreJob, "id">) => {
                const id = next++;
                store.set(id, { ...job, id });
                return id;
            },
            Save: async (id: number, patch: Partial<IRestoreJob>) => void store.set(id, { ...store.get(id)!, ...patch }),
        },
        serverIdMap: {
            Of: async () => new Map(rows),
            Add: async (_guildId: string, _kind: string, oldId: string, newId: string) => void rows.push([oldId, newId]),
        },
    };

    return { store, client: client as unknown as BotClient, service: new ServerBackupService(client as unknown as BotClient) };
}

async function checkRunnerService(): Promise<void> {
    console.log("\n  — Aufträge, Sperre, Fortsetzen —");

    const ROLE_B = "90071992547406001";
    const CHAN_B = "90071992547406003";
    const ops: IRestoreOp[] = [
        { kind: "role.create", role: snapRole(ROLE_B, "Moderator", 5) },
        { kind: "channel.create", channel: snapChannel("90071992547406002", "TURNIERE", 4, null) },
        { kind: "channel.create", channel: snapChannel(CHAN_B, "regeln", 0, "90071992547406002") },
        { kind: "overwrites", channelId: CHAN_B, overwrites: [deny(ROLE_B)] },
        { kind: "member.add", userId: USER, roles: [ROLE_B] },
        { kind: "ban", userId: "90071992547408301", reason: "Spam" },
    ];

    // Vor dem Neustart: 3 von 6 Schritten, Zuordnung schon gespeichert.
    const server = LiveServer();
    const map = new Map<string, string>();
    await RunOps(server.guild, Job(ops), Deps(map, 3).deps);

    const { store, service } = ServiceWith(server, [Job(ops, 3)], [...map]);
    const lock = await service.Lock(GUILD);
    const started = await service.Resume();
    await service.Run(store.get(1)!);

    check("Ein Laden je Server: läuft einer, ist der Server gesperrt", lock?.id === 1);
    check("Neustart nach 3 von 6 Schritten: neuer Dienst macht bei 4 weiter, nichts doppelt", started === 1 && store.get(1)!.done === 6 && server.created("role", "Moderator") === 1 && server.calls.includes(`member.add:${USER}`), JSON.stringify(store.get(1)));
    check("Danach fertig und nicht mehr gesperrt", store.get(1)!.status === "done" && (await service.Lock(GUILD)) === null);

    const idle = ServiceWith(LiveServer(), [{ ...Job(ops), id: 2 }]);
    const stopped = await idle.service.Cancel(GUILD, USER);
    check("Abbrechen ohne laufenden Lauf: Auftrag abgebrochen", stopped && idle.store.get(2)!.status === "cancelled" && (await idle.service.Lock(GUILD)) === null);

    const busy = ServiceWith(LiveServer(), [{ ...Job(ops), id: 3 }]);
    const running = busy.service.Run(busy.store.get(3)!);
    await busy.service.Cancel(GUILD, USER);
    await running;
    check("Abbrechen mitten im Lauf: hält vor dem nächsten Schritt an", busy.store.get(3)!.status === "cancelled" && busy.store.get(3)!.done < ops.length, JSON.stringify(busy.store.get(3)));
    check("Nichts zum Abbrechen: nein", !(await busy.service.Cancel(GUILD, USER)));

    // Review M6: Nach den Schritten am Server gibt es nichts mehr anzuhalten - dann kein „ok“.
    const late = ServiceWith(LiveServer(), [{ ...Job(ops, ops.length), id: 4, phase: "panels" }]);
    check("Abbrechen nach den Schritten am Server: nein, Auftrag läuft weiter", !(await late.service.Cancel(GUILD, USER)) && late.store.get(4)!.status === "running", JSON.stringify(late.store.get(4)));

    // Review M4: Schreibt die Datenbank einmal nicht, macht der Dienst von selbst weiter statt hängenzubleiben.
    const flaky = ServiceWith(LiveServer(), [{ ...Job(ops, ops.length), id: 5 }]);
    const restores = (flaky.client as unknown as { serverRestores: { Save: (id: number, patch: Partial<IRestoreJob>) => Promise<void> } }).serverRestores;
    const write = restores.Save;
    let broken = true;
    restores.Save = async (id, patch) => {
        if (broken && patch.phase === "bot") {
            broken = false;
            throw new Error("Datenbank weg");
        }

        return write(id, patch);
    };
    (flaky.service as unknown as { retryMs: number }).retryMs = 5;
    await flaky.service.Run(flaky.store.get(5)!);
    await new Promise((resolve) => setTimeout(resolve, 300));
    check("Datenbank-Fehler mitten im Laden: macht von selbst weiter und wird fertig", flaky.store.get(5)!.status === "done", JSON.stringify(flaky.store.get(5)));
}

/* ----------------------------------------------------------
   Task 7: der ganze Ablauf
   ---------------------------------------------------------- */
const AT = Date.UTC(2026, 9, 29, 22, 0);
const DEBRIS: IDebrisRow[] = [
    { kind: "channel", objectId: "90071992547408401", name: "ankündigungen", data: { type: 0 }, members: [], at: AT - 5 * 60_000 },
    { kind: "channel", objectId: "90071992547408402", name: "alt", data: { type: 0 }, members: [], at: AT - 20 * 60_000 },
];

/** Das Admin Dashboard, nachgestellt: Laden beginnen, Bot-Daten, Umschreiben. Dazu der Server jetzt. */
function FakeAdmin(service: ServerBackupService, kind = "schutz"): string[] {
    const calls: string[] = [];
    const meta = { id: 7, kind, createdAt: new Date(AT).toISOString(), guildName: "Server", parts: ["bot", "server"] };
    const fakes = service as unknown as Record<string, unknown>;

    const list = Array.from({ length: 40 }, (_, index) => ({ ...meta, id: 7 + index, kind: index === 0 ? "plan" : "hand", note: null, byName: "Sarah", bytes: 1000, counts: {}, server: Before().counts, parts: index % 3 === 2 ? ["bot"] : ["bot", "server"] }));
    let plan = { enabled: true, every: "tag", weekday: 0, hour: 0, keep: 7, discord: true, risky: true };

    fakes.AskBackups = async (_guild: Guild, _actor: unknown, call: IBackupCall) => {
        const body = (call.body ?? {}) as Record<string, unknown>;

        if (call.method === "GET" && call.path === "") {
            calls.push("list");
            return { status: 200, body: { guildId: GUILD, plan: { plan, next: null, lastOk: null, lastError: null }, backups: list, hand: { used: 4, max: 10 } } };
        }
        if (call.method === "POST" && call.path === "") {
            calls.push(`create:${(body.parts as string[]).join("+")}`);
            return { status: 200, body: { ...list[1], id: 99, note: body.note, parts: body.parts } };
        }
        if (call.method === "PUT" && call.path === "/plan") {
            plan = body as typeof plan;
            calls.push(`plan:discord=${plan.discord}`);
            return { status: 200, body: { plan, next: null, lastOk: null, lastError: null } };
        }

        if (call.method === "POST" && call.path.endsWith("/server")) {
            calls.push("server");
            return String(body.confirm).trim().toLowerCase() === "server" ? { status: 200, body: { safetyId: 8, server: Before(), backup: meta } } : { status: 400, body: { error: "Tipp den Namen des Servers genau so ein: „Server“." } };
        }
        if (call.method === "GET") return { status: 200, body: call.path.includes("/server") ? Before() : meta };
        if (call.path.endsWith("/restore")) {
            calls.push(body.safetyId === 8 && body.confirm === "Server" ? "restore" : "restore ohne vorher");
            return { status: 200, body: { safetyId: 8, areas: [], bot: { reached: true } } };
        }
        if (call.path === "/remap") {
            calls.push("remap");
            return { status: 200, body: { tables: 1, rows: 3 } };
        }
        return { status: 404, body: { error: "Gibt es nicht." } };
    };
    fakes.Snapshot = async () => Now();
    fakes.Panels = async () => ({ reposted: ["Ticket-Panel"], redrawn: [], problems: [] });

    return calls;
}

async function checkFlow(): Promise<void> {
    console.log("\n  — Der ganze Ablauf —");

    const server = LiveServer();
    const { store, service } = ServiceWith(server, []);
    const calls = FakeAdmin(service);
    const actor = { id: USER, name: "Sarah" };
    const input = { guild: server.guild, target: server.guild, actor, backupId: 7, mode: "repair" as const, parts: [...SERVER_PART_IDS], areas: ["level"] };

    const refused = await service.Start({ ...input, confirm: "Falsch" });
    check("Ohne richtigen Namen: kein Auftrag", typeof refused === "string" && refused.startsWith("Tipp den Namen") && store.size === 0, String(refused));

    await service.SaveSettings(server.guild, { logChannelId: TEXT });
    calls.length = 0;

    const job = await service.Start({ ...input, confirm: "Server" });
    if (typeof job === "string") return check("Start mit Namen", false, job);

    const second = await service.Start({ ...input, confirm: "Server" });
    await service.Run(job);
    const done = store.get(job.id)!;
    const lines = done.report?.lines ?? [];

    check("Ein Laden je Server: zweiter Start abgelehnt", typeof second === "string" && second.includes("Gerade"), String(second));
    check("Ablauf: Server, Bot-Daten, umschreiben, Panels, fertig", calls.join() === "server,restore,remap" && done.phase === "done" && done.status === "done" && done.report?.remapped === 3, `${calls.join()} ${done.phase} ${done.status}`);
    check("Panels: Bericht nennt, was neu gesendet wurde", done.report?.reposted.includes("Ticket-Panel") === true, JSON.stringify(done.report));
    check("Sicherheits-Backup: Trümmer aus 10 Minuten davor, ältere nicht", lines.some((line) => line.part === "debris" && line.names.includes("#ankündigungen")) && !lines.some((line) => line.names.includes("#alt")));
    check("Karte im Meldekanal: beim Start gesendet, am Ende bearbeitet", server.cards[0] === "send" && server.cards.at(-1) === "edit" && done.messageId !== null, server.cards.join());

    const shield = await service.Protect(server.guild);
    check("Schutz enthält Festgehaltene und Quarantäne", shield.members.has(HELD) && shield.roles.has(QROLE) && shield.channels.has(QCH) && shield.botTop === 10 && shield.botRoleId === BOTROLE);

    const undo = await service.Undo(server.guild, actor, job.id, "Server");
    if (typeof undo !== "string") await service.Run(undo);
    check("Rückgängig: lädt vorher mit Genau", typeof undo !== "string" && undo.backupId === 8 && undo.mode === "exact" && undo.parts.join() === job.parts.join() && undo.areas.join() === "level", String(undo));

    const parked = ServiceWith(LiveServer(), [{ ...Job([]), id: 9, phase: "remap", areas: ["level"] }]);
    const parkedCalls = FakeAdmin(parked.service);
    await parked.service.Resume();
    await parked.service.Run(parked.store.get(9)!);
    check("Neustart in der Phase remap: läuft genau einmal weiter", parkedCalls.join() === "remap" && parked.store.get(9)!.phase === "done", parkedCalls.join());

    const compared = await service.Compare(server.guild, 7);
    check("Vergleichen: zeigt, was jetzt fehlt", typeof compared !== "string" && compared.some((line) => line.sign === "−" && line.names.includes("@Moderator")), JSON.stringify(compared).slice(0, 200));

    const before = store.size;
    const preview = await service.Preview(server.guild, { target: server.guild, backupId: 7, mode: "exact", parts: [...SERVER_PART_IDS] });
    check("Vorschau ohne Auftrag: Genau zeigt, was verschwindet", typeof preview !== "string" && preview.deletes.includes("#event-november") && store.size === before);

    const ready = service.Readiness(server.guild);
    check("Bereitschaft: fehlendes Recht und Rollen über dem Bot", ready.missing.join() === "Audit-Log ansehen" && ready.aboveBot.join() === "Admin" && ready.intent, JSON.stringify(ready));

    const who = await service.WhoDeleted(server.guild, ["90071992547408401", "1"]);
    const silent = await service.WhoDeleted(LiveServer({ audit: "Missing Access" }).guild, ["90071992547408401"]);
    check("Wer hat gelöscht: aus dem Audit-Log, Fehler still", who.get("90071992547408401")?.name === "Vyrox" && !who.has("1") && silent.size === 0);

    const category = await service.SaveSettings(server.guild, { logChannelId: CATEGORY });
    check("Meldekanal: nur ein Textkanal", category.logChannelId === null && (await service.Settings(GUILD)).logChannelId === null);
}

/* ----------------------------------------------------------
   Task 8: Panels nach dem Laden
   ---------------------------------------------------------- */
async function checkPanels(): Promise<void> {
    console.log("\n  — Panels nach dem Laden —");

    const client = new BotClient();
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const NEW_CHANNEL = "90071992547407101";
    const OLD_ROLE = "90071992547407201";
    const NEW_ROLE = "90071992547407202";
    const sent: string[] = [];
    const edited: string[] = [];
    const deleted: string[] = [];
    // In TEXT stehen Ticket-Panel, Rollen-Panel „Ränge“, Temp-Voice-Panel und die Köder-Warnung. NEW_CHANNEL ist neu und leer.
    const standing = new Set(["m-ticket", "m-role", "m-voice", "m-bait"]);
    const channel = (id: string) => ({
        id,
        isTextBased: () => true,
        messages: {
            fetch: async (messageId: string) => {
                if (id === TEXT && standing.has(messageId)) return { id: messageId, author: { id: BOT }, delete: async () => void (deleted.push(messageId), standing.delete(messageId)) };
                throw Object.assign(new Error("Unknown Message"), { code: 10008 });
            },
        },
    });
    const guild = { id: GUILD, channels: { cache: new Map([[TEXT, channel(TEXT)], [NEW_CHANNEL, channel(NEW_CHANNEL)]]) } } as unknown as Guild;
    const selfRoles = [
        { id: 1, name: "Neu", channelId: NEW_CHANNEL, messageId: "m-gone", buttons: [] },
        { id: 2, name: "Ränge", channelId: TEXT, messageId: "m-role", buttons: [{ roleId: NEW_ROLE }] },
    ];

    Object.defineProperty(client, "user", { configurable: true, value: { id: BOT } });
    loose.databaseService.Bump = () => undefined;
    loose.roleListService.Forget = () => undefined;
    loose.selfRolePanels.OfGuild = async () => selfRoles;
    loose.ticketSettings.Of = async () => ({ panel: { channelId: TEXT, messageId: "m-ticket" } });
    loose.applyService.Settings = async () => ({ panel: { channelId: null, messageId: null } });
    loose.voiceService.Settings = async () => ({ panel: "channel", panelChannelId: TEXT, panelMessageId: "m-voice", hubRoleId: NEW_ROLE });
    loose.teamService.Settings = async () => ({ channelId: null });
    loose.customMessages.OfGuild = async () => [];
    loose.roleLists.OfGuild = async () => [];
    loose.antiVillainService.Settings = async () => ({ bait: { channel: true, channelId: TEXT, messageId: "m-bait", role: false, roleId: null } });
    loose.lookingForService.Settings = async () => ({ panel: { threadId: null, messageId: null } });
    loose.sixMansService.Settings = async () => ({ channelId: null, panelMessageId: null });
    loose.matchups.Announced = async () => [];
    loose.selfRoleService.Panel = async (_guildId: string, id: number) => selfRoles.find((panel) => panel.id === id);
    loose.selfRoleService.Send = async (_guild: Guild, panel: { channelId: string; messageId: string }) => void (panel.channelId === TEXT && standing.has(panel.messageId) ? edited.push("selfrole") : sent.push(`selfrole@${panel.channelId}`));
    loose.ticketService.SendPanel = async (_guild: Guild, channelId: string) => void sent.push(`ticket@${channelId}`);
    loose.voiceService.SendPanel = async () => void sent.push(standing.has("m-voice") ? "voice doppelt" : "voice");

    const report = await AfterServerRestore(client, guild, new Map([[OLD_ROLE, NEW_ROLE]]), null);

    check("Panel in neu angelegtem Kanal: dort neu gesendet", sent.includes(`selfrole@${NEW_CHANNEL}`) && report.reposted.includes("Rollen-Panel „Neu“"), `${sent.join()} ${JSON.stringify(report)}`);
    check("Bestehendes Panel ohne neue IDs: nicht doppelt", !sent.includes(`ticket@${TEXT}`) && !deleted.includes("m-ticket") && !deleted.includes("m-bait"));
    check("Rollen-Panel mit umgeschriebener Rolle: neu gezeichnet", edited.includes("selfrole") && report.redrawn.includes("Rollen-Panel „Ränge“"), JSON.stringify(report));
    check("Panel, das nur neu senden kann: alte Nachricht des Bots weg, dann neu", deleted.includes("m-voice") && sent.includes("voice") && !sent.includes("voice doppelt"), `${deleted.join()} ${sent.join()}`);
    check("Köder-Warnung gehört zu den Panels", (await PanelsOf(client, GUILD)).some((panel) => panel.kind === "bait"));
}

/* ----------------------------------------------------------
   Task 10: Karten und Antworten
   ---------------------------------------------------------- */
type AnyMessage = { components?: readonly unknown[]; allowedMentions?: { parse?: readonly string[] } };

function Tree(message: AnyMessage): unknown[] {
    return (message.components ?? []).map((part) => (part as { toJSON?: () => unknown }).toJSON?.() ?? part);
}

function CountParts(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((sum: number, entry) => sum + CountParts(entry), 0);
    if (!node || typeof node !== "object") return 0;

    const entry = node as { type?: unknown; components?: unknown; accessory?: unknown };

    return (typeof entry.type === "number" ? 1 : 0) + CountParts(entry.components) + CountParts(entry.accessory);
}

/** Alle Texte einer Nachricht, wie sie in Discord stehen. */
function Contents(node: unknown): string {
    if (Array.isArray(node)) return node.map(Contents).filter(Boolean).join("\n");
    if (!node || typeof node !== "object") return "";

    const entry = node as { content?: unknown; label?: unknown; components?: unknown; accessory?: unknown };

    return [typeof entry.content === "string" ? entry.content : "", typeof entry.label === "string" ? entry.label : "", Contents(entry.components), Contents(entry.accessory)].filter(Boolean).join("\n");
}

async function checkCards(): Promise<void> {
    console.log("\n  — Karten und Antworten —");

    const now = Date.UTC(2026, 9, 30, 17, 40);
    const url = "https://bot.example/dashboard/guild/1/backups";
    const meta = (id: number, kind: IBackupMeta["kind"], hoursAgo: number, extra: Partial<IBackupMeta> = {}): IBackupMeta => ({
        id,
        guildName: "RL Nexus Esports",
        kind,
        note: null,
        byName: "Sarah",
        createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
        bytes: 428_000,
        counts: { level: 4800, einstellungen: 12 },
        parts: ["bot", "server"],
        server: { roles: 18, channels: 42, members: 318, emojis: 24, stickers: 0, bans: 17 },
        ...extra,
    });
    const plan = PlanRestore({ backup: Before(), live: Now(), mode: "repair", parts: [...ALL_PARTS], protect, debris: [] });
    const exact = PlanRestore({ backup: Before(), live: Now(), mode: "exact", parts: [...ALL_PARTS], protect, debris: [] });
    const finished: IRestoreJob = { ...Job(plan.ops, plan.ops.length), status: "done", phase: "done", failed: [{ op: 1, reason: "Rolle @Admin: steht über dem Bot" }], report: { lines: plan.lines, reposted: ["Ticket-Panel"], redrawn: [], remapped: 11, problems: [] } };
    const backups = [
        meta(1, "schutz", 15.5, { note: "vor dem Anti-Nuke: Tim: Kanäle löschen" }),
        meta(2, "plan", 17.6),
        meta(3, "hand", 20, { note: "vor dem Umbau der Rollen", parts: ["server"] }),
        meta(4, "plan", 41.6),
        meta(5, "hand", 24 * 6),
    ];
    const strip = Strip(backups, now);
    const cards = {
        running: RunningCard({ job: Job(plan.ops, 3), backupLabel: "Backup von heute 00:00", etaMs: 120_000 }),
        resumed: RunningCard({ job: Job(plan.ops, 3), backupLabel: "Backup von heute 00:00", etaMs: 120_000, resumed: true }),
        done: DoneCard({ job: finished, backupLabel: "Backup von heute 00:00", minutes: 3, dashboardUrl: url }),
        cancelled: DoneCard({ job: { ...finished, status: "cancelled", done: 2 }, backupLabel: "Backup von heute 00:00", minutes: 1, dashboardUrl: url }),
        notice: SafetyNotice({ at: now, who: "Tim", why: "Kanäle löschen", compareUrl: url }),
        failed: AutoFailedCard({ at: now, reason: "Beim Discord-Server fehlen Emojis: Dem Bot fehlt das Recht „Ausdrücke verwalten“.", dashboardUrl: url }),
        created: CreatedReply(meta(9, "hand", 0, { note: "vor dem Turnier" }), 5, 10, url),
        list: ListReply({ backups, page: 0, strip, now }),
        one: BackupReply(meta(2, "plan", 17.6), now),
        compare: CompareReply(DiffSnapshots(Before(), Now()), "heute 00:00", 7),
        confirm: LoadConfirm(exact, "heute 00:00", "exact", 7),
        auto: AutomaticReply({ plan: { enabled: true, every: "tag", weekday: 0, hour: 0, keep: 7, discord: true, risky: true }, next: new Date(now + 5 * 3_600_000).toISOString(), lastOk: new Date(now - 17 * 3_600_000).toISOString(), lastError: null }, url, now),
    };
    const text = (name: keyof typeof cards) => Contents(Tree(cards[name]));
    const ids = (name: keyof typeof cards) => JSON.stringify(Tree(cards[name]));
    const big = Object.entries(cards).filter(([, message]) => CountParts(Tree(message)) > 40);

    check("Jede Karte und Antwort höchstens 40 Bausteine", big.length === 0, big.map(([name, message]) => `${name}: ${CountParts(Tree(message))}`).join(", "));
    check("Keine Pings", Object.values(cards).every((message) => (message.allowedMentions?.parse ?? ["x"]).length === 0));
    const wanted: [keyof typeof cards, string][] = [
        ["running", "⏳ Server wird repariert"],
        ["running", "▰"],
        ["running", "Noch etwa 2 Minuten"],
        ["resumed", "weiter nach Neustart"],
        ["done", "💾 Server repariert"],
        ["done", "Ging nicht"],
        ["done", "Der Stand davor liegt als Sicherheits-Backup bereit"],
        ["done", "1 Panel neu gepostet"],
        ["cancelled", "abgebrochen nach 2 von"],
        ["notice", "🛡️ Gesichert vor dem Anti-Nuke"],
        ["notice", "Tim"],
        ["notice", "bleibt 7 Tage"],
        ["failed", "⚠️ Backup nur halb"],
        ["created", "💾 Backup angelegt"],
        ["created", "5 von 10 Plätzen von Hand belegt"],
        ["created", "42 Kanäle · 18 Rollen"],
    ];
    const missing = wanted.filter(([name, part]) => !text(name).includes(part)).map(([name, part]) => `${name}: ${part}`);

    check("Texte aus dem Entwurf: laufend, fertig, gesichert, nur halb, angelegt", missing.length === 0 && ids("failed").includes("bk:retry"), missing.join(" | "));
    check("Vergleich als diff-Block mit - und +", /```diff\n[\s\S]*^- [\s\S]*^\+ [\s\S]*```/m.test(text("compare")), text("compare").slice(0, 300));
    check("„Rückgängig machen“ nur auf der fertigen Karte", ids("done").includes("bk:undo:1") && text("done").includes("Rückgängig machen") && !ids("running").includes("bk:undo"));
    check("Liste: Reihe mit genau 14 Feldern, drei je Seite, blättern", [...strip.matchAll(/🟦|🟩|🟥|⬛/gu)].length === 14 && strip.endsWith("🟥") && (ids("list").match(/bk:open:/g) ?? []).length === 3 && ids("list").includes("bk:list:1") && text("list").includes("Heute") && text("list").includes("Gestern"), strip);
    check("Ein Backup: zurück zur Liste", ids("one").includes("bk:list:0") && text("one").includes("Zurück zur Liste"));
    check("Laden genau: zeigt, was verschwindet, Knopf zum Laden, Abbrechen", text("confirm").includes("#event-november") && ids("confirm").includes("bk:load:7:exact") && text("confirm").includes("Abbrechen"), text("confirm").slice(0, 300));
    check("Automatisch: drei Schalter", ["bk:auto:enabled", "bk:auto:discord", "bk:auto:risky"].every((id) => ids("auto").includes(id)) && text("auto").includes("🕛 Automatisch sichern") && text("auto").includes("täglich"));

    const server = LiveServer();
    const { service } = ServiceWith(server, []);
    await service.SaveSettings(server.guild, { logChannelId: null });
    await service.SafetyNotice(server.guild, { at: now, why: "Tim: Kanäle löschen", backupId: 42 });
    check("Gesichert vor dem Anti-Nuke: ohne eigenen Meldekanal in den von Anti Villain", server.cards.join() === "send", server.cards.join());
    await service.BackupFailed(server.guild, "Den Discord-Server konnte der Bot nicht lesen.");
    check("Backup nur halb: ohne Meldekanal der Backups keine Karte", server.cards.join() === "send");
    await service.SaveSettings(server.guild, { logChannelId: TEXT });
    await service.BackupFailed(server.guild, "Den Discord-Server konnte der Bot nicht lesen.");
    check("Backup nur halb: in den Meldekanal der Backups", server.cards.join() === "send,send");
}

/* ----------------------------------------------------------
   Task 11: /backup
   ---------------------------------------------------------- */
const STRANGER = "90071992547409979";
const NO_ACCESS = "Für RL Nexus brauchst du einen Zugang aus dem Shop.";

/** Eine Interaktion, die mitschreibt, was der Bot antwortet. */
function Interaction(server: ReturnType<typeof LiveServer>, input: { user?: string; sub?: string; options?: Record<string, string>; customId?: string; modal?: string; focused?: string; manage?: boolean }) {
    const out = { replies: [] as string[], modals: [] as string[], choices: [] as { name: string; value: string }[] };
    const record = async (payload: unknown) => void out.replies.push(Contents(Tree(payload as AnyMessage)));
    const interaction: Record<string, unknown> = {
        guild: server.guild,
        guildId: GUILD,
        customId: input.customId ?? "",
        user: { id: input.user ?? USER, username: "sarah" },
        member: { displayName: "Sarah" },
        memberPermissions: { has: () => input.manage !== false },
        inCachedGuild: () => true,
        deferred: false,
        replied: false,
        isButton: () => input.modal === undefined,
        isModalSubmit: () => input.modal !== undefined,
        options: { getSubcommand: () => input.sub ?? "", getString: (name: string) => input.options?.[name] ?? null, getFocused: () => input.focused ?? "" },
        fields: { getTextInputValue: () => input.modal ?? "" },
        reply: async (payload: unknown) => {
            interaction.replied = true;
            await record(payload);
        },
        update: async (payload: unknown) => {
            interaction.replied = true;
            await record(payload);
        },
        editReply: record,
        followUp: record,
        deferReply: async () => void (interaction.deferred = true),
        deferUpdate: async () => void (interaction.deferred = true),
        showModal: async (modal: { toJSON: () => { custom_id: string } }) => void out.modals.push(modal.toJSON().custom_id),
        respond: async (choices: { name: string; value: string }[]) => void out.choices.push(...choices),
    };

    return { interaction, out };
}

async function checkCommand(): Promise<void> {
    console.log("\n  — /backup —");

    const json = new Backup({} as BotClient).data.toJSON() as { options?: { name: string; options?: { name: string; choices?: { value: string }[] }[] }[]; default_member_permissions?: string | null };
    const names = (json.options ?? []).map((option) => option.name);
    const modes = (json.options ?? []).find((option) => option.name === "laden")?.options?.find((option) => option.name === "modus")?.choices?.map((choice) => choice.value) ?? [];

    check("Sechs Unterbefehle, nur Server verwalten", names.join() === "neu,liste,ansehen,vergleichen,laden,automatisch" && json.default_member_permissions === String(PermissionFlagsBits.ManageGuild), `${names.join()} ${json.default_member_permissions}`);
    check("Anderen Server gibt es im Befehl nicht", modes.join() === "reparieren,genau", modes.join());

    const server = LiveServer();
    const { store, service } = ServiceWith(server, []);
    const calls = FakeAdmin(service);
    const run = async (input: Parameters<typeof Interaction>[1]) => {
        const made = Interaction(server, input);

        if (input.focused !== undefined) await service.OnAutocomplete(made.interaction as unknown as AutocompleteInteraction);
        else if (input.sub) await service.OnCommand(made.interaction as unknown as ChatInputCommandInteraction);
        else await service.OnButton(made.interaction as unknown as ButtonInteraction);

        return made.out;
    };

    calls.length = 0;
    const stranger = await run({ user: STRANGER, sub: "liste" });
    check("Ohne Dashboard-Zugang: Antwort mit Grund, nichts passiert", (stranger.replies[0] ?? "").includes(NO_ACCESS) && calls.length === 0, `${stranger.replies.join()} ${calls.join()}`);

    const auto = await run({ sub: "laden", options: {}, focused: "" });
    // Review M8: Wer den Server nicht verwalten darf, sieht in der Auswahl keine Backups.
    const noManage = await run({ sub: "laden", options: {}, focused: "", manage: false });
    check("Autocomplete ohne „Server verwalten“: keine Backups", noManage.choices.length === 0, JSON.stringify(noManage.choices));
    check("Autocomplete: höchstens 25, lesbar, nur mit Discord-Server", auto.choices.length === 25 && auto.choices[0]!.name.includes("automatisch") && auto.choices.every((choice) => !choice.name.includes("nur Bot")), JSON.stringify(auto.choices.slice(0, 2)));

    const exact = await run({ sub: "laden", options: { backup: "7", modus: "genau" } });
    check("laden genau: zeigt erst, was verschwindet", (exact.replies.at(-1) ?? "").includes("#event-november") && store.size === 0, exact.replies.join(" | ").slice(0, 300));

    const ask = await run({ customId: "bk:load:7:exact" });
    check("Knopf Laden: Fenster für den Servernamen", ask.modals.join() === "bk:confirm:7:exact", ask.modals.join());

    const wrong = await run({ customId: "bk:confirm:7:exact", modal: "Falsch" });
    check("laden ohne Namen: nichts passiert", store.size === 0 && (wrong.replies.at(-1) ?? "").includes("Tipp den Namen"), wrong.replies.join());

    const right = await run({ customId: "bk:confirm:7:repair", modal: " server " });
    const job = [...store.values()][0];
    if (job) await service.Run(job);
    check("laden mit Namen: läuft, Antwort sagt wo", store.size === 1 && job?.mode === "repair" && (right.replies.at(-1) ?? "").includes("Läuft"), right.replies.join());

    calls.length = 0;
    const made = await run({ sub: "neu", options: { notiz: "vor dem Turnier", was: "server" } });
    check("neu: legt mit den gewählten Teilen an", calls[0] === "create:server" && (made.replies.at(-1) ?? "").includes("💾 Backup angelegt"), `${calls.join()} ${made.replies.join()}`);

    const toggled = await run({ customId: "bk:auto:discord" });
    check("automatisch: Schalter speichert und zeigt den neuen Stand", calls.includes("plan:discord=false") && (toggled.replies.at(-1) ?? "").includes("Auch Discord-Server: aus"), `${calls.join()} ${toggled.replies.join()}`);

    const list = await run({ customId: "bk:list:1" });
    check("Liste blättert", (list.replies.at(-1) ?? "").includes("Seite 2 von"), list.replies.join().slice(0, 200));

    const undo = await run({ customId: `bk:undoask:${job?.id}` });
    check("Rückgängig fragt nach dem Namen", undo.modals.join() === `bk:undoconfirm:${job?.id}`, undo.modals.join());
}

/* ----------------------------------------------------------
   Task 12: Bot-Dashboard - Schnittstelle
   ---------------------------------------------------------- */
const API_COOKIE = "gueltig";
const OTHER_GUILD = "90071992547409966";

/** Der Server von oben hinter Fastify, mit Sitzung von Sarah. manage: welche Server sie verwalten darf. */
function ApiWorld(manage: (guildId: string) => boolean = () => true) {
    const server = LiveServer();
    const other = LiveServer({}, OTHER_GUILD);
    const world = ServiceWith(server, []);
    const calls = FakeAdmin(world.service);
    const client = world.client as unknown as Record<string, unknown>;

    (client.guilds as { cache: Map<string, Guild> }).cache.set(OTHER_GUILD, other.guild);
    (server.guild.members as unknown as Record<string, unknown>).cache = new Map([[USER, { id: USER, displayName: "Sarah", user: { id: USER, username: "sarah" } }]]);
    Object.assign(client.dashboardService as object, {
        Session: (cookie?: string) => (cookie === API_COOKIE ? { id: "s", userId: USER, username: "sarah", avatar: null, accessToken: "x", mfa: true, expiresAt: Date.now() + 60_000 } : null),
        CanManage: async (_session: unknown, guildId: string) => manage(guildId),
        Manageable: async () => [
            { id: GUILD, name: "Server" },
            { id: OTHER_GUILD, name: "Zweiter Server" },
            { id: "90071992547409967", name: "Ohne Bot" },
        ],
        Secure: false,
    });
    client.databaseService = { Ready: true };
    client.settings = { Of: async () => ({ modules: ["backups"] }) };
    client.serverBackupService = world.service;

    const instance = fastify({ logger: false });
    const manager = new RouteManager(world.client);

    manager.Register(new DashboardApiBackups(world.client));
    manager.Apply(instance);

    const ask = (method: "GET" | "POST", payload?: unknown, signedIn = true, query = "") =>
        instance.inject({
            method,
            url: `${DASHBOARD_PATH}/api/guild/${GUILD}/backups${query}`,
            headers: { ...(signedIn ? { cookie: `${SESSION_COOKIE}=${API_COOKIE}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
            payload: payload ? JSON.stringify(payload) : undefined,
        });

    return { ...world, calls, ask };
}

async function checkApi(): Promise<void> {
    console.log("\n  — Bot-Dashboard: Schnittstelle —");

    const { store, service, calls, ask } = ApiWorld();
    const parts = ["roles", "channels"];

    check("Ohne Anmeldung 401", (await ask("GET", undefined, false)).statusCode === 401);
    check("Fremder Server 403", (await ApiWorld(() => false).ask("GET")).statusCode === 403);

    const read = await ask("GET");
    const body = (read.statusCode === 200 ? read.json() : {}) as { backups?: unknown[]; server?: { counts: { roles: number }; readiness: { missing: string[] }; settings: { logChannelId: string | null } }; job?: unknown };
    check("Lesen: Backups, Discord-Server mit Bereitschaft und Meldekanal, kein laufendes Laden", read.statusCode === 200 && (body.backups?.length ?? 0) > 0 && body.server?.counts.roles === 4 && body.server.readiness.missing.includes("Audit-Log ansehen") && body.server.settings.logChannelId === null && body.job === null, read.body.slice(0, 300));
    const extra = body.server as { antiVillain?: boolean; channels?: { id: string; name: string }[] } | undefined;
    check("Lesen: ob Anti Villain an ist und die Textkanäle für den Meldekanal", extra?.antiVillain === false && extra.channels?.some((channel) => channel.id === TEXT && channel.name === "allgemein") === true && !extra.channels.some((channel) => channel.id === CATEGORY), JSON.stringify(extra?.channels));

    const detail = await ask("GET", undefined, true, "?backup=7&server=1");
    const seen = (detail.statusCode === 200 ? detail.json() : {}) as { server?: { roles: unknown[] }; changed?: { sign: string; names: string[] }[]; missing?: string[] };
    check("Ein Backup mit Discord-Server: Stand und „Seitdem geändert“", detail.statusCode === 200 && (seen.server?.roles.length ?? 0) > 0 && (seen.changed ?? []).some((line) => line.sign === "−" && line.names.includes("@Moderator")), detail.body.slice(0, 300));
    check("Ein Backup mit Discord-Server: was jetzt fehlt, als IDs für den Kanalbaum", (seen.missing ?? []).includes(MOD_ROLE) && (seen.missing ?? []).includes(RULES) && !(seen.missing ?? []).includes(TEXT), JSON.stringify(seen.missing));

    calls.length = 0;
    const created = await ask("POST", { action: "create", note: "vor dem Turnier", parts: ["server"] });
    check("Anlegen mit Teilen", created.statusCode === 200 && calls[0] === "create:server", `${created.statusCode} ${calls.join()}`);

    const foreign = await ApiWorld((guildId) => guildId === GUILD).ask("POST", { action: "preview", backup: 7, mode: "other", parts, target: OTHER_GUILD });
    check("Anderer Server ohne Verwalten-Recht: 403", foreign.statusCode === 403, foreign.body.slice(0, 200));

    const preview = await ask("POST", { action: "preview", backup: 7, mode: "other", parts, target: OTHER_GUILD });
    check("Vorschau auf den anderen Server: Schritte ohne Auftrag", preview.statusCode === 200 && Array.isArray((preview.json() as { plan?: { lines: unknown[] } }).plan?.lines) && store.size === 0, preview.body.slice(0, 200));

    const targets = await ask("POST", { action: "targets" });
    check("Andere Server: nur verwaltete mit Bot, ohne diesen", targets.statusCode === 200 && JSON.stringify((targets.json() as { targets?: unknown }).targets) === JSON.stringify([{ id: OTHER_GUILD, name: "Zweiter Server" }]), targets.body);

    const wrong = await ask("POST", { action: "restore-server", backup: 7, mode: "repair", parts, areas: [], confirm: "Falsch" });
    check("restore-server ohne Namen: 400, kein Auftrag", wrong.statusCode === 400 && store.size === 0 && wrong.body.includes("Tipp den Namen"), wrong.body.slice(0, 200));

    const right = await ask("POST", { action: "restore-server", backup: 7, mode: "repair", parts, areas: [], confirm: "Server" });
    const job = (right.statusCode === 200 ? right.json() : {}) as { job?: { id: number; mode: string } };
    if (job.job) await service.Run(store.get(job.job.id)!);
    check("restore-server mit Namen: ein Auftrag", right.statusCode === 200 && store.size === 1 && job.job?.mode === "repair", right.body.slice(0, 200));

    const progress = await ask("POST", { action: "job", job: job.job?.id });
    const state = (progress.statusCode === 200 ? progress.json() : {}) as { job?: { done: number; total: number; status: string; progress: { name: string }[]; ops?: unknown } };
    check("job liefert Fortschritt je Teil, ohne die Schritte selbst", progress.statusCode === 200 && state.job?.done === state.job?.total && state.job?.status === "done" && (state.job?.progress.length ?? 0) > 0 && state.job?.ops === undefined, progress.body.slice(0, 200));

    store.set(50, { ...Job([]), id: 50 });
    const twice = await ask("POST", { action: "restore-server", backup: 7, mode: "repair", parts, areas: [], confirm: "Server" });
    check("Zweites restore-server während eines Ladens: 409", twice.statusCode === 409, twice.body.slice(0, 200));

    const cancelled = await ask("POST", { action: "cancel" });
    check("Abbrechen", cancelled.statusCode === 200 && store.get(50)!.status === "cancelled", cancelled.body);

    const saved = await ask("POST", { action: "settings", logChannelId: TEXT });
    check("settings speichert den Meldekanal", saved.statusCode === 200 && (await service.Settings(GUILD)).logChannelId === TEXT, saved.body);

    check("Unbekannte Aktion 400", (await ask("POST", { action: "kaputt" })).statusCode === 400);
}

/* ----------------------------------------------------------
   Abschlussreview: die Korrekturen
   ---------------------------------------------------------- */
async function checkReviewFixes(): Promise<void> {
    console.log("\n  — Abschlussreview —");

    const PRIVATE = "90071992547406201";
    const VOICE = "90071992547406202";
    const create = (id: string, name: string, overwrites: ISnapOverwrite[], extra: Partial<ISnapChannel> = {}): IRestoreOp => ({ kind: "channel.create", channel: snapChannel(id, name, 0, null, overwrites, extra) });

    /* C1: Nach dem Ersetzen der Rechte setzt Anti Villain die Quarantäne-Sperre wieder. */
    {
        const server = LiveServer();
        const relocked: string[] = [];
        const deps = Deps();

        deps.deps.relock = async (channel) => void relocked.push(channel.id);
        await RunOps(server.guild, Job([create(PRIVATE, "privat", [deny(GUILD)]), { kind: "overwrites", channelId: PRIVATE, overwrites: [deny(GUILD)] }]), deps.deps);
        check("C1: Nach dem Ersetzen der Rechte kommt die Quarantäne-Sperre wieder drauf", relocked.includes(deps.map.get(PRIVATE) ?? "?"), relocked.join());

        const wired = ServiceWith(LiveServer(), [{ ...Job([create(PRIVATE, "privat", [deny(GUILD)]), { kind: "overwrites", channelId: PRIVATE, overwrites: [deny(GUILD)] }]), id: 60 }]);
        const quarantine = (wired.client as unknown as { antiVillainService: { quarantine: { locked: string[] } } }).antiVillainService.quarantine;
        FakeAdmin(wired.service);
        await wired.service.Run(wired.store.get(60)!);
        check("C1: Der Dienst ruft dafür Anti Villain", quarantine.locked.length === 1, quarantine.locked.join());
    }

    /* C2: Die Server-ID ist nie eine „alte ID“. */
    {
        const rows: [string, string][] = [[GUILD, "90071992547406299"]];
        const old = ServiceWith(LiveServer(), [{ ...Job([create(GUILD, "general", [])]), id: 61 }], rows);
        FakeAdmin(old.service);
        await old.service.Run(old.store.get(61)!);
        check("C2: Die Server-ID landet nie in der Zuordnung", rows.filter(([oldId]) => oldId === GUILD).length === 1, JSON.stringify(rows));
        check("C2: Eine Zuordnung mit der Server-ID wird nie angewandt", MapSnapshot(Before(), FilterIdMap(new Map(rows), GUILD)).channels.find((channel) => channel.id === TEXT)!.overwrites.length === 1 && !FilterIdMap(new Map(rows), GUILD).has(GUILD));
    }

    /* I1: Zwei Starts zugleich: nur einer. */
    {
        const race = ServiceWith(LiveServer(), []);
        const calls = FakeAdmin(race.service);
        const input = { guild: race.client.guilds.cache.get(GUILD)!, target: race.client.guilds.cache.get(GUILD)!, actor: { id: USER, name: "Sarah" }, backupId: 7, mode: "repair" as const, parts: [...SERVER_PART_IDS], areas: [], confirm: "Server" };
        const results = await Promise.all([race.service.Start(input), race.service.Start(input)]);
        const jobs = results.filter((result): result is IRestoreJob => typeof result !== "string");

        for (const job of jobs) await race.service.Run(job);
        check("I1: Zwei Starts zugleich: einer läuft, der andere wird abgelehnt", jobs.length === 1 && calls.filter((call) => call === "server").length === 1, `${jobs.length} ${calls.join()}`);
    }

    /* I2: Neue Kanäle entstehen mit ihren Rechten. */
    {
        const backup = Snap({ ...Before(), channels: [...Before().channels, snapChannel(PRIVATE, "privat", 0, CATEGORY, [deny(GUILD), deny(R1)])] });
        const plan = PlanRestore({ backup, live: Now(), mode: "repair", parts: ["channels"], protect, debris: [] });
        const op = plan.ops.find(isCreate("privat"));
        check("I2: Neuer Kanal bringt seine Rechte gleich mit, auch ohne den Teil Berechtigungen", op?.kind === "channel.create" && op.channel.overwrites.map((entry) => entry.id).join() === `${GUILD},${R1}`, JSON.stringify(op));

        const server = LiveServer();
        const deps = Deps();
        await RunOps(server.guild, Job([create(PRIVATE, "privat", [deny(GUILD), deny(R1)])]), deps.deps);
        check("I2: Der Kanal ist von Anfang an privat", server.overwrites(deps.map.get(PRIVATE) ?? "?").join() === `${GUILD},${R1}`, server.overwrites(deps.map.get(PRIVATE) ?? "?").join());

        const strict = LiveServer({ "channel.create.rights:privat": "Missing Permissions" });
        const strictDeps = Deps();
        await RunOps(strict.guild, Job([create(PRIVATE, "privat", [deny(GUILD), deny(R1)])]), strictDeps.deps);
        check("I2: Darf der Bot ein Recht nicht vergeben: wenigstens @everyone gesperrt", strict.overwrites(strictDeps.map.get(PRIVATE) ?? "?").join() === GUILD, strict.overwrites(strictDeps.map.get(PRIVATE) ?? "?").join());
    }

    /* I3: Wer während des Ladens festgehalten wird, bekommt keine Rollen zurück. */
    {
        const server = LiveServer();
        const deps = Deps();

        deps.deps.held = async (userId) => userId === USER;
        await RunOps(server.guild, Job([{ kind: "member.add", userId: USER, roles: [R1] }]), deps.deps);
        check("I3: Festgehalten während des Ladens: keine Rollen zurück, steht in Geht nicht", !server.calls.includes(`member.add:${USER}`) && (deps.saved.at(-1)?.failed ?? []).some((entry) => entry.reason.includes("festgehalten")), JSON.stringify(deps.saved.at(-1)));

        const wired = ServiceWith(LiveServer(), [{ ...Job([{ kind: "member.add", userId: USER, roles: [R1] }]), id: 62 }]);
        (wired.client as unknown as { avCases: { Open: () => Promise<{ userId: string }[]> } }).avCases.Open = async () => [{ userId: USER }];
        FakeAdmin(wired.service);
        await wired.service.Run(wired.store.get(62)!);
        check("I3: Der Dienst fragt die offenen Fälle", (wired.store.get(62)!.failed ?? []).some((entry) => entry.reason.includes("festgehalten")), JSON.stringify(wired.store.get(62)!.failed));
    }

    /* I6: „Rückgängig machen“ zeigt erst, was verschwindet. */
    {
        const server = LiveServer();
        const { store, service } = ServiceWith(server, [{ ...Job([]), id: 63, status: "done", phase: "done" }]);
        FakeAdmin(service);
        const made = Interaction(server, { customId: "bk:undo:63" });
        await service.OnButton(made.interaction as unknown as ButtonInteraction);
        const reply = made.out.replies.at(-1) ?? "";
        check("I6: Rückgängig zeigt erst die Liste dessen, was verschwindet", made.out.modals.length === 0 && reply.includes("#event-november") && store.size === 1, `${made.out.modals.join()} ${reply.slice(0, 200)}`);

        const next = Interaction(server, { customId: "bk:undoask:63" });
        await service.OnButton(next.interaction as unknown as ButtonInteraction);
        check("I6: Danach erst das Fenster für den Namen", next.out.modals.join() === "bk:undoconfirm:63", next.out.modals.join());
    }

    /* I7: Fehlt ein Recht beim Lesen, fehlt nur dieser Teil. */
    {
        const fake = FakeServer();
        (fake.guild.bans as unknown as Record<string, unknown>).fetch = async () => {
            throw new Error("Missing Permissions");
        };
        (fake.guild.members as unknown as Record<string, unknown>).fetch = async () => {
            throw new Error("Members didn't arrive in time.");
        };
        const partial = await ReadSnapshot(fake.guild, { skipChannels: new Set(), withImages: false, withMembers: true, fetchImage: fake.fetchImage }).catch(() => null);
        check("I7: Ohne Bann-Recht oder Mitgliederliste: Backup ohne diese Teile, mit Grund", partial !== null && partial.bans.length === 0 && partial.members === null && partial.skipped.some((entry) => entry.startsWith("Bans")) && partial.skipped.some((entry) => entry.startsWith("Rollen der Mitglieder")), JSON.stringify(partial?.skipped));

        const broken = ServiceWith(LiveServer(), []);
        FakeAdmin(broken.service);
        (broken.service as unknown as Record<string, unknown>).Snapshot = async () => {
            throw new Error("Missing Access");
        };
        const guild = broken.client.guilds.cache.get(GUILD)!;
        const result = await broken.service.Start({ guild, target: guild, actor: { id: USER, name: "Sarah" }, backupId: 7, mode: "repair", parts: [...SERVER_PART_IDS], areas: [], confirm: "Server" }).catch((error: unknown) => error);
        check("I7: Kann der Bot den Server beim Start nicht lesen: ein Satz statt eines Absturzes", typeof result === "string", String(result));
    }

    /* I8: Bitrate über der Boost-Stufe wird gekürzt statt zu scheitern. */
    {
        const server = LiveServer();
        const deps = Deps();
        await RunOps(server.guild, Job([{ kind: "channel.create", channel: snapChannel(VOICE, "Stream-Lounge", 2, null, [], { bitrate: 384_000 }) }]), deps.deps);
        check("I8: Sprachkanal mit zu hoher Bitrate: angelegt, Bitrate gekürzt", server.made.some((data) => data.name === "Stream-Lounge" && data.bitrate === 96_000), JSON.stringify(server.made));
    }
}

async function main(): Promise<void> {
    console.log("\n💾  Backups für den Discord-Server\n");

    checkIdMap();
    await checkSnapshot();
    checkPlan();
    await checkRunner();
    await checkRunnerService();
    await checkFlow();
    await checkPanels();
    await checkCards();
    await checkCommand();
    await checkApi();
    await checkReviewFixes();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
