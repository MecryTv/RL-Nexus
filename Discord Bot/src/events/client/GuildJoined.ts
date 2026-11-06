import { Events, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import Event from "../../structures/Event";
import { AccessMode, ForgetGate, IsContact, RefuseFor, RefuseReason, TakePass } from "../../utils/invitepass";
import { AskServers, InviterOf } from "../../utils/servers";
import { JoinStarted } from "../../utils/joinoutcome";
import logger from "../../utils/logger";

/**
 * W-0011: Der Bot ist einem Server beigetreten. Offene Dashboards der Owner und
 * Admins dieses Servers erfahren es über den persönlichen Puls und laden ihre
 * Serverliste neu - wer den Bot gerade eingeladen hat, landet im Server-Dashboard.
 * W-0064: Das Admin Dashboard prüft „ein Server pro Person“ und lässt den Bot
 * notfalls wieder gehen. Ist es nicht erreichbar, holt sein Abgleich das nach.
 * W-0064, Punkt 4: Vorher prüft der Bot bei Paid und Beta Access selbst, ob er
 * über das Bot-Dashboard kam (Freigabe-Pass) und ob es einen Ansprechpartner gibt. Sonst bekommt der
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

        // W-0069: Der Einladungs-Callback wartet auf dieses Ergebnis, bevor er weiterleitet.
        const report = JoinStarted(guild.id);
        const refused = await this.Refused(guild);

        if (refused) {
            report(refused);

            return;
        }

        for (const userId of this.client.dashboardService.Joined(guild.id)) this.client.pulseService.EmitUser(userId, "guilds", { joined: guild.id });

        report("ok");

        const base = this.client.config.ADMIN_INTERNAL_URL;

        if (base) {
            const { error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, "bot", "joined", { guildId: guild.id });

            if (error) logger.warn(`🧭 Beitritt ${guild.name} nicht ans Admin Dashboard gemeldet: ${error}`);
        }
    }

    /** Der Grund, aus dem der Bot den Server wieder verlassen hat, sonst null. Ohne Datenbank oder bei einem Fehler lässt er ihn lieber stehen (Review 2). */
    private async Refused(guild: Guild): Promise<RefuseReason | null> {
        if (!this.client.databaseService.Ready) {
            logger.warn(`🎟️  ${guild.name} (${guild.id}): Freigabe nicht prüfbar, keine Datenbank. Der Bot bleibt.`);

            return null;
        }

        let reason: RefuseReason | null;

        try {
            reason = await this.Reason(guild);
        } catch (error) {
            logger.warn(`🎟️  ${guild.name} (${guild.id}): Freigabe nicht prüfbar (${String(error)}). Der Bot bleibt.`);

            return null;
        }

        if (!reason) return null;

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

        return reason;
    }

    /** Warum der Bot geht, null: Er bleibt. Wirft bei Datenbank- oder Discord-Fehlern. */
    private async Reason(guild: Guild): Promise<RefuseReason | null> {
        // Gültig ist, was beim Beitritt gültig war, nicht erst beim Verarbeiten (Review 3).
        const passUser = await TakePass(this.client, guild.id, guild.joinedTimestamp);

        // Free Access: Jeder darf den Bot frei nutzen, auch direkt eingeladen. Der Pass merkt nur, wer eingeladen hat.
        if ((await AccessMode(this.client)) === "free") return RefuseFor({ free: true, pass: Boolean(passUser), team: false, contacts: null });
        // Ohne Pass: wer laut Audit-Log eingeladen hat, nur wenn der Eintrag zu diesem Beitritt passt.
        const inviter = passUser ?? (await InviterOf(guild, guild.joinedTimestamp - 60_000));
        const inviterId = typeof inviter === "string" ? inviter : inviter.source === "audit" ? inviter.userId : null;
        // Das Team ist selbst Ansprechpartner, ob mit Pass oder direkt eingeladen (Review 4).
        const team = inviterId ? await this.client.dashboardService.IsStaff(inviterId) : false;

        if (team || !passUser) return RefuseFor({ pass: Boolean(passUser), team, contacts: null });

        // Wer eingeladen hat, verwaltet den Server und hat Zugang (sonst kein Pass): erst ihn prüfen, ohne Members-Intent per REST (Review 1).
        if ((await IsContact(this.client, guild, passUser)) !== false) return null;

        const askees = await this.client.staffGrantService.Askees(guild).catch(() => null);

        return RefuseFor({ pass: true, team: false, contacts: askees ? askees.users.length : null });
    }
}
