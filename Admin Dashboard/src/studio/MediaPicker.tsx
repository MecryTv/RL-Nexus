import { type ClipboardEvent, type DragEvent, type JSX, useId, useRef, useState } from "react";
import { MEDIA_MAX, MEDIA_TYPES, type IMedia, type IMediaFile } from "../../shared/media";
import { api, ApiError } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { useToast } from "../toast/context";
import styles from "./MediaPicker.module.scss";

export interface IMediaPickerProps {
    readonly value: string | null;
    readonly onChange: (url: string | null) => void;
    readonly label: string;
    /** Icon des verknüpften Discord-Servers. Ohne gibt es „Von Discord“ nicht. */
    readonly discordIcon?: string | null;
}

const messageOf = (error: unknown): string => (error instanceof ApiError || error instanceof Error ? error.message : "Das Bild ließ sich nicht hochladen.");

function readFile(file: File): Promise<{ readonly mime: string; readonly data: string }> {
    if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return Promise.reject(new Error("Nur PNG, JPG oder WebP."));
    if (file.size > MEDIA_MAX) return Promise.reject(new Error("Ein Bild darf höchstens 8 MB groß sein."));

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const url = String(reader.result);

            resolve({ mime: file.type, data: url.slice(url.indexOf(",") + 1) });
        };
        reader.onerror = () => reject(new Error("Das Bild ließ sich nicht lesen."));
        reader.readAsDataURL(file);
    });
}

/**
 * W-0062 Teil 2: ein Bild wählen – hochladen (Datei, Ablegen, Strg+V), aus der
 * Galerie der hochgeladenen Bilder oder das Icon des Discord-Servers.
 */
export function MediaPicker({ value, onChange, label, discordIcon }: IMediaPickerProps): JSX.Element {
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const [gallery, setGallery] = useState(false);
    const [busy, setBusy] = useState(false);
    // Nach einem Upload lädt die Galerie neu.
    const [uploads, setUploads] = useState(0);
    const notify = useToast();

    const run = async (work: () => Promise<IMedia>): Promise<void> => {
        setBusy(true);

        try {
            const media = await work();

            onChange(media.url);
            setUploads((count) => count + 1);
        } catch (error) {
            notify(messageOf(error), "danger");
        } finally {
            setBusy(false);
        }
    };

    const upload = (file: File | undefined): void => {
        if (!file) return;

        void run(async () => api<IMedia>("/api/media", { method: "POST", body: await readFile(file) }));
    };

    const onDrop = (event: DragEvent): void => {
        event.preventDefault();
        upload(event.dataTransfer.files[0]);
    };

    const onPaste = (event: ClipboardEvent): void => {
        const file = [...event.clipboardData.files].find((entry) => entry.type.startsWith("image/"));

        if (file) {
            event.preventDefault();
            upload(file);
        }
    };

    return (
        <div className={styles.picker} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
            <span className={styles.label} id={`${id}-label`}>
                {label}
            </span>
            <div className={styles.current}>
                {value ? <img src={value} alt="" /> : <span className={styles.empty}>Kein Bild</span>}
            </div>
            <div className={styles.actions} role="group" aria-labelledby={`${id}-label`}>
                <Button size="sm" busy={busy} onClick={() => input.current?.click()}>
                    Hochladen
                </Button>
                <Button size="sm" variant="ghost" aria-expanded={gallery} onClick={() => setGallery((open) => !open)}>
                    Galerie
                </Button>
                {discordIcon && (
                    <Button size="sm" variant="ghost" busy={busy} onClick={() => void run(() => api<IMedia>("/api/media/remote", { method: "POST", body: { url: discordIcon } }))}>
                        Von Discord
                    </Button>
                )}
                {value && (
                    <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                        Entfernen
                    </Button>
                )}
            </div>
            <input ref={input} className={styles.file} type="file" accept={MEDIA_TYPES.join(",")} tabIndex={-1} aria-hidden="true" onChange={(event) => upload(event.target.files?.[0])} />
            <p className={styles.hint}>PNG, JPG oder WebP bis 8 MB. Ablegen oder Strg+V geht auch.</p>
            {gallery && <Gallery key={uploads} value={value} onChange={onChange} />}
        </div>
    );
}

/** Die hochgeladenen Bilder, neueste zuerst. Lädt erst, wenn sie aufgeklappt ist. */
function Gallery({ value, onChange }: { readonly value: string | null; readonly onChange: (url: string) => void }): JSX.Element {
    const images = useApi<{ readonly images: readonly IMediaFile[] }>("/api/media");

    return (
        <ul className={styles.gallery} aria-label="Galerie">
            {(images.data?.images ?? []).map((image) => (
                <li key={image.url}>
                    <button type="button" aria-pressed={image.url === value} onClick={() => onChange(image.url)}>
                        <img src={image.url} alt="" loading="lazy" />
                        <span className={styles.sr}>Dieses Bild nehmen</span>
                    </button>
                </li>
            ))}
            {images.data && images.data.images.length === 0 && <li className={styles.none}>Noch keine Bilder hochgeladen.</li>}
        </ul>
    );
}
