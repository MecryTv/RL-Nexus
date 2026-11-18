/**
 * W-0138: Beispielprotokoll für die Entwicklung. Schreibt nachgebaute Zeilen
 * der letzten 14 Tage bis jetzt nach ACCESS_LOG_DIR/access.log (lokal
 * ./data/access, ignoriert). Erfundene IPs, gängige User-Agents, echte Pfade;
 * keine echten Zeilen vom Server. Dazu Bots, Dateien, Scanner und Fehler, die
 * nicht als Aufruf zählen dürfen.
 *
 *   npm run activity:sample
 *
 * Gibt es die Datei schon, bleibt sie, wie sie ist: der Admin hat sie dann
 * schon gezählt, eine neue zählte doppelt.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.ts";

const dir = loadConfig().accessLogDir;
const file = path.join(dir, "access.log");

if (existsSync(file)) {
    console.log(`${file} gibt es schon, nichts geschrieben.`);
    process.exit(0);
}

// Feste Folge, damit jeder Lauf dieselben Zahlen ergibt (mulberry32).
let seed = 0x5eed1234;
const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(entries: readonly (readonly [T, number])[]): T => {
    let left = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);

    for (const [value, weight] of entries) {
        left -= weight;
        if (left <= 0) return value;
    }

    return entries[0]![0];
};

const AGENTS = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", 34],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36", 27],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", 28],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", 8],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", 3],
] as const;
const REFERERS = [
    ["https://discord.com/channels/1162553851187040326/1", 45],
    ["-", 24],
    ["https://nexus-emb.de/", 4],
    ["https://www.google.de/", 17],
    ["https://top.gg/bot/1", 6],
    ["https://www.reddit.com/r/RocketLeague/", 4],
] as const;
const SITES = [
    ["nexus-emb.de", ["/", "/module", "/bewerben", "/news", "/changelog", "/partner"], 8],
    ["dashboard.nexus-emb.de", ["/", "/servers", "/guild/1162553851187040326/uebersicht", "/guild/1162553851187040326/levels", "/guild/1162553851187040326/module"], 5],
    ["status.nexus-emb.de", ["/", "/verlauf"], 2],
] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const stamp = (at: Date): string =>
    `${String(at.getUTCDate()).padStart(2, "0")}/${MONTHS[at.getUTCMonth()]}/${at.getUTCFullYear()}:${[at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds()].map((part) => String(part).padStart(2, "0")).join(":")} +0000`;
const line = (host: string, at: Date, request: string, status: number, referer: string, agent: string): string =>
    `${host} 198.51.100.0 [${stamp(at)}] "${request}" ${status} ${200 + Math.floor(random() * 40000)} "${referer}" "${agent}"`;

const hour = 3_600_000;
const end = Math.floor(Date.now() / hour) * hour;
const lines: string[] = [];

for (let start = end - 14 * 24 * hour; start <= end; start += hour) {
    // Grob wie echte Abende: wenig nachts, Nachmittag, Spitze gegen 20 Uhr (UTC+1).
    const local = (new Date(start).getUTCHours() + 1) % 24;
    const weekend = [0, 6].includes(new Date(start).getUTCDay());
    const level = 0.08 + Math.exp(-((local - 20) ** 2) / 10) + Math.exp(-((local - 15) ** 2) / 12) * (weekend ? 0.9 : 0.35);

    for (const [host, paths, base] of SITES) {
        const views = Math.round(base * level * (0.6 + random() * 0.8));

        for (let index = 0; index < views; index++) {
            const at = new Date(start + Math.floor(random() * hour));
            const agent = pick(AGENTS);
            const page = paths[Math.floor(random() * paths.length)]!;
            const status = random() < 0.015 ? 404 : random() < 0.002 ? 502 : random() < 0.2 ? 304 : 200;

            lines.push(line(host, at, `GET ${page} HTTP/2.0`, status, pick(REFERERS), agent));
            lines.push(line(host, new Date(at.getTime() + 300), "GET /assets/app.js HTTP/2.0", 200, `https://${host}${page}`, agent));

            // Ein offener Tab der Statusseite fragt jede Minute nach: kein Aufruf (Review W-0138).
            if (host === "status.nexus-emb.de") {
                for (let minute = 1; minute <= 5; minute++) lines.push(line(host, new Date(at.getTime() + minute * 60_000), "GET /public/status HTTP/2.0", 200, `https://${host}/`, agent));
            }
        }

        if (random() < 0.3) lines.push(line(host, new Date(start + 600_000), "GET / HTTP/1.1", 200, "-", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
    }

    if (random() < 0.1) lines.push(line("nexus-emb.de", new Date(start + 1_200_000), "GET /wp-login.php HTTP/1.1", 404, "-", "Mozilla/5.0"));
    // W-0139: ab und zu eine fehlende Datei, die eine eigene Seite anfragt - nur so zählt die Ampel etwas.
    if (random() < 0.25) lines.push(line("dashboard.nexus-emb.de", new Date(start + 2_400_000), "GET /assets/alt-banner.webp HTTP/2.0", 404, "https://dashboard.nexus-emb.de/guild/1162553851187040326/levels", AGENTS[0][0]));
    if (random() < 0.2) lines.push(line("mail.nexus-emb.de", new Date(start + 1_800_000), "GET / HTTP/2.0", 200, "-", AGENTS[2][0]));
}

lines.sort((a, b) => Date.parse(a.split("[")[1]!.split("]")[0]!.replace(/(\d{2})\/(\w{3})\/(\d{4}):/, "$2 $1 $3 ")) - Date.parse(b.split("[")[1]!.split("]")[0]!.replace(/(\d{2})\/(\w{3})\/(\d{4}):/, "$2 $1 $3 ")));

await mkdir(dir, { recursive: true });
await writeFile(file, `${lines.join("\n")}\n`);

console.log(`📈 ${lines.length} Beispielzeilen nach ${file} geschrieben. Der Admin zählt sie beim nächsten Durchgang (jede Minute).`);
