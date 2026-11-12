import { RouletteTeamSize } from "../../interfaces/services/roulette/IRoulette";

/**
 * Die Auslosung von Rocket Roulette (W-0087), ohne Discord. Wild gemischt,
 * Wünsche als Paar im selben Team, wer zuletzt aussetzte zuerst, dieselben
 * Mitspieler möglichst selten. Siehe „Die Auslosung“ im Design.
 */

export interface IDrawWish {
    a: string;
    b: string;
    /** Nur für die nächste Runde. */
    once: boolean;
}

export interface IDrawInput {
    players: string[];
    /** Hosten, der Reihe nach je einer eine Lobby. Werden nicht ausgelost. */
    moderators: string[];
    sitOutLast: string[];
    wishes: IDrawWish[];
    /** Wie oft zwei im selben Team waren, Schlüssel PairKey. */
    history: Record<string, number>;
    teamSize: RouletteTeamSize;
    /** Feste Kanäle: so viele Lobbys gehen höchstens. */
    maxLobbies: number | null;
    random?: () => number;
    /** Wie viele Mischungen bewertet werden (Standard 64). */
    trials?: number;
}

export interface IDrawLobby {
    /** Team 0 ist das vollständige; in einer Lobby mit Einspringer fehlt Team 1 ein Platz. */
    teams: [string[], string[]];
    teamNumbers: [number, number];
    size: RouletteTeamSize;
    host: string;
    hostIsModerator: boolean;
    /** Der Moderator, der eingesprungen ist. */
    filler: string | null;
}

export interface IDrawResult {
    lobbies: IDrawLobby[];
    sitOut: string[];
    /** Ein Platz frei: ein Moderator springt ein, sonst setzt einer aus (WithFiller). */
    needsFiller: { lobbyIndex: number; size: RouletteTeamSize } | null;
    unmetWishes: { a: string; b: string }[];
}

const TRIALS = 64;

export function PairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function Shuffle<T>(items: T[], random: () => number): T[] {
    const out = [...items];

    for (let index = out.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));

        [out[index], out[other]] = [out[other], out[index]];
    }

    return out;
}

function Pick<T>(items: T[], random: () => number): T {
    return items[Math.floor(random() * items.length)];
}

/** Lobbygrößen für m Spieler: volle Lobbys, dann eine kleinere aus dem Rest; ungerader Rest braucht einen Einspringer. */
function Plan(count: number, size: number, max: number | null): { sizes: number[]; fillerIndex: number | null } {
    const full = Math.floor(count / (size * 2));
    const rest = count % (size * 2);
    const sizes = Array.from({ length: full }, () => size);
    let fillerIndex: number | null = null;

    if (rest > 0) {
        sizes.push(Math.ceil(rest / 2));
        if (rest % 2 === 1) fillerIndex = sizes.length - 1;
    }

    if (max !== null && sizes.length > max) return { sizes: sizes.slice(0, Math.max(0, max)).map(() => size), fillerIndex: null };

    return { sizes, fillerIndex };
}

export function Draw(input: IDrawInput): IDrawResult {
    const random = input.random ?? Math.random;
    const players = [...new Set(input.players)].filter((id) => !input.moderators.includes(id));
    const priority = new Set(input.sitOutLast.filter((id) => players.includes(id)));
    const unmetWishes: { a: string; b: string }[] = [];

    // Wunsch-Paare: beide spielen mit, jeder höchstens in einem Paar.
    const paired = new Set<string>();
    const pairs: [string, string][] = [];

    for (const wish of input.wishes) {
        if (!players.includes(wish.a) || !players.includes(wish.b) || wish.a === wish.b) continue;
        if (paired.has(wish.a) || paired.has(wish.b)) {
            unmetWishes.push({ a: wish.a, b: wish.b });
            continue;
        }

        paired.add(wish.a);
        paired.add(wish.b);
        pairs.push([wish.a, wish.b]);
    }

    // Wer spielt: bei zu wenig Kanälen zuerst die Aussetzer der letzten Runde, Paare bleiben zusammen.
    let plan = Plan(players.length, input.teamSize, input.maxLobbies);
    const seats = plan.sizes.reduce((sum, size) => sum + size * 2, 0) - (plan.fillerIndex === null ? 0 : 1);
    const blocks: string[][] = [...pairs.map((pair) => [...pair]), ...players.filter((id) => !paired.has(id)).map((id) => [id])];
    const ordered = [...Shuffle(blocks.filter((block) => block.some((id) => priority.has(id))), random), ...Shuffle(blocks.filter((block) => !block.some((id) => priority.has(id))), random)];
    const playing: string[][] = [];
    const sitOut: string[] = [];
    let taken = 0;

    for (const block of ordered) {
        if (taken + block.length <= seats) {
            playing.push(block);
            taken += block.length;
        } else {
            sitOut.push(...block);
        }
    }

    plan = Plan(taken, input.teamSize, input.maxLobbies);

    // Plätze: je Lobby zwei Teams; in der Einspringer-Lobby fehlt Team 1 ein Platz.
    const capacity = plan.sizes.flatMap((size, index) => [size, index === plan.fillerIndex ? size - 1 : size]);
    const playingPairs = playing.filter((block) => block.length === 2) as [string, string][];
    const singles = playing.filter((block) => block.length === 1).map((block) => block[0]);
    const trials = Math.max(1, input.trials ?? TRIALS);
    let best: { teams: string[][]; score: number; unmet: { a: string; b: string }[] } | null = null;

    for (let trial = 0; trial < trials; trial++) {
        const teams: string[][] = capacity.map(() => []);
        const unmet: { a: string; b: string }[] = [];
        const loose: string[] = [];

        // Paare zuerst in Teams mit zwei freien Plätzen, die Einspringer-Lobby zuletzt.
        for (const pair of Shuffle(playingPairs, random)) {
            const open = Shuffle(
                teams.map((team, index) => index).filter((index) => capacity[index] - teams[index].length >= 2),
                random
            ).sort((a, b) => Number(Math.floor(a / 2) === plan.fillerIndex) - Number(Math.floor(b / 2) === plan.fillerIndex));

            if (open.length) teams[open[0]].push(...pair);
            else {
                unmet.push({ a: pair[0], b: pair[1] });
                loose.push(...pair);
            }
        }

        // Einzelne: wer zuletzt aussetzte, kommt zuerst, das volle Team der Einspringer-Lobby (aus ihm setzt notfalls einer aus) zuletzt.
        const slots = Shuffle(
            teams.flatMap((team, index) => Array.from({ length: capacity[index] - team.length }, () => index)),
            random
        ).sort((a, b) => Number(a === (plan.fillerIndex ?? -1) * 2) - Number(b === (plan.fillerIndex ?? -1) * 2));
        const queue = [...Shuffle([...singles, ...loose].filter((id) => priority.has(id)), random), ...Shuffle([...singles, ...loose].filter((id) => !priority.has(id)), random)];

        queue.forEach((id, index) => teams[slots[index]].push(id));

        let score = 0;

        for (const team of teams) {
            for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) score += input.history[PairKey(team[i], team[j])] ?? 0;
        }

        if (!best || score < best.score) best = { teams, score, unmet };
    }

    const teams = best?.teams ?? [];
    const lobbies: IDrawLobby[] = plan.sizes.map((size, index) => {
        const pair: [string[], string[]] = [teams[index * 2], teams[index * 2 + 1]];
        const moderator = input.moderators[index];

        return {
            teams: pair,
            teamNumbers: [index * 2 + 1, index * 2 + 2],
            size: size as RouletteTeamSize,
            host: moderator ?? Pick([...pair[0], ...pair[1]], random),
            hostIsModerator: moderator !== undefined,
            filler: null,
        };
    });

    return {
        lobbies,
        sitOut,
        needsFiller: plan.fillerIndex === null ? null : { lobbyIndex: plan.fillerIndex, size: plan.sizes[plan.fillerIndex] as RouletteTeamSize },
        unmetWishes: [...unmetWishes, ...(best?.unmet ?? [])],
    };
}

/** Ein Moderator springt ein (spielt und hostet seine Lobby), oder ohne Einspringer setzt einer aus und die Lobby wird kleiner. */
export function WithFiller(result: IDrawResult, moderatorId: string | null, random: () => number = Math.random): IDrawResult {
    if (!result.needsFiller) return result;

    const index = result.needsFiller.lobbyIndex;
    const lobbies = result.lobbies.map((lobby) => ({ ...lobby, teams: [[...lobby.teams[0]], [...lobby.teams[1]]] as [string[], string[]] }));
    const lobby = lobbies[index];
    const sitOut = [...result.sitOut];

    if (moderatorId) {
        for (const other of lobbies) {
            if (other !== lobby && other.host === moderatorId) {
                other.host = Pick([...other.teams[0], ...other.teams[1]], random);
                other.hostIsModerator = false;
            }
        }

        lobby.teams[1].push(moderatorId);
        lobby.filler = moderatorId;
        lobby.host = moderatorId;
        lobby.hostIsModerator = true;

        return { ...result, lobbies, needsFiller: null };
    }

    const out = Pick(lobby.teams[0], random);

    lobby.teams[0] = lobby.teams[0].filter((id) => id !== out);
    sitOut.push(out);

    if (!lobby.teams[0].length && !lobby.teams[1].length) {
        lobbies.splice(index, 1);
    } else {
        lobby.size = (lobby.size - 1) as RouletteTeamSize;
        if (lobby.host === out) lobby.host = Pick([...lobby.teams[0], ...lobby.teams[1]], random);
    }

    return { ...result, lobbies, sitOut, needsFiller: null };
}
