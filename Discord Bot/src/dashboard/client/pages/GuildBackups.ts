/**
 * Abschnitte: Backups und Meine Backups (festes Modul, Spec Backup-Modul im
 * Admin Dashboard, Plan 32 für den Discord-Server).
 *
 * "Backups" ist die Seite zum Einstellen: Kennzahlen, was zum Laden fehlt,
 * von Hand sichern (Bot, Discord-Server oder beides), automatisch sichern und
 * der Meldekanal. "Meine Backups" zeigt links alle Backups nach Tagen, rechts
 * das gewählte mit Inhalt, Vergleich zu jetzt und dem Laden in vier Schritten.
 *
 * Bot-Daten speichert und lädt das Admin Dashboard, den Discord-Server baut
 * der Bot. Diese Seite spricht nur die Modul-Route des Bots an.
 */

import { BASE } from "../core/Base.js";
import { icon, maybe, need } from "../core/Dom.js";
import { berlinAt, numbers } from "../core/Format.js";
import { clickSound } from "../core/Sound.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, loading, radioTiles, row, select, stat, toggle, WHEN } from "../core/Ui.js";

type Kind = "nacht" | "vorher" | "hand" | "plan" | "schutz";
type Every = "tag" | "3tage" | "woche" | "monat";
type Part = "bot" | "server";
type ServerPart = "roles" | "channels" | "permissions" | "members" | "settings" | "expressions" | "bans";
type Mode = "repair" | "exact" | "other";

interface ICounts {
    roles: number;
    channels: number;
    members: number | null;
    emojis: number;
    stickers: number;
    bans: number;
}

interface IBackup {
    id: number;
    guildName: string;
    kind: Kind;
    note: string | null;
    byName: string | null;
    createdAt: string;
    bytes: number;
    counts: Record<string, number>;
    parts: Part[];
    server: ICounts | null;
}

interface IPlan {
    enabled: boolean;
    every: Every;
    weekday: number;
    hour: number;
    keep: number;
    discord: boolean;
    risky: boolean;
}

interface IPlanState {
    plan: IPlan;
    next: string | null;
    lastOk: string | null;
    lastError: { at: string; reason: string } | null;
}

interface IServerInfo {
    counts: { roles: number; channels: number };
    readiness: { missing: string[]; aboveBot: string[]; intent: boolean };
    settings: { logChannelId: string | null };
    antiVillain: boolean;
    channels: { id: string; name: string }[];
}

interface ILine {
    sign: "+" | "~" | "−" | "=" | "!";
    part: string;
    text: string;
    names: string[];
    more: number;
}

interface IJob {
    id: number;
    status: "running" | "done" | "failed" | "cancelled";
    phase: "server" | "bot" | "remap" | "panels" | "done";
    mode: Mode;
    done: number;
    total: number;
    failed: { op: number; reason: string }[];
    report: { lines: ILine[]; reposted: string[]; redrawn: string[]; remapped: number; problems: string[] } | null;
    progress: { name: string; done: number; total: number }[];
    safetyId: number | null;
    startedAt: number;
    parts: ServerPart[];
    /** W-0041 M9: nur beim Server, auf den geladen wurde. */
    undo: boolean;
}

interface IPayload {
    guildId: string;
    plan: IPlanState;
    backups: IBackup[];
    hand: { used: number; max: number };
    server: IServerInfo;
    job: IJob | null;
}

interface IDetail extends IBackup {
    tables: Record<string, number>;
}

interface IServerView {
    server: { roles: { id: string; name: string; position: number; everyone: boolean }[]; channels: { id: string; name: string; type: number; parentId: string | null; position: number }[] };
    changed: ILine[];
    missing: string[];
    deletedBy: Record<string, { name: string; at: number }>;
}

interface IPreview {
    lines: ILine[];
    deletes: string[];
    impossible: string[];
    estimateMs: number;
}

interface IResult {
    safetyId: number;
    areas: { area: string; rows: number }[];
    bot: { reached: boolean; reposted: string[]; removed: string[]; problems: string[] };
}

/** Dieselben zehn Bereiche wie im Admin Dashboard (shared/backups.ts dort). */
const AREAS: readonly { id: string; label: string; members: boolean }[] = [
    { id: "einstellungen", label: "Module und Einstellungen", members: false },
    { id: "nachrichten", label: "Nachrichten und Panels", members: false },
    { id: "voice", label: "Voice und Streams", members: false },
    { id: "bewerbungen", label: "Bewerbungen", members: true },
    { id: "level", label: "Level und Aktivität", members: true },
    { id: "tickets", label: "Tickets", members: true },
    { id: "moderation", label: "Moderation", members: true },
    { id: "community", label: "Community", members: true },
    { id: "teams", label: "Teams und Wettbewerb", members: true },
    { id: "clips", label: "Clips", members: true },
];

/** Die Teile des Discord-Servers, wie im Bot (constants/ServerBackup.ts). */
const SERVER_PARTS: readonly { id: ServerPart; label: string; text: (counts: ICounts | null) => string }[] = [
    { id: "roles", label: "Rollen", text: (counts) => `${numbers.format(counts?.roles ?? 0)} Rollen mit Farbe, Symbol, Rechten und Reihenfolge` },
    { id: "channels", label: "Kanäle und Kategorien", text: (counts) => `${numbers.format(counts?.channels ?? 0)} Kanäle mit Thema, Slowmode und Reihenfolge` },
    { id: "permissions", label: "Berechtigungen", text: () => "Wer welchen Kanal sehen und nutzen darf" },
    { id: "members", label: "Rollen der Mitglieder", text: (counts) => (counts?.members === null ? "Nicht im Backup: Der Bot sah die Mitgliederliste nicht." : `${numbers.format(counts?.members ?? 0)} Mitglieder. Wer heute neu eine Rolle hat, behält sie`) },
    { id: "settings", label: "Servereinstellungen", text: () => "Name, Bild, Banner, Verifizierung, AFK- und Regelkanal" },
    { id: "expressions", label: "Emojis und Sticker", text: (counts) => `${numbers.format(counts?.emojis ?? 0)} Emojis, ${numbers.format(counts?.stickers ?? 0)} Sticker` },
    { id: "bans", label: "Bans", text: (counts) => `${numbers.format(counts?.bans ?? 0)} Bans mit Grund. Aufgehoben wird nie einer` },
];

const MODES: [Mode, string, string, string][] = [
    ["repair", "Reparieren", "Legt an, was fehlt, und setzt geänderte Rechte zurück. Was seitdem dazukam, bleibt. Richtig nach einem Unfall oder Nuke.", "ab Werk"],
    ["exact", "Genau wie im Backup", "Wie Reparieren, dazu verschwindet, was es im Backup nicht gab. Fragt vorher extra nach.", "löscht"],
    ["other", "Auf einen anderen Server", "Baut die Struktur auf einem Server auf, den du auch verwaltest. Für einen Umzug oder einen zweiten Server.", "ohne Mitglieder"],
];

const LINE_PART: Record<string, string> = { roles: "Rollen", channels: "Kanäle", permissions: "Berechtigungen", members: "Mitglieder", settings: "Servereinstellungen", expressions: "Emojis und Sticker", bans: "Bans", debris: "Aus dem Anti-Nuke", bot: "Bot" };
const PHASE: Record<IJob["phase"], string> = { server: "Discord-Server", bot: "Bot-Daten", remap: "Verweise im Bot", panels: "Panels", done: "Fertig" };
const KIND_TEXT: Record<Kind, string> = { nacht: "nachts", vorher: "vor dem Zurückladen", hand: "von Hand", plan: "automatisch", schutz: "vor dem Anti-Nuke" };
const KIND_TITLE: Record<Kind, string> = { nacht: "Automatisch", vorher: "Vor dem Zurückladen", hand: "Von Hand", plan: "Automatisch", schutz: "Vor dem Anti-Nuke" };
const KIND_GROUP: Record<Kind, string> = { nacht: "Automatisch", vorher: "Sicherheit", hand: "Von Hand", plan: "Automatisch", schutz: "Sicherheit" };
const KIND_ICON: Record<Kind, string> = { nacht: "#i-clock", vorher: "#i-shield", hand: "#i-plus", plan: "#i-clock", schutz: "#i-shield-check" };
const KIND_TONE: Record<Kind, string> = { nacht: "auto", vorher: "safe", hand: "hand", plan: "auto", schutz: "safe" };
const EVERY: [Every, string][] = [
    ["tag", "Jeden Tag"],
    ["3tage", "Alle 3 Tage"],
    ["woche", "Jede Woche"],
    ["monat", "Jeden Monat (am 1.)"],
];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const KEEP_MAX = 14;
/** Alle 3 Sekunden: Die Route lässt 30 Anfragen je Minute zu, daneben soll noch Abbrechen gehen. */
const POLL_MS = 3_000;
const DAY = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

function base(guildId: string): string {
    return `${BASE}/api/guild/${encodeURIComponent(guildId)}/backups`;
}

function kilobytes(bytes: number): string {
    return `${numbers.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** „5 Tage, 10 Std.“, „3 Std. 12 Min.“, „12 Min.“ */
function duration(ms: number): string {
    const minutes = Math.max(0, Math.floor(ms / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);

    if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} Std.`;
    if (hours > 0) return `${hours} Std. ${minutes % 60} Min.`;

    return `${minutes} Min.`;
}

/** „„Owner“, „Mod“ und „Admin““ */
function quoted(names: readonly string[]): string {
    const all = names.map((name) => `„${name}“`);

    return all.length > 1 ? `${all.slice(0, -1).join(", ")} und ${all.at(-1)}` : (all[0] ?? "");
}

/** Der Titel eines Backups: die Notiz nur bei denen von Hand, sonst die Art. */
function titleOf(backup: IBackup): string {
    return backup.kind === "hand" && backup.note ? `„${backup.note}“` : KIND_TITLE[backup.kind];
}

/** Was unter dem Titel steht: bei Sicherheits-Backups der Anlass, sonst wer und wie groß. */
function aboutOf(backup: IBackup): string {
    const reason = backup.kind === "schutz" && backup.note ? `Anti Villain hat gesichert: ${backup.note.replace(/^vor dem Anti-Nuke:\s*/i, "")}` : "";

    return [reason, backup.byName ? `von ${backup.byName}` : "", backup.kind === "schutz" ? "bleibt 7 Tage" : backup.kind === "vorher" ? "bleibt 72 Stunden" : "", kilobytes(backup.bytes)].filter(Boolean).join(" · ");
}

/** Die Namen einer Zeile. Erwähnungen wie <@123> sagen hier niemandem etwas: dann nur die Zahl. */
function namesOf(line: ILine): string {
    if (line.names.length === 0 || line.names.every((name) => /^<@\d+>$/.test(name))) return "";

    return `${line.names.join(", ")}${line.more ? ` und ${line.more} weitere` : ""}`;
}

/** Ein Satz zu den automatischen Backups: wann das nächste kommt und wie weit sie zurückreichen. */
function planText(state: IPlanState): string {
    const { plan, next } = state;
    if (!plan.enabled) return "Aus. Gesichert wird nur, wenn du es von Hand tust.";

    const when = next ? `am ${berlinAt(next).day} um ${berlinAt(next).time}` : `um ${plan.hour}:00`;
    const unit = { tag: ["Tag", "Tage"], "3tage": ["Tag", "Tage"], woche: ["Woche", "Wochen"], monat: ["Monat", "Monate"] }[plan.every];
    const span = plan.every === "3tage" ? plan.keep * 3 : plan.keep;
    const kept = plan.keep === 1 ? "Es bleibt immer das letzte." : `Es bleiben immer die letzten ${plan.keep}, also etwa ${span} ${span === 1 ? unit[0] : unit[1]} zurück.`;

    return `Nächstes Backup ${when}. ${kept}`;
}

function kindBox(kind: Kind): HTMLElement {
    const box = el("span", `bk-kind ${KIND_TONE[kind]}`, icon(KIND_ICON[kind]));

    box.title = KIND_TEXT[kind];

    return box;
}

/** Marken „Bot“ und „Server“: was im Backup steckt. */
function marks(backup: IBackup): HTMLElement {
    return el("span", "bk-marks", ...backup.parts.map((part) => el("span", `bk-tag ${part}`, part === "bot" ? "Bot" : "Server")));
}

function line(backup: IBackup, extra: string[] = []): HTMLElement {
    const small = el("small", "");

    if (backup.note) small.append(el("span", "bk-note", `„${backup.note}“`), " · ");
    small.append([KIND_TEXT[backup.kind], ...(backup.byName ? [backup.byName] : []), ...extra].join(" · "));

    return el("div", "", el("b", "", WHEN.format(new Date(backup.createdAt))), small);
}

/** Eine Schalter-Zeile mit Marke „NEU“ (Plan 32). */
function newRow(label: string, hint: string, control: HTMLElement): HTMLElement {
    return el("div", "row", el("div", "row__text", el("b", "", label, el("span", "bk-new", "NEU")), el("i", "", hint)), control);
}

/** Zeilen der Unterschiede, nach Teil gruppiert: + neu, ~ zurück, − weg, = bleibt, ! geht nicht. */
function diffList(lines: readonly ILine[]): HTMLElement {
    const box = el("div", "bk-diff");
    const parts = [...new Set(lines.map((entry) => entry.part))];

    for (const part of parts) {
        box.append(el("p", "bk-group", LINE_PART[part] ?? part));

        for (const entry of lines.filter((item) => item.part === part)) {
            const tone = { "+": "add", "~": "change", "−": "gone", "=": "same", "!": "fail" }[entry.sign];

            box.append(el("div", `bk-diffline ${tone}`, el("span", "bk-sign", entry.sign), el("span", "", el("b", "", entry.text), namesOf(entry) ? `: ${namesOf(entry)}` : "")));
        }
    }

    if (lines.length === 0) box.append(el("p", "hintline", "Nichts anders als im Backup."));

    return box;
}

/** Fortschritt je Teil als Balken. */
function bars(job: IJob): HTMLElement {
    return el(
        "div",
        "bk-bars",
        ...job.progress.map(({ name, done, total }) => {
            const fill = el("i", "");

            fill.style.width = `${total ? Math.round((done / total) * 100) : 100}%`;

            return el("div", `bk-bar${done === total ? " done" : ""}`, el("span", "", name), el("span", "bk-bar__track", fill), el("small", "", `${done} / ${total}`));
        })
    );
}

/**
 * Jedes Mal frisch, wenn der Abschnitt wieder sichtbar wird: Was unter dem
 * anderen passiert ist (gelöscht, angelegt, zurückgeladen), soll hier stehen.
 * Guild.ts startet jeden Abschnitt nur einmal.
 */
function reloadWhenShown(host: HTMLElement, load: () => Promise<void>): void {
    const section = host.closest("section");
    if (!section) return;

    new MutationObserver(() => {
        if (!section.hidden) void load();
    }).observe(section, { attributes: true, attributeFilter: ["hidden"] });
}

/* ==================================================================
   Backups: Kennzahlen, Bereitschaft, sichern, automatisch, Meldekanal
   ================================================================== */

export function renderBackups(guildId: string): void {
    const host = need<HTMLElement>("#backupBody");
    const note = need<HTMLElement>("#backupNote");
    const call = api(base(guildId), note);

    let data: IPayload | null = null;

    function stats(): HTMLElement {
        const last = data!.backups[0] ?? null;
        const server = data!.server.counts;

        return el(
            "div",
            "tkhead",
            stat("#i-check", "Letztes Backup", last ? `${WHEN.format(new Date(last.createdAt))}, ${KIND_TEXT[last.kind]}` : "noch keins", last ? "is-ok" : ""),
            stat("#i-clock", "Nächstes", data!.plan.next ? `${berlinAt(data!.plan.next).day} ${berlinAt(data!.plan.next).time}` : "aus"),
            stat("#i-plus", "Von Hand", `${data!.hand.used} von ${data!.hand.max}`, data!.hand.used >= data!.hand.max ? "is-warn" : ""),
            stat("#i-layout", "Discord-Server", `${numbers.format(server.roles)} Rollen · ${numbers.format(server.channels)} Kanäle`)
        );
    }

    /** Was dem Bot zum Laden des Servers fehlt, mit Rollennamen. */
    function readiness(): HTMLElement | null {
        const { aboveBot, missing, intent } = data!.server.readiness;
        const sentences: string[] = [];

        if (aboveBot.length) {
            sentences.push(
                `${aboveBot.length === 1 ? "1 Rolle kann" : `${aboveBot.length} Rollen kann`} der Bot nicht zurückladen: ${quoted(aboveBot.slice(0, 5))}${aboveBot.length > 5 ? " und weitere" : ""} ${aboveBot.length === 1 ? "steht" : "stehen"} in der Rollenliste über ihm. Schieb die Rolle des Bots in den Server-Einstellungen ganz nach oben, dann geht alles.`
            );
        }
        if (missing.length) sentences.push(`Dem Bot fehlen Rechte: ${missing.join(", ")}.`);
        if (!intent) sentences.push("Wer welche Rolle hat, sichert der Bot gerade nicht: Ihm fehlt der Zugriff auf die Mitgliederliste.");

        return sentences.length ? el("div", "notice bk-fail", icon("#i-warn"), el("span", "", sentences.join(" "))) : null;
    }

    function failure(): HTMLElement | null {
        const failed = data!.plan.lastError;
        if (!failed) return null;

        return el(
            "div",
            "notice bk-fail",
            icon("#i-warn"),
            el("span", "", `Das automatische Backup vom ${WHEN.format(new Date(failed.at))} hat nicht geklappt: ${failed.reason.replace(/\.$/, "")}. Der Bot versucht es zur nächsten vollen Stunde wieder.`)
        );
    }

    function now(): HTMLElement {
        const full = data!.hand.used >= data!.hand.max;
        const parts = new Set<Part>(["bot", "server"]);
        const input = el("input", "text");
        const go = button("btn btn--primary", icon("#i-plus"), "Backup anlegen");
        const bar = el("i", "");
        const ready = (): void => {
            go.disabled = full || parts.size === 0;
        };
        const part = (value: Part, on: boolean): void => {
            if (on) parts.add(value);
            else parts.delete(value);
            ready();
        };

        input.type = "text";
        input.maxLength = 200;
        input.placeholder = "vor dem Umbau der Rollen";
        input.setAttribute("aria-label", "Notiz, freiwillig");
        bar.style.width = `${Math.min(100, (data!.hand.used / data!.hand.max) * 100)}%`;
        ready();

        go.addEventListener("click", async () => {
            go.disabled = true;
            go.lastChild!.textContent = parts.has("server") ? "Liest den Server …" : "Backup anlegen";
            clickSound("primary");

            const created = await call<IBackup>("", { action: "create", note: input.value.trim() || null, parts: [...parts] });

            go.lastChild!.textContent = "Backup anlegen";

            if (created) {
                toast("info", "Backup angelegt", "Es steht unter „Meine Backups“ und bleibt, bis du es löschst.");
                await load();
            } else {
                ready();
            }
        });

        return card(
            "Jetzt sichern",
            full ? `Alle ${data!.hand.max} Plätze sind belegt. Lösch unter „Meine Backups“ erst ein altes Backup.` : "Am besten vor größeren Umbauten. Ein Backup von Hand bleibt, bis du es löschst.",
            el("p", "bk-group", "Was gesichert wird"),
            row("Bot", "Module, Level, Tickets, Bewerbungen und alles andere, was der Bot speichert", toggle(true, "Bot sichern", (on) => part("bot", on))),
            newRow("Discord-Server", "Rollen, Kanäle, Rechte, wer welche Rolle hat, Emojis, Bans und die Servereinstellungen", toggle(true, "Discord-Server sichern", (on) => part("server", on))),
            el("div", "bk-now", el("label", "", "Notiz, freiwillig", input), go),
            el("div", "bk-quota", el("span", "", `${data!.hand.used} von ${data!.hand.max} Plätzen belegt`), el("span", "bk-quota__bar", bar))
        );
    }

    function recent(): HTMLElement {
        const list = el("div", "bk-list");
        const more = el("a", "bk-more", `Alle ${data!.backups.length} Backups ansehen und zurückladen`, icon("#i-arrow"));

        for (const backup of data!.backups.slice(0, 2)) list.append(el("div", "bk-item", kindBox(backup.kind), line(backup), marks(backup)));
        if (data!.backups.length === 0) list.append(el("p", "hintline", "Noch kein Backup. Leg oben eins an oder schalte die automatischen ein."));

        // Wie ein Klick in der Leiste: dieselbe Adresse, ohne die Seite neu zu laden.
        more.href = `${BASE}/guild/${encodeURIComponent(guildId)}/meine-backups`;
        more.addEventListener("click", (event) => {
            const nav = maybe<HTMLAnchorElement>('a[data-section="meine-backups"]');
            if (!nav) return;

            event.preventDefault();
            nav.click();
        });

        return card("Zuletzt gesichert", "", list, more);
    }

    function automatic(): HTMLElement {
        const state = data!.plan;
        const plan = { ...state.plan };
        const sentence = el("span", "", planText(state));
        const days = el("div", "bk-days");
        let saves = 0;

        days.setAttribute("role", "group");
        days.setAttribute("aria-label", "Wochentag");

        async function save(): Promise<void> {
            const mine = ++saves;
            const saved = await call<IPlanState>("", { action: "plan", plan });

            // Zwei schnelle Änderungen: Die ältere Antwort zeigte kurz einen überholten Stand (W-0023).
            if (mine !== saves) return;

            // Nicht gespeichert: die Regler zurück auf das, was gilt.
            if (!saved) {
                box.replaceWith(automatic());
                return;
            }

            data!.plan = saved;
            sentence.textContent = planText(saved);
            host.querySelector(".tkhead")?.replaceWith(stats());
        }

        function drawDays(): void {
            days.replaceChildren(
                ...WEEKDAYS.map((label, index) => {
                    const day = button(`bk-day${plan.weekday === index ? " is-on" : ""}`, label);

                    day.setAttribute("aria-pressed", String(plan.weekday === index));
                    day.addEventListener("click", () => {
                        plan.weekday = index;
                        drawDays();
                        void save();
                    });

                    return day;
                })
            );
        }

        const dayRow = row("An welchem Tag", "", days);
        const show = (): void => {
            dayRow.hidden = plan.every !== "woche";
        };

        drawDays();
        show();

        const box = card(
            "Automatisch sichern",
            "Der Bot sichert von selbst und löscht die ältesten, sobald mehr da sind als eingestellt.",
            row(
                "Automatische Backups",
                "Gelten nur für diesen Server.",
                toggle(plan.enabled, "Automatische Backups", (on) => {
                    plan.enabled = on;
                    void save();
                })
            ),
            row(
                "Wie oft",
                "",
                select(
                    EVERY,
                    plan.every,
                    (value) => {
                        plan.every = value as Every;
                        show();
                        void save();
                    },
                    "Wie oft"
                )
            ),
            dayRow,
            row(
                "Uhrzeit",
                "Am besten, wenn wenig los ist.",
                select(
                    Array.from({ length: 24 }, (_, hour): [string, string] => [String(hour), `${hour}:00`]),
                    String(plan.hour),
                    (value) => {
                        plan.hour = Number(value);
                        void save();
                    },
                    "Uhrzeit"
                )
            ),
            row(
                "Wie viele behalten",
                `1 bis ${KEEP_MAX}`,
                select(
                    Array.from({ length: KEEP_MAX }, (_, index): [string, string] => [String(index + 1), String(index + 1)]),
                    String(plan.keep),
                    (value) => {
                        plan.keep = Number(value);
                        void save();
                    },
                    "Wie viele behalten"
                )
            ),
            newRow(
                "Auch den Discord-Server",
                "Rollen, Kanäle und Rechte gleich mit",
                toggle(plan.discord, "Auch den Discord-Server", (on) => {
                    plan.discord = on;
                    void save();
                })
            ),
            newRow(
                "Vor riskanten Änderungen",
                `Löscht jemand mehrere Kanäle oder Rollen, sichert der Bot vorher den Stand. Arbeitet mit Anti Villain zusammen${data!.server.antiVillain ? "" : ". Braucht Anti Villain, das gerade aus ist"}`,
                toggle(plan.risky, "Vor riskanten Änderungen", (on) => {
                    plan.risky = on;
                    void save();
                })
            ),
            el("div", "bk-next", icon("#i-clock"), sentence)
        );

        return box;
    }

    function messages(): HTMLElement {
        const channels = data!.server.channels;
        const current = data!.server.settings.logChannelId ?? "";

        return card(
            "Meldungen",
            "Hier schreibt der Bot, wenn ein Laden läuft und fertig ist, wenn ein automatisches Backup nur halb klappte und wenn Anti Villain vorher gesichert hat.",
            row(
                "Meldekanal",
                "Ab Werk keiner.",
                select(
                    [["", "Keiner"], ...channels.map((channel): [string, string] => [channel.id, `#${channel.name}`])],
                    channels.some((channel) => channel.id === current) ? current : "",
                    async (value) => {
                        const saved = await call<{ settings: { logChannelId: string | null } }>("", { action: "settings", logChannelId: value || null });

                        if (saved) {
                            data!.server.settings = saved.settings;
                            toast("info", "Gespeichert", saved.settings.logChannelId ? "Meldungen gehen jetzt in diesen Kanal." : "Der Bot meldet sich nur noch hier im Dashboard.");
                        }
                    },
                    "Meldekanal"
                )
            )
        );
    }

    function draw(): void {
        const notices = [readiness(), failure()].filter((entry): entry is HTMLElement => entry !== null);

        host.replaceChildren(stats(), ...notices, el("div", "bk-grid", el("div", "bk-col", now(), recent()), el("div", "bk-col", automatic(), messages())));
    }

    async function load(): Promise<void> {
        const answer = await call<IPayload>("");

        if (!answer) {
            host.replaceChildren();
            return;
        }

        data = answer;
        draw();
    }

    loading(host);
    void load();
    reloadWhenShown(host, load);
}

/* ==================================================================
   Meine Backups: links die Liste, rechts das gewählte, Laden in vier Schritten
   ================================================================== */

export function renderBackupList(guildId: string): void {
    const host = need<HTMLElement>("#backupListBody");
    const note = need<HTMLElement>("#backupListNote");
    const call = api(base(guildId), note);

    let data: IPayload | null = null;
    let filter: "alle" | "hand" | "auto" | "safe" = "alle";
    let selected: number | null = Number(new URLSearchParams(location.search).get("backup")) || null;
    let pane: "detail" | "restore" = "detail";
    let tab: "server" | "bot" = "server";
    let olderOpen = false;
    /** Ein Laden, dem die Seite gerade folgt. */
    let following: number | null = null;
    /** Was in einem Backup steckt - es ändert sich nicht, also einmal geholt. */
    const details = new Map<number, Promise<IDetail | null>>();
    const views = new Map<number, Promise<IServerView | null>>();

    function viewOf(id: number): Promise<IServerView | null> {
        let found = views.get(id);

        if (!found) {
            found = call<IServerView>(`?backup=${id}&server=1`);
            views.set(id, found);
            void found.then((view) => {
                if (!view) views.delete(id);
            });
        }

        return found;
    }

    function groupOf(backup: IBackup): string {
        const start = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const days = Math.round((start(new Date()) - start(new Date(backup.createdAt))) / 86_400_000);

        return days <= 0 ? "Heute" : days === 1 ? "Gestern" : days < 7 ? "Diese Woche" : "Älter";
    }

    function fits(backup: IBackup, value: typeof filter): boolean {
        if (value === "hand") return backup.kind === "hand";
        if (value === "auto") return backup.kind === "plan" || backup.kind === "nacht";
        if (value === "safe") return backup.kind === "vorher" || backup.kind === "schutz";

        return true;
    }

    function shown(): IBackup[] {
        return data!.backups.filter((backup) => fits(backup, filter));
    }

    function side(): HTMLElement {
        const count = (value: typeof filter): number => data!.backups.filter((backup) => fits(backup, value)).length;
        const bar = el("div", "bk-filter");

        for (const [value, label] of [
            ["alle", "Alle"],
            ["hand", "Von Hand"],
            ["auto", "Automatisch"],
            ["safe", "Sicherheit"],
        ] as ["alle" | "hand" | "auto" | "safe", string][]) {
            const tab = button(filter === value ? "is-on" : "", `${label} `, el("small", "", String(count(value))));

            tab.setAttribute("aria-pressed", String(filter === value));
            tab.addEventListener("click", () => {
                filter = value;
                draw();
            });
            bar.append(tab);
        }

        const list = el("div", "bk-side__list");
        const groups = new Map<string, IBackup[]>();

        for (const backup of shown()) groups.set(groupOf(backup), [...(groups.get(groupOf(backup)) ?? []), backup]);

        for (const [label, backups] of groups) {
            const older = label === "Älter";
            const visible = older && !olderOpen ? backups.slice(0, 3) : backups;

            list.append(el("p", "bk-group", label));

            for (const backup of visible) {
                const at = new Date(backup.createdAt);
                const when = label === "Heute" || label === "Gestern" ? TIME.format(at) : `${WEEKDAY.format(at)} · ${TIME.format(at)}`;
                const what = backup.kind === "hand" && backup.note ? `„${backup.note}“` : KIND_TEXT[backup.kind];
                const sub = backup.kind === "hand" && backup.byName ? `von ${backup.byName}` : backup.kind === "vorher" ? `verfällt in ${duration(Date.parse(backup.createdAt) + 72 * 3_600_000 - Date.now())}` : backup.kind === "schutz" ? "bleibt 7 Tage" : kilobytes(backup.bytes);
                const pick = button(`bk-pick${selected === backup.id ? " is-on" : ""}`, kindBox(backup.kind), el("span", "", el("b", "", `${when} · ${what}`), el("small", "", sub)), marks(backup));

                pick.setAttribute("aria-pressed", String(selected === backup.id));
                pick.addEventListener("click", () => {
                    selected = backup.id;
                    pane = "detail";
                    tab = backup.parts.includes("server") ? "server" : "bot";
                    draw();
                });
                list.append(pick);
            }

            if (older && !olderOpen && backups.length > 3) {
                const more = button("bk-more", `${backups.length - 3} ältere zeigen`);

                more.addEventListener("click", () => {
                    olderOpen = true;
                    draw();
                });
                list.append(more);
            }
        }

        if (shown().length === 0) list.append(el("p", "hintline", data!.backups.length === 0 ? "Noch kein Backup. Unter „Backups“ legst du eins an." : "Davon gibt es gerade keins."));

        return el("div", "bk-side", bar, el("div", "bk-quota", el("span", "", `Von Hand ${data!.hand.used} / ${data!.hand.max}`)), list);
    }

    function fact(value: number | null, label: string): HTMLElement {
        return el("div", "bk-fact", el("b", "", value === null ? "–" : numbers.format(value)), el("small", "", label));
    }

    /** Das gewählte Backup: Kennzahlen, Knöpfe, „Seitdem geändert“, Reiter Discord-Server und Bot. */
    function detail(backup: IBackup): HTMLElement {
        const box = el("div", "bk-pane");
        const server = backup.parts.includes("server");
        const areas = Object.keys(backup.counts).filter((key) => (backup.counts[key] ?? 0) > 0).length;
        const restore = button("btn btn--primary", icon("#i-refresh"), "Zurückladen");
        const compare = button("btn btn--quiet", icon("#i-eye"), "Mit jetzt vergleichen");
        const acts = el("div", "bk-acts", restore);
        const changed = el("div", "bk-changed");
        const body = el("div", "bk-tabbody");

        restore.addEventListener("click", () => {
            pane = "restore";
            draw();
        });

        if (server) {
            acts.append(compare);
            compare.addEventListener("click", () => {
                changed.scrollIntoView({ behavior: "smooth", block: "nearest" });
                changed.classList.add("is-lit");
            });
        }

        if (backup.kind === "hand") {
            acts.append(
                confirmButton("btn btn--ghost btn--icon is-danger", "#i-trash", "", "Wirklich löschen?", async () => {
                    const done = await call<{ ok: true }>("", { action: "delete", backup: backup.id });

                    if (done) {
                        selected = null;
                        await load();
                    }
                })
            );
        }

        const tabs = el("div", "bk-filter bk-tabs");

        for (const [value, label] of [
            ["server", "Discord-Server"],
            ["bot", "Bot"],
        ] as ["server" | "bot", string][]) {
            if (value === "server" && !server) continue;
            if (value === "bot" && !backup.parts.includes("bot")) continue;

            const tabButton = button(tab === value ? "is-on" : "", label);

            tabButton.setAttribute("aria-pressed", String(tab === value));
            tabButton.addEventListener("click", () => {
                tab = value;
                draw();
            });
            tabs.append(tabButton);
        }

        box.append(
            el("small", "bk-eyebrow", `${KIND_GROUP[backup.kind]} · ${WHEN.format(new Date(backup.createdAt))}`),
            el("h4", "bk-title", titleOf(backup)),
            el("p", "hintline", aboutOf(backup)),
            el("div", "bk-facts", fact(backup.server?.channels ?? null, "Kanäle"), fact(backup.server?.roles ?? null, "Rollen"), fact(backup.server?.members ?? null, "Mitglieder mit Rollen"), fact(backup.parts.includes("bot") ? areas : null, "Bereiche im Bot")),
            acts
        );

        if (server) {
            changed.append(el("p", "bk-group", "Seitdem geändert"), el("p", "hintline", "Wird verglichen …"));
            box.append(changed);
            void viewOf(backup.id).then((view) => {
                changed.replaceChildren(el("p", "bk-group", "Seitdem geändert"), view ? diffList(view.changed) : el("p", "hintline", "Gerade nicht vergleichbar."));
            });
        }

        box.append(tabs, body);

        if (tab === "server" && server) {
            body.append(el("p", "hintline", "Wird geladen …"));
            void viewOf(backup.id).then((view) => body.replaceChildren(view ? tree(view) : el("p", "hintline", "Den Discord-Server im Backup gibt es gerade nicht zu sehen.")));
        } else {
            body.append(botView(backup));
        }

        return box;
    }

    /** Kanäle nach Kategorien und die Rollen; was jetzt fehlt, durchgestrichen. */
    function tree(view: IServerView): HTMLElement {
        const missing = new Set(view.missing);
        const channels = [...view.server.channels].sort((a, b) => a.position - b.position);
        const categories = channels.filter((channel) => channel.type === 4);
        const entry = (id: string, name: string, className = ""): HTMLElement => {
            const who = view.deletedBy[id];
            const item = el("li", `${className}${missing.has(id) ? " bk-gone" : ""}`, el("span", "", name));

            if (missing.has(id)) item.append(el("small", "", who ? `fehlt jetzt · gelöscht von ${who.name}, ${TIME.format(new Date(who.at))}` : "fehlt jetzt"));

            return item;
        };
        const list = el("ul", "bk-tree");
        let shownCount = 0;
        const limit = 40;
        const add = (node: HTMLElement): void => {
            if (shownCount++ < limit) list.append(node);
        };

        for (const channel of channels.filter((item) => item.type !== 4 && !item.parentId)) add(entry(channel.id, `#${channel.name}`));
        for (const category of categories) {
            add(entry(category.id, category.name.toUpperCase(), "bk-cat"));
            for (const channel of channels.filter((item) => item.parentId === category.id)) add(entry(channel.id, `#${channel.name}`, "bk-sub"));
        }
        if (shownCount > limit) list.append(el("li", "hintline", `und ${shownCount - limit} weitere`));

        const roles = [...view.server.roles].filter((role) => !role.everyone).sort((a, b) => b.position - a.position);
        const roleList = el("ul", "bk-tree", ...roles.slice(0, 20).map((role) => entry(role.id, `@${role.name}`)));

        if (roles.length > 20) roleList.append(el("li", "hintline", `und ${roles.length - 20} weitere`));

        return el("div", "bk-treebox", el("div", "", el("p", "bk-group", "Kanäle"), list), el("div", "", el("p", "bk-group", "Rollen"), roleList));
    }

    /** Was im Backup steckt, je Bereich. Die Tabellen im Einzelnen holt ein eigener Aufruf. */
    function botView(backup: IBackup): HTMLElement {
        const box = el("div", "bk-detail");
        const list = el("ul", "bk-counts");

        for (const area of AREAS) list.append(el("li", "", el("span", "", area.label), el("b", "", numbers.format(backup.counts[area.id] ?? 0))));
        box.append(list);

        // Einmal je Backup holen, nicht bei jedem Neuzeichnen - sonst greift das Rate Limit (W-0023).
        let found = details.get(backup.id);

        if (!found) {
            found = call<IDetail>(`?backup=${backup.id}`);
            details.set(backup.id, found);
        }

        void found.then((detailed) => {
            if (!detailed) {
                details.delete(backup.id);
                return;
            }

            const tables = Object.entries(detailed.tables).filter(([, rows]) => rows > 0);
            box.append(el("p", "hintline", tables.length ? `Tabellen: ${tables.map(([table, rows]) => `${table} ${numbers.format(rows)}`).join(" · ")}` : "Keine Bot-Daten im Backup."));
        });

        return box;
    }

    /** Ein Feld für den Servernamen, mit Knopf, der erst bei passendem Namen geht. */
    function nameField(expected: string, label: string, run: (confirm: string) => Promise<void>, ...extra: HTMLElement[]): HTMLElement {
        const input = el("input", "text");
        const go = button("btn btn--primary", icon("#i-refresh"), label);
        const matches = (): boolean => input.value.trim().toLowerCase() === expected.trim().toLowerCase();

        input.type = "text";
        input.autocomplete = "off";
        input.setAttribute("aria-label", "Name des Servers");
        go.disabled = true;
        input.addEventListener("input", () => {
            go.disabled = !matches();
        });
        go.addEventListener("click", async () => {
            go.disabled = true;
            clickSound("primary");
            await run(input.value);
            go.disabled = !matches();
        });

        return el("div", "", el("label", "bk-confirm", "Zum Bestätigen den Namen des Servers eintippen", input, el("small", "", `„${expected}“, Groß- und Kleinschreibung egal.`)), el("div", "bk-sum", ...extra, go));
    }

    /** Schritt 4: der Fortschritt eines Ladens, alle 2 Sekunden neu, bis es fertig ist. */
    function follow(panel: HTMLElement, jobId: number): void {
        following = jobId;

        // Vorgelesen wird nur diese Zeile, und nur wenn sich Phase oder ein Zehntel ändert - nicht alle 2 s der ganze Bereich (W-0041 M13).
        const status = el("p", "bk-status", "");
        let said = "";

        if (panel.nextElementSibling?.classList.contains("bk-status")) panel.nextElementSibling.remove();

        status.setAttribute("role", "status");
        panel.after(status);

        const tick = async (): Promise<void> => {
            if (following !== jobId || !panel.isConnected) return;

            const answer = await call<{ job: IJob }>("", { action: "job", job: jobId });

            if (following !== jobId || !panel.isConnected) return;

            // Ein Aussetzer (Netz, Rate Limit) beendet das Mitlesen nicht: etwas später noch einmal.
            if (!answer) {
                window.setTimeout(() => void tick(), POLL_MS * 2);
                return;
            }

            const job = answer.job;

            // Auch die Liste soll wissen, wie es steht: sonst zeigte ein Klick links wieder „läuft“.
            if (data?.job?.id === jobId) data.job = job;
            panel.replaceChildren(...progressView(panel, job));

            const line =
                job.status === "running"
                    ? `Laden läuft: ${PHASE[job.phase]}, ${job.total ? Math.floor((job.done / job.total) * 10) * 10 : 100} Prozent.`
                    : job.status === "cancelled"
                      ? `Laden abgebrochen nach ${job.done} von ${job.total} Schritten.`
                      : `Laden fertig.${job.failed.length ? ` ${job.failed.length} Schritte gingen nicht.` : ""}`;

            if (line !== said) status.textContent = said = line;
            if (job.status === "running") window.setTimeout(() => void tick(), POLL_MS);
            else following = null;
        };

        void tick();
    }

    function progressView(panel: HTMLElement, job: IJob): HTMLElement[] {
        const running = job.status === "running";

        if (running) {
            const cancel = button("btn btn--quiet", "Abbrechen");

            cancel.addEventListener("click", async () => {
                cancel.disabled = true;

                // Nach den Schritten am Server lässt sich nichts mehr anhalten (Review M6).
                const answer = await call<{ ok: boolean }>("", { action: "cancel" });

                if (answer && !answer.ok) toast("info", "Nicht mehr abzubrechen", "Die Schritte am Server sind durch, der Bot räumt nur noch auf.");
            });

            return [
                el("p", "bk-group", `Schritt 4 · läuft · ${PHASE[job.phase]}`),
                bars(job),
                el("p", "hintline", `${job.done} von ${job.total} Schritten. Du kannst die Seite schließen. Der Bot macht weiter${data?.server.settings.logChannelId ? " und meldet sich im Meldekanal, wenn er fertig ist" : ""}.`),
                el("div", "bk-sum", cancel),
            ];
        }

        const report = job.report;
        const done = (report?.lines ?? []).filter((entry) => entry.sign === "+" || entry.sign === "~" || entry.sign === "−");
        const problems = [...job.failed.map((entry) => entry.reason), ...(report?.problems ?? []), ...(report?.lines ?? []).filter((entry) => entry.sign === "!").map((entry) => entry.text)];
        const bot = [report?.remapped ? `${numbers.format(report.remapped)} Einträge im Bot angepasst` : "", report?.reposted.length ? `${report.reposted.length} Panels neu gepostet` : "", report?.redrawn.length ? `${report.redrawn.length} neu gezeichnet` : ""].filter(Boolean);
        const close = button("btn btn--primary", "Fertig");
        const out: HTMLElement[] = [
            el("p", "bk-group", job.status === "cancelled" ? `Abgebrochen nach ${job.done} von ${job.total}` : "Fertig"),
            el("ul", "bk-done", ...done.map((entry) => el("li", "", `✅ ${entry.text}${namesOf(entry) ? `: ${namesOf(entry)}` : ""}`)), ...(bot.length ? [el("li", "", `✅ ${bot.join(", ")}`)] : [])),
        ];

        if (problems.length) out.push(el("p", "bk-group", "Ging nicht"), el("ul", "bk-done is-fail", ...problems.slice(0, 20).map((problem) => el("li", "", problem))));

        close.addEventListener("click", async () => {
            pane = "detail";
            await load();
        });

        if (job.undo) {
            const undo = button("btn btn--quiet", icon("#i-refresh"), "Rückgängig machen");
            const slot = el("div", "");

            undo.addEventListener("click", async () => {
                undo.hidden = true;
                slot.replaceChildren(el("p", "hintline", "Der Bot vergleicht mit dem Stand von davor …"));

                // Rückgängig lädt „vorher“ genau wie im Backup: erst zeigen, was dabei verschwindet (Review I6).
                const preview = await call<{ plan: IPreview }>("", { action: "preview", backup: job.safetyId, mode: "exact", parts: job.parts });

                if (!preview) {
                    undo.hidden = false;
                    slot.replaceChildren();
                    return;
                }

                const field = nameField(data!.backups.find((backup) => backup.id === job.safetyId)?.guildName ?? data!.backups[0]?.guildName ?? "", "Rückgängig machen", async (confirm) => {
                    const answer = await call<{ job: IJob }>("", { action: "undo", job: job.id, confirm });

                    if (answer) follow(panel, answer.job.id);
                });
                const blocks: HTMLElement[] = [el("p", "hintline", "Lädt den Stand von davor mit „Genau wie im Backup“."), diffList(preview.plan.lines)];

                if (preview.plan.deletes.length) {
                    field.hidden = true;
                    blocks.push(
                        el("div", "notice bk-fail", icon("#i-warn"), el("span", "", el("b", "", "Das verschwindet: "), preview.plan.deletes.join(", "))),
                        row(
                            "Ja, das darf verschwinden",
                            "Auch was seit dem Laden neu dazukam.",
                            toggle(false, "Ja, das darf verschwinden", (on) => {
                                field.hidden = !on;
                            })
                        )
                    );
                }

                slot.replaceChildren(...blocks, field);
            });
            out.push(el("p", "hintline", "Der Stand davor liegt als Sicherheits-Backup bereit."), slot, el("div", "bk-sum", undo, close));
        } else {
            out.push(el("div", "bk-sum", close));
        }

        return out;
    }

    /** Zurückladen in vier Schritten. Schritt 1 ist das Backup, auf das geklickt wurde. */
    function restore(backup: IBackup): HTMLElement {
        const panel = el("div", "bk-restore");
        const hasServer = backup.parts.includes("server");
        const hasBot = backup.parts.includes("bot");
        const parts = new Set<ServerPart>(hasServer ? SERVER_PARTS.map((part) => part.id).filter((id) => id !== "members" || backup.server?.members !== null) : []);
        // Mit Discord-Server geht es meist um den Server: Bot-Bereiche dann erst auf Wunsch.
        const areas = new Set(hasServer ? [] : AREAS.filter((area) => !area.members && (backup.counts[area.id] ?? 0) > 0).map((area) => area.id));
        let mode: Mode = "repair";
        let targets: { id: string; name: string }[] | null = null;
        let target: { id: string; name: string } | null = null;
        let step: 2 | 3 | 4 = 2;

        function steps(): HTMLElement {
            const entries: [number, string][] = [
                [1, `Backup: ${WHEN.format(new Date(backup.createdAt))}`],
                [2, "Was zurückkommt"],
                [3, "Unterschiede"],
                [4, "Los"],
            ];

            return el("div", "bk-steps", ...entries.map(([value, label]) => el("div", `bk-step${value < step ? " done" : value === step ? " now" : ""}`, el("span", "", `Schritt ${value}`), el("b", "", label))));
        }

        function cancelButton(): HTMLButtonElement {
            const cancel = button("btn btn--quiet", "Abbrechen");

            cancel.addEventListener("click", () => {
                pane = "detail";
                draw();
            });

            return cancel;
        }

        function tile(label: string, text: string, on: boolean, change: (value: boolean) => void, warn = ""): HTMLElement {
            const box = el("label", `bk-area${on ? " is-on" : ""}`);

            box.append(el("span", "bk-area__top", el("b", "", label), toggle(on, label, change)), el("small", "", text));
            if (warn) box.append(el("small", "loss", warn));

            return box;
        }

        function draw2(): void {
            step = 2;

            const other = mode === "other";
            const next = button("btn btn--primary", "Weiter zu Schritt 3", icon("#i-arrow"));
            const blocks: HTMLElement[] = [steps()];

            if (hasServer) {
                const visible = SERVER_PARTS.filter((part) => !other || (part.id !== "members" && part.id !== "bans"));

                blocks.push(
                    el("p", "bk-group", "Discord-Server"),
                    el(
                        "div",
                        "bk-areas",
                        ...visible.map((part) =>
                            tile(part.label, part.text(backup.server), parts.has(part.id), (value) => {
                                if (value) parts.add(part.id);
                                else parts.delete(part.id);
                                draw2();
                            })
                        )
                    ),
                    el("p", "bk-group", "Wie zurückladen"),
                    radioTiles(MODES, mode, "Wie zurückladen", (value) => {
                        mode = value;
                        if (mode === "other" && targets === null) void loadTargets();
                        draw2();
                    })
                );

                if (other) {
                    const picker =
                        targets === null
                            ? el("p", "hintline", "Server werden geladen …")
                            : targets.length === 0
                              ? el("p", "hintline", "Du verwaltest keinen anderen Server, auf dem der Bot ist.")
                              : select(
                                    [["", "Server wählen"], ...targets.map((entry): [string, string] => [entry.id, entry.name])],
                                    target?.id ?? "",
                                    (value) => {
                                        target = targets?.find((entry) => entry.id === value) ?? null;
                                        draw2();
                                    },
                                    "Anderer Server"
                                );

                    blocks.push(row("Auf welchen Server", "Ohne Rollen der Mitglieder, ohne Bans, ohne Bot-Daten. Es wird nichts gelöscht.", picker));
                }
            }

            if (hasBot && !other) {
                const area = (entry: (typeof AREAS)[number]): HTMLElement => {
                    const count = backup.counts[entry.id] ?? 0;

                    return tile(
                        entry.label,
                        count === 0 ? "Im Backup leer: zurückladen löscht, was jetzt da ist." : `${numbers.format(count)} Einträge`,
                        areas.has(entry.id),
                        (value) => {
                            if (value) areas.add(entry.id);
                            else areas.delete(entry.id);
                            draw2();
                        },
                        // duration() endet auf „Std.“ oder „Min.“: kein Punkt dahinter.
                        entry.members && areas.has(entry.id) ? `Was seit ${DAY.format(new Date(backup.createdAt))} dazukam, ist danach weg: ${duration(Date.now() - Date.parse(backup.createdAt))}` : ""
                    );
                };

                blocks.push(
                    el("p", "bk-group", "Bot: Einstellungen und Inhalte"),
                    el("div", "bk-areas", ...AREAS.filter((entry) => !entry.members).map(area)),
                    el("p", "bk-group", "Bot: Daten der Mitglieder"),
                    el("div", "bk-areas", ...AREAS.filter((entry) => entry.members).map(area))
                );
            }

            next.disabled = (parts.size === 0 && (other || areas.size === 0)) || (other && target === null);
            next.addEventListener("click", () => void draw3());
            blocks.push(el("div", "bk-sum", el("p", "", "Vorher sichert der Bot den jetzigen Stand, du kannst also jederzeit zurück."), cancelButton(), next));

            panel.replaceChildren(...blocks);
        }

        async function loadTargets(): Promise<void> {
            const answer = await call<{ targets: { id: string; name: string }[] }>("", { action: "targets" });

            targets = answer?.targets ?? [];
            if (step === 2 && panel.isConnected) draw2();
        }

        async function draw3(): Promise<void> {
            step = 3;

            const back = button("btn btn--quiet", "Zurück");
            const expected = mode === "other" ? (target?.name ?? "") : backup.guildName;
            const blocks: HTMLElement[] = [steps()];
            const server = parts.size > 0;

            back.addEventListener("click", draw2);
            panel.replaceChildren(steps(), el("p", "hintline", server ? "Der Bot vergleicht mit dem Server, wie er jetzt ist …" : "Wird vorbereitet …"));

            let sure = true;

            if (server) {
                const answer = await call<{ plan: IPreview }>("", { action: "preview", backup: backup.id, mode, parts: [...parts], areas: [...areas], ...(target ? { target: target.id } : {}) });

                if (!answer) {
                    draw2();
                    return;
                }

                const preview = answer.plan;

                blocks.push(el("p", "bk-group", "Schritt 3 · Unterschiede zu jetzt"), diffList(preview.lines));
                if (areas.size) blocks.push(el("p", "hintline", `Dazu kommen ${areas.size === 1 ? "ein Bereich" : `${areas.size} Bereiche`} des Bots zurück: ${AREAS.filter((entry) => areas.has(entry.id)).map((entry) => entry.label).join(", ")}.`));
                blocks.push(el("p", "hintline", `Dauert etwa ${Math.max(1, Math.round(preview.estimateMs / 60_000))} Minuten. Discord lässt Kanäle und Rollen nur nach und nach anlegen. Vorher sichert der Bot den jetzigen Stand, du kannst also jederzeit zurück.`));

                if (mode === "exact" && preview.deletes.length) {
                    sure = false;

                    const check = toggle(false, "Ja, das darf verschwinden", (on) => {
                        sure = on;
                        field.hidden = !on;
                        backOnly.hidden = on;
                    });

                    blocks.push(el("div", "notice bk-fail", icon("#i-warn"), el("span", "", el("b", "", "Das verschwindet: "), preview.deletes.join(", "))), row("Ja, das darf verschwinden", "„Genau wie im Backup“ fragt hier ein zweites Mal.", check));
                }
            } else {
                blocks.push(
                    el("p", "bk-group", "Diese Bereiche kommen zurück"),
                    el("ul", "bk-counts", ...AREAS.filter((entry) => areas.has(entry.id)).map((entry) => el("li", "", el("span", "", entry.label), el("b", "", numbers.format(backup.counts[entry.id] ?? 0))))),
                    el("p", "hintline", "Alles andere bleibt, wie es ist. Vorher sichert der Bot den jetzigen Stand als eigenes Backup. Fehlende Panels postet er danach neu.")
                );
            }

            const field = nameField(expected, mode === "exact" ? "Laden" : mode === "other" ? "Aufbauen" : "Zurückladen", async (confirm) => {
                if (!server) {
                    const result = await call<IResult>("", { action: "restore", backup: backup.id, areas: [...areas], confirm });

                    if (result) botDone(result);
                    return;
                }

                const answer = await call<{ job: IJob }>("", { action: "restore-server", backup: backup.id, mode, parts: [...parts], areas: [...areas], confirm, ...(target ? { target: target.id } : {}) });

                if (answer) {
                    step = 4;
                    panel.replaceChildren(steps());
                    follow(panel, answer.job.id);
                }
            }, back);

            // „Genau“: Erst wer bestätigt, dass es verschwinden darf, sieht das Namensfeld. Zurück geht immer.
            const backOnly = el("div", "bk-sum", back.cloneNode(true) as HTMLElement);

            backOnly.firstElementChild!.addEventListener("click", draw2);
            field.hidden = !sure;
            backOnly.hidden = sure;
            blocks.push(field, backOnly);
            panel.replaceChildren(...blocks);
        }

        function botDone(result: IResult): void {
            const report = result.bot;
            const lines = [...(report.reposted.length ? [`Neu gepostet: ${report.reposted.join(", ")}`] : []), ...(report.removed.length ? [`Gelöscht: ${report.removed.join(", ")}`] : []), ...report.problems.map((problem) => `Problem: ${problem}`)];
            const close = button("btn btn--primary", "Fertig");

            close.addEventListener("click", async () => {
                pane = "detail";
                await load();
            });

            panel.replaceChildren(
                el("p", "bk-group", "Zurückgeladen"),
                el("ul", "bk-counts", ...result.areas.map((entry) => el("li", "", el("span", "", AREAS.find((area) => area.id === entry.area)?.label ?? entry.area), el("b", "", `${numbers.format(entry.rows)} Einträge`)))),
                el("p", "hintline", report.reached && lines.length === 0 ? "Alle Panels waren an ihrem Platz." : lines.join(" · ")),
                el("p", "hintline", "Der Stand davor liegt als Backup bereit. Damit lässt sich das Zurückladen rückgängig machen."),
                el("div", "bk-sum", close)
            );
        }

        draw2();

        return el("div", "bk-pane", el("small", "bk-eyebrow", "Zurückladen"), el("h4", "bk-title", titleOf(backup)), panel);
    }

    function draw(): void {
        const list = shown();
        const backup = list.find((entry) => entry.id === selected) ?? data!.backups.find((entry) => entry.id === selected) ?? list[0] ?? null;
        let right: HTMLElement;
        /** Erst nach dem Einhängen mitlesen: Ein Feld, das noch nicht im Dokument ist, gilt als weg (Review I5). */
        let watch: { panel: HTMLElement; jobId: number } | null = null;

        if (data!.job && data!.job.status === "running") {
            // Ein Laden läuft: rechts sein Fortschritt, bis es fertig ist.
            const panel = el("div", "bk-restore");

            right = el("div", "bk-pane", el("small", "bk-eyebrow", "Zurückladen"), el("h4", "bk-title", "Läuft gerade"), panel);
            panel.replaceChildren(...progressView(panel, data!.job));
            // Ein älterer Abruf sieht, dass sein Feld weg ist, und hört auf.
            watch = { panel, jobId: data!.job.id };
        } else if (!backup) {
            right = el("div", "bk-pane", el("p", "hintline", "Wähl links ein Backup."));
        } else {
            selected = backup.id;
            right = pane === "restore" ? restore(backup) : detail(backup);
        }

        host.replaceChildren(
            card(
                "Alle Backups",
                "",
                el("div", "bk-split", side(), right),
                el("p", "bk-info", icon("#i-info"), el("span", "", "Zusätzlich sichert RL Nexus jede Nacht alle Server für den Notfall. Diese Backups siehst du hier nicht. Wenn du eins brauchst, melde dich beim Support."))
            )
        );

        if (watch) follow(watch.panel, watch.jobId);
    }

    async function load(): Promise<void> {
        const answer = await call<IPayload>("");

        if (!answer) {
            host.replaceChildren();
            return;
        }

        data = answer;
        following = null;
        draw();
    }

    loading(host);
    void load();
    reloadWhenShown(host, load);
}

