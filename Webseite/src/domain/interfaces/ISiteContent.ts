/**
 * Partner, News und Changelog (W-0062), wie das Admin Dashboard sie unter
 * /content/ schreibt. Kopie von `Admin Dashboard/shared/site-content.ts` und
 * den Typen daraus: Die Feldnamen dort sind verbindlich.
 */

export type EntryKind = "partner" | "sponsor" | "supporter";
export type EntryColor = "red" | "blue" | "purple" | "gold" | "green" | "orange" | "cyan" | "silver";

export type SectionType =
    | "stats" | "about" | "teams" | "achievements" | "discord" | "facts" | "modules" | "news"
    | "together" | "offer" | "intro" | "help" | "tournaments" | "links"
    | "gallery" | "video" | "quote" | "text";

export interface ISectionItem {
    readonly label: string;
    readonly value?: string;
    readonly text?: string;
    readonly date?: string;
}

export interface ISection {
    readonly type: SectionType;
    readonly visible: boolean;
    readonly title?: string;
    readonly text?: string;
    readonly items?: readonly ISectionItem[];
    readonly images?: readonly string[];
    readonly url?: string;
    readonly code?: string;
    readonly until?: string | null;
}

export interface IEntryLinks {
    readonly website?: string;
    readonly discord?: string;
    readonly x?: string;
    readonly twitch?: string;
    readonly youtube?: string;
    readonly tiktok?: string;
}

export interface ISiteRef {
    readonly slug: string;
    readonly title: string;
    readonly date: string;
}

export interface ISiteEntry {
    readonly slug: string;
    readonly kind: EntryKind;
    readonly name: string;
    readonly typeLabel: string;
    readonly tier: "main" | "sponsor" | null;
    readonly subtitle: string;
    readonly shortText: string;
    readonly stripText: string | null;
    readonly color: EntryColor;
    readonly logo: string | null;
    readonly banner: string | null;
    readonly since: string | null;
    readonly links: IEntryLinks;
    readonly sections: readonly ISection[];
    readonly tournaments: readonly ISiteRef[];
    readonly news: readonly ISiteRef[];
    readonly onHome: boolean;
}

export interface ISitePartners {
    readonly entries: readonly ISiteEntry[];
}

export interface ISiteTeam {
    readonly name: string;
    readonly group: string | null;
    readonly mmr: number | null;
    readonly rank: string | null;
    readonly players: number;
}

export interface ISiteServer {
    readonly members: number;
    readonly online: number;
    readonly modules: readonly string[];
    readonly teams: readonly ISiteTeam[];
}

export interface ISiteLive {
    readonly at: string;
    readonly servers: Readonly<Record<string, ISiteServer>>;
}

export type NewsKind = "beitrag" | "kurz" | "termin";
export type NewsCategory = "update" | "partner" | "turnier" | "ankuendigung" | "wartung";
export type PinState = "none" | "big" | "small";

export interface IPostEvent {
    readonly startsAt: string;
    readonly endsAt: string | null;
    readonly place: string | null;
}

export type IBlock =
    | { readonly type: "text"; readonly md: string; readonly size: "normal" | "lead"; readonly width: "text" | "full" }
    | { readonly type: "heading"; readonly text: string }
    | { readonly type: "image"; readonly url: string; readonly alt: string; readonly caption: string | null }
    | { readonly type: "gallery"; readonly images: readonly string[] }
    | { readonly type: "callout"; readonly title: string | null; readonly text: string }
    | { readonly type: "quote"; readonly text: string; readonly by: string | null }
    | { readonly type: "partner"; readonly entryId: number }
    | { readonly type: "event"; readonly title: string; readonly startsAt: string; readonly place: string | null }
    | { readonly type: "video"; readonly url: string }
    | { readonly type: "button"; readonly label: string; readonly url: string }
    | { readonly type: "divider" };

export interface ISiteNewsItem {
    readonly slug: string;
    readonly kind: NewsKind;
    readonly category: NewsCategory;
    readonly title: string;
    readonly summary: string;
    readonly cover: string | null;
    readonly publishedAt: string;
    readonly pinned: PinState;
    readonly event: IPostEvent | null;
    readonly entry: { readonly slug: string; readonly name: string } | null;
}

export interface ISiteNews {
    readonly posts: readonly ISiteNewsItem[];
}

export interface ISitePartnerCard {
    readonly slug: string;
    readonly name: string;
    readonly typeLabel: string;
    readonly color: EntryColor;
    readonly logo: string | null;
}

export interface ISiteNewsPost extends ISiteNewsItem {
    readonly blocks: readonly IBlock[];
    readonly author: string;
    readonly updatedAt: string;
    readonly partners: Readonly<Record<string, ISitePartnerCard>>;
}

export type ChangeKind = "neu" | "verbessert" | "behoben";

export interface ISiteVersion {
    readonly version: string;
    readonly releasedOn: string;
    readonly title: string;
    readonly items: readonly { readonly kind: ChangeKind; readonly area: string; readonly text: string }[];
    readonly image: string;
    readonly postedAt: string;
    readonly postedBy: string | null;
    readonly updatedAt: string | null;
    readonly discordUrl: string | null;
}

export interface ISiteChangelog {
    readonly versions: readonly ISiteVersion[];
}
