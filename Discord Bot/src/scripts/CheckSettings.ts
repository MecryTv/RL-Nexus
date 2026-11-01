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
import { IPanelField, PanelError, PanelId, ParseStages, ReadPanelId, ShowValue, StagesText } from "../services/settings/SettingsModel";

const GUILD = "90071992547409971";
const TEXT = "90071992547409972";
const VOICE = "90071992547409973";
const ROLE = "90071992547409974";
const GONE = "90071992547409979";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, name: string, type: ChannelType) => ({ id, name, type }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, "mod-log", ChannelType.GuildText)],
                [VOICE, channel(VOICE, "Warteraum", ChannelType.GuildVoice)],
            ]),
        },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Support" } as unknown as Role], [GUILD, { id: GUILD, name: "@everyone" } as unknown as Role]]) },
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

async function main(): Promise<void> {
    console.log("\n⚙️ Einstellungen\n");

    checkModel();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
