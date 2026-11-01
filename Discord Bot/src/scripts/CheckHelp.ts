/**
 * Prüft /hilfe ohne Discord: Hilfetexte gegen die echten Befehle, die Seiten
 * und das Banner.
 *
 *   npm run check:help
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ApplicationCommandType, Collection, ContextMenuCommandBuilder, Guild, SlashCommandBuilder } from "discord.js";
import HelpService from "../services/help/HelpService";
import HelpButtons from "../events/help/HelpButtons";
import { glob } from "glob";
import { loadImage } from "@napi-rs/canvas";
import { RenderHelpBanner } from "../builder/HelpBanner";
import { HelpAlt, HelpBlock, RenderHelpImages, SetEmojiLoader } from "../builder/HelpImage";
import path from "path";
import { pathToFileURL } from "url";
import BotClient from "../client/BotClient";
import { HELP_PREFIX, HelpCatalog, IHelpText, IsGroupText, STATUS_URL, SUPPORT_URL } from "../constants/Help";
import { HELP_CATALOG } from "../constants/HelpCatalog";
import { BuildHelp, CatalogProblems, IHelpSource } from "../services/help/HelpModel";
import { AreaOf, ComposeHelp, HelpAreaPage, HelpCommandPage, HelpStartPage, IHelpContext, IHelpPage, IHelpStart, PageContainer } from "../builder/HelpView";

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

    check("Rechtsklick erkannt", menu?.commands[0].menu === "user" && menu.commands[0].display === "Rechtsklick › Apps › Hack melden", menu?.commands[0].display);

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
    const pages: [string, IHelpPage][] = [];

    for (const entry of real) for (const key of [null, ...entry.commands.map((command) => command.key)]) pages.push([key ?? entry.name, HelpCommandPage(entry, key, 0, CONTEXT)]);
    for (const area of new Set(real.map(AreaOf))) pages.push([`Bereich ${area}`, HelpAreaPage(area, real, CONTEXT, 0)]);

    const tooBig: string[] = [];

    for (const [name, page] of pages) {
        const message = await ComposeHelp(page, null);
        const count = Flat(page).count;

        if (message.files.length > 10 || count > 40) tooBig.push(`${name}: ${message.files.length} Bilder, ${count} Bausteine`);
    }

    check(`Alle ${pages.length} echten Seiten passen in eine Nachricht`, tooBig.length === 0, tooBig.slice(0, 6).join(", "));

    // Alle Seiten eines Befehls zusammen - das Kapitel darf auch auf Seite 2 stehen.
    const blocksOf = (name: string) => {
        const entry = real.find((candidate) => candidate.name === name);

        return entry ? [0, 1, 2, 3].flatMap((index) => HelpCommandPage(entry, null, index, CONTEXT).blocks) : [];
    };

    for (const name of ["warn", "timeout", "kick", "ban"]) {
        const steps = blocksOf(name).find((block) => block.kind === "steps" && block.title === "Beweise anhängen");
        const items = steps?.kind === "steps" ? steps.items.join(" ") : "";

        check(
            `/${name}: Kapitel „Beweise anhängen“ mit drei Wegen`,
            steps?.kind === "steps" && steps.items.length === 3 && items.includes("beweislink") && items.includes("/fall beweis") && items.includes("Als Beweis sichern"),
            items
        );
    }

    check("/unwarn hat kein solches Kapitel", !blocksOf("unwarn").some((block) => block.kind === "steps" && block.title === "Beweise anhängen"));

    const save = real.find((entry) => entry.name === "Als Beweis sichern");

    check("„Als Beweis sichern“ ist ein Rechtsklick auf eine Nachricht", save?.commands[0].menu === "message", String(save?.commands[0].menu));
    check("Die Hilfe sagt „Rechtsklick auf die Nachricht“", JSON.stringify(blocksOf("Als Beweis sichern")).includes("Rechtsklick auf die Nachricht"));
    check("„Hack melden“ bleibt ein Rechtsklick auf die Person", JSON.stringify(blocksOf("Hack melden")).includes("Rechtsklick auf die Person"));
    const menus = new Set(real.flatMap((entry) => entry.commands.filter((command) => command.menu).map((command) => command.key)));
    const bare = texts.filter(([key, text]) => !menus.has(key) && text.examples.length === 0).map(([key]) => key);

    check("Jeder Slash-Befehl hat ein Beispiel", bare.length === 0, bare.join(", "));
}

const CONTEXT: IHelpContext = {
    guildId: "123456789012345678",
    dashboard: "https://example.test/dashboard",
    docs: "https://example.test/dashboard/docu.html",
    enabled: new Set(["moderation"]),
};

/** Inhalt einer Seite als Text, dazu die Bausteine der Nachricht (mit Platzhaltern für die Bilder). */
function Flat(page: IHelpPage): { json: string; texts: string; count: number } {
    const json = JSON.stringify(PageContainer(page, [...(page.banner ? [{ name: "hilfe.png", alt: "Banner" }] : []), { name: "hilfe-1.png", alt: "Bild" }]).toJSON());
    let count = 0;
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        if (typeof (node as { type?: unknown }).type === "number") count++;

        Object.values(node as Record<string, unknown>).forEach(walk);
    };

    walk(JSON.parse(json));

    return { json, texts: JSON.stringify(page.blocks), count };
}

function checkPages(): void {
    console.log("\n  — Seiten —");

    const entries = BuildHelp(FakeCommands(), FakeCatalog());
    const start: IHelpStart = { name: "Joe", modules: { on: 9, all: 24 }, commands: 38, access: { value: "Paid", sub: "bis 01.12." }, version: "v1.0" };
    const startPage = HelpStartPage(start, entries, CONTEXT);
    const page = Flat(startPage);

    check("Start: Banner als Bild vorn", startPage.banner && page.json.indexOf("attachment://hilfe.png") < page.json.indexOf("attachment://hilfe-1.png"));
    check("Start: Willkommen nur ohne Banner", !page.texts.includes("Willkommen, Joe") && JSON.stringify(startPage.fallback).includes("Willkommen, Joe"));
    check("Start: vier Kacheln", ["Module an", "9/24", "Befehle", "38", "Paid", "bis 01.12.", "Version", "v1.0"].every((part) => page.texts.includes(part)), page.texts.slice(0, 300));
    check("Start: In drei Schritten startklar", page.texts.includes("In drei Schritten startklar") && page.texts.includes("/module") && page.texts.includes("/hilfe befehl:"));
    check("Start: Bereich mit Zahl", page.texts.includes("Moderation") && page.texts.includes("4 Befehle"), page.texts);
    check("Start: leere Bereiche fehlen", !page.texts.includes("Rocket League"));
    check("Start: Menü Bereich öffnen", page.json.includes(`"custom_id":"${HELP_PREFIX}bereich"`));
    check(
        "Start: vier Links",
        [`${CONTEXT.dashboard}/guild/${CONTEXT.guildId}`, CONTEXT.docs, STATUS_URL, SUPPORT_URL].every((url) => page.json.includes(`"url":"${url}`)),
        page.json.slice(0, 200)
    );
    check("Bilder mit Beschreibung", page.json.includes(`"description":"Bild"`));

    const area = Flat(HelpAreaPage("moderation", entries, CONTEXT));

    check("Bereich: jeder Befehl mit Abzeichen", area.texts.includes("/probe") && area.texts.includes("Team") && area.texts.includes("/gruppe a") && area.texts.includes("alle"), area.texts);
    check("Bereich: Felder grau darunter", area.texts.includes("user*") && area.texts.includes("dauer"), area.texts);
    check("Bereich: Modul aus bei abgeschaltetem Modul", area.texts.includes("Modul aus") && area.texts.includes("/module an modul:anti-villain"), area.texts);
    check("Bereich: kein Modul aus bei eingeschaltetem", (area.texts.match(/Modul aus/g) ?? []).length === 1, String((area.texts.match(/Modul aus/g) ?? []).length));

    const allOff = Flat(HelpAreaPage("moderation", entries, { ...CONTEXT, enabled: new Set() }));

    check("Bereich: Modul aus nur einmal je Modul", (allOff.texts.match(/Modul aus/g) ?? []).length === 2, String((allOff.texts.match(/Modul aus/g) ?? []).length));
    check("Bereich: Menü Befehl erklären", area.json.includes(`"custom_id":"${HELP_PREFIX}befehl"`));
    check("Bereich: zurück zur Übersicht", area.json.includes(`"custom_id":"${HELP_PREFIX}start"`));
    check("Bereich: Im Dashboard", area.json.includes(`"url":"${CONTEXT.dashboard}/guild/${CONTEXT.guildId}/moderation"`));

    const probe = entries.find((entry) => entry.name === "probe")!;
    const singlePage = HelpCommandPage(probe, null, 0, CONTEXT);
    const single = Flat(singlePage);
    const fields = singlePage.blocks.find((block) => block.kind === "fields");

    check("Befehl: Abschnitte", ["Was er macht", "So nutzt du ihn", "Felder", "Was danach passiert"].every((part) => single.texts.includes(part)), single.texts);
    check("Befehl: Pflichtfeld markiert", fields?.kind === "fields" && fields.rows[0].name === "user" && fields.rows[0].required, JSON.stringify(fields));
    check("Befehl: Hinweis zum Stern", single.texts.includes("Felder mit **Stern** sind Pflicht"), single.texts);
    check("Befehl: Auswahl genannt", single.texts.includes("1h, 1d"), single.texts);
    check("Befehl: zurück zum Bereich", single.json.includes(`"custom_id":"${HELP_PREFIX}a:moderation"`));
    check("Befehl: Doku zum Bereich", single.json.includes(`"url":"${CONTEXT.docs}#docg-moderation"`));

    const gruppe = entries.find((entry) => entry.name === "gruppe")!;
    const groupPage = HelpCommandPage(gruppe, null, 0, CONTEXT);
    const group = Flat(groupPage);
    const chapters = groupPage.blocks.filter((block) => block.kind === "chapter");

    check("Gruppe: Kapitel nummeriert in Katalog-Reihenfolge", chapters.map((block) => (block.kind === "chapter" ? `${block.n}:${block.when}` : "")).join(",") === "1:Zuerst,2:Danach", JSON.stringify(chapters));
    check("Gruppe: Unterbefehl erklären per Menü", group.json.includes(`"value":"gruppe a"`));

    const sub = Flat(HelpCommandPage(gruppe, "gruppe a", 0, CONTEXT));

    check("Unterbefehl: eigene Seite A", sub.texts.includes("/gruppe a") && sub.texts.includes("Was er macht") && sub.texts.includes("nummer"), sub.texts);
    check("Unterbefehl: zurück zur Gruppe", sub.json.includes(`"custom_id":"${HELP_PREFIX}seite:gruppe:-:0"`));

    const long = { ...probe, commands: [{ ...probe.commands[0], text: { ...probe.commands[0].text, examples: Array.from({ length: 12 }, (_, index) => ({ code: `/probe ${"x".repeat(380)} ${index}`, text: `Beispiel ${index}` })) } }] };
    const first = Flat(HelpCommandPage(long, null, 0, CONTEXT));
    const second = Flat(HelpCommandPage(long, null, 99, CONTEXT));

    check("Lang: wird geteilt", !first.texts.includes("Beispiel 11") && first.json.includes(`"custom_id":"${HELP_PREFIX}seite:probe:-:1"`), first.json.slice(-400));
    check("Lang: die letzte Seite hat den Rest und führt zurück", second.texts.includes("Beispiel 11") && second.json.includes(`"custom_id":"${HELP_PREFIX}seite:probe:-:`) && second.json.includes('"disabled":true'));
    check("Lang: Kopf auf jeder Seite", first.texts.includes('"kind":"title"') && second.texts.includes('"kind":"title"'));

    const many = Array.from({ length: 30 }, (_, index) => ({ ...probe, name: `probe${index}`, commands: [{ ...probe.commands[0], key: `probe${index}`, display: `/probe${index}` }] }));
    const crowded = Flat(HelpAreaPage("moderation", many, CONTEXT));

    check("Viele Befehle: Menü höchstens 25", (crowded.json.match(/"value":"probe\d+"/g) ?? []).length <= 25);
    check("Viele Befehle: höchstens 40 Bausteine", crowded.count <= 40, String(crowded.count));
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

async function checkCommand(client: BotClient): Promise<void> {
    console.log("\n  — Befehl —");

    const loose = client as unknown as Record<string, unknown>;
    const commands = await RealCommands(client);

    loose.commands = new Collection(commands.map((command) => [command.name, command]));

    const help = new HelpService(client);
    const first = help.Suggest("timeout", false)[0];

    check("Vorschlag: genauer Treffer zuerst", first?.value === "timeout", JSON.stringify(first));
    check("Vorschlag: Treffer am Anfang vor Treffern mittendrin", help.Suggest("timeout", false).findIndex((entry) => entry.value === "untimeout") > 0);
    check("Vorschlag: bei „ti“ nur, was mit ti beginnt, vorn", help.Suggest("ti", false).slice(0, 2).every((entry) => entry.value.startsWith("ti")), JSON.stringify(help.Suggest("ti", false).slice(0, 3)));
    check("Vorschläge höchstens 25", help.Suggest("", false).length <= 25 && help.Suggest("", false).length > 0);
    check("Vorschlag: Unterbefehle dabei", help.Suggest("fall b", false).some((entry) => entry.value === "fall beweis"));
    check("Developer-Befehle nur für Developer", !help.Suggest("dev", false).some((entry) => entry.value === "devlogs") && help.Suggest("dev", true).some((entry) => entry.value === "devlogs"));
    check("Vorschlag-Namen höchstens 100 Zeichen", help.Suggest("", false).every((entry) => entry.name.length <= 100));

    const found = help.Find("fall beweis", false);

    check("Finden: Unterbefehl", found?.entry.name === "fall" && found.key === "fall beweis");
    check("Finden: mit / und Großbuchstaben", help.Find("/Timeout", false)?.entry.name === "timeout");
    check("Finden: Gruppe ohne Unterbefehl", help.Find("fall", false)?.key === null);
    check("Finden: Unsinn ergibt nichts", help.Find("xyz", false) === null);
    check("Finden: Developer-Befehl ohne Developer ergibt nichts", help.Find("devlogs", false) === null && help.Find("devlogs", true) !== null);

    const dashboard = client.dashboardService as unknown as Record<string, unknown>;
    const guild = { id: "123456789012345678", ownerId: "111111111111111111", name: "Dev Server" } as unknown as Guild;

    dashboard.Paywall = async () => false;
    check("Zugang: Schranke aus heißt frei", (await help.Access(guild)).value === "Frei");

    dashboard.Paywall = async () => true;
    dashboard.ShopAccess = async () => ({ allowed: true, reason: "", viaShop: true });
    dashboard.ShopEnds = async () => [{ name: "Pro", kind: "renews", endsAt: Date.UTC(2026, 11, 1, 10) }];

    const paid = await help.Access(guild);

    check("Zugang: bezahlt mit Datum", paid.value === "Paid" && paid.sub === "bis 01.12.", JSON.stringify(paid));

    dashboard.ShopAccess = async () => {
        throw new Error("Datenbank weg");
    };
    check("Zugang: Fehler heißt nicht prüfbar", (await help.Access(guild)).value === "–");

    // Ein alter Knopf zu einem Befehl, den es nicht mehr gibt: zurück zur Startseite.
    dashboard.Paywall = async () => false;
    (client.settings as unknown as Record<string, unknown>).Of = async () => ({ modules: ["moderation"] });
    loose.helpService = help;

    let updated: { components?: unknown[]; files?: unknown[] } | null = null;
    const interaction = {
        customId: `${HELP_PREFIX}seite:weg:-:0`,
        isButton: () => true,
        isStringSelectMenu: () => false,
        inCachedGuild: () => true,
        guild,
        user: { id: "222222222222222222", username: "joe" },
        member: { displayName: "Joe" },
        deferUpdate: async () => undefined,
        editReply: async (payload: { components?: unknown[]; files?: unknown[] }) => void (updated = payload),
    };

    await new HelpButtons(client).Execute(interaction as never);

    const shown = updated as { components?: unknown[]; files?: unknown[] } | null;

    check("Alter Knopf: zurück zur Startseite", JSON.stringify(shown?.components ?? []).includes("In drei Schritten startklar"), JSON.stringify(shown).slice(0, 200));
    const names = (shown?.files ?? []).map((file) => (file as { name?: string }).name);

    check("Startseite: Banner vorn, dann die Bilder", names[0] === "hilfe.png" && names.length >= 2 && names.length <= 10, names.join(", "));
}

async function checkImages(): Promise<void> {
    console.log("\n  — Bilder —");

    let asked = 0;

    SetEmojiLoader(async () => {
        asked++;
        throw new Error("kein Netz");
    });

    const blocks: HelpBlock[] = [
        { kind: "title", emoji: "⏱️", text: "/timeout", sub: "Moderation · Team mit „Mitglieder moderieren“" },
        { kind: "heading", text: "Was er macht" },
        { kind: "text", text: "Schaltet einen User **stumm**, mit `/timeout` ganz einfach." },
        { kind: "code", code: "/timeout user:@nico dauer:1h", note: "Eine Stunde stumm" },
        { kind: "fields", rows: [{ name: "user", required: true, text: "Wer stumm wird." }] },
        { kind: "list", items: ["Ein Fall entsteht"] },
        { kind: "tip", text: "Früher aufheben mit /untimeout." },
        { kind: "tiles", items: [{ emoji: "📦", value: "9/24", label: "Module an" }] },
        { kind: "steps", title: "In drei Schritten startklar", items: ["`/module` schaltet ein"] },
        { kind: "areas", items: [{ emoji: "🛡️", name: "Moderation", count: "13 Befehle" }] },
        { kind: "command", emoji: "⚠️", display: "/warn", who: "Team", text: "Verwarnt einen User.", fields: "user* · grund*", off: "Modul aus" },
        { kind: "chapter", n: 1, when: "Später mehr gefunden", display: "/fall beweis", who: "Team", text: "Hängt ein Bild an.", code: "/fall beweis nummer:128", fields: "nummer* · bild · link" },
    ];
    const images = await RenderHelpImages(blocks);
    const sizes = await Promise.all(images.map(async (image) => loadImage(image.png)));

    check("Alle Blockarten zeichnen", images.length >= 1);
    check("PNG so breit wie das Banner (1100), höchstens 580 hoch", sizes.every((image) => image.width === 1100 && image.height <= 580), sizes.map((image) => `${image.width}×${image.height}`).join(", "));
    check("Emoji ohne Netz bricht nichts", asked > 0);

    const many: HelpBlock[] = Array.from({ length: 40 }, (_, index) => ({ kind: "text", text: `Absatz ${index}: ${"viel Text ".repeat(20)}` }));
    const split = await RenderHelpImages(many);
    const splitSizes = await Promise.all(split.map(async (image) => loadImage(image.png)));

    check("Jedes Bild hat seinen Alt-Text", split.every((image) => image.alt.length > 0) && split[1].alt !== split[0].alt);

    check("Viel Inhalt: mehrere Bilder", split.length > 1, String(split.length));
    check("Viel Inhalt: jedes höchstens 580 hoch", splitSizes.every((image) => image.height <= 580), splitSizes.map((image) => image.height).join(", "));

    const orphans: HelpBlock[] = Array.from({ length: 12 }, (_, index): HelpBlock[] => [{ kind: "heading", text: `Abschnitt ${index}` }, { kind: "text", text: "Inhalt ".repeat(25 + index * 3) }]).flat();
    const kept = await RenderHelpImages(orphans);

    check("Überschrift bleibt beim Inhalt", kept.length > 1 && kept.every((image) => !image.alt.endsWith(":")), kept.map((image) => image.alt.slice(-30)).join(" | "));

    const giant = await RenderHelpImages([{ kind: "text", text: "Riesig ".repeat(2000) }]);

    check("Ein Riesenblock wird trotzdem gezeichnet", giant.length >= 1 && (await loadImage(giant[0].png)).height <= 580);

    const alt = HelpAlt(blocks);

    check("Alt-Text ohne Markup", !alt.includes("**") && !alt.includes("`") && alt.includes("Schaltet einen User stumm"), alt.slice(0, 120));
    check("Alt-Text höchstens 1024 Zeichen", HelpAlt(many).length <= 1024, String(HelpAlt(many).length));
}

async function main(): Promise<void> {
    checkModel();
    checkPages();
    await checkBanner();
    await checkImages();
    const client = new BotClient();

    await checkCatalog(client);
    await checkCommand(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures > 0 ? 1 : 0);
}

void main();
