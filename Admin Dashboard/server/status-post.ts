import type { IMaintenanceState } from "../shared/maintenance.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BANNER_KIND_LABELS, bannerState, type IBanner } from "../shared/content.ts";
import { INCIDENT_STATE_LABELS, STATUS_SERVICE_LABELS, type BlockState, type CheckState, type IIncident, type IOutage } from "../shared/status.ts";
import type { IConfig } from "./config.ts";
import { databaseReady, query } from "./db.ts";
import { DISCORD_API } from "./discord.ts";
import { maintenanceRunning, refreshStatus, type IServiceSnapshot, type IStatusSnapshot } from "./status/snapshot.ts";

/**
 * Eine Nachricht in Discord, die sagt, was läuft.
 *
 * Es wird nicht jedes Mal eine neue geschrieben, sondern dieselbe immer wieder
 * geändert: Ein Kanal, in dem alle zwei Minuten eine Statusmeldung auftaucht,
 * ist nach einem Tag unlesbar. Die ID der Nachricht steht in `admin_state` und
 * überlebt damit den Neustart.
 *
 * Verschickt wird über das Bot-Token, nicht über einen Webhook: Das Token ist
 * schon da, und so braucht es keine zweite Einstellung, die jemand pflegen muss.
 *
 * Was drinsteht, kommt aus dem Stand nach der letzten Prüfung
 * (status/snapshot.ts). Derselbe Stand füllt status.nexus-emb.de.
 */

/** Wie oft geprüft und die Nachricht nachgezogen wird. */
const EVERY = 2 * 60_000;

/**
 * Unter diesem Namen stand früher die ID der einen Nachricht. Heute merkt
 * sich jeder Kanal seine eigene (stateKey), die alte Zeile wird nur noch
 * gelesen, damit nach dem Update keine zweite Nachricht im Kanal landet.
 */
export const STATE_KEYS = { message: "status_message_id" } as const;

/** Die Zeile, in der ein Kanal die ID seiner Statusmeldung merkt. */
export function stateKey(channel: string): string {
    return `${STATE_KEYS.message}:${channel}`;
}

/** Grün, Gelb, Rot wie im Dashboard, Blau für geplante Wartung. */
const COLORS = { ok: 0x22_c5_5e, warn: 0xff_b0_20, down: 0xff_1e_2d, plan: 0x00_af_ff } as const;

/** Components V2: Ohne dieses Flag nimmt Discord `components` nicht an. */
const IS_COMPONENTS_V2 = 1 << 15;
/** „Cannot edit a message authored by another user“. */
const NOT_OURS = /"code":\s*50005\b/;

/** Die Bausteine, die hier vorkommen. Die Zahlen sind Discords. */
const ACTION_ROW = 1;
const BUTTON = 2;
const SECTION = 9;
const TEXT = 10;
const MEDIA_GALLERY = 12;
const CONTAINER = 17;
/** Knopf als Link: öffnet eine Adresse, ohne dass der Bot etwas beantworten muss. */
const LINK_STYLE = 5;

/** So viele Meldungen und Wartungen stehen höchstens drin, der Rest auf der Statusseite. */
const SHOWN = 2;

const BLOCKS: Readonly<Record<BlockState, string>> = { ok: "🟩", warn: "🟨", down: "🟥", none: "⬛" };
const HEADS: Readonly<Record<CheckState, string>> = { ok: "🟢 Alles läuft", warn: "🟡 Eingeschränkt", down: "🔴 Es gibt ein Problem" };
const STATE_WORDS: Readonly<Record<CheckState, string>> = { ok: "", warn: "eingeschränkt", down: "nicht erreichbar" };

/**
 * Das Banner oben in der Meldung, aus der Vorlage auf 1200 Pixel Breite
 * gebracht (Discord zeigt es rund halb so breit, doppelt für scharfe
 * Bildschirme). Einmal beim Start gelesen, es ändert sich nur mit einem Update.
 *
 * Es geht bei jedem Durchlauf mit, auch beim Ändern. Ausprobiert am echten
 * Kanal: `attachment://` findet beim Ändern ein schon vorhandenes Bild nicht,
 * auch nicht mit dessen ID in `attachments`. Die Adresse des Bildes direkt
 * anzugeben nimmt Discord zwar an, macht daraus aber ein fremdes Bild hinter
 * einer Signatur, die nach rund einem Tag abläuft. Neu hochladen sind 50 KB
 * alle zwei Minuten, dafür bleibt es ein echter Anhang der Nachricht.
 */
const BANNER_NAME = "status-banner.webp";
const BANNER = readFileSync(path.join(import.meta.dirname, "assets", BANNER_NAME));

let timer: NodeJS.Timeout | null = null;
/** Läuft gerade ein Durchlauf? Verhindert, dass sich zwei überholen. */
let running = false;
/** Wann zuletzt mindestens ein Kanal die Meldung bekam. Für die Übersicht, seit dem Start. */
let lastPost: string | null = null;

export function lastStatusPost(): string | null {
    return lastPost;
}

async function remember(name: string, value: string | null): Promise<void> {
    if (!databaseReady()) return;

    if (value === null) {
        await query("DELETE FROM admin_state WHERE name = ?", [name]);

        return;
    }

    await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);
}

async function remembered(name: string): Promise<string | null> {
    if (!databaseReady()) return null;

    const [row] = await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [name]);

    return row?.value ?? null;
}

/**
 * Ein Zeitpunkt, den Discord selbst in Worte fasst.
 *
 * `<t:…:R>` wird im Client zu „vor 3 Stunden“ und zählt dort weiter. Das ist
 * einem festen Text überlegen: Zwischen zwei Durchläufen liegen zwei Minuten,
 * in denen eine ausgeschriebene Dauer schon wieder falsch wäre.
 */
/**
 * Die Zeile eines Dienstes in der Wartung: seit wann, bis wann, warum (Plan 23).
 * Discord zeigt die Uhrzeit in der Zeitzone dessen, der liest. Der Name dessen,
 * der sie eingeschaltet hat, steht hier nicht.
 */
export function pausedLine(state: IMaintenanceState): string {
    return [`In Wartung seit ${at(state.startedAt, "R")}`, ...(state.endsAt ? [`zurück gegen ${at(state.endsAt, "t")}`] : []), ...(state.reason ? [`„${state.reason}“`] : [])].join(" · ");
}

function at(iso: string | null, style: "R" | "f" | "F" | "t"): string {
    if (iso === null) return "–";

    const seconds = Math.floor(Date.parse(iso) / 1000);

    return Number.isNaN(seconds) ? "–" : `<t:${seconds}:${style}>`;
}

function percent(value: number | null): string {
    return value === null ? "–" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

function ms(value: number | null): string {
    return value === null ? "–" : `${value.toLocaleString("de-DE")} ms`;
}

function thousands(value: number): string {
    return value.toLocaleString("de-DE");
}

function megabytes(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

function duration(minutes: number): string {
    if (minutes < 60) return minutes === 1 ? "1 Minute" : `${minutes} Minuten`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
}

function outageLine(outage: IOutage | null): string {
    if (outage === null) return "Kein Ausfall in 90 Tagen";
    if (outage.end === null) return `Ausfall seit ${at(outage.start, "R")}`;

    return `Letzter Ausfall ${at(outage.start, "f")}, ${duration(outage.minutes)}`;
}

/** „Wartung · „Umzug“ · bis …“: was der Banner zeigt, in einer Zeile. */
function bannerLine(banner: IBanner | null): string {
    if (banner === null) return "unbekannt";

    const state = bannerState(banner);
    if (state === "aus") return "aus";

    const name = banner.title || (banner.text.length > 40 ? `${banner.text.slice(0, 39)}…` : banner.text);
    const what = `${BANNER_KIND_LABELS[banner.kind]} „${name}“`;

    if (state === "geplant") return `${what} ab ${at(banner.showFrom ?? null, "f")}`;
    if (state === "abgelaufen") return `${what}, abgelaufen`;

    return what;
}

/** „### 🤖 Bot · 99,8 % in 24 h · 99,94 % in 30 Tagen“, darunter die zwölf Kästchen. */
function head(icon: string, service: IServiceSnapshot): string {
    const word = STATE_WORDS[service.state];
    const label = `### ${icon} ${STATUS_SERVICE_LABELS[service.id]}${word ? ` · ${word}` : ""}`;

    return `${label} · ${percent(service.uptime.day)} in 24 h · ${percent(service.uptime.month)} in 30 Tagen\n${service.blocks.map((block) => BLOCKS[block]).join("")}`;
}

function container(color: number, components: readonly unknown[]): Record<string, unknown> {
    return { type: CONTAINER, accent_color: color, components };
}

function text(content: string): Record<string, unknown> {
    return { type: TEXT, content };
}

function link(label: string, url: string): Record<string, unknown> {
    return { type: BUTTON, style: LINK_STYLE, label, url };
}

/** Text mit einem Knopf rechts daneben. Ohne Adresse nur der Text. */
function withButton(content: string, url: string | null): Record<string, unknown> {
    return url === null ? text(content) : { type: SECTION, components: [text(content)], accessory: link("Öffnen", url) };
}

function serviceOf(snapshot: IStatusSnapshot, id: IServiceSnapshot["id"]): IServiceSnapshot {
    const service = snapshot.services.find((entry) => entry.id === id);
    if (!service) throw new Error(`Dienst ${id} fehlt im Stand.`);

    return service;
}

function incidentContainer(incident: IIncident): Record<string, unknown> {
    const latest = incident.updates[0];
    const services = incident.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ");
    const quote = latest ? `> ${latest.body.replaceAll("\n", "\n> ")}\n` : "";

    return container(COLORS.warn, [
        text(
            `### ⚠️ ${incident.title}\n${quote}-# ${INCIDENT_STATE_LABELS[incident.state]} · betrifft ${services} · seit ${at(incident.createdAt, "t")}${latest && latest.createdAt !== incident.createdAt ? ` · Update ${at(latest.createdAt, "R")}` : ""}`
        ),
    ]);
}

function maintenanceContainer(incident: IIncident, now: number): Record<string, unknown> {
    const services = incident.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ");
    const minutes = Math.round((Date.parse(incident.endsAt ?? "") - Date.parse(incident.startsAt ?? "")) / 60_000);
    const live = maintenanceRunning(incident, now);
    const latest = incident.updates[0];

    return container(COLORS.plan, [
        text(
            [
                `### 🛠️ ${live ? "Wartung läuft" : "Geplante Wartung"} · ${incident.title}`,
                live
                    ? `Seit ${at(incident.startsAt, "t")}, endet etwa ${at(incident.endsAt, "R")}`
                    : `**${at(incident.startsAt, "F")}** (${at(incident.startsAt, "R")}), etwa ${duration(minutes)}`,
                `-# Betrifft ${services}${latest ? ` · ${latest.body.length > 120 ? `${latest.body.slice(0, 119)}…` : latest.body}` : ""}`,
            ].join("\n")
        ),
    ]);
}

/**
 * Die Nachricht als Components V2: ein Container je Bereich, jeder in der
 * Farbe seines Zustands, darunter die Knöpfe.
 *
 * Der erste Container trägt das Banner, `complete` prüft das. `content` und
 * `embeds` dürfen mit dem Flag nicht dabei sein. `attachments` sagt, welche
 * hochgeladene Datei das Banner ist: `id` 0 steht für `files[0]`.
 */
export function payload(snapshot: IStatusSnapshot, config: IConfig): Record<string, unknown> {
    const now = snapshot.measured.at.getTime();
    const { bot, database, website, maintenance: paused, banner } = snapshot.measured;
    const botService = serviceOf(snapshot, "bot");
    const dashboard = serviceOf(snapshot, "dashboard");
    const site = serviceOf(snapshot, "website");
    const data = serviceOf(snapshot, "database");

    const components: unknown[] = [
        container(COLORS[snapshot.state], [
            { type: MEDIA_GALLERY, items: [{ media: { url: `attachment://${BANNER_NAME}` }, description: "RL Nexus Status" }] },
            text(`## ${HEADS[snapshot.state]}`),
            text(`-# Geprüft ${at(snapshot.measured.at.toISOString(), "R")} · ${percent(snapshot.uptimeMonth)} verfügbar in 30 Tagen · ein Kästchen sind 2 Stunden`),
        ]),
    ];

    for (const incident of snapshot.incidents.slice(0, SHOWN)) components.push(incidentContainer(incident));

    /* --- Bot ----------------------------------------------------------- */
    const members = bot ? bot.guilds.reduce((sum, guild) => sum + guild.members, 0) : 0;
    const botLine = bot
        ? `${bot.ready ? "Läuft" : "Startet gerade"} seit ${at(bot.startedAt, "R")} · Ping **${ms(bot.ping)}** · **${thousands(bot.guilds.length)}** Server · **${thousands(members)}** Mitglieder`
        : "Antwortet nicht";

    components.push(
        container(COLORS[botService.state], [text(`${head("🤖", botService)}\n${botLine}\n-# ${outageLine(botService.lastOutage)}${bot ? ` · Version ${bot.versions.app}` : ""}`)])
    );

    /* --- Bot-Dashboard -------------------------------------------------- */
    const dashboardLine =
        paused.dashboard !== null
            ? pausedLine(paused.dashboard)
            : dashboard.state === "down"
              ? "Antwortet nicht"
              : `Antwortet in **${ms(dashboard.latencyNow)}** · Ø 24 h ${ms(dashboard.latency.avg)}`;

    components.push(container(COLORS[dashboard.state], [withButton(`${head("🖥️", dashboard)}\n${dashboardLine}\n-# ${outageLine(dashboard.lastOutage)}`, config.dashboardUrl)]));

    /* --- Webseite ------------------------------------------------------- */
    const siteLine =
        paused.website !== null
            ? pausedLine(paused.website)
            : site.state === "down"
              ? "Antwortet nicht"
              : `Antwortet in **${ms(site.latencyNow)}** · aktualisiert ${at(website.builtAt, "f")}`;

    components.push(
        container(COLORS[site.state], [withButton(`${head("🌐", site)}\n${siteLine}\n-# Banner: ${bannerLine(banner)} · ${outageLine(site.lastOutage)}`, config.websitePublicUrl)])
    );

    /* --- Datenbank ------------------------------------------------------ */
    const dataLines = database.online
        ? [
              `**Antwortzeit** ${ms(data.latencyNow)} · Ø 24 h ${ms(data.latency.avg)} · langsamste ${ms(data.latency.max)}`,
              `**Server** MariaDB ${database.version ?? "?"}${database.uptime === null ? "" : ` · läuft seit ${at(new Date(now - database.uptime * 1000).toISOString(), "R")}`}`,
              `**Inhalt** ${thousands(database.tables)} Tabellen · ${megabytes(database.bytes)} · etwa ${thousands(database.rows)} Einträge`,
          ]
        : ["Nicht erreichbar"];

    components.push(container(COLORS[data.state], [text(`${head("🗄️", data)}\n${dataLines.join("\n")}\n-# ${outageLine(data.lastOutage)}`)]));

    /* --- Wartung und Knöpfe --------------------------------------------- */
    for (const incident of snapshot.maintenance.slice(0, SHOWN)) components.push(maintenanceContainer(incident, now));

    const more = snapshot.incidents.length + snapshot.maintenance.length - Math.min(SHOWN, snapshot.incidents.length) - Math.min(SHOWN, snapshot.maintenance.length);
    if (more > 0) components.push(text(`-# ${more} weitere ${more === 1 ? "Meldung" : "Meldungen"} auf der Statusseite`));

    components.push({
        type: ACTION_ROW,
        components: [
            link("Statusseite", config.statusUrl),
            link("Webseite", config.websitePublicUrl),
            ...(config.dashboardUrl === null ? [] : [link("Bot-Dashboard", config.dashboardUrl)]),
        ],
    });

    return { flags: IS_COMPONENTS_V2, attachments: [{ id: 0, filename: BANNER_NAME }], components };
}

/**
 * Schreiben und Ändern, beides mit dem Bild: als multipart, das Bild in
 * `files[0]`, die Nachricht in `payload_json`. Den Content-Type samt Grenze
 * setzt fetch selbst.
 *
 * `payload_json` muss ein einfaches Textfeld sein. Als Blob angehängt, macht
 * FormData daraus eine Datei namens „blob“ - Discord legt die Nachricht dann
 * als Anhang ab und schickt eine leere Nachricht ohne jede Komponente.
 */
async function upload(config: IConfig, url: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<Response> {
    const form = new FormData();

    form.append("payload_json", JSON.stringify(body));
    form.append("files[0]", new Blob([BANNER], { type: "image/webp" }), BANNER_NAME);

    return fetch(`${DISCORD_API}${url}`, {
        method,
        headers: { Authorization: `Bot ${config.botToken}` },
        body: form,
        signal: AbortSignal.timeout(15_000),
    });
}

async function remove(config: IConfig, url: string): Promise<Response> {
    return fetch(`${DISCORD_API}${url}`, { method: "DELETE", headers: { Authorization: `Bot ${config.botToken}` }, signal: AbortSignal.timeout(10_000) });
}

/** Discord löscht gesammelt nur Nachrichten, die jünger als 14 Tage sind. Eine Stunde Luft für Uhren, die nachgehen. */
const BULK_LIMIT = 14 * 24 * 60 * 60_000 - 60 * 60_000;
/** So viele alte Nachrichten je Durchlauf einzeln. Der Rest kommt zwei Minuten später dran. */
const SINGLE_PER_RUN = 20;

/**
 * Im Kanal soll nur die Statusmeldung stehen. Alles andere wird gelöscht,
 * auch Angepinntes: neuere Nachrichten gesammelt (bulk-delete braucht zwei bis
 * hundert), ältere als 14 Tage einzeln. Geschaut wird in die neuesten hundert.
 * ponytail: ein voller Kanal leert sich über mehrere Durchläufe, reicht für einen Statuskanal.
 */
async function clearChannel(config: IConfig, channel: string, keep: string): Promise<void> {
    const response = await fetch(`${DISCORD_API}/channels/${channel}/messages?limit=100`, {
        headers: { Authorization: `Bot ${config.botToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Discord antwortet mit ${response.status} beim Lesen des Kanals: ${await response.text()}`);

    const messages: unknown = await response.json();
    if (!Array.isArray(messages)) return;

    const others = (messages as { id?: unknown; timestamp?: unknown }[]).filter((entry) => typeof entry.id === "string" && entry.id !== keep);
    const young = others.filter((entry) => Date.now() - Date.parse(String(entry.timestamp)) < BULK_LIMIT).map((entry) => String(entry.id));
    const old = others.filter((entry) => !young.includes(String(entry.id))).map((entry) => String(entry.id));

    if (young.length >= 2) {
        const bulk = await fetch(`${DISCORD_API}/channels/${channel}/messages/bulk-delete`, {
            method: "POST",
            headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messages: young }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!bulk.ok) throw new Error(`Discord antwortet mit ${bulk.status} beim Aufräumen: ${await bulk.text()}`);
    } else if (young.length === 1) {
        old.unshift(young[0]);
    }

    for (const id of old.slice(0, SINGLE_PER_RUN)) {
        const single = await remove(config, `/channels/${channel}/messages/${id}`);
        if (!single.ok && single.status !== 404) throw new Error(`Discord antwortet mit ${single.status} beim Löschen von ${id}: ${await single.text()}`);
    }

    const deleted = (young.length >= 2 ? young.length : 0) + Math.min(old.length, SINGLE_PER_RUN);
    if (deleted > 0) console.log(`📊 Statuskanal ${channel} aufgeräumt: ${deleted} Nachricht(en) gelöscht`);
}

interface ISentMessage {
    readonly id: string;
    readonly flags?: number;
    readonly components?: readonly { readonly components?: readonly { readonly items?: readonly { readonly media?: { readonly attachment_id?: string } }[] }[] }[];
}

/**
 * Hat Discord die Nachricht so angenommen, wie sie gemeint war?
 *
 * Mit Flag, und das Banner steckt als echter Anhang in der Galerie des
 * ersten Containers. Bei Components V2 bleibt `attachments` an der Nachricht
 * leer: Ein Bild, das eine Komponente zeigt, gehört zu ihr und trägt dort
 * seine `attachment_id`.
 */
function complete(message: ISentMessage): boolean {
    const media = message.components?.[0]?.components?.[0]?.items?.[0]?.media;

    return ((message.flags ?? 0) & IS_COMPONENTS_V2) !== 0 && typeof media?.attachment_id === "string";
}

/**
 * Die Meldung in einem Kanal nachziehen.
 *
 * Normalfall: dieselbe Nachricht ändern. Neu geschrieben wird nur, wenn sie
 * weg ist (404) oder einer anderen Application gehört (50005, etwa die des
 * Produktiv-Bots, wenn lokal die Dev-Application läuft). Alles andere ist ein
 * echter Fehler und soll auffallen, statt den Kanal mit neuen Nachrichten zu füllen.
 */
async function postTo(config: IConfig, channel: string, body: Record<string, unknown>): Promise<string> {
    const own = await remembered(stateKey(channel));
    // Vor dem Update gab es nur eine Zeile. Gehört die ID zu einem anderen Kanal, antwortet Discord mit 404.
    const known = own ?? (await remembered(STATE_KEYS.message));

    if (known !== null) {
        const patched = await upload(config, `/channels/${channel}/messages/${known}`, "PATCH", body);

        if (patched.ok) {
            if (own === null) await remember(stateKey(channel), known);
            return known;
        }

        const answer = await patched.text();
        // Kein JSON.parse: Bei einer Störung kommt hier auch mal HTML.
        const foreign = patched.status === 403 && NOT_OURS.test(answer);
        if (patched.status !== 404 && !foreign) throw new Error(`Discord antwortet mit ${patched.status} beim Ändern: ${answer}`);

        // Gelöscht oder nicht von uns: unten eine eigene schreiben.
    }

    const posted = await upload(config, `/channels/${channel}/messages`, "POST", body);
    if (!posted.ok) throw new Error(`Discord antwortet mit ${posted.status} beim Schreiben: ${await posted.text()}`);

    const message = (await posted.json()) as ISentMessage;

    // Lieber laut scheitern als eine leere Nachricht für die Statusmeldung
    // halten: Die stünde im Kanal und würde nie wieder angefasst.
    if (!complete(message)) {
        await remove(config, `/channels/${channel}/messages/${message.id}`);
        throw new Error(`Discord hat die Nachricht unvollständig angelegt (flags ${message.flags ?? "fehlt"}, Banner ${complete({ ...message, flags: IS_COMPONENTS_V2 }) ? "da" : "fehlt"}). Wieder gelöscht.`);
    }

    await remember(stateKey(channel), message.id);

    console.log(`📊 Statusmeldung in Kanal ${channel} geschrieben`);

    return message.id;
}

/**
 * Einmal nachziehen, in jedem Statuskanal. Ohne mitgegebenen Stand wird erst
 * geprüft. Scheitert ein Kanal, kommen die anderen trotzdem dran.
 */
export async function updateStatusPost(config: IConfig, given?: IStatusSnapshot): Promise<void> {
    if (config.statusChannelIds.length === 0 || running) return;

    running = true;

    try {
        const body = payload(given ?? (await refreshStatus(config)), config);

        for (const channel of config.statusChannelIds) {
            let kept: string;

            try {
                kept = await postTo(config, channel, body);
                lastPost = new Date().toISOString();
            } catch (error) {
                console.error(`📊 Statusmeldung in Kanal ${channel} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }

            // Scheitert nur das Aufräumen (meist fehlt „Nachrichten verwalten“), steht die Meldung trotzdem.
            try {
                await clearChannel(config, channel, kept);
            } catch (error) {
                console.error(`📊 Aufräumen in Kanal ${channel} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    } catch (error) {
        console.error(`📊 Statusmeldung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        running = false;
    }
}

/** Prüfen, merken, Statusseite und Discord nachziehen. Auch nach jeder eigenen Meldung. */
export async function statusCycle(config: IConfig): Promise<void> {
    try {
        const snapshot = await refreshStatus(config);
        await updateStatusPost(config, snapshot);
    } catch (error) {
        console.error(`📊 Statusprüfung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Beim Start und danach alle zwei Minuten. Geprüft wird auch ohne
 * Statuskanal: Die Statusseite braucht die Messungen trotzdem. Die Uhr hält
 * den Prozess beim Beenden nicht auf.
 */
export function scheduleStatusPost(config: IConfig): void {
    if (timer !== null) return;

    // Nicht sofort: Beim Start steht die Datenbank vielleicht noch nicht, und
    // der Bot braucht einen Moment, bis er sich als bereit meldet.
    setTimeout(() => void statusCycle(config), 10_000).unref();
    timer = setInterval(() => void statusCycle(config), EVERY);
    timer.unref();
}

/** Für die Checks: den Zeitgeber wieder anhalten. */
export function stopStatusPost(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
