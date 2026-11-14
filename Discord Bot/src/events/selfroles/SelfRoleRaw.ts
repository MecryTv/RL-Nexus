import { Events, GatewayDispatchEvents, GatewayDispatchPayload } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/**
 * Self Roles (W-0101): Reaktionen an Panels und bearbeitete angehängte
 * Nachrichten, als Rohereignis. Die normalen Ereignisse kämen für Nachrichten
 * außerhalb des Caches nur mit Partials, und die würden jeden anderen Handler
 * mit halben Objekten beliefern.
 */
export default class SelfRoleRaw extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.Raw,
            description: "Vergibt Rollen über Reaktionen und hängt verlorene Reihen wieder an",
            once: false,
        });
    }

    async Execute(packet: GatewayDispatchPayload): Promise<void> {
        try {
            switch (packet.t) {
                case GatewayDispatchEvents.MessageReactionAdd:
                    await this.client.selfRoleService.Reaction(packet.d, true);
                    break;
                case GatewayDispatchEvents.MessageReactionRemove:
                    await this.client.selfRoleService.Reaction(packet.d, false);
                    break;
                case GatewayDispatchEvents.MessageUpdate:
                    await this.client.selfRoleService.Edited(packet.d);
                    break;
            }
        } catch (error) {
            logger.warn(`🎭 Self Roles: ${packet.t} nicht verarbeitet: ${String(error)}`);
        }
    }
}
