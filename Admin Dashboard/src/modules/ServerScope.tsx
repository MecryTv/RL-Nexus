import { useState, type JSX } from "react";
import type { IGuildRow } from "../../shared/api";
import { Icon } from "../components/Icon";
import { formatNumber } from "../format";
import styles from "./botModules.module.scss";

/**
 * W-0133: Bereichsleiste „Alle Server“ / „Ein Server“. Die Suche geht über
 * Name oder ID, zuletzt gewählte Server stehen zuerst (nur in diesem Browser).
 */
const RECENT_KEY = "rlnexus.module-servers";
const SHOWN = 8;

function recent(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;

        return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
        return [];
    }
}

function remember(id: string): void {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter((entry) => entry !== id)].slice(0, 10)));
    } catch {
        // Ohne Speicher gibt es eben keine Reihenfolge.
    }
}

function initials(name: string): string {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join("") || "?"
    );
}

export function GuildIcon({ guild, name }: { readonly guild: IGuildRow | undefined; readonly name: string }): JSX.Element {
    return guild?.icon ? (
        <img className={styles.guildIcon} src={guild.icon} alt="" width={22} height={22} />
    ) : (
        <i className={styles.guildIcon} aria-hidden="true">
            {initials(name)}
        </i>
    );
}

export function ServerScope({
    guilds,
    guildsFailed,
    server,
    serverName,
    own,
    onChange,
}: {
    readonly guilds: readonly IGuildRow[];
    readonly guildsFailed: boolean;
    readonly server: string | null;
    /** Name aus der Antwort der Modul-Liste, falls die Server-Liste fehlt. */
    readonly serverName: string | null;
    /** Eigene Angaben des gewählten Servers über alle Module. */
    readonly own: number;
    readonly onChange: (server: string | null) => void;
}): JSX.Element {
    const [picking, setPicking] = useState(false);
    const [search, setSearch] = useState("");
    const chosen = guilds.find((entry) => entry.id === server);
    const name = chosen?.name ?? serverName ?? server ?? "";
    const order = recent();
    const term = search.trim().toLowerCase();
    const matches = [...guilds]
        .filter((entry) => !term || entry.name.toLowerCase().includes(term) || entry.id.includes(term))
        .sort((a, b) => {
            const ra = order.indexOf(a.id);
            const rb = order.indexOf(b.id);

            if (ra !== rb) return (ra < 0 ? Infinity : ra) - (rb < 0 ? Infinity : rb);

            return b.members - a.members;
        })
        .slice(0, SHOWN);
    const byId = /^\d{17,20}$/.test(search.trim()) && !guilds.some((entry) => entry.id === search.trim()) ? search.trim() : null;
    const open = picking;

    const pick = (id: string): void => {
        remember(id);
        setPicking(false);
        setSearch("");
        onChange(id);
    };

    return (
        <div className={styles.scope}>
            <div className={styles.seg} role="radiogroup" aria-label="Gilt für">
                <button type="button" role="radio" aria-checked={server === null && !picking} onClick={() => {
                        setPicking(false);
                        onChange(null);
                    }}>
                    Alle Server
                </button>
                <button type="button" role="radio" aria-checked={server !== null || picking} onClick={() => setPicking(true)}>
                    Ein Server
                </button>
            </div>

            {server !== null && !open && (
                <>
                    <button type="button" className={styles.serverChip} onClick={() => setPicking(true)} title="Anderen Server wählen">
                        <GuildIcon guild={chosen} name={name} />
                        {name}
                        <small>
                            {chosen ? ` · ${formatNumber(chosen.members)} Mitglieder` : ""} · {own === 1 ? "1 eigener Wert" : `${own} eigene Werte`}
                        </small>
                        <Icon name="chevron-down" size={14} aria-hidden="true" />
                    </button>
                    <span className={styles.scopeHint}>
                        Was du jetzt änderst, gilt <b>nur für {name}</b>.
                    </span>
                </>
            )}

            {server === null && !open && <span className={styles.scopeHint}>Was du jetzt änderst, gilt für alle Server ohne eigenen Wert.</span>}

            {open && (
                <div className={styles.picker}>
                    <label className={styles.search}>
                        <Icon name="search" size={16} aria-hidden="true" />
                        <span className={styles.sr}>Server suchen</span>
                        <input
                            type="search"
                            autoFocus
                            placeholder="Server nach Name oder ID suchen"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setPicking(false);
                                if (event.key === "Enter" && (matches[0] || byId)) pick(matches[0]?.id ?? byId ?? "");
                            }}
                        />
                    </label>
                    <ul className={styles.pickList}>
                        {matches.map((entry) => (
                            <li key={entry.id}>
                                <button type="button" onClick={() => pick(entry.id)}>
                                    <GuildIcon guild={entry} name={entry.name} />
                                    <b>{entry.name}</b>
                                    <small>
                                        {formatNumber(entry.members)} Mitglieder · {entry.id}
                                    </small>
                                </button>
                            </li>
                        ))}
                        {byId && (
                            <li>
                                <button type="button" onClick={() => pick(byId)}>
                                    <Icon name="server" size={16} aria-hidden="true" />
                                    <b>Server {byId}</b>
                                    <small>ID übernehmen, auch wenn der Bot nicht dort ist</small>
                                </button>
                            </li>
                        )}
                        {matches.length === 0 && !byId && (
                            <li className={styles.pickEmpty}>{guildsFailed ? "Die Server-Liste kommt gerade nicht, eine ID geht trotzdem." : "Kein Server passt."}</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
