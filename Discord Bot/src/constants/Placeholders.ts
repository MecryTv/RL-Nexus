/**
 * Die Platzhalter der Ticket-Nachrichten. Das Dashboard führt dieselbe Liste mit
 * Beschriftung und Beispielwert (src/dashboard/client/constants/Placeholders.ts);
 * npm run check:dashboard prüft, dass beide übereinstimmen.
 */
export const PLACEHOLDER_KEYS = [
    "user",
    "user.name",
    "user.id",
    "user.avatar",
    "user.code",
    "guild",
    "guild.id",
    "guild.icon",
    "guild.members",
    "ticket.id",
    "ticket.option",
    "ticket.priority",
    "ticket.opened",
    "ticket.claimer",
    "support.role",
    "closer",
    "reason",
    "bot",
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

export type PlaceholderValues = Partial<Record<PlaceholderKey, string>>;

/**
 * Was als Bildquelle taugt: sie ergeben eine URL. Die ersten beiden gehören den
 * Tickets, die nächsten vier den Notifiern (constants/Streams.ts), {team.logo}
 * den Matchups - in einer fremden Nachricht ergeben sie nichts, und der
 * Baustein fällt weg.
 */
export const IMAGE_PLACEHOLDERS = ["{user.avatar}", "{guild.icon}", "{streamer.avatar}", "{stream.preview}", "{channel.avatar}", "{video.thumbnail}", "{team.logo}"] as const;

/** Werte irgendeiner Platzhalter-Liste - Tickets, Twitch, YouTube. */
export type AnyPlaceholderValues = Readonly<Record<string, string | undefined>>;

/**
 * Setzt ein, was bekannt ist. Unbekannte Platzhalter bleiben stehen, statt zu
 * verschwinden - ein Tippfehler soll in der Nachricht zu sehen sein.
 *
 * Ziffern gehoeren zum Namen: Looking for nummeriert seine Platzhalter nach den
 * Fragen ({frage1}, {antwort1}, ...), und die Zahl steht mitten im Schluessel.
 *
 * Gross und klein ist egal, Unter- und Bindestriche auch: die Team-Übersicht
 * führt Spieler unter ihrem Epic-Namen, und {MecryTv.rank} soll ebenso gehen wie
 * {mecrytv.rank} (PlaceholderKey). Gesucht wird nur unter eigenen Schlüsseln -
 * sonst setzte {constructor} den Bauplan eines Objekts ein.
 */
export function Fill(text: string, values: AnyPlaceholderValues): string {
    const own = (key: string): string | undefined => (Object.hasOwn(values, key) ? values[key] : undefined);

    return text.replace(/\{([A-Za-z0-9._-]+)\}/g, (match, key: string) => own(key) ?? own(PlaceholderKey(key)) ?? match);
}

/** Wie ein Schlüssel gemeint ist: klein, ohne Unter- und Bindestriche. */
export function PlaceholderKey(key: string): string {
    return key.toLowerCase().replace(/[_-]/g, "");
}
