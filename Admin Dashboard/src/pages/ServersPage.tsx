import { useMemo, useState, type JSX } from "react";
import type { IGuildList, IGuildRow } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Field } from "../components/Field";
import { GuildTable } from "../components/GuildTable";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useTitle } from "../useTitle";
import styles from "./ServersPage.module.scss";

type SortKey = "members" | "name" | "joined";

const SORTERS: Readonly<Record<SortKey, (a: IGuildRow, b: IGuildRow) => number>> = {
    members: (a, b) => b.members - a.members,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
    // Neueste zuerst, ohne Beitrittsdatum ans Ende.
    joined: (a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""),
};

function isSortKey(value: string): value is SortKey {
    return Object.hasOwn(SORTERS, value);
}

export function ServersPage(): JSX.Element {
    useTitle("Server");

    const { data, error, reload } = useApi<IGuildList>("/api/guilds");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("members");

    const guilds = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("de");
        const found = (data?.guilds ?? []).filter(
            (guild) => needle === "" || guild.name.toLocaleLowerCase("de").includes(needle) || guild.id.includes(needle)
        );

        return [...found].sort(SORTERS[sort]);
    }, [data, query, sort]);

    const total = data?.guilds.length ?? 0;

    return (
        <>
            <PageHeader title="Server" meta={data ? `Der Bot ist auf ${formatNumber(total)} ${total === 1 ? "Server" : "Servern"}` : undefined} />

            <div className={styles.toolbar} role="search">
                <Field id="server-suche" label="Suchen">
                    <input
                        id="server-suche"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Name oder Server-ID"
                        autoComplete="off"
                    />
                </Field>
                <Field id="server-sortierung" label="Sortieren nach">
                    <select
                        id="server-sortierung"
                        value={sort}
                        onChange={(event) => {
                            if (isSortKey(event.target.value)) setSort(event.target.value);
                        }}
                    >
                        <option value="members">Mitglieder</option>
                        <option value="name">Name</option>
                        <option value="joined">Dabei seit</option>
                    </select>
                </Field>
            </div>

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Server werden geladen" />
            ) : (
                <>
                    <p className={styles.count} aria-live="polite">
                        {guilds.length === total ? `${formatNumber(total)} Server` : `${formatNumber(guilds.length)} von ${formatNumber(total)} Servern`}
                    </p>
                    <GuildTable guilds={guilds} expandable empty={query ? "Kein Server passt zu deiner Suche." : "Der Bot ist noch auf keinem Server."} />
                </>
            )}
        </>
    );
}
