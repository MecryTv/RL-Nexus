/**
 * Prüft die Logik des Studios ohne Browser (Plan 36): Rückgängig und
 * Wiederholen, Einrasten, Klemmen, Größe ändern, Tastenkürzel.
 *
 *   npm run check:studio
 */
import { History, IRect, resizeBox, shortcutOwner, snapMove, studioShortcut, typedNumber } from "../dashboard/client/layout/StudioCore";
import { authorOf, canAddBlock, canDuplicate, docCost, duplicatePart, EMBED_MAX, messageLength, messageParts, movePart, offered, removePart, restore, IStudioBody as IBody, IStudioBlock } from "../dashboard/client/layout/MessageStudioCore";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

const SIZE = { width: 900, height: 300 };
const ON = { snap: true, grid: false };
const OFF = { snap: false, grid: false };

function checkHistory(): void {
    console.log("\nRückgängig und Wiederholen");

    const history = new History<{ x: number }>();

    history.remember({ x: 1 });
    check("Rückgängig holt den Stand davor", history.undo({ x: 2 })?.x === 1);
    check("Wiederholen holt den Stand danach", history.redo({ x: 1 })?.x === 2);

    const typing = new History<{ text: string }>(50, 900);

    typing.remember({ text: "" }, "name", 1000);
    typing.remember({ text: "a" }, "name", 1300);
    typing.remember({ text: "ab" }, "name", 1600);

    let steps = 0;
    let state: { text: string } | null = { text: "abc" };

    while (state && typing.canUndo) {
        state = typing.undo(state);
        steps++;
    }

    check("Tippen im selben Feld ist ein Schritt", steps === 1, String(steps));

    const fields = new History<{ a: string; b: string }>(50, 900);

    fields.remember({ a: "", b: "" }, "a", 1000);
    fields.remember({ a: "x", b: "" }, "b", 1200);
    check("Anderes Feld: neuer Schritt", fields.undo({ a: "x", b: "y" })?.b === "" && fields.canUndo);

    const fresh = new History<number>();

    fresh.remember(1);
    fresh.undo(2);
    fresh.remember(1);
    check("Neue Änderung leert Wiederholen", !fresh.canRedo);

    const long = new History<number>(50, 0);

    for (let index = 0; index < 80; index++) long.remember(index);

    let count = 0;

    while (long.canUndo) {
        long.undo(0);
        count++;
    }

    check("Höchstens 50 Schritte", count === 50, String(count));

    const shared = new History<{ list: number[] }>();
    const live = { list: [1] };

    shared.remember(live);
    live.list.push(2);
    check("Gemerkt wird eine Kopie, kein Verweis", shared.undo(live)?.list.length === 1);
}

function checkMove(): void {
    console.log("\nEinrasten und Klemmen");

    const box: IRect = { x: 396, y: 0, w: 100, h: 20 };
    const center = snapMove(box, 1, 0, [], SIZE, ON);

    check("Einrasten an der Mitte unter 6 px", center.guideX === 450 && box.x + center.dx + box.w / 2 === 450, JSON.stringify(center));
    check("Ohne Einrasten keine Hilfslinie", snapMove(box, 1, 0, [], SIZE, OFF).guideX === null);

    const other: IRect = { x: 100, y: 200, w: 50, h: 50 };
    const edge = snapMove({ x: 0, y: 0, w: 40, h: 20 }, 97, 0, [other], SIZE, ON);

    check("Einrasten an der Kante eines anderen", edge.dx === 100 && edge.guideX === 100, JSON.stringify(edge));
    check("Raster rundet auf 10 auf der freien Achse", snapMove({ x: 0, y: 0, w: 40, h: 20 }, 13, 0, [], SIZE, { snap: false, grid: true }).dx === 10);

    const far = snapMove({ x: 800, y: 250, w: 100, h: 40 }, 500, 500, [], SIZE, OFF);

    check("Ziehen über den Rand bleibt auf der Fläche", far.dx === 0 && far.dy === 10, JSON.stringify(far));

    const back = snapMove({ x: 10, y: 10, w: 100, h: 40 }, -500, -500, [], SIZE, OFF);

    check("Auch nach links oben", back.dx === -10 && back.dy === -10);
}

function checkResize(): void {
    console.log("\nGröße ändern");

    const box: IRect = { x: 100, y: 50, w: 100, h: 100 };
    const limits = { min: 24, max: 300 };
    const square = resizeBox(box, "se", 40, 10, "square", limits, SIZE);

    check("Quadrat bleibt quadratisch", square.w === square.h && square.w === 140, JSON.stringify(square));

    const tiny = resizeBox(box, "se", -500, -500, "free", limits, SIZE);

    check("Größe nie unter Minimum, nie negativ", tiny.w === 24 && tiny.h === 24, JSON.stringify(tiny));

    const big = resizeBox(box, "se", 2000, 2000, "free", { min: 8, max: 900 }, SIZE);

    check("Vergrößern über den Rand wird geklemmt", big.x + big.w <= 900 && big.y + big.h <= 300 && big.x === 100 && big.y === 50, JSON.stringify(big));

    const nw = resizeBox(box, "nw", -30, -20, "free", limits, SIZE);

    check("Ecke nw: gegenüberliegende Ecke bleibt", nw.x + nw.w === 200 && nw.y + nw.h === 150 && nw.w === 130 && nw.h === 120, JSON.stringify(nw));

    const nwFar = resizeBox(box, "nw", -500, -500, "free", { min: 8, max: 900 }, SIZE);

    check("Ecke nw über den Rand: bleibt auf der Fläche", nwFar.x === 0 && nwFar.y === 0 && nwFar.x + nwFar.w === 200, JSON.stringify(nwFar));

    const text = resizeBox({ x: 100, y: 50, w: 300, h: 42 }, "se", 200, 20, "font", { min: 10, max: 120 }, SIZE);

    check("Text: nur die Höhe zählt, die Breite bleibt", text.w === 300 && text.h === 62, JSON.stringify(text));
}

function checkShortcuts(): void {
    console.log("\nTastenkürzel");

    const key = (key: string, extra: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; tagName?: string; type?: string; isContentEditable?: boolean }) =>
        studioShortcut({ key, ctrlKey: extra.ctrlKey ?? false, metaKey: extra.metaKey ?? false, shiftKey: extra.shiftKey ?? false, target: { tagName: extra.tagName ?? "DIV", type: extra.type, isContentEditable: extra.isContentEditable ?? false } });

    check("Strg+Z im Textfeld gehört dem Browser", key("z", { ctrlKey: true, tagName: "TEXTAREA" }) === null && key("z", { ctrlKey: true, tagName: "INPUT" }) === null && key("z", { ctrlKey: true, isContentEditable: true }) === null);
    // Review I1: Regler, Farbe und Auswahl haben im Browser kein Rückgängig - dort gilt das des Studios.
    check(
        "Strg+Z auf Regler, Farbe, Auswahl: Studio",
        key("z", { ctrlKey: true, tagName: "INPUT", type: "range" }) === "undo" && key("z", { ctrlKey: true, tagName: "INPUT", type: "color" }) === "undo" && key("y", { ctrlKey: true, tagName: "SELECT" }) === "redo"
    );
    check("Strg+Z in Text- und Zahlenfeldern: Browser", key("z", { ctrlKey: true, tagName: "INPUT", type: "text" }) === null && key("z", { ctrlKey: true, tagName: "INPUT", type: "number" }) === null);
    // Review I1: fällt der Fokus nach einem Umbau auf die Seite, gehört das Kürzel dem sichtbaren Studio.
    check("Fokus im Studio: dieses", shortcutOwner([{ inside: false, visible: true }, { inside: true, visible: true }], false) === 1);
    check("Fokus auf der Seite: das sichtbare Studio", shortcutOwner([{ inside: false, visible: false }, { inside: false, visible: true }], true) === 1);
    check("Fokus anderswo, etwa im Suchfeld der Leiste: keins", shortcutOwner([{ inside: false, visible: true }], false) === -1);
    // Plan 39: mehrere Builder auf einer Seite - der zuletzt benutzte bekommt das Kürzel, nicht der erste.
    check("Fokus auf der Seite, mehrere sichtbar: der zuletzt benutzte", shortcutOwner([{ inside: false, visible: true, recent: 1 }, { inside: false, visible: true, recent: 5 }, { inside: false, visible: false, recent: 9 }], true) === 1);
    check("Strg+Z sonst: Studio", key("z", { ctrlKey: true }) === "undo" && key("Z", { metaKey: true }) === "undo");
    check("Strg+Y und Strg+Umschalt+Z: Wiederholen", key("y", { ctrlKey: true }) === "redo" && key("z", { ctrlKey: true, shiftKey: true }) === "redo");
    check("Ohne Strg nichts", key("z", {}) === null);
}

/** Review Plan 38, I3: beim Tippen von „100“ (mindestens 30) gilt die „1“ noch nicht. */
function checkTyping(): void {
    console.log("\nZahlen tippen");

    check("Beim Tippen: unter dem Minimum noch nichts übernehmen", typedNumber("1", 30, 200, false) === null && typedNumber("10", 30, 200, false) === null);
    check("Beim Tippen: gültige Zahl sofort, über dem Maximum gekappt", typedNumber("100", 30, 200, false) === 100 && typedNumber("999", 30, 200, false) === 200);
    check("Beim Verlassen des Felds: geklemmt", typedNumber("1", 30, 200, true) === 30 && typedNumber("74.6", 30, 200, true) === 75);
    check("Leer oder Unsinn: nichts", typedNumber("", 30, 200, true) === null && typedNumber("abc", 30, 200, false) === null);
}

/** Plan 39: die Teile einer Nachricht im Nachrichten-Studio. */
function checkMessageParts(): void {
    console.log("\nNachrichten: Teile");

    const card = (): IBody => ({
        kind: "v2",
        content: "",
        embed: null,
        doc: { accent: "#8a4dff", blocks: [{ type: "text", body: "## Willkommen, {user}!" }, { type: "image", images: ["g/1/a.png"] }, { type: "separator", line: true }, { type: "section", body: "Lies die #regeln", thumbnail: "g/1/b.png" }] },
    });
    const embed = (): IBody => ({
        kind: "embed",
        content: "Hallo",
        embed: { title: "Turnier", description: "Samstag", color: "#38bdf8", url: null, image: null, thumbnail: "g/1/t.png", author: { name: "RL Nexus", icon: null }, footer: null, timestamp: true, fields: [{ name: "Start", value: "18:00", inline: true }, { name: "Preis", value: "50 €", inline: true }] },
        doc: { blocks: [] },
    });

    check("Karte: je Baustein ein Teil", messageParts(card()).map((part) => part.key).join() === "block:0,block:1,block:2,block:3" && messageParts(card())[0].detail.startsWith("## Willkommen"));
    check("Embed: nur vorhandene Teile, in Discord-Reihenfolge", messageParts(embed()).map((part) => part.key).join() === "content,author,title,description,field:0,field:1,thumbnail", messageParts(embed()).map((part) => part.key).join());
    check("Normale Nachricht: ein Teil", messageParts({ kind: "text", content: "x", embed: null, doc: { blocks: [] } }).map((part) => part.key).join() === "content");
    check("Leere Karte und eigene Art: keine Teile", messageParts({ kind: "v2", content: "", embed: null, doc: { blocks: [] } }).length === 0 && messageParts({ kind: "card", content: "", embed: null, doc: { blocks: [] } }).length === 0);

    const moved = card();

    check("Verschieben: nach unten, neue Stelle", movePart(moved, "block:0", 1) === "block:1" && moved.doc.blocks[1].type === "text");
    check("Verschieben am Rand: nichts", movePart(moved, "block:3", 1) === null && movePart(moved, "block:0", -1) === null);

    const fields = embed();

    check("Feld duplizieren: Kopie dahinter", duplicatePart(fields, "field:0") === "field:1" && fields.embed!.fields.length === 3 && fields.embed!.fields[1].name === "Start");
    fields.embed!.fields.push(...Array.from({ length: 7 }, () => ({ name: "x", value: "y", inline: false })));
    check("Höchstens zehn Felder", fields.embed!.fields.length === 10 && duplicatePart(fields, "field:0") === null);

    const removed = card();

    removePart(removed, "block:3");
    removePart(removed, "block:2");
    removePart(removed, "block:1");
    removePart(removed, "block:0");
    check("Letzten Baustein löschen: leere Karte", removed.doc.blocks.length === 0);

    const parts = embed();

    removePart(parts, "title");
    removePart(parts, "content");
    check("Teil des Embeds löschen: Titel weg, Text darüber leer", parts.embed!.title === null && parts.content === "");

    check("Länge: Text aller Bausteine", messageLength(card()) === "## Willkommen, {user}!".length + "Lies die #regeln".length);
    check("Länge: Text, Autor, Titel, Beschreibung, Felder", messageLength(embed()) === "Hallo".length + "RL Nexus".length + "Turnier".length + "Samstag".length + "Start18:00Preis50 €".length);

    const target = card();
    const doc = target.doc;

    restore(target, embed());
    check("Wiederherstellen ändert das Objekt der Seite an Ort und Stelle", target.kind === "embed" && target.embed?.title === "Turnier" && target.doc === doc);

    const presets = [{ body: { doc: { blocks: [] } } }, { body: { kind: "text" } }, { body: { kind: "v2" } }];

    check("Vorlagen einer Art, die die Seite nicht anbietet, fallen weg", offered(presets, ["v2"]).length === 2 && !offered(presets, ["v2"]).some((entry) => entry.body.kind === "text"));

    // Review Plan 39 (Final 3, 4, 6)
    check("Autor ohne Namen ist kein Autor", authorOf("", "https://x/y.png") === null && authorOf("RL Nexus", null)?.name === "RL Nexus");
    check("Beschreibung höchstens 4.000 Zeichen wie im Bot", EMBED_MAX.description === 4000);

    const texts = (count: number): { blocks: IStudioBlock[] } => ({ blocks: Array.from({ length: count }, () => ({ type: "text" as const, body: "x" })) });
    const sections = { blocks: Array.from({ length: 12 }, () => ({ type: "section" as const, body: "x", thumbnail: "" })) };

    check("Text mit Bild kostet drei", docCost(sections) === 36);
    check("Baustein passt, solange Platz ist", canAddBlock(texts(3), "section"));
    check("Höchstens 25 Bausteine", !canAddBlock(texts(25), "separator") && canAddBlock(texts(24), "separator"));
    const full = { blocks: [...sections.blocks, ...texts(2).blocks] };

    check("Nicht über 39 Komponenten", docCost(full) === 38 && !canAddBlock(full, "section") && canAddBlock(full, "text"));
    check("Duplizieren nur, wenn der Baustein noch passt", !canDuplicate({ kind: "v2", content: "", embed: null, doc: full }, "block:0") && canDuplicate({ kind: "v2", content: "", embed: null, doc: full }, "block:13"));
}

checkHistory();
checkTyping();
checkMove();
checkResize();
checkShortcuts();
checkMessageParts();

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
process.exit(failures ? 1 : 0);
