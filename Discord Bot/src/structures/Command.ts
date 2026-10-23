import { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import Category from "../enums/Category";
import BotClient from "../client/BotClient";
import SlashCommandData from "../types/ISlashCommandData";
import ICommandOptions from "../interfaces/commands/ICommandOptions";
import ICommand from "../interfaces/commands/ICommand";

export default abstract class Command implements ICommand {
    client: BotClient;
    name: string;
    description: string;
    category: Category;
    cooldown: number;
    developerOnly: boolean;
    /** Das Modul auf der Webseite. null bei Dev-Commands. */
    module: string | null;
    data!: SlashCommandData;

    constructor(client: BotClient, options: ICommandOptions) {
        this.client = client;
        this.name = options.name;
        this.description = options.description;
        this.category = options.category;
        this.cooldown = options.cooldown;
        this.developerOnly = options.developerOnly;
        this.module = options.module ?? null;
    }

    abstract Execute(interaction: ChatInputCommandInteraction): Promise<void>;

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {}
}