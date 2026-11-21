/**
 * Prüft Temp Voice ohne Discord: die Vorgaben eines Hubs, die Namensvorlage,
 * das Panel, die Presets - und, sofern eine Datenbank da ist, was passiert,
 * wenn jemand seinen Kanal umstellt.
 *
 *   npm run check:voice
 *
 * Die Sprachkanäle selbst sind erfunden: der Kanal merkt sich nur, was der
 * Bot an ihm ändern wollte. Ob Discord das auch tut, zeigt erst ein echter
 * Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Collection, Guild, GuildBasedChannel, GuildMember, Role, VoiceBasedChannel } from "discord.js";
import BotClient from "../client/BotClient";
import { writeFile } from "node:fs/promises";
import { VoiceDeletePrompt, VoicePanel, VoicePresetList, VoiceState } from "../builder/VoiceView";
import { IVoicePanelImage, RenderVoicePanel, VOICE_PANEL_FILE, VoicePanelAlt } from "../builder/VoicePanelImage";
import { DefaultHubConfig, DefaultVoiceSettings, FormatVoiceName, MAX_LIMIT, MAX_PRESETS, VOICE_ACTIONS, VOICE_MENU_ACTIONS } from "../constants/Voice";
import { IVoiceSettings } from "../interfaces/services/voice/IVoice";
import { VoiceError, VoiceLimits, VOICE_MODULE } from "../services/VoiceService";
import { SetFlags } from "../utils/moduleFlags";
import VoiceSupport from "../runnables/VoiceSupport";
import DashboardApiVoice from "../routes/DashboardApiVoice";

const GUILD = "90071992547409961";
const USER = "90071992547409962";
const OTHER = "90071992547409963";
const HUB = "90071992547409964";
const TEMP = "90071992547409965";
const PANEL_MESSAGE = "90071992547409979";
const CATEGORY = "90071992547409966";
const TEXT = "90071992547409967";
const ROLE = "90071992547409968";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Ein Kanal, der sich nur merkt, was der Bot an ihm ändern wollte. */
interface IFakeChannel {
    channel: VoiceBasedChannel;
    edits: Record<string, unknown>[];
    deleted: boolean;
    invites: number;
    /** W-0151: liefert die Panel-Nachricht; ohne eigenen Wert gibt es keine. */
    fetchMessage: (id: string) => Promise<unknown>;
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [HUB, channel(HUB, ChannelType.GuildVoice)],
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
                [TEXT, channel(TEXT, ChannelType.GuildText)],
            ]),
        },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Stammgast" } as unknown as Role], [GUILD, { id: GUILD, name: "@everyone" } as unknown as Role]]), everyone: { id: GUILD } },
        members: { cache: new Map() },
    } as unknown as Guild;
}

function FakeChannel(guild: Guild): IFakeChannel {
    const state: IFakeChannel = {
        channel: null as unknown as VoiceBasedChannel,
        edits: [],
        deleted: false,
        invites: 0,
        fetchMessage: async () => {
            throw Object.assign(new Error("Unknown Message"), { code: 10008 });
        },
    };

    state.channel = {
        id: TEMP,
        name: "Laras Kanal",
        guild,
        members: new Map(),
        userLimit: 0,
        rtcRegion: null,
        isVoiceBased: () => true,
        edit: async (options: Record<string, unknown>) => {
            state.edits.push(options);
            // Wie Discord: Plätze und Region stehen danach am Kanal.
            if (typeof options.userLimit === "number") Object.assign(state.channel, { userLimit: options.userLimit });
            if ("rtcRegion" in options) Object.assign(state.channel, { rtcRegion: options.rtcRegion ?? null });

            return state.channel;
        },
        messages: { fetch: (id: string) => state.fetchMessage(id) },
        delete: async () => {
            state.deleted = true;

            return state.channel;
        },
        createInvite: async () => {
            state.invites++;

            return { url: "https://discord.gg/test" };
        },
        permissionOverwrites: { set: async () => undefined, edit: async () => undefined },
        send: async () => undefined,
    } as unknown as VoiceBasedChannel;

    return state;
}

function FakeMember(guild: Guild, id: string, channel: VoiceBasedChannel | null, patch: { disconnect?: () => void } = {}): GuildMember {
    return {
        id,
        displayName: id === USER ? "Lara" : "Mo",
        guild,
        user: { id, bot: false, username: id === USER ? "lara" : "mo" },
        roles: { cache: new Map() },
        voice: {
            channel,
            channelId: channel?.id ?? null,
            setChannel: async () => undefined,
            disconnect: async () => patch.disconnect?.(),
        },
        send: async () => undefined,
        displayAvatarURL: () => null,
    } as unknown as GuildMember;
}

/* ----------------------------------------------------------
   Vorgaben und Namen
   ---------------------------------------------------------- */
function checkConfig(client: BotClient): void {
    console.log("\n  — Vorgaben eines Hubs —");

    const guild = FakeGuild();
    const service = client.voiceService;
    const base = DefaultHubConfig();

    check("Standard: alle 13 Optionen", base.actions.length === 13);
    check("Standard: Presets erlaubt", base.presets);

    // W-0151: deutsche Namen, sortiert nach Kanal, Leute, Mehr.
    const names = VOICE_ACTIONS.map((entry) => `${entry.value}=${entry.name}`).join(",");

    check(
        "Optionen heißen deutsch, in dieser Reihenfolge",
        names ===
            "name=Umbenennen,userlimit=Plätze,privacy=Zutritt,stealthmode=Unsichtbar,region=Region,inviteuser=Einladen,trustuser=Freigeben,untrustuser=Freigabe entziehen,kickuser=Rauswerfen,blockuser=Sperren,unblockuser=Entsperren,transferownership=Übergeben,deletechannel=Kanal löschen",
        names
    );
    check("  Beschreibungen beginnen mit dem Bereich", VOICE_ACTIONS.every((entry) => /^(Kanal|Leute|Mehr) · /.test(entry.description)));
    check("  kein „User“ mehr im Namen", VOICE_ACTIONS.every((entry) => !entry.name.includes("User")));
    check("  Umbenennen ✏️, Plätze 👥", VOICE_ACTIONS[0].emoji === "✏️" && VOICE_ACTIONS[1].emoji === "👥");
    check("Menü: 12 Optionen, ohne Löschen", VOICE_MENU_ACTIONS.length === 12 && !VOICE_MENU_ACTIONS.some((entry) => entry.value === "deletechannel"));

    const clean = service.CleanConfig(guild, { name: "  {user} zockt  ", categoryId: CATEGORY, actions: ["name", "quatsch", "region"], presets: false }, base);

    check("Der Name wird sauber übernommen", clean.name === "{user} zockt", clean.name);
    check("Die Kategorie wird geprüft", clean.categoryId === CATEGORY);
    check("Unbekannte Optionen fallen weg", clean.actions.join(",") === "name,region", clean.actions.join(","));
    check("Presets lassen sich abschalten", clean.presets === false);
    check("Ein Textkanal ist keine Kategorie", service.CleanConfig(guild, { categoryId: TEXT }, base).categoryId === null);
    check("Ohne Angabe bleibt alles, wie es war", service.CleanConfig(guild, {}, clean).name === "{user} zockt");

    const settings = service.CleanSettings({ limit: 500, privacy: "quatsch", stealth: true, region: "frankfurt", trusted: ["123", USER, USER], blocked: [OTHER] });

    check("Zu große Zahlen werden gedeckelt", settings.limit === MAX_LIMIT, String(settings.limit));
    check("Unsinn beim Zutritt fällt zurück", settings.privacy === "public");
    check("Stealth kommt an", settings.stealth);
    check("Die Region wird geprüft", settings.region === "frankfurt");
    check("Keine Fantasie-IDs, keine Doppelten", settings.trusted.join(",") === USER, settings.trusted.join(","));
    check("Eine unbekannte Region fällt weg", service.CleanSettings({ region: "mond" }).region === null);

    console.log("\n  — Namen —");

    const values = { user: "Lara", number: 3, game: "Rocket League" };

    check("{user} wird ersetzt", FormatVoiceName("{user}s Kanal", values) === "Laras Kanal");
    check("{nummer} wird ersetzt", FormatVoiceName("Voice #{nummer}", values) === "Voice #3");
    check("{spiel} wird ersetzt", FormatVoiceName("{user} | {spiel}", values) === "Lara | Rocket League");
    check("Ohne Spiel steht Voice da", FormatVoiceName("{spiel}", { ...values, game: null }) === "Voice");
    check("Ein leerer Name wird zum Namen des Users", FormatVoiceName("   ", values) === "Lara");
    check("Zu lange Namen werden gekürzt", FormatVoiceName("x".repeat(200), values).length === 90);
}

/* ----------------------------------------------------------
   Panel und Presets
   ---------------------------------------------------------- */
/** Alle Knöpfe und Menüs in einem Kasten, egal wie tief sie stecken. */
function controls(node: unknown, found: { custom_id?: string; style?: number; type?: number; placeholder?: string; options?: { value: string }[] }[] = []): typeof found {
    if (Array.isArray(node)) node.forEach((entry) => controls(entry, found));
    else if (node && typeof node === "object") {
        const entry = node as Record<string, unknown>;

        if (typeof entry.custom_id === "string") found.push(entry as (typeof found)[number]);
        Object.values(entry).forEach((value) => controls(value, found));
    }

    return found;
}

/** Eine Reihe ohne Knöpfe lehnt Discord ab - sie darf nie entstehen. */
function emptyRow(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(emptyRow);
    if (!node || typeof node !== "object") return false;

    const entry = node as Record<string, unknown>;

    if (entry.type === 1 && Array.isArray(entry.components) && entry.components.length === 0) return true;

    return Object.values(entry).some(emptyRow);
}

async function checkViews(): Promise<void> {
    console.log("\n  — Panel —");

    const config = DefaultHubConfig();
    const image: IVoicePanelImage = { kind: "channel", ownerName: "Lara", avatarURL: null, privacy: "public", stealth: false, limit: 0, region: null };
    const view = await VoicePanel(config, image);
    const json = view.components[0].toJSON();
    const panel = JSON.stringify(json);
    const found = controls(json);
    const menu = found.find((entry) => entry.custom_id === "voice:menu");
    const remove = found.find((entry) => entry.custom_id === "voice:delete");

    check("Das Panel zeigt das Bild als Anhang", panel.includes("attachment://voice-panel.png"));
    check("  und hängt es an", view.files.length === 1 && view.files[0].name === "voice-panel.png", String(view.files[0]?.name));
    check("Das Panel hat ein Auswahlmenü", menu?.placeholder === "⚙️ Kanal einstellen …", String(menu?.placeholder));
    check("  mit 12 Optionen, ohne Löschen", menu?.options?.length === 12 && !menu.options.some((option) => option.value === "deletechannel"), String(menu?.options?.length));
    check("Die Beschreibungen kommen mit", panel.includes("Kanal · Neuer Name für den Kanal"));
    check("Der Preset-Knopf ist da", found.some((entry) => entry.custom_id === "voice:presets"));
    check("Kanal löschen ist ein roter Knopf", remove?.style === 4, JSON.stringify(remove));
    check("Ohne Presets kein Preset-Knopf", !JSON.stringify((await VoicePanel({ ...config, presets: false }, image)).components[0].toJSON()).includes("voice:presets"));

    const trimmed = (await VoicePanel({ ...config, actions: ["name", "userlimit"], presets: false }, { kind: "fixed" })).components[0].toJSON();
    const trimmedControls = controls(trimmed);

    check("Abgeschaltete Optionen fehlen", !JSON.stringify(trimmed).includes("deletechannel") && JSON.stringify(trimmed).includes("userlimit"));
    check("Ohne Löschen und Presets: kein Knopf, keine leere Reihe", !trimmedControls.some((entry) => entry.type === 2) && !emptyRow(trimmed), JSON.stringify(trimmedControls));

    const prompt = JSON.stringify(VoiceDeletePrompt().components[0].toJSON());

    check("Löschen fragt nach: Löschen und Abbrechen", prompt.includes("voice:delete:yes") && prompt.includes("voice:delete:no") && prompt.includes("Kanal wirklich löschen?"));

    const state = JSON.stringify(
        VoiceState(
            { channelId: TEMP, guildId: GUILD, hubId: 1, ownerId: USER, createdAt: Date.now(), support: false, settings: { ...DefaultVoiceSettings(), limit: 4, privacy: "private", trusted: [OTHER] } },
            "🔒 Privat."
        ).components[0].toJSON()
    );

    check("Der Stand nennt den Besitzer", state.includes(`<@${USER}>`));
    check("Der Stand nennt die Plätze", state.includes("4 Plätze"));
    check("Der Stand nennt die Vertrauten", state.includes(`<@${OTHER}>`));

    console.log("\n  — Presets —");

    const presets = [
        { id: 1, userId: USER, name: "Ranked 2v2", config: { ...DefaultVoiceSettings(), limit: 2 }, isDefault: true, createdAt: Date.now() },
        { id: 2, userId: USER, name: "Chill", config: DefaultVoiceSettings(), isDefault: false, createdAt: Date.now() },
    ];
    const list = JSON.stringify(VoicePresetList(presets, MAX_PRESETS, null).components[0].toJSON());

    check("Beide Presets stehen da", list.includes("Ranked 2v2") && list.includes("Chill"));
    check("Anwenden gibt es je Preset", (list.match(/voice:preset:apply:/g) ?? []).length === 2);
    check("Das Standard-Preset ist markiert", list.includes("Standard"));
    check("Speichern geht", list.includes("voice:preset:save"));
    check("Voll ist voll", JSON.stringify(VoicePresetList(Array.from({ length: MAX_PRESETS }, (_, index) => ({ ...presets[0], id: index + 1, name: `P${index}` })), MAX_PRESETS, null).components[0].toJSON()).includes(`Höchstens ${MAX_PRESETS} Presets`));
    check("Ohne Presets ein Hinweis", JSON.stringify(VoicePresetList([], MAX_PRESETS, null).components[0].toJSON()).includes("Noch keins"));
}

/* ----------------------------------------------------------
   Datenbank und die Aktionen des Panels
   ---------------------------------------------------------- */
async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const guild = FakeGuild();
    const hub = await client.voiceHubs.Create({ guildId: GUILD, channelId: HUB, config: DefaultHubConfig(), createdBy: USER });

    check("Der Hub steht in der Tabelle", hub.id > 0 && hub.config.actions.length === 13);
    check("Er wird über den Kanal gefunden", (await client.voiceHubs.ByChannel(HUB))?.id === hub.id);
    check("Er steht beim Server", (await client.voiceHubs.OfGuild(GUILD)).length === 1);

    await client.voiceHubs.SaveConfig(hub.id, { ...hub.config, name: "{user} zockt", presets: false });

    check("Einstellungen kommen so zurück", (await client.voiceHubs.Get(hub.id))?.config.name === "{user} zockt");

    const settings: IVoiceSettings = { ...DefaultVoiceSettings(), name: "Laras Kanal", limit: 5 };

    await client.tempVoices.Create({ channelId: TEMP, guildId: GUILD, hubId: hub.id, ownerId: USER, settings });

    check("Der offene Kanal steht in der Tabelle", (await client.tempVoices.Get(TEMP))?.ownerId === USER);
    check("Er steht beim Server", (await client.tempVoices.OfGuild(GUILD)).length === 1);
    check("Der Start findet ihn", (await client.tempVoices.All()).some((entry) => entry.channelId === TEMP));

    await client.tempVoices.Save(TEMP, { ...settings, privacy: "private" }, OTHER);

    const moved = await client.tempVoices.Get(TEMP);

    check("Besitzerwechsel und Einstellungen bleiben", moved?.ownerId === OTHER && moved.settings.privacy === "private");

    await client.tempVoices.Save(TEMP, settings, USER);

    console.log("\n  — Was das Panel auslöst —");

    const fake = FakeChannel(guild);
    let kicked = false;
    const owner = FakeMember(guild, USER, fake.channel);
    const other = FakeMember(guild, OTHER, fake.channel, { disconnect: () => (kicked = true) });
    const service = client.voiceService;

    guild.members.cache.set(USER, owner);
    guild.members.cache.set(OTHER, other);
    (fake.channel.members as unknown as Map<string, GuildMember>).set(OTHER, other);

    const fails = async (name: string, run: () => Promise<unknown>, expect: string): Promise<void> => {
        try {
            await run();
            check(name, false, "kein Fehler");
        } catch (error) {
            check(name, error instanceof VoiceError && error.message.toLowerCase().includes(expect.toLowerCase()), String(error));
        }
    };

    check("Umbenennen", (await service.Run(owner, "name", { text: "Ranked 2v2" })).includes("Ranked 2v2"));
    check("Der Kanal wurde wirklich geändert", fake.edits.at(-1)?.name === "Ranked 2v2");
    check("Größe setzen", (await service.Run(owner, "userlimit", { text: "4" })).includes("4"));
    check("0 heißt unbegrenzt", (await service.Run(owner, "userlimit", { text: "0" })).includes("unbegrenzt"));
    await fails("Eine Größe muss eine Zahl sein", () => service.Run(owner, "userlimit", { text: "viele" }), "Zahl");
    check("Privat schalten", (await service.Run(owner, "privacy")).includes("Privat"));
    check("Und wieder offen", (await service.Run(owner, "privacy")).includes("Offen"));
    check("Unsichtbar schalten", (await service.Run(owner, "stealthmode")).includes("Unsichtbar"));
    await service.Run(owner, "stealthmode");
    check("Region setzen", (await service.Run(owner, "region", { text: "frankfurt" })).includes("Frankfurt"));
    await fails("Eine erfundene Region nicht", () => service.Run(owner, "region", { text: "mond" }), "Region");

    check("Jemandem vertrauen", (await service.Run(owner, "trustuser", { target: other })).includes(OTHER));
    check("Er steht in der Liste", (await client.tempVoices.Get(TEMP))?.settings.trusted.includes(OTHER) === true);
    check("Blockieren nimmt das Vertrauen weg", (await service.Run(owner, "blockuser", { target: other })).includes(OTHER));

    const blocked = await client.tempVoices.Get(TEMP);

    check("Er ist blockiert und nicht mehr vertraut", blocked?.settings.blocked.includes(OTHER) === true && blocked.settings.trusted.length === 0);
    check("Blockierte fliegen raus", kicked);
    check("Blockierung aufheben", (await service.Run(owner, "unblockuser", { target: other })).includes(OTHER));
    await fails("Sich selbst blockiert niemand", () => service.Run(owner, "blockuser", { target: owner }), "selbst");
    await fails("Ohne Ziel geht es nicht", () => service.Run(owner, "trustuser", {}), "aus");

    check("Einladen verschickt eine DM", (await service.Run(owner, "inviteuser", { target: other })).includes("Einladung"));
    check("Eine Einladung wurde erstellt", fake.invites === 1);
    check("Rauswerfen", (await service.Run(owner, "kickuser", { target: other })).includes("raus"));

    check("Den Kanal übergeben", (await service.Run(owner, "transferownership", { target: other })).includes(OTHER));
    check("Jetzt gehört er dem anderen", (await client.tempVoices.Get(TEMP))?.ownerId === OTHER);
    await fails("Und der Alte darf nichts mehr", () => service.Run(owner, "name", { text: "Meins" }), "gehört");

    console.log("\n  — Panel neu setzen —");

    // W-0151: Die Panel-Nachricht merkt sich der Bot je Kanal und setzt sie bei Änderungen neu.
    const panelEdits: Record<string, unknown>[] = [];
    let panelGone = false;
    const panelMessage = {
        id: PANEL_MESSAGE,
        edit: async (options: Record<string, unknown>) => {
            panelEdits.push(options);

            return panelMessage;
        },
    };
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    fake.fetchMessage = async (id: string) => {
        if (panelGone || id !== PANEL_MESSAGE) throw Object.assign(new Error("Unknown Message"), { code: 10008 });

        return panelMessage;
    };

    await client.tempVoices.SetPanel(TEMP, PANEL_MESSAGE);

    check("Die Panel-Nachricht steht beim Kanal", (await client.tempVoices.Get(TEMP))?.panelMessageId === PANEL_MESSAGE);

    service.refreshDelay = 20;
    service.QueueRefresh(fake.channel);
    service.QueueRefresh(fake.channel);
    service.QueueRefresh(fake.channel);
    await wait(120);

    const files = panelEdits[0]?.files as { name?: string }[] | undefined;

    check("Drei Anstöße kurz hintereinander: einmal neu gesetzt", panelEdits.length === 1, String(panelEdits.length));
    check("  mit neuem Bild, das alte Bild fliegt raus", files?.[0]?.name === "voice-panel.png" && Array.isArray(panelEdits[0]?.attachments), JSON.stringify(Object.keys(panelEdits[0] ?? {})));

    await service.Run(other, "privacy");
    await wait(120);

    check("Zutritt umstellen setzt das Panel neu", panelEdits.length === 2, String(panelEdits.length));

    panelGone = true;

    let threw = false;

    await service.RefreshPanel(fake.channel).catch(() => (threw = true));

    check("Panel-Nachricht gelöscht: kein Fehler, nichts gesetzt", !threw && panelEdits.length === 2, String(panelEdits.length));

    panelGone = false;

    console.log("\n  — Presets —");

    check("Preset speichern", (await service.SavePreset(other, "Ranked 2v2")).includes("Ranked 2v2"));
    check("Das erste ist gleich Standard", (await client.voicePresets.Default(OTHER))?.name === "Ranked 2v2");

    const preset = (await client.voicePresets.Of(OTHER))[0];

    check("Anwenden klappt", (await service.ApplyPreset(other, preset.id)).includes("Ranked 2v2"));

    // Ein Preset, das jemand anderem gehoert - der Besitzer des Kanals darf es trotzdem nicht anwenden.
    const stranger = await client.voicePresets.Save(USER, "Fremd", DefaultVoiceSettings());

    await fails("Fremde Presets gehen niemanden etwas an", () => service.ApplyPreset(other, stranger.id), "gibt es nicht");

    await service.DeletePreset(OTHER, preset.id);

    check("Löschen klappt", (await client.voicePresets.Of(OTHER)).length === 0);

    check("Den Kanal löschen", (await service.Run(other, "deletechannel")).includes("weg"));
    check("Er ist wirklich weg", fake.deleted && (await client.tempVoices.Get(TEMP)) === null);
}

async function cleanup(client: BotClient): Promise<void> {
    const db = client.databaseService;

    await db.Write("DELETE FROM voice_hubs WHERE guild_id = ?", [GUILD]);
    await db.Write("DELETE FROM temp_voices WHERE guild_id = ?", [GUILD]);
    await db.Write("DELETE FROM voice_presets WHERE user_id IN (?, ?)", [USER, OTHER]);

    client.voiceHubs.Forget();
    client.tempVoices.Forget();
    client.voicePresets.Forget();

    check("Aufgeräumt", (await client.voiceHubs.OfGuild(GUILD)).length === 0 && (await client.tempVoices.OfGuild(GUILD)).length === 0);
}

/* ----------------------------------------------------------
   Support-Hub - der Warteraum selbst steht in der Moderation (check:moderation)
   ---------------------------------------------------------- */
function checkSupport(client: BotClient): void {
    console.log("\n  — Support-Hub —");

    const guild = FakeGuild();
    const service = client.voiceService;
    const config = DefaultHubConfig();

    check("Ab Werk ist ein Hub kein Support-Hub", config.support === false);
    check("Der Schalter kommt an", service.CleanConfig(guild, { support: true }, config).support === true);
    check("Ohne Angabe bleibt er, wie er war", service.CleanConfig(guild, {}, { ...config, support: true }).support === true);
    check("Nur ein echter Wahrheitswert zählt", service.CleanConfig(guild, { support: "ja" }, config).support === false);
}

/** W-0137: ein Server-Wert für die Grenzen von voice-hub. */
function Limits(values: Record<string, number>) {
    return { module: "voice-hub", guildId: GUILD, status: null, notice: null, linkMode: null, values, updatedAt: null };
}

/** W-0137: Hubs, Temp-Kanäle und Vertraute sind Grenzen von RL Nexus, je Server änderbar. Ohne Datenbank, die Stubs kommen wieder weg. */
async function checkW137(client: BotClient): Promise<void> {
    console.log("\n  — W-0137: Grenzen —");

    const service = client.voiceService;
    const sent: string[] = [];
    let created = 0;
    const base = FakeGuild();
    const guild = { ...base, channels: { ...base.channels, create: async () => (created++, { id: TEMP, name: "Laras Kanal", send: async () => undefined }) } } as unknown as Guild;
    const member = { ...FakeMember(guild, USER, null), permissions: { has: () => false }, send: async (text: string) => void sent.push(text) } as unknown as GuildMember;
    const hub = { id: 1, guildId: GUILD, channelId: HUB, config: { ...DefaultHubConfig(), presets: false }, createdBy: USER };
    const create = (service as unknown as { Create(hub: unknown, member: GuildMember): Promise<void> }).Create.bind(service);
    const original = { temps: client.tempVoices.OfGuild, tempCreate: client.tempVoices.Create, hubs: client.voiceHubs.OfGuild, settings: service.Settings };
    let hubs = 10;

    check("Standard: 10 Hubs, 50 Temp-Kanäle, 25 Vertraute", JSON.stringify(VoiceLimits(GUILD)) === JSON.stringify({ hubs: 10, temp: 50, trusted: 25 }), JSON.stringify(VoiceLimits(GUILD)));

    client.tempVoices.OfGuild = (async () => Array.from({ length: 50 }, () => ({ hubId: 1 }))) as unknown as typeof client.tempVoices.OfGuild;
    client.tempVoices.Create = (async () => undefined) as unknown as typeof client.tempVoices.Create;
    client.voiceHubs.OfGuild = (async () => Array.from({ length: hubs }, () => ({}))) as unknown as typeof client.voiceHubs.OfGuild;
    service.Settings = (async () => ({ panel: "channel" })) as unknown as typeof service.Settings;

    try {
        await create(hub, member);
        check("Bei 50 Temp-Kanälen wird kein weiterer angelegt", created === 0, String(created));
        check("Die Person bekommt Bescheid", sent.length === 1 && sent[0].includes("50"), sent.join(" | "));
        // Review W-0137: mit dem Satz zur Grenze - und nicht bei jedem Betreten des Hubs eine neue DM.
        check("…mit dem Satz, dass RL Nexus die Grenze festlegt", sent[0]?.includes("RL Nexus") === true, sent[0]);
        await create(hub, member);
        check("…und ein zweites Betreten gleich danach schreibt nicht noch einmal", sent.length === 1, String(sent.length));

        let hit: unknown = null;

        try {
            await service.AddHub(guild, HUB, USER);
        } catch (error) {
            hit = error;
        }

        const limit = hit instanceof VoiceError ? hit.limit : undefined;

        check("Bei 10 Hubs scheitert der 11. (maxHubs)", limit?.key === "maxHubs" && limit.asked === 11 && limit.allowed === 10, JSON.stringify(limit));

        SetFlags([], [], [], [Limits({ maxTempChannels: 60, maxTrusted: 1 })]);
        await create(hub, member);
        check("Server-Wert 60: der 51. Kanal entsteht", created === 1, String(created));
        check("Server-Wert 1 Vertrauter", service.CleanSettings({ trusted: [USER, OTHER] }, DefaultVoiceSettings(), GUILD).trusted.length === 1);
        SetFlags([], [], []);
    } finally {
        Object.assign(client.tempVoices, { OfGuild: original.temps, Create: original.tempCreate });
        Object.assign(client.voiceHubs, { OfGuild: original.hubs });
        Object.assign(service, { Settings: original.settings });
    }
}

/** W-0140: Nach dem Start räumt der erste Lauf leere Temp-Kanäle weg - einmal, und nur auf Servern, die der Bot kennt. */
async function checkSweep(client: BotClient): Promise<void> {
    console.log("\n  — Aufräumen nach dem Start (W-0140) —");

    const EMPTY = "90071992547409981";
    const FULL = "90071992547409982";
    const GONE = "90071992547409983";
    const ELSEWHERE = "90071992547409984";
    const OUTAGE = "90071992547409985";
    const STUCK = "90071992547409986";
    const VANISHED = "90071992547409987";
    const DOWN = "90071992547409990";
    const deleted: string[] = [];
    const removed: string[] = [];
    const pulses: string[] = [];
    const voice = (id: string, humans: number, fail?: Error) =>
        ({
            id,
            isVoiceBased: () => true,
            members: new Collection(Array.from({ length: humans }, (_, index) => [`m${index}`, { user: { bot: false } }] as const)),
            delete: async () => {
                if (fail) throw fail;

                deleted.push(id);
            },
        }) as unknown as GuildBasedChannel;
    const channels = new Map([
        [EMPTY, voice(EMPTY, 0)],
        [FULL, voice(FULL, 1)],
        // Review: fehlende Rechte - die Zeile bleibt, der nächste Start versucht es wieder.
        [STUCK, voice(STUCK, 0, new Error("Missing Permissions"))],
        // Review: Discord kennt den Kanal nicht mehr (10003) - dann ist er weg, die Zeile auch.
        [VANISHED, voice(VANISHED, 0, Object.assign(new Error("Unknown Channel"), { code: 10003 }))],
    ]);
    const guild = { id: GUILD, available: true, channels: { cache: channels } } as unknown as Guild;
    // Review: Ein Server im Ausfall steht im Cache, aber ohne Kanäle.
    const down = { id: DOWN, available: false, channels: { cache: new Map() } } as unknown as Guild;
    const original = { all: client.tempVoices.All, remove: client.tempVoices.Remove, tick: client.supportService.Tick, emit: client.pulseService.Emit };
    const runnable = new VoiceSupport(client);
    let ready = false;

    client.guilds.cache.set(GUILD, guild);
    client.guilds.cache.set(DOWN, down);
    client.isReady = (() => ready) as typeof client.isReady;
    Object.defineProperty(client.databaseService, "Ready", { get: () => true, configurable: true });
    client.tempVoices.All = (async () =>
        [EMPTY, FULL, GONE, STUCK, VANISHED]
            .map((channelId) => ({ channelId, guildId: GUILD }))
            .concat({ channelId: ELSEWHERE, guildId: "90071992547409989" }, { channelId: OUTAGE, guildId: DOWN })) as unknown as typeof client.tempVoices.All;
    client.tempVoices.Remove = (async (channelId: string) => void removed.push(channelId)) as unknown as typeof client.tempVoices.Remove;
    client.supportService.Tick = async () => 0;
    client.pulseService.Emit = ((_guildId: string, _topic: string, data: { channelId?: string }) => void pulses.push(data.channelId ?? "")) as unknown as typeof client.pulseService.Emit;

    try {
        await runnable.Execute();
        check("Solange der Bot nicht bereit ist, räumt nichts auf", deleted.length === 0 && removed.length === 0, `${deleted.length}/${removed.length}`);

        ready = true;
        await runnable.Execute();
        check("Der erste Lauf danach löscht den leeren Kanal", deleted.join() === EMPTY, deleted.join());
        check("…und die Zeilen von leeren, verschwundenen und bei Discord schon gelöschten Kanälen", removed.sort().join() === [EMPTY, GONE, VANISHED].sort().join(), removed.join());
        check("Besetzte Kanäle bleiben", !deleted.includes(FULL) && !removed.includes(FULL));
        check("Scheitert das Löschen, bleibt die Zeile", !removed.includes(STUCK));
        check("Ein Server, den der Bot (noch) nicht kennt, bleibt unberührt", !removed.includes(ELSEWHERE));
        check("Ein gerade ausgefallener Server bleibt unberührt", !removed.includes(OUTAGE));
        check("Das Dashboard erfährt jede Räumung live", pulses.sort().join() === [EMPTY, GONE, VANISHED].sort().join(), pulses.join());

        await runnable.Execute();
        check("Der zweite Lauf räumt nicht noch einmal auf", deleted.length === 1 && removed.length === 3, `${deleted.length}/${removed.length}`);
    } finally {
        Object.assign(client.tempVoices, { All: original.all, Remove: original.remove });
        client.supportService.Tick = original.tick;
        client.pulseService.Emit = original.emit;
        delete (client as unknown as Record<string, unknown>).isReady;
        delete (client.databaseService as unknown as Record<string, unknown>).Ready;
        client.guilds.cache.delete(GUILD);
        client.guilds.cache.delete(DOWN);
    }
}

/** W-0140: Die Route nennt je offenem Kanal den Hub - die Seite gruppiert danach. */
async function checkRouteHub(client: BotClient): Promise<void> {
    console.log("\n  — Route: offene Kanäle mit Hub (W-0140) —");

    const route = new DashboardApiVoice(client) as unknown as { Read(access: unknown): Promise<Record<string, any>> };
    const original = { hubs: client.voiceHubs.OfGuild, temps: client.tempVoices.OfGuild, settings: client.voiceService.Settings };
    const guild = { id: GUILD, name: "Dev Server", channels: { cache: new Collection() }, roles: { cache: new Collection() }, emojis: { cache: new Collection() }, members: { cache: new Collection() } };

    client.voiceHubs.OfGuild = (async () => [{ id: 7, guildId: GUILD, channelId: HUB, config: DefaultHubConfig(), createdBy: USER }]) as unknown as typeof client.voiceHubs.OfGuild;
    client.tempVoices.OfGuild = (async () => [{ channelId: TEMP, guildId: GUILD, hubId: 7, ownerId: USER, settings: DefaultVoiceSettings(), createdAt: Date.now() }]) as unknown as typeof client.tempVoices.OfGuild;
    client.voiceService.Settings = (async () => ({ panel: "voice", panelChannelId: null, panelMessageId: null })) as unknown as typeof client.voiceService.Settings;

    try {
        const read = await route.Read({ guild });

        check("Jeder offene Kanal nennt seinen Hub", read.open?.[0]?.hubId === 7, JSON.stringify(read.open?.[0]));
    } finally {
        Object.assign(client.voiceHubs, { OfGuild: original.hubs });
        Object.assign(client.tempVoices, { OfGuild: original.temps });
        Object.assign(client.voiceService, { Settings: original.settings });
    }
}

/** W-0143: Die Route liefert je offenem Kanal die Leute mit Status, Live-Werte und Einstellungen - auch wenn der Kanal oder Mitglieder fehlen. */
async function checkRouteInfo(client: BotClient): Promise<void> {
    console.log("\n  — Route: Infos je offenem Kanal (W-0143) —");

    const KRAKEN = "90071992547409991";
    const LUMI = "90071992547409992";
    const GONE = "90071992547409993";
    const STRANGER = "90071992547409999";
    const route = new DashboardApiVoice(client) as unknown as { Read(access: unknown): Promise<Record<string, any>> };
    const original = { hubs: client.voiceHubs.OfGuild, temps: client.tempVoices.OfGuild, settings: client.voiceService.Settings };
    type Flags = Partial<Record<"selfMute" | "serverMute" | "selfDeaf" | "serverDeaf" | "streaming" | "selfVideo", boolean>>;
    const member = (id: string, name: string, flags: Flags = {}) => ({
        id,
        displayName: name,
        user: { username: name.toLowerCase() },
        displayAvatarURL: () => `${id}.webp`,
        voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false, streaming: false, selfVideo: false, ...flags },
    });
    const joe = member(USER, "Joe", { streaming: true });
    const kraken = member(KRAKEN, "Kraken", { selfVideo: true, selfDeaf: true });
    const lumi = member(LUMI, "Lumi", { serverMute: true });
    const inside = (list: ReturnType<typeof member>[]) => ({
        id: TEMP,
        name: "Joes Kanal",
        isVoiceBased: () => true,
        members: new Collection(list.map((entry) => [entry.id, entry] as const)),
        userLimit: 5,
        bitrate: 64000,
        rtcRegion: "rotterdam",
        parent: { name: "Temp Voice" },
    });
    const channels = new Collection<string, unknown>([[TEMP, inside([lumi, kraken, joe])]]);
    const members = new Collection<string, unknown>([
        [USER, joe],
        [LUMI, lumi],
        [KRAKEN, kraken],
    ]);
    const guild = { id: GUILD, name: "Dev Server", channels: { cache: channels }, roles: { cache: new Collection() }, emojis: { cache: new Collection() }, members: { cache: members } };
    const settings = { ...DefaultVoiceSettings(), trusted: [LUMI, STRANGER] };

    client.voiceHubs.OfGuild = (async () => []) as unknown as typeof client.voiceHubs.OfGuild;
    client.tempVoices.OfGuild = (async () => [
        { channelId: TEMP, guildId: GUILD, hubId: 7, ownerId: USER, settings, support: false, createdAt: Date.now() },
        { channelId: GONE, guildId: GUILD, hubId: 7, ownerId: USER, settings: DefaultVoiceSettings(), support: false, createdAt: Date.now() },
    ]) as unknown as typeof client.tempVoices.OfGuild;
    client.voiceService.Settings = (async () => ({ panel: "voice", panelChannelId: null, panelMessageId: null })) as unknown as typeof client.voiceService.Settings;

    try {
        const read = await route.Read({ guild });
        const [open, gone] = read.open as Record<string, any>[];
        const people = (open?.people ?? []) as Record<string, any>[];

        check("Leute: Besitzer zuerst, dann nach Name", people.map((entry) => entry.name).join() === "Joe,Kraken,Lumi", people.map((entry) => entry.name).join());
        check("Nur der Besitzer trägt die Krone", people.filter((entry) => entry.owner).length === 1 && people[0]?.owner === true);
        check("Vom Server stumm geschaltet zählt als stumm", people[2]?.mute === true && people[2]?.deaf === false, JSON.stringify(people[2]));
        check("Stream und Kamera kommen an, taub auch", people[0]?.stream === true && people[1]?.video === true && people[1]?.deaf === true);
        check("Name, Nutzername und Avatar je Person", people[0]?.username === "joe" && people[0]?.avatar === `${USER}.webp`);
        check(
            "Live-Werte des Kanals",
            open?.limit === 5 && open?.bitrate === 64 && open?.region === "rotterdam" && open?.category === "Temp Voice" && open?.support === false && open?.stealth === false && open?.ownerId === USER,
            JSON.stringify({ limit: open?.limit, bitrate: open?.bitrate, region: open?.region, category: open?.category })
        );
        check("Vertraute aus dem Cache mit Namen", JSON.stringify(open?.trusted?.[0]) === `{"id":"${LUMI}","name":"Lumi","avatar":"${LUMI}.webp"}`, JSON.stringify(open?.trusted?.[0]));
        check("Vertraute ohne Cache: ID als Name, kein Avatar", JSON.stringify(open?.trusted?.[1]) === `{"id":"${STRANGER}","name":"${STRANGER}","avatar":null}`, JSON.stringify(open?.trusted?.[1]));
        check("Niemand gesperrt: leere Liste", Array.isArray(open?.blocked) && open.blocked.length === 0);
        check("Kanal nicht im Cache: leer statt Fehler", gone?.people?.length === 0 && gone?.bitrate === 0 && gone?.category === null && gone?.limit === 0, JSON.stringify(gone));

        // Review Focus: der Besitzer ist gerade nicht im Kanal.
        channels.set(TEMP, inside([lumi, kraken]));

        const without = (((await route.Read({ guild })).open as Record<string, any>[])[0]?.people ?? []) as Record<string, any>[];

        check("Besitzer nicht drin: keine Krone, nach Name", without.map((entry) => entry.name).join() === "Kraken,Lumi" && without.every((entry) => !entry.owner), without.map((entry) => entry.name).join());
    } finally {
        Object.assign(client.voiceHubs, { OfGuild: original.hubs });
        Object.assign(client.tempVoices, { OfGuild: original.temps });
        Object.assign(client.voiceService, { Settings: original.settings });
    }
}

/** W-0143: Ein Sprachwechsel in einem Temp-Kanal meldet die Voice-Seite - nur wenn jemand zuschaut, fremde Kanäle nie. */
async function checkPulse(client: BotClient): Promise<void> {
    console.log("\n  — Meldung bei Wechseln im Temp-Kanal (W-0143) —");

    const ELSEWHERE = "90071992547409994";
    const sent: { kind: string; data: Record<string, unknown> }[] = [];
    let gets = 0;
    const channel = { id: TEMP, isVoiceBased: () => true, members: new Collection([[USER, { id: USER, user: { bot: false } }] as const]) };
    const guild = { id: GUILD, ownerId: USER, channels: { cache: new Collection<string, unknown>([[TEMP, channel]]) } };
    const member = { id: OTHER, user: { bot: false } };
    const state = (channelId: string | null) => ({ channelId, guild, member }) as unknown as import("discord.js").VoiceState;
    const original = { get: client.tempVoices.Get, hub: client.voiceHubs.ByChannel, of: client.settings.Of };

    Object.defineProperty(client.databaseService, "Ready", { get: () => true, configurable: true });
    client.settings.Of = (async () => ({ modules: [VOICE_MODULE] })) as unknown as typeof client.settings.Of;
    client.voiceHubs.ByChannel = (async () => null) as unknown as typeof client.voiceHubs.ByChannel;
    client.tempVoices.Get = (async (channelId: string) => {
        gets++;

        return channelId === TEMP ? { channelId: TEMP, guildId: GUILD, hubId: 7, ownerId: USER, settings: DefaultVoiceSettings(), support: false, createdAt: Date.now() } : null;
    }) as unknown as typeof client.tempVoices.Get;

    const stop = client.pulseService.Subscribe(GUILD, USER, (kind, data) => void sent.push({ kind, data: data as Record<string, unknown> }), () => undefined);

    try {
        await client.voiceService.Voice(state(TEMP), state(TEMP));
        check("Stumm im Temp-Kanal: eine Meldung voice", sent.length === 1 && sent[0]?.kind === "voice" && sent[0]?.data.channelId === TEMP, JSON.stringify(sent));

        sent.length = 0;
        await client.voiceService.Voice(state(ELSEWHERE), state(ELSEWHERE));
        check("Wechsel in einem fremden Kanal: keine Meldung", sent.length === 0, JSON.stringify(sent));

        sent.length = 0;
        await client.voiceService.Voice(state(TEMP), state(ELSEWHERE));
        check("Von TEMP woanders hin: eine Meldung für TEMP", sent.length === 1 && sent[0]?.data.channelId === TEMP, JSON.stringify(sent));

        sent.length = 0;
        await client.voiceService.Voice(state(null), state(TEMP));
        check("Jemand kommt in TEMP: eine Meldung", sent.length === 1 && sent[0]?.data.channelId === TEMP, JSON.stringify(sent));

        stop?.();
        gets = 0;
        await client.voiceService.Voice(state(TEMP), state(TEMP));
        check("Niemand schaut zu: keine Datenbank-Abfrage", gets === 0, String(gets));
    } finally {
        stop?.();
        Object.assign(client.tempVoices, { Get: original.get });
        Object.assign(client.voiceHubs, { ByChannel: original.hub });
        Object.assign(client.settings, { Of: original.of });
        delete (client.databaseService as unknown as Record<string, unknown>).Ready;
    }
}

/** Review W-0143: Meldungen, die das offene Fenster sonst verpasst, und genug Spielraum für die vielen Neuladungen. */
async function checkReviewPulse(client: BotClient): Promise<void> {
    console.log("\n  — Review W-0143: Meldungen und Rate-Limit —");

    const route = new DashboardApiVoice(client);

    check("Route verträgt 120 Abrufe je Minute (GET und POST teilen sich den Zähler)", (route.rateLimit?.max ?? 0) >= 120, String(route.rateLimit?.max));

    const service = client.voiceService as unknown as {
        Cleanup(guild: unknown, channelId: string, leftId: string | null): Promise<void>;
        Apply(channel: unknown, temp: unknown, settings: unknown): Promise<void>;
        Overwrites: unknown;
    };
    const sent: { kind: string; data: Record<string, unknown> }[] = [];
    const removed: string[] = [];
    const original = { get: client.tempVoices.Get, remove: client.tempVoices.Remove, save: client.tempVoices.Save, overwrites: service.Overwrites };
    const row = { channelId: TEMP, guildId: GUILD, hubId: 7, ownerId: USER, settings: DefaultVoiceSettings(), support: false, createdAt: Date.now() };
    const stop = client.pulseService.Subscribe(GUILD, USER, (kind, data) => void sent.push({ kind, data: data as Record<string, unknown> }), () => undefined);

    client.tempVoices.Get = (async () => row) as unknown as typeof client.tempVoices.Get;
    client.tempVoices.Remove = (async (channelId: string) => void removed.push(channelId)) as unknown as typeof client.tempVoices.Remove;
    client.tempVoices.Save = (async () => undefined) as unknown as typeof client.tempVoices.Save;
    service.Overwrites = () => [];

    try {
        // Ein Mod löscht den Kanal in Discord, bevor die Leute rausfallen: die Zeile geht, das Fenster muss es erfahren.
        await service.Cleanup({ id: GUILD, channels: { cache: new Collection() } }, TEMP, OTHER);
        check("Kanal in Discord gelöscht: Zeile weg und Meldung open:false", removed.join() === TEMP && sent.length === 1 && sent[0]?.data.open === false && sent[0]?.data.channelId === TEMP, JSON.stringify(sent));

        // Änderungen über das Panel (sperren, Limit, umbenennen, vertrauen) ändern keinen Sprachzustand.
        sent.length = 0;
        await service.Apply({ name: "Joes Kanal", guild: { id: GUILD }, edit: async () => undefined }, row, { ...DefaultVoiceSettings(), privacy: "private" });
        check("Panel-Änderung: eine Meldung voice für den Kanal", sent.length === 1 && sent[0]?.kind === "voice" && sent[0]?.data.channelId === TEMP, JSON.stringify(sent));
    } finally {
        stop?.();
        Object.assign(client.tempVoices, { Get: original.get, Remove: original.remove, Save: original.save });
        service.Overwrites = original.overwrites;
    }
}

/* ----------------------------------------------------------
   W-0151: das Bild des Panels
   ---------------------------------------------------------- */
function pngSize(png: Buffer): { width: number; height: number; png: boolean } {
    return { png: png.subarray(1, 4).toString("ascii") === "PNG", width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function checkImage(): Promise<void> {
    console.log("\n  — Bild des Panels —");

    const open: IVoicePanelImage = { kind: "channel", ownerName: "Fischi_", avatarURL: null, privacy: "public", stealth: false, limit: 5, region: null };
    const closed: IVoicePanelImage = {
        kind: "channel",
        ownerName: "ꜱᴛᴀʀʟɪɢʜᴛ🌟Long_Name_Example_32",
        avatarURL: null,
        privacy: "private",
        stealth: true,
        limit: 0,
        region: "rotterdam",
    };
    const fixed: IVoicePanelImage = { kind: "fixed" };

    for (const [label, data, file] of [
        ["öffentlich", open, "voice-panel-check.png"],
        ["privat und unsichtbar, langer Name", closed, "voice-panel-check-privat.png"],
        ["festes Panel", fixed, "voice-panel-check-fest.png"],
    ] as const) {
        const png = await RenderVoicePanel(data);
        const size = pngSize(png);

        check(`Bild ${label}: PNG 1200 × 264`, size.png && size.width === 1200 && size.height === 264, JSON.stringify(size));
        await writeFile(file, png);
    }

    const altOpen = VoicePanelAlt(open);
    const altClosed = VoicePanelAlt(closed);

    check("Alt-Text öffentlich: Zutritt, Plätze, Region", altOpen.includes("Zutritt: Offen") && altOpen.includes("Plätze: 5") && altOpen.includes("Region: Auto"), altOpen);
    check("Alt-Text privat: Privat, unsichtbar, ∞, Rotterdam", ["Privat", "unsichtbar", "Plätze: ∞", "Rotterdam"].every((part) => altClosed.includes(part)), altClosed);
    check("Alt-Text festes Panel", VoicePanelAlt(fixed).includes("Dein Sprachkanal"), VoicePanelAlt(fixed));
    check("Dateiname des Anhangs", VOICE_PANEL_FILE === "voice-panel.png");
}

async function main(): Promise<void> {
    console.log("\n🔊 Temp Voice\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkConfig(client);
    await checkViews();
    await checkImage();
    checkSupport(client);
    await checkW137(client);
    await checkSweep(client);
    await checkRouteHub(client);
    await checkRouteInfo(client);
    await checkPulse(client);
    await checkReviewPulse(client);

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
        } finally {
            console.log("\n  — Aufräumen —");

            await cleanup(client).catch((error) => check("Aufräumen lief durch", false, String(error)));
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
