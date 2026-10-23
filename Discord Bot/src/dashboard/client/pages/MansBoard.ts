/**
 * Die öffentliche Rangliste von 2, 4 & 6 Mans - ohne Anmeldung.
 *
 * Die Server-ID steht in der Adresse (/mans/<id>). Geholt wird eine einzige
 * Antwort mit allen drei Listen; gibt der Bot 404, hat der Server sie nicht
 * freigegeben.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { button, el, face, stat } from "../core/Ui.js";

type Mode = "2" | "4" | "6";

interface IRank {
    min: number;
    name: string;
    emoji: string;
    color: string;
}

interface IEntry {
    position: number;
    name: string;
    avatar: string | null;
    mmr: number;
    rank: IRank;
    wins: number;
    losses: number;
    games: number;
    streak: number;
}

interface IBoard {
    guild: { name: string; icon: string | null; members: number };
    modes: number[];
    modeLabels: Record<Mode, string>;
    modeHints: Record<Mode, string>;
    ranks: IRank[];
    start: number;
    boards: Record<Mode, IEntry[]>;
}

const NUMBER = new Intl.NumberFormat("de-DE");

/** Nur echte Farben aus der Antwort - alles andere bleibt die Standardfarbe. */
function color(value: string): string | null {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

export async function renderMansBoard(): Promise<void> {
    const host = need<HTMLElement>("#board");
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    const response = await fetch(`${BASE}/api/public/mans/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } }).catch(() => null);

    if (!response?.ok) {
        host.replaceChildren(
            empty(
                "Diese Rangliste gibt es nicht",
                response?.status === 404
                    ? "Entweder sind 2, 4 & 6 Mans auf diesem Server aus, oder die Rangliste steht nicht öffentlich."
                    : "Der Bot antwortet gerade nicht. Lade die Seite in einem Moment neu."
            )
        );

        return;
    }

    const data = (await response.json()) as IBoard;
    const modes = (data.modes.length ? data.modes : [6]).map((mode) => String(mode) as Mode);

    let active: Mode = modes[0];

    document.title = `RL Nexus · Mans-Rangliste von ${data.guild.name}`;

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function header(): HTMLElement {
        const crest = el("div", "board__face");

        if (data.guild.icon) {
            const image = el("img", "board__icon");

            image.src = data.guild.icon;
            image.alt = "";
            crest.append(image);
        } else {
            crest.append(icon("#i-gamepad"));
        }

        return el(
            "header",
            "board__head",
            crest,
            el("div", "board__title", el("h1", "", data.guild.name), el("p", "", "2, 4 & 6 Mans – die Wertung dieses Servers, nicht die Ränge aus dem Spiel"))
        );
    }

    /** Die Modi als Umschalter. Bei nur einem Modus fällt er weg. */
    function tabs(): HTMLElement | null {
        if (modes.length < 2) return null;

        const box = el("div", "seg plkinds");

        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "Modus wählen");

        for (const mode of modes) {
            const entry = button("", `${data.modeLabels[mode]} · ${data.modeHints[mode]}`);

            entry.setAttribute("aria-pressed", String(mode === active));
            entry.addEventListener("click", () => {
                active = mode;
                paint();
            });
            box.append(entry);
        }

        return box;
    }

    /** Die Stufen als Legende - damit klar ist, was die Namen bedeuten. */
    function ladder(): HTMLElement {
        return el(
            "div",
            "mnladder",
            ...data.ranks.map((rank) => {
                const chip = el("span", "mnrank", el("span", "", rank.emoji), el("b", "", rank.name), el("span", "mnrank__from", `ab ${NUMBER.format(rank.min)}`));
                const tone = color(rank.color);

                if (tone) chip.style.setProperty("--mnrank", tone);

                return chip;
            })
        );
    }

    function rows(): HTMLElement[] {
        return (data.boards[active] ?? []).map((entry) => {
            const tone = color(entry.rank.color);
            const chip = el("span", "mnrank mnrank--tag", el("span", "", entry.rank.emoji), el("b", "", entry.rank.name));
            const streak = entry.streak > 0 ? `Serie +${entry.streak}` : entry.streak < 0 ? `Serie ${entry.streak}` : "keine Serie";

            if (tone) chip.style.setProperty("--mnrank", tone);

            return el(
                "div",
                `plrow vcrow board__row${entry.position <= 3 ? " is-top" : ""}`,
                el("span", "lvplace", `#${entry.position}`),
                face({ name: entry.name, avatar: entry.avatar }, "travatar"),
                el(
                    "div",
                    "plrow__main",
                    el("div", "plrow__top", el("b", "", entry.name), chip),
                    el("span", "gwrow__facts", `${entry.wins} Siege · ${entry.losses} Niederlagen · ${entry.games} Runden · ${streak}`)
                ),
                el("span", "mnmmr", NUMBER.format(entry.mmr))
            );
        });
    }

    function paint(): void {
        const list = rows();
        const top = data.boards[active]?.[0];
        const parts: (HTMLElement | null)[] = [
            header(),
            tabs(),
            el(
                "div",
                "tkhead board__stats",
                stat("#i-users", "Gewertet", NUMBER.format(data.boards[active]?.length ?? 0)),
                stat("#i-crown", "Spitze", top ? `${top.name} · ${NUMBER.format(top.mmr)}` : "noch niemand"),
                stat("#i-gamepad", "Modus", `${data.modeLabels[active]} · ${data.modeHints[active]}`)
            ),
            ladder(),
            el(
                "div",
                "pllist board__list",
                ...(list.length ? list : [empty("Noch keine Runde", `Sobald jemand ${data.modeLabels[active]} spielt, steht er hier.`)])
            ),
            el("p", "hintline board__foot", `Jeder fängt bei ${NUMBER.format(data.start)} an. Die Liste zeigt die ersten 100 Plätze und aktualisiert sich beim Neuladen.`),
        ];

        host.replaceChildren(...parts.filter((node): node is HTMLElement => node !== null));
    }

    paint();
}
