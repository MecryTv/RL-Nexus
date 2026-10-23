import type { FastifyInstance } from "fastify";
import type { IConfig } from "../config.ts";
import { PublicError } from "../errors.ts";
import { lookupUser } from "../users.ts";
import { snowflake } from "../validate.ts";

/** Name und Avatar zu einer eingetippten ID, für die Vorschau in Formularen. */
export async function userRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/users/:id", async (request) => {
        const user = await lookupUser(config, snowflake((request.params as { id?: string }).id));
        if (!user) throw new PublicError(404, "Discord kennt keine Person mit dieser ID.");

        return user;
    });
}
