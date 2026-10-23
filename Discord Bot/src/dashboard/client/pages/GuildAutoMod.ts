/**
 * Abschnitt: Auto Mod.
 *
 * Oben die Zahlen, darunter die Filter als Liste: Schalter, Name, was passiert.
 * Ein Klick auf „Einstellen" klappt die Einzelheiten auf - so bleibt die Seite
 * lesbar, obwohl acht Filter mit je sechs Feldern dahinterstehen. Dazu eine
 * Probe, die zeigt, was mit einem Text passieren würde.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, el, IRole, loading, rolePicker, row, select, stat, toggle } from "../core/Ui.js";
import { ILogTargets, ILogThread, logTargetSelect } from "../core/LogTarget.js";

type FilterField = "limit" | "window" | "words" | "whole" | "allowOwn";

interface IFilter {
    on: boolean;
    delete: boolean;
    action: string;
    duration: number;
    notice: string;
    limit: number;
    window: number;
    words: string[];
    whole: boolean;
    allowOwn: boolean;
}

interface IFilterInfo {
    id: string;
    name: string;
    hint: string;
    icon: string;
    fields: FilterField[];
    limitLabel: string;
    limitHint: string;
    limitMin: number;
    limitMax: number;
    wordsLabel?: string;
    wordsHint?: string;
}

interface ISettings {
    filters: Record<string, IFilter>;
    ignoreChannels: string[];
    ignoreRoles: string[];
    ignoreMods: boolean;
    logChannelId: string | null;
}

interface IPayload {
    settings: ISettings;
    filters: IFilterInfo[];
    actions: Record<string, string>;
    limits: { ignore: number; words: number; notice: number };
    targets: ILogTargets;
    ready: { moderation: boolean };
    guild: { roles: IRole[]; channels: { id: string; name: string }[] };
}

/** Timeout-Längen, die man wirklich einstellt. */
const DURATIONS: [number, string][] = [
    [60, "1 Minute"],
    [300, "5 Minuten"],
    [600, "10 Minuten"],
    [3_600, "1 Stunde"],
    [21_600, "6 Stunden"],
    [86_400, "1 Tag"],
    [604_800, "1 Woche"],
];

export function renderAutoMod(guildId: string): void {
    const host = need<HTMLElement>("#autoModBody");
    const note = need<HTMLElement>("#autoModNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/automod`, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let open: string | null = null;
    let dirty = false;

    const save = el("button", "btn btn--primary") as HTMLButtonElement;

    function touch(): void {
        dirty = true;
        save.disabled = false;
    }

    const info = (id: string): IFilterInfo => data!.filters.find((filter) => filter.id === id)!;

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const list = data!.filters;
        const on = list.filter((filter) => draft!.filters[filter.id]?.on).length;
        const strict = list.filter((filter) => draft!.filters[filter.id]?.on && draft!.filters[filter.id]?.action !== "none").length;
        const ignored = draft!.ignoreChannels.length + draft!.ignoreRoles.length;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-shield", "Filter an", `${on} / ${list.length}`, on ? "is-ok" : ""),
            stat("#i-gavel", "Mit Folge", strict ? `${strict} mit Strafe` : "nur löschen"),
            stat("#i-eraser", "Ausnahmen", ignored ? `${ignored} ${ignored === 1 ? "Eintrag" : "Einträge"}` : "keine"),
            stat("#i-scroll", "Meldungen", draft!.logChannelId ? "an" : "aus", draft!.logChannelId ? "is-ok" : "")
        );
    }

    function notices(): HTMLElement[] {
        const needsCases = data!.filters.some((filter) => draft!.filters[filter.id]?.on && draft!.filters[filter.id]?.action !== "none");

        if (data!.ready.moderation || !needsCases) return [];

        return [
            el(
                "div",
                "notice snnotice",
                icon("#i-warn"),
                el("span", "", "Verwarnen, Timeout, Kick und Bann legen einen Fall in der Moderation an – und die ist auf diesem Server aus. Bis dahin löscht der Bot nur.")
            ),
        ];
    }

    /* ------------------------------------------------------------
       Ein Filter
       ------------------------------------------------------------ */
    function filterRow(meta: IFilterInfo): HTMLElement {
        const entry = draft!.filters[meta.id];
        const isOpen = open === meta.id;
        const what = entry.action === "none" ? (entry.delete ? "löschen" : "nur melden") : data!.actions[entry.action];
        const more = button("btn btn--quiet amrow__more", icon(isOpen ? "#i-up" : "#i-sliders"), isOpen ? "Zuklappen" : "Einstellen");

        more.addEventListener("click", () => {
            open = isOpen ? null : meta.id;
            paint();
        });

        const face = el(
            "div",
            `amrow__face${entry.on ? "" : " is-off"}`,
            el("label", "amrow__switch", toggle(entry.on, `${meta.name} anschalten`, (on) => {
                entry.on = on;
                touch();
                paint();
            })),
            el("span", "amrow__mark", icon(meta.icon)),
            el("div", "amrow__text", el("b", "", meta.name), el("i", "", meta.hint)),
            el("span", `amchip is-${entry.action}`, what),
            more
        );

        if (!isOpen) return el("div", "amrow", face);

        return el("div", "amrow is-open", face, el("div", "amrow__body", ...fields(meta, entry)));
    }

    function fields(meta: IFilterInfo, entry: IFilter): HTMLElement[] {
        const rows: HTMLElement[] = [];

        if (meta.fields.includes("limit")) {
            const number = el("input", "text gwnum");

            number.type = "number";
            number.min = String(meta.limitMin);
            number.max = String(meta.limitMax);
            number.value = String(entry.limit);
            number.setAttribute("aria-label", meta.limitLabel);
            number.addEventListener("input", () => {
                entry.limit = Math.max(meta.limitMin, Math.min(meta.limitMax, Number(number.value) || meta.limitMin));
                touch();
            });

            rows.push(row(meta.limitLabel, meta.limitHint, number));
        }

        if (meta.fields.includes("window")) {
            const number = el("input", "text gwnum");

            number.type = "number";
            number.min = "2";
            number.max = "60";
            number.value = String(entry.window);
            number.setAttribute("aria-label", "Zeitfenster in Sekunden");
            number.addEventListener("input", () => {
                entry.window = Math.max(2, Math.min(60, Number(number.value) || 5));
                touch();
            });

            rows.push(row("Zeitfenster", "In so vielen Sekunden wird gezählt", number));
        }

        if (meta.fields.includes("words")) {
            const area = el("textarea", "text tkarea");

            area.rows = 5;
            area.value = entry.words.join("\n");
            area.placeholder = meta.wordsHint ?? "";
            area.setAttribute("aria-label", meta.wordsLabel ?? "Liste");
            area.addEventListener("input", () => {
                entry.words = area.value
                    .split("\n")
                    .map((word) => word.trim())
                    .filter(Boolean)
                    .slice(0, data!.limits.words);
                touch();
            });

            rows.push(row(meta.wordsLabel ?? "Liste", `${meta.wordsHint ?? ""} · bis zu ${data!.limits.words}`.trim(), area));
        }

        if (meta.fields.includes("whole")) {
            rows.push(
                row(
                    "Nur ganze Wörter",
                    "Aus heißt: auch mitten im Wort. „ass\" trifft dann auch „Klasse\"",
                    el("label", "snitem__switch", toggle(entry.whole, "Nur ganze Wörter", (on) => {
                        entry.whole = on;
                        touch();
                    }), el("span", "", "nur ganze"))
                )
            );
        }

        if (meta.fields.includes("allowOwn")) {
            rows.push(
                row(
                    "Eigene Einladung erlauben",
                    "Der Vanity-Link dieses Servers darf durch",
                    el("label", "snitem__switch", toggle(entry.allowOwn, "Eigene Einladung erlauben", (on) => {
                        entry.allowOwn = on;
                        touch();
                    }), el("span", "", "erlauben"))
                )
            );
        }

        /* --- Was passiert --- */
        const action = select(
            Object.entries(data!.actions).map(([value, label]): [string, string] => [value, label]),
            entry.action,
            (value) => {
                entry.action = value;
                touch();
                paint();
            },
            `Folge für ${meta.name}`
        );

        rows.push(row("Folge", "Was nach dem Löschen passiert", action));

        if (entry.action === "timeout") {
            rows.push(
                row(
                    "Wie lange",
                    "Danach darf der Betroffene wieder schreiben",
                    select(
                        DURATIONS.map(([value, label]): [string, string] => [String(value), label]),
                        String(entry.duration),
                        (value) => {
                            entry.duration = Number(value);
                            touch();
                        },
                        "Länge des Timeouts"
                    )
                )
            );
        }

        rows.push(
            row(
                "Nachricht löschen",
                "Aus heißt: der Bot meldet nur",
                el("label", "snitem__switch", toggle(entry.delete, "Nachricht löschen", (on) => {
                    entry.delete = on;
                    touch();
                    paint();
                }), el("span", "", "löschen"))
            )
        );

        // Mehrzeilig wie jede Nachricht: Enter macht eine neue Zeile.
        const notice = el("textarea", "text tkarea");

        notice.rows = 2;
        notice.value = entry.notice;
        notice.maxLength = data!.limits.notice;
        notice.placeholder = "Leer lassen: der Bot sagt nichts";
        notice.setAttribute("aria-label", "Hinweis im Kanal");
        notice.addEventListener("input", () => {
            entry.notice = notice.value;
            touch();
        });

        rows.push(row("Hinweis im Kanal", "Kurz, mit Erwähnung – verschwindet nach acht Sekunden", notice));

        return rows;
    }

    /* ------------------------------------------------------------
       Probe
       ------------------------------------------------------------ */
    function tryCard(): HTMLElement {
        const area = el("textarea", "text tkarea");
        const run = button("btn btn--quiet", icon("#i-play"), "Prüfen");
        const result = el("p", "hintline amtry__out", "Noch nichts geprüft.");

        area.rows = 3;
        area.placeholder = "Schreib etwas, das der Bot prüfen soll";
        area.setAttribute("aria-label", "Text für die Probe");

        run.addEventListener("click", async () => {
            run.disabled = true;

            const answer = await call<{ hit: { filter: string; match: string } | null }>("", { action: "try", settings: draft, text: area.value });

            run.disabled = false;

            if (!answer) return;

            result.className = `hintline amtry__out${answer.hit ? " is-hit" : " is-clear"}`;
            result.textContent = answer.hit
                ? `Würde greifen: ${info(answer.hit.filter).name} – erkannt: ${answer.hit.match}`
                : "Geht durch. Kein Filter würde anspringen.";
        });

        return card(
            "Probe",
            "Was würde mit diesem Text passieren? Es wird nichts gelöscht und niemand bestraft – gerechnet wird mit dem, was gerade hier steht.",
            el("label", "mcfield", el("span", "mcfield__label", "Text"), area),
            el("div", "amtry", run, result),
            el("p", "hintline", "Spam und Wiederholung lassen sich so nicht prüfen – die hängen am Verlauf eines Mitglieds.")
        );
    }

    /* ------------------------------------------------------------
       Ausnahmen und Meldungen
       ------------------------------------------------------------ */
    function channelChips(): HTMLElement {
        const box = el("div", "tkchips");
        const draw = (): void => {
            const left = data!.guild.channels.filter((channel) => !draft!.ignoreChannels.includes(channel.id));
            const full = draft!.ignoreChannels.length >= data!.limits.ignore;
            const picker = select(
                [["", full ? `Höchstens ${data!.limits.ignore}` : "+ Kanal hinzufügen"], ...left.map((channel): [string, string] => [channel.id, `# ${channel.name}`])],
                "",
                (value) => {
                    if (!value) return;

                    draft!.ignoreChannels = [...draft!.ignoreChannels, value];
                    touch();
                    draw();
                },
                "Kanal ausnehmen"
            );

            picker.disabled = full;

            box.replaceChildren(
                ...draft!.ignoreChannels.map((id) => {
                    const name = data!.guild.channels.find((channel) => channel.id === id)?.name ?? "gelöschter Kanal";
                    const remove = button("", icon("#i-x"));

                    remove.setAttribute("aria-label", `# ${name} wieder prüfen`);
                    remove.addEventListener("click", () => {
                        draft!.ignoreChannels = draft!.ignoreChannels.filter((entry) => entry !== id);
                        touch();
                        draw();
                    });

                    return el("span", "tkchip", el("span", "", `# ${name}`), remove);
                }),
                picker
            );
        };

        draw();

        return box;
    }

    function exceptions(): HTMLElement {
        return card(
            "Ausnahmen",
            "Wo und bei wem der Bot nicht eingreift. Eine Kategorie auszunehmen, nimmt alle Kanäle darin aus.",
            row("Kanäle", `Bis zu ${data!.limits.ignore}`, channelChips()),
            row(
                "Rollen",
                "Wer eine davon hat, wird nicht gefiltert",
                rolePicker(data!.guild.roles, draft!.ignoreRoles, (ids) => {
                    draft!.ignoreRoles = ids;
                    touch();
                }, [], data!.limits.ignore)
            ),
            row(
                "Moderatoren",
                "Wer „Nachrichten verwalten\" darf, bleibt außen vor",
                el("label", "snitem__switch", toggle(draft!.ignoreMods, "Moderatoren ausnehmen", (on) => {
                    draft!.ignoreMods = on;
                    touch();
                }), el("span", "", "ausnehmen"))
            )
        );
    }

    function reports(): HTMLElement {
        const picker = logTargetSelect(
            data!.targets,
            draft!.logChannelId,
            (value) => {
                draft!.logChannelId = value;
                touch();
                paint();
            },
            async (forumId) => {
                const answer = await call<{ thread: ILogThread }>("", { action: "logthread", forumId });

                return answer?.thread ?? null;
            }
        );

        picker.setAttribute("aria-label", "Kanal für die Meldungen");

        return card(
            "Meldungen",
            "Jeder Eingriff als Karte: wer, wo, was erkannt wurde und was daraus folgte.",
            row("Kanal", "Textkanal oder Beitrag in einem Forum", picker)
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data || !draft) return;

        save.replaceChildren(icon("#i-check"), document.createTextNode("Speichern"));
        save.disabled = !dirty;

        host.replaceChildren(
            ...notices(),
            head(),
            card("Filter", "Jeder Filter greift für sich. Greifen mehrere, zählt der erste von oben – doppelte Strafe gibt es nicht.", el("div", "amlist", ...data.filters.map(filterRow))),
            tryCard(),
            exceptions(),
            reports(),
            el("div", "mcsave lvsave", save)
        );
    }

    save.addEventListener("click", async () => {
        save.disabled = true;

        const answer = await call<{ settings: ISettings }>("", { action: "save", settings: draft });

        if (!answer) {
            save.disabled = false;

            return;
        }

        data!.settings = answer.settings;
        draft = structuredClone(answer.settings);
        dirty = false;
        toast("info", "Gespeichert", "Gilt ab der nächsten Nachricht.");
        paint();
    });

    loading(host, 4);

    void call<IPayload>("").then((answer) => {
        if (!answer) return;

        data = answer;
        draft = structuredClone(answer.settings);
        paint();
    });
}
