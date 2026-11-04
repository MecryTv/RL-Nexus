/**
 * Nachrichten über den Bot (W-0058, Spec Teil 1): Inhalt einer DM als Bild
 * im Stil I1, ihre Regeln und Platzhalter. Gilt für Admin-Server und
 * Oberfläche; die Oberfläche zeigt denselben Satz schon beim Tippen, der
 * Server prüft verbindlich.
 */

export const MESSAGE_COLORS = ["blau", "gold", "gruen", "lila", "rot", "grau"] as const;
export type MessageColor = (typeof MESSAGE_COLORS)[number];

export const COLOR_HEX: Readonly<Record<MessageColor, string>> = {
    blau: "#5aa9e6",
    gold: "#f0b232",
    gruen: "#23a55a",
    lila: "#a46cf0",
    rot: "#f23f43",
    grau: "#80848e",
};

export const COLOR_LABELS: Readonly<Record<MessageColor, string>> = { blau: "Blau", gold: "Gold", gruen: "Grün", lila: "Lila", rot: "Rot", grau: "Grau" };

/** Grenzen je Feld in Zeichen, Kacheln und Knöpfe als Anzahl. */
export const MESSAGE_LIMITS = {
    stamp: 14,
    title: 80,
    intro: 160,
    big: 40,
    note: 160,
    boxes: 3,
    boxLabel: 30,
    boxText: 600,
    buttons: 2,
    buttonLabel: 40,
    url: 300,
} as const;

export interface IMessageBox {
    readonly label: string;
    readonly text: string;
}

export interface IMessageButton {
    readonly label: string;
    readonly url: string;
}

export interface IMessageContent {
    readonly color: MessageColor;
    readonly stamp: string;
    readonly title: string;
    readonly intro: string;
    /** Große Zeile (Termin, Zahl) mit grauer Zeile darunter. */
    readonly big: { readonly text: string; readonly note: string } | null;
    readonly boxes: readonly IMessageBox[];
    /** Link-Knöpfe unter dem Bild, nicht im Bild. */
    readonly buttons: readonly IMessageButton[];
    /** Fußzeile mit dem Namen des Absenders statt „Nachricht vom Team“. */
    readonly signed: boolean;
}

/** Ein leerer Inhalt für ein neues Formular. */
export const EMPTY_CONTENT: IMessageContent = { color: "blau", stamp: "", title: "", intro: "", big: null, boxes: [{ label: "", text: "" }], buttons: [], signed: false };

/** Eine DM alle 2 Sekunden: weit unter dem, was Discord als Spam einstuft. */
export const SEND_EVERY_MS = 2000;

/** Wie lange das Senden an count Personen dauert, in Minuten, aufgerundet. */
export function minutesFor(count: number): number {
    return Math.ceil((count * SEND_EVERY_MS) / 60_000);
}

/** Tag des Versands, „4. November 2026“, Berliner Zeit. */
export function berlinDay(date: Date): string {
    return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
}

/* --- Regeln ---------------------------------------------------------------- */

/**
 * Kopie von SENSITIVE aus Discord Bot/src/services/ApplyService.ts (W-0048).
 * Ändert sich die Liste dort, hier mitziehen. Absichtlich streng: Auch „Wir
 * fragen nie nach deinem Passwort“ fällt durch (Spec, Entscheidung 2).
 */
const SENSITIVE = /pass(wort|word)|kennwort|\btoken\b|\b2fa\b|zwei-?faktor|two-?factor|authenticator|backup-?codes?|wiederherstellungs-?code|recovery-?code|kreditkarte|credit ?card|\biban\b|\bcv[cv]\b|seed ?phrase/i;

const PLACEHOLDER = /\{([^{}]*)\}/g;
const ALLOWED_PLACEHOLDERS = new Set(["name", "datum"]);
const EMOJI = /\p{Extended_Pictographic}/u;
/** Ein Wort, das wie eine Domain aussieht, mit oder ohne https://. */
const DOMAIN = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?![a-z0-9-])/gi;

const EMPTY_PROBLEM = "Die Nachricht ist leer: Sie braucht eine große Zeile oder mindestens eine Kachel.";
const FORM_PROBLEM = "Die Nachricht hat nicht die erwartete Form.";
const EMOJI_PROBLEM = "Emojis kann das Bild nicht zeigen.";
const LINK_PROBLEM = "Knöpfe dürfen nur auf nexus-emb.de oder einen Kanal des RL-Nexus-Servers zeigen.";
const ADDRESS_PROBLEM = "Im Text dürfen nur Adressen von nexus-emb.de oder discord.com stehen.";
const SENSITIVE_PROBLEM = "Nachrichten dürfen nicht nach Passwort, Token, Zwei-Faktor-Code oder Zahlungsdaten fragen.";

const ownHost = (host: string): boolean => host === "nexus-emb.de" || host.endsWith(".nexus-emb.de");
const discordHost = (host: string): boolean => host === "discord.com" || host === "www.discord.com";

/** Zeigt der Link auf nexus-emb.de oder einen Kanal des RL-Nexus-Servers? Nur https, ohne Zugangsdaten in der Adresse. */
function linkAllowed(raw: string, guildId: string): boolean {
    let url: URL;

    try {
        url = new URL(raw);
    } catch {
        return false;
    }

    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (ownHost(url.hostname)) return true;

    return discordHost(url.hostname) && (url.pathname === `/channels/${guildId}` || url.pathname.startsWith(`/channels/${guildId}/`));
}

function addressesAllowed(text: string): boolean {
    for (const match of text.matchAll(DOMAIN)) {
        const host = (match[1] ?? "").toLowerCase();

        if (!ownHost(host) && !discordHost(host)) return false;
    }

    return true;
}

/** Ein Textfeld: getrimmt, Zeilenumbrüche zu Leerzeichen (außer keepLines), sonst null bei falscher Form. */
function textOf(value: unknown, keepLines = false): string | null {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;

    const text = value.replace(/\r\n?/g, "\n");

    return (keepLines ? text : text.replace(/\s*\n\s*/g, " ")).trim();
}

const record = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

class Problem extends Error {}

function field(value: unknown, label: string, max: number, required: boolean, keepLines = false): string {
    const text = textOf(value, keepLines);

    if (text === null) throw new Problem(FORM_PROBLEM);
    if (required && !text) throw new Problem(`${label} fehlt.`);
    if (text.length > max) throw new Problem(`${label} darf höchstens ${max} Zeichen haben.`);

    return text;
}

function shape(value: unknown): IMessageContent {
    if (!record(value)) throw new Problem(FORM_PROBLEM);

    const color = MESSAGE_COLORS.find((entry) => entry === value.color);
    if (!color) throw new Problem("Diese Farbe gibt es nicht.");
    if (typeof value.signed !== "boolean") throw new Problem(FORM_PROBLEM);

    const stamp = field(value.stamp, "Der Stempel", MESSAGE_LIMITS.stamp, true);
    const title = field(value.title, "Der Titel", MESSAGE_LIMITS.title, true);
    const intro = field(value.intro, "Die Einleitung", MESSAGE_LIMITS.intro, false);

    let big: IMessageContent["big"] = null;

    if (value.big !== null && value.big !== undefined) {
        if (!record(value.big)) throw new Problem(FORM_PROBLEM);

        const text = field(value.big.text, "Die große Zeile", MESSAGE_LIMITS.big, false);
        const note = field(value.big.note, "Die Zeile unter der großen Zeile", MESSAGE_LIMITS.note, false);

        // Ganz leer heißt: keine große Zeile. Nur eine Notiz ohne Zeile geht nicht.
        if (text || note) {
            if (!text) throw new Problem("Die große Zeile fehlt.");
            big = { text, note };
        }
    }

    const boxes = value.boxes ?? [];
    if (!Array.isArray(boxes)) throw new Problem(FORM_PROBLEM);
    if (boxes.length > MESSAGE_LIMITS.boxes) throw new Problem(`Es gehen höchstens ${MESSAGE_LIMITS.boxes} Kacheln.`);

    const buttons = value.buttons ?? [];
    if (!Array.isArray(buttons)) throw new Problem(FORM_PROBLEM);
    if (buttons.length > MESSAGE_LIMITS.buttons) throw new Problem(`Es gehen höchstens ${MESSAGE_LIMITS.buttons} Knöpfe.`);

    return {
        color,
        stamp,
        title,
        intro,
        big,
        boxes: boxes.map((box: unknown) => {
            if (!record(box)) throw new Problem(FORM_PROBLEM);

            return { label: field(box.label, "Die Überschrift einer Kachel", MESSAGE_LIMITS.boxLabel, false), text: field(box.text, "Der Text einer Kachel", MESSAGE_LIMITS.boxText, true, true) };
        }),
        buttons: buttons.map((button: unknown) => {
            if (!record(button)) throw new Problem(FORM_PROBLEM);

            return { label: field(button.label, "Die Beschriftung eines Knopfs", MESSAGE_LIMITS.buttonLabel, true), url: field(button.url, "Der Link eines Knopfs", MESSAGE_LIMITS.url, true) };
        }),
        signed: value.signed,
    };
}

/** Was im Bild steht. */
function imageTexts(content: IMessageContent): string[] {
    return [content.stamp, content.title, content.intro, ...(content.big ? [content.big.text, content.big.note] : []), ...content.boxes.flatMap((box) => [box.label, box.text])];
}

/**
 * Prüft Form und Regeln 1–6 der Spec. Gibt den bereinigten Inhalt zurück
 * (getrimmt, Zeilenumbrüche außer in Kacheltexten zu Leerzeichen), sonst den
 * Satz für die Oberfläche.
 */
export function checkMessage(value: unknown, guildId: string): { readonly content: IMessageContent } | { readonly problem: string } {
    let content: IMessageContent;

    try {
        content = shape(value);
    } catch (error) {
        if (error instanceof Problem) return { problem: error.message };
        throw error;
    }

    if (!content.big && content.boxes.length === 0) return { problem: EMPTY_PROBLEM };

    // Platzhalter sind in allen Textfeldern erlaubt, Links bleiben ohne.
    const texts = [...imageTexts(content), ...content.buttons.map((button) => button.label)];

    for (const text of texts) {
        for (const match of text.matchAll(PLACEHOLDER)) {
            if (!ALLOWED_PLACEHOLDERS.has(match[1] ?? "")) return { problem: `${match[0]} gibt es nicht. Erlaubt: {name}, {datum}.` };
        }
    }

    if (imageTexts(content).some((text) => EMOJI.test(text))) return { problem: EMOJI_PROBLEM };
    if (content.buttons.some((button) => !linkAllowed(button.url, guildId))) return { problem: LINK_PROBLEM };
    if (!texts.every(addressesAllowed)) return { problem: ADDRESS_PROBLEM };
    if (texts.some((text) => SENSITIVE.test(text))) return { problem: SENSITIVE_PROBLEM };

    return { content };
}

/**
 * Platzhalter einsetzen, in einem Durchlauf: Der eingesetzte Name wird nicht
 * noch einmal nach Platzhaltern durchsucht, und $& oder $1 darin bleiben
 * wörtlich stehen. Links bleiben, wie sie sind.
 */
export function fillContent(content: IMessageContent, values: { readonly name: string; readonly date: Date }): IMessageContent {
    const day = berlinDay(values.date);
    const fill = (text: string): string => text.replace(/\{(name|datum)\}/g, (_match, key: string) => (key === "name" ? values.name : day));

    return {
        ...content,
        stamp: fill(content.stamp),
        title: fill(content.title),
        intro: fill(content.intro),
        big: content.big ? { text: fill(content.big.text), note: fill(content.big.note) } : null,
        boxes: content.boxes.map((box) => ({ label: fill(box.label), text: fill(box.text) })),
        buttons: content.buttons.map((button) => ({ label: fill(button.label), url: button.url })),
    };
}

/* --- API ------------------------------------------------------------------- */

export type MessageState = "running" | "paused" | "done" | "cancelled";
export type MessageAudienceKind = "all" | "one";

export const MESSAGE_STATE_LABELS: Readonly<Record<MessageState, string>> = { running: "Läuft", paused: "Angehalten", done: "Fertig", cancelled: "Abgebrochen" };

/** Eine Nachricht an alle, die gerade läuft oder angehalten ist. */
export interface IMessageRun {
    readonly id: number;
    readonly state: MessageState;
    readonly title: string;
    readonly templateName: string;
    readonly total: number;
    readonly sent: number;
    readonly failed: number;
    readonly skipped: number;
    readonly open: number;
    readonly pauseReason: string | null;
}

/** Für „An alle (N)“, die Chips und ob gerade eine läuft. */
export interface IMessageAudience {
    /** Personen mit Daten bei RL Nexus. */
    readonly people: number;
    /** Davon gesperrt, bekommen nichts. */
    readonly banned: number;
    /** Bekommen die Nachricht. */
    readonly recipients: number;
    readonly running: IMessageRun | null;
    readonly guildId: string;
}

export interface IMessageEntry {
    readonly id: number;
    readonly templateName: string;
    readonly title: string;
    readonly audience: MessageAudienceKind;
    readonly target: { readonly id: string; readonly name: string | null } | null;
    readonly total: number;
    readonly sent: number;
    readonly failed: number;
    readonly skipped: number;
    readonly state: MessageState;
    readonly createdName: string;
    readonly createdAt: string;
    readonly finishedAt: string | null;
}

export interface IMessageDetail extends IMessageEntry {
    readonly pauseReason: string | null;
    /** Wer die Nachricht nicht bekam, mit Grund. */
    readonly misses: readonly { readonly id: string; readonly name: string | null; readonly reason: string }[];
}

export interface IMessageTemplate {
    readonly id: number;
    readonly name: string;
    readonly audience: MessageAudienceKind;
    readonly content: IMessageContent;
    readonly updatedName: string;
    readonly updatedAt: string;
}

export interface IMessagePerson {
    readonly id: string;
    readonly name: string | null;
    readonly avatar: string | null;
    readonly state: "ok" | "nodata" | "deleted" | "banned";
}

export interface ISendResult {
    readonly sent: boolean;
    readonly reason: string | null;
}
