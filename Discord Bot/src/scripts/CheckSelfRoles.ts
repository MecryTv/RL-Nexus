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

import { ActionRowBuilder, ChannelType, Guild, GuildBasedChannel, Role, StringSelectMenuBuilder } from "discord.js";
import BotClient from "../client/BotClient";
import { PanelRows } from "../builder/SelfRoleView";
import { CleanEmoji, DefaultBody, MAX_ROLES } from "../constants/SelfRoles";
import { ISelfRolePanel } from "../interfaces/services/selfroles/ISelfRoles";
import { SelfRoleError } from "../services/SelfRoleService";

const GUILD = "90071992547409931";
const TEXT = "90071992547409932";
const ROLE_A = "90071992547409941";
const ROLE_B = "90071992547409942";
const ROLE_C = "90071992547409943";
const MANAGED = "90071992547409944";
const TOO_HIGH = "90071992547409945";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const role = (id: string, name: string, managed = false, above = false) =>
        ({ id, name, managed, comparePositionTo: () => (above ? 1 : -1) }) as unknown as Role;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([[TEXT, { id: TEXT, type: ChannelType.GuildText, name: "rollen", isTextBased: () => true } as unknown as GuildBasedChannel]]),
        },
        roles: {
            cache: new Map([
                [ROLE_A, role(ROLE_A, "Rocket League")],
                [ROLE_B, role(ROLE_B, "Valorant")],
                [ROLE_C, role(ROLE_C, "Ankündigungen")],
                [MANAGED, role(MANAGED, "Bot-Rolle", true)],
                [TOO_HIGH, role(TOO_HIGH, "Admin", false, true)],
                [GUILD, role(GUILD, "@everyone")],
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
}

async function main(): Promise<void> {
    console.log("\n🎭 Self Roles\n");

    const client = new BotClient();

    checkClean(client);
    checkRules(client);
    checkView();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
