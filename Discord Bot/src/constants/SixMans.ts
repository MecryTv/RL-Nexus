import { DASHBOARD_PATH } from "./Dashboard";
import { IManRank, IMansSettings, ISixBody, ManMode } from "../interfaces/services/sixmans/ISixMans";

/**
 * 2, 4 & 6 Mans: Grenzen, Vorgaben und Beschriftungen. Siehe docs/SixMans.md.
 *
 * Die Modul-ID heißt weiterhin `rl-6mans` - sie steht so in guild_settings und
 * in module_settings. Was man sieht, heißt „2, 4 & 6 Mans".
 */
export const SIXMANS_MODULE = "rl-6mans";

/**
 * Der Anfang der Custom-IDs:
 *   6m:join:<modus> / 6m:leave      das Panel
 *   6m:win:<runde>:<team>           Ergebnis melden
 *   6m:cancel:<runde>               Runde abbrechen
 */
export const SIXMANS_PREFIX = "6m";

export const SIXMANS_ACCENT = "#00afff";

/** Wie viele mitspielen - die Zahl ist zugleich der Name des Modus. */
export const MODES: ManMode[] = [2, 4, 6];

export const MODE_LABELS: Record<ManMode, string> = {
    2: "2 Mans",
    4: "4 Mans",
    6: "6 Mans",
};

/** Was im Spiel daraus wird. */
export const MODE_HINTS: Record<ManMode, string> = {
    2: "1v1",
    4: "2v2",
    6: "3v3",
};

export function IsMode(value: unknown): value is ManMode {
    return value === 2 || value === 4 || value === 6;
}

/** Wie viele je Team spielen. */
export function TeamSize(mode: ManMode): number {
    return mode / 2;
}

export const MIN_START = 100;
export const MAX_START = 5000;
export const MIN_K = 5;
export const MAX_K = 200;
export const MAX_IDLE = 240;
/** Wie viele Runden die Liste im Dashboard auf einmal zeigt. */
export const PAGE_SIZE = 20;
/** Wie viele Plätze die öffentliche Rangliste zeigt. */
export const BOARD_SIZE = 100;
/** So lange bleiben die Sprachkanäle nach dem Ende stehen. */
export const CHANNEL_GRACE = 2 * 60 * 1000;

export const TEAM_LABELS: Record<1 | 2, string> = { 1: "Blau", 2: "Orange" };

export const TEAM_EMOJI: Record<1 | 2, string> = { 1: "🔵", 2: "🟠" };

export const STATUS_LABELS = { running: "Läuft", done: "Fertig", cancelled: "Abgebrochen" } as const;

/* ----------------------------------------------------------
   Die Ränge
   ---------------------------------------------------------- */
/**
 * Die Stufen der Server-MMR. Eigene Namen, eigene Reihenfolge - mit den Rängen
 * im Spiel hat das nichts zu tun, und genau deshalb heißen sie anders. Wer neu
 * anfängt, steht mit 600 mitten in „Boost-Jäger": nach oben und nach unten ist
 * von Anfang an Luft.
 */
export const MAX_RANKS = 12;
export const MAX_RANK_NAME = 32;
/** Höher geht keine Grenze - darüber wird niemand mehr eingeordnet. */
export const MAX_RANK_MIN = 50_000;

export const DEFAULT_RANKS: IManRank[] = [
    { min: 0, name: "Bodenhaftung", emoji: "🛞", color: "#8a8f98" },
    { min: 450, name: "Anschieber", emoji: "🔧", color: "#b06a3b" },
    { min: 550, name: "Boost-Jäger", emoji: "⚡", color: "#d9a441" },
    { min: 650, name: "Wandfahrer", emoji: "🧱", color: "#3ba55c" },
    { min: 750, name: "Luftikus", emoji: "🪂", color: "#00afff" },
    { min: 850, name: "Doppelsprung", emoji: "🌀", color: "#8a4dff" },
    { min: 950, name: "Flip Reset", emoji: "💫", color: "#ff1e2d" },
    { min: 1100, name: "Umlaufbahn", emoji: "🛰️", color: "#ffd66b" },
];

/**
 * Die Stufe zu einer MMR. Ohne eigene Leiter gilt die Vorgabe; unter der
 * untersten Grenze gilt die unterste Stufe - jede MMR hat eine.
 */
export function RankOf(mmr: number, ranks: IManRank[] = DEFAULT_RANKS): IManRank {
    const list = ranks.length ? ranks : DEFAULT_RANKS;
    let found = list[0];

    for (const rank of list) {
        if (mmr >= rank.min) found = rank;
    }

    return found;
}

/** Was als Nächstes kommt - null bei der obersten Stufe. */
export function NextRank(mmr: number, ranks: IManRank[] = DEFAULT_RANKS): IManRank | null {
    const list = ranks.length ? ranks : DEFAULT_RANKS;

    return list.find((rank) => rank.min > mmr) ?? null;
}

/** „⚡ Boost-Jäger" - so steht eine Stufe in einer Nachricht. */
export function RankName(mmr: number, ranks: IManRank[] = DEFAULT_RANKS): string {
    const rank = RankOf(mmr, ranks);

    return rank.emoji ? `${rank.emoji} ${rank.name}` : rank.name;
}

/* ----------------------------------------------------------
   Platzhalter
   ---------------------------------------------------------- */
/**
 * Die Platzhalter je Nachricht. Das Dashboard führt dieselben Schlüssel
 * (src/dashboard/client/constants/Placeholders.ts); npm run check:sixmans
 * vergleicht beide Listen.
 */
export const PANEL_KEYS = [
    "guild",
    "guild.icon",
    "warteschlange",
    "anzahl",
    "modi",
    "runden",
    "spieler",
    "bester",
    "anzahl.2",
    "anzahl.4",
    "anzahl.6",
    "frei.2",
    "frei.4",
    "frei.6",
    "warteschlange.2",
    "warteschlange.4",
    "warteschlange.6",
] as const;

export const ROUND_KEYS = [
    "guild",
    "guild.icon",
    "runde",
    "modus",
    "modus.spiel",
    "blau",
    "orange",
    "blau.mmr",
    "orange.mmr",
    "blau.rang",
    "orange.rang",
    "lobby",
    "passwort",
    "kanal.blau",
    "kanal.orange",
    "spieler",
    "mmr.schnitt",
] as const;

export const RESULT_KEYS = [...ROUND_KEYS, "sieger", "sieger.team", "verlierer", "veraenderung"] as const;

export const SIX_IMAGES = ["{guild.icon}"] as const;

function card(accent: string, ...blocks: string[]): ISixBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent,
            blocks: blocks.map((body) => (body === "---" ? { type: "separator" as const, line: true } : { type: "text" as const, body })),
        },
    };
}

/** Das Panel, an dem man beitritt. */
export function DefaultPanel(): ISixBody {
    return card(
        SIXMANS_ACCENT,
        "# 🎮 2, 4 & 6 Mans",
        "Stell dich an, und sobald genug da sind, teilt der Bot die Teams nach eurer MMR auf.",
        "---",
        "{warteschlange}",
        "-# {spieler} Spieler gewertet · {runden} Runden gespielt · 👑 {bester}"
    );
}

/** Die Karte, wenn eine Runde steht. */
export function DefaultRound(): ISixBody {
    return card(
        "#3ba55c",
        "## 🎮 {modus} · Runde #{runde}",
        "**Lobby** `{lobby}`  ·  **Passwort** `{passwort}`  ·  {modus.spiel}",
        "---",
        "🔵 **Blau** · Ø {blau.mmr} · {blau.rang}\n{blau}",
        "🟠 **Orange** · Ø {orange.mmr} · {orange.rang}\n{orange}",
        "---",
        "{kanal.blau} {kanal.orange}",
        "-# Wer gewonnen hat, sagt es unten."
    );
}

/** Die Karte, wenn das Ergebnis steht. */
export function DefaultResult(): ISixBody {
    return card(
        SIXMANS_ACCENT,
        "## 🏁 {modus} · Runde #{runde} · {sieger.team} gewinnt",
        "---",
        "🔵 **Blau**\n{blau}",
        "🟠 **Orange**\n{orange}",
        "---",
        "-# {veraenderung} MMR · Ø {mmr.schnitt} im Spiel"
    );
}

/** Die DM an alle, wenn es losgeht. */
export function DefaultDm(): ISixBody {
    return card(
        SIXMANS_ACCENT,
        "## 🎮 Deine Runde steht",
        "**{modus}** auf **{guild}** – Runde **#{runde}**, **Lobby** `{lobby}`, **Passwort** `{passwort}`.",
        "---",
        "🔵 {blau}\n🟠 {orange}"
    );
}

export function DefaultSixSettings(): IMansSettings {
    return {
        channelId: null,
        categoryId: null,
        // Ab Werk laufen alle drei: wer nur einen will, schaltet die anderen aus.
        modes: { 2: true, 4: true, 6: true },
        voice: true,
        dm: true,
        confirm: true,
        start: 600,
        k: 25,
        idleMinutes: 60,
        board: { open: false },
        // Leer heißt: die Vorgabe oben gilt. Sobald jemand etwas einträgt,
        // steht hier die Leiter dieses Servers.
        ranks: [],
        panelMessageId: null,
        panel: DefaultPanel(),
        round: DefaultRound(),
        result: DefaultResult(),
        dmBody: DefaultDm(),
    };
}

/**
 * Name und Passwort für die private Lobby. Kurz, gut vorlesbar und ohne
 * Zeichen, die im Spiel Ärger machen - getippt wird das auf einem Controller.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function LobbyName(roundId: number): string {
    return `m${roundId}${Pick(3)}`;
}

export function LobbyPass(): string {
    return Pick(5);
}

function Pick(length: number): string {
    let out = "";

    for (let index = 0; index < length; index++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];

    return out;
}

/** Die Adresse der öffentlichen Rangliste. Im Dev-Modus mit Praefix. */
export function BoardLink(base: string, guildId: string): string {
    return `${base}${DASHBOARD_PATH}/mans/${guildId}`;
}
