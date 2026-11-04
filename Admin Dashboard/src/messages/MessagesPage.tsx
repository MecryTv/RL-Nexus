import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import type { IMessageAudience, IMessageTemplate } from "../../shared/messages.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { PageHeader } from "../components/PageHeader";
import { PageTabs } from "../components/PageTabs";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useMe } from "../session/context";
import { useTitle } from "../useTitle";
import { ComposeTab } from "./ComposeTab";
import { HistoryTab } from "./HistoryTab";
import { TemplatesTab } from "./TemplatesTab";

const BASE = "/datenschutz/nachrichten";
const TABS = [
    { id: "neu", label: "Neue Nachricht", icon: "send" },
    { id: "verlauf", label: "Verlauf", icon: "history" },
    { id: "vorlagen", label: "Vorlagen", icon: "file-text" },
] as const;

/**
 * Datenschutz → Nachrichten (W-0058, Entwurf N-A): DMs über den Bot als Bild
 * an eine Person oder an alle mit Daten. Reiter über ?reiter=verlauf|vorlagen,
 * ?an=<id> trägt die Person ein (Knopf im Profil der Nutzerdaten).
 */
export function MessagesPage(): JSX.Element {
    useTitle("Nachrichten");

    const [params] = useSearchParams();
    const tab = TABS.find((entry) => entry.id === params.get("reiter"))?.id ?? "neu";
    const me = useMe();
    const audience = useApi<IMessageAudience>("/api/messages/audience");
    const templates = useApi<IMessageTemplate[]>("/api/messages/templates");
    const reload = (): void => {
        audience.reload();
        templates.reload();
    };

    useLive("messages", reload);
    // Wer gesperrt wird oder eine Löschung beantragt, zählt nicht mehr zu „alle“.
    useLive("security", audience.reload);
    useLive("userdata", audience.reload);

    const error = audience.error ?? templates.error;
    const running = audience.data?.running;

    return (
        <section>
            <PageHeader
                title="Nachrichten"
                meta={audience.data ? `${formatNumber(audience.data.people)} Personen mit Daten${running ? ` · eine Nachricht an alle ${running.state === "paused" ? "ist angehalten" : "läuft"}` : ""}` : undefined}
            />
            <PageTabs label="Nachrichten" tabs={TABS.map((entry) => ({ to: entry.id === "neu" ? BASE : `${BASE}?reiter=${entry.id}`, label: entry.label, icon: entry.icon, active: entry.id === tab }))} />

            {tab === "verlauf" ? (
                <HistoryTab />
            ) : error && !(audience.data && templates.data) ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !audience.data || !templates.data ? (
                <Loading label="Nachrichten werden geladen" />
            ) : tab === "vorlagen" ? (
                <TemplatesTab templates={templates.data} guildId={audience.data.guildId} onChanged={reload} />
            ) : (
                <ComposeTab audience={audience.data} templates={templates.data} developer={me.role === "developer"} onSent={reload} />
            )}
        </section>
    );
}
