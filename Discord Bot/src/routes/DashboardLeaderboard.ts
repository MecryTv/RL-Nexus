import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { LEVELS_MODULE } from "../services/LevelService";
import { SendPage } from "../utils/dashboard";

/** Für Attribute in HTML: & < > " ' entschärft. */
function Escape(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Die öffentliche Rangliste eines Servers - ohne Anmeldung.
 *
 * Die Seite selbst steht immer; ob es etwas zu sehen gibt, entscheidet die
 * Route darunter (api/public/levels/:id). So muss diese Seite nichts über
 * Server und Einstellungen wissen. Nur für die Vorschau beim Teilen (Plan 34)
 * setzt sie Open-Graph-Tags mit dem Podium-Bild, und nur, wenn die Rangliste
 * öffentlich ist. Siehe docs/Levels.md.
 */
export default class DashboardLeaderboard extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/rangliste/:id`,
            description: "Öffentliche Rangliste eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        return SendPage(this.client, reply, "rangliste.html", { OG: await this.OpenGraph((request.params as { id?: string }).id) });
    }

    /** Die Tags für die Vorschau in Discord, WhatsApp & Co. Leer, solange die Rangliste nicht öffentlich ist. */
    private async OpenGraph(id: string | undefined): Promise<string> {
        if (!id || !SNOWFLAKE.test(id) || !this.client.databaseService.Ready) return "";

        const guild = this.client.guilds.cache.get(id);

        if (!guild || !(await this.client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE)) return "";
        if (!(await this.client.levelService.Settings(guild.id)).public) return "";

        const title = Escape(`Rangliste von ${guild.name}`);
        const image = Escape(`${this.client.server.BaseURL}${DASHBOARD_PATH}/rangliste/${guild.id}/bild.png`);

        return [
            `<meta property="og:title" content="${title}">`,
            `<meta property="og:description" content="Wer auf diesem Server am aktivsten ist: Punkte fürs Schreiben und für die Zeit im Sprachkanal.">`,
            `<meta property="og:image" content="${image}">`,
            `<meta property="og:type" content="website">`,
            `<meta name="twitter:card" content="summary_large_image">`,
        ].join("\n");
    }
}
