import { GROUP_LABELS, type Group } from "../../shared/limits.ts";
import {
    ENTRY_LIMITS,
    EXTRA_SECTIONS_FOR,
    REPEATABLE,
    SECTIONS_FOR,
    type EntryKind,
    type IEntry,
    type IEntryInput,
    type IEntryLinks,
    type ISection,
    type ISectionItem,
    type PartnerType,
    type SectionType,
    type SponsorTier,
    type SupporterType,
} from "../../shared/partners.ts";
import { moveTo } from "../editor/list.ts";
import { todayBerlin } from "../studio/time.ts";

/**
 * W-0062 Teil 2: Entwürfe im Partner-Studio, ohne React. Neue Einträge,
 * Wechsel der Art, Vorlagen, Aktionen an Abschnitten und der Satz, der vor
 * Folgen für Gruppe und @Partner bestätigt wird.
 */

export type Template = "organisation" | "creator" | "liga" | "community" | "firma" | "person";

export interface INewEntryOptions {
    readonly partnerType?: PartnerType;
    readonly tier?: SponsorTier;
    readonly supporterType?: SupporterType;
    readonly contactId?: string | null;
    readonly access?: "free" | "paid" | null;
    readonly visible?: boolean;
    readonly links?: IEntryLinks;
    readonly logo?: string | null;
    readonly tournamentIds?: readonly number[];
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

const defaultSections = (kind: EntryKind): ISection[] => SECTIONS_FOR[kind].map((type) => ({ type, visible: true }));

const shortTextOf = (kind: EntryKind, name: string): string =>
    kind === "partner" ? `${name} ist Partner von RL Nexus.` : kind === "sponsor" ? `${name} unterstützt RL Nexus als Sponsor.` : `${name} unterstützt RL Nexus.`;

/**
 * Ein neuer Eintrag aus den Dialogen. Unsichtbar, bis „Auf der Seite zeigen“
 * an ist; die Texte sind neutral und werden im Studio ersetzt.
 */
export function newEntry(kind: EntryKind, name: string, options: INewEntryOptions = {}): IEntryInput {
    const clean = name.trim();
    const text = shortTextOf(kind, clean);
    const contactId = kind === "supporter" ? null : (options.contactId ?? null);

    return {
        kind,
        name: clean,
        partnerType: kind === "partner" ? (options.partnerType ?? "organisation") : null,
        tier: kind === "sponsor" ? (options.tier ?? "sponsor") : null,
        supporterType: kind === "supporter" ? (options.supporterType ?? "firma") : null,
        subtitle: "",
        shortText: clip(text, ENTRY_LIMITS.shortText),
        stripText: kind === "supporter" ? clip(text, ENTRY_LIMITS.stripText) : null,
        color: "blue",
        logo: options.logo ?? null,
        banner: null,
        since: todayBerlin(),
        endsOn: null,
        hideAfterEnd: false,
        links: options.links ?? {},
        sections: defaultSections(kind),
        contactId,
        access: contactId ? (options.access ?? "free") : null,
        guildId: null,
        showTeams: false,
        visible: options.visible ?? false,
        onHome: false,
        tournamentIds: [...(options.tournamentIds ?? [])],
    };
}

/** Andere Art: Name, Logo, Banner, Farbe, Texte und Abschnitte gleicher Art bleiben. */
export function switchKind(input: IEntryInput, kind: EntryKind): IEntryInput {
    if (input.kind === kind) return input;

    const allowed = new Set<SectionType>([...SECTIONS_FOR[kind], ...EXTRA_SECTIONS_FOR[kind]]);
    const kept = input.sections.filter((section) => allowed.has(section.type));
    const missing = SECTIONS_FOR[kind].filter((type) => !kept.some((section) => section.type === type)).map((type): ISection => ({ type, visible: true }));
    const supporter = kind === "supporter";

    return {
        ...input,
        kind,
        partnerType: kind === "partner" ? (input.partnerType ?? "organisation") : null,
        tier: kind === "sponsor" ? (input.tier ?? "sponsor") : null,
        supporterType: supporter ? (input.supporterType ?? "firma") : null,
        stripText: supporter ? (input.stripText ?? clip(input.shortText, ENTRY_LIMITS.stripText)) : null,
        endsOn: supporter ? input.endsOn : null,
        hideAfterEnd: supporter && input.hideAfterEnd,
        sections: [...kept, ...missing],
        contactId: supporter ? null : input.contactId,
        access: supporter ? null : input.access,
        guildId: supporter ? null : input.guildId,
        showTeams: kind === "partner" && input.showTeams,
    };
}

/* --- Vorlagen ------------------------------------------------------------- */

const items = (...labels: readonly (readonly [string, string?])[]): ISectionItem[] => labels.map(([label, value]) => (value === undefined ? { label } : { label, value }));

/** Beispieltexte stehen in eckigen Klammern, damit sie im Studio auffallen. */
function templateOf(kind: EntryKind, template: Template): ISection[] {
    const today = todayBerlin();

    if (kind === "supporter") {
        return [
            { type: "intro", visible: true, text: template === "creator" ? "[Was du machst und wo man dich findet]" : "[Wer ihr seid, in zwei Sätzen]" },
            { type: "stats", visible: true },
            { type: "help", visible: true, items: items([template === "community" ? "[Was eure Community beiträgt]" : "[Wie ihr RL Nexus helft]"]) },
            { type: "tournaments", visible: true },
            { type: "offer", visible: false },
            { type: "links", visible: true },
        ];
    }

    if (kind === "sponsor") {
        return [
            { type: "stats", visible: true, items: items(["Sponsor seit", "[Monat Jahr]"], ["Stufe", "Sponsor"], ["Turniere", "[Anzahl]"], ["Branche", "[Branche]"]) },
            { type: "about", visible: true, text: "[Was die Firma macht, in zwei Sätzen]" },
            { type: "together", visible: true, items: [{ label: "[Was ihr beitragt]", text: "[Ein Satz dazu]" }, { label: "[Noch etwas]", text: "[Ein Satz dazu]" }] },
            { type: "offer", visible: true, title: "Angebot für die Community", text: "[Was es gibt]", code: "[CODE]" },
            { type: "facts", visible: true, items: items(["Branche", "[Branche]"], ["Sitz", "[Stadt]"]) },
            { type: "news", visible: true },
        ];
    }

    const stats: Readonly<Record<Exclude<Template, "firma" | "person">, ISectionItem[]>> = {
        organisation: items(["Teams", "[Anzahl]"], ["Mitglieder", "[Anzahl]"], ["Gegründet", "[Jahr]"], ["Bester Rang", "[Rang]"]),
        creator: items(["Follower", "[Anzahl]"], ["Streams", "[pro Woche]"], ["Rang", "[Rang]"], ["Seit", "[Jahr]"]),
        liga: items(["Divisionen", "[Anzahl]"], ["Teams", "[Anzahl]"], ["Saison", "[Nummer]"], ["Format", "[3v3]"]),
        community: items(["Mitglieder", "[Anzahl]"], ["Seit", "[Jahr]"], ["Events", "[pro Monat]"], ["Sprache", "[Deutsch]"]),
    };
    const key = template === "firma" || template === "person" ? "organisation" : template;
    const sections: ISection[] = [
        { type: "stats", visible: true, items: stats[key] },
        { type: "about", visible: true, text: template === "creator" ? "[Was du streamst und für wen]" : "[Wer ihr seid, in zwei Sätzen]" },
    ];

    if (key === "organisation") sections.push({ type: "teams", visible: true });
    if (key === "organisation" || key === "liga") sections.push({ type: "achievements", visible: true, items: [{ label: "[Erfolg]", date: today }] });

    sections.push(
        { type: "discord", visible: true, text: "[Was auf eurem Server passiert]" },
        { type: "facts", visible: true, items: key === "creator" ? items(["Plattform", "[Twitch]"], ["Inhalte", "[Ranked, Coaching]"]) : items(["Region", "[EU · Deutschland]"], ["Spielmodi", "[3v3, 2v2]"]) },
        { type: "modules", visible: true },
        { type: "news", visible: true }
    );

    return sections;
}

/** Abschnitte einer Vorlage. Was die Art nicht kennt, fällt weg. */
export function templateSections(kind: EntryKind, template: Template): ISection[] {
    const allowed = new Set<SectionType>([...SECTIONS_FOR[kind], ...EXTRA_SECTIONS_FOR[kind]]);

    return templateOf(kind, template).filter((section) => allowed.has(section.type));
}

/* --- Aktionen an Abschnitten --------------------------------------------- */

/** Aus der kleinen Leiste der Bühne: hoch, runter, aus. Ein Index außerhalb der Liste ändert nichts. */
export function sectionAction(sections: readonly ISection[], index: number, action: "hoch" | "runter" | "aus"): ISection[] {
    if (!Number.isInteger(index) || index < 0 || index >= sections.length) return [...sections];

    if (action === "aus") return sections.map((section, at) => (at === index ? { ...section, visible: !section.visible } : section));

    const target = action === "hoch" ? index - 1 : index + 1;

    return target < 0 || target >= sections.length ? [...sections] : moveTo([...sections], index, target);
}

/** „Dazunehmen“: nur die Zusatz-Abschnitte der Art; Galerie, Video, Zitat und freier Text auch mehrmals. */
export function addSection(sections: readonly ISection[], kind: EntryKind, type: SectionType): ISection[] {
    if (!EXTRA_SECTIONS_FOR[kind].includes(type) || sections.length >= ENTRY_LIMITS.sections) return [...sections];
    if (!REPEATABLE.has(type) && sections.some((section) => section.type === type)) return [...sections];

    return [...sections, { type, visible: true }];
}

/* --- Folgen für Gruppe und Rolle ----------------------------------------- */

const OTHER = "sofern er nicht noch Ansprechpartner eines anderen Eintrags ist";

/**
 * Der Satz, den das Studio vor dem Speichern bzw. Löschen bestätigen lässt.
 * `group` ist die Gruppe des bisherigen Ansprechpartners. null: Es passiert nichts.
 */
export function roleNotice(before: IEntry | null, after: IEntryInput | "loeschen", group: Group | null): string | null {
    if (!before || before.kind === "supporter" || !before.contactId) return null;

    const keeps = group === "administrator" || group === "premium";
    const loses = keeps ? `behält die Gruppe ${GROUP_LABELS[group]}, verliert aber @Partner` : "verliert die Gruppe Partner und @Partner";

    if (after === "loeschen") return `Der Ansprechpartner ${loses}, ${OTHER}.`;
    if (after.kind === "supporter") return `Unterstützer haben keinen Ansprechpartner. Der bisherige ${loses}, ${OTHER}.`;
    if (after.contactId === before.contactId) return null;
    if (!after.contactId) return `Ohne Ansprechpartner: Der bisherige ${loses}, ${OTHER}.`;

    return `Der bisherige Ansprechpartner ${loses}, ${OTHER}. Der neue bekommt @Partner und, wenn er noch keine Gruppe hat, die Gruppe Partner.`;
}

/** Der gespeicherte Eintrag als Entwurf: nur, was der Server beim Speichern annimmt. */
export function inputOf(entry: IEntry): IEntryInput {
    return {
        kind: entry.kind,
        name: entry.name,
        partnerType: entry.partnerType,
        tier: entry.tier,
        supporterType: entry.supporterType,
        subtitle: entry.subtitle,
        shortText: entry.shortText,
        stripText: entry.stripText,
        color: entry.color,
        logo: entry.logo,
        banner: entry.banner,
        since: entry.since,
        endsOn: entry.endsOn,
        hideAfterEnd: entry.hideAfterEnd,
        links: entry.links,
        sections: entry.sections,
        contactId: entry.contactId,
        access: entry.access,
        guildId: entry.guildId,
        showTeams: entry.showTeams,
        visible: entry.visible,
        onHome: entry.onHome,
        tournamentIds: entry.tournamentIds,
    };
}
