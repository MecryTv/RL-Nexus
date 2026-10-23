/**
 * Prüft Rank Roles ohne Discord und ohne Prime: die Stufen, das Säubern der
 * Einstellungen und was der Befehl an Rollen vergeben würde.
 *
 *   npm run check:rankroles
 *
 * Ob Discord die Rolle wirklich setzt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRankRoleSettings, RANK_GROUPS, StepOf, Steps } from "../constants/RankRoles";
import { IPrimeProfile, IPrimeRank } from "../interfaces/services/prime/IPrimeService";
import { IRankRoleSettings } from "../interfaces/services/rankroles/IRankRoles";
import { RankRoleError } from "../services/RankRoleService";

const GUILD = "90071992547409961";
const TEXT = "90071992547409962";
const VOICE = "90071992547409963";
const LOW = "90071992547409964";
const MID = "90071992547409967";
const HIGH = "90071992547409965";
const BOT_ROLE = "90071992547409966";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

async function refuses(name: string, action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof RankRoleError, String(error));
    }
}

/** Rollen mit Rangfolge: LOW und BOT_ROLE unter der Bot-Rolle, HIGH darüber. */
function FakeGuild(canManage = true): Guild {
    const position: Record<string, number> = { [LOW]: 3, [MID]: 4, [BOT_ROLE]: 5, [HIGH]: 9 };
    const role = (id: string, managed = false) =>
        ({
            id,
            name: `rolle-${id.slice(-2)}`,
            managed,
            position: position[id],
            comparePositionTo: (other: Role) => position[id] - position[other.id],
        }) as unknown as Role;

    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    const roles = new Map<string, Role>([
        [LOW, role(LOW)],
        [MID, role(MID)],
        [HIGH, role(HIGH)],
        [BOT_ROLE, role(BOT_ROLE)],
        [GUILD, role(GUILD)],
    ]);

    return {
        id: GUILD,
        name: "Dev Server",
        roles: { cache: roles },
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)], [VOICE, channel(VOICE, ChannelType.GuildVoice)]]) },
        members: {
            me: {
                permissions: { has: () => canManage },
                roles: { highest: roles.get(BOT_ROLE)! },
            },
        },
    } as unknown as Guild;
}

interface IFakeMember {
    member: GuildMember;
    added: string[];
    removed: string[];
}

function FakeMember(guild: Guild, has: string[]): IFakeMember {
    const own = new Set(has);
    const box: IFakeMember = { added: [], removed: [], member: null as unknown as GuildMember };

    box.member = {
        id: "123456789012345678",
        guild,
        roles: {
            cache: { has: (id: string) => own.has(id) },
            add: async (ids: string[]) => {
                box.added.push(...ids);
            },
            remove: async (ids: string[]) => {
                box.removed.push(...ids);
            },
        },
    } as unknown as GuildMember;

    return box;
}

function FakeRank(key: string, tier: number, mmr: number, placement = false): IPrimeRank {
    return {
        key: key as IPrimeRank["key"],
        label: key,
        mmr,
        tier,
        tierName: `Stufe ${tier}`,
        division: 0,
        divisionName: "I",
        matches: 100,
        streak: 0,
        placement,
        placementMatches: placement ? 3 : 10,
    };
}

/** Prime, Konto und Einstellungen durch eigene Werte ersetzen - ohne Netz, ohne Datenbank. */
function Stub(client: BotClient, settings: IRankRoleSettings, ranks: IPrimeRank[], epicName: string | null = "MecryTv"): void {
    Object.defineProperty(client.primeService, "IsConfigured", { get: () => true, configurable: true });
    Object.defineProperty(client.databaseService, "Ready", { get: () => true, configurable: true });

    client.rankRoleService.Settings = async () => settings;
    client.accounts.On = (async () => (epicName ? { display_name: epicName } : null)) as typeof client.accounts.On;
    client.primeService.Profile = (async () => ({ name: epicName ?? "", ranks }) as unknown as IPrimeProfile) as typeof client.primeService.Profile;
}

function Settings(over: Partial<IRankRoleSettings> = {}): IRankRoleSettings {
    const base = DefaultRankRoleSettings();

    return {
        ...base,
        ...over,
        playlists: {
            "1v1": { on: false, roles: {} },
            "2v2": { on: true, roles: { t17: MID } },
            "3v3": { on: true, roles: { t14: LOW, t17: MID } },
            ...(over.playlists ?? {}),
        },
    };
}

/* ----------------------------------------------------------
   Die Stufen
   ---------------------------------------------------------- */
function checkSteps(): void {
    console.log("\n  — Die Stufen —");

    const tiers = Steps();

    check("22 Ränge", tiers.length === 22, String(tiers.length));
    check("Sie beginnen bei Bronze I", tiers[0].name === "Bronze I" && tiers[0].key === "t1");
    check("Und hören bei Supersonic Legend auf", tiers.at(-1)?.name === "Supersonic Legend" && tiers.at(-1)?.key === "t22");
    check("Jeder Rang kennt seine Stufe", tiers.every((step, index) => step.tier === index + 1));
    check("Jeder Rang hat eine Farbe", tiers.every((step) => /^#[0-9a-f]{6}$/i.test(step.color)));
    check("Keine zwei Ränge teilen sich einen Schlüssel", new Set(tiers.map((step) => step.key)).size === tiers.length);

    check("Die Farbfamilien decken 1 bis 22 lückenlos ab", RANK_GROUPS.every((group, index) => (index === 0 ? group.from === 1 : group.from === RANK_GROUPS[index - 1].to + 1)));
    check("Champion II ist t17", StepOf(17) === "t17", String(StepOf(17)));
    check("Unranked bekommt nie eine Stufe", StepOf(0) === null);
    check("Und Unsinn auch nicht", StepOf(99) === null && StepOf(-3) === null);
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.rankRoleService;
    const clean = service.CleanSettings(
        guild,
        {
            replace: false,
            channelId: TEXT,
            playlists: {
                "3v3": { on: true, roles: { t17: HIGH, t14: "999", t8: GUILD, erfunden: LOW, champion: LOW } },
                "2v2": { on: false, roles: {} },
            },
        },
        DefaultRankRoleSettings()
    );

    check("Eine echte Rolle bleibt", clean.playlists["3v3"].roles.t17 === HIGH);
    check("Eine erfundene Rolle fällt weg", clean.playlists["3v3"].roles.t14 === null);
    check("@everyone ist keine Rang-Rolle", clean.playlists["3v3"].roles.t8 === null);
    check("Eine erfundene Stufe fällt weg", !("erfunden" in clean.playlists["3v3"].roles));
    check("Eine alte Gruppen-Stufe auch", !("champion" in clean.playlists["3v3"].roles));
    check("Der Schalter kommt an", clean.playlists["2v2"].on === false);
    check("Der Kanal kommt an", clean.channelId === TEXT);
    check("Ein Sprachkanal fällt weg", service.CleanSettings(guild, { channelId: VOICE }, DefaultRankRoleSettings()).channelId === null);
    check("Abnehmen lässt sich abschalten", clean.replace === false);

    const kept = service.CleanSettings(guild, {}, clean);

    check("Ohne Angabe bleibt alles stehen", kept.playlists["3v3"].roles.t17 === HIGH && kept.channelId === TEXT);

    console.log("\n  — Welche Rolle zu welchem Rang —");

    const settings = Settings();

    check("Diamant II holt seine Rolle", service.RoleFor(settings, "3v3", 14) === LOW);
    check("Champion II seine eigene", service.RoleFor(settings, "3v3", 17) === MID);
    check("Der Rang daneben bekommt nichts", service.RoleFor(settings, "3v3", 16) === null);
    check("Ohne Rang gibt es keine Rolle", service.RoleFor(settings, "3v3", 0) === null);
    check("Ohne Eintrag auch nicht", service.RoleFor(settings, "3v3", 1) === null);
    check("Das Modul kennt seine Rollen", service.Managed(settings).size === 2, String(service.Managed(settings).size));
}

/* ----------------------------------------------------------
   Der Befehl
   ---------------------------------------------------------- */
async function checkApply(client: BotClient): Promise<void> {
    console.log("\n  — Was der Befehl vergibt —");

    const guild = FakeGuild();
    const service = client.rankRoleService;

    Stub(client, Settings(), [FakeRank("2v2", 17, 1400), FakeRank("3v3", 14, 1300)]);

    const first = FakeMember(guild, []);
    const result = await service.Apply(first.member);

    check("Zwei Playlists, zwei Rollen", first.added.length === 2, first.added.join(","));
    check("Nichts wird abgenommen", first.removed.length === 0);
    check("Der Epic-Name steht im Ergebnis", result.epicName === "MecryTv");
    check("Je Playlist ein Eintrag", result.changes.length === 2);
    check("1v1 ist aus und taucht nicht auf", !result.changes.some((change) => change.playlist === "1v1"));

    // Aufstieg: Diamant war gesetzt, jetzt Champion - die alte Rolle geht ab.
    Stub(client, Settings(), [FakeRank("3v3", 17, 1450)]);

    const up = FakeMember(FakeGuild(), [LOW]);
    const climbed = await service.Apply(up.member);

    check("Beim Aufstieg kommt die neue Rolle", up.added.includes(MID), up.added.join(","));
    check("Und die alte geht ab", up.removed.includes(LOW), up.removed.join(","));
    check("Ohne Probleme bei der gespielten Playlist", climbed.changes.find((change) => change.playlist === "3v3")?.problem === null);

    // Dasselbe noch einmal: nichts zu tun.
    const again = FakeMember(FakeGuild(), [MID]);

    await service.Apply(again.member);

    check("Wer sie schon hat, bekommt sie nicht noch einmal", again.added.length === 0 && again.removed.length === 0);

    // Abnehmen abgeschaltet: die alte Rolle bleibt.
    Stub(client, Settings({ replace: false }), [FakeRank("3v3", 17, 1450)]);

    const keep = FakeMember(FakeGuild(), [LOW]);

    await service.Apply(keep.member);

    check("Ohne Abnehmen bleibt die alte Rolle", keep.removed.length === 0);

    console.log("\n  — Wenn etwas nicht geht —");

    Stub(client, Settings(), [FakeRank("3v3", 17, 1400, true)]);

    const placing = FakeMember(FakeGuild(), []);
    const placed = await service.Apply(placing.member);

    check("Platzierungsspiele bekommen keine Rolle", placing.added.length === 0);
    check("Und der Grund steht dabei", placed.changes.some((change) => change.problem?.includes("Platzierung")));

    Stub(client, Settings(), [FakeRank("3v3", 0, 0)]);

    const unranked = FakeMember(FakeGuild(), []);
    const none = await service.Apply(unranked.member);

    check("Ohne Rang passiert nichts", unranked.added.length === 0);
    check("Auch dafür gibt es einen Grund", none.changes.some((change) => change.problem?.includes("Kein Rang")));

    // Eine Rolle über dem Bot kann er nicht vergeben.
    Stub(client, Settings({ playlists: { "1v1": { on: false, roles: {} }, "2v2": { on: false, roles: {} }, "3v3": { on: true, roles: { t17: HIGH } } } }), [
        FakeRank("3v3", 17, 1400),
    ]);

    const tooHigh = FakeMember(FakeGuild(), []);
    const blocked = await service.Apply(tooHigh.member);

    check("Eine zu hohe Rolle wird nicht vergeben", tooHigh.added.length === 0);
    check("Und als Hindernis gemeldet", blocked.blocked.includes(HIGH) && Boolean(blocked.changes[0]?.problem?.includes("höchste")), JSON.stringify(blocked.changes[0]?.problem));

    Stub(client, Settings(), [FakeRank("3v3", 14, 1300)], null);
    await refuses("Ohne verknüpftes Konto geht es nicht", () => service.Apply(FakeMember(FakeGuild(), []).member));

    Stub(client, Settings({ playlists: { "1v1": { on: false, roles: {} }, "2v2": { on: false, roles: {} }, "3v3": { on: false, roles: {} } } }), []);
    await refuses("Ohne eingeschaltete Playlist auch nicht", () => service.Apply(FakeMember(FakeGuild(), []).member));

    console.log("\n  — Ablegen —");

    Stub(client, Settings(), []);

    const strip = FakeMember(FakeGuild(), [LOW, MID, HIGH]);
    const gone = await service.Strip(strip.member);

    check("Die eigenen Rollen gehen ab", gone.includes(LOW) && gone.includes(MID), gone.join(","));
    check("Eine zu hohe Rolle rührt er nicht an", !gone.includes(HIGH));
}

async function main(): Promise<void> {
    console.log("\n🎖️  Rank Roles\n");

    const client = new BotClient();

    checkSteps();
    checkClean(client);
    await checkApply(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
