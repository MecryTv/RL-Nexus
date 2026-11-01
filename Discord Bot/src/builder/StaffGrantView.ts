import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import { STAFF_PRESETS } from "../constants/StaffGrant";
import { IStaffGrant, IStaffLogEntry } from "../interfaces/services/staffgrant/IStaffGrant";
import { DurationText } from "../services/staffgrant/Rules";

/**
 * Die DM an den Gefragten (W-0011, Entwürfe w0011-staff-freigabe-v2.html Teil 3
 * und w0011-private-bereiche.html Teil 3 A): dieselbe Nachricht in drei
 * Zuständen - Anfrage, Erlaubt, Ende. Knöpfe: sg:<was>:<grantId>.
 */
export interface IStaffCardInput {
    grant: IStaffGrant;
    /** Für wen die Karte ist - die anderen Gefragten sehen nach dem Ja „Erlaubt von …“. */
    forUser: string;
    guildName: string;
    staffAvatar: string | null;
    log: IStaffLogEntry[];
    /** Was der Gefragte im Menü gewählt hat. */
    choice: { minutes: number; private: boolean };
    dashboardUrl: string;
    /** Namen der Gefragten, für „Erlaubt von …“ und „Von … beendet“. */
    names: Record<string, string>;
}

const RED = 0xff1e2d;
const GREEN = 0x35e07f;
const YELLOW = 0xf0b232;
const GREY = 0x4e5058;
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const PRESET_LABELS: Record<number, string> = { 30: "30 Minuten", 60: "1 Stunde", 180: "3 Stunden" };

function At(ms: number, style: "R" | "t"): string {
    return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function Text(content: string): TextDisplayBuilder {
    return new TextDisplayBuilder().setContent(content);
}

function Row(...components: MessageActionRowComponentBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(...components);
}

function Button(id: string, label: string, style: ButtonStyle): ButtonBuilder {
    return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function Link(url: string, label: string): ButtonBuilder {
    return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
}

type Part = TextDisplayBuilder | SectionBuilder | SeparatorBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>;

/** Der Kopf mit dem Bild des Fragenden rechts, wie im Entwurf - ohne Bild nur der Text. */
function Head(content: string, avatar: string | null): TextDisplayBuilder | SectionBuilder {
    return avatar ? new SectionBuilder().addTextDisplayComponents(Text(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)) : Text(content);
}

function Container(accent: number, ...parts: Part[]): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(accent);

    for (const part of parts) {
        if (part instanceof TextDisplayBuilder) container.addTextDisplayComponents(part);
        else if (part instanceof SectionBuilder) container.addSectionComponents(part);
        else if (part instanceof SeparatorBuilder) container.addSeparatorComponents(part);
        else container.addActionRowComponents(part);
    }

    return container;
}

function NameOf(input: IStaffCardInput, id: string | null): string {
    return id ? (input.names[id] ?? id) : "";
}

function Ask(input: IStaffCardInput): ContainerBuilder[] {
    const { grant, choice } = input;
    const custom = !STAFF_PRESETS.includes(choice.minutes as (typeof STAFF_PRESETS)[number]);
    const duration = new StringSelectMenuBuilder()
        .setCustomId(`sg:dur:${grant.id}`)
        .setPlaceholder("Erlauben für …")
        .setOptions(
            ...STAFF_PRESETS.map((minutes) => {
                const option = new StringSelectMenuOptionBuilder().setValue(String(minutes)).setLabel(PRESET_LABELS[minutes]).setDefault(!custom && choice.minutes === minutes);

                return minutes === grant.minutes ? option.setDescription(`Vorschlag von ${grant.staffName}`) : option;
            }),
            new StringSelectMenuOptionBuilder()
                .setValue("custom")
                .setLabel(custom ? `Eigene Zeit: ${DurationText(choice.minutes)}` : "Eigene Zeit …")
                .setDescription(custom && choice.minutes === grant.minutes ? `Vorschlag von ${grant.staffName}` : "Öffnet ein Fenster")
                .setDefault(custom)
        );
    const parts: Part[] = [
        Head(`## 🔐 Freigabe für ${input.guildName}?\n<@${grant.staffId}> vom Team von RL Nexus (${grant.staffRole}) möchte deinen Server im Dashboard bearbeiten.`, input.staffAvatar),
        Text(`> ${grant.reason.split("\n").join("\n> ")}`),
        new SeparatorBuilder(),
        Text("**Darf** alles im Dashboard, auch Rollen, Kanäle, Moderation\n**Darf nicht** private Bereiche ohne dein Ja, Bot entfernen"),
    ];

    if (grant.private === "asked") {
        parts.push(new SeparatorBuilder(), Text("🔏 **Extra angefragt:** Live Tickets, Transcripts, Bewerbungen, Fälle"));
    }

    parts.push(Row(duration));

    if (grant.private === "asked") {
        parts.push(
            Row(
                new StringSelectMenuBuilder()
                    .setCustomId(`sg:priv:${grant.id}`)
                    .setOptions(
                        new StringSelectMenuOptionBuilder().setValue("no").setLabel("Private Bereiche: nein").setDefault(!choice.private),
                        new StringSelectMenuOptionBuilder().setValue("yes").setLabel("Private Bereiche: ja, auch erlauben").setDefault(choice.private)
                    )
            )
        );
    }

    parts.push(
        Row(Button(`sg:yes:${grant.id}`, "Erlauben", ButtonStyle.Success), Button(`sg:no:${grant.id}`, "Ablehnen", ButtonStyle.Danger), Link(input.dashboardUrl, "Im Dashboard ansehen")),
        Text(`-# Anfrage verfällt ${At(grant.expiresAt, "R")} · Jede Änderung steht im Protokoll · RL Nexus fragt nie nach Passwörtern`)
    );

    return [Container(RED, ...parts)];
}

function Active(input: IStaffCardInput): ContainerBuilder[] {
    const { grant } = input;
    const changes = input.log.filter((entry) => entry.area !== "Freigabe").slice(0, 3);
    const containers = [
        Container(
            GREEN,
            Head(`## ✅ Freigabe läuft\n<@${grant.staffId}> darf ${input.guildName} bis ${At(grant.endsAt!, "t")} bearbeiten.${grant.private === "on" ? " Dazu die privaten Bereiche." : ""}`, input.staffAvatar),
            new SeparatorBuilder(),
            Text(`**Bisher geändert**\n${changes.length ? changes.map((entry) => `• ${entry.text}`).join("\n") : "Noch nichts."}`),
            Row(Button(`sg:end:${grant.id}`, "Jetzt beenden", ButtonStyle.Danger), Button(`sg:more:${grant.id}`, "+30 Min.", ButtonStyle.Secondary), Link(input.dashboardUrl, "Protokoll")),
            Text(`-# Endet von selbst ${At(grant.endsAt!, "R")}`)
        ),
    ];

    if (grant.private === "asked" && !grant.privateDenied.includes(input.forUser)) {
        containers.push(
            Container(
                YELLOW,
                Text(`### 🔏 Auch private Bereiche?\n<@${grant.staffId}> möchte zusätzlich in diese Bereiche von ${input.guildName}:\nLive Tickets · Transcripts · Bewerbungen · Fälle von Moderation und Anti Villain`),
                Text(`> ${(grant.privateReason ?? "").split("\n").join("\n> ")}`),
                Text(`-# Dort stehen Gespräche und Notizen deiner Mitglieder. Gilt nur, solange die Freigabe läuft (bis ${At(grant.endsAt!, "t")}).`),
                Row(Button(`sg:pyes:${grant.id}`, "Auch private erlauben", ButtonStyle.Success), Button(`sg:pno:${grant.id}`, "Nein", ButtonStyle.Secondary))
            )
        );
    }

    return containers;
}

function End(input: IStaffCardInput, title: string, body: string, sub: string | null = null): ContainerBuilder[] {
    return [Container(GREY, Text(`## ${title}\n${body}`), ...(sub ? [Text(`-# ${sub}`)] : []), Row(Link(input.dashboardUrl, "Protokoll")))];
}

export function StaffGrantCard(input: IStaffCardInput): { components: ContainerBuilder[]; flags: MessageFlags.IsComponentsV2; allowedMentions: { parse: [] } } {
    const { grant } = input;
    const changes = input.log.filter((entry) => entry.area !== "Freigabe").length;
    let components: ContainerBuilder[];

    switch (grant.status) {
        case "open":
            components = grant.denied.includes(input.forUser)
                ? End(input, "Abgelehnt", "Du hast die Anfrage abgelehnt. Staff sieht nur „abgelehnt“, keinen Grund.")
                : Ask(input);
            break;
        case "active":
            components =
                grant.answeredBy === input.forUser
                    ? Active(input)
                    : End(input, `Erlaubt von ${NameOf(input, grant.answeredBy)}`, `${grant.staffName} darf ${input.guildName} bis ${At(grant.endsAt!, "t")} bearbeiten.`);
            break;
        case "ended":
            components = End(
                input,
                "🔒 Freigabe beendet",
                `${grant.staffName} kann ${input.guildName} wieder nur ansehen.`,
                `${grant.endedBy ? `Von ${NameOf(input, grant.endedBy)} beendet um` : "Zeit abgelaufen um"} ${CLOCK.format(grant.endedAt ?? Date.now())} · ${changes} ${changes === 1 ? "Änderung" : "Änderungen"}`
            );
            break;
        case "denied":
            components = End(input, "Abgelehnt", "Du hast die Anfrage abgelehnt. Staff sieht nur „abgelehnt“, keinen Grund.");
            break;
        case "expired":
            components = End(input, "⌛ Anfrage verfallen", "Niemand hat in 10 Minuten geantwortet. Es hat sich nichts geändert.");
            break;
        case "withdrawn":
            components = End(input, "Zurückgezogen", "Der Staff hat die Anfrage zurückgezogen.");
            break;
    }

    return { components, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
