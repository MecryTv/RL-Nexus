import { ButtonInteraction, Interaction } from "discord.js";
import type { IErrorInfo } from "../../../Guardian";

export default interface IGuardian {
    Initialize(): void;

    GenErrorID(): string;
    /** Gibt die Fehler-ID zurück, null bei abgelaufenen Interaktionen. Wartet auf die DMs. */
    ReportError(error: Error, interaction: Interaction | null, type?: string): Promise<string | null>;
    /** Speichert und stellt zu: die ID sofort, die DMs im Hintergrund. */
    /** sent: wie viele DMs rausgingen. */
    Report(info: IErrorInfo): { id: string; sent: Promise<number> };
    /** Erledigt und In DevLogs öffnen unter einer DM. */
    HandleButton(interaction: ButtonInteraction): Promise<void>;

    HandleCommand(errorMSG: string, interaction: Interaction | null, type?: string): Promise<void>;
    HandleEvent(errorMSG: string, context: { eventName?: string }): Promise<void>;
    HandleGeneric(errorMSG: string, type?: string, stackTrace?: string | null): Promise<void>;
    HandleRLAPI(errorMSG: string, context: { endpoint?: string }): Promise<void>;
    HandleRunnable(errorMSG: string, context: { taskName?: string; stack?: string }): Promise<void>;
    /** Gibt die Fehler-ID sofort zurück, die DMs laufen im Hintergrund. */
    HandleServer(errorMSG: string, context: { route?: string; stack?: string }): Promise<string | null>;
}
