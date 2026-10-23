import type { JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ICategories, IContentMeta, IModules } from "../../shared/content";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { ResetAction } from "../editor/EditorParts";
import { iconUrl } from "../editor/iconUrl";
import { replaceAt } from "../editor/list";
import { useContentDoc, type IContentDoc } from "../editor/useContentDoc";
import { useModuleMeta } from "../editor/useModuleMeta";
import { CategoriesPanel } from "./CategoriesPanel";
import { useTitle } from "../useTitle";
import styles from "./ModulesPage.module.scss";

/** Alle Module in der Reihenfolge der Datei. Ein geänderter Status wird sofort gespeichert. */
function ModuleTable({ doc, meta }: { readonly doc: IContentDoc<IModules>; readonly meta: IContentMeta }): JSX.Element {
    const modules = doc.draft.modules;

    return (
        <div className={styles.frame}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Modul</th>
                        <th scope="col">Kategorie</th>
                        <th scope="col">Status</th>
                        <th scope="col">Startseite</th>
                        <th scope="col">
                            <span className="u-sr">Bearbeiten</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {modules.map((module, index) => {
                        const icon = meta.icons.find((entry) => entry.name === module.icon);

                        return (
                            <tr key={module.id}>
                                <td>
                                    <span className={styles.module}>
                                        <span className={styles.icon} aria-hidden="true">
                                            {icon && <img src={iconUrl(icon.svg)} alt="" width={18} height={18} />}
                                        </span>
                                        <span>
                                            <span className={styles.name}>{module.name}</span>
                                            <span className={styles.id}>{module.id}</span>
                                        </span>
                                    </span>
                                </td>
                                <td>{meta.categories.find((entry) => entry.id === module.category)?.label ?? module.category}</td>
                                <td>
                                    <select
                                        aria-label={`Status von ${module.name}`}
                                        value={module.status}
                                        disabled={doc.busy}
                                        onChange={(event) => void doc.save({ modules: replaceAt(modules, index, { ...module, status: event.target.value }) })}
                                    >
                                        {meta.statuses.map((status) => (
                                            <option key={status.id} value={status.id}>
                                                {status.label}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td>{module.featured ? "Ja" : "–"}</td>
                                <td className={styles.actions}>
                                    <Link to={`/webseite/module/${module.id}`} className={styles.edit}>
                                        Bearbeiten
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function ModulesPage(): JSX.Element {
    useTitle("Module");

    const navigate = useNavigate();
    const doc = useContentDoc<IModules>("/api/content/modules");
    const meta = useModuleMeta();
    const categories = useContentDoc<ICategories>("/api/content/categories");
    const failure = doc.loadError ?? meta.error?.message ?? categories.loadError;

    return (
        <>
            <PageHeader
                title="Module"
                meta={doc.saved === null ? undefined : `${doc.draft.modules.length} Module auf der Webseite. Ein geänderter Status gilt sofort.`}
            >
                <ResetAction doc={doc} what="Die Modulliste samt aller Kacheln" />
                <Button variant="primary" size="sm" icon="plus" onClick={() => navigate("/webseite/neues-modul")}>
                    Neues Modul
                </Button>
            </PageHeader>

            {doc.problem && <Failure message={doc.problem} onRetry={doc.conflict ? doc.reload : undefined} />}

            {doc.saved !== null && meta.data !== null && categories.saved !== null ? (
                <>
                    <CategoriesPanel doc={categories} modules={doc.draft} meta={meta.data} />
                    <ModuleTable doc={doc} meta={meta.data} />
                </>
            ) : failure ? (
                <Failure
                    message={failure}
                    onRetry={() => {
                        doc.reload();
                        meta.reload();
                        categories.reload();
                    }}
                />
            ) : (
                <Loading label="Module werden geladen" />
            )}
        </>
    );
}
