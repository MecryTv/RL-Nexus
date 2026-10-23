/**
 * Die öffentliche Bewerbungsseite eines Servers - /bewerben/<id>.
 *
 * Erst die Auswahl: wofür will jemand sich bewerben. Danach das Formular mit
 * den Fragen des Servers. Lesen geht ohne Anmeldung, Abschicken nicht - der
 * Bot muss wissen, wer sich bewirbt.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { button, el } from "../core/Ui.js";

interface IQuestion {
    id: string;
    label: string;
    hint: string;
    kind: "short" | "long" | "choice";
    choices: string[];
    required: boolean;
    max: number;
}

interface IForm {
    id: number;
    name: string;
    description: string;
    emoji: string | null;
    questions: IQuestion[];
}

interface IPayload {
    guild: { id: string; name: string; icon: string | null };
    me: { id: string; member: boolean } | null;
    forms: IForm[];
}

/** Anmelden und danach wieder auf dieser Seite landen. */
function login(): string {
    return `${BASE}/login?return=${encodeURIComponent(window.location.pathname)}`;
}

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

export async function renderApplyPage(): Promise<void> {
    const host = need<HTMLElement>("#apply");
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    const response = await fetch(`${BASE}/api/public/apply/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } }).catch(() => null);

    if (!response?.ok) {
        host.replaceChildren(
            empty(
                "Hier kann man sich gerade nicht bewerben",
                response?.status === 404
                    ? "Entweder ist das Apply System auf diesem Server aus, oder es ist gerade kein Formular offen."
                    : "Der Bot antwortet gerade nicht. Lade die Seite in einem Moment neu."
            )
        );

        return;
    }

    const data = (await response.json()) as IPayload;
    let open: IForm | null = data.forms.length === 1 ? data.forms[0] : null;

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function header(): HTMLElement {
        const crest = el("span", "aphead__crest");

        if (data.guild.icon) crest.style.backgroundImage = `url("${data.guild.icon.replace(/["\\]/g, "")}")`;
        else crest.textContent = data.guild.name.slice(0, 1).toUpperCase();

        return el(
            "div",
            "aphead",
            crest,
            el("div", "aphead__text", el("h1", "", data.guild.name), el("p", "", data.forms.length === 1 ? "Eine offene Stelle" : `${data.forms.length} offene Stellen`))
        );
    }

    /* ------------------------------------------------------------
       Auswahl
       ------------------------------------------------------------ */
    function choice(): HTMLElement {
        return el(
            "div",
            "apcards",
            ...data.forms.map((form) => {
                const pick = button(
                    "apcard",
                    el("span", "apcard__mark", form.emoji ? el("span", "", form.emoji) : icon("#i-clipboard")),
                    el(
                        "span",
                        "apcard__text",
                        el("b", "", form.name),
                        el("span", "", form.description || `${form.questions.length} Frage(n)`)
                    ),
                    icon("#i-arrow")
                );

                pick.addEventListener("click", () => {
                    open = form;
                    paint();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                });

                return pick;
            })
        );
    }

    /* ------------------------------------------------------------
       Das Formular
       ------------------------------------------------------------ */
    function sheet(form: IForm): HTMLElement {
        const fields = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
        const box = el("form", "apform");
        // Wer nicht angemeldet ist, kann nichts abschicken - dann fuehrt derselbe
        // Knopf erst zur Anmeldung und danach hierher zurueck.
        const signIn = !data.me;
        const send = button(
            "btn btn--primary",
            icon(signIn ? "#i-discord" : "#i-check"),
            signIn ? "Mit Discord anmelden" : "Bewerbung abschicken"
        ) as HTMLButtonElement;

        send.type = signIn ? "button" : "submit";

        if (signIn) send.addEventListener("click", () => (window.location.href = login()));

        for (const question of form.questions) {
            let field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

            if (question.kind === "long") {
                field = el("textarea", "text tkarea");
                (field as HTMLTextAreaElement).rows = 5;
                (field as HTMLTextAreaElement).maxLength = question.max;
            } else if (question.kind === "choice") {
                field = el("select", "pick");
                field.append(new Option("— bitte wählen —", ""));

                for (const one of question.choices) field.append(new Option(one, one));
            } else {
                field = el("input", "text");
                (field as HTMLInputElement).type = "text";
                (field as HTMLInputElement).maxLength = question.max;
            }

            field.id = `frage-${question.id}`;
            if (question.required) field.required = true;

            fields.set(question.id, field);

            const label = el("label", "apfield__label", question.label);

            label.setAttribute("for", field.id);

            box.append(
                el(
                    "div",
                    "apfield",
                    label,
                    ...(question.hint ? [el("p", "apfield__hint", question.hint)] : []),
                    field,
                    ...(question.required ? [] : [el("p", "apfield__hint", "Freiwillig")])
                )
            );
        }

        box.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!data.me) {
                window.location.href = login();

                return;
            }

            const answers: Record<string, string> = {};

            for (const [key, field] of fields) answers[key] = field.value.trim();

            send.disabled = true;

            const answer = await fetch(`${BASE}/api/public/apply/${encodeURIComponent(id)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ formId: form.id, answers }),
            }).catch(() => null);

            const body = (await answer?.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string };

            send.disabled = false;

            if (!answer?.ok) {
                toast("info", "Nicht abgeschickt", body.error ?? "Der Bot antwortet gerade nicht.");

                return;
            }

            host.replaceChildren(
                header(),
                el(
                    "div",
                    "tkempty tkempty--big",
                    icon("#i-check"),
                    el("b", "", "Abgeschickt"),
                    el("span", "", `Deine Bewerbung als ${form.name} liegt beim Team (#${body.id}). Die Antwort kommt als Nachricht von RL Nexus.`)
                )
            );
        });

        const back = button("btn btn--quiet", icon("#i-arrow"), "Andere Stelle wählen");

        back.addEventListener("click", () => {
            open = null;
            paint();
        });

        box.append(
            el(
                "div",
                "apform__foot",
                send,
                ...(data.forms.length > 1 ? [back] : [])
            )
        );

        return el(
            "div",
            "apsheet",
            el("div", "apsheet__head", el("h2", "", `${form.emoji ? `${form.emoji} ` : ""}${form.name}`), ...(form.description ? [el("p", "", form.description)] : [])),
            ...(data.me ? [] : [el("div", "notice", icon("#i-warn"), el("span", "", "Zum Abschicken meldest du dich mit Discord an – der Server muss wissen, wer sich bewirbt."))]),
            ...(data.me && !data.me.member ? [el("div", "notice", icon("#i-warn"), el("span", "", "Du bist auf diesem Server noch kein Mitglied. Tritt ihm erst bei."))] : []),
            box
        );
    }

    function paint(): void {
        host.replaceChildren(header(), open ? sheet(open) : choice());
    }

    paint();
}
