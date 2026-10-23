import { AutoAction, FilterId, IAutoModSettings, IFilterInfo, IFilterSettings } from "../interfaces/services/automod/IAutoMod";

/**
 * Auto Mod: der Katalog der Filter. Diese Liste ist die Wahrheit - das
 * Dashboard baut seine Oberfläche daraus, der Dienst prüft gegen sie, und
 * npm run check:automod hält beides zusammen. Siehe docs/AutoMod.md.
 */

export const AUTOMOD_MODULE = "automod";

export const MAX_IGNORE = 25;
export const MAX_WORDS = 200;
export const MAX_WORD_LENGTH = 60;
export const MAX_NOTICE = 200;

/** Wie lange der Hinweis im Kanal stehenbleibt. */
export const NOTICE_MS = 8_000;

export const ACTION_LABELS: Record<AutoAction, string> = {
    none: "Nur löschen",
    warn: "Verwarnen",
    timeout: "Timeout",
    kick: "Kicken",
    ban: "Bannen",
};

/** Die Aktionen, für die es einen Fall in der Moderation gibt. */
export const CASE_ACTIONS: AutoAction[] = ["warn", "timeout", "kick", "ban"];

export const FILTERS: readonly IFilterInfo[] = [
    {
        id: "words",
        name: "Wortliste",
        hint: "Was auf der Liste steht, verschwindet",
        icon: "#i-eraser",
        fields: ["words", "whole"],
        limitLabel: "",
        limitHint: "",
        limitMin: 0,
        limitMax: 0,
        wordsLabel: "Wörter",
        wordsHint: "Ein Wort je Zeile. Groß- und Kleinschreibung ist egal",
    },
    {
        id: "invites",
        name: "Einladungen",
        hint: "discord.gg-Links von fremden Servern",
        icon: "#i-link",
        fields: ["allowOwn"],
        limitLabel: "",
        limitHint: "",
        limitMin: 0,
        limitMax: 0,
    },
    {
        id: "links",
        name: "Links",
        hint: "Alle Links außer denen, die du erlaubst",
        icon: "#i-external",
        fields: ["words"],
        limitLabel: "",
        limitHint: "",
        limitMin: 0,
        limitMax: 0,
        wordsLabel: "Erlaubte Domains",
        wordsHint: "Eine je Zeile, etwa youtube.com – Unterdomains zählen mit",
    },
    {
        id: "spam",
        name: "Spam",
        hint: "Zu viele Nachrichten in kurzer Zeit",
        icon: "#i-stats",
        fields: ["limit", "window"],
        limitLabel: "Nachrichten",
        limitHint: "Ab so vielen im Zeitfenster greift der Filter",
        limitMin: 3,
        limitMax: 20,
    },
    {
        id: "repeat",
        name: "Wiederholung",
        hint: "Dieselbe Nachricht mehrfach hintereinander",
        icon: "#i-copy",
        fields: ["limit"],
        limitLabel: "Wiederholungen",
        limitHint: "Ab so vielen gleichen Nachrichten am Stück",
        limitMin: 2,
        limitMax: 10,
    },
    {
        id: "mentions",
        name: "Erwähnungen",
        hint: "Zu viele @ in einer Nachricht",
        icon: "#i-users",
        fields: ["limit"],
        limitLabel: "Erwähnungen",
        limitHint: "Mehr als so viele in einer Nachricht",
        limitMin: 3,
        limitMax: 20,
    },
    {
        id: "caps",
        name: "GROSSBUCHSTABEN",
        hint: "Geschrei ab einer bestimmten Länge",
        icon: "#i-warn",
        fields: ["limit"],
        limitLabel: "Anteil in Prozent",
        limitHint: "Erst ab 10 Zeichen Text, damit „OK\" durchgeht",
        limitMin: 50,
        limitMax: 100,
    },
    {
        id: "emojis",
        name: "Emojis",
        hint: "Zu viele Emojis in einer Nachricht",
        icon: "#i-smile",
        fields: ["limit"],
        limitLabel: "Emojis",
        limitHint: "Mehr als so viele in einer Nachricht",
        limitMin: 3,
        limitMax: 30,
    },
] as const;

export const FILTER_IDS: readonly FilterId[] = FILTERS.map((filter) => filter.id);

export function FilterInfo(id: string): IFilterInfo | undefined {
    return FILTERS.find((filter) => filter.id === id);
}

function Filter(over: Partial<IFilterSettings> = {}): IFilterSettings {
    return {
        on: false,
        delete: true,
        action: "none",
        duration: 600,
        notice: "Das war nichts – deine Nachricht ist weg.",
        limit: 0,
        window: 5,
        words: [],
        whole: true,
        allowOwn: true,
        ...over,
    };
}

export function DefaultAutoModSettings(): IAutoModSettings {
    return {
        filters: {
            words: Filter(),
            invites: Filter({ notice: "Einladungen zu anderen Servern sind hier nicht erwünscht." }),
            links: Filter({ notice: "Links sind hier nur nach Absprache erlaubt." }),
            spam: Filter({ limit: 5, window: 5, action: "timeout", duration: 300, notice: "Langsamer – das war zu viel auf einmal." }),
            repeat: Filter({ limit: 3, notice: "Bitte nicht dieselbe Nachricht mehrfach." }),
            mentions: Filter({ limit: 5, notice: "Bitte nicht so viele auf einmal anpingen." }),
            caps: Filter({ limit: 70, notice: "Nicht schreien – schreib es bitte normal." }),
            emojis: Filter({ limit: 10, notice: "Ein paar Emojis weniger tun es auch." }),
        },
        ignoreChannels: [],
        ignoreRoles: [],
        ignoreMods: true,
        logChannelId: null,
    };
}

/* ----------------------------------------------------------
   Was die Filter erkennen
   ---------------------------------------------------------- */

/** discord.gg/…, discord.com/invite/… und die üblichen Kurzformen. */
export const INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|dsc\.gg|invite\.gg)\/([a-z0-9-]{2,32})/gi;

export const LINK_PATTERN = /(?:https?:\/\/|www\.)([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/\S*)?/gi;

/** Unicode-Emojis und die eigenen des Servers. */
export const EMOJI_PATTERN = /<a?:[a-z0-9_]{2,32}:\d{17,20}>|\p{Extended_Pictographic}/giu;

/** Zeichen, die Leute zwischen Buchstaben streuen, um Filter zu umgehen. */
const SPREAD = /[\s._\-*~|`'"]+/g;

/**
 * Ein Wort für den Vergleich: klein, ohne Zierrat und ohne die üblichen
 * Ersetzungen (0 für o, 3 für e). So fällt auch "s c h e i ß e" auf.
 */
export function Normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t")
        .replace(/@/g, "a")
        .replace(/\$/g, "s")
        .replace(SPREAD, " ");
}

/** Der Anteil Großbuchstaben - nur Buchstaben zählen mit. */
export function CapsShare(text: string): number {
    const letters = [...text].filter((sign) => /\p{L}/u.test(sign));

    if (letters.length < 10) return 0;

    return Math.round((letters.filter((sign) => sign === sign.toUpperCase() && sign !== sign.toLowerCase()).length / letters.length) * 100);
}
