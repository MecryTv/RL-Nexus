/**
 * Frontend des RL Nexus-Dashboards. Wird nach public/assets/ gebaut:
 *   npm run build:dashboard      (einmalig)
 *   npm run dev:dashboard        (beobachtet Änderungen)
 *
 * Alle Daten kommen aus GET /api/me. Servernamen landen ausschließlich
 * über textContent im Dokument - nirgends wird HTML zusammengesetzt.
 *
 * Diese Datei ist nur noch der Einstieg: sie entscheidet anhand von
 * `<body data-page="...">`, welche Seite gezeichnet wird, und lädt genau deren
 * Code nach (import()). Der Bündler (src/scripts/BuildDashboard.ts) macht
 * daraus je Seite ein eigenes Stück - wer die Serverliste öffnet, lädt den
 * Code der Serverseite nicht mit. Alles andere liegt daneben:
 *
 *   interfaces/   Was der Bot schickt - eine Datei je Bereich
 *   constants/    Gruppen, Ränge, Module: Tabellen ohne Logik
 *   core/         Werkzeug für alle Seiten: DOM, Formate, Töne, Toasts, Abruf
 *   services/     Was mit dem Bot spricht: das Postfach
 *   layout/       Was auf jeder Seite steht: Kopfzeile, Menü, Fußzeile
 *   pages/        Eine Datei je Seite
 */
import { maybe, need } from "./core/Dom.js";
import { load, redirecting } from "./core/Api.js";
import { applyMotion } from "./core/Prefs.js";
import { NOTES_POLL, pullNotes } from "./services/Notes.js";
import { bindFooter } from "./layout/Footer.js";
import { renderProfile } from "./layout/Profile.js";
import { buildUserUI } from "./layout/UserMenu.js";
import { showFailure } from "./layout/Failure.js";
import { showMaintenance, watchScroll } from "./layout/Topbar.js";

/**
 * Die Daten kamen nicht. Der Grund steht in der Konsole, hier steht, was der
 * Nutzer tun kann.
 *
 * Auf der Serverliste bleibt die Seite stehen und sagt es im leeren Bereich -
 * dort gibt es einen. Überall sonst (Serverseite, Einstellungen) stünde
 * sonst ein Skelett, das nie fertig wird; dort tritt die Ansage an die Stelle
 * des Inhalts.
 */
function failed(page: string): void {
    const empty = maybe<HTMLElement>("#empty");
    const grid = maybe<HTMLElement>("#grid");

    if (grid) grid.replaceChildren();

    // Die Serverliste hat einen eigenen leeren Bereich und sagt es dort. Jede
    // andere Seite hat zwar auch einen - der gehoert dort aber zum Inhalt und
    // traegt die falsche Ansage ("Serverliste nicht erreichbar").
    if (page !== "servers" || !empty) {
        showFailure({
            code: "Keine Verbindung",
            title: "Der Inhalt lässt sich gerade nicht laden",
            text: "Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",
            hint: "Lade die Seite in einem Moment neu – bleibt es dabei, läuft der Bot vermutlich nicht.",
        });

        return;
    }

    empty.classList.add("is-on", "empty--error");

    const symbol = maybe<SVGUseElement>("#emptyIcon use");
    if (symbol) symbol.setAttribute("href", "#i-warn");

    need<HTMLElement>("#emptyTitle").textContent = "Serverliste nicht erreichbar";
    need<HTMLElement>("#emptyText").textContent =
        "Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";

    const reset = maybe<HTMLButtonElement>("#emptyReset");
    if (reset) {
        reset.textContent = "Neu laden";
        reset.addEventListener("click", () => window.location.reload());
    }

    const line = maybe<HTMLElement>("#resultline");
    if (line) line.textContent = "Laden fehlgeschlagen";
}

async function boot(): Promise<void> {
    const page = document.body.dataset.page;

    watchScroll();
    applyMotion();
    bindFooter();

    // Datenschutz, Doku und die WTSI-Erklaerung stehen ohne Anmeldung offen: eine
    // Datenschutzerklaerung hinter einem Login waere keine. Sie brauchen vom
    // Skript nur Fusszeile, Cookie-Hinweis und das Inhaltsverzeichnis.
    if (page === "static") {
        (await import("./pages/Docu.js")).bindDocNav();
        return;
    }

    // Die öffentliche Rangliste steht ohne Anmeldung offen - sie fragt /api/me
    // gar nicht erst, sondern holt nur ihre eine Liste.
    if (page === "board") {
        await (await import("./pages/Board.js")).renderBoard();
        return;
    }

    // Dasselbe für die Rangliste von 2, 4 & 6 Mans.
    if (page === "mansboard") {
        await (await import("./pages/MansBoard.js")).renderMansBoard();
        return;
    }

    // Und für Clips der Woche: Clips und Gewinner ohne Anmeldung.
    if (page === "clipsboard") {
        await (await import("./pages/ClipsBoard.js")).renderClipsBoard();
        return;
    }

    // Dasselbe fuer die Bewerbungsseite: lesen darf sie jeder, abschicken nur,
    // wer angemeldet ist - das entscheidet die Route, nicht diese Seite.
    if (page === "apply") {
        await (await import("./pages/Apply.js")).renderApplyPage();
        return;
    }

    // Und fuer die Matchup-Seite: eintragen darf, wer im Kader als Captain,
    // Manager oder Coach steht. Auch das entscheidet die Route.
    if (page === "matchups") {
        await (await import("./pages/Matchups.js")).renderMatchupsPage();
        return;
    }

    // Der Code der Seite lädt neben /api/me, nicht danach. Was er vorab tun kann,
    // hängt in derselben Kette - so läuft es sicher vor dem Zeichnen, nie doppelt.
    const code =
        page === "guild"
            ? import("./pages/Guild.js").then((module) => {
                  // Die Serverseite weiss aus ihrer Adresse schon, welcher Server gemeint
                  // ist: ihre beiden Abfragen laufen deshalb neben /api/me statt danach.
                  module.prefetchGuild();

                  return module;
              })
            : page === "settings"
              ? import("./pages/Settings.js")
              : import("./pages/Servers.js").then((module) => {
                    if (page === "servers") module.skeletons(6);

                    return module;
                });

    const data = await load();

    // Beim 401 läuft schon die Umleitung zum Login - dann keine Fehlermeldung zeigen.
    if (!data) {
        if (!redirecting()) failed(page ?? "");
        return;
    }

    renderProfile(data.user);
    buildUserUI(data.user);
    showMaintenance(data.maintenance, data.user.group);

    // Das Postfach liegt beim Bot: einmal holen und danach im Hintergrund
    // nachsehen, damit man neue Meldungen auch ohne Neuladen mitbekommt.
    void pullNotes();
    window.setInterval(() => void pullNotes(), NOTES_POLL);

    const module = await code;

    if ("renderGuild" in module) module.renderGuild(data);
    else if ("renderSettings" in module) module.renderSettings(data.user);
    else module.renderServers(data);
}

void boot();
