/**
 * Abschnitte: Clips der Woche.
 *
 * Die Hauptseite zeigt die laufende Runde und die Einstellungen (Kanäle,
 * Emoji, Termine, Preise). Darunter hängen drei Unterpunkte: die Ansagen, die
 * Sperrliste mit dem Ausschluss nach Strafen und das Archiv aller fertigen
 * Runden. Neue Clips und Stimmen kommen ohne Neuladen an (Pulse "clips").
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { clickSound } from "../core/Sound.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, face, IPerson, IRole, loading, localInput, personPicker, row, select, stat, toggle, WHEN } from "../core/Ui.js";
import { bodyEditor, IBody, IEmbed } from "../layout/BodyEditor.js";
import { emojiPicker, IServerEmoji } from "../layout/EmojiPicker.js";
import { IEditorContext } from "../layout/MessageEditor.js";
import { CLIP_IMAGES, CLIP_PLACEHOLDERS, CLIP_WINNER_PLACEHOLDERS, IPlaceholder } from "../constants/Placeholders.js";

type Repeat = "none" | "weekly" | "monthly";
type Notice = "open" | "voting" | "winners";
type Penalty = "warn" | "timeout" | "kick" | "ban";

interface ISchedule {
    openAt: number | null;
    closeAt: number | null;
    endAt: number | null;
    repeat: Repeat;
}

type IPenalties = Record<Penalty, number> & { days: number };

interface ISettings {
    channelId: string | null;
    announceChannelId: string | null;
    maxPerUser: number;
    emoji: string;
    auto: boolean;
    schedule: ISchedule;
    prizes: string[];
    publicBoard: boolean;
    notify: Record<Notice, boolean>;
    messages: Record<Notice, IBody>;
    penalties: IPenalties;
}

interface IWinner {
    place: number;
    name: string;
    votes: number;
    prize: string;
}

interface IRound {
    id: number;
    status: "open" | "voting" | "done";
    openedAt: number;
    closesAt: number;
    endsAt: number;
    winners: IWinner[];
}

interface IEntry {
    id: number;
    userName: string;
    votes: number;
    messageUrl: string;
    video: string | null;
    file: string | null;
    createdAt: number;
}

interface IExcluded {
    userId: string;
    name: string;
    reason: string;
    auto: boolean;
    at: number | null;
}

interface IPayload {
    settings: ISettings;
    round: IRound | null;
    entries: IEntry[];
    voters: number;
    nextOpen: number | null;
    publicUrl: string | null;
    missing: string[];
    excluded: IExcluded[];
    labels: { repeat: Record<Repeat, string>; notices: Record<Notice, string>; penalties: Record<Penalty, [string, string]> };
    bodyKinds: Record<string, string>;
    limits: { perUser: number; prize: number; places: number; penaltyCount: number; penaltyDays: number; reason: number; fileMegabytes: number };
    warnDays: number;
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[]; emojis: IServerEmoji[] };
}

interface IWeek {
    id: number;
    openedAt: number;
    endedAt: number | null;
    winners: IWinner[];
    count: number;
    folder: string;
}

interface IArchiveEntry {
    id: number;
    userName: string;
    votes: number;
    rank: number | null;
    place: number | null;
    video: string | null;
    size: number | null;
}

const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const MEDALS = ["🥇", "🥈", "🥉"];
const NOTICES: Notice[] = ["open", "voting", "winners"];
const PENALTIES: Penalty[] = ["warn", "timeout", "kick", "ban"];

const STATUS: Record<IRound["status"], string> = {
    open: "Einreichen läuft",
    voting: "Abstimmung läuft",
    done: "Fertig",
};

const NOTICE_HINTS: Record<Notice, string> = {
    open: "Geht raus, sobald der Kanal aufgeht. Zeiten wie {schluss} zeigt Discord in der Zeitzone jedes Lesers.",
    voting: "Kommt, wenn das Einreichen vorbei ist und unter jedem Clip das Emoji zum Abstimmen steht.",
    winners: "Kommt nach dem Ende der Abstimmung. Gepingt werden nur die Gewinner, danach leert der Bot den Clip-Kanal.",
};

function endpoint(guildId: string): string {
    return `${BASE}/api/guild/${encodeURIComponent(guildId)}/clips`;
}

function votesText(votes: number): string {
    return votes === 1 ? "1 Stimme" : `${votes} Stimmen`;
}

function megabytes(size: number): string {
    return `${(size / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

function warning(text: string): HTMLElement {
    return el("div", "notice", icon("#i-warn"), el("span", "", text));
}

function number(value: number, min: number, max: number, label: string, onChange: (value: number) => void): HTMLInputElement {
    const field = el("input", "text gwnum");

    field.type = "number";
    field.min = String(min);
    field.max = String(max);
    field.value = String(value);
    field.setAttribute("aria-label", label);
    field.addEventListener("input", () => onChange(Math.max(min, Math.min(max, Math.round(Number(field.value) || min)))));

    return field;
}

/* ------------------------------------------------------------
   Hauptseite: die laufende Runde und die Einstellungen
   ------------------------------------------------------------ */
export function renderClips(guildId: string): void {
    const host = need<HTMLElement>("#clipsBody");
    const note = need<HTMLElement>("#clipsNote");
    const call = api(endpoint(guildId), note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let dirty = false;

    const save = button("btn btn--primary", icon("#i-check"), "Speichern");

    const touch = (): void => {
        dirty = true;
        save.disabled = false;
    };

    const reload = async (keep = false): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;

        // Ein neuer Clip soll keine halb ausgefüllten Einstellungen überschreiben.
        if (!keep || !dirty) {
            draft = structuredClone(answer.settings);
            dirty = false;
        }

        paint();
    };

    function head(): HTMLElement {
        const round = data!.round;
        const next = round ? (round.status === "open" ? round.closesAt : round.endsAt) : data!.nextOpen;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-play", "Stand", round ? STATUS[round.status] : "Pause", round ? "is-ok" : ""),
            stat("#i-list-checks", "Clips", String(data!.entries.length)),
            stat("#i-users", "Stimmen", String(data!.voters)),
            stat("#i-clock", round ? (round.status === "open" ? "Einreichen bis" : "Abstimmung bis") : "Öffnet", next ? WHEN.format(next) : data!.settings.auto ? "kein Termin" : "von Hand")
        );
    }

    function warnings(): HTMLElement[] {
        const list: HTMLElement[] = [];

        if (!data!.settings.channelId) list.push(warning("Wähle unten den Clip-Kanal und speichere. Ohne ihn läuft nichts."));

        if (data!.missing.length) {
            list.push(
                warning(`Dem Bot fehlen im Clip-Kanal diese Rechte: ${data!.missing.join(", ")}. Ohne sie kann er den Kanal nicht öffnen und schließen, keine Reaktionen setzen oder ihn nicht leeren.`)
            );
        }

        return list;
    }

    /* --- Die laufende Runde --- */
    function step(label: string, symbol: string, action: "open" | "close" | "finish", sure: string, done: string): HTMLButtonElement {
        return confirmButton("btn btn--quiet", symbol, label, sure, async () => {
            if (!(await call("", { action }))) return;

            toast("info", "Erledigt", done);
            await reload();
        });
    }

    function clipRow(entry: IEntry, voting: boolean): HTMLElement {
        const view = el("a", "btn btn--quiet", icon("#i-external"), "Ansehen");

        // Die Kopie, sobald sie da ist - bis dahin die Nachricht in Discord.
        view.href = entry.video ?? entry.messageUrl;
        view.target = "_blank";
        view.rel = "noopener noreferrer";

        const remove = confirmButton("btn btn--quiet btn--icon is-danger", "#i-trash", "Entfernen", "Wirklich?", async () => {
            if (!(await call("", { action: "remove", id: entry.id }))) return;

            toast("info", "Entfernt", "Der Clip ist aus der Runde raus, samt Nachricht, Kopie und Stimmen.");
            await reload(true);
        });

        return el(
            "div",
            "plrow clrow",
            el("span", `tagline${entry.file ? " tagline--on" : ""}`, entry.file ? "gesichert" : "sichert …"),
            el("div", "plrow__main", el("b", "", entry.userName), el("span", "gwrow__facts", `hochgeladen ${WHEN.format(entry.createdAt)}`)),
            el("div", "clrow__side", ...(voting ? [el("span", "clvotes", votesText(entry.votes))] : []), view, remove)
        );
    }

    function roundCard(): HTMLElement {
        const round = data!.round;
        const actions = el("div", "mcsave clactions");

        if (!round) {
            const schedule = data!.settings.schedule;
            const ready = Boolean(data!.settings.channelId && schedule.closeAt && schedule.endAt && schedule.closeAt > Date.now());
            const start = step("Jetzt öffnen", "#i-play", "open", "Wirklich öffnen?", "Der Kanal ist offen, die Ansage ist raus.");

            start.disabled = !ready;
            actions.append(start);

            return card(
                "Diese Runde",
                data!.nextOpen
                    ? `Gerade läuft keine Runde. Nach Plan geht der Kanal am ${WHEN.format(data!.nextOpen)} auf – oder du öffnest ihn jetzt.`
                    : "Gerade läuft keine Runde, und es ist kein Termin geplant. Leg unten fest, wann der Kanal aufgeht, wann er schließt und wann gekürt wird.",
                ...(ready ? [] : [el("p", "hintline", "„Jetzt öffnen“ braucht den Clip-Kanal und Termine für Schließen und Ende, die noch kommen.")]),
                actions
            );
        }

        const voting = round.status === "voting";

        actions.append(
            voting
                ? step("Abstimmung jetzt beenden", "#i-crown", "finish", "Wirklich beenden?", "Die Gewinner stehen fest, alles ist gesichert und der Kanal geleert.")
                : step("Einreichen jetzt beenden", "#i-lock", "close", "Wirklich schließen?", "Der Kanal ist zu, unter jedem Clip steht das Emoji zum Abstimmen.")
        );

        const list = data!.entries.length
            ? el("div", "pllist", ...data!.entries.map((entry) => clipRow(entry, voting)))
            : el("div", "tkempty", icon("#i-play"), el("span", "", voting ? "In dieser Runde kam kein Clip." : "Noch kein Clip. Sobald jemand ein Video hochlädt, steht es hier."));

        return card(
            "Diese Runde",
            voting
                ? `Abstimmung bis ${WHEN.format(round.endsAt)}. ${data!.voters === 1 ? "Eine Person hat" : `${data!.voters} Personen haben`} mit ${data!.settings.emoji} abgestimmt.`
                : `Einreichen bis ${WHEN.format(round.closesAt)}, danach Abstimmung bis ${WHEN.format(round.endsAt)}.`,
            list,
            actions
        );
    }

    /* --- Einstellungen --- */
    function planText(schedule: ISchedule): string {
        if (!schedule.openAt || !schedule.closeAt || !schedule.endAt) return "Ohne Termine startet keine Runde von selbst.";
        if (schedule.repeat === "weekly") return "Nach jeder Runde rücken alle drei Termine um eine Woche weiter.";
        if (schedule.repeat === "monthly") return "Nach jeder Runde rücken alle drei Termine um einen Monat weiter, auf denselben Tag.";

        return "Eine einzelne Runde. Danach passiert nichts mehr, bis du neue Termine einträgst.";
    }

    function settingsCard(): HTMLElement {
        const cfg = draft!;
        const channels = data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`]);
        const plan = el("p", "hintline clplan", planText(cfg.schedule));

        const when = (label: string, hint: string, key: "openAt" | "closeAt" | "endAt"): HTMLElement => {
            const field = el("input", "text clwhen");

            field.type = "datetime-local";
            field.value = cfg.schedule[key] ? localInput(cfg.schedule[key]!) : "";
            field.addEventListener("change", () => {
                const value = field.value ? new Date(field.value).getTime() : null;

                cfg.schedule[key] = value !== null && Number.isFinite(value) ? value : null;
                plan.textContent = planText(cfg.schedule);
                touch();
            });

            return row(label, hint, field);
        };

        const emoji = emojiPicker({
            value: cfg.emoji,
            emojis: data!.guild.emojis,
            label: "Emoji zum Abstimmen",
            onPick: (value) => {
                if (!value) return;

                cfg.emoji = value;
                touch();
            },
        });

        const prizes = el(
            "div",
            "clprizes",
            ...Array.from({ length: data!.limits.places }, (_, index) => {
                const field = el("input", "text");

                field.type = "text";
                field.maxLength = data!.limits.prize;
                field.value = cfg.prizes[index] ?? "";
                field.placeholder = index === 0 ? "z. B. Discord Nitro" : "frei lassen: kein Preis";
                field.setAttribute("aria-label", `Preis für Platz ${index + 1}`);
                field.addEventListener("input", () => {
                    cfg.prizes[index] = field.value;
                    touch();
                });

                return el("label", "clprize", el("span", "", MEDALS[index] ?? `${index + 1}.`), field);
            })
        );

        const link = el("div", "cllink");

        if (data!.publicUrl) {
            const anchor = el("a", "", data!.publicUrl);
            const copy = button("btn btn--quiet", icon("#i-copy"), "Link kopieren");

            anchor.href = data!.publicUrl;
            anchor.target = "_blank";
            anchor.rel = "noopener";
            copy.addEventListener("click", async () => {
                await navigator.clipboard.writeText(data!.publicUrl!).catch(() => undefined);
                toast("info", "Kopiert", "Der Link zur Clip-Seite steht in der Zwischenablage.");
            });
            link.append(anchor, copy);
        }

        const switchRow = (label: string, hint: string, value: boolean, onChange: (on: boolean) => void, text = "an"): HTMLElement =>
            row(label, hint, el("label", "snitem__switch", toggle(value, label, onChange), el("span", "", text)));

        return card(
            "Einstellungen",
            `Im Clip-Kanal zählt nur ein Video bis ${data!.limits.fileMegabytes} MB. Alles andere löscht der Bot und sagt kurz, warum.`,
            el("h4", "srhead", "Kanäle"),
            row(
                "Clip-Kanal",
                "Nur hier wird hochgeladen und abgestimmt. Der Bot öffnet, schließt und leert ihn selbst",
                select([["", "— Kanal wählen —"], ...channels], cfg.channelId ?? "", (value) => {
                    cfg.channelId = value || null;
                    touch();
                }, "Clip-Kanal")
            ),
            row(
                "Ansagen in",
                "Ohne Angabe im Clip-Kanal – dort räumt das Leeren sie am Ende mit weg",
                select([["", "— im Clip-Kanal —"], ...channels], cfg.announceChannelId ?? "", (value) => {
                    cfg.announceChannelId = value || null;
                    touch();
                }, "Kanal für die Ansagen")
            ),
            el("h4", "srhead", "Abstimmung"),
            row("Emoji", "Setzt der Bot unter jeden Clip. Wer damit reagiert, stimmt ab – eine Stimme pro Person", emoji),
            row(
                "Clips je Person",
                `1 bis ${data!.limits.perUser} je Runde`,
                number(cfg.maxPerUser, 1, data!.limits.perUser, "Clips je Person", (value) => {
                    cfg.maxPerUser = value;
                    touch();
                })
            ),
            el("h4", "srhead", "Termine"),
            switchRow("Automatisch", "Aus: Runden starten nur über „Jetzt öffnen“", cfg.auto, (on) => {
                cfg.auto = on;
                touch();
            }),
            when("Kanal öffnet", "Ab hier wird hochgeladen", "openAt"),
            when("Kanal schließt", "Danach wird abgestimmt", "closeAt"),
            when("Abstimmung endet", "Dann stehen die Gewinner fest", "endAt"),
            row(
                "Wiederholen",
                "Was nach einer Runde mit den Terminen passiert",
                select(Object.entries(data!.labels.repeat) as [string, string][], cfg.schedule.repeat, (value) => {
                    cfg.schedule.repeat = value as Repeat;
                    plan.textContent = planText(cfg.schedule);
                    touch();
                }, "Wiederholen")
            ),
            plan,
            el("h4", "srhead", "Preise"),
            el("p", "hintline", "Stehen in den Ansagen. Bei Gleichstand gewinnt, wer früher hochgeladen hat, und niemand gewinnt zweimal."),
            prizes,
            el("h4", "srhead", "Öffentliche Seite"),
            switchRow("Freigeben", "Alle Runden mit Clips und Gewinnern ohne Anmeldung ansehen", cfg.publicBoard, (on) => {
                cfg.publicBoard = on;
                touch();
            }),
            ...(data!.publicUrl ? [link] : []),
            el("div", "mcsave", save)
        );
    }

    function paint(): void {
        if (!data || !draft) return;

        save.disabled = !dirty;
        host.replaceChildren(head(), ...warnings(), roundCard(), settingsCard());
    }

    save.addEventListener("click", async () => {
        const cfg = draft!;

        save.disabled = true;

        const answer = await call<{ settings: ISettings }>("", {
            action: "settings",
            settings: {
                channelId: cfg.channelId,
                announceChannelId: cfg.announceChannelId,
                maxPerUser: cfg.maxPerUser,
                emoji: cfg.emoji,
                auto: cfg.auto,
                schedule: cfg.schedule,
                prizes: cfg.prizes,
                publicBoard: cfg.publicBoard,
            },
        });

        if (!answer) {
            save.disabled = false;

            return;
        }

        toast("info", "Gespeichert", "Die Termine und Einstellungen gelten ab sofort.");
        await reload();
    });

    loading(host, 4);

    // Ein neuer Clip oder eine Stimme: die Liste zieht sich selbst nach.
    onPulse(guildId, ["clips"], debounce(() => void reload(true)));

    void reload();
}

/* ------------------------------------------------------------
   Unterpunkt: die drei Ansagen
   ------------------------------------------------------------ */
function embedOf(title: string, description: string): IEmbed {
    return { title, description, color: "#ff1e2d", url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] };
}

const DEFAULT_EMBEDS: Record<Notice, () => IEmbed> = {
    open: () => embedOf("🎬 Clips der Woche", "Lade im {kanal} {max} als Video hoch.\n\n{preise}"),
    voting: () => embedOf("🗳️ Abstimmung läuft", "{anzahl} sind dabei. Reagier im {kanal} mit {emoji} auf deinen Lieblingsclip."),
    winners: () => embedOf("🏆 Die Gewinner", "{gewinner}\n\n{link}"),
};

export function renderClipMessages(guildId: string): void {
    const host = need<HTMLElement>("#clipMessagesBody");
    const note = need<HTMLElement>("#clipMessagesNote");
    const call = api(endpoint(guildId), note);

    const draw = async (): Promise<void> => {
        const data = await call<IPayload>("");

        if (!data) return;

        const draft = { notify: structuredClone(data.settings.notify), messages: structuredClone(data.settings.messages) };
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            save.disabled = false;
        };
        const target = data.settings.announceChannelId ?? data.settings.channelId;
        const channel = target ? data.guild.channels.find((entry) => entry.id === target)?.name : null;
        const context = (list: IPlaceholder[]) => (): IEditorContext => ({
            guildId,
            values: Object.fromEntries(list.map((entry) => [entry.key, entry.sample])),
            roles: new Map(data.guild.roles.map((role) => [role.id, role.name])),
            channels: new Map(data.guild.channels.map((entry) => [entry.id, entry.name])),
            emojis: data.guild.emojis,
            placeholders: list,
            imagePlaceholders: [...CLIP_IMAGES],
            onChange: () => undefined,
        });

        const blocks = NOTICES.map((notice) => {
            const editor = bodyEditor(draft.messages[notice], {
                kinds: data.bodyKinds,
                context: context(notice === "winners" ? CLIP_WINNER_PLACEHOLDERS : CLIP_PLACEHOLDERS),
                defaultEmbed: DEFAULT_EMBEDS[notice],
                touch,
            });
            const on = toggle(draft.notify[notice], `${data.labels.notices[notice]} senden`, (value) => {
                draft.notify[notice] = value;
                touch();
            });

            return el(
                "div",
                "clnotice",
                el("div", "clnotice__head", el("b", "", data.labels.notices[notice]), el("label", "snitem__switch", on, el("span", "", "senden"))),
                el("p", "hintline", NOTICE_HINTS[notice]),
                editor.node
            );
        });

        save.disabled = true;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: draft }))) {
                save.disabled = false;

                return;
            }

            toast("info", "Gespeichert", "Die nächste Ansage sieht so aus.");
        });

        host.replaceChildren(
            card(
                "Die drei Ansagen",
                channel
                    ? `Sie gehen in #${channel}. Text, Embed oder Karte – mit Bildern, Platzhaltern und Live-Vorschau.`
                    : "Wähle zuerst auf der Hauptseite den Clip-Kanal. Ohne Kanal gehen keine Ansagen raus.",
                el("div", "tmmsgs", ...blocks),
                el("div", "mcsave lvsave", save)
            )
        );
    };

    loading(host, 0, 3);
    void draw();
}

/* ------------------------------------------------------------
   Unterpunkt: Sperrliste und Ausschluss nach Strafen
   ------------------------------------------------------------ */
/** Die Bereiche der Sperrliste - gebaut wie die der Moderation. */
type BlockTab = "list" | "block" | "settings";

const BLOCK_TABS: [BlockTab, string, string][] = [
    ["list", "#i-user-x", "Gesperrt"],
    ["block", "#i-gavel", "Neue Sperre"],
    ["settings", "#i-sliders", "Einstellungen"],
];

export function renderClipBlocked(guildId: string): void {
    const host = need<HTMLElement>("#clipBlockedBody");
    const note = need<HTMLElement>("#clipBlockedNote");
    const call = api(endpoint(guildId), note);
    const tabs = el("div", "tktabs");
    const pane = el("div", "tkpane");

    let data: IPayload | null = null;
    let penalties: IPenalties | null = null;
    let penaltiesDirty = false;
    let chosen: IPerson | null = null;
    let reason = "";
    let tab: BlockTab = "list";

    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Bereiche der Sperrliste");
    pane.id = "clBlockPane";
    pane.setAttribute("role", "tabpanel");

    // Pfeiltasten wechseln den Bereich, wie bei der Moderation.
    tabs.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

        if (!step) return;

        event.preventDefault();

        const index = BLOCK_TABS.findIndex(([id]) => id === tab);

        open(BLOCK_TABS[(index + step + BLOCK_TABS.length) % BLOCK_TABS.length][0]);
    });

    function open(next: BlockTab): void {
        // paintTabs() baut die Knöpfe neu - wer auf einem Reiter stand, steht danach auf dem neuen.
        const focused = tabs.contains(document.activeElement);

        if (next !== tab) clickSound("primary");

        tab = next;
        paint();

        if (focused) document.getElementById(`cltab-${tab}`)?.focus();
    }

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;

        if (!penaltiesDirty) penalties = structuredClone(answer.settings.penalties);

        paint();
    };

    function penaltiesCard(): HTMLElement {
        const draft = penalties!;
        const save = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            penaltiesDirty = true;
            save.disabled = false;
        };

        const rows = PENALTIES.map((key) => {
            const many = data!.labels.penalties[key][1];
            const count = number(draft[key] || (key === "warn" ? 3 : 1), 1, data!.limits.penaltyCount, `Ab so vielen ${many}`, (value) => {
                draft[key] = value;
                touch();
            });
            const on = toggle(draft[key] > 0, `${many} zählen`, (value) => {
                draft[key] = value ? Math.max(1, Number(count.value) || 1) : 0;
                count.disabled = !value;
                touch();
            });

            count.disabled = draft[key] === 0;

            const hint =
                key === "warn"
                    ? data!.warnDays
                        ? `Zählen ${data!.warnDays} Tage, wie in der Moderation eingestellt`
                        : "Zählen, solange sie gelten – wie in der Moderation eingestellt"
                    : "Zählen so viele Tage, wie unten steht";

            return row(many, hint, el("div", "clpenalty", el("label", "snitem__switch", on, el("span", "", "zählt")), el("span", "clpenalty__from", "ab"), count));
        });

        const days = number(draft.days, 1, data!.limits.penaltyDays, "Tage", (value) => {
            draft.days = value;
            touch();
        });

        save.disabled = !penaltiesDirty;
        save.addEventListener("click", async () => {
            save.disabled = true;

            if (!(await call("", { action: "settings", settings: { penalties: draft } }))) {
                save.disabled = false;

                return;
            }

            penaltiesDirty = false;
            toast("info", "Gespeichert", "Der Ausschluss nach Strafen gilt ab sofort.");
            await reload();
        });

        return card(
            "Ausschluss nach Strafen",
            "Wer die Schwelle erreicht, ist von selbst raus und darf wieder mitmachen, sobald die Strafen nicht mehr zählen. Eine zurückgenommene Verwarnung zählt nicht.",
            ...rows,
            row("Zeitraum", `Wie lange Timeouts, Kicks und Banns zählen – 1 bis ${data!.limits.penaltyDays} Tage`, el("div", "clpenalty", days, el("span", "clpenalty__from", "Tage"))),
            el("div", "mcsave lvsave", save)
        );
    }

    function blockCard(): HTMLElement {
        const field = el("input", "text");
        const add = button("btn btn--primary", icon("#i-user-x"), "Sperren");

        field.type = "text";
        field.maxLength = data!.limits.reason;
        field.value = reason;
        field.placeholder = "Freiwillig";
        field.addEventListener("input", () => {
            reason = field.value;
        });

        add.disabled = !chosen;
        add.addEventListener("click", async () => {
            const person = chosen;

            if (!person) return;

            add.disabled = true;

            if (!(await call("", { action: "block", userId: person.id, reason }))) {
                add.disabled = false;

                return;
            }

            toast("info", "Gesperrt", `${person.name} kann bei Clips der Woche nicht mehr mitmachen.`);
            chosen = null;
            reason = "";
            // Gleich dorthin, wo die Sperre jetzt steht.
            tab = "list";
            await reload();
        });

        return card(
            "Von Hand sperren",
            "Gilt sofort: Clips der Person aus der laufenden Runde fliegen raus, ihre Stimme zählt nicht.",
            personPicker(call, chosen, (person) => {
                chosen = person;
                paint();
            }),
            row("Grund", "Die Person sieht ihn, wenn sie etwas hochlädt", field),
            el("div", "mcsave lvsave", add)
        );
    }

    function listCard(): HTMLElement {
        const list = data!.excluded;

        if (!list.length) {
            const go = button("btn btn--quiet", icon("#i-gavel"), "Jemanden sperren");

            go.addEventListener("click", () => open("block"));

            return card("Gerade ausgeschlossen", "", el("div", "tkempty", icon("#i-check"), el("span", "", "Niemand. Alle dürfen mitmachen.")), el("div", "mcsave lvsave", go));
        }

        const rows = list.map((entry) => {
            const action = entry.auto
                ? el("span", "tagline", "nach Strafen")
                : confirmButton("btn btn--quiet", "#i-unlock", "Aufheben", "Wirklich?", async () => {
                      if (!(await call("", { action: "unblock", userId: entry.userId }))) return;

                      toast("info", "Aufgehoben", `${entry.name} darf wieder mitmachen.`);
                      await reload();
                  });
            const facts = entry.auto
                ? `Automatisch: ${entry.reason}. Hebt sich auf, sobald die Strafen nicht mehr zählen.`
                : `${entry.reason || "Ohne Grund"}${entry.at ? ` · seit ${DAY.format(entry.at)}` : ""}`;

            return el("div", "plrow clexrow", face({ name: entry.name, avatar: null }), el("div", "plrow__main", el("b", "", entry.name), el("span", "gwrow__facts", facts)), action);
        });

        return card("Gerade ausgeschlossen", list.length === 1 ? "Eine Person." : `${list.length} Personen.`, el("div", "pllist", ...rows));
    }

    function paintTabs(): void {
        tabs.replaceChildren(
            ...BLOCK_TABS.map(([id, symbol, label]) => {
                const knob = button("tktab", icon(symbol), el("span", "", label));

                knob.id = `cltab-${id}`;
                knob.tabIndex = id === tab ? 0 : -1;
                knob.setAttribute("role", "tab");
                knob.setAttribute("aria-selected", String(id === tab));
                knob.setAttribute("aria-controls", pane.id);
                knob.addEventListener("click", () => open(id));

                if (id === "list" && data!.excluded.length) knob.append(el("span", "tktab__count", String(data!.excluded.length)));

                return knob;
            })
        );
    }

    function paint(): void {
        if (!data || !penalties) return;

        // Beim ersten Mal steht hier noch das Gerüst vom Laden.
        if (!host.contains(tabs)) host.replaceChildren(tabs, pane);

        paintTabs();
        pane.setAttribute("aria-labelledby", `cltab-${tab}`);
        pane.replaceChildren(tab === "list" ? listCard() : tab === "block" ? blockCard() : penaltiesCard());
    }

    loading(host, 0, 3);
    onPulse(guildId, ["clips"], debounce(() => void reload()));
    void reload();
}

/* ------------------------------------------------------------
   Unterpunkt: das Archiv aller fertigen Runden
   ------------------------------------------------------------ */
export function renderClipArchive(guildId: string): void {
    const host = need<HTMLElement>("#clipArchiveBody");
    const note = need<HTMLElement>("#clipArchiveNote");
    const call = api(endpoint(guildId), note);
    const open = new Set<number>();
    const details = new Map<number, IArchiveEntry[]>();

    let weeks: IWeek[] = [];
    let publicUrl: string | null = null;
    let loaded = false;

    const reload = async (): Promise<void> => {
        const answer = await call<{ weeks: IWeek[]; publicUrl: string | null }>("?archive=1");

        if (!answer) return;

        weeks = answer.weeks;
        publicUrl = answer.publicUrl;
        loaded = true;
        paint();
    };

    async function flip(id: number): Promise<void> {
        if (open.has(id)) {
            open.delete(id);
            paint();

            return;
        }

        open.add(id);
        paint();

        if (!details.has(id)) {
            const answer = await call<{ entries: IArchiveEntry[] }>(`?round=${id}`);

            if (answer) details.set(id, answer.entries);

            paint();
        }
    }

    function clipCard(entry: IArchiveEntry): HTMLElement {
        const media = el("div", "clcard__media");

        if (entry.video) {
            const video = el("video");

            video.src = entry.video;
            video.controls = true;
            video.preload = "none";
            video.playsInline = true;
            video.setAttribute("aria-label", `Clip von ${entry.userName}`);
            media.append(video);
        } else {
            media.append(el("div", "clcard__link", icon("#i-play"), el("span", "", "Keine Kopie – das Video ließ sich nicht sichern.")));
        }

        const facts = [`Platz ${entry.rank ?? "–"}`, ...(entry.size ? [megabytes(entry.size)] : [])].join(" · ");

        return el(
            "article",
            `clcard${entry.place ? " is-winner" : ""}`,
            media,
            el(
                "div",
                "clcard__foot",
                el("div", "plrow__main", el("b", "", `${entry.place ? `${MEDALS[entry.place - 1] ?? ""} ` : ""}${entry.userName}`), el("span", "gwrow__facts", facts)),
                el("span", "clcard__votes", votesText(entry.votes))
            )
        );
    }

    function weekRow(week: IWeek): HTMLElement {
        const expanded = open.has(week.id);
        const show = button("btn btn--quiet", icon(expanded ? "#i-up" : "#i-eye"), expanded ? "Zuklappen" : "Clips ansehen");
        const remove = confirmButton("btn btn--quiet is-danger", "#i-trash", "Löschen", "Samt Videos löschen?", async () => {
            if (!(await call("", { action: "deleteRound", id: week.id }))) return;

            toast("info", "Gelöscht", "Die Runde und ihre Videos sind weg.");
            details.delete(week.id);
            open.delete(week.id);
            await reload();
        });

        show.setAttribute("aria-expanded", String(expanded));
        show.addEventListener("click", () => void flip(week.id));

        const side: HTMLElement[] = [];

        if (publicUrl) {
            const anchor = el("a", "btn btn--quiet", icon("#i-external"), "Öffentlich");

            anchor.href = `${publicUrl}?woche=${week.id}`;
            anchor.target = "_blank";
            anchor.rel = "noopener";
            side.push(anchor);
        }

        const winners = week.winners.length ? week.winners.map((winner) => `${MEDALS[winner.place - 1] ?? ""} ${winner.name}`).join(" · ") : "ohne Gewinner";
        const parts: HTMLElement[] = [
            el(
                "div",
                "clweek__head",
                el(
                    "div",
                    "plrow__main",
                    el("b", "", `Runde vom ${DAY.format(week.openedAt)}`),
                    el("span", "gwrow__facts", `${week.count === 1 ? "1 Clip" : `${week.count} Clips`} · ${winners}`),
                    el("code", "clweek__folder", `clips/…/${week.folder}`)
                ),
                el("div", "clrow__side", ...side, show, remove)
            ),
        ];

        if (expanded) {
            const list = details.get(week.id);

            parts.push(
                !list
                    ? el("p", "hintline", "Wird geladen …")
                    : list.length
                      ? el("div", "clgrid", ...list.map(clipCard))
                      : el("div", "tkempty", icon("#i-play"), el("span", "", "In dieser Runde kam kein Clip."))
            );
        }

        return el("div", "clweekrow", ...parts);
    }

    function paint(): void {
        if (!loaded) return;

        host.replaceChildren(
            weeks.length
                ? card(
                      "Fertige Runden",
                      `${weeks.length === 1 ? "Eine Runde" : `${weeks.length} Runden`}, neueste zuerst. Videos und runde.json liegen im Ordner des Bots unter clips/.`,
                      el("div", "clweeks", ...weeks.map(weekRow))
                  )
                : card("Fertige Runden", "", el("div", "tkempty", icon("#i-archive"), el("span", "", "Noch keine fertige Runde. Sobald eine Abstimmung endet, steht sie hier.")))
        );
    }

    loading(host, 0, 3);
    onPulse(guildId, ["clips"], debounce(() => void reload()));
    void reload();
}
