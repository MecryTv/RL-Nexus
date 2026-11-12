import { useEffect, useId, useRef, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { BAN_REASONS, BLOCKS, presetOf, PRESET_LABELS, scopeOf, type Block, type IBanProfile, type IPersonPrefill } from "../../shared/security.ts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useNow } from "../useNow";
import { Avatar, EvidencePicker, PendingList, ScopePicker } from "./parts";
import { ageText, evidenceBody, type PendingEvidence } from "./util.ts";
import styles from "./security.module.scss";

/** Was das Fenster tut: neu sperren (auch aus einem Verdachtsfall), Umfang ändern oder aufheben. */
export type BanDialogMode =
    | { readonly kind: "ban"; readonly userId: string; readonly reasons?: readonly string[]; readonly ref?: number | null }
    | { readonly kind: "change"; readonly profile: IBanProfile; readonly flip?: string }
    | { readonly kind: "lift"; readonly profile: IBanProfile };

const WORD = { ban: "SPERREN", change: "ÄNDERN", lift: "AUFHEBEN" } as const;
const YOUNG = 30;

const scopeText = (scope: readonly Block[]): string => PRESET_LABELS[presetOf(scope)];
const accounts = (count: number): string => (count === 1 ? "1 Konto" : `${formatNumber(count)} Konten`);
const dms = (count: number): string => (count === 1 ? "1 DM geht raus" : `${formatNumber(count)} DMs gehen raus`);

/**
 * Das Sperrfenster (B1a V1): ruhige Formularzeilen, links was und warum,
 * rechts das Feld. Unten ein Satz, was passiert, und das Wort zum Bestätigen.
 */
export function BanDialog({ mode, onClose, onDone }: { readonly mode: BanDialogMode; readonly onClose: () => void; readonly onDone: (banId: number) => void }): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const notify = useToast();
    const now = useNow(60_000);
    const userId = mode.kind === "ban" ? mode.userId : mode.profile.person.id;
    const prefill = useApi<IPersonPrefill>(`/api/security/person/${userId}`);
    const profile = mode.kind === "ban" ? null : mode.profile;

    const [reasons, setReasons] = useState<readonly string[]>(mode.kind === "ban" ? (mode.reasons ?? []) : []);
    const [note, setNote] = useState("");
    const [scope, setScope] = useState<Block[]>(profile ? [...profile.scope] : scopeOf("voll"));
    const [leave, setLeave] = useState<ReadonlySet<string>>(() => {
        const on = new Set(profile?.servers.filter((server) => server.leave).map((server) => server.id) ?? []);

        if (mode.kind === "change" && mode.flip) {
            if (on.has(mode.flip)) on.delete(mode.flip);
            else on.add(mode.flip);
        }

        return on;
    });
    const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());
    const [evidence, setEvidence] = useState<PendingEvidence[]>([]);
    const [word, setWord] = useState("");
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState(false);

    useEffect(() => {
        ref.current?.showModal();
    }, []);

    const data = prefill.data;
    // Nur Server, die der Person gehören; eingeladene fremde Server zeigt das Profil, ohne Schalter.
    const servers = (profile ? profile.servers.filter((server) => server.active || server.leave) : (data?.servers ?? [])).filter((server) => server.owner);
    const person = profile?.person ?? data?.person ?? null;
    const before = profile ? new Set(profile.servers.filter((server) => server.leave).map((server) => server.id)) : new Set<string>();
    const historyCount = data ? data.history.bans + data.history.modCases + data.history.ticketBlocks : 0;
    const blocked = mode.kind === "ban" && data && (data.team || data.activeBan !== null);
    const needsText = mode.kind !== "ban" || reasons.length === 0;
    const ready = word.trim().toUpperCase() === WORD[mode.kind] && (mode.kind === "lift" || scope.length > 0) && (!needsText || note.trim().length > 0) && !blocked && !busy;

    const summary = ((): string[] => {
        if (mode.kind === "lift") return ["Die Sperre endet sofort, 1 DM geht raus.", before.size ? `Alle ${formatNumber(before.size)} gesperrten Server dürfen den Bot wieder einladen.` : "Server-Schalter gibt es keine."];

        const leaving = servers.filter((server) => leave.has(server.id)).length;
        const full = BLOCKS.every((block) => scope.includes(block));
        const serverLine = servers.length ? `Bot verlässt ${formatNumber(leaving)} von ${formatNumber(servers.length)} Servern` : "Keine eigenen Server";

        if (mode.kind === "change") {
            const changed = profile!.scope.join(",") !== scope.join(",");

            return [changed ? `${scopeText(profile!.scope)} → ${scopeText(scope)}, ${dms(1)}` : "Umfang bleibt, keine DM", serverLine];
        }

        const count = 1 + linked.size;

        return [`${accounts(count)} ${full ? "überall" : "teilweise"} gesperrt, ${dms(count)}`, serverLine];
    })();

    const submit = async (): Promise<void> => {
        setBusy(true);

        try {
            if (mode.kind === "lift") {
                await api(`/api/security/bans/${mode.profile.id}/lift`, { method: "POST", body: { note } });
                notify(`Sperre von ${mode.profile.person.name} aufgehoben. Ob die DM ankam, steht im Protokoll.`);
                onDone(mode.profile.id);

                return;
            }

            if (mode.kind === "change") {
                const allow = [...before].filter((id) => !leave.has(id));
                const add = [...leave].filter((id) => !before.has(id));

                await api(`/api/security/bans/${mode.profile.id}/change`, { method: "POST", body: { scope, note, leave: add, allow } });
                notify("Sperre geändert. Ob die DM ankam, steht im Protokoll.");
                onDone(mode.profile.id);

                return;
            }

            const result = await api<{ banIds: number[]; undelivered: number }>("/api/security/bans", {
                method: "POST",
                body: { userId, scope, reasons, note, leave: [...leave], linked: [...linked], ref: mode.ref ?? null },
            });
            const banId = result.banIds[0]!;
            let failed = 0;

            for (const entry of evidence) {
                await api(`/api/security/bans/${banId}/evidence`, { method: "POST", body: evidenceBody(entry) }).catch(() => failed++);
            }

            notify(
                [`${accounts(result.banIds.length)} gesperrt.`, result.undelivered ? `${formatNumber(result.undelivered)} ${result.undelivered === 1 ? "DM" : "DMs"} nicht zustellbar, die Sperre gilt trotzdem.` : "", failed ? `${formatNumber(failed)} ${failed === 1 ? "Beleg" : "Belege"} nicht gespeichert.` : ""].filter(Boolean).join(" "),
                failed || result.undelivered ? "danger" : undefined
            );
            onDone(banId);
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
            setBusy(false);
        }
    };

    const title = person ? (mode.kind === "ban" ? `${person.name} sperren` : mode.kind === "change" ? `Sperre von ${person.name} ändern` : `Sperre von ${person.name} aufheben`) : "Person sperren";

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onClose();
            }}
        >
            <div className={styles.dlg}>
                <header className={styles.dh}>
                    {person && <Avatar person={person} size={44} />}
                    <div className={styles.grow}>
                        <h2 id={titleId}>{title}</h2>
                        {data && (
                            <p className={styles.meta}>
                                {data.handle && <span>@{data.handle}</span>}
                                <span>ID {userId}</span>
                                <span className={data.accountDays < YOUNG ? styles.warnText : undefined}>Konto {ageText(data.accountDays)} alt</span>
                                <span>besitzt {formatNumber(data.servers.filter((server) => server.owner).length)} Server</span>
                            </p>
                        )}
                    </div>
                    {data && (
                        <span className={styles.historyWrap}>
                            <button type="button" className={styles.ghostButton} aria-expanded={history} onClick={() => setHistory(!history)}>
                                Vorgeschichte <b>{formatNumber(historyCount)}</b>
                            </button>
                            {history && (
                                <span className={styles.popover} role="dialog" aria-label="Vorgeschichte">
                                    <span>Frühere Sperren: {formatNumber(data.history.bans)}</span>
                                    <span>Verdachtsfälle: {formatNumber(data.history.suspects)}</span>
                                    <span>Mod-Fälle: {formatNumber(data.history.modCases)}</span>
                                    <span>Ticket-Sperren: {formatNumber(data.history.ticketBlocks)}</span>
                                </span>
                            )}
                        </span>
                    )}
                    <button type="button" className={styles.iconButton} aria-label="Schließen" onClick={onClose} disabled={busy}>
                        <Icon name="close" size={16} />
                    </button>
                </header>

                <div className={styles.db}>
                    {prefill.error && !data && <Failure message={prefill.error.message} onRetry={prefill.reload} />}
                    {!data && !prefill.error && <Loading label="Person wird geladen" />}

                    {data && mode.kind === "ban" && data.team && <p className={styles.stop}>Mitglieder des Teams lassen sich nicht sperren.</p>}
                    {data && mode.kind === "ban" && data.activeBan !== null && (
                        <p className={styles.stop}>
                            {data.person.name} ist schon gesperrt. <Link to={`/sicherheit/sperre/${data.activeBan}`}>Zur Sperre</Link>
                        </p>
                    )}

                    {data && !blocked && (
                        <>
                            <div className={styles.frow}>
                                <div className={styles.flab}>
                                    <b>{mode.kind === "ban" ? "Grund" : mode.kind === "change" ? "Änderung" : "Warum aufheben"}</b>
                                    <span>{mode.kind === "ban" ? "Nur für das Team sichtbar" : "Pflicht, steht im Protokoll"}</span>
                                </div>
                                <div>
                                    {mode.kind === "ban" && (
                                        <div className={styles.tokens} role="group" aria-label="Vorlagen">
                                            {BAN_REASONS.map((reason) => (
                                                <button
                                                    key={reason}
                                                    type="button"
                                                    className={styles.token}
                                                    aria-pressed={reasons.includes(reason)}
                                                    onClick={() => setReasons(reasons.includes(reason) ? reasons.filter((entry) => entry !== reason) : [...reasons, reason])}
                                                >
                                                    {reason}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <textarea aria-label={mode.kind === "ban" ? "Grund in eigenen Worten" : "Begründung"} rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
                                </div>
                            </div>

                            {mode.kind === "ban" && (
                                <div className={styles.frow}>
                                    <div className={styles.flab}>
                                        <b>Belege</b>
                                        <span>PNG, JPG, WebP bis 8 MB oder ein Discord-Link</span>
                                    </div>
                                    <div>
                                        <PendingList entries={evidence} note="wird nach dem Sperren gesichert" onRemove={(index) => setEvidence(evidence.filter((_, at) => at !== index))} />
                                        <EvidencePicker onAdd={(added) => setEvidence([...evidence, ...added])} />
                                    </div>
                                </div>
                            )}

                            {mode.kind !== "lift" && (
                                <div className={styles.frow}>
                                    <div className={styles.flab}>
                                        <b>Umfang</b>
                                        <span>Was die Person nicht mehr nutzen darf</span>
                                    </div>
                                    <ScopePicker scope={scope} onChange={setScope} />
                                </div>
                            )}

                            {mode.kind !== "lift" && (
                                <div className={styles.frow}>
                                    <div className={styles.flab}>
                                        <b>Eigene Server</b>
                                        <span>Standard: Bot bleibt, Besitzer ist raus</span>
                                    </div>
                                    <div>
                                        {servers.length === 0 && <p className={styles.dim}>Die Person hat keinen Server mit dem Bot.</p>}
                                        {servers.map((server) => (
                                            <label key={server.id} className={styles.lrow}>
                                                <span className={styles.grow}>
                                                    {server.name} <small>· {ageText(Math.floor((now - new Date(server.since).getTime()) / 86_400_000))} alt</small>
                                                </span>
                                                <span className={styles.num}>{formatNumber(server.members)}</span>
                                                <span className={styles.leave}>
                                                    Bot verlässt
                                                    <input
                                                        type="checkbox"
                                                        role="switch"
                                                        checked={leave.has(server.id)}
                                                        onChange={(event) => {
                                                            const next = new Set(leave);

                                                            if (event.target.checked) next.add(server.id);
                                                            else next.delete(server.id);
                                                            setLeave(next);
                                                        }}
                                                    />
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {mode.kind === "ban" && data.linked.length > 0 && (
                                <div className={styles.frow}>
                                    <div className={styles.flab}>
                                        <b>Verknüpfte Konten</b>
                                        <span>Aus der VPN- und IP-Prüfung</span>
                                    </div>
                                    <div>
                                        {data.linked.map((entry) => (
                                            <label key={entry.person.id} className={styles.lrow}>
                                                <input
                                                    type="checkbox"
                                                    checked={linked.has(entry.person.id)}
                                                    onChange={(event) => {
                                                        const next = new Set(linked);

                                                        if (event.target.checked) next.add(entry.person.id);
                                                        else next.delete(entry.person.id);
                                                        setLinked(next);
                                                    }}
                                                />
                                                <Avatar person={entry.person} size={24} />
                                                <span className={styles.grow}>
                                                    {entry.person.name} <small>· {entry.reason === "same_ip" ? "gleiche IP, ohne VPN" : entry.reason === "vpn" ? "VPN, gleiches Netz" : "gleiches Netz"}</small>
                                                </span>
                                                <span className={entry.accountDays < YOUNG ? styles.warnText : styles.dim}>{ageText(entry.accountDays)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <footer className={styles.df}>
                    <div className={styles.sum} aria-live="polite">
                        {data && !blocked && summary.map((line) => <div key={line}>{line}</div>)}
                    </div>
                    <input className={styles.word} aria-label={`${WORD[mode.kind]} eintippen`} placeholder={`${WORD[mode.kind]} eintippen`} value={word} autoComplete="off" onChange={(event) => setWord(event.target.value)} disabled={!data || Boolean(blocked)} />
                    <Button variant="danger" busy={busy} disabled={!ready} onClick={() => void submit()}>
                        {mode.kind === "ban" ? "Endgültig sperren" : mode.kind === "change" ? "Ändern" : "Aufheben"}
                    </Button>
                </footer>
            </div>
        </dialog>
    );
}
