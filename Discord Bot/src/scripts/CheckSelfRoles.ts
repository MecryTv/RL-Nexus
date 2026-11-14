/**
 * Prüft Self Roles ohne Discord: die Prüfung eines Panels, die Regeln beim
 * Klicken und die Komponenten, die an Discord gingen.
 *
 *   npm run check:selfroles
 *
 * Ob jemand wirklich klickt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import {
    ActionRowBuilder,
    ChannelType,
    ComponentType,
    GatewayMessageReactionAddDispatchData,
    GatewayMessageUpdateDispatchData,
    Guild,
    GuildBasedChannel,
    GuildMember,
    GuildTextBasedChannel,
    PermissionFlagsBits,
    PermissionsBitField,
    Role,
    StringSelectMenuBuilder,
} from "discord.js";
import BotClient from "../client/BotClient";
import { PanelRows } from "../builder/SelfRoleView";
import { CleanEmoji, DefaultBody, EmojiKey, MAX_REACTIONS, MAX_ROLES, SELF_ROLE_MODULE } from "../constants/SelfRoles";
import { ISelfRolePanel } from "../interfaces/services/selfroles/ISelfRoles";
import { IRawComponent, ReactionParam, SelfRoleError } from "../services/SelfRoleService";

const GUILD = "90071992547409931";
const TEXT = "90071992547409932";
const ROLE_A = "90071992547409941";
const ROLE_B = "90071992547409942";
const ROLE_C = "90071992547409943";
const MANAGED = "90071992547409944";
const TOO_HIGH = "90071992547409945";
const MESSAGE = "90071992547409951";
const OTHER = "90071992547409952";
const FREE = "90071992547409953";
const USER = "90071992547409961";
const BOT = "90071992547409962";
const LOCAL_EMOJI = "90071992547409971";
/** Für die Grenze bei Reaktionen: mehr Rollen, als Discord Reaktionen zulässt. */
const MANY = Array.from({ length: MAX_REACTIONS + 1 }, (_, index) => `8007199254740${String(index).padStart(4, "0")}`);

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** text: der Kanal TEXT, wenn ein Test ihn anders braucht (Rechte, Nachrichten). */
function FakeGuild(text: object = {}): Guild {
    const role = (id: string, name: string, managed = false, above = false) =>
        ({ id, name, managed, comparePositionTo: () => (above ? 1 : -1) }) as unknown as Role;

    return {
        id: GUILD,
        name: "Dev Server",
        ownerId: "1",
        channels: {
            cache: new Map([[TEXT, { id: TEXT, type: ChannelType.GuildText, name: "rollen", isTextBased: () => true, ...text } as unknown as GuildBasedChannel]]),
            fetch: async () => null,
        },
        emojis: { cache: new Map([[LOCAL_EMOJI, { id: LOCAL_EMOJI, available: true }]]) },
        roles: {
            cache: new Map([
                [ROLE_A, role(ROLE_A, "Rocket League")],
                [ROLE_B, role(ROLE_B, "Valorant")],
                [ROLE_C, role(ROLE_C, "Ankündigungen")],
                [MANAGED, role(MANAGED, "Bot-Rolle", true)],
                [TOO_HIGH, role(TOO_HIGH, "Admin", false, true)],
                [GUILD, role(GUILD, "@everyone")],
                ...MANY.map((id, index): [string, Role] => [id, role(id, `Rolle ${index}`)]),
            ]),
        },
        members: { me: { permissions: { has: () => true }, roles: { highest: { id: "1" } } } },
    } as unknown as Guild;
}

function Panel(over: Partial<ISelfRolePanel> = {}): ISelfRolePanel {
    return {
        id: 7,
        guildId: GUILD,
        name: "Spiele",
        kind: "buttons",
        mode: "multi",
        maxRoles: 0,
        requireRole: null,
        body: DefaultBody(),
        roles: [
            { roleId: ROLE_A, label: "", description: "", emoji: null, style: "secondary", locked: false },
            { roleId: ROLE_B, label: "Valo", description: "Taktik-Shooter", emoji: "🔫", style: "primary", locked: false },
            { roleId: ROLE_C, label: "Pings", description: "", emoji: null, style: "success", locked: true },
        ],
        channelId: TEXT,
        messageId: null,
        attached: false,
        targetId: null,
        createdBy: "1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...over,
    };
}

/* ----------------------------------------------------------
   Ein Panel prüfen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Ein Panel einstellen —");

    const guild = FakeGuild();
    const service = client.selfRoleService;
    const clean = service.Clean(guild, {
        name: "  Spiele  ",
        kind: "select",
        mode: "multi",
        maxRoles: 99,
        requireRole: ROLE_C,
        channelId: TEXT,
        body: DefaultBody(),
        roles: [{ roleId: ROLE_A }, { roleId: ROLE_A }, { roleId: GUILD }, { roleId: "999" }, { roleId: ROLE_B, label: "Valo", emoji: "🔫" }],
    });

    check("Der Name wird abgeschnitten", clean.name === "Spiele");
    check("Die Art kommt an", clean.kind === "select");
    check("Die Höchstzahl ist gedeckelt", clean.maxRoles === MAX_ROLES, String(clean.maxRoles));
    check("Die Voraussetzung auch", clean.requireRole === ROLE_C);
    check("Doppelte Rollen fallen weg", clean.roles.filter((role) => role.roleId === ROLE_A).length === 1);
    check("@everyone und Unbekanntes ebenso", clean.roles.length === 2, String(clean.roles.length));
    check("Beschriftung und Emoji bleiben", clean.roles[1].label === "Valo" && clean.roles[1].emoji === "🔫");

    const single = service.Clean(guild, { name: "Farben", mode: "single", maxRoles: 3, roles: [] });

    check('Bei "genau eine" gibt es keine Höchstzahl', single.maxRoles === 0);

    const fails = (name: string, input: object, expect: string): void => {
        try {
            service.Clean(guild, input);
            check(name, false, "kein Fehler");
        } catch (error) {
            check(name, error instanceof SelfRoleError && error.message.toLowerCase().includes(expect.toLowerCase()), String(error));
        }
    };

    fails("Ohne Namen geht nichts", { name: "  " }, "Namen");
    fails("Eine Integrations-Rolle nicht", { name: "X", roles: [{ roleId: MANAGED }] }, "Integration");
    fails("Eine Rolle über dem Bot auch nicht", { name: "X", roles: [{ roleId: TOO_HIGH }] }, "höchsten Rolle");

    console.log("\n  — Emojis —");

    check("Ein Unicode-Emoji geht", CleanEmoji("🎮") === "🎮");
    check("Ein eigenes auch", CleanEmoji("<:rl:123456789012345678>") === "<:rl:123456789012345678>");
    check("Ein animiertes ebenso", CleanEmoji("<a:rl:123456789012345678>") !== null);
    check("Buchstaben nicht", CleanEmoji("lol") === null);
    check("Und nichts bleibt nichts", CleanEmoji("  ") === null);
    // Discord nimmt genau ein Emoji, sonst scheitert das ganze Panel (W-0093).
    check("Familie, Flagge und Tastenkappe zählen als eins", CleanEmoji("👨‍👩‍👧") !== null && CleanEmoji("🇩🇪") !== null && CleanEmoji("1️⃣") !== null);
    check("Zwei Emojis nicht", CleanEmoji("⭐⭐") === null && CleanEmoji("🇩🇪🇦🇹") === null, `${CleanEmoji("⭐⭐")} ${CleanEmoji("🇩🇪🇦🇹")}`);
    check("Emoji mit Satzzeichen nicht", CleanEmoji("😀!") === null, String(CleanEmoji("😀!")));
    check("Nur ein Satzzeichen auch nicht", CleanEmoji("!") === null && CleanEmoji("—") === null, `${CleanEmoji("!")} ${CleanEmoji("—")}`);
}

/* ----------------------------------------------------------
   Die Regeln beim Klicken
   ---------------------------------------------------------- */
function checkRules(client: BotClient): void {
    console.log("\n  — Was ein Klick bewirkt —");

    const service = client.selfRoleService;
    const multi = Panel();
    const single = Panel({ mode: "single" });
    const set = (...ids: string[]): Set<string> => new Set(ids);
    const list = (result: Set<string> | null): string => (result ? [...result].sort().join(",") : "null");

    check("Anklicken holt die Rolle", list(service.Next(multi, set(), ROLE_A)) === ROLE_A);
    check("Noch einmal klicken gibt sie zurück", list(service.Next(multi, set(ROLE_A), ROLE_A)) === "");
    check("Eine zweite kommt dazu", list(service.Next(multi, set(ROLE_A), ROLE_B)) === [ROLE_A, ROLE_B].sort().join(","));
    check('"Genau eine" ersetzt die vorherige', list(service.Next(single, set(ROLE_A), ROLE_B)) === ROLE_B);
    check("Eine gesperrte Rolle bleibt", list(service.Next(multi, set(ROLE_C), ROLE_C)) === ROLE_C);
    check('Und überlebt auch "genau eine"', list(service.Next(single, set(ROLE_C), ROLE_A)) === [ROLE_A, ROLE_C].sort().join(","));
    check("Eine fremde Rolle tut nichts", service.Next(multi, set(), "999") === null);
}

/* ----------------------------------------------------------
   Was an Discord ginge
   ---------------------------------------------------------- */
function checkView(): void {
    console.log("\n  — Was an Discord ginge —");

    const nameOf = (id: string): string => ({ [ROLE_A]: "Rocket League", [ROLE_B]: "Valorant", [ROLE_C]: "Ankündigungen" })[id] ?? "?";
    const buttons = PanelRows(Panel(), nameOf);

    check("Drei Knöpfe in einer Reihe", buttons.length === 1 && buttons[0].components.length === 3, `${buttons.length} Reihe(n)`);

    const many = PanelRows(Panel({ roles: Array.from({ length: 12 }, () => ({ roleId: ROLE_A, label: "X", description: "", emoji: null, style: "secondary" as const, locked: false })) }), nameOf);

    check("Ab sechs Knöpfen eine zweite Reihe", many.length === 3, `${many.length} Reihe(n)`);

    const menu = PanelRows(Panel({ kind: "select" }), nameOf);
    const select = (menu[0] as ActionRowBuilder<StringSelectMenuBuilder>).components[0].toJSON() as { min_values?: number; max_values?: number; options?: unknown[] };

    check("Das Menü hat eine Reihe", menu.length === 1);
    check("Nichts auswählen ist erlaubt", select.min_values === 0);
    check("Und mehrere gehen", select.max_values === 3, String(select.max_values));
    check("Jede Rolle steht darin", (select.options?.length ?? 0) === 3);

    const one = PanelRows(Panel({ kind: "select", mode: "single" }), nameOf);
    const strict = (one[0] as ActionRowBuilder<StringSelectMenuBuilder>).components[0].toJSON() as { max_values?: number };

    check('"Genau eine" lässt nur eine zu', strict.max_values === 1);

    check("Ohne Rollen gibt es keine Reihe", PanelRows(Panel({ roles: [] }), nameOf).length === 0);
    check("Reaktionen brauchen keine Reihe", PanelRows(Panel({ kind: "reactions" }), nameOf).length === 0);
}

/* ----------------------------------------------------------
   W-0101: an eine vorhandene Nachricht hängen
   ---------------------------------------------------------- */
function checkLink(client: BotClient): void {
    console.log("\n  — Nachrichtenlink oder ID —");

    const service = client.selfRoleService;
    const link = (host: string, guild = GUILD): string => `https://${host}/channels/${guild}/${TEXT}/${MESSAGE}`;
    const same = (input: string, channelId: string | null): boolean => {
        const ref = service.ParseLink(input, GUILD);

        return ref.channelId === channelId && ref.messageId === MESSAGE;
    };

    check("Ein Link liefert Kanal und Nachricht", same(link("discord.com"), TEXT));
    check("Auch aus PTB und Canary", same(link("ptb.discord.com"), TEXT) && same(link("canary.discord.com"), TEXT));
    check("Und der alte discordapp.com-Link", same(link("discordapp.com"), TEXT));
    check("Leerzeichen drumherum stören nicht", same(`  ${link("discord.com")}  `, TEXT));
    check("Eine reine ID hat keinen Kanal", same(MESSAGE, null));

    const fails = (name: string, input: unknown, expect: string): void => {
        try {
            service.ParseLink(input, GUILD);
            check(name, false, "kein Fehler");
        } catch (error) {
            check(name, error instanceof SelfRoleError && error.message.includes(expect), String(error));
        }
    };

    fails("Ein Link von einem anderen Server nicht", link("discord.com", "90071992547400000"), "anderen Server");
    fails("Eine DM auch nicht", `https://discord.com/channels/@me/${TEXT}/${MESSAGE}`, "anderen Server");
    fails("Irgendein Text nicht", "hallo", "Link");
    fails("Ein fremder Link nicht", `https://example.com/channels/${GUILD}/${TEXT}/${MESSAGE}`, "Link");
    fails("Nichts auch nicht", undefined, "Link");
}

function checkReactions(client: BotClient): void {
    console.log("\n  — Was eine Reaktion bewirkt —");

    const service = client.selfRoleService;
    const multi = Panel({ kind: "reactions" });
    const single = Panel({ kind: "reactions", mode: "single" });
    const capped = Panel({ kind: "reactions", maxRoles: 1 });
    const set = (...ids: string[]): Set<string> => new Set(ids);
    const show = (step: ReturnType<typeof service.ReactionStep>): string =>
        step ? `+${[...step.add].sort().join(",")} -${[...step.remove].sort().join(",")}${step.undo ? " undo" : ""}` : "null";

    check("Reagieren holt die Rolle", show(service.ReactionStep(multi, set(), ROLE_A, true, true)) === `+${ROLE_A} -`);
    check("Die Rolle schon haben ändert nichts", show(service.ReactionStep(multi, set(ROLE_A), ROLE_A, true, true)) === "+ -");
    check("Wegnehmen gibt sie zurück", show(service.ReactionStep(multi, set(ROLE_A), ROLE_A, false, true)) === `+ -${ROLE_A}`);
    check("Eine gesperrte Rolle bleibt beim Wegnehmen", show(service.ReactionStep(multi, set(ROLE_C), ROLE_C, false, true)) === "+ -");
    check('"Genau eine" ersetzt die vorherige', show(service.ReactionStep(single, set(ROLE_A), ROLE_B, true, true)) === `+${ROLE_B} -${ROLE_A}`);
    check('Und lässt die gesperrte stehen', show(service.ReactionStep(single, set(ROLE_C), ROLE_A, true, true)) === `+${ROLE_A} -`);
    check("Über der Höchstzahl: Reaktion wieder weg, keine Rolle", show(service.ReactionStep(capped, set(ROLE_A), ROLE_B, true, true)) === "+ - undo");
    check("Ohne Voraussetzung: Reaktion wieder weg", show(service.ReactionStep(multi, set(), ROLE_A, true, false)) === "+ - undo");
    check("Und Wegnehmen tut dann auch nichts", show(service.ReactionStep(multi, set(ROLE_A), ROLE_A, false, false)) === "+ -");
    check("Eine fremde Rolle tut nichts", service.ReactionStep(multi, set(), "999", true, true) === null);

    console.log("\n  — Emojis bei Reaktionen —");

    check("Eigenes Emoji: die ID zählt", EmojiKey("<:rl:123456789012345678>") === "123456789012345678" && EmojiKey({ id: "123456789012345678", name: "rl" }) === "123456789012345678");
    check("Unicode mit und ohne FE0F ist dasselbe", EmojiKey("❤️") === EmojiKey({ id: null, name: "❤" }));
    check("Ohne Emoji kein Schlüssel", EmojiKey(null) === "");

    const guild = FakeGuild();
    const roles = (...list: [string, string | null][]) => list.map(([roleId, emoji]) => ({ roleId, emoji }));
    const fails = (name: string, input: object, expect: string): void => {
        try {
            service.Clean(guild, { name: "Spiele", kind: "reactions", ...input });
            check(name, false, "kein Fehler");
        } catch (error) {
            check(name, error instanceof SelfRoleError && error.message.includes(expect), String(error));
        }
    };

    fails("Jede Rolle braucht ein Emoji", { roles: roles([ROLE_A, "🚗"], [ROLE_B, null]) }, "@Valorant");
    fails("Jedes Emoji nur einmal", { roles: roles([ROLE_A, "🚗"], [ROLE_B, "🚗"]) }, "🚗");
    // W-0101 Review: fremde Server-Emojis bräuchten „Externe Emojis verwenden“ - also nur eigene.
    fails("Ein Emoji von einem anderen Server nicht", { roles: roles([ROLE_A, "<:fremd:123456789012345678>"]) }, "von diesem Server");
    check("Eins von diesem Server geht", service.Clean(guild, { name: "X", kind: "reactions", roles: roles([ROLE_A, `<:lokal:${LOCAL_EMOJI}>`]) }).roles[0].emoji === `<:lokal:${LOCAL_EMOJI}>`);
    fails(`Mehr als ${MAX_REACTIONS} Reaktionen nicht`, { roles: MANY.map((roleId, index) => ({ roleId, emoji: String.fromCodePoint(0x1f600 + index) })) }, String(MAX_REACTIONS));

    const fine = service.Clean(guild, { name: "Spiele", kind: "reactions", roles: roles([ROLE_A, "🚗"], [ROLE_B, "⚽"]) });

    check("Mit Emojis geht es", fine.kind === "reactions" && fine.roles.length === 2);
    check("Bei Knöpfen bleibt das Emoji freiwillig", service.Clean(guild, { name: "X", kind: "buttons", roles: roles([ROLE_A, null]) }).roles.length === 1);
}

function checkAttach(client: BotClient): void {
    console.log("\n  — Angehängt —");

    const service = client.selfRoleService;
    const guild = FakeGuild();
    const attached = service.Clean(guild, { name: "X", attached: true, targetId: MESSAGE, channelId: TEXT });
    const plain = service.Clean(guild, { name: "X", attached: false, targetId: MESSAGE });
    const broken = service.Clean(guild, { name: "X", attached: true, targetId: "../123" });

    check("Angehängt merkt sich die Nachricht", attached.attached && attached.targetId === MESSAGE && attached.channelId === TEXT);
    check("Eine eigene Nachricht hat kein Ziel", !plain.attached && plain.targetId === null);
    check("Eine kaputte ID kommt nicht durch", broken.targetId === null);

    const refuses = (kind: ISelfRolePanel["kind"], own: boolean): boolean => {
        try {
            service.CheckKind(kind, own);

            return false;
        } catch (error) {
            return error instanceof SelfRoleError && error.message.includes("nur Reaktionen");
        }
    };

    check("Knöpfe an einer fremden Nachricht: abgelehnt", refuses("buttons", false));
    check("Ein Menü ebenso", refuses("select", false));
    check("Reaktionen gehen überall", (service.CheckKind("reactions", false), service.CheckKind("reactions", true), true));
    check("An einer Nachricht von RL Nexus geht alles", (service.CheckKind("buttons", true), service.CheckKind("select", true), true));

    console.log("\n  — Reihen zusammenführen —");

    const button = (customId: string): IRawComponent => ({ type: ComponentType.Button, custom_id: customId });
    const rowOf = (...ids: string[]): IRawComponent => ({ type: ComponentType.ActionRow, components: ids.map(button) });
    const ids = (list: IRawComponent[]): string =>
        list.map((entry) => (entry.type === ComponentType.ActionRow ? (entry.components ?? []).map((child) => child.custom_id).join("+") : `t${entry.type}`)).join(" | ");
    const fresh = [rowOf("selfrole:7:new")];
    const existing = [rowOf("ticket:open"), rowOf("selfrole:7:old"), rowOf("selfrole:menu:7"), rowOf("selfrole:8:other")];
    const merged = service.MergeRows(existing, fresh, 7, false);

    check("Alte eigene Reihen fliegen raus, neue kommen unten dran", ids(merged) === "ticket:open | selfrole:8:other | selfrole:7:new", ids(merged));
    check("Lösen nimmt nur die eigenen ab", ids(service.MergeRows(existing, [], 7, false)) === "ticket:open | selfrole:8:other");

    const full = [rowOf("a"), rowOf("b"), rowOf("c"), rowOf("d")];
    const tooMany = (run: () => unknown, expect: string): boolean => {
        try {
            run();

            return false;
        } catch (error) {
            return error instanceof SelfRoleError && error.message.includes(expect);
        }
    };

    check("Klassisch: eine fünfte Reihe passt", service.MergeRows(full, fresh, 7, false).length === 5);
    check("Eine sechste nicht", tooMany(() => service.MergeRows(full, [...fresh, rowOf("selfrole:7:x")], 7, false), "fünf"));

    const text = (): IRawComponent => ({ type: ComponentType.TextDisplay });
    const card = (count: number): IRawComponent => ({ type: ComponentType.Container, components: Array.from({ length: count }, text) });
    const v2 = service.MergeRows([card(10)], fresh, 7, true);

    check("Components V2: die Reihe steht neben der Karte", ids(v2) === `t${ComponentType.Container} | selfrole:7:new`, ids(v2));
    // Karte mit 37 Texten = 38, die Reihe mit einem Knopf = 2.
    check("Und zählt mit allem darin bis 40", tooMany(() => service.MergeRows([card(38)], fresh, 7, true), "40"));
    check("Genau 40 gehen noch", service.MergeRows([card(37)], fresh, 7, true).length === 2);

    console.log("\n  — Nachziehen, wenn ein anderes Modul die Nachricht ändert —");

    const panel = Panel({ attached: true, targetId: MESSAGE, messageId: MESSAGE });

    check("Fehlt die Reihe, kommt sie wieder", service.NeedsReattach(panel, [rowOf("ticket:open")]));
    check("Ist sie da, passiert nichts (keine Schleife)", !service.NeedsReattach(panel, [rowOf("ticket:open"), rowOf("selfrole:7:" + ROLE_A)]));
    check("Ohne Komponenten im Ereignis auch nicht", !service.NeedsReattach(panel, undefined));
    check("Reaktionen brauchen keine Reihe", !service.NeedsReattach({ ...panel, kind: "reactions" }, []));
    check("Eigene Panels zieht das Speichern nach", !service.NeedsReattach({ ...panel, attached: false }, []));
}

/* ----------------------------------------------------------
   W-0101 nach dem Review
   ---------------------------------------------------------- */
type Loose = Record<string, Record<string, unknown>>;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async (): Promise<void> => {
    for (let index = 0; index < 30; index++) await new Promise((resolve) => setImmediate(resolve));
};
const failure = async (run: () => Promise<unknown> | unknown): Promise<string> => {
    try {
        await run();

        return "";
    } catch (error) {
        return error instanceof SelfRoleError ? error.message : `kein SelfRoleError: ${String(error)}`;
    }
};
const reactionRoles = (...emojis: string[]): ISelfRolePanel["roles"] =>
    emojis.map((emoji, index) => ({ roleId: [ROLE_A, ROLE_B, ROLE_C][index], label: "", description: "", emoji, style: "secondary" as const, locked: false }));

async function checkClash(client: BotClient): Promise<void> {
    console.log("\n  — Eine Nachricht, ein Panel —");

    const service = client.selfRoleService;
    const own = Panel({ id: 1, name: "Farben", messageId: MESSAGE });
    const hanging = Panel({ id: 2, name: "Plattformen", attached: true, targetId: OTHER, messageId: null });
    const taken = (panel: ISelfRolePanel): Promise<string> => failure(() => service.CheckFree([own, hanging, panel], panel));

    check("Eine freie Nachricht geht", (await taken(Panel({ id: 3, attached: true, targetId: FREE }))) === "");
    check("An die Nachricht eines anderen Panels nicht", (await taken(Panel({ id: 3, attached: true, targetId: MESSAGE }))).includes("„Farben“"));
    check("Auch nicht, wo ein gelöstes Panel eingestellt ist", (await taken(Panel({ id: 3, attached: true, targetId: OTHER }))).includes("„Plattformen“"));
    check("Das Panel selbst stört sich nicht", (await taken(hanging)) === "");
}

function checkPlan(client: BotClient): void {
    console.log("\n  — Welche Reaktionen der Bot setzt und abnimmt —");

    const service = client.selfRoleService;
    const panel = (...emojis: string[]): ISelfRolePanel => Panel({ kind: "reactions", roles: reactionRoles(...emojis) });
    const show = (plan: { add: string[]; remove: string[] }): string => `+${plan.add.join(",")} -${plan.remove.join(",")}`;

    check("Fehlende kommen dazu, vorhandene bleiben", show(service.ReactionPlan(["🚗"], panel("🚗", "⚽"))) === "+⚽ -");
    check("Nicht mehr gebrauchte eigene gehen weg", show(service.ReactionPlan(["🚗"], panel("⚽"), panel("🚗"))) === "+⚽ -🚗");
    check("Lösen nimmt alle eigenen ab", show(service.ReactionPlan(["🚗", "⚽"], { ...panel("🚗", "⚽"), roles: [] }, panel("🚗", "⚽"))) === "+ -🚗,⚽");
    // Ein Knopf-Panel hat nie reagiert: eine Reaktion des Bots mit demselben Emoji gehört jemand anderem.
    check("Eine Bot-Reaktion mit dem Emoji eines Knopfes bleibt", show(service.ReactionPlan(["🔫"], Panel(), Panel())) === "+ -");
    check("Auch nach dem Wechsel von Knöpfen auf Reaktionen", show(service.ReactionPlan(["🔫"], panel("🚗"), Panel())) === "+🚗 -");

    console.log("\n  — Reaktion zurücknehmen —");

    check("Mit dem Emoji aus dem Ereignis: Unicode ohne FE0F", ReactionParam({ id: null, name: "❤" }) === encodeURIComponent("❤"));
    check("Eigenes Emoji als name:id", ReactionParam({ id: "123456789012345678", name: "rl" }) === "rl:123456789012345678");
    check("Gespeicherter Text geht weiter", ReactionParam("<a:rl:123456789012345678>") === "rl:123456789012345678");
}

async function checkAccess(client: BotClient): Promise<void> {
    console.log("\n  — Wer eine Nachricht prüfen und anhängen darf —");

    const service = client.selfRoleService;
    const loose = client as unknown as Loose;
    const member = { id: USER } as unknown as GuildMember;
    const read = new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]);
    let fetched = 0;
    const channel = (perms: PermissionsBitField | null, type = ChannelType.GuildText, joined = false): GuildTextBasedChannel =>
        ({
            id: TEXT,
            type,
            name: "rollen",
            isTextBased: () => true,
            permissionsFor: () => perms,
            members: {
                fetch: async () => {
                    if (!joined) throw new Error("Unknown Member");

                    return {};
                },
            },
            messages: {
                fetch: async () => {
                    fetched++;

                    return null;
                },
            },
        }) as unknown as GuildTextBasedChannel;

    check("Mit Lesen und Verlauf: ja", await service.Readable(channel(read), member));
    check("Ohne Rechte im Kanal (null): nein, ohne Fehler", !(await service.Readable(channel(null), member)));
    check("Ohne Verlauf: nein", !(await service.Readable(channel(new PermissionsBitField([PermissionFlagsBits.ViewChannel])), member)));
    check("Privater Thread ohne Mitgliedschaft: nein", !(await service.Readable(channel(read, ChannelType.PrivateThread), member)));
    check("Privater Thread als Mitglied: ja", await service.Readable(channel(read, ChannelType.PrivateThread, true), member));
    check(
        "Oder mit „Threads verwalten“: ja",
        await service.Readable(channel(new PermissionsBitField([read, PermissionFlagsBits.ManageThreads]), ChannelType.PrivateThread), member)
    );

    const hidden = FakeGuild(channel(null));
    const link = `https://discord.com/channels/${GUILD}/${TEXT}/${MESSAGE}`;
    const inspect = await failure(() => service.Inspect(hidden, member, link, null));

    check("Prüfen im verschlossenen Kanal: abgelehnt, bevor die Nachricht geholt wird", inspect.includes("lesen") && fetched === 0, `${inspect} / ${fetched}`);

    const stored = Panel({ id: 9, attached: true, targetId: null });

    loose.selfRolePanels.Get = async () => stored;
    loose.selfRolePanels.OfGuild = async () => [stored];

    const save = await failure(() => service.Save(hidden, member, 9, { attached: true, targetId: MESSAGE, channelId: TEXT, kind: "reactions", roles: [] }));

    check("Speichern mit Ziel im verschlossenen Kanal: ebenso", save.includes("lesen") && fetched === 0, `${save} / ${fetched}`);
    check("Und „Anhängen“ prüft dasselbe", (await failure(() => service.CheckReader(hidden, member, { ...stored, targetId: MESSAGE }))).includes("lesen"));
}

async function checkFlows(client: BotClient): Promise<void> {
    console.log("\n  — Speichern, Lösen, Anhängen —");

    const service = client.selfRoleService;
    const loose = client as unknown as Loose;
    const inner = service as unknown as Record<string, unknown>;
    const member = { id: USER } as unknown as GuildMember;

    Object.defineProperty(client, "user", { configurable: true, value: { id: BOT } });

    // Speichern: scheitert das Nachziehen, kommt der Grund als Hinweis zurück.
    const sent = Panel({ id: 8, messageId: MESSAGE });

    loose.selfRolePanels.Get = async () => sent;
    loose.selfRolePanels.Save = async () => undefined;
    loose.selfRolePanels.OfGuild = async () => [sent];
    inner.Send = async () => {
        throw new SelfRoleError("An dieser Nachricht ist kein Platz mehr.");
    };

    const saved = await service.Save(FakeGuild(), member, 8, { name: "Spiele" });

    delete inner.Send;
    check("Speichern klappt, das Nachziehen meldet sich als Hinweis", saved.panel.id === 8 && (saved.warning ?? "").includes("kein Platz"), JSON.stringify(saved.warning));

    // Lösen: erst messageId weg, dann die Nachricht anfassen.
    const order: string[] = [];
    const hanging = Panel({ id: 10, kind: "reactions", attached: true, targetId: MESSAGE, messageId: MESSAGE, roles: reactionRoles("🚗") });
    const message = (react?: () => Promise<unknown>) => ({
        id: MESSAGE,
        author: { id: USER },
        components: [],
        flags: { has: () => false },
        attachments: new Map(),
        reactions: {
            cache: new Map(react ? [] : [["🚗", { me: true, emoji: { id: null, name: "🚗" }, users: { remove: async () => void order.push("abgenommen") } }]]),
        },
        react,
    });
    const holding = FakeGuild({ messages: { fetch: async () => message() } });

    loose.selfRolePanels.Save = async (_id: number, patch: { messageId?: string | null }) => void order.push(`gespeichert:${patch.messageId}`);
    loose.selfRolePanels.OfGuild = async () => [];
    await service.Delete(holding, hanging);
    check("Lösen: erst gespeichert, dann abgenommen", order.join() === "gespeichert:null,abgenommen", order.join());

    // Anhängen: scheitert eine Reaktion, steht das Panel trotzdem als angehängt da - Lösen räumt auf.
    order.length = 0;

    const failing = FakeGuild({
        messages: {
            fetch: async () =>
                message(async () => {
                    throw new Error("Missing Permissions");
                }),
        },
    });
    const attach = await failure(() => service.Send(failing, { ...hanging, messageId: null }));

    check("Halb angehängt ist als angehängt vermerkt", attach.includes("ging nicht") && order.includes(`gespeichert:${MESSAGE}`), `${attach} / ${order.join()}`);

    console.log("\n  — Reaktionen nacheinander —");

    const held = new Set<string>();
    const routes: string[] = [];
    const fetches: boolean[] = [];
    const guild = FakeGuild();

    Object.assign(guild.members as object, {
        me: { permissionsIn: () => ({ has: () => true }) },
        fetch: async (options: { force?: boolean }) => {
            fetches.push(options.force === true);

            return { roles: { cache: new Map([...held].map((id) => [id, {}])) }, user: { bot: false } };
        },
        addRole: async ({ role }: { role: string }) => {
            await sleep(5);
            held.add(role);
        },
        removeRole: async ({ role }: { role: string }) => {
            await sleep(5);
            held.delete(role);
        },
    });
    client.guilds.cache.set(GUILD, guild);
    loose.settings.Of = async () => ({ modules: [SELF_ROLE_MODULE] });
    loose.rest.delete = async (route: string) => void routes.push(route);

    const placed = (inner as { placed: Map<string, ISelfRolePanel> }).placed;
    const data = (emoji: { id: string | null; name: string }, extra: object = {}) =>
        ({ user_id: USER, channel_id: TEXT, message_id: MESSAGE, guild_id: GUILD, emoji, burst: false, type: 0, member: { roles: [], user: { bot: false } }, ...extra }) as unknown as GatewayMessageReactionAddDispatchData;
    const car = { id: null, name: "🚗" };
    const heart = { id: null, name: "❤" };

    placed.set(MESSAGE, Panel({ kind: "reactions", mode: "single", messageId: MESSAGE, roles: reactionRoles("🚗", "❤️") }));
    await Promise.all([service.Reaction(data(car), true), service.Reaction(data(heart), true)]);
    check('Zwei schnelle Reaktionen bei "genau eine": nur die zweite Rolle', [...held].join() === ROLE_B, [...held].join());
    check("Das Mitglied kommt jedes Mal frisch", fetches.length === 2 && fetches.every(Boolean), fetches.join());
    check("Die Reaktion der ersetzten Rolle wird abgenommen", routes.some((route) => route.includes(`/reactions/${encodeURIComponent("🚗")}/${USER}`)), routes.join());

    held.clear();
    routes.length = 0;
    placed.set(MESSAGE, Panel({ kind: "reactions", maxRoles: 1, messageId: MESSAGE, roles: reactionRoles("🚗", "❤️") }));
    await Promise.all([service.Reaction(data(car), true), service.Reaction(data(heart), true)]);
    check("Höchstzahl hält auch bei schnellen Reaktionen", [...held].join() === ROLE_A, [...held].join());
    check("Die zu viele wird mit ❤ ohne FE0F zurückgenommen", routes.some((route) => route.includes(`/reactions/${encodeURIComponent("❤")}/${USER}`)), routes.join());

    held.clear();
    placed.set(MESSAGE, Panel({ kind: "reactions", messageId: MESSAGE, roles: reactionRoles("🚗") }));
    await Promise.all([service.Reaction(data(car), true), service.Reaction(data(car), false)]);
    check("Dazu und gleich wieder weg: am Ende keine Rolle", held.size === 0, [...held].join());

    await service.Reaction(data(car, { burst: true }), true);
    check("Super-Reaktionen zählen nicht", held.size === 0, [...held].join());

    console.log("\n  — Nachziehen nach der Pause —");

    const timers: { run: () => void; ms: number }[] = [];
    const realTimeout = globalThis.setTimeout;
    let attaches = 0;
    let fresh: IRawComponent[] = [];
    const row = (id: string): IRawComponent => ({ type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, custom_id: id }] });
    const buttons = Panel({ id: 41, attached: true, targetId: OTHER, messageId: OTHER });
    const update = { id: OTHER, guild_id: GUILD, channel_id: TEXT, components: [row("ticket:open")] } as unknown as GatewayMessageUpdateDispatchData;

    globalThis.setTimeout = ((run: () => void, ms: number) => (timers.push({ run, ms }), 0)) as unknown as typeof setTimeout;
    loose.selfRolePanels.Get = async () => buttons;
    inner.Attach = async () => void attaches++;
    inner.Target = async () => ({ components: fresh.map((entry) => ({ toJSON: () => entry })) });
    placed.set(OTHER, buttons);

    try {
        await service.Edited(update);
        check("Erste fremde Bearbeitung: gleich wieder dran", attaches === 1, String(attaches));

        await service.Edited(update);
        await service.Edited(update);
        check("Zweite und dritte in der Pause: ein Termin danach, nicht verworfen", attaches === 1 && timers.length === 1 && timers[0].ms > 0 && timers[0].ms <= 5_000, `${attaches} / ${timers.map((timer) => timer.ms)}`);

        timers[0].run();
        await flush();
        check("Am Ende der Pause: frisch geholt, Reihe fehlt, wieder dran", attaches === 2, String(attaches));

        await service.Edited(update);
        fresh = [row("ticket:open"), row("selfrole:41:x")];
        timers[1]?.run();
        await flush();
        check("Ist die Reihe bis dahin wieder da, bleibt es dabei", timers.length === 2 && attaches === 2, `${timers.length} / ${attaches}`);
    } finally {
        globalThis.setTimeout = realTimeout;
        delete inner.Attach;
        delete inner.Target;
    }
}

async function main(): Promise<void> {
    console.log("\n🎭 Self Roles\n");

    const client = new BotClient();

    checkClean(client);
    checkRules(client);
    checkView();
    checkLink(client);
    checkReactions(client);
    checkAttach(client);
    await checkClash(client);
    checkPlan(client);
    await checkAccess(client);
    // Zuletzt: ab hier sind Teile des Clients durch Attrappen ersetzt.
    await checkFlows(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
