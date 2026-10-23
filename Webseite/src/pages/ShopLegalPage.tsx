import { type JSX, useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { ShopError, legalPdfUrl, loadLegal } from "../shop/api.ts";
import { type LegalPart, groupBlocks, legalDay } from "../shop/logic.ts";
import type { ILegalText, LegalDoc } from "../shop/types.ts";
import styles from "./LegalPage.module.scss";

/** Je Überschrift ein Abschnitt, wie im Impressum: Die Abstände kommen von dort. */
function sectionsOf(text: ILegalText): LegalPart[][] {
    const sections: LegalPart[][] = [];

    for (const part of groupBlocks(text.blocks)) {
        if (part.kind === "h2" || sections.length === 0) sections.push([]);
        sections[sections.length - 1].push(part);
    }

    return sections;
}

function Part({ part }: { readonly part: LegalPart }): JSX.Element {
    if (part.kind === "list") {
        return (
            <ul>
                {part.items.map((item, index) => (
                    <li key={index}>{item}</li>
                ))}
            </ul>
        );
    }

    if (part.kind === "h2") return <h2>{part.text}</h2>;
    if (part.kind === "h3") return <h3>{part.text}</h3>;

    return <p>{part.text}</p>;
}

const PAGES: Readonly<Record<LegalDoc, { readonly title: string; readonly short: string; readonly lead: string }>> = {
    agb: { title: "Allgemeine Geschäftsbedingungen", short: "AGB", lead: "Die Bedingungen für einen Zugang zum Bot-Dashboard." },
    widerruf: { title: "Widerrufsbelehrung", short: "Widerruf", lead: "Dein Widerrufsrecht und das Formular dafür." },
};

/**
 * AGB und Widerrufsbelehrung. Der Text kommt vom Admin-Server
 * (`shared/legal/` dort), derselbe, der als PDF an der Bestellbestätigung
 * hängt. Ohne Admin-Server gibt es auch keinen Kauf, die Seite sagt dann, wo
 * man den Text sonst bekommt.
 */
export function ShopLegalPage({ doc }: { readonly doc: LegalDoc }): JSX.Element {
    const page = PAGES[doc];
    usePageMeta(page.short, page.lead);

    const [text, setText] = useState<ILegalText | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    // Der Knopf verschwindet beim neuen Versuch. Der Fokus geht auf den Text statt ins Leere.
    const article = useRef<HTMLElement>(null);

    useEffect(() => {
        let alive = true;

        loadLegal(doc).then(
            (next) => {
                if (alive) setText(next);
            },
            (failure: unknown) => {
                if (!alive) return;
                // 404 heißt: Der Server kennt den Text nicht. Alles andere: Er ist gerade nicht da.
                setError(failure instanceof ShopError && failure.status === 404 ? failure.message : "Der Text lässt sich gerade nicht laden.");
            }
        );

        return () => {
            alive = false;
        };
    }, [doc, attempt]);

    return (
        <>
            <PageHeader eyebrow="Rechtliches" title={page.title} lead={page.lead} />

            <div className={["u-shell", styles.page].join(" ")}>
                <article ref={article} tabIndex={-1} className={styles.prose} aria-busy={text === null && error === null}>
                    {error !== null ? (
                        <div role="alert" className={styles.retry}>
                            <p>
                                {error} Du bekommst ihn auch per Mail an <a href={`mailto:${siteConfig.contactMail}`}>{siteConfig.contactMail}</a>.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setError(null);
                                    setAttempt((value) => value + 1);
                                    article.current?.focus();
                                }}
                            >
                                Nochmal versuchen
                            </Button>
                        </div>
                    ) : text === null ? (
                        <PageLoader />
                    ) : (
                        <>
                            {sectionsOf(text).map((parts, index) => (
                                <section key={index}>
                                    {parts.map((part, partIndex) => (
                                        <Part key={partIndex} part={part} />
                                    ))}
                                </section>
                            ))}
                            <p className={styles.updated}>
                                Stand: {legalDay(text.version)} ·{" "}
                                <a href={legalPdfUrl(doc, text.version)} target="_blank" rel="noopener noreferrer">
                                    Als PDF
                                </a>
                            </p>
                        </>
                    )}
                </article>
            </div>
        </>
    );
}
