/**
 * Abschnitt: Rocket Roulette (W-0087).
 *
 * Drei Reiter wie im Entwurf: „Abend“ ist der Leitstand (E1) mit der Vorschau,
 * was gerade in Discord steht (E3). „Verlauf“ zeigt den Abend als Zeitleiste
 * und die letzten Abende (E2). „Einstellungen“ führt in vier Schritten durch
 * (E2), Schritt 1 als Weg durch den Abend (E1), Schritt 3 mit Vorschau (E3).
 * Steuern dürfen auch die Rollen-Moderatoren, einstellen nur Verwalter.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { api, button, channelPicker, confirmButton, el, face, IPerson, IRole, loading, localInput, personPicker, select } from "../core/Ui.js";

type Pane = "evening" | "history" | "settings";
type Shot = "announce" | "round" | "lobby" | "control";
type Size = 1 | 2 | 3;

interface IAvatar {
    id: string;
    name: string;
    url: string | null;
}

interface ILobby {
    teams: [string[], string[]];
    teamNumbers: [number, number];
    size: number;
    host: string;
    hostIsModerator: boolean;
    filler: string | null;
    name: string;
    password: string;
    openedAt: number | null;
    names: Record<string, string>;
}

interface IRound {
    id: number;
    number: number;
    status: "drawing" | "running" | "ended" | "aborted";
    createdAt: number;
    lobbies: ILobby[];
}

interface IEvening {
    id: number;
    status: "planned" | "running" | "ended";
    startsAt: number;
    createdAt: number;
    round: number;
    sitOut: string[];
    wishes: { a: string; b: string; once: boolean }[];
}

interface ISettings {
    categoryId: string | null;
    infoChannelId: string | null;
    controlChannelId: string | null;
    waitingRoomId: string | null;
    mainVoiceId: string | null;
    moderatorRoleId: string | null;
    teamChannels: "auto" | "fixed";
    fixedChannelIds: string[];
    teamSize: Size;
    lobbyName: string;
    password: { mode: "fixed" | "random"; value: string };
}

interface IChannel {
    id: string;
    name: string;
}

interface IPayload {
    settings: ISettings;
    evening: IEvening | null;
    round: IRound | null;
    rooms: { waiting: IAvatar[]; main: IAvatar[] };
    moderators: string[];
    names: Record<string, string>;
    warnings: string[];
    history: { id: number; startsAt: number; endedAt: number | null; rounds: number; players: number; top: { name: string; rounds: number }[] }[];
    manage: boolean;
    limits: { lobbyName: number; password: number; fixed: number; alphabet: string };
    guild: { name: string; roles: IRole[]; channels: IChannel[]; voice: IChannel[]; categories: IChannel[] };
}

const DAY = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });
const SHORT = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const SHOTS: [Shot, string][] = [
    ["round", "Rundenkarte"],
    ["announce", "Ankündigung"],
    ["control", "Steuerkarte"],
    ["lobby", "Lobby-Karte"],
];
const STEPS = ["Kanäle", "Moderation", "Lobbys", "Fertig"];

function minutes(since: number): string {
    const value = Math.max(0, Math.round((Date.now() - since) / 60_000));

    return value === 1 ? "1 Minute" : `${value} Minuten`;
}

function person(avatar: IAvatar) {
    return { name: avatar.name, avatar: avatar.url };
}

function stack(people: IAvatar[], max = 8): HTMLElement {
    const box = el("div", "rrstack", ...people.slice(0, max).map((entry) => face(person(entry), "travatar")));

    if (people.length > max) box.append(el("span", "rrstack__more", `+${people.length - max}`));

    return box;
}

export function renderRoulette(guildId: string): void {
    const host = need<HTMLElement>("#rouletteBody");
    const note = need<HTMLElement>("#rouletteNote");
    const base = `${BASE}/api/guild/${encodeURIComponent(guildId)}/roulette`;
    const call = api(base, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let pane: Pane = "evening";
    let step = 0;
    let shot: Shot = "round";
    let panel: "wish" | "swap" | null = null;
    const pick: { a: IPerson | null; b: IPerson | null; once: boolean } = { a: null, b: null, once: false };

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;
        draft ??= structuredClone(answer.settings);

        // Beim Einstellen nicht unter den Fingern neu zeichnen.
        if (pane !== "settings") paint();
    };

    const act = async (body: Record<string, unknown>): Promise<boolean> => {
        const answer = await call<IPayload>("", body);

        if (!answer) return false;

        data = answer;
        paint();

        return true;
    };

    /* ------------------------------------------------------------
       Gerüst und Reiter
       ------------------------------------------------------------ */
    function paint(focus?: string): void {
        if (!data) return;

        const panes: [Pane, string, string][] = [
            ["evening", "Abend", "#i-play"],
            ["history", "Verlauf", "#i-clock"],
        ];

        if (data.manage) panes.push(["settings", "Einstellungen", "#i-settings"]);
        if (!panes.some(([id]) => id === pane)) pane = "evening";

        const bar = el("div", "avnav");

        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Rocket Roulette");

        for (const [id, label, symbol] of panes) {
            const tab = button("", icon(symbol), label);

            tab.id = `rrtab-${id}`;
            tab.tabIndex = pane === id ? 0 : -1;
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", String(pane === id));
            tab.setAttribute("aria-controls", "rrpane");
            tab.addEventListener("click", () => {
                pane = id;
                paint(tab.id);
            });
            bar.append(tab);
        }

        bar.addEventListener("keydown", (event) => {
            const index = panes.findIndex(([id]) => id === pane);
            const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: panes.length - 1 }[event.key];

            if (next === undefined) return;

            event.preventDefault();
            pane = panes[(next + panes.length) % panes.length]![0];
            paint(`rrtab-${pane}`);
        });

        const body = pane === "evening" ? evening() : pane === "history" ? history() : settings();

        body.id = "rrpane";
        body.setAttribute("role", "tabpanel");
        body.setAttribute("aria-labelledby", `rrtab-${pane}`);
        host.replaceChildren(bar, body);

        if (focus) document.getElementById(focus)?.focus();
    }

    /* ------------------------------------------------------------
       Abend: Leitstand (E1) und Vorschau (E3)
       ------------------------------------------------------------ */
    function missing(): string[] {
        const settings = data!.settings;

        return [
            [settings.waitingRoomId, "Warteraum"],
            [settings.mainVoiceId, "Treffpunkt"],
            [settings.infoChannelId, "Info-Kanal"],
            [settings.controlChannelId, "Moderator-Kanal"],
        ]
            .filter(([value]) => !value)
            .map(([, label]) => label as string);
    }

    function evening(): HTMLElement {
        const { evening: night, round } = data!;
        const box = el("div", "rr");
        const gaps = missing();

        if (gaps.length) {
            const hint = el("div", "notice rrnote", icon("#i-warn"), el("span", "", `Es fehlt noch: ${gaps.join(", ")}.`));

            if (data!.manage) {
                const go = button("btn btn--quiet", "Einstellen");

                go.addEventListener("click", () => {
                    pane = "settings";
                    paint("rrtab-settings");
                });
                hint.append(go);
            }

            box.append(hint);
        }

        box.append(head(night, round));

        for (const warning of data!.warnings) box.append(el("div", "notice rrnote rrnote--warn", icon("#i-warn"), el("span", "", warning)));

        if (night && night.status !== "ended") {
            if (panel) box.append(panel === "wish" ? wishForm(night) : swapForm());

            box.append(el("div", "rrgrid3", rooms(), moderators(), wishes(night)));
        }

        if (round?.lobbies.length) box.append(el("div", "rrgrid3", ...round.lobbies.map(lobbyCard)));

        box.append(livePreview());

        return box;
    }

    function wheel(): HTMLElement {
        const spin = el("span", "rrwheel");

        spin.setAttribute("aria-hidden", "true");

        return spin;
    }

    function head(night: IEvening | null, round: IRound | null): HTMLElement {
        if (!night) {
            const when = el("input", "text rrwhen");

            when.type = "datetime-local";
            when.value = localInput(Math.ceil((Date.now() + 3_600_000) / 1_800_000) * 1_800_000);
            when.setAttribute("aria-label", "Startzeit");

            const plan = button("btn btn--primary", icon("#i-clock"), "Abend planen");
            const now = button("btn btn--quiet", icon("#i-play"), "Jetzt starten");

            plan.addEventListener("click", async () => {
                plan.disabled = true;
                await act({ action: "plan", startsAt: new Date(when.value).getTime() });
                plan.disabled = false;
            });
            now.addEventListener("click", async () => {
                now.disabled = true;
                await act({ action: "start" });
                now.disabled = false;
            });

            return el(
                "div",
                "rrhead",
                wheel(),
                el("div", "rrhead__text", el("small", "rrlabel", "Rocket Roulette"), el("b", "rrbig", "Kein Abend geplant"), el("span", "rrsub", "Leg die Startzeit fest. Ab dann sammelt der Warteraum, zur Startzeit holt der Bot alle in den Treffpunkt.")),
                el("div", "rrhead__act", el("label", "rrfield", el("small", "rrlabel", "Start"), when), el("div", "rrrow", plan, now))
            );
        }

        const lobbies = round?.lobbies ?? [];
        const open = lobbies.filter((lobby) => lobby.openedAt).length;
        const label = `Rocket Roulette · ${DAY.format(night.startsAt)} ${CLOCK.format(night.startsAt)}`;

        if (night.status === "planned") {
            const start = button("btn btn--primary rrbtn--big", icon("#i-play"), "Jetzt starten");

            start.addEventListener("click", async () => {
                start.disabled = true;
                await act({ action: "start" });
                start.disabled = false;
            });

            return el(
                "div",
                "rrhead",
                wheel(),
                el("div", "rrhead__text", el("small", "rrlabel", label), el("b", "rrbig", "Geplant"), el("span", "rrsub", `Start ${night.startsAt > Date.now() ? `in ${minutes(Date.now() - (night.startsAt - Date.now()))}` : "gleich"} · ${data!.rooms.waiting.length} im Warteraum`)),
                el("div", "rrhead__act", start, el("div", "rrrow", confirmButton("btn btn--quiet", "#i-x", "Absagen", "Wirklich absagen?", () => act({ action: "end" }))))
            );
        }

        const live = round && (round.status === "running" || round.status === "drawing");
        const title = live ? `Runde ${round!.number} läuft` : night.round ? `Runde ${night.round} vorbei` : "Bereit für Runde 1";
        const sub = live ? `seit ${minutes(round!.createdAt)} · ${lobbies.length} Lobbys · ${open} offen${round!.status === "drawing" ? " · ein Platz ist frei" : ""}` : `Abend läuft seit ${minutes(night.startsAt)}`;
        const steps = el("div", "rrsteps", ...Array.from({ length: Math.max(night.round + 1, 3) }, (_, index) => el("span", index + 1 < night.round || (index + 1 === night.round && !live) ? "is-done" : index + 1 === night.round ? "is-on" : "")));
        const next = button("btn btn--primary rrbtn--big", "🎲 ", `Runde ${night.round + (live || !night.round ? 1 : 0) || 1} auslosen`);
        const swap = button("btn btn--quiet", icon("#i-move"), "Tauschen");

        next.disabled = round?.status === "drawing";
        next.addEventListener("click", async () => {
            next.disabled = true;
            await act({ action: "next" });
            next.disabled = false;
        });
        swap.disabled = !live || round?.status !== "running";
        swap.addEventListener("click", () => {
            panel = panel === "swap" ? null : "swap";
            pick.a = pick.b = null;
            paint();
        });

        const tools = el("div", "rrrow", swap);

        if (live) tools.append(confirmButton("btn btn--quiet", "#i-x", "Abbrechen", "Runde abbrechen?", () => act({ action: "abort" })));
        tools.append(confirmButton("btn btn--quiet", "#i-check", "Beenden", "Abend beenden?", () => act({ action: "end" })));

        return el("div", "rrhead", wheel(), el("div", "rrhead__text", el("small", "rrlabel", label), el("b", "rrbig", title), el("span", "rrsub", sub), steps), el("div", "rrhead__act", next, tools));
    }

    function rooms(): HTMLElement {
        const waiting = data!.rooms.waiting;

        return el("div", "rrbox", el("small", "rrlabel", `Warteraum · ${waiting.length}`), waiting.length ? stack(waiting) : el("span", "rrmuted", "niemand"), el("small", "rrmuted", data!.evening?.status === "running" ? "kommen zur nächsten Runde dazu" : "kommen zum Start in den Treffpunkt"));
    }

    function moderators(): HTMLElement {
        const main = data!.rooms.main;
        const mods = main.filter((entry) => data!.moderators.includes(entry.id));

        return el(
            "div",
            "rrbox",
            el("small", "rrlabel", `Treffpunkt · ${main.length}`),
            mods.length ? stack(mods) : el("span", "rrmuted", "kein Moderator im Treffpunkt"),
            el("small", "rrmuted", mods.length ? `${mods.map((entry) => entry.name).join(", ")} hosten von hier` : "Ohne Moderator macht ein Spieler die Lobby auf")
        );
    }

    function wishes(night: IEvening): HTMLElement {
        const name = (id: string) => data!.names[id] ?? id;
        const list = el(
            "div",
            "rrwishes",
            ...night.wishes.map((wish) => {
                const remove = button("rrx", icon("#i-x"));

                remove.setAttribute("aria-label", `Wunsch ${name(wish.a)} und ${name(wish.b)} entfernen`);
                remove.addEventListener("click", () => void act({ action: "unwish", a: wish.a, b: wish.b }));

                return el("span", "rrpair", `${name(wish.a)} + ${name(wish.b)}${wish.once ? " · 1×" : ""}`, remove);
            })
        );
        const add = button("rrlink", icon("#i-plus"), "Wunsch eintragen");

        add.addEventListener("click", () => {
            panel = panel === "wish" ? null : "wish";
            pick.a = pick.b = null;
            pick.once = false;
            paint();
        });

        return el("div", "rrbox", el("small", "rrlabel", `Wünsche · ${night.wishes.length}`), night.wishes.length ? list : el("span", "rrmuted", "noch keine"), add);
    }

    function pairForm(title: string, text: string, labels: [string, string], confirm: string, run: (a: string, b: string) => Promise<boolean>, extra?: HTMLElement): HTMLElement {
        const save = button("btn btn--primary", icon("#i-check"), confirm);
        const close = button("btn btn--quiet", "Schließen");
        const side = (key: "a" | "b", label: string) =>
            el(
                "div",
                "rrpick",
                el("small", "rrlabel", label),
                personPicker(call, pick[key], (chosen) => {
                    pick[key] = chosen;
                    paint();
                })
            );

        save.disabled = !pick.a || !pick.b;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (await run(pick.a!.id, pick.b!.id)) {
                panel = null;
                paint();
            }

            save.disabled = false;
        });
        close.addEventListener("click", () => {
            panel = null;
            paint();
        });

        return el("div", "rrbox rrpanel", el("small", "rrlabel", title), el("p", "rrmuted", text), el("div", "rrgrid2", side("a", labels[0]), side("b", labels[1])), ...(extra ? [extra] : []), el("div", "rrrow", save, close));
    }

    function wishForm(night: IEvening): HTMLElement {
        const once = el("div", "rrseg", ...([false, true] as const).map((value) => {
            const knob = button(pick.once === value ? "is-on" : "", value ? "Nur nächste Runde" : "Gilt bis gelöscht");

            knob.setAttribute("aria-pressed", String(pick.once === value));
            knob.addEventListener("click", () => {
                pick.once = value;
                paint();
            });

            return knob;
        }));

        return pairForm("Wunsch eintragen", `Beide landen im selben Team, ab Runde ${night.round + 1}. Steht einer schon in einem Paar, ersetzt der neue Wunsch den alten.`, ["Erstes Mitglied", "Zweites Mitglied"], "Eintragen", (a, b) => act({ action: "wish", a, b, once: pick.once }), once);
    }

    function swapForm(): HTMLElement {
        return pairForm("Spieler tauschen", "Jemand ist weg: Wähl ihn und die Person, die seinen Platz bekommt, etwa einen Nachzügler oder einen Moderator. Der Bot schiebt beide passend um.", ["Wer ist weg?", "Wer übernimmt?"], "Tauschen", (a, b) => act({ action: "swap", a, b }));
    }

    function lobbyCard(lobby: ILobby): HTMLElement {
        const name = (id: string) => lobby.names[id] ?? id;
        const half = (team: 0 | 1) => el("div", `rrhalf rrhalf--${team ? "orange" : "blue"}`, el("small", "rrlabel", `Team ${lobby.teamNumbers[team]}`), el("span", "", lobby.teams[team].map(name).join(" · ") || "frei"));
        const state = lobby.openedAt ? el("span", "rrchip rrchip--ok", "Offen") : el("span", "rrchip rrchip--wait", "Wartet");
        const hostLine = `👑 ${name(lobby.host)}${lobby.filler && lobby.filler === lobby.host ? " · spielt mit" : ""}`;

        return el(
            "div",
            `rrlobby${lobby.openedAt ? " is-open" : ""}`,
            el("div", "rrlobby__top", el("b", "", lobby.name, ...(lobby.size !== data!.settings.teamSize ? [el("small", "rrmuted", ` ${lobby.size}v${lobby.size}`)] : [])), state),
            el("div", "rrhalves", half(0), half(1)),
            el("div", "rrlobby__meta", el("code", "rrpw", lobby.password), el("span", "", hostLine))
        );
    }

    function livePreview(): HTMLElement {
        const image = el("img", "rrshot");
        const tabs = el(
            "div",
            "rrseg",
            ...SHOTS.map(([id, label]) => {
                const knob = button(shot === id ? "is-on" : "", label);

                knob.setAttribute("aria-pressed", String(shot === id));
                knob.addEventListener("click", () => {
                    shot = id;
                    paint();
                });

                return knob;
            })
        );

        image.alt = `Vorschau: ${SHOTS.find(([id]) => id === shot)![1]} wie in Discord`;
        image.loading = "lazy";
        image.decoding = "async";
        image.src = `${base}?image=${shot}&t=${Date.now()}`;

        return el("div", "rrbox rrpreview", el("small", "rrlabel", "So sieht es gerade in Discord aus"), tabs, image);
    }

    /* ------------------------------------------------------------
       Verlauf: Zeitleiste (E2)
       ------------------------------------------------------------ */
    function history(): HTMLElement {
        const box = el("div", "rr");
        const night = data!.evening;

        if (night) {
            const items: [string, string, string][] = [["is-done", "Geplant", SHORT.format(night.createdAt)]];
            const live = data!.round && (data!.round.status === "running" || data!.round.status === "drawing");

            items.push([night.status === "planned" ? "is-on" : "is-done", `${CLOCK.format(night.startsAt)} Start`, night.status === "planned" ? "wartet auf die Startzeit" : "Warteraum in den Treffpunkt"]);

            for (let number = 1; number <= night.round; number++) {
                const current = number === night.round && live;

                items.push([current ? "is-on" : "is-done", `Runde ${number}`, current ? `${CLOCK.format(data!.round!.createdAt)} · ${data!.round!.lobbies.length} Lobbys · läuft` : "gespielt"]);
            }

            if (night.status === "running") items.push(["", `Runde ${night.round + 1}`, "wartet auf den Moderator"]);
            items.push(["", "Ende", "Übersicht in den Moderator-Kanal"]);

            box.append(el("div", "rrbox", el("small", "rrlabel", "Der Abend"), el("ol", "rrtimeline", ...items.map(([tone, title, text]) => el("li", tone, el("b", "", title), el("small", "", text))))));
        }

        box.append(el("small", "rrlabel rrlabel--gap", "Letzte Abende"));

        if (!data!.history.length) {
            box.append(el("p", "rrmuted", "Noch kein Abend vorbei. Nach dem Ende steht er hier, 30 Tage lang."));

            return box;
        }

        for (const entry of data!.history) {
            const from = `${DAY.format(entry.startsAt)} · ${CLOCK.format(entry.startsAt)}${entry.endedAt ? ` bis ${CLOCK.format(entry.endedAt)}` : ""}`;
            const details = el("details", "rrpast");

            details.append(
                el("summary", "", el("b", "", from), el("span", "rrmuted", `${entry.rounds} Runden · ${entry.players} Spieler`)),
                el("div", "rrwishes", ...entry.top.map((who) => el("span", "rrpair", `${who.name} · ${who.rounds}`)))
            );
            box.append(details);
        }

        return box;
    }

    /* ------------------------------------------------------------
       Einstellungen: vier Schritte (E2)
       ------------------------------------------------------------ */
    function settings(): HTMLElement {
        const s = draft!;
        const box = el("div", "rr");
        const wizard = el(
            "div",
            "rrwiz",
            ...STEPS.map((label, index) => {
                const knob = button(index === step ? "is-on" : done(index) ? "is-done" : "", `${index + 1} · ${label}${done(index) && index !== step ? " ✓" : ""}`);

                knob.setAttribute("aria-current", index === step ? "step" : "false");
                knob.addEventListener("click", () => {
                    step = index;
                    paint();
                });

                return knob;
            })
        );
        const content = [channels, moderation, lobbies, finish][step]!(s);
        const back = button("btn btn--quiet", "←", step ? STEPS[step - 1]! : "");
        const forward = button("btn btn--quiet", step < 3 ? `Weiter zu ${STEPS[step + 1]} →` : "");
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");

        back.hidden = step === 0;
        back.addEventListener("click", () => {
            step--;
            paint();
        });
        forward.hidden = step === 3;
        forward.addEventListener("click", () => {
            step++;
            paint();
        });
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (await act({ action: "settings", settings: draft })) draft = structuredClone(data!.settings);

            save.disabled = false;
        });

        box.append(el("div", "rrbox", wizard, content, el("div", "rrrow rrrow--split", back, el("div", "rrrow", forward, save))));

        return box;
    }

    function done(index: number): boolean {
        const s = draft!;

        if (index === 0) return !!(s.waitingRoomId && s.mainVoiceId && s.infoChannelId && (s.teamChannels === "auto" || s.fixedChannelIds.length >= 2));
        if (index === 1) return !!(s.moderatorRoleId && s.controlChannelId);
        if (index === 2) return !!s.lobbyName && (s.password.mode === "random" || !!s.password.value);

        return done(0) && done(1) && done(2);
    }

    function channelSelect(list: IChannel[], value: string | null, prefix: string, empty: string, onPick: (id: string | null) => void, label: string): HTMLSelectElement {
        return select([["", empty], ...list.map((channel): [string, string] => [channel.id, `${prefix} ${channel.name}`])], value ?? "", (id) => onPick(id || null), label);
    }

    function node(symbol: string, title: string, text: string, control: HTMLElement): HTMLElement {
        return el("div", "rrnode", el("span", "rrnode__ic", icon(symbol)), el("b", "", title), el("small", "rrmuted", text), control);
    }

    function channels(s: ISettings): HTMLElement {
        const { voice, channels: text, categories } = data!.guild;
        const mode = el("div", "rrseg", ...(["auto", "fixed"] as const).map((value) => {
            const knob = button(s.teamChannels === value ? "is-on" : "", value === "auto" ? "automatisch" : "feste Kanäle");

            knob.setAttribute("aria-pressed", String(s.teamChannels === value));
            knob.addEventListener("click", () => {
                s.teamChannels = value;
                paint();
            });

            return knob;
        }));
        const team =
            s.teamChannels === "auto"
                ? channelSelect(categories, s.categoryId, "📁", "ohne Kategorie", (id) => void (s.categoryId = id), "Kategorie für Team-Kanäle")
                : channelPicker(voice, s.fixedChannelIds, (ids) => void (s.fixedChannelIds = ids), data!.limits.fixed, "Sprachkanal");

        return el(
            "div",
            "rrstep",
            el("p", "rrmuted", "Der Weg, den ein Spieler durch den Abend geht."),
            el(
                "div",
                "rrflow",
                node("#i-clock", "Warteraum", "vor dem Start und Nachzügler", channelSelect(voice, s.waitingRoomId, "🔊", "wählen …", (id) => void (s.waitingRoomId = id), "Warteraum")),
                el("span", "rrarrow", "→"),
                node("#i-users", "Treffpunkt", "ab Start und zwischen Runden", channelSelect(voice, s.mainVoiceId, "🔊", "wählen …", (id) => void (s.mainVoiceId = id), "Treffpunkt")),
                el("span", "rrarrow", "→"),
                node("#i-gamepad", "Team-Kanäle", s.teamChannels === "auto" ? "legt der Bot je Runde an" : "je Lobby zwei, der Reihe nach", el("div", "rrstack-v", mode, team)),
                el("span", "rrarrow", "↺"),
                node("#i-refresh", "Zurück", "nach jeder Runde", el("span", "rrmuted", "in den Treffpunkt"))
            ),
            el("div", "rrfieldrow", el("div", "", el("b", "", "Info-Kanal"), el("small", "rrmuted", "Ankündigung und Rundenkarten, für alle lesbar")), channelSelect(text, s.infoChannelId, "#", "wählen …", (id) => void (s.infoChannelId = id), "Info-Kanal"))
        );
    }

    function moderation(s: ISettings): HTMLElement {
        return el(
            "div",
            "rrstep",
            el(
                "div",
                "rrfieldrow",
                el("div", "", el("b", "", "Moderator-Rolle"), el("small", "rrmuted", "Wer die Rolle hat, hostet, lost aus und steuert den Abend in Discord und hier im Dashboard. Einstellen bleibt bei den Verwaltern.")),
                select([["", "keine"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@ ${role.name}`])], s.moderatorRoleId ?? "", (id) => void (s.moderatorRoleId = id || null), "Moderator-Rolle")
            ),
            el(
                "div",
                "rrfieldrow",
                el("div", "", el("b", "", "Moderator-Kanal"), el("small", "rrmuted", "Steuerkarte, Einspring-Anfragen und die Übersicht am Ende")),
                channelSelect(data!.guild.channels, s.controlChannelId, "#", "wählen …", (id) => void (s.controlChannelId = id), "Moderator-Kanal")
            )
        );
    }

    function lobbies(s: ISettings): HTMLElement {
        const image = el("img", "rrshot");
        const name = el("input", "text");
        const word = el("input", "text");
        const refresh = debounce(() => {
            const query = new URLSearchParams({ image: "lobby", name: s.lobbyName, size: String(s.teamSize), t: String(Date.now()) });

            if (s.password.mode === "fixed" && s.password.value) query.set("password", s.password.value);
            image.src = `${base}?${query}`;
        }, 300);
        const sizes = el("div", "rrseg", ...([3, 2, 1] as const).map((size) => {
            const knob = button(s.teamSize === size ? "is-on" : "", `${size}v${size}`);

            knob.setAttribute("aria-pressed", String(s.teamSize === size));
            knob.addEventListener("click", () => {
                s.teamSize = size;
                paint();
            });

            return knob;
        }));
        const modes = el("div", "rrseg", ...(["fixed", "random"] as const).map((mode) => {
            const knob = button(s.password.mode === mode ? "is-on" : "", mode === "fixed" ? "fest" : "zufällig");

            knob.setAttribute("aria-pressed", String(s.password.mode === mode));
            knob.addEventListener("click", () => {
                s.password.mode = mode;
                paint();
            });

            return knob;
        }));
        const examples = el("div", "rrexamples");
        const showExamples = () => examples.replaceChildren(...[[1, 2], [3, 4], [5, 6]].map((teams) => el("span", "rrpair", (s.lobbyName.includes("{teams}") ? s.lobbyName.replaceAll("{teams}", teams.join("")) : `${s.lobbyName}${teams.join("")}`) || "…")));

        name.value = s.lobbyName;
        name.maxLength = data!.limits.lobbyName;
        name.setAttribute("aria-label", "Lobby-Name");
        name.addEventListener("input", () => {
            s.lobbyName = name.value;
            showExamples();
            refresh();
        });
        word.value = s.password.value;
        word.maxLength = data!.limits.password;
        word.setAttribute("aria-label", "Festes Passwort");
        word.addEventListener("input", () => {
            s.password.value = word.value;
            refresh();
        });
        image.alt = "Vorschau der Lobby-Karte im Voice-Chat";
        showExamples();
        refresh();

        const fields = el(
            "div",
            "",
            el("div", "rrfieldrow", el("div", "", el("b", "", "Teamgröße"), el("small", "rrmuted", "Geht es nicht auf, gibt es eine 2v2- oder 1v1-Lobby")), sizes),
            el("div", "rrfieldrow", el("div", "", el("b", "", "Lobby-Name"), el("small", "rrmuted", "{teams} wird zu den Teamnummern"), examples), name),
            el("div", "rrfieldrow", el("div", "", el("b", "", "Passwort"), el("small", "rrmuted", "für alle gleich oder je Lobby gewürfelt")), modes)
        );

        if (s.password.mode === "fixed") fields.append(el("div", "rrfieldrow", el("div", "", el("b", "", "Passwort (fest)"), el("small", "rrmuted", "Buchstaben und Ziffern. Ohne i, l, o, 0 und 1 tippt es sich am Controller leichter.")), word));
        else fields.append(el("p", "rrmuted", `Gewürfelt aus ${data!.limits.alphabet}, fünf Zeichen je Lobby.`));

        return el("div", "rrstep rrgrid2", fields, el("div", "rrpreview", el("small", "rrlabel", "Vorschau · Lobby-Karte im Voice-Chat"), image));
    }

    function finish(s: ISettings): HTMLElement {
        const name = (list: IChannel[], id: string | null, prefix: string) => (id ? `${prefix} ${list.find((entry) => entry.id === id)?.name ?? "gelöscht"}` : "fehlt");
        const role = data!.guild.roles.find((entry) => entry.id === s.moderatorRoleId);
        const lines: [boolean, string, string][] = [
            [!!s.waitingRoomId, "Warteraum", name(data!.guild.voice, s.waitingRoomId, "🔊")],
            [!!s.mainVoiceId, "Treffpunkt", name(data!.guild.voice, s.mainVoiceId, "🔊")],
            [s.teamChannels === "auto" || s.fixedChannelIds.length >= 2, "Team-Kanäle", s.teamChannels === "auto" ? `automatisch${s.categoryId ? ` in ${name(data!.guild.categories, s.categoryId, "📁")}` : ""}` : `${s.fixedChannelIds.length} feste, also ${Math.floor(s.fixedChannelIds.length / 2)} Lobbys gleichzeitig`],
            [!!s.infoChannelId, "Info-Kanal", name(data!.guild.channels, s.infoChannelId, "#")],
            [!!s.controlChannelId, "Moderator-Kanal", name(data!.guild.channels, s.controlChannelId, "#")],
            [!!role, "Moderator-Rolle", role ? `@ ${role.name}` : "keine, dann hosten Spieler"],
            [true, "Lobbys", `${s.teamSize}v${s.teamSize} · ${s.lobbyName} · Passwort ${s.password.mode === "fixed" ? s.password.value : "zufällig"}`],
        ];

        return el("div", "rrstep", el("ul", "rrcheck", ...lines.map(([ok, label, value]) => el("li", ok ? "is-ok" : "is-missing", icon(ok ? "#i-check" : "#i-warn"), el("b", "", label), el("span", "", value)))));
    }

    loading(host, 0, 3);
    void reload();
    onPulse(guildId, ["roulette"], debounce(() => void reload(), 300));
}
