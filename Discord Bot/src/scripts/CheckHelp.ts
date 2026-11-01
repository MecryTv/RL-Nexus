/**
 * Prüft /hilfe ohne Discord: Hilfetexte gegen die echten Befehle, die Seiten
 * und das Banner.
 *
 *   npm run check:help
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder } from "discord.js";
import { glob } from "glob";
import path from "path";
import { pathToFileURL } from "url";
import BotClient from "../client/BotClient";
import { HelpCatalog, IHelpText, IsGroupText } from "../constants/Help";
import { HELP_CATALOG } from "../constants/HelpCatalog";
import { BuildHelp, CatalogProblems, IHelpSource } from "../services/help/HelpModel";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Zwei Befehle und ein Rechtsklick, gebaut wie echte. */
function FakeCommands() {
    const probe = new SlashCommandBuilder()
        .setName("probe")
        .setDescription("Probe")
        .addUserOption((option) => option.setName("user").setDescription("Wer").setRequired(true))
        .addStringOption((option) => option.setName("dauer").setDescription("Wie lange").addChoices({ name: "1h", value: "1h" }, { name: "1d", value: "1d" }));
    const gruppe = new SlashCommandBuilder()
        .setName("gruppe")
        .setDescription("Gruppe")
        .addSubcommand((sub) => sub.setName("a").setDescription("A").addIntegerOption((option) => option.setName("nummer").setDescription("Nr").setRequired(true)))
        .addSubcommand((sub) => sub.setName("b").setDescription("B"));
    const menu = new ContextMenuCommandBuilder().setName("Hack melden").setType(ApplicationCommandType.User);

    return [
        { name: "probe", developerOnly: false, data: probe },
        { name: "gruppe", developerOnly: false, data: gruppe },
        { name: "Hack melden", developerOnly: false, data: menu },
    ];
}

function Text(fields: Record<string, string> = {}) {
    return { emoji: "⏱️", area: "moderation" as const, module: "moderation", who: "team" as const, whoText: "Team mit „Mitglieder moderieren“", what: "Macht etwas.", examples: [], fields, after: [] };
}

function FakeCatalog(): HelpCatalog {
    return {
        probe: Text({ user: "Wer", dauer: "Wie lange" }),
        gruppe: {
            emoji: "📁",
            area: "moderation",
            module: "moderation",
            what: "Eine Gruppe.",
            // b vor a: die Reihenfolge der Kapitel kommt aus dem Katalog.
            subs: { b: { ...Text(), when: "Zuerst" }, a: { ...Text({ nummer: "Welche" }), when: "Danach" } },
        },
        "Hack melden": { ...Text(), area: "moderation", module: "anti-villain", who: "alle" },
    };
}

function checkModel(): void {
    console.log("\n  — Modell —");

    const entries = BuildHelp(FakeCommands(), FakeCatalog());
    const probe = entries.find((entry) => entry.name === "probe");
    const fields = probe?.commands[0].fields ?? [];

    check("Ein Eintrag je Befehl", entries.length === 3, String(entries.length));
    check("Felder aus der Definition", fields.map((field) => field.name).join(",") === "user,dauer", fields.map((field) => field.name).join(","));
    check("Pflicht kommt mit", fields[0]?.required === true && fields[1]?.required === false);
    check("Auswahl kommt mit", fields[1]?.choices.join(",") === "1h,1d", fields[1]?.choices.join(","));
    check("Erklärung aus dem Katalog", fields[0]?.text === "Wer");
    check("Ohne Gruppe: kein group", probe?.group === null && probe?.commands.length === 1 && probe.commands[0].display === "/probe");

    const gruppe = entries.find((entry) => entry.name === "gruppe");

    check("Gruppe erkannt", gruppe?.group !== null && gruppe?.group?.what === "Eine Gruppe.");
    check("Kapitel in Katalog-Reihenfolge", gruppe?.commands.map((command) => command.key).join(",") === "gruppe b,gruppe a", gruppe?.commands.map((command) => command.key).join(","));
    check("Unterbefehl zeigt /gruppe a", gruppe?.commands.find((command) => command.key === "gruppe a")?.display === "/gruppe a");

    const menu = entries.find((entry) => entry.name === "Hack melden");

    check("Rechtsklick erkannt", menu?.commands[0].menu === true && menu.commands[0].display === "Rechtsklick › Apps › Hack melden", menu?.commands[0].display);

    check("Richtiger Katalog: keine Probleme", CatalogProblems(FakeCommands(), FakeCatalog()).length === 0, CatalogProblems(FakeCommands(), FakeCatalog()).join(" | "));

    const neu = { name: "neu", developerOnly: false, data: new SlashCommandBuilder().setName("neu").setDescription("Neu") };
    const problems = (catalog: HelpCatalog, commands = FakeCommands()) => CatalogProblems(commands, catalog).join(" | ");
    const broken = FakeCatalog();

    check("Fehlender Text", problems(FakeCatalog(), [...FakeCommands(), neu]).includes("/neu hat keinen Hilfetext"), problems(FakeCatalog(), [...FakeCommands(), neu]));

    (broken.probe as { fields: Record<string, string> }).fields = { user: "Wer", xyz: "?" };
    check("Erfundenes Feld", problems(broken).includes("/probe: Feld „xyz“ gibt es nicht"), problems(broken));
    check("Feld ohne Erklärung", problems(broken).includes("/probe: Feld „dauer“ ohne Erklärung"), problems(broken));

    const noSub = FakeCatalog();

    delete (noSub.gruppe as { subs: Record<string, unknown> }).subs.a;
    check("Unterbefehl ohne Text", problems(noSub).includes("/gruppe a hat keinen Hilfetext"), problems(noSub));

    const extra = { ...FakeCatalog(), weg: Text() };

    check("Text ohne Befehl", problems(extra).includes("Hilfetext zu /weg, den Befehl gibt es nicht"), problems(extra));
}

/** Alle Befehle, geladen wie im ConstructionHandler, nur ohne Discord. */
async function RealCommands(client: BotClient): Promise<IHelpSource[]> {
    const files = await glob("**/*.{ts,js}", { cwd: path.join(__dirname, "../commands"), absolute: true });
    const list: IHelpSource[] = [];

    for (const file of files) {
        const imported = await import(pathToFileURL(file).href);
        const Class = imported.default?.default ?? imported.default;

        list.push(new Class(client));
    }

    return list;
}

async function checkCatalog(client: BotClient): Promise<void> {
    console.log("\n  — Echte Befehle —");

    const commands = await RealCommands(client);
    const problems = CatalogProblems(commands, HELP_CATALOG);

    check(`Jeder der ${commands.length} Befehle hat stimmige Hilfetexte`, problems.length === 0, `${problems.length}: ${problems.slice(0, 8).join(" | ")}`);

    const texts: [string, IHelpText][] = [];

    for (const [name, text] of Object.entries(HELP_CATALOG)) {
        if (IsGroupText(text)) for (const [sub, subText] of Object.entries(text.subs)) texts.push([`${name} ${sub}`, subText]);
        else texts.push([name, text]);
    }

    const all = (text: IHelpText) => [text.whoText, text.what, text.tip ?? "", text.when ?? "", ...text.after, ...Object.values(text.fields), ...text.examples.flatMap((example) => [example.code, example.text])];
    const dashes = texts.filter(([, text]) => all(text).some((line) => line.includes("—") || line.includes(" – ")));

    check("Keine Gedankenstriche in den Texten", dashes.length === 0, dashes.map(([key]) => key).join(", "));

    const wrong = texts.filter(([key, text]) => text.examples.some((example) => !example.code.startsWith(`/${key}`)));

    check("Beispiele beginnen mit dem eigenen Befehl", wrong.length === 0, wrong.map(([key]) => key).join(", "));
    check("Jeder Slash-Befehl hat ein Beispiel", texts.filter(([key, text]) => key !== "Hack melden" && text.examples.length === 0).length === 0, texts.filter(([key, text]) => key !== "Hack melden" && text.examples.length === 0).map(([key]) => key).join(", "));
}

async function main(): Promise<void> {
    checkModel();
    await checkCatalog(new BotClient());

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures > 0 ? 1 : 0);
}

void main();
