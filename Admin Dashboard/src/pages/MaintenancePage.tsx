import { useState, type JSX } from "react";
import type { IMaintenance, IMaintenanceFlag } from "../../shared/api";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./dev.module.scss";

type Area = keyof IMaintenance;

const AREAS: readonly { readonly area: Area; readonly name: string; readonly effect: string }[] = [
    { area: "website", name: "Webseite", effect: "Wer nexus-emb.de öffnet, sieht nur noch die Wartungsseite. Das Kontaktformular nimmt nichts mehr an." },
    {
        area: "dashboard",
        name: "Bot-Dashboard",
        effect: "Das Bot-Dashboard zeigt die Wartungsseite. Der Bot selbst läuft weiter, Bilder für Discord und die API auch.",
    },
];

function since(flag: IMaintenanceFlag): string {
    if (flag.since === null) return "An, seit wann ist unbekannt";

    return `An seit ${formatDateTime(flag.since)}${flag.by ? `, von ${flag.by}` : ""}`;
}

export function MaintenancePage(): JSX.Element {
    useTitle("Wartung");

    const notify = useToast();
    const { data, error, reload } = useApi<IMaintenance>("/api/maintenance");
    const [asking, setAsking] = useState<Area | null>(null);
    const [busy, setBusy] = useState<Area | null>(null);

    async function switchArea(area: Area, on: boolean): Promise<void> {
        const name = AREAS.find((entry) => entry.area === area)?.name ?? area;

        setBusy(area);

        try {
            await api("/api/maintenance", { method: "PUT", body: { [area]: on } });
            notify(on ? `${name}: Wartungsseite ist an.` : `${name}: wieder normal erreichbar.`);
            reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setBusy(null);
            setAsking(null);
        }
    }

    const asked = AREAS.find((entry) => entry.area === asking);

    return (
        <>
            <PageHeader title="Wartung" meta="nginx prüft bei jeder Anfrage, ob der Schalter an ist. Es wirkt sofort, ohne Neustart." />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Wartung wird geladen" />
            ) : (
                <div className={styles.switches}>
                    {AREAS.map(({ area, name, effect }) => {
                        const flag = data[area];

                        return (
                            <Panel key={area} className={styles.switchRow}>
                                <div className={styles.switchText}>
                                    <h2 className={styles.switchName}>{name}</h2>
                                    <p>{effect}</p>
                                    <p className={styles.switchState}>
                                        <Badge tone={flag ? "warn" : "ok"}>{flag ? "Wartung" : "Normal"}</Badge>
                                        {flag && <span>{since(flag)}</span>}
                                    </p>
                                </div>
                                {flag ? (
                                    <Button icon="power" busy={busy === area} onClick={() => void switchArea(area, false)}>
                                        Wartung beenden
                                    </Button>
                                ) : (
                                    <Button variant="danger" icon="wrench" disabled={busy !== null} onClick={() => setAsking(area)}>
                                        Wartung einschalten
                                    </Button>
                                )}
                            </Panel>
                        );
                    })}
                </div>
            )}

            <section className={styles.section} aria-labelledby="wartung-vorschau">
                <h2 id="wartung-vorschau" className={styles.heading}>
                    So sieht die Wartungsseite aus
                </h2>
                {/* sandbox ohne Rechte: die Seite braucht kein Skript und bekommt keins. */}
                <iframe src="/wartung.html" title="Vorschau der Wartungsseite" sandbox="" loading="lazy" className={styles.preview} />
            </section>

            <ConfirmDialog
                open={asked !== undefined}
                title={`${asked?.name ?? ""}: Wartung einschalten?`}
                confirmLabel="Einschalten"
                tone="danger"
                busy={busy !== null}
                onConfirm={() => {
                    if (asked) void switchArea(asked.area, true);
                }}
                onCancel={() => setAsking(null)}
            >
                <p>{asked?.effect}</p>
            </ConfirmDialog>
        </>
    );
}
