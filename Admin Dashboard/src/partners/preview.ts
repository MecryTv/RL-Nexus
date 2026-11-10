import type { IPost } from "../../shared/news.ts";
import { slugify, type IEntry, type IEntryInput } from "../../shared/partners.ts";
import type { IBotShowcase } from "../../shared/servers.ts";
import { buildPartners, type ISiteEntry, type ISiteLive } from "../../shared/site-content.ts";

/** W-0062 Teil 2: Was das Partner-Studio an /vorschau schickt (Protokoll aus Teil 3 Task 9). */

export type ISiteServer = ISiteLive["servers"][string];

export interface IPartnerContext {
    /** null: noch nicht gespeichert. */
    readonly id: number | null;
    readonly slug: string | null;
    readonly entries: readonly IEntry[];
    readonly posts: readonly IPost[];
    readonly showcase: IBotShowcase | null;
    readonly now: Date;
}

export interface IPartnerPreviewMessage {
    readonly type: "rlnexus:vorschau-partner";
    readonly view: "gross" | "karte" | "leiste";
    readonly entry: ISiteEntry;
    readonly live: ISiteServer | null;
    readonly selected: string | null;
}

/**
 * Der Entwurf so, wie die Webseite ihn veröffentlicht sähe. Anders als beim
 * Veröffentlichen bleibt er sichtbar und behält die ausgeblendeten Abschnitte:
 * Die Webseite blendet sie aus, der Index `abschnitt:<i>` passt dann zum Entwurf.
 */
export function partnerMessage(input: IEntryInput, context: IPartnerContext, view: IPartnerPreviewMessage["view"], selected: string | null): IPartnerPreviewMessage {
    const at = context.now.toISOString();
    const draft: IEntry = {
        ...input,
        visible: true,
        hideAfterEnd: false,
        id: context.id ?? 0,
        slug: context.slug ?? slugify(input.name, new Set()),
        position: 0,
        createdName: "",
        createdAt: at,
        updatedAt: at,
        role: null,
        groupGranted: false,
    };
    const [built] = buildPartners([draft], context.posts, context.now).entries;
    const live =
        input.guildId && context.showcase
            ? { members: context.showcase.members, online: context.showcase.online, modules: context.showcase.modules, teams: input.kind === "partner" && input.showTeams ? context.showcase.teams : [] }
            : null;

    return { type: "rlnexus:vorschau-partner", view, entry: { ...built!, sections: input.sections }, live, selected };
}
