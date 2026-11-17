import type { JSX } from "react";
import type { IBotModuleView } from "../../shared/botModules";
import { settingsOf, type IModuleSettingDef } from "../../shared/botModuleSettings";
import { Switch } from "../components/Switch";
import styles from "./botModules.module.scss";
import { valueError, type Draft } from "./moduleDraft";

/**
 * W-0133: Abschnitt „Grenzen und Werte“. Für alle Server mit dem Schalter
 * „auf Anfrage änderbar“ je Feld; für einen Server übernommene Werte
 * gestrichelt, eigene blau, „nur alle“-Felder gesperrt mit Grund.
 */
const PERSON_KEYS = new Set(["switchDays", "fixMinutes"]);

function onlyAllReason(def: IModuleSettingDef): string {
    return PERSON_KEYS.has(def.key) ? "Die Sperre gehört der Person, nicht dem Server. Gilt nur für alle Server." : "Läuft im Bot für alle Server gemeinsam. Gilt nur für alle Server.";
}

const unit = (def: IModuleSettingDef): string => def.unit ?? "";

export function ModuleValues({
    module,
    draft,
    number,
    serverName,
    onValues,
    onAskable,
}: {
    readonly module: IBotModuleView;
    readonly draft: Draft;
    readonly number: string;
    readonly serverName: string | null;
    readonly onValues: (values: Readonly<Record<string, string>>) => void;
    readonly onAskable: (askable: Readonly<Record<string, boolean>>) => void;
}): JSX.Element | null {
    const defs = settingsOf(module.module);

    if (defs.length === 0) return null;

    const setValue = (key: string, value: string | undefined): void => {
        const { [key]: _old, ...rest } = draft.values;

        onValues(value === undefined ? rest : { ...rest, [key]: value });
    };

    return (
        <section className={styles.section}>
            <h3>
                <span>{number}</span>Grenzen und Werte
            </h3>
            <p className={styles.note}>
                {draft.kind === "all"
                    ? "Standard ist der Wert, den der Bot bis jetzt fest hatte. Sinkt eine Grenze, bleibt Bestehendes, nur Neues wird abgelehnt."
                    : `Gestrichelt übernimmt ${serverName ?? "der Server"} den Wert für alle. Änderst du ihn, bekommt der Server einen eigenen Wert.`}
            </p>
            <div className={styles.fields}>
                {defs.map((def) => {
                    const id = `wert-${module.module}-${def.key}`;
                    const global = module.values[def.key];

                    if (draft.kind === "all") {
                        const raw = draft.values[def.key] ?? "";
                        const changed = raw !== String(global);
                        const error = valueError(def, raw);

                        return (
                            <div key={def.key} className={styles.field}>
                                <label htmlFor={id}>
                                    {def.label}
                                    {changed && <span className={`${styles.tag} ${styles.tagOwn}`}>geändert</span>}
                                    {!def.server && <span className={styles.tag}>nur alle</span>}
                                </label>
                                <div className={`${styles.inp} ${changed ? styles.inpOwn : ""} ${error ? styles.inpError : ""}`}>
                                    <input
                                        id={id}
                                        inputMode="numeric"
                                        value={raw}
                                        aria-invalid={error ? true : undefined}
                                        aria-describedby={`${id}-hint`}
                                        onChange={(event) => setValue(def.key, event.target.value)}
                                    />
                                    <span id={`${id}-hint`}>
                                        {unit(def)}
                                        {global !== def.standard ? ` · Standard ${def.standard}` : ""} · {def.min} bis {def.max}
                                    </span>
                                </div>
                                {error && <p className={styles.fieldError}>{error}</p>}
                                <Switch
                                    checked={draft.askable[def.key] ?? false}
                                    label={draft.askable[def.key] ? "Server sehen „auf Anfrage änderbar“" : "Kein Hinweis für Server"}
                                    onChange={(checked) => onAskable({ ...draft.askable, [def.key]: checked })}
                                />
                            </div>
                        );
                    }

                    if (!def.server) {
                        return (
                            <div key={def.key} className={styles.field}>
                                <label htmlFor={id}>
                                    {def.label}
                                    <span className={styles.tag}>nur alle</span>
                                </label>
                                <div className={`${styles.inp} ${styles.inpLocked}`}>
                                    <input id={id} value={global} disabled aria-describedby={`${id}-hint`} />
                                    <span>{unit(def)}</span>
                                </div>
                                <p id={`${id}-hint`} className={styles.fieldNote}>
                                    {onlyAllReason(def)}
                                </p>
                            </div>
                        );
                    }

                    const own = draft.values[def.key];
                    const error = own === undefined ? null : valueError(def, own);

                    return (
                        <div key={def.key} className={styles.field}>
                            <label htmlFor={id}>
                                {def.label}
                                {own === undefined ? <span className={styles.tag}>übernommen</span> : <span className={`${styles.tag} ${styles.tagOwn}`}>eigener Wert</span>}
                            </label>
                            <div className={`${styles.inp} ${own === undefined ? styles.inpInherit : styles.inpOwn} ${error ? styles.inpError : ""}`}>
                                <input
                                    id={id}
                                    inputMode="numeric"
                                    value={own ?? String(global)}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={`${id}-hint`}
                                    onChange={(event) => setValue(def.key, event.target.value)}
                                />
                                <span id={`${id}-hint`}>
                                    {unit(def)}
                                    {own === undefined ? " · wie alle" : ` · für alle: ${global}`}
                                </span>
                            </div>
                            {error && <p className={styles.fieldError}>{error}</p>}
                            {own !== undefined && (
                                <button type="button" className={styles.linkBtn} onClick={() => setValue(def.key, undefined)}>
                                    Zurück auf den Wert für alle
                                </button>
                            )}
                            <p className={styles.fieldNote}>{module.askable[def.key] ? "Server sehen „auf Anfrage änderbar“." : "Kein Hinweis für Server."}</p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
