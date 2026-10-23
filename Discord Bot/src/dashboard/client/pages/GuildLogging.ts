/**
 * Abschnitt: Logging System.
 *
 * Je Kategorie eine Karte: oben das Ziel der ganzen Gruppe, darunter die
 * Ereignisse einzeln - an, aus, eigener Kanal, Test. Ganz unten, was der Bot
 * übergehen soll.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, el, IRole, loading, rolePicker, row, select, stat, toggle } from "../core/Ui.js";
import { ILogTargets, ILogThread, logTargetSelect } from "../core/LogTarget.js";

interface IEventSetting {
    on: boolean;
    channelId: string | null;
}

interface ISettings {
    categories: Record<string, string | null>;
    events: Record<string, IEventSetting>;
    ignoreChannels: string[];
    ignoreRoles: string[];
    ignoreBots: boolean;
}

interface ICategory {
    id: string;
    name: string;
    hint: string;
    icon: string;
}

interface IEventInfo {
    key: string;
    category: string;
    name: string;
    hint: string;
    needs?: "members" | "audit";
}

interface IPayload {
    settings: ISettings;
    categories: ICategory[];
    events: IEventInfo[];
    limits: { ignore: number };
    targets: ILogTargets;
    ready: { members: boolean; audit: boolean };
    guild: { roles: IRole[]; channels: { id: string; name: string }[] };
}

export function renderLogging(guildId: string): void {
    const host = need<HTMLElement>("#loggingBody");
    const note = need<HTMLElement>("#loggingNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/logging`, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let dirty = false;

    const save = el("button", "btn btn--primary") as HTMLButtonElement;

    function touch(): void {
        dirty = true;
        save.disabled = false;
    }

    /** Legt auf Wunsch einen Beitrag im Forum an - dasselbe wie bei Giveaways. */
    async function newThread(forumId: string): Promise<ILogThread | null> {
        const answer = await call<{ thread: ILogThread }>("", { action: "logthread", forumId });

        return answer?.thread ?? null;
    }

    /** Wohin ein Ereignis wirklich geht: sein eigener Kanal, sonst der der Gruppe. */
    function targetOf(event: IEventInfo): string | null {
        const entry = draft!.events[event.key];

        return entry?.channelId ?? draft!.categories[event.category] ?? null;
    }

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const events = data!.events;
        const on = events.filter((event) => draft!.events[event.key]?.on && targetOf(event)).length;
        const targets = new Set(
            [...Object.values(draft!.categories), ...events.map((event) => draft!.events[event.key]?.channelId ?? null)].filter(Boolean)
        );
        const ignored = draft!.ignoreChannels.length + draft!.ignoreRoles.length;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-scroll", "Wird protokolliert", `${on} / ${events.length}`, on ? "is-ok" : ""),
            stat("#i-hash", "Log-Kanäle", String(targets.size)),
            stat("#i-eraser", "Übergangen", ignored ? `${ignored} ${ignored === 1 ? "Eintrag" : "Einträge"}` : "nichts"),
            stat("#i-shield-check", "Audit-Log", data!.ready.audit ? "lesbar" : "fehlt", data!.ready.audit ? "is-ok" : "is-warn")
        );
    }

    function notices(): HTMLElement[] {
        const lines: string[] = [];

        if (!data!.ready.members) {
            lines.push('Ohne das Members-Intent bei Discord sieht der Bot niemanden kommen oder gehen – die Mitglieder-Ereignisse bleiben still. Einschalten kann das nur das RL Nexus Team.');
        }

        if (!data!.ready.audit) {
            lines.push('Dem Bot fehlt das Recht „Audit-Log ansehen". Ohne das kann er nicht sagen, wer gelöscht, gekickt oder gebannt hat – die Karten nennen dann niemanden.');
        }

        return lines.map((text) => el("div", "notice snnotice", icon("#i-warn"), el("span", "", text)));
    }

    /* ------------------------------------------------------------
       Eine Kategorie
       ------------------------------------------------------------ */
    function categoryCard(category: ICategory): HTMLElement {
        const events = data!.events.filter((event) => event.category === category.id);
        const groupTarget = logTargetSelect(
            data!.targets,
            draft!.categories[category.id] ?? null,
            (value) => {
                draft!.categories[category.id] = value;
                touch();
                paint();
            },
            newThread
        );

        groupTarget.setAttribute("aria-label", `Log-Kanal für ${category.name}`);

        return card(
            category.name,
            category.hint,
            row("Kanal für die Gruppe", "Hierhin geht alles, was unten keinen eigenen Kanal hat", groupTarget),
            el("div", "lglist", ...events.map((event) => eventRow(event, category)))
        );
    }

    function eventRow(event: IEventInfo, category: ICategory): HTMLElement {
        const entry = draft!.events[event.key] ?? { on: true, channelId: null };
        const target = targetOf(event);
        const own = logTargetSelect(
            data!.targets,
            entry.channelId,
            (value) => {
                entry.channelId = value;
                draft!.events[event.key] = entry;
                touch();
                paint();
            },
            newThread,
            "Wie die Gruppe"
        );

        own.setAttribute("aria-label", `Eigener Kanal für ${event.name}`);
        own.disabled = !entry.on;

        const test = button("btn btn--quiet btn--icon", icon("#i-play"));

        test.title = target ? "Eine Beispielkarte in den Kanal schicken" : "Dafür fehlt noch ein Kanal";
        test.setAttribute("aria-label", `${event.name} testen`);
        test.disabled = !entry.on || !target || dirty;
        test.addEventListener("click", async () => {
            test.disabled = true;

            if (await call("", { action: "test", event: event.key })) toast("info", "Test gesendet", `„${event.name}" liegt im Kanal.`);

            test.disabled = false;
        });

        const hints = [
            event.hint,
            event.needs === "members" && !data!.ready.members ? "Braucht das Members-Intent" : null,
            event.needs === "audit" && !data!.ready.audit ? 'Braucht „Audit-Log ansehen"' : null,
        ]
            .filter(Boolean)
            .join(" · ");

        return el(
            "div",
            `lgrow${entry.on ? "" : " is-off"}`,
            el("label", "lgrow__switch", toggle(entry.on, `${event.name} protokollieren`, (on) => {
                entry.on = on;
                draft!.events[event.key] = entry;
                touch();
                paint();
            })),
            el("div", "lgrow__text", el("b", "", event.name), hints ? el("i", "", hints) : el("i", "", `Landet in ${category.name}`)),
            el("div", "lgrow__target", own),
            test
        );
    }

    /* ------------------------------------------------------------
       Was der Bot übergeht
       ------------------------------------------------------------ */
    function channelChips(): HTMLElement {
        const host = el("div", "tkchips");
        const paintChips = (): void => {
            const left = data!.guild.channels.filter((channel) => !draft!.ignoreChannels.includes(channel.id));
            const picker = select(
                [
                    ["", draft!.ignoreChannels.length >= data!.limits.ignore ? `Höchstens ${data!.limits.ignore}` : "+ Kanal hinzufügen"],
                    ...left.map((channel): [string, string] => [channel.id, `# ${channel.name}`]),
                ],
                "",
                (value) => {
                    if (!value) return;

                    draft!.ignoreChannels = [...draft!.ignoreChannels, value];
                    touch();
                    paintChips();
                },
                "Kanal übergehen"
            );

            picker.disabled = draft!.ignoreChannels.length >= data!.limits.ignore;

            host.replaceChildren(
                ...draft!.ignoreChannels.map((id) => {
                    const name = data!.guild.channels.find((channel) => channel.id === id)?.name ?? "gelöschter Kanal";
                    const remove = button("", icon("#i-x"));

                    remove.setAttribute("aria-label", `# ${name} nicht mehr übergehen`);
                    remove.addEventListener("click", () => {
                        draft!.ignoreChannels = draft!.ignoreChannels.filter((entry) => entry !== id);
                        touch();
                        paintChips();
                    });

                    return el("span", "tkchip", el("span", "", `# ${name}`), remove);
                }),
                picker
            );
        };

        paintChips();

        return host;
    }

    function ignoreCard(): HTMLElement {
        return card(
            "Übergehen",
            "Was hier steht, taucht in keinem Log auf. Eine Kategorie zu übergehen, übergeht auch alle Kanäle darin.",
            row("Kanäle", `Bis zu ${data!.limits.ignore}`, channelChips()),
            row(
                "Rollen",
                "Wer eine davon hat, wird nicht protokolliert",
                rolePicker(data!.guild.roles, draft!.ignoreRoles, (ids) => {
                    draft!.ignoreRoles = ids;
                    touch();
                }, [], data!.limits.ignore)
            ),
            row(
                "Bots",
                "Bots machen sonst den größten Teil der Einträge aus",
                el("label", "snitem__switch", toggle(draft!.ignoreBots, "Bots übergehen", (on) => {
                    draft!.ignoreBots = on;
                    touch();
                }), el("span", "", "übergehen"))
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

        host.replaceChildren(
            ...notices(),
            head(),
            ...data.categories.map(categoryCard),
            ignoreCard(),
            el("div", "mcsave lvsave", save)
        );
    }

    save.addEventListener("click", async () => {
        save.disabled = true;

        const answer = await call<{ settings: ISettings }>("", { action: "save", settings: draft });

        if (!answer) {
            save.disabled = false;

            return;
        }

        data!.settings = answer.settings;
        draft = structuredClone(answer.settings);
        dirty = false;
        toast("info", "Gespeichert", "Gilt ab dem nächsten Ereignis.");
        paint();
    });

    loading(host, 4);

    void call<IPayload>("").then((answer) => {
        if (!answer) return;

        data = answer;
        draft = structuredClone(answer.settings);
        paint();
    });
}
