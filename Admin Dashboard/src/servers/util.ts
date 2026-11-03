import type { RequestOrigin } from "../../shared/servers.ts";
import { api } from "../api/client";
import { useToast } from "../toast/context";

/** Kleinkram für Server-Freigaben und Eingeladene Server (W-0064), ohne Komponenten. */

export const ORIGIN_TEXT: Readonly<Record<RequestOrigin, string>> = { dm: "aus der DM", wahl: "aus der Wahl-DM", team: "vom Team angelegt" };

const STAMP = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export const stamp = (iso: string): string => STAMP.format(new Date(iso));
export const day = (iso: string): string => DAY.format(new Date(iso));

/** „seit 3 Std.“, „seit 2 Tagen“ */
export function since(iso: string, now = Date.now()): string {
    const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

    if (minutes < 60) return `seit ${minutes} Min.`;
    if (minutes < 48 * 60) return `seit ${Math.round(minutes / 60)} Std.`;

    return `seit ${Math.round(minutes / 1440)} Tagen`;
}

export function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);

    return ((words.length > 1 ? (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "") : (words[0] ?? "?").slice(0, 2)) || "?").toUpperCase();
}

/** Eine Aktion an den Server schicken, Rückmeldung als Toast. Gibt true zurück, wenn es geklappt hat. */
export function useAct(): (path: string, done: string, body?: Readonly<Record<string, unknown>>) => Promise<boolean> {
    const notify = useToast();

    return async (path, done, body = {}) => {
        try {
            await api(path, { method: "POST", body });
            notify(done);

            return true;
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");

            return false;
        }
    };
}
