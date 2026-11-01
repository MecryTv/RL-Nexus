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
import { OverviewView, PanelBlocks, PanelView } from "../builder/SettingsView";
import { DefaultApplySettings } from "../constants/Apply";
import { DefaultLevelSettings } from "../constants/Levels";
import { DefaultModConfig } from "../constants/Moderation";
import { DefaultConfig } from "../constants/Tickets";
import { DefaultWelcomeConfig } from "../constants/Welcome";
import { PANEL_MODULES } from "../services/settings/registers";
import { MODERATORS, PANEL } from "../services/settings/registers/Shared";
import { IPanelField, PanelError, PanelId, PanelModuleId, ParseStages, ReadPanelId, ShowValue, StagesText } from "../services/settings/SettingsModel";

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
            return "test-{nummer}";
        case "stages":
            return ParseStages("4 kick");
    }
}

function checkRegisters(client: BotClient): Record<PanelModuleId, unknown> {
    console.log("\n  — Register —");

    const guild = FakeGuild();
    const welcome = DefaultWelcomeConfig();

    welcome.join = { ...welcome.join, channelId: TEXT };
    welcome.leave = { ...welcome.leave, channelId: TEXT };

    const start: Record<PanelModuleId, unknown> = {
        // Ein Warteraum ohne Meldekanal wird zu Recht abgelehnt - der Start hat deshalb einen.
        moderation: (() => {
            const config = DefaultModConfig();

            return { ...config, support: { ...config.support, notifyChannelId: TEXT }, teamRoles: [] };
        })(),
        tickets: { ...DefaultConfig(), teamRoles: [] },
        apply: DefaultApplySettings(),
        levels: DefaultLevelSettings(),
        welcome,
    };
    const clean: Record<PanelModuleId, (patch: Record<string, unknown>, previous: never) => unknown> = {
        moderation: (patch, previous) => client.moderationService.Clean(guild, patch, previous),
        tickets: (patch, previous) => client.ticketService.Clean(guild, patch, previous),
        apply: (patch, previous) => client.applyService.CleanSettings(guild, patch, previous),
        levels: (patch, previous) => client.levelService.Clean(guild, patch, previous),
        welcome: (patch, previous) => client.welcomeService.Clean(guild, patch, previous),
    };

    check("Fünf Module", Object.keys(PANEL_MODULES).join(",") === "moderation,tickets,apply,levels,welcome", Object.keys(PANEL_MODULES).join(","));

    for (const panel of Object.values(PANEL_MODULES)) {
        const fields = panel.sections.flatMap((section) => section.fields) as IPanelField<unknown>[];
        const keys = fields.map((field) => field.key);
        const previous = start[panel.id];

        check(`${panel.name}: ${fields.length} Felder, höchstens 25`, fields.length > 0 && fields.length <= 25);
        check(`${panel.name}: Schlüssel eindeutig und ohne Doppelpunkt`, new Set(keys).size === keys.length && keys.every((key) => /^[A-Za-z0-9-]{1,24}$/.test(key)), keys.join(","));
        check(`${panel.name}: jedes Feld zeigt einen Wert`, fields.every((field) => ShowValue(field, field.get(previous), guild).length > 0));

        const wrong: string[] = [];

        for (const field of fields) {
            const value = Other(field, field.get(previous));
            const patch = field.set(value, previous);

            if (MODERATORS in patch || PANEL in patch) continue;

            let after: unknown;

            try {
                after = clean[panel.id](patch, previous as never);
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

    const moderators = PANEL_MODULES.moderation.sections.flatMap((section) => section.fields).find((field) => field.key === "moderators");

    check("Moderatoren gehen über die Server-Einstellungen", JSON.stringify(moderators?.set([ROLE], start.moderation as never)) === JSON.stringify({ [MODERATORS]: [ROLE] }));

    return start;
}

/** Wie viele Bausteine eine Nachricht hat - Discord erlaubt 40. */
function Count(json: unknown): number {
    if (Array.isArray(json)) return json.reduce((sum: number, item) => sum + Count(item), 0);
    if (!json || typeof json !== "object") return 0;

    return (typeof (json as { type?: unknown }).type === "number" ? 1 : 0) + Object.values(json as Record<string, unknown>).reduce((sum: number, value) => sum + Count(value), 0);
}

async function checkView(start: Record<PanelModuleId, unknown>): Promise<void> {
    console.log("\n  — Panel als Bild —");

    SetEmojiLoader(async () => null);

    const guild = FakeGuild();
    const link = "https://example.test/dashboard/guild/1/tickets";

    for (const panel of Object.values(PANEL_MODULES)) {
        const fields = panel.sections.flatMap((section) => section.fields) as IPanelField<unknown>[];
        const state = { panel, settings: start[panel.id], on: true, guild, link };
        const message = await PanelView(state);
        const parts = message.components.map((part) => part.toJSON());
        const json = JSON.stringify(parts);
        const menu = (json.match(new RegExp(`"value":"[A-Za-z0-9-]+","description"`, "g")) ?? []).length;

        check(`${panel.name}: höchstens 10 Bilder, 40 Bausteine`, message.files.length >= 1 && message.files.length <= 10 && Count(parts) <= 40, `${message.files.length} Bilder, ${Count(parts)} Bausteine`);
        check(`${panel.name}: Menü mit allen ${fields.length} Feldern, nummeriert`, json.includes(`"custom_id":"set:w:${panel.id}"`) && menu === fields.length && json.includes(`"label":"1 · ${fields[0].label}"`), `${menu} Einträge`);
        check(`${panel.name}: Knopf ins Dashboard`, json.includes(link));
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

    const overview = await OverviewView(guild, Object.values(PANEL_MODULES).map((panel, index) => ({ panel, on: index % 2 === 0 })), link);
    const overviewJson = JSON.stringify(overview.components.map((part) => part.toJSON()));

    check("Übersicht: Menü „Modul wählen“ mit fünf Modulen", overviewJson.includes(`"custom_id":"set:m"`) && (overviewJson.match(/"value":"(moderation|tickets|apply|levels|welcome)"/g) ?? []).length === 5);
    check("Übersicht: ein Bild", overview.files.length >= 1);
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
    await checkView(checkRegisters(client));

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
