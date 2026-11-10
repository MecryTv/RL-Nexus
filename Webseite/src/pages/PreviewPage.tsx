import { type JSX, type MouseEvent, useEffect, useMemo, useState } from "react";
import { ModuleCard } from "../components/ui/ModuleCard";
import { PartnerCard } from "../components/partners/PartnerCard";
import { MainSponsor } from "../components/partners/SponsorBlock";
import { SupporterStrip } from "../components/partners/SupporterStrip";
import { SupporterView } from "../components/partners/SupporterWindow";
import { type IPickContext, type PickAction, PickContext } from "../components/preview/pickContext";
import { ModuleStatus } from "../domain/enums/ModuleCategory";
import { BotModule } from "../domain/models/BotModule";
import { type INewsPreview, type IPartnerPreview, type IPreviewMessage, isNewsPreview, isPartnerPreview, isPreviewMessage } from "../services/Content";
import { setCategories } from "../services/categories";
import { ModuleDetailView } from "./ModuleDetailPage";
import { NewsPostView } from "./NewsPostPage";
import { EntryView } from "./PartnerPage";
import styles from "./PreviewPage.module.scss";

/** Nur dieser Rahmen darf Entwürfe schicken, und nur an ihn gehen Antworten. Alles andere wird ignoriert. */
const ADMIN_ORIGIN = import.meta.env.VITE_ADMIN_ORIGIN || (import.meta.env.DEV ? "http://localhost:5174" : "https://admin.nexus-emb.de");
const STATUSES = Object.values(ModuleStatus);

type Draft = IPreviewMessage | IPartnerPreview | INewsPreview;

/**
 * Wem die Seite antwortet: dem Rahmen im Admin Dashboard oder, bei „Vorschau ↗“
 * in einem neuen Tab, dem Fenster, das ihn geöffnet hat. Immer nur an ADMIN_ORIGIN.
 */
const host = (): Window | null => (window.parent !== window ? window.parent : (window.opener as Window | null));

const tell = (message: { readonly type: string; readonly part?: string; readonly action?: PickAction }): void => {
    host()?.postMessage(message, ADMIN_ORIGIN);
};

const isStudioDraft = (data: unknown): boolean =>
    typeof data === "object" && data !== null && ["rlnexus:vorschau-partner", "rlnexus:vorschau-news"].includes(String((data as { type?: unknown }).type));

/** Links führen in der Vorschau nirgendwohin: Ein Klick soll wählen, nicht die Seite im Rahmen wechseln. */
const stayHere = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
};

function PartnerPreview({ draft }: { readonly draft: IPartnerPreview }): JSX.Element {
    const { entry, view, live } = draft;

    if (view === "gross") {
        return entry.kind === "supporter" ? (
            <div className={styles.window}>
                <SupporterView entry={entry} position={1} count={1} />
            </div>
        ) : (
            <EntryView entry={entry} live={live} />
        );
    }

    if (view === "leiste" || entry.kind === "supporter") {
        return (
            <div className={styles.strip}>
                <SupporterStrip supporters={[entry]} onOpen={() => tell({ type: "rlnexus:vorschau-wahl", part: "kopf" })} />
            </div>
        );
    }

    return <div className={entry.tier === "main" ? styles.wide : styles.card}>{entry.tier === "main" ? <MainSponsor entry={entry} /> : <PartnerCard entry={entry} />}</div>;
}

/**
 * Die Live-Vorschau für die Editoren im Admin Dashboard.
 *
 * Ohne Kopf, Fuß und Banner und nicht für Suchmaschinen. Das Dashboard bettet
 * die Seite ein und schickt per postMessage den Entwurf: ein Modul (Kachel oder
 * Detailseite), seit W-0062 auch einen Partner oder einen Beitrag. Gezeigt wird
 * er mit denselben Komponenten wie auf der echten Seite. Nachrichten
 * durchlaufen dieselben Prüfungen wie geladene Inhalte. In Partnern und
 * Beiträgen lässt sich ein Teil anklicken; die Wahl geht zurück ans Dashboard.
 */
export function PreviewPage(): JSX.Element {
    const [draft, setDraft] = useState<Draft | null>(null);

    useEffect(() => {
        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.append(robots);
        document.title = "Vorschau";

        function receive(event: MessageEvent): void {
            if (event.origin !== ADMIN_ORIGIN) return;

            if (isPartnerPreview(event.data) || isNewsPreview(event.data)) {
                setDraft(event.data);
            } else if (isStudioDraft(event.data)) {
                // Ein Entwurf aus einem Studio, der die Prüfung nicht besteht: Es bleibt der letzte gültige Stand.
                tell({ type: "rlnexus:vorschau-ungueltig" });
            } else if (isPreviewMessage(event.data, STATUSES)) {
                setCategories(event.data.categories);
                setDraft(event.data);
            }
        }

        window.addEventListener("message", receive);
        // Sagen, dass die Seite bereit ist. Erst danach schickt das Dashboard den Entwurf.
        tell({ type: "rlnexus:vorschau-bereit" });

        return () => {
            window.removeEventListener("message", receive);
            robots.remove();
        };
    }, []);

    const selected = draft && draft.type !== "rlnexus:vorschau" ? draft.selected : null;
    const pick = useMemo<IPickContext>(
        () => ({
            selected,
            onPick: (part) => tell({ type: "rlnexus:vorschau-wahl", part }),
            onAction: (part, action) => tell({ type: "rlnexus:vorschau-aktion", part, action }),
        }),
        [selected]
    );

    if (draft === null) return <p className={styles.wait}>Warte auf den Entwurf aus dem Admin Dashboard …</p>;

    if (draft.type === "rlnexus:vorschau-partner" || draft.type === "rlnexus:vorschau-news") {
        return (
            <PickContext.Provider value={pick}>
                <div onClickCapture={stayHere}>
                    {draft.type === "rlnexus:vorschau-partner" ? (
                        <PartnerPreview draft={draft} />
                    ) : (
                        <div className={styles.post}>
                            <NewsPostView post={draft.post} />
                        </div>
                    )}
                </div>
            </PickContext.Provider>
        );
    }

    const module = new BotModule({ ...draft.module, ...(draft.commands.length > 0 ? { commands: draft.commands.map((entry) => entry.path) } : {}) });

    return draft.view === "kachel" ? (
        <div className={styles.card}>
            <ModuleCard module={module} />
        </div>
    ) : (
        <ModuleDetailView module={module} detail={draft.detail} />
    );
}
