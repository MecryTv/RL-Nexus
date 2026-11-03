/**
 * Team-Kasten im Bot-Dashboard (W-0064, Entwürfe P1-A+, Menü+ und P2-A+):
 * Administrator und Developer von RL Nexus entfernen den Bot von einem
 * fremden Server oder treten ihm selbst bei. Überall steht, in welcher Rolle:
 * Developer lila, Administrator rot. Der Server prüft alles selbst
 * (routes/DashboardApiTeam.ts).
 */

import { IGuild } from "../interfaces/IGuild.js";
import { MODULES } from "../constants/Modules.js";
import { BASE, url } from "../core/Base.js";
import { icon, maybe } from "../core/Dom.js";
import { toast } from "../core/Toast.js";
import { button, el } from "../core/Ui.js";

export type TeamRole = "Developer" | "Administrator";

interface ITeamFacts {
    role: TeamRole;
    member: boolean;
    owner: { id: string; name: string };
    inviter: { id: string; name: string; at: string } | null;
    members: number;
    modules: string[];
    openTickets: number;
    canJoin: boolean;
}

const REASONS = ["Missbrauch", "Wunsch des Owners", "Zweiter Server ohne Freigabe", "Testserver", "Sonstiges"];
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const NUMBER = new Intl.NumberFormat("de-DE");

async function api<T>(guildId: string, body?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
    try {
        const response = await fetch(url(`/api/guild/${encodeURIComponent(guildId)}/team`), {
            method: body ? "POST" : "GET",
            headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await response.json().catch(() => null)) as (T & { error?: string; hint?: string }) | null;

        if (!response.ok) return { data: null, error: data?.error ?? data?.hint ?? "Das hat nicht geklappt." };

        return { data, error: null };
    } catch {
        return { data: null, error: "Der Bot antwortet gerade nicht." };
    }
}

/** Gruppe aus /api/me in die Rolle des Teams. null: kein Team. */
export function teamRoleOf(group: string): TeamRole | null {
    return group === "administrator" ? "Administrator" : group === "developer" ? "Developer" : null;
}

export function roleBadge(role: TeamRole): HTMLElement {
    const admin = role === "Administrator";

    return el("span", `tbadge ${admin ? "tbadge--admin" : "tbadge--dev"}`, icon(admin ? "#i-shield" : "#i-code"), role.toUpperCase());
}

function moduleNames(ids: string[]): string {
    const names = ids.map((id) => MODULES.find((entry) => entry.id === id)?.name ?? id);

    return names.length > 3 ? `${names.slice(0, 3).join(", ")} …` : names.join(", ");
}

/* ----------------------------------------------------------
   Beitreten
   ---------------------------------------------------------- */

/** „Als Developer beitreten“. Fehlt das Recht, geht es einmal zu Discord und danach von selbst weiter. */
export async function joinGuild(guild: Pick<IGuild, "id" | "name">, done: () => void): Promise<void> {
    const { data, error } = await api<{ consent?: string; state?: "joined" | "already" }>(guild.id, { action: "join" });

    if (error) return void toast("info", "Beitreten geht nicht", error);
    if (data?.consent) return void (window.location.href = data.consent);

    toast("info", data?.state === "already" ? "Schon Mitglied" : "Beigetreten", data?.state === "already" ? `Du bist auf „${guild.name}“ schon Mitglied.` : `Du bist jetzt Mitglied von „${guild.name}“.`);
    done();
}

async function leaveSelf(guild: Pick<IGuild, "id" | "name">, done: () => void): Promise<void> {
    const { error } = await api(guild.id, { action: "leave-self" });

    if (error) return void toast("info", "Austreten geht nicht", error);

    toast("info", "Ausgetreten", `Du bist nicht mehr auf „${guild.name}“.`);
    done();
}

/* ----------------------------------------------------------
   Fenster „Bot entfernen“
   ---------------------------------------------------------- */

export async function openRemoveDialog(guild: Pick<IGuild, "id" | "name" | "teams">): Promise<void> {
    const { data: facts, error } = await api<ITeamFacts>(guild.id);

    if (!facts) return void toast("info", "Geht gerade nicht", error ?? "Der Bot antwortet nicht.");

    const dialog = el("dialog", "modal tremove");
    let reason: string | null = null;
    const close = (): void => {
        dialog.close();
        dialog.remove();
    };

    const chips = el("div", "tchips");
    for (const entry of REASONS) {
        const chip = button("tchip", entry);

        chip.type = "button";
        chip.setAttribute("aria-pressed", "false");
        chip.addEventListener("click", () => {
            reason = entry;
            for (const other of chips.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === chip));
            check();
        });
        chips.append(chip);
    }

    const note = el("textarea", "sgreason");
    note.maxLength = 300;
    note.rows = 2;
    note.placeholder = "Was ist passiert? Steht nur im Protokoll.";
    note.setAttribute("aria-label", "Grund genauer");

    const notify = el("input");
    notify.type = "checkbox";
    notify.checked = true;
    const block = el("input");
    block.type = "checkbox";

    const confirm = el("input", "tconfirm");
    confirm.type = "text";
    confirm.autocomplete = "off";
    confirm.placeholder = guild.name;
    confirm.setAttribute("aria-label", "Servername zum Bestätigen");

    const go = button("btn btn--quiet is-danger is-sure", icon("#i-trash"), "Bot entfernen");
    const cancel = button("btn btn--quiet", "Abbrechen");
    const problem = el("p", "sgerror");
    problem.hidden = true;

    const check = (): void => {
        go.disabled = !reason || confirm.value.trim().toLocaleLowerCase("de-DE") !== guild.name.trim().toLocaleLowerCase("de-DE");
    };
    confirm.addEventListener("input", check);
    check();

    const ticketText = facts.openTickets === 1 ? "1 offenes Ticket bleibt" : `${facts.openTickets} offene Tickets bleiben`;
    const summary = el(
        "p",
        "tsummary",
        `RL Nexus verlässt „${guild.name}“ jetzt. ${ticketText} als Kanäle stehen.`,
        notify.checked ? ` ${facts.owner.name} bekommt eine DM.` : ""
    );
    notify.addEventListener("change", () => (summary.lastChild!.textContent = notify.checked ? ` ${facts.owner.name} bekommt eine DM.` : ""));

    cancel.type = "button";
    cancel.addEventListener("click", close);
    go.addEventListener("click", () => {
        go.disabled = true;
        problem.hidden = true;

        void api<{ ok: boolean; dm: boolean | null }>(guild.id, { action: "leave", reason, note: note.value, notifyOwner: notify.checked, block: block.checked, confirm: confirm.value }).then(({ data, error: failed }) => {
            if (!data) {
                problem.hidden = false;
                problem.textContent = failed ?? "Das hat nicht geklappt.";
                check();

                return;
            }

            close();
            toast("info", "Bot entfernt", `RL Nexus hat „${guild.name}“ verlassen.${data.dm === true ? ` ${facts.owner.name} hat die DM bekommen.` : data.dm === false ? " Die DM an den Owner kam nicht an." : ""}`);
            window.setTimeout(() => (window.location.href = `${BASE}/`), 1200);
        });
    });

    const stat = (value: string, label: string): HTMLElement => el("div", "tstat", el("b", "", value), el("span", "", label));

    dialog.append(
        el(
            "div",
            "modal__head",
            el("span", "tcrest", guild.name.slice(0, 2).toUpperCase()),
            el("div", "", el("h2", "", `RL Nexus von „${guild.name}“ entfernen?`), el("p", "", "als ", roleBadge(facts.role), " · steht im Protokoll"))
        ),
        el(
            "div",
            "modal__body tremove__body",
            el("span", "tlabel", "Das hört auf"),
            el(
                "div",
                "tstats",
                stat(NUMBER.format(facts.members), "Mitglieder ohne Bot"),
                stat(String(facts.modules.length), facts.modules.length ? `Module (${moduleNames(facts.modules)})` : "Module"),
                stat(String(facts.openTickets), "offene Tickets")
            ),
            el("span", "tlabel", "Grund"),
            chips,
            note,
            el(
                "label",
                "tcheck",
                notify,
                el("span", "", el("b", "", `${facts.owner.name} per DM Bescheid geben`), el("small", "", "Ohne Grund, nur dass das Team den Bot entfernt hat.")),
            ),
            el("p", "tpreview", el("b", "", "RL Nexus · "), `Das Team von RL Nexus hat den Bot von „${guild.name}“ entfernt. Fragen: support@nexus-emb.de`),
            el("label", "tcheck", block, el("span", "", el("b", "", "Neues Einladen auf diesen Server sperren"), el("small", "", "Lädt jemand den Bot wieder ein, geht er sofort."))),
            summary,
            el("span", "tlabel", "Zum Bestätigen den Servernamen eintippen"),
            confirm,
            el("p", "sghint", "Einstellungen bleiben 30 Tage, falls der Bot zurückkommt."),
            problem,
            el("div", "tactions", cancel, go)
        )
    );

    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
    });
    document.body.append(dialog);
    dialog.showModal();
}

/* ----------------------------------------------------------
   Menü an der Karte (Serverliste)
   ---------------------------------------------------------- */

export function teamMenu(guild: IGuild, role: TeamRole): HTMLElement {
    const wrap = el("div", "tmenu");
    const trigger = button("iconbtn tmenu__btn", icon("#i-sliders"));
    const list = el("div", "tmenu__list");
    const view = el("a", "tmenu__item", icon("#i-eye"), "Server ansehen");

    trigger.type = "button";
    trigger.setAttribute("aria-label", `Team-Menü für ${guild.name}`);
    trigger.setAttribute("aria-expanded", "false");
    list.hidden = true;
    view.href = `${BASE}/guild/${guild.id}/uebersicht`;
    list.append(view, el("div", "tmenu__head", `Team · als ${role}`));

    if (!guild.member) {
        const join = button("tmenu__item", icon("#i-plus"), "Selbst beitreten");

        join.type = "button";
        join.addEventListener("click", () => void joinGuild(guild, () => window.location.reload()));
        list.append(join);
    }

    const remove = button("tmenu__item tmenu__item--danger", icon("#i-trash"), "Bot entfernen …", el("small", "", "Fenster"));

    remove.type = "button";
    remove.addEventListener("click", () => void openRemoveDialog(guild));
    list.append(el("hr", "tmenu__rule"), remove);

    const toggle = (open: boolean): void => {
        list.hidden = !open;
        trigger.setAttribute("aria-expanded", String(open));
    };

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggle(list.hidden === true);
    });
    document.addEventListener("click", (event) => {
        if (!wrap.contains(event.target as Node)) toggle(false);
    });
    wrap.addEventListener("keydown", (event) => {
        if (event.key === "Escape") toggle(false);
    });
    wrap.append(trigger, list);

    return wrap;
}

/* ----------------------------------------------------------
   Kasten in der Server-Übersicht
   ---------------------------------------------------------- */

export function renderTeamBox(guild: IGuild): void {
    const host = maybe<HTMLElement>("#teamBox");
    if (!host) return;

    const paint = async (): Promise<void> => {
        const { data: facts } = await api<ITeamFacts>(guild.id);

        if (!facts) {
            host.hidden = true;

            return;
        }

        const stat = (value: string, label: string): HTMLElement => el("div", "sgfact", el("div", "sgfact__v", value), el("div", "sgfact__s", label));
        const refresh = (): void => void paint();
        const join = button("btn btn--warm", icon("#i-plus"), `Als ${facts.role} beitreten`);
        const remove = button("btn btn--quiet is-danger", icon("#i-trash"), "Bot entfernen");
        const discord = el("a", "btn btn--quiet", icon("#i-external"), "In Discord öffnen");

        join.type = "button";
        remove.type = "button";
        discord.href = `https://discord.com/channels/${guild.id}`;
        discord.target = "_blank";
        discord.rel = "noopener";
        join.addEventListener("click", () => void joinGuild(guild, refresh));
        remove.addEventListener("click", () => void openRemoveDialog(guild));

        const leave = button("tlinkbtn", "Wieder austreten");

        leave.type = "button";
        leave.addEventListener("click", () => void leaveSelf(guild, refresh));

        const joinRow = facts.member
            ? el("div", "trow", el("div", "trow__text", el("b", "", "Du bist Mitglied"), el("span", "", "Auf dem Server steht im Log, dass du über das Bot-Dashboard dazugekommen bist. ", leave)), discord)
            : el(
                  "div",
                  "trow",
                  el(
                      "div",
                      "trow__text",
                      el("b", "", `Du bist auf „${guild.name}“ nicht Mitglied `, roleBadge(facts.role)),
                      el("span", "", `RL Nexus nimmt dich direkt auf. Auf dem Server steht im Log, dass du als ${facts.role} von RL Nexus beigetreten bist. Rollen bekommst du keine.${facts.canJoin ? "" : " Beim ersten Mal fragt Discord einmal nach dem Recht, dich Servern hinzuzufügen."}`)
                  ),
                  join
              );

        host.hidden = false;
        host.replaceChildren(
            el(
                "div",
                "tbox",
                el(
                    "div",
                    "tbox__head",
                    el(
                        "div",
                        "",
                        el("div", "sgcard__name", el("b", "", guild.name)),
                        el("div", "sgcard__meta", `Owner ${facts.owner.name}${facts.inviter ? ` · eingeladen von ${facts.inviter.name} am ${DAY.format(new Date(facts.inviter.at))}` : ""}`)
                    ),
                    el("span", "tbox__as", "Du als ", roleBadge(facts.role))
                ),
                el("div", "sgfacts tbox__stats", stat(NUMBER.format(facts.members), "Mitglieder"), stat(String(facts.modules.length), "Module an"), stat(String(guild.teams), "Teams"), stat(facts.member ? "ja" : "nein", "du bist Mitglied")),
                el(
                    "div",
                    "tbox__team",
                    el("p", "tbox__lead", el("b", "", "Nur für das Team von RL Nexus"), " · sieht der Server nicht. Einstellungen änderst du hier nicht. Diese zwei Dinge gehen:"),
                    joinRow,
                    el("div", "trow trow--danger", el("div", "trow__text", el("b", "", "Bot von diesem Server entfernen"), el("span", "", "RL Nexus verlässt den Server sofort. Einstellungen bleiben 30 Tage.")), remove)
                )
            )
        );

        // Zurück von Discord mit dem neuen Recht: der Beitritt läuft von selbst weiter.
        const params = new URLSearchParams(window.location.search);

        if (params.get("beitreten") === "1") {
            params.delete("beitreten");
            window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);

            if (!facts.member && facts.canJoin) void joinGuild(guild, refresh);
        }
    };

    void paint();
}
