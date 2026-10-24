/**
 * Fehler melden: ein Pop-up, das jede Seite über die Fußzeile öffnet.
 *
 * Die Meldung geht an den Bot und von dort als Mail an support@nexus-emb.de
 * (routes/DashboardApiReport.ts). Hat der Bot kein Postfach eingerichtet,
 * antwortet er mit 503 - dann bietet das Pop-up dieselbe Mail im eigenen
 * Mailprogramm an. Wer lieber in Discord schreibt, findet daneben den
 * Support-Server und /fehler.
 */

import { recentErrorIds } from "../core/ErrorReport.js";
import { browserOf } from "../core/Trail.js";
import { maybe } from "../core/Dom.js";
import { url } from "../core/Base.js";
import { toast } from "../core/Toast.js";

export const REPORT_MAIL = "support@nexus-emb.de";
export const SUPPORT_DISCORD = "https://discord.gg/CjG2HFGw95";

// Ein eigenes X statt <use href="#i-x">: nicht jede Seite hat dieses Symbol im Sprite.
const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

export const REPORT_HTML = `
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schließen">${CLOSE_ICON}</button>
  </div>
  <form class="modal__body report__form" id="reportForm" novalidate>
    <label class="mcfield">
      <span class="mcfield__label">Worum geht es?</span>
      <input class="text" name="subject" maxlength="120" autocomplete="off" placeholder="z. B. Ticket-Panel lässt sich nicht senden">
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Was ist passiert?</span>
      <textarea class="text tkarea" name="message" rows="5" maxlength="4000" placeholder="Was hast du erwartet, und was kam stattdessen?"></textarea>
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Wo und wie? <i>freiwillig</i></span>
      <textarea class="text tkarea" name="context" rows="3" maxlength="1000" placeholder="Modul, Server, was du davor geklickt hast"></textarea>
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Kontakt</span>
      <input class="text" name="contact" maxlength="120" autocomplete="email" placeholder="E-Mail oder Discord-Name">
      <span class="mcfield__hint">Wenn du angemeldet bist, reicht deine Discord-ID. Sonst brauchen wir das für die Antwort.</span>
    </label>
    <input class="report__trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="report__state" id="reportState" role="status" aria-live="polite"></p>
    <div class="report__actions">
      <a class="btn btn--quiet" href="${SUPPORT_DISCORD}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.</p>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`;

/** Dieselbe Mail fürs eigene Mailprogramm. mailto hat eine Längengrenze, deshalb gekürzt. */
function mailto(fields: Record<string, string>): string {
    const body = [
        fields.message,
        fields.context ? `\nWo und wie:\n${fields.context}` : "",
        fields.contact ? `\nKontakt: ${fields.contact}` : "",
        `\nSeite: ${location.pathname}`,
    ].join("\n");
    const short = body.length > 1400 ? `${body.slice(0, 1400)}\n\n[gekürzt]` : body;

    return `mailto:${REPORT_MAIL}?subject=${encodeURIComponent(`[RL Nexus · Fehler] ${fields.subject}`)}&body=${encodeURIComponent(short)}`;
}

export function bindReport(): void {
    document.body.insertAdjacentHTML("beforeend", REPORT_HTML);

    const dialog = maybe<HTMLDialogElement>("#reportModal");
    const form = maybe<HTMLFormElement>("#reportForm");
    const state = maybe<HTMLElement>("#reportState");
    const send = maybe<HTMLButtonElement>("#reportSend");

    if (!dialog || !form || !state || !send) return;

    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;

    const say = (text: string, tone: "" | "is-warn" | "is-ok" = "", link?: { href: string; label: string }): void => {
        state.className = `report__state ${tone}`.trim();
        state.textContent = text;

        if (link) {
            const anchor = document.createElement("a");

            anchor.href = link.href;
            anchor.textContent = link.label;
            state.append(" ", anchor);
        }
    };

    const open = (): void => {
        say("");

        for (const name of ["subject", "message"]) field(name).removeAttribute("aria-invalid");

        dialog.showModal();
        field("subject").focus();
    };

    // Aufraeumen gehoert in die Funktion selbst: im Browser-Fenster der App
    // feuert ein <dialog> sein close-Ereignis nicht verlaesslich.
    const close = (): void => dialog.close();

    maybe<HTMLButtonElement>("#reportClose")?.addEventListener("click", close);

    // Jeder Knopf mit data-report oeffnet das Pop-up - die Fusszeile, die Doku, die Fehlerseiten.
    document.addEventListener("click", (event) => {
        const trigger = (event.target as HTMLElement).closest("[data-report]");

        if (!trigger) return;

        event.preventDefault();
        open();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const fields = Object.fromEntries(
            ["subject", "message", "context", "contact", "website"].map((name) => [name, field(name).value.trim()])
        ) as Record<string, string>;

        // Dieselben Grenzen wie im Bot - hier nur, damit die Antwort nicht erst vom Server kommt.
        const missing = fields.subject.length < 4 ? "subject" : fields.message.length < 20 ? "message" : null;

        if (missing) {
            field(missing).setAttribute("aria-invalid", "true");
            field(missing).focus();
            say(missing === "subject" ? "Ein Betreff mit ein paar Wörtern hilft beim Einordnen." : "Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.", "is-warn");

            return;
        }

        for (const name of ["subject", "message"]) field(name).removeAttribute("aria-invalid");

        send.disabled = true;
        say("Wird gesendet …");

        const guildId = /\/guild\/(\d{17,20})/.exec(location.pathname)?.[1] ?? null;
        let response: Response | null = null;

        try {
            response = await fetch(url("/api/report"), {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                // Automatisch dabei, wie im Formular gesagt: Browser und die letzten Fehler-IDs (Plan 24).
                body: JSON.stringify({ ...fields, guildId, page: location.pathname, browser: browserOf(navigator.userAgent), errorIds: recentErrorIds() }),
            });
        } catch {
            response = null;
        } finally {
            send.disabled = false;
        }

        if (response?.ok) {
            form.reset();
            close();
            toast("info", "Danke für die Meldung", "Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");

            return;
        }

        // Kein Postfach beim Bot oder keine Verbindung: dieselbe Mail ueber das eigene Mailprogramm.
        if (!response || response.status === 503 || response.status === 502) {
            say("Der Bot kann die Meldung gerade nicht selbst verschicken.", "is-warn", { href: mailto(fields), label: "Im Mailprogramm öffnen" });

            return;
        }

        const body = (await response.json().catch(() => ({}))) as { error?: string };

        say(body.error ?? "Das hat nicht geklappt. Versuch es gleich noch einmal.", "is-warn");
    });
}
