import { AttachmentBuilder, ContainerBuilder, MessageFlags, MessageMentionOptions } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { IVoicePanelImage, RenderVoicePanel, VOICE_PANEL_FILE, VoicePanelAlt } from "./VoicePanelImage";
import { REGION_LABELS, VOICE_ACCENT, VOICE_MENU_ACTIONS, VOICE_PREFIX, VOICE_REGIONS } from "../constants/Voice";
import { ButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import { IHubConfig, ITempVoice, IVoicePreset } from "../interfaces/services/voice/IVoice";

/**
 * Wie das Temp-Voice-Panel und seine Antworten aussehen. Die Logik steckt im
 * VoiceService; hier wird nur gezeichnet.
 */

export interface IVoiceView {
    components: ContainerBuilder[];
    allowedMentions: MessageMentionOptions;
}

function view(builder: ComponentV2Builder): IVoiceView {
    return { components: [builder.build()], allowedMentions: { parse: [] } };
}

export interface IVoicePanelView extends IVoiceView {
    files: AttachmentBuilder[];
}

/**
 * Das Panel (W-0151, Entwurf G3): oben das gezeichnete Bild mit dem Stand, darunter
 * ein Menü mit den Optionen, die der Hub erlaubt, und die Knöpfe Presets und
 * Kanal löschen. Löschen steht nicht im Menü, sondern als roter Knopf mit Rückfrage.
 */
export async function VoicePanel(config: IHubConfig, image: IVoicePanelImage): Promise<IVoicePanelView> {
    const options = VOICE_MENU_ACTIONS.filter((entry) => config.actions.includes(entry.value));
    const builder = new ComponentV2Builder({ accentColor: VOICE_ACCENT });
    const png = await RenderVoicePanel(image);

    builder.image(`attachment://${VOICE_PANEL_FILE}`, VoicePanelAlt(image));

    if (options.length) {
        builder.select({
            customId: `${VOICE_PREFIX}:menu`,
            placeholder: "⚙️ Kanal einstellen …",
            options: options.map((entry) => ({ label: entry.name, value: entry.value, description: entry.description, emoji: entry.emoji })),
        });
    }

    const buttons: ButtonOptions[] = [];

    if (config.presets) buttons.push({ customId: `${VOICE_PREFIX}:presets`, label: "Presets", emoji: "📌", tone: "secondary" });
    if (config.actions.includes("deletechannel")) buttons.push({ customId: `${VOICE_PREFIX}:delete`, label: "Kanal löschen", emoji: "🗑️", tone: "danger" });

    builder.buttons(...buttons);

    return { ...view(builder), files: [new AttachmentBuilder(png, { name: VOICE_PANEL_FILE })] };
}

/** Rückfrage vor dem Löschen - ein roter Knopf direkt im Panel soll keinen Kanal mit Leuten darin per Fehlklick löschen. */
export function VoiceDeletePrompt(): IVoiceView {
    const builder = new ComponentV2Builder({ accentColor: "#da373c" });

    builder
        .text("### 🗑️ Kanal wirklich löschen?")
        .text("Alle, die gerade drin sind, fliegen raus.")
        .buttons(
            { customId: `${VOICE_PREFIX}:delete:yes`, label: "Löschen", tone: "danger" },
            { customId: `${VOICE_PREFIX}:delete:no`, label: "Abbrechen", tone: "secondary" }
        );

    return view(builder);
}

/** Der Stand eines Kanals - kommt als kurze Antwort, wenn jemand etwas ändert. */
export function VoiceState(temp: ITempVoice, note: string): IVoiceView {
    const { settings } = temp;
    const builder = new ComponentV2Builder({ accentColor: VOICE_ACCENT });
    const lines = [
        `Besitzer: <@${temp.ownerId}>`,
        `Größe: ${settings.limit ? `${settings.limit} Plätze` : "unbegrenzt"}`,
        `Zutritt: ${settings.privacy === "private" ? "privat" : "offen"}${settings.stealth ? " · unsichtbar" : ""}`,
        `Region: ${REGION_LABELS.get(settings.region ?? "") ?? "Automatisch"}`,
        ...(settings.trusted.length ? [`Vertraut: ${settings.trusted.map((id) => `<@${id}>`).join(", ")}`] : []),
        ...(settings.blocked.length ? [`Blockiert: ${settings.blocked.map((id) => `<@${id}>`).join(", ")}`] : []),
    ];

    return view(builder.text(note).subtext(lines.join(" · ")));
}

/** Wen soll es treffen? Eine User-Auswahl zur gewählten Aktion. */
export function VoiceUserPrompt(action: string, label: string): IVoiceView {
    const builder = new ComponentV2Builder({ accentColor: VOICE_ACCENT });

    return view(builder.text(`**${label}:** Wähle jemanden aus.`).userSelect({ customId: `${VOICE_PREFIX}:user:${action}`, placeholder: "Mitglied auswählen" }));
}

export function VoiceRegionPrompt(current: string | null): IVoiceView {
    const builder = new ComponentV2Builder({ accentColor: VOICE_ACCENT });

    return view(
        builder.text("**Region:** Wo laufen die Stimmen entlang?").select({
            customId: `${VOICE_PREFIX}:region`,
            placeholder: "Region wählen",
            options: VOICE_REGIONS.map(([value, label]) => ({ label, value: value || "auto", default: (current ?? "") === value })),
        })
    );
}

/** Die Presets eines Users - anwenden, zum Standard machen, löschen. */
export function VoicePresetList(presets: IVoicePreset[], max: number, note: string | null): IVoiceView {
    const builder = new ComponentV2Builder({ accentColor: VOICE_ACCENT });

    builder.text("## 📌 Deine Presets").text(
        presets.length
            ? "Das Standard-Preset gilt für jeden neuen Kanal, den du aufmachst."
            : "Noch keins. Stell deinen Kanal ein, wie du ihn magst, und speichere ihn hier."
    );

    if (note) builder.subtext(note);

    for (const preset of presets) {
        builder.section(
            `**${preset.name}**${preset.isDefault ? " · Standard" : ""}\n-# ${preset.config.limit ? `${preset.config.limit} Plätze` : "unbegrenzt"} · ${preset.config.privacy === "private" ? "privat" : "offen"}${preset.config.stealth ? " · unsichtbar" : ""}`,
            { type: "button", customId: `${VOICE_PREFIX}:preset:apply:${preset.id}`, label: "Anwenden", tone: "primary" }
        );
        builder.buttons(
            { customId: `${VOICE_PREFIX}:preset:default:${preset.id}`, label: preset.isDefault ? "Ist Standard" : "Als Standard", emoji: "⭐", tone: "secondary", disabled: preset.isDefault },
            { customId: `${VOICE_PREFIX}:preset:delete:${preset.id}`, label: "Löschen", emoji: "🗑️", tone: "danger" }
        );
    }

    builder.buttons({
        customId: `${VOICE_PREFIX}:preset:save`,
        label: presets.length >= max ? `Höchstens ${max} Presets` : "Aktuellen Kanal speichern",
        emoji: "💾",
        tone: "success",
        disabled: presets.length >= max,
    });

    return view(builder);
}
