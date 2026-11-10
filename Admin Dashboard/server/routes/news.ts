import type { FastifyInstance, FastifyRequest } from "fastify";
import { checkPostInput, type IPost, type IPostInput } from "../../shared/news.ts";
import type { IStatusChannelOption } from "../../shared/status.ts";
import { accessOf } from "../access.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { announcePost, chooseNewsChannel, newsChannel, newsChannelOptions } from "../news/announce.ts";
import { createPost, deletePost, getPost, listPosts, updatePost } from "../news/store.ts";
import { publishSite } from "../site/publish.ts";
import { body, id, snowflake } from "../validate.ts";

/** News (W-0062) für Admins und Developer: schreiben, planen, veröffentlichen, ankündigen. */

const actorOf = (request: FastifyRequest): IActor => {
    const me = accessOf(request);

    return { id: me.id, name: me.name };
};

function inputOf(value: unknown): IPostInput {
    const checked = checkPostInput(value);

    if ("problem" in checked) throw new InvalidInput(checked.problem);

    return checked.input;
}

export async function newsRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    /** Veröffentlicht und noch nicht angekündigt: jetzt ankündigen. */
    const after = async (post: IPost, actor: IActor, wasPublished: boolean): Promise<{ post: IPost; warning: string | null }> => {
        const warning = post.status === "published" && post.announce && !post.announcedAt ? await announcePost(config, post, actor) : null;

        if (post.status === "published" && !wasPublished) await audit(actor, "news.publish", `news:${post.id}`, post.title);

        publish("news");
        await publishSite(config, ["news", "partners"]);

        return { post: (await getPost(post.id)) ?? post, warning };
    };

    app.get("/api/news", async () => {
        const channel = await newsChannel();

        return { posts: await listPosts(), channel };
    });

    app.post("/api/news", async (request) => {
        const actor = actorOf(request);
        const post = await createPost(inputOf(request.body), actor);

        await audit(actor, "news.create", `news:${post.id}`, post.title);

        return after(post, actor, false);
    });

    app.get("/api/news/channels", async (): Promise<IStatusChannelOption[]> => newsChannelOptions(config));

    app.put("/api/news/channel", async (request) => {
        const channelId = snowflake(body(request.body).channelId, "Der Kanal");

        await chooseNewsChannel(config, channelId);
        await audit(actorOf(request), "news.channel", null, channelId);

        return { channel: channelId };
    });

    app.put("/api/news/:id", async (request) => {
        const actor = actorOf(request);
        const previous = await getPost(id((request.params as { id?: string }).id));

        if (!previous) throw new PublicError(404, "Diesen Beitrag gibt es nicht mehr.");

        const post = await updatePost(previous.id, inputOf(request.body), actor);

        await audit(actor, "news.update", `news:${post.id}`, post.title);

        return after(post, actor, previous.status === "published");
    });

    app.delete("/api/news/:id", async (request, reply) => {
        const actor = actorOf(request);
        const post = await getPost(id((request.params as { id?: string }).id));

        if (!post) throw new PublicError(404, "Diesen Beitrag gibt es nicht mehr.");

        await deletePost(post.id);
        await audit(actor, "news.delete", `news:${post.id}`, post.title);
        publish("news");
        await publishSite(config, ["news", "partners"]);

        return reply.code(204).send();
    });
}
