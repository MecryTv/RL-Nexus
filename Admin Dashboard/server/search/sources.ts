import type { IMailSummary, IMe } from "../../shared/api.ts";
import type { IModules, ITeam } from "../../shared/content.ts";
import { AUDIT_LABELS, GROUP_LABELS, type Group } from "../../shared/limits.ts";
import { fold, rankOf, sortHits, type ISearchHit } from "../../shared/search.ts";
import { maskEmail } from "../../shared/shop.ts";
import { backupGuilds, backupsReason } from "../backups/store.ts";
import { listTesters } from "../beta/store.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { readContent } from "../content.ts";
import { bannerOf } from "../content-rules.ts";
import { databaseReady, query } from "../db.ts";
import { ACCOUNT_COLUMNS, type IMailAccountRow } from "../mail/accounts.ts";
import { messages } from "../mail/mailbox.ts";
import { allCustomers } from "../shop/records.ts";
import { listProducts } from "../shop/store.ts";
import { listIncidents } from "../status/incidents.ts";
import { knownName, userRefs } from "../users.ts";
import type { ISearchSource } from "./run.ts";

/** Eine Quelle gibt höchstens so viele zurück: einer mehr als angezeigt, damit „20+“ stimmt. */
const LIMIT = 21;

/** Diese Aktionen erscheinen schon als Meldung oder Störung (Spec Teil 5, keine Dubletten). */
const SHOWN_ELSEWHERE = ["notification.send", "status.create", "status.update"];

/** `%…%` für LIKE … ESCAPE '!': Prozent und Unterstrich zählen wörtlich. */
export function likeOf(text: string): string {
    return `%${text.replace(/[!%_]/g, "!$&")}%`;
}

const DAY = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

function day(at: Date | string): string {
    return DAY.format(new Date(at));
}

/** Im Speicher gefiltert: Rang -1 heißt kein Treffer. Erst sortieren, sonst fielen die besten hinter die Grenze. */
export function matched(hits: readonly ISearchHit[]): ISearchHit[] {
    return sortHits(hits.filter((hit) => hit.rank >= 0)).slice(0, LIMIT);
}

/** Schon von SQL oder IMAP gefunden: ohne Rang am Titel zählt es als Treffer im Kontext. */
const foundRank = (title: string, context: string, wanted: string): number => rankOf(title, context, wanted) ?? 2;

export function mailHit(account: Pick<IMailAccountRow, "id" | "address"> & { readonly label: string | null }, mail: IMailSummary, text: string): ISearchHit {
    const title = mail.subject.trim() || "(ohne Betreff)";
    const context = `${mail.from?.name || mail.from?.address || "Unbekannt"} · ${day(mail.date)}`;

    return {
        kind: "mails",
        icon: "mail",
        title,
        place: `Postfach ${account.label || account.address}`,
        context,
        href: `/post/${account.id}/${encodeURIComponent("INBOX")}/${mail.uid}`,
        at: mail.date,
        rank: foundRank(title, `${context} ${mail.from?.address ?? ""} ${mail.preview}`, fold(text)),
    };
}

interface IPerson {
    readonly id: string;
    name: string | null;
    email: string | null;
    readonly places: string[];
    /** 1 Kunde, 2 Gruppe, 3 Beta: wohin Enter führt (Entscheidung 30). */
    target: { readonly order: number; readonly path: string };
}

/** Gruppen, Kunden und Beta, je Discord-ID eine Zeile. */
async function findPersons(text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) throw new Error("Ohne Datenbank keine Personen.");

    const [groups, customers, testers] = await Promise.all([query<{ user_id: string; group_name: string }[]>("SELECT user_id, group_name FROM dashboard_groups"), allCustomers(), listTesters()]);
    const people = new Map<string, IPerson>();
    const person = (id: string, order: number, path: string): IPerson => {
        const entry = people.get(id) ?? { id, name: null, email: null, places: [], target: { order, path } };

        if (order < entry.target.order) entry.target = { order, path };
        people.set(id, entry);

        return entry;
    };

    for (const { customer } of customers) {
        const entry = person(customer.userId, 1, "/shop/kunden");

        entry.name = customer.name;
        entry.email = customer.email;
        entry.places.push("Kunde");
    }
    for (const row of groups) person(row.user_id, 2, "/gruppen").places.push(`Gruppe ${GROUP_LABELS[row.group_name as Group] ?? row.group_name}`);
    for (const tester of testers) person(tester.userId, 3, "/beta").places.push("Beta");

    const wanted = fold(text);

    return matched(
        [...people.values()].map((entry): ISearchHit => {
            const name = entry.name ?? knownName(entry.id);
            const title = name ?? entry.id;
            const context = [...entry.places, ...(entry.email ? [maskEmail(entry.email)] : [])].join(" · ");
            // Die Beta-Seite hat kein Suchfeld (Entscheidung 31).
            const href = entry.target.order === 3 ? entry.target.path : `${entry.target.path}?q=${encodeURIComponent(name ?? entry.id)}`;

            return { kind: "personen", icon: "users", title, place: "Person", context, href, at: null, rank: rankOf(title, `${context} ${entry.id} ${entry.email ?? ""}`, wanted) ?? -1 };
        })
    );
}

/** Das Team der Webseite hat keine Discord-ID: je Mitglied eine eigene Zeile. */
async function findTeam(config: IConfig, text: string): Promise<ISearchHit[]> {
    const envelope = await readContent(config, "team.json");
    if (envelope === null) throw new Error("Die Webseite liefert kein Team.");

    const wanted = fold(text);

    return matched(
        (envelope.data as ITeam).members.map((member): ISearchHit => {
            // Der Handle steht mal mit, mal ohne @ im Team.
            const context = `${member.role} · @${member.handle.replace(/^@/, "")}`;

            return { kind: "personen", icon: "users", title: member.name, place: "Webseite · Team", context, href: "/webseite/team", at: null, rank: rankOf(member.name, context, wanted) ?? -1 };
        })
    );
}

async function findServers(config: IConfig, me: IMe, text: string): Promise<ISearchHit[]> {
    const bot = await botOverview(config, me.id);
    if (!bot) throw new Error("Der Bot antwortet nicht.");

    const wanted = fold(text);

    return matched(
        bot.guilds.map(
            (guild): ISearchHit => ({
                kind: "server",
                icon: "server",
                title: guild.name,
                place: "Server",
                context: `${guild.members.toLocaleString("de-DE")} Mitglieder`,
                href: `/server?q=${encodeURIComponent(guild.name)}`,
                at: null,
                rank: rankOf(guild.name, guild.id, wanted) ?? -1,
            })
        )
    );
}

/** Posteingang aller Postfächer über die Suche des Mailservers, wie im Postfach. */
async function findMails(config: IConfig, text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) return [];

    const rows = await query<IMailAccountRow[]>(`SELECT ${ACCOUNT_COLUMNS} FROM mail_accounts ORDER BY position, id`);
    const lists = await Promise.allSettled(
        rows.map(async (row) => (await messages(config.mail, row, { folder: "INBOX", page: 1, limit: LIMIT, query: text, filter: "alle" })).messages.map((mail) => mailHit(row, mail, text)))
    );

    // Ein Postfach darf fehlen. Fehlen alle, sagt das Fenster es.
    if (rows.length > 0 && lists.every((list) => list.status === "rejected")) throw new Error("Kein Postfach antwortet.");

    return lists.flatMap((list) => (list.status === "fulfilled" ? list.value : []));
}

async function findWebsite(config: IConfig, text: string): Promise<ISearchHit[]> {
    const [modules, banner] = await Promise.all([readContent(config, "modules.json"), readContent(config, "banner.json")]);
    if (modules === null) throw new Error("Die Webseite liefert keine Module.");

    const wanted = fold(text);
    const hits = (modules.data as IModules).modules.map((module): ISearchHit => {
        const context = [module.tagline, module.category].filter(Boolean).join(" · ");

        return { kind: "inhalte", icon: "puzzle", title: module.name, place: "Webseite · Modul", context, href: `/webseite/module/${module.id}`, at: null, rank: rankOf(module.name, `${context} ${module.description}`, wanted) ?? -1 };
    });
    const bar = banner === null ? null : bannerOf(banner.data);

    if (bar && (bar.title || bar.text)) {
        const title = bar.title || bar.text;

        hits.push({ kind: "inhalte", icon: "megaphone", title, place: "Webseite · Banner", context: `${bar.enabled ? "An" : "Aus"} · ${bar.text}`, href: "/webseite/banner", at: null, rank: rankOf(title, bar.text, wanted) ?? -1 });
    }

    return matched(hits);
}

async function findProducts(text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) return [];

    const wanted = fold(text);

    return matched(
        (await listProducts()).map(
            (product): ISearchHit => ({
                kind: "inhalte",
                icon: "tag",
                title: product.title,
                place: "Shop · Produkt",
                context: product.description,
                href: "/shop/produkte",
                at: null,
                rank: rankOf(product.title, product.description, wanted) ?? -1,
            })
        )
    );
}

/** Meldungen ans Postfach im Bot-Dashboard: eine Zeile je Empfänger, hier einmal je Titel, Text und Minute. */
async function findNotifications(text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) return [];

    const like = likeOf(text);
    const wanted = fold(text);
    // Nur was das Team verschickt; „group“ und „account“ schreibt der Bot selbst je Person.
    const rows = await query<{ title: string; body: string; at: Date; count: number }[]>(
        `SELECT title, body, MIN(created_at) AS at, COUNT(*) AS count FROM notifications
         WHERE kind IN ('info', 'success', 'warn') AND (title LIKE ? ESCAPE '!' OR body LIKE ? ESCAPE '!')
         GROUP BY title, body, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') ORDER BY at DESC LIMIT ${LIMIT}`,
        [like, like]
    );

    return rows.map((row): ISearchHit => {
        const count = Number(row.count);

        return {
            kind: "protokoll",
            icon: "bell",
            title: row.title,
            place: "Meldung",
            context: `an ${count} ${count === 1 ? "Person" : "Personen"} · ${day(row.at)}`,
            href: "/meldungen",
            at: row.at.toISOString(),
            rank: foundRank(row.title, row.body, wanted),
        };
    });
}

async function findIncidents(text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) return [];

    const { open, past } = await listIncidents();
    const wanted = fold(text);

    return matched(
        [...open, ...past].map(
            (incident): ISearchHit => ({
                kind: "protokoll",
                icon: "pulse",
                title: incident.title,
                place: incident.kind === "wartung" ? "Wartung" : "Störung",
                context: `${incident.resolvedAt ? "Gelöst" : "Offen"} · ${day(incident.createdAt)}`,
                href: `/status#meldung-${incident.id}`,
                at: incident.createdAt,
                rank: rankOf(incident.title, incident.updates.map((update) => update.body).join(" "), wanted) ?? -1,
            })
        )
    );
}

/** Nur lesen: `backupsReady` würde die Backup-Datenbank neu einrichten, das ist nicht Sache der Suche. */
async function findBackups(text: string): Promise<ISearchHit[]> {
    if (backupsReason() !== null) return [];

    const wanted = fold(text);

    return matched(
        (await backupGuilds()).map(
            (guild): ISearchHit => ({
                kind: "protokoll",
                icon: "archive",
                title: `Backups: ${guild.guildName}`,
                place: "Backups",
                context: `Letzte Sicherung ${day(guild.last.at)}`,
                href: `/backups/${guild.guildId}`,
                at: guild.last.at.toISOString(),
                rank: rankOf(guild.guildName, guild.guildId, wanted) ?? -1,
            })
        )
    );
}

/** Das Protokoll des Admin Dashboards, nur für Developer. Findet auch über den deutschen Namen der Aktion. */
async function findAudit(text: string): Promise<ISearchHit[]> {
    if (!databaseReady()) return [];

    const like = likeOf(text);
    const wanted = fold(text);
    const named = Object.entries(AUDIT_LABELS)
        .filter(([, label]) => fold(label).includes(wanted))
        .map(([action]) => action);
    const rows = await query<{ user_id: string; user_name: string; action: string; target: string | null; created_at: Date }[]>(
        `SELECT user_id, user_name, action, target, created_at FROM admin_audit
         WHERE action NOT IN (?) AND (user_name LIKE ? ESCAPE '!' OR action LIKE ? ESCAPE '!' OR target LIKE ? ESCAPE '!' OR detail LIKE ? ESCAPE '!'${named.length > 0 ? " OR action IN (?)" : ""})
         ORDER BY id DESC LIMIT ${LIMIT}`,
        [SHOWN_ELSEWHERE, like, like, like, like, ...(named.length > 0 ? [named] : [])]
    );

    return rows.map((row): ISearchHit => {
        const title = `${AUDIT_LABELS[row.action] ?? row.action}${row.target ? ` · ${row.target}` : ""}`;
        const context = `${row.user_name} · ${day(row.created_at)}`;

        return { kind: "protokoll", icon: "history", title, place: "Protokoll", context, href: `/dev/protokoll?person=${row.user_id}&aktion=${encodeURIComponent(row.action)}`, at: row.created_at.toISOString(), rank: foundRank(title, context, wanted) };
    });
}

/** Die Quellen der Suche für diese Person, in der Reihenfolge der Filterleiste. */
export function searchSources(config: IConfig, me: IMe): ISearchSource[] {
    return [
        { kind: "personen", find: findPersons },
        { kind: "personen", find: (text) => findTeam(config, text) },
        { kind: "server", find: (text) => findServers(config, me, text) },
        { kind: "mails", find: (text) => findMails(config, text) },
        { kind: "inhalte", find: (text) => findWebsite(config, text) },
        { kind: "inhalte", find: findProducts },
        { kind: "protokoll", find: findNotifications },
        { kind: "protokoll", find: findIncidents },
        { kind: "protokoll", find: findBackups },
        { kind: "protokoll", developer: true, find: findAudit },
    ];
}

/** Gruppen und Beta speichern nur die ID: Namen beim Start einmal holen, damit die Suche sie findet. */
export async function warmNames(config: IConfig): Promise<void> {
    if (!databaseReady()) return;

    const [groups, testers] = await Promise.all([query<{ user_id: string }[]>("SELECT user_id FROM dashboard_groups"), listTesters()]);

    await userRefs(config, [...groups.map((row) => row.user_id), ...testers.map((tester) => tester.userId)]);
}
