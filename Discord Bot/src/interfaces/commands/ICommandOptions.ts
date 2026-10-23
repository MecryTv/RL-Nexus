import Category from "../../enums/Category";

export default interface ICommandOptions {
    name: string;
    description: string;
    category: Category;
    cooldown: number;
    developerOnly: boolean;
    /** Das Modul auf der Webseite, etwa "rl-tracking" oder "moderation". Dev-Commands haben keins. */
    module?: string;
}