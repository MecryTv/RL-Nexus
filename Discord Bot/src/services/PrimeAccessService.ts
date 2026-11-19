import { AttachmentBuilder, MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { IPrimeAccessCard, PRIME_ACCESS_URL, PrimeAccessAlt, PrimeAccessColor, RenderPrimeAccessCard } from "../builder/PrimeAccessCard";
import logger from "../utils/logger";

const FILE = "prime-zugang.png";

/** Die Zeile unter dem Bild: was live zählen soll, als Discord-Zeitstempel. */
function lineOf(card: IPrimeAccessCard): string {
    const stamp = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;
    const key = " · neuer Schlüssel gehört in `PRIME_API_TOKEN`";

    if (card.state === "soon") return `Läuft ab ${stamp(card.at)}${key}`;
    if (card.state === "locked") return `Abgelehnt seit ${stamp(card.at)}${key}`;

    return `Wieder da seit ${stamp(card.until ?? card.now)}`;
}

/** Die DM nach Entwurf D: Bild mit Alt-Text, darunter die Zeile und der Knopf zur Prime-Kontoseite. */
export async function PrimeAccessMessage(card: IPrimeAccessCard) {
    const file = new AttachmentBuilder(await RenderPrimeAccessCard(card), { name: FILE });
    const container = new ComponentV2Builder({ accentColor: PrimeAccessColor(card.state) as `#${string}` })
        .image(`attachment://${FILE}`, PrimeAccessAlt(card))
        .subtext(lineOf(card))
        .buttons({ url: PRIME_ACCESS_URL, label: "Prime-Konto öffnen" });

    return { components: [container.build()], files: [file], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } } as const;
}

/**
 * Schickt die DM an jeden in DEV_USER_IDs, wie Guardian es mit Fehlern tut.
 * Geschlossene DMs oder unbekannte IDs landen nur im Log. Gibt zurück, an wie
 * viele sie rausging.
 */
export async function SendPrimeAccess(client: BotClient, card: IPrimeAccessCard): Promise<number> {
    const ids = client.config.DEV_USER_IDs;

    if (!ids.length) return 0;

    const message = await PrimeAccessMessage(card);
    let sent = 0;

    for (const id of ids) {
        const user = await client.users.fetch(id).catch(() => null);

        if (!user) {
            logger.warn(`🎮 Prime-Zugang: Developer ${id} nicht gefunden - keine DM.`);
            continue;
        }

        await user
            .send(message)
            .then(() => sent++)
            .catch(() => logger.warn(`🎮 Prime-Zugang: DM an ${user.tag} ging nicht raus - Direktnachrichten zu?`));
    }

    return sent;
}
