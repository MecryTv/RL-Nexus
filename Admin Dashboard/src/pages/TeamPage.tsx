import { useState, type JSX } from "react";
import { CONTENT_LIMITS, type IContentMeta, type IMember, type IOpenRole, type ITeam } from "../../shared/content";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { ColorPicker, EditorBar, IconPicker, ListControls, ObjectList, ResetAction, TextList } from "../editor/EditorParts";
import { colorValue } from "../editor/iconUrl";
import { moveTo, removeAt, replaceAt } from "../editor/list";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { useContentDoc, type IContentDoc } from "../editor/useContentDoc";
import { useTitle } from "../useTitle";
import styles from "./TeamPage.module.scss";

const LIMITS = CONTENT_LIMITS.team;

const NEW_MEMBER: IMember = { name: "", handle: "", role: "", text: "", focus: [], accent: "var(--c-blue)" };
const NEW_ROLE: IOpenRole = { title: "", text: "", icon: "users" };

/** Alles zu einer Person, im Seitenpanel. */
function MemberForm({ member, meta, onChange }: { readonly member: IMember; readonly meta: IContentMeta; readonly onChange: (member: IMember) => void }): JSX.Element {
    const set = (change: Partial<IMember>): void => onChange({ ...member, ...change });

    return (
        <>
            <Field id="mitglied-name" label="Name" counter={{ value: member.name.length, max: LIMITS.name }}>
                <input id="mitglied-name" type="text" maxLength={LIMITS.name} value={member.name} onChange={(event) => set({ name: event.target.value })} />
            </Field>
            <Field id="mitglied-handle" label="Discord-Name" hint="So wie er im Support-Server steht, etwa @mecrytv.">
                <input
                    id="mitglied-handle"
                    type="text"
                    maxLength={LIMITS.handle}
                    value={member.handle}
                    onChange={(event) => set({ handle: event.target.value })}
                    aria-describedby="mitglied-handle-hint"
                />
            </Field>
            <Field id="mitglied-rolle" label="Rolle im Projekt" hint="Steht oben rechts auf der Karte, etwa „Entwicklung“.">
                <input
                    id="mitglied-rolle"
                    type="text"
                    maxLength={LIMITS.role}
                    value={member.role}
                    onChange={(event) => set({ role: event.target.value })}
                    aria-describedby="mitglied-rolle-hint"
                />
            </Field>
            <Field id="mitglied-text" label="Text" counter={{ value: member.text.length, max: LIMITS.text }}>
                <textarea id="mitglied-text" rows={5} maxLength={LIMITS.text} value={member.text} onChange={(event) => set({ text: event.target.value })} />
            </Field>
            <TextList
                legend="Schwerpunkte"
                itemLabel="Schwerpunkt"
                values={member.focus}
                onChange={(focus) => set({ focus })}
                max={LIMITS.focus}
                maxLength={LIMITS.focusEntry}
                addLabel="Schwerpunkt hinzufügen"
            />
            <ColorPicker id="mitglied-farbe" label="Farbe der Karte" value={member.accent} meta={meta} onChange={(accent) => set({ accent })} />
            <ObjectList
                legend="Links"
                items={member.links ?? []}
                onChange={(links) => set({ links: links.length > 0 ? links : undefined })}
                max={LIMITS.links}
                create={() => ({ label: "", href: "", icon: "discord" })}
                addLabel="Link hinzufügen"
                itemLabel={(link, index) => `Link ${index + 1}${link.label ? `: ${link.label}` : ""}`}
            >
                {(link, update, index) => (
                    <>
                        <Field id={`link-${index}-label`} label="Beschriftung">
                            <input
                                id={`link-${index}-label`}
                                type="text"
                                maxLength={LIMITS.linkLabel}
                                value={link.label}
                                onChange={(event) => update({ ...link, label: event.target.value })}
                            />
                        </Field>
                        <Field id={`link-${index}-href`} label="Adresse" hint="https://… oder ein Pfad der Webseite wie /kontakt">
                            <input
                                id={`link-${index}-href`}
                                type="text"
                                inputMode="url"
                                maxLength={LIMITS.href}
                                value={link.href}
                                onChange={(event) => update({ ...link, href: event.target.value.trim() })}
                                aria-describedby={`link-${index}-href-hint`}
                            />
                        </Field>
                        <IconPicker id={`link-${index}-icon`} label="Symbol" value={link.icon} meta={meta} onChange={(icon) => update({ ...link, icon })} />
                    </>
                )}
            </ObjectList>
        </>
    );
}

/** Mitglieder und offene Stellen, sobald Team und Meta geladen sind. */
function TeamEditor({ doc, meta }: { readonly doc: IContentDoc<ITeam>; readonly meta: IContentMeta }): JSX.Element {
    const [editing, setEditing] = useState<number | null>(null);
    const team = doc.draft;

    const setMembers = (members: readonly IMember[]): void => doc.update((current) => ({ ...current, members }));
    const editingMember = editing === null ? undefined : team.members[editing];

    function addMember(): void {
        setMembers([...team.members, NEW_MEMBER]);
        setEditing(team.members.length);
    }

    return (
        <>
            <section className={styles.section} aria-labelledby="team-mitglieder">
                <div className={styles.head}>
                    <h2 id="team-mitglieder" className={styles.heading}>
                        Mitglieder
                    </h2>
                    <Button size="sm" icon="plus" onClick={addMember} disabled={team.members.length >= LIMITS.members}>
                        Mitglied hinzufügen
                    </Button>
                </div>

                {team.members.length === 0 ? (
                    <p className={styles.empty}>Niemand eingetragen. Die Webseite zeigt dann nur die Karte „Noch frei“.</p>
                ) : (
                    <ol className={styles.cards}>
                        {team.members.map((member, index) => (
                            <li key={index}>
                                <Panel cut="sm" className={styles.card}>
                                    <span className={styles.swatch} style={{ background: colorValue(member.accent, meta) }} aria-hidden="true" />
                                    <div className={styles.identity}>
                                        <p className={styles.name}>{member.name || "Ohne Namen"}</p>
                                        <p className={styles.detail}>
                                            {[member.handle, member.role].filter(Boolean).join(" · ") || "Noch nichts eingetragen"}
                                        </p>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(index)}>
                                            Bearbeiten
                                        </Button>
                                        <ListControls
                                            index={index}
                                            count={team.members.length}
                                            label={member.name || `Mitglied ${index + 1}`}
                                            onMove={(to) => setMembers(moveTo(team.members, index, to))}
                                            onRemove={() => {
                                                setMembers(removeAt(team.members, index));
                                                setEditing(null);
                                            }}
                                        />
                                    </div>
                                </Panel>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <section className={styles.section} aria-labelledby="team-stellen">
                <h2 id="team-stellen" className={styles.heading}>
                    Offene Stellen
                </h2>
                <p className={styles.empty}>Ohne Einträge fällt der Abschnitt „Gesucht“ auf der Webseite weg.</p>
                <ObjectList
                    legend="Stellen"
                    items={team.openRoles}
                    onChange={(openRoles) => doc.update((current) => ({ ...current, openRoles }))}
                    max={LIMITS.openRoles}
                    create={() => NEW_ROLE}
                    addLabel="Stelle hinzufügen"
                    itemLabel={(role, index) => `Stelle ${index + 1}${role.title ? `: ${role.title}` : ""}`}
                >
                    {(role, update, index) => (
                        <>
                            <Field id={`stelle-${index}-titel`} label="Titel">
                                <input
                                    id={`stelle-${index}-titel`}
                                    type="text"
                                    maxLength={LIMITS.roleTitle}
                                    value={role.title}
                                    onChange={(event) => update({ ...role, title: event.target.value })}
                                />
                            </Field>
                            <Field id={`stelle-${index}-text`} label="Text" counter={{ value: role.text.length, max: LIMITS.roleText }}>
                                <textarea
                                    id={`stelle-${index}-text`}
                                    rows={3}
                                    maxLength={LIMITS.roleText}
                                    value={role.text}
                                    onChange={(event) => update({ ...role, text: event.target.value })}
                                />
                            </Field>
                            <IconPicker id={`stelle-${index}-symbol`} label="Symbol" value={role.icon} meta={meta} onChange={(icon) => update({ ...role, icon })} />
                        </>
                    )}
                </ObjectList>
            </section>

            <SidePanel open={editingMember !== undefined} title={editingMember?.name || "Neues Mitglied"} onClose={() => setEditing(null)}>
                {editingMember !== undefined && editing !== null && (
                    <MemberForm member={editingMember} meta={meta} onChange={(member) => setMembers(replaceAt(team.members, editing, member))} />
                )}
            </SidePanel>
        </>
    );
}

export function TeamPage(): JSX.Element {
    useTitle("Team");

    const doc = useContentDoc<ITeam>("/api/content/team");
    const meta = useApi<IContentMeta>("/api/content/meta");
    const failure = doc.loadError ?? (meta.error && !meta.data ? meta.error.message : null);

    return (
        <>
            <PageHeader title="Team" meta="Die Personen und offenen Stellen auf der Team-Seite der Webseite.">
                <ResetAction doc={doc} what="Das Team" />
            </PageHeader>

            {doc.saved !== null && meta.data !== null ? (
                <TeamEditor doc={doc} meta={meta.data} />
            ) : failure ? (
                <Failure
                    message={failure}
                    onRetry={() => {
                        doc.reload();
                        meta.reload();
                    }}
                />
            ) : (
                <Loading label="Team wird geladen" />
            )}

            <EditorBar doc={doc} />
            <UnsavedGuard dirty={doc.dirty} />
        </>
    );
}
