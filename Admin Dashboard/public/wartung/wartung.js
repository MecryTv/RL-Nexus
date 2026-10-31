/*
 * Die Wartungsseite (Plan 23): Restzeit, Ring und Fahrplan aus
 * /wartung/status.json. Ein klassisches Skript, kein Modul: Die Vorschau im
 * Admin Dashboard läuft in einem Sandbox-iframe ohne eigenen Origin, ein Modul
 * bräuchte dort CORS. Alles Sichtbare kommt per textContent ins Dokument.
 *
 * wartungView rechnet nur und kennt kein document: server/checks/wartung-page.check.ts
 * prüft sie ohne Browser.
 */
"use strict";

var WARTUNG_LABELS = { website: "Wartung · Webseite", dashboard: "Wartung · Bot-Dashboard" };
var WARTUNG_FALLBACK = "Gleich wieder da.";
var WARTUNG_FALLBACK_TEXT = "Gerade wird etwas umgebaut. Was los ist, steht im Support-Discord.";

/**
 * Was die Seite zeigt. status: der Inhalt von wartung.json (kann alles sein),
 * now: Millisekunden, area: "website" oder "dashboard", timeZone: nur für die
 * Checks, der Browser nimmt seine eigene.
 */
function wartungView(status, now, area, timeZone) {
    var label = WARTUNG_LABELS[area] || WARTUNG_LABELS.website;
    var since = status && typeof status === "object" && typeof status.since === "string" ? Date.parse(status.since) : NaN;

    if (!status || typeof status !== "object" || typeof status.title !== "string" || !status.title.trim() || isNaN(since)) {
        return { state: "fallback", label: label, title: WARTUNG_FALLBACK, text: "", remaining: null, until: null, since: null, progress: null, steps: [], late: null };
    }

    var clock = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: timeZone });
    var until = typeof status.until === "string" && !isNaN(Date.parse(status.until)) ? Date.parse(status.until) : null;
    var steps = Array.isArray(status.steps) ? status.steps.filter(function (step) { return step && typeof step.name === "string"; }) : [];
    var current = typeof status.current === "number" && status.current >= 0 && status.current < steps.length && Math.floor(status.current) === status.current ? status.current : null;

    var list = steps.map(function (step, index) {
        var state = current === null || index > current ? "next" : index < current ? "done" : "now";
        var started = typeof step.startedAt === "string" && !isNaN(Date.parse(step.startedAt)) ? clock.format(Date.parse(step.startedAt)) : null;
        // Ein Schritt bekommt seine Uhrzeit, wenn er beginnt. Geplant ist nur das Ende.
        var time = state !== "next" ? started : index === steps.length - 1 && until !== null ? clock.format(until) : null;

        return { name: step.name, state: state, time: time };
    });

    var state = until === null ? "open" : now >= until ? "late" : "normal";
    var remaining = null;
    var progress = null;
    var late = null;

    if (state === "normal") {
        var minutes = Math.max(1, Math.ceil((until - now) / 60000));

        remaining = minutes < 60 ? "~" + minutes + " Min." : "~" + Math.floor(minutes / 60) + " Std." + (minutes % 60 ? " " + (minutes % 60) + " Min." : "");
        progress = until > since ? Math.min(1, Math.max(0, (now - since) / (until - since))) : 1;
    }

    if (state === "late") {
        progress = 1;
        late = "geplant war " + clock.format(until) + " Uhr" + (current !== null ? " · wir sind beim " + steps[current].name : "");
    }

    return {
        state: state,
        label: label,
        title: status.title,
        text: typeof status.text === "string" ? status.text : "",
        remaining: remaining,
        until: until === null ? null : clock.format(until),
        since: clock.format(since),
        progress: progress,
        steps: list,
        late: late,
    };
}

if (typeof document !== "undefined") {
    (function () {
        var POLL = 30000;
        var RING = 578;
        var area = /^dashboard\./.test(location.hostname) || /^\/dashboard(\/|$)/.test(location.pathname) ? "dashboard" : "website";
        var preview = location.hash.indexOf("#vorschau=") === 0;
        var status = null;
        var seen = false;

        function byId(id) {
            return document.getElementById(id);
        }

        function show(id, text) {
            var node = byId(id);

            node.textContent = text || "";
            node.hidden = !text;
        }

        function render() {
            var view = wartungView(status, Date.now(), area);
            var ring = byId("ring");

            byId("label").textContent = view.label;
            byId("title").textContent = view.state === "late" ? "Dauert etwas länger als geplant." : view.title;
            show("big", view.state === "normal" ? view.remaining : view.state === "late" ? "Gleich" : "");
            show(
                "sub",
                view.state === "normal"
                    ? "voraussichtlich bis " + view.until + " Uhr" + (view.text ? " · " + view.text : "")
                    : view.state === "late"
                      ? view.late
                      : view.state === "open"
                        ? "Seit " + view.since + " Uhr" + (view.text ? " · " + view.text : "")
                        : WARTUNG_FALLBACK_TEXT
            );
            byId("late").hidden = view.state !== "late";
            // Ohne Status lädt die Seite nicht von selbst neu, also verspricht sie es auch nicht.
            byId("note").hidden = view.state === "fallback";

            ring.setAttribute("data-state", view.state);
            byId("arc").style.strokeDashoffset = String(view.progress === null ? RING * 0.8 : RING * (1 - view.progress));

            var steps = byId("steps");

            steps.replaceChildren();
            steps.hidden = view.steps.length === 0;
            steps.style.setProperty("--n", String(Math.max(1, view.steps.length)));

            var done = view.steps.filter(function (step) { return step.state !== "next"; }).length;

            steps.style.setProperty("--run", String(view.steps.length > 1 ? Math.max(0, done - 1) / (view.steps.length - 1) : 0));

            view.steps.forEach(function (step) {
                var item = document.createElement("li");
                var name = document.createElement("span");
                var time = document.createElement("time");

                item.className = step.state;
                name.textContent = step.name;
                time.textContent = step.time || "";
                item.append(document.createElement("i"), name, time);
                steps.append(item);
            });
        }

        // Rechtstexte: auf der Webseite die eigenen Seiten, im Bot-Dashboard die der Webseite.
        if (area === "website") {
            Array.prototype.forEach.call(document.querySelectorAll("[data-legal]"), function (link) {
                link.setAttribute("href", link.getAttribute("data-legal"));
            });
        }

        if (preview) {
            var read = function () {
                try {
                    status = JSON.parse(decodeURIComponent(location.hash.slice("#vorschau=".length)));
                    area = Array.isArray(status.areas) && status.areas[0] === "dashboard" ? "dashboard" : "website";
                } catch {
                    status = null;
                }

                render();
            };

            window.addEventListener("hashchange", read);
            read();
            return;
        }

        function poll() {
            // Unabhängig vom Plan: Kommt die eigene Adresse nicht mehr mit 503, ist die Wartung vorbei.
            // Fängt Schalter, die von Hand gelöscht wurden, und eine wartung.json, die liegen blieb.
            fetch(location.pathname + location.search, { method: "HEAD", cache: "no-store", headers: { Accept: "text/html" } })
                .then(function (response) {
                    if (response.ok) location.reload();
                })
                .catch(function () {});

            fetch("/wartung/status.json", { cache: "no-store" })
                .then(function (response) {
                    if (response.status === 404) return null;
                    if (!response.ok) throw new Error(String(response.status));

                    return response.json();
                })
                .then(function (next) {
                    var mine = next && Array.isArray(next.areas) && next.areas.indexOf(area) >= 0;

                    // Neu laden nur, wenn die Wartung für diesen Bereich schon einmal da war:
                    // Ein Schalter ohne wartung.json soll nicht alle 30 Sekunden neu laden.
                    if (!mine && seen) {
                        location.reload();
                        return;
                    }

                    if (mine) {
                        seen = true;
                        status = next;
                    }

                    render();
                })
                .catch(function () {
                    // Keine Antwort: stehen lassen, beim nächsten Mal wieder fragen.
                    render();
                });
        }

        poll();
        window.setInterval(poll, POLL);
    })();
}
