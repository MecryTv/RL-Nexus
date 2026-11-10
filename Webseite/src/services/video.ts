/** W-0062: Ein Video-Link als Player-Adresse. Nur YouTube und Twitch, wie `isVideoLink`. */
export interface IPlayer {
    readonly src: string;
    readonly service: "YouTube" | "Twitch";
}

const YOUTUBE_ID = /^[\w-]{6,20}$/;

/**
 * Die Adresse des Players zu einem Link, `null` wenn er sich nicht einbetten
 * lässt. `parent` ist der eigene Hostname: Twitch spielt nur dort ab.
 */
export function playerOf(link: string, parent: string): IPlayer | null {
    let url: URL;

    try {
        url = new URL(link);
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^(?:www|m)\./, "");
    const path = url.pathname.split("/").filter(Boolean);
    const youtube = (id: string | null | undefined): IPlayer | null =>
        id && YOUTUBE_ID.test(id) ? { src: `https://www.youtube-nocookie.com/embed/${id}`, service: "YouTube" } : null;
    const tail = `parent=${encodeURIComponent(parent)}&autoplay=false`;
    const clip = (slug: string): IPlayer | null =>
        /^[\w-]{3,100}$/.test(slug) ? { src: `https://clips.twitch.tv/embed?clip=${slug}&${tail}`, service: "Twitch" } : null;

    if (host === "youtu.be") return youtube(path[0]);
    if (host === "youtube.com") {
        if (path[0] === "watch") return youtube(url.searchParams.get("v"));
        if (["shorts", "embed", "live"].includes(path[0] ?? "")) return youtube(path[1]);

        return null;
    }
    if (host === "clips.twitch.tv" && path[0]) return clip(path[0]);
    if (host === "twitch.tv") {
        if (path[0] === "videos" && path[1] && /^\d+$/.test(path[1])) return { src: `https://player.twitch.tv/?video=${path[1]}&${tail}`, service: "Twitch" };
        if (path[1] === "clip" && path[2]) return clip(path[2]);
        if (path.length === 1 && path[0] && /^\w{3,25}$/.test(path[0])) return { src: `https://player.twitch.tv/?channel=${path[0]}&${tail}`, service: "Twitch" };
    }

    return null;
}
