import { type JSX, lazy, type ReactNode, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { isExempt, type IWebsiteMaintenance } from "./maintenance/logic";
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
const MaintenancePreview = lazy(() => import("./maintenance/MaintenancePreview").then((m) => ({ default: m.MaintenancePreview })));
const CommandsPage = lazy(() => import("./pages/CommandsPage").then((m) => ({ default: m.CommandsPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((m) => ({ default: m.ContactPage })));
const LegalPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })));
const ShopLegalPage = lazy(() => import("./pages/ShopLegalPage").then((m) => ({ default: m.ShopLegalPage })));
const AccessPage = lazy(() => import("./pages/AccessPage").then((m) => ({ default: m.AccessPage })));
const CancelPage = lazy(() => import("./pages/CancelPage").then((m) => ({ default: m.CancelPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const MaintenanceScreen = lazy(() => import("./maintenance/MaintenanceScreen").then((m) => ({ default: m.MaintenanceScreen })));

/**
 * Läuft die Wartung, kommt man auch per Klick nicht an ihr vorbei: Wer auf
 * einem Rechtstext steht und im Kopf auf „Module“ klickt, lädt die Seite nicht
 * neu. `main.tsx` sieht nur die erste Adresse, das hier jede weitere.
 */
function MaintenanceGate({ paused, children }: { readonly paused: IWebsiteMaintenance | null; readonly children: ReactNode }): ReactNode {
    const { pathname } = useLocation();

    if (paused === null || isExempt(pathname)) return children;

    return (
        <Suspense fallback={null}>
            <MaintenanceScreen state={paused} />
        </Suspense>
    );
}

/**
 * `banner` lädt `main.tsx` vor dem ersten Bild, `null` heißt: kein Banner.
 * `paused`: die laufende Wartung der Webseite, sonst null.
 */
export function App({ banner, paused }: { readonly banner: ILoaded<IBanner> | null; readonly paused: IWebsiteMaintenance | null }): JSX.Element {
    return (
        <BrowserRouter>
            <MaintenanceGate paused={paused}>
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
                    {/* Der Wartungsbildschirm als Vorschau für die Seite „Wartung“ im Admin Dashboard. */}
                    <Route
                        path="vorschau/wartung"
                        element={
                            <Suspense fallback={null}>
                                <MaintenancePreview />
                            </Suspense>
                        }
                    />
                    <Route element={<Layout banner={banner} />}>
                        <Route index element={<HomePage />} />
                        <Route path="module" element={<ModulesPage />} />
                        <Route path="module/:id" element={<ModuleDetailPage />} />
                        <Route path="commands" element={<CommandsPage />} />
                        <Route path="preise" element={<PricingPage />} />
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
                        <Route path="datenschutz" element={<LegalPage kind="datenschutz" />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </MaintenanceGate>
        </BrowserRouter>
    );
}
