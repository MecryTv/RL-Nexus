/**
 * Die öffentliche Rangliste eines Servers (Plan 34, Variante A „Arena“).
 *
 * Kopf mit Server und drei Zahlen zum Zeitraum, Reiter Lifetime / 7 Tage /
 * 30 Tage, Suche, Podium für Platz 1 bis 3, darunter alle weiteren Plätze in
 * Blöcken zu 50. Jede Minute holt die Seite den neuen Stand - aber nicht,
 * während jemand sucht oder gerade nachgeladen wird; Steuerung und Suchfeld
 * bleiben dabei stehen. Wer im Dashboard angemeldet ist, sieht unten seinen
 * eigenen Platz. Discord-IDs bekommt die Seite nicht; die eigene Zeile ist an
 * „me“ zu erkennen. Gibt der Bot 404, hat der Server die Rangliste nicht
 * freigegeben. Siehe docs/Levels.md.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { el, face } from "../core/Ui.js";
import { PERIOD_LABEL, VoiceHours, VoiceText } from "../../../constants/Levels.js";

type Period = "all" | "7d" | "30d";

interface IEntry {
    rank: number;
    /** Das ist der Angemeldete selbst. */
    me: boolean;
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
    guild: { name: string; icon: string | null };
    /** Plan 35: aus dem Stil des Ranglisten-Bilds. */
    style?: { background: string | null; dim: number; accent: string };
    period: Period;
    kpi: { members: number; xp: number; voiceMinutes: number };
    total: number;
    offset: number;
    entries: IEntry[];
    matches?: { name: string; rank: number; offset: number }[];
    viewer: IEntry | null;
    signedIn: boolean;
    updatedAt: number;
}

const NUMBER = new Intl.NumberFormat("de-DE");
const CHUNK = 50;
const REFRESH_MS = 60_000;
const MEDALS = ["is-gold", "is-silver", "is-bronze"];

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

function trend(value: IEntry["trend"]): HTMLElement {
    if (value === "new") return el("span", "arena__trend is-new", "NEU");
    if (value === 0) return el("span", "arena__trend", "–");

    return el("span", `arena__trend ${value > 0 ? "is-up" : "is-down"}`, `${value > 0 ? "▲" : "▼"} ${Math.abs(value)}`);
}

/** Punkte immer mit Beschriftung - eine nackte Zahl gibt es nicht. */
function points(xp: number): HTMLElement {
    return el("span", "arena__points", el("b", "", NUMBER.format(xp)), el("small", "", "Punkte"));
}

function since(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60_000);

    return minutes < 1 ? "Stand: gerade eben" : `Stand: vor ${minutes} Min.`;
}

export async function renderBoard(): Promise<void> {
    const host = need<HTMLElement>("#board");
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    // Was neu gezeichnet wird; die Steuerung dazwischen bleibt stehen.
    const heroHost = el("div", "");
    const controlsHost = el("div", "");
    const bodyHost = el("div", "arena__body");
    // Die Hülle klebt, nicht die Leiste: allein in ihrer Hülle hätte sie keinen Platz zum Mitrutschen.
    const dockHost = el("div", "arena__dockhost");
    let period: Period = "all";
    let loaded: IEntry[] = [];
    let last: IBoard | null = null;
    let observer: IntersectionObserver | null = null;
    /** Wechselt mit jedem Zeitraum: Antworten aus dem alten Zeitraum werden verworfen. */
    let generation = 0;
    /** Lädt gerade etwas nach - dann wartet die Aktualisierung. */
    let busy = false;
    let search: HTMLInputElement | null = null;
    let stand: HTMLElement | null = null;

    async function fetchBoard(offset: number, query = ""): Promise<IBoard | number> {
        const params = new URLSearchParams({ period, offset: String(offset), ...(query ? { q: query } : {}) });
        // no-cache: nach dem Anmelden nicht die alte Antwort ohne eigenen Platz.
        const response = await fetch(`${BASE}/api/public/levels/${encodeURIComponent(id)}?${params}`, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-cache" }).catch(() => null);

        if (!response?.ok) return response?.status ?? 0;

        return (await response.json()) as IBoard;
    }

    /** Lädt alle Blöcke bis einschließlich dem, in dem rank steht. */
    async function loadUntil(rank: number): Promise<void> {
        const mine = generation;

        busy = true;

        try {
            while (last && loaded.length < Math.min(rank, last.total)) {
                const next = await fetchBoard(loaded.length);

                if (typeof next === "number" || mine !== generation) return;

                last = next;
                loaded = [...loaded, ...next.entries];
            }
        } finally {
            busy = false;
        }
    }

    async function jump(rank: number): Promise<void> {
        await loadUntil(rank);
        paint();
        document.getElementById(`rank-${rank}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById(`rank-${rank}`)?.classList.add("is-flash");
    }

    /* ------------------------------------------------------------
       Kopf, Steuerung, Podium, Zeilen, eigene Leiste
       ------------------------------------------------------------ */
    function hero(board: IBoard): HTMLElement {
        const badge = el("div", "arena__icon", ...(board.guild.icon ? [] : [icon("#i-chart-up")]));
        const scope = period === "all" ? "insgesamt" : `in ${PERIOD_LABEL[period]}`;

        if (board.guild.icon) {
            const image = el("img", "");

            image.src = board.guild.icon;
            image.alt = "";
            badge.append(image);
        }

        const section = el(
            "section",
            "arena__hero",
            el("div", "arena__id", badge, el("div", "", el("h1", "", board.guild.name), el("p", "", "Punkte fürs Schreiben und für die Zeit im Sprachkanal"))),
            el(
                "div",
                "arena__kpis",
                el("div", "", el("b", "", NUMBER.format(board.kpi.members)), el("span", "", "Mitglieder mit Punkten")),
                el("div", "", el("b", "", NUMBER.format(board.kpi.xp)), el("span", "", `Punkte ${scope}`)),
                el("div", "", el("b", "", VoiceHours(board.kpi.voiceMinutes)), el("span", "", `Voice ${scope}`))
            )
        );

        // Hintergrund (abgedunkelt) und Akzent wie im Ranglisten-Bild. Die Adresse kommt vom Bot und ist kodiert.
        if (board.style) {
            section.style.setProperty("--arena-accent", board.style.accent);
            section.style.setProperty("--arena-dim", String(board.style.dim / 100));

            if (board.style.background) {
                section.style.setProperty("--arena-bg", `url("${board.style.background}")`);
                section.classList.add("has-bg");
            }
        }

        return section;
    }

    /** Einmal je Zeitraum gebaut - die Aktualisierung fasst sie nicht an. */
    function controls(): HTMLElement {
        const tabs = el(
            "div",
            "arena__tabs",
            ...(Object.keys(PERIOD_LABEL) as Period[]).map((key) => {
                const tab = el("button", key === period ? "is-on" : "", PERIOD_LABEL[key]);

                tab.type = "button";
                tab.setAttribute("aria-pressed", String(key === period));
                tab.addEventListener("click", () => {
                    if (key === period) return;

                    period = key;
                    void start();
                });

                return tab;
            })
        );
        const input = el("input", "text arena__search");
        const results = el("div", "arena__results");
        let timer = 0;

        stand = el("span", "arena__stand", "");
        search = input;
        input.type = "search";
        input.placeholder = "Name suchen";
        input.setAttribute("aria-label", "Name in der Rangliste suchen");
        input.addEventListener("input", () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(async () => {
                const query = input.value.trim();

                if (!query) return void results.replaceChildren();

                const found = await fetchBoard(0, query);
                const matches = typeof found === "number" ? [] : (found.matches ?? []);

                results.replaceChildren(
                    ...(matches.length
                        ? matches.map((match) => {
                              const pick = el("button", "", el("b", "", `#${match.rank}`), document.createTextNode(` ${match.name}`));

                              pick.type = "button";
                              pick.addEventListener("click", () => {
                                  results.replaceChildren();
                                  input.value = "";
                                  void jump(match.rank);
                              });

                              return pick;
                          })
                        : [el("span", "", "Niemand mit diesem Namen hat im Zeitraum Punkte.")])
                );
            }, 300);
        });

        return el("div", "arena__controls", tabs, el("div", "arena__find", stand, el("div", "arena__searchbox", input, results)));
    }

    function podium(entries: IEntry[]): HTMLElement | null {
        const top = entries.filter((entry) => entry.rank <= 3);

        if (!top.length) return null;

        const card = (entry: IEntry): HTMLElement =>
            el(
                "div",
                `arena__pd ${MEDALS[entry.rank - 1]}${entry.rank === 1 ? " is-first" : ""}${entry.me ? " is-me" : ""}`,
                el("em", "", String(entry.rank)),
                face({ name: entry.name, avatar: entry.avatar }, "travatar arena__pdava"),
                el("b", "", entry.name),
                el("span", "", `Level ${entry.level} · ${NUMBER.format(entry.messages)} Nachr. · ${VoiceHours(entry.voiceMinutes)}`),
                points(entry.xp),
                trend(entry.trend)
            );
        const order = [top.find((entry) => entry.rank === 2), top.find((entry) => entry.rank === 1), top.find((entry) => entry.rank === 3)].filter((entry): entry is IEntry => Boolean(entry));

        return el("div", "arena__podium", ...order.map(card));
    }

    function row(entry: IEntry): HTMLElement {
        const share = entry.need > 0 ? Math.min(100, Math.round((entry.into / entry.need) * 100)) : 100;
        const fill = el("i", "");
        const line = el(
            "div",
            `arena__row${entry.me ? " is-me" : ""}`,
            el("span", "arena__place", String(entry.rank)),
            face({ name: entry.name, avatar: entry.avatar }, "travatar arena__ava"),
            el("span", "arena__who", el("b", "", entry.name, ...(entry.me ? [el("span", "arena__you", "Du")] : [])), el("small", "", `${NUMBER.format(entry.messages)} Nachr. · ${VoiceText(entry.voiceMinutes)}`)),
            el("span", "arena__level", el("small", "", "LVL"), el("b", "", String(entry.level))),
            el("span", "arena__bar", fill),
            points(entry.xp),
            trend(entry.trend)
        );

        fill.style.width = `${share}%`;
        line.id = `rank-${entry.rank}`;

        return line;
    }

    function dock(board: IBoard): HTMLElement {
        if (!board.signedIn) {
            const login = el("a", "btn btn--primary", "Mit Discord anmelden");

            login.href = `${BASE}/login?return=${encodeURIComponent(window.location.pathname)}`;

            return el("div", "arena__dock is-out", el("span", "", "Melde dich mit Discord an, dann siehst du hier deinen Platz."), login);
        }

        const me = board.viewer;

        if (!me) return el("div", "arena__dock is-out", el("span", "", period === "all" ? "Noch keine Punkte auf diesem Server." : `Im Zeitraum ${PERIOD_LABEL[period]} noch keine Punkte.`));

        const go = el("button", "arena__go", "Zu meinem Platz");

        go.type = "button";
        go.addEventListener("click", () => void jump(me.rank));

        return el(
            "div",
            "arena__dock",
            el("span", "arena__place", `#${me.rank}`),
            face({ name: me.name, avatar: me.avatar }, "travatar arena__ava"),
            el("span", "arena__who", el("b", "", me.name), el("small", "", `Dein Platz · ${PERIOD_LABEL[period]}`)),
            el("span", "arena__level", el("small", "", "LVL"), el("b", "", String(me.level))),
            points(me.xp),
            trend(me.trend),
            go
        );
    }

    /** Kopf, Liste und Leiste neu - die Steuerung samt Suchfeld bleibt. */
    function paint(): void {
        if (!last) return;

        const lift = podium(loaded);
        const rows = loaded.filter((entry) => entry.rank > 3).map(row);
        const more = el("button", "btn btn--quiet arena__more", `Weitere Plätze laden (${NUMBER.format(last.total - loaded.length)} übrig)`);
        const bar = dock(last);

        more.type = "button";
        more.addEventListener("click", async () => {
            more.disabled = true;
            await loadUntil(loaded.length + 1);
            paint();
        });

        document.title = `RL Nexus · Rangliste von ${last.guild.name}`;

        if (stand) {
            stand.dataset.at = String(last.updatedAt);
            stand.textContent = since(last.updatedAt);
        }

        heroHost.replaceChildren(hero(last));
        bodyHost.replaceChildren(
            ...(loaded.length
                ? [...(lift ? [lift] : []), el("div", "arena__list", ...rows), ...(loaded.length < last.total ? [more] : [])]
                : [empty("Noch keine Punkte", period === "all" ? "Sobald jemand schreibt oder im Sprachkanal sitzt, steht er hier." : "In diesem Zeitraum hat noch niemand Punkte gesammelt.")])
        );
        dockHost.replaceChildren(bar);

        // Steht die eigene Zeile gerade im Bild, braucht es die Leiste nicht.
        observer?.disconnect();

        const own = bodyHost.querySelector(".arena__row.is-me, .arena__pd.is-me");

        if (own && last.viewer) {
            observer = new IntersectionObserver(([entry]) => bar.classList.toggle("is-hidden", entry.isIntersecting));
            observer.observe(own);
        }
    }

    /** Erster Block im gewählten Zeitraum; baut die Steuerung neu. */
    async function start(): Promise<void> {
        const mine = ++generation;
        const first = await fetchBoard(0);

        if (mine !== generation) return;

        if (typeof first === "number") {
            host.replaceChildren(
                empty(
                    "Diese Rangliste gibt es nicht",
                    first === 404 ? "Entweder ist das Level System auf diesem Server aus, oder die Rangliste steht nicht öffentlich." : "Der Bot antwortet gerade nicht. Lade die Seite in einem Moment neu."
                )
            );

            return;
        }

        last = first;
        loaded = first.entries;
        controlsHost.replaceChildren(controls());

        if (!host.contains(heroHost)) host.replaceChildren(heroHost, controlsHost, bodyHost, dockHost);

        paint();
    }

    /** Jede Minute neu holen, was schon geladen ist - nicht während einer Suche oder beim Nachladen. */
    async function refresh(): Promise<void> {
        if (!last || busy || search?.value.trim()) return;

        const mine = generation;
        const fresh: IEntry[] = [];
        let head: IBoard | null = null;

        busy = true;

        try {
            for (let offset = 0; offset < Math.max(CHUNK, loaded.length); offset += CHUNK) {
                const next = await fetchBoard(offset);

                if (typeof next === "number" || mine !== generation) return;

                head ??= next;
                fresh.push(...next.entries);
            }
        } finally {
            busy = false;
        }

        last = head;
        loaded = fresh;
        paint();
    }

    window.setInterval(() => void refresh(), REFRESH_MS);
    window.setInterval(() => {
        if (stand?.dataset.at) stand.textContent = since(Number(stand.dataset.at));
    }, 15_000);

    await start();
}
