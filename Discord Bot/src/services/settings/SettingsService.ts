import { Guild, GuildMember, PermissionFlagsBits } from "discord.js";
import BotClient from "../../client/BotClient";
import { IPanelState } from "../../builder/SettingsView";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import { LogTargetError } from "../../utils/logtarget";
import { ApplyError } from "../ApplyService";
import { LevelError } from "../LevelService";
import { ModerationError } from "../ModerationService";
import { TicketError } from "../TicketService";
import { WelcomeError } from "../WelcomeService";
import { IsPanelModule, PANEL_MODULES } from "./registers";
import { PANEL } from "./registers/Shared";
import { IPanelField, PanelError, PanelModuleId, ParseStages, ShowValue } from "./SettingsModel";

/** Was ein Modul beim Speichern ablehnt, sagt es in einem Satz - der kommt so in die Antwort. */
const MODULE_ERRORS = [ModerationError, TicketError, ApplyError, LevelError, WelcomeError, LogTargetError];

export interface IChange {
    before: string;
    after: string;
    warning: string | null;
}

/**
 * /einstellungen (W-0014 Teil 3): lesen, ändern, rückgängig. Gespeichert wird
 * über den Weg des Moduls (Register), hier kommen Rechte, Prüfung der Eingabe
 * und der Merker für Rückgängig dazu. Siehe docs/Settings.md.
 */
export default class SettingsService {
    private readonly client: BotClient;
    /** Je User und Modul der Wert vor der letzten Änderung - nur solange der Bot läuft. */
    private readonly last = new Map<string, { key: string; value: unknown }>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Wie die Einstellungen im Dashboard: nur wer den Server verwaltet. */
    Can(member: GuildMember): boolean {
        return member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild);
    }

    private Gate(member: GuildMember): void {
        if (!this.Can(member)) throw new PanelError("Einstellungen ändert nur, wer den Server verwaltet.");
    }

    private Panel(id: string) {
        if (!IsPanelModule(id)) throw new PanelError("Dieses Modul gibt es im Panel nicht.");

        return PANEL_MODULES[id];
    }

    private Field(id: PanelModuleId, key: string): IPanelField<unknown> {
        const field = this.Panel(id)
            .sections.flatMap((section) => section.fields)
            .find((candidate) => candidate.key === key);

        if (!field) throw new PanelError("Diese Einstellung gibt es nicht mehr.");

        return field as IPanelField<unknown>;
    }

    Link(guild: Guild, id: PanelModuleId | null): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${guild.id}${id ? `/${PANEL_MODULES[id].module}` : ""}`;
    }

    async State(guild: Guild, id: string): Promise<IPanelState> {
        const panel = this.Panel(id);
        const [settings, server] = await Promise.all([panel.load(this.client, guild), this.client.settings.Of(guild.id)]);

        return { panel, settings, on: server.modules.includes(panel.module), guild, link: this.Link(guild, panel.id) };
    }

    async Overview(guild: Guild): Promise<{ panel: (typeof PANEL_MODULES)[PanelModuleId]; on: boolean }[]> {
        const { modules } = await this.client.settings.Of(guild.id);

        return Object.values(PANEL_MODULES).map((panel) => ({ panel, on: modules.includes(panel.module) }));
    }

    /** Die Eingabe aus Menü, Knopf oder Fenster als Wert des Felds - oder ein Satz, was nicht passt. */
    private Value(field: IPanelField<unknown>, raw: unknown): unknown {
        switch (field.kind) {
            case "toggle":
                return raw === true || raw === "on";
            case "channel":
            case "role":
                return typeof raw === "string" && raw ? raw : null;
            case "channels":
            case "roles":
                return (Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === "string").slice(0, field.max ?? 25);
            case "choice": {
                const value = raw === "-" ? "" : String(raw ?? "");

                if (!field.choices?.some(([key]) => key === value)) throw new PanelError("Diese Auswahl gibt es nicht.");

                return value;
            }
            case "number": {
                const value = Number(String(raw ?? "").trim().replace(",", "."));
                const min = field.min ?? 0;
                const max = field.max ?? Number.MAX_SAFE_INTEGER;

                if (!Number.isInteger(value) || value < min || value > max) throw new PanelError(`Gib eine ganze Zahl von ${min} bis ${max} ein.`);

                return value;
            }
            case "text": {
                const value = String(raw ?? "").trim();

                if (field.max && value.length > field.max) throw new PanelError(`Höchstens ${field.max} Zeichen.`);

                return value;
            }
            case "stages":
                return Array.isArray(raw) ? raw : ParseStages(String(raw ?? ""));
        }
    }

    /** Ändert eine Einstellung und merkt sich den alten Wert für Rückgängig. */
    async Change(guild: Guild, member: GuildMember, id: PanelModuleId, key: string, raw: unknown): Promise<IChange> {
        this.Gate(member);

        const panel = this.Panel(id);
        const field = this.Field(id, key);
        const value = this.Value(field, raw);
        const settings = await panel.load(this.client, guild);
        const previous = field.get(settings);
        let warning: string | null;

        try {
            warning = await panel.save(this.client, guild, field.set(value, settings));
        } catch (error) {
            if (MODULE_ERRORS.some((type) => error instanceof type)) throw new PanelError((error as Error).message);

            throw error;
        }

        const after = field.get(await panel.load(this.client, guild));

        // Den Panel-Kanal „zurück“ hieße, das Panel woanders nochmal zu schicken - das gibt es nicht.
        if (!(PANEL in field.set(value, settings))) this.last.set(`${member.id}:${id}`, { key, value: previous });
        else this.last.delete(`${member.id}:${id}`);

        return { before: ShowValue(field, previous, guild), after: ShowValue(field, after, guild), warning };
    }

    /** Die letzte Änderung dieses Users in diesem Modul zurück. */
    async Undo(guild: Guild, member: GuildMember, id: PanelModuleId, key: string): Promise<IChange> {
        this.Gate(member);

        const last = this.last.get(`${member.id}:${id}`);

        if (!last || last.key !== key) throw new PanelError("Rückgängig geht nicht mehr, stell den Wert neu ein.");

        const field = this.Field(id, key);
        const raw = field.kind === "choice" && last.value === "" ? "-" : last.value;

        return this.Change(guild, member, id, key, raw);
    }

    async SetModule(guild: Guild, member: GuildMember, id: PanelModuleId, on: boolean): Promise<void> {
        this.Gate(member);

        const panel = this.Panel(id);

        if (panel.permanent) throw new PanelError(`${panel.name} gehört fest dazu und lässt sich nicht ausschalten.`);

        await this.client.settings.Toggle(guild.id, panel.module, on);
    }

    /** Tickets: das Panel nochmal in den Panel-Kanal. */
    async SendPanel(guild: Guild, member: GuildMember): Promise<string> {
        this.Gate(member);

        const { panel } = await this.client.ticketSettings.Of(guild.id);

        if (!panel.channelId) throw new PanelError("Wähle zuerst den Panel-Kanal.");

        try {
            return (await this.client.ticketService.SendPanel(guild, panel.channelId)).url;
        } catch (error) {
            if (error instanceof TicketError) throw new PanelError(error.message);

            throw error;
        }
    }
}
