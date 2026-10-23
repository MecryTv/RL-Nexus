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
import { api, button, card, confirmButton, el, IPerson, IRole, loading, personPicker, rolePicker, row, select, stat, toggle, WHEN } from "../core/Ui.js";

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

interface ISettings {
    reviewRoles: string[];
    reviewUsers: string[];
    channelId: string | null;
    open: boolean;
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
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[] };
}

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
            stat("#i-link", "Öffentlicher Link", data!.settings.open ? "an" : "aus", data!.settings.open ? "is-ok" : "")
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
        const touch = (): void => {
            save.disabled = false;
        };

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: draft }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Gilt ab sofort.");
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
                "Kanal und Link",
                "Wohin neue Bewerbungen gehen und unter welcher Adresse man sich bewirbt.",
                row(
                    "Kanal für die Karten",
                    "Formulare dürfen einen eigenen haben",
                    select(
                        [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
                        draft.channelId ?? "",
                        (value) => {
                            draft.channelId = value || null;
                            touch();
                        },
                        "Kanal für Bewerbungen"
                    )
                ),
                row(
                    "Öffentlicher Link",
                    "Aus heißt: die Seite sagt, dass gerade niemand gesucht wird",
                    el("label", "snitem__switch", toggle(draft.open, "Öffentlichen Link anschalten", (on) => {
                        draft.open = on;
                        touch();
                    }), el("span", "", "offen"))
                ),
                row("Adresse", "Die kann jeder aufrufen – ausgefüllt wird sie angemeldet", el("div", "aplink", link, copy))
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
