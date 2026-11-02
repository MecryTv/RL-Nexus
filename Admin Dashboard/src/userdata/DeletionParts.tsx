import { useState, type JSX } from "react";
import type { DeletionState, IDeletion } from "../../shared/userdata.ts";
import { api } from "../api/client";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button, LinkButton } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatNumber } from "../format";
import { useToast } from "../toast/context";
import { PlanDialog } from "./PlanDialog";
import { deletionSteps, elapsedShare, personName, remaining, when, type StepState } from "./plan.ts";
import styles from "./userdata.module.scss";

/** Teile einer Löschung für Profil und Seite Löschungen (Entwurf LA+). */

const STATE_BADGES: Readonly<Record<DeletionState, { readonly label: string; readonly tone: BadgeTone }>> = {
    geplant: { label: "läuft", tone: "info" },
    angehalten: { label: "angehalten", tone: "warn" },
    geloescht: { label: "gelöscht", tone: "ok" },
    abgebrochen: { label: "abgebrochen", tone: "neutral" },
};
const STEP_NAMES = ["geplant", "DM", "Kopie", "gelöscht"] as const;
const STEP_WORDS: Readonly<Record<StepState, string>> = { ok: "erledigt", warn: "angehalten", bad: "hakt", todo: "offen" };

const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export function StateBadge({ state }: { readonly state: DeletionState }): JSX.Element {
    return <Badge tone={STATE_BADGES[state].tone}>{STATE_BADGES[state].label}</Badge>;
}

/** Was hinter den Punkten steht: DM, Kopie, „Das war ich nicht“, Ergebnis. */
function stepNote(deletion: IDeletion): string {
    if (deletion.state === "angehalten") return `„Das war ich nicht“${deletion.stoppedAt ? ` um ${TIME.format(new Date(deletion.stoppedAt))}` : ""}`;
    if (deletion.state === "abgebrochen") return deletion.stoppedAt ? "vom Team geschlossen" : "vom Team abgebrochen";

    if (deletion.state === "geloescht" && deletion.result) {
        const { deleted, anonymized, kept, servers } = deletion.result;
        const total = [...Object.values(deleted), ...Object.values(anonymized)].reduce((sum, rows) => sum + (rows ?? 0), 0);
        const stayed = kept.length > 0 ? ` · ${kept.map((entry) => entry.label).join(", ")} blieb` : "";

        return `${formatNumber(total)} Einträge auf ${servers} ${servers === 1 ? "Server" : "Servern"}${stayed}${deletion.code ? ` · Prüfcode ${deletion.code}` : ""}`;
    }

    const dm = deletion.dmState === "zugestellt" ? "DM zugestellt" : deletion.dmState === "nicht_zustellbar" ? "DM nicht zustellbar" : "DM wird geschickt";

    return deletion.copyAt ? `${dm} · Kopie geholt ${TIME.format(new Date(deletion.copyAt))}` : dm;
}

/** Vier Punkte: geplant, DM, Kopie, gelöscht. Gelb und Rot, wo etwas hakt. */
export function Steps({ deletion }: { readonly deletion: IDeletion }): JSX.Element {
    const steps = deletionSteps(deletion);

    return (
        <span className={styles.steps}>
            <span className={styles.dots} role="img" aria-label={steps.map((step, index) => `${STEP_NAMES[index]} ${STEP_WORDS[step]}`).join(", ")}>
                {steps.map((step, index) => (
                    <i key={index} data-state={step} />
                ))}
            </span>
            <em>{stepNote(deletion)}</em>
        </span>
    );
}

/** Restzeit als kleiner Ring mit Uhrzeit, wie beim Status-Knopf. Angehalten und Erledigtes nur mit Zeit. */
export function Due({ deletion, now }: { readonly deletion: IDeletion; readonly now: number }): JSX.Element {
    if (deletion.state === "angehalten") return <span className={styles.dim}>geplant für {when(deletion.dueAt, now)}</span>;
    if (deletion.state !== "geplant") return <span className={styles.dim}>{when(deletion.doneAt ?? deletion.cancelledAt ?? deletion.dueAt, now)}</span>;

    const share = Math.round(elapsedShare(deletion.createdAt, deletion.dueAt, now) * 100);

    return (
        <span className={styles.when}>
            <span className={styles.ring} style={{ background: `conic-gradient(var(--c-blue) 0 ${share}%, var(--c-line-strong) 0)` }} aria-hidden="true">
                <span />
            </span>
            <span>
                <span className={styles.left}>
                    <span className="u-sr">noch </span>
                    {remaining(deletion.dueAt, now)}
                </span>
                <span className={styles.dim}>{when(deletion.dueAt, now)}</span>
            </span>
        </span>
    );
}

/** Knöpfe je Stand: laufend „Abbrechen“, angehalten „Neu planen“ und „Schließen“, gelöscht „Beleg (PDF)“. */
export function DeletionActions({ deletion, onChanged }: { readonly deletion: IDeletion; readonly onChanged: () => void }): JSX.Element | null {
    const notify = useToast();
    const [asking, setAsking] = useState(false);
    const [planning, setPlanning] = useState(false);
    const [busy, setBusy] = useState(false);
    const name = personName(deletion);
    const halted = deletion.state === "angehalten";

    async function cancel(): Promise<void> {
        setBusy(true);

        try {
            await api(`/api/userdata/loeschungen/${deletion.id}/abbrechen`, { method: "POST", body: {} });
            notify(halted ? `Geschlossen. ${name} bekommt eine DM, dass die Daten bleiben.` : `Abgebrochen. ${name} bekommt eine DM, dass die Daten bleiben.`);
            setAsking(false);
            onChanged();
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    if (deletion.state === "geloescht") {
        return (
            <LinkButton href={`/api/userdata/loeschungen/${deletion.id}/beleg`} size="sm" icon="download" download>
                Beleg (PDF)
            </LinkButton>
        );
    }

    if (deletion.state === "abgebrochen") return null;

    return (
        <span className={styles.actions}>
            {halted && (
                <Button size="sm" className={styles.gold} onClick={() => setPlanning(true)}>
                    Neu planen
                </Button>
            )}
            <Button size="sm" variant={halted ? "ghost" : "danger"} onClick={() => setAsking(true)}>
                {halted ? "Schließen" : "Abbrechen"}
            </Button>

            <ConfirmDialog
                open={asking}
                title={halted ? "Löschung schließen?" : "Löschung abbrechen?"}
                confirmLabel={halted ? "Schließen" : "Löschung abbrechen"}
                busy={busy}
                onConfirm={() => void cancel()}
                onCancel={() => setAsking(false)}
            >
                {halted ? "Die Löschung endet, nichts wird gelöscht." : "Gelöscht wird dann nichts."} {name} bekommt eine DM, dass die Daten bleiben.
            </ConfirmDialog>

            {planning && (
                <PlanDialog
                    userId={deletion.userId}
                    replace
                    onClose={() => setPlanning(false)}
                    onPlanned={() => {
                        setPlanning(false);
                        onChanged();
                    }}
                />
            )}
        </span>
    );
}
