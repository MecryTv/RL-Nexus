import { type JSX, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IPost } from "../../shared/news";
import { SUPPORTER_TYPE_LABELS, SUPPORTER_TYPES, type IEntry, type SupporterType } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { SidePanel } from "../components/SidePanel";
import { Switch } from "../components/Switch";
import { MediaPicker } from "../studio/MediaPicker";
import { useToast } from "../toast/context";
import { newEntry } from "./draft.ts";
import styles from "./partners.module.scss";

/**
 * W-0062 Teil 2: Unterstützer anlegen (S7). Kurz: Name, Webseite, Logo, Art,
 * Turniere und ob er gleich in der Leiste steht. Texte kommen im Studio dazu.
 */
export function CreateSupporterDialog({ open, onClose, posts }: { readonly open: boolean; readonly onClose: () => void; readonly posts: readonly IPost[] }): JSX.Element {
    const id = useId();
    const navigate = useNavigate();
    const notify = useToast();
    const [name, setName] = useState("");
    const [website, setWebsite] = useState("");
    const [logo, setLogo] = useState<string | null>(null);
    const [type, setType] = useState<SupporterType>("firma");
    const [tournaments, setTournaments] = useState<readonly number[]>([]);
    const [visible, setVisible] = useState(true);
    const [busy, setBusy] = useState(false);
    const events = posts.filter((post) => post.kind === "termin");
    const websiteProblem = website && !website.startsWith("https://") ? "Der Link muss mit https:// beginnen." : undefined;
    const ready = name.trim().length > 0 && !websiteProblem;

    const create = async (design: boolean): Promise<void> => {
        setBusy(true);

        try {
            const created = await api<IEntry>("/api/partners", {
                method: "POST",
                body: newEntry("supporter", name, { supporterType: type, visible, logo, links: website ? { website } : {}, tournamentIds: tournaments }),
            });

            notify(`${created.name} ist angelegt${visible ? " und steht in der Leiste" : ""}.`);
            onClose();
            setName("");
            setWebsite("");
            setLogo(null);
            setTournaments([]);

            if (design) navigate(`/webseite/partner/${created.id}`);
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Anlegen ging nicht.", "danger");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SidePanel
            open={open}
            title="Unterstützer hinzufügen"
            onClose={onClose}
            footer={
                <div className={styles.footer}>
                    <Button variant="ghost" onClick={onClose}>
                        Abbrechen
                    </Button>
                    <Button busy={busy} disabled={!ready} onClick={() => void create(false)}>
                        Anlegen
                    </Button>
                    <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void create(true)}>
                        Anlegen und gestalten
                    </Button>
                </div>
            }
        >
            <div className={styles.dialog}>
                <Field id={`${id}-name`} label="Name" counter={{ value: name.length, max: 80 }}>
                    <input id={`${id}-name`} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field id={`${id}-web`} label="Webseite" error={websiteProblem}>
                    <input id={`${id}-web`} type="url" inputMode="url" placeholder="https://" value={website} onChange={(event) => setWebsite(event.target.value.trim())} />
                </Field>
                <MediaPicker label="Logo" value={logo} onChange={setLogo} />
                <Segmented name={`${id}-art`} legend="Art" options={SUPPORTER_TYPES.map((value) => ({ value, label: SUPPORTER_TYPE_LABELS[value] }))} value={type} onChange={setType} />
                {type === "person" && <p className={styles.muted}>Der Name erscheint öffentlich. Trag eine Person nur mit ihrem Einverständnis ein.</p>}

                <fieldset className={styles.fieldset}>
                    <legend>Unterstützt bei · freiwillig</legend>
                    {events.length === 0 && <p className={styles.muted}>Noch keine Termine in den News.</p>}
                    {events.map((post) => (
                        <label key={post.id} className={styles.check}>
                            <input
                                type="checkbox"
                                checked={tournaments.includes(post.id)}
                                onChange={(event) => setTournaments((list) => (event.target.checked ? [...list, post.id] : list.filter((item) => item !== post.id)))}
                            />
                            {post.title}
                        </label>
                    ))}
                </fieldset>

                <Switch checked={visible} label="Gleich auf der Webseite zeigen" onChange={setVisible} />
                <p className={styles.muted}>
                    {visible ? `Mit „Anlegen“ steht ${name.trim() || "der Unterstützer"} sofort in der Leiste.` : "Angelegt, aber noch nicht auf der Webseite."} Die große Ansicht zeigt dann Name, Logo, Art und Link; Texte ergänzt du später im Studio.
                </p>
            </div>
        </SidePanel>
    );
}
