import { HelpCatalog, IHelpGroupText, IHelpText, IsGroupText } from "../../constants/Help";

/**
 * Hilfetexte und echte Befehle zusammen (Plan 45). Rein: kein Client, kein
 * Discord. Was ein Befehl für Felder hat, steht nur in seiner Definition -
 * der Katalog erklärt sie bloß, damit Hilfe und Befehl nie auseinanderlaufen.
 */

export interface IHelpField {
    name: string;
    required: boolean;
    /** Die Anzeigenamen der festen Auswahl, leer ohne. */
    choices: string[];
    text: string;
}

export interface IHelpCommand {
    /** „timeout“ oder „fall beweis“. */
    key: string;
    /** „/timeout“, „/fall beweis“ oder „Rechtsklick › Apps › Hack melden“. */
    display: string;
    text: IHelpText;
    fields: IHelpField[];
    /** Ein Rechtsklick-Befehl statt eines Slash-Befehls: auf eine Person oder eine Nachricht. */
    menu: false | "user" | "message";
}

export interface IHelpEntry {
    name: string;
    group: IHelpGroupText | null;
    commands: IHelpCommand[];
    developerOnly: boolean;
}

export interface IHelpSource {
    name: string;
    developerOnly: boolean;
    data: { toJSON(): unknown };
}

interface IRawOption {
    type: number;
    name: string;
    required?: boolean;
    choices?: { name: string }[];
    options?: IRawOption[];
}

interface IRawCommand {
    name: string;
    type?: number;
    options?: IRawOption[];
}

const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;
/** ApplicationCommandType: ChatInput, User, Message. */
const CHAT_INPUT = 1;
const USER_MENU = 2;
const MESSAGE_MENU = 3;

function Raw(source: IHelpSource): IRawCommand {
    return source.data.toJSON() as IRawCommand;
}

function Fields(options: IRawOption[] | undefined, text: IHelpText): IHelpField[] {
    return (options ?? [])
        .filter((option) => option.type !== SUBCOMMAND && option.type !== SUBCOMMAND_GROUP)
        .map((option) => ({
            name: option.name,
            required: option.required === true,
            choices: (option.choices ?? []).map((choice) => choice.name),
            text: text.fields[option.name] ?? "",
        }));
}

export function BuildHelp(commands: ReadonlyArray<IHelpSource>, catalog: HelpCatalog): IHelpEntry[] {
    const entries: IHelpEntry[] = [];

    for (const source of commands) {
        const text = catalog[source.name];

        if (!text) continue;

        const raw = Raw(source);
        const type = raw.type ?? CHAT_INPUT;
        const menu = type === MESSAGE_MENU ? "message" : type === USER_MENU ? "user" : false;

        if (IsGroupText(text)) {
            const subs = new Map((raw.options ?? []).filter((option) => option.type === SUBCOMMAND).map((option) => [option.name, option]));
            const list: IHelpCommand[] = [];

            for (const [name, sub] of Object.entries(text.subs)) {
                const option = subs.get(name);

                if (!option) continue;

                list.push({ key: `${source.name} ${name}`, display: `/${source.name} ${name}`, text: sub, fields: Fields(option.options, sub), menu: false });
            }

            entries.push({ name: source.name, group: text, commands: list, developerOnly: source.developerOnly });
            continue;
        }

        entries.push({
            name: source.name,
            group: null,
            commands: [{ key: source.name, display: menu ? `Rechtsklick › Apps › ${source.name}` : `/${source.name}`, text, fields: Fields(raw.options, text), menu }],
            developerOnly: source.developerOnly,
        });
    }

    return entries;
}

function FieldProblems(label: string, options: IRawOption[] | undefined, text: IHelpText): string[] {
    const real = (options ?? []).filter((option) => option.type !== SUBCOMMAND && option.type !== SUBCOMMAND_GROUP).map((option) => option.name);
    const problems = Object.keys(text.fields)
        .filter((name) => !real.includes(name))
        .map((name) => `${label}: Feld „${name}“ gibt es nicht`);

    for (const name of real) if (!text.fields[name]?.trim()) problems.push(`${label}: Feld „${name}“ ohne Erklärung`);

    return problems;
}

/** Was am Katalog nicht zu den Befehlen passt, je Problem ein Satz. Leer: alles gut. */
export function CatalogProblems(commands: ReadonlyArray<IHelpSource>, catalog: HelpCatalog): string[] {
    const problems: string[] = [];
    const names = new Set(commands.map((command) => command.name));

    for (const source of commands) {
        const text = catalog[source.name];
        const raw = Raw(source);

        if (!text) {
            problems.push(`/${source.name} hat keinen Hilfetext`);
            continue;
        }

        if ((raw.options ?? []).some((option) => option.type === SUBCOMMAND_GROUP)) problems.push(`/${source.name}: Unterbefehl-Gruppen kann die Hilfe nicht`);

        const subs = (raw.options ?? []).filter((option) => option.type === SUBCOMMAND);

        if (subs.length === 0) {
            if (IsGroupText(text)) problems.push(`/${source.name}: Text mit Unterbefehlen, der Befehl hat keine`);
            else problems.push(...FieldProblems(`/${source.name}`, raw.options, text));

            continue;
        }

        if (!IsGroupText(text)) {
            problems.push(`/${source.name}: Befehl hat Unterbefehle, der Text nicht`);
            continue;
        }

        for (const sub of subs) {
            const subText = text.subs[sub.name];

            if (!subText) problems.push(`/${source.name} ${sub.name} hat keinen Hilfetext`);
            else problems.push(...FieldProblems(`/${source.name} ${sub.name}`, sub.options, subText));
        }

        for (const name of Object.keys(text.subs)) {
            if (!subs.some((sub) => sub.name === name)) problems.push(`Hilfetext zu /${source.name} ${name}, den Unterbefehl gibt es nicht`);
        }
    }

    for (const name of Object.keys(catalog)) if (!names.has(name)) problems.push(`Hilfetext zu /${name}, den Befehl gibt es nicht`);

    return problems;
}
