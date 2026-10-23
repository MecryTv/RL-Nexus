/**
 * Die öffentliche Matchup-Seite eines Servers - /matchups/<id>.
 *
 * Für Captains, Manager und Coaches: Partie eintragen, ändern, absagen und
 * hinterher das Ergebnis melden. Lesen geht ohne Anmeldung, eintragen nicht -
 * der Bot muss wissen, für welches Team jemand spricht, und das steht im Kader
 * der Team-Übersicht.
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

interface IPayload {
    guild: { id: string; name: string; icon: string | null };
    me: { id: string; member: boolean; manage: boolean; teams: ITeam[] } | null;
    matchups: IMatchup[];
    settings: { results: boolean; maxAhead: number; leagues: string[]; remindMinutes: number; channelId: string | null };
    modes: Record<Mode, string>;
    statuses: Record<Status, string>;
    bestOf: number[];
    entryRoles: string[];
    limits: { opponent: number; league: number; note: number };
}

const WHEN = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Anmelden und danach wieder auf dieser Seite landen. */
function login(): string {
    return `${BASE}/login?return=${encodeURIComponent(window.location.pathname)}`;
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

    let data: IPayload | null = null;
    let editing: IMatchup | null = null;

    async function load(): Promise<boolean> {
        const response = await fetch(api, { headers: { Accept: "application/json" } }).catch(() => null);

        if (!response?.ok) {
            host.replaceChildren(
                empty(
                    "Hier kann man gerade nichts eintragen",
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
        const planned = data!.matchups.filter((entry) => entry.status === "planned").length;

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
                el("p", "", data!.me?.teams.length ? (planned ? `${planned} Partie${planned === 1 ? "" : "n"} stehen an` : "Noch nichts eingetragen") : "Matchups eintragen")
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
                el("span", `apchip${entry.status === "planned" ? " is-open" : entry.status === "played" ? " is-accepted" : ""}`, data!.statuses[entry.status])
            )
        );

        if (entry.status === "cancelled") return box;

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

    function list(): HTMLElement {
        const rows = data!.matchups;

        return el(
            "div",
            "apsheet",
            el("h2", "apsheet__head", "Deine Partien"),
            rows.length
                ? el("div", "aplist", ...rows.map(row))
                : el("div", "tkempty", icon("#i-swords"), el("span", "", "Noch nichts eingetragen."))
        );
    }

    /* ------------------------------------------------------------
       Zeichnen
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        const me = data.me;

        if (!me) {
            const go = button("btn btn--primary", icon("#i-discord"), "Mit Discord anmelden");

            go.addEventListener("click", () => (window.location.href = login()));

            host.replaceChildren(
                header(),
                el(
                    "div",
                    "apsheet",
                    el("h2", "apsheet__head", "Anmelden"),
                    el("p", "apfield__hint", "Der Bot muss wissen, für welches Team du sprichst – das steht im Kader der Team-Übersicht."),
                    el("div", "apform__foot", go)
                )
            );

            return;
        }

        if (!me.member) {
            host.replaceChildren(header(), empty("Du bist hier nicht dabei", "Auf diesem Server kann nur eintragen, wer auch Mitglied ist."));

            return;
        }

        if (!me.teams.length) {
            host.replaceChildren(
                header(),
                empty(
                    "Kein Team gefunden",
                    `Eintragen darf, wer im Kader als ${data.entryRoles.join(", ")} steht. Sag jemandem vom Team Bescheid, dass du dort fehlst.`
                )
            );

            return;
        }

        host.replaceChildren(header(), el("div", "apsheet", sheet()), list());
    }

    if (await load()) paint();
}
