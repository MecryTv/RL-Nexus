/**
 * Die öffentliche Matchup-Seite eines Servers - /matchups/<id>.
 *
 * Zwei Reiter: was ansteht und die Ergebnisse mit Bilanz je Team. Lesen geht
 * ohne Anmeldung, die Notiz sieht nur das Team. Captains, Manager und Coaches
 * tragen hier ein, ändern, sagen ab und melden das Ergebnis - der Bot muss
 * wissen, für welches Team jemand spricht, und das steht im Kader der
 * Team-Übersicht. ?reiter=ergebnisse öffnet den zweiten Reiter, ?partie=<id>
 * das Formular dieser Partie.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { button, el, localInput } from "../core/Ui.js";

type Mode = "1v1" | "2v2" | "3v3" | "4v4";
type Status = "planned" | "played" | "cancelled";

interface ITeam {
    id: number;
    name: string;
    tag: string;
    role: string;
}

interface IMatchup {
    id: number;
    teamId: number | null;
    teamName: string;
    opponent: string;
    league: string;
    mode: Mode;
    bestOf: number;
    at: number;
    stream: string | null;
    note: string;
    status: Status;
    score: { us: number; them: number } | null;
    createdName: string;
}

type Outcome = "w" | "l" | "d";

interface IRecordEntry {
    teamId: number | null;
    name: string;
    text: string;
    record: { form: Outcome[] };
}

interface IPayload {
    guild: { id: string; name: string; icon: string | null };
    me: { id: string; member: boolean; manage: boolean; teams: ITeam[] } | null;
    /** Die eigenen Partien (auch ältere ohne Ergebnis). */
    matchups: IMatchup[];
    /** Alles, was ansteht - ohne fremde Notizen. */
    upcoming: IMatchup[];
    results: { rows: IMatchup[]; total: number; page: number; size: number };
    records: IRecordEntry[];
    settings: { results: boolean; maxAhead: number; leagues: string[]; remindMinutes: number; channelId: string | null };
    modes: Record<Mode, string>;
    statuses: Record<Status, string>;
    bestOf: number[];
    entryRoles: string[];
    limits: { opponent: number; league: number; note: number };
}

const WHEN = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const OUTCOME: Record<Outcome, [string, string]> = { w: ["S", "Sieg"], l: ["N", "Niederlage"], d: ["U", "Unentschieden"] };

function outcomeOf(score: { us: number; them: number }): Outcome {
    return score.us > score.them ? "w" : score.us < score.them ? "l" : "d";
}

/** Wie LIVE_HOURS im Bot (src/constants/Matchups.ts) - die Datei lädt Node-Module und taugt nicht für den Browser. */
const LIVE_HOURS = 3;

/**
 * Der Stand einer Partie. Angepfiffen und ohne Ergebnis heißt sie „Läuft“, wie
 * „🔴 Läuft gerade“ in Discord - nach LIVE_HOURS „Ergebnis fehlt“ (W-0027).
 */
function statusLabel(entry: { status: Status; at: number }, labels: Record<Status, string>): string {
    if (entry.status !== "planned" || entry.at > Date.now()) return labels[entry.status];

    return Date.now() < entry.at + LIVE_HOURS * 3_600_000 ? "Läuft" : "Ergebnis fehlt";
}

/** Anmelden und danach wieder auf dieser Seite landen. */
function login(): string {
    // Mit ?partie= und ?reiter=: wer zum Ändern einer Partie kam, landet nach dem Anmelden wieder dort (W-0027).
    return `${BASE}/login?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

function field(label: string, hint: string, control: HTMLElement): HTMLElement {
    return el("label", "apfield", el("span", "apfield__label", label), ...(hint ? [el("p", "apfield__hint", hint)] : []), control);
}

export async function renderMatchupsPage(): Promise<void> {
    const host = need<HTMLElement>("#matchups");
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    const api = `${BASE}/api/public/matchups/${encodeURIComponent(id)}`;

    const params = new URLSearchParams(window.location.search);

    let data: IPayload | null = null;
    let editing: IMatchup | null = null;
    let tab: "up" | "res" = params.get("reiter") === "ergebnisse" ? "res" : "up";
    let page = 1;

    async function load(): Promise<boolean> {
        const response = await fetch(`${api}${page > 1 ? `?seite=${page}` : ""}`, { headers: { Accept: "application/json" } }).catch(() => null);

        if (!response?.ok) {
            host.replaceChildren(
                empty(
                    "Diese Seite ist gerade zu",
                    response?.status === 404
                        ? "Entweder ist das Matchup-Modul auf diesem Server aus, oder es nimmt gerade nichts an."
                        : "Der Bot antwortet gerade nicht. Lade die Seite in einem Moment neu."
                )
            );

            return false;
        }

        data = (await response.json()) as IPayload;

        return true;
    }

    async function send(body: Record<string, unknown>, done: string): Promise<boolean> {
        const response = await fetch(api, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }).catch(() => null);

        if (!response) {
            toast("info", "Keine Verbindung", "Der Bot antwortet gerade nicht.");

            return false;
        }

        const answer = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };

        if (!response.ok) {
            toast("info", "Das ging nicht", answer.error ?? answer.hint ?? "Versuch es noch einmal.");

            return false;
        }

        toast("info", done, "Das Team sieht es in Discord.");

        editing = null;

        if (await load()) paint();

        return true;
    }

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function header(): HTMLElement {
        const crest = el("span", "aphead__crest");
        const planned = upcoming().length;

        if (data!.guild.icon) crest.style.backgroundImage = `url("${data!.guild.icon.replace(/["\\]/g, "")}")`;
        else crest.textContent = data!.guild.name.slice(0, 1).toUpperCase();

        return el(
            "div",
            "aphead",
            crest,
            el(
                "div",
                "aphead__text",
                el("h1", "", data!.guild.name),
                el("p", "", planned ? `${planned} Partie${planned === 1 ? " steht" : "n stehen"} an` : "Gerade steht nichts an")
            )
        );
    }

    /* ------------------------------------------------------------
       Das Formular
       ------------------------------------------------------------ */
    function sheet(): HTMLElement {
        const me = data!.me!;
        const box = el("form", "apform");
        const current = editing;
        const team = el("select", "pick");
        const opponent = el("input", "text");
        const league = el("input", "text");
        const mode = el("select", "pick");
        const best = el("select", "pick");
        const at = el("input", "text");
        const stream = el("input", "text");
        const note = el("textarea", "text tkarea");

        for (const entry of me.teams) team.append(new Option(`${entry.name}${entry.tag ? ` (${entry.tag})` : ""}`, String(entry.id), false, current?.teamId === entry.id));

        team.setAttribute("aria-label", "Für welches Team");

        opponent.type = "text";
        opponent.maxLength = data!.limits.opponent;
        opponent.required = true;
        opponent.placeholder = "Name des gegnerischen Teams";
        opponent.value = current?.opponent ?? "";

        league.type = "text";
        league.maxLength = data!.limits.league;
        league.placeholder = "z. B. RLCS Quali, Liga Spieltag 3, Scrim";
        league.value = current?.league ?? "";
        league.setAttribute("list", "mu-leagues");

        for (const [value, label] of Object.entries(data!.modes)) mode.append(new Option(label, value, false, (current?.mode ?? "3v3") === value));

        mode.setAttribute("aria-label", "Modus");

        for (const value of data!.bestOf) best.append(new Option(value ? `Best of ${value}` : "— nicht festgelegt —", String(value), false, (current?.bestOf ?? 0) === value));

        best.setAttribute("aria-label", "Best-of");

        at.type = "datetime-local";
        at.required = true;
        at.value = localInput(current?.at ?? Date.now() + 3_600_000);

        stream.type = "url";
        stream.maxLength = 512;
        stream.placeholder = "https://twitch.tv/… (freiwillig)";
        stream.value = current?.stream ?? "";

        note.rows = 3;
        note.maxLength = data!.limits.note;
        note.placeholder = "Region, Ersatzspieler, Absprachen … (freiwillig)";
        note.value = current?.note ?? "";

        const save = button("btn btn--primary", icon("#i-check"), current ? "Änderung speichern" : "Partie eintragen") as HTMLButtonElement;

        save.type = "submit";

        const cancel = button("btn btn--quiet", icon("#i-x"), "Abbrechen");

        cancel.addEventListener("click", () => {
            editing = null;
            paint();
        });

        const leagues = el("datalist");

        leagues.id = "mu-leagues";

        for (const entry of data!.settings.leagues) leagues.append(new Option(entry, entry));

        box.addEventListener("submit", async (event) => {
            event.preventDefault();

            const when = new Date(at.value).getTime();

            if (!Number.isFinite(when)) {
                toast("info", "Zeit fehlt", "Setz Datum und Uhrzeit.");

                return;
            }

            save.disabled = true;

            const matchup = {
                teamId: Number(team.value),
                opponent: opponent.value,
                league: league.value,
                mode: mode.value,
                bestOf: Number(best.value),
                at: when,
                stream: stream.value,
                note: note.value,
            };

            const ok = await send(
                current ? { action: "save", id: current.id, matchup } : { action: "create", matchup },
                current ? "Geändert" : "Eingetragen"
            );

            save.disabled = false;

            if (ok) window.scrollTo({ top: 0, behavior: "smooth" });
        });

        box.append(
            el("h2", "apsheet__head", current ? "Partie ändern" : "Neue Partie"),
            leagues,
            ...(me.teams.length > 1 || me.manage ? [field("Für welches Team", "", team)] : []),
            field("Gegner", "", opponent),
            field("Liga oder Turnier", "Freilassen, wenn es ein Freundschaftsspiel ist", league),
            field("Anpfiff", `Höchstens ${data!.settings.maxAhead} Tage im Voraus – in deiner Zeitzone`, at),
            el("div", "apfield", el("span", "apfield__label", "Modus und Best-of"), el("div", "lftag", mode, best)),
            field("Stream-Link", "Steht als „Live“ in der Nachricht", stream),
            field("Notiz", "", note),
            el("div", "apform__foot", save, ...(current ? [cancel] : []))
        );

        return box;
    }

    /* ------------------------------------------------------------
       Was ansteht
       ------------------------------------------------------------ */
    function row(entry: IMatchup): HTMLElement {
        const when = WHEN.format(new Date(entry.at));
        const score = entry.score ? ` · ${entry.score.us}:${entry.score.them}` : "";
        const box = el(
            "div",
            "snitem",
            el(
                "div",
                "snitem__head",
                el("span", "snitem__face", icon("#i-swords")),
                el(
                    "div",
                    "snitem__name",
                    el("b", "", `${entry.teamName} vs. ${entry.opponent}`),
                    el("span", "", `${when} · ${data!.modes[entry.mode]}${entry.bestOf ? ` · Bo${entry.bestOf}` : ""}${entry.league ? ` · ${entry.league}` : ""}${score}`)
                ),
                el("span", `apchip${entry.status === "planned" ? " is-open" : entry.status === "played" ? " is-accepted" : ""}`, statusLabel(entry, data!.statuses))
            )
        );

        if (entry.note) box.append(el("p", "apfield__hint", entry.note));
        if (entry.status === "cancelled" || !can(entry)) return box;

        const actions = el("div", "apform__foot");

        if (entry.status === "planned") {
            const change = button("btn btn--quiet", icon("#i-sliders"), "Ändern");
            const off = button("btn btn--quiet", icon("#i-x"), "Absagen");

            change.addEventListener("click", () => {
                editing = entry;
                paint();
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            off.addEventListener("click", () => void send({ action: "cancel", id: entry.id }, "Abgesagt"));

            actions.append(change, off);
        }

        // Ergebnis: erst nach Anpfiff, und nur wenn der Server es zulaesst.
        if (data!.settings.results && entry.status === "planned" && entry.at <= Date.now()) {
            const us = el("input", "text text--emoji");
            const them = el("input", "text text--emoji");
            const done = button("btn btn--primary", icon("#i-check"), "Ergebnis melden");

            for (const input of [us, them]) {
                input.type = "number";
                input.min = "0";
                input.max = "99";
                input.value = "0";
            }

            us.setAttribute("aria-label", "Eigene Punkte");
            them.setAttribute("aria-label", "Punkte des Gegners");

            done.addEventListener("click", () => void send({ action: "report", id: entry.id, us: Number(us.value), them: Number(them.value) }, "Ergebnis steht"));

            actions.append(el("div", "lftag", us, el("span", "apfield__hint", ":"), them, done));
        }

        if (actions.childElementCount) box.append(el("div", "snitem__body", actions));

        return box;
    }

    /** Darf ich diese Partie ändern? Die Prüfung macht der Server noch einmal. */
    function can(entry: IMatchup): boolean {
        const me = data!.me;

        return Boolean(me?.member && (me.manage || me.teams.some((team) => team.id === entry.teamId)));
    }

    /** Was ansteht, dazu die eigenen geplanten ohne Ergebnis - die braucht es zum Melden. */
    function upcoming(): IMatchup[] {
        const rows = new Map<number, IMatchup>();

        for (const entry of [...data!.upcoming, ...data!.matchups.filter((match) => match.status === "planned")]) rows.set(entry.id, entry);

        return [...rows.values()].sort((a, b) => a.at - b.at);
    }

    function list(): HTMLElement {
        const rows = upcoming();

        return el(
            "div",
            "apsheet",
            el("h2", "apsheet__head", "Was ansteht"),
            rows.length ? el("div", "aplist", ...rows.map(row)) : el("div", "tkempty", icon("#i-swords"), el("span", "", "Gerade steht nichts an."))
        );
    }

    /* ------------------------------------------------------------
       Ergebnisse
       ------------------------------------------------------------ */
    function record(entry: IRecordEntry): HTMLElement {
        const form = el("div", "muform", ...entry.record.form.map((outcome) => el("i", `is-${outcome}`, OUTCOME[outcome][0])));

        form.setAttribute("aria-label", `Die letzten Spiele: ${entry.record.form.map((outcome) => OUTCOME[outcome][1]).join(", ")}`);

        return el("div", "murec__card", el("b", "murec__name", entry.name), el("span", "murec__line", entry.text), form);
    }

    function result(entry: IMatchup): HTMLElement {
        const score = entry.score ?? { us: 0, them: 0 };
        const outcome = outcomeOf(score);

        return el(
            "div",
            "mures__row",
            el("span", "mures__when", WHEN.format(new Date(entry.at))),
            el("span", "mures__who", el("b", "", entry.teamName), ` vs. ${entry.opponent}`, el("small", "", `${entry.league || "Freundschaftsspiel"}${entry.bestOf ? ` · Bo${entry.bestOf}` : ""}`)),
            el("span", `mures__score is-${outcome}`, `${score.us}:${score.them} ${OUTCOME[outcome][1]}`)
        );
    }

    function results(): HTMLElement {
        const { rows, total, size } = data!.results;
        const box = el("div", "apsheet");

        if (!rows.length) return el("div", "apsheet", el("div", "tkempty", icon("#i-swords"), el("span", "", "Noch keine Ergebnisse.")));

        box.append(el("div", "murec", ...data!.records.map(record)), el("div", "mures", ...rows.map(result)));

        if (total > size) {
            const pages = Math.ceil(total / size);
            const turn = (to: number, label: string): HTMLButtonElement => {
                const knob = button("btn btn--quiet", label);

                knob.disabled = to < 1 || to > pages;
                knob.addEventListener("click", async () => {
                    page = to;

                    if (await load()) paint();
                });

                return knob;
            };

            box.append(el("div", "apform__foot", turn(page - 1, "Neuere"), el("span", "apfield__hint", `Seite ${page} von ${pages}`), turn(page + 1, "Ältere")));
        }

        return box;
    }

    function tabs(): HTMLElement {
        const bar = el("div", "tktabs");
        const entries: ["up" | "res", string, string, number][] = [
            ["up", "#i-swords", "Anstehend", upcoming().length],
            ["res", "#i-check", "Ergebnisse", data!.results.total],
        ];

        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Matchups");
        bar.append(
            ...entries.map(([id, symbol, label, count]) => {
                const knob = button("tktab", icon(symbol), el("span", "", label), el("span", "tktab__count", String(count)));

                knob.setAttribute("role", "tab");
                knob.setAttribute("aria-selected", String(id === tab));
                knob.addEventListener("click", () => {
                    if (tab === id) return;

                    tab = id;
                    window.history.replaceState(null, "", id === "res" ? "?reiter=ergebnisse" : window.location.pathname);
                    paint();
                });

                return knob;
            })
        );

        return bar;
    }

    /* ------------------------------------------------------------
       Zeichnen
       ------------------------------------------------------------ */
    /** Über der Liste: das Formular, wer eintragen darf - sonst ein Satz, warum nicht. */
    function entry(): HTMLElement {
        const me = data!.me;

        if (me?.member && me.teams.length) return el("div", "apsheet", sheet());

        if (!me) {
            const go = button("btn btn--quiet", icon("#i-discord"), "Mit Discord anmelden");

            go.addEventListener("click", () => (window.location.href = login()));

            return el("div", "apsheet", el("p", "apfield__hint", "Eintragen? Der Bot muss wissen, für welches Team du sprichst – das steht im Kader der Team-Übersicht."), el("div", "apform__foot", go));
        }

        return el(
            "div",
            "apsheet",
            el(
                "p",
                "apfield__hint",
                me.member
                    ? `Eintragen darf, wer im Kader als ${data!.entryRoles.join(", ")} steht. Fehlst du dort, sag jemandem vom Team Bescheid.`
                    : "Eintragen kann nur, wer auf diesem Server Mitglied ist."
            )
        );
    }

    function paint(): void {
        if (!data) return;

        host.replaceChildren(header(), tabs(), ...(tab === "res" ? [results()] : [entry(), list()]));
    }

    if (await load()) {
        // Aus Discord: „Ändern“ öffnet das Formular dieser Partie.
        const wanted = Number(params.get("partie"));

        editing = upcoming().find((match) => match.id === wanted && can(match)) ?? null;
        paint();
    }
}
