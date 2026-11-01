/**
 * Prüft die Rollen-Listen ohne Discord und ohne Datenbank: das Säubern der
 * Einstellungen, die Vorlagen, das Gruppieren, die Text-Karten, das Bild, das
 * Senden und Nachziehen und die Route des Dashboards.
 *
 *   npm run check:rolelists
 *
 * Ob Discord die Nachricht wirklich annimmt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { readFileSync } from "fs";
import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { IMAGE_PRESETS, ImagePreset, DefaultListSettings, MAX_IMAGE_PEOPLE, MAX_ROLES, MAX_TITLE, MAX_TITLES } from "../constants/RoleLists";
import { CleanImage, GroupMembers, RoleListError, TwemojiUrl } from "../services/RoleListService";
import { RoleListPanels } from "../utils/guildpanels";
import DashboardApiRoleLists from "../routes/DashboardApiRoleLists";
import { IRoleList } from "../interfaces/services/rolelists/IRoleLists";
import { RoleListText } from "../builder/RoleListView";
import { BoardPlan, IRoleListCardData, RenderRoleListCard } from "../builder/RoleListCard";
import { loadImage } from "@napi-rs/canvas";
import { MOTIFS, IRoleListImage } from "../constants/RoleLists";
import { IRoleListGroup, IRoleListMember, IRoleListRole } from "../interfaces/services/rolelists/IRoleLists";
import { IRoleListSettings } from "../constants/RoleLists";
import RoleListReady from "../events/rolelists/RoleListReady";

const GUILD = "90071992547409971";
const TEXT = "90071992547409972";
const TEXT2 = "90071992547409974";
const EMOJI = "90071992547409973";
const OWNER = "90071992547409981";
const ADMIN = "90071992547409982";
const MOD = "90071992547409983";
const SUPPORT = "90071992547409984";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Ein Server mit vier Staff-Rollen, einem Emoji und einem Textkanal. */
function FakeGuild(extraRoles: [string, string][] = []): Guild {
    const role = (id: string, name: string, color: string) => ({ id, name, hexColor: color, position: 10, managed: false, members: new Map(), iconURL: () => null }) as unknown as Role;
    const roles = new Map<string, Role>([
        [GUILD, role(GUILD, "@everyone", "#000000")],
        [OWNER, role(OWNER, "Owner", "#ff1e2d")],
        [ADMIN, role(ADMIN, "Admin", "#ff7a00")],
        [MOD, role(MOD, "Moderator", "#00afff")],
        [SUPPORT, role(SUPPORT, "Supporter", "#3ba55c")],
        ...extraRoles.map(([id, name]): [string, Role] => [id, role(id, name, "#9aa3ad")]),
    ]);

    return {
        id: GUILD,
        name: "Dev Server",
        memberCount: 0,
        members: { cache: new Map() },
        roles: { cache: roles, everyone: roles.get(GUILD) },
        emojis: { cache: new Map([[EMOJI, { id: EMOJI, name: "gc1", animated: false, imageURL: () => `https://cdn.discordapp.com/emojis/${EMOJI}.png` }]]) },
        channels: {
            cache: new Map([[TEXT, { id: TEXT, type: ChannelType.GuildText, name: "staff", isTextBased: () => true, isThread: () => false } as unknown as GuildBasedChannel]]),
        },
        iconURL: () => null,
    } as unknown as Guild;
}

/* ----------------------------------------------------------
   Task 1: Säubern und Vorlagen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Säubern —");

    const image = CleanImage({ cols: 99, dim: -5, c1: "red", radius: 30, layout: "x" }, ImagePreset("esports"));

    check("Je Reihe höchstens 8", image.cols === 8, String(image.cols));
    check("Abdunkeln nicht unter 0", image.dim === 0, String(image.dim));
    check("Ungültige Farbe → die vorige", image.c1 === "#0b1118", image.c1);
    check("Ecken höchstens 24", image.radius === 24, String(image.radius));
    check("Unbekannte Anordnung → die vorige", image.layout === "grid", image.layout);
    check("Eine Adresse ist kein Hintergrundbild", CleanImage({ bg: "image", image: "https://example.com/x.png" }, ImagePreset("esports")).image === null);

    const guild = FakeGuild(Array.from({ length: 30 }, (_, index): [string, string] => [`8007199254740${String(1000 + index)}`, `Rolle ${index}`]));
    const many = [...guild.roles.cache.keys()].filter((id) => id !== GUILD).map((roleId) => ({ roleId, label: "x", icon: null }));
    const service = client.roleListService;
    const cleaned = service.CleanSettings(guild, { roles: many }, DefaultListSettings());

    check(`Höchstens ${MAX_ROLES} Rollen`, cleaned.roles.length === MAX_ROLES, String(cleaned.roles.length));

    const settings = service.CleanSettings(
        FakeGuild(),
        {
            roles: [
                { roleId: OWNER, label: "Leitung", icon: { kind: "emoji", value: "👑" } },
                { roleId: "12345678901234567", label: "Weg", icon: null },
                { roleId: ADMIN, label: "Admins", icon: { kind: "server", id: "99999999999999999" } },
                { roleId: MOD, label: "Moderation", icon: { kind: "server", id: EMOJI } },
            ],
            titles: { [OWNER]: "x".repeat(60) },
        },
        DefaultListSettings()
    );

    check("Eine Rolle, die es nicht gibt, fällt weg", settings.roles.length === 3 && !settings.roles.some((entry) => entry.roleId === "12345678901234567"));
    check("Ein fremdes Server-Emoji wird null", settings.roles.find((entry) => entry.roleId === ADMIN)?.icon === null);
    check("Ein eigenes Server-Emoji bleibt", JSON.stringify(settings.roles.find((entry) => entry.roleId === MOD)?.icon) === JSON.stringify({ kind: "server", id: EMOJI }));
    check(`Titel höchstens ${MAX_TITLE} Zeichen`, settings.titles[OWNER]?.title.length === MAX_TITLE, String(settings.titles[OWNER]?.title.length));
}

function checkPresets(): void {
    console.log("\n  — Bild-Vorlagen und Tabelle —");

    check("Neon leuchtet", ImagePreset("neon").ring === "glow");
    check("Schlicht hat gefüllte Kacheln", ImagePreset("clean").tile === "solid");
    check("Unbekannte Vorlage → Esports", ImagePreset("gibtsnicht").preset === "esports");

    for (const key of Object.keys(IMAGE_PRESETS)) {
        const preset = ImagePreset(key);

        check(`Vorlage „${IMAGE_PRESETS[key as keyof typeof IMAGE_PRESETS].label}“ ist selbst gültig`, JSON.stringify(CleanImage(preset, ImagePreset("esports"))) === JSON.stringify(preset));
    }

    const sql = readFileSync(path.join(process.cwd(), "src", "database", "migrations", "037_role_lists.sql"), "utf8");

    check("Migration 037: Tabelle role_lists", /CREATE TABLE IF NOT EXISTS role_lists/.test(sql));
    check("Migration 037: Einstellungen als JSON", /settings\s+JSON NOT NULL/.test(sql));
    check("Migration 037: Art der Nachricht", /message_kind\s+ENUM\('text', ?'image'\) NULL/.test(sql));
    check("Migration 037: Fingerabdruck", /fingerprint\s+CHAR\(40\)/.test(sql));
}

/* ----------------------------------------------------------
   Task 2: Gruppieren und Text-Karten
   ---------------------------------------------------------- */
const ROLES = new Map<string, IRoleListRole>([
    [OWNER, { id: OWNER, name: "Owner", color: "#ff1e2d", iconUrl: null }],
    [ADMIN, { id: ADMIN, name: "Admin", color: "#ff7a00", iconUrl: null }],
    [MOD, { id: MOD, name: "Moderator", color: "#00afff", iconUrl: null }],
    [SUPPORT, { id: SUPPORT, name: "Supporter", color: "#3ba55c", iconUrl: null }],
]);

function Member(id: string, name: string, roleIds: string[], joinedAt: number): IRoleListMember {
    return { id, name, username: name.toLowerCase(), joinedAt, avatarUrl: null, roleIds };
}

const MEMBERS: IRoleListMember[] = [
    Member("100000000000000001", "MecryTv", [OWNER, ADMIN], 1),
    Member("100000000000000002", "Nico", [ADMIN], 4),
    Member("100000000000000003", "Lukas", [ADMIN], 2),
    Member("100000000000000004", "Kaze", [MOD], 3),
    Member("100000000000000005", "Mats", [SUPPORT], 5),
];

function Staff(over: Partial<IRoleListSettings> = {}): IRoleListSettings {
    return {
        ...DefaultListSettings(),
        heading: "Unser Staff",
        lead: "{anzahl} Leute helfen dir.",
        roles: [
            { roleId: OWNER, label: "Leitung", icon: { kind: "emoji", value: "👑" } },
            { roleId: ADMIN, label: "Admins", icon: { kind: "server", id: EMOJI } },
            { roleId: MOD, label: "Moderation", icon: { kind: "gallery", id: `${GUILD}/custom/x.png` } },
            { roleId: "12345678901234567", label: "Weg", icon: null },
            { roleId: SUPPORT, label: "Support", icon: null },
        ],
        ...over,
    };
}

const names = (group: IRoleListGroup | undefined): string[] => group?.members.map((member) => member.name) ?? [];

function checkGroups(): void {
    console.log("\n  — Gruppieren —");

    const once = GroupMembers(Staff(), ROLES, MEMBERS);

    check("Jeder nur einmal: MecryTv nur bei Leitung", names(once[0]).includes("MecryTv") && !names(once[1]).includes("MecryTv"), JSON.stringify(once.map(names)));
    check("Gelöschte Rolle fällt weg, kein Fehler", once.length === 4 && !once.some((group) => group.entry.roleId === "12345678901234567"));

    const twice = GroupMembers(Staff({ once: false }), ROLES, MEMBERS);

    check("Ohne „Jeder nur einmal“: MecryTv bei beiden", names(twice[0]).includes("MecryTv") && names(twice[1]).includes("MecryTv"));
    check("Alphabetisch", JSON.stringify(names(twice[1])) === JSON.stringify(["Lukas", "MecryTv", "Nico"]), JSON.stringify(names(twice[1])));

    const joined = GroupMembers(Staff({ once: false, sort: "joined" }), ROLES, MEMBERS);

    check("Am längsten dabei zuerst", JSON.stringify(names(joined[1])) === JSON.stringify(["MecryTv", "Lukas", "Nico"]), JSON.stringify(names(joined[1])));

    const empty = GroupMembers(Staff({ hideEmpty: true }), ROLES, MEMBERS.filter((member) => !member.roleIds.includes(SUPPORT)));

    check("Leere Rollen ausblenden", !empty.some((group) => group.entry.roleId === SUPPORT));
    check("Ohne „ausblenden“ bleibt die leere Rolle", GroupMembers(Staff(), ROLES, MEMBERS.filter((member) => !member.roleIds.includes(SUPPORT))).some((group) => group.entry.roleId === SUPPORT));
}

function checkText(): void {
    console.log("\n  — Text-Karten —");

    const context = { listName: "Staff", guildName: "Dev Server", iconUrl: null, now: 1_800_000_000_000, buttonUrl: null, emojiName: (id: string) => (id === EMOJI ? "gc1" : null) };
    const json = (view: ReturnType<typeof RoleListText>): string => JSON.stringify(view.components.map((component) => component.toJSON()));
    const groups = GroupMembers(Staff(), ROLES, MEMBERS);
    const compact = RoleListText(Staff(), "compact", groups, context);
    const text = json(compact);

    check("Kompakt: Überschriften der Rollen", text.includes("Leitung") && text.includes("Admins") && text.includes("Moderation"), text.slice(0, 300));
    check("Kompakt: jede Person als Erwähnung", MEMBERS.every((member) => text.includes(`<@${member.id}>`)));
    check("Niemand wird gepingt", JSON.stringify(compact.allowedMentions) === JSON.stringify({ parse: [] }));
    check("{anzahl} im Text darunter", text.includes("5 Leute helfen dir."));
    check("Server-Emoji als <:name:id>", text.includes(`<:gc1:${EMOJI}>`));
    check("Galerie-Symbol steht im Text nicht", !text.includes("custom/x.png"));

    const titled = Staff({ titles: { "100000000000000005": { title: "Head of Support", seen: 0 } } });
    const sections = json(RoleListText(titled, "sections", GroupMembers(titled, ROLES, MEMBERS), context));

    check("Mit Abschnitten: Titel hinter der Person", sections.includes("<@100000000000000005> – Head of Support"), sections.slice(0, 400));

    const crowd = Array.from({ length: 500 }, (_, index) => Member(`2000000000000${String(10000 + index)}`, `Spieler ${index}`, [SUPPORT], index));
    const big = RoleListText(Staff(), "sections", GroupMembers(Staff(), ROLES, [...MEMBERS, ...crowd]), context);
    const container = big.components[0]!.toJSON() as unknown;
    const raw = JSON.stringify(container);
    const texts = raw.match(/"content":"(?:[^"\\]|\\.)*"/g) ?? [];
    const chars = texts.reduce((sum, entry) => sum + (JSON.parse(entry.slice(10)) as string).length, 0);
    const count = (node: unknown): number =>
        node && typeof node === "object"
            ? Array.isArray(node)
                ? node.reduce((sum: number, child) => sum + count(child), 0)
                : ("type" in node ? 1 : 0) + Object.values(node).reduce((sum: number, child) => sum + count(child), 0)
            : 0;

    check("500 Leute: höchstens 4000 Zeichen", chars <= 4000, String(chars));
    check("500 Leute: höchstens 40 Komponenten", count(container) <= 40, String(count(container)));
    check("500 Leute: „… und N weitere“", raw.includes("… und ") && raw.includes(" weitere"));

    const twenty = Staff({ roles: Array.from({ length: 20 }, () => ({ roleId: SUPPORT, label: "Support", icon: null })) });
    const many = RoleListText(twenty, "sections", Array.from({ length: 20 }, () => ({ entry: { roleId: SUPPORT, label: "Support", icon: null }, role: ROLES.get(SUPPORT)!, members: [MEMBERS[4]!] })), context);

    check("20 Rollen mit Abschnitten: höchstens 40 Komponenten", count(many.components[0]!.toJSON()) <= 40, String(count(many.components[0]!.toJSON())));

    const extras = json(RoleListText(Staff({ button: { on: true, label: "Ticket öffnen", to: "url", channelId: null, url: "https://nexus-emb.de" } }), "compact", groups, { ...context, buttonUrl: "https://nexus-emb.de" }));

    check("Knopf mit Beschriftung und Adresse", extras.includes("Ticket öffnen") && extras.includes("https://nexus-emb.de"));
    check("„Zuletzt aktualisiert“ als Zeitstempel", extras.includes("Zuletzt aktualisiert") && extras.includes("<t:1800000000:R>"));
}

/* ----------------------------------------------------------
   Task 3: Das gezeichnete Bild
   ---------------------------------------------------------- */
function CardData(image: IRoleListImage, people: IRoleListMember[] = MEMBERS): IRoleListCardData {
    const settings = Staff({ image });

    return {
        image,
        heading: "Unser Staff",
        guildName: "RL Nexus",
        channelName: "staff",
        groups: GroupMembers(settings, ROLES, people),
        titles: { "100000000000000005": "Head of Support" },
        now: 1_800_000_000_000,
        pictures: { logo: null, background: null, avatars: new Map(), icons: new Map() },
    };
}

/** Viele Leute in Support - für die Grenzen des Bildes. Mit tag: jeder mit eigenem Profilbild. */
function Crowd(count: number, tag = ""): IRoleListMember[] {
    return Array.from({ length: count }, (_, index) => {
        const member = Member(`3000000000000${String(10000 + index)}`, `Spieler ${index}`, [SUPPORT], index);

        return tag ? { ...member, avatarUrl: `https://cdn.discordapp.com/avatars/${member.id}/${tag}.png` } : member;
    });
}

async function checkCard(): Promise<void> {
    console.log("\n  — Das gezeichnete Bild —");

    let rendered = 0;
    let wrong = "";

    for (const key of Object.keys(IMAGE_PRESETS)) {
        for (const layout of ["grid", "list", "columns", "pyramid"] as const) {
            const buffer = await RenderRoleListCard(CardData({ ...ImagePreset(key), layout }));
            const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
            const width = (await loadImage(buffer)).width;

            if (webp && width === 2400) rendered++;
            else wrong ||= `${key}/${layout}: webp=${webp} width=${width}`;
        }
    }

    check("Jede Vorlage in jeder Anordnung: WebP, 2400 px breit", rendered === Object.keys(IMAGE_PRESETS).length * 4, wrong || String(rendered));

    const small = BoardPlan(CardData(ImagePreset("esports"), Crowd(10)));
    const large = BoardPlan(CardData(ImagePreset("esports"), Crowd(40)));

    check("Die Höhe wächst mit den Leuten", small.height < large.height, `${small.height} / ${large.height}`);

    const huge = BoardPlan(CardData(ImagePreset("esports"), Crowd(500)));

    check("Höchstens 120 Leute, der Rest als „+N weitere“", huge.people === 120 && huge.more === 380, JSON.stringify(huge));

    const left = BoardPlan(CardData({ ...ImagePreset("esports"), headAlign: "left" }));
    const middle = BoardPlan(CardData({ ...ImagePreset("esports"), headAlign: "center" }));

    check("Kopf mittig: Logo über der Überschrift, das Bild wird höher statt zu überlappen", middle.height >= left.height + 8 * 12, `${left.height} / ${middle.height}`);

    let backgrounds = 0;

    for (const motif of Object.keys(MOTIFS)) {
        await RenderRoleListCard(CardData({ ...ImagePreset("esports"), bg: "motif", motif: motif as IRoleListImage["motif"] }));
        backgrounds++;
    }

    for (const bg of ["image", "gradient", "solid"] as const) {
        await RenderRoleListCard(CardData({ ...ImagePreset("esports"), bg, image: null }));
        backgrounds++;
    }

    check("Alle Motive, Bild ohne Datei, Verlauf und Farbe zeichnen", backgrounds === Object.keys(MOTIFS).length + 3);

    const first = await RenderRoleListCard(CardData(ImagePreset("neon")));
    const second = await RenderRoleListCard(CardData(ImagePreset("neon")));

    check("Dieselben Daten → dieselben Bytes", first.equals(second));
    check("Ohne Profilbilder: trotzdem ein Bild", first.length > 1000, String(first.length));
}

/* ----------------------------------------------------------
   Task 4: Senden, Nachziehen, Vorlagen
   ---------------------------------------------------------- */
const DAY = 86_400_000;

async function refuses(name: string, action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof RoleListError, String(error));
    }
}

interface ILog {
    sent: Record<string, unknown>[];
    edits: { id: string; options: Record<string, unknown> }[];
    deleted: string[];
    missing: Set<string>;
    /** Nachrichten, die der Bot nicht lesen darf (50001). */
    denied?: Set<string>;
    /** Senden und Bearbeiten scheitern am fehlenden Recht (50013). */
    forbidden?: boolean;
    /** In welchem Kanal eine Nachricht steht. */
    where?: Map<string, string>;
}

/** Fortlaufend über alle nachgestellten Server: keine Nachricht teilt sich eine ID. */
let nextMessage = 700;

/** Ein Server mit Mitgliedern in den Rollen und zwei Kanälen, die Nachrichten aufschreiben. */
function LiveGuild(log: ILog) {
    const guild = FakeGuild() as unknown as {
        roles: { cache: Map<string, { members: Map<string, unknown> }> };
        channels: { cache: Map<string, unknown> };
        members: { cache: Map<string, unknown>; fetch: () => Promise<unknown> };
        memberCount: number;
    } & Guild;
    const where = (log.where ??= new Map());
    const refuse = (): void => {
        if (log.forbidden) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
    };
    const message = (id: string) => ({
        id,
        edit: async (options: Record<string, unknown>) => {
            refuse();
            log.edits.push({ id, options });
            return message(id);
        },
        delete: async () => void log.deleted.push(id),
    });
    const channel = (id: string, name: string) => ({
        id,
        name,
        type: ChannelType.GuildText,
        isTextBased: () => true,
        isThread: () => false,
        send: async (options: Record<string, unknown>) => {
            refuse();
            log.sent.push(options);

            const sent = String(nextMessage++);

            where.set(sent, id);
            return message(sent);
        },
        messages: {
            fetch: async (messageId: string) => {
                if (log.missing.has(messageId) || (where.has(messageId) && where.get(messageId) !== id)) throw Object.assign(new Error("Unknown Message"), { code: 10008 });
                if (log.denied?.has(messageId)) throw Object.assign(new Error("Missing Access"), { code: 50001 });
                return message(messageId);
            },
        },
    });

    guild.channels.cache.set(TEXT, channel(TEXT, "staff"));
    guild.channels.cache.set(TEXT2, channel(TEXT2, "team"));

    for (const member of MEMBERS) {
        const fake = {
            id: member.id,
            displayName: member.name,
            user: { username: member.username },
            joinedTimestamp: member.joinedAt,
            displayAvatarURL: () => null,
            roles: { cache: new Map(member.roleIds.map((id) => [id, {}])) },
        };

        for (const roleId of member.roleIds) guild.roles.cache.get(roleId)?.members.set(member.id, fake);

        guild.members.cache.set(member.id, fake);
    }

    guild.memberCount = guild.members.cache.size;

    return guild;
}

async function checkSend(client: BotClient): Promise<void> {
    console.log("\n  — Senden und Nachziehen —");

    const service = client.roleListService;
    const store = new Map<number, IRoleList>();
    const model = client.roleLists as unknown as Record<string, unknown>;
    let nextId = 1;

    model.OfGuild = async (guildId: string) => [...store.values()].filter((list) => list.guildId === guildId).sort((a, b) => a.position - b.position);
    model.Get = async (id: number) => (store.has(id) ? structuredClone(store.get(id)!) : null);
    model.CountOf = async (guildId: string) => [...store.values()].filter((list) => list.guildId === guildId).length;
    model.WithMessage = async () => [...store.values()].filter((list) => list.messageId);
    model.Create = async (row: IRoleList) => {
        const list = { ...row, id: nextId++, messageId: null, messageKind: null, fingerprint: null, createdAt: 0, updatedAt: 0 } as IRoleList;
        store.set(list.id, list);
        return structuredClone(list);
    };
    // Wie das echte Model: was undefined ist, bleibt unverändert.
    model.Save = async (id: number, patch: Partial<IRoleList>) => void Object.assign(store.get(id)!, structuredClone(Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))));
    model.SetMessage = async (id: number, messageId: string | null, kind: IRoleList["messageKind"], fingerprint: string | null) => void Object.assign(store.get(id)!, { messageId, messageKind: kind, fingerprint });
    model.Remove = async (id: number) => void store.delete(id);

    const presets: { presets: unknown[] } = { presets: [] };
    const settingsModel = client.moduleSettings as unknown as Record<string, unknown>;

    settingsModel.Of = async () => structuredClone(presets);
    settingsModel.Save = async (_guild: string, _module: string, config: { presets: unknown[] }) => void (presets.presets = structuredClone(config.presets));
    (client.settings as unknown as Record<string, unknown>).Of = async () => ({ modules: ["role-lists"] });

    service.fetchImage = async () => null;
    service.refreshDelay = 20;

    const log = { sent: [] as Record<string, unknown>[], edits: [] as { id: string; options: Record<string, unknown> }[], deleted: [] as string[], missing: new Set<string>() };
    const guild = LiveGuild(log);

    // Vorlage Staff
    const created = await service.Create(guild, { name: "Staff", template: "staff" });

    check("Vorlage Staff: vier Rollen mit Namen", JSON.stringify(created.settings.roles.map((entry) => entry.label)) === JSON.stringify(["Leitung", "Admins", "Moderation", "Support"]), JSON.stringify(created.settings.roles.map((entry) => entry.label)));

    for (let index = store.size; index < 10; index++) await service.Create(guild, { name: `Liste ${index}`, template: "empty" });

    await refuses("Die elfte Liste wird abgewiesen", () => service.Create(guild, { name: "Zu viel", template: "empty" }));

    // Ungesendet: kein Nachziehen
    check("Ungesendet: Nachziehen tut nichts", (await service.Refresh(guild, store.get(created.id)!)) === "skipped");
    await refuses("Ohne Kanal kein Senden", () => service.Send(guild, created.id));

    await service.Save(guild, created.id, { channelId: TEXT, design: "sections" });
    await service.Send(guild, created.id);

    check("Senden als Karte: eine Nachricht mit V2", log.sent.length === 1 && Number(log.sent[0]!.flags) === 32768, JSON.stringify(log.sent[0]?.flags));
    check("…Art und Fingerabdruck gespeichert", store.get(created.id)!.messageKind === "text" && /^[0-9a-f]{40}$/.test(store.get(created.id)!.fingerprint ?? ""));

    check("Ohne Änderung: „same“, keine Bearbeitung", (await service.Refresh(guild, store.get(created.id)!)) === "same" && log.edits.length === 0);

    const newcomer = { id: "100000000000000009", displayName: "Ivo", user: { username: "ivo" }, joinedTimestamp: 9, displayAvatarURL: () => null, roles: { cache: new Map([[SUPPORT, {}]]) } };

    guild.roles.cache.get(SUPPORT)!.members.set(newcomer.id, newcomer);
    check("Neues Mitglied: „edited“", (await service.Refresh(guild, store.get(created.id)!)) === "edited" && log.edits.length === 1);

    // Wechsel auf Bild
    const before = log.sent.length;

    await service.Save(guild, created.id, { design: "board" });
    check("Auf Bild umgestellt: „sent“", (await service.Refresh(guild, store.get(created.id)!, true)) === "sent");

    const image = log.sent[log.sent.length - 1]!;

    check("…die alte Nachricht ist gelöscht", log.deleted.length === 1);
    check("…genau eine neue Nachricht", log.sent.length === before + 1);
    check("…nur eine Datei, keine Karte, kein Text, kein Embed", Array.isArray(image.files) && (image.files as unknown[]).length === 1 && !image.components && !image.content && !image.embeds, Object.keys(image).join(","));
    check("…Art „image“", store.get(created.id)!.messageKind === "image");

    // Nachricht weg, Kanal weg
    log.missing.add(store.get(created.id)!.messageId!);
    check("Nachricht von Hand gelöscht: wieder „sent“", (await service.Refresh(guild, store.get(created.id)!, true)) === "sent");

    guild.channels.cache.delete(TEXT);
    check("Kanal weg: „skipped“, keine Ausnahme", (await service.Refresh(guild, store.get(created.id)!, true)) === "skipped");
    guild.channels.cache.set(TEXT, LiveGuild(log).channels.cache.get(TEXT));

    // Bündeln und Touch
    let refreshed = 0;
    const refresh = service.Refresh.bind(service);

    service.Refresh = async (...args: Parameters<typeof service.Refresh>) => {
        refreshed++;
        return refresh(...args);
    };
    (client.guilds.cache as unknown as Map<string, Guild>).set(GUILD, guild);
    service.Schedule(GUILD, created.id);
    service.Schedule(GUILD, created.id);
    await new Promise((resolve) => setTimeout(resolve, 80));
    check("Zweimal geplant in der Wartezeit: einmal nachgezogen", refreshed === 1, String(refreshed));

    const planned: number[] = [];
    const schedule = service.Schedule.bind(service);

    service.Schedule = (guildId: string, id: number) => void planned.push(id);
    await service.Touch(GUILD, [SUPPORT]);
    check("Touch plant genau die gesendeten Listen mit der Rolle", JSON.stringify(planned) === JSON.stringify([created.id]), JSON.stringify(planned));
    planned.length = 0;
    await service.Touch(GUILD, ["55555555555555555"]);
    check("Touch mit fremder Rolle plant nichts", planned.length === 0);
    service.Schedule = schedule;
    service.Refresh = refresh;

    // Titel: 30 Tage
    const now = Date.now();

    store.get(created.id)!.settings.titles = { [MEMBERS[0]!.id]: { title: "Gründer", seen: now - 5 * DAY }, "100000000000000077": { title: "Weg", seen: now - 31 * DAY } };
    await service.Save(guild, created.id, { name: "Staff" });
    check("Titel älter als 30 Tage fällt beim Speichern weg", !store.get(created.id)!.settings.titles["100000000000000077"] && Boolean(store.get(created.id)!.settings.titles[MEMBERS[0]!.id]));
    await service.Refresh(guild, store.get(created.id)!, true);
    check("Nach dem Nachziehen ist „gesehen“ jetzt", store.get(created.id)!.settings.titles[MEMBERS[0]!.id]!.seen >= now);

    // Panels nach dem Zurückladen
    const panels = await RoleListPanels(client, GUILD);

    check("Gesendete Listen sind Panels „rolelist“", panels.length === 1 && panels[0]!.kind === "rolelist" && panels[0]!.key === String(created.id), JSON.stringify(panels));

    // Eigene Vorlagen
    for (let index = 0; index < 10; index++) await service.SavePreset(GUILD, `Eigene ${index}`, ImagePreset("gold"));

    await refuses("Die elfte eigene Vorlage wird abgewiesen", () => service.SavePreset(GUILD, "Zu viel", ImagePreset("gold")));
    check("Eigene Vorlagen sind gespeichert", (await service.Presets(GUILD)).length === 10);
}

/* ----------------------------------------------------------
   Task 5: Die Route des Dashboards
   ---------------------------------------------------------- */
async function checkRoute(client: BotClient): Promise<void> {
    console.log("\n  — Route des Dashboards —");

    // Nachzieher aus der vorigen Gruppe erst durchlaufen lassen (Bündelzeit im Test: 20 ms).
    await new Promise((resolve) => setTimeout(resolve, 100));

    const route = new DashboardApiRoleLists(client) as unknown as { Read(access: unknown): Promise<Record<string, any>>; Write(access: unknown, body: unknown): Promise<Record<string, any>> };
    const log = { sent: [] as Record<string, unknown>[], edits: [] as { id: string; options: Record<string, unknown> }[], deleted: [] as string[], missing: new Set<string>() };
    const guild = LiveGuild(log);
    const access = { guild, member: { id: MEMBERS[0]!.id }, actor: { id: MEMBERS[0]!.id, name: "Check", staff: false } };
    const service = client.roleListService;
    const first = (await client.roleLists.OfGuild(GUILD))[0]!;

    service.HasMemberIntent = () => false;

    const read = await route.Read(access);

    check("Lesen: die Listen des Servers", Array.isArray(read.lists) && read.lists.length === 10, String(read.lists?.length));
    check("Lesen: sechs Bild-Vorlagen und die eigenen", Object.keys(read.imagePresets ?? {}).length === 6 && Array.isArray(read.presets));
    check("Lesen: Mitglieder der Rollen für die Titel", Array.isArray(read.members?.[SUPPORT]) && read.members[SUPPORT].some((member: { name: string }) => member.name === "Mats"));
    check("Lesen: ohne Mitglieder-Intent steht das da", read.intent === false);

    // Eine nie gesendete Liste: an ihr zieht kein Nachzieher der vorigen Gruppe etwas nach.
    const quiet = (await client.roleLists.OfGuild(GUILD)).find((list) => !list.messageId)!;
    const stored = JSON.stringify(await client.roleLists.Get(quiet.id));
    const board = await route.Write(access, { action: "preview", id: quiet.id, list: { design: "board", settings: { image: ImagePreset("neon") } } });

    check("Vorschau Bild: eine WebP-Data-URL", typeof board.image === "string" && board.image.startsWith("data:image/webp;base64,"));
    check("Vorschau speichert nichts", JSON.stringify(await client.roleLists.Get(quiet.id)) === stored);

    const text = await route.Write(access, { action: "preview", id: first.id, list: { design: "compact", settings: {} } });

    check("Vorschau Text: Teile der Karte und die Namen", Array.isArray(text.message?.parts) && text.message.parts.some((part: { content?: string }) => part.content?.includes("<@")) && text.message.names[MEMBERS[0]!.id] === "MecryTv", JSON.stringify(text.message).slice(0, 200));

    const saved = await route.Write(access, { action: "save", id: first.id, list: { settings: { image: { cols: 99 } } } });

    check("Speichern säubert", saved.list?.settings.image.cols === 8, String(saved.list?.settings.image.cols));

    await route.Write(access, { action: "remove", id: (await client.roleLists.OfGuild(GUILD))[9]!.id });

    const created = await route.Write(access, { action: "create", name: "Creator", template: "empty" });

    check("Anlegen über die Route", created.list?.name === "Creator");
    await refuses("Senden ohne Kanal: Meldung statt Fehler", () => route.Write(access, { action: "send", id: created.list.id }));
}

/* ----------------------------------------------------------
   Befunde aus dem Review (Task 7)
   ---------------------------------------------------------- */
async function checkReview(client: BotClient): Promise<void> {
    console.log("\n  — Befunde aus dem Review —");

    // Nachzieher der vorigen Gruppen erst durchlaufen lassen; danach plant hier keiner mehr dazwischen.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const service = client.roleListService;
    const lists = client.roleLists;
    const log: ILog = { sent: [], edits: [], deleted: [], missing: new Set(), denied: new Set() };
    const guild = LiveGuild(log);
    const get = async (id: number): Promise<IRoleList> => (await lists.Get(id))!;
    const now = Date.now();
    const holder = MEMBERS.find((member) => member.roleIds.includes(SUPPORT))!;
    const person = (id: string, name: string) => ({ id, displayName: name, user: { username: name.toLowerCase() }, joinedTimestamp: 1, displayAvatarURL: () => null, roles: { cache: new Map([[SUPPORT, {}]]) } });

    service.refreshDelay = 60_000;
    service.HasMemberIntent = () => true;
    service.fetchImage = async () => null;
    (client.guilds.cache as unknown as Map<string, Guild>).set(GUILD, guild);

    const sql = readFileSync(path.join(__dirname, "..", "database", "migrations", "037_role_lists.sql"), "utf8");

    check("Migration 037: Tabelle in utf8mb4 wie die anderen", sql.includes("DEFAULT CHARSET = utf8mb4"));

    // Eine Text-Liste mit Support im Kanal „staff“
    const target = (await lists.OfGuild(GUILD)).find((list) => !list.messageId)!;

    await service.Save(guild, target.id, { name: "Support", channelId: TEXT, design: "compact", settings: { heading: "", roles: [{ roleId: SUPPORT, label: "Support", icon: null }] } });
    await service.Send(guild, target.id);

    // Ohne Überschrift steht der Name oben - umbenannt muss die Nachricht nachziehen.
    await service.Save(guild, target.id, { name: "Support-Team" });
    check("Umbenannt ohne Überschrift: die Nachricht zieht nach", (await service.Refresh(guild, await get(target.id))) === "edited");

    // Titel: wer die Rolle noch hat, behält ihn - auch nach 40 ruhigen Tagen.
    await lists.Save(target.id, { settings: { ...(await get(target.id)).settings, titles: { [holder.id]: { title: "Head of Support", seen: now - 40 * DAY }, "100000000000000077": { title: "Weg", seen: now - 40 * DAY } } } });
    await service.Save(guild, target.id, { name: "Support-Team" });

    const titles = (await get(target.id)).settings.titles;

    check("Titel nach 40 ruhigen Tagen: bleibt, wer die Rolle hat", (titles[holder.id]?.seen ?? 0) >= now, JSON.stringify(titles));
    check("…und fällt weg, wer sie seit 30 Tagen nicht mehr hat", !titles["100000000000000077"]);

    // Ohne sichtbare Änderung hält das Nachziehen „gesehen“ trotzdem frisch.
    await service.Refresh(guild, await get(target.id), true);
    await lists.Save(target.id, { settings: { ...(await get(target.id)).settings, titles: { [holder.id]: { title: "Head of Support", seen: now - 3 * DAY } } } });
    check("Nachziehen ohne Änderung: „same“, „gesehen“ ist trotzdem frisch", (await service.Refresh(guild, await get(target.id))) === "same" && (await get(target.id)).settings.titles[holder.id]!.seen >= now);

    // Ein Speichern während des Zeichnens geht nicht verloren.
    await lists.Save(target.id, { settings: { ...(await get(target.id)).settings, titles: { [holder.id]: { title: "Head of Support", seen: now - 3 * DAY } } } });

    const stale = await get(target.id);

    await lists.Save(target.id, { settings: { ...stale.settings, lead: "Neu aus dem Dashboard" } });
    await service.Refresh(guild, stale, true);
    check("Gespeichert, während die Liste nachzieht: bleibt stehen", (await get(target.id)).settings.lead === "Neu aus dem Dashboard", (await get(target.id)).settings.lead);
    await service.Refresh(guild, await get(target.id), true);

    // Von Hand gelöscht, sonst nichts geändert
    log.missing.add((await get(target.id)).messageId!);
    check("Von Hand gelöscht, sonst nichts geändert: das Nachziehen schickt sie neu", (await service.Refresh(guild, await get(target.id))) === "sent");

    // Nicht lesbar: fehlendes Recht oder ein Aussetzer bei Discord
    guild.roles.cache.get(SUPPORT)!.members.set("100000000000000088", person("100000000000000088", "Lia"));
    log.denied!.add((await get(target.id)).messageId!);

    const sentBefore = log.sent.length;

    check("Nachricht nicht lesbar (Recht fehlt, Aussetzer): kein zweites Senden", (await service.Refresh(guild, await get(target.id))) === "skipped" && log.sent.length === sentBefore);
    await refuses("…„Jetzt aktualisieren“ meldet es, statt zu verdoppeln", () => service.Send(guild, target.id));
    log.denied!.clear();

    // Anderer Kanal für eine gesendete Liste
    const moved = (await get(target.id)).messageId!;

    await service.Save(guild, target.id, { channelId: TEXT2 });
    check("Kanal einer gesendeten Liste gewechselt: die alte Nachricht ist weg", log.deleted.includes(moved), JSON.stringify(log.deleted));
    check("…das Nachziehen schickt sie in den neuen Kanal", (await service.Refresh(guild, await get(target.id))) === "sent" && log.where!.get((await get(target.id)).messageId!) === TEXT2);

    // Fehlendes Recht zum Schreiben
    log.forbidden = true;
    await refuses("Darf im Kanal nicht schreiben: eine Meldung statt eines Fehlers 500", () => service.Send(guild, target.id));
    log.forbidden = false;

    // Globaler Name oder Profilbild: Discord meldet das nur als UserUpdate
    const touched: [string, string[]][] = [];
    const touch = service.Touch.bind(service);

    service.Touch = async (guildId: string, roleIds: string[]) => void touched.push([guildId, roleIds]);
    await service.UserChanged(holder.id);
    service.Touch = touch;
    check("Globaler Name oder Profilbild geändert: die Listen auf ihren Servern ziehen nach", touched.length === 1 && touched[0]![0] === GUILD && touched[0]![1].includes(SUPPORT), JSON.stringify(touched));

    // Neustart: der Cache kennt nur einen Teil der Leute
    await service.Refresh(guild, await get(target.id), true);

    const hidden = person("100000000000000099", "Zoe");

    guild.memberCount++;
    (guild.members as unknown as { fetch: () => Promise<void> }).fetch = async () => {
        guild.roles.cache.get(SUPPORT)!.members.set(hidden.id, hidden);
        guild.members.cache.set(hidden.id, hidden);
    };

    const shown = (await get(target.id)).messageId!;
    const editsBefore = log.edits.length;

    await service.Startup();

    const edit = log.edits.slice(editsBefore).find((entry) => entry.id === shown);

    check("Neustart mit halbem Cache: erst alle holen, dann nachziehen", Boolean(edit) && JSON.stringify(edit!.options).includes(hidden.id), String(Boolean(edit)));

    // Ohne Intent ist der Cache nach dem Start nur ein Ausschnitt - was er zeigt, ist keine echte Änderung.
    service.HasMemberIntent = () => false;
    guild.roles.cache.get(SUPPORT)!.members.delete(hidden.id);
    guild.roles.cache.get(SUPPORT)!.members.delete("100000000000000088");

    const quiet = log.edits.length + log.sent.length;

    await service.Startup();
    check("Neustart ohne Mitglieder-Intent: die Listen bleiben, wie sie sind", log.edits.length + log.sent.length === quiet);
    service.HasMemberIntent = () => true;

    // Profilbilder: nur die gezeigten laden, der Speicher wächst nicht ohne Ende
    let downloads = 0;
    const settings = Staff({ image: ImagePreset("esports") });

    // Gezählt werden nur Profilbilder - das Symbol der Rolle kommt einmal dazu.
    service.fetchImage = async (url: string) => {
        if (url.includes("/avatars/")) downloads++;
        return null;
    };
    await service.CardData(guild, { name: "Viele", settings, channelId: TEXT }, GroupMembers(settings, ROLES, Crowd(300, "a")));
    check("Bild mit 300 Leuten: nur die 120 gezeigten Profilbilder geladen", downloads <= MAX_IMAGE_PEOPLE, String(downloads));

    for (const tag of ["b", "c", "d"]) await service.CardData(guild, { name: "Viele", settings, channelId: TEXT }, GroupMembers(settings, ROLES, Crowd(120, tag)));

    const cached = (service as unknown as { images: Map<string, unknown> }).images.size;

    check("…und der Bild-Speicher wächst nicht ohne Ende", cached <= 300, String(cached));
    service.fetchImage = async () => null;

    // 120 Leute in jeder Vorlage: WebP endet bei 16383 px
    let broken = "";
    const crowd = Crowd(120);
    const looks: IRoleListImage[] = [...Object.keys(IMAGE_PRESETS).map((key) => ImagePreset(key)), { ...ImagePreset("esports"), layout: "grid", cols: 3, size: "l", gap: "wide" }];

    for (const look of looks) {
        try {
            const height = (await loadImage(await RenderRoleListCard(CardData(look, crowd)))).height;

            if (height > 16383) broken ||= `${look.preset}/${look.layout}: ${height} px`;
        } catch (error) {
            broken ||= `${look.preset}/${look.layout}: ${String(error)}`;
        }
    }

    check("120 Leute in jeder Vorlage: das Bild entsteht, höchstens 16383 px hoch", !broken, broken);
}

/* ----------------------------------------------------------
   Kleine Punkte aus dem Review
   ---------------------------------------------------------- */
async function checkMinors(client: BotClient): Promise<void> {
    console.log("\n  — Kleine Punkte aus dem Review —");

    const service = client.roleListService;
    const lists = client.roleLists;
    const log: ILog = { sent: [], edits: [], deleted: [], missing: new Set() };
    const guild = LiveGuild(log);
    const route = new DashboardApiRoleLists(client) as unknown as { Read(access: unknown, query?: unknown): Promise<Record<string, any>>; Write(access: unknown, body: unknown): Promise<Record<string, any>> };
    const access = { guild, member: { id: MEMBERS[0]!.id }, actor: { id: MEMBERS[0]!.id, name: "Check", staff: false } };

    (client.guilds.cache as unknown as Map<string, Guild>).set(GUILD, guild);

    // „+N weitere“ auch, wenn die Grenze genau an einer Rolle endet
    const mods = Array.from({ length: 120 }, (_, index) => Member(`4000000000000${String(10000 + index)}`, `Mod ${index}`, [MOD], index));
    const edge = BoardPlan(CardData(ImagePreset("esports"), [...mods, ...Crowd(5)]));

    check("Genau 120 vor der nächsten Rolle: „+N weitere“ steht trotzdem da", edge.more === 5 && edge.extra === true, JSON.stringify(edge));

    // Ohne Datenbank: Touch bleibt still statt bei jedem Mitglieder-Update zu warnen
    const settingsModel = client.settings as unknown as Record<string, unknown>;
    const settingsOf = settingsModel.Of;

    settingsModel.Of = async () => {
        throw new Error("Datenbank weg");
    };

    let quiet = true;

    await service.Touch(GUILD, [SUPPORT]).catch(() => (quiet = false));
    settingsModel.Of = settingsOf;
    check("Datenbank weg: Touch wirft nicht (keine Warnung je Mitglieder-Update)", quiet);

    // Nach dem Zurückladen eines Backups weiß Touch nichts Altes mehr
    const watched = (service as unknown as { watched: Map<string, unknown> }).watched;
    const schedule = service.Schedule.bind(service);

    service.Schedule = () => undefined;
    await service.Touch(GUILD, [SUPPORT]);
    service.Schedule = schedule;
    (service as unknown as { Forget(guildId: string): void }).Forget?.(GUILD);
    check("Nach dem Zurückladen: Touch liest die Listen neu", !watched.has(GUILD));

    // Twemoji: fe0f bleibt in Sequenzen mit ZWJ
    check("Twemoji: ❤️ ohne fe0f", TwemojiUrl("❤️").endsWith("/2764.png"), TwemojiUrl("❤️"));
    check("Twemoji: 🏳️‍🌈 behält fe0f (ZWJ-Sequenz)", TwemojiUrl("🏳️‍🌈").endsWith("/1f3f3-fe0f-200d-1f308.png"), TwemojiUrl("🏳️‍🌈"));

    // Animierte Server-Emojis bleiben animiert
    const animated = RoleListText(
        Staff({ roles: [{ roleId: SUPPORT, label: "Support", icon: { kind: "server", id: EMOJI } }] }),
        "sections",
        GroupMembers(Staff({ roles: [{ roleId: SUPPORT, label: "Support", icon: { kind: "server", id: EMOJI } }] }), ROLES, MEMBERS),
        { listName: "Staff", guildName: "Dev Server", iconUrl: null, now: 0, buttonUrl: null, emojiName: () => "gc1", emojiAnimated: () => true }
    );

    check("Animiertes Server-Emoji: <a:…> im Text", JSON.stringify(animated).includes(`<a:gc1:${EMOJI}>`));

    // Titel: höchstens so viele, wie je eine Liste braucht
    const many = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`5000000000000${String(10000 + index)}`, { title: "Titel" }]));

    check("Titel je Liste gedeckelt", Object.keys(service.CleanSettings(guild, { titles: many }, DefaultListSettings()).titles).length <= MAX_TITLES);

    // Die Leiste fragt nur nach den Namen
    const names = await route.Read(access, { nur: "namen" });

    check("Leiste: nur Namen der Listen, ohne Mitglieder und Server", Array.isArray(names.lists) && !("guild" in names) && !("members" in names) && Object.keys(names.lists[0] ?? {}).join(",") === "id,name", JSON.stringify(names).slice(0, 160));

    // Kachel zählt Leute, nicht Einträge
    const twice = (await lists.OfGuild(GUILD)).find((list) => !list.messageId)!;

    await service.Save(guild, twice.id, { channelId: TEXT, settings: { once: false, roles: [{ roleId: OWNER, label: "Leitung", icon: null }, { roleId: ADMIN, label: "Admins", icon: null }] } });

    const read = await route.Read(access);
    const tile = read.lists.find((list: { id: number }) => list.id === twice.id);

    check("Kachel: jede Person einmal gezählt, auch ohne „Jeder nur einmal“", tile?.members === 3, String(tile?.members));
    check("Mitglieder je Rolle in einem Durchgang gezählt", read.guild.memberCounts[ADMIN] === 3 && read.guild.memberCounts[SUPPORT] === 1, JSON.stringify(read.guild.memberCounts));

    // Bild-Vorschau: der Kanal aus dem Entwurf steht in der Fußzeile
    let previewChannel: string | null | undefined;
    const cardData = service.CardData.bind(service);

    service.CardData = async (target, list, groups) => {
        previewChannel = list.channelId;
        return cardData(target, list, groups);
    };
    await route.Write(access, { action: "preview", id: twice.id, list: { design: "board", channelId: TEXT2 } });
    service.CardData = cardData;
    check("Bild-Vorschau: Fußzeile mit dem Kanal aus dem Entwurf", previewChannel === TEXT2, String(previewChannel));
}

/**
 * Review W-0042: Beim Start verbindet sich die Datenbank parallel zum Login. Mit
 * neuen Migrationen ist sie bei „bereit“ von Discord oft noch nicht fertig - dann
 * sprang RoleListReady still ab, und die Listen wurden nicht nachgezogen.
 */
async function checkStartup(): Promise<void> {
    console.log("\n  Nach dem Start");

    let ready = false;
    let started = 0;
    const slow = {
        databaseService: { get Ready() { return ready; } },
        roleListService: { Startup: async () => { started++; } },
    } as unknown as BotClient;

    setTimeout(() => (ready = true), 50);
    await new RoleListReady(slow).Execute();
    check("Wartet auf die Datenbank und zieht die Listen danach nach", started === 1, `nachgezogen: ${started}`);
}

async function main(): Promise<void> {
    console.log("\n📋  Rollen-Listen\n");

    const client = new BotClient();

    checkClean(client);
    checkPresets();
    checkGroups();
    checkText();
    await checkCard();
    await checkSend(client);
    await checkRoute(client);
    await checkReview(client);
    await checkMinors(client);
    await checkStartup();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
