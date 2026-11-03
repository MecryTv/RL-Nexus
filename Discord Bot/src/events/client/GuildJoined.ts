import { Events, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import Event from "../../structures/Event";
import { ForgetGate, RefuseFor, TakePass } from "../../utils/invitepass";
import { AskServers, InviterOf } from "../../utils/servers";
import logger from "../../utils/logger";

/**
 * W-0011: Der Bot ist einem Server beigetreten. Offene Dashboards der Owner und
 * Admins dieses Servers erfahren es über den persönlichen Puls und laden ihre
 * Serverliste neu - wer den Bot gerade eingeladen hat, landet im Server-Dashboard.
 * W-0064: Das Admin Dashboard prüft „ein Server pro Person“ und lässt den Bot
 * notfalls wieder gehen. Ist es nicht erreichbar, holt sein Abgleich das nach.
 * W-0064, Punkt 4: Vorher prüft der Bot selbst, ob er über das Bot-Dashboard
 * kam (Freigabe-Pass) und ob es einen Ansprechpartner gibt. Sonst bekommt der
 * Owner die DM D1 bzw. D2 (vom Admin Dashboard gezeichnet), und der Bot geht.
 */
export default class GuildJoined extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildCreate,
            description: "Prüft Freigabe und Ansprechpartner, sagt offenen Dashboards Bescheid",
            once: false,
        });
    }

    async Execute(guild: Guild): Promise<void> {
        ForgetGate(guild.id);

        if (await this.Refused(guild)) return;

        for (const userId of this.client.dashboardService.Joined(guild.id)) this.client.pulseService.EmitUser(userId, "guilds", { joined: guild.id });

        const base = this.client.config.ADMIN_INTERNAL_URL;

        if (base) {
            const { error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, "bot", "joined", { guildId: guild.id });

            if (error) logger.warn(`🧭 Beitritt ${guild.name} nicht ans Admin Dashboard gemeldet: ${error}`);
        }
    }

    /** true: Der Bot hat den Server wieder verlassen. Ohne Datenbank lässt er ihn lieber stehen. */
    private async Refused(guild: Guild): Promise<boolean> {
        if (!this.client.databaseService.Ready) {
            logger.warn(`🎟️  ${guild.name} (${guild.id}): Freigabe nicht prüfbar, keine Datenbank. Der Bot bleibt.`);

            return false;
        }

        const passUser = await TakePass(this.client, guild.id).catch(() => null);
        let team = false;

        // Ohne Pass: Hat das Team direkt eingeladen (Audit-Log), ist das in Ordnung.
        if (!passUser) {
            const inviter = await InviterOf(guild);
            const group = inviter.source === "audit" ? await this.client.dashboardService.GroupOf(inviter.userId) : null;

            team = group === "administrator" || group === "developer";
        }

        const askees = passUser && !team ? await this.client.staffGrantService.Askees(guild).catch(() => null) : null;
        const reason = RefuseFor({ pass: Boolean(passUser), team, contacts: askees ? askees.users.length : null });

        if (!reason) return false;

        const base = this.client.config.ADMIN_INTERNAL_URL;

        // Erst die DM an den Owner (danach teilt er womöglich keinen Server mehr mit dem Bot), dann gehen.
        if (base) {
            const { error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, "bot", "refused", {
                guildId: guild.id,
                guildName: guild.name,
                ownerId: guild.ownerId,
                members: guild.memberCount,
                reason,
                inviteUrl: `${this.client.server.BaseURL}${DASHBOARD_PATH}/einladen?guild=${guild.id}`,
                accessUrl: `${this.client.config.SITE_PUBLIC_URL.replace(/\/+$/, "")}/preise`,
            });

            if (error) logger.warn(`🎟️  DM an den Owner von ${guild.name} nicht angestoßen: ${error}`);
        }

        await guild.leave().catch((error: unknown) => logger.warn(`🎟️  ${guild.name} nicht verlassen: ${String(error)}`));
        logger.info(`🎟️  ${guild.name} (${guild.id}) verlassen: ${reason === "pass" ? "ohne Freigabe eingeladen" : "kein Ansprechpartner mit Zugang"}`);

        return true;
    }
}
