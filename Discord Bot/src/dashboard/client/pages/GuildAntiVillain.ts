/**
 * Abschnitt: Anti Villain.
 *
 * Oben das Lagebild statt Kennzahlen, darunter ein Menü mit fünf Reitern:
 * Quarantäne (Fallakten), Schutz, Köder, Raid und Nuke, Protokoll. Die Knöpfe
 * einer Fallakte wirken sofort, die Einstellungen erst mit „Speichern“.
 * Siehe docs/AntiVillain.md.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, face, IRole, loading, rolePicker, row, select, toggle, WHEN } from "../core/Ui.js";
import { ILogTargets, ILogThread, logTargetSelect } from "../core/LogTarget.js";

type Level = "locker" | "normal" | "streng";
type Pane = "quarantine" | "guard" | "bait" | "raid" | "log";
type RaidSwitch = "invites" | "slowmode" | "hold" | "ping" | "verification";

interface ISettings {
    level: Level;
    guards: Record<string, boolean>;
    team: "report" | "same";
    trustedRoles: string[];
    quarantine: { roleId: string | null; channelId: string | null; stripRoles: boolean; cleanup: number; dm: boolean; release: "team" | "team-24h" };
    bait: { channel: boolean; channelId: string | null; role: boolean; roleId: string | null; messageId: string | null };
    raid: { on: boolean; joins: number; invites: boolean; slowmode: boolean; hold: boolean; ping: boolean; verification: boolean; endMinutes: number };
    nuke: { on: boolean; limits: Record<string, number>; trustedBots: string[] };
    logChannelId: string | null;
    pingRoleId: string | null;
}

interface ICase {
    id: number;
    userId: string;
    name: string;
    avatar: string | null;
    accountAt: number | null;
    score: number;
    hits: { guard: string; points: number; detail: string; at: number }[];
    timeline: { at: number; text: string }[];
    partial: string[];
    deleted: number;
    incidentId: number | null;
    createdAt: number;
}

interface IDeleted {
    channelId: string;
    at: number;
    text: string;
    files: string[];
}

interface IPayload {
    /** Modul aus: Fälle bleiben, Freigeben geht weiter, alles andere erst nach dem Einschalten. */
    off: boolean;
    settings: ISettings;
    lage: { held: number; level: Level; bait: { on: boolean; caught: number }; raid: boolean; nuke: boolean };
    cases: ICase[];
    /** W-0011: Staff mit Freigabe, aber ohne das extra Ja - die Fälle sind privat. */
    casesLocked?: boolean;
    protocol: { id: number; at: number; kind: string; title: string; detail: string }[];
    raid: { since: number; joins: number; invitesUntil: number | null } | null;
    readiness: { missing: string[]; aboveBot: string[] };
    intent: boolean;
    guards: { id: string; name: string; hint: string; icon: string; points: number }[];
    levels: Record<Level, { report: number; hold: number | null }>;
    nukeActions: { id: string; label: string; icon: string; limit: number }[];
    limits: { nuke: [number, number]; joins: [number, number]; end: [number, number]; cleanup: number[]; trusted: number };
    targets: ILogTargets;
    guild: { roles: IRole[]; channels: { id: string; name: string }[] };
    bots: { id: string; name: string }[];
}

const PANES: [Pane, string, string][] = [
    ["quarantine", "Quarantäne", "#i-lock"],
    ["guard", "Schutz", "#i-shield"],
    ["bait", "Köder", "#i-sparkle"],
    ["raid", "Raid und Nuke", "#i-users"],
    ["log", "Protokoll", "#i-scroll"],
];

const LEVELS: [Level, string, string][] = [
    ["locker", "Locker", "Für große, aktive Server."],
    ["normal", "Normal", "Passt für die meisten."],
    ["streng", "Streng", "Für Turniere und nach einem Vorfall."],
];

const CLEANUP_TEXT: Record<number, string> = { 0: "nichts", 10: "letzte 10 Minuten", 60: "letzte Stunde", 1440: "letzte 24 Stunden" };

const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** „seit 12 Minuten“, „seit 3 Stunden“, „seit 2 Tagen“. */
function since(at: number): string {
    const minutes = Math.max(1, Math.round((Date.now() - at) / 60_000));

    if (minutes < 60) return `seit ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;

    const hours = Math.round(minutes / 60);

    return hours < 48 ? `seit ${hours} ${hours === 1 ? "Stunde" : "Stunden"}` : `seit ${Math.round(hours / 24)} Tagen`;
}

/** Wie alt ein Discord-Account ist. */
function age(at: number): string {
    const days = Math.floor((Date.now() - at) / 86_400_000);

    if (days < 1) return "heute angelegt";
    if (days < 60) return `${days} ${days === 1 ? "Tag" : "Tage"} alt`;

    return days < 730 ? `${Math.floor(days / 30)} Monate alt` : `${Math.floor(days / 365)} Jahre alt`;
}

/** Schalter mit „an“/„aus“ daneben, wie in den anderen Modulen. */
function switchLabel(on: boolean, label: string, change: (on: boolean) => void): HTMLElement {
    const state = el("span", "", on ? "an" : "aus");

    return el(
        "label",
        "snitem__switch",
        toggle(on, label, (next) => {
            state.textContent = next ? "an" : "aus";
            change(next);
        }),
        state
    );
}

function numberField(value: number, [min, max]: [number, number], label: string, change: (value: number) => void): HTMLInputElement {
    const input = el("input", "text gwnum");

    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => change(Math.max(min, Math.min(max, Math.round(Number(input.value)) || min))));

    return input;
}

export function renderAntiVillain(guildId: string): void {
    const host = need<HTMLElement>("#avBody");
    const note = need<HTMLElement>("#avNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/anti-villain`, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let pane: Pane = "quarantine";
    let dirty = false;
    // Aufgeklappte „Gelöschte ansehen“ je Fall - bleiben offen, wenn neu gezeichnet wird.
    const opened = new Map<number, IDeleted[]>();

    const save = el("button", "btn btn--primary") as HTMLButtonElement;

    function touch(): void {
        dirty = true;
        save.disabled = false;
    }

    const guardName = (id: string): string => data!.guards.find((guard) => guard.id === id)?.name ?? id;

    // Einrichten nimmt den gespeicherten Stand, nicht den Entwurf.
    function needsSetup(): boolean {
        const { quarantine, bait } = data!.settings;

        return !quarantine.roleId || !quarantine.channelId || (bait.channel && !bait.channelId) || (bait.role && !bait.roleId);
    }

    /* ------------------------------------------------------------
       Kopf: Bereitschaft, Lagebild, Menü
       ------------------------------------------------------------ */
    function readiness(): HTMLElement[] {
        const { missing, aboveBot } = data!.readiness;
        const parts: string[] = [];

        if (missing.length) parts.push(`Dem Bot fehlt: ${missing.join(", ")}.`);
        if (aboveBot.length) parts.push(`Über seiner Rolle stehen ${aboveBot.join(", ")}. Diese Rollen kann er beim Festhalten nicht abnehmen, zieh seine Rolle in Discord weiter nach oben.`);

        return parts.length ? [el("div", "notice snnotice", icon("#i-warn"), el("span", "", parts.join(" ")))] : [];
    }

    function lage(): HTMLElement {
        const { cases, raid, settings } = data!;
        const held = cases.length;
        const names = cases.slice(0, 3).map((entry) => `${entry.name} ${since(entry.createdAt)}`);
        const title = raid ? "Raid-Modus läuft" : held ? `${held} ${held === 1 ? "Account" : "Accounts"} festgehalten` : "Alles ruhig";
        const line = raid
            ? `Seit ${since(raid.since).slice(5)}, ${raid.joins} ${raid.joins === 1 ? "Beitritt" : "Beitritte"} in der Welle.${held ? ` ${held} festgehalten.` : ""}`
            : held
              ? `${names.join(", ")}${held > 3 ? ` und ${held - 3} weitere` : ""}. ${held === 1 ? "Wartet" : "Warten"} auf das Team.`
              : "Niemand festgehalten. Der Bot passt auf.";
        const guard = settings.raid.on && settings.nuke.on ? "bereit" : settings.raid.on ? "nur Raid" : settings.nuke.on ? "nur Nuke" : "aus";
        const box = el(
            "div",
            `avlage${raid ? " is-raid" : held ? "" : " is-calm"}`,
            el("span", "avlage__shield", icon(raid || held ? "#i-warn" : "#i-shield-check")),
            el("div", "", el("div", "avlage__kicker", "Lage"), el("div", "avlage__title", title), el("div", "avlage__line", line)),
            el(
                "div",
                "avlage__facts",
                el("span", "", "Schutzstufe ", el("b", "", LEVELS.find(([id]) => id === settings.level)![1])),
                el("span", "", "Köder ", el("b", "", settings.bait.channel || settings.bait.role ? "scharf" : "aus")),
                el("span", "", "Raid und Nuke ", el("b", "", guard))
            )
        );

        box.setAttribute("role", "status");

        return box;
    }

    function nav(): HTMLElement {
        const bar = el("div", "avnav");

        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Anti Villain");

        for (const [id, label, symbol] of PANES) {
            const tab = button("", icon(symbol), label);

            tab.id = `avtab-${id}`;
            tab.tabIndex = pane === id ? 0 : -1;
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", String(pane === id));
            tab.setAttribute("aria-controls", `avpane-${id}`);

            if (id === "quarantine" && data!.cases.length) tab.append(el("span", "avnav__count", String(data!.cases.length)));

            if (id === "raid" && data!.raid) {
                const dot = el("span", "avnav__live");

                dot.setAttribute("aria-hidden", "true");
                tab.append(dot);
            }

            tab.addEventListener("click", () => {
                pane = id;
                paint(tab.id);
            });
            bar.append(tab);
        }

        // Pfeiltasten wechseln den Reiter, Pos1 und Ende springen an den Rand.
        bar.addEventListener("keydown", (event) => {
            const index = PANES.findIndex(([id]) => id === pane);
            const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: PANES.length - 1 }[event.key];

            if (next === undefined) return;

            event.preventDefault();
            pane = PANES[(next + PANES.length) % PANES.length]![0];
            paint(`avtab-${pane}`);
        });

        return bar;
    }

    function panel(id: Pane, ...children: HTMLElement[]): HTMLElement {
        const box = el("div", "avpane", ...children);

        box.id = `avpane-${id}`;
        box.setAttribute("role", "tabpanel");
        box.setAttribute("aria-labelledby", `avtab-${id}`);

        return box;
    }

    /* ------------------------------------------------------------
       Quarantäne
       ------------------------------------------------------------ */
    function meter(score: number): HTMLElement {
        const { report, hold } = data!.levels[data!.settings.level];
        const fill = el("span", "avmeter__fill");
        const bar = el("div", "avmeter", fill);

        fill.style.width = `${Math.min(100, score)}%`;

        for (const mark of [report, hold]) {
            if (mark === null) continue;

            const line = el("span", "avmeter__mark");

            line.style.left = `${mark}%`;
            bar.append(line);
        }

        bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", `Verdacht ${Math.min(100, score)} von 100${hold === null ? "" : `, Festhalten ab ${hold}`}`);

        return bar;
    }

    function deletedList(list: IDeleted[]): HTMLElement {
        const channel = (id: string): string => data!.guild.channels.find((entry) => entry.id === id)?.name ?? "gelöschter Kanal";

        if (!list.length) return el("p", "hintline", "Keine Nachrichten gespeichert.");

        return el(
            "ul",
            "avdeleted",
            ...list.map((message) =>
                el(
                    "li",
                    "",
                    el("small", "", `${WHEN.format(new Date(message.at))} · #${channel(message.channelId)}`),
                    message.text || "(nur Dateien)",
                    ...(message.files.length ? [el("small", "", message.files.join(", "))] : [])
                )
            )
        );
    }

    function caseCard(entry: ICase): HTMLElement {
        const tags = el("div", "avtags", ...entry.hits.map((hit) => el("span", "avtag", guardName(hit.guard), el("em", "", `+${hit.points}`))));

        if (!entry.hits.length && entry.incidentId !== null) tags.append(el("span", "avtag", "Aus einer Raid-Welle"));

        const who = el(
            "div",
            "avcase__who",
            el(
                "div",
                "avcase__id",
                face({ name: entry.name, avatar: entry.avatar }, "avcase__face"),
                el("div", "", el("b", "", entry.name), el("i", "", [entry.accountAt ? `Account ${age(entry.accountAt)}` : "", `festgehalten ${since(entry.createdAt)}`].filter(Boolean).join(" · ")))
            ),
            el("div", "avscore", el("div", "avscore__top", el("span", "", "Verdacht"), el("b", "", `${Math.min(100, entry.score)} / 100`)), meter(entry.score)),
            tags
        );

        if (entry.partial.length) who.append(el("div", "avtags", el("span", "avtag is-warn", icon("#i-warn"), `Nur teilweise: ${entry.partial.join(", ")} ${entry.partial.length === 1 ? "blieb" : "blieben"}`)));
        if (entry.timeline.some((step) => step.text.startsWith("Erledigt gedrückt"))) who.append(el("div", "avtags", el("span", "avtag is-ok", icon("#i-check"), "Passwort geändert, sagt die Person")));

        const steps = el(
            "ol",
            "avtl",
            ...entry.timeline.map((step) =>
                el(
                    "li",
                    "",
                    el("time", "", TIME.format(new Date(step.at))),
                    el("span", `avdot${step.text.startsWith("Erledigt") ? " is-ok" : step.text.startsWith("Festgehalten") ? " is-bot" : ""}`),
                    el("span", "", step.text)
                )
            )
        );

        const act = async (action: "release" | "trust" | "ban", done: string): Promise<void> => {
            const knobs = [...acts.querySelectorAll("button")];

            for (const knob of knobs) knob.disabled = true;

            const answer = await call<{ case: ICase }>("", { action, id: entry.id });

            for (const knob of knobs) knob.disabled = false;

            if (!answer) return;

            opened.delete(entry.id);
            toast("info", done, entry.name);
            await refresh();
        };

        const release = button("btn btn--primary", icon("#i-unlock"), "Freigeben");
        const trust = button("btn btn--quiet", icon("#i-check"), "War kein Hack");
        const acts = el("div", "avcase__acts", release);

        release.addEventListener("click", () => void act("release", "Freigegeben"));
        trust.addEventListener("click", () => void act("trust", "Freigegeben und 30 Tage vertraut"));

        if (entry.deleted) {
            const look = button("btn btn--quiet", icon("#i-eye"), `Gelöschte ansehen (${entry.deleted})`);

            look.id = `avdeleted-${entry.id}`;
            look.setAttribute("aria-expanded", String(opened.has(entry.id)));
            look.addEventListener("click", async () => {
                if (opened.has(entry.id)) {
                    opened.delete(entry.id);
                } else {
                    const answer = await call<{ deleted: IDeleted[] }>("", { action: "deleted", id: entry.id });

                    if (!answer) return;

                    opened.set(entry.id, answer.deleted);
                }

                paint(look.id);
            });
            acts.append(look);
        }

        acts.append(trust, confirmButton("btn btn--quiet is-danger", "#i-gavel", "Bannen", "Wirklich bannen?", () => act("ban", "Gebannt")));

        const main = el("div", "avcase__main", steps, acts);
        const list = opened.get(entry.id);

        if (list) main.append(deletedList(list));

        return el("article", "avcase", who, main);
    }

    function setupButton(): HTMLButtonElement {
        const knob = button("btn btn--quiet", icon("#i-sparkle"), "Einrichten");

        knob.addEventListener("click", async () => {
            if (dirty) return toast("info", "Erst speichern", "Einrichten nimmt die gespeicherten Einstellungen.");

            knob.disabled = true;

            const answer = await call<{ problems: string[] }>("", { action: "setup" });

            knob.disabled = false;

            if (!answer) return;

            toast("info", answer.problems.length ? "Nicht alles ging" : "Eingerichtet", answer.problems.join(" ") || "Rolle, Kanal und Köder stehen.");
            await refresh();
        });

        return knob;
    }

    function holdCard(): HTMLElement {
        const quarantine = draft!.quarantine;
        const { roles, channels } = data!.guild;

        return card(
            "Was beim Festhalten passiert",
            "",
            row(
                "Rolle",
                "Sieht nur den Quarantäne-Kanal",
                select([["", "noch keine, „Einrichten“ legt sie an"], ...roles.map((role): [string, string] => [role.id, `@${role.name}`])], quarantine.roleId ?? "", (value) => {
                    quarantine.roleId = value || null;
                    touch();
                }, "Quarantäne-Rolle")
            ),
            row(
                "Kanal",
                "Dort steht, was die Person jetzt tun soll",
                select([["", "noch keiner, „Einrichten“ legt ihn an"], ...channels.map((channel): [string, string] => [channel.id, `# ${channel.name}`])], quarantine.channelId ?? "", (value) => {
                    quarantine.channelId = value || null;
                    touch();
                }, "Quarantäne-Kanal")
            ),
            row("Rollen abnehmen", "Alle weg, damit keine doch einen Kanal öffnet. Der Bot merkt sie sich", switchLabel(quarantine.stripRoles, "Rollen abnehmen", (on) => {
                quarantine.stripRoles = on;
                touch();
            })),
            row(
                "Aufräumen",
                "Nachrichten der Person aus allen Kanälen löschen",
                select(data!.limits.cleanup.map((minutes): [string, string] => [String(minutes), CLEANUP_TEXT[minutes] ?? `${minutes} Minuten`]), String(quarantine.cleanup), (value) => {
                    quarantine.cleanup = Number(value);
                    touch();
                }, "Aufräumen")
            ),
            row("Nachricht per DM", "Zusätzlich zum Quarantäne-Kanal: Passwort ändern, 2FA, fremde Apps löschen", switchLabel(quarantine.dm, "Nachricht per DM", (on) => {
                quarantine.dm = on;
                touch();
            })),
            row(
                "Freigabe",
                "Ein Hacker könnte selbst auf „Ich bin's wieder“ klicken",
                select([["team", "nur durch das Team"], ["team-24h", "Team, sonst nach 24 Std. von selbst"]], quarantine.release, (value) => {
                    quarantine.release = value === "team-24h" ? "team-24h" : "team";
                    touch();
                }, "Freigabe")
            ),
            ...(needsSetup() ? [row("Einrichten", "Legt an, was fehlt, und sperrt die übrigen Kanäle für die Quarantäne-Rolle", setupButton())] : [])
        );
    }

    function reportsCard(): HTMLElement {
        const picker = logTargetSelect(
            data!.targets,
            draft!.logChannelId,
            (value) => {
                draft!.logChannelId = value;
                touch();
            },
            async (forumId) => (await call<{ thread: ILogThread }>("", { action: "logthread", forumId }))?.thread ?? null,
            "— kein Meldekanal —"
        );

        picker.setAttribute("aria-label", "Kanal für die Team-Karten");

        return card(
            "Meldungen ans Team",
            "Jeder Verdacht und jedes Festhalten kommt als Karte mit Knöpfen. Ohne Meldekanal sieht das Team nur dieses Dashboard.",
            row("Kanal", "Textkanal oder Beitrag in einem Forum", picker),
            row(
                "Anpingen",
                "Wer bei einer Karte gepingt wird",
                select([["", "Niemand anpingen"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@${role.name}`])], draft!.pingRoleId ?? "", (value) => {
                    draft!.pingRoleId = value || null;
                    touch();
                }, "Rolle, die gepingt wird")
            )
        );
    }

    function quarantinePane(): HTMLElement[] {
        const cases = data!.casesLocked
            ? el("p", "avempty", icon("#i-lock"), "Privater Bereich: Die Fälle siehst du nur mit dem extra Ja für die privaten Bereiche.")
            : data!.cases.length
              ? el("div", "avcases", ...data!.cases.map(caseCard))
              : el("p", "avempty", icon("#i-shield-check"), "Niemand festgehalten.");

        return [
            cases,
            el("p", "avwhy", el("b", "", "„War kein Hack“ "), "gibt frei und merkt sich das: Die Person zählt dann 30 Tage als vertraut, damit derselbe Fehlalarm nicht gleich wieder kommt."),
            holdCard(),
            reportsCard(),
        ];
    }

    /* ------------------------------------------------------------
       Schutz
       ------------------------------------------------------------ */
    function scale(): HTMLElement {
        const { report, hold } = data!.levels[draft!.level];
        const bar = el("div", "avscale__bar");
        const mark = (at: number, value: string, text: string): HTMLElement => {
            const span = el("span", "", el("b", "", value), text);

            span.style.left = `${at}%`;

            return span;
        };

        bar.style.setProperty("--report", `${report}%`);
        bar.style.setProperty("--hold", `${hold ?? 100}%`);

        const box = el("div", "avscale", bar, el("div", "avscale__labels", mark(0, "0", "nichts"), mark(report, String(report), "Team melden"), ...(hold === null ? [] : [mark(hold, String(hold), "festhalten")]), mark(100, "100", "")));

        box.setAttribute("aria-hidden", "true");

        return box;
    }

    function guardPane(): HTMLElement[] {
        const levels = el(
            "div",
            "avlevels",
            ...LEVELS.map(([id, name, fits]) => {
                const { report, hold } = data!.levels[id];
                const knob = button("avlevel", el("b", "", name), el("span", "", `${hold === null ? "Meldet nur ans Team, hält niemanden fest." : `Meldet ab ${report}, hält ab ${hold} fest.`} ${fits}`));

                knob.id = `avlevel-${id}`;
                knob.setAttribute("aria-pressed", String(draft!.level === id));
                knob.addEventListener("click", () => {
                    draft!.level = id;
                    touch();
                    paint(knob.id);
                });

                return knob;
            })
        );

        const guards = data!.guards
            .filter((guard) => guard.id !== "bait")
            .map((guard) => {
                const on = draft!.guards[guard.id] !== false;
                const tile = el("div", `avguard${on ? "" : " is-off"}`);

                tile.append(
                    el("div", "avguard__top", el("span", "avguard__icon", icon(guard.icon)), toggle(on, guard.name, (next) => {
                        draft!.guards[guard.id] = next;
                        tile.classList.toggle("is-off", !next);
                        touch();
                    })),
                    el("b", "", guard.name),
                    el("p", "", guard.hint),
                    el("div", "avguard__pts", el("span", "", "Verdacht"), el("b", "", `+${guard.points}`))
                );

                return tile;
            });

        return [
            card("Schutzstufe", "Ab wie vielen Punkten der Bot das Team ruft und ab wann er festhält.", levels, scale()),
            card(
                "Woran der Bot einen gekaperten Account erkennt",
                "Jeder Wächter gibt Punkte. Ein Treffer allein reicht selten, zwei zusammen fast immer. Die Punkte verfallen nach einer Stunde.",
                el("div", "avguards", ...guards),
                el("p", "avwhy", el("b", "", "Abgrenzung: "), "Spam, Wortlisten, fremde Einladungen und Links allgemein bleiben bei Auto Mod. Hier zählt nur, was auf einen gekaperten oder falschen Account hindeutet.")
            ),
            card(
                "Vertraut",
                "",
                row(
                    "Nie festhalten",
                    `Rollen, die Anti Villain nur meldet, nie festhält · bis zu ${data!.limits.trusted}`,
                    rolePicker(data!.guild.roles, draft!.trustedRoles, (ids) => {
                        draft!.trustedRoles = ids;
                        touch();
                    }, [], data!.limits.trusted)
                ),
                row(
                    "Team",
                    "Auch Team-Accounts werden gekapert. Bei ihnen meldet der Bot sofort, statt festzuhalten",
                    select([["report", "melden statt festhalten"], ["same", "wie alle anderen"]], draft!.team, (value) => {
                        draft!.team = value === "same" ? "same" : "report";
                        touch();
                    }, "Team-Accounts")
                )
            ),
        ];
    }

    /* ------------------------------------------------------------
       Köder
       ------------------------------------------------------------ */
    function baitPane(): HTMLElement[] {
        const bait = draft!.bait;
        const saved = data!.settings.bait;
        const name = data!.guild.channels.find((channel) => channel.id === saved.channelId)?.name;
        const box = el(
            "div",
            "avbait__chan",
            el("h4", "", icon("#i-hash"), name ?? "nicht-schreiben"),
            el("p", "", "Ein Kanal ganz oben, den alle sehen. Darin steht: „Schreib hier nichts. Wer hier schreibt, wird als Bot behandelt.“ Gekaperte Accounts posten ihren Link in jeden Kanal, auch hier."),
            el("div", "avcatch", el("span", "", el("b", "", String(data!.lage.bait.caught)), "gefangen, 30 Tage"))
        );

        if (!name) box.append(el("p", "hintline", saved.channel ? "Den Kanal gibt es noch nicht. „Einrichten“ legt ihn an." : "Der Köder-Kanal ist aus."));

        const rows = el(
            "div",
            "",
            row("Köder-Kanal", "Wer hineinschreibt, hat sofort 100 Punkte", switchLabel(bait.channel, "Köder-Kanal", (on) => {
                bait.channel = on;
                touch();
            })),
            row("Köder-Rolle", "Eine Rolle „Nicht anklicken“, etwa in einem Rollen-Panel. Bots klicken alles an", switchLabel(bait.role, "Köder-Rolle", (on) => {
                bait.role = on;
                touch();
            }))
        );

        if (needsSetup()) rows.append(row("Einrichten", "Legt an, was fehlt: Kanal, Rolle und die Quarantäne", setupButton()));

        return [card("Köder", "Fallen, in die nur Bots und gekaperte Accounts tappen. Ein Mensch liest den Hinweis und lässt es.", el("div", "avbait", box, rows))];
    }

    /* ------------------------------------------------------------
       Raid und Nuke
       ------------------------------------------------------------ */
    function raidButton(): HTMLButtonElement {
        const after = (): void => {
            // Guild.ts zeigt den roten Balken - und meldet sich dann bei refresh() zurück.
            window.dispatchEvent(new CustomEvent("antivillain:raid"));
        };

        if (data!.raid) {
            const end = button("btn btn--primary", icon("#i-unlock"), "Raid-Modus beenden");

            end.addEventListener("click", async () => {
                end.disabled = true;

                if (await call("", { action: "raid-end" })) after();

                end.disabled = false;
            });

            return end;
        }

        return confirmButton("btn btn--quiet", "#i-lock", "Raid-Modus starten", "Wirklich starten?", async () => {
            if (await call("", { action: "raid-start" })) after();
        });
    }

    function botPicker(): HTMLElement {
        const box = el("div", "tkchips");
        const nameOf = (id: string): string => data!.bots.find((bot) => bot.id === id)?.name ?? "Bot nicht mehr da";
        const draw = (): void => {
            const ids = draft!.nuke.trustedBots;
            const picker = select(
                [["", data!.bots.length ? "+ Bot hinzufügen" : "Keine anderen Bots gefunden"], ...data!.bots.filter((bot) => !ids.includes(bot.id)).map((bot): [string, string] => [bot.id, bot.name])],
                "",
                (value) => {
                    if (!value) return;

                    draft!.nuke.trustedBots = [...ids, value];
                    touch();
                    draw();
                },
                "Bot vertrauen"
            );

            picker.disabled = !data!.bots.length || ids.length >= data!.limits.trusted;

            box.replaceChildren(
                ...ids.map((id) => {
                    const remove = button("", icon("#i-x"));

                    remove.setAttribute("aria-label", `${nameOf(id)} nicht mehr vertrauen`);
                    remove.addEventListener("click", () => {
                        draft!.nuke.trustedBots = ids.filter((entry) => entry !== id);
                        touch();
                        draw();
                    });

                    return el("span", "tkchip", el("span", "", nameOf(id)), remove);
                }),
                picker
            );
        };

        draw();

        return box;
    }

    function raidPane(): HTMLElement[] {
        const raid = draft!.raid;
        const nuke = draft!.nuke;
        const chip = (key: RaidSwitch, symbol: string, text: string): HTMLButtonElement => {
            const knob = button("avchip", icon(symbol), text);

            knob.setAttribute("aria-pressed", String(raid[key]));
            knob.addEventListener("click", () => {
                raid[key] = !raid[key];
                knob.setAttribute("aria-pressed", String(raid[key]));
                touch();
            });

            return knob;
        };
        const power = switchLabel(raid.on && data!.intent, "Raid-Schutz anschalten", (on) => {
            raid.on = on;
            touch();
        });

        power.querySelector("input")!.disabled = !data!.intent;

        const limits = data!.nukeActions.map((action) =>
            el(
                "label",
                "avlimit",
                icon(action.icon),
                el("span", "", action.label),
                numberField(nuke.limits[action.id] ?? action.limit, data!.limits.nuke, `${action.label}: höchstens so oft in 10 Minuten`, (value) => {
                    nuke.limits[action.id] = value;
                    touch();
                })
            )
        );

        return [
            card(
                "Raid-Schutz",
                "Viele Beitritte auf einmal: Der Server geht in den Raid-Modus, bis die Welle vorbei ist.",
                ...(data!.intent
                    ? []
                    : [el("div", "notice snnotice", icon("#i-warn"), el("span", "", "Dem Bot fehlt das Members-Intent (GUILD_MEMBER_INTENT). Ohne sieht er niemanden beitreten, Raid-Schutz geht dann nicht. Es muss im Discord Developer Portal und in der .env an sein."))]),
                row("Raid-Schutz", "Erkennt Wellen von Beitritten", power),
                row("Welle", "Ab so vielen Beitritten in 30 Sekunden", numberField(raid.joins, data!.limits.joins, "Beitritte in 30 Sekunden", (value) => {
                    raid.joins = value;
                    touch();
                })),
                row(
                    "Im Raid-Modus",
                    "Antippen zum An- und Ausschalten",
                    el(
                        "div",
                        "avchips",
                        chip("invites", "#i-lock", "Einladungen pausieren"),
                        chip("slowmode", "#i-clock", "Slowmode 30 s"),
                        chip("hold", "#i-user-x", "Welle festhalten"),
                        chip("ping", "#i-bell", "Team anpingen"),
                        chip("verification", "#i-shield", "Verifizierung hochsetzen")
                    )
                ),
                row("Ende", "Nach so vielen Minuten ohne neue Beitritte, oder von Hand", numberField(raid.endMinutes, data!.limits.end, "Ende nach Minuten", (value) => {
                    raid.endMinutes = value;
                    touch();
                })),
                row("Von Hand", data!.raid ? `Läuft ${since(data!.raid.since)}` : "Für den Fall, dass du es zuerst merkst", raidButton())
            ),
            card(
                "Anti-Nuke",
                "Der teuerste Hack ist ein gekaperter Team-Account: Er löscht Kanäle, bannt alle oder lädt einen fremden Bot ein. Wer eine Grenze in 10 Minuten überschreitet, verliert sofort alle Rollen und wird festgehalten, egal wer es ist. Nur der Server-Besitzer ist ausgenommen.",
                row("Anti-Nuke", "Zählt gefährliche Aktionen im Audit-Log", switchLabel(nuke.on, "Anti-Nuke anschalten", (on) => {
                    nuke.on = on;
                    touch();
                })),
                el("div", "avlimits", ...limits),
                row("Vertraute Bots", "Bots, die viel auf einmal dürfen, etwa ein Backup-Bot", botPicker()),
                el("p", "avwhy", el("b", "", "Zusammen mit Backups: "), "Vor der ersten gefährlichen Aktion legt der Bot ein Sicherheits-Backup an. Die Meldung nach einem Nuke zeigt es mit einem Knopf zum Zurückladen.")
            ),
        ];
    }

    /* ------------------------------------------------------------
       Protokoll
       ------------------------------------------------------------ */
    function logPane(): HTMLElement[] {
        const list = data!.protocol;

        return [
            card(
                "Protokoll",
                "Alles, was Anti Villain getan hat, die letzten 30 Tage, neueste oben.",
                data!.casesLocked
                    ? el("p", "avempty", icon("#i-lock"), "Privater Bereich: Das Protokoll mit Namen und Gründen siehst du nur mit dem extra Ja.")
                    : list.length
                    ? el("ol", "avlog", ...list.map((entry) => el("li", `is-${entry.kind}`, el("time", "", WHEN.format(new Date(entry.at))), el("b", "", entry.title), ...(entry.detail ? [el("span", "", entry.detail)] : []))))
                    : el("p", "hintline", "Noch nichts passiert.")
            ),
        ];
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    const PANE_PARTS: Record<Pane, () => HTMLElement[]> = { quarantine: quarantinePane, guard: guardPane, bait: baitPane, raid: raidPane, log: logPane };

    function paint(focus?: string): void {
        if (!data || !draft) return;

        save.replaceChildren(icon("#i-check"), document.createTextNode("Speichern"));
        save.disabled = !dirty;

        if (data.off) {
            host.replaceChildren(
                el("div", "notice snnotice", icon("#i-warn"), el("span", "", "Anti Villain ist aus. Erkannt wird nichts mehr, Festgehaltene bleiben es, bis das Team sie hier oder in den Karten freigibt.")),
                lage(),
                ...quarantinePane().slice(0, 2)
            );

            return;
        }

        host.replaceChildren(...readiness(), lage(), nav(), panel(pane, ...PANE_PARTS[pane]()), ...(pane === "log" ? [] : [el("div", "mcsave lvsave", save)]));

        // Neu gezeichnet heißt neue Knöpfe: der Fokus bleibt sonst irgendwo im Nichts.
        if (focus) document.getElementById(focus)?.focus();
    }

    async function refresh(): Promise<void> {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;

        // Ungespeicherte Änderungen bleiben, auch wenn ein Fall dazukommt.
        if (!dirty) draft = structuredClone(answer.settings);

        paint();
    }

    save.addEventListener("click", async () => {
        save.disabled = true;

        const answer = await call<{ settings: ISettings }>("", { action: "save", settings: draft });

        if (!answer) {
            save.disabled = false;

            return;
        }

        data!.settings = answer.settings;
        draft = structuredClone(answer.settings);
        dirty = false;
        toast("info", "Gespeichert", needsSetup() ? "Was noch fehlt, legt „Einrichten“ an." : "Gilt ab sofort.");
        paint();
    });

    window.addEventListener("antivillain:raid", () => void refresh());

    loading(host, 0);
    void refresh();
}
