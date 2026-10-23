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
import { bodyEditor, IBody, IBodyEditor, IEmbed } from "../layout/BodyEditor.js";
import { IEditorContext, IMessageDoc } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import { galleryUrl, loadGallery, pickImage } from "../layout/ImagePicker.js";
import { fill, WELCOME_PLACEHOLDERS } from "../constants/Placeholders.js";

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
    /** Die zuletzt gezeichnete Karte je Richtung - sie kommt vom Bot als Bild. */
    const cards = new Map<Which, string>();

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

        let editor: IBodyEditor;

        editor = bodyEditor(current, {
            kinds: data!.kinds,
            context,
            defaultEmbed: () => structuredClone(EMPTY_EMBED),
            touch,
            title: "Inhalt",
            templates: which === "join" ? "welcomeJoin" : "welcomeLeave",
            custom: {
                kind: "card",
                form: (refresh) => cardForm(current, refresh),
                preview: () => cardPreview(),
            },
        });

        const test = button("btn btn--quiet", icon("#i-play"), "Test senden");

        test.addEventListener("click", async () => {
            if (dirty) {
                toast("info", "Erst speichern", "Der Test schickt, was gespeichert ist.");

                return;
            }

            test.disabled = true;

            if (await call("", { action: "test", which })) toast("info", "Test gesendet", "Schau in den Kanal – so sieht es für neue Mitglieder aus.");

            test.disabled = false;
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
            editor.node,
            el("div", "mcsave", test)
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

    function cardForm(current: IMessage, refresh: () => void): HTMLElement {
        const entry = current.card;
        const box = el("div", "wccard");
        // Gezeichnet wird beim Bot. Erst nach einer kurzen Pause, sonst ginge
        // bei jedem getippten Zeichen eine neue Karte hin und her.
        const later = (): void => {
            touch();
            window.clearTimeout(pending);
            pending = window.setTimeout(() => void drawCard(refresh), 320);
        };

        const colorInput = (value: string, label: string, onChange: (value: string) => void): HTMLInputElement => {
            const input = el("input", "tkcolor");

            input.type = "color";
            input.value = value;
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                onChange(input.value);
                later();
            });

            return input;
        };

        /** Eine Textzeile mit ihrer Farbe daneben. */
        const line = (label: string, hint: string, value: string, onChange: (value: string) => void, color: HTMLElement): HTMLElement => {
            const field = el("input", "text");

            field.type = "text";
            field.value = value;
            field.maxLength = 120;
            field.setAttribute("aria-label", label);
            field.addEventListener("input", () => {
                onChange(field.value);
                later();
            });

            return row(label, hint, el("div", "wcline", field, color));
        };

        const range = (value: number, min: number, max: number, step: number, label: string, unit: string, onChange: (value: number) => void): HTMLElement => {
            const input = el("input", "wcrange");
            const shown = el("span", "wcrange__value", `${value}${unit}`);

            input.type = "range";
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                onChange(Number(input.value));
                shown.textContent = `${input.value}${unit}`;
                later();
            });

            return el("div", "wcrange__box", input, shown);
        };

        const switchRow = (label: string, hint: string, value: boolean, onChange: (on: boolean) => void): HTMLElement =>
            row(
                label,
                hint,
                el("label", "snitem__switch", toggle(value, label, (on) => {
                    onChange(on);
                    later();
                }), el("span", "", "an"))
            );

        const content = el("textarea", "text tkarea");

        content.rows = 2;
        content.value = current.content;
        content.maxLength = 2000;
        content.setAttribute("aria-label", "Text über der Karte");
        content.addEventListener("input", () => {
            current.content = content.value;
            touch();
        });

        /* --- Akzent: an oder aus, und welche Farbe --- */
        const accent = colorInput(entry.accent, "Akzentfarbe der Karte", (value) => (entry.accent = value));

        accent.disabled = !entry.accentOn;

        const accentSwitch = toggle(entry.accentOn, "Akzentfarbe an", (on) => {
            entry.accentOn = on;
            accent.disabled = !on;
            later();
        });

        /* --- Die kleine Zeile folgt dem Akzent oder hat eine eigene Farbe --- */
        const footerColor = colorInput(entry.footerColor ?? entry.accent, "Farbe der kleinen Zeile", (value) => (entry.footerColor = value));

        footerColor.disabled = entry.footerColor === null;

        const footerFollows = el(
            "label",
            "wcfollow",
            toggle(entry.footerColor === null, "Wie der Akzent", (on) => {
                entry.footerColor = on ? null : footerColor.value;
                footerColor.disabled = on;
                later();
            }),
            el("span", "", "wie Akzent")
        );

        const size = el("input", "text gwnum");

        size.type = "number";
        size.min = String(data!.limits.titleMin);
        size.max = String(data!.limits.titleMax);
        size.value = String(entry.titleSize);
        size.setAttribute("aria-label", "Schriftgröße der Überschrift");
        size.addEventListener("input", () => {
            entry.titleSize = Math.max(data!.limits.titleMin, Math.min(data!.limits.titleMax, Number(size.value) || 48));
            later();
        });

        const hint = data!.background;
        // Die Namen tragen eine kurze Beschreibung - im schmalen Standardfeld würden sie abgeschnitten.
        const layoutPick = select(Object.entries(data!.layouts), entry.layout, (value) => {
            entry.layout = value;
            later();
        }, "Layout der Karte");
        const fontPick = select(Object.entries(data!.fonts), entry.font, (value) => {
            entry.font = value;
            later();
        }, "Schrift der Überschrift");

        layoutPick.classList.add("wcpick");
        fontPick.classList.add("wcpick");

        box.append(
            el("label", "mcfield", el("span", "mcfield__label", "Text über der Karte"), content),

            el("h4", "srhead", "Aussehen"),
            row("Layout", "Wie Avatar und Text auf der Karte stehen", layoutPick),
            backgroundRow(entry, refresh),
            el(
                "p",
                "hintline wcsize",
                `Am besten ein Querformat um ${hint.width} × ${hint.height} px (etwa 3 : 1), höchstens ${hint.maxMegabytes} MB. ` +
                    "Andere Formate schneidet der Bot mittig zu, größere verkleinert die Galerie beim Hochladen."
            ),
            row("Abdunkeln", "Macht den Text auf hellen Bildern lesbar", range(entry.dim, 0, 90, 5, "Hintergrund abdunkeln", " %", (value) => (entry.dim = value))),
            row("Akzentfarbe", "Streifen, Rahmen, Ring und die kleine Zeile – aus heißt: neutral, ohne Farbe", el("div", "wcline", el("label", "snitem__switch", accentSwitch, el("span", "", "an")), accent)),

            el("h4", "srhead", "Texte"),
            line("Überschrift", "Die große Zeile", entry.title, (value) => (entry.title = value), colorInput(entry.titleColor, "Farbe der Überschrift", (value) => (entry.titleColor = value))),
            line("Unterzeile", "Die Zeile darunter", entry.subtitle, (value) => (entry.subtitle = value), colorInput(entry.subtitleColor, "Farbe der Unterzeile", (value) => (entry.subtitleColor = value))),
            line("Kleine Zeile", "Ganz unten", entry.footer, (value) => (entry.footer = value), el("div", "wcline", footerColor, footerFollows)),
            row("Schrift", "Für die Überschrift", fontPick),
            row("Schriftgröße", `${data!.limits.titleMin} bis ${data!.limits.titleMax} Pixel – lange Namen werden von selbst kleiner`, size),

            el("h4", "srhead", "Avatar"),
            switchRow("Avatar", "Das Bild des Mitglieds", entry.avatar, (on) => (entry.avatar = on)),
            row("Größe", "Im Layout Mittig und Panel etwas kleiner, damit der Text Platz hat", range(entry.avatarSize, data!.limits.avatarMin, data!.limits.avatarMax, 4, "Größe des Avatars", " px", (value) => (entry.avatarSize = value))),
            row("Ring", "Stärke des Rahmens um den Avatar – 0 heißt keiner", range(entry.ringWidth, 0, data!.limits.ringMax, 1, "Stärke des Rings", " px", (value) => (entry.ringWidth = value))),
            row(
                "Form",
                "Rund oder mit abgeschrägten Ecken",
                select(
                    [
                        ["circle", "Rund"],
                        ["bevel", "Abgeschrägt"],
                    ],
                    entry.avatarShape,
                    (value) => {
                        entry.avatarShape = value === "bevel" ? "bevel" : "circle";
                        later();
                    },
                    "Form des Avatars"
                )
            ),

            el("h4", "srhead", "Extras"),
            switchRow("Server-Icon", "Oben rechts auf der Karte", entry.icon, (on) => (entry.icon = on)),
            switchRow("Beitrittsdatum", "Hängt hinten an der kleinen Zeile", entry.date, (on) => (entry.date = on))
        );

        return box;
    }

    /**
     * Das Hintergrundbild kommt aus der Bildauswahl: aus der Galerie des Servers
     * oder frisch hochgeladen - hochgeladene landen ebenfalls in der Galerie.
     * Eine fremde Adresse geht hier nicht: die Karte zeichnet der Bot selbst,
     * und was er lädt, soll bei ihm liegen.
     */
    function backgroundRow(entry: ICard, refresh: () => void): HTMLElement {
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

            entry.background = source;
            touch();
            sync();
            void drawCard(refresh);
        });

        drop.addEventListener("click", () => {
            entry.background = null;
            touch();
            sync();
            toast("info", "Entfernt", "Die Karte nutzt wieder den Farbverlauf.");
            void drawCard(refresh);
        });

        sync();

        return row("Hintergrund", "Aus der Galerie oder ein eigenes Bild – ohne zeichnet der Bot einen Farbverlauf", el("div", "wcbg", pick, drop, warn));
    }

    /** Die Karte kommt fertig gezeichnet vom Bot - die Schriften liegen dort. */
    async function drawCard(refresh: () => void): Promise<void> {
        const answer = await call<{ image: string }>("", { action: "preview", which, message: draft![which] });

        if (!answer) return;

        cards.set(which, answer.image);
        refresh();
    }

    function cardPreview(): Node | null {
        const image = cards.get(which);

        if (!image) {
            void drawCard(() => paintPreviewOnly());

            return el("span", "tkempty", "Karte wird gezeichnet …");
        }

        const view = el("img", "wcpreview");

        view.src = image;
        view.alt = "Vorschau der Begrüßungskarte";
        view.loading = "lazy";

        const values = Object.fromEntries(WELCOME_PLACEHOLDERS.map((entry) => [entry.key, entry.sample]));

        return el("div", "wcpreview__box", ...(draft![which].content ? [el("p", "cmtext", fill(draft![which].content, values))] : []), view);
    }

    /** Nur die Vorschau neu zeichnen - ohne die ganze Seite anzufassen. */
    function paintPreviewOnly(): void {
        const side = host.querySelector<HTMLElement>(".sneditor__side .tkprev");
        const view = cardPreview();

        if (side && view) side.replaceChildren(view);
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
        cards.clear();
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
