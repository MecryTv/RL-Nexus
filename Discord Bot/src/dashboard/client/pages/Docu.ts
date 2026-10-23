/** Das Inhaltsverzeichnis der Dokumentation. */

import { maybe } from "../core/Dom.js";

interface IEntry {
    id: string;
    link: HTMLAnchorElement;
    head: HTMLElement;
    group: HTMLElement | null;
}

/** Klappt eine Gruppe auf oder zu - Knopf, Liste und Pfeil in einem Zug. */
function setOpen(group: HTMLElement, open: boolean): void {
    group.classList.toggle("is-open", open);
    group.querySelector(".docgroup__head")?.setAttribute("aria-expanded", String(open));

    const list = group.querySelector<HTMLElement>(".docgroup__list");

    if (list) list.hidden = !open;
}

/**
 * Das Inhaltsverzeichnis der Doku: Gruppen zum Aufklappen, offen ist die, in
 * der man gerade liest. Dreißig Einträge auf einmal waren zu viel - so sieht
 * man sechs Gruppen und darunter nur, was gerade zählt.
 *
 * Gerechnet wird über die Scrollposition, nicht über einen
 * IntersectionObserver. Der beobachtet Überschriften, und eine Überschrift ist
 * ein paar Zeilen hoch: zwischen zwei Abschnitten ist keine im Bild, und die
 * Marke fällt weg. Gesucht ist aber die letzte Überschrift oberhalb der
 * Lesekante - die gibt es immer.
 */
export function bindDocNav(): void {
    const nav = maybe<HTMLElement>("#docNav");

    if (!nav) return;

    const entries: IEntry[] = [];
    const groups = [...nav.querySelectorAll<HTMLElement>(".docgroup")];
    // Schmal steht die Leiste über dem Text, nicht daneben: dort klappt nichts von selbst auf.
    const narrow = window.matchMedia("(max-width: 860px)");
    let searching = false;
    let active: HTMLElement | null = null;

    for (const link of nav.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = link.getAttribute("href") ?? "";

        if (!href.startsWith("#")) continue;

        const head = document.getElementById(href.slice(1));

        if (head) entries.push({ id: href.slice(1), link, head, group: link.closest<HTMLElement>(".docgroup") });
    }

    if (entries.length === 0) return;

    for (const group of groups) {
        group.querySelector(".docgroup__head")?.addEventListener("click", () => setOpen(group, !group.classList.contains("is-open")));
    }

    function paint(): void {
        // Die Lesekante: knapp unter der Kopfzeile. Was darüber steht, ist
        // durch; der letzte durchgelaufene Abschnitt ist der, in dem man liest.
        const edge = 120;
        let current = entries[0] as IEntry;

        for (const entry of entries) {
            if (entry.head.getBoundingClientRect().top <= edge) current = entry;
        }

        // Ganz unten gewinnt der letzte Abschnitt, auch wenn seine Überschrift
        // noch nicht über die Kante gewandert ist - weiter geht es nicht.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
            current = entries[entries.length - 1] as IEntry;
        }

        for (const entry of entries) {
            if (entry === current) entry.link.setAttribute("aria-current", "true");
            else entry.link.removeAttribute("aria-current");
        }

        // Kommt man beim Lesen in eine neue Gruppe, geht sie auf und die anderen zu.
        // Was jemand von Hand aufgeklappt hat, bleibt, bis die Gruppe wechselt.
        if (searching || narrow.matches || !current.group || current.group === active) return;

        active = current.group;

        for (const group of groups) setOpen(group, group === active);
    }

    // Direkt am Scroll-Ereignis, ohne requestAnimationFrame dazwischen: ein paar
    // Dutzend getBoundingClientRect auf einer statischen Seite kosten nichts, und
    // rAF läuft in einem Tab im Hintergrund gar nicht erst - dann bliebe die
    // Marke beim Zurückwechseln auf dem falschen Abschnitt stehen.
    window.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint, { passive: true });

    paint();
    bindDocSearch(entries, groups, (on) => {
        searching = on;

        // Suche vorbei: wieder nur die Gruppe offen, in der man liest.
        if (!on) {
            active = null;

            for (const group of groups) setOpen(group, false);

            paint();
        }
    });
}

/**
 * Das Suchfeld über der Leiste. Gesucht wird im Namen des Eintrags und im Text
 * seines Abschnitts - wer "Ping" tippt, findet so auch die Module, die pingen.
 * Gruppen mit Treffern klappen auf, Gruppen ohne verschwinden.
 */
function bindDocSearch(entries: IEntry[], groups: HTMLElement[], onSearch: (searching: boolean) => void): void {
    const search = maybe<HTMLInputElement>("#docSearch");
    const empty = maybe<HTMLElement>("#docEmpty");

    if (!search) return;

    // Der Text eines Abschnitts: alles bis zur nächsten Überschrift derselben Ebene oder höher.
    const texts = new Map<string, string>();

    for (const entry of entries) {
        const level = Number(entry.head.tagName.slice(1)) || 2;
        let text = entry.head.textContent ?? "";
        let node = entry.head.nextElementSibling;

        while (node && !(/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level)) {
            text += ` ${node.textContent ?? ""}`;
            node = node.nextElementSibling;
        }

        texts.set(entry.id, `${entry.link.textContent ?? ""} ${text}`.toLowerCase());
    }

    search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        let shown = 0;

        for (const entry of entries) {
            const hit = !query || (texts.get(entry.id) ?? "").includes(query);

            entry.link.hidden = !hit;
            if (hit) shown++;
        }

        for (const group of groups) {
            const any = [...group.querySelectorAll<HTMLAnchorElement>(".docgroup__list a")].some((link) => !link.hidden);

            group.hidden = !any;
            if (query) setOpen(group, any);
        }

        if (empty) empty.hidden = shown > 0;

        onSearch(Boolean(query));
    });

    // Enter springt zum ersten Treffer.
    search.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        const first = entries.find((entry) => !entry.link.hidden);

        if (!first) return;

        event.preventDefault();
        first.head.scrollIntoView({ block: "start" });
        history.replaceState(null, "", `#${first.id}`);
    });
}
