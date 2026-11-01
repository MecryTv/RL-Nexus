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
import { loadImage } from "@napi-rs/canvas";
import { RenderHelpBanner } from "../builder/HelpBanner";
import path from "path";
import { pathToFileURL } from "url";
import BotClient from "../client/BotClient";
import { HELP_PREFIX, HelpCatalog, IHelpText, IsGroupText, STATUS_URL, SUPPORT_URL } from "../constants/Help";
import { HELP_CATALOG } from "../constants/HelpCatalog";
import { BuildHelp, CatalogProblems, IHelpSource } from "../services/help/HelpModel";
import { AreaOf, HelpAreaView, HelpCommandView, HelpStartView, IHelpContext, IHelpPayload, IHelpStart } from "../builder/HelpView";

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
    return { emoji: "⏱️", area: "moderation" as const, module: "moderation", who: "team" as const, whoText: "Team mit „Mitglieder moderieren“", what: "Macht etwas.", examples: [{ code: "/probe user:@nico", text: "Ein Beispiel" }], fields, after: ["Etwas passiert"] };
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
    const real = BuildHelp(commands, HELP_CATALOG);
    const views: [string, ReturnType<typeof Flat>][] = [];

    for (const entry of real) {
        for (const key of [null, ...entry.commands.map((command) => command.key)]) {
            for (let page = 0; page < 6; page++) views.push([`${key ?? entry.name} S${page + 1}`, Flat(HelpCommandView(entry, key, page, CONTEXT))]);
        }
    }

    for (const area of new Set(real.map(AreaOf))) for (let page = 0; page < 4; page++) views.push([`Bereich ${area} S${page + 1}`, Flat(HelpAreaView(area, real, CONTEXT, page))]);

    const big = views.filter(([, view]) => view.texts.length >= 4000 || view.count > 40 || view.texts.includes("…"));

    check(`Alle ${views.length} echten Seiten passen in eine Nachricht`, big.length === 0, big.map(([name, view]) => `${name}: ${view.texts.length}/${view.count}`).slice(0, 6).join(", "));
    check("Jeder Slash-Befehl hat ein Beispiel", texts.filter(([key, text]) => key !== "Hack melden" && text.examples.length === 0).length === 0, texts.filter(([key, text]) => key !== "Hack melden" && text.examples.length === 0).map(([key]) => key).join(", "));
}

const CONTEXT: IHelpContext = {
    guildId: "123456789012345678",
    dashboard: "https://example.test/dashboard",
    docs: "https://example.test/dashboard/docu.html",
    enabled: new Set(["moderation"]),
};

/** Alle Texte einer Nachricht in einem String, dazu die Zahl der Bausteine. */
function Flat(payload: IHelpPayload): { json: string; texts: string; count: number } {
    const json = JSON.stringify(payload.components);
    const texts: string[] = [];
    let count = 0;
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;

        const record = node as Record<string, unknown>;

        if (typeof record.type === "number") count++;
        if (typeof record.content === "string") texts.push(record.content);

        Object.values(record).forEach(walk);
    };

    walk(JSON.parse(json));

    return { json, texts: texts.join("\n"), count };
}

function checkPages(): void {
    console.log("\n  — Seiten —");

    const entries = BuildHelp(FakeCommands(), FakeCatalog());
    const start: IHelpStart = { name: "Joe", banner: "hilfe.png", modules: { on: 9, all: 24 }, commands: 38, access: { value: "Paid", sub: "bis 01.12." }, version: "v1.0" };
    const page = Flat(HelpStartView(start, entries, CONTEXT));

    check("Start: Banner als Bild", page.json.includes("attachment://hilfe.png"));
    check("Start: mit Banner kein Willkommen im Text", !page.texts.includes("Willkommen, Joe"));
    check("Start: ohne Banner Willkommen im Text", Flat(HelpStartView({ ...start, banner: null }, entries, CONTEXT)).texts.includes("Willkommen, Joe"));
    check("Start: vier Kacheln", ["Module an", "9/24", "Befehle", "38", "Zugang", "Paid", "bis 01.12.", "Version", "v1.0"].every((part) => page.texts.includes(part)), page.texts.slice(0, 300));
    check("Start: In drei Schritten startklar", page.texts.includes("In drei Schritten startklar") && page.texts.includes("/module") && page.texts.includes("/hilfe befehl:"));
    check("Start: Bereich mit Zahl", page.texts.includes("Moderation") && page.texts.includes("4 Befehle"), page.texts);
    check("Start: leere Bereiche fehlen", !page.texts.includes("Rocket League"));
    check("Start: Menü Bereich öffnen", page.json.includes(`"custom_id":"${HELP_PREFIX}bereich"`));
    check(
        "Start: vier Links",
        [`${CONTEXT.dashboard}/guild/${CONTEXT.guildId}`, CONTEXT.docs, STATUS_URL, SUPPORT_URL].every((url) => page.json.includes(`"url":"${url}`)),
        page.json.slice(0, 200)
    );
    check("Start: pingt niemanden", JSON.stringify(HelpStartView(start, entries, CONTEXT).allowedMentions) === JSON.stringify({ parse: [] }));

    const area = Flat(HelpAreaView("moderation", entries, CONTEXT));

    check("Bereich: jeder Befehl mit Abzeichen", area.texts.includes("/probe") && area.texts.includes("Team") && area.texts.includes("/gruppe a") && area.texts.includes("alle"), area.texts);
    check("Bereich: Felder grau darunter", area.texts.includes("user*") && area.texts.includes("dauer"), area.texts);
    check("Bereich: Modul aus bei abgeschaltetem Modul", area.texts.includes("Modul aus") && area.texts.includes("/module an modul:anti-villain"), area.texts);
    check("Bereich: kein Modul aus bei eingeschaltetem", (area.texts.match(/Modul aus/g) ?? []).length === 1, String((area.texts.match(/Modul aus/g) ?? []).length));
    check("Bereich: Menü Befehl erklären", area.json.includes(`"custom_id":"${HELP_PREFIX}befehl"`));
    check("Bereich: zurück zur Übersicht", area.json.includes(`"custom_id":"${HELP_PREFIX}start"`));
    check("Bereich: Im Dashboard", area.json.includes(`"url":"${CONTEXT.dashboard}/guild/${CONTEXT.guildId}/moderation"`));

    const probe = entries.find((entry) => entry.name === "probe")!;
    const single = Flat(HelpCommandView(probe, null, 0, CONTEXT));

    check("Befehl: Abschnitte", ["Was er macht", "So nutzt du ihn", "Felder", "Was danach passiert"].every((part) => single.texts.includes(part)), single.texts);
    check("Befehl: Pflichtfeld mit Stern", single.texts.includes("user*"), single.texts);
    check("Befehl: Auswahl genannt", single.texts.includes("1h, 1d"), single.texts);
    check("Befehl: zurück zum Bereich", single.json.includes(`"custom_id":"${HELP_PREFIX}a:moderation"`));
    check("Befehl: Doku zum Bereich", single.json.includes(`"url":"${CONTEXT.docs}#docg-moderation"`));

    const gruppe = entries.find((entry) => entry.name === "gruppe")!;
    const group = Flat(HelpCommandView(gruppe, null, 0, CONTEXT));

    check("Gruppe: Kapitel nummeriert in Katalog-Reihenfolge", group.texts.indexOf("Zuerst") < group.texts.indexOf("Danach") && group.texts.includes("**1**") && group.texts.includes("**2**"), group.texts);
    check("Gruppe: Unterbefehl erklären per Menü", group.json.includes(`"value":"gruppe a"`));

    const sub = Flat(HelpCommandView(gruppe, "gruppe a", 0, CONTEXT));

    check("Unterbefehl: eigene Seite A", sub.texts.includes("/gruppe a") && sub.texts.includes("Was er macht") && sub.texts.includes("nummer*"), sub.texts);
    check("Unterbefehl: zurück zur Gruppe", sub.json.includes(`"custom_id":"${HELP_PREFIX}seite:gruppe:-:0"`));

    const long = { ...probe, commands: [{ ...probe.commands[0], text: { ...probe.commands[0].text, examples: Array.from({ length: 12 }, (_, index) => ({ code: `/probe ${"x".repeat(380)} ${index}`, text: `Beispiel ${index}` })) } }] };
    const first = Flat(HelpCommandView(long, null, 0, CONTEXT));
    const second = Flat(HelpCommandView(long, null, 1, CONTEXT));

    check("Lang: wird geteilt, nicht gekürzt", !first.texts.includes("…") && first.json.includes(`"custom_id":"${HELP_PREFIX}seite:probe:-:1"`), first.json.slice(-400));
    check("Lang: Seite 2 hat den Rest", second.texts.includes("Beispiel 11") && second.json.includes(`"custom_id":"${HELP_PREFIX}seite:probe:-:0"`));
    check("Lang: jede Seite unter 4000 Zeichen und 40 Bausteinen", [first, second].every((part) => part.texts.length < 4000 && part.count <= 40), `${first.texts.length}/${first.count}, ${second.texts.length}/${second.count}`);

    const many = Array.from({ length: 30 }, (_, index) => ({ ...probe, name: `probe${index}`, commands: [{ ...probe.commands[0], key: `probe${index}`, display: `/probe${index}` }] }));
    const crowded = Flat(HelpAreaView("moderation", many, CONTEXT));

    check("Viele Befehle: Menü höchstens 25", (crowded.json.match(/"value":"probe\d+"/g) ?? []).length <= 25);
    check("Viele Befehle: unter 4000 Zeichen und 40 Bausteinen", crowded.texts.length < 4000 && crowded.count <= 40, `${crowded.texts.length}/${crowded.count}`);
}

async function checkBanner(): Promise<void> {
    console.log("\n  — Banner —");

    const png = await RenderHelpBanner({ name: "MecryTv | Joe", avatar: null });
    const image = await loadImage(png);

    check("Banner ist ein PNG", png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    check("Banner 1100 × 280", image.width === 1100 && image.height === 280, `${image.width} × ${image.height}`);

    const long = await RenderHelpBanner({ name: `${"Sehr langer Name ".repeat(4)}🎮`, avatar: png });

    check("Langer Name mit Emoji und Bild als Logo geht", long.length > 1000);
}

async function main(): Promise<void> {
    checkModel();
    checkPages();
    await checkBanner();
    await checkCatalog(new BotClient());

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures > 0 ? 1 : 0);
}

void main();
