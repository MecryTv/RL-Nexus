import { siteConfig } from "../services/SiteConfig";
import type { IMember } from "../domain/interfaces/IMember";

/**
 * Wer an RL Nexus arbeitet.
 *
 * Bewusst kurz gehalten und ehrlich. Hier steht, wer tatsächlich am Projekt
 * beteiligt ist, und niemand sonst. Eine Teamseite mit erfundenen Positionen
 * fällt beim ersten Support-Kontakt auf.
 *
 * Die Reihenfolge ist die der Entstehung: erst die Idee, dann die Umsetzung.
 * Kommt jemand dazu, ist das ein Eintrag mehr in dieser Liste. Karte, Farbe und
 * Anordnung ergeben sich daraus von selbst.
 */
export const TEAM_MEMBERS: readonly IMember[] = [
    {
        name: "SHXVE",
        handle: "@ishxvei",
        role: "Idee & Konzept",
        text:
            "Hat den Anstoß gegeben. Aus der Unzufriedenheit mit einem bestehenden System entstand die Frage, " +
            "wie eine Lösung aussehen müsste, die das besser macht. Legt fest, welche Module gebraucht werden " +
            "und wie sie sich im Alltag einer Organisation anfühlen sollen.",
        focus: ["Idee", "Konzept", "Module", "Feedback"],
        accent: "var(--c-blue)",
        links: [{ label: "Support-Server", href: siteConfig.supportURL, icon: "discord" }],
    },
    {
        name: "MecryTv",
        handle: "@mecrytv",
        role: "Entwicklung",
        text:
            "Setzt das Konzept um, vom Bot über die Rang-Karte bis zum Dashboard. Entscheidet, wie ein Modul " +
            "technisch aussieht, damit es auch dann noch funktioniert, wenn dreihundert Leute gleichzeitig " +
            "im Server sind.",
        focus: ["Bot & Module", "Rang-Karte", "Dashboard", "Support"],
        accent: "var(--c-red)",
        links: [{ label: "Support-Server", href: siteConfig.supportURL, icon: "discord" }],
    },
];

/**
 * Was das Projekt gerade sucht.
 *
 * Steht neben den Mitgliedern, weil es dieselbe Frage beantwortet: wer arbeitet
 * hier, und wer könnte es. Eine leere Liste heißt, dass nichts offen ist. Dann
 * fällt der Abschnitt weg.
 */
export const OPEN_ROLES: readonly { title: string; text: string; icon: string }[] = [
    {
        title: "Design & Grafik",
        text: "Karten, Grafiken und Vorlagen im Stil der Rang-Karte. Wer schon einmal für eine Org gestaltet hat, weiß, worum es geht.",
        icon: "image",
    },
    {
        title: "Testen & Feedback",
        text: "Module ausprobieren, bevor sie ausgeliefert werden. Auf einem echten Server, mit echten Mitgliedern und echten Fehlern.",
        icon: "shield-check",
    },
];
