/**
 * Prüft das Einstellungs-Panel (/einstellungen, W-0014 Teil 3) ohne Discord:
 * IDs, Stufen-Text, Anzeige der Werte - und, sofern eine Datenbank da ist,
 * Ändern und Rückgängig an einer erfundenen Guild, die am Ende wieder weg ist.
 *
 *   npm run check:settings
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import SettingsService from "../services/settings/SettingsService";
import BotClient from "../client/BotClient";
import { SetEmojiLoader } from "../builder/HelpImage";
import { OverviewBlocks, OverviewView, PanelBlocks, PanelView } from "../builder/SettingsView";
import { DefaultApplySettings } from "../constants/Apply";
import { DefaultLevelSettings } from "../constants/Levels";
import { DefaultModConfig } from "../constants/Moderation";
import { DefaultConfig } from "../constants/Tickets";
import { DefaultWelcomeConfig } from "../constants/Welcome";
import { PANEL_AREAS, PANEL_MODULES } from "../services/settings/registers";
import { MODERATORS, PANEL } from "../services/settings/registers/Shared";
import { IPanelField, MAX_SECTION_FIELDS, PanelError, PanelId, PanelModuleId, ParseStages, ReadPanelId, ShowValue, StagesText } from "../services/settings/SettingsModel";

// Teil 4 · Imports Gruppe Rocket League
import { DefaultLftSettings } from "../constants/Lft";
import { DefaultRankRoleSettings, Steps } from "../constants/RankRoles";
import { DefaultSixSettings } from "../constants/SixMans";
import { DefaultTeamSettings } from "../constants/Teams";
// Teil 4 · Imports Gruppe Rest
import { DefaultClipSettings } from "../constants/Clips";
import { DefaultMatchupSettings } from "../constants/Matchups";
import { DefaultBackupSettings } from "../constants/ServerBackup";
// Teil 4 · Imports Gruppe Moderation
import { DefaultAntiVillainSettings } from "../constants/AntiVillain";
import { DefaultAutoModSettings } from "../constants/AutoMod";
import { DefaultLogSettings } from "../constants/Logging";

/** Discord nimmt höchstens 10 Bilder in einer Nachricht. */
const MAX_FILES_CHECK = 10;

const GUILD = "90071992547409971";
const TEXT = "90071992547409972";
const VOICE = "90071992547409973";
const ROLE = "90071992547409974";
const GONE = "90071992547409979";
const TEXT2 = "90071992547409975";
const CATEGORY = "90071992547409976";
const FORUM = "90071992547409977";
const THREAD = "90071992547409978";
const ROLE2 = "90071992547409980";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const texty = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.PublicThread]);
    const channel = (id: string, name: string, type: ChannelType) => ({ id, name, type, isTextBased: () => texty.has(type), isThread: () => type === ChannelType.PublicThread }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, "mod-log", ChannelType.GuildText)],
                [VOICE, channel(VOICE, "Warteraum", ChannelType.GuildVoice)],
                [TEXT2, channel(TEXT2, "archiv", ChannelType.GuildText)],
                [CATEGORY, channel(CATEGORY, "Bewerbungen", ChannelType.GuildCategory)],
                [FORUM, channel(FORUM, "tickets", ChannelType.GuildForum)],
                [THREAD, channel(THREAD, "Mod-Logs", ChannelType.PublicThread)],
            ]),
        },
        roles: {
            cache: new Map([
                [ROLE, { id: ROLE, name: "Support" } as unknown as Role],
                [ROLE2, { id: ROLE2, name: "Mod" } as unknown as Role],
                [GUILD, { id: GUILD, name: "@everyone" } as unknown as Role],
            ]),
        },
    } as unknown as Guild;
}

function Field(kind: IPanelField<unknown>["kind"], extra: Partial<IPanelField<unknown>> = {}): IPanelField<unknown> {
    return { key: "x", label: "X", hint: "", kind, get: () => null, set: () => ({}), ...extra };
}

function checkModel(): void {
    console.log("\n  — IDs, Stufen, Anzeige —");

    const id = PanelId("c", "moderation", "logChannelId");

    check("Eine ID wird gebaut", id === "set:c:moderation:logChannelId", id);
    check("Und gelesen", JSON.stringify(ReadPanelId(id)) === JSON.stringify({ step: "c", module: "moderation", key: "logChannelId", extra: null }));
    check("Mit Zusatz", ReadPanelId(PanelId("t", "levels", "chat.on", "on"))?.extra === "on");
    // W-0014: „Modul an“ hat keinen Schlüssel. Fiel der leere Teil weg, las ReadPanelId „on“ als Schlüssel, und der Knopf schaltete aus.
    check("Ohne Schlüssel, mit Zusatz: der Zusatz bleibt der Zusatz", JSON.stringify(ReadPanelId(PanelId("x", "welcome", undefined, "on"))) === JSON.stringify({ step: "x", module: "welcome", key: "", extra: "on" }), PanelId("x", "welcome", undefined, "on"));
    check("Die Übersicht ohne Modul", JSON.stringify(ReadPanelId(PanelId("s"))) === JSON.stringify({ step: "s", module: null, key: null, extra: null }));
    check("Fremde IDs nicht", ReadPanelId("hilfe:start") === null && ReadPanelId("set:zz:moderation") === null && ReadPanelId("mf:ev:1") === null);
    check("Höchstens 100 Zeichen", PanelId("t", "moderation", "support.notifyChannelId", "off").length <= 100);

    const stages = ParseStages("3 timeout 1h\n5 kick\n\n9 ban");

    check("Drei Stufen aus drei Zeilen", stages.length === 3 && stages[0].action === "timeout" && stages[0].duration === 3_600 && stages[1].duration === null && stages[2].action === "ban" && stages[2].duration === null, JSON.stringify(stages));
    check("Befristeter Bann", ParseStages("7 ban 7d")[0]?.duration === 604_800);
    check("Leer: keine Stufen", ParseStages("  ").length === 0);
    check("Rund: Text → Stufen → Text", StagesText(ParseStages("3 timeout 1h\n5 kick\n7 ban 7d")) === "3 timeout 1h\n5 kick\n7 ban 7d", StagesText(stages));

    for (const [text, wanted] of [
        ["x kick", "Zeile 1"],
        ["3 kick\n4 boom", "Zeile 2"],
        ["3 timeout", "Zeile 1"],
        ["3 kick\n3 ban", "Zeile 2"],
    ] as const) {
        let message = "";

        try {
            ParseStages(text);
        } catch (error) {
            message = error instanceof PanelError ? error.message : String(error);
        }

        check(`„${text.replace("\n", " / ")}“ wird abgelehnt (${wanted})`, message.startsWith(wanted), message);
    }

    const guild = FakeGuild();

    check("Kanal als #name", ShowValue(Field("channel"), TEXT, guild) === "#mod-log");
    check("Gelöschter Kanal", ShowValue(Field("channel"), GONE, guild) === "gelöscht");
    check("Kein Kanal", ShowValue(Field("channel"), null, guild) === "–");
    check("Rollen als @name", ShowValue(Field("roles"), [ROLE, GONE], guild) === "@Support, gelöscht");
    check("An und aus", ShowValue(Field("toggle"), true, guild) === "an" && ShowValue(Field("toggle"), false, guild) === "aus");
    check("Auswahl mit Label", ShowValue(Field("choice", { choices: [["direct", "Klassisch"]] }), "direct", guild) === "Klassisch");
    check("Zahl mit Einheit", ShowValue(Field("number", { unit: "Std." }), 24, guild) === "24 Std.");
    check("Leerer Text", ShowValue(Field("text"), "", guild) === "–");
}

/** Ein anderer, gültiger Wert für ein Feld - damit sich beim Speichern etwas ändert. */
function Other(field: IPanelField<unknown>, current: unknown): unknown {
    switch (field.kind) {
        case "toggle":
            return !current;
        case "channel": {
            const types = field.channelTypes ?? [ChannelType.GuildText];
            const pool = [TEXT, TEXT2, VOICE, CATEGORY, FORUM, THREAD].filter((id) => types.includes(FakeGuild().channels.cache.get(id)!.type));

            return pool.find((id) => id !== current) ?? null;
        }
        case "channels":
            return [TEXT2];
        case "role":
            return current === ROLE ? ROLE2 : ROLE;
        case "roles":
            return [ROLE2];
        case "choice":
            return field.choices!.map(([value]) => value).find((value) => value !== current);
        case "number": {
            const value = Number(current);

            return value + 1 <= (field.max ?? Infinity) ? value + 1 : value - 1;
        }
        case "text":
            // Ein Emoji-Feld (Clips: Abstimm-Emoji) nimmt nur ein Emoji an.
            return field.key === "emoji" ? (current === "🎬" ? "🔥" : "🎬") : "test-{nummer}";
        case "stages":
            return ParseStages("4 kick");
    }
}

async function checkRegisters(client: BotClient): Promise<Partial<Record<PanelModuleId, unknown>>> {
    console.log("\n  — Register —");

    const guild = FakeGuild();
    const welcome = DefaultWelcomeConfig();

    welcome.join = { ...welcome.join, channelId: TEXT };
    welcome.leave = { ...welcome.leave, channelId: TEXT };

    // Startwerte und das echte Clean je Modul mit Feldern. Module ohne Felder (A1) brauchen keine.
    const start: Partial<Record<PanelModuleId, unknown>> = {
        // Ein Warteraum ohne Meldekanal wird zu Recht abgelehnt - der Start hat deshalb einen.
        moderation: (() => {
            const config = DefaultModConfig();

            return { ...config, support: { ...config.support, notifyChannelId: TEXT }, teamRoles: [] };
        })(),
        tickets: { ...DefaultConfig(), teamRoles: [] },
        apply: DefaultApplySettings(),
        levels: DefaultLevelSettings(),
        welcome,
        // Teil 4 · Startwerte Gruppe Rocket League
        "rl-6mans": DefaultSixSettings(),
        lft: DefaultLftSettings(),
        teams: DefaultTeamSettings(),
        "rank-roles": DefaultRankRoleSettings(),
        // Teil 4 · Startwerte Gruppe Rest
        clips: DefaultClipSettings(),
        matchups: DefaultMatchupSettings(),
        // Die Vorgaben stehen in Settings() der Dienste, eine eigene Default-Funktion gibt es nicht.
        "voice-hub": { panel: "voice", panelChannelId: null, panelMessageId: null },
        "twitch-notifier": { liveRoleId: null, liveRoleFilter: null },
        "youtube-notifier": { liveRoleId: null },
        backups: DefaultBackupSettings(),
        // Teil 4 · Startwerte Gruppe Moderation
        automod: DefaultAutoModSettings(),
        "anti-villain": DefaultAntiVillainSettings(),
        logging: DefaultLogSettings(),
    };
    const clean: Partial<Record<PanelModuleId, (patch: Record<string, unknown>, previous: never) => unknown>> = {
        moderation: (patch, previous) => client.moderationService.Clean(guild, patch, previous),
        tickets: (patch, previous) => client.ticketService.Clean(guild, patch, previous),
        apply: (patch, previous) => client.applyService.CleanSettings(guild, patch, previous),
        levels: (patch, previous) => client.levelService.Clean(guild, patch, previous),
        welcome: (patch, previous) => client.welcomeService.Clean(guild, patch, previous),
        // Teil 4 · Clean Gruppe Rocket League
        "rl-6mans": (patch, previous) => client.sixMansService.CleanSettings(guild, patch, previous),
        lft: (patch, previous) => client.lookingForService.CleanSettings(guild, patch, previous),
        teams: (patch, previous) => client.teamService.CleanSettings(guild, patch, previous),
        "rank-roles": (patch, previous) => client.rankRoleService.CleanSettings(guild, patch, previous),
        // Teil 4 · Clean Gruppe Rest
        clips: (patch, previous) => client.clipService.CleanSettings(guild, patch, previous),
        matchups: (patch, previous) => client.matchupService.CleanSettings(guild, patch, previous),
        "voice-hub": (patch, previous) => client.voiceService.CleanModuleSettings(guild, patch, previous),
        "twitch-notifier": (patch) => client.streamService.CleanTwitchSettings(guild, patch),
        "youtube-notifier": (patch) => client.streamService.CleanYouTubeSettings(guild, patch),
        backups: (patch) => client.serverBackupService.CleanSettings(guild, patch),
        // Teil 4 · Clean Gruppe Moderation
        automod: (patch, previous) => client.autoModService.Clean(guild, patch, previous),
        "anti-villain": (patch, previous) => client.antiVillainService.Clean(guild, patch, previous),
        logging: (patch, previous) => client.logService.Clean(guild, patch, previous),
    };
    const order = PANEL_AREAS.flatMap((area) => area.ids).join(",");

    check("23 Module in der Reihenfolge der Bereiche, ohne Gallery", Object.keys(PANEL_MODULES).join(",") === order && Object.keys(PANEL_MODULES).length === 23 && !("gallery" in PANEL_MODULES), Object.keys(PANEL_MODULES).join(","));
    check("Höchstens 25 Module (Menü und Auswahl bei modul:)", Object.keys(PANEL_MODULES).length <= 25);

    for (const panel of Object.values(PANEL_MODULES)) {
        const fields = panel.sections.flatMap((section) => section.fields) as IPanelField<unknown>[];
        const keys = fields.map((field) => field.key);
        const previous = start[panel.id];

        if (!fields.length) {
            check(`${panel.name}: ohne Felder, dafür ein Satz (A1)`, Boolean(panel.about) && panel.sections.length === 0, panel.about ?? "kein Satz");
            continue;
        }

        check(`${panel.name}: ${fields.length} Felder, höchstens 25`, fields.length <= 25);
        check(`${panel.name}: kein Abschnitt über ${MAX_SECTION_FIELDS} Kacheln, sonst schneidet das Bild ab`, panel.sections.every((section) => section.fields.length <= MAX_SECTION_FIELDS), panel.sections.map((section) => section.fields.length).join(","));
        check(`${panel.name}: Startwerte und Clean für die Prüfung da`, previous !== undefined && clean[panel.id] !== undefined);

        if (previous === undefined || !clean[panel.id]) continue;

        check(`${panel.name}: Schlüssel eindeutig und ohne Doppelpunkt`, new Set(keys).size === keys.length && keys.every((key) => /^[A-Za-z0-9-]{1,24}$/.test(key)), keys.join(","));
        check(`${panel.name}: jedes Feld zeigt einen Wert`, fields.every((field) => ShowValue(field, field.get(previous), guild).length > 0));

        const wrong: string[] = [];

        for (const field of fields) {
            const value = Other(field, field.get(previous));
            const patch = field.set(value, previous);

            if (MODERATORS in patch || PANEL in patch) continue;

            let after: unknown;

            try {
                after = await clean[panel.id]!(patch, previous as never);
            } catch (error) {
                wrong.push(`${field.key}: ${String(error)}`);
                continue;
            }

            if (JSON.stringify(field.get(after)) !== JSON.stringify(value)) wrong.push(`${field.key}: ${JSON.stringify(field.get(after))} statt ${JSON.stringify(value)}`);

            for (const other of fields) {
                if (other === field || MODERATORS in other.set(other.get(previous), previous) || PANEL in other.set(other.get(previous), previous)) continue;
                if (JSON.stringify(other.get(after)) !== JSON.stringify(other.get(previous))) wrong.push(`${field.key} ändert ${other.key}`);
            }
        }

        check(`${panel.name}: jedes Feld ändert nur sich selbst`, wrong.length === 0, wrong.slice(0, 5).join(" | "));
    }

    // Review 09.11. (W2): Mit leeren Vorgaben fiele ein Verlust nicht auf. Gefüllt - Rollen je Rang, Rollen je Aufgabe, Log-Ziele,
    // Wortliste, Köder - darf ein Feld hin und zurück nichts am ganzen Objekt ändern, auch nicht an Daten ohne eigenes Feld.
    const filled: Partial<Record<PanelModuleId, unknown>> = (() => {
        const steps = Steps().map((step) => step.key);
        const rankRoles = DefaultRankRoleSettings();

        for (const playlist of Object.keys(rankRoles.playlists) as (keyof typeof rankRoles.playlists)[]) {
            rankRoles.playlists[playlist] = { ...rankRoles.playlists[playlist], roles: { [steps[0]]: ROLE, [steps[1]]: ROLE2 } };
        }

        const teams = DefaultTeamSettings();
        const lft = DefaultLftSettings();
        const villain = DefaultAntiVillainSettings();
        const automod = DefaultAutoModSettings();
        const logging = DefaultLogSettings();

        teams.channelId = TEXT;
        teams.roles = { sync: true, positions: { ...teams.roles.positions, captain: ROLE, sub: ROLE2 } };
        lft.notice = { ...lft.notice, channelId: TEXT, roles: [ROLE] };
        lft.manageRoles = [ROLE2];
        lft.player = { ...lft.player, forumId: FORUM };
        villain.quarantine = { ...villain.quarantine, roleId: ROLE, channelId: TEXT };
        villain.trustedRoles = [ROLE2];
        villain.logChannelId = THREAD;
        villain.bait = { ...villain.bait, channel: true, channelId: TEXT2, role: true, roleId: ROLE2 };
        villain.nuke = { ...villain.nuke, trustedBots: ["123456789012345678"] };
        automod.filters = { ...automod.filters, words: { ...automod.filters.words, words: ["foo", "bar"], action: "warn" } };
        automod.ignoreChannels = [TEXT];
        automod.ignoreRoles = [ROLE];
        automod.logChannelId = THREAD;
        logging.categories = Object.fromEntries(Object.keys(logging.categories).map((key, index) => [key, [TEXT, THREAD, TEXT2][index % 3]])) as typeof logging.categories;
        logging.ignoreChannels = [TEXT];
        logging.ignoreRoles = [ROLE];

        return {
            "rank-roles": rankRoles,
            teams,
            lft,
            "anti-villain": villain,
            automod,
            logging,
            "rl-6mans": { ...DefaultSixSettings(), channelId: TEXT, categoryId: CATEGORY },
            clips: { ...DefaultClipSettings(), channelId: TEXT, announceChannelId: TEXT2 },
            matchups: { ...DefaultMatchupSettings(), channelId: TEXT, pingRoles: [ROLE] },
            "twitch-notifier": { liveRoleId: ROLE, liveRoleFilter: ROLE2 },
            "voice-hub": { panel: "channel", panelChannelId: TEXT, panelMessageId: null },
        };
    })();

    for (const [id, value] of Object.entries(filled) as [PanelModuleId, unknown][]) {
        const panel = PANEL_MODULES[id];
        const run = clean[id]!;
        const fields = panel.sections.flatMap((section) => section.fields) as IPanelField<unknown>[];
        const baseline = JSON.stringify(await run({}, value as never));
        const problems: string[] = [];

        for (const field of fields) {
            try {
                const after = await run(field.set(Other(field, field.get(value)), value), value as never);
                const back = JSON.stringify(await run(field.set(field.get(value), after), after as never));

                if (back !== baseline && back !== JSON.stringify(value)) problems.push(`${field.key}: ${back.slice(0, 120)}`);
            } catch (error) {
                problems.push(`${field.key}: ${String(error)}`);
            }
        }

        check(`${panel.name}: gefüllt, jedes Feld hin und zurück ändert nichts am Rest`, problems.length === 0, problems.slice(0, 3).join(" | "));
    }

    // Was das Register selbst ablehnt, ohne Datenbank: Hub mit {teams} im Kopf.
    const layout = PANEL_MODULES.teams.sections.flatMap((section) => section.fields).find((field) => field.key === "layout")!;
    const withTeams = { ...DefaultTeamSettings(), layout: "cards" } as ReturnType<typeof DefaultTeamSettings>;

    // Das Register sucht {teams} im ganzen Kopf - der genaue Aufbau des Dokuments ist dafür egal.
    withTeams.board = { ...withTeams.board, doc: { blocks: [{ type: "text", text: "Unsere Teams: {teams}" }] } } as unknown as typeof withTeams.board;

    check(
        "Teams: Wechsel auf den Hub mit {teams} im Kopf wird mit Satz abgelehnt",
        (() => {
            try {
                layout.set("hub", withTeams);
            } catch (error) {
                return error instanceof PanelError && error.message.includes("{teams}");
            }

            return false;
        })()
    );

    const moderators = PANEL_MODULES.moderation.sections.flatMap((section) => section.fields).find((field) => field.key === "moderators");

    check("Moderatoren gehen über die Server-Einstellungen", JSON.stringify(moderators?.set([ROLE], start.moderation as never)) === JSON.stringify({ [MODERATORS]: [ROLE] }));

    // W-0014 Review: Das Speichern tauscht „ab“ und „bis“ still - das Panel lehnt verkehrt herum mit einem Satz ab.
    const levelField = (key: string) => PANEL_MODULES.levels.sections.flatMap((section) => section.fields).find((field) => field.key === key)!;
    const range = (key: string, value: number): string => {
        try {
            levelField(key).set(value, start.levels as never);
        } catch (error) {
            return error instanceof PanelError ? error.message : `kein PanelError: ${String(error)}`;
        }

        return "";
    };

    check("Level: „Punkte ab“ über „Punkte bis“ wird abgelehnt", range("chatMin", 30).startsWith("„Punkte ab“ darf höchstens 25"), range("chatMin", 30));
    check("Level: „Punkte bis“ unter „Punkte ab“ wird abgelehnt", range("chatMax", 10).startsWith("„Punkte bis“ muss mindestens 15"), range("chatMax", 10));
    check("Level: gleich geht", range("chatMin", 25) === "" && range("chatMax", 15) === "");
    // Das Dashboard schließt auch Kategorien und Sprachkanäle aus - das Menü muss sie zeigen, sonst gehen sie beim Speichern verloren.
    check(
        "Level: „Keine Punkte in“ bietet Kanäle und Kategorien an, wie das Dashboard",
        JSON.stringify(levelField("noChannels").channelTypes) === JSON.stringify([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory])
    );

    return start;
}

/** Wie viele Bausteine eine Nachricht hat - Discord erlaubt 40. */
function Count(json: unknown): number {
    if (Array.isArray(json)) return json.reduce((sum: number, item) => sum + Count(item), 0);
    if (!json || typeof json !== "object") return 0;

    return (typeof (json as { type?: unknown }).type === "number" ? 1 : 0) + Object.values(json as Record<string, unknown>).reduce((sum: number, value) => sum + Count(value), 0);
}

async function checkView(start: Partial<Record<PanelModuleId, unknown>>): Promise<void> {
    console.log("\n  — Panel als Bild —");

    SetEmojiLoader(async () => null);

    const guild = FakeGuild();
    const link = "https://example.test/dashboard/guild/1/tickets";

    for (const panel of Object.values(PANEL_MODULES)) {
        const fields = panel.sections.flatMap((section) => section.fields) as IPanelField<unknown>[];
        const state = { panel, settings: start[panel.id] ?? {}, on: true, guild, link };
        const message = await PanelView(state);
        const parts = message.components.map((part) => part.toJSON());
        const json = JSON.stringify(parts);
        const menu = (json.match(new RegExp(`"value":"[A-Za-z0-9-]+","description"`, "g")) ?? []).length;

        check(`${panel.name}: höchstens 10 Bilder, 40 Bausteine`, message.files.length >= 1 && message.files.length <= 10 && Count(parts) <= 40, `${message.files.length} Bilder, ${Count(parts)} Bausteine`);
        check(`${panel.name}: Knopf ins Dashboard und zu allen Modulen`, json.includes(link) && json.includes(`"custom_id":"set:s"`));

        if (!fields.length) {
            // Discord lehnt ein Menü ohne Einträge ab - ohne Felder gibt es keins, dafür den Satz im Bild.
            check(`${panel.name}: kein Menü „Was willst du ändern?“, der Satz steht im Bild`, !json.includes(`set:w:${panel.id}`) && JSON.stringify(PanelBlocks(state, {})).includes(panel.about ?? "–"));
            check(`${panel.name}: Knopf zum Ausschalten`, json.includes(`set:x:${panel.id}`) !== panel.permanent);
            continue;
        }

        check(`${panel.name}: Menü mit allen ${fields.length} Feldern, nummeriert`, json.includes(`"custom_id":"set:w:${panel.id}"`) && menu === fields.length && json.includes(`"label":"1 · ${fields[0].label}"`), `${menu} Einträge`);

        // Discord lehnt die ganze Nachricht ab, wenn ein Knopf ein Zeichen statt eines Emojis trägt (etwa ⏻).
        for (const view of [message, await PanelView({ ...state, on: false }, { done: { key: fields[0].key, before: "a", after: "b" } })]) {
            const emojis = [...JSON.stringify(view.components.map((part) => part.toJSON())).matchAll(/"emoji":\{"name":"([^"]+)"/g)].map((match) => match[1]);

            check(`${panel.name}: nur echte Emojis an Knöpfen und Menüs`, emojis.every((emoji) => /\p{Extended_Pictographic}/u.test(emoji)), emojis.join(" "));
        }
        check(`${panel.name}: ${panel.permanent ? "kein" : "ein"} Knopf zum Ausschalten`, json.includes(`set:x:${panel.id}`) !== panel.permanent);
    }

    const moderation = { panel: PANEL_MODULES.moderation, settings: start.moderation, on: true, guild, link };
    const pick = async (key: string) => JSON.stringify((await PanelView(moderation, { selected: key })).components.map((part) => part.toJSON()));
    const log = await pick("log");

    check("Kanal: Kanal-Auswahl, „Keiner“ und Zurück", log.includes(`"custom_id":"set:c:moderation:log"`) && log.includes('"type":8') && log.includes("set:n:moderation:log") && log.includes("set:b:moderation"));
    check("Kanal: das Menü „Was ändern?“ ist dann weg", !log.includes("set:w:moderation"));

    const dm = await pick("dm");

    check("An/Aus: zwei Knöpfe", dm.includes("set:t:moderation:dm:on") && dm.includes("set:t:moderation:dm:off"));

    const ping = await pick("ping");

    check("Rollen: Rollen-Auswahl mit mehreren", ping.includes(`"custom_id":"set:r:moderation:ping"`) && ping.includes('"type":6') && ping.includes('"max_values":5'));

    const days = await pick("warnDays");

    check("Auswahl: Menü mit den Möglichkeiten", days.includes(`"custom_id":"set:o:moderation:warnDays"`) && days.includes("für immer"));

    for (const key of ["remind", "stages"]) check(`Fenster für ${key}: Knopf „Ändern“`, (await pick(key)).includes(`set:f:moderation:${key}`));

    const blocks = JSON.stringify(PanelBlocks(moderation, { selected: "dm" }));

    check("Das Bild markiert die gewählte Kachel", blocks.includes('"label":"DM an den User","value":"an","state":"on","hi":true'), blocks.slice(0, 200));

    const done = JSON.stringify((await PanelView(moderation, { done: { key: "dm", before: "an", after: "aus" }, warning: "Mir fehlt etwas." })).components.map((part) => part.toJSON()));

    check("Nach dem Speichern: Zeile und Rückgängig", done.includes("✅ **DM an den User**: an → aus") && done.includes("set:u:moderation:dm") && done.includes("Mir fehlt etwas."));

    const off = JSON.stringify(PanelBlocks({ ...moderation, on: false }, {}));

    check("Modul aus: Hinweis im Bild", off.includes("Das Modul ist aus"));
    check("Modul aus: Knopf „Modul an“", JSON.stringify((await PanelView({ ...moderation, on: false })).components.map((part) => part.toJSON())).includes("Modul an"));

    const rows = Object.values(PANEL_MODULES).map((panel, index) => ({ panel, on: index % 2 === 0 }));
    const overview = await OverviewView(guild, rows, link);
    const overviewJson = JSON.stringify(overview.components.map((part) => part.toJSON()));
    const overviewBlocks = OverviewBlocks(guild, rows);
    const titles = overviewBlocks.flatMap((block) => (block.kind === "settings" && block.title ? [block.title] : []));
    const numbers = overviewBlocks.flatMap((block) => (block.kind === "settings" ? block.items.map((item) => item.n) : []));

    const missing = rows.filter((row) => !overviewJson.includes(`"value":"${row.panel.id}"`)).map((row) => row.panel.id);

    check("Übersicht: Menü „Modul wählen“ mit allen 23 Modulen", overviewJson.includes(`"custom_id":"set:m"`) && rows.length === 23 && missing.length === 0, missing.join(","));
    check("Übersicht: nach den Bereichen der Dashboard-Leiste", titles.join(",") === PANEL_AREAS.map((area) => area.name).join(","), titles.join(","));
    check("Übersicht: Nummern 1 bis 23 durchgezählt", numbers.join(",") === Array.from({ length: 23 }, (_, index) => index + 1).join(","));

    const dim = overviewBlocks.flatMap((block) => (block.kind === "settings" ? block.items.filter((item) => item.dim).map((item) => item.label) : []));

    check("Übersicht: Module ohne eigene Einstellungen blass", dim.join(",") === "Self Roles,Rollen-Listen,Giveaways,Umfragen,Custom Message", dim.join(","));
    check("Übersicht: auf mehrere Bilder verteilt, keins abgeschnitten", overview.files.length >= 2 && overview.files.length <= MAX_FILES_CHECK, `${overview.files.length} Bilder`);
}

async function Refused(run: () => Promise<unknown>): Promise<string> {
    try {
        await run();
    } catch (error) {
        return error instanceof PanelError ? error.message : `kein PanelError: ${String(error)}`;
    }

    return "";
}

async function checkService(client: BotClient): Promise<void> {
    console.log("\n  — Ändern und Rückgängig (Datenbank) —");

    const guild = FakeGuild();
    const member = (manage: boolean, id = "90071992547409990") =>
        ({ id, guild: { id: GUILD, ownerId: "1" }, permissions: { has: () => manage } }) as unknown as GuildMember;
    const service = new SettingsService(client);
    const admin = member(true);
    const before = (await client.modSettings.Of(GUILD)).dm;
    const changed = await service.Change(guild, admin, "moderation", "dm", !before);

    check("Ändern speichert", (await client.modSettings.Of(GUILD)).dm === !before);
    check("Die Antwort nennt alt und neu", changed.before === (before ? "an" : "aus") && changed.after === (before ? "aus" : "an"), JSON.stringify(changed));

    await service.Undo(guild, admin, "moderation", "dm");

    check("Rückgängig stellt zurück", (await client.modSettings.Of(GUILD)).dm === before);
    check("Rückgängig ohne Merker: ein Satz", (await Refused(() => new SettingsService(client).Undo(guild, admin, "moderation", "dm"))).startsWith("Rückgängig geht nicht mehr"));

    // W-0014 Review: Der Merker gilt je Server - auf einem anderen Server derselben Person gibt es nichts zurückzunehmen.
    await service.Change(guild, admin, "moderation", "dm", !before);

    const elsewhere = { id: "33333333333333333398" } as unknown as Guild;

    check("Rückgängig auf einem anderen Server: ein Satz, nichts geändert", (await Refused(() => service.Undo(elsewhere, admin, "moderation", "dm"))).startsWith("Rückgängig geht nicht mehr"));

    // Hat jemand den Wert danach geändert (Dashboard, anderer Admin), überschreibt Rückgängig das nicht still.
    await client.moderationService.SaveConfig(guild, { dm: before });

    check("Rückgängig nach fremder Änderung: ein Satz", (await Refused(() => service.Undo(guild, admin, "moderation", "dm"))).startsWith("Der Wert wurde inzwischen geändert"));
    check("Und der fremde Wert bleibt", (await client.modSettings.Of(GUILD)).dm === before);
    check("Ohne „Server verwalten“: abgelehnt", (await Refused(() => service.Change(guild, member(false), "moderation", "dm", true))) === "Einstellungen ändert nur, wer den Server verwaltet.");
    check("Zahl außerhalb: ein Satz", (await Refused(() => service.Change(guild, admin, "moderation", "remind", "999"))).includes("0 bis 120"));
    check("Und nichts gespeichert", (await client.modSettings.Of(GUILD)).support.remindAfter === 10);
    check("Kaputte Stufen: Satz mit Zeile", (await Refused(() => service.Change(guild, admin, "moderation", "stages", "3 boom"))).startsWith("Zeile 1"));

    await service.Change(guild, admin, "moderation", "stages", "2 timeout 30m\n4 kick");

    check("Stufen aus dem Fenster", StagesText((await client.modSettings.Of(GUILD)).stages) === "2 timeout 30m\n4 kick");

    await service.Change(guild, admin, "moderation", "proofTimeout", "86400");
    await service.Change(guild, admin, "moderation", "proofTimeout", "-");

    check("Auswahl „aus“ kommt als „-“ und wird wieder leer", (await client.modSettings.Of(GUILD)).proof.timeoutFrom === null);
    check("Ein Fehler des Moduls wird ein Satz", (await Refused(() => service.Change(guild, admin, "moderation", "room", VOICE))).startsWith("Wähle auch den Kanal"));
}

async function cleanup(client: BotClient): Promise<void> {
    await client.databaseService.Write("DELETE FROM mod_settings WHERE guild_id = ?", [GUILD]);
    client.modSettings.Forget();

    check("Aufgeräumt", (await client.modSettings.Of(GUILD)).stages.length === 2);
}

async function main(): Promise<void> {
    console.log("\n⚙️ Einstellungen\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkModel();
    await checkView(await checkRegisters(client));

    if (await client.databaseService.Connect()) {
        try {
            await checkService(client);
        } finally {
            console.log("\n  — Aufräumen —");

            await cleanup(client).catch((error) => check("Aufräumen lief durch", false, String(error)));
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
