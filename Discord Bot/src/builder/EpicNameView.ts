import { LabelBuilder, MessageCreateOptions, ModalBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { IEpicCase, IEpicPlace } from "../interfaces/services/teams/IEpicName";

/**
 * Epic-Name geändert (Plan 33): die DM an den Spieler (Entwurf B), das Fenster
 * (Entwurf 3), die Antworten darauf und die DM an den Captain.
 */

const BLUE = 0x5865f2;
const GREEN = 0x57f287;
const YELLOW = 0xfee75c;
const DAY = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
const NUMBER = new Intl.NumberFormat("de-DE");

function Message(card: ComponentV2Builder): MessageCreateOptions {
    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

function Note(text: string, color = YELLOW, caseId?: number): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: color }).text(text);

    if (caseId !== undefined) card.buttons({ customId: `epic:again:${caseId}`, label: "Noch einmal", tone: "primary" });

    return Message(card);
}

/** „28.10.“ */
function Day(at: number): string {
    return DAY.format(at);
}

/** „Grand Champion II · 1.512 MMR im 3v3“, ohne Rang nur, was es gibt. */
export function RankLine(lastSeen: Pick<IEpicCase["lastSeen"], "tierName" | "mmr3">): string {
    return [lastSeen.tierName, lastSeen.mmr3 !== null ? `${NUMBER.format(lastSeen.mmr3)} MMR im 3v3` : null].filter(Boolean).join(" · ");
}

/** Die Liste aus Entwurf B: Kader (bei mehreren Servern mit Servername) und die Verknüpfung. */
function Places(places: readonly IEpicPlace[], linked: boolean): string[] {
    const servers = new Set(places.map((place) => place.guildName));
    const teams = places.map((place) => (servers.size > 1 ? `**${place.teamName}** auf ${place.guildName}` : `**${place.teamName}**`));
    const lines = teams.length ? [`im Kader von ${teams.length > 1 ? `${teams.slice(0, -1).join(", ")} und ${teams[teams.length - 1]}` : teams[0]}`] : [];

    if (linked) lines.push("in deiner Verknüpfung für `/rank me` und die Rang-Rollen");

    return lines;
}

function Servers(places: readonly IEpicPlace[]): string {
    return [...new Set(places.map((place) => place.guildName))].join(" · ");
}

/* ----------------------------------------------------------
   An den Spieler
   ---------------------------------------------------------- */
export function AskDm(input: { caseId: number; oldName: string; places: IEpicPlace[]; linked: boolean; lastSeen: IEpicCase["lastSeen"] }): MessageCreateOptions {
    const rank = RankLine(input.lastSeen);
    const card = new ComponentV2Builder({ accentColor: BLUE })
        .title("🎮 Epic-Name geändert?", Servers(input.places) || undefined)
        .text(`Unter **${input.oldName}** findet der Bot dich nicht mehr. Trag deinen neuen Namen ein, dann ändert er ihn überall:`);
    const places = Places(input.places, input.linked);

    if (places.length) card.list(places);

    card.subtext(`Zuletzt gesehen am ${Day(input.lastSeen.at)}${rank ? `: ${rank}` : ""}`)
        .buttons({ customId: `epic:ask:${input.caseId}`, label: "Neuen Namen eintragen", tone: "primary" })
        .subtext("Der neue Name muss zu deinem Epic-Konto gehören.");

    return Message(card);
}

/** Grün, ohne Knopf: nach dem Fenster (auto: false) oder wenn der Bot den Namen selbst geholt hat (auto: true). */
export function RenamedDm(input: { oldName: string; newName: string; places: IEpicPlace[]; linked: boolean; rank: string | null; auto: boolean }): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: GREEN });

    if (input.auto) card.text(`✅ Dein Epic-Name hat sich geändert: ${input.oldName} → **${input.newName}**. Ich habe ihn überall angepasst:`);
    else card.title("✅ Epic-Name aktualisiert").text(`${input.oldName} → **${input.newName}**`);

    const places = Places(input.places, input.linked);

    if (places.length) card.list(places);
    if (input.rank) card.subtext(`Ränge neu geholt: ${input.rank}`);

    return Message(card);
}

export function EpicModal(caseId: number, oldName: string, lastSeenAt: number): ModalBuilder {
    const input = new TextInputBuilder().setCustomId("name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder("z. B. Nico.RLN");

    return new ModalBuilder()
        .setCustomId(`epic:modal:${caseId}`)
        .setTitle("Neuer Epic-Name")
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Bisher: **${oldName}** · zuletzt gesehen am ${Day(lastSeenAt)}`))
        .addLabelComponents(new LabelBuilder().setLabel("Dein neuer Epic-Name").setDescription("So, wie er in Rocket League unter Profil steht").setTextInputComponent(input))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("Der Bot prüft bei Epic, ob der Name zu deinem Konto gehört."));
}

export function NotFoundReply(name: string, caseId: number): MessageCreateOptions {
    return Note(`Epic kennt **${name}** nicht. Schau in Rocket League unter Profil nach, wie dein Name genau heißt.`, YELLOW, caseId);
}

export function OtherAccountReply(name: string, oldName: string, caseId: number): MessageCreateOptions {
    return Note(`**${name}** gehört zu einem anderen Epic-Konto als ${oldName}. Trag den Namen ein, den **dein** Konto jetzt hat.`, YELLOW, caseId);
}

export function BusyReply(caseId: number): MessageCreateOptions {
    return Note("Epic antwortet gerade nicht. Probier es gleich noch einmal.", YELLOW, caseId);
}

export function DoneReply(): MessageCreateOptions {
    return Note("Schon erledigt, danke.", GREEN);
}

export function TooManyReply(): MessageCreateOptions {
    return Note("Das waren viele Versuche hintereinander. Probier es in ein paar Minuten noch einmal.");
}

export function TypedHint(caseId: number, oldName: string): MessageCreateOptions {
    return Message(new ComponentV2Builder({ accentColor: BLUE }).text(`Unter **${oldName}** findet der Bot dich nicht mehr. Trag deinen neuen Namen über den Knopf ein.`).buttons({ customId: `epic:ask:${caseId}`, label: "Neuen Namen eintragen", tone: "primary" }));
}

/* ----------------------------------------------------------
   An den Captain
   ---------------------------------------------------------- */
export function CaptainDm(input: { team: string; server: string; oldName: string; userId: string; reason: "closed" | "silent"; dashboardUrl: string }): MessageCreateOptions {
    const person = `<@${input.userId}>`;
    const why = input.reason === "closed" ? "hat keine DMs offen" : "hat seit 3 Tagen nicht reagiert";
    const card = new ComponentV2Builder({ accentColor: YELLOW })
        .title("🎮 Epic-Name nicht gefunden", input.server)
        .text(`Bei **${input.team}** findet der Bot **${input.oldName}** (${person}) nicht mehr bei Epic. ${person} ${why}. Du kannst den neuen Namen im Dashboard beim Spieler eintragen.`)
        .buttons({ url: input.dashboardUrl, label: "Im Dashboard" });

    return Message(card);
}
