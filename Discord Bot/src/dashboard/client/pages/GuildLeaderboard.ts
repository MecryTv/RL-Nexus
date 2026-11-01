/**
 * Abschnitt: Rangliste - der Teil des Level Systems, der die Zahlen zeigt.
 *
 * Steht in der Leiste unter dem Level System, so wie Live Tickets unter dem
 * Ticket System. Hier stehen die Plätze, der Schalter für die öffentliche
 * Liste und die Punkte, die von Hand vergeben werden - mit Grund und, seit
 * Plan 37, dem Protokoll aller Änderungen von Hand. Plan 43: die Rangliste
 * fest in einem Kanal.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, face, IPerson, loading, personPicker, row, select, stat, toggle } from "../core/Ui.js";
import { PERIOD_LABEL, VoiceText } from "../../../constants/Levels.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { BoardPostTitle } from "../constants/LevelFields.js";

type Period = "all" | "7d" | "30d";

/** Plan 34: ein Platz im Zeitraum, wie LevelService.Board ihn liefert. */
interface IBoardEntry {
    rank: number;
    userId: string;
    name: string;
    avatar: string | null;
    level: number;
    xp: number;
    messages: number;
    voiceMinutes: number;
    trend: number | "new";
    into: number;
    need: number;
}

interface IBoard {
    period: Period;
    page: number;
    pages: number;
    total: number;
    entries: IBoardEntry[];
}

interface IRank {
    id: string;
    name: string;
    avatar: string | null;
    gone: boolean;
    rank: number;
    level: number;
    xp: number;
    into: number;
    need: number;
    messages: number;
    voiceMinutes: number;
}

/** Plan 43: die Rangliste fest im Kanal. */
interface IBoardPost {
    on: boolean;
    channelId: string | null;
    period: Period;
}

/** Plan 43: was im Kanal steht, wie LevelBoardPosts.Of es liefert. */
interface IBoardPostStatus {
    channelId: string;
    messageId: string | null;
    error: string | null;
    updatedAt: number;
}

interface IPayload {
    settings: { public: boolean; boardPost?: IBoardPost; [key: string]: unknown };
    page: number;
    total: number;
    top: IRank[];
    boardPostStatus?: IBoardPostStatus | null;
    guild: { channels: { id: string; name: string }[] };
}

/** Plan 37: ein Eintrag im Protokoll, wie LevelService.Log ihn liefert. */
interface ILogEntry {
    id: number;
    mode: "add" | "set" | "reset";
    amount: number;
    before: number;
    after: number;
    reason: string;
    createdAt: number;
    name: string;
    actorName: string;
}

const NUMBER = new Intl.NumberFormat("de-DE");

export function renderLeaderboard(guildId: string): void {
    const host = need<HTMLElement>("#boardBody");
    const note = need<HTMLElement>("#boardNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/levels`, note);
    const link = `${window.location.origin}${BASE}/rangliste/${guildId}`;

    let data: IPayload | null = null;
    let list: IBoard | null = null;
    let log: ILogEntry[] = [];
    let chosen: IPerson | null = null;
    let page = 1;
    let period: Period = "all";
    /** Plan 43: Entwurf der Rangliste im Kanal - „Speichern“ schickt nur diesen Teil. */
    let post: IBoardPost | null = null;

    /* ------------------------------------------------------------
       Kopf und öffentliche Liste
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const best = data!.top[0];

        return el(
            "div",
            "tkhead snhead",
            stat("#i-chart-up", "Mit Punkten", NUMBER.format(data!.total)),
            stat("#i-crown", "Spitze", best ? `${best.name} · Level ${best.level}` : "noch niemand"),
            stat("#i-eye", "Öffentlich", data!.settings.public ? "an" : "aus", data!.settings.public ? "is-ok" : "")
        );
    }

    /** Der Schalter speichert sofort - hier gibt es sonst nichts zu speichern. */
    function publicCard(): HTMLElement {
        const copy = button("btn btn--quiet", icon("#i-copy"), "Link kopieren");
        const open = el("a", "btn btn--quiet", icon("#i-external"), "Ansehen");
        const box = toggle(data!.settings.public, "Öffentliche Rangliste", async (on) => {
            // Nur der Schalter - so überschreibt diese Seite nichts, was anderswo gerade geändert wurde.
            const answer = await call<{ settings: IPayload["settings"] }>("", { action: "save", settings: { public: on } });

            if (!answer) return;

            data!.settings = answer.settings;
            toast("info", on ? "Öffentlich" : "Nicht mehr öffentlich", on ? "Jeder mit dem Link sieht die Rangliste." : "Die Seite antwortet wieder mit 404.");
            paint();
        });

        (open as HTMLAnchorElement).href = link;
        (open as HTMLAnchorElement).target = "_blank";
        (open as HTMLAnchorElement).rel = "noopener";
        copy.addEventListener("click", async () => {
            await navigator.clipboard.writeText(link).catch(() => undefined);
            toast("info", "Kopiert", "Der Link steht in der Zwischenablage.");
        });

        return card(
            "Öffentliche Rangliste",
            "An heißt: jeder mit dem Link sieht die Liste – ohne Anmeldung, ohne Discord-Konto. Zu sehen sind Platz, Name, Bild, Level, Punkte, Nachrichten und Voice-Zeit. Wer mit Discord angemeldet ist, sieht dazu seinen eigenen Platz.",
            row("Öffentlich", "Gilt sofort", el("label", "snitem__switch", box, el("span", "", data!.settings.public ? "an" : "aus"))),
            ...(data!.settings.public ? [el("div", "lvlink", el("code", "lvlink__url", link), copy, open)] : [])
        );
    }

    /* ------------------------------------------------------------
       Rangliste im Kanal (Plan 43)
       ------------------------------------------------------------ */
    function postCard(): HTMLElement {
        const saved: IBoardPost = data!.settings.boardPost ?? { on: false, channelId: null, period: "all" };
        const draft = (post ??= { ...saved });
        const status = data!.boardPostStatus ?? null;
        const changed = JSON.stringify(draft) !== JSON.stringify(saved);
        const when = (at: number) => new Date(at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        const channel = select(
            [["", "— Kanal wählen —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            draft.channelId ?? "",
            (value) => {
                draft.channelId = value || null;
                paint();
            },
            "Kanal für die Rangliste"
        );
        const range = select(
            (Object.keys(PERIOD_LABEL) as Period[]).map((key): [string, string] => [key, PERIOD_LABEL[key]]),
            draft.period,
            (value) => {
                draft.period = value as Period;
                paint();
            },
            "Zeitraum der Rangliste im Kanal"
        );
        const save = button("btn btn--primary", "Speichern");
        const redraw = button("btn btn--quiet", icon("#i-refresh"), "Jetzt neu zeichnen");
        const open = el("a", "btn btn--quiet", icon("#i-external"), "Zur Nachricht") as HTMLAnchorElement;
        const shown = saved.on && status?.messageId ? status : null;

        channel.disabled = range.disabled = !draft.on;
        save.disabled = !changed;
        redraw.disabled = !saved.on || changed;

        if (shown) {
            open.href = `https://discord.com/channels/${encodeURIComponent(guildId)}/${shown.channelId}/${shown.messageId}`;
            open.target = "_blank";
            open.rel = "noopener";
        }

        save.addEventListener("click", async () => {
            save.disabled = true;

            // Nur dieser Teil - so überschreibt die Seite nichts, was anderswo gerade geändert wurde.
            const answer = await call<{ settings: IPayload["settings"]; boardPostStatus: IBoardPostStatus | null }>("", { action: "save", settings: { boardPost: draft } });

            if (!answer) {
                save.disabled = false;

                return;
            }

            data!.settings = answer.settings;
            data!.boardPostStatus = answer.boardPostStatus;
            post = null;

            const error = answer.boardPostStatus?.error;

            toast("info", BoardPostTitle(draft.on, error), error ?? (draft.on ? "Die Nachricht steht im Kanal." : "Die Nachricht ist gelöscht."));
            paint();
        });

        redraw.addEventListener("click", async () => {
            redraw.disabled = true;

            const answer = await call<{ result: string; boardPostStatus: IBoardPostStatus | null }>("", { action: "boardpost.draw" });

            if (!answer) {
                redraw.disabled = false;

                return;
            }

            data!.boardPostStatus = answer.boardPostStatus;
            toast("info", answer.result === "failed" ? "Nicht gezeichnet" : "Neu gezeichnet", answer.boardPostStatus?.error ?? (answer.result === "sent" ? "Die Nachricht war weg und steht jetzt neu im Kanal." : "Die Nachricht im Kanal ist auf dem neuesten Stand."));
            paint();
        });

        const state = !saved.on
            ? []
            : [
                  el(
                      "p",
                      `hintline${status?.error ? " is-warn" : ""}`,
                      status?.messageId ? `Zuletzt gezeichnet am ${when(status.updatedAt)}. Alle 10 Minuten sieht der Bot nach und zeichnet neu, wenn sich etwas geändert hat.` : "Noch nicht im Kanal.",
                      status?.error ? ` ${status.error}` : ""
                  ),
              ];

        return card(
            "Rangliste im Kanal",
            "Seite 1 als Bild, fest in einem Kanal – wie /level rangliste und mit der Gestaltung aus Level-Karte › Rangliste. Die Knöpfe darunter öffnen jedem eine eigene Ansicht, die Nachricht selbst bleibt bei Seite 1.",
            row(
                "Im Kanal zeigen",
                "Ausschalten löscht die Nachricht",
                el(
                    "label",
                    "snitem__switch",
                    toggle(draft.on, "Rangliste im Kanal", (on) => {
                        draft.on = on;
                        paint();
                    }),
                    el("span", "", draft.on ? "an" : "aus")
                )
            ),
            row("Kanal", "Der Bot braucht dort: Nachrichten senden, Dateien anhängen, Verlauf lesen", channel),
            row("Zeitraum", "Welche Punkte zählen", range),
            ...state,
            el("div", "mcsave", ...(shown ? [open] : []), redraw, save)
        );
    }

    /* ------------------------------------------------------------
       Die Plätze
       ------------------------------------------------------------ */
    /** ▲ 3, ▼ 1, – oder NEU gegenüber sieben Tagen davor. */
    function trend(value: IBoardEntry["trend"]): HTMLElement {
        if (value === "new") return el("span", "lvtrend is-new", "NEU");
        if (value === 0) return el("span", "lvtrend", "–");

        return el("span", `lvtrend ${value > 0 ? "is-up" : "is-down"}`, `${value > 0 ? "▲" : "▼"} ${Math.abs(value)}`);
    }

    function board(): HTMLElement {
        const entries = list?.entries ?? [];
        const rows = entries.map((entry) => {
            const share = entry.need > 0 ? Math.round((entry.into / entry.need) * 100) : 100;
            const fill = el("span", "plbar__fill", "");

            fill.style.width = `${share}%`;

            return el(
                "div",
                `plrow vcrow lvrow${entry.rank <= 3 ? " is-top" : ""}`,
                el("span", "lvplace", `#${entry.rank}`),
                face({ name: entry.name, avatar: entry.avatar }, "travatar"),
                el(
                    "div",
                    "plrow__main",
                    el("div", "plrow__top", el("b", "", entry.name), trend(entry.trend)),
                    el("span", "gwrow__facts", `Level ${entry.level} · ${NUMBER.format(entry.xp)} Punkte · ${NUMBER.format(entry.messages)} Nachrichten · ${VoiceText(entry.voiceMinutes)} Voice`)
                ),
                el("div", "plbars", el("div", "plbar", el("span", "plbar__label", `${NUMBER.format(entry.into)} / ${NUMBER.format(entry.need)}`), el("span", "plbar__track", fill), el("span", "plbar__value", `L${entry.level + 1}`)))
            );
        });

        const tabs = el(
            "div",
            "lvtabs",
            ...(Object.keys(PERIOD_LABEL) as Period[]).map((key) => {
                const tab = button(`btn ${key === period ? "btn--primary" : "btn--quiet"}`, PERIOD_LABEL[key]);

                tab.addEventListener("click", () => {
                    period = key;
                    void loadBoard(1);
                });

                return tab;
            })
        );
        const prev = button("btn btn--quiet", icon("#i-up"), "Zurück");
        const next = button("btn btn--quiet", icon("#i-down"), "Weiter");

        prev.disabled = !list || list.page <= 1;
        next.disabled = !list || list.page >= list.pages;
        prev.addEventListener("click", () => void loadBoard(page - 1));
        next.addEventListener("click", () => void loadBoard(page + 1));

        return card(
            "Rangliste",
            `${NUMBER.format(list?.total ?? 0)} ${list?.total === 1 ? "Mitglied hat" : "Mitglieder haben"} im Zeitraum Punkte. Der Pfeil zeigt, wie viele Plätze jemand seit sieben Tagen gestiegen oder gefallen ist. In Discord zeigt /level rangliste dieselbe Liste.`,
            tabs,
            ...(rows.length
                ? rows
                : [el("div", "tkempty tkempty--big", icon("#i-chart-up"), el("b", "", "Noch hat niemand Punkte."), el("span", "", "Sobald jemand schreibt oder im Sprachkanal sitzt, steht er hier."))]),
            ...(rows.length || page > 1 ? [el("div", "mcsave lvpager", prev, next)] : [])
        );
    }

    /* ------------------------------------------------------------
       Punkte von Hand
       ------------------------------------------------------------ */
    function manage(): HTMLElement {
        const amount = el("input", "text gwnum");
        const mode = select(
            [
                ["add", "geben"],
                ["take", "abziehen"],
                ["set", "setzen auf"],
            ],
            "add",
            () => undefined,
            "Was mit den Punkten passieren soll"
        );
        // Plan 37: steht mit im Protokoll.
        const reason = el("input", "text lvreason");

        reason.type = "text";
        reason.maxLength = 200;
        reason.placeholder = "Grund, etwa „Turniersieg“";
        reason.setAttribute("aria-label", "Grund");
        const go = button("btn btn--primary", icon("#i-check"), "Übernehmen");
        const pickHost = el("div", "snperson");
        const drawPick = (): void => {
            pickHost.replaceChildren(
                personPicker(call, chosen, (person) => {
                    chosen = person;
                    drawPick();
                })
            );
        };

        amount.type = "number";
        amount.min = "0";
        amount.max = "10000000";
        amount.value = "0";
        amount.setAttribute("aria-label", "Punkte");

        drawPick();

        go.addEventListener("click", async () => {
            if (!chosen) {
                toast("info", "Niemand gewählt", "Such zuerst ein Mitglied.");

                return;
            }

            go.disabled = true;

            const points = Math.abs(Number(amount.value) || 0);
            const answer = await call("", { action: "adjust", userId: chosen.id, mode: mode.value === "take" ? "add" : mode.value, amount: mode.value === "take" ? -points : points, reason: reason.value });

            go.disabled = false;

            if (!answer) return;

            toast("info", "Punkte geändert", `${chosen.name} steht jetzt anders da.`);
            load(page);
        });

        const wipe = confirmButton("btn btn--quiet", "#i-trash", "Punkte zurücksetzen", "Wirklich zurücksetzen?", async () => {
            if (!chosen) {
                toast("info", "Niemand gewählt", "Such zuerst ein Mitglied.");

                return;
            }

            const answer = await call("", { action: "adjust", userId: chosen.id, mode: "reset", reason: reason.value });

            if (answer) {
                toast("info", "Zurückgesetzt", `${chosen.name} fängt wieder bei null an.`);
                load(page);
            }
        });

        const clear = confirmButton("btn btn--quiet btn--danger", "#i-eraser", "Ganze Rangliste löschen", "Wirklich alle löschen?", async () => {
            const answer = await call("", { action: "reset" });

            if (answer) {
                toast("info", "Rangliste gelöscht", "Alle fangen wieder bei null an.");
                load(1);
            }
        });

        return card(
            "Punkte von Hand",
            "Für Umzüge, Fehler und kleine Belohnungen. Level und Belohnungsrollen zieht der Bot nach, die Änderung zählt in den heutigen Tag. In Discord geht dasselbe mit /level punkte.",
            row("Mitglied", "Nach Name oder ID suchen", pickHost),
            row("Grund", "Steht im Protokoll", reason),
            row("Punkte", "Geben, abziehen oder auf eine Zahl setzen", el("div", "lvrange", mode, amount, go)),
            el("div", "mcsave", clear, wipe)
        );
    }

    /* ------------------------------------------------------------
       Protokoll (Plan 37)
       ------------------------------------------------------------ */
    function logCard(): HTMLElement {
        const when = (at: number) => new Date(at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        const what = (entry: ILogEntry): string => {
            const points = `${NUMBER.format(Math.abs(entry.amount))} Punkte`;
            const change = `${NUMBER.format(entry.before)} → ${NUMBER.format(entry.after)}`;

            if (entry.mode === "reset") return `${entry.actorName} hat ${entry.name} zurückgesetzt (${change})`;
            if (entry.mode === "set") return `${entry.actorName} hat ${entry.name} auf ${points} gesetzt (${change})`;

            return entry.amount < 0 ? `${entry.actorName} hat ${entry.name} ${points} abgezogen (${change})` : `${entry.actorName} hat ${entry.name} ${points} gegeben (${change})`;
        };
        const rows = log.map((entry) => el("div", "lvlog__row", el("span", "lvlog__when", when(entry.createdAt)), el("div", "", el("span", "", what(entry)), el("i", "lvlog__why", entry.reason || "ohne Grund"))));

        return card(
            "Protokoll",
            "Jede Änderung von Hand, hier und mit /level punkte. Die Einträge bleiben 180 Tage, zu sehen sind die letzten 50.",
            ...(rows.length ? [el("div", "lvlog", ...rows)] : [el("p", "hintline", "Noch hat niemand Punkte von Hand geändert.")])
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    let headNode: HTMLElement | null = null;
    let boardNode: HTMLElement | null = null;

    function paint(): void {
        if (!data) return;

        headNode = head();
        boardNode = board();
        host.replaceChildren(headNode, publicCard(), postCard(), boardNode, manage(), logCard());
    }

    /**
     * Plan 35: Schreibt jemand oder sitzt im Sprachkanal, meldet der Bot das
     * (Puls "levels", höchstens alle 2 s). Dann zieht die aktuelle Seite nach -
     * nur die Ranglisten-Karte und die Zahl oben, „Punkte von Hand“ bleibt, wie
     * es ist. Ist der Abschnitt oder der Browser-Tab nicht zu sehen, wird nur
     * vorgemerkt und beim nächsten Hinsehen einmal nachgeladen.
     */
    const section = host.closest("section");
    let busy = false;
    let again = false;
    let stale = false;
    /** Zählt jedes Laden von Hand - eine Live-Antwort von davor zählt nicht mehr. */
    let view = 0;

    const unseen = (): boolean => document.hidden || Boolean(section?.hidden);

    async function live(): Promise<void> {
        if (!data || !headNode || !boardNode) return;

        if (unseen()) {
            stale = true;

            return;
        }

        if (busy) {
            again = true;

            return;
        }

        busy = true;
        stale = false;

        const mine = view;
        const asked = { period, page };
        const answer = await call<IBoard>("", { action: "board", period: asked.period, page: asked.page });

        busy = false;

        // Inzwischen von Hand geblättert oder den Zeitraum gewechselt: diese Antwort ist alt.
        if (mine !== view || asked.period !== period || asked.page !== page) {
            again = true;
        } else if (answer && headNode.isConnected && boardNode.isConnected) {
            list = answer;

            if (period === "all") data.total = answer.total;

            const nextHead = head();
            const nextBoard = board();

            headNode.replaceWith(nextHead);
            boardNode.replaceWith(nextBoard);
            headNode = nextHead;
            boardNode = nextBoard;
        }

        if (again) {
            again = false;
            void live();
        }
    }

    const wake = (): void => {
        if (stale && !unseen()) void live();
    };

    onPulse(guildId, ["levels"], debounce(() => void live(), 300));
    document.addEventListener("visibilitychange", wake);
    if (section) new MutationObserver(wake).observe(section, { attributes: true, attributeFilter: ["hidden"] });

    /** Plan 34: eine Seite im gewählten Zeitraum, 25 je Seite. */
    async function loadBoard(next: number): Promise<void> {
        view++;

        const answer = await call<IBoard>("", { action: "board", period, page: Math.max(1, next) });

        if (!answer) return;

        list = answer;
        page = answer.page;
        paint();
    }

    function load(next: number): void {
        view++;
        void call<IPayload>("").then((answer) => {
            if (!answer) return;

            data = answer;
            post = null;
            void call<{ entries: ILogEntry[] }>("", { action: "log" }).then((entries) => {
                log = entries?.entries ?? [];
                void loadBoard(next);
            });
        });
    }

    loading(host, 3);
    load(1);
}
