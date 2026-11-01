/**
 * Prüft das Einstellungs-Panel (/einstellungen, W-0014 Teil 3) ohne Discord:
 * IDs, Stufen-Text, Anzeige der Werte - und, sofern eine Datenbank da ist,
 * Ändern und Rückgängig an einer erfundenen Guild, die am Ende wieder weg ist.
 *
 *   npm run check:settings
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import BotClient from "../client/BotClient";
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

function checkRegisters(client: BotClient): void {
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
}

async function main(): Promise<void> {
    console.log("\n⚙️ Einstellungen\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkModel();
    checkRegisters(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
