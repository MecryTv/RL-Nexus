import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SendPage } from "./dashboard";
import logger from "./logger";

/**
 * Die Fehlerseite des Dashboards.
 *
 * Wer mit dem Browser auf eine Adresse stößt, die es nicht gibt, oder auf einen
 * Fehler im Bot, sah bisher rohes JSON. Stattdessen kommt jetzt eine Seite, die
 * sagt, was los ist und wohin man von hier kommt.
 *
 * Für alles andere - die API, Bilder, Skripte - bleibt es bei JSON: ein Skript,
 * das plötzlich HTML bekommt, wäre schlechter dran als mit einem klaren Fehler.
 */

export interface IErrorInfo {
    code: number;
    title: string;
    text: string;
    /** Die kleine Zeile unter den Knöpfen. */
    hint: string;
    /** Beschriftung und Ziel des ersten Knopfes. */
    action: { label: string; href: string };
}

const OVERVIEW = { label: "Zur Übersicht", href: `${DASHBOARD_PATH}/` };
const LOGIN = { label: "Mit Discord anmelden", href: `${DASHBOARD_PATH}/login` };

/** Was zu einem Status gesagt wird. Unbekanntes zählt als Fehler beim Bot. */
export function ErrorInfo(code: number): IErrorInfo {
    switch (code) {
        case 400:
            return {
                code,
                title: "Damit kann der Bot nichts anfangen",
                text: "Die Anfrage war unvollständig oder falsch geschrieben. Wenn du hier über einen Link gelandet bist, stimmt an dem etwas nicht.",
                hint: "Ruf die Seite noch einmal über die Übersicht auf.",
                action: OVERVIEW,
            };

        case 401:
            return {
                code,
                title: "Dafür musst du angemeldet sein",
                text: "Deine Sitzung ist abgelaufen oder es gab noch keine. Nach der Anmeldung landest du wieder hier.",
                hint: "Das Dashboard merkt sich die Anmeldung sieben Tage.",
                action: LOGIN,
            };

        case 403:
            return {
                code,
                title: "Dafür fehlen dir die Rechte",
                text: "Auf diesem Server darfst du das nicht. Dafür braucht es „Server verwalten“ – oder einen Platz auf der Liste des Teams.",
                hint: "Frag jemanden, der den Server verwaltet.",
                action: OVERVIEW,
            };

        case 404:
            return {
                code,
                title: "Diese Seite gibt es nicht",
                text: "Vielleicht ein Tippfehler in der Adresse, vielleicht ist der Link alt. Manchmal ist auch nur das Modul aus, zu dem die Seite gehört.",
                hint: "Steht der Bot gerade frisch da? Dann fehlt ihm vielleicht noch ein Neustart.",
                action: OVERVIEW,
            };

        case 429:
            return {
                code,
                title: "Einen Moment noch",
                text: "Es kamen zu viele Anfragen in kurzer Zeit. Der Bot bremst das absichtlich, damit für alle etwas übrig bleibt.",
                hint: "Warte ein paar Sekunden und lade die Seite neu.",
                action: OVERVIEW,
            };

        case 503:
            return {
                code,
                title: "Der Bot ist gerade nicht bei sich",
                text: "Entweder fehlt die Datenbank oder Discord antwortet nicht. Beides geht meist von allein wieder.",
                hint: "Probier es in einem Moment noch einmal.",
                action: OVERVIEW,
            };

        default:
            return {
                code: code >= 400 && code <= 599 ? code : 500,
                title: "Da ist etwas schiefgegangen",
                text: "Der Fehler liegt beim Bot, nicht bei dir. Er steht im Log; wer ihn gebaut hat, weiß also Bescheid.",
                hint: "Lade die Seite neu – bleibt es dabei, sag jemandem vom Team Bescheid.",
                action: OVERVIEW,
            };
    }
}

/**
 * Bekommt dieser Aufruf eine Seite oder JSON? Eine Seite nur dort, wo ein
 * Mensch hinsieht: ein Aufruf aus dem Browser, der HTML will und nicht an der
 * API, an einem Bild oder an einem Skript hängt.
 */
export function WantsPage(request: FastifyRequest): boolean {
    if (request.method !== "GET" && request.method !== "HEAD") return false;

    const accept = String(request.headers.accept ?? "");

    if (!accept.includes("text/html")) return false;

    const path = request.url.split("?")[0];

    return !/\/(api|assets|images|dcapi)(\/|$)/.test(path);
}

/** Schickt die Fehlerseite - oder JSON, wenn kein Browser fragt. */
export async function SendError(client: BotClient, request: FastifyRequest, reply: FastifyReply, code: number, error?: Error, errorId: string | null = null): Promise<unknown> {
    const info = ErrorInfo(code);

    reply.code(info.code);

    if (!WantsPage(request)) {
        return reply.send({ error: info.title, hint: info.text, statusCode: info.code, ...(errorId ? { errorId } : {}), ...(error && client.developerMode ? { detail: error.message } : {}) });
    }

    const page = await SendPage(client, reply, "error.html", {
        ERR_CODE: String(info.code),
        ERR_TITLE: info.title,
        ERR_TEXT: info.text,
        ERR_HINT: info.hint,
        ERR_ACTION: info.action.label,
        ERR_HREF: info.action.href,
        // Nur Buchstaben, Ziffern und Bindestriche (NewErrorId), muss also nicht maskiert werden.
        ERR_ID: errorId && /^[A-Z0-9-]+$/.test(errorId) ? `<p class="errid">Fehler-ID <code>${errorId}</code> · Das Team weiß schon Bescheid.</p>` : "",
    });

    return page;
}

/** Schreibt einen Fehler ins Log - einmal pro Aufruf, mit Adresse. */
export function LogError(request: FastifyRequest, error: Error, code: number): void {
    const where = `${request.method} ${request.url.split("?")[0]}`;

    if (code >= 500) logger.error(`🌐 ${where}: ${error.message}`);
    else logger.warn(`🌐 ${where} → ${code}: ${error.message}`);
}
