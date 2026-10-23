import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";

/** Discords Typen für Optionen: 1 ist ein Unterbefehl, 2 eine Gruppe von Unterbefehlen. */
const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

interface IOptionJson {
    readonly type: number;
    readonly name: string;
    readonly description: string;
    readonly options?: readonly IOptionJson[];
}

interface ICommandJson {
    readonly name: string;
    readonly description: string;
    readonly options?: readonly IOptionJson[];
}

export interface ICommandPath {
    readonly path: string;
    readonly description: string;
}

/**
 * Die Pfade, wie man sie in Discord tippt: „rank me“, „fall notiz neu“. Ein
 * Command ohne Unterbefehle ist nur sein Name. Andere Optionen (Text, Zahl,
 * User) sind keine Pfade.
 */
export function CommandPaths(json: ICommandJson): ICommandPath[] {
    const paths: ICommandPath[] = [];

    for (const option of json.options ?? []) {
        if (option.type === SUB_COMMAND) paths.push({ path: `${json.name} ${option.name}`, description: option.description });

        if (option.type === SUB_COMMAND_GROUP) {
            for (const sub of option.options ?? []) {
                if (sub.type === SUB_COMMAND) paths.push({ path: `${json.name} ${option.name} ${sub.name}`, description: sub.description });
            }
        }
    }

    return paths.length > 0 ? paths : [{ path: json.name, description: json.description }];
}

/**
 * Alle Commands mit ihrem Modul auf der Webseite, für das Admin Dashboard.
 * Daraus entsteht dort commands.json, die Webseite zeigt die Commands je Modul.
 */
export default class AdminCommands extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/commands",
            description: "Commands mit Modul und Pfaden für das Admin Dashboard",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const commands = [...this.client.commands.values()]
            .map((command) => ({
                name: command.name,
                description: command.description,
                module: command.module ?? null,
                paths: CommandPaths(command.data.toJSON() as ICommandJson),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return { commands };
    }
}
