import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkVersionInput, type IChangelogVersion, type IChangelogView, type IVersionInput } from "../../shared/changelog.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import type { IStatusChannelOption } from "../../shared/status.ts";
import { renderChangelogImage } from "../changelog/image.ts";
import { changelogChannel, chooseChangelogChannel, deletePost, deleteVersion, postVersion, previewFooter } from "../changelog/post.ts";
import { createVersion, listVersions, updateVersion, versionOf } from "../changelog/store.ts";
import type { IConfig } from "../config.ts";
import { DatabaseUnavailable, databaseReady } from "../db.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { channelName, statusChannelOptions } from "../status-post.ts";
import { body, id, snowflake } from "../validate.ts";

/**
 * Changelog (W-0061). Nur Developer: registriert im developerOnly-Block von
 * app.ts. Jede Version geht durch checkVersionInput, der Satz kommt so an die
 * Oberfläche. Spec: docs/superpowers/specs/2026-11-09-changelog-design.md.
 */
export async function changelogRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
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

        const channel = await changelogChannel();

        return { versions: await listVersions(), channel: channel ? { id: channel, name: await channelName(config, channel) } : null };
    });

    app.get("/api/changelog/channels", async (): Promise<IStatusChannelOption[]> => statusChannelOptions(config));

    app.put("/api/changelog/channel", async (request): Promise<IChangelogView["channel"]> => {
        ready();

        const channelId = snowflake(body(request.body).channelId, "Der Kanal");

        await chooseChangelogChannel(config, channelId);

        const channel = { id: channelId, name: await channelName(config, channelId) };

        await audit(actorOf(request), "changelog.channel", null, `#${channel.name ?? "?"} (${channelId})`);

        return channel;
    });

    app.get("/api/changelog/:id/bild", async (request, reply) => {
        ready();

        const version = await found(versionId(request));
        const image = await renderChangelogImage(version, previewFooter(version, actorOf(request)));

        return reply.type("image/png").header("Cache-Control", "no-store").send(image.data);
    });

    app.post("/api/changelog/:id/post", async (request): Promise<IChangelogVersion> => {
        ready();

        return postVersion(config, actorOf(request), versionId(request));
    });

    app.delete("/api/changelog/:id/post", async (request): Promise<IChangelogVersion> => {
        ready();

        return deletePost(config, actorOf(request), versionId(request));
    });

    app.delete("/api/changelog/:id", async (request, reply) => {
        ready();

        await deleteVersion(config, actorOf(request), versionId(request));

        return reply.code(204).send();
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
