import { MessageCreateOptions, MessageFlags, TextDisplayBuilder } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { GUARDS, NUKE_ACTIONS } from "../constants/AntiVillain";
import { IAvCase, IHit, INukeState, IRaidState } from "../interfaces/services/antivillain/IAntiVillain";

/**
 * Die Karten von Anti Villain (Plan 31), alle in Components V2 und im Stil der
 * anderen Module: Ping klein oben, Überschrift mit Unterzeile, Trennlinien,
 * Fakten fett, Zeitstempel klein unten. Aufbau und Texte wie im Entwurf
 * anti-villain-v7.html, Reiter „In Discord“.
 */

const RED = "#da373c";
const GREEN = "#248046";
const YELLOW = "#f0b232";
const GRAY = "#80848e";
const BLURPLE = "#5865f2";

/** Hilfe-Seiten von Discord. Suche statt fester Artikel-Nummern - die ändern sich. */
export const HELP_LINKS = {
    password: "https://support.discord.com/hc/de/search?query=Passwort%20%C3%A4ndern",
    twoFactor: "https://support.discord.com/hc/de/search?query=Zwei-Faktor-Authentifizierung",
    apps: "https://support.discord.com/hc/de/search?query=Autorisierte%20Apps",
} as const;

function Stamp(at: number, style: "R" | "t" | "f" = "R"): string {
    return `<t:${Math.floor(at / 1000)}:${style}>`;
}

/** „▰▰▰▰▰▰▰▰▰▱“ für 0 bis 100. */
export function ScoreBar(score: number): string {
    const filled = Math.max(0, Math.min(10, Math.round(score / 10)));

    return `\`${"▰".repeat(filled)}${"▱".repeat(10 - filled)}\``;
}

function GuardName(hit: IHit): string {
    return GUARDS.find((guard) => guard.id === hit.guard)?.name ?? hit.guard;
}

function Reasons(hits: IHit[]): string {
    return hits.map((hit) => `- **${GuardName(hit)}** \`+${hit.points}\` ${hit.detail}`.trimEnd()).join("\n");
}

function Quote(text: string): string {
    return `>>> ${text.replace(/\s+/g, " ").slice(0, 300)}`;
}

/* ----------------------------------------------------------
   Festgehalten
   ---------------------------------------------------------- */
export interface IHoldCardInput {
    case: IAvCase;
    userName: string;
    avatarUrl?: string | null;
    /** Rolle, die im Meldekanal angepingt wird. */
    ping: string | null;
    dashboardUrl: string;
    /** Namen der Rollen, die der Bot nicht abnehmen konnte. */
    partial: string[];
    /** Nach einem Neustart kennt der Bot nicht alle Nachrichten der Person. */
    incomplete: boolean;
    /** „report“: nur gemeldet, nicht festgehalten. */
    mode: "hold" | "report";
    quarantineChannelId?: string | null;
}

export function HoldCard(input: IHoldCardInput): MessageCreateOptions {
    const c = input.case;
    const held = input.mode === "hold";
    const card = new ComponentV2Builder({ accentColor: held ? RED : YELLOW });
    const head = `# ${held ? "🔒 Festgehalten" : "👀 Verdacht"}\n-# <@${c.userId}> · \`${input.userName}\``;

    if (input.ping) card.subtext(`<@&${input.ping}>`);
    if (input.avatarUrl) card.section(head, { type: "thumbnail", url: input.avatarUrl, description: input.userName });
    else card.text(head);

    card.separator().text(`**Verdacht** ${ScoreBar(c.score)} **${c.score}** / 100`).text(Reasons(c.hits) || "–");
    if (c.deleted[0]) card.text(Quote(c.deleted[0].text));
    if (input.partial.length) card.text(`⚠️ ${input.partial.join(", ")} ${input.partial.length === 1 ? "steht" : "stehen"} über dem Bot und bleibt. Die Person ist **nur teilweise festgehalten**.`);
    if (input.incomplete) card.subtext("Aufräumen nicht vollständig: Der Bot war gerade neu gestartet und kennt nicht alle Nachrichten.");

    card.separator();

    if (held) {
        const done = [`${c.deleted.length} ${c.deleted.length === 1 ? "Nachricht" : "Nachrichten"} gelöscht`, `${c.savedRoles.length} ${c.savedRoles.length === 1 ? "Rolle" : "Rollen"} gemerkt`];

        if (input.quarantineChannelId) done.push(`<#${input.quarantineChannelId}> offen`);
        card.text(`**Gemacht** ${done.join(" · ")}`);
        card.buttons(
            { customId: `av:release:${c.id}`, label: "Freigeben", tone: "success" },
            { customId: `av:trust:${c.id}`, label: "War kein Hack", tone: "secondary" },
            { customId: `av:ban:${c.id}`, label: "Bannen", tone: "danger" },
            { customId: `av:deleted:${c.id}`, label: "Gelöschte ansehen", tone: "secondary" }
        );
    } else {
        card.buttons(
            { customId: `av:holdu:${c.userId}`, label: "Festhalten", tone: "danger" },
            { customId: `av:trustu:${c.userId}`, label: "Kein Hack", tone: "secondary" }
        );
    }

    card.buttons({ url: input.dashboardUrl, label: "Fallakte im Dashboard" }).subtext(`Anti Villain · ${Stamp(c.createdAt)}`);

    return { ...card.toMessage(), allowedMentions: { parse: [], roles: input.ping ? [input.ping] : [] } };
}

const DECIDED: Record<IAvCase["status"], { title: string; accent: `#${string}`; verb: string }> = {
    open: { title: "🔒 Festgehalten", accent: RED, verb: "Offen" },
    released: { title: "✅ Freigegeben", accent: GREEN, verb: "Freigegeben" },
    trusted: { title: "✅ War kein Hack", accent: GREEN, verb: "Freigegeben, 30 Tage vertraut" },
    banned: { title: "⛔ Gebannt", accent: GRAY, verb: "Gebannt" },
    kicked: { title: "👢 Gekickt", accent: GRAY, verb: "Gekickt" },
};

/** Dieselbe Karte nach der Entscheidung: ohne Knöpfe, mit Namen dessen, der entschieden hat. */
export function DecidedCard(input: { case: IAvCase; userName: string; by: string | null; restored: number; missing?: string[]; dashboardUrl: string }): MessageCreateOptions {
    const c = input.case;
    const look = DECIDED[c.status];
    const who = input.by ? `von <@${input.by}>` : "nach 24 Stunden von selbst";
    const minutes = c.closedAt ? Math.max(1, Math.round((c.closedAt - c.createdAt) / 60_000)) : null;
    const card = new ComponentV2Builder({ accentColor: look.accent })
        .title(look.title, `<@${c.userId}> · \`${input.userName}\`${minutes ? ` · war ${minutes} ${minutes === 1 ? "Minute" : "Minuten"} festgehalten` : ""}`)
        .separator()
        .text(`**${look.verb}** ${who}${input.restored ? ` · ${input.restored} ${input.restored === 1 ? "Rolle" : "Rollen"} zurück` : ""}${input.missing?.length ? ` · nicht zurück: ${input.missing.join(", ")}` : ""}`)
        .text(`**Verdacht** ${c.score} / 100 · ${c.hits.map(GuardName).join(", ") || "–"}`)
        .buttons({ url: input.dashboardUrl, label: "Fallakte im Dashboard" })
        .subtext(`Anti Villain · ${Stamp(c.closedAt ?? Date.now())}`);

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

/* ----------------------------------------------------------
   Für die Person, im Kanal, Köder
   ---------------------------------------------------------- */
export function PersonCard(input: { caseId: number; userId: string; reason: string }): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: YELLOW })
        .title("Dein Account wurde wahrscheinlich übernommen")
        .text(`${input.reason} Das warst vermutlich nicht du. Bis das Team nachgesehen hat, siehst du nur diesen Kanal.`)
        .separator()
        .section("**1.** Ändere dein Passwort. Dabei fliegen fremde Geräte raus.", { type: "button", url: HELP_LINKS.password, label: "Anleitung" })
        .section("**2.** Schalte die Zwei-Faktor-Anmeldung ein.", { type: "button", url: HELP_LINKS.twoFactor, label: "Anleitung" })
        .section("**3.** Lösch verbundene Apps, die du nicht kennst.", { type: "button", url: HELP_LINKS.apps, label: "Anleitung" })
        .separator()
        .buttons({ customId: `av:done:${input.caseId}`, label: "Erledigt, Team Bescheid geben", tone: "primary" })
        .subtext("Das Team gibt dich frei, deine Rollen bekommst du dann zurück. Der Knopf gibt nicht selbst frei, das könnte sonst auch der Hacker.");

    // Der Ping steht vor der Karte, damit die Person wirklich benachrichtigt wird.
    return {
        components: [new TextDisplayBuilder().setContent(`<@${input.userId}>`), card.build()],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [], users: [input.userId] },
    };
}

export function ChannelNotice(): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: GRAY })
        .text("🧹 Hier stand ein Betrugslink von einem gekaperten Account. Er ist weg. Falls du ihn schon geöffnet hast: nichts eingeben.")
        .subtext("verschwindet in 30 Sekunden");

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

export function BaitCard(caught: number): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: YELLOW })
        .title("🚫 Bitte hier nichts schreiben")
        .text("Dieser Kanal ist eine Falle für Bots und gekaperte Accounts. Die posten ihren Link in jeden Kanal, auch hier.")
        .text("**Wer hier schreibt, wird festgehalten**, bis das Team nachgesehen hat.")
        .separator()
        .subtext(`Anti Villain · Köder · ${caught} gefangen in 30 Tagen`);

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

/* ----------------------------------------------------------
   Raid
   ---------------------------------------------------------- */
export interface IRaidCardInput {
    state: IRaidState;
    ping: string | null;
    /** Was der Bot getan hat, je eine Zeile. */
    actions: string[];
    notable: string | null;
    ended: boolean;
}

export function RaidCard(input: IRaidCardInput): MessageCreateOptions {
    const { state } = input;
    const count = state.members.length;
    const card = new ComponentV2Builder({ accentColor: input.ended ? GREEN : RED });

    if (input.ping && !input.ended) card.subtext(`<@&${input.ping}>`);
    card.title(input.ended ? "✅ Raid vorbei" : "🚨 Raid erkannt", `${count} Beitritte · ${input.ended ? "beendet" : `läuft seit ${Stamp(state.startedAt)}`}`).separator();
    if (input.actions.length) card.text(input.actions.map((line) => `✅ ${line}`).join("\n"));
    if (input.notable) card.text(`**Auffällig** ${input.notable}`);

    const open = count - state.done.length;

    if (!input.ended && open > 0) {
        card.separator().select({
            customId: `av:raid:${state.incidentId}`,
            placeholder: `Was passiert mit den ${open}?`,
            options: [
                { label: `Alle ${open} bannen`, value: "ban", description: "fragt einmal nach" },
                { label: `Alle ${open} kicken`, value: "kick", description: "dürfen neu beitreten" },
                { label: "Alle freigeben", value: "release", description: "war doch kein Raid" },
                { label: "Einzeln ansehen", value: "look", description: "im Dashboard" },
            ],
        });
    }

    if (!input.ended) card.buttons({ customId: `av:raidend:${state.incidentId}`, label: "Raid-Modus beenden", tone: "secondary" });

    card.subtext("Anti Villain · Raid-Schutz");

    return { ...card.toMessage(), allowedMentions: { parse: [], roles: input.ping && !input.ended ? [input.ping] : [] } };
}

/* ----------------------------------------------------------
   Anti-Nuke
   ---------------------------------------------------------- */
export interface INukeCardInput {
    state: INukeState;
    executorName: string;
    /** Der Fall der gestoppten Person, wenn sie festgehalten werden konnte. */
    caseId: number | null;
    ping: { ownerId: string; roleId: string | null };
    dashboardUrl: string;
    /** Link zu „Meine Backups“ mit dem Sicherheits-Backup, null ohne Backup. */
    backupUrl: string | null;
    /** Das Backup läuft noch - die Karte wird nachgezogen, sobald es da ist. */
    backupPending?: boolean;
}

export function NukeCard(input: INukeCardInput): MessageCreateOptions {
    const { state } = input;
    const action = NUKE_ACTIONS.find((entry) => entry.id === state.action);
    const card = new ComponentV2Builder({ accentColor: RED });

    card.subtext([`<@${input.ping.ownerId}>`, ...(input.ping.roleId ? [`<@&${input.ping.roleId}>`] : [])].join(" "));
    card.title(
        state.stopped ? (state.bot ? "⛔ Anti-Nuke: Bot gestoppt" : "⛔ Anti-Nuke: gestoppt") : `⚠️ Anti-Nuke: Konnte ${input.executorName} nicht stoppen`,
        `<@${state.executorId}> · \`${input.executorName}\``
    ).separator();
    card.text(`**Was** ${action?.label ?? state.action}: ${state.count} in 10 Minuten (Grenze ${action?.limit ?? "?"})`);
    if (state.debris.length) card.text(`**Weg** ${state.debris.map((entry) => `\`${entry.kind === "channel" ? "#" : "@"}${entry.name}\``).join(" ")}`);
    const undone = state.reverted.length ? ` · ${state.reverted.join(", ")}` : "";
    const inviter = state.inviterId ? ` · eingeladen von <@${state.inviterId}>${input.caseId !== null ? `: ${state.rolesRemoved} ${state.rolesRemoved === 1 ? "Rolle" : "Rollen"} entfernt, festgehalten` : ""}` : "";

    if (state.bot) {
        card.text(state.stopped ? `**Gemacht** Bot gekickt${inviter}${undone}` : `**Ging nicht** Den Bot konnte ich nicht kicken, seine Rolle steht über RL Nexus. Kick ihn von Hand.${inviter}`);
    } else {
        card.text(
            state.stopped
                ? `**Gemacht** ${state.rolesRemoved} ${state.rolesRemoved === 1 ? "Rolle" : "Rollen"} entfernt, festgehalten${undone}`
                : `**Ging nicht** ${input.executorName} hat noch Rollen, die über dem Bot stehen. Schieb RL Nexus nach oben oder nimm sie von Hand weg.${undone}`
        );
    }
    card.separator();

    if (state.backup?.ok && input.backupUrl) {
        card.section(`💾 **Backup von ${Stamp(Date.parse(state.backup.at), "f")}**\n-# vor dem Löschen`, { type: "button", url: input.backupUrl, label: "Ansehen" });
    } else if (state.backup && !state.backup.ok) {
        card.text(`⚠️ **Sicherheits-Backup ging nicht:** ${state.backup.reason}`);
    } else if (input.backupPending) {
        card.text("💾 Sicherheits-Backup läuft noch, die Karte zeigt es gleich.");
    }

    if (input.caseId !== null) {
        card.buttons({ customId: `av:release:${input.caseId}`, label: "Freigeben", tone: "success" }, { customId: `av:ban:${input.caseId}`, label: "Bannen", tone: "danger" });
    }

    card.subtext("Anti Villain · Anti-Nuke");

    return { ...card.toMessage(), allowedMentions: { parse: [], users: [input.ping.ownerId], roles: input.ping.roleId ? [input.ping.roleId] : [] } };
}

/* ----------------------------------------------------------
   Gelöschte ansehen (nur für den, der klickt)
   ---------------------------------------------------------- */
export function DeletedView(c: IAvCase): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: BLURPLE }).title("Gelöschte Nachrichten", `<@${c.userId}> · ${c.deleted.length}`);

    if (c.deleted.length === 0) card.text("Keine gespeichert.");

    for (const entry of c.deleted) {
        card.text(`<#${entry.channelId}> · ${Stamp(entry.at, "t")}\n${Quote(entry.text || "–")}${entry.files.length ? `\n-# 📎 ${entry.files.join(", ")}` : ""}`);
    }

    return { ...card.toMessage({ ephemeral: true }), allowedMentions: { parse: [] } };
}
