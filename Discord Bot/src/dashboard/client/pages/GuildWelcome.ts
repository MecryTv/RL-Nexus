/**
 * Abschnitt: Welcome System.
 *
 * Zwei Reiter: Begrüßung und Abschied. Je Reiter die Art (gezeichnete Karte,
 * Karte im Components-V2-Stil, Embed oder normale Nachricht), der Inhalt mit
 * Live-Vorschau und ein Test-Knopf. Darunter die Auto-Rollen.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, el, IRole, loading, rolePicker, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, ICustomStage, ICustomStageTools, IEmbed } from "../layout/BodyEditor.js";
import { IEditorContext, IMessageDoc } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import { galleryUrl, loadGallery, pickImage } from "../layout/ImagePicker.js";
import { cardStage, IStageView } from "../layout/CardStage.js";
import { WELCOME_PLACEHOLDERS } from "../constants/Placeholders.js";
import { IWelcomePositions, WelcomePart } from "../../../interfaces/services/welcome/IWelcome.js";

type Which = "join" | "leave";

interface ICard {
    background: string | null;
    accent: string;
    accentOn: boolean;
    dim: number;
    layout: string;
    title: string;
    subtitle: string;
    footer: string;
    font: string;
    titleSize: number;
    titleColor: string;
    subtitleColor: string;
    /** null: die kleine Zeile folgt dem Akzent. */
    footerColor: string | null;
    avatar: boolean;
    avatarSize: number;
    ringWidth: number;
    avatarShape: "circle" | "bevel";
    count: boolean;
    icon: boolean;
    date: boolean;
    /** Eigene Anordnung der fünf Teile. null: die Plätze des Layouts. */
    positions: IWelcomePositions | null;
}

interface IMessage extends IBody {
    on: boolean;
    channelId: string | null;
    card: ICard;
}

interface IConfig {
    join: IMessage;
    leave: IMessage;
    roles: string[];
    botRoles: string[];
}

interface IPayload {
    config: IConfig;
    defaults: Record<Which, { doc: IMessageDoc; card: ICard }>;
    placeholders: string[];
    kinds: Record<string, string>;
    limits: { roles: number; titleMin: number; titleMax: number; avatarMin: number; avatarMax: number; ringMax: number };
    layouts: Record<string, string>;
    fonts: Record<string, string>;
    background: { width: number; height: number; minWidth: number; minHeight: number; maxMegabytes: number };
    ready: { members: boolean };
    guild: { name: string; icon: string | null; roles: IRole[]; channels: { id: string; name: string }[]; emojis: IServerEmoji[] };
}

const EMPTY_EMBED: IEmbed = {
    title: "Willkommen!",
    description: "Schön, dass du da bist.",
    color: "#00afff",
    url: null,
    image: null,
    thumbnail: null,
    author: null,
    footer: null,
    timestamp: false,
    fields: [],
};

export function renderWelcome(guildId: string): void {
    const host = need<HTMLElement>("#welcomeBody");
    const note = need<HTMLElement>("#welcomeNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/welcome`, note);

    let data: IPayload | null = null;
    let draft: IConfig | null = null;
    let which: Which = "join";
    let dirty = false;

    const save = el("button", "btn btn--primary") as HTMLButtonElement;

    function touch(): void {
        dirty = true;
        save.disabled = false;
    }

    const context = (): IEditorContext => ({
        guildId,
        values: Object.fromEntries(WELCOME_PLACEHOLDERS.map((entry) => [entry.key, entry.sample])),
        roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
        channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
        emojis: data!.guild.emojis,
        onChange: () => undefined,
    });

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const join = draft!.join;
        const leave = draft!.leave;
        const channel = (message: IMessage): string => {
            const entry = message.channelId ? data!.guild.channels.find((item) => item.id === message.channelId) : null;

            return message.on ? (entry ? `# ${entry.name}` : "kein Kanal") : "aus";
        };

        return el(
            "div",
            "tkhead snhead",
            stat("#i-wave", "Begrüßung", channel(join), join.on && join.channelId ? "is-ok" : ""),
            stat("#i-logout", "Abschied", channel(leave), leave.on && leave.channelId ? "is-ok" : ""),
            stat("#i-badge", "Auto-Rollen", `${draft!.roles.length + draft!.botRoles.length} / ${data!.limits.roles * 2}`),
            stat("#i-image", "Art", data!.kinds[draft![which].kind] ?? draft![which].kind)
        );
    }

    function tabs(): HTMLElement {
        const box = el("div", "seg plkinds");

        box.setAttribute("role", "group");
        box.setAttribute("aria-label", "Begrüßung oder Abschied bearbeiten");

        for (const [value, label] of [["join", "Begrüßung"], ["leave", "Abschied"]] as [Which, string][]) {
            const entry = button("", label);

            entry.setAttribute("aria-pressed", String(which === value));
            entry.addEventListener("click", () => {
                which = value;
                paint();
            });
            box.append(entry);
        }

        return box;
    }

    /* ------------------------------------------------------------
       Die Nachricht
       ------------------------------------------------------------ */
    function message(): HTMLElement {
        const current = draft![which];
        const channel = select(
            [["", "— Kanal wählen —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            current.channelId ?? "",
            (value) => {
                current.channelId = value || null;
                touch();
            },
            which === "join" ? "Kanal für die Begrüßung" : "Kanal für den Abschied"
        );

        const editor = bodyEditor(current, {
            pageSave: () => save,
            kinds: data!.kinds,
            context,
            defaultEmbed: () => structuredClone(EMPTY_EMBED),
            touch,
            title: "Inhalt",
            templates: which === "join" ? "welcomeJoin" : "welcomeLeave",
            // Plan 42: die Begrüßungskarte als Bühne im Studio - Fächer, Karte mit Griffen, gewähltes Teil.
            custom: { kind: "card", stage: (tools) => cardStudio(current, tools) },
            // Plan 39: „Test senden“ steht in der Leiste des Studios.
            test: async () => {
                if (dirty) {
                    toast("info", "Erst speichern", "Der Test schickt, was gespeichert ist.");

                    return;
                }

                if (await call("", { action: "test", which })) toast("info", "Test gesendet", "Schau in den Kanal – so sieht es für neue Mitglieder aus.");
            },
        });

        return card(
            which === "join" ? "Begrüßung" : "Abschied",
            which === "join"
                ? "Was passiert, wenn jemand den Server betritt. Die Platzhalter setzt der Bot beim Senden ein."
                : "Was passiert, wenn jemand geht. Wer gebannt wird, zählt dabei mit.",
            row(
                which === "join" ? "Begrüßen" : "Verabschieden",
                "Aus heißt: der Bot sagt nichts",
                el("label", "snitem__switch", toggle(current.on, which === "join" ? "Begrüßung an" : "Abschied an", (on) => {
                    current.on = on;
                    touch();
                    paint();
                }), el("span", "", current.on ? "an" : "aus"))
            ),
            row("Kanal", "Wohin die Nachricht geht", channel),
            placeholderHint(),
            editor.node
        );
    }

    /** Die Platzhalter zum Nachlesen - ein Klick kopiert sie. */
    function placeholderHint(): HTMLElement {
        const chips = el("div", "phhint__list");

        for (const entry of WELCOME_PLACEHOLDERS) {
            const key = `{${entry.key}}`;
            const chip = button("phchip", el("code", "", key), el("span", "phchip__label", entry.label));

            chip.title = `${entry.label} – Beispiel: ${entry.sample}`;
            chip.addEventListener("click", async () => {
                await navigator.clipboard.writeText(key).catch(() => undefined);
                toast("info", "Kopiert", `${key} steht in der Zwischenablage.`);
            });
            chips.append(chip);
        }

        return el("div", "phhint", el("p", "hintline phhint__lead", "Diese Platzhalter kennt der Bot – in den Texten und auf der Karte:"), chips);
    }

    /* ------------------------------------------------------------
       Die gezeichnete Karte
       ------------------------------------------------------------ */
    let pending = 0;

    const PART_NAMES: Record<WelcomePart, string> = { avatar: "Avatar", icon: "Server-Icon", title: "Überschrift", subtitle: "Unterzeile", footer: "Kleine Zeile" };

    /**
     * Plan 42: die Begrüßungskarte im Studio. Links Layouts, Teile, Hintergrund
     * und Stil, in der Mitte die Bühne, rechts das gewählte Teil. Jede Änderung
     * meldet sich vorher bei tools.remember - so umfasst Rückgängig die Karte.
     */
    function cardStudio(current: IMessage, tools: ICustomStageTools): ICustomStage {
        const entry = current.card;
        // Gezeichnet wird beim Bot. Erst nach einer kurzen Pause, sonst ginge
        // bei jedem getippten Zeichen eine neue Karte hin und her.
        // what sagt, was die Bühne braucht: "stage" kam von ihr selbst, "paint"
        // zeichnet sie gleich selbst (Farben, Ring, Form), "bare" braucht die
        // nackte Karte neu (Hintergrund, Akzent, Layout, Zeilen, Größen).
        const later = (what: "stage" | "paint" | "bare" = "bare"): void => {
            touch();
            stageDirty ||= what === "bare";

            if (what !== "stage" && view) stage.show(view);

            window.clearTimeout(pending);
            pending = window.setTimeout(() => {
                if (stageDirty) void fetchStage();

                stageDirty = false;
            }, 320);
        };

        /** Erst merken, dann ändern, dann zeichnen. */
        const edit = (key: string, apply: () => void, what: "paint" | "bare" = "bare"): void => {
            tools.remember(key);
            apply();
            later(what);
        };

        /*
         * Die Bühne braucht die nackte Karte (Hintergrund und Verzierung), die
         * fertigen Zeilen und die Plätze des Layouts. Neu geholt wird nur, wenn
         * sich davon etwas ändert, beim Ziehen und bei Farben nie.
         */
        let view: IStageView | null = null;
        let stageDirty = false;
        let ticket = 0;

        const fetchStage = async (): Promise<void> => {
            const mine = ++ticket;
            const answer = await call<Pick<IStageView, "image" | "parts" | "layout">>("", { action: "preview", which, message: current, bare: true });

            // Kam inzwischen eine neuere Antwort, gilt die.
            if (!answer || mine !== ticket) return;

            view = { image: answer.image, parts: answer.parts, layout: answer.layout, card: entry };
            stage.show(view);
        };

        const stage = cardStage({
            onBefore: (key) => tools.remember(key),
            onSelect: () => tools.repaint(),
            onChange(state) {
                const relayout = state.layout !== entry.layout;
                const wasOwn = entry.positions !== null;

                entry.positions = state.positions;

                if (relayout) entry.layout = state.layout;

                // Eigene Anordnung an oder aus: die Größenfelder im Inspektor gehen an oder aus.
                // Review Plan 42: die Felder der Position ziehen dabei nur um - wer darin war, bleibt dort.
                if (wasOwn !== (entry.positions !== null)) {
                    const active = document.activeElement;

                    tools.repaint();

                    if (active instanceof HTMLElement && stage.fields.contains(active)) active.focus();
                }

                later(relayout ? "bare" : "stage");
            },
        });

        const colorInput = (value: string, label: string, onChange: (value: string) => void, what: "paint" | "bare" = "paint"): HTMLInputElement => {
            const input = el("input", "tkcolor");

            input.type = "color";
            input.value = value;
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => edit(label, () => onChange(input.value), what));

            return input;
        };

        const text = (label: string, value: string, onChange: (value: string) => void): HTMLInputElement => {
            const field = el("input", "text");

            field.type = "text";
            field.value = value;
            field.maxLength = 120;
            field.setAttribute("aria-label", label);
            field.addEventListener("input", () => edit(label, () => onChange(field.value)));

            return field;
        };

        const range = (value: number, min: number, max: number, step: number, label: string, unit: string, onChange: (value: number) => void, what: "paint" | "bare" = "bare"): HTMLElement => {
            const input = el("input", "wcrange");
            const shown = el("span", "wcrange__value", `${value}${unit}`);

            input.type = "range";
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                edit(label, () => onChange(Number(input.value)), what);
                shown.textContent = `${input.value}${unit}`;
            });

            return el("div", "wcrange__box", input, shown);
        };

        const switchRow = (label: string, hint: string, value: boolean, onChange: (on: boolean) => void): HTMLElement =>
            row(label, hint, el("label", "snitem__switch", toggle(value, label, (on) => edit("", () => onChange(on))), el("span", "", "an")));

        /* --- Eigene Anordnung: Größe der Überschrift und des Avatars stehen dann auf der Bühne --- */
        const SIZE_HINT = `${data!.limits.titleMin} bis ${data!.limits.titleMax} Pixel – lange Namen werden von selbst kleiner`;
        const AVATAR_HINT = "Im Layout Mittig und Panel etwas kleiner, damit der Text Platz hat";
        const OWN_HINT = "Gilt nur ohne eigene Anordnung – sonst über „Größe“ unter Position";

        const group = (title: string, ...children: Node[]): HTMLElement => el("section", "sto-group sto-rows", el("h3", "sto-h", title), ...children);

        /** Was nur das gewählte Teil hat. */
        const partRows = (part: WelcomePart): HTMLElement[] => {
            const own = entry.positions !== null;

            if (part === "title") {
                const size = el("input", "text gwnum");

                size.type = "number";
                size.min = String(data!.limits.titleMin);
                size.max = String(data!.limits.titleMax);
                size.value = String(entry.titleSize);
                size.disabled = own;
                size.setAttribute("aria-label", "Schriftgröße der Überschrift");
                size.addEventListener("input", () => edit("titleSize", () => (entry.titleSize = Math.max(data!.limits.titleMin, Math.min(data!.limits.titleMax, Number(size.value) || 48)))));

                return [row("Überschrift", "Die große Zeile", text("Überschrift", entry.title, (value) => (entry.title = value))), row("Schriftgröße", own ? OWN_HINT : SIZE_HINT, size)];
            }

            if (part === "subtitle") return [row("Unterzeile", "Die Zeile darunter", text("Unterzeile", entry.subtitle, (value) => (entry.subtitle = value)))];

            if (part === "footer") {
                return [
                    row("Kleine Zeile", "Ganz unten", text("Kleine Zeile", entry.footer, (value) => (entry.footer = value))),
                    switchRow("Beitrittsdatum", "Hängt hinten an der kleinen Zeile", entry.date, (on) => (entry.date = on)),
                ];
            }

            if (part === "icon") return [switchRow("Server-Icon", "Oben rechts auf der Karte", entry.icon, (on) => (entry.icon = on))];

            const avatarRange = range(entry.avatarSize, data!.limits.avatarMin, data!.limits.avatarMax, 4, "Größe des Avatars", " px", (value) => (entry.avatarSize = value));

            avatarRange.querySelector("input")!.disabled = own;

            return [switchRow("Avatar", "Das Bild des Mitglieds", entry.avatar, (on) => (entry.avatar = on)), row("Größe", own ? OWN_HINT : AVATAR_HINT, avatarRange)];
        };

        const content = el("textarea", "text tkarea");

        content.rows = 2;
        content.maxLength = 2000;
        content.setAttribute("aria-label", "Text über der Karte");
        content.addEventListener("input", () => {
            tools.remember("content");
            current.content = content.value;
            touch();
        });

        /* --- Die Fächer --- */
        const panel = (title: string, rows: () => Node[]) => (fly: HTMLElement): void => {
            fly.replaceChildren(el("p", "sto-h", title), el("div", "sto-rows", ...rows()));
        };

        const layouts = (): Node[] => {
            const list = el("div", "sto-adds");

            for (const [key, name] of Object.entries(data!.layouts)) {
                const pick = button("sto-add", name);

                pick.setAttribute("aria-pressed", String(entry.layout === key));
                pick.addEventListener("click", () => {
                    if (entry.layout === key) return;

                    edit("", () => (entry.layout = key));

                    for (const other of list.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === pick));
                });
                list.append(pick);
            }

            return [list, el("p", "sto-note", "Das Layout setzt Streifen, Fläche oder Rahmen und wo die Teile stehen, bis du sie selbst setzt.")];
        };

        const hint = data!.background;
        const accent = (): Node[] => {
            const color = colorInput(entry.accent, "Akzentfarbe der Karte", (value) => (entry.accent = value), "bare");

            color.disabled = !entry.accentOn;

            return [
                row(
                    "Akzentfarbe",
                    "Streifen, Rahmen, Ring und die kleine Zeile – aus heißt: neutral, ohne Farbe",
                    el(
                        "div",
                        "wcline",
                        el("label", "snitem__switch", toggle(entry.accentOn, "Akzentfarbe an", (on) => {
                            edit("", () => (entry.accentOn = on));
                            color.disabled = !on;
                        }), el("span", "", "an")),
                        color
                    )
                ),
            ];
        };

        const colors = (): Node[] => {
            const footer = colorInput(entry.footerColor ?? entry.accent, "Farbe der kleinen Zeile", (value) => (entry.footerColor = value));

            footer.disabled = entry.footerColor === null;

            return [
                row("Überschrift", "", colorInput(entry.titleColor, "Farbe der Überschrift", (value) => (entry.titleColor = value))),
                row("Unterzeile", "", colorInput(entry.subtitleColor, "Farbe der Unterzeile", (value) => (entry.subtitleColor = value))),
                row(
                    "Kleine Zeile",
                    "",
                    el(
                        "div",
                        "wcline",
                        footer,
                        el("label", "wcfollow", toggle(entry.footerColor === null, "Wie der Akzent", (on) => {
                            edit("", () => (entry.footerColor = on ? null : footer.value), "paint");
                            footer.disabled = on;
                        }), el("span", "", "wie Akzent"))
                    )
                ),
            ];
        };

        const panels = [
            { id: "layouts", label: "Layouts", icon: "#i-layout", render: panel("Layouts", layouts) },
            { id: "parts", label: "Teile", icon: "#i-list", render: panel("Teile", () => [stage.layers, el("p", "sto-note", "Ein Klick wählt das Teil. Auf der Karte ziehen oder mit den Pfeiltasten schieben, mit Umschalt in 10er-Schritten.")]) },
            {
                id: "background",
                label: "Hintergrund",
                icon: "#i-image",
                render: panel("Hintergrund", () => [
                    backgroundRow(entry, () => later(), () => tools.remember()),
                    el("p", "hintline wcsize", `Am besten ein Querformat um ${hint.width} × ${hint.height} px (etwa 3 : 1), höchstens ${hint.maxMegabytes} MB. Andere Formate schneidet der Bot mittig zu.`),
                    row("Abdunkeln", "Macht den Text auf hellen Bildern lesbar", range(entry.dim, 0, 90, 5, "Hintergrund abdunkeln", " %", (value) => (entry.dim = value))),
                ]),
            },
            {
                id: "style",
                label: "Stil",
                icon: "#i-contrast",
                render: panel("Stil", () => [
                    row("Schrift", "Für die Überschrift", select(Object.entries(data!.fonts), entry.font, (value) => edit("", () => (entry.font = value)), "Schrift der Überschrift")),
                    ...colors(),
                    ...accent(),
                    row("Ring", "Stärke des Rahmens um den Avatar – 0 heißt keiner", range(entry.ringWidth, 0, data!.limits.ringMax, 1, "Stärke des Rings", " px", (value) => (entry.ringWidth = value), "paint")),
                    row(
                        "Form des Avatars",
                        "Rund oder mit abgeschrägten Ecken",
                        select(
                            [
                                ["circle", "Rund"],
                                ["bevel", "Abgeschrägt"],
                            ],
                            entry.avatarShape,
                            (value) => edit("", () => (entry.avatarShape = value === "bevel" ? "bevel" : "circle"), "paint"),
                            "Form des Avatars"
                        )
                    ),
                ]),
            },
        ];

        void fetchStage();

        return {
            panels,
            canvas: stage.stage,
            inspector: () => {
                const part = stage.selected();

                content.value = current.content;

                return [group(PART_NAMES[part], ...partRows(part)), group("Position", stage.fields), group("Text über der Karte", content)];
            },
            take: () => structuredClone(entry),
            put: (state) => {
                Object.assign(entry, structuredClone(state));
                later();
            },
        };
    }

    /**
     * Das Hintergrundbild kommt aus der Bildauswahl: aus der Galerie des Servers
     * oder frisch hochgeladen - hochgeladene landen ebenfalls in der Galerie.
     * Eine fremde Adresse geht hier nicht: die Karte zeichnet der Bot selbst,
     * und was er lädt, soll bei ihm liegen.
     */
    function backgroundRow(entry: ICard, changed: () => void, before: () => void = () => undefined): HTMLElement {
        const pick = button("btn btn--quiet", icon("#i-image"), "");
        const drop = button("btn btn--quiet btn--icon", icon("#i-trash"), "Entfernen");
        const warn = el("p", "hintline is-warn wcwarn");
        const sync = (): void => {
            pick.replaceChildren(icon("#i-image"), document.createTextNode(entry.background ? "Bild tauschen" : "Bild wählen"));
            drop.hidden = !entry.background;
            void measure();
        };

        /** Ist das Bild kleiner als die Karte, wird es hochgezogen und wirkt unscharf - das soll man vorher wissen. */
        const measure = async (): Promise<void> => {
            warn.textContent = "";

            const source = entry.background;

            if (!source) return;

            await loadGallery(guildId);

            const url = galleryUrl(guildId, source);

            if (!url) return;

            const image = new Image();

            image.addEventListener("load", () => {
                const hint = data!.background;

                if (entry.background !== source) return;
                if (image.naturalWidth >= hint.minWidth && image.naturalHeight >= hint.minHeight) return;

                warn.textContent = `Das Bild ist mit ${image.naturalWidth} × ${image.naturalHeight} px kleiner als die Karte (${hint.minWidth} × ${hint.minHeight}) und wirkt dort unscharf.`;
            });
            image.src = url;
        };

        pick.addEventListener("click", async () => {
            const source = await pickImage(guildId, [], ["gallery", "upload"]);

            if (!source) return;

            before();
            entry.background = source;
            sync();
            changed();
        });

        drop.addEventListener("click", () => {
            before();
            entry.background = null;
            sync();
            toast("info", "Entfernt", "Die Karte nutzt wieder den Farbverlauf.");
            changed();
        });

        sync();

        return row("Hintergrund", "Aus der Galerie oder ein eigenes Bild – ohne zeichnet der Bot einen Farbverlauf", el("div", "wcbg", pick, drop, warn));
    }

    /* ------------------------------------------------------------
       Auto-Rollen
       ------------------------------------------------------------ */
    function roles(): HTMLElement {
        return card(
            "Auto-Rollen",
            "Was jeder bekommt, der den Server betritt. Die Rollen müssen unter der höchsten Rolle des Bots stehen.",
            row(
                "Für Mitglieder",
                `Bis zu ${data!.limits.roles} Rollen`,
                rolePicker(data!.guild.roles, draft!.roles, (ids) => {
                    draft!.roles = ids;
                    touch();
                }, [], data!.limits.roles)
            ),
            row(
                "Für Bots",
                "Wer einen Bot einlädt, gibt ihm damit diese Rollen",
                rolePicker(data!.guild.roles, draft!.botRoles, (ids) => {
                    draft!.botRoles = ids;
                    touch();
                }, [], data!.limits.roles)
            )
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function notices(): HTMLElement[] {
        if (data!.ready.members) return [];

        return [
            el(
                "div",
                "notice snnotice",
                icon("#i-warn"),
                el("span", "", "Der Bot sieht niemanden kommen oder gehen: dafür braucht er bei Discord das Members-Intent, und das kann nur das RL Nexus Team einschalten. Auto-Rollen und Begrüßung bleiben bis dahin still.")
            ),
        ];
    }

    function paint(): void {
        if (!data || !draft) return;

        save.replaceChildren(icon("#i-check"), document.createTextNode("Speichern"));
        save.disabled = !dirty;

        host.replaceChildren(...notices(), head(), tabs(), message(), roles(), el("div", "mcsave lvsave", save));
    }

    save.addEventListener("click", async () => {
        save.disabled = true;

        const answer = await call<{ config: IConfig }>("", { action: "save", config: draft });

        if (!answer) {
            save.disabled = false;

            return;
        }

        data!.config = answer.config;
        draft = structuredClone(answer.config);
        dirty = false;
        toast("info", "Gespeichert", "Gilt ab dem nächsten Mitglied.");
        paint();
    });

    loading(host, 4);

    void call<IPayload>("").then((answer) => {
        if (!answer) return;

        data = answer;
        draft = structuredClone(answer.config);
        paint();
    });
}
