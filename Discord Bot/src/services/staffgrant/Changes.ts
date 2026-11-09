import { Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { IStaffChange } from "../../interfaces/services/staffgrant/IStaffGrant";
import { PANEL_MODULES } from "../settings/registers";
import { IPanelModule, ShowValue } from "../settings/SettingsModel";
import { Cut } from "../../utils/cut";

/**
 * W-0049: vorher und nachher, wenn Staff mit Freigabe Einstellungen speichert.
 * Gelesen wird über die Register des Panels (/einstellungen): Sie kennen für
 * jedes Modul die Felder, ihre Namen und wie ein Wert aussieht (@Rolle, #Kanal).
 * So bleibt jeder Dienst unverändert, egal, wo er speichert.
 */

/** Feld → Name, angezeigter Wert und der Wert selbst. Der Schlüssel ist <Register>:<Feld>. */
export type SettingsSnapshot = Map<string, { label: string; text: string; raw?: string }>;

/** Texte im Protokoll länger als im Panel-Bild (dort 40 Zeichen). */
const TEXT_SHOWN = 120;

/** Höchstens so viele Zeilen je Eintrag - mehr liest niemand. */
const MAX_CHANGES = 20;

/** Der Stand aller Felder eines Moduls, null ohne Register. */
export async function Snapshot(client: BotClient, guild: Guild, module: string, panels: readonly IPanelModule<any>[] = Object.values(PANEL_MODULES)): Promise<SettingsSnapshot | null> {
    const own = panels.filter((panel) => panel.module === module);

    if (!own.length) return null;

    const shot: SettingsSnapshot = new Map();

    for (const panel of own) {
        const settings = await panel.load(client, guild);

        for (const field of panel.sections.flatMap((section) => section.fields)) {
            const value = field.get(settings);
            const text = field.kind === "text" ? (typeof value === "string" && value.trim() ? Cut(value.trim(), TEXT_SHOWN) : "–") : ShowValue(field, value, guild);

            // Verglichen wird der Wert selbst: Die Anzeige kürzt und fasst Listen zusammen.
            shot.set(`${panel.id}:${field.key}`, { label: field.label, text, raw: JSON.stringify(value ?? null) });
        }
    }

    return shot;
}

/** Was sich zwischen zwei Ständen geändert hat, in der Reihenfolge der Felder. */
export function DiffSnapshots(before: SettingsSnapshot, after: SettingsSnapshot): IStaffChange[] {
    const changes: IStaffChange[] = [];

    for (const [key, now] of after) {
        const old = before.get(key);

        if (old && (old.raw ?? old.text) !== (now.raw ?? now.text)) changes.push({ label: now.label, before: old.text, after: now.text });
    }

    return changes.slice(0, MAX_CHANGES);
}
