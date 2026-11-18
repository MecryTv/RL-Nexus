/**
 * Abschnitt: Temp Voice.
 *
 * Oben die Zahlen, darunter die Hubs ("Hier klicken"-Kanäle) mit ihren
 * Vorgaben, das Panel (im Chat des eigenen Kanals oder in einem festen Kanal)
 * und die Kanäle, die gerade offen sind.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { onPulse } from "../core/Pulse.js";
import { ago } from "../core/Format.js";
import { clickSound } from "../core/Sound.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, row, select, stat, toggle } from "../core/Ui.js";
import { openGroups, parseVoiceTab, PersonState, personStates, regionName, seatsText, VoiceTab, voiceTabHref } from "../constants/Voice.js";

const TABS: VoiceTab[] = ["hubs", "offen"];

// W-0143: Symbol je Status im Fenster eines offenen Kanals - immer mit Wort daneben.
const STATE_ICONS: Record<PersonState, string> = { stream: "#i-monitor", video: "#i-video", mute: "#i-mic-off", deaf: "#i-headphones-off" };
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Review W-0143: höchstens alle 1,5 s neu laden, auch wenn Meldungen ohne Pause kommen (Entprellen
 * würde dann nie feuern). Die letzte Meldung geht nie verloren: der geplante Lauf lädt danach.
 */
function throttle(run: () => void, wait = 1500): () => void {
    let timer: number | null = null;
    let last = 0;

    return () => {
        if (timer !== null) return;

        timer = window.setTimeout(
            () => {
                timer = null;
                last = Date.now();
                run();
            },
            Math.max(0, last + wait - Date.now())
        );
    };
}
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

/** „19:31 Uhr“; ab 20 Stunden mit Datum davor, sonst sähe gestern 21:00 aus wie heute. */
function clock(at: number): string {
    return `${Date.now() - at > 20 * 3_600_000 ? `${DAY.format(at)} ` : ""}${CLOCK.format(at)} Uhr`;
}

interface ISettings {
    name: string | null;
    limit: number;
    privacy: "public" | "private";
    stealth: boolean;
    region: string | null;
    trusted: string[];
    blocked: string[];
}

interface IHubConfig {
    name: string;
    categoryId: string | null;
    defaults: ISettings;
    actions: string[];
    presets: boolean;
    /** Support-Hub: Kanäle ohne Panel. Der Warteraum steht unter Moderation. */
    support: boolean;
}

interface IHub {
    id: number;
    channelId: string;
    channelName: string | null;
    config: IHubConfig;
}

interface IOpenPerson {
    id: string;
    name: string;
    username: string;
    avatar: string;
    owner: boolean;
    mute: boolean;
    deaf: boolean;
    stream: boolean;
    video: boolean;
}

/** Vertraute und Gesperrte: ohne Mitglied im Cache ist der Name die ID. */
interface IOpenName {
    id: string;
    name: string;
    avatar: string | null;
}

interface IOpen {
    channelId: string;
    /** Null bei alten Zeilen ohne Hub (temp_voices.hub_id). */
    hubId: number | null;
    name: string;
    owner: string;
    members: number;
    privacy: "public" | "private";
    createdAt: number;
    // W-0143: für das Fenster eines offenen Kanals.
    ownerId: string;
    support: boolean;
    stealth: boolean;
    /** 0: ohne Limit. */
    limit: number;
    /** kbps, 0 ohne Kanal im Cache. */
    bitrate: number;
    region: string | null;
    category: string | null;
    /** Besitzer zuerst, sonst nach Name. */
    people: IOpenPerson[];
    trusted: IOpenName[];
    blocked: IOpenName[];
}

interface IPayload {
    hubs: IHub[];
    max: number;
    maxPresets: number;
    settings: { panel: "voice" | "channel"; panelChannelId: string | null; panelMessageId: string | null };
    actions: { name: string; value: string; description: string; emoji: string }[];
    regions: [string, string][];
    open: IOpen[];
    guild: {
        name: string;
        roles: IRole[];
        channels: { id: string; name: string }[];
        voice: { id: string; name: string }[];
        categories: { id: string; name: string }[];
    };
}

export function renderVoice(guildId: string): void {
    const host = need<HTMLElement>("#voiceBody");
    const note = need<HTMLElement>("#voiceNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/voice`, note);

    let data: IPayload | null = null;
    // Review W-0143: Meldungen, während der Abschnitt versteckt war; Zähler gegen Antworten in falscher Reihenfolge.
    let stale = false;
    let pulseSeq = 0;
    let open: number | null = null;
    let headNode: HTMLElement = el("div");
    let openNode: HTMLElement = el("div");
    // W-0140: Reiter Hubs | Gerade offen; die Adresse merkt sich den Reiter.
    let tab: VoiceTab = parseVoiceTab(window.location.search);
    let navNode: HTMLElement = el("div");
    const panes: Record<VoiceTab, HTMLElement> = { hubs: el("div"), offen: el("div") };
    const drafts = new Map<number, { config: IHubConfig; dirty: boolean }>();

    function draftOf(hub: IHub): { config: IHubConfig; dirty: boolean } {
        let draft = drafts.get(hub.id);

        if (!draft) {
            draft = { config: structuredClone(hub.config), dirty: false };
            drafts.set(hub.id, draft);
        }

        return draft;
    }

    /* ------------------------------------------------------------
       Kopf und Hinzufügen
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const panel = data!.settings;
        const channel = panel.panelChannelId ? data!.guild.channels.find((entry) => entry.id === panel.panelChannelId) : null;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-mic", "Hubs", `${data!.hubs.length} / ${data!.max}`),
            stat("#i-users", "Offene Kanäle", String(data!.open.length), data!.open.length ? "is-live" : ""),
            stat("#i-layout", "Panel", panel.panel === "voice" ? "im Sprachkanal" : channel ? `#${channel.name}` : "kein Kanal", panel.panel === "voice" || channel ? "is-ok" : "is-warn"),
            stat("#i-star", "Presets", data!.hubs.some((hub) => hub.config.presets) ? `bis ${data!.maxPresets} je User` : "aus")
        );
    }

    function addBar(): HTMLElement {
        const used = new Set(data!.hubs.map((hub) => hub.channelId));
        const free = data!.guild.voice.filter((entry) => !used.has(entry.id));
        const pick = select(
            [["", free.length ? "(Sprachkanal wählen)" : "Alle Sprachkanäle sind schon Hubs"], ...free.map((entry): [string, string] => [entry.id, `🔊 ${entry.name}`])],
            "",
            () => undefined,
            "Sprachkanal für den Hub"
        );
        const go = button("btn btn--primary snadd__go", icon("#i-plus"), "Hub anlegen");
        const full = data!.hubs.length >= data!.max;

        pick.className = "pick snadd__input";
        go.disabled = full;
        go.addEventListener("click", async () => {
            if (!pick.value) {
                toast("info", "Kein Kanal gewählt", "Wähle den Sprachkanal, den alle zum Anlegen betreten.");

                return;
            }

            go.disabled = true;
            clickSound("primary");

            const answer = await call<{ hub: IHub }>("", { action: "add", channelId: pick.value });

            go.disabled = false;

            if (!answer) return;

            data!.hubs.push(answer.hub);
            open = answer.hub.id;
            toast("info", "Hub angelegt", `Wer „${answer.hub.channelName}“ betritt, bekommt jetzt seinen eigenen Kanal.`);
            paint();
        });

        return card(
            "Hub hinzufügen",
            full
                ? `Mehr als ${data!.max} Hubs gehen nicht. Entferne erst einen.`
                : "Ein Sprachkanal zum Anklicken: Wer ihn betritt, bekommt einen eigenen Kanal und wird hineingezogen. Der Hub selbst bleibt leer.",
            el("div", "snadd__row", icon("#i-mic"), pick, go)
        );
    }

    /* ------------------------------------------------------------
       Ein Hub
       ------------------------------------------------------------ */
    function item(hub: IHub): HTMLElement {
        const draft = draftOf(hub);
        const isOpen = open === hub.id;
        const edit = button("btn btn--quiet snitem__edit", icon(isOpen ? "#i-up" : "#i-sliders"), isOpen ? "Zuklappen" : "Bearbeiten");
        const remove = confirmButton("btn btn--quiet btn--icon", "#i-trash", "Hub entfernen", "Wirklich entfernen?", async () => {
            const answer = await call("", { action: "remove", id: hub.id });

            if (!answer) return;

            data!.hubs = data!.hubs.filter((entry) => entry.id !== hub.id);
            drafts.delete(hub.id);
            toast("info", "Hub entfernt", "Hier entsteht kein neuer Kanal mehr.");
            paint();
        });

        edit.addEventListener("click", () => {
            open = isOpen ? null : hub.id;
            paint();
        });

        const box = el(
            "div",
            `snitem${isOpen ? " is-open" : ""}`,
            el(
                "div",
                "snitem__head",
                el("div", "snitem__face", icon("#i-mic")),
                el("div", "snitem__name", el("b", "", hub.channelName ? `🔊 ${hub.channelName}` : "(Kanal gelöscht)"), el("span", "", `Neue Kanäle heißen „${hub.config.name}“`)),
                edit,
                remove
            )
        );

        if (isOpen) box.append(body(hub, draft));

        return box;
    }

    function body(hub: IHub, draft: { config: IHubConfig; dirty: boolean }): HTMLElement {
        const config = draft.config;
        const saveButton = button("btn btn--primary", icon("#i-check"), "Speichern");
        const touch = (): void => {
            draft.dirty = true;
            saveButton.disabled = false;
        };

        saveButton.disabled = !draft.dirty;

        const name = el("input", "text");

        name.type = "text";
        name.value = config.name;
        name.maxLength = 90;
        name.setAttribute("aria-label", "Vorlage für den Namen");
        name.addEventListener("input", () => {
            config.name = name.value;
            touch();
        });

        const category = select(
            [["", "Wie der Hub"], ...data!.guild.categories.map((entry): [string, string] => [entry.id, entry.name])],
            config.categoryId ?? "",
            (value) => {
                config.categoryId = value || null;
                touch();
            },
            "Kategorie für neue Kanäle"
        );

        const limit = el("input", "text gwnum");

        limit.type = "number";
        limit.min = "0";
        limit.max = "99";
        limit.value = String(config.defaults.limit);
        limit.setAttribute("aria-label", "Plätze");
        limit.addEventListener("input", () => {
            config.defaults.limit = Math.max(0, Math.min(99, Number(limit.value) || 0));
            touch();
        });

        const privacy = select(
            [
                ["public", "Offen (jeder darf rein)"],
                ["private", "Privat (nur Vertraute)"],
            ],
            config.defaults.privacy,
            (value) => {
                config.defaults.privacy = value === "private" ? "private" : "public";
                touch();
            },
            "Zutritt"
        );

        const region = select(
            data!.regions.map(([value, label]): [string, string] => [value, label]),
            config.defaults.region ?? "",
            (value) => {
                config.defaults.region = value || null;
                touch();
            },
            "Region"
        );

        const stealth = toggle(config.defaults.stealth, "Neue Kanäle sind unsichtbar", (on) => {
            config.defaults.stealth = on;
            touch();
        });

        const presets = toggle(config.presets, "Eigene Presets erlauben", (on) => {
            config.presets = on;
            touch();
        });

        const actions = el("div", "vcactions");

        for (const action of data!.actions) {
            const box = toggle(config.actions.includes(action.value), action.name, (on) => {
                config.actions = on ? [...config.actions, action.value] : config.actions.filter((entry) => entry !== action.value);
                touch();
            });

            actions.append(el("label", "snkind", box, el("span", "", `${action.emoji} ${action.name}`)));
        }

        saveButton.addEventListener("click", async () => {
            saveButton.disabled = true;

            const answer = await call<{ hub: IHub }>("", { action: "save", id: hub.id, config });

            if (!answer) {
                saveButton.disabled = false;

                return;
            }

            const index = data!.hubs.findIndex((entry) => entry.id === hub.id);

            data!.hubs[index] = answer.hub;
            drafts.delete(hub.id);
            toast("info", "Gespeichert", "Gilt ab dem nächsten Kanal.");
            paint();
        });

        /* --- Support-Hub: Kanäle ohne Panel. Den Warteraum gibt es unter Moderation. --- */
        const offHint = "Abgeschaltete Optionen stehen im Auswahlmenü nicht mehr drin.";
        const supportHint = "Ein Support-Hub schickt kein Panel. Diese Optionen greifen dort nicht.";
        const panelHint = el("p", "hintline", config.support ? supportHint : offHint);
        const supportSwitch = toggle(config.support, "Support-Hub", (on) => {
            config.support = on;
            panelHint.textContent = on ? supportHint : offHint;
            touch();
        });

        return el(
            "div",
            "snitem__body",
            el(
                "div",
                "snsettings",
                row("Name der Kanäle", "Vorlage: {user}, {nummer} und {spiel} werden ersetzt", name),
                row("Kategorie", "Wo die neuen Kanäle landen", category),
                row("Plätze", "0 heißt unbegrenzt", limit),
                row("Zutritt", "Gilt für jeden neuen Kanal", privacy),
                row("Region", "Automatisch reicht fast immer", region),
                row("Unsichtbar", "Nur wer eingeladen ist, sieht den Kanal", el("label", "snitem__switch", stealth, el("span", "", "Stealth"))),
                row("Presets", `Bis zu ${data!.maxPresets} eigene Einstellungen je User`, el("label", "snitem__switch", presets, el("span", "", "erlauben")))
            ),
            el("h4", "sneditor__title vctitle", "Support"),
            el(
                "p",
                "hintline",
                "Für Teamler: Wer diesen Hub betritt, bekommt einen eigenen Talk ohne Panel. Mit „Übernehmen“ in der Meldung des Warteraums holt der Bot den Wartenden dorthin. Den Warteraum selbst stellst du unter Moderation ein. Tipp: Gib in Discord nur dem Team das Recht, diesen Hub zu betreten."
            ),
            el("div", "snsettings", row("Support-Hub", "Kanäle aus diesem Hub bekommen kein Panel", el("label", "snitem__switch", supportSwitch, el("span", "", "an")))),
            el("h4", "sneditor__title vctitle", "Was das Panel anbietet"),
            panelHint,
            actions,
            el("div", "mcsave snitem__foot", saveButton)
        );
    }

    /* ------------------------------------------------------------
       Panel und offene Kanäle
       ------------------------------------------------------------ */
    function panelCard(): HTMLElement {
        const settings = { ...data!.settings };
        const saveButton = button("btn btn--primary", icon("#i-check"), "Speichern");
        const send = button("btn btn--quiet", icon("#i-message"), "Panel senden");
        const where = select(
            [
                ["voice", "In den Chat des eigenen Kanals"],
                ["channel", "In einen festen Kanal"],
            ],
            settings.panel,
            (value) => {
                settings.panel = value === "channel" ? "channel" : "voice";
                saveButton.disabled = false;
                target.disabled = settings.panel !== "channel";
            },
            "Wohin das Panel geht"
        );
        const target = select(
            [["", "(Kanal wählen)"], ...data!.guild.channels.map((entry): [string, string] => [entry.id, `# ${entry.name}`])],
            settings.panelChannelId ?? "",
            (value) => {
                settings.panelChannelId = value || null;
                saveButton.disabled = false;
            },
            "Kanal für das Panel"
        );

        target.disabled = settings.panel !== "channel";
        saveButton.disabled = true;
        saveButton.addEventListener("click", async () => {
            saveButton.disabled = true;

            const answer = await call<{ settings: IPayload["settings"] }>("", { action: "settings", settings });

            if (!answer) {
                saveButton.disabled = false;

                return;
            }

            data!.settings = answer.settings;
            toast("info", "Gespeichert", answer.settings.panel === "voice" ? "Das Panel steht künftig im Chat des eigenen Kanals." : "Schick das Panel unten in den Kanal.");
            paint();
        });

        send.addEventListener("click", async () => {
            send.disabled = true;

            const answer = await call<{ url: string }>("", { action: "panel" });

            send.disabled = false;

            if (answer) toast("info", "Panel gesendet", "Es bleibt stehen und gilt für alle.");
        });

        return card(
            "Steuer-Panel",
            "Das Auswahlmenü, mit dem jeder seinen eigenen Kanal einstellt. Im Chat des Sprachkanals steht es automatisch. Ein fester Kanal ist praktisch, wenn ihr die Kanal-Chats aus habt.",
            row("Wohin", "Im Sprachkanal-Chat oder an einer festen Stelle", where),
            row("Fester Kanal", "Nur nötig, wenn das Panel an einer Stelle stehen soll", target),
            el("div", "mcsave", ...(data!.settings.panel === "channel" ? [send] : []), saveButton)
        );
    }

    /** W-0140: Inhalt des Reiters Gerade offen - ab zwei Hubs nach Hub gruppiert. */
    function openList(): HTMLElement {
        if (!data!.open.length) {
            const toHubs = button("btn btn--quiet", icon("#i-mic"), "Zum Reiter Hubs");

            toHubs.addEventListener("click", () => {
                choose("hubs");
                // Der Knopf verschwindet mit dem Reiter - der Fokus geht auf den Reiter Hubs, nicht auf die Seite.
                navNode.querySelector<HTMLElement>("#vctab-hubs")?.focus();
            });

            return el(
                "div",
                "tkempty tkempty--big",
                icon("#i-mic"),
                el("b", "", "Noch ruhig."),
                el("span", "", "Keine Kanäle offen. Sobald jemand einen Hub betritt, steht er hier."),
                ...(data!.hubs.length ? [] : [toHubs])
            );
        }

        // W-0143: Die Zeile ist ein Knopf, der Klick öffnet das Fenster mit allen Infos.
        const openRow = (entry: IOpen): HTMLElement => {
            const rowButton = button(
                "plrow vcrow",
                el("span", "snitem__face vcface", icon("#i-mic")),
                el(
                    "span",
                    "plrow__main",
                    el("span", "plrow__top", el("b", "", entry.name), el("span", `chip ${entry.privacy === "private" ? "chip--warn" : ""}`, entry.privacy === "private" ? "privat" : "offen")),
                    el("span", "gwrow__facts", `${entry.owner} · ${entry.members} drin · seit ${ago(entry.createdAt)}`)
                ),
                el("span", "vcrow__go", "Infos", icon("#i-chevron"))
            );

            rowButton.dataset.channel = entry.channelId;
            rowButton.setAttribute("aria-haspopup", "dialog");
            rowButton.addEventListener("click", () => viewOpen(entry.channelId));

            return rowButton;
        };

        return el(
            "div",
            "",
            el("p", "hintline", `${data!.open.length} ${data!.open.length === 1 ? "Kanal" : "Kanäle"} offen. Sie verschwinden, sobald der Letzte rausgeht.`),
            ...openGroups(data!.open, data!.hubs).flatMap((group) => [...(group.title ? [el("h4", "srhead", group.title)] : []), el("div", "pllist", ...group.items.map(openRow))])
        );
    }

    /** W-0140: Reiterleiste wie bei Anti Villain - Zahl am Reiter, Pfeiltasten, Pos1 und Ende. */
    function nav(): HTMLElement {
        const bar = el("div", "avnav");
        const entries: [VoiceTab, string, string, number][] = [
            ["hubs", "Hubs", "#i-mic", data!.hubs.length],
            ["offen", "Gerade offen", "#i-users", data!.open.length],
        ];

        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Temp Voice");

        for (const [id, label, symbol, count] of entries) {
            // Grau, solange nichts offen ist; grün mit Punkt, sobald ein Kanal läuft.
            const tabButton = button("", icon(symbol), label, el("span", `avnav__count vcnav__count${id === "offen" && count ? " is-live" : ""}`, String(count)));

            tabButton.id = `vctab-${id}`;
            tabButton.setAttribute("role", "tab");
            tabButton.setAttribute("aria-controls", `vcpane-${id}`);
            tabButton.addEventListener("click", () => choose(id));
            bar.append(tabButton);
        }

        bar.addEventListener("keydown", (event) => {
            const index = TABS.indexOf(tab);
            const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];

            if (next === undefined) return;

            event.preventDefault();
            choose(TABS[(next + TABS.length) % TABS.length]!);
            bar.querySelector<HTMLElement>(`#vctab-${tab}`)?.focus();
        });

        return bar;
    }

    function choose(next: VoiceTab): void {
        tab = next;
        history.replaceState(null, "", voiceTabHref(BASE, guildId, tab));
        show();
    }

    /** Nur ein- und ausblenden, nichts neu bauen: ein offener Hub-Editor behält seine Eingaben. */
    function show(): void {
        for (const id of TABS) {
            const tabButton = navNode.querySelector<HTMLButtonElement>(`#vctab-${id}`);

            if (tabButton) {
                tabButton.setAttribute("aria-selected", String(tab === id));
                tabButton.tabIndex = tab === id ? 0 : -1;
            }

            panes[id].hidden = tab !== id;
        }
    }

    /* ------------------------------------------------------------
       W-0143: ein offener Kanal groß - nur ansehen, wie die Fallansicht
       der Moderation. Frischt sich mit jedem Pulse auf.
       ------------------------------------------------------------ */
    const viewTitle = el("h2", "", "");
    const viewSub = el("p", "");
    const viewBody = el("div", "modal__body mcview__body vcview__body");
    const viewId = el("span", "");
    const viewLink = el("a", "", icon("#i-external"), "In Discord öffnen");
    const viewFoot = el("div", "vcview__foot", viewId, viewLink);
    const closeView = button("iconbtn modal__x", icon("#i-x"));
    const dialog = el(
        "dialog",
        "modal mcview vcview",
        el("div", "modal__head mcview__head", el("span", "snitem__face vcface", icon("#i-mic")), el("div", "mcview__title", viewTitle, viewSub), closeView),
        viewBody,
        viewFoot
    );
    let shownId: string | null = null;
    // Review W-0143: Wer die Kanal-ID markiert und außerhalb loslässt, soll das Fenster nicht schließen.
    let downOutside = false;

    viewLink.target = "_blank";
    viewLink.rel = "noopener";
    viewTitle.id = "vcViewTitle";
    dialog.setAttribute("aria-labelledby", "vcViewTitle");
    closeView.autofocus = true;
    closeView.setAttribute("aria-label", "Schließen");
    document.body.append(dialog);

    /** Zu: der Fokus geht zurück auf die Zeile, auch wenn die Liste inzwischen neu gebaut ist. */
    function hideOpen(): void {
        const id = shownId;

        shownId = null;

        if (dialog.open) dialog.close();
        // Ist die Zeile inzwischen weg (Kanal zu), landet der Fokus auf dem Reiter.
        if (id) (openNode.querySelector<HTMLElement>(`[data-channel="${id}"]`) ?? navNode.querySelector<HTMLElement>("#vctab-offen"))?.focus();
    }

    closeView.addEventListener("click", hideOpen);
    dialog.addEventListener("pointerdown", (event) => {
        downOutside = event.target === dialog;
    });
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog && downOutside) hideOpen();
    });
    dialog.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        hideOpen();
    });
    dialog.addEventListener("close", () => {
        if (shownId) hideOpen();
    });

    function viewOpen(channelId: string): void {
        shownId = channelId;
        paintOpenView();

        if (!dialog.open) dialog.showModal();
    }

    function tile(symbol: string, label: string, value: string, sub: string, ...extra: Node[]): HTMLElement {
        return el("div", "vcview__tile", el("span", "vcview__label", icon(symbol), label), el("b", "", value), el("small", "", sub), ...extra);
    }

    function face(url: string | null, className: string): HTMLElement {
        if (!url) return el("i", className);

        const image = el("img", className);

        image.src = url;
        image.alt = "";
        image.loading = "lazy";

        return image;
    }

    function names(list: IOpenName[], bad = false): HTMLElement {
        if (!list.length) return el("p", "tkempty", "niemand");

        return el("div", "vcnames", ...list.map((entry) => el("span", `vcname${bad ? " vcname--bad" : ""}`, face(entry.avatar, ""), el("span", "", entry.name))));
    }

    function person(entry: IOpenPerson): HTMLElement {
        return el(
            "div",
            "vcperson",
            face(entry.avatar, "vcavatar"),
            el("span", "vcperson__who", el("b", "", el("span", "vcperson__name", entry.name), ...(entry.owner ? [el("span", "vcowner", icon("#i-crown"), "Besitzer")] : [])), el("small", "", `@${entry.username}`)),
            el("span", "vcperson__states", ...personStates(entry).map(([key, label]) => el("span", `vcstate vcstate--${key}`, icon(STATE_ICONS[key]), label)))
        );
    }

    function paintOpenView(): void {
        const entry = data?.open.find((item) => item.channelId === shownId);

        // Zu, während das Fenster offen war: der Kopf behält den Namen, der Rumpf sagt es.
        if (!entry) {
            viewSub.textContent = "geschlossen";
            viewBody.replaceChildren(el("div", "tkempty tkempty--big vcview__gone", icon("#i-mic"), el("b", "", "Dieser Kanal ist inzwischen zu.")));
            viewFoot.hidden = true;

            return;
        }

        const hub = data!.hubs.find((item) => item.id === entry.hubId);
        const seats = seatsText(entry.members, entry.limit);
        const fill = el("i");
        const facts = el("dl", "mcfacts");
        const rows: [string, string][] = [
            ["Besitzer", entry.owner],
            ["Sichtbar", entry.stealth ? "versteckt" : "für alle"],
            ["Limit", entry.limit > 0 ? `${entry.limit} Plätze` : "ohne Limit"],
            ["Bitrate", entry.bitrate > 0 ? `${entry.bitrate} kbps` : "–"],
            ["Kategorie", entry.category ?? "keine"],
            ["Art", entry.support ? "Support-Kanal" : "normaler Kanal"],
        ];

        fill.style.width = `${entry.limit > 0 ? Math.min(100, (entry.members / entry.limit) * 100) : 0}%`;
        viewTitle.textContent = entry.name;
        viewSub.replaceChildren(el("i", "vcview__dot"), `offen seit ${clock(entry.createdAt)} · ${hub ? `aus dem Hub ${hub.channelName ?? "Hub"}` : "ohne Hub"}`);

        for (const [term, value] of rows) facts.append(el("div", "mcfact", el("dt", "", term), el("dd", "", value)));

        viewBody.replaceChildren(
            el(
                "div",
                "vcview__tiles",
                tile("#i-users", "Im Kanal", seats.value, seats.sub, ...(entry.limit > 0 ? [el("span", `vcview__seats${seats.sub === "voll" ? " is-full" : ""}`, fill)] : [])),
                tile("#i-clock", "Geöffnet", clock(entry.createdAt), ago(entry.createdAt)),
                entry.privacy === "private" ? tile("#i-lock", "Zugang", "Privat", "nur Vertraute und Eingeladene") : tile("#i-unlock", "Zugang", "Öffentlich", "jeder darf rein"),
                tile("#i-globe", "Region", regionName(entry.region, data!.regions), entry.region ? "fest eingestellt" : "Discord wählt")
            ),
            el(
                "section",
                "mcview__main",
                el("h3", "vcview__h", "Im Kanal", el("span", "", String(entry.people.length))),
                entry.people.length ? el("div", "vcpeople", ...entry.people.map(person)) : el("p", "tkempty", "Gerade niemand drin.")
            ),
            el(
                "section",
                "mcview__side",
                el("div", "", el("h3", "vcview__h", "Einstellungen"), facts),
                el("div", "", el("h3", "vcview__h", icon("#i-shield-check"), "Vertraut", el("span", "", String(entry.trusted.length))), names(entry.trusted)),
                el("div", "", el("h3", "vcview__h", icon("#i-user-x"), "Gesperrt", el("span", "", String(entry.blocked.length))), names(entry.blocked, true))
            )
        );

        // Review W-0143: Fuß nur auffrischen, nicht neu bauen - ein Fokus auf dem Link bleibt.
        viewLink.href = `https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(entry.channelId)}`;
        viewId.textContent = `Kanal-ID ${entry.channelId}`;
        viewFoot.hidden = false;
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data) return;

        const hubs = el(
            "div",
            "snlist",
            ...(data.hubs.length
                ? data.hubs.map(item)
                : [
                      el(
                          "div",
                          "tkempty tkempty--big",
                          icon("#i-mic"),
                          el("b", "", "Noch kein Hub."),
                          el("span", "", "Wähle oben einen Sprachkanal. Wer ihn betritt, bekommt seinen eigenen.")
                      ),
                  ])
        );

        headNode = head();
        navNode = nav();
        openNode = openList();
        panes.hubs = el("div", "", addBar(), hubs, panelCard());
        panes.offen = el("div", "", openNode);

        for (const id of TABS) {
            panes[id].id = `vcpane-${id}`;
            panes[id].setAttribute("role", "tabpanel");
            panes[id].setAttribute("aria-labelledby", `vctab-${id}`);
        }

        host.replaceChildren(headNode, navNode, panes.hubs, panes.offen);
        show();
    }

    /**
     * Ein Temp-Voice-Kanal kam dazu oder ist weg. Getauscht werden nur die
     * Zahlen oben und die Liste der offenen Kanaele - wer gerade an einem Hub
     * schreibt, verliert dabei nichts.
     */
    async function pulse(): Promise<void> {
        // Review W-0143: Abschnitt versteckt und kein Fenster offen - nichts laden, beim Zurückkommen nachholen.
        if (host.closest("[hidden]") && !dialog.open) {
            stale = true;

            return;
        }

        stale = false;

        const seq = ++pulseSeq;
        const answer = await call<IPayload>("");

        // Eine ältere, langsamere Antwort darf einen schon geschlossenen Kanal nicht zurückholen.
        if (!answer || !data || seq !== pulseSeq) return;

        data = answer;

        const fresh = head();
        const freshNav = nav();
        const list = openList();
        const focused = navNode.contains(document.activeElement);
        const focusedRow = openNode.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.channel : undefined;

        headNode.replaceWith(fresh);
        navNode.replaceWith(freshNav);
        openNode.replaceWith(list);
        headNode = fresh;
        navNode = freshNav;
        openNode = list;
        show();

        // W-0143: ein offenes Fenster zieht mit - auch wenn der Kanal inzwischen zu ist.
        if (shownId) paintOpenView();

        // Wer gerade mit den Pfeiltasten durch die Reiter ging, bleibt dort.
        if (focused) navNode.querySelector<HTMLElement>(`#vctab-${tab}`)?.focus();
        // Review W-0143: Wer mit Tab auf einer Zeile stand, bleibt dort (sonst springt der Fokus bei jedem Stumm-Klick weg).
        if (focusedRow) (openNode.querySelector<HTMLElement>(`[data-channel="${focusedRow}"]`) ?? navNode.querySelector<HTMLElement>("#vctab-offen"))?.focus();
    }

    loading(host, 4);
    onPulse(guildId, ["voice"], throttle(() => void pulse()));

    // Review W-0140: Wer über die Leiste zurückkommt, landet auf /voice-hub ohne ?reiter - der Reiter folgt der Adresse, wie bei Grenzen.
    window.addEventListener("guild:shown", (event) => {
        if ((event as CustomEvent<string>).detail !== "voice-hub" || !data) return;

        tab = parseVoiceTab(window.location.search);
        show();

        if (stale) void pulse();
    });

    void call<IPayload>("").then((answer) => {
        if (!answer) return;

        data = answer;
        paint();
    });
}
