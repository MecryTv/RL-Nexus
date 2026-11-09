/** Ein Bild als data:-URL. Die CSP von admin.nexus-emb.de lässt blob: in img-src nicht zu. */
export function dataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Die Vorschau ließ sich nicht laden."));
        reader.readAsDataURL(blob);
    });
}
