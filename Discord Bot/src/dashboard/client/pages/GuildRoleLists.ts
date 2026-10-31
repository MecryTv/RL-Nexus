/**
 * Rollen-Listen im Dashboard (Plan 29): „Alle Listen“ und je Liste die Reiter
 * „Liste“ und „Bild“. Welche Liste offen ist, steht in der Adresse
 * (?liste=<id>, ?neu=1). Die Leiste setzt Guild.ts aus denselben Daten.
 * Siehe docs/RoleLists.md.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, row, select, toggle } from "../core/Ui.js";
import { IServerEmoji, openEmojiPicker } from "../layout/EmojiPicker.js";
import { loadGallery, pickImage } from "../layout/ImagePicker.js";
import { renderImageEditor } from "../layout/RoleListImageEditor.js";
import { IRoleEntry, IRoleListImage, IRoleListSettings, RoleIcon, RoleListDesign } from "../../../constants/RoleLists.js";

interface IList {
    id: number;
    name: string;
    position: number;
    channelId: string | null;
    design: RoleListDesign;
    settings: IRoleListSettings;
    messageId: string | null;
    members: number;
}

interface IPreset {
    id: string;
    name: string;
    image: IRoleListImage;
}

interface IPayload {
    lists: IList[];
    presets: IPreset[];
    imagePresets: Record<string, { label: string; image: IRoleListImage }>;
    motifs: Record<string, string>;
    templates: Record<string, string>;
    designs: Record<RoleListDesign, string>;
    limits: { lists: number; roles: number; presets: number; title: number; label: number; name: number; heading: number; lead: number; button: number };
    intent: boolean;
    members: Record<string, { id: string; name: string }[]>;
    guild: {
        name: string;
        icon: string | null;
        roles: { id: string; name: string; color: string }[];
        emojis: IServerEmoji[];
        channels: { id: string; name: string }[];
        roleIcons: Record<string, string>;
        memberCounts: Record<string, number>;
    };
}

interface IPreviewPart {
    type: "text" | "separator" | "section" | "buttons";
    content?: string;
    thumbnail?: string;
    buttons?: { label: string; url: string }[];
}

interface IPreview {
    image?: string;
    message?: { accent: number | null; parts: IPreviewPart[]; names: Record<string, string>; emojis: Record<string, string> };
}

const INTENT = "Der Bot sieht gerade nicht alle Mitglieder. Schalte den Server Members Intent im Discord Developer Portal und GUILD_MEMBER_INTENT ein, sonst bleiben die Listen unvollständig.";

function input(value: string, max: number, label: string, onInput: (value: string) => void, placeholder = ""): HTMLInputElement {
    const field = el("input", "text");

    field.type = "text";
    field.maxLength = max;
    field.value = value;
    field.placeholder = placeholder;
    field.setAttribute("aria-label", label);
    field.addEventListener("input", () => onInput(field.value));

    return field;
}

/** Ein Schalter in der Optik des Dashboards. */
function switchRow(label: string, hint: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
    return row(label, hint, el("label", "snitem__switch", toggle(on, label, onChange), el("span", "", "an")));
}

/** Text mit Erwähnungen, Server-Emojis und **fett** - als Knoten, nie als HTML. */
function inline(text: string, names: Record<string, string>, emojis: Record<string, string>): Node[] {
    const nodes: Node[] = [];

    for (const piece of text.split(/(<@\d+>|<a?:\w+:\d+>|<t:\d+(?::\w)?>|\*\*[^*]+\*\*)/)) {
        const mention = /^<@(\d+)>$/.exec(piece);
        const emoji = /^<a?:(\w+):(\d+)>$/.exec(piece);
        const time = /^<t:(\d+)(?::(\w))?>$/.exec(piece);

        if (mention) nodes.push(el("span", "rldc__mention", `@${names[mention[1]!] ?? "Unbekannt"}`));
        else if (time) {
            // Discord zeigt Zeitstempel in der Zeit des Lesers - :R als „vor …“, hier reicht „gerade eben“.
            nodes.push(el("span", "rldc__time", time[2] === "R" ? "gerade eben" : new Date(Number(time[1]) * 1000).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })));
        }
        else if (emoji) {
            const image = el("img", "rldc__emoji");

            image.src = emojis[emoji[2]!] ?? `https://cdn.discordapp.com/emojis/${emoji[2]}.png?size=64`;
            image.alt = `:${emoji[1]}:`;
            nodes.push(image);
        } else if (/^\*\*[^*]+\*\*$/.test(piece)) nodes.push(el("strong", "", piece.slice(2, -2)));
        else if (piece) nodes.push(document.createTextNode(piece.replace(/\\([*_~`|>#-])/g, "$1")));
    }

    return nodes;
}

/** Die Karte aus der Vorschau-Antwort, so wie Discord sie zeigt. */
function previewCard(message: NonNullable<IPreview["message"]>): HTMLElement {
    const box = el("div", "rldc__card");
    const lines = (content: string): HTMLElement => {
        const block = el("div", "rldc__text");

        for (const line of content.split("\n")) {
            if (line.startsWith("## ")) block.append(el("h3", "", ...inline(line.slice(3), message.names, message.emojis)));
            else if (line.startsWith("### ")) block.append(el("h4", "", ...inline(line.slice(4), message.names, message.emojis)));
            else if (line.startsWith("-# ")) block.append(el("small", "", ...inline(line.slice(3), message.names, message.emojis)));
            else if (line.startsWith("- ")) block.append(el("p", "rldc__item", ...inline(line.slice(2), message.names, message.emojis)));
            else block.append(el("p", "", ...inline(line, message.names, message.emojis)));
        }

        return block;
    };

    if (message.accent !== null) box.style.borderLeftColor = `#${message.accent.toString(16).padStart(6, "0")}`;

    for (const part of message.parts) {
        if (part.type === "separator") box.append(el("hr"));
        else if (part.type === "text") box.append(lines(part.content ?? ""));
        else if (part.type === "section") {
            const thumb = el("img", "rldc__thumb");

            thumb.src = part.thumbnail ?? "";
            thumb.alt = "";
            box.append(el("div", "rldc__section", lines(part.content ?? ""), ...(part.thumbnail ? [thumb] : [])));
        } else if (part.type === "buttons") {
            box.append(el("div", "rldc__buttons", ...(part.buttons ?? []).map((entry) => el("span", "rldc__button", entry.label, icon("#i-external")))));
        }
    }

    return box;
}

export async function renderRoleLists(guildId: string): Promise<void> {
    const host = need<HTMLElement>("#roleListsBody");
    const note = need<HTMLElement>("#roleListsNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/role-lists`, note);

    let data: IPayload | null = null;
    let draft: IList | null = null;
    let dirty = false;
    // Der Knopf der offenen Liste: jede Änderung schaltet ihn frei, auch ohne Neuzeichnen.
    let saveButton: HTMLButtonElement | null = null;
    let tab: "list" | "image" = "list";
    let gallery = new Map<string, string>();
    const open = new Set<string>();
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    const preview = el("div", "rlpreview");

    async function load(): Promise<void> {
        data = await call<IPayload>("");
    }

    const changed = (): void => void window.dispatchEvent(new CustomEvent("rolelists:changed"));

    function go(query: string): void {
        history.pushState(null, "", `${BASE}/guild/${guildId}/role-lists${query}`);
        window.dispatchEvent(new CustomEvent("rolelists:navigate"));
    }

    /* ------------------------------------------------------------
       Alle Listen
       ------------------------------------------------------------ */
    function paintAll(creating: boolean): void {
        const d = data!;
        const tiles = d.lists.map((list) => {
            const color = d.guild.roles.find((role) => role.id === list.settings.roles[0]?.roleId)?.color ?? "#00afff";
            const channel = d.guild.channels.find((entry) => entry.id === list.channelId);
            const tile = button(
                "rltile",
                el("b", "", list.name),
                el("span", "", `${channel ? `#${channel.name}` : list.channelId ? "Kanal fehlt" : "kein Kanal"} ·${list.members} Mitglied${list.members === 1 ? "" : "er"} · ${d.designs[list.design]}`),
                el("span", "rltile__chips", ...list.settings.roles.map((entry) => el("i", "", entry.label))),
                el("span", "", list.messageId ? "Im Kanal" : "Noch nicht gesendet")
            );

            tile.style.setProperty("--c", color);
            tile.addEventListener("click", () => go(`?liste=${list.id}`));

            return tile;
        });
        const add = button("rltile rltile--new", icon("#i-plus"), "Neue Liste");

        add.disabled = d.lists.length >= d.limits.lists;
        add.addEventListener("click", () => go("?neu=1"));

        const parts: HTMLElement[] = [el("div", "rltiles", ...tiles, add)];

        if (creating && d.lists.length < d.limits.lists) {
            let template = "staff";
            let name = "";
            const seg = el("div", "seg");
            const make = button("btn btn--primary", icon("#i-check"), "Anlegen");

            for (const [key, label] of Object.entries(d.templates)) {
                const knob = button("", label);

                knob.setAttribute("aria-pressed", String(key === template));
                knob.addEventListener("click", () => {
                    template = key;

                    for (const other of seg.children) other.setAttribute("aria-pressed", String(other === knob));
                });
                seg.append(knob);
            }

            make.addEventListener("click", async () => {
                make.disabled = true;

                const answer = await call<{ ok: boolean; list?: IList }>("", { action: "create", name, template });

                make.disabled = false;

                if (!answer?.list) return;

                await load();
                changed();
                go(`?liste=${answer.list.id}`);
            });

            parts.push(
                el(
                    "div",
                    "rlnew",
                    el("b", "", "Neue Liste"),
                    row("Name", "Steht in der Leiste, Mitglieder sehen ihn nicht", input("", d.limits.name, "Name der Liste", (value) => (name = value), "z. B. Staff")),
                    row("Vorlage", "Staff und Teams suchen passende Rollen über den Namen – alles lässt sich danach ändern", seg),
                    el("div", "mcsave lvsave", make)
                )
            );
        }

        host.replaceChildren(
            ...(d.intent ? [] : [el("div", "notice", icon("#i-warn"), el("span", "", INTENT))]),
            card("Deine Listen", `${d.lists.length} von höchstens ${d.limits.lists}. Ein Klick öffnet die Liste.`, ...parts)
        );
    }

    /* ------------------------------------------------------------
       Eine Liste
       ------------------------------------------------------------ */
    function payload(): Record<string, unknown> {
        return { name: draft!.name, channelId: draft!.channelId, design: draft!.design, settings: draft!.settings };
    }

    function touch(repaint = false): void {
        dirty = true;

        if (saveButton) saveButton.disabled = false;
        schedulePreview();

        if (repaint) paintList();
    }

    function schedulePreview(): void {
        if (previewTimer) clearTimeout(previewTimer);

        previewTimer = setTimeout(() => void runPreview(), 400);
    }

    // Eine Vorschau zur Zeit: ein Bild braucht Sekunden, sonst überholte eine alte Antwort die neue.
    let previewBusy = false;
    let previewAgain = false;

    async function runPreview(): Promise<void> {
        if (!draft) return;

        if (previewBusy) {
            previewAgain = true;

            return;
        }

        const id = draft.id;

        previewBusy = true;

        const answer = await call<IPreview>("", { action: "preview", id, list: payload() }).finally(() => {
            previewBusy = false;
        });

        // Inzwischen geändert oder eine andere Liste offen: gleich der neuere Stand.
        if (previewAgain) {
            previewAgain = false;
            void runPreview();

            return;
        }

        if (!answer || draft?.id !== id) return;

        // Wie eine Nachricht des Bots in Discord: Bild, Name, darunter die Karte oder nur das Bild.
        const avatar = el("img", "rldc__avatar");
        const message = (body: HTMLElement): HTMLElement =>
            el("div", "rldc", el("div", "rldc__msg", avatar, el("div", "", el("span", "rldc__name", "RL Nexus", el("i", "", "APP"), el("small", "", "heute")), body)));

        avatar.src = `${BASE}/assets/images/rl-nexus-n-96.png`;
        avatar.alt = "";

        if (answer.image) {
            const image = el("img", "rlpreview__image");

            image.src = answer.image;
            image.alt = "Das Bild, wie der Bot es schickt";
            preview.replaceChildren(
                el("span", "rlprevhead", "So steht es in Discord – nur das Bild"),
                message(image),
                el("span", "hintline", "Genau das geht in den Kanal: 1200 Pixel breit, die Höhe wächst mit der Zahl der Leute.")
            );
        } else if (answer.message) {
            preview.replaceChildren(el("span", "rlprevhead", "So steht es in Discord"), message(previewCard(answer.message)));
        }
    }

    function iconOf(entry: IRoleEntry): Node {
        const d = data!;
        const picture = (src: string | undefined): Node => {
            if (!src) return icon("#i-smile");

            const image = el("img", "");

            image.src = src;
            image.alt = "";

            return image;
        };

        if (!entry.icon) return icon("#i-smile");
        if (entry.icon.kind === "emoji") return document.createTextNode(entry.icon.value);
        if (entry.icon.kind === "server") return picture(d.guild.emojis.find((emoji) => emoji.id === (entry.icon as { id: string }).id)?.url);
        if (entry.icon.kind === "gallery") return picture(gallery.get(entry.icon.id));

        return picture(d.guild.roleIcons[entry.roleId]);
    }

    function pickerValue(value: RoleIcon): string | null {
        if (value?.kind === "emoji") return value.value;

        if (value?.kind === "server") {
            const emoji = data!.guild.emojis.find((entry) => entry.id === (value as { id: string }).id);

            return emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : null;
        }

        return null;
    }

    function roleRow(entry: IRoleEntry, index: number): HTMLElement {
        const d = data!;
        const roles = draft!.settings.roles;
        const role = d.guild.roles.find((candidate) => candidate.id === entry.roleId);
        const symbol = button("rlicon", iconOf(entry));
        const count = d.guild.memberCounts[entry.roleId] ?? 0;

        symbol.setAttribute("aria-label", `Symbol für ${entry.label}`);
        symbol.addEventListener("click", () =>
            openEmojiPicker(symbol, {
                value: pickerValue(entry.icon),
                emojis: d.guild.emojis,
                label: `Symbol für ${entry.label}`,
                none: "Kein Symbol",
                onPick: (value) => {
                    const custom = value ? /^<a?:\w+:(\d+)>$/.exec(value) : null;

                    entry.icon = value ? (custom ? { kind: "server", id: custom[1]! } : { kind: "emoji", value }) : null;
                    touch(true);
                },
                extra: [
                    {
                        label: "Bild aus der Galerie … (nur im Bild)",
                        icon: "#i-image",
                        run: () =>
                            void pickImage(guildId, [], ["gallery", "upload"]).then(async (id) => {
                                if (!id) return;

                                entry.icon = { kind: "gallery", id };
                                await refreshGallery();
                                touch(true);
                            }),
                    },
                    {
                        label: d.guild.roleIcons[entry.roleId] ? "Rollen-Icon aus Discord (nur im Bild)" : "Rollen-Icon aus Discord – diese Rolle hat keins",
                        icon: "#i-shield",
                        run: () => {
                            entry.icon = { kind: "role" };
                            touch(true);
                        },
                    },
                ],
            })
        );

        const move = (step: number): HTMLButtonElement => {
            const knob = button("rlrole__act", icon(step < 0 ? "#i-up" : "#i-down"));

            knob.setAttribute("aria-label", step < 0 ? "Nach oben" : "Nach unten");
            knob.disabled = index + step < 0 || index + step >= roles.length;
            knob.addEventListener("click", () => {
                roles.splice(index + step, 0, roles.splice(index, 1)[0]!);
                touch(true);
            });

            return knob;
        };
        const people = button("rlrole__act", icon("#i-users"));
        const remove = button("rlrole__act", icon("#i-trash"));

        people.setAttribute("aria-label", "Titel je Person");
        people.setAttribute("aria-expanded", String(open.has(entry.roleId)));
        people.title = "Titel je Person";
        people.addEventListener("click", () => {
            if (open.has(entry.roleId)) open.delete(entry.roleId);
            else open.add(entry.roleId);

            paintList();
        });
        remove.setAttribute("aria-label", "Rolle entfernen");
        remove.addEventListener("click", () => {
            roles.splice(index, 1);
            touch(true);
        });

        const chip = el(
            "span",
            "rlrole__chip",
            el("b", role ? "" : "is-gone", el("span", "rlrole__dot"), role ? `@${role.name}` : "Diese Rolle gibt es nicht mehr"),
            el("span", "", role ? (count ? `${count} Mitglied${count === 1 ? "" : "er"}` : "noch niemand") : "Entfern sie oder wähl eine andere")
        );

        (chip.querySelector(".rlrole__dot") as HTMLElement).style.background = role?.color ?? "#f23f43";

        const box = el(
            "div",
            "rlrole",
            el(
                "div",
                "rlrole__line",
                symbol,
                chip,
                input(entry.label, d.limits.label, "Name in der Liste", (value) => {
                    entry.label = value;
                    touch();
                }, role?.name ?? ""),
                el("span", "rlrole__acts", people, move(-1), move(1), remove)
            )
        );

        if (open.has(entry.roleId)) {
            const members = d.members[entry.roleId];

            box.append(
                el(
                    "div",
                    "rlmembers",
                    ...(members?.length
                        ? members.map((member) =>
                              el(
                                  "div",
                                  "rlmember",
                                  el("i", "", member.name.slice(0, 1).toUpperCase()),
                                  el("span", "", member.name),
                                  input(draft!.settings.titles[member.id]?.title ?? "", d.limits.title, `Titel für ${member.name}`, (value) => {
                                      if (value.trim()) draft!.settings.titles[member.id] = { title: value, seen: draft!.settings.titles[member.id]?.seen ?? Date.now() };
                                      else delete draft!.settings.titles[member.id];
                                      touch();
                                  }, "Titel, etwa „Head of Support“ (freiwillig)")
                              )
                          )
                        : [el("p", "hintline", members ? "Noch niemand mit dieser Rolle." : "Speichere die Liste, dann stehen hier die Mitglieder.")])
                )
            );
        }

        return box;
    }

    function listTab(): HTMLElement[] {
        const d = data!;
        const list = draft!;
        const settings = list.settings;
        const board = list.design === "board";
        const channels: [string, string][] = [["", "— kein Kanal —"], ...d.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])];
        // In Discord gelöscht: steht als fehlend da, bis jemand einen neuen wählt.
        const missing = (id: string | null): [string, string][] => (id && !d.guild.channels.some((entry) => entry.id === id) ? [[id, "Kanal fehlt – wähl einen neuen"]] : []);
        const designs = el("div", "seg");

        for (const [key, label] of Object.entries(d.designs) as [RoleListDesign, string][]) {
            const knob = button("", label);

            knob.setAttribute("aria-pressed", String(key === list.design));
            knob.addEventListener("click", () => {
                list.design = key;
                touch(true);
            });
            designs.append(knob);
        }

        const free = d.guild.roles.filter((role) => !settings.roles.some((entry) => entry.roleId === role.id));
        let picked = free[0]?.id ?? "";
        const add = button("btn btn--quiet", icon("#i-plus"), "Rolle hinzufügen");

        add.disabled = !free.length || settings.roles.length >= d.limits.roles;
        add.addEventListener("click", () => {
            const role = d.guild.roles.find((entry) => entry.id === picked);

            if (!role) return;

            settings.roles.push({ roleId: role.id, label: role.name.slice(0, d.limits.label), icon: null });
            touch(true);
        });

        const onlyImage = card("Nur das Bild", "Als Bild schickt der Bot nur das Bild als Datei – ohne Karte, Embed, Text oder Knopf darunter. Überschrift, Farben und Aussehen stellst du im Reiter „Bild“ ein.");
        const toImage = button("btn btn--primary", icon("#i-image"), "Zum Reiter „Bild“");

        toImage.addEventListener("click", () => {
            tab = "image";
            paintList();
        });
        onlyImage.append(el("div", "mcsave lvsave", toImage));

        const buttonRows: HTMLElement[] = settings.button.on
            ? [
                  row("Beschriftung", "", input(settings.button.label, d.limits.button, "Beschriftung des Knopfs", (value) => {
                      settings.button.label = value;
                      touch();
                  }, "z. B. Ticket öffnen")),
                  row("Ziel", "", select([["channel", "Ein Kanal"], ["url", "Eine Webseite"]], settings.button.to, (value) => {
                      settings.button.to = value as "channel" | "url";
                      touch(true);
                  }, "Ziel des Knopfs")),
                  settings.button.to === "channel"
                      ? row("Kanal", "", select([...channels, ...missing(settings.button.channelId)], settings.button.channelId ?? "", (value) => {
                            settings.button.channelId = value || null;
                            touch();
                        }, "Kanal des Knopfs"))
                      : row("Adresse", "Nur https://", input(settings.button.url ?? "", 512, "Adresse des Knopfs", (value) => {
                            settings.button.url = value || null;
                            touch();
                        }, "https://…")),
              ]
            : [];

        return [
            card(
                "Wo und wie",
                "",
                row("Name", "Nur in der Leiste", input(list.name, d.limits.name, "Name der Liste", (value) => {
                    list.name = value;
                    touch();
                })),
                row("Kanal", "Dort steht die Liste", select([...channels, ...missing(list.channelId)], list.channelId ?? "", (value) => {
                    list.channelId = value || null;
                    touch();
                }, "Kanal der Liste")),
                el("div", "rlstack", el("div", "row__text", el("b", "", "Design"), el("i", "", "Wie die Liste in Discord aussieht. „Als Bild“ stellst du im Reiter „Bild“ ein.")), designs)
            ),
            card(
                "Rollen",
                "Von oben nach unten, wie in der Liste. Links das Symbol, daneben der Name in der Liste. Über das Personen-Symbol bekommt jede Person einen eigenen Titel.",
                el("div", "rlroles", ...(settings.roles.length ? settings.roles.map(roleRow) : [el("p", "hintline", "Noch keine Rolle – füg unten die erste hinzu.")])),
                el("div", "rladd", select(free.length ? free.map((role): [string, string] => [role.id, `@${role.name}`]) : [["", "Alle Rollen sind schon drin"]], picked, (value) => (picked = value), "Rolle hinzufügen"), add)
            ),
            card(
                "Was drinsteht",
                "",
                switchRow("Jeder nur einmal", "Wer mehrere Rollen hat, steht nur bei der obersten", settings.once, (on) => {
                    settings.once = on;
                    touch();
                }),
                switchRow("Leere Rollen ausblenden", "Sonst steht dort „Noch niemand“", settings.hideEmpty, (on) => {
                    settings.hideEmpty = on;
                    touch();
                }),
                switchRow("Anzahl je Rolle", "", settings.counts, (on) => {
                    settings.counts = on;
                    touch();
                }),
                ...(board
                    ? []
                    : [
                          row("Mitglieder zeigen als", "Erwähnungen sind anklickbar und pingen niemanden", select([["mention", "Erwähnung"], ["name", "Anzeigename"]], settings.as, (value) => {
                              settings.as = value as "mention" | "name";
                              touch();
                          }, "Mitglieder zeigen als")),
                      ]),
                row("Reihenfolge in einer Rolle", "", select([["abc", "Alphabetisch"], ["joined", "Am längsten auf dem Server zuerst"]], settings.sort, (value) => {
                    settings.sort = value as "abc" | "joined";
                    touch();
                }, "Reihenfolge"))
            ),
            board
                ? onlyImage
                : card(
                      "Kopf und Knopf",
                      "",
                      row("Überschrift", "Leer: der Name der Liste", input(settings.heading, d.limits.heading, "Überschrift", (value) => {
                          settings.heading = value;
                          touch();
                      })),
                      row("Text darunter", "Freiwillig, mit {anzahl}", input(settings.lead, d.limits.lead, "Text darunter", (value) => {
                          settings.lead = value;
                          touch();
                      })),
                      row("Bild rechts oben", "", select([["icon", "Server-Icon"], ["none", "Keins"]], settings.thumb, (value) => {
                          settings.thumb = value as "icon" | "none";
                          touch();
                      }, "Bild rechts oben")),
                      switchRow("Knopf", "Etwa „Ticket öffnen“ in einen Kanal, oder eine Webseite", settings.button.on, (on) => {
                          settings.button.on = on;
                          touch(true);
                      }),
                      ...buttonRows,
                      switchRow("„Zuletzt aktualisiert“", "Klein unter der Liste", settings.stamp, (on) => {
                          settings.stamp = on;
                          touch();
                      })
                  ),
        ];
    }

    async function refreshGallery(): Promise<void> {
        const loaded = await loadGallery(guildId, true).catch(() => null);

        gallery = new Map((loaded?.images ?? []).map((image) => [image.id, image.url]));
    }

    function imageTab(): HTMLElement[] {
        const d = data!;
        const list = draft!;

        if (list.design !== "board") {
            const on = button("btn btn--primary", icon("#i-image"), "Auf „Als Bild“ stellen");

            on.addEventListener("click", () => {
                list.design = "board";
                touch(true);
            });

            return [card("Das Bild ist aus", "Diese Liste steht gerade als Text in Discord. Stell das Design auf „Als Bild“, dann schickt der Bot nur noch das Bild.", el("div", "mcsave lvsave", on))];
        }

        const host = el("div", "rlimgeditor");

        renderImageEditor(host, {
            image: list.settings.image,
            heading: list.settings.heading,
            imagePresets: d.imagePresets,
            presets: d.presets,
            motifs: d.motifs,
            gallery: (id) => gallery.get(id) ?? null,
            onHeading: (value) => {
                list.settings.heading = value;
                touch();
            },
            onChange: (image) => {
                list.settings.image = image;
                touch();
            },
            onPickBackground: async () => {
                const id = await pickImage(guildId, [], ["gallery", "upload"]);

                if (id) await refreshGallery();

                return id;
            },
            onSavePreset: async (name, image) => {
                const answer = await call<{ presets: IPreset[] }>("", { action: "preset.save", name, image });

                if (answer) d.presets = answer.presets;

                return answer?.presets ?? null;
            },
            onRemovePreset: async (id) => {
                const answer = await call<{ presets: IPreset[] }>("", { action: "preset.remove", id });

                if (answer) d.presets = answer.presets;

                return answer?.presets ?? null;
            },
            // Plan 41: das Bild steht in der Mitte des Studios statt in der Spalte rechts.
            stage: preview,
            pageSave: () => saveButton,
        });

        return [host];
    }

    function paintList(): void {
        const d = data!;
        const list = draft!;
        const tabs = el("div", "tktabs");

        tabs.setAttribute("role", "tablist");

        for (const [key, label, symbol] of [["list", "Liste", "#i-list"], ["image", "Bild", "#i-image"]] as const) {
            const knob = button("tktab", icon(symbol), el("span", "", label), ...(key === "image" && list.design !== "board" ? [el("span", "tktab__count", "aus")] : []));

            knob.setAttribute("role", "tab");
            knob.setAttribute("aria-selected", String(tab === key));
            knob.addEventListener("click", () => {
                tab = key;
                paintList();
                schedulePreview();
            });
            tabs.append(knob);
        }

        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        // Steht die Liste schon im Kanal, bearbeitet der Bot diese Nachricht - er schickt keine zweite.
        const sent = Boolean(list.messageId);
        const send = button("btn btn--primary", icon("#i-arrow"), sent ? "Jetzt aktualisieren" : "Liste senden");
        const remove = confirmButton("btn btn--quiet", "#i-trash", "Liste löschen", "Wirklich löschen?", async () => {
            const answer = await call<{ ok: boolean }>("", { action: "remove", id: list.id });

            if (!answer) return;

            draft = null;
            await load();
            changed();
            go("");
        });

        save.disabled = !dirty;
        saveButton = save;
        save.addEventListener("click", async () => {
            save.disabled = true;

            const answer = await call<{ list: IList }>("", { action: "save", id: list.id, list: payload() });

            if (!answer) {
                save.disabled = false;

                return;
            }

            await load();
            draft = structuredClone(data!.lists.find((entry) => entry.id === list.id) ?? answer.list);
            dirty = false;
            changed();
            toast("info", "Gespeichert", draft.messageId ? "Die Liste im Kanal zieht in spätestens einer Minute nach." : "Mit „Liste senden“ steht sie im Kanal.");
            paintList();
        });
        send.addEventListener("click", async () => {
            send.disabled = true;

            if (dirty && !(await call<{ list: IList }>("", { action: "save", id: list.id, list: payload() }))) {
                send.disabled = false;

                return;
            }

            if (!d.intent && !window.confirm("Der Bot sieht gerade nicht alle Mitglieder – die Liste wäre unvollständig. Trotzdem senden?")) {
                send.disabled = false;

                return;
            }

            const answer = await call<{ list: IList }>("", { action: "send", id: list.id });

            send.disabled = false;

            if (!answer) return;

            await load();
            draft = structuredClone(data!.lists.find((entry) => entry.id === list.id) ?? answer.list);
            dirty = false;
            toast("info", sent ? "Aktualisiert" : "Gesendet", sent ? "Die Liste im Kanal ist auf dem neuen Stand." : "Die Liste steht im Kanal.");
            paintList();
        });

        const back = el("a", "rlback", "Alle Listen");

        back.href = `${BASE}/guild/${guildId}/role-lists`;
        back.addEventListener("click", (event) => {
            event.preventDefault();
            go("");
        });

        host.replaceChildren(
            ...(d.intent ? [] : [el("div", "notice", icon("#i-warn"), el("span", "", INTENT))]),
            el("div", "rlhead", el("b", "", list.name || "Liste"), back),
            tabs,
            // Plan 41: das Bild als Studio über die ganze Breite - die Vorschau steht darin.
            tab === "image" && list.design === "board"
                ? el("div", "rlcol", ...imageTab(), el("div", "mcsave lvsave", save, send, remove))
                : el("div", tab === "image" ? "rlgrid rlgrid--img" : "rlgrid", el("div", "rlcol", ...(tab === "image" ? imageTab() : listTab()), el("div", "mcsave lvsave", save, send, remove)), el("aside", "rlaside", preview))
        );
    }

    /* ------------------------------------------------------------
       Zeichnen
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) {
            host.replaceChildren(el("p", "hintline", "Die Listen lassen sich gerade nicht laden."));

            return;
        }

        const query = new URLSearchParams(window.location.search);
        const list = data.lists.find((entry) => entry.id === Number(query.get("liste")));

        if (!list) {
            draft = null;
            paintAll(query.has("neu"));

            return;
        }

        if (draft?.id !== list.id) {
            draft = structuredClone(list);
            dirty = false;
            tab = "list";
            open.clear();
        }

        paintList();
        schedulePreview();
    }

    window.addEventListener("rolelists:navigate", paint);
    window.addEventListener("popstate", paint);

    host.replaceChildren(el("p", "hintline", "Lädt …"));
    await Promise.all([load(), refreshGallery()]);
    paint();
}
