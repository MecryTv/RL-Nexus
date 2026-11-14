/**
 * Abschnitt: Self Roles.
 *
 * Ein Panel je Karte: Name, Kanal, Art (Knöpfe, Auswahlmenü oder Reaktionen),
 * die Regeln, der Kopf der Nachricht mit Live-Vorschau und darunter die Rollen.
 * Gesendet wird erst auf Knopfdruck; danach zieht jede Änderung die Nachricht nach.
 *
 * W-0101: statt einer eigenen Nachricht kann das Panel an einer vorhandenen
 * hängen. Dann gibt es keinen Kopf, dafür Link oder ID mit „Prüfen“.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { ago } from "../core/Format.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, row, select, stat, toggle } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { IEditorContext } from "../layout/MessageEditor.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";

interface IPanelRole {
    roleId: string;
    label: string;
    description: string;
    emoji: string | null;
    style: "primary" | "secondary" | "success" | "danger";
    locked: boolean;
}

interface IPanel {
    id: number;
    name: string;
    kind: "buttons" | "select" | "reactions";
    mode: "multi" | "single";
    maxRoles: number;
    requireRole: string | null;
    body: IBody;
    roles: IPanelRole[];
    channelId: string | null;
    messageId: string | null;
    attached: boolean;
    targetId: string | null;
}

/** Was „Prüfen“ über eine vorhandene Nachricht meldet. */
interface IFound {
    channelId: string;
    channelName: string;
    messageId: string;
    author: string;
    own: boolean;
    excerpt: string;
    createdAt: number;
}

interface IPayload {
    panels: IPanel[];
    defaults: { body: IBody };
    kinds: Record<string, string>;
    modes: Record<string, string>;
    tones: Record<string, string>;
    bodyKinds: Record<string, string>;
    limits: { panels: number; roles: number; reactions: number; name: number; label: number; description: number };
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[]; emojis: IServerEmoji[] };
}

const EMPTY_EMBED: IEmbed = {
    title: "Hol dir deine Rollen",
    description: "Klick an, was auf dich passt.",
    color: "#00afff",
    url: null,
    image: null,
    thumbnail: null,
    author: null,
    footer: null,
    timestamp: false,
    fields: [],
};

export function renderSelfRoles(guildId: string): void {
    const host = need<HTMLElement>("#selfRoleBody");
    const note = need<HTMLElement>("#selfRoleNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/selfroles`, note);

    let data: IPayload | null = null;
    /** Welches Panel gerade offen ist - zu ist der Normalfall. */
    let open: number | null = null;
    /**
     * Der Entwurf je Panel. Er lebt hier und nicht in der Karte: Art und Regel
     * zeichnen die Karte neu, und ein Entwurf in der Karte wäre dabei jedes Mal
     * weg gewesen.
     */
    const drafts = new Map<number, IPanel>();
    const dirty = new Set<number>();
    /** Das letzte Ergebnis von „Prüfen“ je Panel, und welche schon einmal von selbst geprüft wurden. */
    const found = new Map<number, IFound>();
    const checked = new Set<number>();

    function draftOf(panel: IPanel): IPanel {
        const known = drafts.get(panel.id);

        if (known) return known;

        const fresh = structuredClone(panel);

        drafts.set(panel.id, fresh);

        return fresh;
    }

    /** Nach dem Speichern oder Senden gilt wieder, was der Server sagt. */
    function settle(panel: IPanel): void {
        data!.panels = data!.panels.map((entry) => (entry.id === panel.id ? panel : entry));
        drafts.delete(panel.id);
        dirty.delete(panel.id);
    }

    const context = (): IEditorContext => ({
        guildId,
        values: {},
        roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
        channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
        emojis: data!.guild.emojis,
        onChange: () => undefined,
    });

    const nameOf = (id: string): string => data!.guild.roles.find((role) => role.id === id)?.name ?? "gelöschte Rolle";
    const channelOf = (id: string | null): string => `#${data!.guild.channels.find((channel) => channel.id === id)?.name ?? "unbekannt"}`;
    /** Discord erlaubt nur 20 verschiedene Reaktionen an einer Nachricht. */
    const roleLimit = (draft: IPanel): number => (draft.kind === "reactions" ? data!.limits.reactions : data!.limits.roles);

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const panels = data!.panels.map((panel) => drafts.get(panel.id) ?? panel);
        const sent = panels.filter((panel) => panel.messageId).length;
        const roles = panels.reduce((sum, panel) => sum + panel.roles.length, 0);

        return el(
            "div",
            "tkhead snhead",
            stat("#i-sparkle", "Panels", `${panels.length} / ${data!.limits.panels}`),
            stat("#i-upload", "In Discord", String(sent), sent ? "is-ok" : ""),
            stat("#i-badge", "Rollen", String(roles)),
            stat("#i-list-checks", "Offen", open ? "ein Panel" : "keins")
        );
    }

    /* ------------------------------------------------------------
       Neues Panel
       ------------------------------------------------------------ */
    function creator(): HTMLElement {
        const name = el("input", "text snadd__input");
        const add = button("btn btn--primary snadd__go", icon("#i-plus"), "Anlegen");

        name.type = "text";
        name.maxLength = data!.limits.name;
        name.placeholder = "Name des Panels, etwa „Spiele“";
        name.setAttribute("aria-label", "Name des neuen Panels");

        const create = async (): Promise<void> => {
            if (!name.value.trim()) {
                toast("info", "Ohne Namen geht nicht", "Nur ihr seht ihn, in Discord steht er nicht.");

                return;
            }

            add.disabled = true;

            const answer = await call<{ panel: IPanel }>("", { action: "create", panel: { name: name.value.trim(), body: data!.defaults.body } });

            add.disabled = false;

            if (!answer) return;

            data!.panels = [answer.panel, ...data!.panels];
            open = answer.panel.id;
            name.value = "";
            toast("info", "Angelegt", "Jetzt Rollen dazu. Gesendet wird erst auf Knopfdruck.");
            paint();
        };

        add.addEventListener("click", () => void create());
        name.addEventListener("keydown", (event) => {
            if (event.key === "Enter") void create();
        });

        return card(
            "Neues Panel",
            `Bis zu ${data!.limits.panels} Panels je Server. Erst anlegen, dann Rollen wählen und senden.`,
            el("div", "snadd__row", icon("#i-sparkle"), name, add)
        );
    }

    /* ------------------------------------------------------------
       Ein Panel
       ------------------------------------------------------------ */
    function panelCard(panel: IPanel): HTMLElement {
        const draft = draftOf(panel);
        const box = el("div", "snitem");
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        /** Ein eingetippter, noch nicht geprüfter Link: Speichern nähme ihn nicht mit, also gesperrt. */
        let unchecked = (): boolean => false;
        const touch = (): void => {
            dirty.add(draft.id);
            save.disabled = unchecked();
        };

        save.disabled = !dirty.has(draft.id);

        const isOpen = open === draft.id;
        const state = draft.attached
            ? draft.messageId
                ? `angehängt an ${channelOf(draft.channelId)}`
                : draft.targetId
                  ? `noch nicht angehängt (${channelOf(draft.channelId)})`
                  : "keine Nachricht gewählt"
            : draft.messageId
              ? "gesendet"
              : draft.channelId
                ? "bereit"
                : "kein Kanal";
        const toggleOpen = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-sliders"), isOpen ? "Zuklappen" : "Bearbeiten");

        if (isOpen) box.classList.add("is-open");

        toggleOpen.addEventListener("click", () => {
            open = isOpen ? null : draft.id;
            paint();
        });

        box.append(
            el(
                "div",
                "snitem__head",
                el("span", "snitem__face", icon(draft.kind === "select" ? "#i-list-checks" : draft.kind === "reactions" ? "#i-smile" : "#i-grid")),
                el(
                    "div",
                    "snitem__name",
                    el("b", "", draft.name),
                    el("span", "", `${data!.kinds[draft.kind]} · ${draft.roles.length} Rolle(n) · ${state}`)
                ),
                ...(draft.attached && draft.messageId ? [el("span", "srchip", "angehängt")] : []),
                toggleOpen,
                ...(isOpen ? [] : [sendButton(draft)])
            )
        );

        if (!isOpen) return box;

        /* --- Name, Kanal, Regeln --- */
        const name = el("input", "text");

        name.type = "text";
        name.value = draft.name;
        name.maxLength = data!.limits.name;
        name.setAttribute("aria-label", "Name des Panels");
        name.addEventListener("input", () => {
            draft.name = name.value;
            touch();
        });

        const channel = select(
            [["", "(Kanal wählen)"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            draft.channelId ?? "",
            (value) => {
                draft.channelId = value || null;
                touch();
            },
            "Kanal des Panels"
        );

        /* --- Wo das Panel steht (W-0101) --- */
        const live = Boolean(draft.messageId);
        const where = segment(
            [
                ["new", "Neue Nachricht"],
                ["attached", "Vorhandene Nachricht"],
            ],
            draft.attached ? "attached" : "new",
            (value) => {
                draft.attached = value === "attached";
                touch();
                paint();
            },
            "Wo steht das Panel?",
            live
        );
        const info = found.get(draft.id);
        // Nur Reaktionen gehen an Nachrichten, die nicht von RL Nexus sind.
        const foreign = draft.attached && info?.own === false;

        // Ein Bearbeiten im Kanal würde die Nachricht wechseln - erst lösen.
        channel.disabled = draft.attached && live;

        if (isOpen && draft.attached && draft.targetId && draft.channelId && !info && !checked.has(draft.id)) {
            checked.add(draft.id);
            void inspect(draft, linkOf(draft), touch);
        }

        const kind = select(
            Object.entries(data!.kinds).map(([value, label]): [string, string] => [value, label]),
            draft.kind,
            (value) => {
                draft.kind = value === "select" || value === "reactions" ? value : "buttons";
                touch();
                paint();
            },
            "Art des Panels"
        );

        for (const option of kind.options) option.disabled = foreign && option.value !== "reactions";

        const mode = select(
            Object.entries(data!.modes).map(([value, label]): [string, string] => [value, label]),
            draft.mode,
            (value) => {
                draft.mode = value === "single" ? "single" : "multi";
                touch();
                paint();
            },
            "Regel des Panels"
        );

        const max = el("input", "text gwnum");

        max.type = "number";
        max.min = "0";
        max.max = String(data!.limits.roles);
        max.value = String(draft.maxRoles);
        max.setAttribute("aria-label", "Höchstzahl der Rollen");
        max.addEventListener("input", () => {
            draft.maxRoles = Math.max(0, Math.min(data!.limits.roles, Number(max.value) || 0));
            touch();
        });

        const require = select(
            [["", "(ohne Voraussetzung)"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@${role.name}`])],
            draft.requireRole ?? "",
            (value) => {
                draft.requireRole = value || null;
                touch();
            },
            "Voraussetzung"
        );

        /* --- Der Kopf der Nachricht - an einer vorhandenen bleibt sie, wie sie ist --- */
        const editor = draft.attached
            ? null
            : bodyEditor(draft.body, {
                  pageSave: () => save,
                  kinds: data!.bodyKinds,
                  context,
                  defaultEmbed: () => structuredClone(EMPTY_EMBED),
                  touch,
                  title: "Kopf der Nachricht",
                  hint: "Was über den Rollen steht.",
                  templates: "selfRoles",
                  extras: () => rolePreview(draft),
              });

        /* --- Die Nachricht, an die das Panel soll --- */
        const link = el("input", "text");
        const check = button("btn btn--quiet", icon("#i-search"), "Prüfen");

        link.type = "text";
        link.value = linkOf(draft);
        link.placeholder = "https://discord.com/channels/…";
        link.disabled = check.disabled = live;
        link.setAttribute("aria-label", "Nachrichtenlink oder ID");
        check.addEventListener("click", () => void inspect(draft, link.value, touch, check));
        link.addEventListener("keydown", (event) => {
            if (event.key === "Enter") void inspect(draft, link.value, touch, check);
        });

        const waiting = el("p", "srnote srnote--warn", "Neuer Link: erst „Prüfen“, dann speichern.");
        const syncLink = (): void => {
            const open = unchecked();

            waiting.hidden = !open;
            save.disabled = open || !dirty.has(draft.id);
            save.title = open ? "Erst den Link prüfen" : "";
        };

        unchecked = () => draft.attached && link.value.trim() !== linkOf(draft);
        link.addEventListener("input", syncLink);
        syncLink();

        /* --- Die Rollen --- */
        const roleBox = el("div", "srroles");
        const drawRoles = (): void => {
            roleBox.replaceChildren(
                ...draft.roles.map((entry) => roleRow(draft, entry, touch, () => {
                    drawRoles();
                    editor?.refresh();
                })),
                addRole(draft, touch, () => {
                    drawRoles();
                    editor?.refresh();
                })
            );
        };

        drawRoles();

        const kindHint = foreign
            ? "Die Nachricht ist nicht von RL Nexus: Discord erlaubt hier nur Reaktionen"
            : draft.kind === "reactions"
              ? "Jede Rolle bekommt ein Emoji, Reagieren holt sie, Wegnehmen gibt sie zurück"
              : "Knöpfe stehen offen da, ein Menü ist kompakter";

        box.append(
            el(
                "div",
                "snitem__body",
                row("Name", "Nur für euch, in Discord steht er nicht", name),
                row("Wo steht das Panel?", live ? (draft.attached ? "Erst lösen, dann umstellen" : "Erst einsammeln, dann umstellen") : "Eigene Nachricht oder eine, die es schon gibt", where),
                ...(draft.attached
                    ? [
                          row(
                              "Nachricht",
                              "Rechtsklick auf die Nachricht → Nachrichtenlink kopieren. Oder die ID.",
                              el("div", "srlink", el("div", "srlink__row", link, check), waiting, ...(info ? [foundBox(info)] : []))
                          ),
                          row("Kanal", "Nur nötig, wenn du statt des Links die ID einfügst", channel),
                      ]
                    : [row("Kanal", "Wohin das Panel geht", channel)]),
                row("Art", kindHint, kind),
                row("Regel", draft.mode === "single" ? "Die neue Rolle ersetzt die vorherige aus diesem Panel" : "Jede Rolle lässt sich einzeln an- und abwählen", mode),
                ...(draft.mode === "multi" ? [row("Höchstzahl", "0 heißt: ohne Grenze", max)] : []),
                row("Voraussetzung", "Nur wer diese Rolle hat, darf das Panel benutzen", require),
                ...(editor ? [editor.node] : []),
                el("h4", "srhead", `Rollen (${draft.roles.length} / ${roleLimit(draft)})`),
                ...(draft.kind === "reactions" ? [el("p", "srnote", "Bei Reaktionen braucht jede Rolle ein eigenes Emoji.")] : []),
                roleBox,
                el("div", "mcsave", save, sendButton(draft), recallButton(draft), deleteButton(draft)),
                ...(draft.attached ? [el("p", "srnote", "„Anhängen“ setzt die Reaktionen bzw. die Reihe. „Lösen“ nimmt sie wieder ab, die Nachricht selbst bleibt stehen.")] : [])
            )
        );

        save.addEventListener("click", async () => {
            save.disabled = true;

            const answer = await call<{ panel: IPanel; warning?: string | null }>("", { action: "save", id: draft.id, panel: draft });

            if (!answer) {
                save.disabled = false;

                return;
            }

            settle(answer.panel);

            // Gespeichert ist es - nur die Nachricht in Discord zog nicht nach.
            if (answer.warning) toast("warn", "Gespeichert, aber nicht nachgezogen", answer.warning);
            else toast("info", "Gespeichert", answer.panel.messageId ? "Die Nachricht in Discord zieht nach." : "Gesendet wird erst auf Knopfdruck.");

            paint();
        });

        return box;
    }

    /* ------------------------------------------------------------
       Eine vorhandene Nachricht (W-0101)
       ------------------------------------------------------------ */
    /** Zwei bis drei Knöpfe, von denen einer gedrückt ist. */
    function segment(entries: [string, string][], active: string, onPick: (value: string) => void, label: string, blocked: boolean): HTMLElement {
        const box = el("div", "seg srseg");

        box.setAttribute("role", "group");
        box.setAttribute("aria-label", label);

        for (const [value, text] of entries) {
            const item = button("", text);

            item.setAttribute("aria-pressed", String(value === active));
            item.disabled = blocked;
            item.addEventListener("click", () => {
                if (value !== active) onPick(value);
            });
            box.append(item);
        }

        return box;
    }

    function linkOf(draft: IPanel): string {
        return draft.targetId && draft.channelId ? `https://discord.com/channels/${guildId}/${draft.channelId}/${draft.targetId}` : "";
    }

    /** Fragt den Bot nach der Nachricht und übernimmt Kanal und ID ins Panel. */
    async function inspect(draft: IPanel, link: string, touch: () => void, trigger?: HTMLButtonElement): Promise<void> {
        if (!link.trim()) {
            toast("info", "Erst den Link", "Rechtsklick auf die Nachricht → Nachrichtenlink kopieren.");

            return;
        }

        if (trigger) trigger.disabled = true;

        const answer = await call<{ message: IFound }>("", { action: "inspect", link: link.trim(), channelId: draft.channelId });

        if (trigger) trigger.disabled = false;
        if (!answer) return;

        const message = answer.message;

        found.set(draft.id, message);

        if (draft.channelId !== message.channelId || draft.targetId !== message.messageId) {
            draft.channelId = message.channelId;
            draft.targetId = message.messageId;
            touch();
        }

        if (!message.own && draft.kind !== "reactions") {
            draft.kind = "reactions";
            touch();
            toast("info", "Auf Reaktionen gestellt", "Die Nachricht ist nicht von RL Nexus, da gehen nur Reaktionen.");
        }

        paint();
    }

    function foundBox(info: IFound): HTMLElement {
        return el(
            "div",
            `srfound${info.own ? "" : " is-warn"}`,
            el("div", "srfound__meta", el("b", "", `#${info.channelName}`), el("span", "", `von ${info.author}`), el("span", "", ago(info.createdAt))),
            el("div", "srfound__text", `„${info.excerpt}“`),
            el("div", "srfound__can", info.own ? "Nachricht von RL Nexus: Knöpfe, Menü und Reaktionen gehen." : "Nicht von RL Nexus: Discord erlaubt hier nur Reaktionen.")
        );
    }

    /* ------------------------------------------------------------
       Eine Rolle im Panel
       ------------------------------------------------------------ */
    function roleRow(draft: IPanel, entry: IPanelRole, touch: () => void, redraw: () => void): HTMLElement {
        const label = el("input", "text");
        const emoji = el("input", "text srrole__emoji");
        const remove = button("btn btn--quiet btn--icon", icon("#i-x"));
        const reactions = draft.kind === "reactions";
        // Bei Reaktionen steht kein Text in Discord, nur das Emoji - die Spalte zeigt, ob es fehlt.
        const hint = el("span", "srrole__hint");
        const mark = (): void => {
            const missing = reactions && !entry.emoji;

            hint.textContent = entry.emoji ? `Reaktion ${entry.emoji}` : "Emoji fehlt noch";
            hint.classList.toggle("is-missing", missing);
            emoji.classList.toggle("is-missing", missing);
            emoji.setAttribute("aria-invalid", String(missing));
        };

        label.type = "text";
        label.value = entry.label;
        label.maxLength = data!.limits.label;
        label.placeholder = nameOf(entry.roleId);
        label.setAttribute("aria-label", `Beschriftung für ${nameOf(entry.roleId)}`);
        label.addEventListener("input", () => {
            entry.label = label.value;
            touch();
        });

        emoji.type = "text";
        emoji.value = entry.emoji ?? "";
        emoji.maxLength = 60;
        emoji.placeholder = "Emoji";
        emoji.setAttribute("aria-label", `Emoji für ${nameOf(entry.roleId)}`);
        emoji.addEventListener("input", () => {
            entry.emoji = emoji.value.trim() || null;
            mark();
            touch();
        });
        mark();

        remove.title = "Rolle aus dem Panel nehmen";
        remove.setAttribute("aria-label", `${nameOf(entry.roleId)} entfernen`);
        remove.addEventListener("click", () => {
            draft.roles = draft.roles.filter((role) => role !== entry);
            touch();
            redraw();
        });

        const extra = reactions ? el("span", "") : draft.kind === "select" ? description(entry, touch) : tone(entry, touch);

        return el(
            "div",
            "srrole",
            el("span", "srrole__name", el("b", "", `@${nameOf(entry.roleId)}`)),
            reactions ? hint : label,
            emoji,
            extra,
            el("label", "snitem__switch", toggle(entry.locked, `${nameOf(entry.roleId)} festhalten`, (on) => {
                entry.locked = on;
                touch();
            }), el("span", "", "nur dazu")),
            remove
        );
    }

    function description(entry: IPanelRole, touch: () => void): HTMLElement {
        const field = el("input", "text");

        field.type = "text";
        field.value = entry.description;
        field.maxLength = data!.limits.description;
        field.placeholder = "Beschreibung im Menü";
        field.setAttribute("aria-label", "Beschreibung im Menü");
        field.addEventListener("input", () => {
            entry.description = field.value;
            touch();
        });

        return field;
    }

    function tone(entry: IPanelRole, touch: () => void): HTMLElement {
        return select(
            Object.entries(data!.tones).map(([value, label]): [string, string] => [value, label]),
            entry.style,
            (value) => {
                entry.style = value as IPanelRole["style"];
                touch();
            },
            "Farbe des Knopfes"
        );
    }

    function addRole(draft: IPanel, touch: () => void, redraw: () => void): HTMLElement {
        const left = data!.guild.roles.filter((role) => !draft.roles.some((entry) => entry.roleId === role.id));
        const full = draft.roles.length >= roleLimit(draft);
        const picker = select(
            [["", full ? `Höchstens ${roleLimit(draft)} Rollen` : "+ Rolle hinzufügen"], ...left.map((role): [string, string] => [role.id, `@${role.name}`])],
            "",
            (value) => {
                if (!value) return;

                draft.roles = [...draft.roles, { roleId: value, label: "", description: "", emoji: null, style: "secondary", locked: false }];
                touch();
                redraw();
            },
            "Rolle hinzufügen"
        );

        picker.disabled = full;

        return el("div", "srrole srrole--add", picker);
    }

    /** Wie das Panel in Discord aussieht - unter der Vorschau der Nachricht. */
    function rolePreview(draft: IPanel): HTMLElement | null {
        if (!draft.roles.length) return null;

        if (draft.kind === "select") {
            return el(
                "div",
                "srprev__menu",
                el("span", "", draft.mode === "single" ? "Eine Rolle wählen" : "Rollen wählen"),
                icon("#i-chevron")
            );
        }

        const box = el("div", "tkprev__buttons");

        for (const entry of draft.roles) {
            box.append(
                draft.kind === "reactions"
                    ? el("span", "srprev__react", `${entry.emoji ?? "?"} 1`)
                    : el("span", `tkprev__btn is-${entry.style}`, `${entry.emoji ? `${entry.emoji} ` : ""}${entry.label || nameOf(entry.roleId)}`)
            );
        }

        return box;
    }

    /* ------------------------------------------------------------
       Knöpfe am Panel
       ------------------------------------------------------------ */
    function sendButton(panel: IPanel): HTMLButtonElement {
        const send = button(
            "btn btn--quiet",
            icon(panel.attached ? "#i-link" : "#i-upload"),
            panel.messageId ? "Aktualisieren" : panel.attached ? "Anhängen" : "Senden"
        );

        const unsaved = dirty.has(panel.id);
        const nowhere = panel.attached ? !panel.targetId : !panel.channelId;

        send.disabled = nowhere || !panel.roles.length || unsaved;
        send.title = nowhere ? (panel.attached ? "Erst die Nachricht prüfen" : "Erst einen Kanal wählen") : !panel.roles.length ? "Erst Rollen hinzufügen" : unsaved ? "Erst speichern" : "";
        send.addEventListener("click", async () => {
            send.disabled = true;

            const answer = await call<{ panel: IPanel }>("", { action: "send", id: panel.id });

            if (!answer) {
                send.disabled = false;

                return;
            }

            settle(answer.panel);
            toast(
                "info",
                panel.messageId ? "Aktualisiert" : panel.attached ? "Angehängt" : "Gesendet",
                panel.attached ? "Das Panel hängt an der Nachricht." : "Das Panel steht im Kanal."
            );
            paint();
        });

        return send;
    }

    function recallButton(panel: IPanel): HTMLElement {
        if (!panel.messageId) return el("span", "");

        // Angehängt: nur die eigenen Reaktionen bzw. die Reihe kommen ab, die Nachricht bleibt.
        const attached = panel.attached;

        return confirmButton("btn btn--quiet", "#i-eraser", attached ? "Lösen" : "Einsammeln", attached ? "Wirklich lösen?" : "Wirklich löschen?", async () => {
            const answer = await call<{ panel: IPanel }>("", { action: "recall", id: panel.id });

            if (!answer) return;

            settle(answer.panel);
            toast(
                "info",
                attached ? "Gelöst" : "Eingesammelt",
                attached ? "Reaktionen bzw. Reihe sind ab, die Nachricht bleibt stehen." : "Die Nachricht in Discord ist weg, das Panel bleibt."
            );
            paint();
        });
    }

    function deleteButton(panel: IPanel): HTMLElement {
        return confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Panel löschen", "Wirklich löschen?", async () => {
            if (!(await call("", { action: "delete", id: panel.id }))) return;

            data!.panels = data!.panels.filter((entry) => entry.id !== panel.id);
            drafts.delete(panel.id);
            dirty.delete(panel.id);
            open = null;
            toast("info", "Gelöscht", panel.attached ? "Das Panel ist weg, die Nachricht bleibt stehen." : "Panel und Nachricht sind weg.");
            paint();
        });
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        const list = data.panels.length
            ? data.panels.map(panelCard)
            : [el("div", "tkempty", icon("#i-sparkle"), el("span", "", "Noch kein Panel. Leg oben eins an."))];

        host.replaceChildren(head(), creator(), el("div", "snlist", ...list));
    }

    loading(host, 4);

    void call<IPayload>("").then((answer) => {
        if (!answer) return;

        data = answer;
        paint();
    });
}
