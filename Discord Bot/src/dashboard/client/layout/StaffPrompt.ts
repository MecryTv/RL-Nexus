/**
 * Das Pop-up für den, der gefragt wird (W-0011): auf jeder Seite des
 * Dashboards, sperrt die Seite bis zur Antwort. Entwurf
 * w0011-staff-freigabe-v2.html Teil 2 A mit den Texten aus
 * w0011-private-bereiche.html Teil 2 A. Fragt Staff die privaten Bereiche erst
 * während der Freigabe an, kommt dasselbe Fenster nur mit Grund und Kasten.
 */

import { onMyPulse } from "../core/Pulse.js";
import { toast } from "../core/Toast.js";
import { button, el, face, toggle } from "../core/Ui.js";
import { IGrantView, durationPicker, meApi, privateChips } from "../pages/GuildStaff.js";

/** So lange wartet eine Anfrage (wie REQUEST_TTL_MS im Bot) - für den Ring. */
const TTL = 10 * 60_000;

let open: { id: number; kind: "grant" | "private"; close: () => void } | null = null;

export function watchStaffPrompts(): void {
    const refresh = async (): Promise<void> => {
        const { data } = await meApi<{ requests: IGrantView[] }>();

        if (!data) return;

        const next = data.requests[0] ?? null;
        const kind = next?.status === "active" ? "private" : "grant";

        // Woanders beantwortet, verfallen oder zurückgezogen: das Fenster geht von selbst zu.
        if (open && (!next || next.id !== open.id || kind !== open.kind)) {
            open.close();
            open = null;
        }

        if (next && !open) show(next, kind, refresh);
    };

    onMyPulse(["staff"], () => void refresh());
    void refresh();
}

function show(grant: IGrantView, kind: "grant" | "private", refresh: () => Promise<void>): void {
    const late = kind === "private";
    const asksPrivate = grant.private === "asked";
    let minutes: number | null = grant.minutes;
    let allowPrivate = false;
    const note = el("p", "sgerror");
    const title = el("h2", "sgprompt__title", late ? `Darf ${grant.staff.name} auch in die privaten Bereiche?` : `Darf der Staff ${grant.guild.name} bearbeiten?`);
    const ring = el("div", "sgring", el("i", ""));
    const deny = button("btn btn--quiet", "Ablehnen");
    const allow = button("btn btn--primary", "Erlauben");
    const box = el("div", "sgprompt");
    const dim = el("div", "sgdim", box);
    const answer = async (yes: boolean): Promise<void> => {
        if (yes && !late && minutes === null) {
            note.hidden = false;
            note.textContent = "Bitte 10 Minuten bis 24 Stunden.";

            return;
        }

        deny.disabled = allow.disabled = true;

        const { error } = await meApi({ grantId: grant.id, kind, answer: yes ? "yes" : "no", minutes, private: allowPrivate });

        deny.disabled = allow.disabled = false;

        if (error) {
            note.hidden = false;
            note.textContent = error;

            return;
        }

        if (yes) toast("info", "Staff-Freigabe", late ? "Die privaten Bereiche sind offen." : `${grant.staff.name} darf jetzt bearbeiten. Du siehst live, was passiert.`);

        await refresh();
    };

    note.hidden = true;
    title.id = "sgPromptTitle";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", title.id);
    deny.addEventListener("click", () => void answer(false));
    allow.addEventListener("click", () => void answer(true));

    const privateBox = el(
        "div",
        "sgprivbox",
        el("div", "sglabel sglabel--warn", late ? "Private Bereiche" : "Extra angefragt · private Bereiche"),
        privateChips(),
        ...(late
            ? []
            : [
                  el(
                      "label",
                      "sgswitch",
                      toggle(false, "Auch die privaten Bereiche erlauben", (on) => (allowPrivate = on)),
                      el("span", "sghint", "Auch die privaten Bereiche erlauben. Staff sieht dann Gespräche und Notizen deiner Mitglieder.")
                  ),
              ])
    );

    box.append(
        el("div", "sgprompt__head", ...(late ? [] : [ring]), el("div", "", el("div", "sglabel sglabel--brand", "Anfrage vom RL Nexus Staff"), title)),
        el(
            "div",
            "sgprompt__who",
            face(grant.staff, "sgface sgface--lg"),
            el("div", "", el("b", "", grant.staff.name), " ", el("span", "pill sgpill--staff", grant.staff.role), el("div", "sghint", "Bestätigt: gehört zum Team von RL Nexus"))
        ),
        el("div", "sgwhy", el("small", "", "Grund"), late ? (grant.privateReason ?? "") : grant.reason),
        ...(late
            ? [el("p", "sghint", "Dort stehen Gespräche und Notizen deiner Mitglieder. Gilt nur, solange die Freigabe läuft.")]
            : [
                  el(
                      "ul",
                      "sgmay",
                      el("li", "is-yes", "Alles, was du im Dashboard einstellen kannst"),
                      el("li", "is-no", "Private Bereiche, außer du erlaubst sie unten"),
                      el("li", "is-yes", "Auch Rollen, Kanäle, Moderation, Backups über den Bot"),
                      el("li", "is-no", "Den Bot entfernen, Zugang kaufen oder kündigen")
                  ),
                  el("div", "sgfield", el("span", "sglabel", "Erlauben für"), durationPicker(grant.minutes, (value) => (minutes = value))),
              ]),
        ...(late || asksPrivate ? [privateBox] : []),
        el("p", "sghint", "Du kannst die Freigabe jederzeit beenden. Jede Änderung steht im Protokoll."),
        el("div", "sgactions", deny, allow),
        note
    );

    // Der Ring zählt bis zum Verfall der Anfrage.
    const paintRing = (): void => {
        const left = Math.max(0, grant.expiresAt - Date.now());
        const minutesLeft = Math.floor(left / 60_000);
        const seconds = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");

        ring.style.setProperty("--left", `${Math.round((left / TTL) * 100)}%`);
        ring.firstElementChild!.textContent = `${minutesLeft}:${seconds}`;
    };
    const ticker = late ? 0 : window.setInterval(paintRing, 1000);

    if (!late) paintRing();

    // Die Seite dahinter ist gesperrt, bis geantwortet ist. Esc schließt bewusst nicht.
    const trap = (event: KeyboardEvent): void => {
        if (event.key !== "Tab") return;

        const items = [...box.querySelectorAll<HTMLElement>("button, input, select, textarea")].filter((item) => !item.hasAttribute("disabled") && item.offsetParent !== null);
        const first = items[0];
        const last = items.at(-1);

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };

    document.addEventListener("keydown", trap);
    document.body.append(dim);
    document.body.classList.add("sg-locked");
    allow.focus();

    open = {
        id: grant.id,
        kind,
        close: () => {
            window.clearInterval(ticker);
            document.removeEventListener("keydown", trap);
            document.body.classList.remove("sg-locked");
            dim.remove();
        },
    };
}
