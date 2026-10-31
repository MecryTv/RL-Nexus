/**
 * Prüft Anti Villain ohne Discord: Einstellungen, Verdachtspunkte, Wächter,
 * Festhalten, Karten, Köder, Raid, Anti-Nuke und das Sicherheits-Backup.
 *
 *   npm run check:antivillain
 *
 * Ob ein gekaperter Account wirklich festgehalten wird, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { AuditLogEvent, ButtonInteraction, ChannelType, Guild, GuildBasedChannel, GuildMember, GuildAuditLogsEntry, Message, PermissionFlagsBits, Role, StringSelectMenuInteraction, UserContextMenuCommandInteraction } from "discord.js";
import HackReport from "../commands/user/HackReport";
import BotClient from "../client/BotClient";
import { IAntiVillainSettings, IAvCase, IDebris, INukeState, IRaidState } from "../interfaces/services/antivillain/IAntiVillain";
import { IDebrisRow } from "../interfaces/services/serverbackup/IServerBackup";
import AntiVillainPrune from "../runnables/AntiVillainPrune";
import TaskTypes from "../enums/TaskTypes";
import { BaitCard, ChannelNotice, DecidedCard, DeletedView, HoldCard, NukeCard, PersonCard, RaidCard } from "../builder/AntiVillainView";
import { ModerationError } from "../services/ModerationService";
import { DefaultAntiVillainSettings, GUARDS, LEVELS } from "../constants/AntiVillain";
import { IsModule } from "../constants/Modules";
import { ScoreBook, Verdict } from "../services/antivillain/Score";
import { EveryoneAttempt, Fingerprints, HopTracker, IsSleeper, NameSimilarity, NormalizeName, ScamLinks } from "../services/antivillain/Guards";
import { AVATAR_SAME, AvatarHash, HasQr, HashDistance } from "../services/antivillain/Images";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import path from "node:path";
import fastify from "fastify";
import RouteManager from "../handler/RouteManager";
import DashboardApiAntiVillain from "../routes/DashboardApiAntiVillain";
import DashboardApiAntiVillainRaid from "../routes/DashboardApiAntiVillainRaid";
import { DASHBOARD_PATH, SESSION_COOKIE } from "../constants/Dashboard";

const GUILD = "90071992547409961";
const TEXT = "90071992547409962";
const ROLE = "90071992547409963";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) => ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)]]) },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Stammspieler" } as Role], [GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
    } as unknown as Guild;
}

/* ----------------------------------------------------------
   Task 1: Vorgaben und Einstellungen
   ---------------------------------------------------------- */
function checkDefaults(): void {
    console.log("\n  — Vorgaben —");

    const base = DefaultAntiVillainSettings();

    check("Modul-ID ist bekannt", IsModule("anti-villain"));
    check("Ab Werk Normal: melden 40, festhalten 70", base.level === "normal" && LEVELS.normal.report === 40 && LEVELS.normal.hold === 70);
    check("Locker hält nie fest", LEVELS.locker.report === 40 && LEVELS.locker.hold === null);
    check("Streng: melden 30, festhalten 50", LEVELS.streng.report === 30 && LEVELS.streng.hold === 50);
    check(
        "Punkte wie in der Spec",
        JSON.stringify(Object.fromEntries(GUARDS.map((guard) => [guard.id, guard.points]))) ===
            JSON.stringify({ hop: 50, scam: 40, qr: 40, lookalike: 60, everyone: 30, report: 25, fresh: 20, sleeper: 20, bait: 100 }),
        JSON.stringify(GUARDS.map((guard) => [guard.id, guard.points]))
    );
    check("Alle Wächter ab Werk an", Object.values(base.guards).every(Boolean) && Object.keys(base.guards).length === GUARDS.length);
    check(
        "Anti-Nuke-Grenzen ab Werk",
        JSON.stringify(base.nuke.limits) === JSON.stringify({ channelDelete: 3, roleDelete: 3, banKick: 5, webhook: 2, botAdd: 1, everyonePerms: 1 }),
        JSON.stringify(base.nuke.limits)
    );
    check("Raid ab Werk: 10 Beitritte, 15 Minuten, Verifizierung aus", base.raid.joins === 10 && base.raid.endMinutes === 15 && base.raid.verification === false);
    check("Quarantäne ab Werk: Rollen ab, letzte Stunde, DM, nur das Team", base.quarantine.stripRoles && base.quarantine.cleanup === 60 && base.quarantine.dm && base.quarantine.release === "team");
    check("Köder-Kanal an, Köder-Rolle aus, Team nur melden", base.bait.channel && !base.bait.role && base.team === "report");
}

function checkSettings(client: BotClient): void {
    console.log("\n  — Einstellungen säubern —");

    const service = client.antiVillainService;
    const guild = FakeGuild();
    const base = DefaultAntiVillainSettings();
    const high = service.Clean(guild, { nuke: { limits: { channelDelete: 99, roleDelete: 0 } }, raid: { joins: 500, endMinutes: 0 } }, base);
    const low = service.Clean(guild, { raid: { joins: 1 } }, base);

    check("Grenzen über 20 werden 20", high.nuke.limits.channelDelete === 20, String(high.nuke.limits.channelDelete));
    check("Grenzen unter 1 werden 1", high.nuke.limits.roleDelete === 1, String(high.nuke.limits.roleDelete));
    check("Fehlende Grenzen bleiben", high.nuke.limits.banKick === 5);
    check("Raid-Beitritte geklemmt auf 5 bis 50", high.raid.joins === 50 && low.raid.joins === 5, `${high.raid.joins} · ${low.raid.joins}`);
    check("Raid-Ende mindestens eine Minute", high.raid.endMinutes >= 1, String(high.raid.endMinutes));

    const mixed = service.Clean(guild, { trustedRoles: [ROLE, "123", GUILD], logChannelId: "999", level: "extrem", guards: { qr: false, unbekannt: true } }, base);

    check("Unbekannte und @everyone fallen aus den Rollen", JSON.stringify(mixed.trustedRoles) === JSON.stringify([ROLE]), JSON.stringify(mixed.trustedRoles));
    check("Unbekannter Kanal wird null", mixed.logChannelId === null);
    check("Unbekannte Stufe bleibt bei der alten", mixed.level === "normal");
    check("Wächter einzeln aus, unbekannte fallen weg", mixed.guards.qr === false && !("unbekannt" in mixed.guards));
    check("Ohne Angabe bleibt alles", JSON.stringify(service.Clean(guild, {}, base)) === JSON.stringify(base));
}

/* ----------------------------------------------------------
   Task 2: Verdachtspunkte
   ---------------------------------------------------------- */
function checkScore(): void {
    console.log("\n  — Verdachtspunkte —");

    const t = 1_800_000_000_000;
    const MIN = 60_000;
    const book = new ScoreBook();
    const k = `${GUILD}:1`;

    check("Ein Wächter zählt einmal je Stunde", book.Add(k, "scam", "a", t).total === 40 && book.Add(k, "scam", "b", t + MIN).total === 40);
    // Auch ein wiederholter Treffer desselben Wächters ist ein Treffer: Er gibt keine Punkte, hält den Verdacht aber am Leben.
    check("Eine Stunde nach dem letzten Treffer ist alles verfallen", book.Of(k, t + 3_600_001).total === 40 && book.Of(k, t + MIN + 3_600_001).total === 0, String(book.Of(k, t + MIN + 3_600_001).total));

    const keep = new ScoreBook();
    keep.Add(k, "scam", "", t);
    keep.Add(k, "hop", "", t + 50 * MIN);
    check("Ein neuer Treffer hält die alten am Leben", keep.Of(k, t + 70 * MIN).total === 90, String(keep.Of(k, t + 70 * MIN).total));

    const again = new ScoreBook();
    again.Add(k, "scam", "", t);
    check("Nach einer Stunde zählt derselbe Wächter neu", again.Add(k, "scam", "", t + 61 * MIN).total === 80 || again.Of(k, t + 61 * MIN).total === 40);

    const fresh = new ScoreBook();
    check("Neuer Account allein zählt nicht", fresh.Add(k, "fresh", "", t).total === 0);
    check("Neuer Account zählt mit, sobald etwas anderes trifft", fresh.Add(k, "scam", "", t + 1).total === 60, String(fresh.Of(k, t + 1).total));
    check("Treffer tragen Punkte und Grund", fresh.Of(k, t + 1).hits.map((hit) => `${hit.guard}:${hit.points}`).sort().join() === "fresh:20,scam:40");

    const other = new ScoreBook();
    other.Add(`${GUILD}:2`, "bait", "", t);
    check("Personen zählen getrennt", other.Of(k, t).total === 0 && other.Of(`${GUILD}:2`, t).total === 100);
    other.Clear(`${GUILD}:2`);
    check("Leeren setzt auf null", other.Of(`${GUILD}:2`, t).total === 0);

    check("Normal: 69 meldet, 70 hält fest", Verdict(69, "normal", false, "report") === "report" && Verdict(70, "normal", false, "report") === "hold");
    check("Unter 40 nichts", Verdict(39, "normal", false, "same") === "none");
    check("Locker hält nie fest", Verdict(100, "locker", false, "same") === "report");
    check("Streng: 30 meldet, 50 hält fest", Verdict(30, "streng", false, "same") === "report" && Verdict(50, "streng", false, "same") === "hold");
    check("Team ab Werk nur melden", Verdict(100, "normal", true, "report") === "report");
    check("Team wie alle", Verdict(100, "normal", true, "same") === "hold");
}

/* ----------------------------------------------------------
   Task 3: Wächter ohne Bilder
   ---------------------------------------------------------- */
function checkGuards(): void {
    console.log("\n  — Wächter —");

    const t = 1_800_000_000_000;
    const DAY = 86_400_000;
    const hop = new HopTracker();
    const k = `${GUILD}:1`;
    const p = Fingerprints({ content: "Hey, Steam verschenkt gerade Skins: steamcommunlty.com/gift", attachments: [] });

    check("Text gibt einen Fingerabdruck", p.length === 1);
    check("Gleicher Text in 3 Kanälen in 60 s", hop.Note(k, "c1", p, t) === 1 && hop.Note(k, "c2", p, t + 1) === 2 && hop.Note(k, "c3", p, t + 2) === 3);
    check("Derselbe Kanal zählt nicht doppelt", hop.Note(k, "c3", p, t + 3) === 3);
    check("Nach 60 s zählt es neu", hop.Note(k, "c4", p, t + 61_000) === 1);
    check("Andere Person zählt getrennt", hop.Note(`${GUILD}:2`, "c1", p, t) === 1);
    check("Kurzer Text gibt keinen Fingerabdruck", Fingerprints({ content: "gg wp", attachments: [] }).length === 0);

    const image = { size: 48_213, width: 800, height: 600, contentType: "image/png" };
    check("Gleiches Bild unter anderem Namen: gleicher Abdruck", Fingerprints({ content: "", attachments: [image] })[0] === Fingerprints({ content: "", attachments: [{ ...image }] })[0]);
    check("Anderes Bild: anderer Abdruck", Fingerprints({ content: "", attachments: [image] })[0] !== Fingerprints({ content: "", attachments: [{ ...image, size: 48_214 }] })[0]);
    check(
        "Erwähnungen und Leerraum ändern den Abdruck nicht",
        Fingerprints({ content: "<@1> free nitro here now", attachments: [] })[0] === Fingerprints({ content: "<@22>   Free  Nitro here now", attachments: [] })[0]
    );

    check("Bekannte Betrugsdomain", ScamLinks("hol dir https://steamcommunlty.com/gift/123").includes("steamcommunlty.com"), JSON.stringify(ScamLinks("hol dir https://steamcommunlty.com/gift/123")));
    check("Nachgemacht: dlscord.gg ohne https", ScamLinks("dlscord.gg/nitro").length === 1, JSON.stringify(ScamLinks("dlscord.gg/nitro")));
    check("Nachgemacht mit Unterdomain", ScamLinks("https://gift.discorcl.com/x").length === 1);
    check("Echte Domains nie", ScamLinks("https://discord.com/channels/1 https://steamcommunity.com/id/x https://rocketleague.com https://www.epicgames.com").length === 0);
    check("Fremde, harmlose Domains nicht", ScamLinks("https://youtube.com/watch?v=1 https://rl.tracker.network").length === 0);
    check("Punycode zählt", ScamLinks("https://xn--dscord-6ve.com").length === 1);

    check("@everyone ohne Recht", EveryoneAttempt("@everyone schaut mal", false) && EveryoneAttempt("hey @here", false));
    check("@everyone mit Recht nicht", !EveryoneAttempt("@everyone", true));
    check("Ohne @everyone nichts", !EveryoneAttempt("everyone schaut mal", false));

    check("Tlm | Admin ist Tim sehr ähnlich", NameSimilarity(NormalizeName("Tlm | Admin"), NormalizeName("Tim")) >= 0.85, String(NameSimilarity(NormalizeName("Tlm | Admin"), NormalizeName("Tim"))));
    check("Sarah und 5arah sind gleich", NameSimilarity(NormalizeName("5arah"), NormalizeName("Sarah")) >= 0.85);
    check("Nico und Lara nicht", NameSimilarity(NormalizeName("Nico"), NormalizeName("Lara")) < 0.85);
    check("Timo und Tim (normaler anderer Name) nicht", NameSimilarity(NormalizeName("Timothy"), NormalizeName("Tim")) < 0.85);

    check("Schläfer: 91 Tage still", IsSleeper(t - 91 * DAY, t));
    check("Kein Schläfer: 10 Tage", !IsSleeper(t - 10 * DAY, t));
    check("Ohne Daten kein Schläfer", !IsSleeper(null, t));
}

/* ----------------------------------------------------------
   Task 4: Wächter mit Bildern
   ---------------------------------------------------------- */
const FIXTURES = path.join(process.cwd(), "src", "scripts", "fixtures", "antivillain");
const RANKS = path.join(process.cwd(), "src", "images", "default", "rocketleague", "rlranks");

/** Dasselbe Bild auf size × size gezogen, als PNG. */
async function Scaled(file: string, size: number): Promise<Buffer> {
    const canvas = createCanvas(size, size);

    canvas.getContext("2d").drawImage(await loadImage(file), 0, 0, size, size);

    return canvas.toBuffer("image/png");
}

async function checkImages(): Promise<void> {
    console.log("\n  — Wächter mit Bildern —");

    check("QR-Code wird erkannt", await HasQr(readFileSync(path.join(FIXTURES, "qr.png"))));
    check("Bild ohne QR-Code nicht", !(await HasQr(readFileSync(path.join(FIXTURES, "noqr.png")))));
    check("Kaputtes Bild: kein QR, kein Absturz", !(await HasQr(Buffer.from("kein bild"))));

    const a = readFileSync(path.join(RANKS, "Champion 1.png"));
    const small = await Scaled(path.join(RANKS, "Champion 1.png"), 64);
    // Ein wirklich anderes Bild: Die Rang-Symbole sind sich in Graustufen zu ähnlich, um das zu zeigen.
    const b = readFileSync(path.join(process.cwd(), "src", "dashboard", "public", "assets", "images", "rl-nexus-n-96.png"));
    const near = HashDistance(await AvatarHash(a), await AvatarHash(small));
    const far = HashDistance(await AvatarHash(a), await AvatarHash(b));

    check("Gleiches Bild, anders skaliert: kleiner Abstand", near <= AVATAR_SAME, String(near));
    check("Anderes Bild: großer Abstand", far > AVATAR_SAME, String(far));
    check("Hash hat 16 Hex-Zeichen", /^[0-9a-f]{16}$/.test(await AvatarHash(a)));
}

/* ----------------------------------------------------------
   Task 5: Festhalten und Freigeben
   ---------------------------------------------------------- */
const OWNER = "90071992547409970";
const BOT = "90071992547409971";
const MOD = "90071992547409972";
const USER = "90071992547409973";
const STRANGER = "90071992547409974";
const QROLE = "90071992547409980";
const R1 = "90071992547409981";
const R2 = "90071992547409982";
const BOOST = "90071992547409983";
const HIGH = "90071992547409984";
const QCH = "90071992547409990";
const LOG = "90071992547409991";
const C1 = "90071992547409992";
const C2 = "90071992547409993";
const NEWCH = "90071992547409994";

interface IWorld {
    client: BotClient;
    guild: Guild;
    member: (id: string, roles: string[]) => GuildMember;
    members: Map<string, GuildMember>;
    settings: IAntiVillainSettings;
    cases: Map<number, IAvCase>;
    removed: string[];
    added: string[];
    dms: unknown[];
    sent: { channelId: string; payload: string }[];
    edits: string[];
    deleted: string[];
    overwrites: Record<string, Record<string, boolean>>;
    trust: { userId: string; until: number }[];
    modAuto: { action: string; reason: string }[];
    directBans: string[];
    modules: string[];
}

/** Ein Server mit Rollen, Kanälen und einer Datenbank im Speicher - genug für Quarantäne, Karten und Ablauf. */
function World(): IWorld {
    const client = new BotClient();
    const world = {
        client,
        members: new Map<string, GuildMember>(),
        settings: { ...DefaultAntiVillainSettings(), logChannelId: LOG, quarantine: { ...DefaultAntiVillainSettings().quarantine, roleId: QROLE, channelId: QCH } },
        cases: new Map<number, IAvCase>(),
        removed: [] as string[],
        added: [] as string[],
        dms: [] as unknown[],
        sent: [] as { channelId: string; payload: string }[],
        edits: [] as string[],
        deleted: [] as string[],
        overwrites: {} as Record<string, Record<string, boolean>>,
        trust: [] as { userId: string; until: number }[],
        modAuto: [] as { action: string; reason: string }[],
        directBans: [] as string[],
        modules: ["anti-villain", "moderation"],
    } as IWorld;

    const role = (id: string, position: number, managed = false, name = `rolle-${id.slice(-2)}`) => ({ id, position, managed, name }) as unknown as Role;
    const roles = new Map<string, Role>([
        [GUILD, role(GUILD, 0, false, "@everyone")],
        [R1, role(R1, 2, false, "Stammspieler")],
        [R2, role(R2, 3, false, "Vyrox Main")],
        [BOOST, role(BOOST, 1, true, "Server Booster")],
        [HIGH, role(HIGH, 20, false, "Admin")],
        [QROLE, role(QROLE, 5, false, "Quarantäne")],
        [ROLE, role(ROLE, 4, false, "Stammspieler")],
    ]);
    const channel = (id: string, type = ChannelType.GuildText) =>
        ({
            id,
            type,
            name: `kanal-${id.slice(-2)}`,
            isTextBased: () => true,
            isSendable: () => true,
            send: async (payload: unknown) => {
                world.sent.push({ channelId: id, payload: JSON.stringify(payload) });

                return { id: `m${world.sent.length}`, delete: async () => undefined, edit: async (next: unknown) => void world.edits.push(JSON.stringify(next)) };
            },
            bulkDelete: async (ids: string[]) => void world.deleted.push(...ids),
            messages: { fetch: async () => ({ edit: async (next: unknown) => void world.edits.push(JSON.stringify(next)), delete: async () => undefined }) },
            permissionOverwrites: { edit: async (target: string, perms: Record<string, boolean>) => void (world.overwrites[id] = { ...perms, [`target:${target}`]: true }) },
        }) as unknown as GuildBasedChannel;
    const channels = new Map<string, GuildBasedChannel>([QCH, LOG, C1, C2, TEXT].map((id) => [id, channel(id)]));
    const guild = {
        id: GUILD,
        name: "Dev Server",
        ownerId: OWNER,
        roles: { cache: roles, everyone: roles.get(GUILD) },
        channels: { cache: channels, fetch: async (id: string) => channels.get(id) ?? null },
        members: {
            me: { id: BOT, roles: { highest: { position: 10 } } },
            fetch: async (id: string) => {
                const found = world.members.get(id);
                if (!found) throw new Error("Unknown Member");
                return found;
            },
            ban: async (id: string) => void world.directBans.push(id),
        },
    } as unknown as Guild;

    world.guild = guild;
    world.member = (id: string, ids: string[]) => {
        const cache = new Map(ids.map((rid) => [rid, roles.get(rid)!]));
        const made = {
            id,
            guild,
            displayName: id === USER ? "Nico" : id === MOD ? "Sarah" : "Jemand",
            user: { id, username: id === USER ? "nico_rl" : "jemand", bot: false, createdTimestamp: Date.now() - 1000 * 86_400_000, displayAvatarURL: () => "" },
            permissions: { has: () => false },
            roles: {
                cache,
                remove: async (list: string[] | string) => void world.removed.push(...[list].flat()),
                add: async (list: string[] | string) => void world.added.push(...[list].flat()),
            },
            send: async (payload: unknown) => void world.dms.push(payload),
        } as unknown as GuildMember;

        world.members.set(id, made);
        return made;
    };

    const service = client.antiVillainService as unknown as Record<string, unknown>;
    service.Settings = async () => world.settings;
    service.On = async () => world.modules.includes("anti-villain");

    let next = 1;
    const db = client as unknown as Record<string, Record<string, unknown>>;
    db.avCases.Create = async (input: Omit<IAvCase, "id">) => {
        const made = { ...input, id: next++, status: "open", teamMessageId: null, personMessageId: null, createdAt: Date.now(), closedAt: null, closedBy: null } as IAvCase;
        world.cases.set(made.id, made);
        return { ...made };
    };
    db.avCases.Get = async (id: number) => (world.cases.has(id) ? { ...world.cases.get(id)! } : null);
    db.avCases.Save = async (id: number, patch: Partial<IAvCase>) => void world.cases.set(id, { ...world.cases.get(id)!, ...patch });
    db.avCases.OpenOf = async (guildId: string, userId: string) => [...world.cases.values()].find((c) => c.guildId === guildId && c.userId === userId && c.status === "open") ?? null;
    db.avCases.Open = async (guildId: string) => [...world.cases.values()].filter((c) => c.guildId === guildId && c.status === "open");
    db.avCases.AllOpen = async () => [...world.cases.values()].filter((c) => c.status === "open");
    db.avTrust.Set = async (_guildId: string, userId: string, until: number) => void world.trust.push({ userId, until });
    db.avTrust.Until = async (_guildId: string, userId: string) => world.trust.find((entry) => entry.userId === userId)?.until ?? 0;
    db.avEvents.Add = async () => undefined;
    db.settings.Of = async () => ({ modules: world.modules, moderators: { users: [MOD], roles: [] } });
    db.moderationService.Auto = async (_guild: Guild, request: { action: string; reason: string }) => {
        if (!world.modules.includes("moderation")) throw new ModerationError("Das Modul Moderation ist hier aus");
        world.modAuto.push(request);
        return { number: 12 };
    };
    db.moderationService.IsModerator = async (member: GuildMember) => member.id === MOD;
    client.guilds.cache.set(GUILD, guild);

    return world;
}

async function checkHold(): Promise<void> {
    console.log("\n  — Festhalten —");

    const world = World();
    const av = world.client.antiVillainService;
    const member = world.member(USER, [GUILD, R1, R2, BOOST, HIGH]);
    const now = Date.now();

    av.startedAt = now - 2 * 3_600_000;
    for (let index = 0; index < 3; index++) av.index.Note(GUILD, USER, index < 2 ? C1 : C2, `msg${index}`, now - 60_000 * (index + 1), "Steam verschenkt gerade Skins steamcommunlty.com/gift", []);
    av.index.Note(GUILD, USER, C1, "alt", now - 2 * 3_600_000, "ganz alte Nachricht", []);

    const held = await av.quarantine.Hold(world.guild, member, [{ guard: "hop", points: 50, detail: "4 Kanäle", at: now }], "Kanal-Sprung");
    const row = world.cases.get(held.id)!;

    check("Rollen gemerkt", [...row.savedRoles].sort().join() === [R1, R2].sort().join(), JSON.stringify(row.savedRoles));
    check("Rollen abgenommen, Quarantäne-Rolle dran", [...world.removed].sort().join() === [R1, R2].sort().join() && world.added.includes(QROLE), `${world.removed} · ${world.added}`);
    check("Booster-Rolle bleibt", !world.removed.includes(BOOST));
    check("Rolle über dem Bot bleibt, Fall ist teilweise", !world.removed.includes(HIGH) && row.partial.includes(HIGH), JSON.stringify(row.partial));
    check("Aufräumen: Nachrichten der letzten Stunde gelöscht", world.deleted.length === 3 && !world.deleted.includes("alt"), world.deleted.join());
    check("Gelöschte gespeichert mit Kanal und Text", row.deleted.length === 3 && row.deleted[0].text.includes("steamcommunlty"));
    check("Hinweis nur in Kanälen, in denen gelöscht wurde", world.sent.filter((s) => s.payload.includes("Betrugslink")).map((s) => s.channelId).sort().join() === [C1, C2].sort().join(), world.sent.map((s) => s.channelId).join());
    check("Nachricht im Quarantäne-Kanal", world.sent.some((s) => s.channelId === QCH));
    check("Team-Karte im Meldekanal, ID gemerkt", world.sent.some((s) => s.channelId === LOG) && world.cases.get(held.id)!.teamMessageId !== null);
    check("DM an: Nachricht auch per DM", world.dms.length === 1);

    const fresh = World();
    const avFresh = fresh.client.antiVillainService;
    const many = fresh.member(USER, [GUILD, R1]);

    avFresh.startedAt = Date.now();
    for (let index = 0; index < 25; index++) avFresh.index.Note(GUILD, USER, C1, `m${index}`, Date.now() - 1000 * index, "x".repeat(900), ["bild.png"]);
    const second = await avFresh.quarantine.Hold(fresh.guild, many, [{ guard: "bait", points: 100, detail: "", at: Date.now() }], "Köder");
    const secondRow = fresh.cases.get(second.id)!;

    check("Gelöschte gespeichert: höchstens 20, Text gekürzt, Dateinamen", secondRow.deleted.length === 20 && secondRow.deleted[0].text.length <= 500 && secondRow.deleted[0].files[0] === "bild.png");
    check("Kurz nach dem Start: Karte sagt, dass das Aufräumen nicht vollständig war", fresh.sent.some((s) => s.channelId === LOG && s.payload.includes("nicht vollständig")));
}

async function checkRelease(): Promise<void> {
    console.log("\n  — Freigeben —");

    const world = World();
    const av = world.client.antiVillainService;
    const mod = world.member(MOD, [GUILD]);
    const stranger = world.member(STRANGER, [GUILD]);
    world.member(USER, [GUILD, QROLE]);

    // Ein Fall „von vor dem Neustart“: nur in der Datenbank.
    const made = await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [], timeline: [], savedRoles: [R1, R2], partial: [], deleted: [], incidentId: null });
    (world.guild.roles.cache as Map<string, Role>).delete(R2);

    let refused = "";
    await av.quarantine.Release(world.guild, stranger, made.id, false).catch((error: Error) => void (refused = error.message));
    check("Nur das Team gibt frei", refused === "Das entscheidet das Team.", refused);

    const released = await av.quarantine.Release(world.guild, mod, made.id, false);
    check("Freigeben nach Neustart: Rollen aus der Datenbank, soweit es sie gibt", world.added.join() === R1 && world.removed.includes(QROLE), `${world.added} · ${world.removed}`);
    check("Stand freigegeben, wer und wann", released.status === "released" && released.closedBy === MOD && released.closedAt !== null);

    let twice = "";
    await av.quarantine.Release(world.guild, mod, made.id, false).catch((error: Error) => void (twice = error.message));
    check("Zweimal freigeben geht nicht", twice.length > 0);

    const trusted = await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 70, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    const before = Date.now();
    await av.quarantine.Release(world.guild, mod, trusted.id, true);
    check("War kein Hack: 30 Tage vertraut", world.trust.length === 1 && Math.abs(world.trust[0].until - before - 30 * 86_400_000) < 5_000);

    world.modules = ["moderation"];
    const off = await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 70, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    check("Modul aus: Freigeben geht trotzdem", (await av.quarantine.Release(world.guild, mod, off.id, false)).status === "released");
    world.modules = ["anti-villain", "moderation"];

    const banned = await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [{ guard: "hop", points: 50, detail: "", at: 0 }], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    await av.quarantine.Ban(world.guild, mod, banned.id);
    check("Bannen läuft über die Moderation", world.modAuto[0]?.action === "ban" && world.modAuto[0].reason.startsWith("Anti Villain:"), JSON.stringify(world.modAuto));

    world.modules = ["anti-villain"];
    const direct = await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    await av.quarantine.Ban(world.guild, mod, direct.id);
    check("Moderation aus: direkt gebannt", world.directBans.includes(USER));

    const auto = World();
    auto.settings.quarantine.release = "team-24h";
    auto.member(USER, [GUILD, QROLE]);
    const old = await (auto.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 70, hits: [], timeline: [], savedRoles: [R1], partial: [], deleted: [], incidentId: null });
    const ticked = await auto.client.antiVillainService.quarantine.Tick(Date.now() + 24 * 3_600_000 + 1);
    check("Team-24h: nach 24 Std. von selbst frei", ticked.released.includes(old.id) && auto.cases.get(old.id)!.status === "released");
}

async function checkSetup(): Promise<void> {
    console.log("\n  — Einrichten, neue Kanäle, Wiederkommen —");

    const world = World();
    const av = world.client.antiVillainService;
    const back = world.member(USER, [GUILD]);

    await (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [], timeline: [], savedRoles: [R1], partial: [], deleted: [], incidentId: null });
    await av.quarantine.OnRejoin(back);
    check("Wiederkommen: wieder festgehalten", world.added.includes(QROLE));

    const made = { id: NEWCH, guild: world.guild, type: ChannelType.GuildText, permissionOverwrites: { edit: async (target: string, perms: Record<string, boolean>) => void (world.overwrites[NEWCH] = { ...perms, [`target:${target}`]: true }) } } as unknown as GuildBasedChannel;
    await av.quarantine.OnChannelCreate(made);
    check("Neuer Kanal bekommt die Sperre", world.overwrites[NEWCH]?.ViewChannel === false && world.overwrites[NEWCH]?.[`target:${QROLE}`] === true, JSON.stringify(world.overwrites[NEWCH]));

    const quarantineChannel = { ...made, id: QCH } as unknown as GuildBasedChannel;
    delete world.overwrites[QCH];
    await av.quarantine.OnChannelCreate(quarantineChannel);
    check("Der Quarantäne-Kanal selbst bleibt offen", world.overwrites[QCH] === undefined);
}

/* ----------------------------------------------------------
   Task 6: Karten
   ---------------------------------------------------------- */
/** Bausteine einer Nachricht, so wie Discord sie für die Grenze von 40 zählt. */
function CountParts(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((sum: number, entry) => sum + CountParts(entry), 0);
    if (!node || typeof node !== "object") return 0;

    const entry = node as { type?: unknown; components?: unknown; accessory?: unknown };

    return (typeof entry.type === "number" ? 1 : 0) + CountParts(entry.components) + CountParts(entry.accessory);
}

function Json(message: { components?: readonly unknown[] }): string {
    return JSON.stringify((message.components ?? []).map((part) => (part as { toJSON?: () => unknown }).toJSON?.() ?? part));
}

function checkCards(): void {
    console.log("\n  — Karten —");

    const now = Date.now();
    const base: IAvCase = {
        id: 7,
        guildId: GUILD,
        userId: USER,
        status: "open",
        score: 90,
        hits: [
            { guard: "hop", points: 50, detail: "gleicher Link in 4 Kanälen", at: now },
            { guard: "scam", points: 40, detail: "steamcommunlty.com", at: now },
        ],
        timeline: [],
        savedRoles: [R1, R2, ROLE],
        partial: [],
        deleted: [{ channelId: C1, at: now, text: "Steam verschenkt gerade Skins steamcommunlty.com/gift", files: [] }],
        teamMessageId: null,
        personMessageId: null,
        incidentId: null,
        createdAt: now,
        closedAt: null,
        closedBy: null,
    };
    const hold = HoldCard({ case: base, userName: "nico_rl", avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png", ping: ROLE, dashboardUrl: "https://dash.example/guild/1/anti-villain", partial: [], incomplete: false, mode: "hold", quarantineChannelId: QCH });
    const holdJson = Json(hold);

    check("Festgehalten: Überschrift", holdJson.includes("🔒 Festgehalten"));
    check("Festgehalten: vier Knöpfe", ["av:release:7", "av:trust:7", "av:ban:7", "av:deleted:7"].every((id) => holdJson.includes(id)), holdJson.slice(0, 300));
    check("Festgehalten: Verdachtsbalken und Gründe mit Namen", holdJson.includes("90") && holdJson.includes("Kanal-Sprung") && holdJson.includes("+50"));
    check("Festgehalten: gelöschte Nachricht als Zitat", holdJson.includes(">>> Steam verschenkt"));
    check("Festgehalten: Avatar rechts", holdJson.includes("cdn.discordapp.com/embed/avatars/0.png"));
    check("Festgehalten: Link zur Fallakte", holdJson.includes("https://dash.example/guild/1/anti-villain"));
    check("Festgehalten: Ping-Rolle darf pingen", JSON.stringify(hold.allowedMentions?.roles) === JSON.stringify([ROLE]));

    const partial = Json(HoldCard({ case: base, userName: "nico_rl", avatarUrl: null, ping: null, dashboardUrl: "https://dash.example/x", partial: ["Admin"], incomplete: true, mode: "hold", quarantineChannelId: QCH }));
    check("Teilweise: Karte nennt die Rolle", partial.includes("nur teilweise festgehalten") && partial.includes("Admin"));
    check("Nach Neustart: Aufräumen nicht vollständig", partial.includes("nicht vollständig"));

    const report = Json(HoldCard({ case: { ...base, id: 0 }, userName: "nico_rl", avatarUrl: null, ping: null, dashboardUrl: "https://dash.example/x", partial: [], incomplete: false, mode: "report", quarantineChannelId: null }));
    check("Nur gemeldet: Verdacht statt Festgehalten, Knopf Festhalten", report.includes("👀 Verdacht") && report.includes(`av:holdu:${USER}`) && !report.includes("av:release:"));

    const decided = Json(DecidedCard({ case: { ...base, status: "released", closedBy: MOD }, userName: "nico_rl", by: MOD, restored: 3, dashboardUrl: "https://dash.example/x" }));
    check("Nach dem Klick: grün, keine Knöpfe mehr", decided.includes("✅ Freigegeben") && !decided.includes("av:release:") && decided.includes("3 Rollen zurück"));
    check("Gebannt: eigene Überschrift", Json(DecidedCard({ case: { ...base, status: "banned" }, userName: "n", by: MOD, restored: 0, dashboardUrl: "https://dash.example/x" })).includes("⛔ Gebannt"));

    const person = PersonCard({ caseId: 7, userId: USER, reason: "Von deinem Account kam gerade derselbe Link in 4 Kanälen." });
    const personJson = Json(person);
    check("Für die Person: Ping vor der Karte", personJson.indexOf(`<@${USER}>`) > -1 && personJson.indexOf(`<@${USER}>`) < personJson.indexOf("übernommen"));
    check("Für die Person: drei Anleitungen und „Erledigt“", (personJson.match(/support\.discord\.com/g) ?? []).length === 3 && personJson.includes("av:done:7"));
    check("Für die Person: nur sie wird gepingt", JSON.stringify(person.allowedMentions?.users) === JSON.stringify([USER]));

    check("Im Kanal: ohne Namen", !Json(ChannelNotice()).includes(USER) && Json(ChannelNotice()).includes("Betrugslink"));
    check("Köder-Kanal: Warnung mit Zähler", Json(BaitCard(7)).includes("Bitte hier nichts schreiben") && Json(BaitCard(7)).includes("7 gefangen"));

    const raidState: IRaidState = { incidentId: 3, guildId: GUILD, startedAt: now - 120_000, lastJoin: now, members: Array.from({ length: 23 }, (_, index) => `u${index}`), done: [], invitesUntil: now + 900_000, restore: { slowmode: {}, verification: null } };
    const raid = RaidCard({ state: raidState, ping: ROLE, actions: ["Einladungen pausiert", "Slowmode 30 s in 6 Kanälen", "23 Neue festgehalten"], notable: "19 der 23 Accounts sind jünger als einen Tag", ended: false });
    const raidJson = Json(raid);
    check("Raid: Menü statt Massen-Knöpfe", raidJson.includes("av:raid:3") && raidJson.includes("av:raidend:3") && !raidJson.includes("av:raidban"));
    check("Raid: Zahl der Beitritte", raidJson.includes("23 Beitritte"));

    const nukeState: INukeState = { incidentId: 4, executorId: MOD, action: "channelDelete", count: 4, stopped: true, rolesRemoved: 5, reverted: [], debris: [{ kind: "channel", id: "1", name: "regeln", data: {}, deletedBy: MOD, at: now }], backup: { ok: true, id: 99, at: new Date(now).toISOString() } };
    const nuke = NukeCard({ state: nukeState, executorName: "tim_mod", caseId: 8, ping: { ownerId: OWNER, roleId: ROLE }, dashboardUrl: "https://dash.example/guild/1/anti-villain", backupUrl: "https://dash.example/guild/1/meine-backups?backup=99" });
    const nukeJson = Json(nuke);
    check("Nuke: gestoppt, Backup mit Knopf", nukeJson.includes("Anti-Nuke") && nukeJson.includes("💾") && nukeJson.includes("meine-backups?backup=99"));
    check("Nuke pingt Besitzer und Team", JSON.stringify(nuke.allowedMentions?.users) === JSON.stringify([OWNER]) && JSON.stringify(nuke.allowedMentions?.roles) === JSON.stringify([ROLE]));
    const failed = Json(NukeCard({ state: { ...nukeState, stopped: false, backup: { ok: false, reason: "Backup-Dienst nicht erreichbar" } }, executorName: "tim_mod", caseId: null, ping: { ownerId: OWNER, roleId: null }, dashboardUrl: "https://dash.example/x", backupUrl: null }));
    check("Nuke ohne Backup: Satz statt Knopf", failed.includes("Sicherheits-Backup ging nicht") && !failed.includes("meine-backups"));
    check("Nuke nicht gestoppt: sagt es", failed.includes("Konnte tim_mod nicht stoppen"));

    const deletedView = Json(DeletedView({ ...base, deleted: Array.from({ length: 20 }, (_, index) => ({ channelId: C1, at: now, text: `Nachricht ${index} ${"x".repeat(480)}`, files: ["bild.png"] })) }));
    check("Gelöschte ansehen: Kanal, Text und Datei", deletedView.includes(`<#${C1}>`) && deletedView.includes("Nachricht 0") && deletedView.includes("bild.png"));

    const all = [hold, HoldCard({ case: { ...base, id: 0 }, userName: "n", avatarUrl: null, ping: null, dashboardUrl: "https://dash.example/x", partial: [], incomplete: false, mode: "report", quarantineChannelId: null }), person, ChannelNotice(), BaitCard(7), raid, nuke];
    const worst = Math.max(...all.map((message) => CountParts((message.components ?? []).map((part) => (part as { toJSON: () => unknown }).toJSON()))));
    check("Jede Karte höchstens 40 Bausteine", worst <= 40, String(worst));
}

/* ----------------------------------------------------------
   Task 7: Ablauf bei Nachrichten, Beitritten, Knöpfen
   ---------------------------------------------------------- */
interface IFakeAttachment {
    name: string;
    url: string;
    size: number;
    width: number | null;
    height: number | null;
    contentType: string | null;
}

let messageId = 0;

function FakeMessage(world: IWorld, member: GuildMember, channelId: string, content: string, attachments: IFakeAttachment[] = [], extra: Record<string, unknown> = {}): Message {
    return {
        id: `fm${messageId++}`,
        content,
        guild: world.guild,
        guildId: GUILD,
        channelId,
        channel: world.guild.channels.cache.get(channelId),
        author: member.user,
        member,
        webhookId: null,
        createdTimestamp: Date.now(),
        attachments: new Map(attachments.map((file, index) => [String(index), file])),
        inGuild: () => true,
        ...extra,
    } as unknown as Message;
}

function FlowWorld(): IWorld & { holds: { userId: string; hits: string[] }[]; images: string[]; partial: string[] } {
    const world = World() as IWorld & { holds: { userId: string; hits: string[] }[]; images: string[]; partial: string[] };
    const av = world.client.antiVillainService as unknown as Record<string, unknown>;
    const quarantine = world.client.antiVillainService.quarantine as unknown as Record<string, unknown>;

    world.holds = [];
    world.images = [];
    world.partial = [];
    quarantine.Hold = async (_guild: Guild, member: GuildMember, hits: { guard: string }[]) => {
        world.holds.push({ userId: member.id, hits: hits.map((hit) => hit.guard).sort() });
        return { id: world.holds.length, savedRoles: [], partial: [...world.partial] };
    };
    av.FetchImage = async (url: string) => {
        world.images.push(url);
        return Buffer.from("kein bild");
    };
    av.LastMessage = async () => null;
    (world.guild.members as unknown as { cache: Map<string, GuildMember> }).cache = world.members;

    return world;
}

async function checkFlow(): Promise<void> {
    console.log("\n  — Ablauf —");

    const LINK = "Hey, Steam verschenkt gerade Skins: https://steamcommunlty.com/gift/123";
    const reports = (world: IWorld) => world.sent.filter((entry) => entry.channelId === LOG && entry.payload.includes("👀 Verdacht"));

    const world = FlowWorld();
    const av = world.client.antiVillainService;
    const nico = world.member(USER, [GUILD, R1]);

    await av.OnMessage(FakeMessage(world, nico, C1, LINK));
    check("Erster Betrugslink: melden", reports(world).length === 1 && world.holds.length === 0, `${reports(world).length} · ${world.holds.length}`);
    await av.OnMessage(FakeMessage(world, nico, C2, LINK));
    await av.OnMessage(FakeMessage(world, nico, TEXT, LINK));
    check("Gleicher Link in 3 Kanälen: festgehalten", world.holds.length === 1 && world.holds[0].hits.join() === "hop,scam", JSON.stringify(world.holds));
    check("Auto Mod hat schon bestraft: kein zweiter Moderationsfall", world.modAuto.length === 0);

    const plain = FlowWorld();
    await plain.client.antiVillainService.OnMessage(FakeMessage(plain, plain.member(USER, [GUILD]), C1, "Schaut mal https://youtube.com/watch?v=1 und https://rl.tracker.network"));
    check("Ein normaler Link allein: nichts", plain.holds.length === 0 && reports(plain).length === 0);

    const fresh = FlowWorld();
    const newbie = fresh.member(USER, [GUILD]);
    (newbie.user as unknown as { createdTimestamp: number }).createdTimestamp = Date.now() - 86_400_000;
    await fresh.client.antiVillainService.OnMessage(FakeMessage(fresh, newbie, C1, LINK));
    check("Neuer Account mit Betrugslink: melden, nicht festhalten", reports(fresh).length === 1 && fresh.holds.length === 0 && reports(fresh)[0].payload.includes("Neuer Account"));

    const trusted = FlowWorld();
    trusted.settings.trustedRoles = [ROLE];
    const regular = trusted.member(USER, [GUILD, ROLE]);
    for (const channelId of [C1, C2, TEXT]) await trusted.client.antiVillainService.OnMessage(FakeMessage(trusted, regular, channelId, LINK));
    check("Vertraute Rolle: nur melden", trusted.holds.length === 0 && reports(trusted).length >= 1);

    const vouched = FlowWorld();
    vouched.trust.push({ userId: USER, until: Date.now() + 86_400_000 });
    const known = vouched.member(USER, [GUILD]);
    for (const channelId of [C1, C2, TEXT]) await vouched.client.antiVillainService.OnMessage(FakeMessage(vouched, known, channelId, LINK));
    check("Vertraut nach „War kein Hack“: nur melden", vouched.holds.length === 0 && reports(vouched).length >= 1);

    const bots = FlowWorld();
    const bot = bots.member("90071992547409999", [GUILD]);
    (bot.user as unknown as { bot: boolean }).bot = true;
    for (const channelId of [C1, C2, TEXT]) await bots.client.antiVillainService.OnMessage(FakeMessage(bots, bot, channelId, LINK));
    await bots.client.antiVillainService.OnMessage(FakeMessage(bots, bots.member(USER, [GUILD]), C1, LINK, [], { webhookId: "123" }));
    check("Bots und Webhooks werden nicht geprüft", bots.holds.length === 0 && reports(bots).length === 0);

    const off = FlowWorld();
    off.modules = [];
    const offMember = off.member(USER, [GUILD]);
    for (const channelId of [C1, C2, TEXT]) await off.client.antiVillainService.OnMessage(FakeMessage(off, offMember, channelId, LINK));
    check("Modul aus: nichts", off.holds.length === 0 && reports(off).length === 0);

    const images = FlowWorld();
    const file = (name: string, size = 100_000, side = 800): IFakeAttachment => ({ name, url: `https://cdn.example/${name}`, size, width: side, height: side, contentType: "image/png" });
    await images.client.antiVillainService.OnMessage(
        FakeMessage(images, images.member(USER, [GUILD]), C1, "", [file("a.png"), file("zu-gross.png", 5 * 1024 * 1024), file("zu-breit.png", 100_000, 3000), file("b.png"), file("c.png"), file("d.png")])
    );
    check("QR nur bei Bildern bis 4 MB und 2000 px, höchstens 3", images.images.join() === ["a.png", "b.png", "c.png"].map((name) => `https://cdn.example/${name}`).join(), images.images.join());

    const look = FlowWorld();
    const sarah = look.member(MOD, [GUILD]);
    (sarah as unknown as { displayName: string }).displayName = "Sarah";
    const copy = look.member(STRANGER, [GUILD]);
    (copy as unknown as { displayName: string }).displayName = "5arah | Admin";
    await look.client.antiVillainService.OnJoin(copy);
    check("Doppelgänger beim Beitritt: gemeldet", reports(look).some((entry) => entry.payload.includes("Doppelgänger")), look.sent.map((entry) => entry.channelId).join());
    const before = reports(look).length;
    await look.client.antiVillainService.OnJoin(sarah);
    check("Doppelgänger: das Teammitglied selbst nicht", reports(look).length === before);

    const buttons = FlowWorld();
    const stranger = buttons.member(STRANGER, [GUILD]);
    const replies: string[] = [];
    const press = (customId: string, member: GuildMember) =>
        ({
            customId,
            guild: buttons.guild,
            guildId: GUILD,
            member,
            user: member.user,
            inCachedGuild: () => true,
            isButton: () => true,
            isStringSelectMenu: () => false,
            reply: async (payload: { content?: string }) => void replies.push(payload.content ?? JSON.stringify(payload)),
            deferReply: async () => undefined,
            editReply: async (payload: { content?: string }) => void replies.push(payload.content ?? JSON.stringify(payload)),
        }) as unknown as ButtonInteraction;
    const made = await (buttons.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    await buttons.client.antiVillainService.OnButton(press(`av:release:${made.id}`, stranger));
    check("Fremder klickt Team-Knopf: Das entscheidet das Team.", replies.at(-1) === "Das entscheidet das Team.", replies.join(" | "));
}

/* ----------------------------------------------------------
   Task 8: Köder
   ---------------------------------------------------------- */
async function checkBait(): Promise<void> {
    console.log("\n  — Köder —");

    const BAITROLE = R2;
    const make = () => {
        const world = FlowWorld();
        const events: string[] = [];

        world.settings.bait = { channel: true, channelId: C2, role: true, roleId: BAITROLE, messageId: "pin1" };
        (world.client.avEvents as unknown as Record<string, unknown>).Add = async (_guildId: string, kind: string) => void events.push(kind);
        (world.client.avEvents as unknown as Record<string, unknown>).CountSince = async (_guildId: string, kind: string) => events.filter((entry) => entry === kind).length + 7;

        return world;
    };

    const world = make();
    const deletedMessages: string[] = [];
    const bot = world.member(USER, [GUILD]);
    const message = FakeMessage(world, bot, C2, "hi", [], { delete: async () => void deletedMessages.push("weg") });

    await world.client.antiVillainService.OnMessage(message);
    check("Schreibt in den Köder-Kanal: festgehalten, Nachricht weg", world.holds.length === 1 && world.holds[0].hits.join() === "bait" && deletedMessages.length === 1, JSON.stringify(world.holds));
    check("Zähler der angepinnten Karte steigt", world.edits.some((edit) => edit.includes("8 gefangen")), world.edits.join(" | "));

    const team = make();
    await team.client.antiVillainService.OnMessage(FakeMessage(team, team.member(MOD, [GUILD]), C2, "test", [], { delete: async () => undefined }));
    check("Team im Köder-Kanal: nichts", team.holds.length === 0);

    const role = make();
    const before = role.member(USER, [GUILD]);
    const after = role.member(USER, [GUILD, BAITROLE]);
    await role.client.antiVillainService.OnMemberUpdate(before, after);
    check("Köder-Rolle bekommen: festgehalten", role.holds.length === 1 && role.holds[0].hits.join() === "bait");

    const roleOff = make();
    roleOff.settings.bait.role = false;
    await roleOff.client.antiVillainService.OnMemberUpdate(roleOff.member(USER, [GUILD]), roleOff.member(USER, [GUILD, BAITROLE]));
    check("Köder-Rolle aus: Rolle zählt nicht", roleOff.holds.length === 0);
}

/* ----------------------------------------------------------
   Task 9: „Hack melden“
   ---------------------------------------------------------- */
async function checkReport(): Promise<void> {
    console.log("\n  — Hack melden —");

    const world = FlowWorld();
    const av = world.client.antiVillainService;
    const reports = new Map<string, number>();
    const db = world.client.avReports as unknown as Record<string, unknown>;

    db.Last = async (_guildId: string, target: string, reporter: string) => reports.get(`${target}:${reporter}`) ?? 0;
    db.Note = async (_guildId: string, target: string, reporter: string, at: number) => void reports.set(`${target}:${reporter}`, at);
    db.CountSince = async (_guildId: string, target: string, since: number) => [...reports.entries()].filter(([key, at]) => key.startsWith(`${target}:`) && at >= since).length;

    const target = world.member(USER, [GUILD]);
    const a = world.member(STRANGER, [GUILD]);
    const b = world.member("90071992547409975", [GUILD]);

    check("Meldung zählt", (await av.Report(world.guild, a, target)) === "counted");
    check("Meldung gibt 25 Punkte", av.scores.Of(`${GUILD}:${USER}`, Date.now()).total === 25, String(av.scores.Of(`${GUILD}:${USER}`, Date.now()).total));
    check("Derselbe Melder in 24 h: nicht noch einmal", (await av.Report(world.guild, a, target)) === "again");
    check("Ein anderer Melder: zählt", (await av.Report(world.guild, b, target)) === "counted" && av.scores.Of(`${GUILD}:${USER}`, Date.now()).total === 50, String(av.scores.Of(`${GUILD}:${USER}`, Date.now()).total));
    // Drei frische Zweit-Accounts sollen niemanden festhalten können. Der Melder merkt davon nichts.
    const fresh = world.member("90071992547409976", [GUILD]);
    (fresh.user as unknown as { createdTimestamp: number }).createdTimestamp = Date.now() - 2 * 86_400_000;
    check("Melder jünger als 7 Tage: dieselbe Antwort, aber keine Punkte", (await av.Report(world.guild, fresh, target)) === "counted" && av.scores.Of(`${GUILD}:${USER}`, Date.now()).total === 50 && !reports.has(`${USER}:${fresh.id}`), String(av.scores.Of(`${GUILD}:${USER}`, Date.now()).total));
    check("Sich selbst melden geht nicht", (await av.Report(world.guild, a, a)) === "again");

    world.modules = [];
    check("Modul aus: off", (await av.Report(world.guild, a, b)) === "off");

    const command = new HackReport(world.client);
    const json = command.data.toJSON() as { name: string; type?: number; contexts?: number[] };
    check("Kontextmenü „Hack melden“ an Mitgliedern", json.name === "Hack melden" && json.type === 2, JSON.stringify(json));

    const replies: string[] = [];
    const interaction = {
        guild: world.guild,
        guildId: GUILD,
        member: a,
        targetMember: target,
        targetUser: target.user,
        inCachedGuild: () => true,
        reply: async (payload: { content?: string }) => void replies.push(payload.content ?? ""),
    } as unknown as UserContextMenuCommandInteraction;
    await command.ExecuteUser(interaction);
    check("Modul aus: Satz", replies.at(-1) === "Anti Villain ist auf diesem Server aus.", replies.join(" | "));
}

/* ----------------------------------------------------------
   Task 10: Raid-Schutz
   ---------------------------------------------------------- */
function RaidWorld() {
    const world = FlowWorld();
    const spy = { incident: [] as (Date | null)[], verification: [] as number[], slow: {} as Record<string, number>, kicks: [] as string[], replies: [] as string[], incidents: new Map<number, unknown>() };
    const guild = world.guild as unknown as Record<string, unknown>;

    world.client.config.GUILD_MEMBER_INTENT = true;
    guild.verificationLevel = 1;
    guild.setIncidentActions = async (input: { invitesDisabledUntil: Date | null }) => void spy.incident.push(input.invitesDisabledUntil);
    guild.setVerificationLevel = async (level: number) => void spy.verification.push(level);
    for (const channel of world.guild.channels.cache.values()) {
        const entry = channel as unknown as Record<string, unknown>;
        spy.slow[channel.id] = 5;
        entry.rateLimitPerUser = 5;
        entry.permissionsFor = () => ({ has: () => channel.id !== QCH && channel.id !== LOG });
        entry.setRateLimitPerUser = async (seconds: number) => void (spy.slow[channel.id] = seconds);
    }

    let next = 1;
    const incidents = world.client.avIncidents as unknown as Record<string, unknown>;
    incidents.Create = async (_guildId: string, _kind: string, state: unknown) => {
        spy.incidents.set(next, state);
        return next++;
    };
    incidents.Save = async () => undefined;
    incidents.Running = async () => [];

    const join = async (id: string, at: number) => {
        const member = world.member(id, [GUILD]);
        (member as unknown as Record<string, unknown>).kick = async () => void spy.kicks.push(id);
        await world.client.antiVillainService.raid.OnJoin(member, at);
        return member;
    };

    return { world, spy, join };
}

async function checkRaid(): Promise<void> {
    console.log("\n  — Raid-Schutz —");

    const t = Date.now();
    const { world, spy, join } = RaidWorld();
    const raid = world.client.antiVillainService.raid;

    for (let index = 0; index < 9; index++) await join(`9007199254741${String(index).padStart(4, "0")}`, t + index * 1000);
    check("9 Beitritte: kein Raid", raid.Active(GUILD) === null);
    await join("90071992547410009", t + 9_000);
    check("10 Beitritte in 30 s: Raid", raid.Active(GUILD) !== null);
    check("Einladungen pausiert, höchstens 24 h", spy.incident.length === 1 && spy.incident[0] !== null && spy.incident[0]!.getTime() - (t + 9_000) <= 24 * 3_600_000 + 5_000, String(spy.incident[0]));
    check("Slowmode gesetzt, nur wo @everyone liest", spy.slow[C1] === 30 && spy.slow[LOG] === 5, JSON.stringify(spy.slow));
    check("Verifizierung bleibt, wenn aus", spy.verification.length === 0);
    check("Welle festgehalten, ohne Einzelkarten", world.holds.length === 10 && world.sent.filter((entry) => entry.channelId === LOG && entry.payload.includes("🔒 Festgehalten")).length === 0, `${world.holds.length}`);
    check("Eine Raid-Karte im Meldekanal", world.sent.filter((entry) => entry.channelId === LOG && entry.payload.includes("Raid erkannt")).length === 1);

    await join("90071992547410010", t + 60_000);
    check("Wer bis zum Ende noch kommt, wird auch festgehalten", world.holds.length === 11 && raid.Active(GUILD)!.members.length === 11);

    await raid.CheckEnd(GUILD, t + 60_000 + 14 * 60_000);
    check("Vor 15 Minuten läuft er noch", raid.Active(GUILD) !== null);
    await raid.CheckEnd(GUILD, t + 60_000 + 15 * 60_000 + 1);
    check("Ende 15 min nach dem letzten Beitritt", raid.Active(GUILD) === null);
    check("Slowmode am Ende zurück", spy.slow[C1] === 5, JSON.stringify(spy.slow));
    check("Einladungen am Ende wieder frei", spy.incident.at(-1) === null);

    const verify = RaidWorld();
    verify.world.settings.raid.verification = true;
    await verify.world.client.antiVillainService.raid.Start(verify.world.guild, MOD, t);
    check("Verifizierung hochgesetzt, wenn an", verify.spy.verification.at(-1) === 3);
    await verify.world.client.antiVillainService.raid.End(verify.world.guild, MOD);
    check("Verifizierung am Ende zurück", verify.spy.verification.at(-1) === 1);

    const off = RaidWorld();
    off.world.client.config.GUILD_MEMBER_INTENT = false;
    const cleaned = off.world.client.antiVillainService.Clean(off.world.guild, { raid: { on: true } }, DefaultAntiVillainSettings());
    check("Ohne Members Intent lässt sich Raid nicht einschalten", cleaned.raid.on === false);

    const decide = RaidWorld();
    const mod = decide.world.member(MOD, [GUILD]);
    for (let index = 0; index < 10; index++) await decide.join(`9007199254742${String(index).padStart(4, "0")}`, t + index);
    const state = decide.world.client.antiVillainService.raid.Active(GUILD)!;
    const replies: string[] = [];
    const select = (values: string[]) =>
        ({
            customId: `av:raid:${state.incidentId}`,
            values,
            guild: decide.world.guild,
            guildId: GUILD,
            member: mod,
            user: mod.user,
            inCachedGuild: () => true,
            isButton: () => false,
            isStringSelectMenu: () => true,
            reply: async (payload: { content?: string; components?: unknown[] }) => void replies.push(payload.content ?? JSON.stringify(payload)),
        }) as unknown as StringSelectMenuInteraction;
    await decide.world.client.antiVillainService.OnButton(select(["ban"]));
    check("Alle bannen fragt erst nach", replies.at(-1)!.includes("Wirklich") && replies.at(-1)!.includes(`av:raidconfirm:${state.incidentId}:ban`) && decide.world.modAuto.length === 0, replies.join(" | ").slice(0, 300));
    await decide.world.client.antiVillainService.raid.Decide(decide.world.guild, mod, state.incidentId, "ban");
    check("Bans laufen als Moderationsfälle mit Grund Raid", decide.world.modAuto.length === 10 && decide.world.modAuto.every((entry) => entry.reason.includes("Raid")), String(decide.world.modAuto.length));
    await decide.world.client.antiVillainService.raid.Decide(decide.world.guild, mod, state.incidentId, "ban");
    check("Zweimal bannen bannt niemanden doppelt", decide.world.modAuto.length === 10);
}

/* ----------------------------------------------------------
   Task 11: Anti-Nuke
   ---------------------------------------------------------- */
function NukeWorld() {
    const world = FlowWorld();
    const spy = { risky: [] as string[], webhooks: [] as string[], kicked: [] as string[], everyone: [] as unknown[], incidents: 0 };
    const exec = world.member(MOD, [GUILD, R1]);
    const av = world.client.antiVillainService;
    const incidents = world.client.avIncidents as unknown as Record<string, unknown>;

    Object.defineProperty(world.client, "user", { configurable: true, value: { id: BOT } });
    (exec.roles as unknown as Record<string, unknown>).highest = { position: 3 };
    incidents.Create = async () => ++spy.incidents;
    incidents.Save = async () => undefined;
    av.nuke.onRisky = async (_guild: Guild, executorId: string) => {
        spy.risky.push(executorId);
        return { ok: true, id: 99, at: new Date().toISOString() };
    };
    (world.client as unknown as Record<string, unknown>).fetchWebhook = async (id: string) => ({ delete: async () => void spy.webhooks.push(id) });
    (world.guild.roles as unknown as Record<string, unknown>).everyone = { id: GUILD, setPermissions: async (perms: unknown) => void spy.everyone.push(perms) };
    world.member("90071992547410100", [GUILD]);
    (world.members.get("90071992547410100") as unknown as Record<string, unknown>).kick = async () => void spy.kicked.push("90071992547410100");

    const entry = (action: AuditLogEvent, executorId: string, targetId: string, changes: { key: string; old?: unknown; new?: unknown }[] = []) =>
        ({ action, executorId, targetId, target: { id: targetId, name: changes.find((change) => change.key === "name")?.old ?? targetId }, changes, createdTimestamp: Date.now() }) as unknown as GuildAuditLogsEntry;
    const run = (action: AuditLogEvent, executorId: string, targetId: string, changes: { key: string; old?: unknown; new?: unknown }[] = []) => av.nuke.OnAudit(entry(action, executorId, targetId, changes), world.guild);

    return { world, spy, run, exec };
}

async function checkNuke(): Promise<void> {
    console.log("\n  — Anti-Nuke —");

    const cards = (world: IWorld) => world.sent.filter((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"));
    const { world, spy, run } = NukeWorld();
    const names = ["ankündigungen", "regeln", "turniere", "clips"];

    for (let index = 0; index < 3; index++) await run(AuditLogEvent.ChannelDelete, MOD, `c${index}`, [{ key: "name", old: names[index] }]);
    check("3 Kanäle gelöscht: noch nichts", cards(world).length === 0 && world.holds.length === 0);
    check("Erste riskante Aktion ruft den Backup-Haken, nur einmal", spy.risky.length === 1, String(spy.risky.length));
    await run(AuditLogEvent.ChannelDelete, MOD, "c3", [{ key: "name", old: names[3] }]);
    check("4. Kanal: gestoppt, festgehalten, Karte", cards(world).length === 1 && world.holds.length === 1 && cards(world)[0].payload.includes("gestoppt"), world.sent.map((entry) => entry.payload.slice(0, 60)).join(" | "));
    check("Gelöschte Kanäle als Trümmer aufgehoben", av(world).nuke.Debris(GUILD).map((entry) => entry.name).join() === names.join(), JSON.stringify(av(world).nuke.Debris(GUILD).map((entry) => entry.name)));
    check("Karte zeigt das Sicherheits-Backup", cards(world)[0].payload.includes("💾"));
    await run(AuditLogEvent.ChannelDelete, MOD, "c4", [{ key: "name", old: "lfg" }]);
    check("Gestoppt wird je Person einmal", cards(world).length === 1);

    const exempt = NukeWorld();
    for (const id of [OWNER, BOT]) for (let index = 0; index < 5; index++) await exempt.run(AuditLogEvent.ChannelDelete, id, `x${id}${index}`);
    exempt.world.settings.nuke.trustedBots = ["90071992547410200"];
    for (let index = 0; index < 5; index++) await exempt.run(AuditLogEvent.ChannelDelete, "90071992547410200", `t${index}`);
    check("Besitzer, RL Nexus selbst und vertraute Bots nie", cards(exempt.world).length === 0 && exempt.spy.risky.length === 0);

    const bans = NukeWorld();
    const held = await (bans.world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: "90071992547410300", score: 90, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });
    for (let index = 0; index < 8; index++) await bans.run(AuditLogEvent.MemberBanAdd, MOD, held.userId);
    check("Bans gegen Festgehaltene zählen nicht", cards(bans.world).length === 0);
    (bans.world.client.antiVillainService.raid as unknown as { active: Map<string, IRaidState> }).active.set(GUILD, { incidentId: 1, guildId: GUILD, startedAt: Date.now(), lastJoin: Date.now(), members: Array.from({ length: 8 }, (_, index) => `w${index}`), done: [], invitesUntil: null, restore: { slowmode: {}, verification: null } });
    for (let index = 0; index < 8; index++) await bans.run(AuditLogEvent.MemberBanAdd, MOD, `w${index}`);
    check("Bans gegen die laufende Raid-Welle zählen nicht", cards(bans.world).length === 0);
    for (let index = 0; index < 6; index++) await bans.run(AuditLogEvent.MemberBanAdd, MOD, `fremd${index}`);
    check("6 andere Bans: gestoppt", cards(bans.world).length === 1);

    const hooks = NukeWorld();
    for (let index = 0; index < 3; index++) await hooks.run(AuditLogEvent.WebhookCreate, MOD, `wh${index}`);
    check("Webhook über der Grenze: alle gelöscht", hooks.spy.webhooks.join() === "wh0,wh1,wh2", hooks.spy.webhooks.join());

    const botAdd = NukeWorld();
    await botAdd.run(AuditLogEvent.BotAdd, MOD, "90071992547410099");
    await botAdd.run(AuditLogEvent.BotAdd, MOD, "90071992547410100");
    check("Bot eingeladen über der Grenze: gekickt", botAdd.spy.kicked.includes("90071992547410100"));

    const everyone = NukeWorld();
    await everyone.run(AuditLogEvent.RoleUpdate, MOD, GUILD, [{ key: "permissions", old: "0", new: String(PermissionFlagsBits.Administrator) }]);
    await everyone.run(AuditLogEvent.RoleUpdate, MOD, GUILD, [{ key: "permissions", old: String(PermissionFlagsBits.Administrator), new: String(PermissionFlagsBits.Administrator | PermissionFlagsBits.BanMembers) }]);
    check("@everyone bekommt Administrator: zurückgesetzt", everyone.spy.everyone.length >= 1 && String(everyone.spy.everyone[0]) === "0", JSON.stringify(everyone.spy.everyone.map(String)));
    const harmless = NukeWorld();
    for (let index = 0; index < 3; index++) await harmless.run(AuditLogEvent.RoleUpdate, MOD, GUILD, [{ key: "permissions", old: "0", new: String(PermissionFlagsBits.AttachFiles) }]);
    check("@everyone bekommt harmlose Rechte: nichts", cards(harmless.world).length === 0);

    const high = NukeWorld();
    (high.exec.roles as unknown as Record<string, unknown>).highest = { position: 20 };
    for (let index = 0; index < 4; index++) await high.run(AuditLogEvent.ChannelDelete, MOD, `h${index}`);
    check("Rolle über dem Bot: Karte sagt „Konnte … nicht stoppen“", cards(high.world).some((entry) => entry.payload.includes("nicht stoppen")) && high.world.holds.length === 0);

    const split = NukeWorld();
    split.world.member(STRANGER, [GUILD]);
    for (let index = 0; index < 2; index++) await split.run(AuditLogEvent.ChannelDelete, MOD, `s${index}`);
    for (let index = 0; index < 2; index++) await split.run(AuditLogEvent.ChannelDelete, STRANGER, `t${index}`);
    check("Gezählt wird je Person", cards(split.world).length === 0);
}

const av = (world: IWorld) => world.client.antiVillainService;

/* ----------------------------------------------------------
   Task 12: Sicherheits-Backup
   ---------------------------------------------------------- */
async function checkSafety(): Promise<void> {
    console.log("\n  — Sicherheits-Backup —");

    const make = (answer: { status: number; body: unknown }) => {
        const { world, run } = NukeWorld();
        const calls: { method: string; body: { kind?: string; note?: string } }[] = [];
        const service = world.client.antiVillainService;

        // Ohne Ersatz aus NukeWorld: der echte Haken auf SafetyBackup.
        service.nuke.onRisky = (guild: Guild, executorId: string, why: string) => service.SafetyBackup(guild, `${executorId} ${why}`);
        (service as unknown as Record<string, unknown>).AskBackups = async (_guild: Guild, call: { method: string; body: { kind?: string; note?: string } }) => {
            calls.push(call);
            return answer;
        };

        return { world, run, calls };
    };

    const ok = make({ status: 200, body: { id: 42, createdAt: new Date().toISOString(), kind: "schutz" } });

    await ok.run(AuditLogEvent.ChannelDelete, MOD, "k1", [{ key: "name", old: "regeln" }]);
    check("Erste riskante Aktion: ein Backup mit Grund", ok.calls.length === 1 && ok.calls[0].body.kind === "schutz" && (ok.calls[0].body.note ?? "").startsWith("vor dem Anti-Nuke"), JSON.stringify(ok.calls));
    for (let index = 2; index <= 4; index++) await ok.run(AuditLogEvent.ChannelDelete, MOD, `k${index}`);
    check("Weitere in 10 Minuten: kein neues", ok.calls.length === 1);
    const card = ok.world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
    check("Karte zeigt das Backup mit Knopf", card.includes("💾") && card.includes("meine-backups?backup=42"), card.slice(0, 200));

    const down = make({ status: 502, body: { error: "Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal." } });

    for (let index = 1; index <= 4; index++) await down.run(AuditLogEvent.ChannelDelete, MOD, `d${index}`);
    const downCard = down.world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
    check("Backup-Dienst weg: Nuke stoppt trotzdem, Karte sagt es", down.world.holds.length === 1 && downCard.includes("Sicherheits-Backup ging nicht"), downCard.slice(0, 200));
}

/* ----------------------------------------------------------
   Task 13: Dashboard-Schnittstelle
   ---------------------------------------------------------- */
const API_COOKIE = "gueltig";

/** Der Raid-Server von oben, dazu ein angemeldetes Teammitglied und die beiden Routen hinter Fastify. */
function ApiWorld(canManage = true) {
    const { world } = RaidWorld();
    const client = world.client as unknown as Record<string, Record<string, unknown>>;
    const members = world.guild.members as unknown as Record<string, unknown>;
    const guild = world.guild as unknown as Record<string, unknown>;

    world.member(MOD, [GUILD]);
    // Dem Bot fehlt nur „Webhooks verwalten“, seine Rolle steht auf 10 - „Admin“ (20) liegt darüber.
    members.me = { id: BOT, roles: { highest: { position: 10 } }, permissions: { has: (flag: bigint) => flag !== PermissionFlagsBits.ManageWebhooks } };
    members.cache = world.members;
    guild.emojis = { cache: new Map() };
    (guild.channels as Record<string, unknown>).fetchActiveThreads = async () => null;
    for (const channel of world.guild.channels.cache.values()) (channel as unknown as Record<string, unknown>).isThread = () => false;
    (world.client as unknown as Record<string, unknown>).dashboardService = {
        Session: (cookie?: string) => (cookie === API_COOKIE ? { id: "s", userId: MOD, username: "sarah", avatar: null, accessToken: "x", mfa: true, expiresAt: Date.now() + 60_000 } : null),
        CanManage: async () => canManage,
        Secure: false,
    };
    Object.defineProperty(world.client.databaseService, "Ready", { get: () => true });
    client.avEvents.Recent = async () => [{ id: 1, at: Date.now(), kind: "hold", title: "Nico festgehalten", detail: "Kanal-Sprung" }];
    client.avEvents.CountSince = async () => 3;
    client.moduleSettings.Save = async (_guildId: string, _module: string, value: IAntiVillainSettings) => void (world.settings = value);

    const instance = fastify({ logger: false });
    const manager = new RouteManager(world.client);

    manager.Register(new DashboardApiAntiVillain(world.client));
    manager.Register(new DashboardApiAntiVillainRaid(world.client));
    manager.Apply(instance);

    const ask = (method: "GET" | "POST", payload?: unknown, signedIn = true, suffix = "") =>
        instance.inject({
            method,
            url: `${DASHBOARD_PATH}/api/guild/${GUILD}/anti-villain${suffix}`,
            headers: { ...(signedIn ? { cookie: `${SESSION_COOKIE}=${API_COOKIE}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
            payload: payload ? JSON.stringify(payload) : undefined,
        });

    return { world, ask };
}

async function checkApi(): Promise<void> {
    console.log("\n  — Dashboard-Schnittstelle —");

    const { world, ask } = ApiWorld();
    const create = world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>;

    world.member(USER, [GUILD, QROLE]);
    const first = await create({ guildId: GUILD, userId: USER, score: 90, hits: [{ guard: "hop", points: 50, detail: "4 Kanäle", at: Date.now() }], timeline: [], savedRoles: [R1], partial: [], deleted: [{ channelId: C1, at: Date.now(), text: "steamcommunlty.com/gift", files: [] }], incidentId: null });
    await create({ guildId: GUILD, userId: STRANGER, score: 70, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null });

    check("Ohne Anmeldung 401", (await ask("GET", undefined, false)).statusCode === 401);
    check("Fremder Server 403", (await ApiWorld(false).ask("GET")).statusCode === 403);

    const read = await ask("GET");
    const body = (read.statusCode === 200 ? read.json() : {}) as { lage?: { held: number }; cases?: { id: number; name: string; hits: unknown[] }[]; readiness?: { missing: string[]; aboveBot: string[] }; protocol?: unknown[]; raid?: unknown };

    check("Lesen antwortet 200", read.statusCode === 200, read.body.slice(0, 200));
    check("Ausschalten mit offenen Fällen: Zahl kommt mit", body.lage?.held === 2, JSON.stringify(body.lage));
    check("Fälle mit Namen und Gründen", body.cases?.find((entry) => entry.id === first.id)?.name === "Nico" && body.cases.find((entry) => entry.id === first.id)!.hits.length === 1, JSON.stringify(body.cases?.[0]));
    check("Bereitschaft nennt fehlende Rechte und Rollen über dem Bot", (body.readiness?.missing.includes("Webhooks verwalten") ?? false) && (body.readiness?.aboveBot.includes("Admin") ?? false), JSON.stringify(body.readiness));
    check("Protokoll kommt mit, kein Raid", body.protocol?.length === 1 && body.raid === null);

    const saved = await ask("POST", { action: "save", settings: { ...world.settings, raid: { ...world.settings.raid, joins: 999 } } });
    check("Speichern klemmt Werte", saved.statusCode === 200 && (saved.json() as { settings: IAntiVillainSettings }).settings.raid.joins === 50, saved.body.slice(0, 200));

    const deleted = await ask("POST", { action: "deleted", id: first.id });
    check("Gelöschte Nachrichten eines Falls", deleted.statusCode === 200 && JSON.stringify(deleted.json()).includes("steamcommunlty"), deleted.body.slice(0, 200));

    const released = await ask("POST", { action: "release", id: first.id });
    check("Freigeben über die Route gibt Rollen zurück", released.statusCode === 200 && world.added.includes(R1) && world.cases.get(first.id)!.status === "released", `${released.statusCode} ${released.body.slice(0, 200)}`);
    check("Zweimal freigeben: 400 mit Grund", (await ask("POST", { action: "release", id: first.id })).statusCode === 400);

    const foreign = await create({ guildId: "1234567890123456789", userId: USER, score: 90, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [{ channelId: C1, at: 0, text: "fremd", files: [] }], incidentId: null });
    check("Fall eines anderen Servers bleibt zu", (await ask("POST", { action: "deleted", id: foreign.id })).statusCode === 400 && (await ask("POST", { action: "ban", id: foreign.id })).statusCode === 400);
    check("Unbekannte Aktion 400", (await ask("POST", { action: "kaputt" })).statusCode === 400);

    const thread = await ask("POST", { action: "logthread", forumId: "1234567890123456789" });
    check("Meldungen in ein Forum: unbekanntes Forum sagt es", thread.statusCode === 400 && thread.body.includes("Forum"), thread.body.slice(0, 200));

    const helper = world.member("90071992547409995", [GUILD]);
    (helper.user as unknown as Record<string, unknown>).bot = true;
    const withBots = (await ask("GET")).json() as { bots?: { id: string }[] };
    check("Bots für „vertraute Bots“ kommen mit, Menschen nicht", (withBots.bots ?? []).map((bot) => bot.id).join() === "90071992547409995", JSON.stringify(withBots.bots));

    const started = await ask("POST", { action: "raid-start" });
    check("Raid von Hand starten", started.statusCode === 200 && av(world).raid.Active(GUILD) !== null, started.body.slice(0, 200));

    const banner = await ask("GET", undefined, true, "/raid");
    const light = (banner.statusCode === 200 ? banner.json() : {}) as Record<string, unknown>;
    check("Raid-Balken: leichte Abfrage ohne Fälle", banner.statusCode === 200 && light.raid !== null && light.raid !== undefined && !("cases" in light), banner.body.slice(0, 200));
    // Für die Rückfrage beim Ausschalten: nur die Zahl der Festgehaltenen (STRANGER, USER ist schon frei).
    check("Leichte Abfrage nennt, wie viele festgehalten sind", light.held === 1, banner.body.slice(0, 200));

    await ask("POST", { action: "raid-end" });
    check("Raid beenden", av(world).raid.Active(GUILD) === null);
}

/* ----------------------------------------------------------
   Task 15: Aufräumen
   ---------------------------------------------------------- */
async function checkPrune(): Promise<void> {
    console.log("\n  — Aufräumen —");

    const world = World();
    const service = av(world);
    const now = Date.now();
    const day = 86_400_000;
    const cut: Record<string, number> = {};
    const models = world.client as unknown as Record<string, Record<string, unknown>>;

    for (const model of ["avEvents", "avCases", "avIncidents", "avTrust", "avReports", "avDebris"]) {
        models[model].Prune = async (before: number) => {
            cut[model] = before;
            return 0;
        };
    }

    const debris = (at: number): IDebris => ({ kind: "channel", id: String(at), name: "regeln", data: {}, deletedBy: MOD, at });
    service.nuke.Debris(GUILD, now).push(debris(now - 8 * day), debris(now - day));
    service.nuke.Debris("1234567890123456789", now).push(debris(now - 8 * day));

    await service.Prune(now);

    const kept = (service.nuke as unknown as { debris: Map<string, IDebris[]> }).debris;

    check("Protokoll nach 30 Tagen weg", cut.avEvents === now - 30 * day, String(cut.avEvents));
    check("Abgeschlossene Fälle nach 30 Tagen weg", cut.avCases === now - 30 * day);
    check("Vorfälle samt aufgehobener Trümmer nach 7 Tagen weg", cut.avIncidents === now - 7 * day);
    check("Aufräumen: Trümmer in der Datenbank nach 7 Tagen weg", cut.avDebris === now - 7 * day, String(cut.avDebris));
    check("Abgelaufenes „Vertraut“ weg", cut.avTrust === now);
    check("Meldungen nach 24 Stunden weg", cut.avReports === now - day);
    check("Trümmer im Speicher: alle Server, nach 7 Tagen weg", kept.get(GUILD)?.length === 1 && !kept.has("1234567890123456789"), JSON.stringify([...kept.keys()]));

    const task = new AntiVillainPrune(world.client);
    let ran = 0;

    (service as unknown as Record<string, unknown>).Prune = async () => void ran++;
    Object.defineProperty(world.client.databaseService, "Ready", { get: () => true, configurable: true });
    await task.Execute();
    check("Läuft stündlich als Aufgabe", task.type === TaskTypes.INTERVAL && task.expression === "1h" && ran === 1);
}

/* ----------------------------------------------------------
   Abschlussreview: Funde, die die Tests vorher nicht sahen
   ---------------------------------------------------------- */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const makeCase = (world: IWorld, input: Partial<IAvCase>) =>
    (world.client.avCases.Create as unknown as (input: Partial<IAvCase>) => Promise<IAvCase>)({ guildId: GUILD, userId: USER, score: 90, hits: [], timeline: [], savedRoles: [], partial: [], deleted: [], incidentId: null, ...input });

/* ----------------------------------------------------------
   Plan 32: Trümmer dauerhaft, Sicherheits-Backup mit Server
   ---------------------------------------------------------- */
async function checkDebris(): Promise<void> {
    console.log("\n  — Trümmer und Sicherheits-Backup (Plan 32) —");

    const { world, run } = NukeWorld();
    const nuke = av(world).nuke;
    const debris: IDebrisRow[] = [];
    // Eine gelöschte Rolle, wie discord.js sie im Lösch-Ereignis liefert: Die Mitglieder tragen sie noch in _roles.
    const members = new Map([
        [USER, { id: USER, _roles: [R2] }],
        [MOD, { id: MOD, _roles: [R1] }],
    ]);
    const gone = Object.create(Role.prototype, {
        id: { value: R2 },
        position: { value: 3 },
        color: { value: 0 },
        hoist: { value: false },
        mentionable: { value: false },
        permissions: { value: { bitfield: 0n } },
        guild: { value: { members: { cache: members } } },
    }) as Role;

    (world.client.avDebris as unknown as Record<string, unknown>).Add = async (_guildId: string, row: IDebrisRow) => void debris.push(row);

    nuke.Remember(gone);
    await run(AuditLogEvent.ChannelDelete, MOD, "k1", [{ key: "name", old: "regeln" }]);
    await run(AuditLogEvent.RoleDelete, MOD, R2, [{ key: "name", old: "Vyrox Main" }]);

    const role = debris.find((row) => row.kind === "role");
    check("Gelöschter Kanal steht in der Datenbank", debris.some((row) => row.objectId === "k1" && row.name === "regeln"), JSON.stringify(debris));
    check("Gelöschte Rolle mit ihren Mitgliedern", role?.members.join() === USER && role.data.position === 3 && !("members" in role.data), JSON.stringify(role));

    const make = (answer: { status: number; body: unknown }) => {
        const nuked = NukeWorld();
        const service = nuked.world.client.antiVillainService;
        const calls: { method: string; body: { kind?: string; parts?: string[] } }[] = [];

        service.nuke.onRisky = (guild: Guild, executorId: string, why: string) => service.SafetyBackup(guild, `${executorId} ${why}`);
        (service as unknown as Record<string, unknown>).AskBackups = async (_guild: Guild, call: { method: string; body: { kind?: string; parts?: string[] } }) => {
            calls.push(call);
            return answer;
        };
        (nuked.world.client.avDebris as unknown as Record<string, unknown>).Add = async () => undefined;

        return { ...nuked, calls };
    };

    const both = make({ status: 200, body: { id: 42, createdAt: new Date().toISOString(), kind: "schutz", parts: ["bot", "server"] } });
    const notices: unknown[] = [];
    (both.world.client.serverBackupService as unknown as Record<string, unknown>).SafetyNotice = async (_guild: Guild, input: unknown) => void notices.push(input);
    await both.run(AuditLogEvent.ChannelDelete, MOD, "s1", [{ key: "name", old: "regeln" }]);
    await new Promise((resolve) => setImmediate(resolve));
    check("Sicherheits-Backup mit Bot und Server", both.calls[0]?.body.parts?.join() === "bot,server", JSON.stringify(both.calls));
    check("Danach die kleine Karte „Gesichert vor dem Anti-Nuke“", (notices[0] as { backupId?: number } | undefined)?.backupId === 42, JSON.stringify(notices));

    const off = make({ status: 200, body: { skipped: "Vor riskanten Änderungen ist aus." } });
    for (let index = 1; index <= 4; index++) await off.run(AuditLogEvent.ChannelDelete, MOD, `o${index}`);
    const card = off.world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
    check("„Vor riskanten Änderungen“ aus: kein Backup, keine Zeile auf der Karte", card.length > 0 && !card.includes("Backup") && !card.includes("💾"), card.slice(0, 300));
}

async function checkReview(): Promise<void> {
    console.log("\n  — Abschlussreview —");

    /* C1: Ein gekaperter Account postet in Sekunden in viele Kanäle - parallele Holds. */
    {
        const world = World();
        const member = world.member(USER, [GUILD, R1]);
        const now = Date.now();

        av(world).startedAt = now - 2 * 3_600_000;
        for (let index = 0; index < 3; index++) av(world).index.Note(GUILD, USER, C1, `p${index}`, now - 1000, "steamcommunlty.com/gift", []);

        const hit = (guard: "hop" | "scam") => [{ guard, points: 50, detail: "", at: now }];
        await Promise.all([av(world).quarantine.Hold(world.guild, member, hit("hop"), "a"), av(world).quarantine.Hold(world.guild, member, hit("scam"), "b"), av(world).quarantine.Hold(world.guild, member, hit("hop"), "c")]);

        const cards = world.sent.filter((entry) => entry.channelId === LOG).length;
        check("Parallel festgehalten: ein Fall, eine Team-Karte, eine DM", world.cases.size === 1 && cards === 1 && world.dms.length === 1, `${world.cases.size} Fälle, ${cards} Karten, ${world.dms.length} DMs`);
        check("Parallel festgehalten: Gründe zusammengeführt", [...world.cases.values()][0]!.hits.map((entry) => entry.guard).sort().join() === "hop,scam");

        av(world).index.Note(GUILD, USER, C2, "spaet", Date.now(), "noch ein Link", []);
        await av(world).quarantine.Hold(world.guild, member, hit("scam"), "d");
        check("Schon festgehalten: was danach noch kam, wird auch gelöscht", world.deleted.includes("spaet"), world.deleted.join());

        const setup = World();
        let creates = 0;
        const roles = setup.guild.roles as unknown as Record<string, unknown>;
        const channels = setup.guild.channels as unknown as Record<string, unknown>;

        setup.settings.quarantine = { ...setup.settings.quarantine, roleId: null, channelId: null };
        roles.create = async () => {
            creates++;
            await sleep(5);
            const role = { id: `9007199254741000${creates}`, position: 1, managed: false, name: "Quarantäne" } as unknown as Role;
            (setup.guild.roles.cache as Map<string, Role>).set(role.id, role);
            return role;
        };
        channels.create = async () => ({ id: NEWCH });
        for (const channel of setup.guild.channels.cache.values()) (channel as unknown as Record<string, unknown>).isThread = () => false;
        (setup.client as unknown as Record<string, Record<string, unknown>>).moduleSettings.Save = async (_guildId: string, _module: string, value: IAntiVillainSettings) => void (setup.settings = value);

        await Promise.all([av(setup).quarantine.Hold(setup.guild, setup.member(USER, [GUILD]), [], "x"), av(setup).quarantine.Hold(setup.guild, setup.member(STRANGER, [GUILD]), [], "y")]);
        check("Zwei gleichzeitig ohne Einrichtung: nur eine Quarantäne-Rolle", creates === 1, String(creates));
    }

    /* C2: Ein eingeladener Nuke-Bot - kicken, den Einlader festhalten. */
    {
        const { world, spy, run } = NukeWorld();
        const NUKEBOT = "90071992547410200";
        const bot = world.member(NUKEBOT, [GUILD]);

        (bot.user as unknown as Record<string, unknown>).bot = true;
        (bot.roles as unknown as Record<string, unknown>).highest = { position: 1 };
        (bot as unknown as Record<string, unknown>).kick = async () => void spy.kicked.push(NUKEBOT);

        await run(AuditLogEvent.BotAdd, MOD, NUKEBOT);
        for (let index = 1; index <= 4; index++) await run(AuditLogEvent.ChannelDelete, NUKEBOT, `b${index}`, [{ key: "name", old: `kanal-${index}` }]);

        const card = world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
        check("Nuke-Bot: gekickt statt „0 Rollen entfernt“", spy.kicked.includes(NUKEBOT) && card.includes("**Gemacht** Bot gekickt") && !card.includes("**Gemacht** 0 Rollen"), card.slice(0, 300));
        check("Nuke-Bot: wer ihn eingeladen hat, wird festgehalten", world.holds.some((entry) => entry.userId === MOD), JSON.stringify(world.holds));

        const partial = NukeWorld();
        partial.world.partial = ["Admin"];
        for (let index = 1; index <= 4; index++) await partial.run(AuditLogEvent.ChannelDelete, MOD, `p${index}`);
        const partialCard = partial.world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
        check("Rollen ließen sich nicht abnehmen: Karte sagt nicht „gestoppt“", partialCard.includes("nicht stoppen") && !partialCard.includes("gestoppt\""), partialCard.slice(0, 200));
    }

    /* I1: Das Backup braucht länger als der Nuke - die Karte zieht nach. */
    {
        const { world, run } = NukeWorld();
        const nuke = av(world).nuke as unknown as Record<string, unknown>;

        nuke.backupWaitMs = 20;
        nuke.onRisky = async () => {
            await sleep(80);
            return { ok: true, id: 42, at: new Date().toISOString() };
        };
        for (let index = 1; index <= 4; index++) await run(AuditLogEvent.ChannelDelete, MOD, `s${index}`);

        const card = world.sent.find((entry) => entry.channelId === LOG && entry.payload.includes("Anti-Nuke"))?.payload ?? "";
        check("Backup läuft noch: Karte sagt es", card.includes("läuft noch"), card.slice(0, 300));
        await sleep(150);
        check("Backup fertig: Karte zeigt es danach", world.edits.some((entry) => entry.includes("meine-backups?backup=42")), world.edits.join(" | ").slice(0, 200));
    }

    /* I2: Wer festgehalten ist, gibt sich nicht selbst frei - auch nicht als Moderator. */
    {
        const world = World();
        const mod = world.member(MOD, [GUILD]);
        const own = await makeCase(world, { userId: MOD });
        let refused = "";

        await av(world).quarantine.Release(world.guild, mod, own.id, false).catch((error: Error) => void (refused = error.message));
        check("Moderator gibt sich nicht selbst frei", refused === "Das entscheidet das Team." && world.cases.get(own.id)!.status === "open", refused);
    }

    /* I3: Rollen zurück - was nicht geht, steht da; geht gar nichts, bleibt der Fall offen. */
    {
        const world = World();
        const mod = world.member(MOD, [GUILD]);

        world.member(USER, [GUILD, QROLE]);
        const some = await makeCase(world, { savedRoles: [R1, HIGH] });
        const done = await av(world).quarantine.Release(world.guild, mod, some.id, false);
        check("Rolle über dem Bot: der Rest kommt zurück, der Verlauf nennt sie", world.added.join() === R1 && done.timeline.some((entry) => entry.text.includes("Admin")), `${world.added} · ${JSON.stringify(done.timeline)}`);

        const none = await makeCase(world, { savedRoles: [HIGH] });
        world.removed.length = 0;
        let refused = "";
        await av(world).quarantine.Release(world.guild, mod, none.id, false).catch((error: Error) => void (refused = error.message));
        check("Keine Rolle kommt zurück: Fall bleibt offen, Quarantäne bleibt", refused.length > 0 && world.cases.get(none.id)!.status === "open" && !world.removed.includes(QROLE), refused);

        const flaky = World();
        const flakyMod = flaky.member(MOD, [GUILD]);
        const person = flaky.member(USER, [GUILD, QROLE]);
        (person.roles as unknown as Record<string, unknown>).add = async (list: string[] | string) => {
            if (Array.isArray(list) && list.length > 1) throw new Error("Missing Permissions");
            flaky.added.push(...[list].flat());
        };
        const twice = await makeCase(flaky, { savedRoles: [R1, R2] });
        await av(flaky).quarantine.Release(flaky.guild, flakyMod, twice.id, false);
        check("Sammel-Aufruf scheitert: Rollen einzeln zurück", flaky.added.sort().join() === [R1, R2].sort().join(), flaky.added.join());
    }

    /* I4: Freigegebene aus der Welle trifft „Alle bannen“ nicht. */
    {
        const { world } = RaidWorld();
        const mod = world.member(MOD, [GUILD]);
        const A = "90071992547410300";
        const B = "90071992547410301";

        world.member(A, [GUILD]);
        world.member(B, [GUILD]);
        const state = await av(world).raid.Start(world.guild, MOD, Date.now(), [A, B]);
        const caseA = await makeCase(world, { userId: A, incidentId: state.incidentId });
        await av(world).quarantine.Release(world.guild, mod, caseA.id, false);
        const count = await av(world).raid.Decide(world.guild, mod, state.incidentId, "ban");
        check("Raid: „Alle bannen“ lässt Freigegebene aus", count === 1, String(count));
        await av(world).raid.End(world.guild, MOD);
    }

    /* I5: „Erledigt“ aus der DM. */
    {
        const world = FlowWorld();
        const person = world.member(USER, [GUILD, QROLE]);
        const made = await makeCase(world, {});
        const replies: string[] = [];
        const press = {
            customId: `av:done:${made.id}`,
            guild: null,
            guildId: null,
            member: null,
            user: person.user,
            inCachedGuild: () => false,
            isButton: () => true,
            isStringSelectMenu: () => false,
            reply: async (payload: { content?: string }) => void replies.push(payload.content ?? ""),
        } as unknown as ButtonInteraction;

        await av(world).OnButton(press);
        check("„Erledigt“ in der DM: Antwort und Bescheid ans Team", (replies.at(-1) ?? "").startsWith("Danke") && world.sent.some((entry) => entry.channelId === LOG && entry.payload.includes("Erledigt")), replies.join(" | "));
    }

    /* I7: Modul aus - Freigeben im Dashboard geht weiter. */
    {
        const { world, ask } = ApiWorld();

        world.member(USER, [GUILD, QROLE]);
        const open = await makeCase(world, {});
        world.modules = ["moderation"];

        const read = await ask("GET");
        check("Modul aus: Dashboard liest die offenen Fälle", read.statusCode === 200 && (read.json() as { off?: boolean }).off === true, `${read.statusCode} ${read.body.slice(0, 120)}`);
        check("Modul aus: Freigeben geht", (await ask("POST", { action: "release", id: open.id })).statusCode === 200);
        check("Modul aus: Einstellungen erst nach dem Einschalten", (await ask("POST", { action: "save", settings: world.settings })).statusCode === 409);
        const light = await ask("GET", undefined, true, "/raid");
        check("Modul aus: leichte Abfrage nennt die Festgehaltenen", light.statusCode === 200 && typeof (light.json() as { held?: unknown }).held === "number", `${light.statusCode} ${light.body}`);
    }

    /* I8: Raid-Welle festhalten ohne DM-Flut, Karte zuerst. */
    {
        const quiet = World();
        await av(quiet).quarantine.Hold(quiet.guild, quiet.member(USER, [GUILD]), [], "Welle", { incidentId: 7, quiet: true });
        check("Raid-Fall: keine DM, keine Karte im Quarantäne-Kanal", quiet.dms.length === 0 && !quiet.sent.some((entry) => entry.channelId === QCH), `${quiet.dms.length} DMs`);

        const { world } = RaidWorld();
        const trail: string[] = [];
        const log = world.guild.channels.cache.get(LOG) as unknown as Record<string, (payload: unknown) => Promise<unknown>>;
        const send = log.send!;
        const hold = av(world).quarantine as unknown as Record<string, unknown>;

        log.send = async (payload: unknown) => {
            trail.push("karte");
            return send(payload);
        };
        hold.Hold = async (_guild: Guild, member: GuildMember, _hits: unknown, _why: string, options: { quiet?: boolean } = {}) => {
            trail.push(options.quiet ? "still" : "laut");
            return { id: member.id };
        };
        const A = "90071992547410310";
        world.member(A, [GUILD]);
        await av(world).raid.Start(world.guild, null, Date.now(), [A]);
        check("Raid: Karte geht vor dem Festhalten raus, Festhalten still", trail.join() === "karte,still", trail.join());
        await av(world).raid.End(world.guild, null);
    }

    /* I9: Trümmer mit Reihenfolge und Kategorie aus dem Lösch-Ereignis. */
    {
        const { world, run } = NukeWorld();
        const nuke = av(world).nuke;

        nuke.Remember({ id: "k9", rawPosition: 4, parentId: "kat1", type: ChannelType.GuildText, permissionOverwrites: { cache: new Map() } } as unknown as GuildBasedChannel);
        await run(AuditLogEvent.ChannelDelete, MOD, "k9", [{ key: "name", old: "regeln" }]);
        const kept = nuke.Debris(GUILD).find((entry) => entry.id === "k9");
        check("Trümmer: Reihenfolge und Kategorie aus dem Lösch-Ereignis", kept?.data.position === 4 && kept?.data.parentId === "kat1", JSON.stringify(kept));
    }

    /* I10: Doppelgänger - Teamliste und Avatare werden nicht bei jedem Beitritt neu geholt. */
    {
        const world = FlowWorld();
        const service = av(world) as unknown as Record<string, unknown>;
        let teamChecks = 0;

        world.member(MOD, [GUILD]);
        for (let index = 0; index < 30; index++) world.member(`9007199254741040${String(index).padStart(2, "0")}`, [GUILD]);
        service.IsTeam = async (member: GuildMember) => {
            teamChecks++;
            return member.id === MOD;
        };
        await av(world).OnJoin(world.member("90071992547410500", [GUILD]));
        const first = teamChecks;
        const images = world.images.length;
        await av(world).OnJoin(world.member("90071992547410501", [GUILD]));
        // Der Neuling heißt wie das Teammitglied („jemand“) - die Punkte fragen dann noch einmal. Nicht je Mitglied.
        check("Doppelgänger: Teamliste kommt beim zweiten Beitritt aus dem Speicher", teamChecks - first <= 2, `${first} dann ${teamChecks - first}`);
        check("Doppelgänger: Avatare des Teams nicht neu geladen", world.images.length - images <= 1, `${images} dann ${world.images.length - images}`);
    }

    /* M2: Nuke-Vorfälle bekommen ein Ende, sonst räumt Prune sie nie weg. */
    {
        const { world, run } = NukeWorld();
        const ended: unknown[] = [];

        (world.client.avIncidents as unknown as Record<string, unknown>).Save = async (_id: number, patch: { endedAt?: number }) => void (patch.endedAt !== undefined && ended.push(patch.endedAt));
        for (let index = 1; index <= 4; index++) await run(AuditLogEvent.ChannelDelete, MOD, `e${index}`);
        check("Nuke-Vorfall hat ein Ende (für das Aufräumen nach 7 Tagen)", ended.length > 0);
    }

    /* M6: Mehr als 100 Nachrichten in einem Kanal - Discord löscht höchstens 100 auf einmal. */
    {
        const world = World();
        const channel = world.guild.channels.cache.get(C1) as unknown as Record<string, unknown>;
        const now = Date.now();

        channel.bulkDelete = async (ids: string[]) => {
            if (ids.length > 100) throw new Error("You can only bulk delete 100 messages");
            world.deleted.push(...ids);
        };
        av(world).startedAt = now - 2 * 3_600_000;
        for (let index = 0; index < 150; index++) av(world).index.Note(GUILD, USER, C1, `m${index}`, now - 1000, "spam", []);
        await av(world).quarantine.Hold(world.guild, world.member(USER, [GUILD]), [], "Spam");
        check("150 Nachrichten in einem Kanal: alle gelöscht", world.deleted.length === 150, String(world.deleted.length));
    }

    /* M10: Modul aus - Festgehaltene bleiben es (neue Kanäle, Wiederkommen). */
    {
        const world = World();
        const back = world.member(USER, [GUILD]);

        world.modules = ["moderation"];
        await makeCase(world, {});
        await av(world).OnJoin(back);
        check("Modul aus: wer festgehalten wiederkommt, ist wieder festgehalten", world.added.includes(QROLE));

        const made = { id: NEWCH, guild: world.guild, type: ChannelType.GuildText, permissionOverwrites: { edit: async (target: string, perms: Record<string, boolean>) => void (world.overwrites[NEWCH] = { ...perms, [`target:${target}`]: true }) } } as unknown as GuildBasedChannel;
        await av(world).quarantine.OnChannelCreate(made);
        check("Modul aus: neue Kanäle bekommen trotzdem die Sperre", world.overwrites[NEWCH]?.ViewChannel === false);
    }
}

async function main(): Promise<void> {
    console.log("\n🛡️  Anti Villain\n");

    const client = new BotClient();

    checkDefaults();
    checkSettings(client);
    checkScore();
    checkGuards();
    await checkImages();
    await checkHold();
    await checkRelease();
    await checkSetup();
    checkCards();
    await checkFlow();
    await checkBait();
    await checkReport();
    await checkRaid();
    await checkNuke();
    await checkSafety();
    await checkApi();
    await checkPrune();
    await checkDebris();
    await checkReview();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
