import type { JSX } from "react";
import { Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from "react-router-dom";
import { Shell } from "./components/Shell";
import { RequireDeveloper } from "./session/RequireDeveloper";
import { RequireSession } from "./session/RequireSession";
import { SessionProvider } from "./session/SessionProvider";
import { ToastProvider } from "./toast/ToastProvider";

/**
 * Jede Seite kommt in ihrem eigenen Bündel.
 *
 * Nicht `element`, sondern `lazy` des Routers: Er lädt das Bündel, bevor er
 * umschaltet, und lässt die alte Seite so lange stehen. React.lazy würde
 * stattdessen sofort umschalten und einen leeren Rahmen zeigen. Dass gerade
 * geladen wird, sagt der Balken in der Shell.
 *
 * Nur Shell, Sitzung und Toasts liegen im Hauptbündel: ohne sie geht nichts.
 */
type Page = () => JSX.Element;

const page =
    <K extends string>(load: () => Promise<Record<K, Page>>, name: K) =>
    async (): Promise<{ Component: Page }> => ({ Component: (await load())[name] });

/** Dasselbe für die Developer-Seiten, die hinter der Rollenprüfung liegen. */
const devPage =
    <K extends string>(load: () => Promise<Record<K, Page>>, name: K) =>
    async (): Promise<{ Component: Page }> => {
        const Inner: Page = (await load())[name];

        return {
            Component: () => (
                <RequireDeveloper>
                    <Inner />
                </RequireDeveloper>
            ),
        };
    };

/**
 * Ein Data Router statt <BrowserRouter>: Nur damit gibt es useBlocker, und das
 * braucht jeder Editor, um vor ungespeicherten Änderungen zu warnen.
 */
const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route path="/anmelden" lazy={page(() => import("./pages/LoginPage"), "LoginPage")} />
            <Route
                element={
                    <RequireSession>
                        <Shell />
                    </RequireSession>
                }
            >
                <Route index lazy={page(() => import("./pages/OverviewPage"), "OverviewPage")} />
                <Route path="server" lazy={page(() => import("./pages/ServersPage"), "ServersPage")} />
                <Route path="gruppen" lazy={page(() => import("./pages/GroupsPage"), "GroupsPage")} />
                <Route path="backups" lazy={page(() => import("./backups/BackupsPage"), "BackupsPage")} />
                <Route path="beta" lazy={page(() => import("./beta/BetaPage"), "BetaPage")} />
                <Route path="backups/:guildId" lazy={page(() => import("./backups/ServerBackupsPage"), "ServerBackupsPage")} />
                <Route path="backups/:guildId/zurueckladen/:backupId" lazy={page(() => import("./backups/RestoreWizard"), "RestoreWizard")} />
                <Route path="status" lazy={page(() => import("./pages/IncidentsPage"), "IncidentsPage")} />
                <Route path="meldungen" lazy={page(() => import("./pages/NotificationsPage"), "NotificationsPage")} />
                <Route path="post" lazy={page(() => import("./pages/MailPage"), "MailPage")} />
                <Route path="post/formular/:id?" lazy={page(() => import("./pages/MailPage"), "MailRedirect")} />
                <Route path="post/alle/:account?/:uid?" lazy={page(() => import("./pages/MailPage"), "MailPage")} />
                <Route path="post/:account/:folder/:uid?" lazy={page(() => import("./pages/MailPage"), "MailPage")} />
                <Route path="kontakt/:id?" lazy={page(() => import("./pages/MailPage"), "MailRedirect")} />
                <Route path="webseite/banner" lazy={page(() => import("./pages/BannerPage"), "BannerPage")} />
                <Route path="webseite/team" lazy={page(() => import("./pages/TeamPage"), "TeamPage")} />
                <Route path="webseite/module" lazy={page(() => import("./pages/ModulesPage"), "ModulesPage")} />
                <Route path="webseite/module/:id" lazy={page(() => import("./pages/ModuleEditorPage"), "ModuleEditorPage")} />
                {/* Eigene Adresse statt /module/neu: so kann keine Modul-ID damit kollidieren. */}
                <Route path="webseite/neues-modul" lazy={page(() => import("./pages/ModuleEditorPage"), "ModuleEditorPage")} />
                <Route path="shop/produkte" lazy={page(() => import("./shop/ProductsPage"), "ProductsPage")} />
                <Route path="shop/kunden" lazy={page(() => import("./shop/CustomersPage"), "CustomersPage")} />
                <Route path="shop/einstellungen" lazy={page(() => import("./shop/ShopSettingsPage"), "ShopSettingsPage")} />
                <Route path="dev/logs" lazy={devPage(() => import("./pages/LogsPage"), "LogsPage")} />
                <Route path="dev/logs/:n" lazy={devPage(() => import("./pages/LogViewPage"), "LogViewPage")} />
                <Route path="dev/datenbank/:table?" lazy={devPage(() => import("./pages/DatabasePage"), "DatabasePage")} />
                <Route path="dev/technik" lazy={devPage(() => import("./pages/TechPage"), "TechPage")} />
                <Route path="dev/wartung" lazy={devPage(() => import("./pages/MaintenancePage"), "MaintenancePage")} />
                <Route path="dev/protokoll" lazy={devPage(() => import("./pages/AuditPage"), "AuditPage")} />
                <Route path="*" lazy={page(() => import("./pages/NotFoundPage"), "NotFoundPage")} />
            </Route>
        </>
    )
);

export function App(): JSX.Element {
    return (
        <SessionProvider>
            <ToastProvider>
                <RouterProvider router={router} />
            </ToastProvider>
        </SessionProvider>
    );
}
