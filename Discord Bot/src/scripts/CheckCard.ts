/**
 * Prüft die Rang-Karte, ohne Discord und ohne Prime.
 *
 *   npm run check:card
 *
 * Es geht um die Dinge, die eine Karte still kaputt machen: eine fehlende
 * Schrift, ein fehlendes Symbol, ein Bild, dessen Motiv auf einer leeren
 * Leinwand liegt. Nichts davon wirft einen Fehler - die Karte entsteht trotzdem
 * und sieht nur falsch aus. Deshalb wird hier gemessen statt geschaut.
 *
 * Am Ende steht die Karte als card-check.png im Arbeitsverzeichnis, falls
 * jemand doch hinsehen will.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts, RenderRankCard, RewardBarLayout, TierTextSize } from "../builder/RankCard";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    CAREER_ORDER,
    GAP,
    PAD,
    RANK_ICONS,
    RankCardLayout,
    RankIconFile,
    RewardIconFile,
    STAT_ICON_ROOT,
} from "../constants/RankCard";

let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
    if (ok) {
        console.log(`  \x1b[32mok\x1b[0m   ${name}`);
        return;
    }

    failed += 1;
    console.log(`  \x1b[31mFEHLER\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Ein Profil mit allem, was die Karte zeichnen kann - inklusive Sonderfälle. */
const PROFILE: IPrimeProfile = {
    name: "PruefName",
    platform: "Epic Games",
    accountId: "pruefkonto",
    playerId: "Epic|pruefkonto|0",
    linked: [],
    seasonLevel: 5,
    seasonWins: 7,
    ranks: [
        // Noch in der Platzierung: kein Abzeichen, keine Division.
        { key: "1v1", label: "1v1 Duell", mmr: 779, tier: 12, tierName: "Platin III", division: 2, divisionName: "III", matches: 2, streak: 3, placement: true, placementMatches: 2 },
        // Niederlagen-Serie: die Farbe muss kippen.
        { key: "2v2", label: "2v2 Doppel", mmr: 1350, tier: 18, tierName: "Champion III", division: 1, divisionName: "II", matches: 40, streak: -4, placement: false, placementMatches: 10 },
        // Gar keine Serie: dort steht ein Strich, keine Null.
        { key: "3v3", label: "3v3 Standard", mmr: 1180, tier: 16, tierName: "Champion I", division: 3, divisionName: "IV", matches: 95, streak: 0, placement: false, placementMatches: 10 },
    ],
    // W-0129: Heatseeker fehlt absichtlich - so sieht die Kachel aus, wenn Prime
    // den Modus nicht liefert. Hoops steckt in der Platzierung, Snow Day ist nie
    // gespielt (die errechnete MMR steht trotzdem da).
    extras: [
        { key: "rumble", label: "Rumble", mmr: 1012, tier: 14, tierName: "Diamant II", division: 1, divisionName: "II", matches: 64, streak: 5, placement: false, placementMatches: 10 },
        { key: "hoops", label: "Hoops", mmr: 640, tier: 9, tierName: "Gold III", division: 0, divisionName: "I", matches: 4, streak: -2, placement: true, placementMatches: 4 },
        { key: "snowday", label: "Snow Day", mmr: 600, tier: 0, tierName: "Unranked", division: 0, divisionName: null, matches: 0, streak: 0, placement: true, placementMatches: 0 },
        { key: "dropshot", label: "Dropshot", mmr: 1460, tier: 19, tierName: "Grand Champion I", division: 2, divisionName: "III", matches: 212, streak: 0, placement: false, placementMatches: 10 },
    ],
    tournament: { key: "tournament", label: "Turniere", mmr: 1395, tier: 18, tierName: "Champion III", division: 3, divisionName: "IV", matches: 31, streak: 0, placement: false, placementMatches: 10 },
    stats: CAREER_ORDER.map((key, index) => ({ key, label: key, value: (index + 1) * 1234 })),
    club: { id: 1, name: "Development Gang", tag: "DEV", ownerPlayerId: "Epic|pruefkonto|0", members: [], verified: false, createdAt: null, averageMMR: 1271 },
    fetchedAt: new Date().toISOString(),
};

async function main(): Promise<void> {
    console.log("\n— Lage der Blöcke —");

    // W-0132: Die Karte ist wieder 1536 × 1024. Die Lage jedes Blocks steht an
    // einer Stelle; hier wird sie gegen die Maße aus Entwurf A gehalten.
    const layout = RankCardLayout();

    check(`Die Karte ist 1024 hoch (${CARD_HEIGHT})`, CARD_HEIGHT === 1024);
    check(
        "Kopf, Überschriften, Kacheln, Karriere und Stand-Zeile liegen wie im Entwurf",
        layout.header.y === 34 &&
            layout.header.h === 196 &&
            layout.sectionY === 290 &&
            layout.body.y === 316 &&
            layout.body.h === 404 &&
            layout.careerHeadY === 780 &&
            layout.career.y === 806 &&
            layout.career.h === 124 &&
            layout.freshnessY === 994,
        JSON.stringify(layout)
    );
    check("Die Überschrift beginnt unter dem Kopf", layout.sectionY - 36 > layout.header.y + layout.header.h);
    check("Die Karriere endet über der Stand-Zeile", layout.career.y + layout.career.h <= layout.freshnessY - 40);

    console.log("\n— Bilder —");

    const missingRanks = RANK_ICONS.map((_, tier) => RankIconFile(tier)).filter((file) => !existsSync(file));
    check(`Alle ${RANK_ICONS.length} Rang-Abzeichen liegen vor`, missingRanks.length === 0, missingRanks.join(", "));

    const missingRewards = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(RewardIconFile).filter((file) => !existsSync(file));
    check("Jede Reward-Stufe hat ein Abzeichen", missingRewards.length === 0, missingRewards.join(", "));

    const missingStats = CAREER_ORDER.map((key) => path.join(STAT_ICON_ROOT, `${key}.png`)).filter(
        (file) => !existsSync(file)
    );
    check("Alle sechs Karriere-Symbole liegen vor", missingStats.length === 0, missingStats.join(", "));

    console.log("\n— Schriften —");

    // Ohne Registrierung nimmt Skia eine Systemschrift und misst anders. Genau
    // dieser Unterschied ist der Beweis, dass die eigenen Schriften greifen.
    const measure = (spec: string): number => {
        const ctx = createCanvas(600, 100).getContext("2d");
        ctx.font = spec;

        return Math.round(ctx.measureText("DIAMANT III 1420").width);
    };

    const before = measure("800 48px Oxanium");

    await RegisterFonts();

    const after = measure("800 48px Oxanium");

    check("Oxanium wird registriert und greift", before !== after, `${before}px vs. ${after}px`);
    check("Gewichte sind unterscheidbar", measure("800 48px Oxanium") !== measure("700 48px Oxanium"));
    check("Rajdhani greift", measure("600 32px Rajdhani") !== measure("600 32px NichtVorhanden"));
    check("Orbitron greift", measure("700 32px Orbitron") !== measure("700 32px NichtVorhanden"));

    console.log("\n— Die Karte —");

    const started = Date.now();
    const png = await RenderRankCard({ profile: PROFILE, discordName: "PruefName", avatarURL: null });
    const took = Date.now() - started;

    await writeFile("card-check.png", png);

    check("Die Karte entsteht", png.length > 0);
    check(`Sie ist ${CARD_WIDTH}x${CARD_HEIGHT} gross`, await hasSize(png, CARD_WIDTH, CARD_HEIGHT));
    check(`Sie ist nicht leer (${Math.round(png.length / 1024)} KB)`, png.length > 80_000);
    check(`Sie entsteht schnell genug (${took} ms)`, took < 8000, "Discord wartet drei Sekunden - deshalb deferReply");
    check("Sie passt in eine Discord-Nachricht (< 8 MB)", png.length < 8 * 1024 * 1024);

    // W-0129: Seite 2 mit den Extra-Modi - gleich groß, sonst springt die
    // Nachricht beim Umschalten.
    const extra = await RenderRankCard({ profile: PROFILE, discordName: "PruefName", avatarURL: null, page: "extra" });

    await writeFile("card-check-extra.png", extra);

    check(`Seite 2 (Extra-Modi) ist ebenfalls ${CARD_WIDTH}x${CARD_HEIGHT} gross`, await hasSize(extra, CARD_WIDTH, CARD_HEIGHT));
    check("  und sieht anders aus als Seite 1", !extra.equals(png));

    // Ohne Club fehlt der Tag, ohne Discord-Namen die zweite Zeile: beides darf
    // die Karte nicht ins Stolpern bringen.
    const bare = await RenderRankCard({
        profile: { ...PROFILE, club: null, ranks: [], stats: [], seasonLevel: 0, seasonWins: 0 },
        discordName: null,
        avatarURL: null,
    });

    check("Auch ohne Club, Ränge und Karriere entsteht sie", bare.length > 0);

    // Der Fall, den man sonst nie zu sehen bekommt: Prime antwortet nicht und
    // die Karte zeigt einen alten Stand. Sie muss entstehen und sich vom
    // Normalfall unterscheiden - sonst waere die Warnung nicht drauf.
    const alt = new Date(Date.now() - 3 * 3600_000).toISOString();
    const stale = await RenderRankCard({
        profile: { ...PROFILE, fetchedAt: alt, stale: true },
        discordName: "PruefName",
        avatarURL: null,
    });
    const fresh = await RenderRankCard({
        profile: { ...PROFILE, fetchedAt: alt },
        discordName: "PruefName",
        avatarURL: null,
    });

    await writeFile("card-check-stale.png", stale);

    check("Ein alter Stand wird gezeichnet", stale.length > 0);
    check("  und sieht anders aus als ein frischer", !stale.equals(fresh), "sonst fehlt die Warnung");

    console.log("\n— Grenzfälle —");

    // W-0132: Die Karte ist enger geworden. Was dort zuerst überläuft: ein
    // langer Name mit Club-Tag, lange Rang-Namen, große Karriere-Zahlen.
    const long: IPrimeProfile = {
        ...PROFILE,
        name: "SupersonicLegendDerMitDemSehrLangenNamen",
        club: PROFILE.club ? { ...PROFILE.club, tag: "LONGTAG" } : null,
        ranks: [
            { key: "1v1", label: "1v1 Duell", mmr: 912, tier: 12, tierName: "Platin III", division: 1, divisionName: "II", matches: 9, streak: 2, placement: true, placementMatches: 9 },
            { key: "2v2", label: "2v2 Doppel", mmr: 1888, tier: 22, tierName: "Supersonic Legend", division: 0, divisionName: null, matches: 1234, streak: 12, placement: false, placementMatches: 10 },
            { key: "3v3", label: "3v3 Standard", mmr: 1702, tier: 21, tierName: "Grand Champion III", division: 3, divisionName: "IV", matches: 987, streak: -11, placement: false, placementMatches: 10 },
        ],
        extras: [
            { key: "heatseeker", label: "Heatseeker", mmr: 1555, tier: 22, tierName: "Supersonic Legend", division: 0, divisionName: null, matches: 1999, streak: 10, placement: false, placementMatches: 10 },
            { key: "rumble", label: "Rumble", mmr: 1499, tier: 21, tierName: "Grand Champion III", division: 3, divisionName: "IV", matches: 876, streak: -9, placement: false, placementMatches: 10 },
            { key: "hoops", label: "Hoops", mmr: 700, tier: 9, tierName: "Gold III", division: 0, divisionName: "I", matches: 9, streak: 1, placement: true, placementMatches: 9 },
            { key: "snowday", label: "Snow Day", mmr: 1450, tier: 20, tierName: "Grand Champion II", division: 2, divisionName: "III", matches: 400, streak: 0, placement: false, placementMatches: 10 },
            { key: "dropshot", label: "Dropshot", mmr: 1460, tier: 19, tierName: "Grand Champion I", division: 2, divisionName: "III", matches: 212, streak: 3, placement: false, placementMatches: 10 },
        ],
        tournament: { key: "tournament", label: "Turniere", mmr: 1777, tier: 21, tierName: "Grand Champion III", division: 3, divisionName: "IV", matches: 321, streak: 0, placement: false, placementMatches: 10 },
        stats: CAREER_ORDER.map((key) => ({ key, label: key, value: 12_345_678 })),
        seasonLevel: 8,
        seasonWins: 10,
    };
    const edges: [string, Buffer][] = [
        ["card-check-long.png", await RenderRankCard({ profile: long, discordName: "EinSehrLangerDiscordNameMit32Zei", avatarURL: null })],
        [
            "card-check-bare.png",
            await RenderRankCard({
                profile: { ...PROFILE, club: null, tournament: null, ranks: [], extras: [], stats: [], seasonLevel: 0, seasonWins: 0 },
                discordName: null,
                avatarURL: null,
            }),
        ],
        ["card-check-extra-long.png", await RenderRankCard({ profile: long, discordName: "EinSehrLangerDiscordNameMit32Zei", avatarURL: null, page: "extra" })],
    ];

    for (const [file, buffer] of edges) {
        await writeFile(file, buffer);
        check(`${file} entsteht in ${CARD_WIDTH}x${CARD_HEIGHT}`, buffer.length > 0 && (await hasSize(buffer, CARD_WIDTH, CARD_HEIGHT)));
    }

    // Der Rang-Kasten einer Ranked-Kachel: lange Rang-Namen bleiben lesbar groß.
    const mainW = (CARD_WIDTH - PAD * 2 - GAP * 2) / 3;

    for (const text of ["SUPERSONIC LEGEND", "GRAND CHAMPION III", "PLATZIERUNG 9/10"]) {
        const size = TierTextSize(text, mainW);

        check(`„${text}“ passt in den Rang-Kasten mit mindestens 24 px (${size} px)`, size >= 24);
    }

    // Bei voller Stufe steht „100%“ neben dem Balken - auch das muss vor der
    // abgeschrägten Ecke des 350 breiten Season-Kastens enden.
    const bar = RewardBarLayout(350);

    check(`„100%“ endet im Season-Kasten (${Math.round(bar.percentEnd)} von 350)`, bar.percentEnd <= 350 - 18);
    check(`  und der Balken bleibt breit genug (${Math.round(bar.w)} px)`, bar.w >= 120);

    if (failed > 0) {
        console.log(`\n\x1b[31m❌ ${failed} Prüfung(en) fehlgeschlagen.\x1b[0m\n`);
        process.exit(1);
    }

    console.log("\n\x1b[32m✅ Alle Prüfungen bestanden.\x1b[0m  card-check.png liegt bereit.\n");
}

async function hasSize(png: Buffer, width: number, height: number): Promise<boolean> {
    const image = await loadImage(png);

    return image.width === width && image.height === height;
}

void main();
