import { CLEANUP_OPTIONS, GUARDS, LEVELS, MAX_TRUSTED } from "../../../constants/AntiVillain";
import { CleanupMinutes, IAntiVillainSettings } from "../../../interfaces/services/antivillain/IAntiVillain";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, LOG, TEXT } from "./Shared";

/** intent: Hat der Bot das Members-Intent? Ohne ist Raid-Schutz aus, wie im Dashboard. Fehlt die Angabe (Prüfung), zählt es als da. */
type S = IAntiVillainSettings & { intent?: boolean };

// Dieselben Namen wie im Dashboard (GuildAntiVillain.ts).
const CLEANUP: Record<CleanupMinutes, string> = { 0: "nichts", 10: "letzte 10 Minuten", 60: "letzte Stunde", 1440: "letzte 24 Stunden" };

export const AntiVillainPanel: IPanelModule<S> = {
    id: "anti-villain",
    module: "anti-villain",
    name: "Anti Villain",
    emoji: "🦹",
    color: "#f23f43",
    permanent: false,
    dashOnly: ["Köder einrichten", "Raid- und Nuke-Grenzen", "Vertraute Bots", "Fälle"],
    sections: [
        {
            title: "Schutz",
            fields: [
                F<S>("choice", "level", "Schutzstufe", `Ab wie vielen Punkten der Bot festhält: Locker nie, Normal ab ${LEVELS.normal.hold}, Streng ab ${LEVELS.streng.hold}.`, (s) => s.level, (value: string) => ({ level: value }), {
                    choices: [
                        ["locker", "Locker"],
                        ["normal", "Normal"],
                        ["streng", "Streng"],
                    ],
                }),
                F<S>("choice", "team", "Team-Accounts", "Wird ein Team-Account auffällig, meldet der Bot ihn nur oder hält ihn fest wie jeden anderen.", (s) => s.team, (value: string) => ({ team: value }), {
                    choices: [
                        ["report", "melden statt festhalten"],
                        ["same", "wie alle anderen"],
                    ],
                }),
                F<S>("roles", "trusted", "Vertraute Rollen", "Wer eine davon hat, wird nur gemeldet, nie festgehalten.", (s) => s.trustedRoles, (value: string[]) => ({ trustedRoles: value }), { max: MAX_TRUSTED }),
            ],
        },
        {
            title: "Wächter",
            // Der Köder fehlt hier wie im Dashboard: guards.bait liest der Bot nirgends, an und aus sind Köder-Kanal und -Rolle.
            fields: GUARDS.filter((guard) => guard.id !== "bait").map((guard) =>
                F<S>("toggle", guard.id, guard.name, guard.hint, (s) => s.guards[guard.id], (value: boolean, s) => ({ guards: { ...s.guards, [guard.id]: value } }))
            ),
        },
        {
            title: "Quarantäne",
            fields: [
                F<S>("role", "qRole", "Quarantäne-Rolle", "Bekommt, wer festgehalten wird, und sieht nur den Quarantäne-Kanal.", (s) => s.quarantine.roleId, (value: string | null, s) => ({ quarantine: { ...s.quarantine, roleId: value } })),
                F<S>("channel", "qChannel", "Quarantäne-Kanal", "Dort steht, was die Person jetzt tun soll.", (s) => s.quarantine.channelId, (value: string | null, s) => ({ quarantine: { ...s.quarantine, channelId: value } }), { channelTypes: TEXT }),
                F<S>("toggle", "strip", "Rollen abnehmen", "Nimmt beim Festhalten alle Rollen ab, damit keine doch einen Kanal öffnet. Der Bot merkt sie sich.", (s) => s.quarantine.stripRoles, (value: boolean, s) => ({ quarantine: { ...s.quarantine, stripRoles: value } })),
                F<S>("choice", "cleanup", "Aufräumen", "Löscht die Nachrichten der Person aus diesem Zeitraum in allen Kanälen.", (s) => String(s.quarantine.cleanup), (value: string, s) => ({ quarantine: { ...s.quarantine, cleanup: Number(value) } }), {
                    choices: CLEANUP_OPTIONS.map((minutes): [string, string] => [String(minutes), CLEANUP[minutes]]),
                }),
                F<S>("toggle", "dm", "Nachricht per DM", "Zusätzlich zum Quarantäne-Kanal: Passwort ändern, 2FA, fremde Apps löschen.", (s) => s.quarantine.dm, (value: boolean, s) => ({ quarantine: { ...s.quarantine, dm: value } })),
                F<S>("choice", "release", "Freigabe", "Wer wieder freigibt. Ein Hacker könnte sonst selbst auf „Ich bin's wieder“ klicken.", (s) => s.quarantine.release, (value: string, s) => ({ quarantine: { ...s.quarantine, release: value } }), {
                    choices: [
                        ["team", "nur durch das Team"],
                        ["team-24h", "Team, sonst nach 24 Std. von selbst"],
                    ],
                }),
            ],
        },
        {
            title: "Raid und Nuke",
            fields: [
                F<S>("toggle", "raid", "Raid-Schutz", "Erkennt Wellen von Beitritten und schaltet in den Raid-Modus. Braucht das Members-Intent.", (s) => s.raid.on && s.intent !== false, (value: boolean, s) => ({ raid: { ...s.raid, on: value } })),
                F<S>("toggle", "nuke", "Anti-Nuke", "Wer in 10 Minuten zu viele gefährliche Aktionen macht, verliert alle Rollen und wird festgehalten.", (s) => s.nuke.on, (value: boolean, s) => ({ nuke: { ...s.nuke, on: value } })),
            ],
        },
        {
            title: "Meldungen",
            fields: [
                F<S>("channel", "log", "Log-Kanal", "Jeder Verdacht und jedes Festhalten kommt hierhin als Karte mit Knöpfen, ein Textkanal oder ein Forum-Beitrag.", (s) => s.logChannelId, (value: string | null) => ({ logChannelId: value }), { channelTypes: LOG }),
                F<S>("role", "ping", "Ping-Rolle", "Wird bei jeder Karte gepingt. Leer: niemand.", (s) => s.pingRoleId, (value: string | null) => ({ pingRoleId: value })),
            ],
        },
    ],
    async load(client, guild) {
        return { ...(await client.antiVillainService.Settings(guild.id)), intent: client.config.GUILD_MEMBER_INTENT === true };
    },
    async save(client, guild, patch) {
        const { raid, quarantine } = patch as Partial<S>;

        // Clean ließe den Schalter ohne Intent still aus, das Dashboard sperrt ihn: hier ein Satz.
        if (raid?.on && client.config.GUILD_MEMBER_INTENT !== true) {
            throw new PanelError("Raid-Schutz geht nur mit dem Members-Intent (GUILD_MEMBER_INTENT), sonst sieht der Bot niemanden beitreten. Es muss im Discord Developer Portal und in der .env an sein.");
        }

        // Das Dashboard bietet nur Rollen ohne „verwaltet“ an. Eine solche kann der Bot niemandem geben, Festhalten liefe ins Leere.
        const role = quarantine?.roleId ? guild.roles.cache.get(quarantine.roleId) : undefined;

        if (role?.managed) throw new PanelError(`@${role.name} gehört zu einer App oder zu Discord, die kann der Bot niemandem geben. Nimm eine andere Quarantäne-Rolle.`);

        const { quarantine: saved, bait } = await client.antiVillainService.Save(guild, patch);

        // W-0063: Die Stufe steht im Bild der Warnung (festhalten oder nur melden).
        if ("level" in patch) await client.antiVillainService.UpdateBait(guild).catch(() => undefined);

        // Wie der Hinweis nach dem Speichern im Dashboard (needsSetup).
        return !saved.roleId || !saved.channelId || (bait.channel && !bait.channelId) || (bait.role && !bait.roleId) ? "Was noch fehlt (Quarantäne-Rolle, -Kanal oder Köder), legt „Einrichten“ im Dashboard an." : null;
    },
};
