/**
 * Abschnitt: 2, 4 & 6 Mans.
 *
 * Drei Punkte in der Leiste: die Einstellungen (Modi, Kanal, Wertung, die vier
 * Nachrichten), die Live-Ansicht (Warteschlangen und laufende Runden) und die
 * Rangliste - je Modus eine eigene, auf Wunsch öffentlich.
 *
 * Die Live-Ansicht zieht sich über den Puls selbst nach: tritt jemand bei oder
 * endet eine Runde, steht es hier, ohne dass jemand neu lädt.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { loadGallery } from "../layout/ImagePicker.js";
import { IEditorContext } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import { IPlaceholder, SIX_IMAGES, SIX_PANEL_PLACEHOLDERS, SIX_RESULT_PLACEHOLDERS, SIX_ROUND_PLACEHOLDERS } from "../constants/Placeholders.js";

type Status = "running" | "done" | "cancelled";
type Mode = "2" | "4" | "6";

interface IRank {
    min: number;
    name: string;
    emoji: string;
    color: string;
}

interface ISettings {
    channelId: string | null;
    categoryId: string | null;
    modes: Record<Mode, boolean>;
    voice: boolean;
    dm: boolean;
    confirm: boolean;
    start: number;
    k: number;
    idleMinutes: number;
    board: { open: boolean };
    panelMessageId: string | null;
    panel: IBody;
    round: IBody;
    result: IBody;
    dmBody: IBody;
}

interface IWaiting {
    userId: string;
    name: string;
    mmr: number;
    since: number;
}

interface IRound {
    id: number;
    mode: number;
    blue: string[];
    orange: string[];
    names: Record<string, string>;
    before: Record<string, number>;
    status: Status;
    winner: 0 | 1 | 2;
    lobbyName: string;
    lobbyPass: string;
    change: number;
    createdAt: number;
    endedAt: number | null;
}

interface IBoardEntry {
    userId: string;
    name: string;
    mmr: number;
    wins: number;
    losses: number;
    games: number;
    streak: number;
    position: number;
    rank: IRank;
}

interface IPayload {
    settings: ISettings;
    queues: Record<Mode, IWaiting[]>;
    running: IRound[];
    rounds: IRound[];
    total: number;
    page: number;
    boards: Record<Mode, IBoardEntry[]>;
    link: string;
    modes: number[];
    modeLabels: Record<Mode, string>;
    modeHints: Record<Mode, string>;
    ranks: IRank[];
    defaultRanks: IRank[];
    teams: Record<"1" | "2", string>;
    statuses: Record<Status, string>;
    bodyKinds: Record<string, string>;
    limits: { start: [number, number]; k: [number, number]; idle: number; page: number; ranks: number; rankName: number; rankMin: number };
    guild: {
        name: string;
        roles: IRole[];
        channels: { id: string; name: string }[];
        categories: { id: string; name: string }[];
        emojis: IServerEmoji[];
    };
}

const AGO = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
const WHEN = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const MODES: Mode[] = ["2", "4", "6"];

function ago(at: number): string {
    const minutes = Math.round((at - Date.now()) / 60_000);

    if (Math.abs(minutes) < 60) return AGO.format(minutes, "minute");

    return AGO.format(Math.round(minutes / 60), "hour");
}

/** Nur echte Farben - alles andere bleibt die Standardfarbe. */
function tone(value: string): string | null {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function rankChip(rank: IRank, small = true): HTMLElement {
    const chip = el("span", `mnrank${small ? " mnrank--tag" : ""}`, el("span", "", rank.emoji), el("b", "", rank.name));
    const color = tone(rank.color);

    if (color) chip.style.setProperty("--mnrank", color);

    return chip;
}

/** Der Punkt „2, 4 & 6 Mans" - Modi, Kanal, Wertung, Nachrichten. */
export function renderSixMans(guildId: string): void {
    mount(guildId, "base");
}

/** Der Punkt „Live" - Warteschlangen und laufende Runden. */
export function renderSixMansLive(guildId: string): void {
    mount(guildId, "live");
}

/** Der Punkt „Rangliste" - je Modus eine, dazu der öffentliche Link. */
export function renderSixMansBoard(guildId: string): void {
    mount(guildId, "board");
}

const HOSTS = {
    base: { body: "#sixmansBody", note: "#sixmansNote" },
    live: { body: "#sixmansLiveBody", note: "#sixmansLiveNote" },
    board: { body: "#sixmansBoardBody", note: "#sixmansBoardNote" },
} as const;

function mount(guildId: string, view: "base" | "live" | "board"): void {
    const host = need<HTMLElement>(HOSTS[view].body);
    const note = need<HTMLElement>(HOSTS[view].note);
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/sixmans`, note);

    let data: IPayload | null = null;
    let board: Mode = "6";
    const filter: { status: Status | ""; mode: Mode | ""; page: number } = { status: "", mode: "", page: 1 };

    const reload = async (): Promise<void> => {
        const parts = [...(filter.status ? [`status=${filter.status}`] : []), ...(filter.mode ? [`mode=${filter.mode}`] : []), `page=${filter.page}`];
        const answer = await call<IPayload>(`?${parts.join("&")}`);

        if (!answer) return;

        data = answer;
        paint();
    };

    /** Welche Modi laufen - in der Reihenfolge 2, 4, 6. */
    const open = (): Mode[] => MODES.filter((mode) => data!.settings.modes[mode]);

    const context = (list: IPlaceholder[]) => (): IEditorContext => ({
        guildId,
        values: Object.fromEntries(list.map((entry) => [entry.key, entry.sample])),
        roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
        channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
        emojis: data!.guild.emojis,
        placeholders: list,
        imagePlaceholders: [...SIX_IMAGES],
        onChange: () => undefined,
    });

    const embedOf = (title: string, description: string): IEmbed => ({
        title,
        description,
        color: "#00afff",
        url: null,
        image: null,
        thumbnail: null,
        author: null,
        footer: null,
        timestamp: false,
        fields: [],
    });

    const nameOf = (round: IRound, id: string): string => round.names[id] ?? id;
    const modeOf = (mode: number | string): string => data!.modeLabels[String(mode) as Mode] ?? `${mode} Mans`;

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const channel = data!.settings.channelId ? data!.guild.channels.find((entry) => entry.id === data!.settings.channelId) : null;
        const waiting = open().reduce((sum, mode) => sum + (data!.queues[mode]?.length ?? 0), 0);
        const players = new Set(MODES.flatMap((mode) => (data!.boards[mode] ?? []).map((entry) => entry.userId))).size;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-users", "In der Warteschlange", String(waiting), waiting ? "is-live" : ""),
            stat("#i-gamepad", "Läuft gerade", String(data!.running.length), data!.running.length ? "is-ok" : ""),
            stat("#i-stats", "Gewertet", String(players)),
            stat("#i-message", "Kanal", channel ? `# ${channel.name}` : "fehlt", channel ? "" : "is-warn")
        );
    }

    /* ------------------------------------------------------------
       Einstellungen
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
                    categoryId: draft.categoryId,
                    modes: draft.modes,
                    voice: draft.voice,
                    dm: draft.dm,
                    confirm: draft.confirm,
                    start: draft.start,
                    k: draft.k,
                    idleMinutes: draft.idleMinutes,
                },
            });

            if (!answer) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Gilt ab der nächsten Runde.");
            void reload();
        });

        const number = (value: number, min: number, max: number, label: string, set: (value: number) => void): HTMLInputElement => {
            const box = el("input", "text lfdays");

            box.type = "number";
            box.min = String(min);
            box.max = String(max);
            box.value = String(value);
            box.setAttribute("aria-label", label);
            box.addEventListener("input", () => {
                set(Math.max(min, Math.min(max, Number(box.value) || min)));
                touch();
            });

            return box;
        };

        const panel = button("btn btn--quiet", icon("#i-message"), data!.settings.panelMessageId ? "Panel neu senden" : "Panel senden");

        panel.disabled = !data!.settings.channelId;
        panel.addEventListener("click", async () => {
            panel.disabled = true;

            const answer = await call("", { action: "panel" });

            panel.disabled = false;

            if (!answer) return;

            toast("info", "Steht im Kanal", "Wer mitspielen will, klickt darunter.");
            void reload();
        });

        const switchRow = (label: string, hint: string, value: boolean, set: (on: boolean) => void): HTMLElement =>
            row(
                label,
                hint,
                el(
                    "label",
                    "snitem__switch",
                    toggle(value, label, (on) => {
                        set(on);
                        touch();
                    }),
                    el("span", "", "an")
                )
            );

        const warn = el("div", "notice");
        const modes = el("div", "mnmodes");
        const drawModes = (): void => {
            modes.replaceChildren(
                ...MODES.map((mode) =>
                    el(
                        "label",
                        "snitem__switch",
                        toggle(draft.modes[mode], `${data!.modeLabels[mode]} anbieten`, (on) => {
                            draft.modes[mode] = on;
                            touch();
                            drawModes();
                        }),
                        el("span", "", `${data!.modeLabels[mode]} · ${data!.modeHints[mode]}`)
                    )
                )
            );

            const none = !MODES.some((mode) => draft.modes[mode]);

            warn.replaceChildren(...(none ? [icon("#i-warn"), el("span", "", "Kein Modus ist an – das Panel hat dann nichts anzubieten.")] : []));
            warn.hidden = !none;
        };

        drawModes();

        return card(
            "Wie gespielt wird",
            "Jeder Modus hat seine eigene Warteschlange und seine eigene MMR: wer in 6 Mans oben steht, fängt in 2 Mans trotzdem beim Startwert an.",
            row("Modi", "Was im Panel zur Auswahl steht", modes),
            warn,
            row(
                "Kanal",
                "Dort stehen Panel und Runden",
                select(
                    [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
                    draft.channelId ?? "",
                    (value) => {
                        draft.channelId = value || null;
                        touch();
                    },
                    "Kanal für die Runden"
                )
            ),
            row(
                "Kategorie für die Sprachkanäle",
                "Dort entstehen Blau und Orange",
                select(
                    [["", "— keine —"], ...data!.guild.categories.map((entry): [string, string] => [entry.id, entry.name])],
                    draft.categoryId ?? "",
                    (value) => {
                        draft.categoryId = value || null;
                        touch();
                    },
                    "Kategorie für die Sprachkanäle"
                )
            ),
            switchRow("Sprachkanäle anlegen", "Zwei Kanäle je Runde – wer schon im Voice sitzt, wird hinübergezogen", draft.voice, (on) => (draft.voice = on)),
            switchRow("DM an alle", "Jeder Teilnehmer bekommt Lobby und Passwort per DM", draft.dm, (on) => (draft.dm = on)),
            switchRow("Ergebnis bestätigen lassen", "An: das andere Team muss dasselbe melden. Aus: ein Klick genügt", draft.confirm, (on) => (draft.confirm = on)),
            row("Start-MMR", "Womit jeder in jedem Modus anfängt", number(draft.start, data!.limits.start[0], data!.limits.start[1], "Start-MMR", (value) => (draft.start = value))),
            row("Höchster Ausschlag", "So viel bewegt eine Runde höchstens", number(draft.k, data!.limits.k[0], data!.limits.k[1], "Höchster Ausschlag", (value) => (draft.k = value))),
            row(
                "Aus der Warteschlange nach",
                "Minuten ohne Runde – 0 heißt: niemand fliegt raus",
                number(draft.idleMinutes, 0, data!.limits.idle, "Minuten in der Warteschlange", (value) => (draft.idleMinutes = value))
            ),
            el("p", "hintline", "Die Warteschlangen leben im Bot: nach einem Neustart sind sie leer. Runden und Wertung stehen in der Datenbank."),
            el("div", "mcsave lvsave", save, panel)
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

            if (!(await call("", { action: "settings", settings: { panel: draft.panel, round: draft.round, result: draft.result, dmBody: draft.dmBody } }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Das Panel zieht der Bot sofort nach.");
            void reload();
        });

        const panel = bodyEditor(draft.panel, {
            kinds: data!.bodyKinds,
            context: context(SIX_PANEL_PLACEHOLDERS),
            defaultEmbed: () => embedOf("2, 4 & 6 Mans", "{warteschlange}"),
            touch,
            title: "Das Panel",
            hint: "{warteschlange} sind alle Modi untereinander, {warteschlange.6} nur einer.",
            templates: "sixPanel",
        });

        const round = bodyEditor(draft.round, {
            kinds: data!.bodyKinds,
            context: context(SIX_ROUND_PLACEHOLDERS),
            defaultEmbed: () => embedOf("{modus} · Runde #{runde}", "{blau}\n\n{orange}"),
            touch,
            title: "Die Runde",
            hint: "{lobby} und {passwort} sind der Vorschlag für die private Lobby.",
            templates: "sixRound",
        });

        const result = bodyEditor(draft.result, {
            kinds: data!.bodyKinds,
            context: context(SIX_RESULT_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Runde #{runde}", "{sieger.team} gewinnt"),
            touch,
            title: "Das Ergebnis",
            hint: "{sieger.team} ist Blau oder Orange, {veraenderung} die MMR-Bewegung.",
            templates: "sixResult",
        });

        const dm = bodyEditor(draft.dmBody, {
            kinds: data!.bodyKinds,
            context: context(SIX_ROUND_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Deine Runde steht", "Lobby {lobby}, Passwort {passwort}"),
            touch,
            title: "Die DM",
            hint: "Geht an alle Mitspieler, sobald die Runde steht.",
            templates: "sixDm",
        });

        return card(
            "Die vier Nachrichten",
            "Selbst gebaut – mit Platzhaltern, Vorlagen und Live-Vorschau. Die Knöpfe hängt der Bot selbst an.",
            el("div", "tmmsgs", panel.node, round.node, result.node, dm.node),
            el("div", "mcsave lvsave", save)
        );
    }

    /* ------------------------------------------------------------
       Live
       ------------------------------------------------------------ */
    function queues(): HTMLElement[] {
        const modes = open();

        if (!modes.length) {
            return [card("Warteschlangen", "Gerade ist kein Modus an.", el("div", "tkempty", icon("#i-users"), el("span", "", "Schalte unter „2, 4 & 6 Mans“ einen Modus an.")))];
        }

        return modes.map((mode) => {
            const queue = data!.queues[mode] ?? [];
            const clear = confirmButton("btn btn--quiet", "#i-eraser", "Leeren", "Wirklich alle rauswerfen?", async () => {
                if (!(await call("", { action: "clear", mode: Number(mode) }))) return;

                toast("info", "Geleert", `${data!.modeLabels[mode]} ist leer.`);
                void reload();
            });

            const rows = queue.map((entry, index) => {
                const kick = button("btn btn--quiet btn--icon", icon("#i-user-x"));

                kick.title = "Aus der Warteschlange nehmen";
                kick.setAttribute("aria-label", `${entry.name} aus ${data!.modeLabels[mode]} nehmen`);
                kick.addEventListener("click", async () => {
                    kick.disabled = true;

                    if (!(await call("", { action: "kick", userId: entry.userId, mode: Number(mode) }))) {
                        kick.disabled = false;

                        return;
                    }

                    toast("info", "Raus", `${entry.name} steht nicht mehr drin.`);
                    void reload();
                });

                const rank = data!.ranks.filter((one) => entry.mmr >= one.min).pop() ?? data!.ranks[0];

                return el(
                    "div",
                    "snitem",
                    el(
                        "div",
                        "snitem__head",
                        el("span", "apquestion__no", String(index + 1)),
                        el("div", "snitem__name", el("b", "", entry.name), el("span", "", `MMR ${entry.mmr} · wartet seit ${ago(entry.since)}`)),
                        rankChip(rank),
                        kick
                    )
                );
            });

            return card(
                `${data!.modeLabels[mode]} · ${data!.modeHints[mode]}`,
                `${queue.length} von ${mode} – bei ${mode} geht es von allein los.`,
                el("div", "aplist", ...(rows.length ? rows : [el("div", "tkempty", icon("#i-users"), el("span", "", "Gerade wartet niemand."))])),
                ...(queue.length ? [el("div", "mcsave", clear)] : [])
            );
        });
    }

    function teamLine(round: IRound, team: 1 | 2): HTMLElement {
        const ids = team === 1 ? round.blue : round.orange;
        const won = round.winner === team;

        return el(
            "p",
            "hintline",
            `${team === 1 ? "🔵" : "🟠"} ${data!.teams[String(team) as "1" | "2"]}${won ? " · Sieger" : ""}: ${ids.map((id) => `${nameOf(round, id)} (${round.before[id] ?? "?"})`).join(", ")}`
        );
    }

    function running(): HTMLElement {
        const rows = data!.running.map((round) => {
            const stop = confirmButton("btn btn--quiet", "#i-x", "Abbrechen", "Runde wirklich abbrechen?", async () => {
                if (!(await call("", { action: "cancel", id: round.id }))) return;

                toast("info", "Abgebrochen", "Die MMR bleibt, wie sie war.");
                void reload();
            });

            return el(
                "div",
                "snitem is-open",
                el(
                    "div",
                    "snitem__head",
                    el("span", "snitem__face", icon("#i-gamepad")),
                    el(
                        "div",
                        "snitem__name",
                        el("b", "", `${modeOf(round.mode)} · Runde #${round.id}`),
                        el("span", "", `Lobby ${round.lobbyName} · Passwort ${round.lobbyPass} · seit ${ago(round.createdAt)}`)
                    ),
                    el("span", "apchip is-open", data!.statuses.running)
                ),
                el("div", "snitem__body", teamLine(round, 1), teamLine(round, 2), el("div", "mcsave", stop))
            );
        });

        return card(
            "Läuft gerade",
            "Wer nicht meldet, blockiert die Warteschlange – hier kannst du eine festgefahrene Runde abbrechen.",
            el("div", "aplist", ...(rows.length ? rows : [el("div", "tkempty", icon("#i-gamepad"), el("span", "", "Gerade läuft keine Runde."))]))
        );
    }

    function history(): HTMLElement {
        const status = select(
            [
                ["", "Alle"],
                ["done", data!.statuses.done],
                ["cancelled", data!.statuses.cancelled],
                ["running", data!.statuses.running],
            ],
            filter.status,
            (value) => {
                filter.status = value as Status | "";
                filter.page = 1;
                void reload();
            },
            "Nach Stand filtern"
        );

        const modes = select(
            [["", "Alle Modi"], ...MODES.map((mode): [string, string] => [mode, data!.modeLabels[mode]])],
            filter.mode,
            (value) => {
                filter.mode = value as Mode | "";
                filter.page = 1;
                void reload();
            },
            "Nach Modus filtern"
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

        const rows = data!.rounds.map((round) =>
            el(
                "div",
                "snitem",
                el(
                    "div",
                    "snitem__head",
                    el("span", "snitem__face", icon("#i-gamepad")),
                    el(
                        "div",
                        "snitem__name",
                        el("b", "", `${modeOf(round.mode)} · #${round.id}${round.winner ? ` · ${round.winner === 1 ? "🔵 Blau" : "🟠 Orange"}` : ""}`),
                        el(
                            "span",
                            "",
                            `${WHEN.format(new Date(round.createdAt))} · ${round.blue.map((id) => nameOf(round, id)).join(", ")} gegen ${round.orange.map((id) => nameOf(round, id)).join(", ")}${round.change ? ` · ±${round.change}` : ""}`
                        )
                    ),
                    el("span", `apchip${round.status === "running" ? " is-open" : round.status === "done" ? " is-accepted" : ""}`, data!.statuses[round.status])
                )
            )
        );

        return card(
            "Verlauf",
            "Jede Runde mit Modus, Aufstellung, Sieger und dem, was sie bewegt hat.",
            el("div", "apfilter", modes, status, ...(pages > 1 ? [back, next] : [])),
            el("div", "aplist", ...(rows.length ? rows : [el("div", "tkempty", icon("#i-stats"), el("span", "", "Noch keine Runde gespielt."))])),
            el("p", "hintline", `${data!.total} insgesamt${pages > 1 ? ` · Seite ${filter.page} von ${pages}` : ""}`)
        );
    }

    /* ------------------------------------------------------------
       Rangliste
       ------------------------------------------------------------ */
    function link(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const url = el("span", "lvlink__url", data!.link);
        const copy = button("btn btn--quiet", icon("#i-copy"), "Link kopieren");
        const open = el("a", "btn btn--quiet");

        open.href = data!.link;
        open.target = "_blank";
        open.rel = "noopener";
        open.append(icon("#i-external"), "Ansehen");

        copy.addEventListener("click", async () => {
            await navigator.clipboard.writeText(data!.link).catch(() => undefined);
            toast("info", "Kopiert", "Der Link führt direkt zur Rangliste.");
        });

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: { board: draft.board } }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", draft.board.open ? "Die Rangliste steht offen." : "Die Rangliste ist wieder zu.");
            void reload();
        });

        return card(
            "Öffentliche Rangliste",
            "Eine Seite ohne Anmeldung – mit allen drei Modi, Stufen und Bilanz. Ohne Freigabe antwortet sie mit „gibt es nicht“.",
            row(
                "Öffentlich",
                "Aus: die Seite zeigt nichts, auch nicht mit Link",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.board.open, "Rangliste öffentlich zeigen", (on) => {
                        draft.board.open = on;
                        save.disabled = false;
                    }),
                    el("span", "", "offen")
                )
            ),
            el("div", "lvlink", url, copy, open),
            el("div", "mcsave lvsave", save)
        );
    }

    /**
     * Die Stufen selbst festlegen: Grenze, Zeichen, Name und Farbe. Die unterste
     * rutscht beim Speichern immer auf 0 - sonst fände eine kleine MMR keine
     * Stufe. Sortiert wird ebenfalls beim Speichern, damit beim Tippen nichts
     * unter den Fingern wegspringt.
     */
    function ladder(): HTMLElement {
        const draft: IRank[] = structuredClone(data!.ranks);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const list = el("div", "mnranks");
        const preview = el("div", "mnladder");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;

        const drawPreview = (): void => {
            const sorted = [...draft].sort((a, b) => a.min - b.min);

            preview.replaceChildren(
                ...sorted.map((rank, index) => {
                    const chip = rankChip(rank, false);

                    chip.append(el("span", "mnrank__from", `ab ${index === 0 ? 0 : rank.min}`));

                    return chip;
                })
            );
        };

        const draw = (): void => {
            list.replaceChildren(
                ...draft.map((rank, index) => {
                    const min = el("input", "text mnmin");
                    const emoji = el("input", "text text--emoji");
                    const name = el("input", "text");
                    const color = el("input", "mncolor");
                    const drop = button("btn btn--quiet btn--icon", icon("#i-x"));

                    min.type = "number";
                    min.min = "0";
                    min.max = String(data!.limits.rankMin);
                    min.value = String(rank.min);
                    min.setAttribute("aria-label", `Ab welcher MMR gilt Stufe ${index + 1}`);
                    min.addEventListener("input", () => {
                        rank.min = Math.max(0, Math.min(data!.limits.rankMin, Number(min.value) || 0));
                        touch();
                        drawPreview();
                    });

                    emoji.type = "text";
                    emoji.value = rank.emoji;
                    emoji.maxLength = 64;
                    emoji.placeholder = "🎮";
                    emoji.setAttribute("aria-label", `Zeichen von Stufe ${index + 1}`);
                    emoji.addEventListener("input", () => {
                        rank.emoji = emoji.value.trim();
                        touch();
                        drawPreview();
                    });

                    name.type = "text";
                    name.value = rank.name;
                    name.maxLength = data!.limits.rankName;
                    name.placeholder = "Name der Stufe";
                    name.setAttribute("aria-label", `Name von Stufe ${index + 1}`);
                    name.addEventListener("input", () => {
                        rank.name = name.value;
                        touch();
                        drawPreview();
                    });

                    color.type = "color";
                    color.value = tone(rank.color) ?? "#8a8f98";
                    color.setAttribute("aria-label", `Farbe von Stufe ${index + 1}`);
                    color.addEventListener("input", () => {
                        rank.color = color.value;
                        touch();
                        drawPreview();
                    });

                    drop.title = "Stufe entfernen";
                    drop.setAttribute("aria-label", `Stufe ${index + 1} entfernen`);
                    drop.disabled = draft.length <= 1;
                    drop.addEventListener("click", () => {
                        draft.splice(index, 1);
                        touch();
                        draw();
                    });

                    return el("div", "mnrow", min, emoji, name, color, drop);
                })
            );

            drawPreview();
        };

        const add = button("btn btn--quiet", icon("#i-plus"), "Stufe hinzufügen");

        add.disabled = draft.length >= data!.limits.ranks;
        add.addEventListener("click", () => {
            const top = draft.reduce((high, rank) => Math.max(high, rank.min), 0);

            draft.push({ min: Math.min(data!.limits.rankMin, top + 100), name: "Neue Stufe", emoji: "", color: "#00afff" });
            touch();
            draw();
        });

        const reset = confirmButton("btn btn--quiet", "#i-refresh", "Vorgabe holen", "Eigene Stufen verwerfen?", async () => {
            if (!(await call("", { action: "settings", settings: { ranks: [] } }))) return;

            toast("info", "Zurückgesetzt", "Die Stufen sind wieder die vorgeschlagenen.");
            void reload();
        });

        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: { ranks: draft } }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Die neuen Stufen stehen überall – auch in Discord.");
            void reload();
        });

        draw();

        return card(
            "Die Stufen",
            `Eigene Namen für die MMR dieses Servers – mit den Rängen im Spiel hat das nichts zu tun. Bis zu ${data!.limits.ranks} Stufen; die unterste gilt immer ab 0.`,
            el("p", "hintline", "Ab welcher MMR · Zeichen · Name · Farbe"),
            list,
            el("div", "mcsave", add),
            el("p", "hintline", "So sieht die Leiter aus:"),
            preview,
            el("div", "mcsave lvsave", save, reset)
        );
    }

    function boardCard(): HTMLElement {
        const tabs = el("div", "seg plkinds");

        tabs.setAttribute("role", "group");
        tabs.setAttribute("aria-label", "Modus wählen");

        for (const mode of MODES) {
            const entry = button("", `${data!.modeLabels[mode]} · ${(data!.boards[mode] ?? []).length}`);

            entry.setAttribute("aria-pressed", String(mode === board));
            entry.addEventListener("click", () => {
                board = mode;
                paint();
            });
            tabs.append(entry);
        }

        const rows = (data!.boards[board] ?? []).map((entry) =>
            el(
                "div",
                `snitem${entry.position <= 3 ? " is-top" : ""}`,
                el(
                    "div",
                    "snitem__head",
                    el("span", "apquestion__no", String(entry.position)),
                    el(
                        "div",
                        "snitem__name",
                        el("b", "", entry.name),
                        el(
                            "span",
                            "",
                            `${entry.wins} Siege · ${entry.losses} Niederlagen · ${entry.games} Runden${entry.streak ? ` · Serie ${entry.streak > 0 ? `+${entry.streak}` : entry.streak}` : ""}`
                        )
                    ),
                    rankChip(entry.rank),
                    el("span", "mnmmr", String(entry.mmr))
                )
            )
        );

        const reset = confirmButton("btn btn--quiet is-danger", "#i-eraser", `${data!.modeLabels[board]} zurücksetzen`, "Wirklich alle Werte dieses Modus löschen?", async () => {
            if (!(await call("", { action: "reset", mode: Number(board) }))) return;

            toast("info", "Zurückgesetzt", `In ${data!.modeLabels[board]} fangen alle wieder beim Startwert an.`);
            void reload();
        });

        return card(
            "Rangliste",
            `Je Modus eine eigene Wertung. Jeder fängt bei ${data!.settings.start} an.`,
            tabs,
            el("div", "aplist", ...(rows.length ? rows : [el("div", "tkempty", icon("#i-crown"), el("span", "", "In diesem Modus hat noch niemand gespielt."))])),
            ...((data!.boards[board] ?? []).length ? [el("div", "mcsave", reset)] : [])
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        host.replaceChildren(
            head(),
            ...(view === "base" ? [basics(), messages()] : view === "live" ? [...queues(), running(), history()] : [boardCard(), ladder(), link()])
        );
    }

    loading(host, 4);

    // Beitreten, verlassen, Runde fertig: die Ansicht zieht sich selbst nach.
    if (view !== "base") onPulse(guildId, ["sixmans"], debounce(() => void reload(), 250));

    void loadGallery(guildId).catch(() => undefined);
    void reload();
}
