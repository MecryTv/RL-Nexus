import { type JSX, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { commandDescription, moduleRegistry } from "../services/registry";
import { ModuleStatus } from "../domain/enums/ModuleCategory";
import { COMMAND_ACCESS, COMMAND_DETAILS } from "../data/commands.data";
import { PageHeader } from "../components/layout/PageHeader";
import { Panel } from "../components/ui/Panel";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { SearchBox } from "../components/ui/SearchBox";
import { CommandList } from "../components/ui/CommandList";
import { CallToAction } from "../components/sections/CallToAction";
import styles from "./CommandsPage.module.scss";

/** Die Module mit Commands, nach Rechten sortiert - wer weniger braucht, zuerst. */
const MODULES = moduleRegistry.all
    .filter((module) => module.commands.length > 0)
    .sort((a, b) => (COMMAND_ACCESS[a.id]?.rank ?? 9) - (COMMAND_ACCESS[b.id]?.rank ?? 9));

/**
 * Zwei Abschnitte: was jedes Mitglied tippen kann, und was nur das Team kann.
 *
 * Wer die Seite öffnet, will meistens das Erste wissen. In einer einzigen
 * Liste stünden beide in den zwei Spalten nebeneinander, und die Sortierung
 * nach Rechten wäre nicht mehr zu sehen.
 */
const SECTIONS = [
    { title: "Für alle Mitglieder", everyone: true },
    { title: "Fürs Team", everyone: false },
] as const;

/** Fertige Module, die ganz ohne Command auskommen. */
const WITHOUT_COMMANDS = moduleRegistry.all.filter(
    (module) => module.commands.length === 0 && module.status !== ModuleStatus.Planned
).length;

/** Ob ein Command zu allen Suchwörtern passt: Name, Angaben, Satz oder Modul. */
function matches(command: string, moduleName: string, words: readonly string[]): boolean {
    const detail = COMMAND_DETAILS[command];
    const haystack = `/${command} ${detail?.usage ?? ""} ${commandDescription(command) ?? detail?.description ?? ""} ${moduleName}`.toLowerCase();

    return words.every((word) => haystack.includes(word));
}

/**
 * Alle Slash-Commands auf einer Seite.
 *
 * Nach Modul gebündelt, weil man einen Command meistens über das sucht, was er
 * tut. Die Suche geht über Namen, Angaben und Beschreibung, damit „bann“ auch
 * `/unban` findet.
 */
export function CommandsPage(): JSX.Element {
    usePageMeta(
        "Commands",
        `Alle ${moduleRegistry.commandCount} Slash-Commands von RL Nexus mit Angaben und Rechten, sortiert nach Modul.`
    );

    const [search, setSearch] = useState("");
    const deferred = useDeferredValue(search);

    const groups = useMemo(() => {
        const words = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);

        return MODULES.map((module) => ({
            module,
            commands: module.commands.filter((command) => matches(command, module.name, words)),
        })).filter((group) => group.commands.length > 0);
    }, [deferred]);

    const found = groups.reduce((sum, group) => sum + group.commands.length, 0);

    return (
        <>
            <PageHeader
                eyebrow="Commands"
                title={
                    <>
                        {moduleRegistry.commandCount} Commands. <em>Den Rest</em> macht das Dashboard.
                    </>
                }
                lead={`Alle Slash-Commands von RL Nexus, nach Modul sortiert. Was in eckigen Klammern steht, ist freiwillig. ${WITHOUT_COMMANDS} weitere Module kommen ganz ohne Command aus: Sie werden im Dashboard eingestellt und laufen danach von selbst.`}
            />

            <div className={["u-shell", styles.controls].join(" ")}>
                <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Command oder Modul suchen"
                    label="Commands durchsuchen"
                />
            </div>

            {/* Im Live-Bereich, damit man beim Tippen erfährt, dass sich die
                Liste geändert hat. */}
            <p className={["u-shell", styles.resultLine].join(" ")} aria-live="polite">
                {found === moduleRegistry.commandCount
                    ? `Alle ${found} Commands`
                    : `${found} von ${moduleRegistry.commandCount} Commands`}
            </p>

            <div className="u-shell">
                {groups.length === 0 ? (
                    <div className={styles.empty}>
                        <Icon name="search" size={30} />
                        <p>Kein Command passt zu „{search.trim()}“.</p>
                        <Button variant="outline" onClick={() => setSearch("")} icon="close">
                            Suche leeren
                        </Button>
                    </div>
                ) : (
                    SECTIONS.map((section) => {
                        const shown = groups.filter(
                            ({ module }) => (COMMAND_ACCESS[module.id]?.rank === 0) === section.everyone
                        );

                        if (shown.length === 0) return null;

                        const count = shown.reduce((sum, group) => sum + group.commands.length, 0);

                        return (
                            <section key={section.title} className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    {section.title}
                                    <span className={styles.count}>{count}</span>
                                </h2>
                                <div className={styles.groups}>
                                    {shown.map(({ module, commands }) => {
                                        const access = COMMAND_ACCESS[module.id];

                                        return (
                                            <Panel
                                                key={module.id}
                                                as="article"
                                                className={styles.group}
                                                accent={module.accent}
                                            >
                                                <header className={styles.head}>
                                                    <span className={styles.icon}>
                                                        <Icon name={module.icon} size={21} />
                                                    </span>
                                                    <h3 className={styles.title}>
                                                        <Link to={module.href}>{module.name}</Link>
                                                    </h3>
                                                    {access !== undefined && (
                                                        <>
                                                            <Badge accent={module.accent}>{access.label}</Badge>
                                                            <p className={styles.hint}>{access.hint}</p>
                                                        </>
                                                    )}
                                                </header>
                                                <CommandList commands={commands} />
                                            </Panel>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })
                )}
            </div>

            <CallToAction
                title="Der Rest läuft im Dashboard"
                text="Kanäle, Rollen, Texte und Schalter für jedes Modul stellst du im Browser ein. Dafür brauchst du keinen einzigen Command."
            />
        </>
    );
}
