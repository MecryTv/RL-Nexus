/**
 * Protokoll der Staff-Freigaben (W-0049, Entwurf A+ in w0049-protokoll-a2.html):
 * oben die Zahlen, darunter Filter und Suche, je Freigabe eine Karte. Laufende
 * sind offen und haben die Knöpfe wie in der Leiste, vergangene stehen in
 * einer Zeile und klappen bei „Details“ auf. Nur wer den Server verwaltet.
 */

import { url } from "../core/Base.js";
import { need } from "../core/Dom.js";
import { debounce, onPulse } from "../core/Pulse.js";
import { toast } from "../core/Toast.js";
import { button, el, face } from "../core/Ui.js";
import { durationText, staffApi, timer } from "./GuildStaff.js";

type Kind = "change" | "view" | "private" | "grant";
type Status = "open" | "active" | "denied" | "expired" | "withdrawn" | "ended";

interface IPerson {
    id: string | null;
    name: string;
}

interface IEntry {
    id: number;
    at: number;
    kind: Kind;
    area: string;
    text: string;
    changes: { label: string; before: string; after: string }[];
    seconds: number | null;
}

interface IGrant {
    id: number;
    status: Status;
    reason: string;
    staff: { id: string; name: string; avatar: string | null; role: "Developer" | "Admin" };
    mode: "paid" | "free" | "beta";
    createdAt: number;
    requestedMinutes: number | null;
    minutes: number;
    asked: IPerson[];
    denied: IPerson[];
    answeredBy: IPerson | null;
    startsAt: number | null;
    endsAt: number | null;
    endedAt: number | null;
    endedBy: IPerson | null;
    extensions: { at: number; by: IPerson | null; minutes: number }[];
    private: {
        state: "none" | "asked" | "on" | "denied" | "removed";
        reason: string | null;
        askedAt: number | null;
        at: number | null;
        by: IPerson | null;
        deniedAt: number | null;
        removedAt: number | null;
        removedBy: IPerson | null;
    };
    log: IEntry[];
}

interface IProtocol {
    now: number;
    keepDays: number;
    grants: IGrant[];
}

type Show = "alle" | "laeuft" | "privat" | "abgelehnt";
type Tab = "all" | Kind;

const DAY_MS = 86_400_000;
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const MODES = { paid: "bezahlt", free: "frei", beta: "Beta" } as const;
const ICONS: Record<Kind, string> = { change: "✏️", view: "👁", private: "🔏", grant: "🔑" };
const TABS: [Tab, string][] = [
    ["all", "Alles"],
    ["change", "Geändert"],
    ["view", "Angesehen"],
    ["private", "🔏 Privat"],
    ["grant", "Freigabe"],
];
const SHOWS: [Show, string][] = [
    ["alle", "Alle"],
    ["laeuft", "Läuft"],
    ["privat", "Mit privaten Bereichen"],
    ["abgelehnt", "Abgelehnt"],
];

/** „heute 14:02“, „gestern 09:40“, sonst „28.10. 19:00“. */
function when(at: number): string {
    const day = new Date(at).toDateString();
    const today = new Date();

    if (day === today.toDateString()) return `heute ${CLOCK.format(at)}`;
    if (day === new Date(today.getTime() - DAY_MS).toDateString()) return `gestern ${CLOCK.format(at)}`;

    return `${DATE.format(at)} ${CLOCK.format(at)}`;
}

/** Abstand in Minuten, unter einer Minute als Satz. */
function span(from: number, to: number): string {
    const minutes = Math.round((to - from) / 60_000);

    return minutes < 1 ? "unter 1 Min." : durationText(minutes);
}

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

export function renderProtocol(guildId: string, me: string): void {
    const host = need<HTMLElement>("#protocolBody");

    let data: IProtocol | null = null;
    let show: Show = "alle";
    let person = "";
    let area = "";
    let days = 180;
    let query = "";
    const open = new Set<number>();
    const tabs = new Map<number, Tab>();

    /** Nach „von“: „von dir“. */
    const who = (found: IPerson | null): string => (!found ? "jemand" : found.id === me ? "dir" : found.name);
    /** Als Subjekt oder in Aufzählungen: „du, Lena“. */
    const nom = (found: IPerson | null): string => (!found ? "jemand" : found.id === me ? "du" : found.name);

    // Fest stehende Teile: Beim Nachladen tauschen nur Zahlen und Liste, die Filter bleiben, samt Fokus im Suchfeld.
    const statsHost = el("div", "");
    const filtersHost = el("div", "");
    const note = el("p", "prnote");
    let filterKey = "";
    let asked = 0;
    let stale = false;

    const section = need<HTMLElement>("#protokoll");

    /** Nur die neueste Antwort zählt. Ein Fehler ersetzt nichts, was schon da ist. Versteckt: erst beim Anzeigen. */
    const load = async (): Promise<void> => {
        if (section.hidden) {
            stale = true;

            return;
        }

        const mine = ++asked;
        let failed: string | null = null;

        try {
            const response = await fetch(url(`/api/guild/${encodeURIComponent(guildId)}/staff/protokoll`), { headers: { Accept: "application/json" } });
            const body = (await response.json().catch(() => null)) as (IProtocol & { hint?: string; error?: string }) | null;

            if (mine !== asked) return;

            if (response.ok && body) {
                data = body;
                paint();

                return;
            }

            failed = body?.hint ?? body?.error ?? "Das Protokoll ließ sich nicht laden.";
        } catch {
            if (mine !== asked) return;

            failed = "Der Bot antwortet gerade nicht.";
        }

        if (!data) host.replaceChildren(el("p", "prempty", failed));
    };

    const act = (action: string): void =>
        void staffApi(guildId, { action }).then(({ error }) => {
            if (error) toast("info", "Staff-Freigabe", error);

            void load();
        });

    /* ---------- Auswahl ---------- */

    function inRange(grant: IGrant, now: number): boolean {
        return Math.max(grant.createdAt, grant.endedAt ?? 0) >= now - days * DAY_MS || grant.status === "open" || grant.status === "active";
    }

    function entriesOf(grant: IGrant): IEntry[] {
        return area ? grant.log.filter((entry) => entry.area === area) : grant.log;
    }

    function matches(grant: IGrant): boolean {
        if (show === "laeuft" && grant.status !== "active" && grant.status !== "open") return false;
        if (show === "privat" && grant.private.at === null && grant.private.state !== "on" && grant.private.state !== "removed") return false;
        if (show === "abgelehnt" && grant.status !== "denied") return false;
        if (person && grant.staff.id !== person) return false;
        if (area && !grant.log.some((entry) => entry.area === area)) return false;

        const text = query.trim().toLowerCase();

        if (!text) return true;

        const haystack = [
            grant.reason,
            grant.staff.name,
            grant.private.reason ?? "",
            ...grant.log.flatMap((entry) => [entry.area, entry.text, ...entry.changes.flatMap((change) => [change.label, change.before, change.after])]),
        ];

        return haystack.some((value) => value.toLowerCase().includes(text));
    }

    /* ---------- Zeichnen ---------- */

    function stats(grants: IGrant[], now: number): HTMLElement {
        const allowed = grants.filter((grant) => grant.startsAt !== null).length;
        const denied = grants.filter((grant) => grant.status === "denied").length;
        const expired = grants.filter((grant) => grant.status === "expired").length;
        const minutes = grants.reduce((sum, grant) => (grant.startsAt === null ? sum : sum + Math.max(0, (Math.min(grant.endedAt ?? now, grant.endsAt ?? now) - grant.startsAt) / 60_000)), 0);
        const changes = grants.flatMap((grant) => grant.log.filter((entry) => entry.kind === "change"));
        const privates = grants.filter((grant) => grant.private.at !== null || grant.private.state === "on" || grant.private.state === "removed").length;
        const opened = grants.reduce((sum, grant) => sum + grant.log.filter((entry) => entry.kind === "private").length, 0);
        const tile = (label: string, value: string, sub: string): HTMLElement => el("div", "prtile", el("div", "prtile__k", label), el("div", "prtile__v", value), el("div", "prtile__s", sub));

        return el(
            "div",
            "prtiles",
            tile("Freigaben", String(grants.length), [`${allowed} erlaubt`, ...(denied ? [`${denied} abgelehnt`] : []), ...(expired ? [`${expired} verfallen`] : [])].join(" · ")),
            tile("Staff-Zeit", minutes < 1 ? "0 Min." : durationText(Math.round(minutes)), `auf diesem Server, ${days} Tage`),
            tile("Änderungen", String(changes.length), `in ${plural(new Set(changes.map((entry) => entry.area)).size, "Bereich", "Bereichen")}`),
            tile("Private Bereiche", `${privates}×`, `erlaubt · ${plural(opened, "Ding", "Dinge")} geöffnet`)
        );
    }

    function filters(grants: IGrant[]): HTMLElement {
        const chips = SHOWS.map(([value, label]) => {
            const chip = button(`prchip${show === value ? " is-on" : ""}`, label);

            chip.dataset.show = value;
            chip.setAttribute("aria-pressed", String(show === value));
            chip.addEventListener("click", () => {
                show = value;

                // An Ort und Stelle umschalten: Der Fokus bleibt auf dem Chip.
                for (const other of filtersHost.querySelectorAll<HTMLButtonElement>(".prchip")) {
                    other.classList.toggle("is-on", other.dataset.show === value);
                    other.setAttribute("aria-pressed", String(other.dataset.show === value));
                }

                paintCards();
            });

            return chip;
        });
        const people = [...new Map(grants.map((grant) => [grant.staff.id, grant.staff.name])).entries()];
        const areas = [...new Set(grants.flatMap((grant) => grant.log.map((entry) => entry.area)))].sort((a, b) => a.localeCompare(b, "de"));
        const pick = (label: string, value: string, options: [string, string][], onPick: (next: string) => void): HTMLSelectElement => {
            const select = el("select", "pick prpick");

            select.setAttribute("aria-label", label);

            for (const [key, text] of options) {
                const option = el("option", "", text);

                option.value = key;
                option.selected = key === value;
                select.append(option);
            }

            select.addEventListener("change", () => onPick(select.value));

            return select;
        };
        const search = el("input", "prsearch");

        search.type = "search";
        search.placeholder = "Suchen: Grund, Bereich, Kanal …";
        search.setAttribute("aria-label", "Im Protokoll suchen");
        search.value = query;
        search.addEventListener("input", () => {
            query = search.value;
            paintCards();
        });

        return el(
            "div",
            "prfilters",
            ...chips,
            pick("Person", person, [["", "Alle Personen"], ...people], (next) => {
                person = next;
                paintCards();
            }),
            pick("Bereich", area, [["", "Alle Bereiche"], ...areas.map((name): [string, string] => [name, name])], (next) => {
                area = next;
                paintCards();
            }),
            pick("Zeitraum", String(days), [["180", "180 Tage"], ["30", "30 Tage"], ["7", "7 Tage"]], (next) => {
                days = Number(next);
                paintStats();
                paintCards();
            }),
            search
        );
    }

    function statusPill(grant: IGrant): HTMLElement[] {
        const pill = (tone: string, text: string | Node, ...more: (string | Node)[]): HTMLElement => el("span", `pill prpill prpill--${tone}`, text, ...more);
        const extra = grant.status === "active" && grant.private.state === "on" ? [pill("priv", "+ private")] : [];

        switch (grant.status) {
            case "open":
                return [pill("wait", "wartet auf Antwort")];
            case "active":
                return [pill("ok", "läuft noch ", timer(grant.endsAt ?? Date.now(), "sgtimer sgtimer--inline")), ...extra];
            case "ended":
                return [pill("end", grant.endedBy ? `beendet von ${who(grant.endedBy)}` : "Zeit abgelaufen")];
            case "denied":
                return [pill("no", "abgelehnt")];
            case "expired":
                return [pill("end", "verfallen")];
            case "withdrawn":
                return [pill("end", "zurückgezogen")];
        }
    }

    function fact(label: string, value: string, sub: string, ...extra: Node[]): HTMLElement {
        return el("div", "prfact", el("span", "prfact__k", label), el("b", "", value), ...extra, ...(sub ? [el("small", "", sub)] : []));
    }

    function facts(grant: IGrant): HTMLElement {
        const requested = grant.requestedMinutes ?? (grant.startsAt === null ? grant.minutes : null);
        const deniedIds = new Set(grant.denied.map((found) => found.id));
        const faces = el("span", "prfaces", ...grant.asked.map((found) => el("i", deniedIds.has(found.id) ? "is-no" : "", (found.name.trim()[0] ?? "?").toUpperCase())));
        const askedNames = grant.asked.filter((found) => !deniedIds.has(found.id)).map(nom);
        const verb = grant.denied.length > 1 ? "haben" : grant.denied[0]?.id === me ? "hast" : "hat";
        const said = grant.denied.length ? `${grant.denied.map(nom).join(", ")} ${verb} „Nein“ gesagt` : "";
        const ext = grant.extensions;
        const priv = grant.private;
        const asked = priv.askedAt !== null ? `gefragt ${CLOCK.format(priv.askedAt)}${priv.reason ? ` · „${priv.reason}“` : ""}` : "";

        const answer = (): [string, string] => {
            if (grant.startsAt !== null) {
                const shorter = requested !== null && requested !== grant.minutes ? ` · ${durationText(grant.minutes)} statt ${durationText(requested)}` : "";

                return [`Ja von ${who(grant.answeredBy)}, ${CLOCK.format(grant.startsAt)}`, `nach ${span(grant.createdAt, grant.startsAt)}${shorter}`];
            }

            switch (grant.status) {
                case "denied":
                    return ["Nein", grant.endedAt !== null ? `nach ${span(grant.createdAt, grant.endedAt)}` : ""];
                case "expired":
                    return ["keine", "niemand hat in 10 Min. geantwortet"];
                case "withdrawn":
                    return ["zurückgezogen", grant.endedAt !== null ? `nach ${span(grant.createdAt, grant.endedAt)}` : ""];
                default:
                    return ["noch offen", ""];
            }
        };
        const privateFact = (): [string, string] => {
            switch (priv.state) {
                case "none":
                    return ["nicht angefragt", ""];
                case "asked":
                    return ["angefragt, wartet", asked];
                case "denied":
                    return ["abgelehnt", asked];
                case "on":
                    return [`erlaubt von ${who(priv.by)}${priv.at !== null ? `, ${CLOCK.format(priv.at)}` : ""}`, asked];
                case "removed":
                    return [
                        `weggenommen von ${who(priv.removedBy)}${priv.removedAt !== null ? `, ${CLOCK.format(priv.removedAt)}` : ""}`,
                        `erlaubt von ${who(priv.by)}${priv.at !== null ? `, ${CLOCK.format(priv.at)}` : ""}`,
                    ];
            }
        };
        const end = (): [string, string] => {
            switch (grant.status) {
                case "active":
                    return ["noch offen", grant.endsAt !== null ? `endet von selbst um ${CLOCK.format(grant.endsAt)}` : ""];
                case "open":
                    return ["–", `verfällt um ${CLOCK.format(grant.createdAt + 10 * 60_000)}`];
                case "ended":
                    return [grant.endedBy ? `beendet von ${who(grant.endedBy)}` : "Zeit abgelaufen", grant.endedAt !== null ? when(grant.endedAt) : ""];
                default:
                    return [{ denied: "abgelehnt", expired: "verfallen", withdrawn: "zurückgezogen" }[grant.status], grant.endedAt !== null ? when(grant.endedAt) : ""];
            }
        };
        const [answered, answeredSub] = answer();
        const [privText, privSub] = privateFact();
        const [ended, endedSub] = end();

        return el(
            "div",
            "prfacts",
            fact("Angefragt", when(grant.createdAt), [requested !== null ? `für ${durationText(requested)}` : "", `Zugang: ${MODES[grant.mode]}`].filter(Boolean).join(" · ")),
            fact("Gefragt wurden", plural(grant.asked.length, "Person", "Personen"), [askedNames.join(", "), said].filter(Boolean).join(" · "), faces),
            fact("Antwort", answered, answeredSub),
            fact(
                "Dauer",
                grant.startsAt !== null ? `${CLOCK.format(grant.startsAt)} bis ${CLOCK.format(grant.endedAt ?? grant.endsAt ?? grant.startsAt)}` : "–",
                grant.startsAt === null ? "" : ext.length === 0 ? "nicht verlängert" : ext.length === 1 ? `einmal verlängert, +${ext[0]!.minutes} Min. um ${CLOCK.format(ext[0]!.at)}` : `${ext.length}× verlängert, zuletzt um ${CLOCK.format(ext.at(-1)!.at)}`
            ),
            fact("Private Bereiche", privText, privSub),
            fact("Ende", ended, endedSub)
        );
    }

    /** Die Zeitleiste der Freigabe: Anfrage, Ja, Verlängerungen, privat, jetzt, Ende. */
    function life(grant: IGrant, now: number): HTMLElement | null {
        if (grant.startsAt === null) return null;

        const from = grant.createdAt;
        const to = grant.status === "active" ? Math.max(grant.endsAt ?? now, now) : (grant.endedAt ?? grant.endsAt ?? now);
        const width = Math.max(1, to - from);
        const at = (time: number): number => Math.min(100, Math.max(0, ((time - from) / width) * 100));
        const box = el("div", "prlife");
        const style = (node: HTMLElement, left: number, right?: number): HTMLElement => {
            node.style.left = `${left}%`;
            if (right !== undefined) node.style.right = `${100 - right}%`;

            return node;
        };
        const marks: { time: number; label: string; kind: "mk" | "warn" | "now" }[] = [
            { time: from, label: `${CLOCK.format(from)} Anfrage`, kind: "mk" },
            { time: grant.startsAt, label: "Ja", kind: "mk" },
            ...grant.extensions.map((extension) => ({ time: extension.at, label: `${CLOCK.format(extension.at)} +${extension.minutes}`, kind: "mk" as const })),
            ...(grant.private.at !== null ? [{ time: grant.private.at, label: `${CLOCK.format(grant.private.at)} privat`, kind: "warn" as const }] : []),
            ...(grant.private.removedAt !== null ? [{ time: grant.private.removedAt, label: `${CLOCK.format(grant.private.removedAt)} privat weg`, kind: "warn" as const }] : []),
            ...(grant.status === "active" ? [{ time: now, label: "jetzt", kind: "now" as const }] : []),
        ];
        // Das Ende steht rechts fest; Beschriftungen davor brauchen Platz bis dorthin.
        const endAt = 100;
        let lastLabel = -100;

        box.append(el("i", "prlife__track"));
        box.append(style(el("i", "prlife__run"), at(grant.startsAt), at(grant.endedAt ?? to)));

        if (grant.private.at !== null) box.append(style(el("i", "prlife__pv"), at(grant.private.at), at(grant.private.removedAt ?? grant.endedAt ?? to)));

        for (const mark of marks.sort((a, b) => a.time - b.time)) {
            const left = at(mark.time);
            const marker = style(el("i", mark.kind === "now" ? "prlife__now" : `prlife__mk${mark.kind === "warn" ? " prlife__mk--warn" : ""}`), left);

            marker.title = mark.kind === "now" ? "jetzt" : `${CLOCK.format(mark.time)} ${mark.label}`;
            box.append(marker);

            // Zu dicht an der letzten Beschriftung oder am Ende: nur der Strich, der Text steht im Tooltip.
            if (left - lastLabel < 12 || endAt - left < 8) continue;

            lastLabel = left;
            box.append(style(el("span", `prlife__lb${mark.kind === "now" ? " prlife__lb--now" : ""}`, mark.label), left));
        }

        box.append(el("span", "prlife__lb prlife__lb--end", CLOCK.format(to)));

        return box;
    }

    function areas(entries: IEntry[]): HTMLElement | null {
        if (!entries.length) return null;

        const counts = new Map<string, { count: number; kinds: Set<Kind> }>();

        for (const entry of entries) {
            const found = counts.get(entry.area) ?? { count: 0, kinds: new Set<Kind>() };

            found.count++;
            found.kinds.add(entry.kind);
            counts.set(entry.area, found);
        }

        return el(
            "div",
            "prareas",
            ...[...counts].map(([name, found]) =>
                el("span", "", name, el("b", "", `${found.count}${found.kinds.has("private") ? " 🔏" : found.kinds.size === 1 && found.kinds.has("view") ? " 👁" : ""}`))
            )
        );
    }

    function entryLine(grant: IGrant, entry: IEntry): HTMLElement {
        const prefix = `${entry.area} › `;
        const text = entry.text.startsWith(prefix) ? entry.text.slice(prefix.length) : entry.text;
        const sameDay = new Date(entry.at).toDateString() === new Date(grant.createdAt).toDateString();
        const what = el("span", "prlog__w", text);

        if (entry.kind === "private") {
            const minutes = entry.seconds === null ? null : Math.round(entry.seconds / 60);

            what.append(el("small", "", `privater Bereich${minutes === null ? "" : minutes < 1 ? " · unter 1 Min. drin" : ` · ${durationText(minutes)} drin`}`));
        }

        if (entry.kind === "grant" && entry.text === "Private Bereiche angefragt" && grant.private.reason) what.append(el("small", "", `„${grant.private.reason}“`));

        for (const change of entry.changes) {
            what.append(el("div", "prdiff", el("span", "prdiff__k", `${change.label}: `), el("s", "prdiff__o", change.before), " → ", el("span", "prdiff__n", change.after)));
        }

        return el(
            "div",
            "prlog__e",
            el("time", "", sameDay ? CLOCK.format(entry.at) : `${DATE.format(entry.at)} ${CLOCK.format(entry.at)}`),
            el("span", "prlog__t", ICONS[entry.kind]),
            el("span", "prlog__a", entry.area),
            what
        );
    }

    function log(grant: IGrant): HTMLElement[] {
        const entries = entriesOf(grant);
        const current = tabs.get(grant.id) ?? "all";
        const count = (tab: Tab): number => (tab === "all" ? entries.length : entries.filter((entry) => entry.kind === tab).length);
        const bar = el("div", "prtabs");

        bar.setAttribute("role", "group");
        bar.setAttribute("aria-label", "Einträge filtern");

        for (const [tab, label] of TABS) {
            if (tab !== "all" && count(tab) === 0) continue;

            const chip = button(`prtab${tab === current ? " is-on" : ""}`, `${label} · ${count(tab)}`);

            chip.setAttribute("aria-pressed", String(tab === current));
            chip.addEventListener("click", () => {
                tabs.set(grant.id, tab);
                paintCards();
            });
            bar.append(chip);
        }

        const shown = current === "all" ? entries : entries.filter((entry) => entry.kind === current);

        return [bar, shown.length ? el("div", "prlog", ...shown.map((entry) => entryLine(grant, entry))) : el("p", "prlog__none", "Hier steht nichts.")];
    }

    function summary(grant: IGrant): HTMLElement {
        const changes = grant.log.filter((entry) => entry.kind === "change");
        const changeAreas = [...new Set(changes.map((entry) => entry.area))];
        const changed = changes.length ? `${plural(changes.length, "Änderung", "Änderungen")} in ${changeAreas.join(", ")}` : "nichts geändert";
        const details = button("prmore", "Details ▾");
        const parts: (string | Node)[] = [];

        details.setAttribute("aria-expanded", "false");
        details.addEventListener("click", () => {
            open.add(grant.id);
            paintCards();
        });

        if (grant.startsAt !== null) {
            const until = grant.endedAt ?? grant.endsAt ?? grant.startsAt;
            const used = Math.round((until - grant.startsAt) / 60_000);

            parts.push(
                el("b", "", `${when(grant.startsAt)} bis ${CLOCK.format(until)}`),
                ` · ${used < 1 ? "unter 1 Min." : durationText(used)} von ${durationText(grant.minutes + grant.extensions.reduce((sum, extension) => sum + extension.minutes, 0))}`,
                ` · Ja von ${who(grant.answeredBy)} nach ${span(grant.createdAt, grant.startsAt)}`,
                ` · ${changed}`,
                ` · ${grant.private.at !== null || grant.private.state === "removed" ? "private Bereiche erlaubt" : "keine privaten Bereiche"}`
            );
        } else if (grant.status === "denied") {
            parts.push(
                el("b", "", when(grant.createdAt)),
                ...(grant.requestedMinutes !== null || grant.minutes ? [` · angefragt für ${durationText(grant.requestedMinutes ?? grant.minutes)}`] : []),
                ` · „Nein“ von ${grant.denied.map(who).join(", ") || "allen"}${grant.endedAt !== null ? ` nach ${span(grant.createdAt, grant.endedAt)}` : ""}`,
                " · nichts geändert"
            );
        } else if (grant.status === "expired") {
            parts.push(el("b", "", when(grant.createdAt)), " · niemand hat in 10 Min. geantwortet", ` · gefragt: ${grant.asked.map(nom).join(", ")}`, " · nichts geändert");
        } else {
            parts.push(el("b", "", when(grant.createdAt)), ` · zurückgezogen${grant.endedAt !== null ? ` nach ${span(grant.createdAt, grant.endedAt)}` : ""}`, " · nichts geändert");
        }

        return el("div", "prsum", ...parts, " · ", details);
    }

    function card(grant: IGrant, now: number): HTMLElement {
        const live = grant.status === "active" || grant.status === "open";
        const expanded = live || open.has(grant.id);
        const top = el(
            "div",
            "prcard__top",
            face(grant.staff, "sgface prcard__face"),
            el(
                "div",
                "prcard__who",
                el("b", "", grant.staff.name),
                " ",
                el("span", "pill sgpill--staff", grant.staff.role),
                el("span", "prcard__id", `Freigabe #${grant.id}`),
                el("small", "", `„${grant.reason}“`)
            ),
            ...statusPill(grant)
        );
        const node = el("article", `prcard${grant.status === "active" ? " is-live" : ""}`, top);

        node.setAttribute("aria-label", `Freigabe #${grant.id} für ${grant.staff.name}`);

        if (!expanded) {
            node.append(summary(grant));

            return node;
        }

        node.append(facts(grant));

        const timeline = life(grant, now);

        if (timeline) node.append(timeline);

        const touched = areas(entriesOf(grant));

        if (touched) node.append(touched);

        node.append(...log(grant));

        if (grant.status === "active") {
            const more = button("btn btn--quiet", "+30 Min.");
            const end = button("btn btn--primary", "Beenden");
            const off = button("btn btn--quiet", "Private wegnehmen");

            more.addEventListener("click", () => act("extend"));
            end.addEventListener("click", () => act("end"));
            off.addEventListener("click", () => act("private-off"));
            node.append(el("div", "prcard__foot", ...(grant.private.state === "on" ? [off] : []), more, end));
        } else if (!live) {
            const less = button("prmore", "Details ▴");

            less.setAttribute("aria-expanded", "true");
            less.addEventListener("click", () => {
                open.delete(grant.id);
                paintCards();
            });
            node.append(el("div", "prcard__foot", less));
        }

        return node;
    }

    const list = el("div", "prlist");

    function paintCards(): void {
        if (!data) return;

        const now = Date.now();
        const grants = data.grants.filter((grant) => inRange(grant, now)).filter(matches);

        list.replaceChildren(
            ...(grants.length
                ? grants.map((grant) => card(grant, now))
                : [el("p", "prempty", data.grants.length ? "Nichts passt zu den Filtern." : "Der RL Nexus Staff hat hier noch keine Freigabe angefragt.")])
        );
    }

    function paintStats(): void {
        if (!data) return;

        const now = Date.now();

        statsHost.replaceChildren(stats(data.grants.filter((grant) => inRange(grant, now)), now));
    }

    function paint(): void {
        if (!data) return;

        if (!host.contains(list)) host.replaceChildren(statsHost, filtersHost, list, note);

        note.textContent = `Ältere Einträge als ${data.keepDays} Tage löscht der Bot.`;
        paintStats();

        // Die Filterleiste nur neu, wenn neue Personen oder Bereiche dazukommen - und nie unter dem Fokus weg.
        const key = JSON.stringify([data.grants.map((grant) => grant.staff.id), data.grants.flatMap((grant) => grant.log.map((entry) => entry.area))].map((values) => [...new Set(values)].sort()));

        if (key !== filterKey && !filtersHost.contains(document.activeElement)) {
            filterKey = key;
            filtersHost.replaceChildren(filters(data.grants));
        }

        paintCards();
    }

    host.replaceChildren(el("p", "prempty", "Wird geladen …"));
    // Die Zähler laufen über den Takt der Verwalter-Leiste (GuildStaff.tick), die immer vor dieser Seite startet.
    onPulse(guildId, ["staff"], debounce(() => void load(), 500));
    window.addEventListener("guild:shown", (event) => {
        if ((event as CustomEvent<string>).detail !== "protokoll" || !stale) return;

        stale = false;
        void load();
    });
    void load();
}
