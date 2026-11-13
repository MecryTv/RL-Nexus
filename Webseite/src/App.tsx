import { type JSX, lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { useMaintenanceGuard } from "./hooks/useMaintenanceGuard";
import { HomePage } from "./pages/HomePage";
import type { IBanner, ILoaded } from "./services/Content";

/**
 * Die Unterseiten werden erst geladen, wenn jemand sie aufruft.
 *
 * Die Startseite nicht - sie ist das Ziel der meisten Aufrufe, und sie
 * nachzuladen hieße, den ersten Blick auf einen Ladezustand zu verschwenden.
 * Den Ladezustand für alle anderen stellt `Layout` um den `Outlet`.
 */
const ModulesPage = lazy(() => import("./pages/ModulesPage").then((m) => ({ default: m.ModulesPage })));
const ModuleDetailPage = lazy(() => import("./pages/ModuleDetailPage").then((m) => ({ default: m.ModuleDetailPage })));
const PreviewPage = lazy(() => import("./pages/PreviewPage").then((m) => ({ default: m.PreviewPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })));
const PartnersPage = lazy(() => import("./pages/PartnersPage").then((m) => ({ default: m.PartnersPage })));
const PartnerPage = lazy(() => import("./pages/PartnerPage").then((m) => ({ default: m.PartnerPage })));
const NewsPage = lazy(() => import("./pages/NewsPage").then((m) => ({ default: m.NewsPage })));
const NewsPostPage = lazy(() => import("./pages/NewsPostPage").then((m) => ({ default: m.NewsPostPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then((m) => ({ default: m.ChangelogPage })));
const ChangelogVersionPage = lazy(() => import("./pages/ChangelogVersionPage").then((m) => ({ default: m.ChangelogVersionPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((m) => ({ default: m.ContactPage })));
const LegalPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })));
const ShopLegalPage = lazy(() => import("./pages/ShopLegalPage").then((m) => ({ default: m.ShopLegalPage })));
const AccessPage = lazy(() => import("./pages/AccessPage").then((m) => ({ default: m.AccessPage })));
const CancelPage = lazy(() => import("./pages/CancelPage").then((m) => ({ default: m.CancelPage })));
const WithdrawPage = lazy(() => import("./pages/WithdrawPage").then((m) => ({ default: m.WithdrawPage })));
const BlockedPage = lazy(() => import("./pages/BlockedPage").then((m) => ({ default: m.BlockedPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

/** Braucht den Router, deshalb eine eigene kleine Komponente darin. */
function MaintenanceGuard(): null {
    useMaintenanceGuard();

    return null;
}

/** `banner` lädt `main.tsx` vor dem ersten Bild, `null` heißt: kein Banner. */
export function App({ banner }: { readonly banner: ILoaded<IBanner> | null }): JSX.Element {
    return (
        <BrowserRouter>
            <MaintenanceGuard />
            <Routes>
                {/* Für den Modul-Editor im Admin Dashboard: ohne Kopf, Fuß und Banner. */}
                <Route
                    path="vorschau"
                    element={
                        <Suspense fallback={null}>
                            <PreviewPage />
                        </Suspense>
                    }
                />
                <Route element={<Layout banner={banner} />}>
                    <Route index element={<HomePage />} />
                    <Route path="module" element={<ModulesPage />} />
                    <Route path="module/:id" element={<ModuleDetailPage />} />
                    {/* Die Befehle zeigt der Hilfe-Befehl in Discord (W-0013). Alte Links landen bei den Modulen. */}
                    <Route path="commands" element={<Navigate to="/module" replace />} />
                    <Route path="preise" element={<PricingPage />} />
                    <Route path="news" element={<NewsPage />} />
                    <Route path="news/:slug" element={<NewsPostPage />} />
                    <Route path="changelog" element={<ChangelogPage />} />
                    <Route path="changelog/:version" element={<ChangelogVersionPage />} />
                    <Route path="partner" element={<PartnersPage />} />
                    <Route path="partner/:slug" element={<PartnerPage />} />
                    <Route path="team" element={<TeamPage />} />
                    {/* Die Kaderübersicht war einmal eine eigene Seite und ist
                        jetzt Teil des Moduls. Alte Links sollen dort ankommen
                        statt auf einer 404. */}
                    <Route path="teams" element={<Navigate to="/module/teams" replace />} />
                    <Route path="kontakt" element={<ContactPage />} />
                    <Route path="impressum" element={<LegalPage kind="impressum" />} />
                    <Route path="agb" element={<ShopLegalPage key="agb" doc="agb" />} />
                    <Route path="widerruf" element={<ShopLegalPage key="widerruf" doc="widerruf" />} />
                    <Route path="zugang" element={<AccessPage />} />
                    <Route path="kuendigen" element={<CancelPage />} />
                    <Route path="widerrufen" element={<WithdrawPage />} />
                    <Route path="gesperrt" element={<BlockedPage />} />
                    <Route path="datenschutz" element={<LegalPage kind="datenschutz" />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
