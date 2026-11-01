import { AttachmentBuilder, ContainerBuilder, Guild } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { HelpBlock, RenderHelpImages } from "./HelpImage";
import { ButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import { IPanelField, IPanelModule, PanelId, ShowValue } from "../services/settings/SettingsModel";

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

function Cut(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

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
                defaults: ids.filter((channel) => guild.channels.cache.has(channel)),
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
    builder.buttons(
        ...(view.done ? [{ customId: PanelId("u", panel.id, view.done.key), label: "Rückgängig", emoji: "↩️" }] : []),
        ...(panel.id === "tickets" ? [{ customId: PanelId("p", panel.id), label: "Panel senden", emoji: "📨" }] : []),
        ...(panel.permanent ? [] : [{ customId: PanelId("x", panel.id, undefined, state.on ? "off" : "on"), label: state.on ? "Modul aus" : "Modul an", emoji: "⏻" }]),
        { customId: PanelId("s"), label: "◀ Alle Module" },
        { url: state.link, label: "Dashboard", emoji: "🖥️" }
    );

    return { components: [builder.build()], files };
}

/** /einstellungen ohne Modul (A2): alle Module als Kacheln, darunter „Modul wählen“. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function OverviewView(guild: Guild, rows: { panel: IPanelModule<any>; on: boolean }[], link: string): Promise<IPanelMessage> {
    const blocks: HelpBlock[] = [
        { kind: "title", emoji: "⚙️", text: "Einstellungen", sub: `${guild.name ?? "Server"} · Wähle ein Modul. Was du änderst, gilt sofort, wie im Dashboard.` },
        { kind: "settings", items: rows.map(({ panel, on }, index) => ({ n: index + 1, label: panel.name, value: on ? "an" : "aus", state: on ? "on" : "off" })) },
    ];
    const { builder, files } = await Compose(blocks, "#ff1e2d", "einstellungen");

    builder.select({
        customId: PanelId("m"),
        placeholder: "Modul wählen …",
        options: rows.map(({ panel, on }) => ({
            label: panel.name,
            value: panel.id,
            emoji: panel.emoji,
            description: `${panel.sections.reduce((sum, section) => sum + section.fields.length, 0)} Einstellungen · ${on ? "an" : "aus"}`,
        })),
    });
    builder.buttons({ url: link, label: "Dashboard", emoji: "🖥️" });

    return { components: [builder.build()], files };
}
