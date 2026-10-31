/**
 * Abschnitt: Matchups.
 *
 * Zwei Punkte in der Leiste: die Grundlagen (Kanal, Erinnerung, der öffentliche
 * Link und die drei Nachrichten) und die Partien selbst - eintragen, ändern,
 * absagen, Ergebnis melden.
 *
 * Eintragen tun sonst die Captains über den öffentlichen Link; hier steht
 * dasselbe Formular für alle, die den Server verwalten.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, localInput, rolePicker, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { loadGallery } from "../layout/ImagePicker.js";
import { IEditorContext } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import { MATCHUP_IMAGES, MATCHUP_PLACEHOLDERS, MATCHUP_RESULT_PLACEHOLDERS } from "../constants/Placeholders.js";

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
    createdAt: number;
}

interface ISettings {
    channelId: string | null;
    pingRoles: string[];
    remindMinutes: number;
    open: boolean;
    results: boolean;
    discordResults: boolean;
    resultRemindHours: number;
    colorByStatus: boolean;
    maxAhead: number;
    leagues: string[];
    announce: IBody;
    remind: IBody;
    result: IBody;
}

interface IPayload {
    settings: ISettings;
    matchups: IMatchup[];
    total: number;
    planned: number;
    page: number;
    teams: ITeam[];
    link: string;
    modes: Record<Mode, string>;
    statuses: Record<Status, string>;
    bestOf: number[];
    entryRoles: string[];
    bodyKinds: Record<string, string>;
    limits: { opponent: number; league: number; note: number; leagues: number; pings: number; remind: number; resultRemind: number; ahead: number; page: number };
    guild: {
        name: string;
        roles: IRole[];
        channels: { id: string; name: string }[];
        emojis: IServerEmoji[];
    };
}

const WHEN = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Der Punkt „Matchups" - Kanal, Erinnerung, Link, Nachrichten. */
export function renderMatchups(guildId: string): void {
    mount(guildId, "base");
}

/** Der Punkt „Eintragen" - das Formular. */
export function renderMatchupList(guildId: string): void {
    mount(guildId, "list");
}

/** Der Punkt „Alle Partien" - die Liste. */
export function renderMatchupAll(guildId: string): void {
    mount(guildId, "all");
}

const HOSTS = {
    base: { body: "#matchupsBody", note: "#matchupsNote" },
    list: { body: "#matchupListBody", note: "#matchupListNote" },
    all: { body: "#matchupAllBody", note: "#matchupAllNote" },
} as const;

function mount(guildId: string, view: "base" | "list" | "all"): void {
    const host = need<HTMLElement>(HOSTS[view].body);
    const note = need<HTMLElement>(HOSTS[view].note);
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/matchups`, note);

    let data: IPayload | null = null;
    let editing: IMatchup | null = null;
    // Aus der Liste kommt man mit ?partie=<id> hierher, um sie zu ändern.
    let wanted = view === "list" ? Number(new URLSearchParams(window.location.search).get("partie")) : 0;
    const filter: { status: Status | ""; page: number } = { status: "", page: 1 };

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>(`?${filter.status ? `status=${filter.status}&` : ""}page=${filter.page}`);

        if (!answer) return;

        data = answer;

        if (wanted) {
            editing = data.matchups.find((entry) => entry.id === wanted) ?? null;
            wanted = 0;
        }

        paint();
    };

    const context = (list: typeof MATCHUP_PLACEHOLDERS) => (): IEditorContext => ({
        guildId,
        values: Object.fromEntries(list.map((entry) => [entry.key, entry.sample])),
        roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
        channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
        emojis: data!.guild.emojis,
        placeholders: list,
        imagePlaceholders: [...MATCHUP_IMAGES],
        onChange: () => undefined,
    });

    const embedOf = (title: string, description: string): IEmbed => ({
        title,
        description,
        color: "#ff1e2d",
        url: null,
        image: null,
        thumbnail: null,
        author: null,
        footer: null,
        timestamp: false,
        fields: [],
    });

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const channel = data!.settings.channelId ? data!.guild.channels.find((entry) => entry.id === data!.settings.channelId) : null;
        const next = data!.matchups.filter((entry) => entry.status === "planned").sort((a, b) => a.at - b.at)[0];

        return el(
            "div",
            "tkhead snhead",
            stat("#i-swords", "Geplant", String(data!.planned)),
            stat("#i-clock", "Als Nächstes", next ? WHEN.format(new Date(next.at)) : "nichts", next ? "is-ok" : ""),
            stat("#i-message", "Kanal", channel ? `# ${channel.name}` : "fehlt", channel ? "" : "is-warn"),
            stat("#i-link", "Öffentlicher Link", data!.settings.open ? "offen" : "zu", data!.settings.open ? "is-ok" : "is-warn")
        );
    }

    /* ------------------------------------------------------------
       Grundlagen
       ------------------------------------------------------------ */
    function basics(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const answer = await call("", {
                action: "settings",
                settings: {
                    channelId: draft.channelId,
                    pingRoles: draft.pingRoles,
                    remindMinutes: draft.remindMinutes,
                    open: draft.open,
                    results: draft.results,
                    colorByStatus: draft.colorByStatus,
                    maxAhead: draft.maxAhead,
                    leagues: draft.leagues,
                },
            });

            if (!answer) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Gilt ab der nächsten Partie.");
            void reload();
        });

        const minutes = el("input", "text lfdays");

        minutes.type = "number";
        minutes.min = "0";
        minutes.max = String(data!.limits.remind);
        minutes.value = String(draft.remindMinutes);
        minutes.setAttribute("aria-label", "Minuten vor Anpfiff");
        minutes.addEventListener("input", () => {
            draft.remindMinutes = Math.max(0, Math.min(data!.limits.remind, Number(minutes.value) || 0));
            touch();
        });

        const ahead = el("input", "text lfdays");

        ahead.type = "number";
        ahead.min = "1";
        ahead.max = String(data!.limits.ahead);
        ahead.value = String(draft.maxAhead);
        ahead.setAttribute("aria-label", "Tage im Voraus");
        ahead.addEventListener("input", () => {
            draft.maxAhead = Math.max(1, Math.min(data!.limits.ahead, Number(ahead.value) || 1));
            touch();
        });

        const leagues = el("input", "text");

        leagues.type = "text";
        leagues.value = draft.leagues.join(" | ");
        leagues.placeholder = "RLCS Quali | Liga Spieltag | Scrim";
        leagues.setAttribute("aria-label", "Vorschläge für die Liga");
        leagues.addEventListener("input", () => {
            draft.leagues = leagues.value
                .split("|")
                .map((one) => one.trim())
                .filter(Boolean)
                .slice(0, data!.limits.leagues);
            touch();
        });

        return card(
            "Wo die Partien landen",
            "Der Bot meldet jede eingetragene Partie und erinnert kurz vor Anpfiff.",
            row(
                "Kanal",
                "Ohne Kanal bleibt es still – eingetragen wird trotzdem",
                select(
                    [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
                    draft.channelId ?? "",
                    (value) => {
                        draft.channelId = value || null;
                        touch();
                    },
                    "Kanal für die Matchups"
                )
            ),
            row(
                "Wer wird gepingt",
                `Bis zu ${data!.limits.pings} Rollen – bei Ankündigung und Erinnerung`,
                rolePicker(
                    data!.guild.roles,
                    draft.pingRoles,
                    (ids) => {
                        draft.pingRoles = ids;
                        touch();
                    },
                    [],
                    data!.limits.pings
                )
            ),
            row("Erinnern", "Minuten vor Anpfiff – 0 heißt: keine Erinnerung", minutes),
            row(
                "Farbe nach Stand",
                "Rot vor und während des Spiels, grün bei Sieg, rot bei Niederlage, grau bei Unentschieden und Absage. Aus: die Farbe aus dem Editor",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.colorByStatus, "Farbe nach Stand", (on) => {
                        draft.colorByStatus = on;
                        touch();
                    }),
                    el("span", "", "an")
                )
            ),
            row("Höchstens im Voraus", "Tage – so weit dürfen Captains planen", ahead),
            row("Vorschläge für die Liga", "Mit | getrennt – im Formular stehen sie zur Auswahl", leagues),
            el("div", "mcsave lvsave", save)
        );
    }

    function link(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const field = el("input", "text");
        const copy = button("btn btn--quiet", icon("#i-copy"), "Kopieren");
        const touch = (): void => {
            save.disabled = false;
        };

        field.type = "text";
        field.readOnly = true;
        field.value = data!.link;
        field.setAttribute("aria-label", "Öffentlicher Link");

        copy.addEventListener("click", async () => {
            await navigator.clipboard.writeText(data!.link).catch(() => undefined);
            toast("info", "Kopiert", "Schick ihn deinen Captains.");
        });

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const settings = { open: draft.open, results: draft.results, discordResults: draft.discordResults, resultRemindHours: draft.resultRemindHours };

            if (!(await call("", { action: "settings", settings }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", draft.open ? "Der Link ist offen." : "Der Link ist zu.");
            void reload();
        });

        const hours = el("input", "text lfdays");

        hours.type = "number";
        hours.min = "0";
        hours.max = String(data!.limits.resultRemind);
        hours.value = String(draft.resultRemindHours);
        hours.setAttribute("aria-label", "Stunden bis zur Erinnerung ans Ergebnis");
        hours.addEventListener("input", () => {
            draft.resultRemindHours = Math.max(0, Math.min(data!.limits.resultRemind, Number(hours.value) || 0));
            touch();
        });

        return card(
            "Der Link für die Captains",
            `Eintragen darf, wer im Kader als ${data!.entryRoles.join(", ")} steht – der Bot nimmt die Team-Übersicht als Grundlage. Wer den Server verwaltet, darf für jedes Team eintragen.`,
            row("Adresse", "Ohne Anmeldung sichtbar, eintragen nur angemeldet", el("div", "aplink", field, copy)),
            row(
                "Link offen",
                "Aus: die Seite ist zu, die Knöpfe zur Webseite fallen in Discord weg. In Discord eintragen geht weiter.",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.open, "Öffentlichen Link offen lassen", (on) => {
                        draft.open = on;
                        touch();
                    }),
                    el("span", "", "offen")
                )
            ),
            row(
                "Ergebnisse",
                "Nach Anpfiff dürfen Captains das Ergebnis melden",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.results, "Ergebnisse zulassen", (on) => {
                        draft.results = on;
                        touch();
                    }),
                    el("span", "", "an")
                )
            ),
            row(
                "Ergebnis in Discord eintragen",
                "Der Knopf unter der Ankündigung. Aus: nur noch über Link und Dashboard",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.discordResults, "Ergebnis in Discord eintragen", (on) => {
                        draft.discordResults = on;
                        touch();
                    }),
                    el("span", "", "an")
                )
            ),
            row("Erinnern, wenn das Ergebnis fehlt", `Stunden nach Anpfiff, einmal unter der Ankündigung – 0 heißt aus, höchstens ${data!.limits.resultRemind}`, hours),
            el("div", "mcsave lvsave", save)
        );
    }

    function messages(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: { announce: draft.announce, remind: draft.remind, result: draft.result } }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Die nächste Partie sieht so aus.");
            void reload();
        });

        const announce = bodyEditor(draft.announce, {
            pageSave: () => save,
            kinds: data!.bodyKinds,
            context: context(MATCHUP_PLACEHOLDERS),
            defaultEmbed: () => embedOf("{team} vs. {gegner}", "**Anpfiff** {zeit}\n{countdown}"),
            touch,
            title: "Die Ankündigung",
            hint: "Geht raus, sobald jemand eine Partie einträgt. {countdown} läuft von allein weiter.",
            templates: "matchupAnnounce",
        });

        const remind = bodyEditor(draft.remind, {
            pageSave: () => save,
            kinds: data!.bodyKinds,
            context: context(MATCHUP_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Gleich geht es los", "{team} vs. {gegner} – {countdown}"),
            touch,
            title: "Die Erinnerung",
            hint: "Kommt kurz vor Anpfiff – wie kurz, steht oben.",
            templates: "matchupRemind",
        });

        const result = bodyEditor(draft.result, {
            pageSave: () => save,
            kinds: data!.bodyKinds,
            context: context(MATCHUP_RESULT_PLACEHOLDERS),
            defaultEmbed: () => embedOf("{ausgang} {team} {ergebnis} {gegner}", "{notiz}"),
            touch,
            title: "Das Ergebnis",
            hint: "{ausgang} ist Sieg, Niederlage oder Unentschieden, {ergebnis} steht für 3:1.",
            templates: "matchupResult",
        });

        return card(
            "Die drei Nachrichten",
            "Selbst gebaut – mit Platzhaltern, Vorlagen und Live-Vorschau. Zeiten setzt Discord in die Zeitzone jedes Lesers.",
            el("div", "tmmsgs", announce.node, remind.node, result.node),
            el("div", "mcsave lvsave", save)
        );
    }

    /* ------------------------------------------------------------
       Eine Partie eintragen
       ------------------------------------------------------------ */
    function sheet(): HTMLElement {
        const current = editing;
        const team = el("select", "pick");
        const opponent = el("input", "text");
        const league = el("input", "text");
        const mode = el("select", "pick");
        const best = el("select", "pick");
        const at = el("input", "text");
        const stream = el("input", "text");
        const note = el("textarea", "text tkarea");
        const save = button("btn btn--primary", icon("#i-check"), current ? "Änderung speichern" : "Partie eintragen");

        for (const entry of data!.teams) team.append(new Option(`${entry.name}${entry.tag ? ` (${entry.tag})` : ""}`, String(entry.id), false, current?.teamId === entry.id));

        team.setAttribute("aria-label", "Für welches Team");

        opponent.type = "text";
        opponent.maxLength = data!.limits.opponent;
        opponent.placeholder = "Name des gegnerischen Teams";
        opponent.value = current?.opponent ?? "";

        league.type = "text";
        league.maxLength = data!.limits.league;
        league.placeholder = data!.settings.leagues[0] ?? "Liga oder Turnier";
        league.value = current?.league ?? "";

        for (const [value, label] of Object.entries(data!.modes)) mode.append(new Option(label, value, false, (current?.mode ?? "3v3") === value));

        mode.setAttribute("aria-label", "Modus");

        for (const value of data!.bestOf) best.append(new Option(value ? `Best of ${value}` : "— offen —", String(value), false, (current?.bestOf ?? 0) === value));

        best.setAttribute("aria-label", "Best-of");

        at.type = "datetime-local";
        at.value = localInput(current?.at ?? Date.now() + 3_600_000);
        at.setAttribute("aria-label", "Anpfiff");

        stream.type = "url";
        stream.maxLength = 512;
        stream.placeholder = "https://twitch.tv/… (freiwillig)";
        stream.value = current?.stream ?? "";

        note.rows = 2;
        note.maxLength = data!.limits.note;
        note.placeholder = "Notiz (freiwillig)";
        note.value = current?.note ?? "";

        save.addEventListener("click", async () => {
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
            const answer = await call("", current ? { action: "save", id: current.id, matchup } : { action: "create", matchup });

            save.disabled = false;

            if (!answer) return;

            toast("info", current ? "Geändert" : "Eingetragen", data!.settings.channelId ? "Steht im Kanal." : "Ohne Kanal bleibt es still.");
            editing = null;
            void reload();
        });

        const stop = button("btn btn--quiet", icon("#i-x"), "Abbrechen");

        stop.addEventListener("click", () => {
            editing = null;
            paint();
        });

        return card(
            current ? `Partie #${current.id} ändern` : "Partie eintragen",
            data!.teams.length ? "Dasselbe Formular sehen die Captains über den Link." : "Lege zuerst in der Team-Übersicht ein Team an.",
            row("Team", "", team),
            row("Gegner", "", opponent),
            row("Liga oder Turnier", "Leer lassen, wenn es ein Freundschaftsspiel ist", league),
            row("Anpfiff", "In deiner Zeitzone", at),
            row("Modus und Best-of", "", el("div", "lftag", mode, best)),
            row("Stream-Link", "Steht als „Live“ in der Nachricht", stream),
            row("Notiz", "", note),
            el("div", "mcsave lvsave", save, ...(current ? [stop] : []))
        );
    }

    /* ------------------------------------------------------------
       Die Liste
       ------------------------------------------------------------ */
    function list(): HTMLElement {
        const status = select(
            [
                ["", "Alle"],
                ["planned", data!.statuses.planned],
                ["played", data!.statuses.played],
                ["cancelled", data!.statuses.cancelled],
            ],
            filter.status,
            (value) => {
                filter.status = value as Status | "";
                filter.page = 1;
                void reload();
            },
            "Nach Stand filtern"
        );

        const pages = Math.max(1, Math.ceil(data!.total / data!.limits.page));
        const back = button("btn btn--quiet btn--icon", icon("#i-up"));
        const next = button("btn btn--quiet btn--icon", icon("#i-down"));

        back.title = "Seite zurück";
        back.setAttribute("aria-label", "Eine Seite zurück");
        back.disabled = filter.page <= 1;
        back.addEventListener("click", () => {
            filter.page--;
            void reload();
        });

        next.title = "Seite weiter";
        next.setAttribute("aria-label", "Eine Seite weiter");
        next.disabled = filter.page >= pages;
        next.addEventListener("click", () => {
            filter.page++;
            void reload();
        });

        const rows = data!.matchups.length
            ? data!.matchups.map(matchupRow)
            : [el("div", "tkempty", icon("#i-swords"), el("span", "", filter.status ? "Dazu gibt es nichts." : "Noch ist nichts eingetragen."))];

        return card(
            "Alle Partien",
            "Geplante zuerst, danach das Gespielte. Ändern, absagen und Ergebnisse melden geht hier wie über den Link.",
            el("div", "apfilter", status, ...(pages > 1 ? [back, next] : [])),
            el("div", "aplist", ...rows),
            el("p", "hintline", `${data!.total} insgesamt${pages > 1 ? ` · Seite ${filter.page} von ${pages}` : ""}`)
        );
    }

    function matchupRow(entry: IMatchup): HTMLElement {
        const score = entry.score ? ` · **${entry.score.us}:${entry.score.them}**`.replaceAll("*", "") : "";
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
                    el(
                        "span",
                        "",
                        `${WHEN.format(new Date(entry.at))} · ${data!.modes[entry.mode]}${entry.bestOf ? ` · Bo${entry.bestOf}` : ""}${entry.league ? ` · ${entry.league}` : ""}${score} · von ${entry.createdName}`
                    )
                ),
                el("span", `apchip${entry.status === "planned" ? " is-open" : entry.status === "played" ? " is-accepted" : ""}`, data!.statuses[entry.status])
            )
        );

        const actions = el("div", "mcsave");

        if (entry.status === "planned") {
            const change = button("btn btn--quiet", icon("#i-sliders"), "Ändern");
            const off = confirmButton("btn btn--quiet", "#i-x", "Absagen", "Wirklich absagen?", async () => {
                if (!(await call("", { action: "cancel", id: entry.id }))) return;

                toast("info", "Abgesagt", "Die Nachricht im Kanal sagt es.");
                void reload();
            });

            change.addEventListener("click", () => {
                // Das Formular steht unter „Eintragen" - die Liste schickt dorthin.
                window.location.href = `${window.location.pathname.replace(/\/matchup-all$/, "/matchup-list")}?partie=${entry.id}`;
            });

            actions.append(change, off);

            if (data!.settings.results && entry.at <= Date.now()) {
                const us = el("input", "text text--emoji");
                const them = el("input", "text text--emoji");
                const done = button("btn btn--primary", icon("#i-check"), "Ergebnis");

                for (const input of [us, them]) {
                    input.type = "number";
                    input.min = "0";
                    input.max = "99";
                    input.value = "0";
                }

                us.setAttribute("aria-label", "Eigene Punkte");
                them.setAttribute("aria-label", "Punkte des Gegners");

                done.addEventListener("click", async () => {
                    if (!(await call("", { action: "report", id: entry.id, us: Number(us.value), them: Number(them.value) }))) return;

                    toast("info", "Ergebnis steht", "Der Bot meldet es im Kanal.");
                    void reload();
                });

                actions.append(el("div", "lftag", us, el("span", "apfield__hint", ":"), them, done));
            }
        }

        const kill = confirmButton("btn btn--quiet is-danger", "#i-trash", "Löschen", "Partie und Nachricht wirklich löschen?", async () => {
            if (!(await call("", { action: "delete", id: entry.id }))) return;

            toast("info", "Gelöscht", "Die Partie und ihre Nachricht sind weg.");
            void reload();
        });

        actions.append(kill);
        box.append(el("div", "snitem__body", ...(entry.note ? [el("p", "hintline", entry.note)] : []), actions));

        return box;
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        host.replaceChildren(head(), ...(view === "base" ? [basics(), link(), messages()] : view === "list" ? [sheet()] : [list()]));
    }

    loading(host, 4);

    // Trägt jemand über den Link etwas ein, steht es hier sofort.
    onPulse(guildId, ["matchups"], debounce(() => void reload()));

    void loadGallery(guildId).catch(() => undefined);
    void reload();
}
