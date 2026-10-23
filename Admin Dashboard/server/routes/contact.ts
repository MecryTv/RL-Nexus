import type { FastifyInstance } from "fastify";
import type { IConfig } from "../config.ts";
import { isTrap, parseContact } from "../contact.ts";
import { PublicError } from "../errors.ts";
import { ContactMailUnavailable, notifyContact, sendContactMail } from "../notify.ts";
import { body } from "../validate.ts";

/** Was die Webseite schickt. nginx reicht nexus-emb.de/api/contact hierher, ohne Sitzung. */
export async function publicContactRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.post("/public/contact", { bodyLimit: 32 * 1024, config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
        const input = body(request.body);

        // Die Falle: ausgefüllt heißt, es war kein Mensch. Erfolg melden und
        // verwerfen, sonst probiert es das Skript anders herum noch einmal.
        if (isTrap(input)) return reply.code(204).send();

        const message = parseContact(input);

        // Gespeichert wird nichts: Die Mail in support@ ist die Nachricht. Deshalb
        // hier warten und ehrlich antworten, wenn sie nicht rausging.
        try {
            await sendContactMail(config, message);
        } catch (error) {
            console.error(`📮 Kontaktformular nicht verschickt: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof ContactMailUnavailable) throw new PublicError(503, "Das Kontaktformular ist gerade nicht erreichbar. Schreib uns bitte direkt eine Mail.");
            throw new PublicError(503, "Die Nachricht ging gerade nicht raus. Versuch es in ein paar Minuten noch einmal.");
        }

        notifyContact(config, message);

        return reply.code(204).send();
    });
}
