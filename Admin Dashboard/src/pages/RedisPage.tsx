import { type JSX, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { IRedisArea, IRedisKey, IRedisKeyList, IRedisOverview } from "../../shared/api";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { JsonView } from "../components/JsonView";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { DbTabs, Kpis, SizeBar } from "./dbParts";
import { LIVE_EVERY, duration, useCopy } from "./dbUtil.ts";
import styles from "./DatabasePage.module.scss";

/** Farben der Bereiche im Speicherbalken, der Reihe nach. */
const AREA_COLORS = ["#5aa9d6", "var(--c-mod-engagement)", "var(--c-mod-moderation)", "var(--c-win)"];

const percent = (part: number, whole: number): string => (whole === 0 ? "–" : `${Math.round((part / whole) * 100)} %`);

/** Eine Aktion an den Server, Rückmeldung als Toast. */
function useAction(): (path: string, done: string, body?: Readonly<Record<string, unknown>>) => Promise<boolean> {
    const notify = useToast();

    return async (path, done, body = {}) => {
        try {
            await api(path, { method: "POST", body });
            notify(done);

            return true;
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");

            return false;
        }
    };
}

/**
 * Dev → Datenbank, Reiter Redis (W-0066, Entwurf D-A++): was RL Nexus im Cache
 * hat. Lesen, dazu Wegwerfen und Neuladen; beides ist harmlos, die Daten
 * stehen in der Quelle.
 */
export function RedisPage(): JSX.Element {
    const { area } = useParams();

    return area === undefined ? <Overview /> : <AreaKeys id={area} />;
}

function Overview(): JSX.Element {
    useTitle("Redis");

    const act = useAction();
    const { data, error, reload, updatedAt } = useApi<IRedisOverview>("/api/redis", LIVE_EVERY);
    const [clearing, setClearing] = useState(false);
    const [search, setSearch] = useState("");

    const hits = data?.areas.reduce((sum, area) => sum + area.hits, 0) ?? 0;
    const asked = data?.areas.reduce((sum, area) => sum + area.hits + area.misses, 0) ?? 0;
    const failures = data?.areas.reduce((sum, area) => sum + area.failures, 0) ?? 0;
    const areas = data?.areas.filter((area) => `${area.label} ${area.pattern}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

    return (
        <>
            <PageHeader title="Datenbank" />
            <DbTabs keys={data?.keys} redisOnline={data ? data.ready : undefined} updatedAt={updatedAt} />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Redis wird gefragt" />
            ) : !data.configured ? (
                <p className={styles.empty}>Redis ist nicht eingerichtet: In der .env fehlt REDIS_PASSWORD. Alles läuft direkt aus MariaDB (Anleitung: Discord Bot/docs/Redis.md).</p>
            ) : (
                <>
                    <Kpis
                        items={[
                            { label: "Verbindung", value: data.ready ? `online · ${data.ping ?? "–"} ms` : "nicht verbunden", tone: data.ready ? "ok" : "bad", sub: data.error ?? data.host ?? undefined },
                            { label: "Version", value: data.version ? `Redis ${data.version}` : "–", sub: data.user ? `Nutzer ${data.user}` : undefined },
                            { label: "Schlüssel", value: formatNumber(data.keys), sub: "in den bekannten Bereichen" },
                            { label: "Belegt", value: formatBytes(data.bytes), sub: `von höchstens ${formatBytes(data.maxBytes)}` },
                            { label: "Treffer", value: percent(hits, asked), sub: `${formatNumber(hits)} von ${formatNumber(asked)} seit Start` },
                            { label: "Ausfälle", value: formatNumber(failures), tone: failures > 0 ? "warn" : undefined, sub: "zu langsam oder Fehler, seit Start" },
                        ]}
                    />

                    <div className={styles.memory}>
                        <div className={styles.track} role="img" aria-label={`Belegt ${formatBytes(data.bytes)} von ${formatBytes(data.maxBytes)}`}>
                            {data.areas.map((area, index) => (
                                <b key={area.id} style={{ width: `${(area.bytes / data.maxBytes) * 100}%`, background: AREA_COLORS[index % AREA_COLORS.length] }} />
                            ))}
                        </div>
                        <p className={styles.legend}>
                            {data.areas.map((area, index) => (
                                <span key={area.id}>
                                    <i style={{ background: AREA_COLORS[index % AREA_COLORS.length] }} />
                                    {area.label} {formatBytes(area.bytes)}
                                </span>
                            ))}
                            <span>frei {formatBytes(Math.max(0, data.maxBytes - data.bytes))}</span>
                            <span className={styles.faintText}>Ist er voll, fliegt das am längsten Ungenutzte raus.</span>
                        </p>
                    </div>

                    <div className={styles.toolbar}>
                        <Field id="redis-bereiche" label="Bereich suchen">
                            <input id="redis-bereiche" type="search" value={search} placeholder="Name oder Muster" onChange={(event) => setSearch(event.target.value)} />
                        </Field>
                        <Button size="sm" variant="danger" icon="trash" disabled={!data.ready || data.keys === 0} onClick={() => setClearing(true)}>
                            Cache leeren
                        </Button>
                    </div>

                    <div className={styles.frame}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Bereich</th>
                                    <th scope="col">Muster</th>
                                    <th scope="col" className={styles.right}>
                                        Schlüssel
                                    </th>
                                    <th scope="col" className={styles.right}>
                                        Größe
                                    </th>
                                    <th scope="col" className={styles.right}>
                                        Ablauf
                                    </th>
                                    <th scope="col" className={styles.right}>
                                        Treffer · verfehlt
                                    </th>
                                    <th scope="col">Wird geleert</th>
                                    <th scope="col" aria-label="Aktionen" />
                                </tr>
                            </thead>
                            <tbody>
                                {areas.map((area) => (
                                    <tr key={area.id}>
                                        <td>
                                            <Link className={styles.link} to={`/dev/redis/${area.id}`}>
                                                {area.label}
                                            </Link>
                                        </td>
                                        <td>
                                            <code>{area.pattern}</code>
                                        </td>
                                        <td className={styles.right}>{formatNumber(area.keys)}</td>
                                        <td className={styles.right}>
                                            <span className={styles.sizeCell}>
                                                {formatBytes(area.bytes)}
                                                <SizeBar share={data.bytes === 0 ? 0 : area.bytes / data.bytes} />
                                            </span>
                                        </td>
                                        <td className={styles.right}>{duration(area.ttl)}</td>
                                        <td className={styles.right}>
                                            {percent(area.hits, area.hits + area.misses)} · {formatNumber(area.misses)}
                                        </td>
                                        <td className={styles.comment}>{area.cleared}</td>
                                        <td className={styles.right}>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                icon="refresh"
                                                disabled={!data.ready || area.keys === 0}
                                                onClick={() => void act(`/api/redis/areas/${area.id}/clear`, `${area.label}: geleert, kommt beim nächsten Lesen frisch aus der Quelle.`).then(reload)}
                                            >
                                                Neu laden
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <ConfirmDialog
                open={clearing}
                title="Ganzen Cache leeren?"
                confirmLabel="Cache leeren"
                tone="danger"
                onCancel={() => setClearing(false)}
                onConfirm={() => {
                    setClearing(false);
                    void act("/api/redis/clear", "Cache geleert. Alles kommt beim nächsten Lesen frisch aus der Quelle.").then(reload);
                }}
            >
                <p>Alle Schlüssel mit rln: fliegen raus. Verloren geht nichts, die Daten stehen in MariaDB und bei Discord. Die nächsten Seiten laden einmal etwas langsamer.</p>
            </ConfirmDialog>
        </>
    );
}

function KeyPanel({ keyName, area, onGone }: { readonly keyName: string; readonly area: IRedisArea; readonly onGone: () => void }): JSX.Element {
    const act = useAction();
    const copy = useCopy();
    const { data, error, reload } = useApi<IRedisKey>(`/api/redis/key?${new URLSearchParams({ key: keyName })}`);
    const personId = area.id === "discord-namen" ? keyName.split(":").at(-1) : null;

    return (
        <div className={styles.panel}>
            <div className={styles.panelHead}>
                <h2>
                    <code>rln:{keyName}</code>
                </h2>
                <span className={styles.actions}>
                    <Button size="sm" variant="ghost" icon="copy" disabled={!data} onClick={() => data && copy(JSON.stringify(data.value, null, 2), "Wert als JSON kopiert.")}>
                        Kopieren
                    </Button>
                    <Button size="sm" variant="ghost" icon="refresh" onClick={() => void act("/api/redis/key/reload", "Aus der Quelle neu geladen.", { key: keyName }).then(reload)}>
                        Aus der Quelle neu laden
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => void act("/api/redis/key/forget", "Schlüssel entfernt.", { key: keyName }).then((ok) => ok && onGone())}>
                        Entfernen
                    </Button>
                </span>
            </div>

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Schlüssel wird gelesen" />
            ) : (
                <>
                    <dl className={styles.meta}>
                        <div>
                            <dt>Typ</dt>
                            <dd>
                                {data.type}
                                {data.encoding ? ` · ${data.encoding}` : ""}
                            </dd>
                        </div>
                        <div>
                            <dt>Größe</dt>
                            <dd>{data.bytes === null ? "–" : formatBytes(data.bytes)}</dd>
                        </div>
                        <div>
                            <dt>Läuft ab in</dt>
                            <dd>{data.ttl < 0 ? "nie" : `${duration(data.ttl)} (von ${duration(area.ttl)})`}</dd>
                        </div>
                        <div>
                            <dt>Gesetzt vor</dt>
                            <dd>{data.age === null ? "–" : duration(data.age)}</dd>
                        </div>
                        <div>
                            <dt>Quelle</dt>
                            <dd>{area.source}</dd>
                        </div>
                        <div>
                            <dt>Person</dt>
                            <dd>{personId ? <Link to={`/datenschutz/${personId}`}>Nutzerdaten öffnen</Link> : "–"}</dd>
                        </div>
                    </dl>
                    <JsonView value={data.value} />
                </>
            )}
        </div>
    );
}

function AreaKeys({ id }: { readonly id: string }): JSX.Element {
    const [search, setSearch] = useState("");
    const [wanted, setWanted] = useState("");
    const [page, setPage] = useState(1);
    const [picked, setPicked] = useState<string | null>(null);
    const copy = useCopy();
    const { data, error, reload, updatedAt } = useApi<IRedisKeyList>(`/api/redis/areas/${encodeURIComponent(id)}?${new URLSearchParams({ seite: String(page), ...(wanted ? { q: wanted } : {}) })}`, LIVE_EVERY);

    useTitle(data ? `Redis · ${data.area.label}` : "Redis");

    // Erst wenn das Tippen kurz ruht.
    useEffect(() => {
        const timer = setTimeout(() => {
            setWanted(search.trim());
            setPage(1);
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    return (
        <>
            <Link className={styles.back} to="/dev/redis">
                <Icon name="arrow-left" size={15} />
                Alle Bereiche
            </Link>
            <PageHeader title={data?.area.label ?? "Redis"} meta="Schlüssel eines Bereichs. Ein Klick zeigt Metadaten und den Wert." />
            <DbTabs updatedAt={updatedAt} />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Schlüssel werden gelesen" />
            ) : (
                <>
                    <ul className={styles.chips} aria-label="Über den Bereich">
                        <li>
                            <code>{data.area.pattern}</code>
                        </li>
                        <li>{formatNumber(data.area.keys)} Schlüssel</li>
                        <li>{formatBytes(data.area.bytes)}</li>
                        <li>Ablauf {duration(data.area.ttl)}</li>
                        <li>Quelle: {data.area.source}</li>
                    </ul>

                    <div className={styles.toolbar}>
                        <Field id="redis-suche" label="Schlüssel suchen">
                            <input id="redis-suche" type="search" value={search} placeholder={data.area.id === "discord-namen" ? "Discord-ID" : "Teil des Schlüssels"} onChange={(event) => setSearch(event.target.value)} />
                        </Field>
                        <Button size="sm" variant="outline" icon="copy" disabled={data.keys.length === 0} onClick={() => copy(JSON.stringify(data.keys, null, 2), "Seite als JSON kopiert.")}>
                            Seite als JSON
                        </Button>
                    </div>

                    {data.keys.length === 0 ? (
                        <p className={styles.empty}>{wanted ? `Kein Schlüssel enthält „${wanted}“.` : "Gerade liegt hier nichts im Cache."}</p>
                    ) : (
                        <div className={picked ? styles.split : undefined}>
                            <div className={styles.frame}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th scope="col">Schlüssel</th>
                                            <th scope="col" className={styles.right}>
                                                Größe
                                            </th>
                                            <th scope="col" className={styles.right}>
                                                Läuft ab in
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.keys.map((row) => {
                                            // Den langen Anfang kürzen, „…:v1:884213…“ wie im Entwurf.
                                            const prefix = data.area.pattern.replace(/^rln:/, "").replace(/\*$/, "");
                                            const label = row.key !== prefix && row.key.startsWith(prefix) ? `…${row.key.slice(Math.max(0, prefix.length - 4))}` : row.key;

                                            return (
                                            <tr key={row.key} className={picked === row.key ? styles.picked : undefined}>
                                                <td>
                                                    <button type="button" className={styles.keyButton} aria-pressed={picked === row.key} onClick={() => setPicked(picked === row.key ? null : row.key)}>
                                                        <code>{label}</code>
                                                    </button>
                                                </td>
                                                <td className={styles.right}>{row.bytes === null ? "–" : formatBytes(row.bytes)}</td>
                                                <td className={styles.right}>{row.ttl < 0 ? "nie" : duration(row.ttl)}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {picked && (
                                <KeyPanel
                                    key={picked}
                                    keyName={picked}
                                    area={data.area}
                                    onGone={() => {
                                        setPicked(null);
                                        reload();
                                    }}
                                />
                            )}
                        </div>
                    )}

                    <Pager page={data.page} pages={data.pages} onPage={setPage} />
                </>
            )}
        </>
    );
}
