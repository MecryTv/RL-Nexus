import { type JSX, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PARTNER_TYPE_LABELS, PARTNER_TYPES, TIER_LABELS, SPONSOR_TIERS, type IEntry, type PartnerType, type SponsorTier } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { useToast } from "../toast/context";
import { ContactField } from "./ContactField";
import { newEntry } from "./draft.ts";
import styles from "./partners.module.scss";

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * W-0062 Teil 2: Anlegen (D3). Partner oder Sponsor, Name, Ansprechpartner und
 * Zugang; der Kasten „Rolle auf RL Nexus“ prüft vorab. Danach öffnet sich das
 * Studio. Der Eintrag bleibt unsichtbar, bis „Auf der Seite zeigen“ an ist.
 */
export function CreateEntryDialog({ open, onClose, entries }: { readonly open: boolean; readonly onClose: () => void; readonly entries: readonly IEntry[] }): JSX.Element {
    const id = useId();
    const navigate = useNavigate();
    const notify = useToast();
    const [kind, setKind] = useState<"partner" | "sponsor">("partner");
    const [partnerType, setPartnerType] = useState<PartnerType>("organisation");
    const [tier, setTier] = useState<SponsorTier>("sponsor");
    const [name, setName] = useState("");
    const [contactId, setContactId] = useState("");
    const [access, setAccess] = useState<"free" | "paid">("free");
    const [busy, setBusy] = useState(false);
    const main = entries.find((entry) => entry.kind === "sponsor" && entry.tier === "main") ?? null;
    const contact = SNOWFLAKE.test(contactId) ? contactId : null;
    const ready = name.trim().length > 0 && (contactId === "" || contact !== null);

    const create = async (): Promise<void> => {
        setBusy(true);

        try {
            const created = await api<IEntry>("/api/partners", { method: "POST", body: newEntry(kind, name, { partnerType, tier, contactId: contact, access }) });

            onClose();
            navigate(`/webseite/partner/${created.id}`);
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Anlegen ging nicht.", "danger");
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog open={open} title="Partner/Sponsoring anlegen" confirmLabel="Anlegen und gestalten" busy={busy} confirmDisabled={!ready} wide onConfirm={() => void create()} onCancel={onClose}>
            <div className={styles.dialog}>
                <p className={styles.muted}>Für die Seite Partner/Sponsorings und, mit Discord-Konto, für Zugang und Rolle.</p>

                <Segmented
                    name={`${id}-art`}
                    legend="Art"
                    options={[
                        { value: "partner", label: "Partner", title: "Organisation, Creator, Liga, Community" },
                        { value: "sponsor", label: "Sponsor", title: "Firma, die uns unterstützt, mit Stufe und Angebot" },
                    ]}
                    value={kind}
                    onChange={setKind}
                />

                {kind === "partner" ? (
                    <Segmented name={`${id}-typ`} legend="Art des Partners" options={PARTNER_TYPES.map((value) => ({ value, label: PARTNER_TYPE_LABELS[value] }))} value={partnerType} onChange={setPartnerType} />
                ) : (
                    <>
                        <Segmented name={`${id}-stufe`} legend="Stufe" options={SPONSOR_TIERS.map((value) => ({ value, label: TIER_LABELS[value] }))} value={tier} onChange={setTier} />
                        {tier === "main" && (
                            <p className={styles.muted}>Ein Hauptsponsor ist höchstens einmal möglich; {main ? `${main.name} war bisher Hauptsponsor und wird Sponsor.` : "wer bisher Hauptsponsor war, wird Sponsor."}</p>
                        )}
                    </>
                )}

                <Field id={`${id}-name`} label="Name" counter={{ value: name.length, max: 80 }}>
                    <input id={`${id}-name`} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                </Field>

                <ContactField value={contactId} onChange={setContactId} label={kind === "sponsor" ? "Kontaktperson auf Discord" : "Ansprechpartner auf Discord"} />

                {contact && (
                    <Segmented
                        name={`${id}-zugang`}
                        legend="Zugang zum Bot-Dashboard"
                        options={[
                            { value: "free", label: "Free Access", title: "Ohne Kauf, solange Partner." },
                            { value: "paid", label: "Paid Access", title: "Braucht ein Abo wie alle." },
                        ]}
                        value={access}
                        onChange={setAccess}
                    />
                )}
            </div>
        </ConfirmDialog>
    );
}
