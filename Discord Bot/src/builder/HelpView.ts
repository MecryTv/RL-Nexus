import { ContainerBuilder, MessageFlags } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { ButtonOptions, ISelectEntryOptions } from "../interfaces/builder/IComponentV2Builder";
import { HELP_ACCENT, HELP_AREAS, HELP_PREFIX, HelpAreaId, IHelpText, STATUS_URL, SUPPORT_URL, WHO_LABELS } from "../constants/Help";
import { IsModule } from "../constants/Modules";
import { IHelpCommand, IHelpEntry } from "../services/help/HelpModel";

/**
 * Die Seiten von /hilfe (W-0014, Plan 45): Start B, Bereich C, Befehl A und
 * Gruppe K aus den Entwürfen. Rein: alles, was sie brauchen, kommt herein.
 * Lange Seiten werden geteilt statt gekürzt - der Builder schnitte sonst bei
 * 4000 Zeichen still mit „…“ ab.
 */

export interface IHelpContext {
    guildId: string;
    /** Basis des Dashboards, etwa https://dashboard.nexus-emb.de/dashboard. */
    dashboard: string;
    /** Adresse der Hilfeseite (docu.html). */
    docs: string;
    /** Die Module, die auf dem Server an sind. */
    enabled: ReadonlySet<string>;
}

export interface IHelpStart {
    name: string;
    /** Dateiname des angehängten Banners, null ohne Bild. */
    banner: string | null;
    modules: { on: number; all: number };
    commands: number;
    access: { value: string; sub: string };
    version: string;
}

export type IHelpPayload = { components: ContainerBuilder[]; flags: number; allowedMentions: { parse: [] } };

/** Platz für den Inhalt einer Seite, der Rest ist Kopf und Knöpfe. */
const PAGE_CHARS = 3200;
const MAX_OPTIONS = 25;
const MODERATION_ACCENT = 0xf0b232;

/** Abschnitt der Hilfeseite je Bereich (Anker in docu.html). */
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

function Payload(builder: ComponentV2Builder): IHelpPayload {
    return { components: [builder.build()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function FirstSentence(text: string): string {
    const end = text.search(/[.!?](\s|$)/);

    return end === -1 ? text : text.slice(0, end + 1);
}

function Cut(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Blöcke auf Seiten verteilen, keiner wird zerschnitten. */
function Paginate(blocks: string[]): string[][] {
    const pages: string[][] = [[]];
    let size = 0;

    for (const block of blocks) {
        const current = pages[pages.length - 1];

        if (current.length > 0 && size + block.length > PAGE_CHARS) {
            pages.push([]);
            size = 0;
        }

        pages[pages.length - 1].push(block);
        size += block.length + 2;
    }

    return pages;
}

function Clamp(page: number, pages: number): number {
    return Math.min(Math.max(Math.floor(page) || 0, 0), pages - 1);
}

/** Abgeschaltetes Modul: Hinweis, wie man es einschaltet. Leer, wenn es an ist oder kein Modul ist. */
function OffNote(module: string | null, context: IHelpContext): string {
    return module && IsModule(module) && !context.enabled.has(module) ? `⚠️ Modul aus, einschalten mit \`/module an modul:${module}\` oder im Dashboard` : "";
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

/* ----------------------------------------------------------
   Start (Entwurf B)
   ---------------------------------------------------------- */
function AreaCounts(entries: IHelpEntry[]): { id: HelpAreaId; count: number }[] {
    return HELP_AREAS.map((area) => ({
        id: area.id,
        count: entries.filter((entry) => AreaOf(entry) === area.id).reduce((sum, entry) => sum + entry.commands.length, 0),
    })).filter((area) => area.count > 0);
}

export function AreaOf(entry: IHelpEntry): HelpAreaId {
    return entry.group?.area ?? entry.commands[0].text.area;
}

export function HelpStartView(start: IHelpStart, entries: IHelpEntry[], context: IHelpContext): IHelpPayload {
    const builder = new ComponentV2Builder({ accentColor: HELP_ACCENT });

    if (start.banner) builder.gallery(`attachment://${start.banner}`);
    else builder.text(`# RL NEXUS\nWillkommen, ${start.name}`);

    builder.list([
        `📦 **${start.modules.on}/${start.modules.all}** Module an`,
        `🧭 **${start.commands}** Befehle`,
        `🔑 **${start.access.value}** Zugang · ${start.access.sub}`,
        `🏷️ **${start.version}** Version`,
    ]);
    builder.separator();
    builder.text(
        [
            "### ⚡ In drei Schritten startklar",
            "1. `/module` schaltet ein, was dein Server braucht",
            "2. Einstellen per Befehl oder im Dashboard mit Vorschau",
            "3. Fragen? `/hilfe befehl:` erklärt jeden Befehl",
        ].join("\n")
    );
    builder.separator();

    const areas = AreaCounts(entries);

    builder.text(["### 📚 Bereiche", ...areas.map(({ id, count }) => `${Area(id).emoji} **${Area(id).name}** · ${count} ${count === 1 ? "Befehl" : "Befehle"}`)].join("\n"));

    if (areas.length) {
        builder.select({
            customId: `${HELP_PREFIX}bereich`,
            placeholder: "Bereich öffnen …",
            options: areas.slice(0, MAX_OPTIONS).map(({ id, count }) => ({ label: Area(id).name, value: id, emoji: Area(id).emoji, description: `${count} ${count === 1 ? "Befehl" : "Befehle"}` })),
        });
    }

    builder.buttons(
        { url: Dashboard(context, null), label: "Dashboard", emoji: "🖥️" },
        { url: context.docs, label: "Doku", emoji: "📖" },
        { url: STATUS_URL, label: "Status", emoji: "🟢" },
        { url: SUPPORT_URL, label: "Support-Server", emoji: "💬" }
    );

    return Payload(builder);
}

/* ----------------------------------------------------------
   Bereich (Entwurf C)
   ---------------------------------------------------------- */
export function HelpAreaView(area: HelpAreaId, entries: IHelpEntry[], context: IHelpContext, page = 0): IHelpPayload {
    const inArea = entries.filter((entry) => AreaOf(entry) === area);
    const commands = inArea.flatMap((entry) => entry.commands);
    // Ist ein Modul aus, sagt das der erste seiner Befehle - nicht jeder einzelne.
    const noted = new Set<string>();
    const blocks = commands.map((command) => {
        const module = command.text.module ?? "";
        const off = noted.has(module) ? "" : OffNote(command.text.module, context);

        if (off) noted.add(module);

        return [`**${command.display}** \`${WHO_LABELS[command.text.who]}\``, FirstSentence(command.text.what), ...(off ? [off] : []), `-# ${FieldLine(command)}`].join("\n");
    });
    const pages = Paginate(blocks);
    const current = Clamp(page, pages.length);
    // Je Seite nur die Befehle, die darauf stehen - Discord nimmt höchstens 25 im Menü.
    const before = pages.slice(0, current).reduce((sum, list) => sum + list.length, 0);
    const shown = commands.slice(before, before + pages[current].length);
    const builder = new ComponentV2Builder({ accentColor: Accent(area) });

    builder.text(`# ${Area(area).emoji} ${Area(area).name}\n-# ${commands.length} ${commands.length === 1 ? "Befehl" : "Befehle"} · \`alle\` \`Team\` \`Verwalter\` zeigt, wer darf`);
    builder.separator();
    builder.text(pages[current].join("\n\n") || "Hier gibt es keine Befehle.");

    if (shown.length) {
        builder.select({
            customId: `${HELP_PREFIX}befehl`,
            placeholder: "Befehl erklären …",
            options: shown.slice(0, MAX_OPTIONS).map((command): ISelectEntryOptions => ({ label: Cut(command.display, 100), value: command.key, emoji: command.text.emoji, description: Cut(FirstSentence(command.text.what), 100) })),
        });
    }

    const module = inArea.map((entry) => entry.group?.module ?? entry.commands[0].text.module).find((id) => id !== null) ?? null;

    builder.buttons(
        { customId: `${HELP_PREFIX}start`, label: "◀ Übersicht" },
        ...PageButtons((target) => `${HELP_PREFIX}a:${area}:${target}`, current, pages.length),
        { url: Dashboard(context, module), label: "Im Dashboard", emoji: "🖥️" }
    );

    return Payload(builder);
}

/* ----------------------------------------------------------
   Befehl (Entwurf A) und Gruppe (Entwurf K)
   ---------------------------------------------------------- */
function CommandBlocks(command: IHelpCommand): string[] {
    const { text } = command;
    const blocks = [`### Was er macht\n${text.what}`];

    if (command.menu) blocks.push(`### So nutzt du ihn\nRechtsklick auf die Person, dann Apps › ${command.display.split(" › ").pop()}.`);

    text.examples.forEach((example, index) => {
        blocks.push(`${index === 0 ? "### So nutzt du ihn\n" : ""}\`\`\`\n${example.code}\n\`\`\`\n-# ${example.text}`);
    });

    const fields = command.fields.map((field) => `- \`${field.name}${field.required ? "*" : ""}\` ${field.text}${field.choices.length ? ` Auswahl: ${field.choices.join(", ")}.` : ""}`);

    blocks.push(`### Felder\n${fields.length ? `${fields.join("\n")}${command.fields.some((field) => field.required) ? "\n-# Felder mit Stern sind Pflicht" : ""}` : "Keine, einfach abschicken."}`);

    if (text.after.length) blocks.push(`### Was danach passiert\n${text.after.map((line) => `- ${line}`).join("\n")}`);
    if (text.tip) blocks.push(`> **Tipp:** ${text.tip}`);

    return blocks;
}

function GroupBlocks(entry: IHelpEntry): string[] {
    const group = entry.group!;
    const blocks = [`### Was er macht\n${group.what}`];

    entry.commands.forEach((command, index) => {
        const example = command.text.examples[0];

        blocks.push(
            [
                `**${index + 1}**${command.text.when ? ` · *${command.text.when}*` : ""}`,
                `**${command.display}** \`${WHO_LABELS[command.text.who]}\``,
                command.text.what,
                ...(example ? [`\`\`\`\n${example.code}\n\`\`\``] : []),
                `-# Felder: ${FieldLine(command)}`,
            ].join("\n")
        );
    });

    if (group.tip) blocks.push(`> **Tipp:** ${group.tip}`);

    return blocks;
}

export function HelpCommandView(entry: IHelpEntry, key: string | null, page: number, context: IHelpContext): IHelpPayload {
    const command = key === null ? (entry.group ? null : entry.commands[0]) : (entry.commands.find((candidate) => candidate.key === key) ?? null);
    const area = AreaOf(entry);
    const text: IHelpText | null = command?.text ?? null;
    const emoji = text?.emoji ?? entry.group?.emoji ?? "❔";
    const title = command ? command.display : `/${entry.name}`;
    const module = text?.module ?? entry.group?.module ?? null;
    const sub = command && entry.group ? command.key.slice(entry.name.length + 1) : "-";
    const blocks = command ? CommandBlocks(command) : GroupBlocks(entry);
    const pages = Paginate(blocks);
    const current = Clamp(page, pages.length);
    const off = OffNote(module, context);
    const builder = new ComponentV2Builder({ accentColor: Accent(area) });
    const sub2 = text ? `${Area(area).name} · ${text.whoText}` : `${Area(area).name} · ${entry.commands.length} Unterbefehle`;

    builder.text(`# ${emoji} ${title}\n-# ${sub2}${off ? `\n${off}` : ""}`);
    builder.separator();
    builder.text(pages[current].join("\n\n"));

    if (!command && entry.commands.length) {
        builder.select({
            customId: `${HELP_PREFIX}befehl`,
            placeholder: "Unterbefehl ganz erklären …",
            options: entry.commands.slice(0, MAX_OPTIONS).map((item) => ({ label: Cut(item.display, 100), value: item.key, emoji: item.text.emoji, description: item.text.when ? Cut(item.text.when, 100) : undefined })),
        });
    }

    const back: ButtonOptions = command && entry.group ? { customId: `${HELP_PREFIX}seite:${entry.name}:-:0`, label: `◀ /${entry.name}` } : { customId: `${HELP_PREFIX}a:${area}`, label: `◀ ${Area(area).name}` };

    builder.buttons(
        back,
        ...PageButtons((target) => `${HELP_PREFIX}seite:${entry.name}:${sub}:${target}`, current, pages.length),
        ...(module ? [{ url: Dashboard(context, module), label: "Im Dashboard", emoji: "🖥️" }] : []),
        { url: `${context.docs}#${DOC_ANCHORS[area]}`, label: "Doku", emoji: "📖" }
    );

    return Payload(builder);
}
