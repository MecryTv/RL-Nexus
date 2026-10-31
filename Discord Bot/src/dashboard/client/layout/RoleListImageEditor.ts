/**
 * Der Reiter „Bild“ der Rollen-Listen (Plan 29): Vorlagen und alle Regler des
 * gezeichneten Bildes. Seit Plan 41 im Studio (layout/SettingsStudio.ts): die
 * Bereiche links, das Bild des Bots in der Mitte, die Regler rechts. Hier wird
 * nur der Entwurf geändert - gespeichert wird in pages/GuildRoleLists.ts.
 */

import { BASE } from "../core/Base.js";
import { icon } from "../core/Dom.js";
import { button, el, row, select, toggle } from "../core/Ui.js";
import { IMAGE_RANGES, IRoleListImage, MAX_HEADING, MAX_PRESETS, MAX_SUB, RoleListMotif } from "../../../constants/RoleLists.js";
import { ISettingsStudio, settingsStudio } from "./SettingsStudio.js";

export interface IImagePreset {
    id: string;
    name: string;
    image: IRoleListImage;
}

export interface IImageEditorOptions {
    image: IRoleListImage;
    heading: string;
    imagePresets: Record<string, { label: string; image: IRoleListImage }>;
    presets: IImagePreset[];
    motifs: Record<string, string>;
    /** Galerie-ID → Adresse, für das Vorschaubild des Hintergrunds. */
    gallery: (id: string) => string | null;
    onHeading: (value: string) => void;
    onChange: (image: IRoleListImage) => void;
    onPickBackground: () => Promise<string | null>;
    onSavePreset: (name: string, image: IRoleListImage) => Promise<IImagePreset[] | null>;
    onRemovePreset: (id: string) => Promise<IImagePreset[] | null>;
    /** Plan 41: das Bild des Bots für die Mitte des Studios. */
    stage: HTMLElement;
    /** Plan 41: der Speichern-Knopf der Seite - das Studio spiegelt ihn. */
    pageSave?: () => HTMLButtonElement | null;
}

/** Wie die Motive ungefähr aussehen - gezeichnet werden sie im Bot (builder/RoleListCard.ts). */
const MOTIF_SWATCH: Record<RoleListMotif, string> = {
    arena: "radial-gradient(circle at 70% 15%, #6a1422 0%, #1c0c12 45%, #0b1118 80%)",
    nexus: `center / cover url("${BASE}/assets/images/RL%20Nexus%20Banner.png")`,
    spotlight: "radial-gradient(circle at 50% -10%, #5a1220 0%, #170a10 38%, #070a0f 70%)",
    carbon: "repeating-linear-gradient(45deg, #0f141b 0 7px, #141b24 7px 14px)",
    grid: "linear-gradient(rgba(0,229,255,.14) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, rgba(0,229,255,.14) 1px, transparent 1px) 0 0 / 14px 14px, radial-gradient(circle at 50% 115%, #08405a 0%, #05060f 70%)",
    aurora: "radial-gradient(ellipse at 15% 0%, #4a1f73 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, #0d5c57 0%, transparent 55%), #070a10",
};

const UNITS: Partial<Record<keyof IRoleListImage, string>> = { zoom: " %", dim: " %", blur: " px", tileAlpha: " %", tint: " %", bw: " px", radius: " px", glow: " %", angle: "°", fx: " %", fy: " %" };
const FONTS: [string, string][] = [["Orbitron", "Orbitron"], ["Oxanium", "Oxanium"], ["Rajdhani", "Rajdhani"]];
const SIZES: [string, string][] = [["s", "Klein"], ["m", "Mittel"], ["l", "Groß"]];

/** Welcher Bereich offen ist, bleibt beim Neuzeichnen und beim Wechsel der Liste. */
let openPanel = "preset";

function swatch(image: IRoleListImage, gallery: (id: string) => string | null): string {
    if (image.bg === "solid") return image.c1;
    if (image.bg === "gradient") return `linear-gradient(${image.angle}deg, ${image.c1}, ${image.c2})`;

    const url = image.bg === "image" && image.image ? gallery(image.image) : null;

    return url ? `center / cover url("${url.replace(/["\\]/g, "")}")` : MOTIF_SWATCH[image.motif];
}

export function renderImageEditor(host: HTMLElement, options: IImageEditorOptions): void {
    let im = options.image;
    let presets = options.presets;
    // Gesetzt, bevor jemand etwas ändern kann - das Studio entsteht am Ende dieser Funktion.
    let s!: ISettingsStudio;
    const paint = (): void => s.repaint();

    /** Ändert einen Wert. Auswahlen und Schalter zeichnen neu, weil sie Zeilen ein- und ausblenden. */
    function set<K extends keyof IRoleListImage>(key: K, value: IRoleListImage[K], repaint = false): void {
        s.remember(String(key));
        im[key] = value;
        options.onChange(im);

        if (repaint) paint();
    }

    function use(image: IRoleListImage): void {
        s.remember();
        im = structuredClone(image);
        options.onChange(im);
        paint();
    }

    // „layout=grid|pyramid“: die Zeile steht nur bei diesen Werten da.
    function when(condition: string, ...rows: HTMLElement[]): HTMLElement[] {
        const [key, values] = condition.split("=") as [keyof IRoleListImage, string];

        return values.split("|").includes(String(im[key])) ? rows : [];
    }

    const sel = (key: keyof IRoleListImage, entries: [string, string][], label: string): HTMLSelectElement =>
        select(entries, String(im[key]), (value) => set(key, (key === "cols" ? Number(value) : value) as never, true), label);

    function color(key: keyof IRoleListImage, label: string): HTMLElement {
        const field = el("input");

        field.type = "color";
        field.value = String(im[key]);
        field.setAttribute("aria-label", label);
        field.addEventListener("input", () => set(key, field.value as never));

        return el("span", "rlcolor", field);
    }

    function range(key: keyof typeof IMAGE_RANGES, label: string): HTMLElement {
        const field = el("input");
        const shown = el("span", "", `${im[key]}${UNITS[key] ?? ""}`);

        field.type = "range";
        field.min = String(IMAGE_RANGES[key][0]);
        field.max = String(IMAGE_RANGES[key][1]);
        field.value = String(im[key]);
        field.setAttribute("aria-label", label);
        field.addEventListener("input", () => {
            set(key, Number(field.value));
            shown.textContent = `${field.value}${UNITS[key] ?? ""}`;
        });

        return el("span", "rlrange", field, shown);
    }

    const sw = (key: keyof IRoleListImage, label: string): HTMLElement =>
        el("label", "snitem__switch", toggle(Boolean(im[key]), label, (on) => set(key, on as never, true)), el("span", "", "an"));

    function text(value: string, max: number, label: string, onInput: (value: string) => void): HTMLInputElement {
        const field = el("input", "text");

        field.type = "text";
        field.maxLength = max;
        field.value = value;
        field.setAttribute("aria-label", label);
        field.addEventListener("input", () => onInput(field.value));

        return field;
    }

    function presetRows(): HTMLElement[] {
        const tile = (key: string, label: string, image: IRoleListImage, own: boolean): HTMLButtonElement => {
            const sample = el("span", "preset__sw");
            const knob = button(`preset${own ? " pcustom" : ""}${im.preset === key ? " is-on" : ""}`, sample, label);

            sample.style.background = swatch(image, options.gallery);
            sample.style.setProperty("--a", image.accent === "own" ? image.accentColor : "#ff1e2d");
            knob.setAttribute("aria-pressed", String(im.preset === key));
            knob.addEventListener("click", () => use(image));

            return knob;
        };
        const name = text("", 40, "Name der eigenen Vorlage", () => undefined);
        const save = button("btn btn--quiet", icon("#i-plus"), "Als eigene Vorlage speichern");
        const reset = button("btn btn--quiet", "Auf die Vorlage zurück");
        const active = presets.find((preset) => preset.id === im.preset);
        const actions: HTMLElement[] = [name, save, reset];

        name.placeholder = `Eigene ${presets.length + 1}`;
        save.disabled = presets.length >= MAX_PRESETS;
        save.title = save.disabled ? `Höchstens ${MAX_PRESETS} eigene Vorlagen` : "";
        save.addEventListener("click", async () => {
            save.disabled = true;

            const saved = await options.onSavePreset(name.value.trim() || name.placeholder, im);

            if (!saved) {
                save.disabled = false;

                return;
            }

            presets = saved;
            set("preset", saved[saved.length - 1]!.id, true);
        });
        reset.addEventListener("click", () => use(options.imagePresets[im.preset]?.image ?? active?.image ?? options.imagePresets.esports!.image));

        if (active) {
            const remove = button("btn btn--quiet", icon("#i-trash"), `„${active.name}“ löschen`);

            remove.addEventListener("click", async () => {
                remove.disabled = true;

                const left = await options.onRemovePreset(active.id);

                if (left) presets = left;

                paint();
            });
            actions.push(remove);
        }

        return [
            el("p", "tkcard__lead", "Setzt alle Bereiche auf einen Schlag. Danach lässt sich jede Einstellung einzeln ändern – und als eigene Vorlage für andere Listen speichern."),
            el(
                "div",
                "presets",
                ...Object.entries(options.imagePresets).map(([key, preset]) => tile(key, preset.label, preset.image, false)),
                ...presets.map((preset) => tile(preset.id, preset.name, preset.image, true))
            ),
            el("div", "rlpresetbar", ...actions),
        ];
    }

    function backgroundRows(): HTMLElement[] {
        if (im.bg === "motif") {
            return [
                el(
                    "div",
                    "motifs",
                    ...Object.entries(options.motifs).map(([key, label]) => {
                        const sample = el("span", "motif__img");
                        const knob = button(`motif${im.motif === key ? " is-on" : ""}`, sample, label);

                        sample.style.background = MOTIF_SWATCH[key as RoleListMotif];
                        knob.setAttribute("aria-pressed", String(im.motif === key));
                        knob.addEventListener("click", () => set("motif", key as RoleListMotif, true));

                        return knob;
                    })
                ),
            ];
        }

        if (im.bg !== "image") return [];

        const url = im.image ? options.gallery(im.image) : null;
        const focus = el("div", "focus");
        const dot = el("span", "focus__dot");
        const pick = button("btn btn--primary", icon("#i-image"), im.image ? "Anderes Bild wählen" : "Bild wählen");
        const side = el("div", "bgpick__side", el("span", "bgpick__name", url ? decodeURIComponent(url.split("/").pop() ?? "") : im.image ? "Bild aus der Galerie" : "Kein Bild"), pick);

        focus.setAttribute("aria-hidden", "true");
        focus.title = "Klick ins Bild: dieser Punkt bleibt sichtbar";

        if (url) {
            focus.style.backgroundImage = `url("${url.replace(/["\\]/g, "")}")`;
            dot.style.left = `${im.fx}%`;
            dot.style.top = `${im.fy}%`;
            focus.append(dot);
            focus.addEventListener("click", (event) => {
                const box = focus.getBoundingClientRect();

                s.remember();
                im.fx = Math.round(((event.clientX - box.left) / box.width) * 100);
                im.fy = Math.round(((event.clientY - box.top) / box.height) * 100);
                options.onChange(im);
                paint();
            });
        } else {
            focus.append(el("span", "focus__empty", im.image ? "Das Bild ist nicht mehr in der Galerie" : "Noch kein Bild gewählt"));
        }

        pick.addEventListener("click", async () => {
            const id = await options.onPickBackground();

            if (!id) return;

            s.remember();
            im.image = id;
            im.fx = 50;
            im.fy = 50;
            options.onChange(im);
            paint();
        });

        if (im.image) {
            const drop = button("btn btn--quiet", icon("#i-trash"), "Bild entfernen");

            drop.addEventListener("click", () => set("image", null, true));
            side.append(drop);
        }

        side.append(el("p", "bgpick__hint", "Aus der Galerie des Servers oder frisch hochgeladen. Am besten breit, ab 1200 Pixel. Ein Klick ins Bild legt fest, welcher Teil sichtbar bleibt."));

        return [
            el("div", "bgpick", focus, side),
            ...(url ? [row("Ausschnitt waagerecht", "", range("fx", "Ausschnitt waagerecht")), row("Ausschnitt senkrecht", "", range("fy", "Ausschnitt senkrecht"))] : []),
        ];
    }

    s = settingsStudio(host, {
        title: "Bild",
        open: openPanel,
        onOpen: (id) => (openPanel = id),
        stage: options.stage,
        pageSave: options.pageSave,
        take: () => structuredClone({ image: im, heading: options.heading }),
        put: (state) => {
            im = structuredClone(state.image);
            options.heading = state.heading;
            options.onChange(im);
            options.onHeading(state.heading);
        },
        panels: [
            { id: "preset", label: "Vorlage", icon: "#i-layout", rows: presetRows },
            {
                id: "layout",
                label: "Aufbau",
                icon: "#i-grid",
                rows: () => [
                    row("Anordnung", "", sel("layout", [["grid", "Kacheln"], ["list", "Zeilen"], ["columns", "Rollen nebeneinander"], ["pyramid", "Hierarchie (mittig, oben groß)"]], "Anordnung")),
                    ...when("layout=grid|pyramid", row("Je Reihe", "", sel("cols", ["3", "4", "5", "6", "7", "8"].map((n): [string, string] => [n, n]), "Je Reihe"))),
                    ...when("layout=grid|list", row("Ausrichtung", "", sel("align", [["left", "Links"], ["center", "Mittig"]], "Ausrichtung"))),
                    row("Abstände", "", sel("gap", [["tight", "Eng"], ["normal", "Normal"], ["wide", "Weit"]], "Abstände")),
                    ...when("layout=grid|pyramid", row("Erste Rolle hervorheben", "Größere Kacheln für die oberste Rolle", sw("featured", "Erste Rolle hervorheben"))),
                ],
            },
            {
                id: "background",
                label: "Hintergrund",
                icon: "#i-image",
                rows: () => [
                    row("Art", "", sel("bg", [["motif", "Fertiges Motiv"], ["image", "Eigenes Bild"], ["gradient", "Farbverlauf"], ["solid", "Eine Farbe"]], "Hintergrund")),
                    ...backgroundRows(),
                    ...when("bg=motif|image", row("Zoom", "Näher heran an den gewählten Punkt", range("zoom", "Zoom"))),
                    ...when("bg=solid|gradient", row("Farbe", "", color("c1", "Hintergrundfarbe"))),
                    ...when("bg=gradient", row("Zweite Farbe", "Wohin der Verlauf läuft", color("c2", "Zweite Farbe")), row("Richtung", "", range("angle", "Richtung des Verlaufs"))),
                    row("Abdunkeln mit", "Farbe der Schicht über dem Hintergrund", color("dimc", "Farbe zum Abdunkeln")),
                    row("Stärke", "Damit Namen auf jedem Bild lesbar bleiben", range("dim", "Stärke")),
                    ...when("bg=motif|image", row("Unschärfe", "", range("blur", "Unschärfe"))),
                    row("Muster darüber", "", sel("pattern", [["none", "Keins"], ["raster", "Raster"], ["diagonal", "Schräge Linien"], ["dots", "Punkte"]], "Muster")),
                ],
            },
            {
                id: "colors",
                label: "Farben",
                icon: "#i-contrast",
                rows: () => [
                    row("Akzentfarbe", "Linien, Rahmen, Plaketten", sel("accent", [["role", "Farbe der jeweiligen Rolle"], ["own", "Eine Farbe für alle"]], "Akzentfarbe")),
                    ...when("accent=own", row("Eigene Akzentfarbe", "", color("accentColor", "Eigene Akzentfarbe"))),
                    row("Überschrift und Zahl", "", color("tc", "Farbe der Überschrift")),
                    row("Kleine Schrift", "Unterzeile, Anzahl, Fußzeile", color("sc", "Farbe der kleinen Schrift")),
                    row("Rollen-Überschriften", "", sel("headMode", [["own", "Eigene Farbe"], ["accent", "In Akzentfarbe"]], "Farbe der Rollen-Überschriften")),
                    ...when("headMode=own", row("Farbe der Rollen-Überschriften", "", color("headColor", "Farbe der Rollen-Überschriften"))),
                    row("Namen", "", color("nc", "Farbe der Namen")),
                    row("Zweite Zeile", "Etwa der Titel unter dem Namen", color("lc", "Farbe der zweiten Zeile")),
                    row("Trennlinien", "", color("lineColor", "Farbe der Trennlinien")),
                ],
            },
            {
                id: "tiles",
                label: "Kacheln",
                icon: "#i-layout",
                rows: () => [
                    row("Stil", "", sel("tile", [["glass", "Glas (getönt)"], ["solid", "Gefüllt"], ["topline", "Gefüllt mit Linie oben"], ["outline", "Nur Rahmen"], ["none", "Ohne Kachel"]], "Stil der Kacheln")),
                    ...when("tile=glass|solid|topline", row("Farbe", "", color("tileColor", "Farbe der Kacheln")), row("Deckkraft", "", range("tileAlpha", "Deckkraft"))),
                    ...when("tile=glass", row("Tönung in Akzentfarbe", "", range("tint", "Tönung"))),
                    ...when("tile=glass|solid|outline", row("Rahmen", "", sel("borderMode", [["accent", "In Akzentfarbe"], ["own", "Eigene Farbe"]], "Rahmenfarbe"))),
                    ...(im.tile !== "none" && im.tile !== "topline" && im.borderMode === "own" ? [row("Rahmenfarbe", "", color("borderColor", "Rahmenfarbe"))] : []),
                    ...when("tile=glass|solid|outline|topline", row("Rahmenstärke", "", range("bw", "Rahmenstärke")), row("Ecken", "0 ist eckig", range("radius", "Ecken"))),
                ],
            },
            {
                id: "avatars",
                label: "Profilbilder",
                icon: "#i-users",
                rows: () => [
                    row("Form", "", sel("shape", [["round", "Rund"], ["rounded", "Abgerundet"], ["square", "Eckig"]], "Form")),
                    row("Größe", "", sel("size", SIZES, "Größe")),
                    row("Rahmen", "", sel("ring", [["role", "In Akzentfarbe"], ["glow", "Mit Leuchten"], ["none", "Keiner"]], "Rahmen")),
                    row("Leuchten", "Auch am Balken der Rollen-Überschrift", range("glow", "Leuchten")),
                ],
            },
            {
                id: "fonts",
                label: "Schrift",
                icon: "#i-note",
                rows: () => [
                    row("Überschrift", "", sel("ft", FONTS, "Schrift der Überschrift")),
                    row("Größe der Überschrift", "", sel("tsize", SIZES, "Größe der Überschrift")),
                    row("Namen und Rest", "", sel("fn", FONTS, "Schrift der Namen")),
                    row("Größe der Namen", "", sel("nsize", SIZES, "Größe der Namen")),
                    row("Großbuchstaben", "Für Überschrift und Rollen", sw("upper", "Großbuchstaben")),
                ],
            },
            {
                id: "head",
                label: "Kopf",
                icon: "#i-crown",
                rows: () => [
                    row(
                        "Überschrift",
                        "Leer: der Name der Liste",
                        text(options.heading, MAX_HEADING, "Überschrift", (value) => {
                            s.remember("heading");
                            options.heading = value;
                            options.onHeading(value);
                        })
                    ),
                    row("Unterzeile", "{server}, {anzahl}, {rollen}", text(im.sub, MAX_SUB, "Unterzeile", (value) => set("sub", value))),
                    row("Server-Logo", "", sw("logo", "Server-Logo")),
                    ...when("logo=true", row("Form des Logos", "", sel("logoShape", [["rounded", "Abgerundet"], ["round", "Rund"], ["square", "Eckig"]], "Form des Logos"))),
                    row("Gesamtzahl rechts", "", sw("total", "Gesamtzahl")),
                    row("Ausrichtung", "", sel("headAlign", [["left", "Links"], ["center", "Mittig"]], "Ausrichtung des Kopfs")),
                ],
            },
            {
                id: "roles",
                label: "Rollen",
                icon: "#i-list",
                rows: () => [
                    row("Stil", "", sel("headStyle", [["bar", "Balken mit Linie"], ["pill", "Farbige Plakette"], ["line", "Unterstrichen"], ["plain", "Nur Text"]], "Stil")),
                    row("Symbol der Rolle", "Aus dem Reiter „Liste“", sw("showIcon", "Symbol")),
                    row("Anzahl", "", sw("showCount", "Anzahl")),
                ],
            },
            {
                id: "lines",
                label: "Zeilen",
                icon: "#i-scroll",
                rows: () => [
                    row("Zweite Zeile", "Unter dem Namen", sel("line2", [["handle", "Benutzername (@…)"], ["title", "Eigener Titel (unter Rollen)"], ["joined", "Auf dem Server seit"], ["role", "Name der Rolle"], ["none", "Keine"]], "Zweite Zeile")),
                    row("Fußzeile", "Ganz unten", sw("showFooter", "Fußzeile")),
                    ...when("showFooter=true", row("Text", "{stand}, {server}, {anzahl}", text(im.footer, MAX_SUB, "Text der Fußzeile", (value) => set("footer", value)))),
                ],
            },
        ],
    });
}
