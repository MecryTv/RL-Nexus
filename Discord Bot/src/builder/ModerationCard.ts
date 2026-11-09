import path from "path";
import { AttachmentBuilder, ContainerBuilder, escapeMarkdown } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { HelpBlock, RenderHelpImages } from "./HelpImage";
import { CaseAccent, CaseFooter, ExtraFacts } from "./ModerationView";
import { ACTION_INFO, CaseRef, FormatDuration } from "../constants/Moderation";
import { IModCase, IModEvidence } from "../interfaces/services/moderation/IModeration";
import { Cut } from "../utils/cut";

/**
 * Die Log-Karte als Akte und die Beweis-Ansicht (W-0014, Entwürfe 1B und 2B):
 * gezeichnet wie /hilfe, darunter Discords eigene Knöpfe. Die Fallnummer steckt
 * in den IDs (mf:…), so gehen die Knöpfe auch nach einem Neustart.
 */

/** Was die Karte braucht und der Fall nicht selbst weiß - der Dienst sammelt es ein. */
export interface ICaseExtra {
    link: string | null;
    /** Strafen des Users in den 30 Tagen bis zu diesem Fall, er selbst eingeschlossen. null: nicht zählen. */
    recent: number | null;
    avatar?: Buffer | null;
    /** Vorschauen der Bild-Beweise, nach Beweis-ID. */
    thumbs?: Map<number, Buffer>;
}

export interface ICaseMessage {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
}

export type CaseStep = "ev" | "fall" | "notiz";

/** mf:ev:<nr>[:<index>], mf:fall:<nr>, mf:notiz:<nr> - Knöpfe, Menü und Fenster. */
export function ReadCaseId(customId: string): { kind: CaseStep; number: number; index: number | null } | null {
    const match = /^mf:(ev|fall|notiz):(\d{1,9})(?::(\d{1,3}))?$/.exec(customId);

    return match ? { kind: match[1] as CaseStep, number: Number(match[2]), index: match[3] === undefined ? null : Number(match[3]) } : null;
}

const WHEN = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** 01.11. 14:20 - im Bild gibt es keine Discord-Zeitstempel. */
function When(ms: number): string {
    return WHEN.format(ms).replace(", ", " ");
}

const KIND: Record<IModEvidence["kind"], { icon: string; label: string }> = {
    image: { icon: "📷", label: "Bild" },
    link: { icon: "🔗", label: "Link" },
    message: { icon: "💬", label: "Nachricht" },
};

/** Der Titel eines Beweises in einer Zeile: Dateiname, Link ohne https:// oder die Nachricht als Zitat. */
function Title(item: IModEvidence): string {
    if (item.kind === "message" && item.message) return `„${item.message.content.replace(/\s+/g, " ").trim() || "Ohne Text"}“`;
    if (item.kind === "link") return item.name ?? item.value.replace(/^https:\/\//, "");

    return item.name ?? item.value;
}

function Row(item: IModEvidence, thumb?: Buffer): Extract<HelpBlock, { kind: "evidence" }>["items"][number] {
    if (item.kind === "message" && item.message) {
        return { icon: KIND.message.icon, title: Title(item), sub: `#${item.message.channelName} · ${item.message.authorName} · ${When(item.message.sentAt)}`, quote: true };
    }

    return { icon: KIND[item.kind].icon, ...(thumb ? { thumb } : {}), title: Title(item), sub: `${item.byName} · ${When(item.at)}` };
}

/** Die gezeichneten Teile der Log-Karte: Kopf und höchstens drei Beweise. */
export function CaseBlocks(entry: IModCase, extra: ICaseExtra): HelpBlock[] {
    const info = ACTION_INFO[entry.action];
    const length = entry.duration ? ` · ${FormatDuration(entry.duration)}` : entry.action === "ban" ? " · dauerhaft" : "";
    const sub = entry.action === "purge" ? `${entry.details.deleted ?? 0} Nachrichten gelöscht` : extra.recent ? `${extra.recent}. Fall in 30 Tagen` : "";
    const blocks: HelpBlock[] = [
        {
            kind: "caseHead",
            emoji: info.emoji,
            title: `Fall ${CaseRef(entry.number)} · ${info.label}${length}`,
            ...(entry.targetId ? { user: `@${entry.targetName ?? entry.targetId}` } : {}),
            sub,
            by: `von ${entry.moderatorName} · ${entry.reason ? `Grund: ${entry.reason}` : "ohne Grund"}`,
            ...(extra.avatar ? { avatar: extra.avatar } : {}),
        },
    ];
    const shown = entry.evidence.slice(0, 3);

    if (shown.length) blocks.push({ kind: "evidence", items: shown.map((item) => Row(item, extra.thumbs?.get(item.id))) });

    return blocks;
}

/** Die Karte im Log-Kanal (1B). Was das Bild nicht zeigt (Stufe, Bezug, Status), steht als Text darunter. */
export async function CaseCard(entry: IModCase, extra: ICaseExtra): Promise<ICaseMessage> {
    const images = await RenderHelpImages(CaseBlocks(entry, extra));
    const name = (index: number) => `fall-${entry.number}-${index + 1}.png`;
    const builder = new ComponentV2Builder({ accentColor: CaseAccent(entry) });

    images.forEach((image, index) => builder.image(`attachment://${name(index)}`, image.alt));

    const facts = ExtraFacts(entry);
    // Die Erwähnung hält den User per Discord-Suche auffindbar - gepingt wird niemand (allowedMentions).
    const footer = [entry.targetId ? `<@${entry.targetId}>` : "", CaseFooter(entry)].filter(Boolean).join(" · ");

    if (facts.length) builder.text(facts.join("\n"));
    if (footer) builder.subtext(footer);

    builder.buttons(
        ...(entry.evidence.length ? [{ customId: `mf:ev:${entry.number}:0`, label: `Alle ${entry.evidence.length} ansehen`, emoji: "📎" }] : []),
        { customId: `mf:fall:${entry.number}`, label: "Fall", emoji: "📁" },
        { customId: `mf:notiz:${entry.number}`, label: "Notiz", emoji: "📝" },
        ...(extra.link ? [{ url: extra.link, label: "Im Dashboard", emoji: "🛡️" }] : [])
    );

    return { components: [builder.build()], files: images.map((image, index) => new AttachmentBuilder(image.png, { name: name(index) })) };
}

/**
 * Ein Beweis groß, nur für den, der klickt (2B): Kopf als Bild, darunter der
 * Beweis, ein Menü mit allen, ◀ ▶ und „Original öffnen“. file: das gespeicherte
 * Bild, wenn der Beweis eins ist.
 */
export async function EvidenceView(entry: IModCase, index: number, extra: { link: string | null; file?: Buffer | null }): Promise<ICaseMessage> {
    const total = entry.evidence.length;
    const builder = new ComponentV2Builder({ accentColor: CaseAccent(entry) });

    if (!total) return { components: [builder.text(`Fall ${CaseRef(entry.number)} hat keine Beweise mehr.`).build()], files: [] };

    const at = Math.min(Math.max(0, index), total - 1);
    const item = entry.evidence[at];
    const way = item.kind === "message" && item.message ? `Nachricht aus #${item.message.channelName}` : KIND[item.kind].label;
    const [head] = await RenderHelpImages([{ kind: "caseHead", emoji: "📁", title: `Fall ${CaseRef(entry.number)} · Beweis ${at + 1} von ${total}`, sub: `${item.byName} · ${When(item.at)} · ${way}` }]);
    const files = [new AttachmentBuilder(head.png, { name: `beweis-${entry.number}.png` })];

    builder.image(`attachment://beweis-${entry.number}.png`, head.alt);

    if (item.kind === "image" && extra.file) {
        const name = `beweis-${entry.number}-${item.id}${path.extname(item.value)}`;

        files.push(new AttachmentBuilder(extra.file, { name }));
        builder.image(`attachment://${name}`, item.name ?? "Beweis");
    } else if (item.kind === "image") {
        builder.text("Das Bild ist nicht mehr da.");
    } else if (item.kind === "message" && item.message) {
        const quote = item.message.content.trim()
            ? escapeMarkdown(Cut(item.message.content, 1_500))
                  .split("\n")
                  .map((line) => `> ${line}`)
                  .join("\n")
            : "-# Ohne Text.";

        builder.text(quote).subtext(`von **${escapeMarkdown(item.message.authorName)}** in <#${item.message.channelId}> · <t:${Math.floor(item.message.sentAt / 1000)}:f>`);
    } else {
        builder.text(`🔗 ${item.value}`);
    }

    builder.select({
        customId: `mf:ev:${entry.number}`,
        placeholder: "Beweis wählen",
        options: entry.evidence.slice(0, 25).map((candidate, position) => ({
            label: Cut(Title(candidate), 100),
            value: String(position),
            emoji: KIND[candidate.kind].icon,
            description: Cut(`${candidate.byName} · ${When(candidate.at)}`, 100),
            default: position === at,
        })),
    });

    const original = item.kind === "image" ? extra.link : item.value;

    builder.buttons(
        { customId: `mf:ev:${entry.number}:${at - 1}`, label: "◀", disabled: at === 0 },
        { customId: `mf:ev:${entry.number}:${at + 1}`, label: "▶", disabled: at === total - 1 },
        ...(original ? [{ url: original, label: "Original öffnen" }] : [])
    );

    return { components: [builder.build()], files };
}
