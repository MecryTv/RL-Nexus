/**
 * Prüft den Designer des Level Systems ohne Discord (Plan 35): Designs prüfen
 * und speichern, Vorlagen, Zeichnen samt Rahmen für die Bühne, den Stil des
 * Ranglisten-Bilds.
 *
 *   npm run check:leveldesign
 *
 * Bot, Aufstieg und Dashboard-Routen prüft check:levels - dort steht die
 * nachgebaute Welt mit Datenbank, Kanälen und DMs.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "node:path";
import http from "node:http";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { BoardDesignC, CARD_TEMPLATES, UP_TEMPLATES } from "../constants/LevelDesign";
import { CleanDesign } from "../services/levels/Design";
import { GALLERY_ROOT } from "../constants/Gallery";
import { CARD_SCALE } from "../constants/Welcome";
import { IDesignData, RenderDesign, ResolveColors } from "../builder/DesignRenderer";
import { RenderBoard } from "../builder/BoardRenderer";
import { IBoardEntry, IBoardPage } from "../interfaces/services/levels/ILevels";
import { Load } from "../builder/WelcomeCard";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { CleanGalleryPath } from "../constants/Gallery";
import { DefaultLevelMessage, DefaultLevelSettings, UpMode } from "../constants/Levels";
import { ICardDesign, IDesignElement, ITextElement } from "../interfaces/services/levels/ILevelDesign";

/** Eine Vorlage, die es im Repo wirklich gibt - mit Leerzeichen im Namen. */
const GALLERY_IMAGE = "default/rocketleague/rlranks/Champion 1.png";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const base = { background: { mode: "color", image: null, dim: 0, color: "#101018", to: "#202030" }, elements: [] as unknown[] };
const text = (i: number) => ({ type: "text", id: `t${i}`, name: `Text ${i}`, hidden: false, x: 10, y: 10, opacity: 1, text: "{user.name}", font: "Oxanium", size: 40, weight: 800, color: "#ffffff", align: "left", maxWidth: 300 });
const avatar = { type: "avatar", id: "a", name: "Avatar", hidden: false, x: 20, y: 20, opacity: 1, size: 120, shape: "circle", ring: 4, ringColor: "#a78bfa" };
const image = (source: string) => ({ type: "image", id: `i${source.length}`, name: "Bild", hidden: false, x: 0, y: 0, opacity: 1, source, w: 100, h: 100, radius: 0 });

/** Liegt der Baustein ganz auf der Karte? */
function inside(element: IDesignElement | undefined, width = 900, height = 300): boolean {
    if (!element || element.type !== "avatar") return false;

    return element.size >= 24 && element.x >= 0 && element.y >= 0 && element.x + element.size <= width && element.y + element.size <= height;
}

/* ----------------------------------------------------------
   Task 1: Datenmodell, Prüfung, Vorlagen
   ---------------------------------------------------------- */
function checkModel(): void {
    console.log("\nDesigns prüfen");

    const templates: [ "card" | "up", () => ICardDesign][] = [
        ...Object.values(CARD_TEMPLATES).map((make) => ["card", make] as ["card", () => ICardDesign]),
        ...Object.values(UP_TEMPLATES).map((make) => ["up", make] as ["up", () => ICardDesign]),
    ];
    const changed = templates.filter(([kind, make]) => !isDeepStrictEqual(CleanDesign(kind, make()), make()));

    check("Vorlagen sind gültig und bleiben beim Prüfen gleich", templates.length === 11 && changed.length === 0, changed.map(([kind, make]) => `${kind}:${make().template}`).join(", "));
    check("Vorlagen haben je Art die richtige Art", Object.values(CARD_TEMPLATES).every((make) => make().kind === "card") && Object.values(UP_TEMPLATES).every((make) => make().kind === "up"));
    check("Höchstens 30 Bausteine", CleanDesign("card", { ...base, elements: Array.from({ length: 100 }, (_, i) => text(i)) })?.elements.length === 30);
    check("Negative Größe und Lage außerhalb werden geklemmt", inside(CleanDesign("card", { ...base, elements: [{ ...avatar, size: -5, x: 5000, y: -300 }] })?.elements[0]));
    check("Text wird auf 200 Zeichen gekürzt", (CleanDesign("card", { ...base, elements: [{ ...text(1), text: "x".repeat(10_000) }] })?.elements[0] as ITextElement | undefined)?.text.length === 200);
    check("Galerie-Prüfung lässt nur Galerie-Pfade durch", CleanGalleryPath(GALLERY_IMAGE) === GALLERY_IMAGE && CleanGalleryPath("https://evil.example/a.png") === null && CleanGalleryPath("../../.env") === null && CleanGalleryPath(42) === null);
    check("Fremde Bildadresse und ../ fliegen raus", CleanDesign("card", { ...base, elements: [image("https://evil.example/a.png"), image("../../.env")] })?.elements.length === 0);
    check("Galeriebild bleibt", CleanDesign("card", { ...base, elements: [image(GALLERY_IMAGE)] })?.elements.length === 1);
    check("Fremder Hintergrund wird null", CleanDesign("card", { ...base, background: { ...base.background, mode: "image", image: "https://evil.example/a.png" } })?.background.image === null);
    check("Quadratische Bausteine passen in die Fläche", (CleanDesign("up", { ...base, elements: [{ ...avatar, size: 300 }] })?.elements[0] as { size: number } | undefined)?.size === 260);
    check("Unbekannte Art fliegt raus", CleanDesign("card", { ...base, elements: [{ type: "script", x: 0, y: 0 }] })?.elements.length === 0);
    check("Doppelte IDs werden neu vergeben", new Set(CleanDesign("card", { ...base, elements: [text(1), text(1)] })?.elements.map((element) => element.id)).size === 2);
    check("Kein Design: null", CleanDesign("card", null) === null && CleanDesign("card", "x") === null);

    // Plan 36: der Hintergrund hat eine Form - außerhalb ist das Bild durchsichtig.
    const shaped = CleanDesign("card", { ...base, background: { ...base.background, shape: "kreis", cut: 500, border: "rot", borderWidth: 99 } })?.background;

    check("Form des Hintergrunds: Unsinn wird Rechteck, Werte geklemmt", shaped?.shape === "rect" && shaped.cut === 60 && shaped.border === null && shaped.borderWidth === 8, JSON.stringify(shaped));
    check("Klassisch: die Fläche ist das Bild (keine Fläche als Baustein)", CARD_TEMPLATES.klassisch().background.shape === "bevel" && !CARD_TEMPLATES.klassisch().elements.some((element) => element.id === "flaeche") && !UP_TEMPLATES.klassisch().elements.some((element) => element.id === "flaeche"));
    check("Aufstieg: Text, wenn eine eigene Nachricht gespeichert ist, sonst Bild", UpMode({ ...DefaultLevelSettings(), message: DefaultLevelMessage() }) === "text" && UpMode(DefaultLevelSettings()) === "image");
    check("Gespeicherte Wahl schlägt die Vorgabe", UpMode({ ...DefaultLevelSettings(), message: DefaultLevelMessage(), upMode: "image" }) === "image");
}

/* ----------------------------------------------------------
   Task 2: Zeichnen
   ---------------------------------------------------------- */
const SAMPLE: IDesignData = {
    values: {
        "user.name": "MecryTv | Joe",
        "user.tag": "mecrytv",
        guild: "RL Nexus Esports",
        level: "12",
        "level.old": "11",
        "level.next": "13",
        xp: "8.606",
        "xp.into": "806",
        "xp.need": "1.300",
        "xp.percent": "62",
        rank: "3",
        "rank.total": "214",
        messages: "1.248",
        voice: "2.310",
        "voice.hours": "38,5 Std.",
        boost: "",
    },
    avatarUrl: path.join(GALLERY_ROOT, GALLERY_IMAGE),
    iconUrl: null,
    share: 0.62,
};

const isPng = (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const size = (buffer: Buffer) => `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;

async function checkRender(): Promise<void> {
    console.log("\nZeichnen");

    const cards = await Promise.all(Object.values(CARD_TEMPLATES).map((make) => RenderDesign(make(), SAMPLE)));
    const ups = await Promise.all(Object.values(UP_TEMPLATES).map((make) => RenderDesign(make(), SAMPLE)));

    check(
        "Jede Vorlage zeichnet ein PNG in der richtigen Größe",
        [...cards, ...ups].every(({ png }) => isPng(png)) && cards.every(({ png }) => size(png) === "1800x600") && ups.every(({ png }) => size(png) === "1800x520"),
        [...cards, ...ups].map(({ png }) => size(png)).join(", ")
    );

    const design = CARD_TEMPLATES.klassisch();

    design.elements[1].hidden = true;

    const { boxes } = await RenderDesign(design, SAMPLE);

    check("Rahmen je sichtbarem Baustein, ausgeblendete fehlen", boxes.length === design.elements.length - 1 && !boxes.some((box) => box.id === design.elements[1].id));
    check("Rahmen liegen auf der Karte", boxes.every((box) => box.x >= 0 && box.y >= 0 && box.x + box.w <= 900 && box.y + box.h <= 300 && box.w > 0 && box.h > 0), JSON.stringify(boxes.find((box) => box.x < 0 || box.x + box.w > 900)));

    const drawn: string[] = [];

    await RenderDesign(CARD_TEMPLATES.klassisch(), SAMPLE, CARD_SCALE, { onText: (line) => drawn.push(line) });
    check("Platzhalter werden eingesetzt", drawn.includes("1.248 Nachrichten · 2.310 Min. im Voice (38,5 Std.)") && drawn.includes("MecryTv | Joe") && drawn.includes("#3"), drawn.join(" | "));

    // Review Focus 1: Das Bild wurde aus der Galerie gelöscht.
    const gone = "default/rocketleague/rlranks/Gibt es nicht.png";
    const missing = await RenderDesign(
        {
            ...CARD_TEMPLATES.leer(),
            background: { mode: "image", image: gone, dim: 40, color: "#101018", to: "#202030", shape: "rect", cut: 0, border: null, borderWidth: 0 },
            elements: [{ type: "image", id: "bild", name: "Bild", hidden: false, x: 10, y: 10, opacity: 1, source: gone, w: 100, h: 100, radius: 8 }],
        },
        { ...SAMPLE, avatarUrl: "https://cdn.discordapp.invalid/avatar.png" }
    ).catch(() => null);

    check("Gelöschtes Galeriebild: zeichnet trotzdem", missing !== null && isPng(missing.png));

    const cut = await RenderDesign({ ...CARD_TEMPLATES.leer(), background: { mode: "color", image: null, dim: 0, color: "#808080", to: "#808080", shape: "bevel", cut: 40, border: null, borderWidth: 0 } }, SAMPLE, 1);
    const pixels = await loadImage(cut.png);
    const probe = createCanvas(900, 300).getContext("2d");

    probe.drawImage(pixels, 0, 0);
    check("Abgeschrägte Ecke ist durchsichtig, die Mitte nicht", probe.getImageData(2, 2, 1, 1).data[3] === 0 && probe.getImageData(450, 150, 1, 1).data[3] === 255);

    const long: string[] = [];
    const tight = await RenderDesign(
        { ...CARD_TEMPLATES.leer(), elements: [{ type: "text", id: "name", name: "Name", hidden: false, x: 20, y: 20, opacity: 1, text: "{user.name}", font: "Oxanium", size: 40, weight: 800, color: "#ffffff", align: "left", maxWidth: 200 }] },
        { ...SAMPLE, values: { ...SAMPLE.values, "user.name": "Ein wirklich sehr langer Anzeigename mit vielen Wörtern" } },
        CARD_SCALE,
        { onText: (line) => long.push(line) }
    );

    check("Langer Name wird kleiner und endet mit …", tight.boxes[0].w <= 200 && long.some((line) => line.endsWith("…")), `${tight.boxes[0].w} ${long.join(" | ")}`);
}

/* ----------------------------------------------------------
   Plan 35, Abschluss-Review: Bilder laden
   ---------------------------------------------------------- */
async function checkLoading(): Promise<void> {
    console.log("\nBilder laden");

    // Ein Galeriebild, das es gleich nicht mehr gibt.
    const folder = path.join(GALLERY_ROOT, "default", "_check35");
    const source = "default/_check35/weg.png";
    const design: ICardDesign = { ...CARD_TEMPLATES.leer(), background: { mode: "image", image: source, dim: 0, color: "#101018", to: "#202030", shape: "rect", cut: 0, border: null, borderWidth: 0 } };

    mkdirSync(folder, { recursive: true });
    copyFileSync(path.join(GALLERY_ROOT, GALLERY_IMAGE), path.join(folder, "weg.png"));

    try {
        const before = await RenderDesign(design, SAMPLE, 1);

        rmSync(path.join(folder, "weg.png"));

        const after = await RenderDesign(design, SAMPLE, 1);

        check("Gelöschtes Galeriebild verschwindet auch aus dem Bild (kein alter Stand im Speicher)", !before.png.equals(after.png));

        // Ein Bild, das beim ersten Mal fehlt, wird beim nächsten Mal wieder versucht.
        const missing = path.join(folder, "spaeter.png");

        check("Fehlt ein Bild, ist es null", (await Load(missing)) === null);
        copyFileSync(path.join(GALLERY_ROOT, GALLERY_IMAGE), missing);
        check("Ein Fehlschlag bleibt nicht im Speicher", (await Load(missing)) !== null);
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }

    // Ein Avatar-Server, der nie antwortet: das Bild kommt ohne, nicht nie.
    const silent = http.createServer(() => undefined);

    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));

    const port = (silent.address() as { port: number }).port;
    const started = Date.now();
    const stuck = await Load(`http://127.0.0.1:${port}/avatar.png`);

    check("Hängender Avatar: nach höchstens 3 s ohne Bild weiter", stuck === null && Date.now() - started < 4_000, `${Date.now() - started} ms`);
    silent.closeAllConnections();
    silent.close();
}

/* ----------------------------------------------------------
   Das Ranglisten-Bild: seit W-0050 fest Vorlage C (BoardDesignC)
   ---------------------------------------------------------- */
function checkBoardModel(): void {
    console.log("\nRangliste: Vorlage C");

    // Review Plan 38, I1: tiefer stehende Podiumsplätze werden unten abgeschnitten - Lesbares darf dort nicht liegen.
    const { podium } = BoardDesignC();
    const visible = Math.min(podium.h, podium.offsets[0] + podium.slotH);
    const lowest = Math.max(...podium.offsets);
    const cut = podium.elements.filter((element) => {
        if (element.type === "shape" || element.type === "image") return false;

        const bottom = element.y + (element.type === "text" ? Math.round(element.size * 1.05) : element.type === "bar" ? element.h : element.size);

        return bottom + lowest > visible;
    });

    check("C: im Podium bleibt an jedem Platz alles sichtbar", cut.length === 0, cut.map((element) => element.id).join(", "));
}

/** Eine Seite der Rangliste mit n Plätzen ab Platz start. */
function boardPage(count: number, page = 1, start = 1, total = count): IBoardPage {
    const trends: IBoardEntry["trend"][] = [3, -1, "new", 0];
    const entries: IBoardEntry[] = Array.from({ length: count }, (_, index) => ({
        rank: start + index,
        userId: `u${start + index}`,
        name: `Spieler ${start + index}`,
        avatar: null,
        level: 20 - index,
        xp: 5_000 - index * 100,
        messages: 300,
        voiceMinutes: 90,
        trend: trends[index % trends.length],
        into: 50,
        need: 100,
    }));

    return { period: "all", page, pages: Math.max(1, Math.ceil(total / 10)), total, entries, range: null, viewer: null, sum: { xp: 0, voiceMinutes: 0 } };
}

async function checkBoardRender(): Promise<void> {
    console.log("\nRangliste: Zeichnen");

    const texts: string[] = [];
    let layout = { podium: 0, rows: 0, mine: 0 };
    const hooks = { onText: (text: string) => void texts.push(text), onLayout: (next: typeof layout) => void (layout = next) };
    const input = (page: IBoardPage, extra: Record<string, unknown> = {}) => ({ page, guildName: "Dev Server", iconUrl: null, viewerId: "u5", ...extra });
    const design = BoardDesignC();
    const { head, podium, row, foot } = design;

    // Platz 5 schaut zu und steht auf der Seite: hervorgehoben, aber keine Zusatzzeile.
    const first = await RenderBoard(design, input({ ...boardPage(10), viewer: boardPage(10).entries[4] }), 1, hooks);
    const height = head.h + podium.h + Math.ceil(7 / row.columns) * (row.h + row.gap) + 10 + foot.h;

    check("Es ist ein PNG mit der richtigen Höhe", first.png.subarray(1, 4).toString() === "PNG" && first.height === height, `${first.height} statt ${height}`);
    check("Betrachter auf der Seite: hervorgehoben, keine Zusatzzeile", layout.mine === 1 && texts.filter((text) => text === "Spieler 5").length === 1, `${JSON.stringify(layout)} ${texts.filter((text) => text === "Spieler 5").length}`);
    check("Trend als Text: +3, −1, NEU, –", ["+3", "−1", "NEU", "–"].every((trend) => texts.includes(trend)), JSON.stringify(texts.filter((text) => text.length < 5)));
    check(
        "Kopf, Podium (Platz 1 in der Mitte), Zeile (erste) und Fuß mit Rahmen",
        first.areas.head?.h === head.h && first.areas.podium?.y === head.h && first.areas.podium.x === (first.width - 3 * podium.w - 2 * podium.gap) / 2 + podium.w + podium.gap && first.areas.row?.y === head.h + podium.h && first.areas.foot?.y === first.height - foot.h && Boolean(first.areas.row.boxes.find((box) => box.id === "punkte")),
        JSON.stringify({ podium: first.areas.podium && { ...first.areas.podium, boxes: undefined }, row: first.areas.row && { ...first.areas.row, boxes: undefined } })
    );

    const two = await RenderBoard(design, input(boardPage(2)), 1, hooks);

    check("Zwei Mitglieder: 2 Podiumsplätze, keine Zeile, Bild entsteht", layout.podium === 2 && layout.rows === 0 && two.png.length > 1_000 && two.areas.row === null, JSON.stringify(layout));

    texts.length = 0;
    await RenderBoard(design, input(boardPage(10), { title: "Aktivste der Woche", period: "26.10.–01.11." }), 1, hooks);
    check("Titel und Zeitraum des Wochenposts", texts.includes("Aktivste der Woche") && texts.includes("26.10.–01.11."), JSON.stringify(texts.slice(0, 3)));

    const lost = await RenderBoard({ ...design, background: { ...design.background, mode: "image", image: "gallery/0/fehlt.png" } }, input(boardPage(10)), 1, hooks);

    check("Gelöschtes Galeriebild im Hintergrund: Bild entsteht trotzdem", lost.png.length > 1_000);

    const resolved = ResolveColors({ type: "text", id: "x", name: "x", hidden: false, x: 0, y: 0, opacity: 1, text: "", font: "Oxanium", size: 10, weight: 700, color: "medal", align: "left", maxWidth: 20 }, { medal: "#facc15", accent: "#8a4dff", trend: "#35e07f" });

    check("Farbe mit Bedeutung wird zur Farbe des Platzes", resolved.type === "text" && resolved.color === "#facc15");
}

/** Review Plan 38: ein Avatar-Server, der nicht antwortet, kostet einmal 3 s - nicht 3 s je Platz. */
async function checkBoardAvatars(): Promise<void> {
    console.log("\nRangliste: hängende Avatare");

    const silent = http.createServer(() => undefined);

    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));

    const port = (silent.address() as { port: number }).port;
    const page = boardPage(5);

    page.entries.forEach((entry, index) => (entry.avatar = `http://127.0.0.1:${port}/avatar-${index}.png`));

    const started = Date.now();
    const drawn = await RenderBoard(BoardDesignC(), { page, guildName: "Dev", iconUrl: null, viewerId: null }, 1);

    check("Fünf hängende Avatare: Bild nach höchstens 6 s", drawn.png.length > 1_000 && Date.now() - started < 6_000, `${Date.now() - started} ms`);
    silent.closeAllConnections();
    silent.close();
}

/**
 * W-0050: Das Discord-Bild ist fest - Entwurf C. Quer, damit Discord es in voller
 * Breite zeigt (höchstens etwa 550 × 350): Podium flach, darunter Platz 4–7 links
 * und 8–10 rechts, die eigene Zeile füllt den freien Platz rechts unten.
 */
async function checkBoardFixed(): Promise<void> {
    console.log("\nRangliste: feste Vorlage C (W-0050)");

    const texts: string[] = [];
    let layout = { podium: 0, rows: 0, mine: 0 };
    const hooks = { onText: (text: string) => void texts.push(text), onLayout: (next: typeof layout) => void (layout = next) };
    const input = (page: IBoardPage, viewerId: string | null) => ({ page, guildName: "Dev Server", iconUrl: null, viewerId });
    const design = BoardDesignC();
    const plain = await RenderBoard(design, input(boardPage(10, 1, 1, 27), null), 1, hooks);
    const row = plain.areas.row!;
    const step = design.row.h + design.row.gap;

    check("C: 3 Podiumsplätze, 7 Zeilen, 10 je Seite", layout.podium === 3 && layout.rows === 7 && design.perPage === 10, JSON.stringify(layout));
    check("C: quer, Discord zeigt es in voller Breite (Verhältnis ab 1,57)", plain.width === 1000 && plain.width / plain.height >= 1.57, `${plain.width} × ${plain.height}`);
    check("C: Platz 4 links oben, Platz 7 links unten", row.x === 40 && row.repeats[2].x === 40 && row.repeats[2].y === row.y + 3 * step, JSON.stringify(row.repeats.slice(0, 3)));
    check("C: Platz 8 rechts oben, Platz 10 rechts darunter", row.repeats[3].x > 500 && row.repeats[3].y === row.y && row.repeats[5].y === row.y + 2 * step, JSON.stringify(row.repeats.slice(3)));
    check("Fester Kanal: keine eigene Zeile", layout.mine === 0);

    const away = { ...boardPage(10, 1, 1, 27), viewer: { ...boardPage(1, 3, 25).entries[0] } };

    texts.length = 0;

    const mine = await RenderBoard(design, input(away, "u25"), 1, hooks);
    const last = mine.areas.row!.repeats.at(-1)!;

    check("/level rangliste: eigene Zeile im freien Platz rechts unten", layout.mine === 1 && texts.includes("Spieler 25") && last.x === row.repeats[3].x && last.y === row.y + 3 * step, JSON.stringify(last));
    check("Eigene Zeile macht das Bild nicht höher", mine.height === plain.height, `${mine.height} statt ${plain.height}`);

    const second = await RenderBoard(design, input({ ...boardPage(10, 2, 11, 27), viewer: away.viewer }, "u25"), 1, hooks);

    check("Seite 2: kein Podium, 10 Zeilen, eigene Zeile darunter, weiter quer", layout.podium === 0 && layout.rows === 10 && layout.mine === 1 && second.width / second.height >= 1.57, `${JSON.stringify(layout)} ${second.height}`);

    // Kein freier Platz: die eigene Zeile hängt links unter der Liste, das Bild wird um eine Zeile höher.
    const secondPlain = await RenderBoard(design, input(boardPage(10, 2, 11, 27), null), 1, hooks);
    const below = second.areas.row!.repeats.at(-1)!;

    check("Seite 2: eigene Zeile links unter Platz 15, Bild eine Zeile höher", below.x === design.row.x && below.y === second.areas.row!.y + 5 * step + design.row.gap && second.height === secondPlain.height + step, `${JSON.stringify(below)} ${second.height} statt ${secondPlain.height + step}`);
}

async function main(): Promise<void> {
    checkModel();
    checkBoardModel();
    await checkBoardFixed();
    await checkBoardRender();
    await checkBoardAvatars();
    await checkRender();
    await checkLoading();

    console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
    process.exit(failures ? 1 : 0);
}

void main();
