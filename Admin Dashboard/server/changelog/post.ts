import { postableItems, type IChangelogVersion } from "../../shared/changelog.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { query } from "../db.ts";
import { PublicError } from "../errors.ts";
import { remove, shortError, statusChannelOptions, upload } from "../status-post.ts";
import { renderChangelogImage, type IChangelogFooter } from "./image.ts";
import { clearPosted, contentHash, deleteVersionRow, markPosted, versionOf } from "./store.ts";

/**
 * Eine Version in Discord (W-0061): posten, nach einer Änderung dieselbe
 * Nachricht ändern, löschen. Der Kanal liegt auf dem Server des Teams und
 * steht in admin_state. Scheitert Discord, bleibt der gespeicherte Stand.
 */

const CHANNEL_KEY = "changelog_channel";
const NO_RIGHT = /"code":\s*50013\b/;

type IPosted = NonNullable<IChangelogVersion["posted"]>;

const what = (version: IChangelogVersion): string => `${version.version} · ${version.title}`;
/** JJJJ-MM-TT in Berlin. */
const today = (): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

export async function changelogChannel(): Promise<string | null> {
    const [row] = await query<{ value: string }[]>("SELECT value FROM admin_state WHERE name = ?", [CHANNEL_KEY]);

    return row?.value ?? null;
}

/** Der Kanal muss einer aus `statusChannelOptions` sein, also ein Textkanal auf dem Server des Teams. */
export async function chooseChangelogChannel(config: IConfig, channelId: string): Promise<void> {
    if (!(await statusChannelOptions(config)).some((option) => option.id === channelId)) throw new PublicError(400, "Diesen Textkanal gibt es auf dem Server nicht.");

    await query("INSERT INTO admin_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [CHANNEL_KEY, channelId]);
}

async function found(id: number): Promise<IChangelogVersion> {
    const version = await versionOf(id);
    if (!version) throw new PublicError(404, "Diese Version gibt es nicht mehr.");

    return version;
}

async function reach(run: () => Promise<Response>): Promise<Response> {
    try {
        return await run();
    } catch {
        throw new PublicError(502, "Discord ist gerade nicht erreichbar.");
    }
}

async function failed(response: Response, step: string): Promise<never> {
    const answer = await response.text();

    if (response.status === 403 && NO_RIGHT.test(answer)) throw new PublicError(502, "Dem Bot fehlt im Kanal das Recht, Nachrichten mit Dateien zu senden.");

    throw new PublicError(502, shortError(`Discord antwortet mit ${response.status} beim ${step}: ${answer}`));
}

async function send(config: IConfig, version: IChangelogVersion, url: string, method: "POST" | "PATCH", footer: IChangelogFooter): Promise<Response> {
    const image = await renderChangelogImage(version, footer);
    const body = {
        flags: 1 << 15,
        components: [
            { type: 12, items: [{ media: { url: `attachment://${image.name}` }, description: image.alt }] },
            { type: 1, components: [{ type: 2, style: 5, label: "Alle Änderungen", url: `${config.publicUrl}/dev/changelog` }] },
        ],
        attachments: [{ id: 0, filename: image.name }],
    };

    return reach(() => upload(config, url, method, body, [image]));
}

/**
 * Posten oder, schon gepostet, dieselbe Nachricht ändern. Ist sie in Discord
 * weg (404), kommt eine neue in den gewählten Kanal.
 */
export async function postVersion(config: IConfig, actor: IActor, id: number): Promise<IChangelogVersion> {
    const version = await found(id);
    const channel = await changelogChannel();

    if (!channel) throw new PublicError(409, "Wähle zuerst einen Kanal.");
    if (postableItems(version.items).length === 0) throw new PublicError(409, "Nur interne Änderungen, im Post stünde nichts.");

    let target: { readonly channelId: string; readonly messageId: string } | null = null;

    if (version.posted) {
        const { channelId, messageId } = version.posted;
        const patched = await send(config, version, `/channels/${channelId}/messages/${messageId}`, "PATCH", { poster: actor.name, editedOn: today() });

        if (patched.ok) target = { channelId, messageId };
        else if (patched.status !== 404) await failed(patched, "Ändern");
    }

    if (!target) {
        const sent = await send(config, version, `/channels/${channel}/messages`, "POST", { poster: actor.name, editedOn: null });
        if (!sent.ok) await failed(sent, "Schreiben");

        target = { channelId: channel, messageId: String(((await sent.json()) as { id: unknown }).id) };
    }

    await markPosted(id, target.channelId, target.messageId, contentHash(version));
    await audit(actor, "changelog.post", null, what(version));

    return found(id);
}

/** Löscht die Nachricht in Discord. Ist sie schon weg (404), ist das auch gut. */
async function unpost(config: IConfig, posted: IPosted): Promise<void> {
    const gone = await reach(() => remove(config, `/channels/${posted.channelId}/messages/${posted.messageId}`));

    if (!gone.ok && gone.status !== 404) await failed(gone, "Löschen");
}

export async function deletePost(config: IConfig, actor: IActor, id: number): Promise<IChangelogVersion> {
    const version = await found(id);
    if (!version.posted) return version;

    await unpost(config, version.posted);
    await clearPosted(id);
    await audit(actor, "changelog.unpost", null, what(version));

    return found(id);
}

/** Erst der Post, dann die Version: Scheitert Discord, bleibt beides, statt einen Post ohne Eintrag zurückzulassen. */
export async function deleteVersion(config: IConfig, actor: IActor, id: number): Promise<void> {
    const version = await found(id);

    if (version.posted) await unpost(config, version.posted);
    if (!(await deleteVersionRow(id))) throw new PublicError(404, "Diese Version gibt es nicht mehr.");

    await audit(actor, "changelog.delete", null, what(version));
}

/** Für die Vorschau: so, wie der nächste Klick auf „Posten“ es zeichnen würde. */
export function previewFooter(version: IChangelogVersion, actor: IActor): IChangelogFooter {
    return { poster: actor.name, editedOn: version.posted ? today() : null };
}
