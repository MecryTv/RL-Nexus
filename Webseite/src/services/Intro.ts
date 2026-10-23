/**
 * Das Ende des Intros.
 *
 * Das Intro selbst steht in `index.html`, damit es zu sehen ist, bevor das
 * Bündel geladen ist. Von dort kommt `nexusIntroDone` - aber nur an dem Tag,
 * an dem das Intro wirklich läuft. Sonst gibt es nichts zu beenden.
 */
declare global {
    interface Window {
        nexusIntroDone?: () => void;
    }
}

/**
 * Meldet dem Intro, dass die Seite steht.
 *
 * Wartet auf die Schriften und die Bilder, die gleich zu sehen sind. Bilder
 * mit `loading="lazy"` zählen nicht: die holt der Browser erst beim
 * Hinscrollen, und das Intro stünde bis zu seiner Frist.
 */
export async function finishIntro(): Promise<void> {
    const done = window.nexusIntroDone;

    if (done === undefined) return;

    // Einmal Layout erzwingen: dabei fordert der Browser die Schriften an, die
    // der Text braucht. Vorher wäre `document.fonts.ready` schon erfüllt,
    // obwohl noch nichts geladen ist. Kein `requestAnimationFrame` - das steht
    // in einem Tab im Hintergrund still, und das Intro liefe in seine Frist.
    document.body.getBoundingClientRect();

    const pending = [...document.images].filter((image) => !image.complete && image.loading !== "lazy");

    await Promise.all([document.fonts.ready, ...pending.map((image) => image.decode().catch(() => undefined))]);

    done();
}
