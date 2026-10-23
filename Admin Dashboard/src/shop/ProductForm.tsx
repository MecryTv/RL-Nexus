import type { JSX } from "react";
import { SHOP_LIMITS, type IGuildRole } from "../../shared/shop";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { Switch } from "../components/Switch";
import type { IProductDraft } from "./draft";
import styles from "./shop.module.scss";

const KINDS = [
    { value: "subscription", label: "Abo, monatlich" },
    { value: "one_time", label: "Einmalig" },
] as const;

export function ProductForm({
    draft,
    roles,
    rolesError,
    hasSubscribers,
    error,
    onChange,
}: {
    readonly draft: IProductDraft;
    readonly roles: readonly IGuildRole[];
    readonly rolesError: string | null;
    /** Laufende Abos behalten ihren Preis. Das steht dann am Preisfeld. */
    readonly hasSubscribers: boolean;
    readonly error: string | null;
    readonly onChange: (draft: IProductDraft) => void;
}): JSX.Element {
    const set = <K extends keyof IProductDraft>(key: K, value: IProductDraft[K]): void => onChange({ ...draft, [key]: value });

    return (
        <div className={styles.form}>
            {error && (
                <p className={styles.formError} role="alert">
                    {error}
                </p>
            )}

            <Field id="produkt-titel" label="Titel" counter={{ value: draft.title.length, max: SHOP_LIMITS.title }}>
                <input id="produkt-titel" type="text" maxLength={SHOP_LIMITS.title} value={draft.title} onChange={(event) => set("title", event.target.value)} />
            </Field>

            <Field id="produkt-text" label="Beschreibung" hint="Eine Zeile unter dem Titel. Leer: die Laufzeit." counter={{ value: draft.description.length, max: SHOP_LIMITS.description }}>
                <input
                    id="produkt-text"
                    type="text"
                    maxLength={SHOP_LIMITS.description}
                    value={draft.description}
                    onChange={(event) => set("description", event.target.value)}
                    aria-describedby="produkt-text-hint"
                />
            </Field>

            <Field id="produkt-punkte" label="Stichpunkte" hint={`Je Zeile einer, höchstens ${SHOP_LIMITS.bullets}.`}>
                <textarea id="produkt-punkte" rows={4} value={draft.bullets} onChange={(event) => set("bullets", event.target.value)} aria-describedby="produkt-punkte-hint" />
            </Field>

            <Segmented name="produkt-art" legend="Art" options={KINDS} value={draft.kind} onChange={(kind) => set("kind", kind)} />

            {draft.kind === "one_time" && (
                <div className={styles.row}>
                    <Switch checked={draft.unlimited} label="Unbegrenzt" onChange={(unlimited) => set("unlimited", unlimited)} />
                    {!draft.unlimited && (
                        <Field id="produkt-tage" label="Laufzeit in Tagen">
                            <input id="produkt-tage" type="text" inputMode="numeric" value={draft.days} onChange={(event) => set("days", event.target.value)} />
                        </Field>
                    )}
                </div>
            )}

            <div className={styles.row}>
                <Field
                    id="produkt-preis"
                    label={draft.kind === "subscription" ? "Preis je Monat" : "Preis"}
                    hint={hasSubscribers ? "Laufende Abos behalten ihren bisherigen Preis." : "Endpreis in Euro, etwa 4,99."}
                >
                    <input
                        id="produkt-preis"
                        type="text"
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(event) => set("price", event.target.value)}
                        aria-describedby="produkt-preis-hint"
                    />
                </Field>
                <Field id="produkt-badge" label="Hervorhebung" hint="Etwa „Beliebt“. Leer: keine." counter={{ value: draft.badge.length, max: SHOP_LIMITS.badge }}>
                    <input
                        id="produkt-badge"
                        type="text"
                        maxLength={SHOP_LIMITS.badge}
                        value={draft.badge}
                        onChange={(event) => set("badge", event.target.value)}
                        aria-describedby="produkt-badge-hint"
                    />
                </Field>
            </div>

            <Field
                id="produkt-rolle"
                label="Discord-Rolle"
                hint="Bekommt, wer dieses Produkt hat. Die Rolle des Bots muss darüber stehen."
                error={rolesError ?? undefined}
            >
                <select
                    id="produkt-rolle"
                    value={draft.roleId}
                    disabled={rolesError !== null}
                    onChange={(event) => set("roleId", event.target.value)}
                    aria-describedby={rolesError ? "produkt-rolle-error" : "produkt-rolle-hint"}
                >
                    <option value="">Rolle wählen</option>
                    {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                            {role.name}
                        </option>
                    ))}
                </select>
            </Field>

            <Switch checked={draft.visible} label="Auf der Webseite sichtbar" onChange={(visible) => set("visible", visible)} />
        </div>
    );
}
