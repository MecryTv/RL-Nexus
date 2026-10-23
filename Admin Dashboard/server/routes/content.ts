import type { FastifyInstance, FastifyRequest } from "fastify";
import { CONTENT_DOCS, CONTENT_LIMITS, MODULE_ID, type ContentDoc, type ICategories, type ICategory, type IContentMeta, type IEnvelope, type IModules } from "../../shared/content.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import { publish } from "../events.ts";
import type { IConfig } from "../config.ts";
import { contentMeta, readContent, resetContent, writeContent } from "../content.ts";
import { bannerOf, parseBanner, parseCategories, parseDetail, parseModules, parseTeam } from "../content-rules.ts";
import { COMMANDS_FILE, syncCommands } from "../commands-sync.ts";
import { InvalidInput, PublicError } from "../errors.ts";
import { body } from "../validate.ts";

/**
 * Banner, Team, Modulliste und Detailtexte der Hauptseite. Gespeichert wird
 * nur mit der Revision, die der Editor geladen hat (sonst 409), und nur, was
 * die Prüfregeln aus content-rules.ts besteht.
 */

/** Was gespeichert wird, prüft der Parser seines Inhalts. Module und Kategorien prüfen gegeneinander, deshalb mit dem Stand des anderen. */
type Parser = (data: unknown, meta: IContentMeta, config: IConfig) => Promise<unknown>;

/** Die Kategorien, wie sie gelten: gespeichert, sonst Standard der Webseite, sonst die eingebauten aus meta.json. */
async function categoriesOf(config: IConfig, meta: IContentMeta): Promise<IEnvelope<ICategories>> {
    const stored = (await readContent(config, "categories.json")) as IEnvelope<ICategories> | null;

    return stored ?? { revision: 0, updatedAt: null, updatedBy: null, data: { categories: meta.categories.map((entry): ICategory => ({ id: entry.id, label: entry.label, color: entry.accent })) } };
}

const PARSERS: Readonly<Record<ContentDoc, Parser>> = {
    banner: async (data) => parseBanner(data),
    team: async (data, meta) => parseTeam(data, meta),
    modules: async (data, meta, config) => parseModules(data, meta, (await categoriesOf(config, meta)).data.categories.map((entry) => entry.id)),
    categories: async (data, meta, config) => {
        const modules = (await readContent(config, "modules.json"))?.data as IModules | undefined;

        return parseCategories(data, meta, { modules: modules ?? null, previous: (await categoriesOf(config, meta)).data.categories });
    },
};

/** Ein neues Modul hat noch keinen Detailtext, weder gespeichert noch auf der Webseite. */
const NO_DETAIL: IEnvelope<null> = { revision: 0, updatedAt: null, updatedBy: null, data: null };

function docOf(request: FastifyRequest): ContentDoc {
    const doc = (request.params as { doc?: string }).doc;
    if (!(CONTENT_DOCS as readonly unknown[]).includes(doc)) throw new PublicError(404, "Diesen Inhalt gibt es nicht.");

    return doc as ContentDoc;
}

/** Der Dateiname des Detailtexts. Die ID ist geprüft, ein Weg aus dem Ordner heraus ist damit ausgeschlossen. */
function detailFile(request: FastifyRequest): { readonly id: string; readonly file: string } {
    const id = (request.params as { id?: string }).id ?? "";
    if (!MODULE_ID.test(id) || id.length > CONTENT_LIMITS.modules.id) throw new InvalidInput("Die Modul-ID ist ungültig.");

    return { id, file: `details/${id}.json` };
}

function revisionOf(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new InvalidInput("Die Revision fehlt. Lad den Editor neu.");

    return value;
}

/** Banner, Team und Module haben immer einen Standard. Fehlt er, ist die Webseite nicht exportiert. */
function withDefault(envelope: IEnvelope<unknown> | null, doc: ContentDoc): IEnvelope<unknown> {
    if (envelope === null) throw new PublicError(503, `Die Webseite liefert keinen Stand für „${doc}“. Läuft dort npm run export?`);

    return envelope;
}

export async function contentRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    app.get("/api/content/meta", async () => contentMeta(config));

    // Wohin der Modul-Editor die Vorschau lädt, und von welchem Ursprung er Antworten annimmt.
    app.get("/api/content/vorschau", async () => ({ url: config.previewUrl, origin: new URL(config.previewUrl).origin }));

    app.get("/api/content/details/:id", async (request) => (await readContent(config, detailFile(request).file)) ?? NO_DETAIL);

    app.put("/api/content/details/:id", async (request) => {
        const actor = accessOf(request);
        const { id, file } = detailFile(request);
        const input = body(request.body);
        const revision = revisionOf(input.revision);
        const data = parseDetail(input.data, await contentMeta(config));
        const saved = await writeContent(config, file, revision, data, actor.name);

        await audit(actor, "content.save", `details/${id}`, `Revision ${saved.revision}`);

        publish("content");

        return saved;
    });

    app.delete("/api/content/details/:id", async (request) => {
        const actor = accessOf(request);
        const { id, file } = detailFile(request);

        await resetContent(config, file);
        await audit(actor, "content.reset", `details/${id}`);
        publish("content");

        return (await readContent(config, file)) ?? NO_DETAIL;
    });

    // Die Commands schreibt nur der Abgleich mit dem Bot. Lesen und Anstoßen geht mit jeder Sitzung.
    app.get("/api/content/commands", async () => (await readContent(config, COMMANDS_FILE)) ?? NO_DETAIL);

    app.post("/api/content/commands/abholen", async (request) => {
        const actor = accessOf(request);
        const result = await syncCommands(config, actor.name);
        if (result === "offline") throw new PublicError(503, "Der Bot antwortet gerade nicht. Die Commands bleiben, wie sie sind.");

        return { result, envelope: (await readContent(config, COMMANDS_FILE)) ?? NO_DETAIL };
    });

    app.get("/api/content/:doc", async (request) => {
        const doc = docOf(request);

        // Vor dem ersten Export der Webseite gibt es keine categories.json. Dann gelten die eingebauten.
        if (doc === "categories") return categoriesOf(config, await contentMeta(config));

        const envelope = withDefault(await readContent(config, `${doc}.json`), doc);

        // Ein Banner in der alten Form (tone) bekommt der Editor schon in der neuen.
        return doc === "banner" ? { ...envelope, data: bannerOf(envelope.data) ?? envelope.data } : envelope;
    });

    app.put("/api/content/:doc", async (request) => {
        const actor = accessOf(request);
        const doc = docOf(request);
        const input = body(request.body);
        const revision = revisionOf(input.revision);
        const data = await PARSERS[doc](input.data, await contentMeta(config), config);
        const saved = await writeContent(config, `${doc}.json`, revision, data, actor.name);

        await audit(actor, "content.save", doc, `Revision ${saved.revision}`);

        publish("content");

        return saved;
    });

    app.delete("/api/content/:doc", async (request) => {
        const actor = accessOf(request);
        const doc = docOf(request);

        await resetContent(config, `${doc}.json`);
        await audit(actor, "content.reset", doc);
        publish("content");

        return withDefault(await readContent(config, `${doc}.json`), doc);
    });
}
