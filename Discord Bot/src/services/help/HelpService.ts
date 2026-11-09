import { readFileSync } from "fs";
import path from "path";
import { Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { RenderHelpBanner } from "../../builder/HelpBanner";
import { ComposeHelp, HelpStartPage, IHelpContext, IHelpMessage } from "../../builder/HelpView";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import { HELP_CATALOG } from "../../constants/HelpCatalog";
import { MODULE_IDS } from "../../constants/Modules";
import { BuildHelp, IHelpEntry } from "./HelpModel";
import { Cut } from "../../utils/cut";
import logger from "../../utils/logger";

/**
 * /hilfe (W-0014, Plan 45): Einträge, Vorschläge beim Tippen, die Kacheln der
 * Startseite. Die Seiten selbst baut builder/HelpView.ts.
 */

const MAX_SUGGEST = 25;
const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

function Normalize(value: string): string {
    return value.trim().replace(/^\//, "").replace(/\s+/g, " ").toLowerCase();
}

function Version(): string {
    try {
        const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
        const [major, minor] = (pkg.version ?? "").split(".");

        return major ? `v${major}.${minor ?? 0}` : "–";
    } catch {
        return "–";
    }
}

export default class HelpService {
    private readonly client: BotClient;
    private entries: IHelpEntry[] | null = null;
    private readonly version = Version();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Alle Einträge, ohne Developer-Befehle für alle anderen. Einmal gebaut: Befehle ändern sich nur beim Start. */
    Entries(developer: boolean): IHelpEntry[] {
        this.entries ??= BuildHelp([...this.client.commands.values()], HELP_CATALOG);

        return developer ? this.entries : this.entries.filter((entry) => !entry.developerOnly);
    }

    IsDeveloper(userId: string): boolean {
        return this.client.config.DEV_USER_IDs.includes(userId);
    }

    /** Vorschläge für das Feld befehl: Treffer am Anfang zuerst, höchstens 25. */
    Suggest(query: string, developer: boolean): { name: string; value: string }[] {
        const wanted = Normalize(query);
        const options: { name: string; value: string; text: string }[] = [];

        for (const entry of this.Entries(developer)) {
            if (entry.group) options.push({ name: `/${entry.name}`, value: entry.name, text: entry.group.what });

            for (const command of entry.commands) options.push({ name: command.menu ? command.display : command.display, value: command.key, text: command.text.what });
        }

        const score = (value: string): number => (value === wanted ? 0 : value.startsWith(wanted) ? 1 : value.includes(wanted) ? 2 : 3);

        return options
            .filter((option) => score(option.value.toLowerCase()) < 3)
            .sort((a, b) => score(a.value.toLowerCase()) - score(b.value.toLowerCase()) || a.value.localeCompare(b.value, "de"))
            .slice(0, MAX_SUGGEST)
            .map((option) => {
                const sentence = option.text.split(/(?<=[.!?])\s/)[0];
                const name = `${option.name} · ${sentence}`;

                return { name: Cut(name, 100), value: option.value };
            });
    }

    /** Ein Eintrag zu „fall“, „fall beweis“, „/Timeout“ oder „Hack melden“. key null: die Gruppe oder der Befehl selbst. */
    Find(value: string, developer: boolean): { entry: IHelpEntry; key: string | null } | null {
        const wanted = Normalize(value);

        for (const entry of this.Entries(developer)) {
            if (entry.name.toLowerCase() === wanted) return { entry, key: null };

            const command = entry.commands.find((candidate) => candidate.key.toLowerCase() === wanted);

            if (command) return { entry, key: entry.group ? command.key : null };
        }

        return null;
    }

    /** Die Kachel „Zugang“, wie das Dashboard den Server sieht. */
    async Access(guild: Guild): Promise<{ value: string; sub: string }> {
        try {
            const dashboard = this.client.dashboardService;

            if (!(await dashboard.Paywall())) return { value: "Frei", sub: "für alle offen" };

            const access = await dashboard.ShopAccess(guild.ownerId);

            if (access.betaMember) return { value: "Beta", sub: "mit Code" };
            if (!access.allowed) return { value: "Ohne", sub: "kein Zugang zum Dashboard" };

            const ends = (await dashboard.ShopEnds(guild.ownerId)) ?? [];

            if (ends.some((end) => end.kind === "unlimited")) return { value: access.trial ? "Test" : "Paid", sub: "unbegrenzt" };

            const next = ends.map((end) => end.endsAt).filter((at): at is number => typeof at === "number").sort((a, b) => a - b)[0];

            return { value: access.trial ? "Test" : "Paid", sub: next ? `bis ${DATE.format(next)}` : "läuft" };
        } catch {
            return { value: "–", sub: "nicht prüfbar" };
        }
    }

    async Context(guild: Guild): Promise<IHelpContext> {
        const base = `${this.client.server.BaseURL}${DASHBOARD_PATH}`;
        const modules = await this.client.settings.Of(guild.id).then((settings) => settings.modules, () => [] as string[]);

        return { guildId: guild.id, dashboard: base, docs: `${base}/docu`, enabled: new Set(modules) };
    }

    /** Die Startseite samt Banner. Ohne Bild des Bots zeichnet das Banner ein N, ohne Banner steht oben ein Titel. */
    async Start(guild: Guild, name: string, developer: boolean): Promise<IHelpMessage> {
        const entries = this.Entries(developer);
        const context = await this.Context(guild);
        let banner: Buffer | null = null;

        try {
            const url = this.client.user?.displayAvatarURL({ extension: "png", size: 256 });
            const avatar = url ? await fetch(url, { signal: AbortSignal.timeout(3000) }).then((response) => (response.ok ? response.arrayBuffer() : null)).catch(() => null) : null;

            banner = await RenderHelpBanner({ name, avatar: avatar ? Buffer.from(avatar) : null });
        } catch (error) {
            logger.warn(`❔ Banner von /hilfe nicht gezeichnet: ${String(error)}`);
        }

        const start = {
            name,
            modules: { on: MODULE_IDS.filter((id) => context.enabled.has(id)).length, all: MODULE_IDS.length },
            commands: entries.reduce((sum, entry) => sum + entry.commands.length, 0),
            access: await this.Access(guild),
            version: this.version,
        };

        return ComposeHelp(HelpStartPage(start, entries, context), banner);
    }
}
