import { ContextMenuCommandBuilder, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";

/** Slash-Befehle und, seit Plan 31, Kontextmenü-Befehle (Rechtsklick → Apps). */
type SlashCommandData =
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | ContextMenuCommandBuilder;

export default SlashCommandData;