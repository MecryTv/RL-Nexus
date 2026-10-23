import { type JSX, type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { PageHeader } from "../components/layout/PageHeader";
import styles from "./LegalPage.module.scss";

export interface ILegalPageProps {
    readonly kind: "impressum" | "datenschutz";
}

/** Ein Abschnitt. Aus derselben Liste entstehen Text und Inhaltsverzeichnis. */
interface ILegalSection {
    readonly id: string;
    readonly title: string;
    readonly body: ReactNode;
}

/** Eine Zeile in einer Übersicht: ein Cookie, ein Speichereintrag, eine Berechtigung. */
interface IFact {
    readonly name: string;
    readonly text: string;
    readonly keep?: string;
}

/** Stand der Datenschutzerklärung. Bei jeder inhaltlichen Änderung nachziehen. */
const UPDATED = "17. Oktober 2026";

/**
 * Impressum und Datenschutzerklärung.
 *
 * Beide Seiten aus einer Komponente: sie unterscheiden sich im Text, nicht im
 * Aufbau. Die Datenschutzerklärung ist lang genug für ein Inhaltsverzeichnis,
 * das Impressum nicht.
 *
 * Was hier über den Bot steht, ist aus seinen Migrationen und seiner eigenen
 * Datenschutzseite abgeschrieben (RL Nexus Bot, `src/database/migrations` und
 * `src/dashboard/public/privacy.html`). Speichert ein Modul etwas Neues, muss
 * es hier nachgetragen werden, sonst stimmt der Text nicht mehr.
 *
 * Das ist kein Rechtsrat. Geprüft hat den Text niemand, der das darf.
 */
export function LegalPage({ kind }: ILegalPageProps): JSX.Element {
    const isImprint = kind === "impressum";
    const title = isImprint ? "Impressum" : "Datenschutzerklärung";
    const lead = isImprint
        ? "Angaben gemäß § 5 DDG und § 18 Abs. 2 MStV."
        : "Was RL Nexus speichert, warum, wie lange, und wie du es wieder loswirst.";
    const sections = isImprint ? IMPRINT : PRIVACY;

    usePageMeta(title, lead);

    // Ein Link von außen auf einen Abschnitt (/datenschutz#rechte): Beim Laden
    // gibt es den Abschnitt noch nicht, die Seite wird erst nachgeladen. Bis
    // dahin hat der Browser den Sprung aufgegeben, also holt die Seite ihn nach.
    // Sofort statt weich, sonst gleitet sie beim Öffnen durch den halben Text.
    // Klicks im Inhaltsverzeichnis erledigt der Browser selbst.
    useEffect(() => {
        const id = window.location.hash.slice(1);

        if (id !== "") document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    }, []);

    return (
        <>
            {/* Das weiche Trennzeichen: auf schmalen Handys passt das Wort
                nicht in eine Zeile und würde sonst abgeschnitten. */}
            <PageHeader
                eyebrow="Rechtliches"
                title={isImprint ? title : "Datenschutz­erklärung"}
                lead={lead}
            />

            <div className={["u-shell", styles.page, isImprint ? "" : styles.withToc].join(" ")}>
                {!isImprint && <Contents sections={sections} />}

                <article className={styles.prose}>
                    {sections.map((section, index) => (
                        <section key={section.id} id={section.id}>
                            <h2>
                                {!isImprint && (
                                    <span className={styles.number} aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                )}
                                {section.title}
                            </h2>
                            {section.body}
                        </section>
                    ))}

                    {!isImprint && <p className={styles.updated}>Stand: {UPDATED}</p>}
                </article>
            </div>
        </>
    );
}

/** Das Inhaltsverzeichnis. Auf breiten Bildschirmen bleibt es beim Lesen neben dem Text stehen. */
function Contents({ sections }: { readonly sections: readonly ILegalSection[] }): JSX.Element {
    return (
        <nav className={styles.toc} aria-labelledby="legal-toc">
            <p className={styles.tocTitle} id="legal-toc">
                Inhalt
            </p>
            <ol className={styles.tocList}>
                {sections.map((section, index) => (
                    <li key={section.id}>
                        <a href={`#${section.id}`}>
                            <span className={styles.number} aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            {section.title}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/** Cookies, Speichereinträge und Berechtigungen: Name, wofür, wie lange. */
function Facts({ entries }: { readonly entries: readonly IFact[] }): JSX.Element {
    return (
        <dl className={styles.facts}>
            {entries.map((entry) => (
                <div key={entry.name}>
                    <dt>
                        <code>{entry.name}</code>
                    </dt>
                    <dd>
                        {entry.text}
                        {entry.keep !== undefined && <span className={styles.keep}>{entry.keep}</span>}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function External({ href, children }: { readonly href: string; readonly children: ReactNode }): JSX.Element {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    );
}

const MAIL = <a href={`mailto:${siteConfig.contactMail}`}>{siteConfig.contactMail}</a>;

const SUPPORT = <External href={siteConfig.supportURL}>Support-Server</External>;

/** Die Anschrift steht in beiden Texten. Einmal hier, damit sie nicht auseinanderläuft. */
const ADDRESS = (
    <address>
        Connor Olischer
        <br />
        Königsberger Straße 8
        <br />
        25335 Elmshorn
        <br />
        Deutschland
    </address>
);

/* --- Impressum ----------------------------------------------------------- */

const IMPRINT: readonly ILegalSection[] = [
    {
        id: "anbieter",
        title: "Anbieter",
        body: ADDRESS,
    },
    {
        id: "kontakt",
        title: "Kontakt",
        body: (
            <p>
                E-Mail: {MAIL}
                <br />
                Discord: {SUPPORT}
            </p>
        ),
    },
    {
        id: "mstv",
        title: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
        body: <p>Connor Olischer, Königsberger Straße 8, 25335 Elmshorn</p>,
    },
    {
        id: "projekt",
        title: "Projekt",
        body: (
            <p>
                RL Nexus ist ein Discord-Bot für Rocket-League-Organisationen, mit Dashboard und dieser Website. Den
                Zugang zum Dashboard gibt es auf der <Link to="/preise">Preisseite</Link>, die Bedingungen stehen in
                den <Link to="/agb">AGB</Link>.
            </p>
        ),
    },
    {
        id: "haftung-inhalte",
        title: "Haftung für Inhalte",
        body: (
            <>
                <p>
                    Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
                    Vollständigkeit und Aktualität der bereitgestellten Inhalte wird jedoch keine Gewähr übernommen.
                </p>
                <p>
                    Als Diensteanbieter sind wir gemäß den gesetzlichen Vorschriften für eigene Inhalte auf diesen
                    Seiten verantwortlich. Eine Verpflichtung zur Überwachung übermittelter oder gespeicherter fremder
                    Informationen besteht jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung.
                    Bei Bekanntwerden entsprechender Rechtsverletzungen werden diese Inhalte unverzüglich entfernt.
                </p>
            </>
        ),
    },
    {
        id: "haftung-links",
        title: "Haftung für Links",
        body: (
            <>
                <p>
                    Diese Website kann Links zu externen Webseiten Dritter enthalten, auf deren Inhalte kein Einfluss
                    besteht. Für die Inhalte der verlinkten Seiten sind ausschließlich deren jeweilige Betreiber
                    verantwortlich.
                </p>
                <p>
                    Zum Zeitpunkt der Verlinkung wurden die verlinkten Seiten auf mögliche Rechtsverstöße überprüft.
                    Eine dauerhafte inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer
                    Rechtsverletzung nicht zumutbar. Sollten Rechtsverletzungen bekannt werden, werden entsprechende
                    Links umgehend entfernt.
                </p>
            </>
        ),
    },
    {
        id: "urheberrecht",
        title: "Urheberrecht",
        body: (
            <>
                <p>
                    Die auf dieser Website veröffentlichten Inhalte, Grafiken, Logos, Texte und sonstigen Werke
                    unterliegen dem deutschen Urheberrecht, sofern nicht anders gekennzeichnet.
                </p>
                <p>
                    Eine Vervielfältigung, Bearbeitung, Verbreitung oder sonstige Nutzung außerhalb der Grenzen des
                    Urheberrechts bedarf der vorherigen schriftlichen Zustimmung des jeweiligen Rechteinhabers.
                </p>
                <p>
                    Downloads und Kopien dieser Website sind ausschließlich für den privaten, nicht kommerziellen
                    Gebrauch gestattet, sofern nicht ausdrücklich etwas anderes angegeben ist.
                </p>
            </>
        ),
    },
    {
        id: "marken",
        title: "Marken- und Rechtehinweise",
        body: (
            <>
                <p>
                    „RL Nexus“ sowie die zugehörigen Logos, Designs und sonstigen Kennzeichen dürfen ohne vorherige
                    schriftliche Genehmigung nicht verwendet werden.
                </p>
                <p>
                    Rocket League ist eine Marke der Psyonix LLC bzw. Epic Games, Inc. Discord ist eine Marke der
                    Discord Inc. RL Nexus steht in keiner offiziellen Verbindung zu Psyonix LLC, Epic Games, Inc. oder
                    Discord Inc. und wird weder von diesen unterstützt noch gesponsert.
                </p>
                <p>Spielernamen, Ränge und Kader, die auf dieser Website als Beispiel gezeigt werden, sind erfunden.</p>
            </>
        ),
    },
    {
        id: "umsatzsteuer",
        title: "Umsatzsteuer",
        body: (
            <p>
                Kleinunternehmer nach § 19 UStG. Deshalb wird keine Umsatzsteuer berechnet und ausgewiesen, und es gibt
                keine Umsatzsteuer-Identifikationsnummer.
            </p>
        ),
    },
    {
        id: "streitbeilegung",
        title: "Streitbeilegung",
        body: (
            <p>
                Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
            </p>
        ),
    },
];

/* --- Datenschutzerklärung ------------------------------------------------ */

const PRIVACY: readonly ILegalSection[] = [
    {
        id: "verantwortlicher",
        title: "Verantwortlicher",
        body: (
            <>
                <p>Verantwortlich für diese Website, die Statusseite, das Dashboard und den Discord-Bot RL Nexus ist:</p>
                {ADDRESS}
                <p>E-Mail: {MAIL}</p>
            </>
        ),
    },
    {
        id: "kurz-gesagt",
        title: "Kurz gesagt",
        body: (
            <>
                <ul>
                    <li>
                        Die Website setzt keine Cookies, außer du meldest dich im Shop mit Discord an. Das Dashboard
                        setzt nur die für die Anmeldung. Keine der Seiten
                        misst Besuche. Schriften und Bilder liefern sie selbst aus, nur Profilbilder, Server-Icons und
                        Emojis im Dashboard kommen direkt von Discord.
                    </li>
                    <li>
                        Der Bot speichert nur, was die Module brauchen, die das Team eines Servers eingeschaltet hat.
                    </li>
                    <li>Wir verkaufen keine Daten und geben sie nicht für Werbung weiter.</li>
                    <li>
                        Website, Dashboard und Bot laufen auf einem gemieteten Server in einem Rechenzentrum in der EU.
                    </li>
                </ul>
                <p>
                    Du musst uns keine Daten geben. Ohne Discord-Konto lassen sich Bot und Dashboard aber nicht nutzen.
                </p>
            </>
        ),
    },
    {
        id: "hosting",
        title: "Hosting",
        body: (
            <>
                <p>
                    Website, Dashboard, Bot, Datenbank und Mailserver laufen auf einem virtuellen Server der Contabo
                    GmbH, Aschauer Straße 32a, 81549 München, in einem Rechenzentrum in der EU. Was wir speichern,
                    liegt dort.
                </p>
                <p>
                    Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse ist, Website,
                    Dashboard und Bot zuverlässig zu betreiben.
                </p>
            </>
        ),
    },
    {
        id: "logs",
        title: "Server-Logs",
        body: (
            <>
                <p>
                    Vor Website, Dashboard und Statusseite läuft der Webserver nginx. Bei jedem Aufruf schreibt er einen
                    Eintrag in sein Protokoll: die gekürzte IP-Adresse (bei IPv4 ohne den letzten Block, bei IPv6 nur die
                    ersten drei Blöcke), Datum und Uhrzeit, die aufgerufene Adresse, den Statuscode, die übertragene
                    Datenmenge, die Seite, von der du kamst, und die Kennung deines Browsers. Cookies und Anmeldedaten
                    stehen nicht darin.
                </p>
                <p>
                    Kann der Server eine Anfrage nicht bearbeiten, schreibt nginx das mit der vollständigen IP-Adresse in
                    sein Fehlerprotokoll. Damit finden wir Fehler und erkennen Angriffe. Beide Protokolle bleiben auf
                    unserem Server und werden nach 14 Tagen automatisch gelöscht.
                </p>
                <p>
                    Der Bot führt ein eigenes Betriebsprotokoll mit Fehlern und Ereignissen, zum Beispiel wann jemand
                    ein Spielerkonto verknüpft oder getrennt hat. Darin können Discord-IDs, Server-IDs und Namen stehen.
                    Jede Protokolldatei wird 30 Tage nach ihrem letzten Eintrag gelöscht.
                </p>
                <p>
                    Rechtsgrundlage ist in beiden Fällen Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse ist
                    ein sicherer Betrieb ohne Fehler.
                </p>
            </>
        ),
    },
    {
        id: "cookies",
        title: "Cookies und Speicher im Browser",
        body: (
            <>
                <h3>Auf dieser Website</h3>
                <p>
                    Die Website selbst setzt keine Cookies. Im Speicher deines Browsers legt sie höchstens zwei Einträge
                    ab. Beide bleiben in deinem Browser, wir bekommen sie nie zu sehen:
                </p>
                <Facts
                    entries={[
                        {
                            name: "rlnexus.intro",
                            text: "Das Datum, an dem die Startanimation zuletzt lief. Damit läuft sie nur beim ersten Besuch am Tag. Liegt im localStorage.",
                            keep: "Bis du ihn löschst",
                        },
                        {
                            name: "rlnexus.banner",
                            text: "Nur wenn du den Hinweis oben auf der Seite wegklickst: welchen Stand des Hinweises du weggeklickt hast. Damit bleibt er weg, bis sich sein Text ändert. Liegt im sessionStorage dieses Tabs.",
                            keep: "Bis du den Tab schließt",
                        },
                    ]}
                />
                <p>
                    Meldest du dich im Shop (Preisseite, Mein Zugang, Kündigen) mit Discord an, setzt er zwei Cookies. Sie gelten nur für{" "}
                    <code>/api/shop</code>, Skripte können sie nicht auslesen:
                </p>
                <Facts
                    entries={[
                        {
                            name: "rlnexus_shop",
                            text: "Hält dich im Shop angemeldet. Enthält ein signiertes Token mit deiner Discord-ID, deinem Namen und Profilbild.",
                            keep: "7 Tage",
                        },
                        {
                            name: "rlnexus_shop_state",
                            text: "Schützt die Anmeldung mit Discord gegen untergeschobene Anfragen und merkt sich, wohin es danach geht.",
                            keep: "10 Minuten",
                        },
                    ]}
                />

                <h3>Im Dashboard</h3>
                <p>
                    Das Dashboard setzt nur Cookies, ohne die die Anmeldung nicht funktioniert. Skripte können sie
                    nicht auslesen, und sie gehen nur verschlüsselt über HTTPS.
                </p>
                <Facts
                    entries={[
                        {
                            name: "rlnexus_session",
                            text: "Hält dich angemeldet. Enthält ein signiertes Token mit deiner Discord-ID.",
                            keep: "7 Tage",
                        },
                        {
                            name: "rlnexus_oauth_state",
                            text: "Schützt die Anmeldung mit Discord gegen untergeschobene Anfragen.",
                            keep: "10 Minuten",
                        },
                    ]}
                />
                <p>Dazu kommen ein paar Einträge im localStorage. Sie verlassen deinen Rechner nicht:</p>
                <Facts
                    entries={[
                        {
                            name: "rlnexus.prefs",
                            text: "Deine Einstellungen für Töne, Lautstärke, reduzierte Bewegung und Hinweise.",
                            keep: "Bis du sie löschst",
                        },
                        {
                            name: "rlnexus.cookies",
                            text: "Merkt sich, dass du den Hinweis auf die Cookies gesehen hast.",
                            keep: "Bis du ihn löschst",
                        },
                        {
                            name: "rlnexus.nav.folded",
                            text: "Welche Gruppen der Seitenleiste du auf einer Serverseite zugeklappt hast.",
                            keep: "Bis du ihn löschst",
                        },
                        {
                            name: "rlnexus.live.sound",
                            text: "Ob Live Tickets bei einer neuen Nachricht einen Ton spielen.",
                            keep: "Bis du ihn löschst",
                        },
                    ]}
                />
                <p>
                    Rechtsgrundlage für das Speichern auf deinem Gerät ist § 25 Abs. 2 Nr. 2 TDDDG, für die Anmeldung
                    selbst Art. 6 Abs. 1 lit. b DSGVO. Tracking, Werbung und Reichweitenmessung gibt es weder hier noch
                    im Dashboard. Deshalb fragt dich auch kein Banner nach einer Einwilligung. Einträge im localStorage
                    löschst du in den Einstellungen deines Browsers bei den gespeicherten Website-Daten.
                </p>
            </>
        ),
    },
    {
        id: "kontakt",
        title: "Kontakt und Fehlermeldungen",
        body: (
            <>
                <p>
                    Schreibst du an {MAIL}, speichern wir deine Adresse und deine Nachricht, um dir antworten zu
                    können. Die E-Mails liegen auf unserem eigenen Mailserver, der auf demselben Server läuft wie
                    Website und Bot. Wir löschen sie, sobald deine Anfrage erledigt ist.
                </p>
                <p>
                    Meldest du einen Fehler über das Pop-up im Dashboard oder mit <code>/fehler</code> in Discord,
                    schickt der Bot deine Meldung als E-Mail an dieselbe Adresse. Darin stehen dein Text, die
                    Kontaktangabe, die du einträgst, und, falls du angemeldet bist oder den Befehl benutzt, deine
                    Discord-ID, dein Name, der Server und die Seite, auf der du warst. Für diese Meldungen gilt
                    dieselbe Frist.
                </p>
                <p>
                    Schickst du das Formular auf der <Link to="/kontakt">Kontaktseite</Link> ab, geht es als E-Mail an
                    {" "}{MAIL} auf unserem eigenen Mailserver: Thema, Name, E-Mail-Adresse oder Discord-Name, Betreff,
                    Nachricht und, falls ausgefüllt, die Angaben zur Lage. Damit wir es schnell sehen, geht derselbe
                    Inhalt zusätzlich als Hinweis in einen internen Discord-Kanal unseres Teams (siehe{" "}
                    <a href="#empfaenger">Wohin Daten gehen</a>). In unserer Datenbank landet das Formular nicht.
                    E-Mail und Hinweis löschen wir, sobald deine Anfrage erledigt ist. Nachrichten aus der Zeit, als
                    das Formular sie noch in unserer Datenbank ablegte, löschen wir spätestens 90 Tage nach dem
                    Eingang.
                </p>
                <p>
                    Deine IP-Adresse speichern wir dabei nicht. Damit niemand das Formular mit Nachrichten flutet,
                    zählt der Server im Arbeitsspeicher mit, wie viele Nachrichten von deiner Adresse kommen, und
                    vergisst das nach spätestens zehn Minuten.
                </p>
                <p>
                    Meldest du dich im {SUPPORT} auf Discord, verarbeitet Discord deine Nachrichten nach seinen eigenen
                    Regeln (siehe <a href="#empfaenger">Wohin Daten gehen</a>).
                </p>
                <p>
                    Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: Wir haben ein berechtigtes Interesse daran, deine
                    Anfrage zu beantworten. Geht es um die Nutzung von Bot oder Dashboard, gilt Art. 6 Abs. 1 lit. b
                    DSGVO.
                </p>
            </>
        ),
    },
    {
        id: "bot",
        title: "Der Discord-Bot",
        body: (
            <>
                <p>
                    Den Bot lädt das Team eines Discord-Servers ein. Welche Module dort laufen und wie sie eingestellt
                    sind, entscheidet dieses Team im Dashboard. Ein abgeschaltetes Modul verarbeitet nichts.
                </p>
                <p>
                    Auf einem Server sieht der Bot, was Discord jedem Bot dort zeigt: IDs, Namen, Profilbilder und
                    Rollen der Mitglieder und die Nachrichten in den Kanälen, die er lesen darf. Gespeichert wird davon
                    nur, was hier steht:
                </p>
                <ul>
                    <li>
                        <strong>Auf jedem Server:</strong> die Server-ID, die IDs der eingestellten Kanäle und Rollen
                        und die Einstellungen der Module, solange der Bot auf dem Server ist. Dazu Zahlen zur
                        Aktivität: je Server und Kanal Nachrichten, Minuten im Sprachkanal, Beitritte und Abgänge ohne
                        Discord-IDs, gelöscht nach 90 Tagen. Je Mitglied und Tag die Zahl der Nachrichten und Minuten
                        im Sprachkanal für die Liste der aktivsten Mitglieder, gelöscht nach 14 Tagen. Was in einer
                        Nachricht stand, wird dafür nicht gespeichert.
                    </li>
                    <li>
                        <strong>
                            <code>/rank</code> und Rank Roles:
                        </strong>{" "}
                        nur wenn du dein Epic-Konto selbst mit <code>/rank link</code> und deinem Epic-Namen verknüpfst.
                        Dann speichern wir Konto-ID, Anzeigenamen und Zeitpunkt der Verknüpfung, dazu
                        Ränge, MMR, Spiele, Karriere-Werte, die Season-Reward-Stufe und deinen Ingame-Club. Diese Werte
                        sind in Rocket League öffentlich. Der Bot holt sie höchstens alle zehn Minuten neu und
                        überschreibt die alten. Die Verknüpfung trennst du mit <code>/rank unlink</code>, sobald die
                        Sperre nach dem letzten Wechsel abgelaufen ist. Die gespeicherten Werte löschen wir auf Anfrage.
                    </li>
                    <li>
                        <strong>RL Team-Übersicht, Matchups und 2, 4 &amp; 6 Mans:</strong> Kader mit Discord-ID, Name,
                        Epic-Name, Rolle und dem zuletzt geholten Rang. Partien mit Gegner, Liga, Termin und Ergebnis.
                        Bei den Mans die Wertung je Spieler und Server und jede Runde mit Teilnehmern, Lobbyname und
                        Passwort.
                    </li>
                    <li>
                        <strong>Clips der Woche:</strong> jeder hochgeladene Clip als Kopie im Ordner des Bots, je
                        Runde mit einer Liste: wer welchen Clip eingereicht hat (Discord-ID und Anzeigename), wie viele
                        Stimmen er bekam und welchen Platz. Abgestimmt wird per Reaktion; der Bot merkt sich je Person,
                        unter welchem Clip sie zuletzt reagiert hat. Gesperrte Mitglieder stehen mit Grund in einer
                        Liste. Ob jemand nach Strafen ausgeschlossen ist, rechnet der Bot aus den Fällen der Moderation
                        und speichert dafür nichts zusätzlich. Die öffentliche Clip-Seite eines Servers zeigt Clips,
                        Namen und Gewinner aller Runden auch ohne Anmeldung. Die Kopien bleiben, bis das Team die Runde
                        im Archiv löscht.
                    </li>
                    <li>
                        <strong>Moderation:</strong> jede Aktion als Fall mit dem betroffenen Mitglied (ID und Name),
                        dem Moderator, Grund und Dauer sowie den Notizen und Beweisen, die das Team anhängt. Im
                        Support-Warteraum merkt sich der Bot, wer seit wann wartet und wer übernommen hat, bis die
                        Person den Warteraum verlässt.
                    </li>
                    <li>
                        <strong>Auto Mod:</strong> prüft neue Nachrichten gegen die Filter, die das Team eingeschaltet
                        hat. Je nach Einstellung löscht der Bot die Nachricht, verwarnt, schaltet stumm, kickt oder
                        bannt. Geprüft wird im Arbeitsspeicher; für Spam und Wiederholungen merkt sich der Bot die
                        letzten Nachrichten eines Mitglieds höchstens eine Minute lang. Jeder Eingriff erscheint mit dem
                        entfernten Text als Meldung in einem Kanal, den das Team wählt, und jede Strafe wird ein Fall
                        wie bei der Moderation. Verwarnungen, Timeouts und Banns kann das Team zurücknehmen.
                    </li>
                    <li>
                        <strong>Logging System:</strong> meldet die Ereignisse, die das Team auswählt, in einen Kanal
                        auf dem Server, etwa gelöschte oder bearbeitete Nachrichten mit ihrem Inhalt, Beitritte oder
                        geänderte Rollen. Diese Meldungen stehen nur in Discord, nicht in unserer Datenbank.
                    </li>
                    <li>
                        <strong>Ticket System:</strong> Nummer, Thema, Ersteller, Bearbeiter, Status, Notizen des Teams
                        und wer das Ticket warum geschlossen hat, dazu eine feste Kurzkennung je Mitglied (etwa U-7K3F)
                        und für Tickets gesperrte Mitglieder mit Grund. Hat der Server Transcripts eingeschaltet, legt
                        der Bot beim Schließen den ganzen Verlauf ab: Nachrichten, Anhänge als Kopie und die Namen der
                        Beteiligten. Ein Transcript sehen nach der Anmeldung nur das Team und die Beteiligten. Es
                        bleibt, bis das Team es löscht.
                    </li>
                    <li>
                        <strong>Apply System und Looking for:</strong> deine Antworten mit Discord-ID und Namen, bei
                        Bewerbungen dazu die Entscheidung und wer sie getroffen hat.
                    </li>
                    <li>
                        <strong>Level System:</strong> je Server deine Discord-ID, deine Punkte und wann du zuletzt
                        Punkte bekommen hast. Keine Nachrichteninhalte. Schaltet ein Server seine Rangliste öffentlich,
                        zeigt das Dashboard Platz, Anzeigename, Profilbild, Level und Punkte der ersten 100 auch ohne
                        Anmeldung.
                    </li>
                    <li>
                        <strong>Giveaways und Umfragen:</strong> wer teilnimmt oder abstimmt, mit Discord-ID und
                        Auswahl. Bei Giveaways dazu Lose, Gewinner und ob sie den Gewinn angenommen haben. Bei anonymen
                        Umfragen sieht das Team nicht, wer was gewählt hat.
                    </li>
                    <li>
                        <strong>Temp Voice:</strong> wem ein eigener Sprachkanal gehört, solange es ihn gibt, und die
                        Vorlagen, die du dir speicherst: Name, Größe, Zutritt und wem du vertraust oder wen du
                        blockierst.
                    </li>
                    <li>
                        <strong>Twitch und YouTube Notifier:</strong> Name, ID und Profilbild der Kanäle, die ein Server
                        verfolgt.
                    </li>
                    <li>
                        <strong>Welcome System, Self Roles, Gallery System und Custom Message:</strong> nur
                        Einstellungen und die Bilder, die das Team hochlädt. Die Willkommenskarte zeichnet der Bot mit
                        Namen und Profilbild des neuen Mitglieds. Gespeichert wird sie nicht.
                    </li>
                </ul>
                <p>
                    Was oben ohne Frist steht, bleibt gespeichert, bis das Team des Servers es löscht oder du uns um
                    Löschung bittest. Entfernt ein Team den Bot von seinem Server, löschen wir die Daten dieses Servers
                    auf Anfrage vollständig. Was der Bot in die Kanäle eines Servers schreibt, liegt danach bei Discord
                    und wird vom Team dieses Servers verwaltet.
                </p>
                <p>
                    Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: Wir und das Team des Servers haben ein berechtigtes
                    Interesse daran, die eingeschalteten Funktionen bereitzustellen. Verknüpfst du selbst ein Konto
                    oder schickst du eine Bewerbung ab, gilt Art. 6 Abs. 1 lit. b DSGVO.
                </p>
            </>
        ),
    },
    {
        id: "dashboard",
        title: "Das Dashboard",
        body: (
            <>
                <p>Im Dashboard meldest du dich mit deinem Discord-Konto an. Dabei fragt es diese Berechtigungen an:</p>
                <Facts
                    entries={[
                        {
                            name: "identify",
                            text: "Discord-ID, Name und Profilbild. Damit weiß das Dashboard, wer du bist.",
                        },
                        {
                            name: "guilds",
                            text: "Deine Serverliste. Daraus entsteht die Auswahl der Server.",
                        },
                        {
                            name: "guilds.members.read",
                            text: "Nickname, Beitrittsdatum und Rollen auf einem Server, dessen Seite du öffnest.",
                        },
                        {
                            name: "email",
                            text: "Deine E-Mail-Adresse. Sie steht nur in deinen Einstellungen unter „Profil“ und wird nirgends verschickt.",
                        },
                        {
                            name: "connections",
                            text: "Deine Verknüpfungen zu anderen Diensten. Behalten werden nur bestätigte Twitch- und YouTube-Kanäle, damit der Notifier deinen Kanal deinem Discord-Konto zuordnen kann. Alles andere wird verworfen.",
                        },
                    ]}
                />
                <p>
                    Name, Profilbild, E-Mail-Adresse und Serverliste liegen nur in deiner Sitzung und sind mit dem
                    Abmelden weg. In die Datenbank schreibt die Anmeldung nur deine bestätigten Twitch- und
                    YouTube-Kanäle. Sie werden bei jeder Anmeldung abgeglichen: Entfernst du eine Verknüpfung bei
                    Discord, verschwindet sie damit auch hier. Deine Discord-ID steht außerdem in der Datenbank, wenn
                    du eine Gruppe im Dashboard hast, eine Benachrichtigung bekommst oder ein Modul sie braucht (siehe <a href="#bot">Der Discord-Bot</a>).
                </p>
                <p>
                    Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO: Ohne diese Angaben kann dir das Dashboard nicht
                    zeigen, welche Server du verwalten darfst.
                </p>
            </>
        ),
    },
    {
        id: "shop",
        title: "Zugang kaufen und testen",
        body: (
            <>
                <p>
                    Auf der <Link to="/preise">Preisseite</Link> meldest du dich mit Discord an. Discord gibt uns dabei
                    deine Discord-ID, deinen Namen, dein Profilbild und deine bestätigte Mail-Adresse, dazu die Liste
                    deiner Server und die Erlaubnis, dich auf den Server von RL Nexus zu holen (Scopes{" "}
                    <code>identify email guilds guilds.join</code>). Die Tokens dafür speichern wir verschlüsselt und
                    höchstens 7 Tage, bis du auf dem Server bist.
                </p>
                <p>Der Shop speichert:</p>
                <ul>
                    <li>
                        <strong>Kunde:</strong> Discord-ID, Name, Mail, die Kennung bei Stripe, wann du dich zuletzt
                        angemeldet hast und eine Sperre, falls es eine gibt.
                    </li>
                    <li>
                        <strong>Bestellungen:</strong> Bestellnummer, Produkt, Betrag, Stand der Zahlung und deine drei
                        Zustimmungen vor dem Kauf mit Zeitpunkt und dem Stand der AGB und Widerrufsbelehrung.
                    </li>
                    <li>
                        <strong>Zugänge:</strong> Test, Abo, Einmalkauf oder Geschenk, mit Beginn, Ende und Rolle.
                    </li>
                    <li>
                        <strong>Verlauf:</strong> was mit deinem Zugang passiert ist, etwa Anmeldung, Zahlung, Kündigung
                        oder eine Änderung durch das Team.
                    </li>
                </ul>
                <p>
                    Bezahlt wird über Stripe (Stripe Payments Europe, Ltd., Irland). Deine Zahlungsdaten gibst du direkt
                    in das Feld von Stripe ein, wir sehen sie nie. Schon beim Öffnen der Kasse legen wir bei Stripe einen
                    Kunden mit Name, Mail und Discord-ID an, auch wenn du danach nicht bezahlst. Stripe stellt die
                    Rechnungen aus und bewahrt sie und die Kundendaten nach den gesetzlichen Fristen auf.{" "}
                    <External href="https://stripe.com/de/privacy">Datenschutzerklärung von Stripe</External>
                </p>
                <p>
                    Bestätigungen, Rechnungen und Hinweise zu deinem Zugang schicken wir von noreply@nexus-emb.de über
                    unseren eigenen Mailserver.
                </p>
                <p>
                    <strong>Kündigen:</strong> Was du unter <Link to="/kuendigen">Verträge hier kündigen</Link>{" "}
                    eingibst (Art, Name, Discord-Name oder Bestellnummer, Mail, bei außerordentlicher Kündigung der
                    Grund), nutzen wir, um die Kündigung deinem Vertrag zuzuordnen und dir den Eingang zu bestätigen.
                    Lässt sie sich nicht automatisch zuordnen, geht sie per Mail an uns zur Bearbeitung von Hand. Als
                    Nachweis bewahren wir Kündigungen drei Jahre auf.
                </p>
                <p>
                    Rechtsgrundlage ist der Vertrag über deinen Zugang (Art. 6 Abs. 1 lit. b DSGVO), für das Aufbewahren
                    von Bestellungen und Zustimmungen unsere Pflicht, sie belegen zu können (Art. 6 Abs. 1 lit. c und f
                    DSGVO).
                </p>
                <p>
                    <strong>Wie lange:</strong> Hast du nie bestellt und läuft kein Zugang, löschen wir Name und Mail 90
                    Tage nach deiner letzten Anmeldung. Die Discord-ID mit dem Test bleibt, damit der Test nur einmal
                    geht. Bestellungen, die nie bezahlt wurden, löschen wir nach 30 Tagen. Bezahlte Bestellungen mit den
                    Zustimmungen bleiben drei Jahre nach dem Ende des Vertrags, so lange lassen sich Ansprüche daraus
                    geltend machen. Der Verlauf deines Zugangs bleibt drei Jahre.
                </p>
            </>
        ),
    },
    {
        id: "empfaenger",
        title: "Wohin Daten gehen",
        body: (
            <>
                <p>
                    Wir verkaufen keine Daten und geben sie nicht für Werbung weiter. Beim Betrieb entstehen aber
                    Verbindungen zu diesen Diensten:
                </p>
                <ul>
                    <li>
                        <strong>Discord:</strong> die Anmeldung im Dashboard, alles, was der Bot auf einem Server
                        tut, und der Hinweis auf eine Nachricht über das Kontaktformular. Profilbilder, Server-Icons und Emojis lädt dein Browser im Dashboard direkt von
                        Discords Servern; dabei sieht Discord deine IP-Adresse.{" "}
                        <External href="https://discord.com/privacy">Datenschutzerklärung von Discord</External>
                    </li>
                    <li>
                        <strong>Rocket League API:</strong> Ränge, Karriere-Werte und Club zu einem Epic-Konto.
                        Dafür geht der Name oder die Kennung des Kontos dorthin, auch bei einer Suche mit{" "}
                        <code>/rank search</code>.
                    </li>
                    <li>
                        <strong>Twitch:</strong> ob ein Kanal, den ein Server verfolgt, gerade live ist.{" "}
                        <External href="https://www.twitch.tv/p/legal/privacy-notice/">
                            Datenschutzerklärung von Twitch
                        </External>
                    </li>
                    <li>
                        <strong>YouTube:</strong> neue Videos der Kanäle, die ein Server verfolgt.{" "}
                        <External href="https://policies.google.com/privacy">Datenschutzerklärung von Google</External>
                    </li>
                    <li>
                        <strong>Stripe:</strong> Zahlungen und Rechnungen im Shop, siehe{" "}
                        <a href="#shop">Zugang kaufen und testen</a>.
                    </li>
                    <li>
                        <strong>Contabo:</strong> der Hoster, siehe <a href="#hosting">Hosting</a>.
                    </li>
                    <li>
                        <strong>Cloudflare:</strong> Aufrufe von Website, Dashboard und Statusseite laufen über das Netz der
                        Cloudflare, Inc. Cloudflare sieht dabei deine IP-Adresse und die aufgerufene Adresse, hält
                        Überlastungen und Angriffe ab und hält Dateien zwischengespeichert.{" "}
                        <External href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von Cloudflare</External>
                    </li>
                </ul>
                <p>
                    Discord, Twitch, Google und Cloudflare verarbeiten Daten auch in den USA. Welche Garantien sie dafür
                    nutzen, etwa das EU-US Data Privacy Framework oder Standardvertragsklauseln der EU-Kommission,
                    steht in ihren Datenschutzerklärungen.
                </p>
            </>
        ),
    },
    {
        id: "rechte",
        title: "Deine Rechte",
        body: (
            <>
                <p>
                    Du hast das Recht auf Auskunft über deine Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16),
                    Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20).
                </p>
                <p>
                    <strong>Widerspruch:</strong> Stützt sich eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO, kannst
                    du ihr aus Gründen widersprechen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).
                    Wir verarbeiten die Daten dann nicht weiter, es sei denn, es gibt zwingende schutzwürdige Gründe,
                    die deine Interessen überwiegen, oder wir brauchen sie, um Rechtsansprüche geltend zu machen,
                    auszuüben oder zu verteidigen.
                </p>
                <p>
                    Schreib dafür an {MAIL} oder melde dich im {SUPPORT}. Nenn uns dabei deine Discord-ID, damit wir
                    die richtigen Daten finden.
                </p>
                <p>
                    Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Für uns
                    zuständig ist das Unabhängige Landeszentrum für Datenschutz Schleswig-Holstein, Holstenstraße 98,
                    24103 Kiel.
                </p>
            </>
        ),
    },
    {
        id: "aenderungen",
        title: "Änderungen",
        body: (
            <p>
                Kommt ein Modul hinzu oder ändert sich, was der Bot speichert, passen wir diese Erklärung an. Es gilt
                die Fassung, die hier steht.
            </p>
        ),
    },
];
