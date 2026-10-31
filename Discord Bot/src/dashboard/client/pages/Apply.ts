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
    mode: "web";
    panel: IPanel | null;
    me: { id: string; member: boolean } | null;
    forms: IForm[];
}

/** Bei Fenster und DM (Plan 24): keine Fragen, nur wie viele es sind. */
interface IDiscordPayload {
    guild: { id: string; name: string; icon: string | null };
    mode: "modal" | "dm";
    panel: IPanel | null;
    forms: (Omit<IForm, "questions"> & { questions: number })[];
}

interface IPanel {
    channelId: string;
    name: string;
    url: string;
}

/** Anmelden und danach wieder auf dieser Seite landen. */
function login(): string {
    return `${BASE}/login?return=${encodeURIComponent(window.location.pathname)}`;
}

function empty(title: string, text: string): HTMLElement {
    return el("div", "tkempty tkempty--big", icon("#i-warn"), el("b", "", title), el("span", "", text));
}

function questions(count: number): string {
    return count === 1 ? "1 Frage" : `${count} Fragen`;
}

/** Kopf: Wappen, Name und wie viele Stellen offen sind. */
function head(data: IPayload | IDiscordPayload): HTMLElement {
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

/**
 * Bewirbt man sich auf diesem Server in Discord, nimmt die Seite nichts an.
 * Sie sagt, wo es langgeht: Kanal, Direktlink, /bewerben, die offenen Stellen.
 */
function discord(data: IDiscordPayload): HTMLElement {
    const dm = data.mode === "dm";
    const command = (): HTMLElement => el("code", "", "/bewerben");
    const steps: (Node | string)[][] = data.panel
        ? [
              ["Geh in den Kanal ", el("b", "", `#${data.panel.name}`), "."],
              dm
                  ? ["Klick beim passenden Formular auf ", el("b", "", "Bewerben"), ". RL Nexus schreibt dir eine DM und stellt dir dort die Fragen."]
                  : ["Klick beim passenden Formular auf ", el("b", "", "Bewerben"), ". Es öffnet sich ein Fenster mit den Fragen."],
              ["Kein Panel zu sehen? Tipp ", command(), " in irgendeinen Kanal des Servers."],
          ]
        : [["Tipp ", command(), " in irgendeinen Kanal des Servers."]];
    const go = el("a", "btn btn--primary apgo", icon("#i-discord"), `#${data.panel?.name ?? ""} in Discord öffnen →`);

    if (data.panel) {
        go.href = data.panel.url;
        go.target = "_blank";
        go.rel = "noopener";
    }

    return el(
        "div",
        "apdiscord-page",
        el(
            "div",
            "apdiscord",
            el("h2", "", "Bewerbungen laufen bei uns in Discord"),
            el(
                "p",
                "",
                dm
                    ? "Hier auf der Seite geht es nicht. Du bewirbst dich auf dem Server, RL Nexus stellt dir die Fragen per DM."
                    : "Hier auf der Seite geht es nicht. Du bewirbst dich direkt auf dem Server, in einem Fenster in Discord."
            ),
            el("ol", "apsteps", ...steps.map((parts) => el("li", "", el("span", "", ...parts)))),
            ...(data.panel ? [go] : []),
            el("p", "apfine", data.panel ? "Der Link klappt, wenn du schon auf dem Server bist. Die Antwort vom Team kommt per DM." : "Die Antwort vom Team kommt per DM.")
        ),
        el(
            "div",
            "apopen",
            el("span", "apopen__label", "Gerade offen"),
            el(
                "div",
                "apopen__list",
                ...data.forms.map((form) =>
                    el(
                        "div",
                        "apopen__item",
                        el("span", "apopen__mark", form.emoji ?? icon("#i-clipboard")),
                        el("div", "apopen__text", el("b", "", form.name), ...(form.description ? [el("span", "", form.description)] : [])),
                        el("span", "apopen__n", questions(form.questions))
                    )
                )
            )
        )
    );
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

    const payload = (await response.json()) as IPayload | IDiscordPayload;

    if (payload.mode !== "web") {
        host.replaceChildren(head(payload), discord(payload));

        return;
    }

    const data = payload;
    // Aus dem Panel: ?formular=<id> öffnet dieses Formular direkt, wenn es offen ist.
    const wanted = Number(new URLSearchParams(window.location.search).get("formular"));
    let open: IForm | null = data.forms.find((form) => form.id === wanted) ?? (data.forms.length === 1 ? data.forms[0] : null);

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
                head(data),
                el(
                    "div",
                    "tkempty tkempty--big",
                    icon("#i-check"),
                    el("b", "", "Abgeschickt"),
                    // Derselbe Satz wie RECEIVED im Bot (constants/Apply.ts) - der Client importiert keine Bot-Konstanten.
                    el("span", "", "Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.")
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
        host.replaceChildren(head(data), open ? sheet(open) : choice());
    }

    paint();
}
