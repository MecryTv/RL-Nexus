/**
 * Abschnitt: Rank Roles.
 *
 * Je Playlist eine Liste von Stufen, je Stufe eine Rolle. Wer den Befehl
 * eingibt, bekommt die Rolle zu seinem Rang - der Bot holt nichts von selbst.
 */

import { BASE } from "../core/Base.js";
import { icon, need } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { api, button, card, confirmButton, el, IRole, loading, row, select, stat, toggle } from "../core/Ui.js";

type Playlist = "1v1" | "2v2" | "3v3";

interface IStep {
    key: string;
    name: string;
    color: string;
    /** 1 ist Bronze I, 22 Supersonic Legend. */
    tier: number;
}

interface ISettings {
    playlists: Record<Playlist, { on: boolean; roles: Record<string, string | null> }>;
    replace: boolean;
    skipPlacement: boolean;
}

interface IPayload {
    settings: ISettings;
    playlists: Playlist[];
    playlistLabels: Record<Playlist, string>;
    steps: IStep[];
    prime: boolean;
    bot: { canManageRoles: boolean; highest: number };
    guild: { name: string; roles: IRole[]; channels: { id: string; name: string }[] };
}

export function renderRankRoles(guildId: string): void {
    const host = need<HTMLElement>("#rankRolesBody");
    const note = need<HTMLElement>("#rankRolesNote");
    const call = api(`${BASE}/api/guild/${encodeURIComponent(guildId)}/rankroles`, note);

    let data: IPayload | null = null;
    let draft: ISettings | null = null;
    let dirty = false;

    const reload = async (): Promise<void> => {
        const answer = await call<IPayload>("");

        if (!answer) return;

        data = answer;
        draft = structuredClone(answer.settings);
        dirty = false;
        paint();
    };

    const steps = (): IStep[] => data!.steps;

    /** Wie viele Ränge schon eine Rolle haben. */
    const mapped = (): number =>
        data!.playlists.reduce(
            (sum, playlist) =>
                sum + (draft!.playlists[playlist].on ? steps().filter((step) => draft!.playlists[playlist].roles[step.key]).length : 0),
            0
        );

    /* ------------------------------------------------------------
       Kopf
       ------------------------------------------------------------ */
    function head(): HTMLElement {
        const on = data!.playlists.filter((playlist) => draft!.playlists[playlist].on).length;

        return el(
            "div",
            "tkhead snhead",
            stat("#i-gamepad", "Playlists an", `${on} / ${data!.playlists.length}`, on ? "is-ok" : "is-warn"),
            stat("#i-shield", "Rollen zugeordnet", String(mapped())),
            stat("#i-list-checks", "Ränge", `${steps().length} je Playlist`),
            stat("#i-stats", "Prime", data!.prime ? "verbunden" : "aus", data!.prime ? "is-ok" : "is-warn")
        );
    }

    function problems(): HTMLElement[] {
        const list: HTMLElement[] = [];

        if (!data!.prime) {
            list.push(
                el(
                    "div",
                    "notice",
                    icon("#i-warn"),
                    el("span", "", "Der Bot ist gerade nicht mit Prime verbunden und kommt an keine Ränge – der Befehl sagt das dann auch.")
                )
            );
        }

        if (!data!.bot.canManageRoles) {
            list.push(el("div", "notice", icon("#i-warn"), el("span", "", "Dem Bot fehlt „Rollen verwalten“ – er kann sonst keine Rolle vergeben.")));
        }

        return list;
    }

    /* ------------------------------------------------------------
       Speichern
       ------------------------------------------------------------ */
    const save = button("btn btn--primary", icon("#i-check"), "Speichern");

    const touch = (): void => {
        dirty = true;
        save.disabled = false;
    };

    save.addEventListener("click", async () => {
        save.disabled = true;

        if (!(await call("", { action: "settings", settings: draft }))) {
            save.disabled = false;

            return;
        }

        toast("info", "Gespeichert", "Ab jetzt vergibt der Befehl diese Rollen.");
        void reload();
    });

    /* ------------------------------------------------------------
       Wie es läuft
       ------------------------------------------------------------ */
    function rules(): HTMLElement {
        return card(
            "Wie es läuft",
            "Mitglieder bekommen die Rollen mit /rank me, sobald ihr Epic-Konto mit /rank link verbunden ist. Der Bot fragt Rocket League nur dann – wer aufsteigt, ruft /rank me noch einmal auf.",
            row(
                "Alte Rolle abnehmen",
                "Beim Aufstieg geht die vorherige Rolle derselben Playlist weg",
                el("label", "snitem__switch", toggle(draft!.replace, "Alte Rolle abnehmen", (on) => {
                    draft!.replace = on;
                    touch();
                }), el("span", "", "abnehmen"))
            ),
            row(
                "Platzierungsspiele",
                "Wer noch platziert, hat keinen festen Rang",
                el("label", "snitem__switch", toggle(draft!.skipPlacement, "Platzierungsspiele überspringen", (on) => {
                    draft!.skipPlacement = on;
                    touch();
                }), el("span", "", "überspringen"))
            )
        );
    }

    /* ------------------------------------------------------------
       Je Playlist
       ------------------------------------------------------------ */
    function playlistCard(playlist: Playlist): HTMLElement {
        const entry = draft!.playlists[playlist];
        const roles: [string, string][] = [["", "— keine Rolle —"], ...data!.guild.roles.map((role): [string, string] => [role.id, `@${role.name}`])];

        const grid = el(
            "div",
            "rrsteps",
            ...steps().map((step) => {
                const dot = el("span", "rrdot");

                dot.style.background = step.color;

                const picker = select(roles, entry.roles[step.key] ?? "", (value) => {
                    entry.roles[step.key] = value || null;
                    touch();
                }, `Rolle für ${step.name} in ${data!.playlistLabels[playlist]}`);

                return el("label", "rrstep", dot, el("span", "rrstep__name", step.name), picker);
            })
        );

        const switcher = el("label", "snitem__switch", toggle(entry.on, `${data!.playlistLabels[playlist]} einschalten`, (on) => {
            entry.on = on;
            touch();
            grid.hidden = !on;
            clear.hidden = !on;
        }), el("span", "", "vergeben"));

        const clear = confirmButton("btn btn--quiet", "#i-eraser", "Zuordnung leeren", "Wirklich alle leeren?", async () => {
            entry.roles = {};
            touch();
            paint();
        });

        grid.hidden = !entry.on;
        clear.hidden = !entry.on;

        const count = Object.values(entry.roles).filter(Boolean).length;

        return card(
            data!.playlistLabels[playlist],
            entry.on ? `${count} von ${steps().length} Rängen haben eine Rolle.` : "Für diese Playlist vergibt der Bot nichts.",
            row("Rollen vergeben", "Aus dieser Playlist", switcher),
            grid,
            el("div", "mcsave", clear)
        );
    }

    /* ------------------------------------------------------------
       Zeichnen und Laden
       ------------------------------------------------------------ */
    function paint(): void {
        if (!data || !draft) return;

        save.disabled = !dirty;

        host.replaceChildren(
            head(),
            ...problems(),
            rules(),
            ...data.playlists.map(playlistCard),
            el("div", "mcsave lvsave", save),
            el("p", "hintline", "Die Rollen müssen unter der höchsten Rolle des Bots stehen – sonst darf er sie nicht vergeben.")
        );
    }

    loading(host, 4);

    void reload();
}
