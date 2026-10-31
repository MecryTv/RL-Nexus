/**
 * Der Karten-Editor im Reiter „Nachrichten“ beim Team-Hub (Plan 27,
 * Entwurf teamkarte-editor-v3), seit Plan 41 im Studio (layout/SettingsStudio.ts):
 * links die Bereiche, in der Mitte die Karte, wie der Bot sie zeichnet, rechts
 * die Einstellungen des offenen Bereichs. Oben steht, was nur für das gewählte Team gilt - Logo,
 * Beschreibung, Region, Ligen; gespeichert am Team wie unter „RL
 * Team-Übersicht“. Darunter, was für alle Karten gilt - gespeichert in den
 * Einstellungen (ITeamSettings.card und cardColumns).
 */
import { icon } from "../core/Dom.js";
import { button, el, row, select, toggle } from "../core/Ui.js";
import { galleryUrl, pickImage } from "./ImagePicker.js";
import { placeholderPicker } from "./MessageEditor.js";
import { IPlaceholder } from "../constants/Placeholders.js";
import { ISettingsStudio, settingsStudio } from "./SettingsStudio.js";

/** Wie ITeamCardDesign im Bot (interfaces/services/teams/ITeams.ts). */
export interface ICardDesign {
    background: { mode: "default" | "own" | "none"; image: string | null };
    dim: number;
    accent: string | null;
    parts: { logo: boolean; leagues: boolean; mmr: boolean; peak: boolean; staff: boolean };
    chips: { tag: boolean; group: boolean; place: boolean; region: boolean };
    title: string;
    subtitle: string;
    footer: string;
}

/** Wie ICardColumns im Bot. */
export interface ICardColumns {
    "2v2": boolean;
    "1v1": boolean;
    peak: boolean;
}

/** Was der Editor je Team bearbeitet - dieselben Felder wie am Team. */
export interface ICardEditorTeam {
    id: number;
    name: string;
    logo: string | null;
    /** Plan 30: eigener Hintergrund dieses Teams. null: der für alle Team-Karten. */
    background: string | null;
    description: string;
    region: string;
    links: { label: string; url: string }[];
}

export interface ICardEditorOptions {
    guildId: string;
    teams: () => ICardEditorTeam[];
    draft: { card: ICardDesign; cardColumns: ICardColumns };
    /** Platzhalter der Team-Karte für die drei Zeilen. */
    placeholders: IPlaceholder[];
    limits: { description: number; links: number; linkLabel: number };
    /** Welches Team gerade dran ist - überlebt das Neuladen nach dem Speichern. */
    chosen: number | null;
    onChoose: (id: number) => void;
    touch: () => void;
    preview: (id: number, team: Partial<ICardEditorTeam>) => Promise<string | null>;
    /** Speichert alles - Einstellungen, Kategorien und das Team. false: es ging nicht. */
    save: () => Promise<boolean>;
    /** Plan 41: der Speichern-Knopf der Seite - das Studio spiegelt ihn. */
    pageSave?: () => HTMLButtonElement | null;
}

/** Welcher Bereich offen ist, bleibt beim Neuaufbau nach dem Speichern. */
let openPanel = "team";

const PARTS: [keyof ICardDesign["parts"], string][] = [
    ["logo", "Logo"],
    ["leagues", "Ligen und Turniere"],
    ["mmr", "MMR-Block rechts"],
    ["peak", "Ø Peak"],
    ["staff", "Staff"],
];

const CHIPS: [keyof ICardDesign["chips"], string][] = [
    ["tag", "Kürzel"],
    ["group", "Kategorie"],
    ["place", "Platz"],
    ["region", "Region"],
];

const COLUMNS: [keyof ICardColumns, string][] = [
    ["2v2", "2v2"],
    ["1v1", "1v1"],
    ["peak", "Peak"],
];

const BACKGROUNDS: [ICardDesign["background"]["mode"], string][] = [
    ["default", "Standard"],
    ["own", "Eigenes Bild"],
    ["none", "Ohne"],
];

const LINES: [keyof Pick<ICardDesign, "title" | "subtitle" | "footer">, string, string][] = [
    ["title", "Große Zeile", "Ganz oben, groß"],
    ["subtitle", "Unterzeile", "Unter den Marken, bis zu zwei Zeilen"],
    ["footer", "Fußzeile", "Unten links. Rechts steht immer, wann die Ränge geholt wurden"],
];

export function teamCardEditor(options: ICardEditorOptions): { node: HTMLElement; teamDraft(): { id: number; changes: Partial<ICardEditorTeam> } | null; saved(): void; redraw(): void } {
    const { draft } = options;
    const shot = el("div", "tmshot");
    const node = el("div", "");
    // Gesetzt, bevor jemand etwas ändern kann - das Studio entsteht am Ende dieser Funktion.
    let s!: ISettingsStudio;
    let chosen = options.teams().some((team) => team.id === options.chosen) ? options.chosen! : (options.teams()[0]?.id ?? 0);
    let changes: Partial<ICardEditorTeam> = {};
    let timer = 0;
    let ticket = 0;

    const team = (): ICardEditorTeam | null => {
        const saved = options.teams().find((entry) => entry.id === chosen);

        return saved ? { ...saved, ...changes } : null;
    };

    /** Der Bot zeichnet, die Seite fragt nach einer kurzen Pause - nur die neueste Antwort zählt. */
    const preview = (): void => {
        window.clearTimeout(timer);
        ticket++;

        const now = team();

        if (!now) {
            shot.replaceChildren(el("p", "hintline", "Lege zuerst ein Team an, dann steht hier seine Karte."));

            return;
        }

        timer = window.setTimeout(async () => {
            const mine = ticket;
            const image = await options.preview(now.id, changes);

            if (!image || mine !== ticket) return;

            const picture = el("img", "tmshot__img");

            picture.src = image;
            picture.alt = `Team-Karte von ${now.name}`;
            shot.replaceChildren(picture);
        }, 300);
    };

    /** key: gleiches Feld kurz hintereinander ist ein Schritt für Rückgängig. */
    const changeTeam = (patch: Partial<ICardEditorTeam>, key = ""): void => {
        s.remember(key);
        changes = { ...changes, ...patch };
        options.touch();
        preview();
    };

    // „Ø Peak“ steht im MMR-Block - ist der aus, fehlt er auch. Ohne Hinweis sähe der Schalter kaputt aus (W-0026).
    const peakHint = el("p", "hintline", "„Ø Peak“ steht im MMR-Block. Solange der aus ist, fehlt auch der Ø Peak.");
    const syncPeakHint = (): void => {
        peakHint.hidden = draft.card.parts.mmr || !draft.card.parts.peak;
    };

    /** Erst merken, dann ändern - so holt Rückgängig den Stand davor. */
    const editDesign = (key: string, apply: () => void): void => {
        s.remember(key);
        apply();
        changeDesign();
    };

    const changeDesign = (): void => {
        options.touch();
        syncPeakHint();
        preview();
    };

    const switches = <T extends string>(entries: [T, string][], value: (key: T) => boolean, set: (key: T, on: boolean) => void): HTMLElement =>
        el(
            "div",
            "tmcols",
            ...entries.map(([key, label]) =>
                el(
                    "label",
                    "snitem__switch",
                    toggle(value(key), label, (on) => editDesign("", () => set(key, on))),
                    el("span", "", label)
                )
            )
        );

    /** Ein Bild aus der Galerie: kleine Vorschau, wählen bzw. tauschen und entfernen. */
    const picture = (current: string | null, label: string, onPick: (value: string | null) => void): HTMLElement => {
        const url = current ? galleryUrl(options.guildId, current) : null;
        const choose = button("btn btn--quiet", icon("#i-image"), current ? "Bild tauschen" : "Bild wählen");

        choose.setAttribute("aria-label", `${label}: ${current ? "Bild tauschen" : "Bild wählen"}`);
        choose.addEventListener("click", () =>
            void pickImage(options.guildId, [], ["gallery", "upload"]).then((picked) => {
                if (picked) onPick(picked);
            })
        );

        const parts: HTMLElement[] = [];
        // Die gezeichnete Karte lädt nie Links, sie zeigt dann das Kürzel. Also hier auch kein Bild, sondern der Grund (W-0026).
        const link = current?.startsWith("https://") ?? false;

        if (url && !link) {
            const image = el("img", "tmpick__img");

            image.src = url;
            image.alt = "";
            parts.push(image);
        }

        parts.push(choose);

        if (current) {
            const remove = button("iconbtn is-danger", icon("#i-trash"));

            remove.title = `${label} entfernen`;
            remove.setAttribute("aria-label", `${label} entfernen`);
            remove.addEventListener("click", () => onPick(null));
            parts.push(remove);
        }

        const box = el("div", "tmpick", ...parts);

        return link ? el("div", "", box, el("p", "hintline", "Ein Link erscheint nicht auf der gezeichneten Karte. Wähl ein Bild aus der Galerie oder lade eins hoch.")) : box;
    };

    const leagues = (now: ICardEditorTeam): HTMLElement => {
        const links = now.links.map((link) => ({ ...link }));
        const box = el("div", "tmlinks");
        const commit = (key = ""): void => changeTeam({ links: links.map((link) => ({ ...link })) }, key);
        const paint = (): void => {
            box.replaceChildren(
                ...links.map((link, index) => {
                    const label = el("input", "text");
                    const url = el("input", "text");
                    const remove = button("iconbtn is-danger", icon("#i-trash"));

                    label.type = "text";
                    label.maxLength = options.limits.linkLabel;
                    label.value = link.label;
                    label.placeholder = "Name, etwa RLCS Quali EU";
                    label.setAttribute("aria-label", `Name der Liga ${index + 1}`);
                    label.addEventListener("input", () => {
                        link.label = label.value;
                        commit(`link:${index}`);
                    });
                    url.type = "url";
                    url.value = link.url;
                    url.placeholder = "https://…";
                    url.setAttribute("aria-label", `Link der Liga ${index + 1}`);
                    url.addEventListener("input", () => {
                        link.url = url.value.trim();
                        commit(`url:${index}`);
                    });
                    remove.title = "Liga entfernen";
                    remove.setAttribute("aria-label", `Liga ${index + 1} entfernen`);
                    remove.addEventListener("click", () => {
                        links.splice(index, 1);
                        commit();
                        paint();
                    });

                    return el("div", "tmlink", label, url, remove);
                }),
                ...(links.length < options.limits.links
                    ? [
                          (() => {
                              const add = button("btn btn--quiet", icon("#i-plus"), "Liga oder Turnier");

                              add.addEventListener("click", () => {
                                  links.push({ label: "", url: "" });
                                  paint();
                                  box.querySelectorAll<HTMLInputElement>(".tmlink input")[links.length * 2 - 2]?.focus();
                              });

                              return add;
                          })(),
                      ]
                    : [])
            );
        };

        paint();

        return box;
    };

    const line = (key: "title" | "subtitle" | "footer", label: string, hint: string): HTMLElement => {
        const input = el("input", "text");

        input.type = "text";
        input.maxLength = 200;
        input.value = draft.card[key];
        input.setAttribute("aria-label", label);
        input.addEventListener("input", () => editDesign(`line:${key}`, () => (draft.card = { ...draft.card, [key]: input.value })));

        const pick = placeholderPicker(options.placeholders, (value) => {
            const at = input.selectionStart ?? input.value.length;

            input.value = `${input.value.slice(0, at)}${value}${input.value.slice(input.selectionEnd ?? at)}`;
            input.dispatchEvent(new Event("input"));
            input.focus();
        });

        return row(label, hint, el("div", "tmline", input, pick));
    };

    /** Nur für dieses Team - gespeichert am Team wie unter „RL Team-Übersicht“. */
    const teamRows = (): HTMLElement[] => {
        const now = team();

        if (!now) return [el("p", "hintline", "Lege zuerst ein Team an, dann steht hier seine Karte.")];

        const teams = select(
            options.teams().map((entry): [string, string] => [String(entry.id), entry.name]),
            String(chosen),
            (value) =>
                void (async () => {
                    // Offene Änderungen am bisherigen Team gehen nicht verloren: erst speichern, dann wechseln.
                    if (Object.keys(changes).length && !(await options.save())) {
                        teams.value = String(chosen);

                        return;
                    }

                    chosen = Number(value);
                    changes = {};
                    options.onChoose(chosen);
                    // Rückgängig gehörte zum bisherigen Team.
                    s.forget();
                    s.repaint();
                    preview();
                })(),
            "Team für die Karte"
        );

        const description = el("textarea", "text tkarea");

        description.rows = 3;
        description.maxLength = options.limits.description;
        description.value = now.description;
        description.setAttribute("aria-label", "Beschreibung");
        description.addEventListener("input", () => changeTeam({ description: description.value }, "description"));

        const region = el("input", "text");

        region.type = "text";
        region.maxLength = 16;
        region.value = now.region;
        region.placeholder = "Etwa EU";
        region.setAttribute("aria-label", "Region");
        region.addEventListener("input", () => changeTeam({ region: region.value }, "region"));

        return [
            el("p", "sto-note", "Gilt nur für dieses Team und wird am Team gespeichert, wie unter „RL Team-Übersicht“."),
            row("Team", "Seine Karte steht in der Mitte", teams),
            row(
                "Logo",
                "Aus der Galerie oder neu hochladen",
                picture(now.logo, "Logo", (value) => {
                    changeTeam({ logo: value });
                    s.repaint();
                })
            ),
            row(
                "Eigener Hintergrund",
                "Nur für dieses Team. Leer: der Hintergrund für alle Team-Karten",
                picture(now.background, "Hintergrund dieses Teams", (value) => {
                    changeTeam({ background: value });
                    s.repaint();
                })
            ),
            row("Beschreibung", "Steht mit {team.description} in der Unterzeile", description),
            row("Region", "Etwa EU, höchstens 16 Zeichen", region),
            row("Ligen und Turniere", `Name und Link, bis zu ${options.limits.links}. Auf der Karte steht der Name`, leagues(now)),
        ];
    };

    const backgroundRows = (): HTMLElement[] => {
        const backgrounds = el(
            "div",
            "tmseg",
            ...BACKGROUNDS.map(([mode, label]) => {
                const knob = button("tmseg__item", label);

                knob.setAttribute("aria-pressed", String(draft.card.background.mode === mode));
                knob.addEventListener("click", () => {
                    editDesign("", () => (draft.card = { ...draft.card, background: { ...draft.card.background, mode } }));
                    s.repaint();
                });

                return knob;
            })
        );

        backgrounds.setAttribute("role", "group");
        backgrounds.setAttribute("aria-label", "Hintergrund");

        const dim = el("input", "tmrange");
        const dimValue = el("span", "tmrange__value", `${draft.card.dim} %`);

        dim.type = "range";
        dim.min = "0";
        dim.max = "90";
        dim.step = "5";
        dim.value = String(draft.card.dim);
        dim.setAttribute("aria-label", "Abdunkeln");
        dim.addEventListener("input", () => {
            editDesign("dim", () => (draft.card = { ...draft.card, dim: Number(dim.value) }));
            dimValue.textContent = `${dim.value} %`;
        });

        return [
            el("p", "sto-note", "Gilt für jede Team-Karte im Hub."),
            row("Hintergrund", "Standard ist das Motiv von RL Nexus", backgrounds),
            ...(draft.card.background.mode === "own"
                ? [
                      row(
                          "Eigenes Bild",
                          "Aus der Galerie oder hochladen. Fehlt es später, steht der Standard da",
                          picture(draft.card.background.image, "Hintergrundbild", (value) => {
                              editDesign("", () => (draft.card = { ...draft.card, background: { ...draft.card.background, image: value } }));
                              s.repaint();
                          })
                      ),
                  ]
                : []),
            ...(draft.card.background.mode === "none" ? [] : [row("Abdunkeln", "Damit Schrift und Tabelle lesbar bleiben", el("div", "tmline", dim, dimValue))]),
        ];
    };

    const colorRows = (): HTMLElement[] => {
        const color = el("input", "tkcolor");
        const reset = button("btn btn--quiet", "Teamfarbe");

        color.type = "color";
        color.value = draft.card.accent ?? "#00afff";
        color.setAttribute("aria-label", "Farbe der Karte");
        color.addEventListener("input", () => {
            editDesign("accent", () => (draft.card = { ...draft.card, accent: color.value }));
            reset.disabled = false;
        });
        reset.disabled = draft.card.accent === null;
        reset.title = "Ohne eigene Farbe gilt die Farbe des Teams";
        reset.addEventListener("click", () => {
            editDesign("", () => (draft.card = { ...draft.card, accent: null }));
            reset.disabled = true;
        });

        return [row("Farbe", "Kante, Kürzel und Schein. Ohne eigene Farbe die des Teams", el("div", "tmline", color, reset))];
    };

    s = settingsStudio(node, {
        title: "Team-Karte",
        open: openPanel,
        onOpen: (id) => (openPanel = id),
        stage: shot,
        pageSave: options.pageSave,
        take: () => structuredClone({ card: draft.card, cardColumns: draft.cardColumns, changes }),
        put: (state) => {
            draft.card = state.card;
            draft.cardColumns = state.cardColumns;
            changes = state.changes;
            changeDesign();
        },
        panels: [
            { id: "team", label: "Team", icon: "#i-users", rows: teamRows },
            { id: "background", label: "Hintergrund", icon: "#i-image", rows: backgroundRows },
            { id: "color", label: "Farbe", icon: "#i-contrast", rows: colorRows },
            {
                id: "parts",
                label: "Bausteine",
                icon: "#i-puzzle",
                rows: () => [
                    row(
                        "Bausteine",
                        "Was auf der Karte steht",
                        el(
                            "div",
                            "",
                            switches(PARTS, (key) => draft.card.parts[key], (key, on) => (draft.card = { ...draft.card, parts: { ...draft.card.parts, [key]: on } })),
                            peakHint
                        )
                    ),
                    row(
                        "Marken",
                        "Die kleinen Kästchen unter dem Namen",
                        switches(CHIPS, (key) => draft.card.chips[key], (key, on) => (draft.card = { ...draft.card, chips: { ...draft.card.chips, [key]: on } }))
                    ),
                ],
            },
            { id: "lines", label: "Zeilen", icon: "#i-scroll", rows: () => LINES.map(([key, label, hint]) => line(key, label, hint)) },
            {
                id: "columns",
                label: "Spalten",
                icon: "#i-grid",
                rows: () => [
                    row(
                        "Spalten",
                        "Ohne 2v2 und 1v1 wird die Karte schmaler und ist auf dem Handy ohne Antippen lesbar. Rolle, Spieler, Rang, 3v3 und Schnitt bleiben immer",
                        switches(COLUMNS, (key) => draft.cardColumns[key], (key, on) => (draft.cardColumns = { ...draft.cardColumns, [key]: on }))
                    ),
                ],
            },
        ],
    });

    syncPeakHint();
    preview();

    return {
        node,
        teamDraft: () => (Object.keys(changes).length ? { id: chosen, changes } : null),
        saved: () => {
            changes = {};
        },
        redraw: () => {
            s.repaint();
            preview();
        },
    };
}
