/**
 * Abschnitt: Apply System.
 *
 * Drei Reiter: eingegangene Bewerbungen, die Formulare und die Einstellungen.
 * Wer nur prüfen darf, sieht allein den ersten - Formulare und Einstellungen
 * gehören denen, die den Server verwalten.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IPerson, IRole, loading, personPicker, radioTiles, rolePicker, row, select, stat, toggle, WHEN } from "../core/Ui.js";
import { sentOn } from "../core/Format.js";

type Status = "open" | "accepted" | "declined";
type Kind = "short" | "long" | "choice";

interface IQuestion {
    id: string;
    label: string;
    hint: string;
    kind: Kind;
    choices: string[];
    required: boolean;
    max: number;
}

interface IFormSettings {
    channelId: string | null;
    acceptRole: string | null;
    pingRoles: string[];
    dm: boolean;
    cooldownDays: number;
    minAccountDays: number;
    requireRole: string | null;
}

interface IForm {
    id: number;
    name: string;
    description: string;
    emoji: string | null;
    open: boolean;
    questions: IQuestion[];
    settings: IFormSettings;
}

interface ISubmission {
    id: number;
    formId: number;
    userId: string;
    userName: string;
    answers: { id: string; value: string }[];
    status: Status;
    note: string | null;
    decidedName: string | null;
    decidedAt: number | null;
    createdAt: number;
}

type Mode = "web" | "modal" | "dm";
type Target = "shared" | "channel";
type After = "delete" | "close" | "keep";

interface ISettings {
    /** Wo man sich bewirbt (Plan 24). */
    mode: Mode;
    /** Das Panel in Discord, schreibt nur der Bot. */
    panel: { channelId: string | null; messageId: string | null };
    reviewRoles: string[];
    reviewUsers: string[];
    channelId: string | null;
    open: boolean;
    /** Plan 30: Sammelkanal oder eigener Kanal je Bewerbung. */
    target: Target;
    categoryId: string | null;
    channelName: string;
    afterDecision: After;
}

interface IPayload {
    manage: boolean;
    settings: ISettings;
    forms: IForm[];
    submissions: ISubmission[];
    total: number;
    page: number;
    pageSize: number;
    open: number;
    link: string;
    defaults: { form: Omit<IForm, "id"> };
    kinds: Record<string, string>;
    statuses: Record<string, string>;
    limits: { forms: number; questions: number; choices: number; note: number; reviewers: number };
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[]; categories: { id: string; name: string }[] };
}

/** Die drei Wege, wie im abgenommenen Entwurf: Name, was passiert, ein kurzes Etikett. */
const MODES: [Mode, string, string, string][] = [
    ["web", "Webseite", "Das Formular unter dem Link, angemeldet mit Discord.", "Wie bisher"],
    ["modal", "Fenster in Discord", "Klick auf „Bewerben“ öffnet ein Fenster. Bis zu 5 Fragen je Fenster, danach geht es mit „Weiter“.", "Ohne Seitenwechsel"],
    ["dm", "DM von RL Nexus", "Der Bot schreibt dem Bewerber und stellt die Fragen nacheinander. Geantwortet wird im Chat.", "Fühlt sich an wie ein Gespräch"],
];

/** Plan 30: wo die Karte landet und was danach mit dem eigenen Kanal passiert. */
const TARGETS: [Target, string, string, string][] = [
    ["shared", "Sammelkanal", "Alle Karten in einem Kanal. Wer den Kanal sieht, sieht jede Bewerbung.", "Wie bisher"],
    ["channel", "Eigener Kanal", "Für jede Bewerbung ein Kanal, nur für die Person und die Prüfer.", "Wie bei Tickets"],
];

const AFTERS: [After, string, string, string][] = [
    ["close", "Für die Person schließen", "Die Prüfer behalten den Kanal, die Person sieht ihn nicht mehr.", "Vorgabe"],
    ["delete", "Löschen", "Der Kanal ist sofort weg.", "Aufgeräumt"],
    ["keep", "Offen lassen", "Alles bleibt. Aufräumen geht mit „Kanal löschen“ an der Karte.", "Zum Nachfragen"],
];

/** So viele Zeichen nimmt Discord als Beschriftung im Fenster. */
const MODAL_LABEL = 45;

const DAYS: [number, string][] = [
    [0, "Keine Pause"],
    [7, "7 Tage"],
    [14, "14 Tage"],
    [30, "30 Tage"],
    [90, "90 Tage"],
];

const AGE: [number, string][] = [
    [0, "Egal"],
    [7, "7 Tage"],
    [30, "30 Tage"],
    [90, "90 Tage"],
];

/** Der Abschnitt "Bewerbungen" - die eingegangenen Bewerbungen, sonst nichts. */
export function renderApplications(guildId: string): void {
    mount(guildId, "inbox");
}

/** Der Abschnitt "Apply System" - Formulare und Einstellungen. */
export function renderApply(guildId: string): void {
    mount(guildId, "manage");
}

function mount(guildId: string, view: "inbox" | "manage"): void {
    const host = need<HTMLElement>(view === "inbox" ? "#inboxBody" : "#applyBody");
    const note = need<HTMLElement>(view === "inbox" ? "#inboxNote" : "#applyNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/apply`, note);

    let data: IPayload | null = null;
    let tab: "forms" | "settings" = "forms";
    let openId: number | null = null;
    let openForm: number | null = null;
    let filter: { status: Status | ""; form: number | 0 } = { status: "open", form: 0 };

    const reload = async (): Promise<void> => {
        const query = new URLSearchParams();

        if (filter.status) query.set("status", filter.status);
        if (filter.form) query.set("form", String(filter.form));

        const answer = await call<IPayload>(query.toString() ? `?${query}` : "");

        if (!answer) return;

        data = answer;
        paint();
    };

    const formOf = (id: number): IForm | undefined => data!.forms.find((form) => form.id === id);

    /* ------------------------------------------------------------
       Kopf und Reiter
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const reviewers = data!.settings.reviewRoles.length + data!.settings.reviewUsers.length;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-inbox", "Offen", String(data!.open), data!.open ? "is-warn" : "is-ok"),
            stat("#i-clipboard", "Formulare", `${data!.forms.length} / ${data!.limits.forms}`),
            stat("#i-shield-users", "Prüfer", reviewers ? String(reviewers) : "nur Verwalter"),
            stat("#i-link", "Bewerbungen", data!.settings.open ? "an" : "aus", data!.settings.open ? "is-ok" : "")
        );
    }

    function tabs(): HTMLElement {
        const box = el("div", "seg plkinds");
        const entries: [typeof tab, string][] = [["forms", "Formulare"], ["settings", "Einstellungen"]];

        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "Bereich wählen");

        for (const [value, label] of entries) {
            const entry = button("", label);

            entry.setAttribute("aria-pressed", String(tab === value));
            entry.addEventListener("click", () => {
                tab = value;
                paint();
            });
            box.append(entry);
        }

        return box;
    }

    /* ------------------------------------------------------------
       Eingegangene Bewerbungen
       ------------------------------------------------------------ */
    function inbox(): HTMLElement {
        const status = select(
            [["open", "Offen"], ["accepted", "Angenommen"], ["declined", "Abgelehnt"], ["", "Alle"]],
            filter.status,
            (value) => {
                filter.status = value as Status | "";
                void reload();
            },
            "Nach Stand filtern"
        );

        const form = select(
            [["0", "Alle Formulare"], ...data!.forms.map((entry): [string, string] => [String(entry.id), entry.name])],
            String(filter.form),
            (value) => {
                filter.form = Number(value);
                void reload();
            },
            "Nach Formular filtern"
        );

        const list = data!.submissions.length
            ? data!.submissions.map(submissionRow)
            : [el("div", "tkempty", icon("#i-inbox"), el("span", "", "Hier ist gerade nichts."))];

        return card(
            "Bewerbungen",
            data!.manage
                ? "Offene zuerst. Ein Klick klappt die Antworten auf – entschieden wird hier oder direkt an der Karte in Discord."
                : "Du siehst die Bewerbungen dieses Servers und kannst sie entscheiden.",
            el("div", "apfilter", status, form),
            el("div", "aplist", ...list),
            el("p", "hintline", `${data!.total} insgesamt${data!.total > data!.pageSize ? ` · gezeigt werden die ersten ${data!.pageSize}` : ""}`)
        );
    }

    function submissionRow(entry: ISubmission): HTMLElement {
        const isOpen = openId === entry.id;
        const form = formOf(entry.formId);
        const toggleOpen = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-eye"), isOpen ? "Zuklappen" : "Ansehen");

        toggleOpen.addEventListener("click", () => {
            openId = isOpen ? null : entry.id;
            paint();
        });

        const box = el(
            "div",
            `snitem${isOpen ? " is-open" : ""}`,
            el(
                "div",
                "snitem__head",
                el("span", "snitem__face", icon("#i-clipboard")),
                el(
                    "div",
                    "snitem__name",
                    el("b", "", `${entry.userName} · ${form?.name ?? "gelöschtes Formular"}`),
                    el("span", "", `#${entry.id} · ${WHEN.format(new Date(entry.createdAt))}${entry.decidedName ? ` · ${entry.status === "accepted" ? "angenommen" : "abgelehnt"} von ${entry.decidedName}` : ""}`)
                ),
                el("span", `apchip is-${entry.status}`, data!.statuses[entry.status]),
                toggleOpen
            )
        );

        if (!isOpen) return box;

        const answers = el(
            "div",
            "apanswers",
            ...(form?.questions ?? []).map((question) => {
                const answer = entry.answers.find((one) => one.id === question.id);

                return el("div", "apanswer", el("b", "", question.label), el("p", "", answer?.value ?? "— keine Antwort —"));
            })
        );

        const noteField = el("input", "text apnote");

        noteField.type = "text";
        noteField.maxLength = data!.limits.note;
        noteField.placeholder = "Kurze Begründung – kommt mit der Nachricht an den Bewerber";
        noteField.setAttribute("aria-label", "Begründung");

        const decide = async (status: Status): Promise<void> => {
            const answer = await call<{ submission: ISubmission }>("", { action: "decide", id: entry.id, status, note: noteField.value });

            if (!answer) return;

            openId = null;
            toast("info", status === "accepted" ? "Angenommen" : "Abgelehnt", "Der Bewerber bekommt Bescheid, wenn das Formular es vorsieht.");
            void reload();
        };

        const yes = button("btn btn--primary", icon("#i-check"), "Annehmen");
        const no = confirmButton("btn btn--quiet", "#i-x", "Ablehnen", "Wirklich ablehnen?", () => decide("declined"));

        yes.addEventListener("click", () => void decide("accepted"));

        // Plan 30: Entschiedenes wieder wegnehmen - bei Annahme samt Rolle.
        const remove = async (): Promise<void> => {
            const answer = await call<{ left: string[] }>("", { action: "remove", id: entry.id });

            if (!answer) return;

            openId = null;
            toast("info", answer.left.length ? "Entfernt, aber …" : "Entfernt", answer.left.length ? answer.left.join(" ") : "Die Person kann sich jetzt neu bewerben.");
            void reload();
        };
        const roleName = form?.settings.acceptRole ? data!.guild.roles.find((role) => role.id === form.settings.acceptRole)?.name : null;
        const removeHint =
            entry.status === "accepted"
                ? `Entfernen ${roleName ? `zieht die Rolle @${roleName} ab und ` : ""}löscht die Bewerbung. Danach kann sich die Person neu bewerben.`
                : "Entfernen löscht die Bewerbung. Die Pause nach der Absage fällt damit weg.";
        const drop = confirmButton("btn btn--quiet", "#i-trash", "Entfernen", "Wirklich entfernen?", remove);

        box.append(
            el(
                "div",
                "snitem__body",
                answers,
                ...(entry.status === "open"
                    ? [row("Begründung", "Steht in der Nachricht an den Bewerber – freiwillig", noteField), el("div", "mcsave", yes, no)]
                    : [
                          el(
                              "p",
                              "hintline",
                              `${data!.statuses[entry.status]} von ${entry.decidedName ?? "unbekannt"}${entry.decidedAt ? ` · ${WHEN.format(new Date(entry.decidedAt))}` : ""}${entry.note ? ` · „${entry.note}"` : ""}`
                          ),
                          el("p", "hintline", removeHint),
                          el("div", "mcsave", drop),
                      ])
            )
        );

        return box;
    }

    /* ------------------------------------------------------------
       Formulare
       ------------------------------------------------------------ */
    function forms(): HTMLElement[] {
        const name = el("input", "text snadd__input");
        const add = button("btn btn--primary snadd__go", icon("#i-plus"), "Anlegen");

        name.type = "text";
        name.maxLength = 80;
        name.placeholder = "Wofür bewirbt man sich? Etwa „Moderator\"";
        name.setAttribute("aria-label", "Name des neuen Formulars");

        const create = async (): Promise<void> => {
            if (!name.value.trim()) {
                toast("info", "Ohne Namen geht nicht", "Der Name steht auch auf der öffentlichen Seite.");

                return;
            }

            add.disabled = true;

            const answer = await call<{ form: IForm }>("", { action: "create", form: { ...data!.defaults.form, name: name.value.trim() } });

            add.disabled = false;

            if (!answer) return;

            openForm = answer.form.id;
            name.value = "";
            toast("info", "Angelegt", "Jetzt die Fragen anpassen – gespeichert wird mit Speichern.");
            void reload();
        };

        add.addEventListener("click", () => void create());
        name.addEventListener("keydown", (event) => {
            if (event.key === "Enter") void create();
        });

        return [
            card(
                "Neues Formular",
                `Bis zu ${data!.limits.forms} je Server. Jedes bekommt auf der öffentlichen Seite eine eigene Kachel.`,
                el("div", "snadd__row", icon("#i-clipboard"), name, add)
            ),
            ...(data!.forms.length ? data!.forms.map(formCard) : [el("div", "tkempty", icon("#i-clipboard"), el("span", "", "Noch kein Formular."))]),
        ];
    }

    function formCard(form: IForm): HTMLElement {
        const draft = structuredClone(form);
        const isOpen = openForm === form.id;
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;

        const toggleOpen = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-sliders"), isOpen ? "Zuklappen" : "Bearbeiten");

        toggleOpen.addEventListener("click", () => {
            openForm = isOpen ? null : form.id;
            paint();
        });

        const box = el(
            "div",
            `snitem${isOpen ? " is-open" : ""}`,
            el(
                "div",
                "snitem__head",
                el("span", "snitem__face", form.emoji ? el("span", "", form.emoji) : icon("#i-clipboard")),
                el("div", "snitem__name", el("b", "", form.name), el("span", "", `${form.questions.length} Frage(n) · ${form.open ? "nimmt Bewerbungen an" : "geschlossen"}`)),
                toggleOpen
            )
        );

        if (!isOpen) return box;

        const text = (label: string, hint: string, value: string, max: number, onChange: (value: string) => void, area = false): HTMLElement => {
            const field = area ? el("textarea", "text tkarea") : el("input", "text");

            if (area) (field as HTMLTextAreaElement).rows = 3;
            else (field as HTMLInputElement).type = "text";

            (field as HTMLInputElement).value = value;
            (field as HTMLInputElement).maxLength = max;
            field.setAttribute("aria-label", label);
            field.addEventListener("input", () => {
                onChange((field as HTMLInputElement).value);
                touch();
            });

            return row(label, hint, field);
        };

        const questions = el("div", "apquestions");
        const drawQuestions = (): void => {
            questions.replaceChildren(
                ...draft.questions.map((question, index) => questionRow(draft, question, index, touch, drawQuestions)),
                addQuestion(draft, touch, drawQuestions)
            );
        };

        drawQuestions();

        save.addEventListener("click", async () => {
            save.disabled = true;

            const answer = await call<{ form: IForm }>("", { action: "save", id: form.id, form: draft });

            if (!answer) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Die öffentliche Seite zeigt es sofort.");
            void reload();
        });

        const remove = confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Formular löschen", "Wirklich löschen?", async () => {
            if (!(await call("", { action: "delete", id: form.id }))) return;

            openForm = null;
            toast("info", "Gelöscht", "Formular und die Bewerbungen darauf sind weg.");
            void reload();
        });

        box.append(
            el(
                "div",
                "snitem__body",
                text("Name", "Steht auf der öffentlichen Seite", draft.name, 80, (value) => (draft.name = value)),
                text("Emoji", "Klein vor dem Namen – darf leer bleiben", draft.emoji ?? "", 8, (value) => (draft.emoji = value.trim() || null)),
                text("Beschreibung", "Ein, zwei Sätze: worum geht es, was erwartet ihr", draft.description, 1000, (value) => (draft.description = value), true),
                row(
                    "Nimmt Bewerbungen an",
                    "Aus heißt: steht nicht auf der öffentlichen Seite",
                    el("label", "snitem__switch", toggle(draft.open, "Formular offen", (on) => {
                        draft.open = on;
                        touch();
                    }), el("span", "", "offen"))
                ),
                el("h4", "srhead", `Fragen (${draft.questions.length} / ${data!.limits.questions})`),
                questions,
                el("h4", "srhead", "Was danach passiert"),
                ...formSettings(draft, touch),
                el("div", "mcsave", save, remove)
            )
        );

        return box;
    }

    function questionRow(draft: IForm, question: IQuestion, index: number, touch: () => void, redraw: () => void): HTMLElement {
        const label = el("input", "text");
        const hint = el("input", "text");
        const remove = button("btn btn--quiet btn--icon", icon("#i-x"));
        const up = button("btn btn--quiet btn--icon", icon("#i-up"));

        label.type = "text";
        label.value = question.label;
        label.maxLength = 200;
        label.placeholder = "Die Frage";
        label.setAttribute("aria-label", `Frage ${index + 1}`);
        label.addEventListener("input", () => {
            question.label = label.value;
            touch();
        });

        hint.type = "text";
        hint.value = question.hint;
        hint.maxLength = 200;
        hint.placeholder = "Hinweis darunter (freiwillig)";
        hint.setAttribute("aria-label", `Hinweis zu Frage ${index + 1}`);
        hint.addEventListener("input", () => {
            question.hint = hint.value;
            touch();
        });

        const kind = select(
            Object.entries(data!.kinds).map(([value, text]): [string, string] => [value, text]),
            question.kind,
            (value) => {
                question.kind = value as Kind;

                if (question.kind === "choice" && !question.choices.length) question.choices = ["Erste Möglichkeit", "Zweite Möglichkeit"];

                touch();
                redraw();
            },
            `Art von Frage ${index + 1}`
        );

        up.title = "Nach oben";
        up.setAttribute("aria-label", `Frage ${index + 1} nach oben`);
        up.disabled = index === 0;
        up.addEventListener("click", () => {
            draft.questions.splice(index - 1, 0, ...draft.questions.splice(index, 1));
            touch();
            redraw();
        });

        remove.title = "Frage entfernen";
        remove.setAttribute("aria-label", `Frage ${index + 1} entfernen`);
        remove.addEventListener("click", () => {
            draft.questions.splice(index, 1);
            touch();
            redraw();
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
                    kind,
                    el("label", "snitem__switch", toggle(question.required, `Frage ${index + 1} ist Pflicht`, (on) => {
                        question.required = on;
                        touch();
                    }), el("span", "", "Pflicht"))
                )
            ),
            el("div", "apquestion__side", up, remove)
        );
    }

    function addQuestion(draft: IForm, touch: () => void, redraw: () => void): HTMLElement {
        const add = button("btn btn--quiet", icon("#i-plus"), "Frage hinzufügen");

        add.disabled = draft.questions.length >= data!.limits.questions;
        add.addEventListener("click", () => {
            const taken = new Set(draft.questions.map((question) => question.id));
            let id = `q${draft.questions.length + 1}`;

            for (let index = 1; taken.has(id); index++) id = `q${draft.questions.length + index + 1}`;

            draft.questions.push({ id, label: "", hint: "", kind: "short", choices: [], required: true, max: 200 });
            touch();
            redraw();
        });

        return el("div", "apquestion apquestion--add", add);
    }

    function formSettings(draft: IForm, touch: () => void): HTMLElement[] {
        const channels: [string, string][] = [["", "— Kanal des Moduls —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])];
        const roles: [string, string][] = [["", "— keine —"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@${role.name}`])];

        return [
            row(
                "Kanal für die Karten",
                "Leer: der Kanal aus den Einstellungen",
                select(channels, draft.settings.channelId ?? "", (value) => {
                    draft.settings.channelId = value || null;
                    touch();
                }, "Kanal für dieses Formular")
            ),
            row(
                "Rolle bei Annahme",
                "Bekommt, wer angenommen wird",
                select(roles, draft.settings.acceptRole ?? "", (value) => {
                    draft.settings.acceptRole = value || null;
                    touch();
                }, "Rolle bei Annahme")
            ),
            row(
                "Wer wird gepingt",
                "Bei jeder neuen Bewerbung",
                rolePicker(data!.guild.roles, draft.settings.pingRoles, (ids) => {
                    draft.settings.pingRoles = ids;
                    touch();
                }, [], 5)
            ),
            row(
                "Voraussetzung",
                "Ohne diese Rolle geht das Formular nicht",
                select(roles, draft.settings.requireRole ?? "", (value) => {
                    draft.settings.requireRole = value || null;
                    touch();
                }, "Voraussetzung")
            ),
            row(
                "Pause nach einer Absage",
                "So lange geht es nicht noch einmal",
                select(
                    DAYS.map(([value, label]): [string, string] => [String(value), label]),
                    String(draft.settings.cooldownDays),
                    (value) => {
                        draft.settings.cooldownDays = Number(value);
                        touch();
                    },
                    "Pause nach einer Absage"
                )
            ),
            row(
                "Mindestalter des Kontos",
                "Hilft gegen frisch angelegte Konten",
                select(
                    AGE.map(([value, label]): [string, string] => [String(value), label]),
                    String(draft.settings.minAccountDays),
                    (value) => {
                        draft.settings.minAccountDays = Number(value);
                        touch();
                    },
                    "Mindestalter des Kontos"
                )
            ),
            row(
                "Antwort als DM",
                "Der Bewerber erfährt die Entscheidung",
                el("label", "snitem__switch", toggle(draft.settings.dm, "Antwort als DM", (on) => {
                    draft.settings.dm = on;
                    touch();
                }), el("span", "", "schicken"))
            ),
        ];
    }

    /* ------------------------------------------------------------
       Einstellungen
       ------------------------------------------------------------ */
    function settings(): HTMLElement[] {
        const draft = structuredClone(data!.settings);
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const send = button("btn btn--quiet", icon("#i-discord"), "Panel senden");
        const later = el("i", "apsavefirst", "Erst speichern");
        const touch = (): void => {
            save.disabled = false;
            // Gesendet wird mit dem gespeicherten Stand: erst speichern, dann senden.
            send.disabled = true;
            later.hidden = false;
        };

        later.hidden = true;

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const answer = await call<{ warning: string | null }>("", { action: "settings", settings: draft });

            if (!answer) {
                save.disabled = false;

                return;
            }

            toast("info", answer.warning ? "Gespeichert, aber …" : "Gespeichert", answer.warning ?? "Gilt ab sofort.");
            void reload();
        });

        const users = el("div", "tkchips");
        const drawUsers = (): void => {
            users.replaceChildren(
                ...draft.reviewUsers.map((id) => {
                    const remove = button("", icon("#i-x"));

                    remove.setAttribute("aria-label", `${id} von der Liste nehmen`);
                    remove.addEventListener("click", () => {
                        draft.reviewUsers = draft.reviewUsers.filter((entry) => entry !== id);
                        touch();
                        drawUsers();
                    });

                    return el("span", "tkchip", el("code", "mcid", id), remove);
                }),
                personPicker(call, null, (person: IPerson | null) => {
                    if (!person || draft.reviewUsers.includes(person.id) || draft.reviewUsers.length >= data!.limits.reviewers) return;

                    draft.reviewUsers = [...draft.reviewUsers, person.id];
                    touch();
                    drawUsers();
                }, "Mitglied suchen: Name oder ID …")
            );
        };

        drawUsers();

        const link = el("input", "text");

        link.type = "text";
        link.value = data!.link;
        link.readOnly = true;
        link.setAttribute("aria-label", "Öffentlicher Link");

        const copy = button("btn btn--quiet", icon("#i-copy"), "Kopieren");

        const longNote = el("p", "aplong");
        const drawNote = (): void => {
            const hits = data!.forms
                .filter((form) => form.open)
                .map((form): [string, number] => [form.name, form.questions.filter((question) => question.label.length > MODAL_LABEL).length])
                .filter(([, count]) => count > 0);

            longNote.hidden = draft.mode !== "modal" || hits.length === 0;
            longNote.textContent =
                "Im Fenster darf eine Beschriftung höchstens 45 Zeichen haben. Längere Fragen stehen dort gekürzt, der ganze Satz steht darunter. Betrifft gerade " +
                hits.map(([name, count], index) => `${index === 0 ? (count === 1 ? "1 Frage" : `${count} Fragen`) : count} in „${name}“`).join(" und ") +
                ".";
        };
        const ways = radioTiles(MODES, draft.mode, "Wo man sich bewirbt", (value) => {
            draft.mode = value;
            drawNote();
            touch();
        });

        drawNote();

        // Plan 30: Wo die Karte landet. Die Zeilen zum eigenen Kanal stehen nur da, wenn er gewählt ist.
        const sharedPick = select(
            [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            draft.channelId ?? "",
            (value) => {
                draft.channelId = value || null;
                touch();
            },
            "Sammelkanal"
        );
        const categoryPick = select(
            [["", "— keine Kategorie —"], ...data!.guild.categories.map((entry): [string, string] => [entry.id, entry.name])],
            draft.categoryId ?? "",
            (value) => {
                draft.categoryId = value || null;
                touch();
            },
            "Kategorie für die Kanäle"
        );
        const nameField = el("input", "text");

        nameField.type = "text";
        nameField.maxLength = 100;
        nameField.value = draft.channelName;
        nameField.setAttribute("aria-label", "Name des Kanals");
        nameField.addEventListener("input", () => {
            draft.channelName = nameField.value;
            touch();
        });

        const deleteNote = el("p", "aplong");
        const drawDeleteNote = (): void => {
            const silent = data!.forms.filter((form) => !form.settings.dm).map((form) => `„${form.name}“`);

            deleteNote.hidden = draft.afterDecision !== "delete" || silent.length === 0;
            deleteNote.textContent = `Bei ${silent.join(" und ")} ist die Nachricht an den Bewerber aus. Wird der Kanal gelöscht, erfährt die Person nichts von der Entscheidung.`;
        };
        const afterTiles = radioTiles(AFTERS, draft.afterDecision, "Nach der Entscheidung", (value) => {
            draft.afterDecision = value;
            drawDeleteNote();
            touch();
        });
        const targetRows = el("div");
        const drawTarget = (): void => {
            const own = draft.target === "channel";

            targetRows.replaceChildren(
                ...(own
                    ? [
                          row("Kategorie", "Hier entstehen die Kanäle", categoryPick),
                          row("Kanalname", "{user}, {nummer} und {formular} gehen", nameField),
                          el("span", "apopen__label", "Nach der Entscheidung"),
                          afterTiles,
                          deleteNote,
                      ]
                    : []),
                row("Sammelkanal", own ? "Nur, wenn ein Kanal nicht angelegt werden kann. Formulare dürfen einen eigenen haben" : "Formulare dürfen einen eigenen haben", sharedPick)
            );
        };
        const targets = radioTiles(TARGETS, draft.target, "Wo die Karte landet", (value) => {
            draft.target = value;
            drawTarget();
            touch();
        });

        drawDeleteNote();
        drawTarget();

        // Das Panel: Kanal wählen und sofort senden, wie beim Ticket-Panel.
        const { channelId: panelChannel, messageId: panelMessage } = data!.settings.panel;
        let target = panelChannel ?? draft.channelId ?? data!.guild.channels[0]?.id ?? "";
        const panelPick = select(
            data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`]),
            target,
            (value) => {
                target = value;
            },
            "Kanal fürs Panel"
        );
        const placed = panelChannel && panelMessage ? data!.guild.channels.find((entry) => entry.id === panelChannel) : undefined;
        const panelState = el("span", "apstate");

        if (placed && panelMessage) {
            const open = el("a", "", `#${placed.name}`);

            open.href = `https://discord.com/channels/${encodeURIComponent(guildId)}/${placed.id}/${panelMessage}`;
            open.target = "_blank";
            open.rel = "noopener";
            panelState.classList.add("is-ok");
            panelState.append("liegt in ", open, `, gesendet am ${sentOn(panelMessage)}`);
        } else {
            panelState.textContent = "Noch kein Panel. Ohne Panel geht es nur mit /bewerben.";
        }

        send.addEventListener("click", async () => {
            if (!target) return;

            send.disabled = true;

            const answer = await call<{ ok: boolean; url: string }>("", { action: "panel", channelId: target });

            send.disabled = false;

            if (!answer) return;

            toast("info", "Panel gesendet", "Es liegt jetzt im Kanal.");
            void reload();
        });

        copy.addEventListener("click", async () => {
            await navigator.clipboard.writeText(data!.link).catch(() => undefined);
            toast("info", "Kopiert", "Der Link steht in der Zwischenablage.");
        });

        return [
            card(
                "Wer Bewerbungen sieht",
                "Diese Rollen und Personen kommen an die Bewerbungen – im Dashboard und an den Karten in Discord. Wer den Server verwaltet, darf immer.",
                row(
                    "Rollen",
                    `Bis zu ${data!.limits.reviewers}`,
                    rolePicker(data!.guild.roles, draft.reviewRoles, (ids) => {
                        draft.reviewRoles = ids;
                        touch();
                    }, [], data!.limits.reviewers)
                ),
                row("Einzelne Personen", "Für alle, die keine passende Rolle haben", users)
            ),
            card(
                "Wo man sich bewirbt",
                "Gilt für alle Formulare. Kontoalter, Voraussetzung und Pause nach Absage prüft RL Nexus überall gleich.",
                el("span", "apopen__label", "Art"),
                ways,
                row("Panel", "Die Nachricht mit den Knöpfen", el("div", "aplink", panelPick, send, later, panelState)),
                row(
                    "Bewerbungen annehmen",
                    "Aus heißt: Panel und Seite sagen, dass gerade niemand gesucht wird",
                    el("label", "snitem__switch", toggle(draft.open, "Bewerbungen annehmen", (on) => {
                        draft.open = on;
                        touch();
                    }), el("span", "", "an"))
                ),
                row("Öffentlicher Link", "Bei Fenster und DM sagt die Seite, wo man sich bewirbt", el("div", "aplink", link, copy)),
                longNote
            ),
            card(
                "Wo die Karte landet",
                "Wer die Bewerbung sieht, entscheidet sich hier. Im eigenen Kanal sehen sie nur die Person selbst und die Prüfer.",
                el("span", "apopen__label", "Art"),
                targets,
                targetRows
            ),
            el("div", "mcsave lvsave", save),
        ];
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        if (view === "inbox") {
            host.replaceChildren(head(), inbox());

            return;
        }

        host.replaceChildren(head(), tabs(), ...(tab === "forms" ? forms() : settings()));
    }

    loading(host, 4);

    void reload();
}
