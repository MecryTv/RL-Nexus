/**
 * Staff-Freigabe im Bot-Dashboard (W-0011, Plan 44). Staff sieht einen
 * fremden Server erst nur lesend mit Infokarte und fragt an; nach dem Ja
 * bearbeitet er wie ein Verwalter, private Bereiche nur mit dem extra Ja.
 * Aussehen wie in den Entwürfen w0011-staff-freigabe-v2.html,
 * w0011-eigene-zeit.html und w0011-private-bereiche.html (Variante A).
 */

import { IGuild } from "../interfaces/IGuild.js";
import { AccessText } from "../constants/Access.js";
import { url } from "../core/Base.js";
import { icon, maybe, need } from "../core/Dom.js";
import { onMyPulse, onPulse } from "../core/Pulse.js";
import { toast } from "../core/Toast.js";
import { button, el, face, toggle } from "../core/Ui.js";

/** Abschnitte, die nur mit dem extra Ja aufgehen. Moderation und Anti Villain sperren nur ihre Fälle selbst. */
export const PRIVATE_SECTIONS = ["live-tickets", "transcriptions", "applications", "apply"];

const NOTICE_KEY = "rlnexus.staffNotice";
const PRESETS = [30, 60, 180];
const MIN = 10;
const MAX = 1440;
const MODE_LABELS = { paid: "Paid", free: "Free", beta: "Beta" } as const;
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

type Private = "none" | "asked" | "on" | "denied" | "removed";

export interface IGrantView {
    id: number;
    guild: { id: string; name: string; icon: string | null };
    staff: { id: string; name: string; avatar: string | null; role: "Developer" | "Admin" };
    reason: string;
    minutes: number;
    status: "open" | "active" | "denied" | "expired" | "withdrawn" | "ended";
    expiresAt: number;
    startsAt: number | null;
    endsAt: number | null;
    answeredBy: { id: string; name: string } | null;
    private: Private;
    privateReason: string | null;
}

interface IPerson {
    id: string;
    name: string;
    avatar: string | null;
}

interface IStaffState {
    me: "staff";
    info: {
        server: { id: string; name: string; icon: string | null; joined: string | null; members: number; modules: number };
        owner: IPerson & { since: string | null };
        access: { mode: keyof typeof MODE_LABELS; holder: { id: string; name: string } | null; ends: Parameters<typeof AccessText>[0][] | null };
    };
    askees: (IPerson & { online: boolean; dm: boolean | null })[];
    grant: IGrantView | null;
    blocked: string | null;
}

/* ----------------------------------------------------------
   Kleinkram
   ---------------------------------------------------------- */

/** „47:12“ oder „1:05:09“ bis zu einem Zeitpunkt. */
export function countdown(until: number, now = Date.now()): string {
    const left = Math.max(0, Math.round((until - now) / 1000));
    const hours = Math.floor(left / 3600);
    const minutes = Math.floor((left % 3600) / 60);
    const seconds = String(left % 60).padStart(2, "0");

    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function durationText(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (!hours) return `${rest} Min.`;

    return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

/** „Endet heute um 12:07“, über Mitternacht „morgen“. */
export function endsText(minutes: number, now = Date.now()): string {
    const end = new Date(now + minutes * 60_000);
    const day = end.toDateString() === new Date(now).toDateString() ? "heute" : "morgen";

    return `Endet ${day} um ${CLOCK.format(end)} Uhr`;
}

/** Ein Zähler, der sich jede Sekunde selbst nachzieht. */
export function timer(until: number, className = "sgtimer"): HTMLElement {
    const box = el("span", className, countdown(until));

    box.dataset.until = String(until);

    return box;
}

let ticking = false;

/** Ein Takt für alle Zähler der Seite. */
export function tick(onZero: () => void): void {
    if (ticking) return;

    ticking = true;
    window.setInterval(() => {
        let done = false;

        for (const box of document.querySelectorAll<HTMLElement>("[data-until]")) {
            const until = Number(box.dataset.until);

            box.textContent = countdown(until);

            if (until <= Date.now() && box.isConnected) done = true;
        }

        if (done) onZero();
    }, 1000);
}

async function call<T>(path: string, body?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
    try {
        const response = await fetch(url(path), {
            method: body ? "POST" : "GET",
            headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await response.json().catch(() => null)) as (T & { error?: string; hint?: string }) | null;

        if (!response.ok) return { data: null, error: data?.hint ?? data?.error ?? "Das hat nicht geklappt." };

        return { data, error: null };
    } catch {
        return { data: null, error: "Der Bot antwortet gerade nicht." };
    }
}

export function staffApi<T>(guildId: string, body?: Record<string, unknown>) {
    return call<T>(`/api/guild/${encodeURIComponent(guildId)}/staff`, body);
}

export function meApi<T>(body?: Record<string, unknown>) {
    return call<T>("/api/me/staff", body);
}

/** Lädt die Seite neu und zeigt danach einen Satz - für Wechsel, die alle Abschnitte betreffen. */
export function reloadWith(text: string): void {
    try {
        sessionStorage.setItem(NOTICE_KEY, text);
    } catch {
        // Ohne Speicher fehlt nur der Satz nach dem Laden.
    }

    window.location.reload();
}

function showNotice(): void {
    let text: string | null = null;

    try {
        text = sessionStorage.getItem(NOTICE_KEY);
        sessionStorage.removeItem(NOTICE_KEY);
    } catch {
        return;
    }

    if (text) toast("info", "Staff-Freigabe", text);
}

function pill(className: string, text: string): HTMLElement {
    return el("span", `pill ${className}`, text);
}

/** Dauer wählen: 30 Min., 1 Std., 3 Std. oder Eigene (10 Minuten bis 24 Stunden). */
export function durationPicker(start: number, onChange: (minutes: number | null) => void): HTMLElement {
    const until = el("p", "sguntil", endsText(start));
    const hint = el("p", "sghint", "10 Minuten bis 24 Stunden");
    const amount = el("input", "sgamount");
    const unit = el("select", "pick sgunit");
    const custom = el("div", "sgcustom", amount, unit);
    const seg = el("div", "sgseg");
    const wrap = el("div", "sgduration", seg, custom, hint, until);
    let mode: number | "custom" = PRESETS.includes(start) ? start : "custom";

    amount.type = "number";
    amount.min = "1";
    amount.max = "1440";
    // Wer „Eigene“ wählt, tippt meist Minuten („45“) - Stunden stellt man um.
    amount.value = String(start);
    amount.setAttribute("aria-label", "Eigene Dauer");
    unit.setAttribute("aria-label", "Einheit");
    unit.append(new Option("Minuten", "1"), new Option("Stunden", "60"));
    unit.value = "1";

    const value = (): number | null => {
        if (mode !== "custom") return mode;

        const minutes = Math.round(Number(amount.value) * Number(unit.value));

        return Number.isFinite(minutes) && minutes >= MIN && minutes <= MAX ? minutes : null;
    };

    const paint = (): void => {
        for (const entry of seg.children) entry.setAttribute("aria-pressed", String(entry.getAttribute("data-value") === String(mode)));

        custom.hidden = hint.hidden = mode !== "custom";

        const minutes = value();

        until.textContent = minutes === null ? "Bitte 10 Minuten bis 24 Stunden." : endsText(minutes);
        until.classList.toggle("is-bad", minutes === null);
        onChange(minutes);
    };

    for (const entry of [...PRESETS, "custom"] as const) {
        const choice = button("sgseg__item", entry === "custom" ? "Eigene" : durationText(entry));

        choice.dataset.value = String(entry);
        choice.addEventListener("click", () => {
            mode = entry;
            paint();
        });
        seg.append(choice);
    }

    amount.addEventListener("input", paint);
    unit.addEventListener("change", paint);
    paint();

    return wrap;
}

/** Die fünf Bereiche als kleine Marken. */
export function privateChips(): HTMLElement {
    return el("div", "sgchips", ...["Live Tickets", "Transcripts", "Bewerbungen", "Fälle Moderation", "Fälle Anti Villain"].map((name) => el("span", "", name)));
}

/* ----------------------------------------------------------
   Staff: Leiste, Infokarte, Anfrage
   ---------------------------------------------------------- */

export function renderStaffView(guild: IGuild): void {
    showNotice();

    const bar = need<HTMLElement>("#staffBar");
    const host = need<HTMLElement>("#staffCard");
    // Der Stand, mit dem die Seite gebaut wurde. Ändert sich Freigabe oder private Bereiche, lädt sie neu.
    const built = guild.staff ? (guild.staff.private ? "on" : "active") : "none";
    let warned = false;
    let busy = false;

    const refresh = async (): Promise<void> => {
        if (busy) return;

        busy = true;

        const { data } = await staffApi<IStaffState>(guild.id);

        busy = false;

        if (!data) return;

        const grant = data.grant;
        const now = grant?.status === "active" && (grant.endsAt ?? 0) > Date.now() ? (grant.private === "on" ? "on" : "active") : "none";

        if (now !== built) {
            const text =
                built === "none"
                    ? "Freigegeben. Du kannst jetzt bearbeiten, alles wird protokolliert."
                    : now === "none"
                      ? "Die Freigabe ist beendet. Nicht gespeicherte Änderungen sind weg."
                      : now === "on"
                        ? "Die privaten Bereiche sind jetzt offen."
                        : "Die privaten Bereiche sind wieder zu.";

            reloadWith(text);

            return;
        }

        paintBar(data);
        paintCard(data);
    };

    function paintBar(data: IStaffState): void {
        const grant = data.grant;

        bar.hidden = false;

        if (grant?.status === "active" && grant.endsAt) {
            const end = button("btn btn--quiet sgbar__btn", "Selbst beenden");

            end.addEventListener("click", () => void staffApi(guild.id, { action: "end" }).then(refresh));
            bar.className = "sgbar sgbar--live";
            bar.replaceChildren(
                pill("pill--ok", "Freigegeben"),
                el("span", "sgbar__text", "von ", el("b", "", grant.answeredBy?.name ?? "?"), " · alles wird protokolliert"),
                ...(grant.private === "on" ? [pill("sgpill--warn", "+ private Bereiche")] : []),
                el("span", "sgbar__grow"),
                timer(grant.endsAt),
                end
            );

            if (!warned && grant.endsAt - Date.now() <= 5 * 60_000) {
                warned = true;
                toast("info", "Staff-Freigabe", "Noch 5 Minuten Freigabe.");
            }

            return;
        }

        const ask = button("btn btn--warm sgbar__btn", "Bearbeiten anfragen");

        ask.addEventListener("click", () => {
            maybe<HTMLAnchorElement>('a[data-section="uebersicht"]')?.click();
            window.setTimeout(() => host.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        });
        bar.className = "sgbar sgbar--staff";
        bar.replaceChildren(
            pill("sgpill--staff", "Staff"),
            pill("sgpill--ro", "Nur lesen"),
            el("span", "sgbar__text", "Du siehst ", el("b", "", guild.name), " von außen. Ändern geht erst nach einem Ja."),
            el("span", "sgbar__grow"),
            ask
        );
    }

    function paintCard(data: IStaffState): void {
        const { server, owner, access } = data.info;
        const names = data.askees.map((entry) => entry.name).join(", ");
        const asked = data.askees.length
            ? el(
                  "div",
                  "sgfact",
                  el("div", "sgfact__k", "Wird gefragt"),
                  el("div", "sgfact__v", names),
                  el("div", "sgfact__s", data.askees.some((entry) => entry.online) ? "gerade im Dashboard" : "nicht im Dashboard, bekommt eine DM")
              )
            : el("div", "sgfact", el("div", "sgfact__k", "Wird gefragt"), el("div", "sgfact__v", "Niemand"), el("div", "sgfact__s", "Gerade hat niemand einen Zugang."));
        const ends = access.ends?.length ? access.ends.map((entry) => AccessText(entry)).join(" ") : access.mode === "free" ? "Free Access, ohne Kauf" : "";

        host.hidden = false;
        host.replaceChildren(
            el(
                "div",
                "sgcard",
                el(
                    "div",
                    "sgcard__head",
                    face({ name: server.name, avatar: server.icon }, "sgcard__icon"),
                    el(
                        "div",
                        "sgcard__title",
                        el("div", "sgcard__name", el("b", "", server.name), pill("pill--ok", MODE_LABELS[access.mode])),
                        el(
                            "div",
                            "sgcard__meta",
                            `Server-ID ${server.id} · ${server.joined ? `Bot seit ${DAY.format(new Date(server.joined))} · ` : ""}${server.members} Mitglieder · ${server.modules} Module an`
                        )
                    )
                ),
                el(
                    "div",
                    "sgfacts",
                    el(
                        "div",
                        "sgfact",
                        el("div", "sgfact__k", "Owner"),
                        el("div", "sgperson", face(owner, "sgface"), el("div", "", el("div", "sgfact__v", owner.name), el("div", "sgfact__s", `${owner.since ? `auf Discord seit ${new Date(owner.since).getFullYear()} · ` : ""}ID ${owner.id}`)))
                    ),
                    el("div", "sgfact", el("div", "sgfact__k", "Zugang"), el("div", "sgfact__v", `${MODE_LABELS[access.mode]}${access.holder ? ` · ${access.holder.name}` : ""}`), el("div", "sgfact__s", ends)),
                    asked
                ),
                actionPart(data)
            )
        );
    }

    function actionPart(data: IStaffState): HTMLElement {
        const grant = data.grant;
        const note = el("p", "sgerror");

        note.hidden = true;

        const fail = (text: string | null): void => {
            note.hidden = text === null;
            note.textContent = text ?? "";
        };

        if (grant?.status === "open") {
            const withdraw = button("btn btn--quiet", "Zurückziehen");

            withdraw.addEventListener("click", () => void staffApi(guild.id, { action: "withdraw" }).then(({ error }) => (error ? fail(error) : void refresh())));

            return el(
                "div",
                "sgwait",
                el("p", "sgwait__line", `Warte auf ${data.askees.map((entry) => entry.name).join(", ")} · verfällt in `, timer(grant.expiresAt, "sgtimer sgtimer--inline")),
                el(
                    "ul",
                    "sgwait__list",
                    ...data.askees.map((entry) =>
                        el(
                            "li",
                            "",
                            face(entry, "sgface"),
                            entry.name,
                            entry.online ? pill("pill--ok", "im Dashboard") : "",
                            entry.dm === false ? pill("sgpill--warn", "DM nicht zustellbar") : ""
                        )
                    )
                ),
                el("div", "sgactions", withdraw),
                note
            );
        }

        if (grant?.status === "active" && grant.endsAt) {
            const line =
                grant.private === "on"
                    ? "Die privaten Bereiche sind offen."
                    : grant.private === "asked"
                      ? "Private Bereiche angefragt, warte auf Antwort."
                      : "Private Bereiche fragst du auf einer der privaten Seiten an.";

            return el("p", "sghint", `Freigabe läuft bis ${CLOCK.format(grant.endsAt)} Uhr. ${line}`);
        }

        if (data.blocked) return el("div", "sgactions", el("p", "sghint", data.blocked), Disabled());
        if (!data.askees.length) return el("div", "sgactions", el("p", "sghint", "Niemand kann gerade gefragt werden: weder der Owner noch ein Verwalter hat einen Zugang."), Disabled());

        const reason = el("textarea", "sgreason");
        const count = el("span", "sgcount", "0/200");
        let minutes: number | null = 60;
        let withPrivate = false;
        const send = button("btn btn--primary", "Bearbeiten anfragen");

        reason.maxLength = 200;
        reason.rows = 2;
        reason.placeholder = "Zum Beispiel: Ich zeige dir, wie die Rangliste im Kanal geht";
        reason.setAttribute("aria-label", "Grund");
        reason.addEventListener("input", () => (count.textContent = `${reason.value.length}/200`));

        send.addEventListener("click", () => {
            if (!reason.value.trim()) return fail("Bitte gib einen Grund an.");
            if (minutes === null) return fail("Bitte 10 Minuten bis 24 Stunden.");

            send.disabled = true;
            void staffApi(guild.id, { action: "request", reason: reason.value, minutes, private: withPrivate }).then(({ error }) => {
                send.disabled = false;

                if (error) fail(error);
                else void refresh();
            });
        });

        return el(
            "div",
            "sgask",
            el("div", "sgask__grid",
                el("label", "sgfield", el("span", "sglabel", `Grund · sieht ${data.askees[0]?.name ?? "der Gefragte"}`), reason, count),
                el("div", "sgfield", el("span", "sglabel", "Wie lange"), durationPicker(60, (value) => (minutes = value)))
            ),
            el(
                "div",
                "sgprivbox",
                el("label", "sgswitch", toggle(false, "Auch private Bereiche anfragen", (on) => (withPrivate = on)), el("span", "", el("b", "", "Auch private Bereiche anfragen"), el("small", "", `${data.askees[0]?.name ?? "Der Gefragte"} wird dazu extra gefragt`))),
                privateChips()
            ),
            el("div", "sgactions", el("span", "sghint", "Bei Free fragt der Bot den Owner, bei Beta den Beta-Nutzer."), send),
            note
        );
    }

    tick(() => void refresh());
    onMyPulse(["staff"], () => void refresh());
    void refresh();
}

function Disabled(): HTMLButtonElement {
    const off = button("btn btn--primary", "Bearbeiten anfragen");

    off.disabled = true;

    return off;
}

/* ----------------------------------------------------------
   Private Bereiche: die Sperrkarte bei Staff ohne das extra Ja
   ---------------------------------------------------------- */

export function lockPrivate(section: HTMLElement, guild: IGuild): void {
    const head = section.querySelector(".modhead");
    const body = el("div", "sglock");

    section.replaceChildren(...(head ? [head] : []), body);

    const paint = async (): Promise<void> => {
        const { data } = await staffApi<IStaffState>(guild.id);
        const grant = data?.grant;
        const who = grant?.answeredBy?.name ?? "dem Gefragten";
        const note = el("p", "sgerror");

        note.hidden = true;

        if (grant?.private === "asked") {
            body.replaceChildren(el("div", "sglock__icon", icon("#i-lock")), el("h3", "", "Privater Bereich"), el("p", "", `Angefragt. Sobald ${who} Ja sagt, geht diese Seite von selbst auf.`));

            return;
        }

        const reason = el("textarea", "sgreason");
        const send = button("btn btn--warm", "Private Bereiche anfragen");

        reason.maxLength = 200;
        reason.rows = 2;
        reason.placeholder = "Zum Beispiel: Ticket #0142 hängt, ich will den Verlauf sehen";
        reason.setAttribute("aria-label", "Grund");
        send.addEventListener("click", () => {
            if (!reason.value.trim()) {
                note.hidden = false;
                note.textContent = "Bitte gib einen Grund an.";

                return;
            }

            send.disabled = true;
            void staffApi(guild.id, { action: "private", reason: reason.value }).then(({ error }) => {
                send.disabled = false;

                if (error) {
                    note.hidden = false;
                    note.textContent = error;
                } else void paint();
            });
        });

        body.replaceChildren(
            el("div", "sglock__icon", icon("#i-lock")),
            el("h3", "", "Privater Bereich"),
            el("p", "", `Hier stehen Gespräche von Mitgliedern. Dafür braucht es ein extra Ja von ${who}, die laufende Freigabe reicht nicht.`),
            el("label", "sgfield sglock__field", el("span", "sglabel", "Grund · Pflicht"), reason),
            send,
            note
        );
    };

    void paint();
}

/* ----------------------------------------------------------
   Verwalter: rote Leiste mit Live-Liste, „Staff-Zugriffe“ auf der Übersicht
   ---------------------------------------------------------- */

interface ILogEntry {
    id: number;
    grantId: number;
    at: number;
    area: string;
    text: string;
}

interface IManagerState {
    me: "manager";
    grant: IGrantView | null;
    log: ILogEntry[];
    recent: { grants: IGrantView[]; log: ILogEntry[] };
}

const WHEN = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function logList(entries: ILogEntry[], format: Intl.DateTimeFormat): HTMLElement {
    return el(
        "ol",
        "sglog",
        ...entries.map((entry) => el("li", "", el("time", "", format.format(entry.at)), el("span", "", `${entry.text.endsWith(" geöffnet") ? "🔏 " : ""}${entry.text}`)))
    );
}

export function renderManagerBar(guild: IGuild): void {
    const bar = need<HTMLElement>("#managerBar");
    const recent = maybe<HTMLElement>("#staffRecent");

    const paint = async (): Promise<void> => {
        const { data } = await staffApi<IManagerState>(guild.id);

        if (!data) return;

        const grant = data.grant;
        const act = (action: string): void =>
            void staffApi(guild.id, { action }).then(({ error }) => {
                if (error) toast("info", "Staff-Freigabe", error);

                void paint();
            });

        if (grant?.status === "active" && grant.endsAt) {
            const more = button("btn btn--quiet sgbar__btn", "+30 Min.");
            const end = button("btn btn--primary sgbar__btn", "Beenden");
            const off = button("btn btn--quiet sgbar__btn", "Private wegnehmen");

            more.addEventListener("click", () => act("extend"));
            end.addEventListener("click", () => act("end"));
            off.addEventListener("click", () => act("private-off"));

            bar.hidden = false;
            bar.replaceChildren(
                el(
                    "div",
                    "sgbar__row",
                    face(grant.staff, "sgface"),
                    el("span", "sgbar__text", el("b", "", grant.staff.name), ` (${grant.staff.role}) bearbeitet gerade deinen Server`),
                    ...(grant.private === "on" ? [pill("sgpill--warn", "+ private Bereiche")] : []),
                    el("span", "sgbar__grow"),
                    timer(grant.endsAt),
                    ...(grant.private === "on" ? [off] : []),
                    more,
                    end
                ),
                el(
                    "div",
                    "sglive",
                    el("div", "sglive__head", el("span", "sglabel", "Live: was Staff ändert und ansieht"), el("span", "sghint", "aktualisiert sich selbst")),
                    data.log.length ? logList(data.log, CLOCK) : el("p", "sghint", "Noch nichts geändert.")
                )
            );
        } else {
            bar.hidden = true;
            bar.replaceChildren();
        }

        if (recent) {
            recent.hidden = data.recent.log.length === 0;
            recent.replaceChildren(
                el("h2", "", "Staff-Zugriffe"),
                el("p", "ovcard__sub", "Was der RL Nexus Staff hier in den letzten 30 Tagen geändert und angesehen hat."),
                logList(data.recent.log.slice(0, 30), WHEN)
            );
        }
    };

    tick(() => void paint());
    onPulse(guild.id, ["staff"], () => void paint());
    void paint();
}
