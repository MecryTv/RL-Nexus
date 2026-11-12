import { AttachmentBuilder, MessageCreateOptions } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { ROULETTE_PREFIX } from "../constants/RocketRoulette";
import { IRouletteEvening, IRouletteLobby, IRouletteRound } from "../interfaces/services/roulette/IRoulette";
import {
    AnnouncementAlt,
    AvatarMap,
    Clock,
    ControlAlt,
    Day,
    IAnnounceView,
    IControlView,
    LobbyCardAlt,
    OpenBannerAlt,
    RenderAnnouncement,
    RenderControl,
    RenderLobbyCard,
    RenderOpenBanner,
    RenderRound,
    RenderSummary,
    RoundAlt,
    RoundPages,
    SummaryAlt,
    SummaryPages,
} from "./RouletteImages";

/**
 * Rocket Roulette (W-0087): die Nachrichten um die Bilder aus RouletteImages.
 * Bild oben, darunter was live zählt (Discord-Zeitstempel) und die Knöpfe.
 * Niemand wird gepingt, außer im Offen-Ping und in der Einspring-Anfrage.
 */

const GOLD = "#f0b232";
const GREEN = "#35e07f";
const GREY = "#80848e";
const RED = "#da373c";

export const ROULETTE_ACTIONS = ["open", "copy", "next", "wish", "wishadd", "wishdel", "swap", "abort", "end", "endok", "fill", "nofill", "start", "howto"] as const;
export type RouletteAction = (typeof ROULETTE_ACTIONS)[number];

/** Wunsch-Dauer im dritten Feld von `wish` und `wishadd`. */
export const WISH_FOREVER = 0;
export const WISH_ONCE = 1;

/**
 * `rr:<aktion>:<abend>[:<runde>[:<lobby>]]`. Bei `wish`/`wishadd` steht im
 * Runden-Feld die Dauer (WISH_FOREVER, WISH_ONCE).
 */
export function RouletteId(action: RouletteAction, eveningId: number, round?: number, lobby?: number): string {
    return [ROULETTE_PREFIX, action, eveningId, round, lobby].filter((part) => part !== undefined).join(":");
}

export function ReadRouletteId(customId: string): { action: RouletteAction; eveningId: number; round: number | null; lobby: number | null } | null {
    const [prefix, action, ...numbers] = customId.split(":");

    if (prefix !== ROULETTE_PREFIX || !ROULETTE_ACTIONS.includes(action as RouletteAction)) return null;
    if (!numbers.length || numbers.length > 3 || numbers.some((part) => !/^\d+$/.test(part))) return null;

    const [eveningId, round, lobby] = numbers.map(Number);

    return { action: action as RouletteAction, eveningId, round: round ?? null, lobby: lobby ?? null };
}

function At(at: number, style: "R" | "t" | "F" = "R"): string {
    return `<t:${Math.floor(at / 1000)}:${style}>`;
}

function Mode(size: number): string {
    return `${size}v${size}`;
}

function Image(buffer: Buffer, name: string): AttachmentBuilder {
    return new AttachmentBuilder(buffer, { name });
}

/* ----------------------------------------------------------
   Info-Kanal
   ---------------------------------------------------------- */
export async function AnnouncementMessage(view: IAnnounceView, eveningId: number): Promise<MessageCreateOptions> {
    const card = new ComponentV2Builder({ accentColor: view.status === "planned" ? GOLD : view.status === "running" ? GREEN : GREY })
        .image("attachment://roulette.png", AnnouncementAlt(view))
        .subtext(view.status === "planned" ? `Start ${At(view.startsAt)} · ${At(view.startsAt, "F")}` : view.status === "running" ? `Läuft seit ${At(view.startsAt)}${view.round ? ` · Runde ${view.round}` : ""}` : "Der Abend ist vorbei. Danke fürs Mitspielen!");

    if (view.status !== "ended") card.buttons({ customId: RouletteId("howto", eveningId), label: "Wie läuft der Abend ab?", emoji: "❓" });

    return { ...card.toMessage(), files: [Image(await RenderAnnouncement(view), "roulette.png")], allowedMentions: { parse: [] } };
}

export function HowToMessage() {
    return new ComponentV2Builder({ accentColor: GOLD })
        .title("🎰 So läuft Rocket Roulette", "Private Matches, Teams jede Runde neu gemischt")
        .separator()
        .list(
            [
                "Setz dich in den **Warteraum**, gern schon vor dem Start. Zur Startzeit holt dich der Bot in den Treffpunkt.",
                "Ein Moderator lost die Runde aus. Der Bot schiebt dich in den Sprachkanal deines Teams.",
                "Im Text-Chat deines Kanals stehen **Lobby-Name und Passwort**. Der Host macht die Lobby in Rocket League auf (Private Match).",
                "Sobald sie offen ist, pingt dich der Bot. Rein ins Spiel.",
                "Nach dem Match holt der Bot alle zurück, die nächste Runde wird neu gemischt.",
            ],
            { ordered: true }
        )
        .subtext("Später gekommen? Einfach in den Warteraum, du bist ab der nächsten Runde dabei. Mit wem du zusammen spielen willst, sagst du einem Moderator.")
        .toMessage({ ephemeral: true });
}

export async function RoundMessages(round: IRouletteRound, avatars: AvatarMap = {}, extra?: { waiting: string[]; sitOut: string[] }): Promise<MessageCreateOptions[]> {
    const pages = RoundPages(round);
    const messages: MessageCreateOptions[] = [];

    for (let page = 0; page < pages; page++) {
        const name = `runde-${round.number}-${page + 1}.png`;
        const card = new ComponentV2Builder({ accentColor: GREEN }).image(`attachment://${name}`, RoundAlt(round, page, page === pages - 1 ? extra : undefined));

        if (page === 0) card.subtext(`Runde ${round.number} · ausgelost ${At(round.createdAt, "t")}`);

        messages.push({ ...card.toMessage(), files: [Image(await RenderRound(round, page, avatars, page === pages - 1 ? extra : undefined), name)], allowedMentions: { parse: [] } });
    }

    return messages;
}

/* ----------------------------------------------------------
   Text-Chat der Team-Kanäle
   ---------------------------------------------------------- */
export async function LobbyMessage(ref: { eveningId: number; round: number; lobby: number }, lobby: IRouletteLobby, team: 0 | 1, open: boolean, avatars: AvatarMap = {}): Promise<MessageCreateOptions> {
    const host = lobby.names[lobby.host] ?? "der Host";
    const card = new ComponentV2Builder({ accentColor: open ? GREEN : GOLD })
        .image("attachment://lobby.png", LobbyCardAlt(lobby, team, open))
        .subtext(open && lobby.openedAt ? `Offen seit ${At(lobby.openedAt)}` : `${host} macht die Lobby auf. Nur ${host} oder ein Moderator drückt „Lobby ist offen“.`)
        .buttons(
            { customId: RouletteId("open", ref.eveningId, ref.round, ref.lobby), label: "Lobby ist offen", emoji: "✅", tone: "success", disabled: open },
            { customId: RouletteId("copy", ref.eveningId, ref.round, ref.lobby), label: "Als Text zum Kopieren", emoji: "📋" }
        );

    return { ...card.toMessage(), files: [Image(await RenderLobbyCard(lobby, team, open, avatars), "lobby.png")], allowedMentions: { parse: [] } };
}

/** Name und Passwort als Text, nur für den Drückenden. */
export function CopyMessage(lobby: IRouletteLobby) {
    return new ComponentV2Builder({ accentColor: GOLD })
        .text(`**Name**\n\`\`\`\n${lobby.name}\n\`\`\`\n**Passwort**\n\`\`\`\n${lobby.password}\n\`\`\``)
        .toMessage({ ephemeral: true });
}

export async function OpenPingMessage(lobby: IRouletteLobby, team: 0 | 1): Promise<MessageCreateOptions> {
    const members = lobby.teams[team];
    const card = new ComponentV2Builder({ accentColor: GREEN })
        .text(`${members.map((id) => `<@${id}>`).join(" ")}\n**${lobby.name}** ist offen, rein mit euch!`)
        .image("attachment://offen.png", OpenBannerAlt(lobby));

    return { ...card.toMessage(), files: [Image(await RenderOpenBanner(lobby), "offen.png")], allowedMentions: { parse: [], users: members } };
}

/* ----------------------------------------------------------
   Moderator-Kanal
   ---------------------------------------------------------- */
export async function ControlMessage(eveningId: number, view: IControlView, late: string[] = []): Promise<MessageCreateOptions> {
    const card = new ComponentV2Builder({ accentColor: view.status === "planned" ? GOLD : view.status === "running" ? GREEN : GREY }).image("attachment://steuerung.png", ControlAlt(view));
    const lines: string[] = [];

    if (view.status === "planned") lines.push(`Start ${At(view.startsAt)} · ${At(view.startsAt, "t")}`);
    if (view.status === "running") lines.push(view.round ? `Runde ${view.round} · Abend läuft seit ${At(view.startsAt)}` : `Bereit für Runde 1 · Abend läuft seit ${At(view.startsAt)}`);
    if (view.status === "running" && late.length) lines.push(`Nachzügler im Warteraum: ${late.join(", ")}`);
    if (view.status === "ended") lines.push("Abend beendet. Die Übersicht steht darunter.");
    card.subtext(lines.join("\n"));

    if (view.status === "planned") {
        card.buttons(
            { customId: RouletteId("start", eveningId), label: "Jetzt starten", emoji: "▶️", tone: "success" },
            { customId: RouletteId("wish", eveningId), label: "Wünsche", emoji: "🤝" },
            { customId: RouletteId("end", eveningId), label: "Abend absagen", tone: "danger" }
        );
    }

    if (view.status === "running") {
        card.buttons({ customId: RouletteId("next", eveningId), label: `Runde ${view.round + 1} auslosen`, emoji: "🎲", tone: "primary" }, { customId: RouletteId("wish", eveningId), label: "Wünsche", emoji: "🤝" });
        card.buttons(
            { customId: RouletteId("swap", eveningId), label: "Spieler tauschen", emoji: "🔁", disabled: !view.round },
            { customId: RouletteId("abort", eveningId), label: "Runde abbrechen", disabled: !view.round },
            { customId: RouletteId("end", eveningId), label: "Abend beenden", tone: "danger" }
        );
    }

    return { ...card.toMessage(), files: [Image(await RenderControl(view), "steuerung.png")], allowedMentions: { parse: [] } };
}

/** Rückfrage vor dem Beenden, nur für den Drückenden. */
export function EndConfirmView(eveningId: number, planned: boolean) {
    return new ComponentV2Builder({ accentColor: RED })
        .text(planned ? "**Abend wirklich absagen?** Die Ankündigung zeigt dann „beendet“." : "**Abend wirklich beenden?** Alle kommen zurück in den Treffpunkt, die Team-Kanäle verschwinden, die Übersicht kommt hierher.")
        .buttons({ customId: RouletteId("endok", eveningId), label: planned ? "Ja, absagen" : "Ja, beenden", tone: "danger" })
        .toMessage({ ephemeral: true });
}

/**
 * C6·2: Wünsche eintragen und entfernen, nur für den Moderator. `mode` steht
 * im Custom-ID der Auswahl, damit der Klick weiß, wie lange der Wunsch gilt.
 */
export function WishView(evening: IRouletteEvening, names: Record<string, string>, mode: number = WISH_FOREVER, note?: string) {
    const name = (id: string) => names[id] ?? `<@${id}>`;
    const card = new ComponentV2Builder({ accentColor: GOLD }).title("🤝 Wünsche", "Zwei Mitglieder landen im selben Team");

    if (note) card.text(note);

    card.separator()
        .buttons(
            { customId: RouletteId("wish", evening.id, WISH_FOREVER), label: "Gilt bis gelöscht", tone: mode === WISH_FOREVER ? "primary" : "secondary" },
            { customId: RouletteId("wish", evening.id, WISH_ONCE), label: "Nur nächste Runde", tone: mode === WISH_ONCE ? "primary" : "secondary" }
        )
        .userSelect({ customId: RouletteId("wishadd", evening.id, mode), placeholder: "Genau zwei Mitglieder wählen", minValues: 2, maxValues: 2 });

    if (evening.wishes.length) {
        card.separator()
            .text(evening.wishes.map((wish) => `• ${name(wish.a)} + ${name(wish.b)}${wish.once ? " · nur nächste Runde" : ""}`).join("\n"))
            .select({
                customId: RouletteId("wishdel", evening.id),
                placeholder: "Wunsch entfernen",
                options: evening.wishes.slice(0, 25).map((wish, index) => ({ label: `${names[wish.a] ?? wish.a} + ${names[wish.b] ?? wish.b}`.slice(0, 100), value: String(index), description: wish.once ? "nur nächste Runde" : "bis gelöscht" })),
            });
    } else {
        card.subtext("Noch keine Wünsche.");
    }

    return card.toMessage({ ephemeral: true });
}

/** „Spieler tauschen“: zwei wählen, der Bot erkennt, wer gerade in einer Lobby steht. */
export function SwapView(eveningId: number, round: number) {
    return new ComponentV2Builder({ accentColor: GOLD })
        .title("🔁 Spieler tauschen", `Runde ${round}`)
        .text("Wähle zwei Mitglieder: wer weg ist und wer den Platz bekommt, etwa ein Nachzügler oder ein Moderator. Der Bot erkennt, wer gerade in einer Lobby steht.")
        .userSelect({ customId: RouletteId("swap", eveningId, round), placeholder: "Genau zwei Mitglieder wählen", minValues: 2, maxValues: 2 })
        .toMessage({ ephemeral: true });
}

/** C7: ein Platz ist frei. `resolved` ersetzt die Knöpfe, sobald es geklärt ist. */
export function FillRequestMessage(eveningId: number, round: number, lobbyName: string, size: number, sitOutName: string, roleId: string | null, resolved: string | null = null): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: resolved ? GREY : GOLD });

    if (roleId && !resolved) card.subtext(`<@&${roleId}>`);
    card.title(`🙋 Ein Platz frei in ${lobbyName}`, "Wer spielt mit?")
        .text(`Mit Einspringer wird es ein **${Mode(size)}**. Ohne setzt **${sitOutName}** diese Runde aus und ist nächste Runde sicher dabei.`);

    if (resolved) card.separator().text(resolved);
    else
        card.buttons(
            { customId: RouletteId("fill", eveningId, round), label: "Ich spiele mit", emoji: "🙋", tone: "success" },
            { customId: RouletteId("nofill", eveningId, round), label: "Ohne Einspringer" }
        );

    return { ...card.toMessage(), allowedMentions: { parse: [], roles: roleId && !resolved ? [roleId] : [] } };
}

/** Name und Passwort, je Runde und Lobby, dazu die Teilnahme. Für die .txt an der Übersicht. */
export function SummaryText(evening: IRouletteEvening, rounds: IRouletteRound[]): string {
    const lines = [`Rocket Roulette · ${Day(evening.startsAt)} · ${Clock(evening.startsAt)} bis ${Clock(evening.endedAt ?? Date.now())}`, ""];

    for (const round of rounds) {
        lines.push(`Runde ${round.number} (${Clock(round.createdAt)})`);

        for (const lobby of round.lobbies) {
            const team = (index: 0 | 1) => lobby.teams[index].map((id) => lobby.names[id] ?? id).join(", ");

            lines.push(`  ${lobby.name} (${Mode(lobby.size)}): ${team(0)} gegen ${team(1)} · Host ${lobby.names[lobby.host] ?? lobby.host}`);
        }

        lines.push("");
    }

    lines.push("Wer war wie oft dabei");

    for (const entry of Object.values(evening.participants).sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name, "de"))) lines.push(`  ${entry.name}: ${entry.rounds}`);

    return lines.join("\n");
}

export async function SummaryMessages(evening: IRouletteEvening, rounds: IRouletteRound[], avatars: AvatarMap = {}, dashboardUrl: string | null = null): Promise<MessageCreateOptions[]> {
    const pages = SummaryPages(rounds);
    const messages: MessageCreateOptions[] = [];

    for (let page = 0; page < pages; page++) {
        const name = `uebersicht-${page + 1}.png`;
        const last = page === pages - 1;
        const card = new ComponentV2Builder({ accentColor: GREY }).image(`attachment://${name}`, SummaryAlt(evening, rounds, page));
        const files = [Image(await RenderSummary(evening, rounds, page, avatars), name)];

        if (last) {
            const text = `rocket-roulette-${new Date(evening.startsAt).toISOString().slice(0, 10)}.txt`;

            card.file(text);
            files.push(new AttachmentBuilder(Buffer.from(SummaryText(evening, rounds), "utf8"), { name: text }));
            if (dashboardUrl) card.buttons({ url: dashboardUrl, label: "Im Dashboard ansehen", emoji: "📊" });
        }

        messages.push({ ...card.toMessage(), files, allowedMentions: { parse: [] } });
    }

    return messages;
}
