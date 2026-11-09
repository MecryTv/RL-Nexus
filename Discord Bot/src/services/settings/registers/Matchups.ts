import { MAX_AHEAD, MAX_PINGS, MAX_REMIND, MAX_RESULT_REMIND } from "../../../constants/Matchups";
import { IMatchupSettings } from "../../../interfaces/services/matchups/IMatchups";
import { MatchupError } from "../../MatchupService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IMatchupSettings;

export const MatchupsPanel: IPanelModule<S> = {
    id: "matchups",
    module: "matchups",
    name: "Matchups",
    emoji: "⚔️",
    color: "#f23f43",
    permanent: false,
    dashOnly: ["Partien", "Ligen", "Nachrichten"],
    sections: [
        {
            title: "Meldungen",
            fields: [
                F<S>("channel", "channel", "Kanal", "Hier meldet der Bot jede Partie und erinnert vor Anpfiff, ohne Kanal bleibt es still.", (s) => s.channelId, (value: string | null) => ({ channelId: value }), { channelTypes: TEXT }),
                F<S>("roles", "ping", "Ping-Rollen", "Diese Rollen pingt der Bot bei Ankündigung und Erinnerung.", (s) => s.pingRoles, (value: string[]) => ({ pingRoles: value }), { max: MAX_PINGS }),
                F<S>("number", "remind", "Erinnern vor Anpfiff", "So viele Minuten vor Anpfiff erinnert der Bot, 0 heißt nie.", (s) => s.remindMinutes, (value: number) => ({ remindMinutes: value }), { min: 0, max: MAX_REMIND, unit: "Min." }),
                F<S>("toggle", "color", "Farbe nach Stand", "Rot vor und im Spiel, grün bei Sieg, rot bei Niederlage, grau bei Unentschieden und Absage.", (s) => s.colorByStatus, (value: boolean) => ({ colorByStatus: value })),
            ],
        },
        {
            title: "Captains und Ergebnisse",
            fields: [
                F<S>("toggle", "open", "Link offen", "Aus: die Seite für Captains ist zu, in Discord eintragen geht weiter.", (s) => s.open, (value: boolean) => ({ open: value })),
                F<S>("number", "ahead", "Tage im Voraus", "So weit im Voraus dürfen Captains Partien eintragen.", (s) => s.maxAhead, (value: number) => ({ maxAhead: value }), { min: 1, max: MAX_AHEAD, unit: "Tage" }),
                F<S>("toggle", "results", "Ergebnisse eintragen", "Nach Anpfiff dürfen Captains das Ergebnis melden.", (s) => s.results, (value: boolean) => ({ results: value })),
                F<S>("toggle", "discord", "Ergebnis-Knopf", "Der Knopf „Ergebnis eintragen“ unter der Ankündigung, aus heißt nur über Link und Dashboard.", (s) => s.discordResults, (value: boolean) => ({ discordResults: value })),
                F<S>("number", "resultRemind", "Ans Ergebnis erinnern", "So viele Stunden nach Anpfiff erinnert der Bot einmal, wenn das Ergebnis fehlt, 0 heißt aus.", (s) => s.resultRemindHours, (value: number) => ({ resultRemindHours: value }), { min: 0, max: MAX_RESULT_REMIND, unit: "Std." }),
            ],
        },
    ],
    load(client, guild) {
        return client.matchupService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            await client.matchupService.SaveSettings(guild, patch);
        } catch (error) {
            if (error instanceof MatchupError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
