/**
 * Abschnitte: Backups und Meine Backups (festes Modul, Spec Backup-Modul im
 * Admin Dashboard).
 *
 * "Backups" ist die Seite zum Einstellen: Kennzahlen, von Hand sichern, die
 * zwei neuesten und die automatischen Backups. "Meine Backups" ist die Liste
 * mit Streifen der letzten 14 Tage, Filter, Ansehen, Löschen und dem
 * Zurückladen in drei Schritten, aufgeklappt unter dem Backup.
 *
 * Die Arbeit macht das Admin Dashboard. Diese Seite spricht nur die Modul-Route
 * des Bots an, die weiterreicht, und sieht nur, was der Server selbst
 * angelegt hat.
 */

import { BASE } from "../core/Base.js";
import { icon, maybe, need } from "../core/Dom.js";
import { numbers } from "../core/Format.js";
import { clickSound } from "../core/Sound.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, loading, row, select, stat, toggle, WHEN } from "../core/Ui.js";

type Kind = "nacht" | "vorher" | "hand" | "plan";
type Every = "tag" | "3tage" | "woche" | "monat";

interface IBackup {
    id: number;
    guildName: string;
    kind: Kind;
    note: string | null;
    byName: string | null;
    createdAt: string;
    bytes: number;
    counts: Record<string, number>;
}

interface IPlan {
    enabled: boolean;
    every: Every;
    weekday: number;
    hour: number;
    keep: number;
}

interface IPlanState {
    plan: IPlan;
    next: string | null;
    lastOk: string | null;
    lastError: { at: string; reason: string } | null;
}

interface IPayload {
    guildId: string;
    plan: IPlanState;
    backups: IBackup[];
    hand: { used: number; max: number };
}

interface IDetail extends IBackup {
    tables: Record<string, number>;
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

const KIND_TEXT: Record<Kind, string> = { nacht: "nachts", vorher: "vor dem Zurückladen", hand: "von Hand", plan: "automatisch" };
const KIND_ICON: Record<Kind, string> = { nacht: "#i-clock", vorher: "#i-shield", hand: "#i-plus", plan: "#i-clock" };
const KIND_TONE: Record<Kind, string> = { nacht: "auto", vorher: "safe", hand: "hand", plan: "auto" };
const EVERY: [Every, string][] = [
    ["tag", "Jeden Tag"],
    ["3tage", "Alle 3 Tage"],
    ["woche", "Jede Woche"],
    ["monat", "Jeden Monat (am 1.)"],
];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const KEEP_MAX = 14;
const DAY = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "short" });
const SHORT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });

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

/** Ein Satz zu den automatischen Backups: wann das nächste kommt und wie weit sie zurückreichen. */
function planText(state: IPlanState): string {
    const { plan, next } = state;
    if (!plan.enabled) return "Aus. Gesichert wird nur, wenn du es von Hand tust.";

    const when = next ? `am ${DAY.format(new Date(next))} um ${plan.hour}:00` : `um ${plan.hour}:00`;
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

function line(backup: IBackup, extra: string[] = []): HTMLElement {
    const small = el("small", "");

    if (backup.note) small.append(el("span", "bk-note", `„${backup.note}“`), " · ");
    small.append([KIND_TEXT[backup.kind], ...(backup.byName ? [backup.byName] : []), ...extra].join(" · "));

    return el("div", "", el("b", "", WHEN.format(new Date(backup.createdAt))), small);
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
   Backups: Kennzahlen, von Hand sichern, automatisch sichern
   ================================================================== */

export function renderBackups(guildId: string): void {
    const host = need<HTMLElement>("#backupBody");
    const note = need<HTMLElement>("#backupNote");
    const call = api(base(guildId), note);

    let data: IPayload | null = null;

    function stats(): HTMLElement {
        const last = data!.backups[0] ?? null;
        const automatic = data!.backups.filter((backup) => backup.kind === "plan").length;

        return el(
            "div",
            "tkhead",
            stat("#i-check", "Letztes Backup", last ? `${WHEN.format(new Date(last.createdAt))}, ${KIND_TEXT[last.kind]}` : "noch keins", last ? "is-ok" : ""),
            stat("#i-clock", "Nächstes", data!.plan.next ? `${DAY.format(new Date(data!.plan.next))} ${data!.plan.plan.hour}:00` : "aus"),
            stat("#i-plus", "Von Hand", `${data!.hand.used} von ${data!.hand.max}`, data!.hand.used >= data!.hand.max ? "is-warn" : ""),
            stat("#i-archive", "Automatisch", `${automatic} gespeichert`)
        );
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
        const input = el("input", "text");
        const go = button("btn btn--primary", icon("#i-plus"), "Backup anlegen");
        const bar = el("i", "");

        input.type = "text";
        input.maxLength = 200;
        input.placeholder = "vor dem Umbau der Rollen";
        input.setAttribute("aria-label", "Notiz, freiwillig");
        go.disabled = full;
        bar.style.width = `${Math.min(100, (data!.hand.used / data!.hand.max) * 100)}%`;

        go.addEventListener("click", async () => {
            go.disabled = true;
            clickSound("primary");

            const created = await call<IBackup>("", { action: "create", note: input.value.trim() || null });

            if (created) {
                toast("info", "Backup angelegt", "Es steht unter „Meine Backups“ und bleibt, bis du es löschst.");
                await load();
            } else {
                go.disabled = full;
            }
        });

        return card(
            "Jetzt sichern",
            full ? `Alle ${data!.hand.max} Plätze sind belegt. Lösch unter „Meine Backups“ erst ein altes Backup.` : "Am besten vor größeren Umbauten. Ein Backup von Hand bleibt, bis du es löschst.",
            el("div", "bk-now", el("label", "", "Notiz, freiwillig", input), go),
            el("div", "bk-quota", el("span", "", `${data!.hand.used} von ${data!.hand.max} Plätzen belegt`), el("span", "bk-quota__bar", bar))
        );
    }

    function recent(): HTMLElement {
        const list = el("div", "bk-list");
        const more = el("a", "bk-more", `Alle ${data!.backups.length} Backups ansehen und zurückladen`, icon("#i-arrow"));

        for (const backup of data!.backups.slice(0, 2)) list.append(el("div", "bk-item", kindBox(backup.kind), line(backup), el("span", "")));
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

        days.setAttribute("role", "group");
        days.setAttribute("aria-label", "Wochentag");

        async function save(): Promise<void> {
            const saved = await call<IPlanState>("", { action: "plan", plan });

            if (!saved) return;

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

        return card(
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
            el("div", "bk-next", icon("#i-clock"), sentence)
        );
    }

    function draw(): void {
        const problem = failure();

        host.replaceChildren(stats(), ...(problem ? [problem] : []), el("div", "bk-grid", el("div", "bk-col", now(), recent()), automatic()));
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
   Meine Backups: Liste, Ansehen, Löschen, Zurückladen
   ================================================================== */

export function renderBackupList(guildId: string): void {
    const host = need<HTMLElement>("#backupListBody");
    const note = need<HTMLElement>("#backupListNote");
    const call = api(base(guildId), note);

    let data: IPayload | null = null;
    let filter: "alle" | Kind = "alle";
    /** Das Backup, dessen Zurückladen gerade offen ist, und die Bereiche, die es vorschlagen soll. */
    let restoring: { id: number; areas: Set<string> | null } | null = null;
    let viewing: number | null = null;

    function strip(): HTMLElement {
        const days = el("div", "bk-strip");

        days.setAttribute("aria-label", "Die letzten 14 Tage");

        for (let back = 13; back >= 0; back--) {
            const day = new Date();
            day.setDate(day.getDate() - back);
            const same = (backup: IBackup): boolean => new Date(backup.createdAt).toDateString() === day.toDateString();
            const hand = data!.backups.some((backup) => backup.kind === "hand" && same(backup));
            const auto = data!.backups.some((backup) => backup.kind !== "hand" && same(backup));
            const cell = el("i", hand ? "hand" : auto ? "ok" : "");

            cell.title = `${SHORT.format(day)}: ${hand ? "von Hand gesichert" : auto ? "automatisch gesichert" : "kein Backup"}`;
            days.append(cell);
        }

        return el(
            "div",
            "",
            days,
            el("div", "bk-legend", el("span", "", el("i", "ok"), "automatisch"), el("span", "", el("i", "hand"), "von Hand"), el("span", "", el("i", ""), "nichts"))
        );
    }

    function filters(): HTMLElement {
        const bar = el("div", "bk-filter");
        const count = (kind: Kind): number => data!.backups.filter((backup) => backup.kind === kind).length;
        const entries: ["alle" | Kind, string, number][] = [
            ["alle", "Alle", data!.backups.length],
            ["hand", "Von Hand", count("hand")],
            ["plan", "Automatisch", count("plan")],
            ["vorher", "Vor dem Zurückladen", count("vorher")],
        ];

        for (const [value, label, total] of entries) {
            const tab = button(filter === value ? "is-on" : "", `${label} ${total}`);

            tab.setAttribute("aria-pressed", String(filter === value));
            tab.addEventListener("click", () => {
                filter = value;
                draw();
            });
            bar.append(tab);
        }

        return bar;
    }

    function keepText(backup: IBackup): string[] {
        if (backup.kind === "vorher") return ["bleibt 72 Stunden"];
        if (backup.kind === "plan") return [`bleibt, bis ${data!.plan.plan.keep} neuere da sind`];

        return [];
    }

    function item(backup: IBackup): HTMLElement[] {
        const open = restoring?.id === backup.id;
        const back = button(`btn ${open ? "btn--primary" : "btn--quiet"}`, icon("#i-refresh"), "Zurückladen");
        const look = button("btn btn--ghost", icon("#i-eye"));
        const actions = el("div", "bk-acts", back, look);

        look.setAttribute("aria-label", "Inhalt ansehen");
        look.title = "Inhalt ansehen";
        back.addEventListener("click", () => {
            restoring = open ? null : { id: backup.id, areas: null };
            draw();
        });
        look.addEventListener("click", () => {
            viewing = viewing === backup.id ? null : backup.id;
            draw();
        });

        if (backup.kind === "hand") {
            actions.append(
                confirmButton("btn btn--ghost btn--icon is-danger", "#i-trash", "", "Wirklich löschen?", async () => {
                    const done = await call<{ ok: true }>("", { action: "delete", backup: backup.id });

                    if (done) await load();
                })
            );
        }

        const parts: HTMLElement[] = [el("div", `bk-item${open ? " is-open" : ""}`, kindBox(backup.kind), line(backup, [kilobytes(backup.bytes), ...keepText(backup)]), actions)];

        if (viewing === backup.id) parts.push(detail(backup));
        if (open) parts.push(restore(backup));

        return parts;
    }

    /** Was im Backup steckt, je Bereich. Die Tabellen im Einzelnen holt ein eigener Aufruf. */
    function detail(backup: IBackup): HTMLElement {
        const box = el("div", "bk-detail");
        const list = el("ul", "bk-counts");

        for (const area of AREAS) list.append(el("li", "", el("span", "", area.label), el("b", "", numbers.format(backup.counts[area.id] ?? 0))));
        box.append(list);

        void call<IDetail>(`?backup=${backup.id}`).then((found) => {
            if (!found) return;

            const tables = Object.entries(found.tables).filter(([, rows]) => rows > 0);
            box.append(el("p", "hintline", tables.length ? `Tabellen: ${tables.map(([table, rows]) => `${table} ${numbers.format(rows)}`).join(" · ")}` : "Das Backup ist leer."));
        });

        return box;
    }

    /** Zurückladen in drei Schritten. Schritt 1 ist das Backup, auf das geklickt wurde. */
    function restore(backup: IBackup): HTMLElement {
        const panel = el("div", "bk-restore");
        const chosen = restoring?.areas ?? new Set(AREAS.filter((area) => !area.members && (backup.counts[area.id] ?? 0) > 0).map((area) => area.id));
        let step: 2 | 3 = 2;

        function steps(): HTMLElement {
            const entries: [number, string][] = [
                [1, `Backup: ${WHEN.format(new Date(backup.createdAt))}`],
                [2, "Was zurückkommt"],
                [3, "Prüfen und los"],
            ];

            return el(
                "div",
                "bk-steps",
                ...entries.map(([value, label]) => el("div", `bk-step${value < step ? " done" : value === step ? " now" : ""}`, el("span", "", `Schritt ${value}`), el("b", "", label)))
            );
        }

        function areaCard(area: (typeof AREAS)[number]): HTMLElement {
            const on = chosen.has(area.id);
            const count = backup.counts[area.id] ?? 0;
            const box = el("label", `bk-area${on ? " is-on" : ""}`);
            const knob = toggle(on, area.label, (value) => {
                if (value) chosen.add(area.id);
                else chosen.delete(area.id);
                draw2();
            });

            box.append(
                el("span", "bk-area__top", el("b", "", area.label), knob),
                el("small", "", count === 0 ? "Im Backup leer: zurückladen löscht, was jetzt da ist." : `${numbers.format(count)} Einträge`)
            );
            // duration() endet auf „Std.“ oder „Min.“: kein Punkt dahinter.
            if (area.members && on) box.append(el("small", "loss", `Was seit ${DAY.format(new Date(backup.createdAt))} dazukam, ist danach weg: ${duration(Date.now() - Date.parse(backup.createdAt))}`));

            return box;
        }

        function draw2(): void {
            const next = button("btn btn--primary", "Weiter zu Schritt 3", icon("#i-arrow"));
            const cancel = button("btn btn--quiet", "Abbrechen");

            next.disabled = chosen.size === 0;
            next.addEventListener("click", () => {
                step = 3;
                draw3();
            });
            cancel.addEventListener("click", () => {
                restoring = null;
                draw();
            });

            panel.replaceChildren(
                steps(),
                el("p", "bk-group", "Einstellungen und Inhalte"),
                el("div", "bk-areas", ...AREAS.filter((area) => !area.members).map(areaCard)),
                el("p", "bk-group", "Daten der Mitglieder"),
                el("div", "bk-areas", ...AREAS.filter((area) => area.members).map(areaCard)),
                el(
                    "div",
                    "bk-sum",
                    el("p", "", el("b", "", `${chosen.size} von ${AREAS.length} Bereichen.`), " Vorher sichert der Bot den jetzigen Stand, du kannst also jederzeit zurück."),
                    cancel,
                    next
                )
            );
        }

        function draw3(): void {
            const input = el("input", "text");
            const go = button("btn btn--primary", icon("#i-refresh"), "Zurückladen");
            const backStep = button("btn btn--quiet", "Zurück");
            const matches = (): boolean => input.value.trim().toLowerCase() === backup.guildName.trim().toLowerCase();

            input.type = "text";
            input.autocomplete = "off";
            input.setAttribute("aria-label", "Name des Servers");
            go.disabled = true;
            input.addEventListener("input", () => {
                go.disabled = !matches();
            });
            backStep.addEventListener("click", () => {
                step = 2;
                draw2();
            });
            go.addEventListener("click", async () => {
                go.disabled = true;
                go.lastChild!.textContent = "Wird zurückgeladen …";
                clickSound("primary");

                const result = await call<IResult>("", { action: "restore", backup: backup.id, areas: AREAS.filter((area) => chosen.has(area.id)).map((area) => area.id), confirm: input.value });

                if (result) {
                    done(result);
                } else {
                    go.disabled = !matches();
                    go.lastChild!.textContent = "Zurückladen";
                }
            });

            panel.replaceChildren(
                steps(),
                el("p", "bk-group", "Diese Bereiche kommen zurück"),
                el("ul", "bk-counts", ...AREAS.filter((area) => chosen.has(area.id)).map((area) => el("li", "", el("span", "", area.label), el("b", "", numbers.format(backup.counts[area.id] ?? 0))))),
                el("p", "hintline", "Alles andere bleibt, wie es ist. Vorher sichert der Bot den jetzigen Stand als eigenes Backup. Fehlende Panels postet er danach neu."),
                el("label", "bk-confirm", "Zum Bestätigen den Namen des Servers eintippen", input, el("small", "", `„${backup.guildName}“, Groß- und Kleinschreibung egal.`)),
                el("div", "bk-sum", el("p", "", `${chosen.size === 1 ? "Ein Bereich kommt" : `${chosen.size} Bereiche kommen`} auf den Stand vom ${WHEN.format(new Date(backup.createdAt))}.`), backStep, go)
            );
            input.focus();
        }

        function done(result: IResult): void {
            const report = result.bot;
            const lines = [
                ...(report.reposted.length ? [`Neu gepostet: ${report.reposted.join(", ")}`] : []),
                ...(report.removed.length ? [`Gelöscht: ${report.removed.join(", ")}`] : []),
                ...report.problems.map((problem) => `Problem: ${problem}`),
            ];
            const undo = button("btn btn--quiet", icon("#i-refresh"), "Rückgängig machen");
            const close = button("btn btn--primary", "Fertig");
            const areas = new Set(result.areas.map((entry) => entry.area));

            undo.addEventListener("click", async () => {
                restoring = { id: result.safetyId, areas };
                filter = "alle";
                await load();
            });
            close.addEventListener("click", async () => {
                restoring = null;
                await load();
            });

            panel.replaceChildren(
                el("p", "bk-group", "Zurückgeladen"),
                el(
                    "ul",
                    "bk-counts",
                    ...result.areas.map((entry) => el("li", "", el("span", "", AREAS.find((area) => area.id === entry.area)?.label ?? entry.area), el("b", "", `${numbers.format(entry.rows)} Einträge`)))
                ),
                el("p", "hintline", report.reached && lines.length === 0 ? "Alle Panels waren an ihrem Platz." : lines.join(" · ")),
                el("p", "hintline", "Der Stand davor liegt als Backup bereit. Damit lässt sich das Zurückladen rückgängig machen."),
                el("div", "bk-sum", el("p", "", "Passt alles? Dann bist du fertig."), undo, close)
            );
        }

        draw2();

        return panel;
    }

    function draw(): void {
        const shown = data!.backups.filter((backup) => filter === "alle" || backup.kind === filter);
        const list = el("div", "bk-list", ...shown.flatMap(item));

        if (shown.length === 0) list.append(el("p", "hintline", data!.backups.length === 0 ? "Noch kein Backup. Unter „Backups“ legst du eins an." : "Davon gibt es gerade keins."));

        host.replaceChildren(
            card(
                "Alle Backups",
                "",
                strip(),
                filters(),
                list,
                el("p", "bk-info", icon("#i-info"), el("span", "", "Zusätzlich sichert RL Nexus jede Nacht alle Server für den Notfall. Diese Backups siehst du hier nicht. Wenn du eins brauchst, melde dich beim Support."))
            )
        );
    }

    async function load(): Promise<void> {
        const answer = await call<IPayload>("");

        if (!answer) {
            host.replaceChildren();
            return;
        }

        data = answer;
        if (restoring && !data.backups.some((backup) => backup.id === restoring!.id)) restoring = null;
        draw();
    }

    loading(host);
    void load();
    reloadWhenShown(host, load);
}
