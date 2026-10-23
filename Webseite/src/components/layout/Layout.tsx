import { type JSX, Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { IBanner, ILoaded } from "../../services/Content";
import { Backdrop } from "./Backdrop";
import { Banner } from "./Banner";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { PageLoader } from "../ui/PageLoader";
import { finishIntro } from "../../services/Intro";
import styles from "./Layout.module.scss";

/**
 * Beendet das Intro, sobald die erste Seite steht.
 *
 * Steht im `Suspense` neben dem `Outlet`: React übernimmt ihn erst zusammen mit
 * der nachgeladenen Seite. Säße er davor, ginge das Intro schon beim
 * Ladebalken und nicht bei der fertigen Seite.
 */
function IntroDone(): null {
    useEffect(() => {
        void finishIntro();
    }, []);

    return null;
}

/**
 * Der Rahmen, in dem jede Seite steht.
 *
 * Kopf, Inhalt, Fuß - und der Sprunglink davor, damit man mit der Tastatur
 * nicht durch die ganze Navigation muss, um an den Text zu kommen.
 *
 * Das `Suspense` steht hier und nicht an jeder Route: alle Unterseiten werden
 * nachgeladen, und alle zeigen dabei dasselbe. Sechsmal dieselbe Umhüllung
 * hinzuschreiben heißt nur, sie beim siebten Mal zu vergessen.
 */
export function Layout({ banner }: { readonly banner: ILoaded<IBanner> | null }): JSX.Element {
    const { pathname } = useLocation();

    // Ohne das behält der Browser beim Seitenwechsel die Scroll-Position und
    // die neue Seite beginnt in ihrer Mitte. Nur bei echtem Seitenwechsel, ein
    // Sprung zu einem Anker (#) soll nicht nach oben zurückreißen. Kommt der
    // Wechsel mit Anker (/datenschutz#kontakt) und steht die Seite schon, geht
    // es dorthin. Wird sie noch nachgeladen, holt sie den Sprung selbst nach.
    useEffect(() => {
        const target = window.location.hash === "" ? null : document.getElementById(window.location.hash.slice(1));

        if (target === null) window.scrollTo({ top: 0, behavior: "instant" });
        else target.scrollIntoView({ behavior: "instant" });
    }, [pathname]);

    return (
        <>
            <Backdrop />
            <a className={styles.skip} href="#inhalt">
                Zum Inhalt springen
            </a>
            <Banner banner={banner} />
            <Header />
            <main className={styles.main} id="inhalt">
                <Suspense fallback={<PageLoader />}>
                    <Outlet />
                    <IntroDone />
                </Suspense>
            </main>
            <Footer />
        </>
    );
}
