/**
 * Clips der Woche - die öffentliche Seite, ohne Anmeldung.
 *
 * Die Server-ID steht in der Adresse (/clips/<id>), eine bestimmte Runde in
 * ?woche=<runde>. Oben die Runde mit allen Clips, darunter alle fertigen
 * Runden zum Durchklicken. Die Videos kommen aus den Kopien des Bots. Stimmen
 * stehen erst da, wenn eine Runde fertig ist.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { el, face, stat } from "../core/Ui.js";

interface IWinner {
    place: number;
    name: string;
    votes: number;
    prize: string;
    avatar: string | null;
    entryId?: number;
}

interface IClip {
    id: number;
    name: string;
    avatar: string | null;
    video: string | null;
    votes: number | null;
    rank: number | null;
    createdAt: number;
}

interface IWeek {
    id: number;
    openedAt: number;
    endedAt: number | null;
    count: number;
    winners: IWinner[];
}

interface IBoard {
    guild: { name: string; icon: string | null };
    maxPerUser: number;
    emoji: string;
    prizes: string;
    round: { id: number; status: "open" | "voting" | "done"; openedAt: number; closesAt: number; endsAt: number; endedAt: number | null; winners: IWinner[] } | null;
    clips: IClip[];
    weeks: IWeek[];
}

const WHEN = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const MEDALS = ["🥇", "🥈", "🥉"];

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

/** Nur http(s) oder ein Pfad auf diesem Server wird zur Adresse - eine Angabe aus der Antwort ist trotzdem fremder Text. */
function safe(url: string | null | undefined): string | null {
    return url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : null;
}

function votesText(votes: number): string {
    return votes === 1 ? "1 Stimme" : `${votes} Stimmen`;
}

function media(clip: IClip, done: boolean): HTMLElement {
    const box = el("div", "clcard__media");
    const url = safe(clip.video);

    if (!url) {
        // Läuft die Runde noch, kommt die Kopie gleich. Danach kommt nichts mehr.
        const text = done ? "Von diesem Clip gibt es keine Kopie." : "Das Video wird gerade gesichert und ist gleich hier zu sehen.";

        box.append(el("div", "clcard__link", icon("#i-play"), el("span", "", text)));

        return box;
    }

    const video = el("video");

    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", `Clip von ${clip.name}`);
    box.append(video);

    return box;
}

/** Die Adresse einer Runde - ohne Angabe die neueste. */
function weekUrl(id: number | null): string {
    return `${window.location.pathname}${id === null ? "" : `?woche=${id}`}`;
}

function wantedWeek(): number | null {
    const value = new URLSearchParams(window.location.search).get("woche");

    return value && /^\d{1,10}$/.test(value) ? Number(value) : null;
}

export async function renderClipsBoard(): Promise<void> {
    const host = need<HTMLElement>("#board");
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";

    const show = async (wanted: number | null): Promise<void> => {
        const query = wanted === null ? "" : `?woche=${wanted}`;
        const response = await fetch(`${BASE}/api/public/clips/${encodeURIComponent(id)}${query}`, { headers: { Accept: "application/json" } }).catch(() => null);

        if (!response?.ok) {
            host.replaceChildren(
                empty(
                    wanted === null ? "Diese Seite gibt es nicht" : "Diese Runde gibt es nicht",
                    response?.status === 404
                        ? wanted === null
                            ? "Entweder läuft Clips der Woche auf diesem Server nicht, oder die Seite ist nicht freigegeben."
                            : "Vielleicht wurde sie gelöscht. Die neueste Runde findest du über den Link ohne ?woche."
                        : "Der Bot antwortet gerade nicht. Lade die Seite in einem Moment neu."
                )
            );

            return;
        }

        paint((await response.json()) as IBoard, wanted);
    };

    const go = (wanted: number | null): void => {
        history.pushState(null, "", weekUrl(wanted));
        void show(wanted).then(() => window.scrollTo({ top: 0 }));
    };

    // Ein Klick auf eine Runde lädt nur die Daten neu, nicht die ganze Seite.
    const weekLink = (wanted: number | null, ...children: (Node | string)[]): HTMLAnchorElement => {
        const anchor = el("a", "", ...children);

        anchor.href = weekUrl(wanted);
        anchor.addEventListener("click", (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

            event.preventDefault();
            go(wanted);
        });

        return anchor;
    };

    function paint(data: IBoard, wanted: number | null): void {
        const round = data.round;

        document.title = `RL Nexus · Clips der Woche von ${data.guild.name}`;

        const crest = el("div", "board__face");

        if (safe(data.guild.icon)) {
            const image = el("img", "board__icon");

            image.src = data.guild.icon!;
            image.alt = "";
            crest.append(image);
        } else {
            crest.append(icon("#i-play"));
        }

        const status = !round
            ? "Noch keine Runde"
            : round.status === "open"
              ? `Hochladen bis ${WHEN.format(round.closesAt)}`
              : round.status === "voting"
                ? `Abstimmung bis ${WHEN.format(round.endsAt)}`
                : `Fertig seit ${DAY.format(round.endedAt ?? round.endsAt)}`;

        const winners = round?.status === "done" ? round.winners : [];
        const winnerIds = new Set(winners.map((winner) => winner.entryId));

        const cards = data.clips.map((clip) =>
            el(
                "article",
                `clcard${winnerIds.has(clip.id) ? " is-winner" : ""}`,
                media(clip, round?.status === "done"),
                el(
                    "div",
                    "clcard__foot",
                    face({ name: clip.name, avatar: clip.avatar }, "travatar"),
                    el("div", "plrow__main", el("b", "", clip.name), ...(clip.rank !== null ? [el("span", "gwrow__facts", `Platz ${clip.rank}`)] : [])),
                    ...(clip.votes !== null ? [el("span", "clcard__votes", votesText(clip.votes))] : [])
                )
            )
        );

        const podium = winners.length
            ? el(
                  "div",
                  "clwinners",
                  ...winners.map((winner) =>
                      el(
                          "div",
                          "clwinner",
                          el("span", "clwinner__medal", MEDALS[winner.place - 1] ?? `${winner.place}.`),
                          face({ name: winner.name, avatar: winner.avatar }, "travatar"),
                          el("b", "", winner.name),
                          el("span", "gwrow__facts", `${votesText(winner.votes)}${winner.prize ? ` · ${winner.prize}` : ""}`)
                      )
                  )
              )
            : null;

        // Alle fertigen Runden, die gerade gezeigte hervorgehoben.
        const weeks = data.weeks.map((week) => {
            const current = round?.id === week.id;
            const top = week.winners[0];

            return weekLink(
                week.id,
                el("b", "", `Runde vom ${DAY.format(week.openedAt)}`),
                el(
                    "span",
                    "gwrow__facts",
                    `${week.count === 1 ? "1 Clip" : `${week.count} Clips`} · ${top ? `${MEDALS[0]} ${top.name}` : "ohne Gewinner"}`
                ),
                ...(current ? [el("span", "tagline tagline--on", "angezeigt")] : [])
            );
        });

        for (const link of weeks) link.className = `clweeklink${link.querySelector(".tagline") ? " is-current" : ""}`;

        const back = wanted !== null ? [el("p", "clback", weekLink(null, icon("#i-arrow"), "Zur neuesten Runde"))] : [];

        host.replaceChildren(
            el("header", "board__head", crest, el("div", "board__title", el("h1", "", data.guild.name), el("p", "", "Clips der Woche – die besten Szenen dieses Servers"))),
            ...back,
            el(
                "div",
                "tkhead board__stats clstats",
                stat("#i-play", round ? `Runde vom ${DAY.format(round.openedAt)}` : "Diese Runde", status),
                stat("#i-users", "Clips", String(data.clips.length)),
                stat("#i-crown", "Je Person", data.maxPerUser === 1 ? "ein Clip" : `bis zu ${data.maxPerUser} Clips`)
            ),
            ...(data.prizes ? [el("p", "hintline board__foot", `Zu gewinnen: ${data.prizes.replace(/\n/g, " · ")}`)] : []),
            ...(podium ? [el("h2", "board__sub", "Die Gewinner"), podium] : []),
            el("h2", "board__sub", round?.status === "done" ? "Alle Clips der Runde" : "Die Clips"),
            cards.length
                ? el("div", "clgrid", ...cards)
                : empty("Noch kein Clip", round?.status === "open" ? "Sobald jemand ein Video hochlädt, steht es hier." : "In dieser Runde kam nichts zusammen."),
            ...(weeks.length ? [el("h2", "board__sub", "Alle Runden"), el("nav", "clweeklist", ...weeks)] : []),
            el("p", "hintline board__foot", `Abgestimmt wird in Discord: mit ${data.emoji} unter dem Clip, eine Stimme pro Person. Stimmen stehen hier erst, wenn die Runde fertig ist.`)
        );

        host.querySelector<HTMLElement>(".clweeklist")?.setAttribute("aria-label", "Alle Runden");
    }

    window.addEventListener("popstate", () => void show(wantedWeek()));

    await show(wantedWeek());
}
