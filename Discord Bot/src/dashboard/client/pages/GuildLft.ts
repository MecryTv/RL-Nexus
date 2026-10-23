/**
 * Abschnitt: Looking for.
 *
 * Drei Punkte in der Leiste, eine Route: die Grundlagen (Foren, Meldung ans
 * Team, die Nachrichten der DM, Ablauf) und je Seite ein eigener Punkt mit den
 * Fragen, dem Beitrag und allen Anfragen.
 *
 * Gespeichert wird immer nur das, was die offene Seite auch zeigt: der Bot
 * behält jeden Wert, der nicht mitkommt. So überschreibt die Team-Seite nicht
 * die Fragen der Spieler-Seite, wenn beide offen sind.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, rolePicker, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { loadGallery } from "../layout/ImagePicker.js";
import { IEditorContext } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import {
    IPlaceholder,
    LFT_DONE_PLACEHOLDERS,
    LFT_IMAGES,
    LFT_INTRO_PLACEHOLDERS,
    LFT_NOTICE_PLACEHOLDERS,
    LFT_POST_PLACEHOLDERS,
    LFT_PREVIEW_PLACEHOLDERS,
    LFT_QUESTION_PLACEHOLDERS,
} from "../constants/Placeholders.js";

type Kind = "player" | "team";
type QuestionKind = "short" | "long" | "choice";
type Status = "open" | "closed";

interface IQuestion {
    id: string;
    label: string;
    hint: string;
    kind: QuestionKind;
    choices: string[];
    required: boolean;
    max: number;
}

interface ISide {
    on: boolean;
    forumId: string | null;
    tag: { name: string; emoji: string | null; id: string | null; closedId: string | null };
    questions: IQuestion[];
    title: string;
    post: IBody;
    preview: IBody;
}

interface ISettings {
    player: ISide;
    team: ISide;
    notice: { channelId: string | null; roles: string[]; body: IBody };
    dm: { intro: IBody; question: IBody; done: IBody };
    expireDays: number;
    manageRoles: string[];
}

interface IRequest {
    id: number;
    kind: Kind;
    userId: string;
    userName: string;
    title: string;
    answers: { id: string; label: string; value: string }[];
    threadId: string | null;
    status: Status;
    createdAt: number;
    closedAt: number | null;
    closedBy: string | null;
    url: string | null;
}

interface IPayload {
    settings: ISettings;
    ready: boolean;
    requests: IRequest[];
    total: number;
    open: number;
    page: number;
    kinds: Record<Kind, string>;
    leads: Record<Kind, string>;
    questionKinds: Record<QuestionKind, string>;
    statuses: Record<Status, string>;
    bodyKinds: Record<string, string>;
    closedTag: { name: string; emoji: string };
    limits: {
        questions: number;
        choices: number;
        label: number;
        hint: number;
        answer: number;
        title: number;
        tag: number;
        managers: number;
        pings: number;
        expire: number;
        page: number;
    };
    guild: {
        name: string;
        roles: IRole[];
        channels: { id: string; name: string }[];
        forums: { id: string; name: string }[];
        emojis: IServerEmoji[];
    };
}

const WHEN = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const AGO = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

function ago(at: number): string {
    const minutes = Math.round((at - Date.now()) / 60_000);

    if (Math.abs(minutes) < 60) return AGO.format(minutes, "minute");
    if (Math.abs(minutes) < 60 * 36) return AGO.format(Math.round(minutes / 60), "hour");

    return AGO.format(Math.round(minutes / 1440), "day");
}

/** Der Punkt „Looking for" - Foren, Meldung, DM, Ablauf. */
export function renderLft(guildId: string): void {
    mount(guildId, "base");
}

/** Der Punkt „Spieler-Suche". */
export function renderLftPlayer(guildId: string): void {
    mount(guildId, "player");
}

/** Der Punkt „Team-Suche". */
export function renderLftTeam(guildId: string): void {
    mount(guildId, "team");
}

/** Der Punkt „Anfragen" - beide Seiten zusammen. */
export function renderLftRequests(guildId: string): void {
    mount(guildId, "requests");
}

const HOSTS = {
    base: { body: "#lftBody", note: "#lftNote" },
    player: { body: "#lftPlayerBody", note: "#lftPlayerNote" },
    team: { body: "#lftTeamBody", note: "#lftTeamNote" },
    requests: { body: "#lftRequestsBody", note: "#lftRequestsNote" },
} as const;

function mount(guildId: string, view: "base" | Kind | "requests"): void {
    const host = need<HTMLElement>(HOSTS[view].body);
    const note = need<HTMLElement>(HOSTS[view].note);
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/lft`, note);

    // Die beiden Seiten zeigen nur ihre eigenen Anfragen, der Punkt "Anfragen"
    // beide - dort wählt man die Art selbst.
    const kind: Kind | null = view === "player" || view === "team" ? view : null;

    let data: IPayload | null = null;
    const filter: { kind: Kind | ""; status: Status | ""; page: number } = { kind: "", status: "", page: 1 };
    let openId: number | null = null;

    const query = (): string => {
        const wanted = kind ?? filter.kind;
        const parts = [...(wanted ? [`kind=${wanted}`] : []), ...(filter.status ? [`status=${filter.status}`] : []), `page=${filter.page}`];

        return `?${parts.join("&")}`;
    };

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>(query());

        if (!answer) return;

        data = answer;
        paint();
    };

    /** Speichert nur den Teil, den diese Seite zeigt - alles andere bleibt. */
    const send = async (part: Record<string, unknown>, done: string): Promise<boolean> => {
        const answer = await call<{ settings: ISettings; warning: string | null }>("", { action: "settings", settings: part });

        if (!answer) return false;

        toast("info", answer.warning ? "Gespeichert, aber …" : "Gespeichert", answer.warning ?? done);
        void reload();

        return true;
    };

    const forumOptions = (): [string, string][] => [["", "— kein Forum —"], ...data!.guild.forums.map((entry): [string, string] => [entry.id, `# ${entry.name}`])];
    const channelOptions = (): [string, string][] => [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])];
    const forumName = (id: string | null): string | null => data!.guild.forums.find((entry) => entry.id === id)?.name ?? null;

    /**
     * Der Zusammenhang einer Nachricht. Bei Beitrag und Vorschau kommen die
     * beweglichen Platzhalter dazu: je Frage {frageN} und {antwortN}. Sie
     * entstehen aus den Fragen, die gerade im Editor stehen - deshalb nimmt der
     * Aufruf die Fragen als Funktion und nicht als Liste.
     */
    const context =
        (list: IPlaceholder[], questions?: () => IQuestion[]) =>
        (): IEditorContext => {
            const extra: IPlaceholder[] = (questions?.() ?? []).flatMap((question, index) => [
                { key: `frage${index + 1}`, label: `Frage ${index + 1}`, sample: question.label || `Frage ${index + 1}` },
                { key: `antwort${index + 1}`, label: `Antwort ${index + 1}${question.label ? ` – ${question.label}` : ""}`, sample: question.choices[0] ?? `Antwort ${index + 1}` },
            ]);
            const placeholders = [...list, ...extra];

            return {
                guildId,
                values: Object.fromEntries(placeholders.map((entry) => [entry.key, entry.sample])),
                roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
                channels: new Map([...data!.guild.channels, ...data!.guild.forums].map((channel) => [channel.id, channel.name])),
                emojis: data!.guild.emojis,
                placeholders,
                imagePlaceholders: [...LFT_IMAGES],
                onChange: () => undefined,
            };
        };

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

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        if (kind) {
            const side = data!.settings[kind];
            const forum = forumName(side.forumId);

            return el(
                "div",
                "tkhead snhead",
                stat("#i-check", "Nimmt Anfragen an", side.on && forum ? "Ja" : "Nein", side.on && forum ? "is-ok" : ""),
                stat("#i-list-checks", "Fragen", `${side.questions.length} / ${data!.limits.questions}`),
                stat("#i-inbox", "Laufende Suchen", String(data!.open)),
                stat("#i-forum", "Forum", forum ? `# ${forum}` : "fehlt", forum ? "" : "is-warn")
            );
        }

        const shared = data!.settings.player.forumId && data!.settings.player.forumId === data!.settings.team.forumId;
        const forums = new Set([data!.settings.player.forumId, data!.settings.team.forumId].filter(Boolean));

        return el(
            "div",
            "tkhead snhead",
            stat("#i-inbox", "Laufende Suchen", String(data!.open)),
            stat("#i-users", data!.kinds.player, data!.settings.player.on ? "An" : "Aus", data!.settings.player.on ? "is-ok" : ""),
            stat("#i-shield-users", data!.kinds.team, data!.settings.team.on ? "An" : "Aus", data!.settings.team.on ? "is-ok" : ""),
            stat("#i-forum", "Foren", forums.size === 0 ? "keins" : shared ? "eins für beide" : `${forums.size} getrennt`, forums.size ? "" : "is-warn")
        );
    }

    /* ------------------------------------------------------------
       Grundlagen: Foren und Tags
       ------------------------------------------------------------ */
    function forums(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const ok = await send(
                {
                    player: { forumId: draft.player.forumId, tag: draft.player.tag },
                    team: { forumId: draft.team.forumId, tag: draft.team.tag },
                },
                "Die Tags stehen im Forum."
            );

            if (!ok) save.disabled = false;
        });

        const hint = el("p", "hintline");
        const draw = (): void => {
            const shared = draft.player.forumId && draft.player.forumId === draft.team.forumId;
            const open = [
                ...(draft.player.on && !draft.player.forumId ? [data!.kinds.player] : []),
                ...(draft.team.on && !draft.team.forumId ? [data!.kinds.team] : []),
            ];

            hint.replaceChildren(
                shared
                    ? el(
                          "span",
                          "",
                          `Beide nutzen dasselbe Forum. Der Bot legt dort zwei Tags an – „${draft.player.tag.name}“ und „${draft.team.tag.name}“ –, dazu „${data!.closedTag.name}“ für beendete Suchen. So bleiben Spieler und Teams auseinanderzuhalten.`
                      )
                    : el("span", "", `Getrennte Foren: in jedem legt der Bot seinen Tag und „${data!.closedTag.name}“ an. Ein Forum für beide geht auch – dann stehen dort beide Tags.`)
            );

            warn.replaceChildren(
                ...(open.length
                    ? [icon("#i-warn"), el("span", "", `Ohne Forum entsteht kein Beitrag: ${open.join(" und ")} nimmt gerade Anfragen an, hat aber kein Forum.`)]
                    : [])
            );
            warn.hidden = !open.length;
        };

        const warn = el("div", "notice");
        const side = (which: Kind): HTMLElement[] => {
            const entry = draft[which];
            const name = el("input", "text");
            const emoji = el("input", "text text--emoji");

            name.type = "text";
            name.value = entry.tag.name;
            name.maxLength = data!.limits.tag;
            name.placeholder = "Name des Tags";
            name.setAttribute("aria-label", `Tag der ${data!.kinds[which]}`);
            name.addEventListener("input", () => {
                entry.tag.name = name.value;
                touch();
                draw();
            });

            emoji.type = "text";
            emoji.value = entry.tag.emoji ?? "";
            emoji.maxLength = 64;
            emoji.placeholder = "🔎";
            emoji.setAttribute("aria-label", `Emoji des Tags der ${data!.kinds[which]}`);
            emoji.addEventListener("input", () => {
                entry.tag.emoji = emoji.value.trim() || null;
                touch();
            });

            return [
                el("h4", "srhead", `${data!.kinds[which]} – ${data!.leads[which]}`),
                row(
                    "Forum",
                    "Dort entstehen die Beiträge",
                    select(
                        forumOptions(),
                        entry.forumId ?? "",
                        (value) => {
                            entry.forumId = value || null;
                            touch();
                            draw();
                        },
                        `Forum der ${data!.kinds[which]}`
                    )
                ),
                row("Tag", "Legt der Bot im Forum selbst an", el("div", "lftag", name, emoji)),
            ];
        };

        const cards = card(
            "Wo die Beiträge landen",
            "Je Seite ein Forum – oder für beide dasselbe. Die Tags legt der Bot beim Speichern an; vorhandene Tags des Forums bleiben stehen.",
            ...side("player"),
            ...side("team"),
            warn,
            hint,
            el("div", "mcsave lvsave", save)
        );

        draw();

        return cards;
    }

    /* ------------------------------------------------------------
       Grundlagen: Meldung, DM, Ablauf
       ------------------------------------------------------------ */
    function notice(): HTMLElement {
        const draft = structuredClone(data!.settings.notice);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await send({ notice: draft }, "Neue Anfragen landen im Kanal."))) save.disabled = false;
        });

        const editor = bodyEditor(draft.body, {
            kinds: data!.bodyKinds,
            context: context(LFT_NOTICE_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Neue {art}: {user.name}", "{antworten.kurz}"),
            touch,
            title: "Die Meldung",
            hint: "{post.url} ist der Link zum Beitrag, {antworten.kurz} die Kurzfassung.",
            templates: "lftNotice",
        });

        const box = el("div");
        const draw = (): void => {
            editor.node.hidden = !draft.channelId;
            box.replaceChildren(
                row(
                    "Kanal",
                    "Ohne Kanal bleibt die Meldung aus",
                    select(
                        channelOptions(),
                        draft.channelId ?? "",
                        (value) => {
                            draft.channelId = value || null;
                            touch();
                            draw();
                        },
                        "Kanal für die Meldung"
                    )
                ),
                ...(draft.channelId
                    ? [
                          row(
                              "Wer wird gepingt",
                              `Bis zu ${data!.limits.pings} Rollen`,
                              rolePicker(
                                  data!.guild.roles,
                                  draft.roles,
                                  (ids) => {
                                      draft.roles = ids;
                                      touch();
                                  },
                                  [],
                                  data!.limits.pings
                              )
                          ),
                          editor.node,
                      ]
                    : [])
            );
        };

        draw();

        return card(
            "Meldung ans Team",
            "Sobald ein Beitrag steht, kann der Bot es im Team-Kanal sagen – mit zwei Knöpfen: Suche beenden und Beitrag löschen.",
            box,
            el("div", "mcsave lvsave", save)
        );
    }

    function messages(): HTMLElement {
        const draft = structuredClone(data!.settings.dm);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await send({ dm: draft }, "Beim nächsten Gespräch stehen die neuen Texte da."))) save.disabled = false;
        });

        const intro = bodyEditor(draft.intro, {
            kinds: data!.bodyKinds,
            context: context(LFT_INTRO_PLACEHOLDERS),
            defaultEmbed: () => embedOf("{art}", "Ich stelle dir jetzt {fragen.anzahl} Fragen."),
            touch,
            title: "Begrüßung",
            hint: "Steht vor der ersten Frage. {fragen.anzahl} ist die Zahl der Fragen.",
            templates: "lftIntro",
        });

        const question = bodyEditor(draft.question, {
            kinds: data!.bodyKinds,
            context: context(LFT_QUESTION_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Frage {frage.nummer} von {fragen.anzahl}", "{frage}{frage.hinweis}"),
            touch,
            title: "Eine Frage",
            hint: "Diese Nachricht kommt je Frage einmal – {frage} ist die Frage selbst.",
            templates: "lftQuestion",
        });

        const done = bodyEditor(draft.done, {
            kinds: data!.bodyKinds,
            context: context(LFT_DONE_PLACEHOLDERS),
            defaultEmbed: () => embedOf("Dein Beitrag steht", "[{post.titel}]({post.url})"),
            touch,
            title: "Abschluss",
            hint: "Kommt, wenn der Beitrag steht. {post.url} ist der Link darauf.",
            templates: "lftDone",
        });

        return card(
            "Die Nachrichten in der DM",
            "Für beide Seiten dieselben: Begrüßung, die Frage selbst und der Abschluss. Bei einer Auswahl-Frage hängt der Bot das Menü unter die Frage.",
            el("div", "tmmsgs", intro.node, question.node, done.node),
            el("div", "mcsave lvsave", save)
        );
    }

    function rules(): HTMLElement {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };
        const days = el("input", "text lfdays");

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await send({ expireDays: draft.expireDays, manageRoles: draft.manageRoles }, "Gilt ab jetzt."))) save.disabled = false;
        });

        days.type = "number";
        days.min = "0";
        days.max = String(data!.limits.expire);
        days.value = String(draft.expireDays);
        days.setAttribute("aria-label", "Nach wie vielen Tagen eine Suche endet");
        days.addEventListener("input", () => {
            draft.expireDays = Math.max(0, Math.min(data!.limits.expire, Number(days.value) || 0));
            touch();
        });

        return card(
            "Ablauf und Rechte",
            "Eine Suche endet von allein oder von Hand. Beendet heißt: der Beitrag bekommt den Tag und wird geschlossen – lesen kann ihn weiter jeder.",
            row("Läuft ab nach", "Tagen – 0 heißt: läuft, bis jemand sie beendet", days),
            row(
                "Fremde Suchen beenden dürfen",
                `Bis zu ${data!.limits.managers} Rollen. „Server verwalten“ und „Beiträge verwalten“ dürfen immer`,
                rolePicker(
                    data!.guild.roles,
                    draft.manageRoles,
                    (ids) => {
                        draft.manageRoles = ids;
                        touch();
                    },
                    [],
                    data!.limits.managers
                )
            ),
            el("p", "hintline", "Wer selbst gesucht hat, darf seine Suche immer beenden – mit dem Knopf am Beitrag oder mit `/lookingfor beenden`."),
            el("div", "mcsave lvsave", save)
        );
    }

    /* ------------------------------------------------------------
       Eine Seite: Fragen und Beitrag
       ------------------------------------------------------------ */
    function questions(): HTMLElement[] {
        const which = kind!;
        const draft = structuredClone(data!.settings[which]);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const ok = await send(
                { [which]: { on: draft.on, questions: draft.questions, title: draft.title, post: draft.post, preview: draft.preview } },
                "Das nächste Gespräch nimmt die neuen Fragen."
            );

            if (!ok) save.disabled = false;
        });

        const forum = forumName(draft.forumId);
        const list = el("div", "apquestions");
        const line = el("p", "hintline");
        const counted = (): string =>
            `Je Frage gibt es zwei Platzhalter: {frage1} ist die erste Frage, {antwort1} die Antwort darauf – ${draft.questions.length ? `hier also bis {antwort${draft.questions.length}}` : "sobald die erste Frage steht"}.`;
        const drawList = (): void => {
            list.replaceChildren(...draft.questions.map((question, index) => questionRow(draft, question, index, touch, drawList, refresh)), addRow(draft, touch, drawList, refresh));
        };

        const title = el("input", "text");

        title.type = "text";
        title.value = draft.title;
        title.maxLength = data!.limits.title;
        title.placeholder = "🔎 {user.name} sucht ein Team";
        title.setAttribute("aria-label", "Titel des Beitrags");
        title.addEventListener("input", () => {
            draft.title = title.value;
            touch();
        });

        const post = bodyEditor(draft.post, {
            kinds: data!.bodyKinds,
            context: context(LFT_POST_PLACEHOLDERS, () => draft.questions),
            defaultEmbed: () => embedOf("{art}: {user.name}", "{antworten}"),
            touch,
            title: "Der Beitrag",
            hint: "{antworten} setzt alle Fragen samt Antworten ein, {antwort1} nur die erste.",
            templates: "lftPost",
        });

        const preview = bodyEditor(draft.preview, {
            kinds: data!.bodyKinds,
            context: context(LFT_PREVIEW_PLACEHOLDERS, () => draft.questions),
            defaultEmbed: () => embedOf("Passt das so?", "{antworten}"),
            touch,
            title: "Die Vorschau in der DM",
            hint: "Darunter hängt der Bot die Knöpfe „Abschicken“ und „Abbrechen“.",
            templates: "lftPreview",
        });

        /**
          * Nach einer Änderung an den Fragen: die Platzhalter-Listen der beiden
          * Editoren neu - und der Satz darunter, der die letzte Nummer nennt.
          */
        const refresh = (): void => {
            line.textContent = counted();
            post.redraw();
            preview.redraw();
        };

        line.textContent = counted();
        drawList();

        return [
            card(
                `${data!.kinds[which]} – ${data!.leads[which]}`,
                "Steht der Schalter aus, sagt der Befehl das und fragt nichts.",
                row(
                    "Nimmt Anfragen an",
                    forum ? `Die Beiträge gehen nach # ${forum}` : "Erst mit Forum – das steht unter „Looking for“",
                    el(
                        "label",
                        "snitem__switch",
                        toggle(draft.on, `${data!.kinds[which]} annehmen`, (on) => {
                            draft.on = on;
                            touch();
                        }),
                        el("span", "", "an")
                    )
                ),
                ...(forum ? [] : [el("div", "notice", icon("#i-warn"), el("span", "", "Ohne Forum entsteht kein Beitrag. Das Forum stellst du unter „Looking for“ ein."))]),
                row("Titel des Beitrags", `Höchstens ${data!.limits.title} Zeichen – Platzhalter gehen`, title)
            ),
            card(
                "Die Fragen",
                "In dieser Reihenfolge fragt der Bot. Eine Auswahl wird in der DM zum Menü; freiwillige Fragen überspringt man mit „-“.",
                list,
                line
            ),
            card("Der Beitrag und die Vorschau", "Selbst gebaut – mit Platzhaltern, Vorlagen und Live-Vorschau.", el("div", "tmmsgs", post.node, preview.node), el("div", "mcsave lvsave", save)),
        ];
    }

    function questionRow(side: ISide, question: IQuestion, index: number, touch: () => void, redraw: () => void, refresh: () => void): HTMLElement {
        const label = el("input", "text");
        const hint = el("input", "text");
        const up = button("btn btn--quiet btn--icon", icon("#i-up"));
        const down = button("btn btn--quiet btn--icon", icon("#i-down"));
        const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

        label.type = "text";
        label.value = question.label;
        label.maxLength = data!.limits.label;
        label.placeholder = "Die Frage";
        label.setAttribute("aria-label", `Frage ${index + 1}`);
        label.addEventListener("input", () => {
            question.label = label.value;
            touch();
            refresh();
        });

        hint.type = "text";
        hint.value = question.hint;
        hint.maxLength = data!.limits.hint;
        hint.placeholder = "Hinweis darunter (freiwillig)";
        hint.setAttribute("aria-label", `Hinweis zu Frage ${index + 1}`);
        hint.addEventListener("input", () => {
            question.hint = hint.value;
            touch();
        });

        const kinds = select(
            Object.entries(data!.questionKinds).map(([value, text]): [string, string] => [value, text]),
            question.kind,
            (value) => {
                question.kind = value as QuestionKind;

                if (question.kind === "choice" && !question.choices.length) question.choices = ["Erste Möglichkeit", "Zweite Möglichkeit"];
                if (question.kind === "long" && question.max < 400) question.max = data!.limits.answer;

                touch();
                redraw();
                refresh();
            },
            `Art von Frage ${index + 1}`
        );

        const move = (to: number): void => {
            side.questions.splice(to, 0, ...side.questions.splice(index, 1));
            touch();
            redraw();
            refresh();
        };

        up.title = "Nach oben";
        up.setAttribute("aria-label", `Frage ${index + 1} nach oben`);
        up.disabled = index === 0;
        up.addEventListener("click", () => move(index - 1));

        down.title = "Nach unten";
        down.setAttribute("aria-label", `Frage ${index + 1} nach unten`);
        down.disabled = index === side.questions.length - 1;
        down.addEventListener("click", () => move(index + 1));

        remove.title = "Frage entfernen";
        remove.setAttribute("aria-label", `Frage ${index + 1} entfernen`);
        remove.addEventListener("click", () => {
            side.questions.splice(index, 1);
            touch();
            redraw();
            refresh();
        });

        const choices = el("input", "text");

        choices.type = "text";
        choices.value = question.choices.join(" | ");
        choices.placeholder = "Möglichkeiten mit | trennen";
        choices.setAttribute("aria-label", `Möglichkeiten zu Frage ${index + 1}`);
        choices.addEventListener("input", () => {
            question.choices = choices.value
                .split("|")
                .map((one) => one.trim())
                .filter(Boolean)
                .slice(0, data!.limits.choices);
            touch();
            refresh();
        });

        return el(
            "div",
            "apquestion",
            el("span", "apquestion__no", String(index + 1)),
            el(
                "div",
                "apquestion__main",
                label,
                hint,
                ...(question.kind === "choice" ? [choices] : []),
                el(
                    "div",
                    "apquestion__meta",
                    kinds,
                    el(
                        "label",
                        "snitem__switch",
                        toggle(question.required, `Frage ${index + 1} ist Pflicht`, (on) => {
                            question.required = on;
                            touch();
                        }),
                        el("span", "", "Pflicht")
                    ),
                    el("span", "tmkey", el("code", "", `{antwort${index + 1}}`))
                )
            ),
            el("div", "apquestion__side", up, down, remove)
        );
    }

    function addRow(side: ISide, touch: () => void, redraw: () => void, refresh: () => void): HTMLElement {
        const add = button("btn btn--quiet", icon("#i-plus"), "Frage hinzufügen");

        add.disabled = side.questions.length >= data!.limits.questions;
        add.addEventListener("click", () => {
            const taken = new Set(side.questions.map((question) => question.id));
            let id = `q${side.questions.length + 1}`;

            for (let index = 1; taken.has(id); index++) id = `q${side.questions.length + index + 1}`;

            side.questions.push({ id, label: "", hint: "", kind: "short", choices: [], required: true, max: 200 });
            touch();
            redraw();
            refresh();
        });

        return el("div", "apquestion apquestion--add", add);
    }

    /* ------------------------------------------------------------
       Die Anfragen
       ------------------------------------------------------------ */
    function requests(): HTMLElement {
        const status = select(
            [
                ["", "Alle"],
                ["open", data!.statuses.open],
                ["closed", data!.statuses.closed],
            ],
            filter.status,
            (value) => {
                filter.status = value as Status | "";
                filter.page = 1;
                void reload();
            },
            "Nach Stand filtern"
        );

        const kinds = select(
            [
                ["", "Spieler und Teams"],
                ["player", data!.kinds.player],
                ["team", data!.kinds.team],
            ],
            filter.kind,
            (value) => {
                filter.kind = value as Kind | "";
                filter.page = 1;
                void reload();
            },
            "Nach Art filtern"
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

        const list = data!.requests.length
            ? data!.requests.map(requestRow)
            : [el("div", "tkempty", icon("#i-inbox"), el("span", "", filter.status ? "Dazu gibt es gerade nichts." : "Noch hat niemand gesucht."))];

        return card(
            kind ? `Anfragen – ${data!.kinds[kind]}` : "Alle Anfragen",
            "Laufende zuerst. Ein Klick zeigt die Antworten, so wie sie im Beitrag stehen.",
            el("div", "apfilter", ...(kind ? [] : [kinds]), status, ...(pages > 1 ? [back, next] : [])),
            el("div", "aplist", ...list),
            el("p", "hintline", `${data!.total} insgesamt${pages > 1 ? ` · Seite ${filter.page} von ${pages}` : ""}`)
        );
    }

    function requestRow(entry: IRequest): HTMLElement {
        const isOpen = openId === entry.id;
        const look = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-eye"), isOpen ? "Zuklappen" : "Ansehen");

        look.addEventListener("click", () => {
            openId = isOpen ? null : entry.id;
            paint();
        });

        const box = el(
            "div",
            `snitem${isOpen ? " is-open" : ""}`,
            el(
                "div",
                "snitem__head",
                el("span", "snitem__face", icon(entry.kind === "team" ? "#i-shield-users" : "#i-users")),
                el(
                    "div",
                    "snitem__name",
                    el("b", "", entry.title || entry.userName),
                    el(
                        "span",
                        "",
                        `${entry.userName} · ${data!.kinds[entry.kind]} · ${ago(entry.createdAt)}${entry.closedAt ? ` · beendet ${ago(entry.closedAt)}` : ""}`
                    )
                ),
                el("span", `apchip${entry.status === "open" ? " is-accepted" : ""}`, data!.statuses[entry.status]),
                look
            )
        );

        if (!isOpen) return box;

        const open = entry.url ? el("a", "btn btn--quiet") : null;

        if (open && entry.url) {
            open.href = entry.url;
            open.target = "_blank";
            open.rel = "noopener";
            open.append(icon("#i-external"), "Beitrag öffnen");
        }

        const close = confirmButton("btn btn--quiet", "#i-check", "Suche beenden", "Wirklich beenden?", async () => {
            if (!(await call("", { action: "close", id: entry.id }))) return;

            openId = null;
            toast("info", "Beendet", "Der Beitrag ist zu und trägt den Tag.");
            void reload();
        });

        const kill = confirmButton("btn btn--quiet is-danger", "#i-trash", "Beitrag löschen", "Beitrag und Anfrage wirklich löschen?", async () => {
            if (!(await call("", { action: "delete", id: entry.id }))) return;

            openId = null;
            toast("info", "Gelöscht", "Beitrag und Anfrage sind weg.");
            void reload();
        });

        box.append(
            el(
                "div",
                "snitem__body",
                el(
                    "div",
                    "apanswers",
                    ...(entry.answers.length
                        ? entry.answers.map((answer) => el("div", "apanswer", el("b", "", answer.label), el("p", "", answer.value)))
                        : [el("div", "apanswer", el("b", "", "Keine Antworten"), el("p", "", "— leer —"))])
                ),
                el(
                    "p",
                    "hintline",
                    `Erstellt ${WHEN.format(new Date(entry.createdAt))}${entry.closedBy ? " · von Hand beendet" : entry.closedAt ? " · von allein abgelaufen" : ""}`
                ),
                el("div", "mcsave", ...(open ? [open] : []), ...(entry.status === "open" ? [close] : []), kill)
            )
        );

        return box;
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        host.replaceChildren(
            head(),
            ...(kind ? [...questions(), requests()] : view === "requests" ? [requests()] : [forums(), notice(), messages(), rules()])
        );
    }

    loading(host, 4);

    void loadGallery(guildId).catch(() => undefined);
    void reload();
}
