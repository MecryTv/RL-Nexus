import { MessageCreateOptions } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { IBackupMeta, IBackupPlanState, IRestoreJob, IRestoreLine, IRestorePlan, IServerCounts, RestoreMode } from "../interfaces/services/serverbackup/IServerBackup";

/**
 * Karten und Antworten der Backups für den Discord-Server (Plan 32), nach
 * Entwurf v4: der Fortschritt beim Laden im Meldekanal, die Karte danach, die
 * kleinen Meldungen und die Antworten auf /backup (nur für den Fragenden).
 */

const BLUE = 0x5865f2;
const GREEN = 0x57f287;
const YELLOW = 0xfee75c;
const GRAY = 0x4f545c;
const HAND_MAX = 10;
const PER_PAGE = 3;
const DAY_MS = 86_400_000;
/** Text-Bausteine dürfen 4000 Zeichen haben, mit etwas Luft. */
const TEXT_MAX = 3_800;
const DAY = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
const TIME = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" });
const NUMBER = new Intl.NumberFormat("de-DE");
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const KIND: Record<IBackupMeta["kind"], { icon: string; label: string; strip: string; rank: number }> = {
    schutz: { icon: "🛡️", label: "vor dem Anti-Nuke", strip: "🟥", rank: 3 },
    vorher: { icon: "↩️", label: "vor dem Laden", strip: "🟥", rank: 3 },
    hand: { icon: "✋", label: "von Hand", strip: "🟩", rank: 2 },
    plan: { icon: "🕛", label: "automatisch", strip: "🟦", rank: 1 },
    nacht: { icon: "🕛", label: "automatisch", strip: "🟦", rank: 1 },
};

const VERB: Record<RestoreMode, string> = { repair: "repariert", exact: "wie im Backup geladen", other: "aufgebaut" };
const PART_OF: Record<string, string> = { role: "Rollen", channel: "Kanäle", overwrites: "Rechte", member: "Mitglieder", settings: "Einstellungen", emoji: "Emojis und Sticker", sticker: "Emojis und Sticker", ban: "Bans" };

/* ----------------------------------------------------------
   Kleine Helfer
   ---------------------------------------------------------- */
/** „Heute 00:00“, „Gestern 21:40“, sonst „Mo., 28.10. 03:00“, in Berliner Zeit. */
export function When(at: number, now = Date.now()): string {
    const day = DAY.format(at);
    const prefix = day === DAY.format(now) ? "Heute" : day === DAY.format(now - DAY_MS) ? "Gestern" : DATE.format(at);

    return `${prefix} ${TIME.format(at)}`;
}

function Lower(text: string): string {
    return text.startsWith("Heute") || text.startsWith("Gestern") ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** „heute 00:00“ - der Tag eines Backups im Satz. */
export function DayLabel(meta: Pick<IBackupMeta, "createdAt">, now = Date.now()): string {
    return Lower(When(Date.parse(meta.createdAt), now));
}

/** „Backup von heute 00:00“ - so heißt ein Backup auf den Karten. */
export function BackupLabel(meta: Pick<IBackupMeta, "createdAt">, now = Date.now()): string {
    return `Backup von ${DayLabel(meta, now)}`;
}

/** Ein Eintrag im Autocomplete: „Heute 00:00 · automatisch · Bot und Server“. */
export function ChoiceLabel(meta: IBackupMeta, now = Date.now()): string {
    return `${When(Date.parse(meta.createdAt), now)} · ${What(meta)} · ${PartsLabel(meta.parts)}`.slice(0, 100);
}

/** Eine kurze Antwort als Karte (Components V2), etwa ein Fehler oder „Läuft“. */
export function Note(text: string): MessageCreateOptions {
    return Message(new ComponentV2Builder({ accentColor: GRAY }).text(text));
}

export function PartsLabel(parts: readonly string[]): string {
    if (parts.includes("bot") && parts.includes("server")) return "Bot und Server";

    return parts.includes("server") ? "nur Server" : "nur Bot";
}

function Count(n: number, one: string, many: string): string {
    return `${NUMBER.format(n)} ${n === 1 ? one : many}`;
}

function Kb(bytes: number): string {
    return `${NUMBER.format(Math.max(1, Math.round(bytes / 1000)))} KB`;
}

function What(meta: IBackupMeta): string {
    return meta.kind === "hand" && meta.note ? `„${meta.note}“` : KIND[meta.kind].label;
}

function Keeps(meta: IBackupMeta): string {
    if (meta.kind === "schutz") return "bleibt 7 Tage";
    if (meta.kind === "vorher") return "bleibt 72 Std.";
    if (meta.kind === "hand" && meta.byName) return `von ${meta.byName}`;

    return Kb(meta.bytes);
}

function ServerLine(server: IServerCounts): string {
    const more = [server.members !== null ? Count(server.members, "Mitglied mit Rollen", "Mitglieder mit Rollen") : "", server.emojis ? Count(server.emojis, "Emoji", "Emojis") : "", server.stickers ? Count(server.stickers, "Sticker", "Sticker") : "", server.bans ? Count(server.bans, "Bann", "Bans") : ""].filter(Boolean);

    return `${Count(server.channels, "Kanal", "Kanäle")} · ${Count(server.roles, "Rolle", "Rollen")}${more.length ? `\n${more.join(" · ")}` : ""}`;
}

function BotLine(counts: Record<string, number>): string {
    const entries = Object.values(counts).reduce((sum, value) => sum + value, 0);

    return `${Count(Object.keys(counts).length, "Bereich", "Bereiche")} · ${Count(entries, "Eintrag", "Einträge")}`;
}

/** 10 Zeichen ▰/▱. */
function Bar(done: number, total: number): string {
    const filled = total > 0 ? Math.round((done / total) * 10) : 10;

    return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

function Minutes(ms: number): string {
    return Count(Math.max(1, Math.round(ms / 60_000)), "Minute", "Minuten");
}

function Names(line: IRestoreLine): string {
    return line.names.length ? `: ${line.names.join(", ")}${line.more ? ` und ${line.more} weitere` : ""}` : "";
}

/** Zeilen bis zur Grenze eines Text-Bausteins, der Rest als „und N weitere“. */
function Fit(rows: readonly string[], max = TEXT_MAX): string {
    const kept: string[] = [];
    let length = 0;

    for (const row of rows) {
        if (length + row.length + 1 > max) break;
        kept.push(row);
        length += row.length + 1;
    }

    return kept.length < rows.length ? `${kept.join("\n")}\nund ${rows.length - kept.length} weitere` : kept.join("\n");
}

/**
 * Namen mit Komma bis zur Grenze, der Rest als „und N weitere“ (W-0041 M1:
 * vorher war die ganze Liste eine Zeile). Kleiner als TEXT_MAX, weil Discord
 * die ganze Nachricht begrenzt und davor schon steht, was geändert wird.
 */
function FitNames(names: readonly string[], max = 1_200): string {
    const kept: string[] = [];
    let length = 0;

    for (const name of names) {
        if (length + name.length + 2 > max) break;
        kept.push(name);
        length += name.length + 2;
    }

    return kept.length < names.length ? `${kept.join(", ")} und ${names.length - kept.length} weitere` : kept.join(", ");
}

function Message(card: ComponentV2Builder): MessageCreateOptions {
    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

/** 14 Felder, die letzten 14 Tage, heute rechts: 🟦 automatisch, 🟩 von Hand, 🟥 Sicherheit, ⬛ keins. */
export function Strip(backups: readonly Pick<IBackupMeta, "kind" | "createdAt">[], now = Date.now()): string {
    const fields: string[] = [];

    for (let back = 13; back >= 0; back--) {
        const day = DAY.format(now - back * DAY_MS);
        const best = backups.filter((meta) => DAY.format(Date.parse(meta.createdAt)) === day).sort((a, b) => KIND[b.kind].rank - KIND[a.kind].rank)[0];

        fields.push(best ? KIND[best.kind].strip : "⬛");
    }

    return fields.join("");
}

/* ----------------------------------------------------------
   Im Meldekanal
   ---------------------------------------------------------- */
/** Fortschritt je Teil: Rollen, Kanäle, Rechte … */
export function Progress(job: Pick<IRestoreJob, "ops" | "done">): { name: string; done: number; total: number }[] {
    const parts = new Map<string, { done: number; total: number }>();

    job.ops.forEach((op, index) => {
        const name = PART_OF[op.kind.split(".")[0]!];

        if (!name) return;

        const entry = parts.get(name) ?? { done: 0, total: 0 };

        entry.total++;
        if (index < job.done) entry.done++;
        parts.set(name, entry);
    });

    return [...parts].map(([name, { done, total }]) => ({ name, done, total }));
}

/** Ein Auftrag fürs Dashboard: alles außer den Schritten selbst (das können Tausende sein), dazu der Fortschritt je Teil. */
/** guildId: wer fragt. „Rückgängig“ gibt es nur beim Server, auf den geladen wurde (W-0041 M9). */
export function JobSummary(job: IRestoreJob, guildId: string): Omit<IRestoreJob, "ops"> & { total: number; progress: { name: string; done: number; total: number }[]; undo: boolean } {
    const { ops, ...rest } = job;

    return { ...rest, total: ops.length, progress: Progress(job), undo: job.safetyId !== null && job.targetGuildId === guildId };
}

export function RunningCard(input: { job: IRestoreJob; backupLabel: string; etaMs: number; resumed?: boolean }): MessageCreateOptions {
    const { job } = input;
    const next = job.phase === "server" ? `Noch etwa ${Minutes(input.etaMs)}` : "Jetzt Bot-Daten, Verweise und Panels";
    const card = new ComponentV2Builder({ accentColor: BLUE })
        .title(`⏳ Server wird ${VERB[job.mode]}`, `${input.backupLabel} · gestartet von <@${job.actorId}>`)
        .text(
            Progress(job)
                .map(({ name, done, total }) => `**${name}** \`${Bar(done, total)}\` ${done}/${total}${done === total ? " ✅" : ""}`)
                .join("\n") || "Nichts zu tun am Server."
        )
        .subtext(`${input.resumed ? "weiter nach Neustart · " : ""}${next} · Backups`);

    return Message(card);
}

export function DoneCard(input: { job: IRestoreJob; backupLabel: string; minutes: number; dashboardUrl: string }): MessageCreateOptions {
    const { job } = input;
    const report = job.report;
    const cancelled = job.status === "cancelled";
    const done = (report?.lines ?? []).filter((line) => line.sign === "+" || line.sign === "~" || line.sign === "−").map((line) => `✅ ${line.text}${Names(line)}`);
    const bot = [
        report?.remapped ? Count(report.remapped, "Eintrag im Bot angepasst", "Einträge im Bot angepasst") : "",
        report?.reposted.length ? `${Count(report.reposted.length, "Panel", "Panels")} neu gepostet` : "",
        report?.redrawn.length ? `${Count(report.redrawn.length, "Panel", "Panels")} neu gezeichnet` : "",
    ].filter(Boolean);
    const problems = [...job.failed.map((entry) => entry.reason), ...(report?.problems ?? []), ...(report?.lines ?? []).filter((line) => line.sign === "!").map((line) => line.text)];
    const card = new ComponentV2Builder({ accentColor: cancelled ? GRAY : problems.length ? YELLOW : GREEN }).title(
        cancelled ? "💾 Laden abgebrochen" : `💾 Server ${VERB[job.mode]}`,
        `${input.backupLabel} · ${Minutes(input.minutes * 60_000)} · <@${job.actorId}>`
    );

    if (cancelled) card.text(`abgebrochen nach ${job.done} von ${job.ops.length} Schritten. Was bis dahin gemacht war, bleibt.`);
    if (bot.length) done.push(`✅ ${bot.join(", ")}`);
    if (done.length && !cancelled) card.text(Fit(done));
    if (problems.length) card.separator().text(`⚠️ **Ging nicht**\n${Fit(problems.slice(0, 10))}${problems.length > 10 ? `\nund ${problems.length - 10} weitere` : ""}`);

    card.buttons(...(job.safetyId !== null ? [{ customId: `bk:undo:${job.id}`, label: "Rückgängig machen", tone: "secondary" as const }] : []), { url: input.dashboardUrl, label: "Im Dashboard" }).subtext(
        job.safetyId !== null ? "Der Stand davor liegt als Sicherheits-Backup bereit" : "Backups"
    );

    return Message(card);
}

export function SafetyNotice(input: { at: number; who: string; why: string; compareUrl: string }): MessageCreateOptions {
    const who = input.who ? `${input.who}: ${input.why}` : input.why;
    const card = new ComponentV2Builder({ accentColor: GRAY }).section(`**🛡️ Gesichert vor dem Anti-Nuke**\n-#${who} · Bot und Server · bleibt 7 Tage · ${TIME.format(input.at)}`, {
        type: "button",
        url: input.compareUrl,
        label: "Vergleichen",
    });

    return Message(card);
}

export function AutoFailedCard(input: { at: number; reason: string; dashboardUrl: string }): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: YELLOW })
        .title("⚠️ Backup nur halb", `automatisch, ${Lower(When(input.at))}`)
        .text(input.reason)
        .buttons({ customId: "bk:retry", label: "Noch einmal versuchen", tone: "primary" }, { url: input.dashboardUrl, label: "Rechte prüfen" });

    return Message(card);
}

/* ----------------------------------------------------------
   Antworten auf /backup
   ---------------------------------------------------------- */
export function CreatedReply(meta: IBackupMeta, used: number, max: number, dashboardUrl: string): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: GREEN }).title("💾 Backup angelegt", [meta.note ? `„${meta.note}“` : "", PartsLabel(meta.parts), Kb(meta.bytes)].filter(Boolean).join(" · "));

    if (meta.server) card.text(`**Discord-Server**\n${ServerLine(meta.server)}`);
    if (meta.parts.includes("bot")) card.text(`**Bot**\n${BotLine(meta.counts)}`);

    card.text(`\`${Bar(used, max)}\` ${used} von ${max} Plätzen von Hand belegt`).buttons({ customId: `bk:open:${meta.id}`, label: "Ansehen" }, { url: dashboardUrl, label: "Im Dashboard" });

    return Message(card);
}

export function ListReply(input: { backups: readonly IBackupMeta[]; page: number; strip: string; now?: number }): MessageCreateOptions {
    const now = input.now ?? Date.now();
    const pages = Math.max(1, Math.ceil(input.backups.length / PER_PAGE));
    const page = Math.min(Math.max(0, input.page), pages - 1);
    const hand = input.backups.filter((meta) => meta.kind === "hand").length;
    const card = new ComponentV2Builder({ accentColor: BLUE })
        .title("💾 Backups", `${Count(input.backups.length, "Backup", "Backups")} · ${hand} von ${HAND_MAX} von Hand`)
        .text(input.strip)
        .subtext("letzte 14 Tage · 🟦 automatisch · 🟩 von Hand · 🟥 Sicherheit · ⬛ keins")
        .separator();

    for (const meta of input.backups.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)) {
        card.section(`${KIND[meta.kind].icon} **${When(Date.parse(meta.createdAt), now)}** · ${What(meta)}\n-# ${PartsLabel(meta.parts)} · ${Keeps(meta)}`, { type: "button", customId: `bk:open:${meta.id}`, label: "Öffnen" });
    }

    if (input.backups.length === 0) card.text("Noch keine Backups. Leg eins an mit `/backup neu`.");

    card.buttons(
        { customId: `bk:list:${page - 1}`, label: "◀", disabled: page === 0 },
        { customId: "bk:page", label: `Seite ${page + 1} von ${pages}`, disabled: true },
        { customId: `bk:list:${page + 1}`, label: "▶", disabled: page >= pages - 1 }
    );

    return Message(card);
}

export function BackupReply(meta: IBackupMeta, now = Date.now()): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: BLUE }).title(`${KIND[meta.kind].icon} ${BackupLabel(meta, now)}`, `${What(meta)} · ${PartsLabel(meta.parts)} · ${Kb(meta.bytes)}`);

    if (meta.server) card.text(`**Discord-Server**\n${ServerLine(meta.server)}`);
    if (meta.parts.includes("bot")) card.text(`**Bot**\n${BotLine(meta.counts)}`);

    card.buttons(
        { customId: "bk:list:0", label: "Zurück zur Liste" },
        ...(meta.server ? [{ customId: `bk:compare:${meta.id}`, label: "Mit jetzt vergleichen" }, { customId: `bk:ask:${meta.id}:repair`, label: "Laden …", tone: "primary" as const }] : [])
    );

    return Message(card);
}

export function CompareReply(lines: readonly IRestoreLine[], label: string, backupId: number): MessageCreateOptions {
    // Discord färbt in diff „-“ rot und „+“ grün.
    const rows = lines.map((line) => `${line.sign === "−" ? "-" : line.sign === "+" ? "+" : " "} ${line.text}${Names(line)}`);
    const card = new ComponentV2Builder({ accentColor: BLUE })
        .title(`🔍 Seit ${label} geändert`, `Backup von ${label} gegen jetzt`)
        .text(rows.length ? `\`\`\`diff\n${Fit(rows, TEXT_MAX - 20)}\n\`\`\`` : "Nichts geändert seit dem Backup.")
        .buttons({ customId: `bk:ask:${backupId}:repair`, label: "Reparieren …", tone: "primary" });

    return Message(card);
}

/** undo: Rückfrage vor „Rückgängig machen“ dieses Auftrags (lädt „vorher“ genau wie im Backup). */
export function LoadConfirm(plan: IRestorePlan, label: string, mode: Exclude<RestoreMode, "other">, backupId: number, undo?: number): MessageCreateOptions {
    const icon: Partial<Record<IRestoreLine["sign"], string>> = { "+": "➕", "~": "🔁", "−": "➖" };
    const doing = plan.lines.filter((line) => icon[line.sign]).map((line) => `${icon[line.sign]} ${line.text}${Names(line)}`);
    const stays = plan.lines.filter((line) => line.sign === "=").map((line) => `${line.text}${Names(line)}`);
    const impossible = plan.lines.filter((line) => line.sign === "!").map((line) => line.text);
    const card = new ComponentV2Builder({ accentColor: YELLOW })
        .title(
            undo !== undefined ? "⚠️ Laden rückgängig machen?" : mode === "exact" ? "⚠️ Server genau wie im Backup laden?" : "⚠️ Server reparieren?",
            undo !== undefined ? `Lädt den Stand ${label}, genau wie damals` : `Backup von ${label} · Modus ${mode === "exact" ? "Genau wie im Backup" : "Reparieren"}`
        )
        .text(doing.length ? Fit(doing) : "Nichts zu tun. Der Server sieht aus wie im Backup.");

    if (mode === "exact" && plan.deletes.length) card.text(`**Verschwindet**\n${FitNames(plan.deletes)}`);
    if (stays.length) card.text(`**Bleibt**\n${Fit(stays)}`);
    if (impossible.length) card.text(`**Geht nicht**\n${Fit(impossible)}`);

    const go = undo !== undefined ? { customId: `bk:undoask:${undo}`, label: "Rückgängig machen …" } : { customId: `bk:load:${backupId}:${mode}`, label: mode === "exact" ? "Laden …" : "Reparieren …" };

    card.buttons({ ...go, tone: mode === "exact" ? "danger" : "primary" }, { customId: "bk:cancel", label: "Abbrechen" }).subtext(
        `Dauert etwa ${Minutes(plan.estimateMs)}. Vorher sichert der Bot den jetzigen Stand.`
    );

    return Message(card);
}

export function AutomaticReply(state: IBackupPlanState, dashboardUrl: string, now = Date.now()): MessageCreateOptions {
    const { plan } = state;
    const every = plan.every === "tag" ? "täglich" : plan.every === "3tage" ? "alle 3 Tage" : plan.every === "woche" ? `jeden ${WEEKDAYS[plan.weekday] ?? "Sonntag"}` : "monatlich";
    const last = state.lastError ? `${When(Date.parse(state.lastError.at), now)} ⚠️ ${state.lastError.reason}` : state.lastOk ? `${When(Date.parse(state.lastOk), now)} ✅` : "–";
    const card = new ComponentV2Builder({ accentColor: BLUE })
        .title("🕛 Automatisch sichern", `${every} ${plan.hour}:00 · behält ${plan.keep} · ${plan.discord ? "Bot und Server" : "nur Bot"}`)
        .text(
            [
                `**${plan.enabled ? "An" : "Aus"}**`,
                `**Nächstes** ${plan.enabled && state.next ? When(Date.parse(state.next), now) : "–"}`,
                `**Letztes** ${last}`,
                `**Vor riskanten Änderungen** ${plan.risky ? "an, mit Anti Villain" : "aus"}`,
            ].join("\n")
        )
        .buttons(
            { customId: "bk:auto:enabled", label: plan.enabled ? "Ausschalten" : "Einschalten", tone: plan.enabled ? "secondary" : "success" },
            { customId: "bk:auto:discord", label: `Auch Discord-Server: ${plan.discord ? "an" : "aus"}` },
            { customId: "bk:auto:risky", label: `Vor riskanten Änderungen: ${plan.risky ? "an" : "aus"}` },
            { url: dashboardUrl, label: "Mehr im Dashboard" }
        );

    return Message(card);
}
