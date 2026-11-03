import { useState, type JSX } from "react";
import { LEFT_TEXT, type IInvitedServer, type IPersonServers } from "../../shared/servers.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { Seal } from "./parts";
import { day, dropText, initials, since, useAct } from "./util.ts";
import { ServerMembers } from "./ServerMembers";
import styles from "./servers.module.scss";

const STATE_CLASS: Readonly<Record<IInvitedServer["state"], string>> = { main: styles.isMain, active: "", approved: styles.isApproved, waiting: styles.isWaiting, left: styles.isLeft };

/** Reiter „Eingeladene Server“ im Profil (W-0064, Entwurf 3d+). */
export function InvitedServers({ userId }: { readonly userId: string }): JSX.Element {
    const state = useApi<IPersonServers>(`/api/servers/person/${userId}`);
    const data = state.data;

    useLive("servers", state.reload);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label="Eingeladene Server werden geladen" />;

    const active = data.servers.filter((server) => server.state !== "left" && server.state !== "waiting");
    const main = data.servers.find((server) => server.state === "main") ?? null;
    const approved = data.servers.filter((server) => server.state === "approved");
    const waiting = data.servers.filter((server) => server.state === "waiting");

    if (data.servers.length === 0) return <p className={styles.empty}>Diese Person hat RL Nexus auf keinen Server eingeladen, soweit RL Nexus das weiß.</p>;

    return (
        <div>
            <dl className={styles.kpis}>
                <div>
                    <dt>Hauptserver</dt>
                    <dd>{main?.name ?? (data.choice ? "Wahl läuft" : "–")}</dd>
                    <small>{main ? `seit ${day(main.invitedAt)}` : data.choice ? `bis ${day(data.choice.deadline)}` : data.exempt ? "ausgenommen (Team oder Partner)" : ""}</small>
                </div>
                <div>
                    <dt>Freigegeben</dt>
                    <dd>{approved.length}</dd>
                    <small>{approved.map((server) => `✦ ${server.request?.signature ?? ""}`).join(" ") || "keine"}</small>
                </div>
                <div>
                    <dt>Wartet</dt>
                    <dd className={waiting.length ? styles.warn : undefined}>{waiting.length}</dd>
                    <small>{waiting[0]?.request ? `Anfrage ${since(waiting[0].request.createdAt)}` : "nichts offen"}</small>
                </div>
                <div>
                    <dt>Mitglieder gesamt</dt>
                    <dd>{formatNumber(active.reduce((sum, server) => sum + server.members, 0))}</dd>
                    <small>auf {active.length} {active.length === 1 ? "Server" : "Servern"} mit Bot</small>
                </div>
            </dl>

            <div className={styles.servers}>
                {data.servers.map((server, index) => (
                    <ServerCard key={server.id} server={server} userId={userId} others={data.servers.filter((entry) => entry.id !== server.id)} open={index === 0 && server.state !== "left"} onChanged={state.reload} />
                ))}
            </div>

            <p className={styles.note}>
                Woher RL Nexus weiß, wer eingeladen hat: Seit dem Freigabe-Pass aus der Einladung über das Bot-Dashboard, bei älteren Servern aus dem Audit-Log (Eintrag „Bot hinzugefügt“). Steht dort niemand, gilt der Owner. Die Mitglieder kommen live vom Bot und werden nicht gespeichert.
            </p>
        </div>
    );
}

function ServerCard({ server, userId, others, open, onChanged }: { readonly server: IInvitedServer; readonly userId: string; readonly others: readonly IInvitedServer[]; readonly open: boolean; readonly onChanged: () => void }): JSX.Element {
    const act = useAct();
    const [showMembers, setShowMembers] = useState(open);
    const [dialog, setDialog] = useState<"remove" | "switch" | "decline" | "revoke" | null>(null);
    const [target, setTarget] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const request = server.request;
    const botThere = server.state !== "left" && !(server.state === "waiting" && request && !request.botThere);

    const run = async (path: string, done: string, body?: Readonly<Record<string, unknown>>): Promise<void> => {
        setBusy(true);
        await act(path, done, body);
        setBusy(false);
        setDialog(null);
        onChanged();
    };

    const origin = server.source === "dashboard" ? "über das Bot-Dashboard" : server.source === "audit" ? "laut Audit-Log" : "Owner angenommen";
    const owner = server.ownerId === userId ? `${server.ownerName ?? "Owner"} (die Person selbst)` : (server.ownerName ?? server.ownerId);

    return (
        <article className={[styles.server, STATE_CLASS[server.state]].join(" ")} aria-label={server.name}>
            <div className={styles.serverHead}>
                <span className={styles.crest} style={server.icon ? { backgroundImage: `url(https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64)`, color: "transparent" } : undefined}>
                    {initials(server.name)}
                </span>
                <div className={styles.serverName}>
                    <b>{server.name}</b>
                    <span className={styles.sub}>
                        eingeladen {day(server.invitedAt)} · {origin} · Owner: {owner}
                        {server.state === "left" && server.leftAt ? ` · verlassen am ${day(server.leftAt)}${server.leftReason ? ` (${LEFT_TEXT[server.leftReason]})` : ""}` : ""}
                        {server.state === "waiting" ? ` · ${request?.botThere ? "Bot ist noch da" : "Bot ist gegangen"} · Anfrage offen` : ""}
                    </span>
                    {server.facts && (
                        <div className={styles.chips}>
                            <span>{server.facts.modules} Module</span>
                            <span>{server.facts.openTickets} offene Tickets</span>
                            <span>du bist {server.facts.viewerMember ? "" : "nicht "}Mitglied</span>
                        </div>
                    )}
                </div>

                {server.state === "main" && <Badge tone="ok">Hauptserver</Badge>}
                {server.state === "active" && <Badge tone="warn">Wahl läuft</Badge>}
                {server.state === "approved" && request && <Seal request={request} />}
                {server.state === "waiting" && <Badge tone="warn">{request?.kind === "switch" ? "Wechsel angefragt" : "Wartet auf Freigabe"}</Badge>}
                {server.state === "left" && <Badge tone="neutral">Verlassen</Badge>}

                <div className={styles.actions}>
                    {server.state === "main" && others.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setDialog("switch")}>
                            Hauptserver wechseln
                        </Button>
                    )}
                    {server.state === "waiting" && request && (
                        <>
                            <Button size="sm" variant="primary" busy={busy} onClick={() => void run(`/api/servers/requests/${request.id}/approve`, "Freigegeben, die Person bekommt eine DM.")}>
                                Freigeben
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("decline")}>
                                Ablehnen
                            </Button>
                        </>
                    )}
                    {server.state === "approved" && request && (
                        <Button size="sm" variant="outline" busy={busy} onClick={() => setDialog("revoke")}>
                            Freigabe zurücknehmen
                        </Button>
                    )}
                    {botThere && (
                        <Button size="sm" variant="danger" onClick={() => setDialog("remove")}>
                            Bot entfernen
                        </Button>
                    )}
                    {botThere && (
                        <button type="button" className={styles.toggle} aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>
                            {formatNumber(server.members)} MITGLIEDER {showMembers ? "▾" : "▸"}
                        </button>
                    )}
                </div>
            </div>

            {showMembers && botThere && (
                <div className={styles.members}>
                    <ServerMembers guildId={server.id} name={server.name} />
                </div>
            )}

            {request && (
                <ConfirmDialog
                    open={dialog === "decline" || dialog === "revoke"}
                    title={dialog === "revoke" ? `Freigabe ${request.signature ?? ""} zurücknehmen?` : `Anfrage für „${server.name}“ ablehnen?`}
                    confirmLabel={dialog === "revoke" ? "Zurücknehmen" : "Ablehnen"}
                    tone="danger"
                    busy={busy}
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run(`/api/servers/requests/${request.id}/${dialog === "revoke" ? "revoke" : "decline"}`, dialog === "revoke" ? "Freigabe zurückgenommen." : "Abgelehnt, die Person bekommt eine DM.")
                    }
                >
                    <p>{dropText(request)}</p>
                </ConfirmDialog>
            )}

            <ConfirmDialog
                open={dialog === "remove"}
                title={`RL Nexus von „${server.name}“ entfernen?`}
                confirmLabel="Bot entfernen"
                tone="danger"
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => void run(`/api/servers/${server.id}/remove`, `RL Nexus hat „${server.name}“ verlassen.`)}
            >
                <p>Der Bot verlässt den Server sofort und schreibt das in den Log-Kanal des Servers. Es steht im Protokoll.</p>
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog === "switch"}
                title="Hauptserver wechseln"
                confirmLabel="Wechseln"
                confirmDisabled={!target}
                busy={busy}
                onCancel={() => setDialog(null)}
                onConfirm={() => target && void run(`/api/servers/person/${userId}/switch`, "Hauptserver gewechselt, die Person bekommt eine DM.", { guildId: target })}
            >
                <p>Der neue Hauptserver ersetzt {server.name}. Alle Server der Person ohne Freigabe verlässt der Bot, die Person bekommt eine DM.</p>
                <div className={styles.pickList} role="radiogroup" aria-label="Neuer Hauptserver">
                    {others.map((entry) => (
                        <label key={entry.id}>
                            <input type="radio" name={`switch-${server.id}`} checked={target === entry.id} onChange={() => setTarget(entry.id)} />
                            {entry.name}
                            <span className={styles.sub}>{entry.state === "left" ? "Bot muss neu eingeladen werden" : entry.state === "approved" ? "mit Freigabe, die dann wegfällt" : "Bot ist da"}</span>
                        </label>
                    ))}
                </div>
            </ConfirmDialog>
        </article>
    );
}
