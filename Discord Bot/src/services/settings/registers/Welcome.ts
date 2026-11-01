import { IWelcomeConfig, IWelcomeMessage } from "../../../interfaces/services/welcome/IWelcome";
import { IPanelField, IPanelModule } from "../SettingsModel";
import { F, TEXT } from "./Shared";

type S = IWelcomeConfig;

const KINDS: [string, string][] = [
    ["card", "Bild"],
    ["v2", "Karte"],
    ["embed", "Embed"],
    ["text", "Text"],
];

/** Begrüßung und Abschied haben dieselben vier Felder. */
function Message(which: "join" | "leave", name: string): IPanelField<S>[] {
    const of = (s: S): IWelcomeMessage => s[which];

    return [
        F<S>("toggle", `${which}`, name, `${name} an oder aus.`, (s) => of(s).on, (value: boolean) => ({ [which]: { on: value } })),
        F<S>("channel", `${which}Channel`, "Kanal", `Hierhin geht die ${name}.`, (s) => of(s).channelId, (value: string | null) => ({ [which]: { channelId: value } }), { channelTypes: TEXT }),
        F<S>("choice", `${which}Kind`, "Art", "Bild mit Karte, Discord-Karte, Embed oder nur Text.", (s) => of(s).kind, (value: string) => ({ [which]: { kind: value } }), { choices: KINDS }),
        F<S>("text", `${which}Text`, "Text", "Steht über dem Bild, bei der Art Text ist es die ganze Nachricht. {user} und {server} gehen.", (s) => of(s).content, (value: string) => ({ [which]: { content: value } }), { max: 2000 }),
    ];
}

export const WelcomePanel: IPanelModule<S> = {
    id: "welcome",
    module: "welcome",
    name: "Welcome",
    emoji: "👋",
    color: "#35e07f",
    permanent: false,
    dashOnly: ["Karten-Design", "Embed-Baukasten"],
    sections: [
        { title: "Begrüßung", fields: Message("join", "Begrüßung") },
        { title: "Abschied", fields: Message("leave", "Abschied") },
        {
            title: "Rollen",
            fields: [
                F<S>("roles", "roles", "Rollen für neue Mitglieder", "Bekommt jeder, der beitritt.", (s) => s.roles, (value: string[]) => ({ roles: value }), { max: 25 }),
                F<S>("roles", "botRoles", "Rollen für Bots", "Bekommt jeder Bot, den jemand einlädt.", (s) => s.botRoles, (value: string[]) => ({ botRoles: value }), { max: 25 }),
            ],
        },
    ],
    load(client, guild) {
        return client.welcomeService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        await client.welcomeService.Save(guild, patch);

        return null;
    },
};
