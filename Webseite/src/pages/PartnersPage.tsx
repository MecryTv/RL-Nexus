import { type JSX, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ISiteEntry } from "../domain/interfaces/ISiteContent";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePartners } from "../services/siteContent";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { PartnerCard } from "../components/partners/PartnerCard";
import { SponsorBlock } from "../components/partners/SponsorBlock";
import { SupporterStrip } from "../components/partners/SupporterStrip";
import { SupporterWindow } from "../components/partners/SupporterWindow";
import partnerStyles from "../components/partners/partners.module.scss";
import styles from "./PartnersPage.module.scss";

/** Filter über den Partnern, `?art=`. Die Schlüssel folgen den Arten aus dem Admin Dashboard. */
const FILTERS: readonly { readonly key: string; readonly label: string; readonly matches: (entry: ISiteEntry) => boolean }[] = [
    { key: "organisation", label: "Organisationen", matches: (entry) => entry.typeLabel === "Organisation" },
    { key: "creator", label: "Creator", matches: (entry) => entry.typeLabel === "Creator" },
    { key: "liga", label: "Ligen & Turniere", matches: (entry) => entry.typeLabel === "Liga" },
    { key: "community", label: "Communities", matches: (entry) => entry.typeLabel === "Community" },
];

const SPONSOR_WANTED = "/kontakt?thema=sponsoring";
const PARTNER_WANTED = "/kontakt?thema=partnerschaft";

/** Zustand im Verlauf: Das Fenster wurde hier geöffnet, Zurück schließt es also. */
interface IOpenedHere {
    readonly supporter?: boolean;
}

function Join({ empty }: { readonly empty: boolean }): JSX.Element {
    return (
        <Panel className={styles.cta} accent="rgb(255 30 45 / 55%)" cut="lg">
            <div>
                <h2>{empty ? "Noch ist hier niemand eingetragen" : "Mitmachen?"}</h2>
                <p>
                    {empty
                        ? "Die ersten Partner und Sponsoren stehen bald hier. Wer dazugehören will, schreibt uns."
                        : "Ob als Organisation oder als Firma: Schreibt uns, was ihr vorhabt."}
                </p>
            </div>
            <div className={styles.actions}>
                <Button to={PARTNER_WANTED} variant="outline">
                    Partner werden
                </Button>
                <Button to={SPONSOR_WANTED} trailingIcon="arrow-right">
                    Sponsor werden
                </Button>
            </div>
        </Panel>
    );
}

/**
 * W-0062: Partner/Sponsorings. Oben die Sponsoren und die Unterstützer, darunter
 * die Partner mit Filter nach Art. Ein Unterstützer öffnet sich als Fenster über
 * `?unterstuetzer=<adresse>`, damit man den Link weitergeben kann.
 */
export function PartnersPage(): JSX.Element {
    usePageMeta(
        "Partner/Sponsorings",
        "Firmen, die RL Nexus unterstützen, und Organisationen, Creator und Ligen, mit denen wir eng zusammenarbeiten."
    );

    const content = usePartners();
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    const groups = useMemo(() => {
        const entries = content?.entries ?? [];
        const sponsorsAll = entries.filter((entry) => entry.kind === "sponsor");

        return {
            main: sponsorsAll.find((entry) => entry.tier === "main") ?? null,
            sponsors: sponsorsAll.filter((entry) => entry.tier !== "main"),
            sponsorsAll,
            supporters: entries.filter((entry) => entry.kind === "supporter"),
            partners: entries.filter((entry) => entry.kind === "partner"),
        };
    }, [content]);

    const filters = [
        ...FILTERS.map((filter) => ({ key: filter.key, label: filter.label, entries: groups.partners.filter(filter.matches) })),
        { key: "sponsoren", label: "Sponsoren", entries: groups.sponsorsAll },
    ].filter((filter) => filter.entries.length > 0);
    const active = filters.find((filter) => filter.key === params.get("art")) ?? null;
    const shown = active ? active.entries : groups.partners;

    const supporterIndex = groups.supporters.findIndex((entry) => entry.slug === params.get("unterstuetzer"));
    const supporter = supporterIndex >= 0 ? groups.supporters[supporterIndex] : undefined;

    const withParam = (key: string, value: string | null): URLSearchParams => {
        const next = new URLSearchParams(params);

        if (value === null) next.delete(key);
        else next.set(key, value);

        return next;
    };

    const openSupporter = (slug: string): void => {
        setParams(withParam("unterstuetzer", slug), { state: { supporter: true } satisfies IOpenedHere });
    };

    const closeSupporter = (): void => {
        if ((location.state as IOpenedHere | null)?.supporter) navigate(-1);
        else setParams(withParam("unterstuetzer", null), { replace: true });
    };

    const turn = (step: number): void => {
        const count = groups.supporters.length;
        const next = groups.supporters[(supporterIndex + step + count) % count];

        if (next) setParams(withParam("unterstuetzer", next.slug), { replace: true, state: location.state });
    };

    const empty = content !== undefined && content.entries.length === 0;

    return (
        <>
            <PageHeader
                eyebrow="Partner/Sponsorings"
                title={
                    <>
                        Wer RL Nexus <em>möglich</em> macht.
                    </>
                }
                lead="Firmen, die uns unterstützen, und Organisationen, Creator und Ligen, mit denen wir eng zusammenarbeiten."
            >
                <div className={styles.headerActions}>
                    <Button to={SPONSOR_WANTED} trailingIcon="arrow-right">
                        Sponsor werden
                    </Button>
                    <Button to={PARTNER_WANTED} variant="outline">
                        Partner werden
                    </Button>
                </div>
            </PageHeader>

            {content === undefined && <PageLoader />}

            {(groups.sponsorsAll.length > 0 || groups.supporters.length > 0) && (
                <Section flush>
                    <div className="u-shell">
                        <SponsorBlock main={groups.main} sponsors={groups.sponsors} />
                        {groups.supporters.length > 0 && (
                            <div className={styles.supporters}>
                                <div className={partnerStyles.tier} style={{ ["--c" as string]: "var(--c-text-faint)" }}>
                                    Unterstützer
                                </div>
                                <SupporterStrip supporters={groups.supporters} onOpen={openSupporter} />
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {groups.partners.length + groups.sponsorsAll.length > 0 && (
                <Section>
                    <div className="u-shell">
                        <div className={styles.partnersHead}>
                            <div>
                                <h2>{active?.key === "sponsoren" ? "Sponsoren" : "Partner"}</h2>
                                <p>Organisationen, Creator, Ligen und Communities</p>
                            </div>
                            {filters.length > 1 && (
                                <div className={styles.filters} role="group" aria-label="Nach Art filtern">
                                    <button
                                        type="button"
                                        className={styles.filter}
                                        aria-pressed={active === null}
                                        onClick={() => setParams(withParam("art", null), { replace: true })}
                                    >
                                        Alle {groups.partners.length}
                                    </button>
                                    {filters.map((filter) => (
                                        <button
                                            key={filter.key}
                                            type="button"
                                            className={styles.filter}
                                            aria-pressed={active?.key === filter.key}
                                            onClick={() => setParams(withParam("art", filter.key), { replace: true })}
                                        >
                                            {filter.label} {filter.entries.length}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {shown.length > 0 ? (
                            <ul className={styles.grid}>
                                {shown.map((entry) => (
                                    <li key={entry.slug}>
                                        <PartnerCard entry={entry} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.none}>Noch keine Partner eingetragen. Die Sponsoren stehen oben.</p>
                        )}
                    </div>
                </Section>
            )}

            {content !== undefined && (
                <Section>
                    <div className="u-shell">
                        <Join empty={empty} />
                    </div>
                </Section>
            )}

            {supporter && (
                <SupporterWindow
                    entry={supporter}
                    position={supporterIndex + 1}
                    count={groups.supporters.length}
                    onPrev={() => turn(-1)}
                    onNext={() => turn(1)}
                    onClose={closeSupporter}
                />
            )}
        </>
    );
}
