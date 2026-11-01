import { AttachmentBuilder, ContainerBuilder, MessageFlags } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { HelpBlock, RenderHelpImages } from "./HelpImage";
import { ButtonOptions, ISelectMenuOptions } from "../interfaces/builder/IComponentV2Builder";
import { HELP_ACCENT, HELP_AREAS, HELP_PREFIX, HelpAreaId, IHelpText, STATUS_URL, SUPPORT_URL, WHO_LABELS } from "../constants/Help";
import { IsModule } from "../constants/Modules";
import { IHelpCommand, IHelpEntry } from "../services/help/HelpModel";

/**
 * Die Seiten von /hilfe (W-0014, Plan 45): Start B, Bereich C, Befehl A und
 * Gruppe K aus den Entwürfen. Der Inhalt sind Blöcke, die HelpImage als Bilder
 * im Look der Entwürfe zeichnet (Nachtrag des Nutzers); Menüs und Knöpfe
 * bleiben Discord-Bausteine darunter. Lange Seiten werden geteilt.
 */

export interface IHelpContext {
    guildId: string;
    /** Basis des Dashboards, etwa https://dashboard.nexus-emb.de/dashboard. */
    dashboard: string;
    /** Adresse der Hilfeseite (docu). */
    docs: string;
    /** Die Module, die auf dem Server an sind. */
    enabled: ReadonlySet<string>;
}

export interface IHelpStart {
    name: string;
    modules: { on: number; all: number };
    commands: number;
    access: { value: string; sub: string };
    version: string;
}

export interface IHelpPage {
    blocks: HelpBlock[];
    select?: ISelectMenuOptions;
    buttons: ButtonOptions[];
    /** Startseite: oben das Banner. */
    banner: boolean;
    /** Steht oben, wenn das Banner nicht gezeichnet werden konnte. */
    fallback?: HelpBlock;
    accent: number;
}

export type IHelpMessage = { components: ContainerBuilder[]; files: AttachmentBuilder[]; flags: number; allowedMentions: { parse: [] } };

export const BANNER_FILE = "hilfe.png";
/** Inhalt je Seite, grob in Zeichen - so bleiben es höchstens ein paar Bilder. */
const PAGE_CHARS = 2600;
const MAX_OPTIONS = 25;
const MAX_FILES = 10;
const MODERATION_ACCENT = 0xf0b232;

/** Abschnitt der Hilfeseite je Bereich (Anker in docu). */
const DOC_ANCHORS: Record<HelpAreaId, string> = {
    always: "docg-grundlagen",
    "rocket-league": "docg-rocket-league",
    community: "docg-community",
    support: "docg-support",
    moderation: "docg-moderation",
    content: "docg-inhalte-und-meldungen",
    general: "docg-grundlagen",
};

function Area(id: HelpAreaId) {
    return HELP_AREAS.find((area) => area.id === id) ?? HELP_AREAS[HELP_AREAS.length - 1];
}

function Accent(area: HelpAreaId): number {
    return area === "moderation" ? MODERATION_ACCENT : HELP_ACCENT;
}

function FirstSentence(text: string): string {
    const end = text.search(/[.!?](\s|$)/);

    return end === -1 ? text : text.slice(0, end + 1);
}

function Cut(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function Count(count: number): string {
    return `${count} ${count === 1 ? "Befehl" : "Befehle"}`;
}

/** Gruppen von Blöcken auf Seiten verteilen; eine Gruppe wird nie getrennt. */
function Paginate(groups: HelpBlock[][]): HelpBlock[][] {
    const pages: HelpBlock[][] = [[]];
    let size = 0;

    for (const group of groups) {
        const length = JSON.stringify(group).length;

        if (pages[pages.length - 1].length > 0 && size + length > PAGE_CHARS) {
            pages.push([]);
            size = 0;
        }

        pages[pages.length - 1].push(...group);
        size += length;
    }

    return pages;
}

function Clamp(page: number, pages: number): number {
    return Math.min(Math.max(Math.floor(page) || 0, 0), pages - 1);
}

/** Abgeschaltetes Modul: Hinweis, wie man es einschaltet. Leer, wenn es an ist oder kein Modul ist. */
function OffNote(module: string | null, context: IHelpContext): string {
    return module && IsModule(module) && !context.enabled.has(module) ? `Modul aus, einschalten mit \`/module an modul:${module}\` oder im Dashboard` : "";
}

function Dashboard(context: IHelpContext, module: string | null): string {
    return `${context.dashboard}/guild/${context.guildId}${module ? `/${module}` : ""}`;
}

function PageButtons(id: (page: number) => string, page: number, pages: number): ButtonOptions[] {
    if (pages <= 1) return [];

    return [
        { customId: id(page - 1), label: "◀", disabled: page === 0 },
        { customId: id(page + 1), label: `▶ ${page + 1}/${pages}`, disabled: page === pages - 1 },
    ];
}

function FieldLine(command: IHelpCommand): string {
    return command.fields.length ? command.fields.map((field) => `${field.name}${field.required ? "*" : ""}`).join(" · ") : "ohne Felder";
}

export function AreaOf(entry: IHelpEntry): HelpAreaId {
    return entry.group?.area ?? entry.commands[0].text.area;
}

/* ----------------------------------------------------------
   Start (Entwurf B)
   ---------------------------------------------------------- */
function AreaCounts(entries: IHelpEntry[]): { id: HelpAreaId; count: number }[] {
    return HELP_AREAS.map((area) => ({
        id: area.id,
        count: entries.filter((entry) => AreaOf(entry) === area.id).reduce((sum, entry) => sum + entry.commands.length, 0),
    })).filter((area) => area.count > 0);
}

export function HelpStartPage(start: IHelpStart, entries: IHelpEntry[], context: IHelpContext): IHelpPage {
    const areas = AreaCounts(entries);

    return {
        banner: true,
        fallback: { kind: "title", emoji: "👋", text: "RL NEXUS", sub: `Willkommen, ${start.name}` },
        accent: HELP_ACCENT,
        blocks: [
            {
                kind: "tiles",
                items: [
                    { emoji: "📦", value: `${start.modules.on}/${start.modules.all}`, label: "Module an" },
                    { emoji: "🧭", value: String(start.commands), label: "Befehle" },
                    { emoji: "🔑", value: start.access.value, label: start.access.sub },
                    { emoji: "🏷️", value: start.version, label: "Version" },
                ],
            },
            {
                kind: "steps",
                title: "In drei Schritten startklar",
                items: ["`/module` schaltet ein, was dein Server braucht", "Einstellen per Befehl oder im Dashboard mit Vorschau", "Fragen? `/hilfe befehl:` erklärt jeden Befehl"],
            },
            { kind: "heading", text: "Bereiche" },
            { kind: "areas", items: areas.map(({ id, count }) => ({ emoji: Area(id).emoji, name: Area(id).name, count: Count(count) })) },
        ],
        select: areas.length
            ? {
                  customId: `${HELP_PREFIX}bereich`,
                  placeholder: "Bereich öffnen …",
                  options: areas.slice(0, MAX_OPTIONS).map(({ id, count }) => ({ label: Area(id).name, value: id, emoji: Area(id).emoji, description: Count(count) })),
              }
            : undefined,
        buttons: [
            { url: Dashboard(context, null), label: "Dashboard", emoji: "🖥️" },
            { url: context.docs, label: "Doku", emoji: "📖" },
            { url: STATUS_URL, label: "Status", emoji: "🟢" },
            { url: SUPPORT_URL, label: "Support-Server", emoji: "💬" },
        ],
    };
}

/* ----------------------------------------------------------
   Bereich (Entwurf C)
   ---------------------------------------------------------- */
export function HelpAreaPage(area: HelpAreaId, entries: IHelpEntry[], context: IHelpContext, page = 0): IHelpPage {
    const inArea = entries.filter((entry) => AreaOf(entry) === area);
    const commands = inArea.flatMap((entry) => entry.commands);
    // Ist ein Modul aus, sagt das der erste seiner Befehle - nicht jeder einzelne.
    const noted = new Set<string>();
    const groups = commands.map((command): HelpBlock[] => {
        const module = command.text.module ?? "";
        const off = noted.has(module) ? "" : OffNote(command.text.module, context);

        if (off) noted.add(module);

        return [{ kind: "command", emoji: command.text.emoji, display: command.display, who: WHO_LABELS[command.text.who], text: FirstSentence(command.text.what), fields: FieldLine(command), ...(off ? { off } : {}) }];
    });
    const pages = Paginate(groups);
    const current = Clamp(page, pages.length);
    const before = pages.slice(0, current).reduce((sum, list) => sum + list.length, 0);
    const shown = commands.slice(before, before + pages[current].length);
    const module = inArea.map((entry) => entry.group?.module ?? entry.commands[0].text.module).find((id) => id !== null) ?? null;

    return {
        banner: false,
        accent: Accent(area),
        blocks: [{ kind: "title", emoji: Area(area).emoji, text: Area(area).name, sub: `${Count(commands.length)} · alle, Team oder Verwalter zeigt, wer darf` }, ...pages[current]],
        select: shown.length
            ? {
                  customId: `${HELP_PREFIX}befehl`,
                  placeholder: "Befehl erklären …",
                  options: shown.slice(0, MAX_OPTIONS).map((command) => ({ label: Cut(command.display, 100), value: command.key, emoji: command.text.emoji, description: Cut(FirstSentence(command.text.what), 100) })),
              }
            : undefined,
        buttons: [
            { customId: `${HELP_PREFIX}start`, label: "◀ Übersicht" },
            ...PageButtons((target) => `${HELP_PREFIX}a:${area}:${target}`, current, pages.length),
            { url: Dashboard(context, module), label: "Im Dashboard", emoji: "🖥️" },
        ],
    };
}

/* ----------------------------------------------------------
   Befehl (Entwurf A) und Gruppe (Entwurf K)
   ---------------------------------------------------------- */
function CommandGroups(command: IHelpCommand): HelpBlock[][] {
    const { text } = command;
    const groups: HelpBlock[][] = [[{ kind: "heading", text: "Was er macht" }, { kind: "text", text: text.what }]];

    if (command.menu) groups.push([{ kind: "heading", text: "So nutzt du ihn" }, { kind: "text", text: `Rechtsklick auf die Person, dann Apps › ${command.display.split(" › ").pop()}.` }]);

    text.examples.forEach((example, index) => {
        groups.push([...(index === 0 ? [{ kind: "heading", text: "So nutzt du ihn" } as HelpBlock] : []), { kind: "code", code: example.code, note: example.text }]);
    });

    groups.push(
        command.fields.length
            ? [
                  { kind: "heading", text: "Felder" },
                  { kind: "fields", rows: command.fields.map((field) => ({ name: field.name, required: field.required, text: `${field.text}${field.choices.length ? ` Auswahl: ${field.choices.join(", ")}.` : ""}` })) },
                  ...(command.fields.some((field) => field.required) ? [{ kind: "text", text: "Felder mit **Stern** sind Pflicht." } as HelpBlock] : []),
              ]
            : [{ kind: "heading", text: "Felder" }, { kind: "text", text: "Keine, einfach abschicken." }]
    );

    if (text.after.length) groups.push([{ kind: "heading", text: "Was danach passiert" }, { kind: "list", items: text.after }]);
    if (text.tip) groups.push([{ kind: "tip", text: text.tip }]);

    return groups;
}

function GroupGroups(entry: IHelpEntry): HelpBlock[][] {
    const group = entry.group!;
    const groups: HelpBlock[][] = [[{ kind: "heading", text: "Was er macht" }, { kind: "text", text: group.what }]];

    entry.commands.forEach((command, index) => {
        groups.push([
            {
                kind: "chapter",
                n: index + 1,
                ...(command.text.when ? { when: command.text.when } : {}),
                display: command.display,
                who: WHO_LABELS[command.text.who],
                text: command.text.what,
                ...(command.text.examples[0] ? { code: command.text.examples[0].code } : {}),
                fields: FieldLine(command),
            },
        ]);
    });

    if (group.tip) groups.push([{ kind: "tip", text: group.tip }]);

    return groups;
}

export function HelpCommandPage(entry: IHelpEntry, key: string | null, page: number, context: IHelpContext): IHelpPage {
    const command = key === null ? (entry.group ? null : entry.commands[0]) : (entry.commands.find((candidate) => candidate.key === key) ?? null);
    const area = AreaOf(entry);
    const text: IHelpText | null = command?.text ?? null;
    const module = text?.module ?? entry.group?.module ?? null;
    const sub = command && entry.group ? command.key.slice(entry.name.length + 1) : "-";
    const pages = Paginate(command ? CommandGroups(command) : GroupGroups(entry));
    const current = Clamp(page, pages.length);
    const off = OffNote(module, context);
    const title: HelpBlock = {
        kind: "title",
        emoji: text?.emoji ?? entry.group?.emoji ?? "❔",
        text: command ? command.display : `/${entry.name}`,
        sub: text ? `${Area(area).name} · ${text.whoText}` : `${Area(area).name} · ${entry.commands.length} Unterbefehle`,
        ...(off ? { note: off } : {}),
    };
    const back: ButtonOptions = command && entry.group ? { customId: `${HELP_PREFIX}seite:${entry.name}:-:0`, label: `◀ /${entry.name}` } : { customId: `${HELP_PREFIX}a:${area}`, label: `◀ ${Area(area).name}` };

    return {
        banner: false,
        accent: Accent(area),
        blocks: [title, ...pages[current]],
        select:
            !command && entry.commands.length
                ? {
                      customId: `${HELP_PREFIX}befehl`,
                      placeholder: "Unterbefehl ganz erklären …",
                      options: entry.commands.slice(0, MAX_OPTIONS).map((item) => ({ label: Cut(item.display, 100), value: item.key, emoji: item.text.emoji, description: item.text.when ? Cut(item.text.when, 100) : undefined })),
                  }
                : undefined,
        buttons: [
            back,
            ...PageButtons((target) => `${HELP_PREFIX}seite:${entry.name}:${sub}:${target}`, current, pages.length),
            ...(module ? [{ url: Dashboard(context, module), label: "Im Dashboard", emoji: "🖥️" }] : []),
            { url: `${context.docs}#${DOC_ANCHORS[area]}`, label: "Doku", emoji: "📖" },
        ],
    };
}

/* ----------------------------------------------------------
   Zusammensetzen
   ---------------------------------------------------------- */
/** Die Nachricht: je Bild eine Galerie mit Beschreibung, darunter Menü und Knöpfe. */
export function PageContainer(page: IHelpPage, images: { name: string; alt: string }[]): ContainerBuilder {
    const builder = new ComponentV2Builder({ accentColor: page.accent });

    for (const image of images) builder.image(`attachment://${image.name}`, image.alt);

    if (page.select) builder.select(page.select);
    if (page.buttons.length) builder.buttons(...page.buttons);

    return builder.build();
}

/** Zeichnet die Seite und baut die Nachricht. banner: das fertige Banner, null ohne. */
export async function ComposeHelp(page: IHelpPage, banner: Buffer | null): Promise<IHelpMessage> {
    const withBanner = page.banner && banner !== null;
    const blocks = page.banner && !withBanner && page.fallback ? [page.fallback, ...page.blocks] : page.blocks;
    const rendered = (await RenderHelpImages(blocks)).slice(0, MAX_FILES - (withBanner ? 1 : 0));
    const images = [
        ...(withBanner ? [{ name: BANNER_FILE, alt: "RL Nexus Hilfe", png: banner! }] : []),
        ...rendered.map((image, index) => ({ name: `hilfe-${index + 1}.png`, alt: image.alt, png: image.png })),
    ];

    return {
        components: [PageContainer(page, images)],
        files: images.map((image) => new AttachmentBuilder(image.png, { name: image.name })),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}
