import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkVersionInput, type IChangelogVersion, type IChangelogView, type IVersionInput } from "../../shared/changelog.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import { createVersion, listVersions, updateVersion, versionOf } from "../changelog/store.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { id } from "../validate.ts";

/**
 * Changelog (W-0061). Nur Developer: registriert im developerOnly-Block von
 * app.ts. Jede Version geht durch checkVersionInput, der Satz kommt so an die
 * Oberfläche. Spec: docs/superpowers/specs/2026-11-09-changelog-design.md.
 */
export async function changelogRoutes(app: FastifyInstance, _options: { config: IConfig }): Promise<void> {
    const ready = (): void => {
        if (!databaseReady()) throw new DatabaseUnavailable();
    };
    const actorOf = (request: FastifyRequest): IActor => {
        const me = accessOf(request);

        return { id: me.id, name: me.name };
    };
    const inputOf = (value: unknown): IVersionInput => {
        const checked = checkVersionInput(value);
        if ("problem" in checked) throw new InvalidInput(checked.problem);

        return checked.input;
    };
    const versionId = (request: FastifyRequest): number => id((request.params as { id?: string }).id);
    const found = async (versionIdValue: number): Promise<IChangelogVersion> => {
        const version = await versionOf(versionIdValue);
        if (!version) throw new PublicError(404, "Diese Version gibt es nicht mehr.");

        return version;
    };
    const what = (input: IVersionInput): string => `${input.version} · ${input.title}`;

    app.get("/api/changelog", async (): Promise<IChangelogView> => {
        ready();

        return { versions: await listVersions(), channel: null };
    });

    app.post("/api/changelog", async (request): Promise<IChangelogVersion> => {
        ready();

        const input = inputOf(request.body);
        const actor = actorOf(request);
        const created = await createVersion(actor, input);

        await audit(actor, "changelog.create", null, what(input));

        return found(created);
    });

    app.put("/api/changelog/:id", async (request): Promise<IChangelogVersion> => {
        ready();

        const target = versionId(request);
        const input = inputOf(request.body);

        await updateVersion(target, input);
        await audit(actorOf(request), "changelog.update", null, what(input));

        return found(target);
    });
}
