/**
 * Abschnitte: Level System und Belohnungen (Plan 34, Menü A).
 *
 * „Level System“: oben die Zahlen, darunter Punkte (Chat, Voice, Kurve, Bonus,
 * Ausnahmen), Schutz gegen Punkte-Farmen und der Nachtrag aus der
 * Server-Übersicht, dazu doppelte Punkte (Plan 37). „Belohnungen“: Aufsteigen
 * (wohin, löschen, Nachricht im Editor), die Belohnungsrollen und die
 * Aktivsten der Woche und des Monats (Plan 37). Beide teilen sich dieselben Einstellungen;
 * jede Seite speichert nur ihre eigenen Felder, damit keine die andere
 * überschreibt.
 */

import { BASE } from "../core/Base.js";
import { icon, maybe, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, el, IRole, loading, row, select, stat, toggle } from "../core/Ui.js";
import { BOOST_PLACEHOLDERS, LEVEL_IMAGES, LEVEL_PLACEHOLDERS } from "../constants/Placeholders.js";
import { IServerEmoji } from "../layout/EmojiPicker.js";
import { IMessageDoc } from "../layout/MessageEditor.js";
import { bodyEditor, IBody } from "../layout/BodyEditor.js";
import { LEVEL_FIELDS, LevelView, NoChannelHint } from "../constants/LevelFields.js";

interface IBonus {
    id: string;
    factor: number;
}

interface IReward {
    level: number;
    roleId: string;
}

/** Plan 37: ein Zeitfenster mit mehr Punkten - wie ILevelBoost im Bot. */
interface IBoost {
    id: string;
    kind: "once" | "weekly";
    factor: number;
    start: number | null;
    end: number | null;
    weekday: number | null;
    from: string | null;
    to: string | null;
    announce: boolean;
}

interface ITopPost {
    on: boolean;
    channelId: string | null;
    roleId: string | null;
}

/** Plan 37: der letzte Post der Aktivsten. */
interface ITopStatus {
    periodKey: string;
    error: string | null;
    postedAt: number;
}

interface ISettings {
    chat: { on: boolean; min: number; max: number; cooldown: number };
    voice: { on: boolean; xp: number; alone: boolean; muted: boolean };
    base: number;
    roleBonus: IBonus[];
    channelBonus: IBonus[];
    noChannels: string[];
    noRoles: string[];
    announce: "current" | "channel" | "off";
    announceChannelId: string | null;
    message: IMessageDoc | null;
    rewards: IReward[];
    stack: boolean;
    public: boolean;
    fair: { length: boolean; repeat: boolean; punished: boolean; automod: boolean };
    announceDelete: number;
    /** Plan 35: Aufstieg als Bild oder Text, die Zeile über dem Bild. */
    upMode?: "image" | "text";
    upLine: string;
    /** Plan 37 */
    boosts: IBoost[];
    boostChannelId: string | null;
    /** Plan 43: Beginn und Ende als eigene Nachricht. null: der bisherige Satz. */
    boostMessages?: { start: IMessageDoc | null; end: IMessageDoc | null };
    top: { week: ITopPost; month: ITopPost };
}

interface IBackfill {
    mode: "backfill" | "prefill" | "none";
    cutoff: number;
    members: number;
    xp: number;
    doneAt: number | null;
}

/** Plan 36: welche Felder zu welcher Seite gehören, steht in constants/LevelFields.ts. */
const FIELDS = LEVEL_FIELDS;

const NUMBER = new Intl.NumberFormat("de-DE");

/** Plan 37: wie im Bot - 0 ist Sonntag. */
const WEEKDAYS: [string, string][] = [
    ["1", "Montag"],
    ["2", "Dienstag"],
    ["3", "Mittwoch"],
    ["4", "Donnerstag"],
    ["5", "Freitag"],
    ["6", "Samstag"],
    ["0", "Sonntag"],
];
const MAX_BOOSTS = 10;

interface IRank {
    id: string;
    name: string;
    avatar: string | null;
    gone: boolean;
    rank: number;
    level: number;
    xp: number;
    into: number;
    need: number;
    messages: number;
    voiceMinutes: number;
}

interface IPayload {
    settings: ISettings;
    defaultMessage: IMessageDoc;
    /** Plan 43: die bisherigen Sätze als Vorlage, wenn jemand Beginn oder Ende selbst gestaltet. */
    defaultBoostMessages: { start: IMessageDoc; end: IMessageDoc };
    limits: { rewards: number; bonus: number; excluded: number; upLine: number };
    /** Plan 35: was gilt, auch wenn noch nichts gespeichert ist. */
    upMode: "image" | "text";
    page: number;
    total: number;
    top: IRank[];
    backfill: IBackfill | null;
    topStatus?: { week: ITopStatus | null; month: ITopStatus | null };
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[]; categories: { id: string; name: string }[]; emojis: IServerEmoji[] };
}

export function renderLevels(guildId: string, view: LevelView = "levels"): void {
    const host = need<HTMLElement>(view === "levels" ? "#levelBody" : "#levelRewardsBody");
    const note = need<HTMLElement>(view === "levels" ? "#levelNote" : "#levelRewardsNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/levels`, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let dirty = false;

    const save = el("button", "btn btn--primary") as HTMLButtonElement;

    function touch(): void {
        dirty = true;
        save.disabled = false;
    }

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const best = data!.top[0];
        // Kurz halten: die Kachel ist schmal, die Einzelheiten stehen in der Karte darunter.
        const chat = draft!.chat.on ? `${draft!.chat.min}–${draft!.chat.max}` : "aus";
        const voice = draft!.voice.on ? `${draft!.voice.xp}/min` : "aus";

        return el(
            "div",
            "tkhead snhead",
            stat("#i-chart-up", "Mit Punkten", String(data!.total)),
            stat("#i-crown", "Spitze", best ? `${best.name} · Level ${best.level}` : "noch niemand"),
            // Chat und Voice in einer Kachel - fünf nebeneinander brechen unschön um.
            stat("#i-message", "Punkte", `Chat ${chat} · Voice ${voice}`, draft!.chat.on || draft!.voice.on ? "is-ok" : ""),
            stat("#i-badge", "Belohnungsrollen", String(draft!.rewards.length))
        );
    }

    /* ------------------------------------------------------------
       Punkte
       ------------------------------------------------------------ */
    function points(): HTMLElement {
        const settings = draft!;
        const num = (value: number, min: number, max: number, onChange: (value: number) => void, label: string): HTMLInputElement => {
            const input = el("input", "text gwnum");

            input.type = "number";
            input.min = String(min);
            input.max = String(max);
            input.value = String(value);
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                onChange(Math.max(min, Math.min(max, Number(input.value) || 0)));
                touch();
            });

            return input;
        };

        const chatRange = el(
            "div",
            "lvrange",
            num(settings.chat.min, 0, 500, (value) => (settings.chat.min = value), "Punkte mindestens"),
            el("span", "lvrange__to", "bis"),
            num(settings.chat.max, 0, 500, (value) => (settings.chat.max = value), "Punkte höchstens")
        );

        return card(
            "Punkte",
            "Wie schnell es vorangeht. Die Punkte je Nachricht sind zufällig zwischen den beiden Werten – das macht Spam weniger berechenbar.",
            row(
                "Punkte für Nachrichten",
                "Nur alle paar Sekunden, sonst zählt jedes „k“",
                el("label", "snitem__switch", toggle(settings.chat.on, "Chat-Punkte", (on) => {
                    settings.chat.on = on;
                    touch();
                }), el("span", "", "an"))
            ),
            row("Punkte je Nachricht", "Zufällig zwischen beiden Werten", chatRange),
            row("Sperre", "So viele Sekunden zwischen zwei Nachrichten mit Punkten", num(settings.chat.cooldown, 0, 3600, (value) => (settings.chat.cooldown = value), "Sperre in Sekunden")),
            row(
                "Punkte für Voice",
                "Je angefangener Minute im Sprachkanal",
                el("label", "snitem__switch", toggle(settings.voice.on, "Voice-Punkte", (on) => {
                    settings.voice.on = on;
                    touch();
                }), el("span", "", "an"))
            ),
            row("Punkte je Minute", "0 schaltet sie faktisch ab", num(settings.voice.xp, 0, 500, (value) => (settings.voice.xp = value), "Punkte je Minute")),
            row(
                "Auch allein",
                "Sonst gibt es Punkte nur, wenn jemand anderes dabei ist",
                el("label", "snitem__switch", toggle(settings.voice.alone, "Auch allein", (on) => {
                    settings.voice.alone = on;
                    touch();
                }), el("span", "", "erlauben"))
            ),
            row(
                "Auch stumm",
                "Sonst zählt nicht, wer sich selbst stumm geschaltet hat",
                el("label", "snitem__switch", toggle(settings.voice.muted, "Auch stumm", (on) => {
                    settings.voice.muted = on;
                    touch();
                }), el("span", "", "erlauben"))
            ),
            row(
                "Kurve",
                `Level 1 braucht ${settings.base} Punkte, Level 10 insgesamt ${(settings.base * 10 * 11) / 2}`,
                num(settings.base, 10, 1000, (value) => {
                    settings.base = value;
                    paint();
                }, "Punkte je Stufe")
            ),
            bonusBox("Rollen mit Bonus", "Der höchste Faktor einer Rolle zählt", settings.roleBonus, data!.guild.roles.map((role) => [role.id, `@${role.name}`])),
            bonusBox("Kanäle mit Bonus", "Etwa doppelte Punkte im Vorstellungs-Kanal", settings.channelBonus, data!.guild.channels.map((channel) => [channel.id, `# ${channel.name}`])),
            listBox("Ohne Punkte: Kanäle", settings.noChannels, [
                ...data!.guild.channels.map((channel): [string, string] => [channel.id, `# ${channel.name}`]),
                ...data!.guild.categories.map((category): [string, string] => [category.id, `📁 ${category.name}`]),
            ]),
            listBox("Ohne Punkte: Rollen", settings.noRoles, data!.guild.roles.map((role) => [role.id, `@${role.name}`]))
        );
    }

    /** Eine Liste „Eintrag + Faktor" mit Hinzufügen und Entfernen. */
    function bonusBox(label: string, hint: string, list: IBonus[], options: [string, string][]): HTMLElement {
        const box = el("div", "lvbonus");
        const draw = (): void => {
            box.replaceChildren();

            for (const entry of list) {
                const name = options.find(([id]) => id === entry.id)?.[1] ?? entry.id;
                const factor = el("input", "text lvfactor");
                const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

                factor.type = "number";
                factor.min = "0.1";
                factor.max = "5";
                factor.step = "0.1";
                factor.value = String(entry.factor);
                factor.setAttribute("aria-label", `Faktor für ${name}`);
                factor.addEventListener("input", () => {
                    entry.factor = Math.max(0.1, Math.min(5, Number(factor.value) || 1));
                    touch();
                });

                remove.title = "Entfernen";
                remove.addEventListener("click", () => {
                    list.splice(list.indexOf(entry), 1);
                    touch();
                    draw();
                });

                box.append(el("div", "lvbonus__row", el("span", "lvbonus__name", name), el("span", "lvbonus__x", "×"), factor, remove));
            }

            const pick = select(
                [["", "— hinzufügen —"], ...options.filter(([id]) => !list.some((entry) => entry.id === id))],
                "",
                (value) => {
                    if (!value) return;

                    list.push({ id: value, factor: 2 });
                    touch();
                    draw();
                },
                `${label} hinzufügen`
            );

            pick.disabled = list.length >= data!.limits.bonus;
            box.append(pick);
        };

        draw();

        return row(label, hint, box);
    }

    /** Eine reine Auswahl-Liste (Kanäle oder Rollen ohne Punkte). */
    function listBox(label: string, list: string[], options: [string, string][]): HTMLElement {
        const box = el("div", "lvbonus");
        const draw = (): void => {
            box.replaceChildren();

            for (const id of list) {
                const chip = button("phchip", el("span", "", options.find(([entry]) => entry === id)?.[1] ?? id), icon("#i-x"));

                chip.title = "Entfernen";
                chip.addEventListener("click", () => {
                    list.splice(list.indexOf(id), 1);
                    touch();
                    draw();
                });
                box.append(chip);
            }

            const pick = select(
                [["", "— hinzufügen —"], ...options.filter(([id]) => !list.includes(id))],
                "",
                (value) => {
                    if (!value) return;

                    list.push(value);
                    touch();
                    draw();
                },
                `${label} hinzufügen`
            );

            pick.disabled = list.length >= data!.limits.excluded;
            box.append(pick);
        };

        draw();

        return row(label, "Hier sammelt niemand Punkte", box);
    }

    /* ------------------------------------------------------------
       Aufsteigen
       ------------------------------------------------------------ */
    function levelUp(): HTMLElement {
        const settings = draft!;
        const values: Record<string, string> = Object.fromEntries(LEVEL_PLACEHOLDERS.map((entry) => [entry.key, entry.sample]));

        settings.message ??= structuredClone(data!.defaultMessage);

        // Plan 39: das Nachrichten-Studio mit nur der Karte. Es ändert settings.message an Ort und Stelle (auch bei Vorlage und Rückgängig).
        const message: IBody = { kind: "v2", content: "", embed: null, doc: settings.message };
        const studio = (): HTMLElement =>
            bodyEditor(message, {
                pageSave: () => save,
                kinds: { v2: "Karte" },
                title: "Die Nachricht",
                templates: "levelUp",
                touch,
                context: () => ({
                    guildId,
                    values,
                    roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
                    channels: new Map(data!.guild.channels.map((channel) => [channel.id, channel.name])),
                    emojis: data!.guild.emojis,
                    placeholders: LEVEL_PLACEHOLDERS,
                    imagePlaceholders: LEVEL_IMAGES,
                    onChange: () => undefined,
                }),
                // Nur die Karte - ein Embed gibt es hier nicht.
                defaultEmbed: () => ({ title: null, description: null, color: null, url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] }),
            }).node;

        const where = select(
            [
                ["current", "Im Kanal, in dem es passiert"],
                ["channel", "In einem festen Kanal"],
                ["off", "Gar nicht"],
            ],
            settings.announce,
            (value) => {
                settings.announce = value as ISettings["announce"];
                touch();
                paint();
            },
            "Wohin die Aufstiegs-Nachricht geht"
        );

        const target = select(
            [["", "— Kanal wählen —"], ...data!.guild.channels.map((channel): [string, string] => [channel.id, `# ${channel.name}`])],
            settings.announceChannelId ?? "",
            (value) => {
                settings.announceChannelId = value || null;
                touch();
                paint();
            },
            "Kanal für die Aufstiegs-Nachricht"
        );

        // W-0043: Pflicht, solange die Nachricht an ist - per DM geht nichts mehr. Bei „Im Kanal, in dem es passiert“ landen hier Voice und Nachtrag.
        target.disabled = settings.announce === "off";

        const remove = select(
            [
                ["0", "Nein"],
                ["1", "Nach 1 Minute"],
                ["5", "Nach 5 Minuten"],
                ["15", "Nach 15 Minuten"],
                ["60", "Nach 60 Minuten"],
            ],
            String(settings.announceDelete ?? 0),
            (value) => {
                settings.announceDelete = Number(value);
                touch();
            },
            "Aufstiegs-Nachricht im Chat wieder löschen"
        );

        remove.disabled = settings.announce === "off";

        // Plan 35: Bild oder Text. Ohne gespeicherte Wahl gilt, was der Bot sagt (eigene Nachricht: Text, sonst Bild).
        settings.upMode ??= data!.upMode;

        const mode = select(
            [
                ["image", "Als Bild"],
                ["text", "Als Text-Nachricht"],
            ],
            settings.upMode,
            (value) => {
                settings.upMode = value as "image" | "text";
                touch();
                paint();
            },
            "Aufstieg als Bild oder als Text"
        );
        // Plan 36: Bild und Zeile darüber gestaltet man im Aufstiegs-Studio unter Level-Karte.
        const studioLink = el("a", "", "Level-Karte › Aufstieg");

        studioLink.href = `${BASE}/guild/${encodeURIComponent(guildId)}/level-card`;
        // Review I2: wie ein Klick in der Leiste, ohne Neuladen - sonst wäre das gerade umgestellte „Als Bild“ weg.
        studioLink.addEventListener("click", (event) => {
            const nav = maybe<HTMLAnchorElement>('a[data-section="level-card"]');

            if (!nav) return;

            event.preventDefault();
            (window as { levelCardTab?: string }).levelCardTab = "up";
            document.dispatchEvent(new Event("level-card:tab"));
            nav.click();
        });

        const asImage = settings.upMode === "image";

        return card(
            "Aufsteigen",
            "Was passiert, wenn jemand ein Level schafft.",
            row("Nachricht", "Im Kanal, in dem es passiert, oder an einer festen Stelle. Per DM schickt der Bot keine", where),
            row("Kanal", "Pflicht, solange die Nachricht an ist. Bei „Im Kanal, in dem es passiert“ landen hier die Aufstiege aus dem Voice", target),
            ...(settings.announce !== "off" && !settings.announceChannelId ? [el("p", "hintline", NoChannelHint(settings.announce))] : []),
            row("Wieder löschen", "Die Nachricht verschwindet nach dieser Zeit aus dem Kanal", remove),
            ...(settings.announce === "off" ? [] : [row("Als Bild oder Text", "Das Bild gestaltest du unter Level-Karte › Aufstieg", mode)]),
            ...(settings.announce === "off" || !asImage ? [] : [el("p", "hintline", "Das Bild und die Zeile darüber gestaltest du unter ", studioLink, ".")]),
            ...(settings.announce === "off" || asImage
                ? []
                : [
                      studio(),
                  ]),
            rewardBox()
        );
    }

    /** Rollen ab Level X. */
    function rewardBox(): HTMLElement {
        const settings = draft!;
        const box = el("div", "lvrewards");
        const draw = (): void => {
            box.replaceChildren();

            for (const reward of settings.rewards) {
                const role = data!.guild.roles.find((entry) => entry.id === reward.roleId);
                const level = el("input", "text gwnum");
                const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

                level.type = "number";
                level.min = "1";
                level.max = "999";
                level.value = String(reward.level);
                level.setAttribute("aria-label", `Ab welchem Level für ${role?.name ?? reward.roleId}`);
                level.addEventListener("input", () => {
                    reward.level = Math.max(1, Math.min(999, Number(level.value) || 1));
                    touch();
                });

                remove.title = "Entfernen";
                remove.addEventListener("click", () => {
                    settings.rewards.splice(settings.rewards.indexOf(reward), 1);
                    touch();
                    draw();
                });

                box.append(el("div", "lvreward", el("span", "lvreward__lead", "ab Level"), level, el("span", "lvreward__role", `@${role?.name ?? "gelöschte Rolle"}`), remove));
            }

            const pick = select(
                [["", "— Rolle hinzufügen —"], ...data!.guild.roles.filter((role) => !settings.rewards.some((reward) => reward.roleId === role.id)).map((role): [string, string] => [role.id, `@${role.name}`])],
                "",
                (value) => {
                    if (!value) return;

                    settings.rewards.push({ level: (settings.rewards.at(-1)?.level ?? 0) + 5, roleId: value });
                    touch();
                    draw();
                },
                "Belohnungsrolle hinzufügen"
            );

            pick.disabled = settings.rewards.length >= data!.limits.rewards;
            box.append(pick);
        };

        draw();

        const sync = button("btn btn--quiet", icon("#i-refresh"), "Rollen nachtragen");

        sync.title = "Vergibt fehlende Belohnungsrollen an alle, die das Level schon haben";
        sync.addEventListener("click", async () => {
            sync.disabled = true;

            const answer = await call<{ touched: number }>("", { action: "sync" });

            sync.disabled = false;

            if (answer) toast("info", "Nachgetragen", `${answer.touched} Mitglied(er) geprüft.`);
        });

        return el(
            "div",
            "lvrewardbox",
            row("Belohnungsrollen", `Bis ${data!.limits.rewards} Stück – die Rolle muss unter der höchsten Rolle des Bots stehen`, box),
            row(
                "Alte behalten",
                "Aus heißt: die neue Rolle ersetzt die vorherige",
                el("label", "snitem__switch", toggle(settings.stack, "Alte behalten", (on) => {
                    settings.stack = on;
                    touch();
                }), el("span", "", "sammeln"))
            ),
            el("div", "mcsave", sync)
        );
    }

    /* ------------------------------------------------------------
       Schutz gegen Punkte-Farmen (Plan 34)
       ------------------------------------------------------------ */
    function fair(): HTMLElement {
        const settings = draft!;

        settings.fair ??= { length: true, repeat: true, punished: true, automod: true };

        const flag = (key: keyof ISettings["fair"], label: string, hint: string): HTMLElement =>
            row(
                label,
                hint,
                el("label", "snitem__switch", toggle(settings.fair[key], label, (on) => {
                    settings.fair[key] = on;
                    touch();
                }), el("span", "", "an"))
            );

        return card(
            "Schutz gegen Punkte-Farmen",
            "Gezählt wird jede Nachricht und jede Minute im Sprachkanal. Punkte gibt es nur nach diesen Regeln.",
            flag("length", "Ab 5 Zeichen", "Nur Emojis, nur ein Link oder nur ein Sticker bringen keine Punkte"),
            flag("repeat", "Doppelt", "Dieselbe Nachricht zweimal hintereinander zählt nur einmal"),
            flag("punished", "Mod-Strafen", "Bei aktivem Timeout oder in der Quarantäne gibt es keine Punkte"),
            flag("automod", "AutoMod", "Nachrichten, die AutoMod löscht, bringen nichts")
        );
    }

    /* ------------------------------------------------------------
       Doppelte Punkte (Plan 37)
       ------------------------------------------------------------ */
    function boosts(): HTMLElement {
        const settings = draft!;
        const box = el("div", "lvboosts");
        // datetime-local rechnet in der Zeit des Browsers.
        const local = (at: number | null): string => (at === null ? "" : new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
        const stamp = (value: number | null, onChange: (at: number | null) => void, label: string): HTMLInputElement => {
            const input = el("input", "text lvstamp");

            input.type = "datetime-local";
            input.value = local(value);
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                const at = new Date(input.value).getTime();

                onChange(Number.isFinite(at) ? at : null);
                touch();
            });

            return input;
        };
        const time = (value: string | null, onChange: (text: string) => void, label: string): HTMLInputElement => {
            const input = el("input", "text lvtime");

            input.type = "time";
            input.value = value ?? "";
            input.setAttribute("aria-label", label);
            input.addEventListener("input", () => {
                onChange(input.value);
                touch();
            });

            return input;
        };

        settings.boosts ??= [];

        const draw = (): void => {
            box.replaceChildren();

            for (const boost of settings.boosts) {
                const kind = select(
                    [
                        ["weekly", "Jede Woche"],
                        ["once", "Einmal"],
                    ],
                    boost.kind,
                    (value) => {
                        const now = Date.now();

                        Object.assign(
                            boost,
                            value === "once"
                                ? { kind: "once", start: now, end: now + 2 * 3_600_000, weekday: null, from: null, to: null }
                                : { kind: "weekly", start: null, end: null, weekday: 5, from: "18:00", to: "23:00" }
                        );
                        touch();
                        draw();
                    },
                    "Wie oft"
                );
                const when =
                    boost.kind === "weekly"
                        ? [
                              select(WEEKDAYS, String(boost.weekday ?? 5), (value) => {
                                  boost.weekday = Number(value);
                                  touch();
                              }, "Wochentag"),
                              time(boost.from, (value) => (boost.from = value), "Von"),
                              el("span", "lvrange__to", "bis"),
                              time(boost.to, (value) => (boost.to = value), "Bis"),
                          ]
                        : [stamp(boost.start, (at) => (boost.start = at), "Beginn"), el("span", "lvrange__to", "bis"), stamp(boost.end, (at) => (boost.end = at), "Ende")];
                const factor = el("input", "text lvfactor");
                const remove = button("btn btn--quiet btn--icon", icon("#i-x"));

                factor.type = "number";
                factor.min = "1.1";
                factor.max = "3";
                factor.step = "0.1";
                factor.value = String(boost.factor);
                factor.setAttribute("aria-label", "Faktor");
                factor.addEventListener("input", () => {
                    boost.factor = Math.max(1.1, Math.min(3, Number(factor.value) || 2));
                    touch();
                });
                remove.title = "Entfernen";
                remove.setAttribute("aria-label", "Fenster entfernen");
                remove.addEventListener("click", () => {
                    settings.boosts.splice(settings.boosts.indexOf(boost), 1);
                    touch();
                    draw();
                });

                box.append(
                    el(
                        "div",
                        "lvboost",
                        kind,
                        ...when,
                        el("span", "lvbonus__x", "×"),
                        factor,
                        el("label", "snitem__switch", toggle(boost.announce, "Beginn und Ende ankündigen", (on) => {
                            boost.announce = on;
                            touch();
                        }), el("span", "", "ankündigen")),
                        remove
                    )
                );
            }

            const add = button("btn btn--quiet", icon("#i-plus"), "Fenster hinzufügen");

            add.disabled = settings.boosts.length >= MAX_BOOSTS;
            add.addEventListener("click", () => {
                settings.boosts.push({ id: Math.random().toString(36).slice(2, 10), kind: "weekly", factor: 2, start: null, end: null, weekday: 5, from: "18:00", to: "23:00", announce: false });
                touch();
                draw();
            });
            box.append(add);
        };

        draw();

        const channel = select(
            [["", "— kein Kanal —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            settings.boostChannelId ?? "",
            (value) => {
                settings.boostChannelId = value || null;
                touch();
            },
            "Kanal für die Ankündigungen"
        );

        // Plan 43: Beginn und Ende im Nachrichten-Studio. Aus heißt: der bisherige Satz, ohne Pings.
        const messages = (settings.boostMessages ??= { start: null, end: null });
        const values: Record<string, string> = Object.fromEntries(BOOST_PLACEHOLDERS.map((entry) => [entry.key, entry.sample]));
        const announcement = (edge: "start" | "end", label: string, plain: string): HTMLElement[] => {
            const doc = messages[edge];
            const own = el(
                "label",
                "snitem__switch",
                toggle(Boolean(doc), `Eigene Nachricht: ${label}`, (on) => {
                    messages[edge] = on ? structuredClone(data!.defaultBoostMessages[edge]) : null;
                    touch();
                    paint();
                }),
                el("span", "", doc ? "an" : "aus")
            );

            if (!doc) return [row(label, `Aus: „${plain}“`, own)];

            const body: IBody = { kind: "v2", content: "", embed: null, doc };

            return [
                row(label, "Rollen in der Nachricht werden angepingt, @everyone und @here nicht", own),
                bodyEditor(body, {
                    pageSave: () => save,
                    kinds: { v2: "Karte" },
                    title: label,
                    touch,
                    context: () => ({
                        guildId,
                        values,
                        roles: new Map(data!.guild.roles.map((role) => [role.id, role.name])),
                        channels: new Map(data!.guild.channels.map((entry) => [entry.id, entry.name])),
                        emojis: data!.guild.emojis,
                        placeholders: BOOST_PLACEHOLDERS,
                        imagePlaceholders: [],
                        onChange: () => undefined,
                    }),
                    defaultEmbed: () => ({ title: null, description: null, color: null, url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] }),
                }).node,
            ];
        };

        return card(
            "Doppelte Punkte",
            "Zu festen Zeiten bringen Nachrichten und Voice-Minuten mehr, zusätzlich zu den Boni. Überschneiden sich zwei Fenster, gilt das höhere. Wöchentliche Zeiten sind deutsche Zeit, 22:00 bis 02:00 geht über Mitternacht.",
            row("Zeitfenster", `Bis ${MAX_BOOSTS} Stück, Faktor 1,1 bis 3`, box),
            row("Ankündigen in", "Für Fenster mit „ankündigen“: Beginn und Ende. Ohne Kanal sagt der Bot nichts", channel),
            ...announcement("start", "Nachricht zum Beginn", "Ab jetzt: 2× XP bis Freitag 23:00."),
            ...announcement("end", "Nachricht zum Ende", "Die 2× XP sind vorbei."),
            el("p", "hintline", "Solange ein Fenster läuft, zeigt {boost} auf Level-Karte und Aufstiegs-Bild etwa „2× XP bis Freitag 23:00“. In den eigenen Nachrichten gibt es dazu {boost.factor}, {boost.start}, {boost.end} und {boost.end.relative}. Einmalige Fenster, die vorbei sind, verschwinden beim Speichern.")
        );
    }

    /* ------------------------------------------------------------
       Aktivste der Woche und des Monats (Plan 37)
       ------------------------------------------------------------ */
    function topCard(): HTMLElement {
        const settings = draft!;
        const off = (): ITopPost => ({ on: false, channelId: null, roleId: null });

        settings.top ??= { week: off(), month: off() };

        const date = (at: number) => new Date(at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        const period = (kind: "week" | "month", key: string): string => {
            const [year, month, day] = key.split("-").map(Number);

            return kind === "week" ? `die Woche ab ${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.` : new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
        };
        const part = (kind: "week" | "month", label: string, hint: string): HTMLElement => {
            const post = settings.top[kind];
            const state = data!.topStatus?.[kind] ?? null;
            const channel = select(
                [["", "— Kanal wählen —"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
                post.channelId ?? "",
                (value) => {
                    post.channelId = value || null;
                    touch();
                },
                `Kanal für ${label}`
            );
            const role = select(
                [["", "Keine Rolle"], ...data!.guild.roles.map((entry): [string, string] => [entry.id, `@${entry.name}`])],
                post.roleId ?? "",
                (value) => {
                    post.roleId = value || null;
                    touch();
                },
                `Rolle für ${label}`
            );

            channel.disabled = role.disabled = !post.on;

            return el(
                "div",
                "lvtop",
                row(label, hint, el("label", "snitem__switch", toggle(post.on, label, (on) => {
                    post.on = on;
                    touch();
                    paint();
                }), el("span", "", "an"))),
                row("Kanal", "Hier kommt das Bild hin", channel),
                row("Rolle für Platz 1 bis 3", "Wandert beim nächsten Post zu den neuen Plätzen. Sie muss unter der höchsten Rolle des Bots stehen", role),
                ...(state ? [el("p", `hintline${state.error ? " is-warn" : ""}`, `Zuletzt am ${date(state.postedAt)} für ${period(kind, state.periodKey)}.${state.error ? ` ${state.error}` : ""}`)] : [])
            );
        };

        return card(
            "Aktivste der Woche und des Monats",
            "Das Podium als Ranglisten-Bild im Stil von Level-Karte › Rangliste. Gezählt werden nur die Punkte im Zeitraum.",
            part("week", "Aktivste der Woche", "Montags um 18 Uhr, Montag bis Sonntag davor"),
            part("month", "Aktivste des Monats", "Am 1. um 18 Uhr, der ganze Vormonat")
        );
    }

    /* ------------------------------------------------------------
       Nachtrag aus der Server-Übersicht (Plan 34)
       ------------------------------------------------------------ */
    function backfill(): HTMLElement {
        const done = data!.backfill;
        const day = (at: number) => new Date(at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        const title = "Nachtrag aus der Server-Übersicht";
        const lead = "Einmalig beim Start: Was die Server-Übersicht vorher getrackt hat, wird als Punkte gutgeschrieben.";

        if (!done || done.doneAt === null) return card(title, lead, el("p", "hintline", done ? "Läuft gerade." : "Läuft beim nächsten Start des Bots."));
        if (done.mode === "none") return card(title, lead, el("p", "hintline", `Am ${day(done.doneAt)} gab es nichts nachzutragen.`));

        if (done.mode === "prefill") {
            return card(
                title,
                lead,
                el("p", "hintline", `Hier lief das Level System schon. Am ${day(done.doneAt)} wurden nur die Zeiträume 7 und 30 Tage vorgefüllt (${NUMBER.format(done.members)} Mitglieder). Lifetime blieb, wie es war.`)
            );
        }

        return card(
            title,
            lead,
            el(
                "div",
                "tkhead snhead",
                stat("#i-users", "Mitglieder", NUMBER.format(done.members)),
                stat("#i-chart-up", "Punkte gutgeschrieben", NUMBER.format(done.xp)),
                stat("#i-check", "Erledigt", day(done.doneAt), "is-ok")
            ),
            el(
                "p",
                "hintline",
                "Alles, was die Server-Übersicht getrackt hat, ohne Deckel: Nachrichten mal Ø Punkte je Nachricht, Voice-Minuten mal Punkte je Minute. Wer dadurch aufstieg, bekam eine Nachricht für den ganzen Sprung."
            )
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data || !draft) return;

        save.replaceChildren(icon("#i-check"), document.createTextNode("Speichern"));
        save.disabled = !dirty;

        host.replaceChildren(...(view === "levels" ? [head(), points(), boosts(), fair(), backfill()] : [levelUp(), topCard()]), el("div", "mcsave lvsave", save));
    }

    save.addEventListener("click", async () => {
        save.disabled = true;

        const own = Object.fromEntries(FIELDS[view].map((key) => [key, draft![key as keyof ISettings]]));
        const answer = await call<{ settings: ISettings }>("", { action: "save", settings: own });

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

    function load(): void {
        void call<IPayload>("").then((answer) => {
            if (!answer) return;

            data = answer;
            draft ??= structuredClone(answer.settings);
            paint();
        });
    }

    loading(host, 4);
    load();
}
