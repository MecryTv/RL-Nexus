import { readFileSync } from "node:fs";
import path from "node:path";
import { USERDATA_AREAS, type IUserdataRow, type UserdataArea } from "../../shared/userdata.ts";
import type { IDiscordFile } from "../discord.ts";
import { knownName } from "../users.ts";
import { personExport, personIndex, personRows, userdataRules } from "./find.ts";

/**
 * Die Kopie der eigenen Daten (W-0051, Entwurf K1, Wahl des Nutzers am
 * 02.11.): eine HTML-Datei zum Lesen und dieselben Daten als JSON für
 * Programme (Art. 20 DSGVO). Die HTML-Datei ist in sich geschlossen: Schrift
 * und Logo stecken drin, kein Skript, nichts wird nachgeladen.
 */

type Exported = Partial<Record<UserdataArea, Record<string, Record<string, unknown>[]>>>;

export interface ICopyInput {
    readonly id: string;
    readonly name: string | null;
    readonly at: Date;
    /** Server-Namen sind freiwillig: Die Kopie für die DM kennt sie nicht. */
    readonly rows: readonly (Omit<IUserdataRow, "guildName"> & { readonly guildName?: string | null })[];
    readonly exported: Exported;
    /** Bereiche, die bei einer Löschung bleiben, mit dem Satz dazu. */
    readonly kept: Partial<Record<UserdataArea, string>>;
}

const ASSETS = path.join(import.meta.dirname, "..", "assets");
const WHEN = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

let assets: { readonly font: string; readonly logo: string } | null = null;

/** Schrift und Logo als Base64, einmal je Prozess gelesen. */
function embedded(): { readonly font: string; readonly logo: string } {
    assets ??= {
        font: readFileSync(path.join(ASSETS, "fonts", "Oxanium-Medium.woff")).toString("base64"),
        logo: readFileSync(path.join(ASSETS, "mail-logo.png")).toString("base64"),
    };

    return assets;
}

/** Alles aus der Datenbank wird Text, nie Markup. */
function escape(value: unknown): string {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

const when = (iso: string | number | null): string => (iso === null ? "ohne Zeit" : WHEN.format(new Date(iso)));

/** Ticket-Verläufe als Chat: Nachrichten mit Autor, Zeit und Text. */
function transcripts(exported: Exported): string {
    const rows = exported.tickets?.["ticket_transcripts.opener_id"] ?? [];

    return rows
        .map((row) => {
            const messages = (row.data as { messages?: unknown } | undefined)?.messages;
            if (!Array.isArray(messages) || messages.length === 0) return "";

            const lines = messages
                .map((message: { author?: { name?: unknown }; at?: number; content?: unknown }) => `<p><b>${escape(message.author?.name ?? "?")}</b> <small>${typeof message.at === "number" && message.at > 1_000_000 ? when(message.at) : ""}</small><br>${escape(message.content)}</p>`)
                .join("");

            return `<details><summary>Verlauf von Ticket ${escape(row.number ?? "")}</summary><div class="chat">${lines}</div></details>`;
        })
        .join("");
}

export function copyHtml(input: ICopyInput): string {
    const { font, logo } = embedded();
    const byArea = USERDATA_AREAS.map((area) => ({ area, rows: input.rows.filter((row) => row.area === area.id).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")) })).filter((entry) => entry.rows.length > 0);
    const servers = new Set(input.rows.flatMap((row) => (row.guildId ? [row.guildId] : []))).size;
    const keptRows = byArea.filter((entry) => input.kept[entry.area.id]).reduce((sum, entry) => sum + entry.rows.length, 0);
    const name = input.name ?? "Unbekannt";

    const sections = byArea
        .map(({ area, rows }) => {
            const keep = input.kept[area.id];
            const table = rows.map((row) => `<tr><td>${escape(row.label)}</td><td class="t">${escape(when(row.at))}</td><td>${escape(row.guildName ?? (row.guildId ? "ein Server" : "–"))}</td></tr>`).join("");
            const raw = input.exported[area.id];

            return `<section class="area" id="bereich-${area.id}">
<h2>${escape(area.label)} <span${keep ? ' class="keep"' : ""}>${keep ? "bleibt bei Löschung" : `${rows.length} ${rows.length === 1 ? "Eintrag" : "Einträge"}`}</span></h2>
<table><thead><tr><th>Was</th><th>Wann</th><th>Server</th></tr></thead><tbody>${table}</tbody></table>
${area.id === "tickets" ? transcripts(input.exported) : ""}
${keep ? `<p class="note">${escape(keep)}</p>` : ""}
${raw ? `<details><summary>Rohdaten anzeigen (alle Spalten)</summary><pre>${escape(JSON.stringify(raw, null, 2))}</pre></details>` : ""}
</section>`;
        })
        .join("\n");

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deine Daten bei RL Nexus</title>
<style>
@font-face{font-family:"Oxanium";font-weight:500;src:url("data:font/woff;base64,${font}") format("woff")}
*{box-sizing:border-box}
body{margin:0;background:#07090c;color:#f2f4f7;font:500 15px/1.55 "Oxanium","Segoe UI",system-ui,sans-serif;padding:24px 16px 48px;background-image:radial-gradient(70% 40% at 100% 0%,rgba(255,30,45,.12),transparent 60%)}
main{max-width:960px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:12px}
.brand{display:flex;align-items:center;gap:10px}
.brand img{width:30px;height:30px}
.brand b{display:block;font-size:16px;letter-spacing:.08em}
.brand small{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ff6b76}
.stand{text-align:right;font-size:13px;color:#a8b0bc}
.stand b{display:block;color:#fff}
.red{height:2px;background:linear-gradient(90deg,#ff1e2d,transparent);margin:1px 0 20px}
h1{font-size:24px;margin:0}
.lead{color:#a8b0bc;margin:2px 0 16px}
.nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:16px}
.num{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:10px 12px}
.num b{display:block;font-size:22px}
.num span{font-size:13px;color:#a8b0bc}
nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px}
nav a{font-size:13px;color:#f2f4f7;border:1px solid rgba(255,255,255,.16);padding:4px 10px;text-decoration:none}
nav a:hover,nav a:focus-visible{border-color:#ff1e2d;outline:none}
.area{border:1px solid rgba(255,255,255,.1);margin-bottom:12px}
.area h2{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;padding:10px 14px;background:rgba(255,255,255,.04);font-size:16px}
.area h2 span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#a8b0bc}
.area h2 .keep{color:#ffc53d}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a8b0bc;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.12)}
td{padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top;overflow-wrap:anywhere}
td.t{color:#a8b0bc;white-space:nowrap}
details{padding:0 14px 10px}
summary{cursor:pointer;color:#33bfff;font-size:13px;padding:6px 0}
pre{margin:0;background:#020304;border:1px solid rgba(255,255,255,.08);padding:10px;font:12.5px/1.5 Consolas,monospace;color:#d6dae1;white-space:pre-wrap;overflow-wrap:anywhere}
.chat{background:#0b0e13;border:1px solid rgba(255,255,255,.08);padding:10px 12px;font-size:14px}
.chat p{margin:0 0 8px}.chat b{color:#c9a2ff}.chat small{color:#a8b0bc}
.note{margin:0 14px 12px;border-left:3px solid #ffc53d;padding:6px 10px;background:rgba(255,197,61,.07);font-size:14px}
footer{margin-top:20px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px;font-size:13px;color:#a8b0bc;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media(max-width:640px){.nums{grid-template-columns:repeat(2,minmax(0,1fr))}td.t{white-space:normal}}
@media print{body{background:#fff;color:#111}.area,.num{border-color:#ccc}pre,.chat{background:#f5f5f5;color:#111}}
</style>
</head>
<body>
<main>
<div class="top">
<span class="brand"><img src="data:image/png;base64,${logo}" alt=""><span><b>RL NEXUS</b><small>Kopie deiner Daten · Art. 15 DSGVO</small></span></span>
<span class="stand"><b>Stand ${escape(when(input.at.toISOString()))}</b>Discord-ID ${escape(input.id)}</span>
</div>
<div class="red"></div>
<h1>${escape(name)}</h1>
<p class="lead">Alles, was RL Nexus zu deinem Discord-Konto gespeichert hat, nach Bereichen.</p>
<div class="nums">
<div class="num"><b>${input.rows.length}</b><span>Einträge</span></div>
<div class="num"><b>${byArea.length}</b><span>Bereiche</span></div>
<div class="num"><b>${servers}</b><span>Server</span></div>
<div class="num"><b>${keptRows}</b><span>bleiben bei Löschung</span></div>
</div>
<nav aria-label="Bereiche">${byArea.map(({ area, rows }) => `<a href="#bereich-${area.id}">${escape(area.label)} · ${rows.length}</a>`).join("")}</nav>
${sections || '<p class="lead">Zu dieser ID gibt es keine Einträge.</p>'}
<footer><span>Maschinenlesbar stehen dieselben Daten in der JSON-Datei, die dazugehört.</span><span>Fragen: support@nexus-emb.de</span></footer>
</main>
</body>
</html>
`;
}

/** Beide Dateien der Kopie für eine Person: HTML zum Lesen, JSON für Programme. */
export async function personCopies(userId: string, now = new Date()): Promise<{ readonly html: IDiscordFile; readonly json: IDiscordFile; readonly rows: number }> {
    const [rows, exported, rules, index] = await Promise.all([personRows(userId), personExport(userId), userdataRules(), personIndex()]);
    const kept = Object.fromEntries(rules.filter((rule) => rule.keep && rule.note).map((rule) => [rule.area, rule.note as string]));
    const stamp = now.toISOString().slice(0, 10);
    const json = Buffer.from(JSON.stringify({ person: userId, erstellt: now.toISOString(), von: "RL Nexus", bereiche: exported }, null, 2));
    const html = Buffer.from(copyHtml({ id: userId, name: knownName(userId) ?? index.get(userId)?.name ?? null, at: now, rows, exported, kept }));

    return {
        rows: rows.length,
        html: { name: `rl-nexus-kopie-${userId}-${stamp}.html`, data: html, type: "text/html" },
        json: { name: `rl-nexus-kopie-${userId}-${stamp}.json`, data: json, type: "application/json" },
    };
}
