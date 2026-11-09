import {
    INCIDENT_STATE_LABELS,
    STATUS_SERVICE_LABELS,
    type IDiscordPostChannel,
    type IDiscordPostResult,
    type IDiscordPostState,
    type IStatusChannelOption,
    type IIncident,
} from "../shared/status.ts";
import type { IConfig } from "./config.ts";
import { databaseReady, query } from "./db.ts";
import { DISCORD_API } from "./discord.ts";
import { PublicError } from "./errors.ts";
import { STATUS_IMAGES, headAlt, imageName, renderStatusImages, serviceAlt, type IStatusImage } from "./status/image.ts";
import { maintenanceRunning, refreshStatus, statusSnapshot, type IStatusSnapshot } from "./status/snapshot.ts";

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

/** Höchstens so oft schreibt ein Klick auf „In Discord aktualisieren“ wirklich (W-0052). */
export const MANUAL_GAP = 10_000;

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
const TEXT = 10;
const MEDIA_GALLERY = 12;
const CONTAINER = 17;
/** Knopf als Link: öffnet eine Adresse, ohne dass der Bot etwas beantworten muss. */
const LINK_STYLE = 5;

/** So viele Meldungen und Wartungen stehen höchstens drin, der Rest auf der Statusseite. */
const SHOWN = 2;


let timer: NodeJS.Timeout | null = null;
/** Wann die Uhr das nächste Mal von selbst nachzieht. Für den Ring auf der Status-Seite. */
let nextAt: number | null = null;
/**
 * Der laufende Durchlauf. Verhindert, dass sich zwei überholen, und ein Klick
 * währenddessen wartet auf genau dieses Ergebnis, statt einen zweiten zu starten.
 */
let current: Promise<IDiscordPostResult> | null = null;
/** Wann zuletzt mindestens ein Kanal die Meldung bekam. Für die Übersicht, seit dem Start. */
let lastPost: string | null = null;
/** Wann zuletzt ein Klick wirklich geschrieben hat. */
let lastManual: number | null = null;
/** Wer zuletzt geklickt hat und mit welchem Ergebnis. Für den Reiter „Discord-Meldung“, seit dem Start. */
let manual: IDiscordPostState["manual"] = null;
/** Namen der Statuskanäle aus Discord. Ändern sich praktisch nie, deshalb einmal je Prozess. */
const channelNames = new Map<string, string | null>();
/**
 * Der im Admin Dashboard gewählte Statuskanal (W-0052, K2). undefined: noch
 * nicht aus der Datenbank gelesen. null: keiner gewählt, dann gilt die .env.
 */
let chosen: string | null | undefined;

/** Unter diesem Namen steht der gewählte Kanal in admin_state. */
const CHOSEN_KEY = "status_channel";

/**
 * Einmal aus der Datenbank lesen. Danach hält der Speicher den Stand,
 * `chooseChannel` schreibt beides. Ein Fehler wird nicht gemerkt: Beim
 * nächsten Mal wird wieder gelesen.
 */
async function loadChosen(config: IConfig): Promise<void> {
    if (chosen !== undefined || config.database === null) return;
    if (!databaseReady()) throw new PublicError(503, "Die Datenbank antwortet nicht, deshalb ist unklar, welcher Statuskanal gilt.");

    chosen = await remembered(CHOSEN_KEY);
}

/**
 * Die Kanäle, in die geschrieben wird: der gewählte, sonst die aus der .env.
 * Mit Datenbank, aber noch ohne gelesene Wahl keiner: Der Bot räumt den
 * Statuskanal leer, eine ausgelassene Runde ist besser als der falsche Kanal.
 */
export function statusChannels(config: IConfig): readonly string[] {
    if (config.database === null) return config.statusChannelIds;
    if (chosen === undefined) return [];

    return chosen ? [chosen] : config.statusChannelIds;
}

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
function at(iso: string | null, style: "R" | "f" | "F" | "t"): string {
    if (iso === null) return "–";

    const seconds = Math.floor(Date.parse(iso) / 1000);

    return Number.isNaN(seconds) ? "–" : `<t:${seconds}:${style}>`;
}

function duration(minutes: number): string {
    if (minutes < 60) return minutes === 1 ? "1 Minute" : `${minutes} Minuten`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
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
 * Die Nachricht als Components V2 (W-0052, Runde 2): oben ein Container mit
 * dem Kopfbild und genau einer Zeile, darunter laufende Meldungen als Text,
 * dann die vier Dienste als Karten in einer Galerie, geplante Wartungen als
 * Text und unten die Knöpfe.
 *
 * Die Bilder zeichnet status/image.ts. `attachments` sagt, welche
 * hochgeladene Datei welches Bild ist: `id` n steht für `files[n]`.
 * `content` und `embeds` dürfen mit dem Flag nicht dabei sein.
 */
export function payload(snapshot: IStatusSnapshot, config: IConfig): Record<string, unknown> {
    const now = snapshot.measured.at.getTime();

    const components: unknown[] = [
        container(COLORS[snapshot.state], [
            { type: MEDIA_GALLERY, items: [{ media: { url: `attachment://${STATUS_IMAGES[0]}` }, description: headAlt(snapshot) }] },
            text(`-# Geprüft ${at(snapshot.measured.at.toISOString(), "R")} · zieht alle 2 Minuten nach`),
        ]),
    ];

    for (const incident of snapshot.incidents.slice(0, SHOWN)) components.push(incidentContainer(incident));

    components.push({
        type: MEDIA_GALLERY,
        items: snapshot.services.map((service) => ({ media: { url: `attachment://${imageName(service.id)}` }, description: serviceAlt(snapshot, service.id) })),
    });

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

    return { flags: IS_COMPONENTS_V2, attachments: STATUS_IMAGES.map((filename, id) => ({ id, filename })), components };
}

/**
 * Schreiben und Ändern, beides mit den Bildern: als multipart, die Bilder in
 * `files[0]` bis `files[4]`, die Nachricht in `payload_json`. Den
 * Content-Type samt Grenze setzt fetch selbst. Discord findet beim Ändern ein
 * schon vorhandenes Bild über `attachment://` nicht, deshalb gehen sie jedes
 * Mal neu mit (zusammen rund 150 KB alle zwei Minuten).
 *
 * `payload_json` muss ein einfaches Textfeld sein. Als Blob angehängt, macht
 * FormData daraus eine Datei namens „blob“ - Discord legt die Nachricht dann
 * als Anhang ab und schickt eine leere Nachricht ohne jede Komponente.
 */
export async function upload(config: IConfig, url: string, method: "POST" | "PATCH", body: Record<string, unknown>, images: readonly IStatusImage[]): Promise<Response> {
    const form = new FormData();

    form.append("payload_json", JSON.stringify(body));
    images.forEach((image, index) => form.append(`files[${index}]`, new Blob([new Uint8Array(image.data)], { type: "image/png" }), image.name));

    return fetch(`${DISCORD_API}${url}`, {
        method,
        headers: { Authorization: `Bot ${config.botToken}` },
        body: form,
        signal: AbortSignal.timeout(15_000),
    });
}

export async function remove(config: IConfig, url: string): Promise<Response> {
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
async function postTo(config: IConfig, channel: string, body: Record<string, unknown>, images: readonly IStatusImage[]): Promise<string> {
    const own = await remembered(stateKey(channel));
    // Vor dem Update gab es nur eine Zeile. Gehört die ID zu einem anderen Kanal, antwortet Discord mit 404.
    const known = own ?? (await remembered(STATE_KEYS.message));

    if (known !== null) {
        const patched = await upload(config, `/channels/${channel}/messages/${known}`, "PATCH", body, images);

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

    const posted = await upload(config, `/channels/${channel}/messages`, "POST", body, images);
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
 * geprüft. Scheitert ein Kanal, kommen die anderen trotzdem dran. Ohne
 * Statuskanal oder während ein Durchlauf läuft: null.
 */
export async function updateStatusPost(config: IConfig, given?: IStatusSnapshot): Promise<IDiscordPostResult | null> {
    // Nur solange die Wahl fehlt. Ist sie gelesen, kommt bis zum Merken der Runde kein await.
    if (chosen === undefined && config.database !== null) await loadChosen(config).catch(() => undefined);
    if (statusChannels(config).length === 0 || current !== null) return null;

    current = post(config, given);

    try {
        return await current;
    } finally {
        current = null;
    }
}

async function post(config: IConfig, given?: IStatusSnapshot): Promise<IDiscordPostResult> {
    const started = Date.now();
    const channels: IDiscordPostChannel[] = [];

    try {
        const snapshot = given ?? (await refreshStatus(config));
        const body = payload(snapshot, config);
        const images = await renderStatusImages(snapshot);

        for (const channel of statusChannels(config)) {
            let kept: string;

            try {
                kept = await postTo(config, channel, body, images);
                lastPost = new Date().toISOString();
                channels.push({ id: channel, name: channelNames.get(channel) ?? null, ok: true, error: null });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                console.error(`📊 Statusmeldung in Kanal ${channel} fehlgeschlagen: ${message}`);
                channels.push({ id: channel, name: channelNames.get(channel) ?? null, ok: false, error: shortError(message) });
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
        const message = error instanceof Error ? error.message : String(error);

        console.error(`📊 Statusmeldung fehlgeschlagen: ${message}`);

        for (const channel of statusChannels(config)) {
            if (!channels.some((entry) => entry.id === channel)) channels.push({ id: channel, name: channelNames.get(channel) ?? null, ok: false, error: shortError(message) });
        }
    }

    return { at: new Date().toISOString(), ms: Date.now() - started, channels };
}

/**
 * Ein Fehler für Hinweis und Protokoll: „Discord 403 beim Ändern: Missing
 * Permissions“ statt der ganzen Antwort. Bei einer Störung schickt Discord
 * auch mal eine HTML-Seite, die fällt weg.
 */
export function shortError(message: string): string {
    const answer = /^Discord antwortet mit (\d+) beim (\S+): ([\s\S]*)$/.exec(message);

    if (answer) {
        const [, status, step, body] = answer;
        let reason: string | null = null;

        try {
            const parsed: unknown = JSON.parse(body);
            if (typeof parsed === "object" && parsed !== null && typeof (parsed as { message?: unknown }).message === "string") reason = (parsed as { message: string }).message;
        } catch {
            // Kein JSON, etwa HTML: nur Status und Schritt.
        }

        return `Discord ${status} beim ${step}${reason ? `: ${reason}` : ""}`.slice(0, 200);
    }

    return message.slice(0, 200);
}

/** Merkt sich den letzten Klick für den Reiter „Discord-Meldung“. */
export function rememberManual(by: string, result: IDiscordPostResult): void {
    manual = { by, result };
}

/** Wie viele Sekunden der Knopf noch warten muss. Aufgerundet, damit „wieder in 0 Sek.“ nie dasteht. */
export function manualWait(last: number | null, now: number): number {
    return last === null ? 0 : Math.max(0, Math.ceil((last + MANUAL_GAP - now) / 1000));
}

/**
 * „In Discord aktualisieren“ (W-0052): sofort prüfen und in jedem
 * Statuskanal neu schreiben. Läuft gerade ein Durchlauf, kommt dessen
 * Ergebnis. Höchstens ein echter Aufruf alle zehn Sekunden, egal wie viele
 * Leute klicken. Danach kommt die Uhr erst zwei Minuten später wieder.
 */
export async function refreshNow(config: IConfig, now = Date.now()): Promise<IDiscordPostResult> {
    // Vor der Prüfung auf `current`: Danach darf bis zum Merken der Runde kein await mehr kommen.
    await loadChosen(config);

    if (statusChannels(config).length === 0) throw new PublicError(409, "Kein Statuskanal eingestellt.");
    if (current !== null) return current;

    const wait = manualWait(lastManual, now);
    if (wait > 0) throw new PublicError(429, `Gerade erst aktualisiert, wieder in ${wait} Sek.`);

    lastManual = now;
    if (timer !== null) startTimer(config);

    // Seit der Prüfung auf `current` lief kein await: Kanäle gibt es, also kommt hier ein Ergebnis.
    const result = await updateStatusPost(config);
    if (result === null) throw new PublicError(503, "Die Statusmeldung wird gerade schon geschrieben. Versuch es gleich noch einmal.");

    return result;
}

/* --- Statuskanal wählen (W-0052, K2) --------------------------------------- */

const PERMISSION = { administrator: 1n << 3n, view: 1n << 10n, send: 1n << 11n, manage: 1n << 13n, attach: 1n << 15n, history: 1n << 16n } as const;

export type ChannelRight = Exclude<keyof typeof PERMISSION, "administrator">;

/** Was der Bot im Statuskanal braucht, in der Reihenfolge, in der es fehlen kann. */
const NEEDED: readonly [ChannelRight, string][] = [
    ["view", "Kanal sehen"],
    ["send", "Nachrichten senden"],
    ["attach", "Dateien anhängen"],
    ["manage", "Nachrichten verwalten"],
    ["history", "Nachrichtenverlauf lesen"],
];

export interface IPermissionInput {
    readonly guildId: string;
    readonly memberId: string;
    readonly memberRoles: readonly string[];
    /** Rechte je Rolle; die Rolle mit der ID des Servers ist @everyone. */
    readonly roles: Readonly<Record<string, bigint>>;
    /** Überschreibungen am Kanal, wie Discord sie schickt (type 0 Rolle, 1 Mitglied). */
    readonly overwrites: readonly { readonly id: string; readonly type: number; readonly allow: string; readonly deny: string }[];
}

/**
 * Die Rechte eines Mitglieds in einem Kanal, wie Discord sie rechnet: Rollen
 * zusammen, Administrator heißt alles, dann die Überschreibungen am Kanal für
 * @everyone, für die Rollen zusammen und zuletzt für das Mitglied selbst.
 */
export function channelPermissions(input: IPermissionInput): bigint {
    let rights = input.roles[input.guildId] ?? 0n;

    for (const role of input.memberRoles) rights |= input.roles[role] ?? 0n;
    if ((rights & PERMISSION.administrator) !== 0n) return ~0n;

    const apply = (allow: bigint, deny: bigint): void => {
        rights = (rights & ~deny) | allow;
    };

    const everyone = input.overwrites.find((entry) => entry.id === input.guildId);
    if (everyone) apply(BigInt(everyone.allow), BigInt(everyone.deny));

    let allow = 0n;
    let deny = 0n;

    for (const entry of input.overwrites) {
        if (entry.type === 0 && input.memberRoles.includes(entry.id)) {
            allow |= BigInt(entry.allow);
            deny |= BigInt(entry.deny);
        }
    }

    apply(allow, deny);

    const own = input.overwrites.find((entry) => entry.type === 1 && entry.id === input.memberId);
    if (own) apply(BigInt(own.allow), BigInt(own.deny));

    return rights;
}

/** Was dem Bot fehlt, als Wörter für das Fenster. Leer heißt: alles da. */
/** Was fehlt, von dem, was gebraucht wird; ohne Angabe alles, was die Statusmeldung braucht. */
export function missingRights(rights: bigint, wanted: readonly ChannelRight[] = NEEDED.map(([key]) => key)): string[] {
    return NEEDED.filter(([key]) => wanted.includes(key) && (rights & PERMISSION[key]) === 0n).map(([, label]) => label);
}

async function discordGet<T>(config: IConfig, url: string): Promise<T> {
    const response = await fetch(`${DISCORD_API}${url}`, { headers: { Authorization: `Bot ${config.botToken}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new PublicError(502, `Discord antwortet mit ${response.status} beim Lesen von ${url.split("/")[1]}.`);

    return (await response.json()) as T;
}

interface IDiscordChannel {
    readonly id: string;
    readonly name: string;
    readonly type: number;
    readonly position: number;
    readonly parent_id?: string | null;
    readonly permission_overwrites?: IPermissionInput["overwrites"];
}

/** Text- und Ankündigungskanäle; Kategorien sind 4. */
const TEXT_TYPES = new Set([0, 5]);

/**
 * Alle Textkanäle des einen Servers, der in Frage kommt (`ADMIN_GUILD_ID`:
 * im Development-Modus der Dev Server, im Betrieb der Server des Teams),
 * nach Kategorie sortiert und mit dem, was dem Bot dort fehlt.
 */
export async function statusChannelOptions(config: IConfig, wanted?: readonly ChannelRight[]): Promise<IStatusChannelOption[]> {
    const me = await discordGet<{ id: string }>(config, "/users/@me");
    const [channels, roles, member] = await Promise.all([
        discordGet<IDiscordChannel[]>(config, `/guilds/${config.guildId}/channels`),
        discordGet<{ id: string; permissions: string }[]>(config, `/guilds/${config.guildId}/roles`),
        discordGet<{ roles: string[] }>(config, `/guilds/${config.guildId}/members/${me.id}`),
    ]);

    const roleRights = Object.fromEntries(roles.map((role) => [role.id, BigInt(role.permissions)]));
    const categories = new Map(channels.filter((channel) => channel.type === 4).map((channel) => [channel.id, channel]));
    const order = (channel: IDiscordChannel): [number, number] => {
        const parent = channel.parent_id ? categories.get(channel.parent_id) : undefined;

        return [parent ? parent.position + 1 : 0, channel.position];
    };

    return channels
        .filter((channel) => TEXT_TYPES.has(channel.type))
        .sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1])
        .map((channel) => {
            const rights = channelPermissions({ guildId: config.guildId, memberId: me.id, memberRoles: member.roles, roles: roleRights, overwrites: channel.permission_overwrites ?? [] });

            channelNames.set(channel.id, channel.name);

            return { id: channel.id, name: channel.name, category: (channel.parent_id && categories.get(channel.parent_id)?.name) || null, missing: missingRights(rights, wanted) };
        });
}

/** Läuft gerade ein Wechsel? Ein zweiter zur selben Zeit ließe eine Meldung im Kanal des ersten zurück. */
let switching = false;

/**
 * Den Statuskanal wechseln: Der Kanal muss einer aus `statusChannelOptions`
 * sein. Zuerst gilt die neue Wahl, damit keine Runde mehr in den alten Kanal
 * schreibt. Dann wartet der Wechsel eine laufende Runde ab, schreibt im neuen
 * Kanal und löscht erst danach die alten Meldungen: Klappt das Schreiben
 * nicht, steht die alte Meldung noch. Gibt das Ergebnis dieser Runde zurück.
 */
export async function chooseChannel(config: IConfig, channelId: string): Promise<{ readonly from: string | null; readonly result: IDiscordPostResult | null }> {
    const options = await statusChannelOptions(config);
    if (!options.some((option) => option.id === channelId)) throw new PublicError(400, "Diesen Textkanal gibt es auf dem Server nicht.");
    // Ohne Datenbank wäre die Wahl nach dem nächsten Neustart still wieder die aus der .env.
    if (config.database === null || !databaseReady()) throw new PublicError(503, "Ohne Datenbank lässt sich der Statuskanal nicht speichern.");
    if (switching) throw new PublicError(409, "Der Statuskanal wird gerade schon gewechselt.");

    switching = true;

    try {
        await loadChosen(config);

        const before = statusChannels(config);
        const from = before[0] ?? null;

        if (before.length === 1 && from === channelId) return { from, result: null };

        await remember(CHOSEN_KEY, channelId);
        chosen = channelId;

        // Eine Runde, die vor dem Wechsel losging, schreibt noch in den alten Kanal.
        while (current !== null) await current;

        // Seit dem Warten kein await: Die Runde gehört diesem Wechsel.
        const result = await updateStatusPost(config);

        for (const old of before) {
            const message = old === channelId ? null : await remembered(stateKey(old));
            if (message === null) continue;

            const gone = await remove(config, `/channels/${old}/messages/${message}`).catch(() => null);
            if (gone && !gone.ok && gone.status !== 404) console.error(`📊 Alte Statusmeldung in Kanal ${old} nicht gelöscht: ${gone.status}`);
            await remember(stateKey(old), null);
        }

        return { from, result };
    } finally {
        switching = false;
    }
}

/** Den Namen eines Statuskanals aus Discord, einmal je Prozess. */
export async function channelName(config: IConfig, channel: string): Promise<string | null> {
    if (channelNames.has(channel)) return channelNames.get(channel) ?? null;

    let name: string | null = null;

    try {
        const response = await fetch(`${DISCORD_API}/channels/${channel}`, { headers: { Authorization: `Bot ${config.botToken}` }, signal: AbortSignal.timeout(5000) });
        if (response.ok) name = ((await response.json()) as { name?: unknown }).name?.toString() ?? null;
    } catch {
        // Ohne Namen steht in der Karte die ID. Beim nächsten Neustart wird es wieder versucht.
    }

    channelNames.set(channel, name);

    return name;
}

/** Was die Karte „Discord-Meldung“ zeigt. Die Vorschau kommt aus dem Stand der letzten Prüfung. */
export async function discordPostState(config: IConfig, now = Date.now()): Promise<IDiscordPostState> {
    await loadChosen(config);

    const snapshot = statusSnapshot();
    const channels = await Promise.all(statusChannels(config).map(async (id) => ({ id, name: await channelName(config, id) })));

    return {
        channels,
        lastAt: lastPost,
        nextSeconds: nextAt === null ? null : Math.max(0, Math.ceil((nextAt - now) / 1000)),
        everySeconds: EVERY / 1000,
        waitSeconds: manualWait(lastManual, now),
        components: snapshot === null ? null : ((payload(snapshot, config).components as readonly unknown[]) ?? null),
        imagesAt: snapshot === null ? null : snapshot.measured.at.toISOString(),
        manual,
    };
}

/** Prüfen, merken, Statusseite und Discord nachziehen. Auch nach jeder eigenen Meldung. */
export async function statusCycle(config: IConfig): Promise<void> {
    try {
        // Die Statusseite braucht die Messung auch dann, wenn Discord diese Runde ausfällt.
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
    startTimer(config);
}

/** Die Uhr (neu) stellen: der nächste Durchlauf von selbst in zwei Minuten. */
function startTimer(config: IConfig): void {
    if (timer !== null) clearInterval(timer);

    nextAt = Date.now() + EVERY;
    timer = setInterval(() => {
        nextAt = Date.now() + EVERY;
        void statusCycle(config);
    }, EVERY);
    timer.unref();
}

/** Für die Checks: den Zeitgeber wieder anhalten. */
export function stopStatusPost(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    nextAt = null;
}
