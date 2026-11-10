/** Hochgeladene Bilder für Partner und News (W-0062). Liegen unter SITE_DIR/media, die Webseite zeigt sie unter /content/media/. */

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MEDIA_MAX = 8 * 1024 * 1024;
/** Längste Kante nach dem Hochladen. */
export const MEDIA_EDGE = 2000;

export interface IMedia {
    readonly url: string;
    readonly width: number;
    readonly height: number;
    readonly bytes: number;
}

export interface IMediaFile {
    readonly url: string;
    readonly bytes: number;
    readonly at: string;
}
