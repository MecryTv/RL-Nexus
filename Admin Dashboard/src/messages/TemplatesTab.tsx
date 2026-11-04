import { useMemo, useState, type CSSProperties, type JSX } from "react";
import { COLOR_HEX, COLOR_LABELS, EMPTY_CONTENT, checkMessage, type IMessageContent, type IMessageTemplate, type MessageAudienceKind } from "../../shared/messages.ts";
import { ApiError, api } from "../api/client";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { MessageForm, MessagePreview } from "./MessageForm";
import styles from "./messages.module.scss";

interface IDraft {
    readonly id: number | null;
    readonly name: string;
    readonly audience: MessageAudienceKind;
    readonly content: IMessageContent;
}

const AUDIENCES = [
    { value: "all", label: "An alle" },
    { value: "one", label: "An eine Person" },
] as const;

const message = (error: unknown): string => (error instanceof ApiError || error instanceof Error ? error.message : String(error));

/** Bearbeiten im selben Formular wie „Neue Nachricht“, mit Vorschau. */
function Editor({ draft, guildId, onClose, onSaved }: { readonly draft: IDraft; readonly guildId: string; readonly onClose: () => void; readonly onSaved: () => void }): JSX.Element {
    const notify = useToast();
    const [value, setValue] = useState(draft);
    const [busy, setBusy] = useState(false);
    const checked = useMemo(() => checkMessage(value.content, guildId), [value.content, guildId]);
    const problem = "problem" in checked ? checked.problem : null;

    const save = (): void => {
        setBusy(true);
        api<IMessageTemplate>(value.id === null ? "/api/messages/templates" : `/api/messages/templates/${value.id}`, {
            method: value.id === null ? "POST" : "PUT",
            body: { name: value.name, audience: value.audience, content: value.content },
        })
            .then((saved) => {
                notify(`Vorlage „${saved.name}“ gespeichert.`);
                onSaved();
            })
            .catch((reason: unknown) => notify(message(reason), "danger"))
            .finally(() => setBusy(false));
    };

    return (
        <Panel className={styles.editor}>
            <div className={styles.editorHead}>
                <h2>{draft.id === null ? "Neue Vorlage" : `Vorlage „${draft.name}“ bearbeiten`}</h2>
                <Button variant="ghost" size="sm" icon="close" onClick={onClose}>
                    Zurück zur Liste
                </Button>
            </div>
            <div className={styles.pair}>
                <Field id="vorlage-name" label="Name der Vorlage" counter={{ value: value.name.length, max: 60 }}>
                    <input id="vorlage-name" type="text" value={value.name} maxLength={60} onChange={(event) => setValue({ ...value, name: event.target.value })} />
                </Field>
                <Segmented name="vorlage-fuer" legend="Gedacht für" options={AUDIENCES} value={value.audience} onChange={(audience) => setValue({ ...value, audience })} />
            </div>
            <div className={styles.editorBody}>
                <div>
                    <MessageForm id="vorlage" value={value.content} onChange={(content) => setValue({ ...value, content })} />
                    {problem && (
                        <p className={styles.problem} role="status">
                            {problem}
                        </p>
                    )}
                    <div className={styles.send}>
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                            Abbrechen
                        </Button>
                        <Button variant="primary" icon="save" busy={busy} disabled={problem !== null || !value.name.trim()} onClick={save}>
                            Speichern
                        </Button>
                    </div>
                </div>
                <MessagePreview content={value.content} problem={problem} />
            </div>
        </Panel>
    );
}

/** Reiter „Vorlagen“: Liste mit Farbe, Name und für wen; neu, bearbeiten, löschen. */
export function TemplatesTab({ templates, guildId, onChanged }: { readonly templates: readonly IMessageTemplate[]; readonly guildId: string; readonly onChanged: () => void }): JSX.Element {
    const notify = useToast();
    const [draft, setDraft] = useState<IDraft | null>(null);
    const [removing, setRemoving] = useState<IMessageTemplate | null>(null);
    const [busy, setBusy] = useState(false);

    if (draft) {
        return (
            <Editor
                key={draft.id ?? "neu"}
                draft={draft}
                guildId={guildId}
                onClose={() => setDraft(null)}
                onSaved={() => {
                    setDraft(null);
                    onChanged();
                }}
            />
        );
    }

    const remove = (): void => {
        if (!removing) return;

        setBusy(true);
        api(`/api/messages/templates/${removing.id}`, { method: "DELETE" })
            .then(() => {
                notify(`Vorlage „${removing.name}“ gelöscht.`);
                setRemoving(null);
                onChanged();
            })
            .catch((reason: unknown) => notify(message(reason), "danger"))
            .finally(() => setBusy(false));
    };

    return (
        <>
            <div className={styles.toolbar}>
                <p className={styles.dim}>Nur für Änderungen an dem, was die Leute schon nutzen, Wartung, Störungen, Datenschutz und Hinweise an eine Person. Keine Werbung.</p>
                <Button variant="primary" icon="plus" onClick={() => setDraft({ id: null, name: "", audience: "all", content: EMPTY_CONTENT })}>
                    Neue Vorlage
                </Button>
            </div>

            {templates.length === 0 ? (
                <p className={styles.dim}>Noch keine Vorlage.</p>
            ) : (
                <ul className={styles.templateList}>
                    {templates.map((template) => (
                        <li key={template.id}>
                            <span className={styles.swatch} style={{ "--swatch": COLOR_HEX[template.content.color] } as CSSProperties} title={COLOR_LABELS[template.content.color]} aria-hidden="true" />
                            <div className={styles.grow}>
                                <b>{template.name}</b>
                                <small>
                                    {template.audience === "all" ? "an alle" : "an eine Person"} · „{template.content.title}“ · geändert von {template.updatedName}, {formatDateTime(template.updatedAt)}
                                </small>
                            </div>
                            <Button size="sm" icon="pencil" onClick={() => setDraft({ id: template.id, name: template.name, audience: template.audience, content: template.content })}>
                                Bearbeiten
                            </Button>
                            <Button size="sm" variant="ghost" icon="trash" onClick={() => setRemoving(template)}>
                                Löschen …
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog open={removing !== null} title={`Vorlage „${removing?.name ?? ""}“ löschen?`} confirmLabel="Löschen" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setRemoving(null)}>
                <p>Verschickte Nachrichten bleiben im Verlauf, mit dem Namen der Vorlage von damals.</p>
            </ConfirmDialog>
        </>
    );
}
