/**
 * Prüft das Welcome System ohne Discord: die Prüfung der Einstellungen, die
 * Platzhalter, die gezeichnete Karte als PNG und die Nachricht, die an Discord
 * ginge.
 *
 *   npm run check:welcome
 *
 * Wer wirklich kommt und geht, sieht nur ein echter Server - und dafür braucht
 * der Bot das Members-Intent.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import path from "path";
import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { IWelcomeCardData, RenderWelcomeCard, WelcomePlaces } from "../builder/WelcomeCard";
import { RegisterFonts } from "../builder/RankCard";
import { CleanPositions, DefaultCard, DefaultWelcomeConfig, FitTitle, LineWidth, MAX_AVATAR, MAX_TITLE_SIZE, MIN_TITLE_SIZE, NormalizeCard, SnapPosition, TitleFont, WELCOME_PLACEHOLDER_KEYS } from "../constants/Welcome";
import { IWelcomeCard, IWelcomeMessage, WelcomeLayout as LayoutName } from "../interfaces/services/welcome/IWelcome";
import { WelcomeError } from "../services/WelcomeService";

const GUILD = "90071992547409931";
const USER = "90071992547409932";
const TEXT = "90071992547409933";
const VOICE = "90071992547409934";
const ROLE = "90071992547409935";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) => ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;
    const role = (id: string, name: string) =>
        ({ id, name, managed: false, comparePositionTo: () => -1 }) as unknown as Role;

    return {
        id: GUILD,
        name: "Dev Server",
        memberCount: 148,
        iconURL: () => "https://cdn.discordapp.com/icons/1/2.png",
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)], [VOICE, channel(VOICE, ChannelType.GuildVoice)]]) },
        roles: { cache: new Map([[ROLE, role(ROLE, "Mitglied")], [GUILD, role(GUILD, "@everyone")]]) },
        members: { me: { permissions: { has: () => true }, roles: { highest: { id: "1" } } } },
    } as unknown as Guild;
}

function FakeMember(guild: Guild): GuildMember {
    return {
        id: USER,
        displayName: "Lara",
        guild,
        user: { id: USER, bot: false, username: "lara", createdTimestamp: Date.now() - 400 * 86_400_000 },
        joinedTimestamp: Date.now(),
        displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/1.png",
        roles: { cache: new Map(), add: async () => undefined },
    } as unknown as GuildMember;
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.welcomeService;
    const base = DefaultWelcomeConfig();

    check("Standard: begrüßen an, verabschieden aus", base.join.on && !base.leave.on);
    check("Standard: die gezeichnete Karte", base.join.kind === "card");

    const clean = service.Clean(
        guild,
        {
            join: { on: true, channelId: TEXT, kind: "embed", embed: { title: "Hallo {user.name}" } },
            leave: { on: false, channelId: VOICE },
            roles: [ROLE, "999", ROLE, GUILD],
            botRoles: [ROLE],
        },
        base
    );

    check("Der Kanal wird übernommen", clean.join.channelId === TEXT);
    check("Ein Sprachkanal fällt weg", clean.leave.channelId === null);
    check("Die Art kommt an", clean.join.kind === "embed");
    check("Das Embed auch", clean.join.embed?.title === "Hallo {user.name}");
    check("Unbekannte Rollen und Doppelte fallen weg", clean.roles.join(",") === ROLE, clean.roles.join(","));
    check("@everyone ist keine Auto-Rolle", !clean.roles.includes(GUILD));
    check("Bot-Rollen stehen getrennt", clean.botRoles.join(",") === ROLE);

    const fails = (name: string, input: object, expect: string): void => {
        try {
            service.Clean(guild, input, base);
            check(name, false, "kein Fehler");
        } catch (error) {
            check(name, error instanceof WelcomeError && error.message.toLowerCase().includes(expect.toLowerCase()), String(error));
        }
    };

    fails("Angeschaltet ohne Kanal geht nicht", { join: { on: true, channelId: null } }, "Kanal");
    fails("Normale Nachricht ohne Text nicht", { join: { on: true, channelId: TEXT, kind: "text", content: "  " } }, "leer");
    fails("Leeres Embed nicht", { join: { on: true, channelId: TEXT, kind: "embed", embed: {} } }, "leer");

    console.log("\n  — Die Karte einstellen —");

    const card = service.CleanCard(
        { accent: "#FF1E2D", dim: 500, titleSize: 999, layout: "hud", font: "orbitron", avatarShape: "bevel", title: "  Hallo  ", avatar: false, icon: false, avatarSize: 9999, ringWidth: -3, titleColor: "#ABCDEF", footerColor: "kaputt", accentOn: false },
        DefaultCard("join"),
        "join"
    );

    check("Die Farbe wird klein geschrieben", card.accent === "#ff1e2d");
    check("Das Abdunkeln ist gedeckelt", card.dim === 90, String(card.dim));
    check("Die Schriftgröße auch", card.titleSize === MAX_TITLE_SIZE, String(card.titleSize));
    check("Zu kleine Schrift wird angehoben", service.CleanCard({ titleSize: 2 }, DefaultCard("join"), "join").titleSize === MIN_TITLE_SIZE);
    check("Das Layout kommt an", card.layout === "hud");
    check("Die Schrift auch", card.font === "orbitron");
    check("Der Avatar ist gedeckelt", card.avatarSize === MAX_AVATAR, String(card.avatarSize));
    check("Ein negativer Ring wird zu keinem", card.ringWidth === 0, String(card.ringWidth));
    check("Textfarben werden klein geschrieben", card.titleColor === "#abcdef");
    check("Eine kaputte Farbe der kleinen Zeile folgt dem Akzent", card.footerColor === null);
    check("Der Akzent lässt sich ausschalten", card.accentOn === false);
    check("Ein erfundenes Layout bleibt beim alten", service.CleanCard({ layout: "riesig" }, DefaultCard("join"), "join").layout === "classic");

    console.log("\n  — Ältere Karten —");

    const old = NormalizeCard({ accent: "#00afff", align: "center", avatarRing: false, title: "Hi" }, "join");

    check("Mittig wird zum Layout Mittig", old.layout === "center");
    check("Ohne Ring wird Ringstärke 0", old.ringWidth === 0);
    check("Neue Felder kommen aus den Vorgaben", old.font === "oxanium" && old.accentOn === true && old.avatarSize > 0);
    check("Die alten Felder verschwinden", !("align" in old) && !("avatarRing" in old));
    check("Die Form des Avatars auch", card.avatarShape === "bevel");
    check("Leerzeichen fallen weg", card.title === "Hallo");
    check("Bausteine lassen sich abschalten", card.avatar === false && card.icon === false);

    console.log("\n  — Der Hintergrund —");

    const background = (value: unknown): string | null => service.CleanCard({ background: value }, DefaultCard("join"), "join").background;

    check("Ein Bild aus der Galerie kommt an", background(`${GUILD}/custom/karte.png`) === `${GUILD}/custom/karte.png`);
    check("Auch eines aus einem Unterordner", background(`${GUILD}/custom/winter/karte.webp`) !== null);
    check("Und eine Vorlage mit Leerzeichen im Namen", background("default/rocketleague/rlranks/Champion 1.png") !== null);
    check("Ein loser Dateiname nicht", background("fremd.png") === null);
    check("Ein Weg nach draußen auch nicht", background(`${GUILD}/../../geheim.png`) === null);
    check("Und nichts, was kein Bild ist", background(`${GUILD}/custom/liste.txt`) === null);
    check("Eine fremde Adresse ebenso wenig", background("https://example.com/bild.png") === null);
    check("Die Karte findet das Bild im Bildordner", (service.Background(`${GUILD}/custom/karte.png`) ?? "").includes(path.join("src", "images", GUILD)));
    check("Ohne Bild gibt es keinen Pfad", service.Background(null) === null);
}

/* ----------------------------------------------------------
   Gleich wie vorher (Plan 25)
   ---------------------------------------------------------- */
const LAYOUTS: readonly LayoutName[] = ["classic", "center", "panel", "hud"];
const RANKS = path.join(process.cwd(), "src", "images", "default", "rocketleague", "rlranks");
const TITLES = { kurz: "Willkommen, Lara!", lang: "Ein wirklich sehr langer Name, der nicht in die Karte passt" } as const;

/** Mit dem Code von vor Plan 25 gezeichnet (scale 1): ohne eigene Anordnung muss genau das herauskommen. */
const GOLDEN: Record<string, string> = {
    "classic:kurz": "b74bdbe818c534e5ce6f97c95b201d2b9a5d1e93cdcf9be5e9b050e19eebf064",
    "classic:lang": "510618751825bbcaff6d0a2d4d8b2b435848cb2f48bc2ea4093ced543e493803",
    "center:kurz": "c0252f2642ae905bd421691adc68e45da2bc35dfa188e562ef6c69dbdd0f4f06",
    "center:lang": "cabc0b5182fac1827725fa6a7b4c7c095d0c55522c9ba8f822f7c865e0428571",
    "panel:kurz": "40b3147038bbdbf2f06de11929d2e53eebe9e84c63d09ef2b128d62317e3926f",
    "panel:lang": "736a8e520c440faa72226d2e6d4e5f01c7b679ed8b6609a3cdba4d0964adcc99",
    "hud:kurz": "b23087630c01e9df3b69e0d056ea2efde4a728a8d8ce9e42a05cca0474ce23b9",
    "hud:lang": "83ecaf930d7f309f0375b8ad72934fef629951279d0f073b056b54e1a87bbf82",
};

/** W-0021: Varianten neben der Standardkarte - Hintergrund, ohne Avatar, Orbitron, lange kleine Zeile. */
const VARIANTS: Record<string, { layout: LayoutName; card?: Partial<IWelcomeCard>; data?: Partial<IWelcomeCardData>; hash: string }> = {
    hintergrund: { layout: "panel", card: { dim: 40 }, data: { backgroundPath: path.join(RANKS, "Super Sonic Legend.png") }, hash: "4afed28a1b2f8f5ed797792f5c9f809b094828812d9e6e0cad3915220c47cff6" },
    "ohne-avatar": { layout: "classic", card: { avatar: false }, hash: "4d1906883df68584b1d53063d992a89b1499480a8916ac0169167eff5de0941a" },
    orbitron: { layout: "center", card: { font: "orbitron" }, hash: "57176b117cac4e0ff1769a9e768b00fd644f7ee64e20d91204a4e9f60db33815" },
    "lange-zeile": { layout: "hud", data: { footer: "Mitglied Nr. 148 · beigetreten über den Einladungslink von Nico · willkommen im Team" }, hash: "55e235763bdddb7cb912d82c604cd85e690d04d80b577e5df35076797cac18da" },
};

/** Eine Karte mit Avatar und Icon aus lokalen Dateien - damit das Ergebnis jedes Mal gleich ist. */
function Fixture(layout: LayoutName, title: string, card: Partial<IWelcomeCard> = {}): IWelcomeCardData {
    return {
        card: { ...DefaultCard("join"), layout, dim: 0, ...card },
        title,
        subtitle: "Schön, dass du da bist.",
        footer: "Mitglied Nr. 148",
        avatarURL: path.join(RANKS, "Champion 1.png"),
        iconURL: path.join(RANKS, "Grand Champion 1.png"),
        backgroundPath: null,
    };
}

function Hash(png: Buffer): string {
    return createHash("sha256").update(png).digest("hex");
}

async function checkGolden(): Promise<void> {
    console.log("\n  — Ohne eigene Anordnung wie vorher —");

    for (const layout of LAYOUTS) {
        for (const [key, title] of Object.entries(TITLES)) {
            const hash = Hash(await RenderWelcomeCard(Fixture(layout, title), 1));

            check(`Ohne eigene Anordnung wie vor Plan 25: ${layout}, ${key}`, hash === GOLDEN[`${layout}:${key}`], hash.slice(0, 16));
        }
    }

    for (const [key, variant] of Object.entries(VARIANTS)) {
        const hash = Hash(await RenderWelcomeCard({ ...Fixture(variant.layout, TITLES.kurz, variant.card), ...variant.data }, 1));

        check(`Variante wie bisher: ${key}`, hash === variant.hash, hash);
    }
}

async function checkLayout(): Promise<void> {
    console.log("\n  — Plätze der Layouts —");

    const classic = await WelcomePlaces(Fixture("classic", TITLES.kurz, { avatarSize: 170 }));

    check("Klassisch: Avatar bei 52/85 mit 170", JSON.stringify([classic.avatar.x, classic.avatar.y, classic.avatar.size]) === "[52,85,170]", JSON.stringify(classic.avatar));
    check("Klassisch: Überschrift links neben dem Avatar", classic.title.x === 262 && classic.title.align === "left", JSON.stringify(classic.title));
    check("Ohne Avatar rückt die Überschrift nach links", (await WelcomePlaces(Fixture("classic", TITLES.kurz, { avatar: false }))).title.x === 52);

    const center = await WelcomePlaces(Fixture("center", TITLES.kurz));
    check("Mittig: Texte mittig auf 500, 840 breit", center.title.x === 500 && center.title.align === "center" && center.title.width === 840, JSON.stringify(center.title));
    check("Panel: Überschrift so breit wie die Fläche", (await WelcomePlaces(Fixture("panel", TITLES.kurz))).title.width === 370);
    check("Icon: Klassisch 918/28/54", JSON.stringify(classic.icon).startsWith('{"x":918,"y":28,"size":54'), JSON.stringify(classic.icon));
    check("Icon: HUD 914/34/52", JSON.stringify((await WelcomePlaces(Fixture("hud", TITLES.kurz))).icon).startsWith('{"x":914,"y":34,"size":52'));

    check("Breite links bis zum Rand", LineWidth(856, "left", 952) === 120);
    check("Breite mittig nach dem Layout", LineWidth(500, "center", 840) === 840);
    check("Breite rechts bis zum Rand", LineWidth(144, "right", 952) === 120);

    console.log("\n  — Zeichnen über Plätze —");

    for (const layout of LAYOUTS) {
        for (const [key, title] of Object.entries(TITLES)) {
            const data = Fixture(layout, title);
            const places = await WelcomePlaces(data);
            const free = await RenderWelcomeCard({ ...data, card: { ...data.card, positions: places } }, 1);

            check(`Mit den Plätzen des Layouts dasselbe Bild: ${layout}, ${key}`, Hash(free) === GOLDEN[`${layout}:${key}`]);
        }
    }

    const data = Fixture("classic", TITLES.kurz);
    const places = await WelcomePlaces(data);
    const plain = await RenderWelcomeCard(data, 1);
    const moved = await RenderWelcomeCard({ ...data, card: { ...data.card, positions: { ...places, avatar: { ...places.avatar, x: places.avatar.x + 300 } } } }, 1);
    const bare = await RenderWelcomeCard(data, 1, { bare: true });
    const onlyAvatar = await RenderWelcomeCard({ ...data, card: { ...data.card, positions: { avatar: { ...places.avatar, x: places.avatar.x + 300 } } } }, 1);

    check("Ein verschobener Avatar ändert das Bild", !moved.equals(plain));
    check("Die nackte Karte hat keine Teile", !bare.equals(plain));
    check("Fehlende Teile kommen vom Layout", onlyAvatar.equals(moved));
}

async function checkPreview(client: BotClient): Promise<void> {
    console.log("\n  — Vorschau für die Bühne —");

    const member = FakeMember(FakeGuild());
    const message: IWelcomeMessage = { ...DefaultWelcomeConfig().join, channelId: TEXT };
    const bare = await client.welcomeService.Preview(member, message, "join", true);
    const full = await client.welcomeService.Preview(member, message, "join", false);

    check("Nackt: ein PNG als data-URL", bare.image.startsWith("data:image/png;base64,"));
    check("Nackt: die fertigen Texte", bare.parts?.title === "Willkommen, Lara!", String(bare.parts?.title));
    check("Nackt: die Plätze des Layouts", bare.layout?.avatar.x === 52 && bare.layout.title.align === "left", JSON.stringify(bare.layout?.avatar));
    check("Voll: ohne Texte und Plätze", full.parts === undefined && full.layout === undefined);
    check("Nackt und voll sind verschieden", bare.image !== full.image);
}

/**
 * Die Bühne im Dashboard klemmt und misst mit CleanPositions und LineWidth aus
 * constants/Welcome.ts, also denselben Regeln wie der Bot. Dort liegt auch das Einrasten.
 */
async function checkEdges(): Promise<void> {
    console.log("\n  — Ränder (Plan 25, Review) —");

    // Ein Name mit 80 Zeichen ganz rechts: erst kleiner, dann gekürzt, nie breiter als die Regel erlaubt.
    await RegisterFonts();

    const ctx = createCanvas(10, 10).getContext("2d");
    const max = LineWidth(856, "left", 952);
    const fitted = FitTitle(ctx, "Willkommen, ".padEnd(80, "Lara"), "oxanium", 48, max);

    ctx.font = TitleFont("oxanium", fitted.size);
    check("Langer Name am Rand bleibt in der Breite", ctx.measureText(fitted.text).width <= max && fitted.text.endsWith("…"), `${fitted.text} (${fitted.size})`);

    // Teiler (0,85 × size darüber) und HUD-Marke (1,3 × size darunter) bleiben ganz auf der Karte.
    const top = CleanPositions({ footer: { x: 300, y: 0, size: 48, align: "left", width: 618 } })?.footer;
    const bottom = CleanPositions({ footer: { x: 300, y: 340, size: 48, align: "left", width: 618 } })?.footer;

    check("Kleine Zeile oben: Platz für den Teiler", top?.y === 44, JSON.stringify(top));
    check("Kleine Zeile unten: Platz für die Marke", bottom?.y === 340 - 63, JSON.stringify(bottom));

    // W-0021: Oxanium reicht mit der Unterlänge bis 1,04 × size - ganz unten bleibt sie auf der Karte.
    const low = CleanPositions({ title: { x: 40, y: 340, size: 96, align: "left", width: 618 } })?.title;

    check("Große Überschrift ganz unten: Platz für die Unterlänge", low?.y === 340 - 101, JSON.stringify(low));
}

function checkStage(): void {
    console.log("\n  — Bühne: Einrasten —");

    const avatar = { x: 413, y: 90, size: 170, align: "left" as const, width: 952 };
    const others = { avatar, icon: { x: 918, y: 28, size: 54, align: "left" as const, width: 952 }, title: { x: 262, y: 98, size: 48, align: "left" as const, width: 618 }, subtitle: { x: 262, y: 160, size: 26, align: "left" as const, width: 618 }, footer: { x: 262, y: 226, size: 21, align: "left" as const, width: 618 } };
    const snapped = SnapPosition("avatar", avatar, others, { width: 170, height: 170 }, { snap: true, grid: false });

    check("Einrasten an der Kartenmitte", snapped.position.x === 415 && snapped.guides.x === 500, JSON.stringify(snapped));
    check("Ohne Einrasten bleibt es", SnapPosition("avatar", avatar, others, { width: 170, height: 170 }, { snap: false, grid: false }).position.x === 413);
    check("Raster rundet auf 10", SnapPosition("avatar", avatar, others, { width: 170, height: 170 }, { snap: false, grid: true }).position.x === 410);
}

/* ----------------------------------------------------------
   Eigene Anordnung (Plan 25)
   ---------------------------------------------------------- */
function checkPositions(client: BotClient): void {
    console.log("\n  — Eigene Anordnung —");

    const service = client.welcomeService;

    check("Ab Werk keine eigene Anordnung", DefaultCard("join").positions === null);
    check("Eine alte Karte hat keine", NormalizeCard({ layout: "classic" }, "join").positions === null);

    const avatar = CleanPositions({ avatar: { x: 1000, y: 500, size: 300, align: "x" } })?.avatar;
    check("Avatar: erst die Größe, dann ganz auf die Karte", avatar?.size === 240 && avatar.x === 760 && avatar.y === 100, JSON.stringify(avatar));

    const title = CleanPositions({ title: { x: 990, y: 10.6, size: 10, align: "left" } })?.title;
    check("Überschrift: gerundet, geklemmt, volle Breite", JSON.stringify(title) === JSON.stringify({ x: 856, y: 11, size: 20, align: "left", width: 952 }), JSON.stringify(title));

    check("Rechtsbündig bleibt Platz", CleanPositions({ subtitle: { x: 5, y: 100, size: 26, align: "right" } })?.subtitle?.x === 144);
    check("Mittig auch", CleanPositions({ subtitle: { x: 10, y: 100, size: 26, align: "center" } })?.subtitle?.x === 84);
    check("Fremde und kaputte Teile fallen weg", CleanPositions({ logo: { x: 1, y: 1, size: 50 }, icon: { x: "a", y: 1, size: 50 } }) === null);
    check("Eine unbekannte Ausrichtung wird links", CleanPositions({ footer: { x: 300, y: 200, size: 21, align: "oben" } })?.footer?.align === "left");

    const moved = service.CleanCard({ positions: { avatar: { x: 40, y: 40, size: 120 } } }, DefaultCard("join"), "join");
    check("Die Anordnung kommt durch die Prüfung", moved.positions?.avatar?.x === 40, JSON.stringify(moved.positions));
    check("Ohne Angabe bleibt die alte", service.CleanCard({}, moved, "join").positions?.avatar?.x === 40);
    check("null heißt: wieder das Layout", service.CleanCard({ positions: null }, moved, "join").positions === null);
}

/* ----------------------------------------------------------
   Platzhalter
   ---------------------------------------------------------- */
function checkValues(client: BotClient): void {
    console.log("\n  — Platzhalter —");

    const guild = FakeGuild();
    const member = FakeMember(guild);
    const values = client.welcomeService.Values(member, "join");

    check("Alle Schlüssel sind da", WELCOME_PLACEHOLDER_KEYS.every((key) => key in values), Object.keys(values).join(","));
    check("Die Erwähnung stimmt", values.user === `<@${USER}>`);
    check("Der Name steht da", values["user.name"] === "Lara");
    check("Der Server auch", values.guild === "Dev Server");
    check("Die Mitgliedszahl ist die des Servers", values["guild.members"] === "148" && values["member.number"] === "148");
    check("Zeiten stehen als Discord-Zeitstempel", values.joined.startsWith("<t:") && values.created.startsWith("<t:"));
}

/* ----------------------------------------------------------
   Karte und Nachricht
   ---------------------------------------------------------- */
async function checkCard(client: BotClient): Promise<void> {
    console.log("\n  — Die gezeichnete Karte —");

    const guild = FakeGuild();
    const member = FakeMember(guild);
    const message: IWelcomeMessage = { ...DefaultWelcomeConfig().join, channelId: TEXT };
    const png = await client.welcomeService.Card(member, message, "join");

    check("Die Karte entsteht", png.length > 5_000, `${png.length} Bytes`);
    check("Es ist wirklich ein PNG", png.subarray(1, 4).toString() === "PNG");

    // Kommt das Bild nicht an, zeichnet die Karte still den Farbverlauf - dann
    // wäre sie Byte für Byte dieselbe wie oben.
    const withImage = await client.welcomeService.Card(member, { ...message, card: { ...message.card, background: "default/rocketleague/rlranks/Champion 1.png" } }, "join");

    check("Ein Bild aus der Galerie landet darauf", withImage.length > 5_000 && !withImage.equals(png), `${withImage.length} Bytes`);

    const bare = await RenderWelcomeCard({
        card: { ...DefaultCard("join"), avatar: false, icon: false, ringWidth: 0, layout: "center", dim: 0 },
        title: "Willkommen!",
        subtitle: "",
        footer: "",
        avatarURL: null,
        iconURL: null,
        backgroundPath: null,
    });

    check("Auch ohne Avatar und Symbol", bare.length > 3_000);

    for (const layout of ["classic", "center", "panel", "hud"] as const) {
        for (const accentOn of [true, false]) {
            const drawn = await client.welcomeService.Card(member, { ...message, card: { ...message.card, layout, accentOn } }, "join");

            check(`Layout ${layout}${accentOn ? "" : " ohne Akzent"} entsteht`, drawn.length > 5_000 && drawn.subarray(1, 4).toString() === "PNG");
        }
    }

    const long = await RenderWelcomeCard({
        card: { ...DefaultCard("join"), titleSize: MAX_TITLE_SIZE },
        title: "Ein wirklich sehr langer Name, der nicht in die Karte passt",
        subtitle: "Und eine ebenso lange zweite Zeile, die auch nicht hineinpasst",
        footer: "Mitglied Nr. 148 auf Dev Server",
        avatarURL: null,
        iconURL: null,
        backgroundPath: null,
    });

    check("Lange Texte sprengen sie nicht", long.length > 3_000);

    console.log("\n  — Was an Discord ginge —");

    const card = await client.welcomeService.Payload(member, message, "join");

    check("Die Karte hängt als Datei dran", (card.files?.length ?? 0) === 1);
    check("Der Text darüber ist gefüllt", card.content === `<@${USER}>`, String(card.content));

    const text = await client.welcomeService.Payload(member, { ...message, kind: "text", content: "Willkommen, {user.name} auf {guild}!" }, "join");

    check("Normale Nachricht: Platzhalter ersetzt", text.content === "Willkommen, Lara auf Dev Server!", String(text.content));
    check("Und keine Datei dabei", !text.files?.length);

    const embed = await client.welcomeService.Payload(
        member,
        { ...message, kind: "embed", content: "", embed: { ...(client.messageService.CleanEmbed({ title: "Hallo {user.name}", description: "Nr. {member.number}" }) ?? { title: null, description: null, color: null, url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] }) } },
        "join"
    );
    const json = JSON.stringify(embed.embeds ?? []);

    check("Embed: der Name steht drin", json.includes("Hallo Lara"), json.slice(0, 120));
    check("Embed: die Nummer auch", json.includes("Nr. 148"));

    const v2 = await client.welcomeService.Payload(member, { ...message, kind: "v2" }, "join");

    check("Components V2 baut einen Container", (v2.components?.length ?? 0) === 1);
}

async function main(): Promise<void> {
    console.log("\n👋 Welcome System\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkClean(client);
    checkPositions(client);
    await checkGolden();
    await checkLayout();
    await checkPreview(client);
    await checkEdges();
    checkStage();
    checkValues(client);
    await checkCard(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
