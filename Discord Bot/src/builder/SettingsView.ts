import { AttachmentBuilder, ContainerBuilder, Guild } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { HelpBlock, RenderHelpImages } from "./HelpImage";
import { ButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import { PANEL_AREAS } from "../services/settings/registers";
import { IPanelField, IPanelModule, PanelId, ShowValue } from "../services/settings/SettingsModel";
import { Cut } from "../utils/cut";

/**
 * Das Einstellungs-Panel (W-0014 Teil 3, Entwürfe 3B, A2, B1, C1): oben die
 * Übersicht als Bild mit nummerierten Kacheln, darunter entweder das Menü „Was
 * willst du ändern?“ oder das Feld der gewählten Einstellung.
 */

export interface IPanelState {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel: IPanelModule<any>;
    settings: unknown;
    /** Ist das Modul auf dem Server an? */
    on: boolean;
    guild: Guild;
    /** Die Seite des Moduls im Dashboard. */
    link: string;
}

export interface IPanelView {
    /** Schlüssel der gewählten Einstellung - dann steht ihr Feld statt des Menüs da. */
    selected?: string;
    /** Die letzte Änderung - mit Rückgängig. */
    done?: { key: string; before: string; after: string };
    warning?: string | null;
    error?: string | null;
    /** Ein Satz ohne Änderung an einer Einstellung, etwa „Panel gesendet“. */
    note?: string;
}

export interface IPanelMessage {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
}

const MAX_FILES = 10;

/** Felder mit ihrer Nummer, durchgezählt über alle Abschnitte. */
function Numbered(panel: IPanelModule<unknown>): { n: number; field: IPanelField<unknown>; section: string }[] {
    return panel.sections.flatMap((section) => section.fields.map((field) => ({ field, section: section.title }))).map((entry, index) => ({ n: index + 1, ...entry }));
}

function State(field: IPanelField<unknown>, value: unknown): "on" | "off" | undefined {
    return field.kind === "toggle" ? (value ? "on" : "off") : undefined;
}

export function PanelBlocks(state: IPanelState, view: IPanelView): HelpBlock[] {
    const { panel, settings, guild } = state;
    const changed = view.selected ?? view.done?.key;
    let n = 0;
    const blocks: HelpBlock[] = [
        {
            kind: "title",
            emoji: panel.emoji,
            text: `${panel.name} · Einstellungen`,
            sub: `${guild.name ?? "Server"} · Was du änderst, gilt sofort, wie im Dashboard.`,
            ...(state.on ? {} : { note: "Das Modul ist aus. Einschalten mit dem Knopf unten." }),
        },
    ];

    for (const section of panel.sections) {
        blocks.push({
            kind: "settings",
            title: section.title,
            items: section.fields.map((field) => {
                const value = field.get(settings);
                const status = State(field, value);

                n++;

                return { n, label: field.label, value: ShowValue(field, value, guild), ...(status ? { state: status } : {}), ...(field.key === changed ? { hi: true } : {}) };
            }),
        });
    }

    // A1: Module ohne eigene Einstellungen - ein Satz statt der Kacheln.
    if (panel.about) blocks.push({ kind: "text", text: `${panel.about} Hier kannst du das Modul ein- und ausschalten.` });
    if (panel.dashOnly.length) blocks.push({ kind: "text", text: `**Nur im Dashboard:** ${panel.dashOnly.join(", ")}` });

    return blocks;
}

async function Compose(blocks: HelpBlock[], color: `#${string}`, name: string): Promise<{ builder: ComponentV2Builder; files: AttachmentBuilder[] }> {
    const images = (await RenderHelpImages(blocks)).slice(0, MAX_FILES);
    const builder = new ComponentV2Builder({ accentColor: color });
    const file = (index: number) => `${name}-${index + 1}.png`;

    images.forEach((image, index) => builder.image(`attachment://${file(index)}`, image.alt));

    return { builder, files: images.map((image, index) => new AttachmentBuilder(image.png, { name: file(index) })) };
}

/** Das Feld zur gewählten Einstellung (B1) - und darunter immer ◀ Zurück. */
function Control(builder: ComponentV2Builder, state: IPanelState, field: IPanelField<unknown>): void {
    const { panel, guild } = state;
    const value = field.get(state.settings);
    const ids = (Array.isArray(value) ? value : value ? [value] : []).filter((id): id is string => typeof id === "string");
    const id = (step: Parameters<typeof PanelId>[0], extra?: string) => PanelId(step, panel.id, field.key, extra);
    const back: ButtonOptions = { customId: PanelId("b", panel.id), label: "◀ Zurück" };
    const none: ButtonOptions = { customId: id("n"), label: field.kind === "channel" ? "Keiner" : "Keine" };
    const limit = Math.min(field.max ?? 25, 25);

    switch (field.kind) {
        case "channel":
        case "channels":
            builder.channelSelect({
                customId: id("c"),
                channelTypes: field.channelTypes,
                placeholder: field.kind === "channel" ? "Kanal wählen …" : "Kanäle wählen …",
                // Nur, was das Menü auch anbietet: eine Vorauswahl außerhalb der Kanalarten könnte Discord ablehnen.
                defaults: ids.filter((channel) => {
                    const found = guild.channels.cache.get(channel);

                    return found !== undefined && (!field.channelTypes || field.channelTypes.includes(found.type));
                }),
                ...(field.kind === "channels" ? { minValues: 0, maxValues: limit } : {}),
            });
            builder.buttons(none, back);
            return;
        case "role":
        case "roles":
            builder.roleSelect({
                customId: id("r"),
                placeholder: field.kind === "role" ? "Rolle wählen …" : "Rollen wählen …",
                defaults: ids.filter((role) => guild.roles.cache.has(role)),
                ...(field.kind === "roles" ? { minValues: 0, maxValues: limit } : {}),
            });
            builder.buttons(none, back);
            return;
        case "toggle":
            builder.buttons(
                { customId: id("t", "on"), label: "An", tone: value ? "success" : "secondary" },
                { customId: id("t", "off"), label: "Aus", tone: value ? "secondary" : "danger" },
                back
            );
            return;
        case "choice":
            builder.select({
                customId: id("o"),
                placeholder: "Wählen …",
                options: (field.choices ?? []).slice(0, 25).map(([key, label]) => ({ label: Cut(label, 100), value: key || "-", default: key === value })),
            });
            builder.buttons(back);
            return;
        case "number":
        case "text":
        case "stages":
            builder.buttons({ customId: id("f"), label: "Ändern", emoji: "✏️", tone: "primary" }, back);
            return;
    }
}

export async function PanelView(state: IPanelState, view: IPanelView = {}): Promise<IPanelMessage> {
    const { panel, guild } = state;
    const { builder, files } = await Compose(PanelBlocks(state, view), panel.color, `einstellungen-${panel.id}`);
    const numbered = Numbered(panel);
    const selected = numbered.find((entry) => entry.field.key === view.selected);
    const done = view.done ? numbered.find((entry) => entry.field.key === view.done!.key) : null;

    if (done && view.done) builder.text(`✅ **${done.field.label}**: ${view.done.before} → ${view.done.after}`);
    if (view.note) builder.text(view.note);
    if (view.warning) builder.text(`⚠️ ${view.warning}`);
    if (view.error) builder.text(`❌ ${view.error}`);

    if (selected) {
        builder.text(`**${selected.n} · ${selected.section}: ${selected.field.label}**
${selected.field.hint}`);
        Control(builder, state, selected.field);

        return { components: [builder.build()], files };
    }

    // Ohne Felder (A1) kein Menü - Discord lehnt eins ohne Einträge ab.
    if (numbered.length) {
        builder.select({
            customId: PanelId("w", panel.id),
            placeholder: "Was willst du ändern? …",
            // Die Bezeichnung ist kurz (sie steht in einer Kachel) - der Abschnitt davor gibt den Zusammenhang.
            options: numbered.map(({ n, field, section }) => ({
                label: Cut(`${n} · ${field.label}`, 100),
                value: field.key,
                description: Cut(`${section} · ${ShowValue(field, field.get(state.settings), guild)}`, 100),
            })),
        });
    }
    builder.buttons(
        ...(view.done ? [{ customId: PanelId("u", panel.id, view.done.key), label: "Rückgängig", emoji: "↩️" }] : []),
        ...(panel.id === "tickets" ? [{ customId: PanelId("p", panel.id), label: "Panel senden", emoji: "📨" }] : []),
        ...(panel.permanent ? [] : [{ customId: PanelId("x", panel.id, undefined, state.on ? "off" : "on"), label: state.on ? "Modul aus" : "Modul an", emoji: "🔌" }]),
        { customId: PanelId("s"), label: "◀ Alle Module" },
        { url: state.link, label: "Dashboard", emoji: "🖥️" }
    );

    return { components: [builder.build()], files };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OverviewRow = { panel: IPanelModule<any>; on: boolean };

/**
 * Die Übersicht als Kacheln, je Bereich der Dashboard-Leiste ein Abschnitt
 * (W-0014 Teil 4). Die Nummern laufen durch; das Zeichnen verteilt die
 * Abschnitte auf so viele Bilder wie nötig.
 */
export function OverviewBlocks(guild: Guild, rows: OverviewRow[]): HelpBlock[] {
    const blocks: HelpBlock[] = [{ kind: "title", emoji: "⚙️", text: "Einstellungen", sub: `${guild.name ?? "Server"} · Wähle ein Modul. Was du änderst, gilt sofort, wie im Dashboard.` }];
    let n = 0;

    for (const area of PANEL_AREAS) {
        const inArea = rows.filter((row) => area.ids.includes(row.panel.id));

        if (!inArea.length) continue;

        blocks.push({
            kind: "settings",
            title: area.name,
            // Blass: Module ohne eigene Einstellungen (A1), sie lassen sich nur ein- und ausschalten.
            items: inArea.map(({ panel, on }) => ({ n: ++n, label: panel.name, value: on ? "an" : "aus", state: on ? "on" : "off", ...(panel.about ? { dim: true } : {}) })),
        });
    }

    return blocks;
}

/** /einstellungen ohne Modul (A2): alle Module als Kacheln nach Bereichen, darunter „Modul wählen“. */
export async function OverviewView(guild: Guild, rows: OverviewRow[], link: string): Promise<IPanelMessage> {
    const { builder, files } = await Compose(OverviewBlocks(guild, rows), "#ff1e2d", "einstellungen");

    builder.select({
        customId: PanelId("m"),
        placeholder: "Modul wählen …",
        options: rows.map(({ panel, on }) => {
            const count = panel.sections.reduce((sum, section) => sum + section.fields.length, 0);

            return { label: panel.name, value: panel.id, emoji: panel.emoji, description: `${count ? `${count} Einstellungen` : "nur an/aus"} · ${on ? "an" : "aus"}` };
        }),
    });
    builder.buttons({ url: link, label: "Dashboard", emoji: "🖥️" });

    return { components: [builder.build()], files };
}
