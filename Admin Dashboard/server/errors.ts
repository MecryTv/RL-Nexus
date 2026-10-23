import { DiscordUnavailable } from "./discord.ts";

/** Ein Fehler, dessen Nachricht für Menschen geschrieben ist und so an die Oberfläche geht. */
export class PublicError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}

/** Eine Eingabe hat nicht gepasst. */
export class InvalidInput extends PublicError {
    constructor(message: string) {
        super(400, message);
    }
}

/** Was Fastify und das Rate Limit sonst auf Englisch zurückgäben. */
const MESSAGES: Readonly<Record<number, string>> = {
    400: "Mit dieser Anfrage kann der Server nichts anfangen.",
    404: "Das gibt es nicht oder nicht mehr.",
    413: "Das ist zu groß für den Server.",
    415: "Hier geht nur JSON.",
    429: "Zu viele Anfragen auf einmal. Warte einen Moment.",
};

/** Fehlercodes des MariaDB-Treibers, die heißen: die Datenbank ist gerade nicht da. */
const CONNECTION_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ER_GET_CONNECTION_TIMEOUT",
    "ER_CONNECTION_TIMEOUT",
    "ER_SOCKET_UNEXPECTED_CLOSE",
    "ER_POOL_ALREADY_CLOSED",
]);

export interface IErrorResponse {
    readonly status: number;
    readonly message: string;
    /** Gehört ins Log: unerwartet oder ein Ausfall dahinter. Erwartete Zustände bleiben draußen. */
    readonly log: boolean;
}

/** Macht aus allem, was geworfen wurde, einen Status und einen deutschen Satz. */
export function errorResponse(thrown: unknown): IErrorResponse {
    if (thrown instanceof PublicError) return { status: thrown.statusCode, message: thrown.message, log: false };

    if (thrown instanceof DiscordUnavailable) {
        return { status: 503, message: "Discord antwortet gerade nicht. Versuch es gleich noch einmal.", log: true };
    }

    const error: { statusCode?: unknown; code?: unknown } = typeof thrown === "object" && thrown !== null ? thrown : {};

    if (error.code === "ER_NO_SUCH_TABLE") {
        return { status: 503, message: "Die Tabellen des Bots fehlen noch. Starte den Bot einmal, er legt sie an.", log: true };
    }

    if (typeof error.code === "string" && CONNECTION_CODES.has(error.code)) {
        return { status: 503, message: "Die Datenbank ist gerade nicht erreichbar.", log: true };
    }

    const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    const fallback = status >= 500 ? "Da ist etwas schiefgegangen. Versuch es noch einmal." : "Das hat nicht geklappt.";

    return { status, message: MESSAGES[status] ?? fallback, log: status >= 500 };
}
