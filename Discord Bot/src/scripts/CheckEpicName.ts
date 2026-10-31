/**
 * Prüft „Epic-Name geändert“ ohne Discord, Datenbank und Prime (Plan 33):
 * den Stand mit Konto-ID, das Erkennen, das Umbenennen in den Kadern, die
 * Karten und das Fenster, Selbst-Holen, Fälle, Knöpfe und den Captain.
 *
 *   npm run check:epicname
 *
 * Ob ein echter Namenswechsel ankommt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import BotClient from "../client/BotClient";
import { ITeam, ITeamPlayer } from "../interfaces/services/teams/ITeams";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import TeamService from "../services/TeamService";
import { IPlayerSnapshot, ITeamSettings } from "../interfaces/services/teams/ITeams";
import { NameLost, RenamePlaceholders, RenamePlayers } from "../services/teams/EpicName";
import { AskDm, CaptainDm, DoneReply, EpicModal, NotFoundReply, OtherAccountReply, RenamedDm, TooManyReply, TypedHint } from "../builder/EpicNameView";
import EpicNameService from "../services/EpicNameService";
import { IEpicCase } from "../interfaces/services/teams/IEpicName";
import { ButtonInteraction, Message, ModalSubmitInteraction } from "discord.js";
import TicketMessages from "../events/tickets/TicketMessages";
import { TeamRole } from "../interfaces/services/teams/ITeams";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const NICO = "90071992547412001";
const ZEN = "90071992547412002";

function Player(epicName: string, discordId: string | null = null, extra: Partial<ITeamPlayer> = {}): ITeamPlayer {
    return { id: epicName.toLowerCase(), discordId, name: "", epicName, role: "player", peaks: { "1v1": null, "2v2": null, "3v3": null }, ...extra };
}

function Profile(name: string, accountId: string): IPrimeProfile {
    return { name, platform: "Epic", accountId, playerId: `Epic|${accountId}|0`, linked: [], seasonLevel: 0, seasonWins: 0, ranks: [{ key: "3v3", mmr: 1512, tier: 20, tierName: "Grand Champion II", divisionName: "Division III" }], stats: {}, club: null } as unknown as IPrimeProfile;
}

/* ----------------------------------------------------------
   Task 1: Stand mit Konto-ID
   ---------------------------------------------------------- */
async function checkSnapshot(): Promise<void> {
    console.log("\n  — Stand mit Konto-ID —");

    const saved = new Map<number, ITeamPlayer[]>();
    const client = {
        primeService: {
            IsConfigured: true,
            Profile: async (name: string) => {
                if (name === "Kaputt") throw new Error("Prime antwortet nicht.");

                return name === "Vyrox.Nico" ? Profile("Vyrox.Nico", "acc-1") : null;
            },
        },
        teams: { SavePlayers: async (id: number, players: ITeamPlayer[]) => void saved.set(id, structuredClone(players)) },
    } as unknown as BotClient;
    const team = { id: 1, guildId: "1", players: [Player("Vyrox.Nico", NICO), Player("Weg", ZEN), Player("Kaputt")] } as unknown as ITeam;

    await new TeamService(client).Sync([team], true);

    const find = (name: string) => saved.get(1)?.find((player) => player.epicName === name)?.snapshot;

    check("Treffer: Stand merkt sich die Konto-ID", find("Vyrox.Nico")?.accountId === "acc-1", JSON.stringify(find("Vyrox.Nico")));
    check("Kennt nicht: missing gesetzt", find("Weg")?.missing === true, JSON.stringify(find("Weg")));
    check("Prime wirft: missing nicht gesetzt, Fehler steht da", find("Kaputt")?.missing !== true && (find("Kaputt")?.error ?? null) !== null, JSON.stringify(find("Kaputt")));
}

/* ----------------------------------------------------------
   Task 2: erkennen, umbenennen, Platzhalter
   ---------------------------------------------------------- */
function Snapshot(extra: Partial<IPlayerSnapshot> = {}): IPlayerSnapshot {
    return { name: "Vyrox.Nico", platform: "Epic", mmr: { "1v1": null, "2v2": null, "3v3": 1512 }, tier: 20, tierName: "Grand Champion II", divisionName: "Division III", at: 1, error: null, accountId: "acc-1", ...extra };
}

function checkLogic(): void {
    console.log("\n  — Erkennen, umbenennen, Platzhalter —");

    const found = Snapshot();
    const missing = Snapshot({ name: null, tier: null, mmr: { "1v1": null, "2v2": null, "3v3": null }, error: "Prime kennt diesen Namen nicht.", missing: true, accountId: null });
    const errorOnly = Snapshot({ name: null, error: "Prime antwortet nicht.", accountId: null });
    const neverFound = Snapshot({ name: null, error: "Prime kennt diesen Namen nicht.", missing: true, accountId: null });

    check("Vorher gefunden, jetzt „kennt nicht“: gone", NameLost(found, missing) === "gone");
    check("Nie gefunden: nichts", NameLost(neverFound, missing) === null && NameLost(undefined, missing) === null);
    check("Prime-Fehler: nichts", NameLost(found, errorOnly) === null);
    check("Gleicher Name, anderes Konto: taken", NameLost(found, Snapshot({ accountId: "acc-2" })) === "taken");
    check("Gleiches Konto: nichts", NameLost(found, Snapshot()) === null);
    check("Konto vorher unbekannt: kein taken", NameLost(Snapshot({ accountId: null }), Snapshot({ accountId: "acc-2" })) === null);

    const names = (team: ITeam) => team.players.map((player) => player.epicName).join();
    const team = { id: 1, players: [Player("Vyrox.Nico", NICO), Player("Zen", ZEN), Player("vyrox.nico", ZEN)] } as unknown as ITeam;
    const changed = RenamePlayers(team, { discordId: NICO, oldName: "VYROX.NICO" }, "Nico.RLN");
    check("Umbenennen trifft nur die Person mit diesem Namen", changed && names(team) === "Nico.RLN,Zen,vyrox.nico", names(team));
    check("Nichts zu tun: false", !RenamePlayers(team, { discordId: NICO, oldName: "Vyrox.Nico" }, "Nico.RLN"));

    const loose = { id: 2, players: [Player("Vyrox.Nico"), Player("Zen")] } as unknown as ITeam;
    check("Ohne Discord-ID nur über den Namen", RenamePlayers(loose, { discordId: null, oldName: "Vyrox.Nico" }, "Nico.RLN") && names(loose) === "Nico.RLN,Zen", names(loose));

    const settingsWith = (content: string) => ({ board: { kind: "text", content, embed: null, doc: { blocks: [] } }, hubLine: "{team.name}" }) as unknown as ITeamSettings;
    const renamed = RenamePlaceholders(settingsWith("{vyroxnico.rank} und {vyroxnico} und {Vyrox_Nico.mmr} und {team.name}"), "Vyrox.Nico", "Nico.RLN");
    check("Platzhalter mit altem Namen werden umgeschrieben, auch anders geschrieben", renamed?.board.content === "{nicorln.rank} und {nicorln} und {nicorln.mmr} und {team.name}", JSON.stringify(renamed?.board));
    check("Ohne Platzhalter: null", RenamePlaceholders(settingsWith("{team.name} {vyroxnicoplus.rank}"), "Vyrox.Nico", "Nico.RLN") === null);
}

/* ----------------------------------------------------------
   Task 3: Karten und Fenster
   ---------------------------------------------------------- */
type AnyMessage = { components?: readonly unknown[]; allowedMentions?: { parse?: readonly string[] } };

function Tree(message: AnyMessage): unknown[] {
    return (message.components ?? []).map((part) => (part as { toJSON?: () => unknown }).toJSON?.() ?? part);
}

function CountParts(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((sum: number, entry) => sum + CountParts(entry), 0);
    if (!node || typeof node !== "object") return 0;

    const entry = node as { type?: unknown; components?: unknown; accessory?: unknown; component?: unknown };

    return (typeof entry.type === "number" ? 1 : 0) + CountParts(entry.components) + CountParts(entry.accessory) + CountParts(entry.component);
}

/** Alle Texte einer Nachricht, wie sie in Discord stehen. */
function Contents(node: unknown): string {
    if (Array.isArray(node)) return node.map(Contents).filter(Boolean).join("\n");
    if (!node || typeof node !== "object") return "";

    const entry = node as { content?: unknown; label?: unknown; description?: unknown; title?: unknown; components?: unknown; accessory?: unknown; component?: unknown };
    const own = [entry.title, entry.content, entry.label, entry.description].filter((value): value is string => typeof value === "string");

    return [...own, Contents(entry.components), Contents(entry.accessory), Contents(entry.component)].filter(Boolean).join("\n");
}

function Buttons(node: unknown): { custom_id?: string; url?: string; label?: string }[] {
    if (Array.isArray(node)) return node.flatMap(Buttons);
    if (!node || typeof node !== "object") return [];

    const entry = node as { type?: unknown; components?: unknown; accessory?: unknown };

    return [...(entry.type === 2 ? [entry as { custom_id?: string; url?: string; label?: string }] : []), ...Buttons(entry.components), ...Buttons(entry.accessory)];
}

function checkViews(): void {
    console.log("\n  — Karten und Fenster —");

    const seen = Date.UTC(2026, 9, 28, 13, 0);
    const lastSeen = { at: seen, tierName: "Grand Champion II", divisionName: "Division III", mmr3: 1512 };
    const one = [{ guildName: "RL Nexus Esports", teamName: "Vyrox Main" }, { guildName: "RL Nexus Esports", teamName: "Vyrox Academy" }];
    const two = [{ guildName: "RL Nexus Esports", teamName: "Vyrox Main" }, { guildName: "Zweiter Server", teamName: "Night Owls" }];

    const ask = AskDm({ caseId: 7, oldName: "Vyrox.Nico", places: one, linked: true, lastSeen });
    const askText = Contents(Tree(ask));
    const askButtons = Buttons(Tree(ask));
    const okCard = (message: AnyMessage) => CountParts(Tree(message)) <= 40 && message.allowedMentions?.parse?.length === 0;

    check("DM: höchstens 40 Bausteine, keine Pings", okCard(ask), String(CountParts(Tree(ask))));
    check("DM: Titel und Server", askText.includes("🎮 Epic-Name geändert?") && askText.includes("RL Nexus Esports"), askText);
    check("DM: alter Name und Satz aus der Spec", askText.includes("Unter **Vyrox.Nico** findet der Bot dich nicht mehr. Trag deinen neuen Namen ein, dann ändert er ihn überall:"), askText);
    check("DM: beide Kader und die Verknüpfung", askText.includes("im Kader von **Vyrox Main** und **Vyrox Academy**") && askText.includes("in deiner Verknüpfung für `/rank me` und die Rang-Rollen"), askText);
    check("DM: zuletzt gesehen", askText.includes("Zuletzt gesehen am 28.10.: Grand Champion II · 1.512 MMR im 3v3"), askText);
    check("DM: Knopf und Fuß", askButtons.some((button) => button.custom_id === "epic:ask:7" && button.label === "Neuen Namen eintragen") && askText.includes("Der neue Name muss zu deinem Epic-Konto gehören."), JSON.stringify(askButtons));

    const askTwo = Contents(Tree(AskDm({ caseId: 7, oldName: "Vyrox.Nico", places: two, linked: false, lastSeen: { ...lastSeen, tierName: null, mmr3: null } })));
    check("DM: zwei Server, beide genannt", askTwo.includes("RL Nexus Esports") && askTwo.includes("Zweiter Server") && askTwo.includes("**Night Owls**"), askTwo);
    check("DM: ohne Verknüpfung keine Zeile dazu", !askTwo.includes("/rank me"), askTwo);
    check("DM: ohne Rang nur das Datum", askTwo.includes("Zuletzt gesehen am 28.10.") && !askTwo.includes("MMR"), askTwo);

    const auto = RenamedDm({ oldName: "Vyrox.Nico", newName: "Nico.RLN", places: one, linked: true, rank: "Grand Champion II · 1.512 MMR im 3v3", auto: true });
    const autoText = Contents(Tree(auto));
    check("Selbst geholt: Satz aus der Spec, kein Knopf", okCard(auto) && autoText.includes("✅ Dein Epic-Name hat sich geändert: Vyrox.Nico → **Nico.RLN**. Ich habe ihn überall angepasst:") && Buttons(Tree(auto)).length === 0, autoText);

    const done = RenamedDm({ oldName: "Vyrox.Nico", newName: "Nico.RLN", places: one, linked: false, rank: "Grand Champion II", auto: false });
    const doneText = Contents(Tree(done));
    check("Bestätigung: Titel, alt → neu, Ränge, kein Knopf", doneText.includes("✅ Epic-Name aktualisiert") && doneText.includes("Vyrox.Nico → **Nico.RLN**") && doneText.includes("Ränge neu geholt: Grand Champion II") && Buttons(Tree(done)).length === 0, doneText);

    const modal = EpicModal(7, "Vyrox.Nico", seen).toJSON() as { custom_id: string; title: string; components: unknown[] };
    const fields = JSON.stringify(modal);
    const modalText = Contents(modal.components);
    check("Fenster: custom_id und Titel", modal.custom_id === "epic:modal:7" && modal.title === "Neuer Epic-Name", fields);
    check("Fenster: ein Pflichtfeld name", (fields.match(/"custom_id":"name"/g) ?? []).length === 1 && fields.includes('"required":true') && fields.includes('"max_length":100'), fields);
    check("Fenster: beide Texte und das Feld", modalText.includes("Bisher: **Vyrox.Nico** · zuletzt gesehen am 28.10.") && modalText.includes("Der Bot prüft bei Epic, ob der Name zu deinem Konto gehört.") && modalText.includes("Dein neuer Epic-Name") && modalText.includes("So, wie er in Rocket League unter Profil steht"), modalText);

    const again = (message: AnyMessage) => Buttons(Tree(message)).some((button) => button.custom_id === "epic:again:7" && button.label === "Noch einmal");
    const notFound = NotFoundReply("Nico.RLM", 7);
    const other = OtherAccountReply("Zen", "Vyrox.Nico", 7);
    check("Unbekannt: Text und Noch einmal", again(notFound) && Contents(Tree(notFound)).includes("Epic kennt **Nico.RLM** nicht."), Contents(Tree(notFound)));
    check("Fremdes Konto: Text und Noch einmal", again(other) && Contents(Tree(other)).includes("**Zen** gehört zu einem anderen Epic-Konto als Vyrox.Nico."), Contents(Tree(other)));
    check("Schon erledigt", Contents(Tree(DoneReply())).includes("Schon erledigt, danke."));
    check("Zu viele Versuche: eigener Text", Contents(Tree(TooManyReply())).length > 0);

    const hint = TypedHint(7, "Vyrox.Nico");
    check("Getippt: Hinweis mit altem Namen und Knopf", Contents(Tree(hint)).includes("Trag deinen neuen Namen über den Knopf ein.") && Contents(Tree(hint)).includes("**Vyrox.Nico**") && Buttons(Tree(hint)).some((button) => button.custom_id === "epic:ask:7"), Contents(Tree(hint)));

    const captain = CaptainDm({ team: "Vyrox Main", server: "RL Nexus Esports", oldName: "Vyrox.Nico", userId: NICO, reason: "closed", dashboardUrl: "https://bot.example/dashboard/guild/1/teams" });
    const captainText = Contents(Tree(captain));
    check("Captain: Text, Link, keine Pings", okCard(captain) && captainText.includes(`Bei **Vyrox Main** findet der Bot **Vyrox.Nico** (<@${NICO}>) nicht mehr bei Epic.`) && captainText.includes("hat keine DMs offen") && Buttons(Tree(captain)).some((button) => button.url?.startsWith("https://") && button.label === "Im Dashboard"), captainText);
    check("Captain: nach 3 Tagen", Contents(Tree(CaptainDm({ team: "Vyrox Main", server: "RL Nexus Esports", oldName: "Vyrox.Nico", userId: NICO, reason: "silent", dashboardUrl: "https://bot.example" }))).includes("seit 3 Tagen nicht reagiert"));
}

/* ----------------------------------------------------------
   Task 4: selbst holen, Fall anlegen, umbenennen
   ---------------------------------------------------------- */
const CAPTAIN = "90071992547412003";
const COCAPTAIN = "90071992547412004";

interface IWorldOptions {
    /** Was Prime je Name oder Konto-ID antwortet. "throw": Prime antwortet nicht. */
    prime: Record<string, IPrimeProfile | null | "throw">;
    accountId: string | null;
    linked: boolean;
    closed?: string[];
    /** Zusätzliche Spieler in Team A. */
    extraA?: ITeamPlayer[];
    /** Nicos Aufgabe in Team A. */
    nicoRole?: TeamRole;
    /** Auf diesem Server ist die Übersicht eingesammelt (kein messageId). */
    recalled?: string;
}

interface ISentDm {
    to: string;
    text: string;
    buttons: string[];
}

function FakeCases(): { rows: Map<number, IEpicCase>; model: unknown } {
    const rows = new Map<number, IEpicCase>();
    let next = 1;
    const open = () => [...rows.values()].filter((entry) => entry.resolvedAt === null);

    return {
        rows,
        model: {
            Add: async (input: Pick<IEpicCase, "userId" | "oldName" | "accountId" | "lastSeen" | "detectedAt">) => {
                if ([...rows.values()].some((entry) => entry.userId === input.userId && entry.oldName.toLowerCase() === input.oldName.toLowerCase())) return null;

                const made: IEpicCase = { id: next++, ...input, dmAt: null, dmFailed: false, channelId: null, messageId: null, captainAt: null, resolvedAt: null };

                rows.set(made.id, made);

                return structuredClone(made);
            },
            Get: async (id: number) => (rows.has(id) ? structuredClone(rows.get(id)!) : null),
            Open: async (userId: string) => structuredClone(open().filter((entry) => entry.userId === userId)),
            AllOpen: async () => structuredClone(open()),
            Due: async (now: number) => structuredClone(open().filter((entry) => entry.captainAt === null && (entry.dmFailed || (entry.dmAt !== null && entry.dmAt <= now - 3 * 86_400_000)))),
            Save: async (id: number, patch: Partial<IEpicCase>) => void Object.assign(rows.get(id)!, patch),
            Prune: async (before: number) => {
                const old = [...rows.values()].filter((entry) => entry.resolvedAt !== null && entry.resolvedAt < before);

                for (const entry of old) rows.delete(entry.id);

                return old.length;
            },
        },
    };
}

function World(options: IWorldOptions) {
    const before = new Date(Date.UTC(2026, 8, 1));
    const previous = Snapshot({ accountId: options.accountId });
    const nico = () => Player("Vyrox.Nico", NICO, { snapshot: structuredClone(previous) });
    const store = new Map<number, ITeam>([
        [1, { id: 1, guildId: "1", name: "Vyrox Main", players: [{ ...nico(), role: options.nicoRole ?? "player" }, Player("Zen", ZEN, { snapshot: Snapshot({ name: "Zen", accountId: "acc-zen" }) }), ...(options.extraA ?? [])] } as unknown as ITeam],
        [2, { id: 2, guildId: "2", name: "Vyrox Academy", players: [nico(), Player("Kyro", null, { snapshot: Snapshot({ name: "Kyro", accountId: "acc-kyro" }) })] } as unknown as ITeam],
    ]);
    const account = options.linked ? { user_id: NICO, platform: "epic", account_id: options.accountId ?? "acc-1", display_name: "Vyrox.Nico", changed_at: before } : null;
    const settings = new Map<string, ITeamSettings>([
        ["1", { layout: "hub", channelId: "c1", messageId: options.recalled === "1" ? null : "h1", board: { kind: "text", content: "{vyroxnico.rank} führt", embed: null, doc: { blocks: [] } }, hubLine: "{team.name}" } as unknown as ITeamSettings],
        ["2", { layout: "hub", channelId: "c2", messageId: options.recalled === "2" ? null : "h2", board: { kind: "text", content: "{team.name}", embed: null, doc: { blocks: [] } }, hubLine: "{team.name}" } as unknown as ITeamSettings],
    ]);
    const saved = new Map<string, ITeamSettings>();
    const dms: ISentDm[] = [];
    const publishes: string[] = [];
    const cases = FakeCases();
    const answer = async (query: string) => {
        const reply = options.prime[query];

        if (reply === "throw") throw new Error("Prime antwortet nicht.");

        return reply === undefined ? (query === "Zen" ? Profile("Zen", "acc-zen") : query === "Kyro" ? Profile("Kyro", "acc-kyro") : null) : reply;
    };
    const client = {
        primeService: { IsConfigured: true, Profile: answer },
        accounts: {
            On: async (userId: string) => (account && userId === account.user_id ? { ...account } : null),
            Rename: async (_userId: string, _platform: string, name: string) => void (account!.display_name = name),
        },
        epicNameCases: cases.model,
        teams: {
            SavePlayers: async (id: number, players: ITeamPlayer[]) => void (store.get(id)!.players = structuredClone(players)),
            WithPlayer: async (discordId: string) => [...store.values()].filter((team) => team.players.some((player) => player.discordId === discordId)).map((team) => structuredClone(team)),
        },
        moduleSettings: { Save: async (guildId: string, _module: string, config: ITeamSettings) => void saved.set(guildId, structuredClone(config)) },
        guilds: { cache: new Map([["1", { id: "1", name: "Server A" }], ["2", { id: "2", name: "Server B" }]]) },
        users: {
            fetch: async (id: string) => ({
                send: async (payload: AnyMessage) => {
                    if (options.closed?.includes(id)) throw new Error("Cannot send messages to this user");

                    dms.push({ to: id, text: Contents(Tree(payload)), buttons: Buttons(Tree(payload)).map((button) => button.custom_id ?? button.url ?? "") });

                    return { id: `m${dms.length}`, channelId: `dm-${id}` };
                },
            }),
        },
        server: { BaseURL: "https://bot.example" },
    } as unknown as BotClient & { teamService: TeamService; epicNameService: EpicNameService };
    const service = new TeamService(client);

    service.Settings = async (guildId: string) => structuredClone(saved.get(guildId) ?? settings.get(guildId)!);
    service.Publish = async (guild) => {
        publishes.push(guild.id);

        return { layout: "hub", sent: 0, failed: 0 };
    };
    client.teamService = service;
    client.epicNameService = new EpicNameService(client);

    const loaded = () => [...store.values()].map((team) => structuredClone(team));
    const names = (id: number) => store.get(id)!.players.filter((player) => player.discordId === NICO).map((player) => player.epicName).join();
    const snapshot = (id: number) => store.get(id)!.players.find((player) => player.discordId === NICO)!.snapshot!;

    return { client, service, store, account, saved, dms, publishes, cases: cases.rows, previous, before, loaded, names, snapshot };
}

async function checkLost(): Promise<void> {
    console.log("\n  — Selbst holen, Fall, umbenennen —");

    const renamed = Profile("Nico.RLN", "acc-1");
    const auto = World({ prime: { "Vyrox.Nico": null, "acc-1": renamed, "Nico.RLN": renamed }, accountId: "acc-1", linked: true });

    await auto.service.Sync(auto.loaded());
    check("Selbst geholt über die Konto-ID: beide Kader neu, nach Sync nicht überschrieben", auto.names(1) === "Nico.RLN" && auto.names(2) === "Nico.RLN", `${auto.names(1)} / ${auto.names(2)}`);
    check("Selbst geholt: frischer Stand des neuen Namens in beiden Kadern", auto.snapshot(1).name === "Nico.RLN" && auto.snapshot(2).name === "Nico.RLN" && auto.snapshot(2).error === null, JSON.stringify(auto.snapshot(2)));
    check("Selbst geholt: Verknüpfung umbenannt, Sperrfrist bleibt", auto.account?.display_name === "Nico.RLN" && auto.account?.changed_at === auto.before, JSON.stringify(auto.account));
    check("Selbst geholt: Platzhalter umgeschrieben, Hinweis ohne Knopf, kein Fall", (auto.saved.get("1")?.board.content ?? "").includes("{nicorln.rank}") && auto.dms.length === 1 && auto.dms[0].text.includes("hat sich geändert") && !auto.dms[0].buttons.some((id) => id.startsWith("epic:ask")) && auto.cases.size === 0, JSON.stringify({ board: auto.saved.get("1")?.board.content, dms: auto.dms, cases: auto.cases.size }));
    check("Selbst geholt: beide Server neu gezeichnet", auto.publishes.includes("1") && auto.publishes.includes("2"), auto.publishes.join());

    await auto.service.Sync(auto.loaded(), true);
    check("Selbst geholt: nächster Abgleich ändert nichts mehr, keine zweite DM", auto.names(1) === "Nico.RLN" && auto.dms.length === 1, String(auto.dms.length));

    const failing = World({ prime: { "Vyrox.Nico": null, "acc-1": "throw" }, accountId: "acc-1", linked: false });

    await failing.service.Sync(failing.loaded());
    check("Prime wirft beim Selbst-Holen: alter Stand bleibt, keine DM, kein Fall", JSON.stringify(failing.snapshot(1)) === JSON.stringify(failing.previous) && failing.dms.length === 0 && failing.cases.size === 0, JSON.stringify(failing.snapshot(1)));

    const ask = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false });

    await ask.service.Sync(ask.loaded());
    check("Ohne Konto-ID: ein Fall, eine DM mit beiden Teams und Servern", ask.cases.size === 1 && ask.dms.length === 1 && ask.dms[0].text.includes("Vyrox Main") && ask.dms[0].text.includes("Vyrox Academy") && ask.dms[0].text.includes("Server B") && ask.dms[0].buttons.includes("epic:ask:1"), JSON.stringify(ask.dms));
    check("Ohne Konto-ID: DM gemerkt", ask.cases.get(1)?.dmAt !== null && ask.cases.get(1)?.messageId === "m1" && ask.cases.get(1)?.channelId === `dm-${NICO}`, JSON.stringify(ask.cases.get(1)));

    await ask.service.Sync(ask.loaded(), true);
    check("Zweiter Abgleich: keine zweite DM", ask.dms.length === 1 && ask.cases.size === 1, String(ask.dms.length));

    const linkedOnly = World({ prime: { "Vyrox.Nico": null, "acc-9": Profile("Nico.RLN", "acc-9"), "Nico.RLN": Profile("Nico.RLN", "acc-9") }, accountId: null, linked: true });

    linkedOnly.account!.account_id = "acc-9";
    await linkedOnly.service.Sync(linkedOnly.loaded());
    check("Konto-ID aus der Verknüpfung, wenn der Stand keine hat", linkedOnly.names(1) === "Nico.RLN" && linkedOnly.cases.size === 0, linkedOnly.names(1));

    const closed = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false, closed: [NICO], extraA: [Player("Cap", CAPTAIN, { role: "captain" }), Player("Co", COCAPTAIN, { role: "cocaptain" })] });

    await closed.service.Sync(closed.loaded());
    check("DM kommt nicht an: Captain sofort, nur der Captain", closed.cases.get(1)?.dmFailed === true && closed.dms.map((dm) => dm.to).join() === CAPTAIN && closed.cases.get(1)?.captainAt !== null, JSON.stringify(closed.dms.map((dm) => dm.to)));
    check("Captain-DM: Team, alter Name, Link", closed.dms[0]?.text.includes("Bei **Vyrox Main** findet der Bot **Vyrox.Nico**") && closed.dms[0]?.text.includes("keine DMs offen") && closed.dms[0]?.buttons.some((id) => id.startsWith("https://bot.example")), JSON.stringify(closed.dms[0]));

    const taken = World({ prime: { "Vyrox.Nico": Profile("Vyrox.Nico", "acc-2"), "acc-1": null }, accountId: "acc-1", linked: false });

    await taken.service.Sync(taken.loaded());
    check("Anderes Konto unter altem Namen: alte Ränge bleiben", taken.snapshot(1).mmr["3v3"] === 1512 && taken.snapshot(1).accountId === "acc-1" && (taken.snapshot(1).error ?? "").includes("anderen Epic-Konto"), JSON.stringify(taken.snapshot(1)));
    check("Anderes Konto: ein Fall, eine DM", taken.cases.size === 1 && taken.dms.length === 1, String(taken.dms.length));

    await taken.service.Sync(taken.loaded(), true);
    check("Anderes Konto, nächster Abgleich: fremde Ränge weiter nicht übernommen", taken.snapshot(1).accountId === "acc-1" && taken.dms.length === 1, JSON.stringify(taken.snapshot(1)));
}

/* ----------------------------------------------------------
   Task 5: Knopf, Fenster, getippte DM, Captain nach 3 Tagen
   ---------------------------------------------------------- */
interface IClicks {
    modals: string[];
    replies: string[];
    edits: string[];
}

function Clicks(world: ReturnType<typeof World>): IClicks & { press: (customId: string, user?: string) => Promise<void>; submit: (caseId: number, name: string, user?: string) => Promise<void> } {
    const clicks: IClicks = { modals: [], replies: [], edits: [] };
    const text = (payload: unknown) => Contents(Tree(payload as AnyMessage));
    const client = world.client as unknown as { channels: unknown };

    client.channels = {
        fetch: async () => ({ messages: { fetch: async () => ({ edit: async (payload: unknown) => void clicks.edits.push(text(payload)) }) } }),
    };

    const interaction = (customId: string, user: string, button: boolean, name = "") => {
        const state = { deferred: false, replied: false };

        return {
            customId,
            user: { id: user },
            get deferred() {
                return state.deferred;
            },
            get replied() {
                return state.replied;
            },
            isButton: () => button,
            isModalSubmit: () => !button,
            fields: { getTextInputValue: () => name },
            showModal: async (modal: { toJSON: () => { custom_id: string } }) => void clicks.modals.push(modal.toJSON().custom_id),
            reply: async (payload: unknown) => {
                state.replied = true;
                clicks.replies.push(text(payload));
            },
            update: async (payload: unknown) => {
                state.replied = true;
                clicks.replies.push(text(payload));
            },
            deferReply: async () => void (state.deferred = true),
            editReply: async (payload: unknown) => void clicks.replies.push(text(payload)),
            deleteReply: async () => undefined,
        } as unknown as ButtonInteraction;
    };

    return {
        ...clicks,
        press: (customId, user = NICO) => world.client.epicNameService.OnButton(interaction(customId, user, true)),
        submit: (caseId, name, user = NICO) => world.client.epicNameService.OnButton(interaction(`epic:modal:${caseId}`, user, false, name) as unknown as ModalSubmitInteraction),
    };
}

async function checkFlow(): Promise<void> {
    console.log("\n  — Knopf, Fenster, getippte DM, Captain —");

    const renamed = Profile("Nico.RLN", "acc-1");
    const world = World({ prime: { "Vyrox.Nico": null, "acc-1": null, "Nico.RLN": renamed, Zen: Profile("Zen", "acc-zen") }, accountId: "acc-1", linked: true });

    await world.service.Sync(world.loaded());

    const ui = Clicks(world);
    const original = world.client.epicNameService.Rename.bind(world.client.epicNameService);
    let renames = 0;

    world.client.epicNameService.Rename = async (input) => {
        renames++;

        return original(input);
    };

    await ui.press("epic:ask:1");
    check("Knopf öffnet Fenster 3", ui.modals[0] === "epic:modal:1", ui.modals.join());

    await ui.press("epic:ask:1", ZEN);
    check("Fremder Fall: nur „Schon erledigt“, kein Fenster", ui.modals.length === 1 && (ui.replies.at(-1) ?? "").includes("Schon erledigt"), JSON.stringify(ui));

    await ui.submit(1, "Nico.RLM");
    check("Unbekannter Name: abgelehnt mit Satz, nichts geändert", (ui.replies.at(-1) ?? "").includes("Epic kennt **Nico.RLM** nicht") && world.names(1) === "Vyrox.Nico", ui.replies.at(-1));

    await ui.submit(1, "Zen");
    check("Anderes Konto: abgelehnt", (ui.replies.at(-1) ?? "").includes("anderen Epic-Konto") && world.names(1) === "Vyrox.Nico", ui.replies.at(-1));

    await ui.submit(1, "  Nico.RLN ");
    check("Richtiger Name: überall umbenannt, DM wird grün, Fall erledigt", world.names(1) === "Nico.RLN" && world.names(2) === "Nico.RLN" && (ui.edits.at(-1) ?? "").includes("Epic-Name aktualisiert") && world.cases.get(1)?.resolvedAt !== null, JSON.stringify({ edits: ui.edits, names: [world.names(1), world.names(2)] }));
    check("Richtiger Name: Verknüpfung und Platzhalter mit", world.account?.display_name === "Nico.RLN" && (world.saved.get("1")?.board.content ?? "").includes("{nicorln.rank}"), JSON.stringify(world.account));

    await ui.submit(1, "Nico.RLN");
    check("Zweites Absenden: Schon erledigt, nichts doppelt", (ui.replies.at(-1) ?? "").includes("Schon erledigt") && renames === 1, `${ui.replies.at(-1)} / ${renames}`);

    await ui.press("epic:again:1");
    check("Knopf nach dem Erledigen: Schon erledigt, kein Fenster", ui.modals.length === 1 && (ui.replies.at(-1) ?? "").includes("Schon erledigt"), ui.replies.at(-1));

    const limit = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false });

    await limit.service.Sync(limit.loaded());

    const tries = Clicks(limit);
    const TOO_MANY_TEXT = Contents(Tree(TooManyReply()));

    for (let attempt = 0; attempt < 5; attempt++) await tries.submit(1, `Falsch${attempt}`);
    check("Fünf Versuche: alle beantwortet", tries.replies.filter((reply) => reply.includes("Epic kennt")).length === 5, JSON.stringify(tries.replies));

    await tries.submit(1, "Falsch6");
    check("Sechster Versuch in 10 Minuten: gebremst", (tries.replies.at(-1) ?? "") === TOO_MANY_TEXT, tries.replies.at(-1));

    // Getippte DM: Bewerbung und laufendes Ticket gehen vor, sonst der Hinweis statt Mod Mail.
    let applyOn = false;
    let ticketOn = false;
    let applyGot = 0;
    let ticketGot = 0;
    let modMail = 0;
    const hints: string[] = [];
    const routed = new TicketMessages({
        databaseService: { Ready: true },
        applyService: { flow: { OnDirectMessage: async () => (applyOn ? Boolean(++applyGot) : false) } },
        ticketService: {
            OnDirectMessage: async () => (ticketOn ? Boolean(++ticketGot) : false),
            ModMailGuildsFor: async () => {
                modMail++;

                return [];
            },
        },
        epicNameService: limit.client.epicNameService,
        guardian: { ReportError: async (error: Error) => void hints.push(`Fehler: ${error.message}`) },
    } as unknown as BotClient);
    const typed = (author = NICO) => ({ author: { id: author, bot: false }, system: false, content: "Nico.RLN", inGuild: () => false, reply: async (payload: AnyMessage) => void hints.push(JSON.stringify(Tree(payload))), react: async () => undefined }) as unknown as Message;

    await routed.Execute(typed());
    check("Getippte DM bei offenem Fall: Hinweis mit Knopf, kein Mod Mail", hints.length === 1 && hints[0].includes("epic:ask:1") && modMail === 0, JSON.stringify({ hints, modMail }));

    applyOn = true;
    await routed.Execute(typed());
    applyOn = false;
    ticketOn = true;
    await routed.Execute(typed());
    check("Getippte DM bei laufender Bewerbung oder laufendem Ticket: die gehen vor", applyGot === 1 && ticketGot === 1 && hints.length === 1, JSON.stringify({ applyGot, ticketGot, hints: hints.length }));

    ticketOn = false;
    await routed.Execute(typed(ZEN));
    check("Getippte DM ohne offenen Fall: Mod Mail wie bisher", modMail === 1 && hints.filter((hint) => hint.includes("epic:ask")).length === 1, JSON.stringify({ modMail, hints }));

    await routed.Execute(typed());
    check("Zweite getippte DM bei offenem Fall: Mod Mail, kein zweiter Hinweis", modMail === 2 && hints.filter((hint) => hint.includes("epic:ask")).length === 1, JSON.stringify({ modMail, hints }));

    // Captain nach 3 Tagen.
    const DAY = 86_400_000;
    const later = Date.now() + 4 * DAY;
    const silent = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false, nicoRole: "captain", extraA: [Player("Co", COCAPTAIN, { role: "cocaptain" })] });

    await silent.service.Sync(silent.loaded());
    await silent.client.epicNameService.Tick(Date.now());
    check("Vor 3 Tagen: kein Captain", silent.dms.length === 1 && silent.cases.get(1)?.captainAt === null, JSON.stringify(silent.dms.map((dm) => dm.to)));

    await silent.client.epicNameService.Tick(later);
    const captainTo = silent.dms.slice(1).map((dm) => dm.to);

    await silent.client.epicNameService.Tick(later + DAY);
    const second = silent.dms.slice(1 + captainTo.length);
    check("Nach 3 Tagen: Captain einmal, nicht die Person selbst, ohne Captain die Co-Captains", captainTo.join() === COCAPTAIN && second.length === 0 && (silent.dms[1]?.text ?? "").includes("seit 3 Tagen nicht reagiert"), JSON.stringify({ captainTo, second: second.length }));

    const alone = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false });

    await alone.service.Sync(alone.loaded());
    await alone.client.epicNameService.Tick(later);
    check("Ohne Captain und Co-Captain: keine DM, kein Absturz", alone.dms.length === 1 && alone.cases.get(1)?.captainAt !== null, JSON.stringify(alone.dms.map((dm) => dm.to)));

    const dashboard = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false, extraA: [Player("Cap", CAPTAIN, { role: "captain" })] });

    await dashboard.service.Sync(dashboard.loaded());
    for (const team of dashboard.store.values()) for (const player of team.players) if (player.discordId === NICO) player.epicName = "Nico.RLN";
    await dashboard.client.epicNameService.Tick(later);
    check("Name im Dashboard geändert: Fall erledigt, kein Captain", dashboard.cases.get(1)?.resolvedAt !== null && dashboard.dms.length === 1, JSON.stringify(dashboard.dms.map((dm) => dm.to)));

    const back = World({ prime: { "Vyrox.Nico": null, "acc-1": null }, accountId: "acc-1", linked: false, extraA: [Player("Cap", CAPTAIN, { role: "captain" })] });

    await back.service.Sync(back.loaded());
    for (const team of back.store.values()) for (const player of team.players) if (player.discordId === NICO) player.snapshot = Snapshot();
    await back.client.epicNameService.Tick(later);
    check("Prime kennt den alten Namen wieder zum selben Konto: erledigt", back.cases.get(1)?.resolvedAt !== null && back.dms.length === 1, JSON.stringify(back.cases.get(1)));

    await back.client.epicNameService.Tick(later + 31 * DAY);
    check("Erledigte Fälle nach 30 Tagen weg", back.cases.size === 0, String(back.cases.size));
}

/* ----------------------------------------------------------
   Abschluss-Review: Fix-Durchgang
   ---------------------------------------------------------- */
async function checkFixes(): Promise<void> {
    console.log("\n  — Abschluss-Review —");

    // I1: nur neu zeichnen, wo die Übersicht schon steht.
    const renamed = Profile("Nico.RLN", "acc-1");
    const out = World({ prime: { "Vyrox.Nico": null, "acc-1": renamed, "Nico.RLN": renamed }, accountId: "acc-1", linked: false, recalled: "2" });

    await out.service.Sync(out.loaded());
    check("Umbenennen zeichnet nur, wo die Übersicht steht (Server B eingesammelt)", out.names(2) === "Nico.RLN" && out.publishes.join() === "1", out.publishes.join());

    // I2: Prime-Fehler zwischendurch - die fremden Ränge kommen trotzdem nie.
    const takenPrime: IWorldOptions["prime"] = { "Vyrox.Nico": Profile("Vyrox.Nico", "acc-2"), "acc-1": null };
    const taken = World({ prime: takenPrime, accountId: "acc-1", linked: false });

    await taken.service.Sync(taken.loaded());
    takenPrime["Vyrox.Nico"] = "throw";
    await taken.service.Sync(taken.loaded(), true);
    takenPrime["Vyrox.Nico"] = Profile("Vyrox.Nico", "acc-2");
    await taken.service.Sync(taken.loaded(), true);
    check("Anderes Konto, dann Prime-Fehler, dann wieder fremd: keine fremden Ränge", taken.snapshot(1).accountId !== "acc-2" && (taken.snapshot(1).error ?? "").includes("anderen Epic-Konto"), JSON.stringify(taken.snapshot(1)));

    const gonePrime: IWorldOptions["prime"] = { "Vyrox.Nico": "throw", "acc-1": null };
    const gone = World({ prime: gonePrime, accountId: "acc-1", linked: false });

    await gone.service.Sync(gone.loaded());
    gonePrime["Vyrox.Nico"] = null;
    await gone.service.Sync(gone.loaded(), true);
    check("Erst Prime-Fehler, dann „kennt nicht“: trotzdem erkannt", gone.cases.size === 1 && gone.dms.length === 1, JSON.stringify({ cases: gone.cases.size, snapshot: gone.snapshot(1) }));

    // M4: zweites Absenden liest den Fall, bevor das erste fertig ist.
    const race = World({ prime: { "Vyrox.Nico": null, "Nico.RLN": renamed }, accountId: null, linked: false });

    await race.service.Sync(race.loaded());

    const raceUi = Clicks(race);
    const model = race.client.epicNameCases as unknown as { Get: (id: number) => Promise<IEpicCase | null> };
    const get = model.Get;
    let calls = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let renames = 0;
    const rename = race.client.epicNameService.Rename.bind(race.client.epicNameService);

    model.Get = async (id) => {
        const result = await get(id);

        if (++calls === 2) await gate;

        return result;
    };
    race.client.epicNameService.Rename = async (input) => {
        renames++;

        return rename(input);
    };

    const first = raceUi.submit(1, "Nico.RLN");
    const second = raceUi.submit(1, "Nico.RLN");

    await first;
    open();
    await second;
    check("Zweimal abgeschickt, das zweite las noch den offenen Fall: einmal umbenannt", renames === 1 && (raceUi.replies.at(-1) ?? "").includes("Schon erledigt") && (raceUi.edits.at(-1) ?? "").includes("Vyrox Main"), JSON.stringify({ renames, replies: raceUi.replies, edits: raceUi.edits }));

    // M5: im Dashboard geändert - der Knopf sagt sofort „Schon erledigt“.
    const dash = World({ prime: { "Vyrox.Nico": null }, accountId: null, linked: false });

    await dash.service.Sync(dash.loaded());
    for (const team of dash.store.values()) for (const player of team.players) if (player.discordId === NICO) player.epicName = "Nico.RLN";

    const dashUi = Clicks(dash);

    await dashUi.press("epic:ask:1");
    check("Name im Dashboard geändert, Knopf gedrückt: Schon erledigt, kein Fenster, Fall erledigt", dashUi.modals.length === 0 && (dashUi.replies.at(-1) ?? "").includes("Schon erledigt") && dash.cases.get(1)?.resolvedAt !== null, JSON.stringify(dashUi));
}

async function main(): Promise<void> {
    console.log("\n🎮  Epic-Name geändert\n");

    await checkSnapshot();
    checkLogic();
    checkViews();
    await checkLost();
    await checkFlow();
    await checkFixes();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
