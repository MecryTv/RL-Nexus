// Die Ersatzseite: liest am Namen in der Adresszeile ab, welcher Fall es ist.
// Eigene Datei statt <script> in der Seite: Admin Dashboard und Bot-Dashboard
// erlauben per Content-Security-Policy nur Skripte von der eigenen Adresse.
(() => {
    // Die Nexus-Seiten hinter nginx. Antwortet eine nicht, ist es eine Auszeit, sonst eine unbekannte Adresse.
    const SITES = {
        "nexus-emb.de": "Die Hauptseite",
        "www.nexus-emb.de": "Die Hauptseite",
        "dashboard.nexus-emb.de": "Das Dashboard",
        "admin.nexus-emb.de": "Das Admin Dashboard",
        "status.nexus-emb.de": "Die Statusseite",
    };
    const WAIT_S = 30;

    const host = (new URLSearchParams(location.search).get("vorschau") || location.hostname).toLowerCase();
    const site = SITES[host];
    const $ = (id) => document.getElementById(id);

    $("chip").textContent = site ? `${host} antwortet nicht` : "Keine Seite unter dieser Adresse";
    $("num").textContent = site ? "502" : "404";

    const code = document.createElement("code");
    code.textContent = host;
    const lead = $("lead");

    if (!site) {
        document.title = "Keine Seite · RL Nexus";
        $("title").textContent = "Falsch abgebogen.";
        lead.replaceChildren("Unter ", code, " gibt es keine Seite von RL Nexus. Vielleicht steckt ein Tippfehler in der Adresse, oder der Link ist veraltet.");
        return;
    }

    document.title = "Kurze Auszeit · RL Nexus";
    lead.textContent = `${site} startet vermutlich gerade neu. Meist ist alles nach ein, zwei Minuten wieder da, diese Seite lädt dann von selbst neu.`;

    const primary = $("primary");
    primary.textContent = "Jetzt neu laden";
    primary.href = location.href;
    primary.addEventListener("click", (event) => {
        event.preventDefault();
        location.reload();
    });

    // Ist die Statusseite selbst weg, hilft der Knopf dorthin nicht.
    if (host === "status.nexus-emb.de") {
        $("secondary").textContent = "Zur Hauptseite";
        $("secondary").href = "https://nexus-emb.de/";
    }

    $("retry").hidden = false;
    const bar = $("bar");
    bar.style.setProperty("--wait", `${WAIT_S}s`);
    bar.classList.add("run");

    let left = WAIT_S;
    const tick = () => {
        $("countdown").textContent = `Nächster Versuch in ${left} s`;
        if (left-- <= 0) location.reload();
        else setTimeout(tick, 1000);
    };
    tick();
})();
