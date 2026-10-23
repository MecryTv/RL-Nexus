import { useEffect, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    CONTENT_LIMITS,
    MODULE_ID,
    type IBlock,
    type IConcept,
    type IContentMeta,
    type IFeature,
    type IModuleDefinition,
    type IModuleDetail,
    type IModules,
    type IPart,
    type IStep,
} from "../../shared/content";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { BotCommands } from "../editor/BotCommands";
import { ModulePreview } from "../editor/ModulePreview";
import { ColorPicker, EditorBar, IconPicker, ObjectList, ResetAction, TextList, type IDocControls } from "../editor/EditorParts";
import { replaceAt } from "../editor/list";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { useContentDoc } from "../editor/useContentDoc";
import { useModuleMeta } from "../editor/useModuleMeta";
import { useTitle } from "../useTitle";
import styles from "./ModuleEditorPage.module.scss";

const MODULE = CONTENT_LIMITS.modules;
const DETAIL = CONTENT_LIMITS.detail;

const SHOWCASE_LABELS: Readonly<Record<string, string>> = { "rank-card": "Rang-Karte", "team-roster": "Kaderübersicht" };

type Tab = "kachel" | "detail";

function blankModule(meta: IContentMeta): IModuleDefinition {
    return {
        id: "",
        name: "",
        tagline: "",
        description: "",
        category: meta.categories[0]?.id ?? "",
        status: meta.statuses.some((status) => status.id === "planned") ? "planned" : (meta.statuses[0]?.id ?? ""),
        icon: meta.icons[0]?.name ?? "",
        highlights: [""],
    };
}

/** Prüft die ID eines neuen Moduls schon beim Tippen. null heißt: passt. */
function idProblem(id: string, modules: readonly IModuleDefinition[]): string | null {
    if (id === "") return "Die ID fehlt.";
    if (!MODULE_ID.test(id)) return "Nur Kleinbuchstaben, Ziffern und Bindestriche, vorn ein Buchstabe.";
    if (modules.some((module) => module.id === id)) return "Diese ID hat schon ein anderes Modul.";

    return null;
}

/** Ein Schalter in der Art der Banner-Seite. */
function Switch({ checked, label, onChange }: { readonly checked: boolean; readonly label: string; readonly onChange: (checked: boolean) => void }): JSX.Element {
    return (
        <label className={styles.switch}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span>{label}</span>
        </label>
    );
}

function TileForm({
    module,
    meta,
    creating,
    idError,
    onChange,
}: {
    readonly module: IModuleDefinition;
    readonly meta: IContentMeta;
    readonly creating: boolean;
    readonly idError: string | null;
    readonly onChange: (module: IModuleDefinition) => void;
}): JSX.Element {
    const set = (change: Partial<IModuleDefinition>): void => onChange({ ...module, ...change });

    return (
        <div className={styles.form}>
            {creating ? (
                <Field id="modul-id" label="ID" hint="Steckt in der Adresse der Detailseite und lässt sich später nicht mehr ändern, etwa clips oder rl-tracking." error={module.id === "" ? undefined : (idError ?? undefined)}>
                    <input
                        id="modul-id"
                        type="text"
                        maxLength={MODULE.id}
                        autoComplete="off"
                        value={module.id}
                        onChange={(event) => set({ id: event.target.value.trim().toLowerCase() })}
                        aria-invalid={module.id !== "" && idError ? true : undefined}
                        aria-describedby={module.id !== "" && idError ? "modul-id-error" : "modul-id-hint"}
                    />
                </Field>
            ) : (
                <p className={styles.fixed}>
                    ID <code>{module.id}</code>, die Detailseite liegt unter <code>/module/{module.id}</code>.
                </p>
            )}

            <div className={styles.row}>
                <Field id="modul-name" label="Name" counter={{ value: module.name.length, max: MODULE.name }}>
                    <input id="modul-name" type="text" maxLength={MODULE.name} value={module.name} onChange={(event) => set({ name: event.target.value })} />
                </Field>
                <IconPicker id="modul-symbol" label="Symbol" value={module.icon} meta={meta} onChange={(icon) => set({ icon })} />
            </div>

            <Field id="modul-tagline" label="Tagline" hint="Ein Satz, steht auf der Kachel." counter={{ value: module.tagline.length, max: MODULE.tagline }}>
                <input
                    id="modul-tagline"
                    type="text"
                    maxLength={MODULE.tagline}
                    value={module.tagline}
                    onChange={(event) => set({ tagline: event.target.value })}
                    aria-describedby="modul-tagline-hint"
                />
            </Field>

            <Field id="modul-beschreibung" label="Beschreibung" hint="Zwei bis vier Sätze. Ohne Detailtext steht sie oben auf der Detailseite." counter={{ value: module.description.length, max: MODULE.description }}>
                <textarea
                    id="modul-beschreibung"
                    rows={4}
                    maxLength={MODULE.description}
                    value={module.description}
                    onChange={(event) => set({ description: event.target.value })}
                    aria-describedby="modul-beschreibung-hint"
                />
            </Field>

            <div className={styles.row}>
                <Field id="modul-kategorie" label="Kategorie">
                    <select id="modul-kategorie" value={module.category} onChange={(event) => set({ category: event.target.value })}>
                        {meta.categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field id="modul-status" label="Status">
                    <select id="modul-status" value={module.status} onChange={(event) => set({ status: event.target.value })}>
                        {meta.statuses.map((status) => (
                            <option key={status.id} value={status.id}>
                                {status.label}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>

            <TextList
                legend="Was das Modul kann"
                itemLabel="Stichpunkt"
                hint="Drei bis sechs Punkte. Mindestens einer."
                values={module.highlights}
                onChange={(highlights) => set({ highlights })}
                max={MODULE.highlights}
                maxLength={MODULE.highlight}
                addLabel="Stichpunkt hinzufügen"
            />

            <BotCommands moduleId={module.id} fallback={module.commands ?? []} />

            <div className={styles.switches}>
                <Switch checked={module.featured ?? false} label="Auf der Startseite zeigen" onChange={(featured) => set({ featured: featured || undefined })} />
                <Switch checked={module.builtIn ?? false} label="Fest eingebaut, ohne Schalter im Dashboard" onChange={(builtIn) => set({ builtIn: builtIn || undefined })} />
            </div>
        </div>
    );
}

/** Ein Abschnitt der Detailseite: an oder aus, dann Überschrift, Einleitung und Einträge. */
function BlockEditor<T>({
    id,
    name,
    block,
    defaultTitle,
    onChange,
    create,
    itemLabel,
    children,
}: {
    readonly id: string;
    readonly name: string;
    readonly block: IBlock<T> | undefined;
    readonly defaultTitle: string;
    readonly onChange: (block: IBlock<T> | undefined) => void;
    readonly create: () => T;
    readonly itemLabel: (entry: T, index: number) => string;
    readonly children: (entry: T, update: (next: T) => void, index: number) => ReactNode;
}): JSX.Element {
    return (
        <Panel cut="sm" className={styles.block}>
            <h3 className={styles.blockTitle}>{name}</h3>
            <Switch
                checked={block !== undefined}
                label="Abschnitt auf der Detailseite zeigen"
                onChange={(on) => onChange(on ? { title: defaultTitle, lead: "", entries: [create()] } : undefined)}
            />
            {block && (
                <>
                    <Field id={`${id}-titel`} label="Überschrift" counter={{ value: block.title.length, max: DETAIL.blockTitle }}>
                        <input id={`${id}-titel`} type="text" maxLength={DETAIL.blockTitle} value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
                    </Field>
                    <Field id={`${id}-einleitung`} label="Einleitung" counter={{ value: block.lead.length, max: DETAIL.blockLead }}>
                        <textarea id={`${id}-einleitung`} rows={2} maxLength={DETAIL.blockLead} value={block.lead} onChange={(event) => onChange({ ...block, lead: event.target.value })} />
                    </Field>
                    <ObjectList
                        legend="Einträge"
                        items={block.entries}
                        onChange={(entries) => onChange({ ...block, entries })}
                        max={DETAIL.entries}
                        create={create}
                        addLabel="Eintrag hinzufügen"
                        itemLabel={itemLabel}
                    >
                        {children}
                    </ObjectList>
                </>
            )}
        </Panel>
    );
}

function DetailForm({ detail, meta, onChange }: { readonly detail: IModuleDetail | null; readonly meta: IContentMeta; readonly onChange: (detail: IModuleDetail) => void }): JSX.Element {
    if (detail === null) {
        return (
            <div className={styles.empty}>
                <p>Dieses Modul hat noch keine Detailseite. Ohne zeigt die Webseite dort nur Beschreibung, Stichpunkte und Commands.</p>
                <Button icon="plus" onClick={() => onChange({ intro: [""] })}>
                    Detailseite anlegen
                </Button>
            </div>
        );
    }

    const set = (change: Partial<IModuleDetail>): void => onChange({ ...detail, ...change });

    return (
        <div className={styles.form}>
            <TextList
                legend="Einleitung"
                itemLabel="Absatz"
                hint="Zwei bis vier Absätze: was das Modul löst und für wen."
                values={detail.intro}
                onChange={(intro) => set({ intro })}
                max={DETAIL.intro}
                maxLength={DETAIL.paragraph}
                addLabel="Absatz hinzufügen"
                rows={4}
            />

            <BlockEditor<IConcept>
                id="begriffe"
                name="Begriffe"
                block={detail.concepts}
                defaultTitle="Begriffe"
                onChange={(concepts) => set({ concepts })}
                create={() => ({ label: "", text: "", color: "var(--c-blue)" })}
                itemLabel={(entry, index) => `Begriff ${index + 1}${entry.label ? `: ${entry.label}` : ""}`}
            >
                {(entry, update, index) => (
                    <>
                        <Field id={`begriff-${index}-label`} label="Bezeichnung">
                            <input id={`begriff-${index}-label`} type="text" maxLength={DETAIL.conceptLabel} value={entry.label} onChange={(event) => update({ ...entry, label: event.target.value })} />
                        </Field>
                        <Field id={`begriff-${index}-text`} label="Text" counter={{ value: entry.text.length, max: DETAIL.conceptText }}>
                            <textarea id={`begriff-${index}-text`} rows={2} maxLength={DETAIL.conceptText} value={entry.text} onChange={(event) => update({ ...entry, text: event.target.value })} />
                        </Field>
                        <ColorPicker id={`begriff-${index}-farbe`} label="Farbe des Punkts" value={entry.color} meta={meta} onChange={(color) => update({ ...entry, color })} />
                    </>
                )}
            </BlockEditor>

            <BlockEditor<IFeature>
                id="automatik"
                name="Was von selbst passiert"
                block={detail.automations}
                defaultTitle="Was von selbst passiert"
                onChange={(automations) => set({ automations })}
                create={() => ({ title: "", text: "", icon: meta.icons[0]?.name ?? "" })}
                itemLabel={(entry, index) => `Automatik ${index + 1}${entry.title ? `: ${entry.title}` : ""}`}
            >
                {(entry, update, index) => (
                    <>
                        <Field id={`automatik-${index}-titel`} label="Titel">
                            <input id={`automatik-${index}-titel`} type="text" maxLength={DETAIL.entryTitle} value={entry.title} onChange={(event) => update({ ...entry, title: event.target.value })} />
                        </Field>
                        <Field id={`automatik-${index}-text`} label="Text" counter={{ value: entry.text.length, max: DETAIL.entryText }}>
                            <textarea id={`automatik-${index}-text`} rows={3} maxLength={DETAIL.entryText} value={entry.text} onChange={(event) => update({ ...entry, text: event.target.value })} />
                        </Field>
                        <IconPicker id={`automatik-${index}-symbol`} label="Symbol" value={entry.icon} meta={meta} onChange={(icon) => update({ ...entry, icon })} />
                    </>
                )}
            </BlockEditor>

            <BlockEditor<IStep>
                id="einrichtung"
                name="Einrichtung"
                block={detail.setup}
                defaultTitle="Einrichten"
                onChange={(setup) => set({ setup })}
                create={() => ({ title: "", text: "" })}
                itemLabel={(entry, index) => `Schritt ${index + 1}${entry.title ? `: ${entry.title}` : ""}`}
            >
                {(entry, update, index) => (
                    <>
                        <Field id={`schritt-${index}-titel`} label="Titel">
                            <input id={`schritt-${index}-titel`} type="text" maxLength={DETAIL.entryTitle} value={entry.title} onChange={(event) => update({ ...entry, title: event.target.value })} />
                        </Field>
                        <Field id={`schritt-${index}-text`} label="Text" counter={{ value: entry.text.length, max: DETAIL.entryText }}>
                            <textarea id={`schritt-${index}-text`} rows={3} maxLength={DETAIL.entryText} value={entry.text} onChange={(event) => update({ ...entry, text: event.target.value })} />
                        </Field>
                    </>
                )}
            </BlockEditor>

            <Panel cut="sm" className={styles.block}>
                <h3 className={styles.blockTitle}>Kommt mit</h3>
                <p className={styles.blockHint}>Teile, die im Dashboard mit dem Modul kommen, ohne eigenen Schalter. Steht in der Seitenspalte.</p>
                <ObjectList<IPart>
                    legend="Teile"
                    items={detail.parts ?? []}
                    onChange={(parts) => set({ parts: parts.length > 0 ? parts : undefined })}
                    max={DETAIL.parts}
                    create={() => ({ name: "", text: "" })}
                    addLabel="Teil hinzufügen"
                    itemLabel={(part, index) => `Teil ${index + 1}${part.name ? `: ${part.name}` : ""}`}
                >
                    {(part, update, index) => (
                        <>
                            <Field id={`teil-${index}-name`} label="Name">
                                <input id={`teil-${index}-name`} type="text" maxLength={DETAIL.partName} value={part.name} onChange={(event) => update({ ...part, name: event.target.value })} />
                            </Field>
                            <Field id={`teil-${index}-text`} label="Text">
                                <textarea id={`teil-${index}-text`} rows={2} maxLength={DETAIL.partText} value={part.text} onChange={(event) => update({ ...part, text: event.target.value })} />
                            </Field>
                        </>
                    )}
                </ObjectList>
            </Panel>

            <Field id="beispiel" label="Beispiel zum Ansehen" hint="Nur für Module, bei denen der Bot etwas Sichtbares ausgibt.">
                <select id="beispiel" value={detail.showcase ?? ""} onChange={(event) => set({ showcase: event.target.value || undefined })} aria-describedby="beispiel-hint">
                    <option value="">Kein Beispiel</option>
                    {meta.showcases.map((showcase) => (
                        <option key={showcase} value={showcase}>
                            {SHOWCASE_LABELS[showcase] ?? showcase}
                        </option>
                    ))}
                </select>
            </Field>
        </div>
    );
}

function ModuleEditor({ id }: { readonly id: string | null }): JSX.Element {
    const creating = id === null;

    useTitle(creating ? "Neues Modul" : "Modul bearbeiten");

    const navigate = useNavigate();
    const modules = useContentDoc<IModules>("/api/content/modules");
    const detail = useContentDoc<IModuleDetail | null>(`/api/content/details/${id ?? "neu"}`);
    const meta = useModuleMeta();
    const [tab, setTab] = useState<Tab>("kachel");
    const [fresh, setFresh] = useState<IModuleDefinition | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Wohin es nach Speichern oder Löschen geht. Gesetzt heißt auch: keine Warnung mehr.
    const [leaving, setLeaving] = useState<string | null>(null);

    useEffect(() => {
        if (leaving !== null) navigate(leaving, { replace: true });
    }, [leaving, navigate]);

    const dirty = leaving === null && (creating ? fresh !== null : modules.dirty || detail.dirty);
    const guard = <UnsavedGuard dirty={dirty} />;

    if (modules.saved === null || meta.data === null) {
        const failure = modules.loadError ?? meta.error?.message ?? null;

        return (
            <>
                <PageHeader title={creating ? "Neues Modul" : "Modul"} />
                {failure ? (
                    <Failure
                        message={failure}
                        onRetry={() => {
                            modules.reload();
                            meta.reload();
                        }}
                    />
                ) : (
                    <Loading label="Modul wird geladen" />
                )}
                {guard}
            </>
        );
    }

    const list = modules.draft.modules;
    const index = creating ? -1 : list.findIndex((module) => module.id === id);

    if (!creating && index === -1) {
        return (
            <>
                <PageHeader title="Modul nicht gefunden" />
                <p className={styles.missing}>
                    Ein Modul mit der ID <code>{id}</code> steht nicht in der Liste. Vielleicht wurde es gelöscht.{" "}
                    <Link to="/webseite/module">Zur Modulliste</Link>
                </p>
                {guard}
            </>
        );
    }

    const module = creating ? (fresh ?? blankModule(meta.data)) : list[index];
    const idError = creating ? idProblem(module.id, list) : null;

    const setModule = (next: IModuleDefinition): void => {
        if (creating) setFresh(next);
        else modules.update((current) => ({ modules: replaceAt(current.modules, index, next) }));
    };

    // Beim Anlegen gibt es noch nichts in der Liste: gespeichert wird die Liste plus das neue Modul.
    const createControls: IDocControls = {
        saved: modules.saved,
        problem: modules.problem,
        conflict: modules.conflict,
        busy: modules.busy,
        reload: modules.reload,
        reset: modules.reset,
        dirty: fresh !== null && leaving === null,
        discard: () => setFresh(null),
        save: async () => {
            if (idError !== null) {
                document.getElementById("modul-id")?.focus();
                return false;
            }

            const saved = await modules.save({ modules: [...list, module] });
            if (saved) setLeaving(`/webseite/module/${module.id}`);

            return saved;
        },
    };

    async function remove(): Promise<void> {
        const saved = await modules.save({ modules: list.filter((entry) => entry.id !== id) });

        setDeleting(false);
        if (!saved) return;

        // Der Detailtext gehört zum Modul. Bliebe er liegen, erbte ihn ein späteres Modul mit derselben ID.
        await api(`/api/content/details/${id}`, { method: "DELETE" }).catch(() => undefined);
        setLeaving("/webseite/module");
    }

    function onTabKey(event: KeyboardEvent<HTMLDivElement>): void {
        if (creating || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;

        const next: Tab = tab === "kachel" ? "detail" : "kachel";

        setTab(next);
        document.getElementById(`reiter-${next}`)?.focus();
    }

    const controls: IDocControls = creating ? createControls : tab === "kachel" ? modules : detail;

    return (
        <>
            <PageHeader title={creating ? "Neues Modul" : module.name || "Modul ohne Namen"} meta={creating ? "Erst die Kachel speichern, danach gibt es eine Detailseite." : undefined}>
                <Link to="/webseite/module" className={styles.back}>
                    <Icon name="arrow-left" size={16} /> Alle Module
                </Link>
                {!creating && tab === "detail" && <ResetAction doc={detail} what="Der Detailtext" />}
                {!creating && (
                    <Button variant="danger" size="sm" icon="trash" onClick={() => setDeleting(true)} disabled={modules.busy}>
                        Modul löschen
                    </Button>
                )}
            </PageHeader>

            <div className={styles.tabs} role="tablist" aria-label="Bereiche des Moduls" onKeyDown={onTabKey}>
                {(["kachel", "detail"] as const).map((value) => {
                    const changed = value === "kachel" ? (creating ? fresh !== null : modules.dirty) : detail.dirty;

                    return (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            id={`reiter-${value}`}
                            className={styles.tab}
                            aria-selected={tab === value}
                            aria-controls="modul-bereich"
                            tabIndex={tab === value ? 0 : -1}
                            disabled={creating && value === "detail"}
                            onClick={() => setTab(value)}
                        >
                            {value === "kachel" ? "Kachel" : "Detailseite"}
                            {changed && (
                                <span className={styles.changed}>
                                    <span className="u-sr"> (ungespeichert)</span>
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className={styles.workspace}>
                <div role="tabpanel" id="modul-bereich" aria-labelledby={`reiter-${tab}`} className={styles.panel}>
                    {tab === "kachel" ? (
                        <TileForm module={module} meta={meta.data} creating={creating} idError={idError} onChange={setModule} />
                    ) : detail.saved === null ? (
                        detail.loadError ? (
                            <Failure message={detail.loadError} onRetry={detail.reload} />
                        ) : (
                            <Loading label="Detailtext wird geladen" />
                        )
                    ) : (
                        <DetailForm detail={detail.draft} meta={meta.data} onChange={(next) => detail.update(() => next)} />
                    )}
                </div>

                <ModulePreview view={tab} module={module} detail={detail.saved === null ? null : detail.draft} meta={meta.data} />
            </div>

            <EditorBar doc={controls} />
            {guard}

            <ConfirmDialog open={deleting} title="Modul löschen?" confirmLabel="Löschen" tone="danger" busy={modules.busy} onConfirm={() => void remove()} onCancel={() => setDeleting(false)}>
                <p>
                    „{module.name}“ verschwindet von der Webseite, samt Detailtext aus dem Admin Dashboard. Steht das Modul im Code der Webseite, kommt
                    es mit „Auf Stand der Webseite zurücksetzen“ in der Modulliste wieder.
                </p>
            </ConfirmDialog>
        </>
    );
}

export function ModuleEditorPage(): JSX.Element {
    const { id } = useParams();

    // Eigener Zustand je Modul: Wechselt die Adresse, beginnt der Editor neu.
    return <ModuleEditor key={id ?? "neu"} id={id ?? null} />;
}
